// Render icon.svg -> icons/icon{16,32,48,128}.png (transparent background)
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/trunghieuvn/Projects/fighttech-vibe/luna-intro/node_modules/playwright');

const SVG = path.join(__dirname, 'icon.svg');
const OUT_DIR = '/Users/trunghieuvn/Projects/fighttech-vibe/play-list-info/icons';

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const svg = fs.readFileSync(SVG, 'utf8');
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const scaled = svg.replace('width="128" height="128"', `width="${size}" height="${size}"`);
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${scaled}`
    );
    await page.screenshot({ path: path.join(OUT_DIR, `icon${size}.png`), omitBackground: true });
    await page.close();
    console.log('icon' + size + '.png');
  }
  await browser.close();
})();
