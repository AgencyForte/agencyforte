import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseAnonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkDiff() {
  console.log('--- FETCHING PRODUCER MOVEMENTS ---');
  const { data: moves } = await supabase.from('producer_movements').select('*');
  console.log(moves);

  console.log('--- FETCHING AGENCY APPOINTMENTS ---');
  const { data: appts } = await supabase.from('agency_carrier_appointments').select('*');
  console.log(appts);
}

checkDiff().catch(console.error);
