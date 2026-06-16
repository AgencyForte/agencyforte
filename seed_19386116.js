import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(supabaseUrl, supabaseKey);

// Haversine distance formula
function getDistanceFromLatLonInMiles(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999;
  const R = 3958.8; // Radius of the earth in miles
  const dLat = (lat2 - lat1) * (Math.PI/180);
  const dLon = (lon2 - lon1) * (Math.PI/180); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in miles
  return d;
}

async function run() {
  console.log("Fetching base agency 19386116...");
  const { data: baseAgency } = await supabase
    .from('agencies')
    .select('*, location:locations(*)')
    .eq('tdi_license_number', '19386116')
    .single();

  if (!baseAgency) {
    console.error("Base agency not found.");
    return;
  }

  console.log("Base Agency:", baseAgency.agency_name);

  // Get carriers for base agency
  const { data: baseAppointments } = await supabase
    .from('agency_carrier_appointments')
    .select('carrier_id')
    .eq('agency_id', baseAgency.id)
    .eq('status', 'ACTIVE');

  const baseCarrierIds = baseAppointments.map(a => a.carrier_id);
  console.log(`Base agency has ${baseCarrierIds.length} active carriers.`);

  // Find other agencies with these carriers
  console.log("Finding competitors sharing these carriers...");
  const { data: competitorAppointments, error: apErr } = await supabase
    .from('agency_carrier_appointments')
    .select('agency_id, carrier_id')
    .in('carrier_id', baseCarrierIds)
    .neq('agency_id', baseAgency.id)
    .eq('status', 'ACTIVE');

  if (apErr) {
    console.error("Error fetching competitor appointments:", apErr);
    return;
  }

  // Group by agency_id to count overlapping carriers
  const overlapMap = {};
  competitorAppointments.forEach(a => {
    if (!overlapMap[a.agency_id]) overlapMap[a.agency_id] = 0;
    overlapMap[a.agency_id]++;
  });

  const topCompetitorIds = Object.keys(overlapMap)
    .sort((a, b) => overlapMap[b] - overlapMap[a])
    .slice(0, 20); // Top 20 by shared carriers
    
  console.log(`Found ${topCompetitorIds.length} potential competitors with shared carriers.`);

  if (topCompetitorIds.length === 0) {
    console.log("No competitors found.");
    return;
  }

  // Get locations for top competitors to calculate distance
  const { data: competitorsData } = await supabase
    .from('agencies')
    .select('id, category, location:locations(latitude, longitude)')
    .in('id', topCompetitorIds)
    .eq('is_enterprise', false)
    .eq('is_captive_or_micro', false)
    .gte('total_producers_count', 3)
    .lte('total_producers_count', 19);

  const baseLat = baseAgency.location?.latitude;
  const baseLon = baseAgency.location?.longitude;

  const inserts = [];

  for (const comp of competitorsData) {
    // Only same category
    if (comp.category !== baseAgency.category) continue;

    const compLat = comp.location?.latitude;
    const compLon = comp.location?.longitude;
    const distMiles = getDistanceFromLatLonInMiles(baseLat, baseLon, compLat, compLon);
    const overlapCount = overlapMap[comp.id];

    // Compute score (similar to SQL logic)
    let score = overlapCount * 10;
    if (baseAgency.category === 'COMMERCIAL') {
      if (distMiles <= 50) score += 5;
    } else {
      if (distMiles <= 10) score += 20;
      else if (distMiles <= 25) score += 10;
    }

    inserts.push({
      base_agency_id: baseAgency.id,
      competitor_agency_id: comp.id,
      distance_miles: distMiles,
      competition_score: score,
      overlap_carriers_count: overlapCount
    });
  }

  // Sort by score and take top 5
  inserts.sort((a, b) => b.competition_score - a.competition_score);
  const finalInserts = inserts.slice(0, 5);

  console.log("Inserting top competitors into competitor_relationships...");
  
  // Clear existing to avoid unique constraint errors
  await supabase.from('competitor_relationships').delete().eq('base_agency_id', baseAgency.id);

  if (finalInserts.length > 0) {
    const { error: insErr } = await supabase.from('competitor_relationships').insert(finalInserts);
    if (insErr) console.error("Insert Error:", insErr);
    else console.log(`Successfully populated ${finalInserts.length} competitors for ${baseAgency.agency_name}.`);
  } else {
    console.log("No matching competitors passed the filters.");
  }
}

run();
