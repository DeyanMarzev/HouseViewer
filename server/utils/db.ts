import postgres from 'postgres';

type SqlClient = ReturnType<typeof postgres>;

let sqlClient: SqlClient | null = null;
let schemaReady: Promise<void> | null = null;

const getSql = () => {
  if (sqlClient) return sqlClient;
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Database URL missing. Set POSTGRES_URL or DATABASE_URL.');
  }
  const shouldUseSsl =
    /sslmode=require/i.test(url) ||
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1';
  sqlClient = postgres(url, shouldUseSsl ? { ssl: 'require' } : {});
  return sqlClient;
};

const ensureSchema = async () => {
  if (schemaReady) return schemaReady;
  const sql = getSql();
  schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS elements (
        guid TEXT PRIMARY KEY,
        revit_id BIGINT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        material TEXT NOT NULL,
        year_added TEXT NOT NULL DEFAULT '',
        software_originator TEXT NOT NULL DEFAULT '',
        comment TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        date_added TEXT NOT NULL,
        rooms JSONB NOT NULL,
        position JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      );
    `;
  })();
  return schemaReady;
};

export { getSql, ensureSchema };
