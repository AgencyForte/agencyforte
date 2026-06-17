import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, anonKey)

async function testAnon() {
  console.log("Fetching agencies with ANON key...")
  const { data: globalAgencies, error: err1 } = await supabase.from('agencies').select('id, agency_name').limit(20)
  if (err1) console.error("Error fetching agencies:", err1)
  console.log("Anon Global Agencies Count:", globalAgencies?.length)

  const globalAgencyIds = globalAgencies?.map(a => a.id) || []
  const quotedIds = globalAgencyIds.map(id => `"${id}"`).join(',')

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
  console.log("Anon Global Movements Count:", globalMovements?.length)
  if (globalMovements?.length > 0) {
    console.log("Anon Movements:", JSON.stringify(globalMovements[0], null, 2))
  }
}

testAnon()
