import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/src/db/schema.ts',
  out: './server/src/db/migrations',
  dbCredentials: { url: process.env.RUNWAY_DB ?? './data/runway.db' },
});
