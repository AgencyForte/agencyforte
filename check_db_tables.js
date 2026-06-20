import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseAnonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkDb() {
  console.log('--- CHECKING DATABASE TABLES ---');

  const { count: agenciesCount } = await supabase.from('agencies').select('*', { count: 'exact', head: true });
  const { count: relsCount } = await supabase.from('competitor_relationships').select('*', { count: 'exact', head: true });
  const { count: moveCount } = await supabase.from('producer_movements').select('*', { count: 'exact', head: true });
  const { count: apptCount } = await supabase.from('agency_carrier_appointments').select('*', { count: 'exact', head: true });

  console.log(`Agencies: ${agenciesCount}`);
  console.log(`Competitor Relationships: ${relsCount}`);
  console.log(`Producer Movements: ${moveCount}`);
  console.log(`Agency Appointments: ${apptCount}`);
  
  if (moveCount > 0) {
     const { data } = await supabase.from('producer_movements').select('*').limit(1);
     console.log('Sample Movement:', data[0]);
  }
}

checkDb().catch(console.error);
