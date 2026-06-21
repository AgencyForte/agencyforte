import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function main() {
  try {
    await client.connect();
    console.log("Connected to DB, running DDL...");
    await client.query(`
      ALTER TABLE agencies ADD COLUMN IF NOT EXISTS owner_name TEXT;
      ALTER TABLE agencies ADD COLUMN IF NOT EXISTS owner_npn TEXT;
    `);
    console.log("Migration successful.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

main();
