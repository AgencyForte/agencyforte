import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  console.log("URL:", process.env.VITE_SUPABASE_URL)
  console.log("KEY:", process.env.VITE_SUPABASE_ANON_KEY ? "Loaded (Starts with " + process.env.VITE_SUPABASE_ANON_KEY.substring(0, 10) + "...)" : "Missing")
  
  const { data, error, count } = await supabase
    .from('agency_directory')
    .select('*', { count: 'exact', head: true })
  
  if (error) {
    console.log('Error:', error)
  } else {
    console.log('Agency Directory Count:', count)
  }
}
test()
