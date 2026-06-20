import fs from 'fs';
import csv from 'csv-parser';

const DFW_CITIES = new Set([
  'DALLAS', 'FORT WORTH', 'ARLINGTON', 'PLANO', 'IRVING', 'GARLAND',
  'FRISCO', 'MCKINNEY', 'GRAND PRAIRIE', 'DENTON', 'MESQUITE', 'CARROLLTON',
  'RICHARDSON', 'LEWISVILLE', 'ALLEN', 'FLOWER MOUND', 'MANSFIELD', 'EULESS',
  'DESOTO', 'GRAPEVINE', 'BEDFORD', 'CEDAR HILL', 'WYLIE', 'KELLER', 'BURLESON',
  'HALTOM CITY', 'ROCKWALL', 'THE COLONY', 'CLEBURNE', 'COPPELL', 'SOUTHLAKE',
  'FARMERS BRANCH', 'MIDLOTHIAN', 'HURST', 'LANCASTER', 'WEATHERFORD', 'WAXAHACHIE',
  'COLLEYVILLE', 'LITTLE ELM', 'FORNEY', 'CORSICANA', 'MURPHY', 'PROSPER', 'ROYSE CITY'
]);

const APPOINTMENTS_FILE = 'day_1/Active_insurance_company_appointments_for_agencies_and_businesses.csv';
const RELATIONSHIPS_FILE = 'day_1/Business_relationships_between_agents__agencies__adjusters__and_insurance_companies.csv';

// Data Stores
const agencyDetails = new Map(); 
const agencyCarriers = new Map(); 
const validGeoAgencies = new Set(); 

