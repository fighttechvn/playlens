// Chrome Web Store screenshots: exactly 1280x800, taken from the real extension
// loaded unpacked, on a live Google Play search page.
// shot 1: search page with the side panel open
// shot 2: same page, panel closed (rank chip + info lines under each card)
// shot 3: details of one app (ratings, listing, screenshots)
// shot 4: the Watchlist tab
// shot 5: the Keywords tab with the first ten terms scored
// plus docs/assets/demo.png (2000x1120) for the landing page and the READMEs
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('/Users/trunghieuvn/Projects/fighttech-vibe/luna-intro/node_modules/playwright');

const EXT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(EXT, 'store');
const QUERY = 'focus timer';

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // a fresh profile each time, so the shots show the default settings
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'playlens-shots-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', // extensions need the full browser, headless included
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'light',
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT],
  });
  const shot = (name) => page.screenshot({ path: path.join(OUT_DIR, name) });
  const page = await ctx.newPage();
  await page.goto('https://play.google.com/store/search?q=' + encodeURIComponent(QUERY) + '&c=apps&hl=en&gl=US', {
    waitUntil: 'commit',
    timeout: 60000,
  });
  await page.waitForSelector('.plsi-fab', { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const lines = document.querySelectorAll('.plsi-inline');
      return lines.length >= 8 && !document.querySelector('.plsi-inline.plsi-loading');
    },
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(3000); // Play redraws the cards once after first paint

  await shot('screenshot-2-cards.png');

  await page.click('.plsi-fab');
  const panel = page.locator('.plsi-panel');
  await page.waitForFunction(
    () => /Open|Contested|Crowded/.test(document.querySelector('.plsi-panel .plsi-summary')?.textContent || ''),
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(800);
  await shot('screenshot-1-panel.png');

  const rows = panel.locator('tbody tr');
  await rows.nth(1).locator('.plsi-more').click();
  await page.waitForSelector('.plsi-drawer .plsi-shots img', { timeout: 30000 });
  await page.waitForTimeout(2500); // store screenshots load from Play's image host
  await shot('screenshot-3-details.png');
  await rows.nth(1).locator('.plsi-more').click();

  for (const i of [0, 1, 2, 3, 4]) await rows.nth(i).locator('.plsi-star').click();
  await panel.locator('.plsi-tab', { hasText: 'Watchlist' }).click();
  await page.waitForTimeout(1500);
  await shot('screenshot-4-watchlist.png');

  await panel.locator('.plsi-tab', { hasText: 'Keywords' }).click();
  await panel.locator('.plsi-kw-form .plsi-input').press('Enter');
  await page.waitForSelector('.plsi-kw-row', { timeout: 30000 });
  await panel.getByRole('button', { name: 'Score first 10', exact: true }).click();
  await page.waitForFunction(
    () => {
      const first = [...document.querySelectorAll('.plsi-kw-row')].slice(0, 10);
      return first.length > 0 && first.every((r) => /Open|Contested|Crowded|too few|failed/.test(r.textContent));
    },
    null,
    { timeout: 240000 }
  );
  await page.waitForTimeout(500);
  await shot('screenshot-5-keywords.png');

  await panel.locator('.plsi-tab', { hasText: 'This page' }).click();
  await page.setViewportSize({ width: 2000, height: 1120 });
  await page.waitForTimeout(4000); // the grid reflows and Play redraws the cards
  await page.waitForFunction(() => !document.querySelector('.plsi-inline.plsi-loading'), null, { timeout: 60000 });
  await page.screenshot({ path: path.join(EXT, 'docs', 'assets', 'demo.png') });

  console.log('saved store screenshots');
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
