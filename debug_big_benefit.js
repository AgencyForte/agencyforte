import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
);

async function run() {
  const { data: ags } = await supabase.from('agencies').select('id, agency_name, tdi_license_number').ilike('agency_name', '%BIG BENEFIT%');
  console.log(`Found ${ags.length} agencies:`);
  console.dir(ags);
  
  if (ags.length > 0) {
    const { data: events } = await supabase.from('carrier_events')
      .select('event_type, agency_id, carrier:carriers(carrier_name)')
      .in('agency_id', ags.map(a => a.id));
      
    console.log(`Total events for these agencies: ${events.length}`);
    
    // Group by agency_id
    const grouped = {};
    for (let e of events) {
      if (!grouped[e.agency_id]) grouped[e.agency_id] = [];
      grouped[e.agency_id].push(e);
    }
    
    for (let id in grouped) {
      console.log(`Agency ${id} has ${grouped[id].length} events. Unique carriers: ${new Set(grouped[id].map(e => e.carrier?.carrier_name)).size}`);
    }
  }
}

run();
