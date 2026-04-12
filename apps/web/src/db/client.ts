import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

export function getDb() {
  if (!connectionString) {
    return null;
  }

  const client = postgres(connectionString, {
    prepare: false
  });

  return drizzle(client, { schema });
}
