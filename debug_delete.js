import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
);

async function run() {
  const { count, error } = await supabase.from('carrier_events').select('*', { count: 'exact', head: true });
  console.log(`Total carrier_events: ${count}`);
  
  if (error) console.error("Error:", error);
  
  const { data: delTest, error: delErr } = await supabase.from('carrier_events').delete().not('id', 'is', null).limit(1);
  if (delErr) {
    console.error("Delete Error:", delErr);
  } else {
    console.log("Delete test succeeded");
  }
}

run();
