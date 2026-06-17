import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"

const supabase = createClient(supabaseUrl, supabaseKey)

async function testFetch() {
  console.log("Fetching agencies...")
  const { data: globalAgencies, error: err1 } = await supabase.from('agencies').select('id, agency_name, total_producers_count, location:locations(msa)').limit(20)
  if (err1) console.error("Error fetching agencies:", err1)
  console.log("Global Agencies Count:", globalAgencies?.length)
  if (!globalAgencies || globalAgencies.length === 0) return;

  const globalAgencyIds = globalAgencies.map(a => a.id)
  const quotedIds = globalAgencyIds.map(id => `"${id}"`).join(',')
  
  console.log("Fetching movements...")
  const { data: globalMovements, error: err2 } = await supabase
    .from('producer_movements')
    .select(`
      id, movement_date, movement_type, lines_affected,
      from_agency_id, to_agency_id,
      producer:producers(npn, first_name, last_name, original_license_date, active_appointments_count),
      from_agency:agencies!from_agency_id(agency_name),
      to_agency:agencies!to_agency_id(agency_name)
    `)
    .or(`from_agency_id.in.(${quotedIds}),to_agency_id.in.(${quotedIds})`)
    .order('movement_date', { ascending: false })
    
  if (err2) console.error("Error fetching movements:", err2)
  console.log("Global Movements Count:", globalMovements?.length)
  if (globalMovements?.length > 0) {
    console.log("Sample movement:", JSON.stringify(globalMovements[0], null, 2))
  }

  console.log("Fetching events...")
  const { data: globalEvents, error: err3 } = await supabase
    .from('carrier_events')
    .select(`
      id, event_date, event_type, producers_affected_count, notes,
      agency_id,
      carrier:carriers(carrier_name)
    `)
    .in('agency_id', globalAgencyIds)
    .order('event_date', { ascending: false })

  if (err3) console.error("Error fetching events:", err3)
  console.log("Global Events Count:", globalEvents?.length)
}

testFetch()
