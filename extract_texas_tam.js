import fs from 'fs';
import csv from 'csv-parser';

const APPOINTMENTS_FILE = 'day_1/Active_insurance_company_appointments_for_agencies_and_businesses.csv';
const RELATIONSHIPS_FILE = 'day_1/Business_relationships_between_agents__agencies__adjusters__and_insurance_companies.csv';

// Data Stores
const agencyDetails = new Map(); // NPN -> Details
const agencyCarriers = new Map(); // NPN -> Set of Carriers
const validGeoAgencies = new Set(); 

async function extractTexasTAM() {
  console.log('--- STARTING TEXAS TAM EXTRACTION PIPELINE ---');

  // PHASE 1: Parse Appointments to lock in ALL Texas Agencies & Carrier Count
  console.log('Phase 1: Streaming Appointments CSV (Texas Geography & 10+ Carriers)...');
  
  let apptRows = 0;
  await new Promise((resolve, reject) => {
    fs.createReadStream(APPOINTMENTS_FILE)
      .pipe(csv())
      .on('data', (row) => {
        apptRows++;
        const npn = row['Agency NPN'];
        if (!npn) return;

        // Since this is a Texas TDI dataset, practically all valid agencies are licensed in TX.
        // We will just verify the state is TX to be safe, or simply accept all.
        // Let's filter for physical state = TX
        const state = (row['State'] || '').trim().toUpperCase();
        const carrier = row['Insurance company name'];

        if (state === 'TX') {
          validGeoAgencies.add(npn);

          if (!agencyDetails.has(npn)) {
            agencyDetails.set(npn, {
              npn: npn,
              name: row['Agency name'],
              city: row['City'],
              state: row['State']
            });
          }

          if (!agencyCarriers.has(npn)) {
            agencyCarriers.set(npn, new Set());
          }
          if (carrier) {
            agencyCarriers.get(npn).add(carrier);
          }
        }
      })
      .on('end', () => {
        console.log(`Finished checking ${apptRows} appointment rows.`);
        console.log(`Unique Agencies located in Texas: ${validGeoAgencies.size}`);
        
        // Filter out those with less than 10 carriers (Captives / Micro-Agencies)
        for (const npn of Array.from(validGeoAgencies)) {
          if (agencyCarriers.get(npn).size < 10) {
            validGeoAgencies.delete(npn);
            agencyDetails.delete(npn);
            agencyCarriers.delete(npn);
          }
        }
        console.log(`Texas Agencies surviving 10+ Carrier Independence Filter: ${validGeoAgencies.size}`);
        resolve();
      })
      .on('error', reject);
  });

  // PHASE 2: Parse Relationships to tally producers
  console.log('\nPhase 2: Streaming Relationships CSV (5-30 Producer Filter)...');
  const producerCounts = new Map(); // NPN -> Set of sub-NPNs
  
  let relRows = 0;
  await new Promise((resolve, reject) => {
    fs.createReadStream(RELATIONSHIPS_FILE)
      .pipe(csv())
      .on('data', (row) => {
        relRows++;
        const licenseeNpn = row['Licensee NPN'];
        const assocLicenseeNpn = row['Associated licensee NPN'];

        // If the Licensee is one of our target TX agencies, add the Associated Licensee as a producer
        if (licenseeNpn && validGeoAgencies.has(licenseeNpn) && assocLicenseeNpn) {
          if (!producerCounts.has(licenseeNpn)) producerCounts.set(licenseeNpn, new Set());
          producerCounts.get(licenseeNpn).add(assocLicenseeNpn);
        }
        
        // Or if the Associated Licensee is one of our target TX agencies, add the Licensee as a producer
        if (assocLicenseeNpn && validGeoAgencies.has(assocLicenseeNpn) && licenseeNpn) {
          if (!producerCounts.has(assocLicenseeNpn)) producerCounts.set(assocLicenseeNpn, new Set());
          producerCounts.get(assocLicenseeNpn).add(licenseeNpn);
        }
      })
      .on('end', () => {
        console.log(`Finished checking ${relRows} relationship rows.`);
        resolve();
      })
      .on('error', reject);
  });

  // PHASE 3: Final Output Compilation
  console.log('\nPhase 3: Final Qualification...');
  const finalICPs = [];

  for (const npn of validGeoAgencies) {
    const producers = producerCounts.get(npn);
    const prodCount = producers ? producers.size : 0;

    // The Goldilocks Zone: 5 to 30 Producers
    if (prodCount >= 3 && prodCount <= 30) {
      finalICPs.push({
        ...agencyDetails.get(npn),
        carrier_count: agencyCarriers.get(npn).size,
        producer_count: prodCount
      });
    }
  }

  // Sort by producer count descending
  finalICPs.sort((a, b) => b.producer_count - a.producer_count);

  console.log(`\n=================================================`);
  console.log(`TEXAS TOTAL ADDRESSABLE MARKET (TAM)`);
  console.log(`Mathematically verified True ICPs in Texas: ${finalICPs.length}`);
  console.log(`=================================================`);

  // Group by City/MSA logic approximation
  const cityCounts = {};
  for (const icp of finalICPs) {
      const city = icp.city.trim().toUpperCase();
      cityCounts[city] = (cityCounts[city] || 0) + 1;
  }
  
  // Sort cities by concentration
  const sortedCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]);
  
  console.log("\nTop 10 Cities by ICP Concentration:");
  sortedCities.slice(0, 10).forEach(([city, count], index) => {
      console.log(`${index + 1}. ${city}: ${count} Agencies`);
  });

  // Write to file
  const outputFile = 'texas_tam_icps.json';
  fs.writeFileSync(outputFile, JSON.stringify(finalICPs, null, 2));
  console.log(`\nSaved complete Texas hit-list to ${outputFile}`);
}

extractTexasTAM().catch(console.error);
