import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "http://127.0.0.1:54321"
const supabaseAnonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkData() {
  console.log("Checking for ICP tables or records...");
  
  // Try to find a specific table or query the agencies table
  const { data: agencies, error } = await supabase
    .from('agencies')
    .select('*')
    .limit(5);
    
  if (error) {
    console.error("Error fetching agencies:", error);
  } else {
    console.log(`Found agencies table. Example records: ${agencies.length}`);
  }

  // Check if there is an icp field or a specific table
  const { data: icpData, error: icpError } = await supabase
    .from('icp_profiles')
    .select('*')
    .limit(5);
    
  if (icpError) {
    console.log("No specific 'icp_profiles' table found. ICPs might be identified via a query on the agencies table.");
  } else {
    console.log(`Found 'icp_profiles' table. Records: ${icpData.length}`);
  }
}

checkData();
