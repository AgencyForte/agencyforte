import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Adding owner_name and owner_npn to agencies table...");
  const { data, error } = await supabase.rpc('execute_sql', {
    query: `
      ALTER TABLE agencies ADD COLUMN IF NOT EXISTS owner_name TEXT;
      ALTER TABLE agencies ADD COLUMN IF NOT EXISTS owner_npn TEXT;
    `
  });

  if (error) {
    console.log("RPC failed, falling back to REST patch");
    // Fallback if RPC execute_sql is not available. 
    // We can't do DDL via REST API. We will just use the Supabase dashboard or a migration script.
    // Actually, I can just use the provided patch.py or similar to do it if needed.
    // But let's assume we can add it via DDL, or if we can't we might just store it in `metadata` jsonb if they have one.
    // Let me check if agencies has a metadata field.
    console.error("Error executing SQL via RPC:", error);
    process.exit(1);
  } else {
    console.log("Migration successful.");
  }
}

main();
