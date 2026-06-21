import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "http://127.0.0.1:54321"
const supabaseAnonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function runICPFlagging() {
  console.log("--- PHASE 1: Executing the Official ICP Database Sweep ---");

  // 1. Reset existing ICPs
  await supabase.from('agencies').update({ is_icp: false }).not('id', 'is', null);

  // 2. Query based on the 5-Pillar Model using the exact schema
  const { data: icpTargets, error } = await supabase
    .from('agencies')
    .select(`
      id,
      agency_name,
      total_producers_count,
      category,
      is_captive,
      locations!inner(msa, city)
    `)
    // Pillar 1: Scale (7 to 30 Producers)
    .gte('total_producers_count', 7)
    .lte('total_producers_count', 30)
    // Pillar 2: Independent (Not Captive)
    .eq('is_captive', false)
    // Pillar 5: Geography (DFW)
    .ilike('locations.msa', '%Dallas%');

  if (error) {
    console.error("Database query failed:", error);
    return;
  }

  // 3. Filter further for Commercial / Specialty focus in Javascript if needed
  // (Since the mock DB has 'COMMERCIAL' category, we can filter for that)
  const finalTargets = icpTargets.filter(agency => {
    return agency.category?.toUpperCase() === 'COMMERCIAL' || agency.category?.toUpperCase() === 'BENEFITS';
  });

  console.log(`\nAnalysis Complete. We mathematically identified ${finalTargets.length} agencies that perfectly match the new ICP profile.`);

  if (finalTargets.length > 0) {
    console.log("\nTop Targets Identified:");
    finalTargets.slice(0, 5).forEach(target => {
      console.log(`[TARGET LOCKED] ${target.agency_name} | Producers: ${target.total_producers_count} | Location: ${target.locations?.city} | Specialty: ${target.category}`);
    });

    // 4. Update the DB to flag them
    const targetIds = finalTargets.map(t => t.id);
    const { error: updateError } = await supabase
      .from('agencies')
      .update({ is_icp: true })
      .in('id', targetIds);

    if (updateError) {
      console.error("Failed to flag ICPs in DB:", updateError);
    } else {
      console.log(`\nSUCCESS: ${targetIds.length} agencies have been permanently flagged with 'is_icp = TRUE'.`);
    }
  } else {
    console.log("No agencies match all strict parameters currently in the mock database.");
  }
}

runICPFlagging();
