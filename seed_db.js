import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// To run this script locally: `node seed_db.js`

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"

if (!supabaseUrl) {
  console.error("Missing VITE_SUPABASE_URL in .env.local")
  process.exit(1)
}

// Use service role key to bypass RLS during seeding
const supabase = createClient(supabaseUrl, supabaseKey)

async function seed() {
  console.log("🚀 Starting Database Seed...")

  console.log("🧹 Wiping existing data for clean seed...")
  await supabase.from('carrier_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('producer_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('user_watchlists').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('producer_carrier_appointments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('agency_carrier_appointments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('producers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('carriers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('agencies').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('locations').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // 1. Locations
  console.log("📍 Inserting locations...")
  const { data: locations, error: locErr } = await supabase.from('locations').insert([
    { address_line_1: '123 Main St', city: 'Dallas', state: 'TX', zip_code: '75001', msa: 'Dallas-Fort Worth', latitude: 32.7767, longitude: -96.7970 },
    { address_line_1: '456 Oak Rd', city: 'Fort Worth', state: 'TX', zip_code: '76102', msa: 'Dallas-Fort Worth', latitude: 32.7555, longitude: -97.3308 },
    { address_line_1: '789 Pine Ln', city: 'Houston', state: 'TX', zip_code: '77002', msa: 'Greater Houston', latitude: 29.7604, longitude: -95.3698 }
  ]).select()
  if (locErr) throw locErr;

  // 2. Agencies
  console.log("🏢 Inserting agencies...")
  const { data: agencies, error: agErr } = await supabase.from('agencies').insert([
    { tdi_license_number: 'TX-10001', agency_name: 'Goosehead Insurance', category: 'PERSONAL_AUTO', website: 'goosehead.com', founded_year: 2003, total_producers_count: 150, location_id: locations[0].id, ams_system: 'EZLynx', estimated_premium_volume: '$50M+', bus_factor_pct: 12.5, median_producer_tenure_months: 36 },
    { tdi_license_number: 'TX-10002', agency_name: 'Higginbotham', category: 'COMMERCIAL', website: 'higginbotham.com', founded_year: 1948, total_producers_count: 300, location_id: locations[1].id, ams_system: 'Applied Epic', estimated_premium_volume: '$100M+', bus_factor_pct: 8.2, median_producer_tenure_months: 84 },
    { tdi_license_number: 'TX-10003', agency_name: 'Willis Towers Watson', category: 'COMMERCIAL', website: 'wtw.com', founded_year: 1828, total_producers_count: 500, location_id: locations[2].id, ams_system: 'Custom', estimated_premium_volume: '$500M+', bus_factor_pct: 5.1, median_producer_tenure_months: 120 },
    { tdi_license_number: 'TX-10004', agency_name: 'Lockton Companies', category: 'COMMERCIAL', website: 'lockton.com', founded_year: 1966, total_producers_count: 200, location_id: locations[0].id, ams_system: 'Applied Epic', estimated_premium_volume: '$250M+', bus_factor_pct: 6.0, median_producer_tenure_months: 90 },
    { tdi_license_number: 'TX-10005', agency_name: 'Marsh McLennan Agency', category: 'COMMERCIAL', website: 'marshmma.com', founded_year: 2008, total_producers_count: 400, location_id: locations[1].id, ams_system: 'Custom', estimated_premium_volume: '$400M+', bus_factor_pct: 7.1, median_producer_tenure_months: 80 },
    // Anomaly Targets
    { tdi_license_number: 'TX-10006', agency_name: 'Titan Insurance Group', category: 'COMMERCIAL', website: 'titan.com', founded_year: 2015, total_producers_count: 85, location_id: locations[0].id, ams_system: 'HawkSoft', estimated_premium_volume: '$20M+', bus_factor_pct: 15.0, median_producer_tenure_months: 24 },
    { tdi_license_number: 'TX-10007', agency_name: 'Apex Brokers', category: 'PERSONAL_AUTO', website: 'apex.com', founded_year: 1995, total_producers_count: 45, location_id: locations[2].id, ams_system: 'EZLynx', estimated_premium_volume: '$15M+', bus_factor_pct: 25.0, median_producer_tenure_months: 60 }
  ]).select()
  if (agErr) throw agErr;

  // 3. Carriers
  console.log("🛡️ Inserting carriers...")
  const { data: carriers, error: carErr } = await supabase.from('carriers').insert([
    { carrier_name: 'Travelers', am_best_rating: 'A++' },
    { carrier_name: 'Chubb', am_best_rating: 'A++' },
    { carrier_name: 'Nationwide', am_best_rating: 'A+' },
    { carrier_name: 'Liberty Mutual', am_best_rating: 'A' },
    { carrier_name: 'Hartford', am_best_rating: 'A+' }
  ]).select()
  if (carErr) throw carErr;

  // 4. Producers (Rainmakers & standard agents)
  console.log("💼 Inserting producers...")
  const { data: producers, error: proErr } = await supabase.from('producers').insert([
    { npn: '8839210', first_name: 'Marcus', last_name: 'Vance', current_agency_id: agencies[2].id, original_license_date: '2012-01-15', current_agency_start_date: '2024-06-01', active_appointments_count: 3 },
    { npn: '1234567', first_name: 'John', last_name: 'Doe', current_agency_id: null, original_license_date: '2010-05-20', current_agency_start_date: null, active_appointments_count: 2 },
    { npn: '445123', first_name: 'Sarah', last_name: 'Jenkins', current_agency_id: agencies[1].id, original_license_date: '2016-08-10', current_agency_start_date: '2024-05-15', active_appointments_count: 4 },
    { npn: '992812', first_name: 'David', last_name: 'Torres', current_agency_id: agencies[3].id, original_license_date: '2008-03-12', current_agency_start_date: '2024-06-05', active_appointments_count: 6 },
    { npn: '554321', first_name: 'Emily', last_name: 'Chen', current_agency_id: agencies[4].id, original_license_date: '2018-11-01', current_agency_start_date: '2024-06-08', active_appointments_count: 1 },
    { npn: '776543', first_name: 'Michael', last_name: 'Ross', current_agency_id: agencies[0].id, original_license_date: '2005-07-22', current_agency_start_date: '2024-06-12', active_appointments_count: 8 },
    { npn: '332211', first_name: 'Jessica', last_name: 'Pearson', current_agency_id: agencies[1].id, original_license_date: '2014-02-14', current_agency_start_date: '2024-06-14', active_appointments_count: 5 },
    // Anomaly Producers
    { npn: '1000001', first_name: 'Robert', last_name: 'Oppenheimer', current_agency_id: agencies[5].id, original_license_date: '2001-01-01', current_agency_start_date: '2024-06-15', active_appointments_count: 12 },
    { npn: '1000002', first_name: 'Grace', last_name: 'Hopper', current_agency_id: agencies[5].id, original_license_date: '2005-05-05', current_agency_start_date: '2024-06-15', active_appointments_count: 10 },
    { npn: '1000003', first_name: 'Alan', last_name: 'Turing', current_agency_id: agencies[5].id, original_license_date: '2010-10-10', current_agency_start_date: '2024-06-15', active_appointments_count: 8 },
    { npn: '1000004', first_name: 'Ada', last_name: 'Lovelace', current_agency_id: null, original_license_date: '2012-12-12', current_agency_start_date: null, active_appointments_count: 0 },
    { npn: '1000005', first_name: 'Nikola', last_name: 'Tesla', current_agency_id: null, original_license_date: '2008-08-08', current_agency_start_date: null, active_appointments_count: 0 }
  ]).select()
  if (proErr) throw proErr;

  // 5. Agency Carrier Appointments
  console.log("🤝 Inserting agency-carrier appointments...")
  const { error: acaErr } = await supabase.from('agency_carrier_appointments').insert([
    { agency_id: agencies[0].id, carrier_id: carriers[0].id, appointment_date: '2015-01-01', status: 'ACTIVE', is_top_carrier: true },
    { agency_id: agencies[0].id, carrier_id: carriers[1].id, appointment_date: '2016-01-01', status: 'ACTIVE', is_top_carrier: false },
    { agency_id: agencies[1].id, carrier_id: carriers[3].id, appointment_date: '2010-01-01', status: 'ACTIVE', is_top_carrier: true },
    { agency_id: agencies[1].id, carrier_id: carriers[0].id, appointment_date: '2012-01-01', status: 'ACTIVE', is_top_carrier: false },
    { agency_id: agencies[3].id, carrier_id: carriers[3].id, appointment_date: '2015-01-01', status: 'ACTIVE', is_top_carrier: true },
    { agency_id: agencies[3].id, carrier_id: carriers[0].id, appointment_date: '2016-01-01', status: 'ACTIVE', is_top_carrier: false },
    { agency_id: agencies[4].id, carrier_id: carriers[3].id, appointment_date: '2011-01-01', status: 'ACTIVE', is_top_carrier: true }
  ])
  if (acaErr) throw acaErr;

  // 6. Producer Carrier Appointments (The "Spear")
  console.log("🏹 Inserting producer-carrier appointments...")
  const { error: pcaErr } = await supabase.from('producer_carrier_appointments').insert([
    { producer_id: producers[0].id, carrier_id: carriers[0].id, appointment_date: '2024-06-02', status: 'ACTIVE' },
    { producer_id: producers[0].id, carrier_id: carriers[1].id, appointment_date: '2024-06-02', status: 'ACTIVE' },
    { producer_id: producers[2].id, carrier_id: carriers[3].id, appointment_date: '2024-05-16', status: 'ACTIVE' }
  ])
  if (pcaErr) throw pcaErr;

  // 7. SaaS Users and Watchlists
  console.log("👤 Inserting SaaS users and watchlists...")
  const { data: users, error: userErr } = await supabase.from('users').upsert([
    { email: 'principal@agencyforte.com', password_hash: 'mock_hashed_pw', phone_number: '+15550199', home_agency_id: agencies[1].id }
  ], { onConflict: 'email' }).select()
  if (userErr && userErr.code !== '23505') throw userErr;

  const { error: wlErr } = await supabase.from('user_watchlists').insert([
    { user_id: users[0].id, agency_id: agencies[0].id, alert_min_tenure_years: 5 }, // Watching Goosehead
    { user_id: users[0].id, agency_id: agencies[1].id, alert_min_tenure_years: 2 }  // Watching Higginbotham
  ])
  if (wlErr) throw wlErr;

  // 8. Producer Movements (The Tripwires: Exits & Hires)
  console.log("🚨 Inserting producer movement events...")
  const { error: movErr } = await supabase.from('producer_movements').insert([
    { producer_id: producers[0].id, from_agency_id: agencies[0].id, to_agency_id: agencies[2].id, movement_date: '2024-06-01', movement_type: 'EXITED', lines_affected: ['COMMERCIAL_P_C'] },
    { producer_id: producers[1].id, from_agency_id: agencies[0].id, to_agency_id: null, movement_date: '2024-06-10', movement_type: 'EXITED', lines_affected: ['PERSONAL_P_C'] },
    { producer_id: producers[2].id, from_agency_id: null, to_agency_id: agencies[1].id, movement_date: '2024-05-15', movement_type: 'HIRED', lines_affected: ['COMMERCIAL_P_C', 'BENEFITS'] },
    { producer_id: producers[3].id, from_agency_id: agencies[1].id, to_agency_id: agencies[3].id, movement_date: '2024-06-05', movement_type: 'EXITED', lines_affected: ['BENEFITS'] },
    { producer_id: producers[4].id, from_agency_id: agencies[0].id, to_agency_id: agencies[4].id, movement_date: '2024-06-08', movement_type: 'EXITED', lines_affected: ['PERSONAL_P_C'] },
    { producer_id: producers[5].id, from_agency_id: agencies[2].id, to_agency_id: agencies[0].id, movement_date: '2024-06-12', movement_type: 'HIRED', lines_affected: ['COMMERCIAL_P_C'] },
    { producer_id: producers[6].id, from_agency_id: agencies[3].id, to_agency_id: agencies[1].id, movement_date: '2024-06-14', movement_type: 'HIRED', lines_affected: ['PERSONAL_P_C'] },
    
    // Anomaly Events (Mass Acquisition by Titan, Mass Exodus from Apex)
    { producer_id: producers[7].id, from_agency_id: agencies[6].id, to_agency_id: agencies[5].id, movement_date: '2024-06-15', movement_type: 'HIRED', lines_affected: ['COMMERCIAL_P_C'] },
    { producer_id: producers[8].id, from_agency_id: agencies[6].id, to_agency_id: agencies[5].id, movement_date: '2024-06-15', movement_type: 'HIRED', lines_affected: ['COMMERCIAL_P_C'] },
    { producer_id: producers[9].id, from_agency_id: agencies[6].id, to_agency_id: agencies[5].id, movement_date: '2024-06-15', movement_type: 'HIRED', lines_affected: ['COMMERCIAL_P_C'] },
    { producer_id: producers[10].id, from_agency_id: agencies[6].id, to_agency_id: null, movement_date: '2024-06-16', movement_type: 'EXITED', lines_affected: ['PERSONAL_P_C'] },
    { producer_id: producers[11].id, from_agency_id: agencies[6].id, to_agency_id: null, movement_date: '2024-06-16', movement_type: 'EXITED', lines_affected: ['PERSONAL_P_C'] }
  ])
  if (movErr) throw movErr;

  // 9. Carrier Events (Mass Exits, Gained/Lost Authority)
  console.log("📉 Inserting carrier events...")
  const { error: ceErr } = await supabase.from('carrier_events').insert([
    { agency_id: agencies[0].id, carrier_id: carriers[2].id, event_type: 'APPOINTMENT_LOST', event_date: '2024-06-02', producers_affected_count: 4, notes: 'Lost Nationwide binding authority' },
    { agency_id: agencies[1].id, carrier_id: carriers[1].id, event_type: 'APPOINTMENT_GAINED', event_date: '2024-05-20', producers_affected_count: 12, notes: 'New Chubb appointment' },
    { agency_id: agencies[0].id, carrier_id: carriers[0].id, event_type: 'MASS_TERMINATION', event_date: '2024-06-05', producers_affected_count: 8, notes: 'Travelers closed agency code due to loss ratio' },
    { agency_id: agencies[1].id, carrier_id: carriers[4].id, event_type: 'APPOINTMENT_LOST', event_date: '2024-06-11', producers_affected_count: 2, notes: 'Hartford appointment revoked' },
    { agency_id: agencies[6].id, carrier_id: carriers[3].id, event_type: 'MASS_TERMINATION', event_date: '2024-06-15', producers_affected_count: 45, notes: 'Liberty Mutual completely pulled out of Apex Brokers' },
    { agency_id: agencies[5].id, carrier_id: carriers[0].id, event_type: 'APPOINTMENT_GAINED', event_date: '2024-06-16', producers_affected_count: 85, notes: 'Titan Insurance acquired major Travelers contract' }
  ])
  if (ceErr) throw ceErr;

  // 10. Refresh Materialized Views
  console.log("🔄 Refreshing dynamic competition materialized view...")
  const { error: rpcErr } = await supabase.rpc('refresh_competitor_view')
  if (rpcErr) throw rpcErr;

  console.log("✅ Successfully seeded mock data! The database is ready.")
}

seed().catch(err => {
  console.error("❌ Seeding failed:", err)
})
