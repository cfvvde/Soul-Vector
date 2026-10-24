import { Pool } from "pg";

const globalForPg = globalThis as typeof globalThis & {
  soulVectorPgPool?: Pool;
};

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL не задан. Добавь строку подключения PostgreSQL в .env.local и перезапусти Next.js.",
    );
  }

  if (!globalForPg.soulVectorPgPool) {
    globalForPg.soulVectorPgPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    globalForPg.soulVectorPgPool.on("error", (error) => {
      console.error("Unexpected SoulVector PostgreSQL pool error:", error.message);
    });
  }

  return globalForPg.soulVectorPgPool;
}
