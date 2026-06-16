import { Pool, PoolConfig } from 'pg';
import { env } from './env.js';

const sharedConfig: PoolConfig = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  ssl: { rejectUnauthorized: false },
};

const poolConfig: PoolConfig = env.DATABASE_URL
  ? { ...sharedConfig, connectionString: env.DATABASE_URL }
  : {
      ...sharedConfig,
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
    };

console.log('[DB] Config:', env.DATABASE_URL
  ? { connectionString: env.DATABASE_URL.replace(/:\/\/[^@]+@/, '://***@') }
  : { host: env.POSTGRES_HOST, port: env.POSTGRES_PORT, database: env.POSTGRES_DB, user: env.POSTGRES_USER, password: '***' }
);

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[DB POOL] Idle client error (pool will self-heal):', err.message);
});

export async function checkDatabaseHealth(): Promise<boolean> {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    return true;
  } catch (err) {
    console.error('[DB HEALTH] Check failed:', err);
    return false;
  } finally {
    client?.release();
  }
}