async function buildMatrix() {
  console.log('--- STARTING PHASE 2: COMPETITOR MATRIX ENGINE ---');

  // STEP 1: Rebuild the DFW Independent Agency Pool
  console.log('Building the master DFW Independent Agency pool...');
  await new Promise((resolve, reject) => {
    fs.createReadStream(APPOINTMENTS_FILE)
      .pipe(csv())
      .on('data', (row) => {
        const npn = row['Agency NPN'];
        if (!npn) return;
        const city = (row['City'] || '').trim().toUpperCase();
        const carrier = row['Insurance company name'];

        if (DFW_CITIES.has(city)) {
          validGeoAgencies.add(npn);
          if (!agencyDetails.has(npn)) {
            agencyDetails.set(npn, {
              npn: npn,
              name: row['Agency name'],
              city: city, // Storing normalized city
              state: row['State']
            });
          }
          if (!agencyCarriers.has(npn)) agencyCarriers.set(npn, new Set());
          if (carrier) agencyCarriers.get(npn).add(carrier);
        }
      })
      .on('end', () => {
        // Filter out Captives (< 10 carriers)
        for (const npn of Array.from(validGeoAgencies)) {
          if (agencyCarriers.get(npn).size < 10) {
            validGeoAgencies.delete(npn);
            agencyDetails.delete(npn);
            agencyCarriers.delete(npn);
          }
        }
        console.log(`Pool established: ${validGeoAgencies.size} DFW Independent Agencies.`);
        resolve();
      })
      .on('error', reject);
  });

  // STEP 2: Calculate scale (producer count) for all agencies in the pool
  console.log('Calculating producer headcounts for the entire pool...');
  const producerCounts = new Map(); 
  await new Promise((resolve, reject) => {
    fs.createReadStream(RELATIONSHIPS_FILE)
      .pipe(csv())
      .on('data', (row) => {
        const licenseeNpn = row['Licensee NPN'];
        const assocLicenseeNpn = row['Associated licensee NPN'];

        if (licenseeNpn && validGeoAgencies.has(licenseeNpn) && assocLicenseeNpn) {
          if (!producerCounts.has(licenseeNpn)) producerCounts.set(licenseeNpn, new Set());
          producerCounts.get(licenseeNpn).add(assocLicenseeNpn);
        }
        
        if (assocLicenseeNpn && validGeoAgencies.has(assocLicenseeNpn) && licenseeNpn) {
          if (!producerCounts.has(assocLicenseeNpn)) producerCounts.set(assocLicenseeNpn, new Set());
          producerCounts.get(assocLicenseeNpn).add(licenseeNpn);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // STEP 3: Identify the 258 ICPs
  const icpNPNs = new Set();
  const fullPool = [];

  for (const npn of validGeoAgencies) {
    const pCount = producerCounts.has(npn) ? producerCounts.get(npn).size : 0;
    const details = agencyDetails.get(npn);
    const carriers = Array.from(agencyCarriers.get(npn)); // Convert to array for output
    
    const agencyObj = {
      ...details,
      producer_count: pCount,
      carrier_count: carriers.length,
      carriers: carriers
    };
    
    fullPool.push(agencyObj);

    if (pCount >= 3 && pCount <= 30) {
      icpNPNs.add(npn);
    }
  }

  console.log(`Verified ${icpNPNs.size} target ICPs out of the pool.`);

  // STEP 4: The Matrix Engine (Score every pool agency against every ICP)
  console.log('Executing the 3-Vector Matrix scoring engine...');
  const finalOutput = [];

  for (const icpNpn of icpNPNs) {
    const icp = fullPool.find(a => a.npn === icpNpn);
    const scoredCompetitors = [];
    const icpCarriersSet = agencyCarriers.get(icpNpn);

    for (const comp of fullPool) {
      if (comp.npn === icpNpn) continue; // Don't score against yourself

      let score = 0;
      let sharedCarriers = 0;

      // Vector 1: Carrier Overlap (+10 per shared carrier)
      const compCarriersSet = agencyCarriers.get(comp.npn);
      for (const carrier of compCarriersSet) {
        if (icpCarriersSet.has(carrier)) {
          sharedCarriers++;
        }
      }
      score += (sharedCarriers * 10);

      // Vector 2: Scale Parity (+20 if within +/- 3 producers)
      if (Math.abs(icp.producer_count - comp.producer_count) <= 3) {
        score += 20;
      }

      // Vector 3: Micro-Geography (+15 if same city)
      if (icp.city === comp.city) {
        score += 15;
      }

      scoredCompetitors.push({
        npn: comp.npn,
        name: comp.name,
        city: comp.city,
        producer_count: comp.producer_count,
        carrier_count: comp.carrier_count,
        shared_carriers: sharedCarriers,
        fit_score: score
      });
    }

    // Sort competitors from highest threat to lowest
    scoredCompetitors.sort((a, b) => b.fit_score - a.fit_score);

    finalOutput.push({
      icp_details: {
        npn: icp.npn,
        name: icp.name,
        city: icp.city,
        producer_count: icp.producer_count,
        carrier_count: icp.carrier_count
      },
      competitors: scoredCompetitors
    });
  }

  // Sort final output by ICP producer count descending
  finalOutput.sort((a, b) => b.icp_details.producer_count - a.icp_details.producer_count);

  console.log('\n=================================================');
  console.log(`MATRIX COMPLETE: Calculated ${finalOutput.length} ICPs.`);
  console.log(`Each ICP has a ranked list of ${fullPool.length - 1} competitors.`);
  console.log('=================================================');

  // Preview the #1 Competitor for the Top ICP
  if (finalOutput.length > 0) {
    const topIcp = finalOutput[0];
    const topThreat = topIcp.competitors[0];
    console.log(`\nExample Matchup:`);
    console.log(`[ICP] ${topIcp.icp_details.name} (${topIcp.icp_details.city}, ${topIcp.icp_details.producer_count} Producers)`);
    console.log(`[#1 Threat] ${topThreat.name} (${topThreat.city}, ${topThreat.producer_count} Producers)`);
    console.log(`Threat Score: ${topThreat.fit_score} (${topThreat.shared_carriers} shared carriers)`);
  }

  // Write to massive JSON file
  const outputFile = 'icp_competitor_matrix.json';
  // We won't pretty-print the massive array to save disk space, or maybe stringify with 2 spaces is fine.
  // Actually, full JSON will be about 258 * 1862 * 100 bytes = ~48MB. We'll stringify normally.
  fs.writeFileSync(outputFile, JSON.stringify(finalOutput, null, 2));
  console.log(`\nSaved entire relationship matrix to ${outputFile}`);
}

buildMatrix().catch(console.error);
