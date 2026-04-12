import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var __devflowDb: ReturnType<typeof drizzle<typeof schema>> | null | undefined;
}

export function getDb() {
  if (!connectionString) {
    return null;
  }

  if (!globalThis.__devflowDb) {
    const client = postgres(connectionString, {
      prepare: false
    });

    globalThis.__devflowDb = drizzle(client, { schema });
  }

  return globalThis.__devflowDb;
}
