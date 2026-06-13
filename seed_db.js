import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const mockAlerts = [
  // Goosehead Insurance
  { agency_name: 'Goosehead Insurance', event_type: 'defection', agent_name: 'Marcus Vance', agent_npn: '8839210', carrier_name: 'Travelers', new_agency: 'Willis Towers Watson', agent_tenure_years: 12, top_carriers: 'Travelers, Hartford, Chubb', is_read: false },
  { agency_name: 'Goosehead Insurance', event_type: 'defection', agent_name: 'John Doe', agent_npn: '1234567', carrier_name: 'Chubb', new_agency: 'Unknown', agent_tenure_years: 14, top_carriers: 'Chubb, AIG, Liberty Mutual', is_read: false },
  { agency_name: 'Goosehead Insurance', event_type: 'carrier_loss', carrier_name: 'NATIONWIDE', is_read: false },
  { agency_name: 'Goosehead Insurance', event_type: 'agency_termination', carrier_name: 'NATIONWIDE', is_read: false },
  
  // Higginbotham
  { agency_name: 'Higginbotham', event_type: 'hire', agent_name: 'Sarah Jenkins', agent_npn: '445123', carrier_name: 'Liberty Mutual', previous_agency: 'USI Insurance', agent_tenure_years: 8, top_carriers: 'Liberty Mutual, AIG, Hiscox', is_read: false },
  { agency_name: 'Higginbotham', event_type: 'hire', agent_name: 'Michael Bates', agent_npn: '998212', carrier_name: 'BCBS', previous_agency: 'Gallagher', agent_tenure_years: 3, top_carriers: 'BCBS, UnitedHealthcare', is_read: false },
  { agency_name: 'Higginbotham', event_type: 'hire', agent_name: 'Jessica Wong', agent_npn: '112344', carrier_name: 'Chubb', previous_agency: 'Marsh', agent_tenure_years: 5, top_carriers: 'Chubb, Travelers', is_read: false },
  { agency_name: 'Higginbotham', event_type: 'new_appt', carrier_name: 'CHUBB', is_read: false },
  { agency_name: 'Higginbotham', event_type: 'new_appt', carrier_name: 'HARTFORD', is_read: false }
]

async function seed() {
  console.log("Seeding tripwire_alerts...")
  const { data, error } = await supabase.from('tripwire_alerts').insert(mockAlerts)
  if (error) {
    console.error("Error seeding data:", error)
  } else {
    console.log("Successfully seeded mock data!")
  }
}

seed()
