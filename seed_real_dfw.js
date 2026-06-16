import fs from 'fs'
import csv from 'csv-parser'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"

if (!supabaseUrl) {
  console.error("Missing VITE_SUPABASE_URL in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const DFW_ZIP_PREFIXES = ['750', '751', '752', '753', '754', '760', '761', '762', '764', '765', '766']

async function seedRealData() {
  console.log("🚀 Starting Real DFW Data Extraction & Seeding...")
  
  const locationsMap = new Map() // key: city+state+zip -> location obj
  const agenciesMap = new Map() // key: NPN -> agency obj
  const carriersMap = new Map() // key: Carrier Name -> carrier obj
  const appointmentsList = [] // list of appointments

  console.log("📖 Parsing CSV (this may take a minute)...")
  
  await new Promise((resolve, reject) => {
    let rowCount = 0;
    fs.createReadStream('day_1/Active_insurance_company_appointments_for_agencies_and_businesses.csv')
      .pipe(csv())
      .on('data', (data) => {
        rowCount++;
        if (rowCount % 50000 === 0) process.stdout.write(`...processed ${rowCount} rows\r`);
        
        const zip = (data['Postal code'] || '').trim();
        const prefix = zip.substring(0, 3);
        
        if (DFW_ZIP_PREFIXES.includes(prefix)) {
          const city = (data['City'] || '').trim();
          const state = (data['State'] || '').trim();
          const agencyNpn = (data['Agency NPN'] || '').trim();
          const agencyName = (data['Agency name'] || '').trim();
          const carrierName = (data['Insurance company name'] || '').trim();
          const apptDate = (data['Appointment active date'] || '').trim();
          
          if (!agencyNpn || !agencyName || !carrierName) return;

          // Process Location
          const locKey = `${city}-${state}-${zip}`;
          if (!locationsMap.has(locKey)) {
            locationsMap.set(locKey, { 
              address_line_1: 'Unknown', 
              city, 
              state, 
              zip_code: zip, 
              msa: 'Dallas-Fort Worth',
              latitude: 32.7767, // mock coord for map
              longitude: -96.7970
            });
          }

          // Process Agency
          if (!agenciesMap.has(agencyNpn)) {
            agenciesMap.set(agencyNpn, {
              tdi_license_number: agencyNpn, // using NPN as license number placeholder
              agency_name: agencyName,
              category: 'COMMERCIAL', // Default
              location_key: locKey,
              total_producers_count: Math.floor(Math.random() * 20) + 1, // mock count
              bus_factor_pct: 10.0
            });
          }

          // Process Carrier
          if (!carriersMap.has(carrierName)) {
            carriersMap.set(carrierName, { carrier_name: carrierName, am_best_rating: 'A' });
          }

          // Process Appointment
          appointmentsList.push({
            agency_npn: agencyNpn,
            carrier_name: carrierName,
            appointment_date: apptDate || '2020-01-01',
            status: 'ACTIVE',
            is_top_carrier: false
          });
        }
      })
      .on('end', () => {
        console.log(`\n✅ Finished reading CSV. Total rows processed: ${rowCount}`);
        resolve();
      })
      .on('error', (err) => reject(err));
  });

  console.log(`📊 Extracted: ${locationsMap.size} locations, ${agenciesMap.size} agencies, ${carriersMap.size} carriers, ${appointmentsList.length} appointments.`);
  
  const chunkArray = (arr, size) => {
    const chunks = []
    for(let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i+size))
    }
    return chunks
  }

  // 1. Insert Locations
  console.log("📍 Inserting locations...");
  const locationsArray = Array.from(locationsMap.values());
  const locIdMap = new Map(); 
  
  for (const chunk of chunkArray(locationsArray, 500)) {
    const { data, error } = await supabase.from('locations').insert(chunk).select('id, city, state, zip_code');
    if (error) {
        console.error("Error inserting locations:", error.message);
        throw error;
    }
    for (const d of data) {
      locIdMap.set(`${d.city}-${d.state}-${d.zip_code}`, d.id);
    }
  }

  // 2. Insert Agencies
  console.log("🏢 Inserting agencies...");
  const agenciesArray = Array.from(agenciesMap.values()).map(ag => ({
    tdi_license_number: ag.tdi_license_number,
    agency_name: ag.agency_name,
    category: ag.category,
    location_id: locIdMap.get(ag.location_key),
    total_producers_count: ag.total_producers_count,
    bus_factor_pct: ag.bus_factor_pct
  }));
  
  const agencyIdMap = new Map(); 
  for (const chunk of chunkArray(agenciesArray, 500)) {
    const { data, error } = await supabase.from('agencies').insert(chunk).select('id, tdi_license_number');
    if (error) {
        console.error("Error inserting agencies:", error.message);
        throw error;
    }
    for (const d of data) {
      agencyIdMap.set(d.tdi_license_number, d.id);
    }
  }

  // 3. Insert Carriers
  console.log("🛡️ Inserting carriers...");
  const carriersArray = Array.from(carriersMap.values());
  const carrierIdMap = new Map(); 
  for (const chunk of chunkArray(carriersArray, 500)) {
    const { data, error } = await supabase.from('carriers').insert(chunk).select('id, carrier_name');
    if (error) {
        console.error("Error inserting carriers:", error.message);
        throw error;
    }
    for (const d of data) {
      carrierIdMap.set(d.carrier_name, d.id);
    }
  }

  // 4. Insert Appointments
  console.log("🤝 Inserting agency-carrier appointments...");
  const uniqueAppts = new Map();
  for (const appt of appointmentsList) {
    const key = `${appt.agency_npn}-${appt.carrier_name}`;
    if (!uniqueAppts.has(key)) {
        uniqueAppts.set(key, appt);
    }
  }

  const apptsArray = Array.from(uniqueAppts.values())
    .filter(a => agencyIdMap.has(a.agency_npn) && carrierIdMap.has(a.carrier_name))
    .map(a => ({
      agency_id: agencyIdMap.get(a.agency_npn),
      carrier_id: carrierIdMap.get(a.carrier_name),
      appointment_date: a.appointment_date,
      status: a.status,
      is_top_carrier: false
    }));

  for (const chunk of chunkArray(apptsArray, 1000)) {
    const { error } = await supabase.from('agency_carrier_appointments').insert(chunk);
    if (error) {
      console.error("Warning on appointment insert:", error.message);
    }
  }

  // 5. Create Mock User
  console.log("👤 Inserting mock user...");
  const firstAgencyId = agenciesArray.length > 0 ? agencyIdMap.get(agenciesArray[0].tdi_license_number) : null;
  const { data: users, error: userErr } = await supabase.from('users').insert([
    { email: 'principal@agencyforte.com', password_hash: 'mock_hashed_pw', phone_number: '+15550199', home_agency_id: firstAgencyId }
  ]).select()
  if (userErr) throw userErr;

  // 6. Refresh view
  console.log("🔄 Refreshing dynamic competition materialized view...");
  const { error: rpcErr } = await supabase.rpc('refresh_competitor_view')
  if (rpcErr) {
      console.error("Error refreshing view:", rpcErr.message);
  }

  console.log("✅ Successfully seeded DFW real data!");
}

seedRealData().catch(console.error);
