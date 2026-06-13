import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  console.log("URL:", process.env.VITE_SUPABASE_URL)
  console.log("KEY:", process.env.VITE_SUPABASE_ANON_KEY ? "Loaded (Starts with " + process.env.VITE_SUPABASE_ANON_KEY.substring(0, 10) + "...)" : "Missing")
  
  const { data: insertData, error: insertError } = await supabase
    .from('agency_directory')
    .insert([
      { agency_name: 'TEST_AGENCY', region: 'Dallas-Fort Worth', total_producers: 5 }
    ])
  
  if (insertError) {
    console.log('Insert Error:', insertError)
  } else {
    console.log('Insert Success')
  }

  const { count, error: selectError } = await supabase
    .from('agency_directory')
    .select('*', { count: 'exact', head: true })
  console.log('Select Error:', selectError)
  console.log('Agency Directory Count:', count)
}
test()
