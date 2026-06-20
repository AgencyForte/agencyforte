import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseAnonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MATRIX_FILE = 'icp_competitor_matrix.json';

async function seedMatrix() {
  console.log('--- STARTING DATABASE SEED: LIVE MATRIX ---');

  if (!fs.existsSync(MATRIX_FILE)) {
    console.error(`File ${MATRIX_FILE} not found!`);
    return;
  }

  console.log('Loading matrix JSON from disk...');
  const matrix = JSON.parse(fs.readFileSync(MATRIX_FILE, 'utf-8'));
  
  // 1. Gather all unique agencies and cities
  console.log('Extracting unique entities...');
  const uniqueAgencies = new Map(); // NPN -> Data
  const uniqueCities = new Set();

  for (const icp of matrix) {
    uniqueAgencies.set(icp.icp_details.npn, {
      ...icp.icp_details,
      is_icp: true
    });
    uniqueCities.add(icp.icp_details.city);

    // We don't need to insert all 1,862 competitors for every single ICP, that would crash local DB.
    // Let's just insert the Top 50 competitors for each ICP to keep it lean but realistic.
    const topCompetitors = icp.competitors.slice(0, 50);
    for (const comp of topCompetitors) {
      if (!uniqueAgencies.has(comp.npn)) {
        uniqueAgencies.set(comp.npn, {
          ...comp,
          is_icp: false
        });
      }
      uniqueCities.add(comp.city);
    }
  }

  console.log(`Found ${uniqueAgencies.size} unique agencies (ICPs + Top 50 Competitors).`);

  // 2. Clear old data
  console.log('Clearing old mock data...');
  await supabase.from('competitor_relationships').delete().neq('id', 'dummy');
  await supabase.from('agencies').delete().neq('id', 'dummy');
  await supabase.from('locations').delete().neq('id', 'dummy');

  // 3. Insert Locations (One per unique city)
  console.log(`Inserting ${uniqueCities.size} unique locations...`);
  const locationsToInsert = Array.from(uniqueCities).map(city => ({
    city: city,
    state: 'TX',
    msa: 'Dallas-Fort Worth'
  }));

  const { data: locData, error: locErr } = await supabase.from('locations').insert(locationsToInsert).select();
  if (locErr) { console.error('Location Error:', locErr); return; }

  const cityToLocId = new Map();
  locData.forEach(l => cityToLocId.set(l.city.toUpperCase(), l.id));

  // 4. Insert Agencies in Batches
  console.log('Inserting agencies in batches...');
  const agenciesArray = Array.from(uniqueAgencies.values());
  const BATCH_SIZE = 500;
  
  for (let i = 0; i < agenciesArray.length; i += BATCH_SIZE) {
    const batch = agenciesArray.slice(i, i + BATCH_SIZE).map(a => ({
      tdi_license_number: a.npn, // We use TDI field to store NPN
      agency_name: a.name,
      total_producers_count: a.producer_count,
      location_id: cityToLocId.get((a.city || '').toUpperCase()),
      category: 'COMMERCIAL',
      is_icp: a.is_icp,
      carriers_count: a.carrier_count
    }));

    const { error: agErr } = await supabase.from('agencies').upsert(batch, { onConflict: 'tdi_license_number' });
    if (agErr) { console.error('Agency Insert Error:', agErr); return; }
  }

  // Fetch all inserted agencies to map NPN -> UUID
  console.log('Mapping NPNs to Database UUIDs...');
  const { data: insertedAgencies } = await supabase.from('agencies').select('id, tdi_license_number');
  const npnToUuid = new Map();
  insertedAgencies.forEach(a => npnToUuid.set(a.tdi_license_number, a.id));

  // 5. Insert Competitor Relationships in Batches
  console.log('Inserting Competitor Relationships (Top 10 per ICP)...');
  const relsToInsert = [];
  
  for (const icp of matrix) {
    const baseId = npnToUuid.get(icp.icp_details.npn);
    if (!baseId) continue;

    // Insert Top 10 competitors for the DB so the UI has exactly what it needs
    const top10 = icp.competitors.slice(0, 10);
    for (const comp of top10) {
      const compId = npnToUuid.get(comp.npn);
      if (!compId) continue;

      relsToInsert.push({
        base_agency_id: baseId,
        competitor_agency_id: compId,
        competition_score: comp.fit_score,
        overlap_carriers_count: comp.shared_carriers,
        distance_miles: 0 // We didn't calc miles, geography was baked into score
      });
    }
  }

  for (let i = 0; i < relsToInsert.length; i += BATCH_SIZE) {
    const batch = relsToInsert.slice(i, i + BATCH_SIZE);
    const { error: relErr } = await supabase.from('competitor_relationships').insert(batch);
    if (relErr) { console.error('Rel Insert Error:', relErr); return; }
  }

  console.log(`\n=================================================`);
  console.log(`SUCCESS: Seeded ${insertedAgencies.length} real agencies and ${relsToInsert.length} relationships!`);
  console.log(`=================================================`);
}

seedMatrix().catch(console.error);
