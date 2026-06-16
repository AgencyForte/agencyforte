import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"

const supabase = createClient(supabaseUrl, supabaseKey)

async function clear() {
  console.log("🧹 Clearing existing data...")
  const tables = [
    'user_watchlists', 
    'producer_movements', 
    'carrier_events', 
    'producer_carrier_appointments', 
    'agency_carrier_appointments', 
    'producers', 
    'users', 
    'agencies', 
    'carriers', 
    'locations'
  ]
  
  for (const table of tables) {
    console.log(`Clearing ${table}...`)
    // Delete all rows by using a filter that is always true
    // Since IDs are uuids except where noted, we can just delete where id is not null
    const { error } = await supabase.from(table).delete().not('id', 'is', null)
    if (error) console.log(`Warning clearing ${table}:`, error.message)
  }
  console.log("✅ Cleared!")
}

clear().catch(console.error)
