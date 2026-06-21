import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
);

async function removeMocks() {
  const mockNPNs = [
    'TX-10001', 'TX-10002', 'TX-10003', 'TX-10004', 'TX-10005', 'TX-10006', 'TX-10007'
  ];

  console.log('Removing mock agencies from the database...');
  
  // Also remove their competitors and relationships first
  const { data: mockAgencies } = await supabase.from('agencies').select('id').in('tdi_license_number', mockNPNs);
  if (mockAgencies && mockAgencies.length > 0) {
    const mockIds = mockAgencies.map(a => a.id);
    await supabase.from('competitor_relationships').delete().in('base_agency_id', mockIds);
    await supabase.from('competitor_relationships').delete().in('competitor_agency_id', mockIds);
    await supabase.from('user_watchlists').delete().in('agency_id', mockIds);
  }

  const { error } = await supabase.from('agencies').delete().in('tdi_license_number', mockNPNs);
  if (error) {
    console.error('Error deleting mock agencies:', error);
  } else {
    console.log('Successfully removed all mock agencies.');
  }
}

removeMocks().catch(console.error);
