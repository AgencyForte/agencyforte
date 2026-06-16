import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { count } = await supabase.from('agencies')
    .select('*', { count: 'exact', head: true })
    .eq('is_enterprise', false)
    .eq('is_captive_or_micro', false)
    .gte('total_producers_count', 3)
    .lte('total_producers_count', 19);
  console.log('Total verified ICP SMEs:', count);
}
run();
