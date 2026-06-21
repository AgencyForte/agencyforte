import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
);

async function patchMocks() {
  const updates = [
    { tdi: 'TX-10001', name: 'Mark Jones', npn: '111111' },
    { tdi: 'TX-10002', name: 'Rusty Reid', npn: '222222' },
    { tdi: 'TX-10003', name: 'Carl Hess', npn: '333333' },
    { tdi: 'TX-10004', name: 'Ron Lockton', npn: '444444' },
    { tdi: 'TX-10005', name: 'David Eslick', npn: '555555' },
    { tdi: 'TX-10006', name: 'Michael Titan', npn: '666666' },
    { tdi: 'TX-10007', name: 'Sarah Apex', npn: '777777' }
  ];

  for (const u of updates) {
    await supabase.from('agencies').update({
      owner_name: u.name,
      owner_npn: u.npn
    }).eq('tdi_license_number', u.tdi);
  }
  console.log("Mock agencies patched with Owners!");
}

patchMocks().catch(console.error);
