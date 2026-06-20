import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "http://127.0.0.1:54321"
const supabaseAnonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function run() {
  console.log("--- Schema Check ---");
  const { data: agencies, error } = await supabase.from('agencies').select('*').limit(1);
  if (error) console.error(error);
  else console.log("Agency fields:", Object.keys(agencies[0]));

  console.log("\n--- Running ICP Filter Query ---");
  const { data: icps, error: icpError } = await supabase
    .from('agencies')
    .select(`
      id,
      agency_name,
      total_producers_count,
      category,
      location,
      lob
    `)
    // Approximate filters
    .gte('total_producers_count', 7)
    .lte('total_producers_count', 30)
    .neq('category', 'Captive');

  if (icpError) {
    console.error(icpError);
  } else {
    // Filter locally for complex jsonb/array stuff if needed
    let filtered = icps.filter(a => {
      // Check MSA
      if (!a.location?.msa?.includes('Dallas')) return false;
      // We don't have active_carrier_appointments_count on the base model usually, let's see.
      // Check LOB
      const domLob = a.lob ? (typeof a.lob === 'string' ? a.lob : a.lob[0]) : '';
      if (!domLob || (!domLob.includes('Commercial') && !domLob.includes('Benefits'))) return false;
      
      return true;
    });
    
    console.log(`Found ${filtered.length} agencies matching the ICP criteria.`);
    if (filtered.length > 0) {
      console.log("Top 3 matches:");
      console.log(filtered.slice(0, 3));
    }
  }
}
run();
