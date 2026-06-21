import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseAnonKey = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function deleteMocks() {
  console.log('--- DELETING MOCK AGENCIES ---');

  // 1. Get mock agency IDs
  const { data: mockAgencies } = await supabase.from('agencies').select('id').like('tdi_license_number', 'TX-%');
  const mockIds = mockAgencies ? mockAgencies.map(a => a.id) : [];

  // 1.5 Get mock producer IDs explicitly
  const mockProducerNPNs = [
    '8839210', '1234567', '445123', '992812', '554321', '776543', '332211',
    '1000001', '1000002', '1000003', '1000004', '1000005'
  ];
  const { data: mockProducers } = await supabase.from('producers').select('id').in('npn', mockProducerNPNs);
  const mockProdIds = mockProducers ? mockProducers.map(p => p.id) : [];

  // 2. Delete dependencies
  await supabase.from('producer_carrier_appointments').delete().not('id', 'is', null); // Wipe all mock producer carrier appts
  if (mockIds.length > 0) {
    await supabase.from('producer_movements').delete().in('from_agency_id', mockIds); 
    await supabase.from('producer_movements').delete().in('to_agency_id', mockIds); 
    await supabase.from('agency_carrier_appointments').delete().in('agency_id', mockIds); 
    await supabase.from('user_watchlists').delete().in('agency_id', mockIds);
    await supabase.from('users').delete().in('home_agency_id', mockIds);
    await supabase.from('carrier_events').delete().in('agency_id', mockIds);
  }

  if (mockProdIds.length > 0) {
    await supabase.from('producer_movements').delete().in('producer_id', mockProdIds);
    await supabase.from('tracked_producers').delete().in('producer_id', mockProdIds);
    await supabase.from('producers').delete().in('id', mockProdIds);
  }

  // 3. Delete mock agencies
  if (mockIds.length > 0) {
    const { error } = await supabase.from('agencies').delete().in('id', mockIds);
    if (error) console.error('Delete Error:', error);
    else console.log('Deleted mock agencies successfully.');
  }

  const { data: countData } = await supabase.from('agencies').select('id, agency_name, tdi_license_number');
  console.log(`Remaining valid agencies in DB: ${countData.length}`);
}

deleteMocks().catch(console.error);
