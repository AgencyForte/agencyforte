import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "http://127.0.0.1:54321"
const supabaseAnonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function flagICPs() {
  console.log("--- PHASE 1: Identifying Ideal Customer Profiles ---");
  
  // 1. Reset all existing ICP flags to false first
  console.log("Resetting all existing ICP flags...");
  await supabase.from('agencies').update({ is_icp: false }).neq('id', 'dummy'); // dummy condition to update all

  // 2. Query agencies that match our base criteria
  console.log("Fetching agencies matching Scale & Geography...");
  const { data: agencies, error } = await supabase
    .from('agencies')
    .select(`
      id,
      agency_name,
      total_producers_count,
      category,
      location:locations(msa, city)
    `)
    .gte('total_producers_count', 7)
    .lte('total_producers_count', 30);

  if (error) {
    console.error("Error fetching agencies:", error);
    return;
  }

  // 3. Filter the results based on strict criteria
  const icpTargets = agencies.filter(agency => {
    // A. Must be Independent (Not Captive)
    // Looking at the schema, we can filter out Captives. Often 'category' is 'Independent'
    if (agency.category?.toLowerCase() === 'captive') return false;

    // B. Must be in DFW MSA
    const msa = agency.location?.msa || '';
    if (!msa.includes('Dallas')) return false;

    return true;
  });

  console.log(`\nFound ${icpTargets.length} agencies matching the strict ICP parameters.`);
  
  if (icpTargets.length === 0) {
    console.log("No agencies found. Adjust parameters.");
    return;
  }

  console.log("\nSample Targets:");
  icpTargets.slice(0, 5).forEach(target => {
    console.log(`- ${target.agency_name} (${target.total_producers_count} Producers, ${target.location?.city})`);
  });

  // 4. Update the database
  console.log("\nFlagging these agencies as 'is_icp = TRUE' in the database...");
  
  const targetIds = icpTargets.map(t => t.id);
  
  const { error: updateError } = await supabase
    .from('agencies')
    .update({ is_icp: true })
    .in('id', targetIds);

  if (updateError) {
    console.error("Failed to update database:", updateError);
  } else {
    console.log(`SUCCESS: ${targetIds.length} agencies officially tagged as ICPs.`);
  }
}

flagICPs();
