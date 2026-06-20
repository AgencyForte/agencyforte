import fs from 'fs';
import csv from 'csv-parser';

const RELATIONSHIPS_FILE = 'day_1/Business_relationships_between_agents__agencies__adjusters__and_insurance_companies.csv';
const APPOINTMENTS_FILE = 'day_1/Active_insurance_company_appointments_for_agencies_and_businesses.csv';

const producerCounts = new Map(); 
const validHeadcountNpns = new Set();
const agencyDetails = new Map(); 

async function extractICPs() {
  await new Promise((resolve, reject) => {
    fs.createReadStream(RELATIONSHIPS_FILE)
      .pipe(csv())
      .on('data', (row) => {
        const agencyNpn = row['Licensee NPN'];
        const producerNpn = row['Associated licensee NPN'];
        
        if (agencyNpn && producerNpn) {
          if (!producerCounts.has(agencyNpn)) {
            producerCounts.set(agencyNpn, new Set());
          }
          producerCounts.get(agencyNpn).add(producerNpn);
        }
      })
      .on('end', () => {
        for (const [agencyNpn, producers] of producerCounts.entries()) {
          if (producers.size >= 7 && producers.size <= 30) {
            validHeadcountNpns.add(agencyNpn);
          }
        }
        console.log(`Agencies passing Headcount Filter (7-30): ${validHeadcountNpns.size}`);
        resolve();
      })
      .on('error', reject);
  });

  let matchCount = 0;
  await new Promise((resolve, reject) => {
    fs.createReadStream(APPOINTMENTS_FILE)
      .pipe(csv())
      .on('data', (row) => {
        const agencyNpn = row['Agency NPN'];
        
        if (validHeadcountNpns.has(agencyNpn)) {
          matchCount++;
          if (!agencyDetails.has(agencyNpn)) {
            agencyDetails.set(agencyNpn, {
              npn: agencyNpn,
              name: row['Agency name'],
              city: row['City'],
              state: row['State']
            });
          }
        }
      })
      .on('end', () => {
        console.log(`Rows matching the 91 valid NPNs in Appointments CSV: ${matchCount}`);
        console.log(`Total unique agencies mapped from Appointments: ${agencyDetails.size}`);
        
        // Print cities of those mapped
        const cities = Array.from(agencyDetails.values()).map(a => a.city);
        console.log("Cities of these agencies:", Array.from(new Set(cities)).slice(0, 20));
        resolve();
      })
      .on('error', reject);
  });
}

extractICPs().catch(console.error);
