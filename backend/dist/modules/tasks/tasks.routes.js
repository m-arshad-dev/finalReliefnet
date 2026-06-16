import { Router } from 'express';
import { tasksController } from './tasks.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { createTaskSchema, updateTaskSchema, taskIdParam, assignTaskSchema } from './tasks.schema.js';
const router = Router();
/**
 * GET /api/tasks/available
 * Returns ALL open tasks — NO distance filter.
 * Protected — requires authentication.
 */
router.get('/available', authenticate, (req, res, next) => tasksController.getAvailable(req, res, next));
/**
 * GET /api/tasks/my
 * Returns ALL tasks created by the authenticated beneficiary (all statuses).
 */
router.get('/my', authenticate, authorize('BENEFICIARY', 'ADMIN', 'NGO', 'DONOR', 'VOLUNTEER', 'COORDINATOR'), (req, res, next) => tasksController.getMyTasks(req, res, next));
/**
 * GET /api/tasks/coordinator
 * Returns tasks assigned to the authenticated coordinator.
 */
router.get('/coordinator', authenticate, authorize('COORDINATOR', 'ADMIN'), (req, res, next) => tasksController.getCoordinatorTasks(req, res, next));
/**
 * POST /api/tasks
 * Create a new task.
 */
router.post('/', authenticate, authorize('NGO', 'COORDINATOR', 'ADMIN', 'BENEFICIARY'), validate({ body: createTaskSchema }), (req, res, next) => tasksController.create(req, res, next));
/**
 * GET /api/tasks/:id
 * Get task details.
 */
router.get('/:id', authenticate, validate({ params: taskIdParam }), (req, res, next) => tasksController.getById(req, res, next));
/**
 * PATCH /api/tasks/:id
 * Update a task.
 */
router.patch('/:id', authenticate, authorize('NGO', 'COORDINATOR', 'ADMIN', 'BENEFICIARY'), validate({ params: taskIdParam, body: updateTaskSchema }), (req, res, next) => tasksController.update(req, res, next));
/**
 * POST /api/tasks/:id/assign
 * Assign task to a specific volunteer (Admin/Coordinator only).
 */
router.post('/:id/assign', authenticate, authorize('COORDINATOR', 'ADMIN'), validate({ params: taskIdParam, body: assignTaskSchema }), (req, res, next) => tasksController.assign(req, res, next));
/**
 * POST /api/tasks/:id/claim
 * Claim a task — race-condition safe (SELECT ... FOR UPDATE).
 * Only VOLUNTEER role can claim.
 */
router.post('/:id/claim', authenticate, authorize('VOLUNTEER'), validate({ params: taskIdParam }), (req, res, next) => tasksController.claim(req, res, next));
/**
 * POST /api/tasks/:id/start
 * Transition CLAIMED → IN_PROGRESS. VOLUNTEER only.
 */
router.post('/:id/start', authenticate, authorize('VOLUNTEER'), validate({ params: taskIdParam }), (req, res, next) => tasksController.start(req, res, next));
/**
 * POST /api/tasks/:id/unclaim
 * Transition CLAIMED → OPEN, releases volunteer. VOLUNTEER only.
 */
router.post('/:id/unclaim', authenticate, authorize('VOLUNTEER'), validate({ params: taskIdParam }), (req, res, next) => tasksController.unclaim(req, res, next));
/**
 * GET /api/tasks/:id/events
 * Get task event timeline.
 */
router.get('/:id/events', authenticate, validate({ params: taskIdParam }), (req, res, next) => tasksController.getEvents(req, res, next));
export default router;
//# sourceMappingURL=tasks.routes.js.map