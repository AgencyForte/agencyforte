import fs from 'fs';
import csv from 'csv-parser';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
);

const DAY1_APPTS = 'day_1/Active_insurance_company_appointments_for_agencies_and_businesses.csv';
const DAY1_RELS = 'day_1/Business_relationships_between_agents__agencies__adjusters__and_insurance_companies.csv';
const DAY2_APPTS = 'day_2/Active_insurance_company_appointments_for_agencies_and_businesses.csv';
const DAY2_RELS = 'day_2/Business_relationships_between_agents__agencies__adjusters__and_insurance_companies.csv';

async function streamCsv(filePath, onData) {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(filePath).pipe(csv());
    stream.on('data', onData);
    stream.on('end', () => resolve());
  });
}

async function runDiff() {
  console.log('--- TEMPORAL DIFFING ENGINE (Day 1 vs Day 2) ---');

  // 1. Fetch our Target Agencies
  console.log('Fetching Target Agencies from DB...');
  const dbAgencies = [];
  let fromIdx = 0;
  let toIdx = 999;
  while (true) {
    const { data, error: agErr } = await supabase.from('agencies').select('id, tdi_license_number').range(fromIdx, toIdx);
    if (agErr) throw agErr;
    if (!data || data.length === 0) break;
    dbAgencies.push(...data);
    if (data.length < 1000) break;
    fromIdx += 1000;
    toIdx += 1000;
  }
  
  const targetAgencies = new Map(); // NPN -> UUID
  for (const a of dbAgencies) {
    if (a.tdi_license_number) {
      targetAgencies.set(a.tdi_license_number.toString(), a.id);
    }
  }
  console.log(`Tracking ${targetAgencies.size} Target Agencies.`);

  // Clear old orphaned events
  console.log('Clearing old mock events...');
  await supabase.from('producer_movements').delete().neq('id', 'dummy');
  await supabase.from('agency_carrier_appointments').delete().neq('id', 'dummy');

  // Memory State
  const day1Producers = new Map(); // AgencyNPN -> Set<ProducerNPN>
  const day2Producers = new Map(); 
  const day1Appts = new Map(); // AgencyNPN -> Set<CarrierName>
  const day2Appts = new Map();
  
  const discoveredProducers = new Map(); // ProducerNPN -> { name }
  const discoveredCarriers = new Set(); // CarrierName
  const agencyOwners = new Map(); // AgencyNPN -> { name, npn }

  // --- PHASE 1: Parse Day 1 ---
  console.log('\nStreaming Day 1 Relationships...');
  let d1RelsCount = 0;
  await streamCsv(DAY1_RELS, (row) => {
    const agencyNpn = row['Associated licensee NPN'];
    const prodNpn = row['Licensee NPN'];
    if (!agencyNpn || !prodNpn || !targetAgencies.has(agencyNpn)) return;
    
    if (!day1Producers.has(agencyNpn)) day1Producers.set(agencyNpn, new Set());
    day1Producers.get(agencyNpn).add(prodNpn);
    
    discoveredProducers.set(prodNpn, { name: row['Licensee name'], active_date: row['Association begin date'] });
    d1RelsCount++;
  });
  console.log(`Tracked ${d1RelsCount} Day 1 Producer Relationships for Targets.`);

  console.log('Streaming Day 1 Appointments...');
  let d1ApptsCount = 0;
  await streamCsv(DAY1_APPTS, (row) => {
    const agencyNpn = row['Agency NPN'];
    const carrierName = row['Insurance company name'];
    if (!agencyNpn || !carrierName || !targetAgencies.has(agencyNpn)) return;

    if (!day1Appts.has(agencyNpn)) day1Appts.set(agencyNpn, new Set());
    day1Appts.get(agencyNpn).add(carrierName);
    
    discoveredCarriers.add(carrierName);
    d1ApptsCount++;
  });
  console.log(`Tracked ${d1ApptsCount} Day 1 Appointments for Targets.`);

  // --- PHASE 2: Parse Day 2 ---
  console.log('\nStreaming Day 2 Relationships...');
  let d2RelsCount = 0;
  await streamCsv(DAY2_RELS, (row) => {
    const agencyNpn = row['Associated licensee NPN'];
    const prodNpn = row['Licensee NPN'];
    if (!agencyNpn || !prodNpn || !targetAgencies.has(agencyNpn)) return;
    
    if (!day2Producers.has(agencyNpn)) day2Producers.set(agencyNpn, new Set());
    day2Producers.get(agencyNpn).add(prodNpn);
    
    discoveredProducers.set(prodNpn, { name: row['Licensee name'], active_date: row['Association begin date'] });

    const role = row['Association type'];
    const targetRoles = [
      'Officer/Director', 'Owner', 'Member/Owner', 
      'Desig-Resp-Lic-Person', 'Partner', 'Qualifying Active Officer',
      'General Partner', 'LS-Officer/Director'
    ];
    if (targetRoles.includes(role)) {
      if (!agencyOwners.has(agencyNpn)) {
        agencyOwners.set(agencyNpn, { name: row['Licensee name'], npn: prodNpn });
      }
    }

    d2RelsCount++;
  });
  console.log(`Tracked ${d2RelsCount} Day 2 Producer Relationships for Targets.`);

  console.log('Streaming Day 2 Appointments...');
  let d2ApptsCount = 0;
  await streamCsv(DAY2_APPTS, (row) => {
    const agencyNpn = row['Agency NPN'];
    const carrierName = row['Insurance company name'];
    if (!agencyNpn || !carrierName || !targetAgencies.has(agencyNpn)) return;

    if (!day2Appts.has(agencyNpn)) day2Appts.set(agencyNpn, new Set());
    day2Appts.get(agencyNpn).add(carrierName);
    
    discoveredCarriers.add(carrierName);
    d2ApptsCount++;
  });
  console.log(`Tracked ${d2ApptsCount} Day 2 Appointments for Targets.`);

  // --- PHASE 3: Upsert Discoveries ---
  console.log('\nUpserting Unique Carriers...');
  const carrierMap = new Map(); // CarrierName -> UUID
  const carrierBatch = Array.from(discoveredCarriers).map(c => ({ carrier_name: c, am_best_rating: 'A' }));
  // Upsert in batches of 500
  for (let i = 0; i < carrierBatch.length; i += 500) {
    const { data: insertedCarriers, error: cErr } = await supabase.from('carriers')
      .upsert(carrierBatch.slice(i, i + 500), { onConflict: 'carrier_name' }).select('id, carrier_name');
    if (cErr) { console.error('Carrier upsert err:', cErr); return; }
    if (insertedCarriers) insertedCarriers.forEach(c => carrierMap.set(c.carrier_name, c.id));
  }

  console.log('Upserting Unique Producers...');
  const producerMap = new Map(); // NPN -> UUID
  const prodBatch = Array.from(discoveredProducers.entries()).map(([npn, p]) => {
    const parts = (p.name || 'Unknown').split(' ');
    const last_name = parts.pop();
    const first_name = parts.join(' ') || 'Unknown';
    return {
      npn: npn,
      first_name,
      last_name,
      original_license_date: p.active_date ? new Date(p.active_date).toISOString() : new Date().toISOString()
    };
  });
  
  for (let i = 0; i < prodBatch.length; i += 500) {
    const { data: insertedProds, error: pErr } = await supabase.from('producers')
      .upsert(prodBatch.slice(i, i + 500), { onConflict: 'npn' }).select('id, npn');
    if (pErr) { console.error('Producer upsert err:', pErr); return; }
    if (insertedProds) insertedProds.forEach(p => producerMap.set(p.npn, p.id));
  }

  // --- PHASE 4: Calculate Diffs ---
  console.log('\nCalculating Temporal Diffs...');
  const movements = [];
  const appts = [];

  // Calculate Hires & Exits
  for (const [agencyNpn, day1Set] of day1Producers.entries()) {
    const day2Set = day2Producers.get(agencyNpn) || new Set();
    const agencyId = targetAgencies.get(agencyNpn);
    
    // EXITS: In Day 1, but not in Day 2
    for (const prodNpn of day1Set) {
      if (!day2Set.has(prodNpn)) {
        const prodId = producerMap.get(prodNpn);
        if (prodId && agencyId) {
          movements.push({
            producer_id: prodId,
            from_agency_id: agencyId,
            to_agency_id: null, // Don't know where they went yet unless we do a state-wide trace
            movement_date: new Date().toISOString(), // Use today as diff date
            movement_type: 'EXITED',
            lines_affected: ['COMMERCIAL_P_C']
          });
        }
      }
    }
  }

  for (const [agencyNpn, day2Set] of day2Producers.entries()) {
    const day1Set = day1Producers.get(agencyNpn) || new Set();
    const agencyId = targetAgencies.get(agencyNpn);
    
    // HIRES: In Day 2, but not in Day 1
    for (const prodNpn of day2Set) {
      if (!day1Set.has(prodNpn)) {
        const prodId = producerMap.get(prodNpn);
        if (prodId && agencyId) {
          movements.push({
            producer_id: prodId,
            from_agency_id: null,
            to_agency_id: agencyId,
            movement_date: new Date().toISOString(),
            movement_type: 'HIRED',
            lines_affected: ['COMMERCIAL_P_C']
          });
        }
      }
    }
  }

  const lostAppts = [];
  // Calculate New & Lost Markets
  for (const [agencyNpn, day1Set] of day1Appts.entries()) {
    const day2Set = day2Appts.get(agencyNpn) || new Set();
    const agencyId = targetAgencies.get(agencyNpn);
    
    // LOST MARKETS
    for (const carrier of day1Set) {
      if (!day2Set.has(carrier)) {
        const carrierId = carrierMap.get(carrier);
        if (carrierId && agencyId) {
          lostAppts.push({
            agency_id: agencyId,
            carrier_id: carrierId,
            event_type: 'APPOINTMENT_LOST',
            event_date: new Date().toISOString(),
            producers_affected_count: 1
          });
        }
      }
    }
  }

  for (const [agencyNpn, day2Set] of day2Appts.entries()) {
    const day1Set = day1Appts.get(agencyNpn) || new Set();
    const agencyId = targetAgencies.get(agencyNpn);
    
    // NEW APPOINTMENTS: In Day 2, but not Day 1
    for (const carrier of day2Set) {
      if (!day1Set.has(carrier)) {
        const carrierId = carrierMap.get(carrier);
        if (carrierId && agencyId) {
          appts.push({
            agency_id: agencyId,
            carrier_id: carrierId,
            appointment_date: new Date().toISOString(),
            status: 'ACTIVE',
            is_top_carrier: false
          });
        }
      }
    }
  }

  // --- PHASE 5: Inject into Database ---
  console.log(`\nInserting ${movements.length} Producer Movements...`);
  for (let i = 0; i < movements.length; i += 500) {
    await supabase.from('producer_movements').insert(movements.slice(i, i + 500));
  }

  console.log(`Inserting ${appts.length} Agency Appointments...`);
  for (let i = 0; i < appts.length; i += 500) {
    await supabase.from('agency_carrier_appointments').insert(appts.slice(i, i + 500));
  }
  
  // Also, Dashboard.jsx queries carrier_events for LOST/GAINED
  // Let's create some carrier_events for New Markets so it shows up in "NEW APPTS" column!
  const carrierEvents = [
    ...appts.map(a => ({
      agency_id: a.agency_id,
      carrier_id: a.carrier_id,
      event_type: 'APPOINTMENT_GAINED',
      event_date: a.appointment_date,
      producers_affected_count: 1
    })),
    ...lostAppts
  ];
  
  console.log(`Inserting ${carrierEvents.length} Carrier Events...`);
  for (let i = 0; i < carrierEvents.length; i += 500) {
    await supabase.from('carrier_events').delete().neq('id', 'dummy');
    await supabase.from('carrier_events').insert(carrierEvents.slice(i, i + 500));
  }

  console.log(`Updating ${agencyOwners.size} Agencies with Owner Information...`);
  for (const [agencyNpn, owner] of agencyOwners.entries()) {
    const agencyId = targetAgencies.get(agencyNpn);
    if (agencyId) {
      await supabase.from('agencies').update({
        owner_name: owner.name,
        owner_npn: owner.npn
      }).eq('id', agencyId);
    }
  }

  console.log('✅ ALL DIFF EVENTS SEEDED SUCCESSFULLY!');
}

runDiff().catch(console.error);
