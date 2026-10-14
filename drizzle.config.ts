import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration. `app/db/schema.ts` is the single authoritative schema source.
 * Generate a migration after editing the schema:   npm run db:generate -- --name=<change>
 * Migrations are applied by the app at startup (after an automatic pre-migration backup)
 * or explicitly with:                               npm run db:migrate
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './app/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
