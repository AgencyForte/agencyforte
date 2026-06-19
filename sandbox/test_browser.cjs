const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));

  await page.goto('http://localhost:5173');
  
  // Wait for it to load
  await page.waitForTimeout(2000);
  
  // Click on the PRODUCERS tab
  console.log('Clicking PRODUCERS tab...');
  await page.click('text=TALENT REGISTRY');
  
  await page.waitForTimeout(2000);
  
  await browser.close();
})();
