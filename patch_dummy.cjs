const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') || f.endsWith('.cjs'));

let updated = 0;
for (const file of files) {
  const filepath = path.join(__dirname, file);
  let content = fs.readFileSync(filepath, 'utf8');
  if (content.includes(".not('id', 'is', null)")) {
    content = content.split(".not('id', 'is', null)").join(".not('id', 'is', null)");
    fs.writeFileSync(filepath, content);
    console.log(`Updated ${file}`);
    updated++;
  }
}
console.log(`Total files updated: ${updated}`);
