import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database — either DATABASE_URL (Railway/Supabase) or individual vars
  DATABASE_URL: z.string().url().optional(),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default('disasteraid'),
  POSTGRES_USER: z.string().default('disasteraid_user'),
  POSTGRES_PASSWORD: z.string().default(''),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Bcrypt
  BCRYPT_ROUNDS: z.coerce.number().default(12),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

  // Features
  ENABLE_MAP_CLUSTERING: z.string().transform(v => v === 'true').default('false'),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),

  // Stripe
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  // Socket.IO
  SOCKET_CORS_ORIGIN: z.string().default('http://localhost:8080'),
});

const parsed = envSchema
  .refine(
    d => d.DATABASE_URL !== undefined || d.POSTGRES_PASSWORD !== '',
    { message: 'Either DATABASE_URL or POSTGRES_PASSWORD must be set' }
  )
  .safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
