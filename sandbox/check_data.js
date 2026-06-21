import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "http://127.0.0.1:54321"
const supabaseAnonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function check() {
  const { data: users, error } = await supabase.from('users').select('*');
  console.log("Users:", users);
  console.log("Error:", error);
}

check();
