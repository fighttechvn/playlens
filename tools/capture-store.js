// Chrome Web Store screenshots: exactly 1280x800.
// shot 1: search page with side panel open
// shot 2: same page, panel closed (overlay badges + inline lines)
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/trunghieuvn/Projects/fighttech-vibe/luna-intro/node_modules/playwright');

const EXT = '/Users/trunghieuvn/Projects/fighttech-vibe/play-list-info';
const OUT_DIR = path.join(EXT, 'store');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'en-US',
  });
  await page.goto('https://play.google.com/store/search?q=record%20screen&c=apps&hl=en&gl=US', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(3000);

  await page.addStyleTag({ content: fs.readFileSync(path.join(EXT, 'styles.css'), 'utf8') });
  // addScriptTag is blocked by Play's Trusted Types CSP; evaluate() goes via CDP
  await page.evaluate(fs.readFileSync(path.join(EXT, 'content.js'), 'utf8'));

  await page.waitForFunction(
    () => document.querySelectorAll('.plsi-badge:not(.plsi-loading)').length >= 8,
    { timeout: 45000 }
  );
  await page.waitForTimeout(2000);

  // shot 2 first (panel closed)
  await page.screenshot({ path: path.join(OUT_DIR, 'screenshot-2-cards.png') });

  // open the side panel -> shot 1
  await page.evaluate(() => document.querySelector('.plsi-fab')?.click());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT_DIR, 'screenshot-1-panel.png') });

  console.log('saved store screenshots');
  await browser.close();
})();
