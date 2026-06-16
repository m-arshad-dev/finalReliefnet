import { pool } from '../../config/database.js';
import { createError } from '../../middleware/errorHandler.js';
import { notificationService } from '../notifications/notification.service.js';
export class DeliveriesService {
    /**
     * Submit delivery proof. Supports partial fulfillment.
     */
    async submitDelivery(input, volunteerId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const taskResult = await client.query(`SELECT id, claimed_by, status, items_needed FROM tasks WHERE id = $1 FOR UPDATE`, [input.task_id]);
            if (taskResult.rows.length === 0) {
                throw createError('Task not found', 404);
            }
            const task = taskResult.rows[0];
            if (task.claimed_by !== volunteerId) {
                throw createError('You are not assigned to this task', 403);
            }
            if (task.status !== 'IN_PROGRESS' && task.status !== 'SUBMITTED') {
                throw createError(`Cannot submit delivery: task must be IN_PROGRESS or SUBMITTED (current: ${task.status})`, 400);
            }
            // Create delivery record
            const deliveryResult = await client.query(`INSERT INTO deliveries (task_id, volunteer_id, storage_keys, gps_location, notes, quantity_delivered, status)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7, 'PENDING')
         RETURNING *`, [
                input.task_id,
                volunteerId,
                input.storage_keys,
                input.longitude,
                input.latitude,
                input.notes || null,
                input.quantity_delivered,
            ]);
            await client.query(`UPDATE tasks SET status = 'SUBMITTED' WHERE id = $1`, [input.task_id]);
            // Record event
            await client.query(`INSERT INTO task_events (task_id, user_id, event_type, metadata)
         VALUES ($1, $2, 'SUBMITTED', $3)`, [input.task_id, volunteerId, JSON.stringify({ delivery_id: deliveryResult.rows[0].id })]);
            const taskDetail = await client.query('SELECT beneficiary_id, title, coordinator_id FROM tasks WHERE id = $1', [input.task_id]);
            if (taskDetail.rows[0]?.beneficiary_id) {
                notificationService.notifyDeliverySubmitted(taskDetail.rows[0].beneficiary_id, input.task_id, taskDetail.rows[0].title);
            }
            if (taskDetail.rows[0]?.coordinator_id) {
                notificationService.notifyCoordinatorTaskUpdate(taskDetail.rows[0].coordinator_id, input.task_id, taskDetail.rows[0].title, 'SUBMITTED');
            }
            await client.query('COMMIT');
            return deliveryResult.rows[0];
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Verify a delivery (coordinator/admin).
     */
    async verifyDelivery(deliveryId, verifiedBy, input) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const deliveryResult = await client.query(`SELECT d.id, d.task_id, d.volunteer_id, d.storage_keys, d.notes, d.submitted_at,
                t.claimed_by, t.budget_pkr, t.campaign_id, t.status AS task_status,
                ST_Distance(d.gps_location, t.location) AS gps_distance_meters
         FROM deliveries d
         JOIN tasks t ON t.id = d.task_id
         WHERE d.id = $1 FOR UPDATE`, [deliveryId]);
            if (deliveryResult.rows.length === 0) {
                throw createError('Delivery not found', 404);
            }
            const delivery = deliveryResult.rows[0];
            const verifierResult = await client.query('SELECT r.name FROM roles r JOIN users u ON u.role_id = r.id WHERE u.id = $1', [verifiedBy]);
            const verifierRole = verifierResult.rows[0]?.name;
            if (verifierRole === 'COORDINATOR') {
                const jurisdictionCheck = await client.query(`SELECT 1 FROM tasks WHERE id = $1 AND (coordinator_id = $2 OR coordinator_id IS NULL)`, [delivery.task_id, verifiedBy]);
                if (jurisdictionCheck.rows.length === 0) {
                    throw createError('Jurisdiction error: You cannot verify this delivery', 403);
                }
            }
            const outcome = input.outcome || (input.verified ? 'VERIFY' : 'FLAG');
            if (outcome === 'VERIFY') {
                await client.query(`UPDATE deliveries
           SET verified_by = $1, verified_at = NOW(), notes = COALESCE($2, notes)
           WHERE id = $3`, [verifiedBy, input.notes, deliveryId]);
                // Trigger handles updated_at on tasks
                await client.query(`UPDATE tasks SET status = 'COORDINATOR_VERIFIED' WHERE id = $1`, [delivery.task_id]);
                await client.query(`INSERT INTO task_events (task_id, user_id, event_type)
           VALUES ($1, $2, 'VERIFIED')`, [delivery.task_id, verifiedBy]);
                await client.query(`UPDATE volunteer_profiles
           SET completed_tasks = completed_tasks + 1,
               total_earned = total_earned + $1,
               status = 'ACTIVE'
           WHERE user_id = $2`, [delivery.budget_pkr, delivery.claimed_by]);
                await client.query(`INSERT INTO ledger_entries (type, amount_pkr, to_user_id, ref_table, ref_id)
           VALUES ('TASK_PAYMENT', $1, $2, 'deliveries', $3)`, [delivery.budget_pkr, delivery.claimed_by, deliveryId]);
                // spent_pkr is now maintained by the sync_campaign_spent_pkr trigger
                // when the task transitions to PAID — do not write it here
            }
            else if (outcome === 'FLAG') {
                await client.query(`UPDATE tasks SET status = 'FLAGGED' WHERE id = $1`, [delivery.task_id]);
                await client.query(`INSERT INTO task_events (task_id, user_id, event_type, metadata)
           VALUES ($1, $2, 'FLAGGED', $3)`, [delivery.task_id, verifiedBy, JSON.stringify({ reason: input.notes })]);
            }
            else if (outcome === 'REJECT') {
                await client.query(`UPDATE tasks SET status = 'IN_PROGRESS' WHERE id = $1`, [delivery.task_id]);
                await client.query(`INSERT INTO task_events (task_id, user_id, event_type, metadata)
           VALUES ($1, $2, 'UPDATED', $3)`, [delivery.task_id, verifiedBy, JSON.stringify({ action: 'DELIVERY_REJECTED', reason: input.notes })]);
            }
            const auditAction = `${outcome}_DELIVERY`;
            await client.query(`INSERT INTO audit_logs (admin_id, action_type, target_entity, target_id, metadata, ip_address)
         VALUES ($1, $2, 'deliveries', $3, $4, $5)`, [
                verifiedBy,
                auditAction,
                deliveryId,
                JSON.stringify({
                    task_id: delivery.task_id,
                    outcome,
                    reason: input.notes,
                    gps_distance_meters: Math.round(delivery.gps_distance_meters),
                    timestamp: new Date().toISOString(),
                }),
                input.ip || null,
            ]);
            await client.query('COMMIT');
            return { ...delivery, outcome };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Submit beneficiary feedback for a delivery.
     */
    async submitBeneficiaryFeedback(deliveryId, beneficiaryId, input) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(`SELECT d.id, t.beneficiary_id, t.status AS task_status
         FROM deliveries d
         JOIN tasks t ON t.id = d.task_id
         WHERE d.id = $1`, [deliveryId]);
            if (result.rows.length === 0) {
                throw createError('Delivery not found', 404);
            }
            const delivery = result.rows[0];
            // Ownership validated here and again by DB trigger
            if (delivery.beneficiary_id !== beneficiaryId) {
                throw createError('You are not authorized to confirm this delivery', 403);
            }
            if (!['SUBMITTED', 'COORDINATOR_VERIFIED', 'PAID'].includes(delivery.task_status)) {
                throw createError(`Cannot confirm delivery when task is in ${delivery.task_status} state`, 400);
            }
            const existing = await client.query('SELECT id FROM beneficiary_feedback WHERE delivery_id = $1', [deliveryId]);
            if (existing.rows.length > 0) {
                throw createError('Feedback already submitted for this delivery', 409);
            }
            const feedbackResult = await client.query(`INSERT INTO beneficiary_feedback
           (delivery_id, beneficiary_id, confirmation_status, rating, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, delivery_id, beneficiary_id, confirmation_status, rating, comment, created_at`, [deliveryId, beneficiaryId, input.confirmation_status, input.rating || null, input.comment || null]);
            if (input.confirmation_status === 'NOT_RECEIVED') {
                await client.query(`INSERT INTO audit_logs (admin_id, action_type, target_entity, target_id, metadata)
           VALUES ($1, 'BENEFICIARY_FLAG', 'deliveries', $2, $3)`, [beneficiaryId, deliveryId, JSON.stringify({ reason: input.comment, type: 'NOT_RECEIVED' })]);
            }
            await client.query('COMMIT');
            return feedbackResult.rows[0];
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Get deliveries for a task.
     */
    async getByTask(taskId) {
        const result = await pool.query(`SELECT d.id, d.task_id, d.volunteer_id, d.storage_keys, d.notes,
              d.verified_by, d.verified_at, d.submitted_at,
              ST_Y(d.gps_location::geometry) AS latitude,
              ST_X(d.gps_location::geometry) AS longitude,
              u.name AS volunteer_name, v.name AS verifier_name,
              bf.confirmation_status, bf.rating AS beneficiary_rating,
              bf.comment AS beneficiary_comment, bf.created_at AS feedback_at
       FROM deliveries d
       LEFT JOIN users u  ON u.id = d.volunteer_id
       LEFT JOIN users v  ON v.id = d.verified_by
       LEFT JOIN beneficiary_feedback bf ON bf.delivery_id = d.id
       WHERE d.task_id = $1
       ORDER BY d.submitted_at DESC`, [taskId]);
        return result.rows;
    }
}
export const deliveriesService = new DeliveriesService();
//# sourceMappingURL=deliveries.service.js.map