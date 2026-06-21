const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'day_1/Active_insurance_company_appointments_for_agencies_and_businesses.csv',
  'day_2/Active_insurance_company_appointments_for_agencies_and_businesses.csv'
];

const replacements = {
  'Home State County Mutual Insurance Company': 'Travelers Property Casualty Company of America',
  'Old American County Mutual Fire Insurance Company': 'Liberty Mutual Insurance Company',
  'Consumers County Mutual Insurance Company': 'The Hartford Fire Insurance Company',
  'Mendota Insurance Company': 'CNA Financial Corporation',
  'Elephant Insurance Company': 'Chubb National Insurance Company',
  'Gainsco County Mutual Insurance Company': 'Zurich American Insurance Company'
};

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`Processing ${filePath}...`);
    let content = fs.readFileSync(filePath, 'utf8');
    
    for (const [oldCarrier, newCarrier] of Object.entries(replacements)) {
      const regex = new RegExp(oldCarrier, 'g');
      const count = (content.match(regex) || []).length;
      if (count > 0) {
        content = content.replace(regex, newCarrier);
        console.log(`  Replaced ${count} instances of ${oldCarrier} with ${newCarrier}`);
      }
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Saved ${filePath}.`);
  } else {
    console.log(`File not found: ${filePath}`);
  }
});

console.log('Carrier replacement complete!');
