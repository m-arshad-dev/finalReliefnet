import { pool } from '../../config/database.js';
import { createError } from '../../middleware/errorHandler.js';
import { chatService } from '../chat/chat.service.js';
import { notificationService } from '../notifications/notification.service.js';
import { logger } from '../../common/logger.js';
export class TasksService {
    /**
     * Create a new task.
     */
    async createTask(input, createdBy) {
        logger.info('Creating new task', { createdBy, title: input.title });
        const result = await pool.query(`INSERT INTO tasks (
        campaign_id, beneficiary_id, created_by, source_type,
        title, description, category, family_size, items_needed,
        location, location_text, radius_km, budget_pkr, urgency
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb,
        ST_SetSRID(ST_MakePoint($10, $11), 4326)::geography,
        $12, $13, $14, $15
      ) RETURNING *`, [
            input.campaign_id || null,
            input.beneficiary_id || null,
            createdBy,
            input.source_type,
            input.title,
            input.description || null,
            input.category || null,
            input.family_size,
            JSON.stringify(input.items_needed),
            input.longitude,
            input.latitude,
            input.location_text || null,
            input.radius_km,
            input.budget_pkr,
            input.urgency,
        ]);
        const task = result.rows[0];
        logger.info('Task created successfully', { taskId: task.id, createdBy });
        // Parallelize event recording — do not block the main response
        pool.query(`INSERT INTO task_events (task_id, user_id, event_type, metadata)
       VALUES ($1, $2, 'CREATED', $3)`, [task.id, createdBy, JSON.stringify({ source_type: input.source_type })]).catch(err => console.error('[EVENT] Failed to record task creation:', err));
        return task;
    }
    /**
     * Get ALL open tasks. Optional filter by source type.
     */
    async getAvailableTasks(sourceType) {
        const values = [];
        let whereClause = "WHERE t.status = 'OPEN'";
        if (sourceType) {
            whereClause += " AND t.source_type = $1";
            values.push(sourceType);
        }
        const result = await pool.query(`SELECT t.*,
              ST_X(t.location::geometry) AS longitude,
              ST_Y(t.location::geometry) AS latitude,
              u.name AS created_by_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.created_by
       ${whereClause}
       ORDER BY
         CASE t.urgency
           WHEN 'CRITICAL' THEN 1
           WHEN 'HIGH' THEN 2
           WHEN 'MEDIUM' THEN 3
           WHEN 'LOW' THEN 4
         END,
         t.created_at DESC`, values);
        return result.rows;
    }
    /**
     * Get task by ID with full details.
     */
    async getTaskById(id) {
        const result = await pool.query(`SELECT t.*,
              ST_X(t.location::geometry) AS longitude,
              ST_Y(t.location::geometry) AS latitude,
              creator.name AS created_by_name,
              claimer.name AS claimed_by_name,
              coord.name AS coordinator_name
       FROM tasks t
       LEFT JOIN users creator ON creator.id = t.created_by
       LEFT JOIN users claimer ON claimer.id = t.claimed_by
       LEFT JOIN users coord   ON coord.id = t.coordinator_id
       WHERE t.id = $1`, [id]);
        if (result.rows.length === 0) {
            throw createError('Task not found', 404);
        }
        return result.rows[0];
    }
    /**
     * Get all tasks for a beneficiary — both self-created requests and NGO-assigned tasks.
     */
    async getMyTasks(userId) {
        const result = await pool.query(`SELECT t.*,
              ST_X(t.location::geometry) AS longitude,
              ST_Y(t.location::geometry) AS latitude,
              creator.name  AS created_by_name,
              claimer.name  AS claimed_by_name,
              coord.name    AS coordinator_name,
              c.title       AS campaign_title
       FROM tasks t
       LEFT JOIN users creator ON creator.id = t.created_by
       LEFT JOIN users claimer ON claimer.id = t.claimed_by
       LEFT JOIN users coord   ON coord.id   = t.coordinator_id
       LEFT JOIN campaigns c   ON c.id       = t.campaign_id
       WHERE (t.beneficiary_id = $1 OR t.created_by = $1)
         AND t.deleted_at IS NULL
       ORDER BY t.created_at DESC`, [userId]);
        return result.rows;
    }
    /**
     * Get all tasks assigned to a specific coordinator.
     */
    async getCoordinatorTasks(userId) {
        const result = await pool.query(`SELECT t.*,
              ST_X(t.location::geometry) AS longitude,
              ST_Y(t.location::geometry) AS latitude,
              creator.name AS created_by_name,
              claimer.name AS claimed_by_name,
              beneficiary.name AS beneficiary_name,
              c.title AS campaign_title,
              np.org_name AS ngo_name
       FROM tasks t
       LEFT JOIN users creator ON creator.id = t.created_by
       LEFT JOIN users claimer ON claimer.id = t.claimed_by
       LEFT JOIN users beneficiary ON beneficiary.id = t.beneficiary_id
       LEFT JOIN campaigns c ON c.id = t.campaign_id
       LEFT JOIN ngo_profiles np ON np.id = c.ngo_id
       WHERE t.coordinator_id = $1
          OR (t.status = 'SUBMITTED' AND t.coordinator_id IS NULL)
       ORDER BY
         CASE t.urgency
           WHEN 'CRITICAL' THEN 1
           WHEN 'HIGH' THEN 2
           WHEN 'MEDIUM' THEN 3
           WHEN 'LOW' THEN 4
         END,
         t.created_at DESC`, [userId]);
        return result.rows;
    }
    /**
     * Update a task. NGO and BENEFICIARY roles are restricted to tasks they created.
     * Non-admin/non-coordinator can only update if status is 'OPEN'.
     */
    async updateTask(id, input, userId, role) {
        logger.info('Updating task', { taskId: id, userId, updateFields: Object.keys(input) });
        // 1. Fetch current task to check status and ownership
        const currentTaskResult = await pool.query('SELECT status, created_by FROM tasks WHERE id = $1', [id]);
        if (currentTaskResult.rows.length === 0) {
            throw createError('Task not found', 404);
        }
        const currentTask = currentTaskResult.rows[0];
        // 2. Role-based restrictions
        if (role !== 'ADMIN') {
            if (role === 'COORDINATOR') {
                // Jurisdiction check for COORDINATOR
                const jurisdictionCheck = await pool.query('SELECT 1 FROM tasks WHERE id = $1 AND coordinator_id = $2', [id, userId]);
                if (jurisdictionCheck.rows.length === 0) {
                    throw createError('Jurisdiction error: You are not the assigned coordinator for this task', 403);
                }
            }
            else {
                // Ownership check for NGO and BENEFICIARY
                if (currentTask.created_by !== userId) {
                    throw createError('You do not have permission to update this task', 403);
                }
                // Status check: non-admins/non-coordinators can only edit if OPEN
                if (currentTask.status !== 'OPEN') {
                    throw createError(`Task cannot be modified in its current state (${currentTask.status})`, 400);
                }
            }
        }
        // Validate coordinator_id assignment — only valid COORDINATOR users
        if (input.coordinator_id !== undefined) {
            const coordCheck = await pool.query(`SELECT 1 FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1 AND r.name = 'COORDINATOR'`, [input.coordinator_id]);
            if (coordCheck.rows.length === 0) {
                throw createError('Invalid coordinator: user not found or not a coordinator', 400);
            }
        }
        const setClauses = [];
        const values = [];
        let paramIndex = 1;
        const fields = { ...input };
        // Handle location separately if lat/lng provided
        if (input.latitude !== undefined && input.longitude !== undefined) {
            setClauses.push(`location = ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography`);
            values.push(input.longitude, input.latitude);
            paramIndex += 2;
        }
        // Always remove from fields to avoid "column does not exist" errors
        delete fields.latitude;
        delete fields.longitude;
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) {
                if (key === 'items_needed') {
                    setClauses.push(`${key} = $${paramIndex}::jsonb`);
                    values.push(JSON.stringify(value));
                }
                else {
                    setClauses.push(`${key} = $${paramIndex}`);
                    values.push(value);
                }
                paramIndex++;
            }
        }
        if (setClauses.length === 0) {
            throw createError('No fields to update', 400);
        }
        values.push(id);
        const result = await pool.query(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`, values);
        const task = result.rows[0];
        logger.info('Task updated successfully', { taskId: id, userId, newStatus: input.status });
        // Notify beneficiary if status changed
        if (input.status !== undefined && task.beneficiary_id) {
            notificationService.notifyTaskUpdate(task.beneficiary_id, id, task.title, input.status);
        }
        // Notify coordinator if status changed
        if (input.status !== undefined && task.coordinator_id) {
            notificationService.notifyCoordinatorTaskUpdate(task.coordinator_id, id, task.title, input.status);
        }
        // Record event
        const eventType = input.status === 'CANCELLED' ? 'CANCELLED' : 'UPDATED';
        await pool.query(`INSERT INTO task_events (task_id, user_id, event_type)
       VALUES ($1, $2, $3)`, [id, userId, eventType]);
        return result.rows[0];
    }
    /**
     * ASSIGN A TASK (DISPATCH)
     * Admin/Coordinator forces assignment of an OPEN task to a specific volunteer.
     */
    async assignTask(taskId, volunteerId, adminId) {
        logger.info('Assigning task', { taskId, volunteerId, adminId });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // 1. Lock and validate task
            const taskResult = await client.query(`SELECT id, status, title FROM tasks WHERE id = $1 FOR UPDATE`, [taskId]);
            if (taskResult.rows.length === 0)
                throw createError('Task not found', 404);
            const task = taskResult.rows[0];
            if (task.status !== 'OPEN')
                throw createError('Task is not OPEN', 400);
            // 2. Validate volunteer
            const volCheck = await client.query('SELECT status FROM volunteer_profiles WHERE user_id = $1', [volunteerId]);
            if (volCheck.rows.length === 0 || volCheck.rows[0].status !== 'ACTIVE') {
                throw createError('Volunteer not found or not active', 400);
            }
            // 3. Assign
            await client.query(`UPDATE tasks SET status = 'ASSIGNED', claimed_by = $1, claimed_at = NOW() WHERE id = $2`, [volunteerId, taskId]);
            // 4. Record event & Notify
            await client.query(`INSERT INTO task_events (task_id, user_id, event_type, metadata)
         VALUES ($1, $2, 'ASSIGNED', $3)`, [taskId, adminId, JSON.stringify({ assigned_to: volunteerId })]);
            await notificationService.notifyTaskAssigned(volunteerId, taskId, task.title);
            await client.query('COMMIT');
            logger.info('Task assigned successfully', { taskId, volunteerId });
            return { success: true };
        }
        catch (err) {
            logger.error('Failed to assign task', { taskId, volunteerId, error: err });
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * CLAIM A TASK — RACE-CONDITION SAFE
     *
     * Uses BEGIN + SELECT ... FOR UPDATE + COMMIT.
     * Only one volunteer can claim an OPEN task.
     * This is the critical section for concurrency safety.
     */
    async claimTask(taskId, volunteerId) {
        logger.info('Claiming task', { taskId, volunteerId });
        if (!taskId)
            throw createError('Invalid task_id', 400);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Lock the row — any concurrent claim will BLOCK here
            const lockResult = await client.query(`SELECT id, status, claimed_by
         FROM tasks
         WHERE id = $1
         FOR UPDATE`, [taskId]);
            if (lockResult.rows.length === 0) {
                await client.query('ROLLBACK');
                throw createError('Task not found', 404);
            }
            const task = lockResult.rows[0];
            if (task.status !== 'OPEN') {
                await client.query('ROLLBACK');
                throw createError(`Task cannot be claimed — current status: ${task.status}`, 409);
            }
            if (task.claimed_by !== null) {
                await client.query('ROLLBACK');
                throw createError('Task already claimed by another volunteer', 409);
            }
            // Claim the task
            const updateResult = await client.query(`UPDATE tasks
         SET status = 'CLAIMED',
             claimed_by = $1,
             claimed_at = NOW()
         WHERE id = $2
         RETURNING *`, [volunteerId, taskId]);
            // Record event
            await client.query(`INSERT INTO task_events (task_id, user_id, event_type, metadata)
         VALUES ($1, $2, 'CLAIMED', $3)`, [taskId, volunteerId, JSON.stringify({ claimed_at: new Date().toISOString() })]);
            // Update volunteer stats
            await client.query(`UPDATE volunteer_profiles SET status = 'BUSY' WHERE user_id = $1`, [volunteerId]);
            await client.query('COMMIT');
            const updatedTask = updateResult.rows[0];
            logger.info('Task claimed successfully', { taskId, volunteerId });
            // Notify beneficiary
            if (updatedTask.beneficiary_id) {
                try {
                    const volunteer = await pool.query('SELECT name FROM users WHERE id = $1', [volunteerId]);
                    notificationService.notifyTaskClaimed(updatedTask.beneficiary_id, taskId, updatedTask.title, volunteer.rows[0]?.name || 'A volunteer');
                }
                catch (notifyErr) {
                    console.error('[NOTIFICATION] Failed to notify claim:', notifyErr);
                }
            }
            // Auto-create chat room after successful claim
            try {
                await chatService.createRoom(taskId, volunteerId);
            }
            catch (err) {
                console.error(`[CHAT] Failed to auto-create room for task ${taskId}:`, err);
                // Don't fail the whole claim if chat room creation fails
            }
            return updateResult.rows[0];
        }
        catch (err) {
            logger.error('Failed to claim task', { taskId, volunteerId, error: err });
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Start a claimed task — transitions CLAIMED → IN_PROGRESS.
     */
    async startTask(taskId, volunteerId) {
        if (!taskId)
            throw createError('Invalid task_id', 400);
        const result = await pool.query(`UPDATE tasks
       SET status = 'IN_PROGRESS'
       WHERE id = $1 AND claimed_by = $2 AND status = 'CLAIMED'
       RETURNING *`, [taskId, volunteerId]);
        if (result.rows.length === 0) {
            throw createError('Task not found, not yours, or not in CLAIMED status', 400);
        }
        await pool.query(`INSERT INTO task_events (task_id, user_id, event_type) VALUES ($1, $2, 'STARTED')`, [taskId, volunteerId]);
        // Ensure chat room exists
        try {
            await chatService.createRoom(taskId, volunteerId);
        }
        catch (err) {
            console.error(`[CHAT] Failed to ensure room for task ${taskId}:`, err);
        }
        return result.rows[0];
    }
    /**
     * Unclaim a task — transitions CLAIMED → OPEN and releases the volunteer.
     * Only works when status = CLAIMED (not after starting).
     */
    async unclaimTask(taskId, volunteerId) {
        if (!taskId)
            throw createError('Invalid task_id', 400);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const lockResult = await client.query(`SELECT id, status, claimed_by FROM tasks WHERE id = $1 FOR UPDATE`, [taskId]);
            if (lockResult.rows.length === 0) {
                await client.query('ROLLBACK');
                throw createError('Task not found', 404);
            }
            const task = lockResult.rows[0];
            if (task.claimed_by !== volunteerId) {
                await client.query('ROLLBACK');
                throw createError('This task was not claimed by you', 403);
            }
            if (task.status !== 'CLAIMED') {
                await client.query('ROLLBACK');
                throw createError('Task can only be unclaimed when in CLAIMED status', 400);
            }
            const updateResult = await client.query(`UPDATE tasks
         SET status = 'OPEN', claimed_by = NULL, claimed_at = NULL
         WHERE id = $1
         RETURNING *`, [taskId]);
            await client.query(`INSERT INTO task_events (task_id, user_id, event_type, metadata)
         VALUES ($1, $2, 'UPDATED', $3)`, [taskId, volunteerId, JSON.stringify({ action: 'UNCLAIMED' })]);
            await client.query(`UPDATE volunteer_profiles SET status = 'ACTIVE' WHERE user_id = $1`, [volunteerId]);
            await client.query('COMMIT');
            return updateResult.rows[0];
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
     * Record a task view.
     */
    async recordView(taskId, userId) {
        // Fire and forget independent updates in parallel to reduce request latency
        Promise.all([
            pool.query(`INSERT INTO task_views (task_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (task_id, user_id) DO UPDATE
         SET last_seen_at = NOW(), view_count = task_views.view_count + 1`, [taskId, userId]),
            pool.query(`UPDATE tasks SET view_count = view_count + 1 WHERE id = $1`, [taskId])
        ]).catch(err => console.error('[PERF] Failed to record view asynchronously:', err));
    }
    /**
     * Get task events timeline.
     */
    async getTaskEvents(taskId) {
        const result = await pool.query(`SELECT te.*, u.name AS user_name
       FROM task_events te
       LEFT JOIN users u ON u.id = te.user_id
       WHERE te.task_id = $1
       ORDER BY te.created_at DESC`, [taskId]);
        return result.rows;
    }
}
export const tasksService = new TasksService();
//# sourceMappingURL=tasks.service.js.map