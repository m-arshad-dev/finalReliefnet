import { ZodError } from 'zod';
/**
 * Zod-based request validation middleware factory.
 * Validates body, query, and/or params.
 */
export function validate(schema) {
    return (req, res, next) => {
        try {
            if (schema.body) {
                req.body = schema.body.parse(req.body);
            }
            if (schema.query) {
                req.query = schema.query.parse(req.query);
            }
            if (schema.params) {
                req.params = schema.params.parse(req.params);
            }
            next();
        }
        catch (err) {
            if (err instanceof ZodError) {
                console.error('[VALIDATION ERROR]', JSON.stringify(err.errors, null, 2));
                res.status(400).json({
                    error: 'Validation failed',
                    details: err.errors.map((e) => ({
                        field: e.path.join('.'),
                        message: e.message,
                    })),
                });
                return;
            }
            next(err);
        }
    };
}
//# sourceMappingURL=validate.js.map