import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "http://127.0.0.1:54321"
const supabaseAnonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function debugData() {
  console.log("--- Fetching a few agencies to inspect relations ---");
  const { data: agencies, error } = await supabase
    .from('agencies')
    .select('*, location_id')
    .limit(3);
    
  if (error) console.error(error);
  else console.log(JSON.stringify(agencies, null, 2));

  console.log("\n--- Fetching a few locations ---");
  const { data: locations, error: locError } = await supabase
    .from('locations')
    .select('*')
    .limit(3);
    
  if (locError) console.error(locError);
  else console.log(JSON.stringify(locations, null, 2));
}

debugData();
