import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- STARTING ENTERPRISE & ICP HYGIENE SCRUB ---');

  // 1. Blacklist
  const blacklists = ['BENEFITMALL', 'CENTERSTONE', 'GALLAGHER', 'HUB INT', 'MARSH', 'LOCKTON', 'USI ', 'ACRISURE', 'ASSUREDPARTNERS', 'BROWN & BROWN', 'INC.'];
  console.log('1. Applying Blacklist Rule...');
  for (const name of blacklists) {
    const { data } = await supabase.from('agencies').update({ is_enterprise: true }).ilike('agency_name', `%${name}%`).select('id');
    if (data && data.length > 0) console.log(`   Flagged ${data.length} agencies matching ${name}`);
  }

  // 2. Conglomerate Rule (> 19 producers)
  console.log('2. Applying Conglomerate Rule (>19 producers)...');
  const { data: congloms } = await supabase.from('agencies').update({ is_enterprise: true }).gt('total_producers_count', 19).select('id');
  if (congloms) console.log(`   Flagged ${congloms.length} agencies with > 19 producers.`);

  // 3. Carrier Bounds
  console.log('3. Applying Carrier Bounds...');
  // Get all active appointments grouped by agency
  const { data: appts, error: err } = await supabase.from('agency_carrier_appointments')
    .select('agency_id, carrier:carriers(carrier_name)')
    .eq('status', 'ACTIVE');
  
  if (err) {
    console.error('Error fetching appointments', err);
    return;
  }

  const agencyMap = {};
  for (const a of appts) {
    if (!agencyMap[a.agency_id]) {
      agencyMap[a.agency_id] = { count: 0, carriers: [] };
    }
    agencyMap[a.agency_id].count++;
    if (a.carrier) {
      agencyMap[a.agency_id].carriers.push(a.carrier.carrier_name);
    }
  }

  const toEnterprise = [];
  const toCaptiveOrMicro = [];

  for (const [agencyId, data] of Object.entries(agencyMap)) {
    if (data.count > 45) {
      toEnterprise.push(agencyId);
    } else if (data.count < 4) {
      toCaptiveOrMicro.push(agencyId);
    } else {
      // Captive check (90% dominance)
      // Group carrier names by first word
      const prefixes = {};
      let total = data.carriers.length;
      for (const name of data.carriers) {
        const firstWord = name.split(' ')[0].toUpperCase();
        if (!prefixes[firstWord]) prefixes[firstWord] = 0;
        prefixes[firstWord]++;
      }
      let isCaptive = false;
      for (const [prefix, count] of Object.entries(prefixes)) {
        if (count / total >= 0.9 && total >= 4) {
          isCaptive = true;
          break;
        }
      }
      if (isCaptive) {
        toCaptiveOrMicro.push(agencyId);
      }
    }
  }

  console.log(`   Found ${toEnterprise.length} agencies with >45 carriers.`);
  console.log(`   Found ${toCaptiveOrMicro.length} agencies with <4 carriers or >90% captive dominance.`);

  // Batch updates
  const chunkSize = 200;
  for (let i = 0; i < toEnterprise.length; i += chunkSize) {
    const chunk = toEnterprise.slice(i, i + chunkSize);
    await supabase.from('agencies').update({ is_enterprise: true }).in('id', chunk);
  }
  for (let i = 0; i < toCaptiveOrMicro.length; i += chunkSize) {
    const chunk = toCaptiveOrMicro.slice(i, i + chunkSize);
    await supabase.from('agencies').update({ is_captive_or_micro: true }).in('id', chunk);
  }

  // 4. Address Clustering Check
  console.log('4. Applying Corporate Address Clustering Check...');
  const { data: locations } = await supabase.from('locations').select('id, address_line_1, zip_code');
  const locMap = {};
  for (const l of locations) {
    const key = `${l.address_line_1?.toUpperCase()}_${l.zip_code}`;
    if (!locMap[key]) locMap[key] = { ids: [], count: 0 };
    locMap[key].ids.push(l.id);
  }

  // Which locations share > 3 agencies?
  // We need to count agencies at these locations
  const { data: allAgencies } = await supabase.from('agencies').select('id, location_id');
  const agencyCountByLoc = {};
  for (const a of allAgencies) {
    if (a.location_id) {
      if (!agencyCountByLoc[a.location_id]) agencyCountByLoc[a.location_id] = 0;
      agencyCountByLoc[a.location_id]++;
    }
  }

  // Combine loc map counts
  const enterpriseHubs = [];
  for (const [key, locData] of Object.entries(locMap)) {
    let totalAgencies = 0;
    for (const locId of locData.ids) {
      totalAgencies += (agencyCountByLoc[locId] || 0);
    }
    if (totalAgencies > 3) {
      enterpriseHubs.push(...locData.ids);
    }
  }

  if (enterpriseHubs.length > 0) {
    console.log(`   Found ${enterpriseHubs.length} location IDs belonging to shared hubs (>3 agencies).`);
    // Find all agencies at these locations
    const hubAgencies = allAgencies.filter(a => enterpriseHubs.includes(a.location_id)).map(a => a.id);
    console.log(`   Flagging ${hubAgencies.length} agencies as enterprise based on clustering.`);
    
    for (let i = 0; i < hubAgencies.length; i += chunkSize) {
      const chunk = hubAgencies.slice(i, i + chunkSize);
      await supabase.from('agencies').update({ is_enterprise: true }).in('id', chunk);
    }
  }

  console.log('--- HYGIENE SCRUB COMPLETE ---');
}

run();
