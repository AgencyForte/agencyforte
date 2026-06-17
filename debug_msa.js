import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, anonKey)

async function testMsa() {
  const { data: globalAgencies, error } = await supabase.from('agencies').select('id, agency_name, location:locations(msa)').limit(20)
  if (error) console.error(error)
  console.log(JSON.stringify(globalAgencies, null, 2))
}

testMsa()
