// Blog posts: feature guides. Every claim here is taken from README.md / the
// extension's own labels — if a feature changes, change it here too.
const DATE = 'October 1, 2026';

const fig = (src, alt, cap) =>
  `<figure><img src="../assets/${src}" alt="${alt}" loading="lazy" width="1280" height="800" /><figcaption>${cap}</figcaption></figure>`;

const posts = [
  {
    slug: 'see-exact-installs-on-google-play',
    kicker: 'Basics',
    title: 'How to see exact installs on Google Play',
    desc: 'Google Play shows installs as buckets like 10M+. Here is how to read the exact number, the app age and installs per day for every app on a list page.',
    image: 'screenshot-2-cards.png',
    read: 5,
    sections: [
      {
        id: 'bucket',
        h: 'Why Play only shows “10M+”',
        html: `<p>Every app page on Google Play shows its installs as a bucket: 1M+, 10M+, 50M+. An app with 10.2 million installs and one with 49 million both read <strong>10M+</strong> if they sit in the same bucket, which makes the number almost useless for comparing two apps.</p>
<p>The exact figure is still in the page. Play's own data block for each app carries it, and the extension reads it for you.</p>`,
      },
      {
        id: 'install',
        h: 'Turn it on',
        html: `<ol>
<li>Install PlayLens from the <a href="https://chromewebstore.google.com/detail/playlens-%E2%80%93-app-stats-for/hnhlkgnfbcijmnaaclpliogmmnflekko">Chrome Web Store</a> (free).</li>
<li>Open any Google Play list page: a search, a developer page, a category or a collection.</li>
<li>Under each app's rating a short info line appears. No clicking through to each app.</li>
</ol>
${fig('screenshot-2-cards.png', 'Google Play search results with PlayLens info lines under each card', 'Search results for “focus timer”: rank, exact installs, rating count, update date and age under every card.')}`,
      },
      {
        id: 'read',
        h: 'Reading the info line',
        html: `<p>A line looks like <code>#2 ⬇49.2M · 813K rv</code>, followed by <code>⟳ Sep 23, 2026</code> and <code>12y old · ~11.1K/day</code>.</p>
<div class="tablewrap"><table>
<tr><th>Part</th><th>Meaning</th></tr>
<tr><td><code>#2</code></td><td>Position on a search result page, following the cards as they stand on screen.</td></tr>
<tr><td><code>⬇49.2M</code></td><td>Exact installs instead of Play's bucket. You can switch it off to see the bucket again.</td></tr>
<tr><td><code>813K rv</code></td><td>Number of ratings, read from the app page, so it is not rounded the way the card rounds it.</td></tr>
<tr><td><code>⟳ Sep 23, 2026</code></td><td>Last update. Green within 6 months, amber within 18 months, red when older.</td></tr>
<tr><td><code>12y old · ~11.1K/day</code></td><td>App age and average installs per day since launch.</td></tr>
</table></div>
<p>Apps released in the last 30 days are set in bold on a tint, and those under a year old in colour, so a new entrant stands out in a long list.</p>`,
      },
      {
        id: 'perday',
        h: 'Two kinds of “installs per day”',
        html: `<p>The figure on the card is an <strong>average over the app's whole life</strong>: installs divided by days since release. It is a fair way to compare apps of different ages, but a ten-year-old app that peaked years ago will look healthier than it is today.</p>
<p>For the current trend, star an app to add it to your Watchlist. PlayLens keeps one snapshot a day and measures real growth from those snapshots. That figure needs at least two days of data, so it appears from the second day on. See <a href="watchlist-competitor-monitoring.html">the Watchlist guide</a>.</p>
<div class="callout"><p><strong>Not revenue.</strong> Revenue can't be read from public pages, so PlayLens does not estimate it. Treat installs per day as a size and momentum signal only.</p></div>`,
      },
      {
        id: 'export',
        h: 'Get the list into a spreadsheet',
        html: `<p>Open the side panel with the button on the right edge of the page. The <strong>This page</strong> tab lists every app on the page. Click a header to sort, <strong>Columns</strong> to choose what to show, <strong>Filter</strong> to narrow by installs, rating, age or freshness, and <strong>Export</strong> to copy the table or download CSV or JSON with all fields.</p>
${fig('screenshot-1-panel.png', 'PlayLens side panel with a sortable table of apps', 'The side panel: a sortable table with a summary of the first ten results and an Open / Contested / Crowded verdict.')}`,
      },
    ],
    faq: [
      ['Does it work on developer pages and collections?', 'Yes. Any page that shows a grid or row of app cards: search, developer pages, categories, collections, “Similar apps” and the Play home page.'],
      ['Do I need an account?', 'No. There is no account and no analytics. Requests go straight to play.google.com and what is stored stays on your device.'],
    ],
    related: ['watchlist-competitor-monitoring', 'google-play-keyword-research'],
  },

  {
    slug: 'google-play-keyword-research',
    kicker: 'Keywords',
    title: 'Google Play keyword research with an opportunity score',
    desc: 'Turn Play’s own search suggestions into a ranked list. How the Open, Contested and Crowded verdict is calculated, and how to use it on real ideas.',
    image: 'screenshot-5-keywords.png',
    read: 7,
    sections: [
      {
        id: 'idea',
        h: 'What the Keywords tab does',
        html: `<p>Type a word and PlayLens asks Google Play for the search suggestions it already shows people typing. Each suggestion is a real query. Optionally it repeats the request with each letter a–z appended, which surfaces long-tail terms you would not think of.</p>
<p>It then reads the first ten results of a term and gives a verdict: <strong>Open</strong>, <strong>Contested</strong> or <strong>Crowded</strong>.</p>
${fig('screenshot-5-keywords.png', 'Keywords tab with scored search suggestions', 'The Keywords tab with the first ten terms scored.')}`,
      },
      {
        id: 'steps',
        h: 'Run it',
        html: `<ol>
<li>Open any Google Play page and open the side panel (button on the right edge).</li>
<li>Go to <strong>Keywords</strong>, type a seed word and press Enter.</li>
<li>Click <strong>Score first 10</strong>. PlayLens reads the top results of each of the first ten terms. Requests are limited to a few at a time, so it takes a moment.</li>
<li>Sort by score. Use <strong>Copy</strong> or <strong>CSV</strong> to take the list with you.</li>
</ol>
<p>Beyond the first ten, a single <strong>Score</strong> button on each row scores that term on its own.</p>`,
      },
      {
        id: 'formula',
        h: 'How the score is calculated',
        html: `<p>The score uses the first ten results of the term:</p>
<div class="tablewrap"><table>
<tr><th>Part</th><th>Weight</th><th>What it looks at</th></tr>
<tr><td>Demand</td><td>0.35</td><td>Combined installs of the ten results, on a log scale</td></tr>
<tr><td>Monetization</td><td>0.30</td><td>Share of results with in-app purchases, weighted by how high their purchases go</td></tr>
<tr><td>Competition</td><td>0.25</td><td>Fewer entrenched results is better: an entrenched app has 10M+ installs and a rating of 4.3 or more</td></tr>
<tr><td>Weakness</td><td>0.10</td><td>Share of results rated below 4.0 or not updated for 18 months</td></tr>
</table></div>
<p>A score of <strong>60 or more is Open</strong>, <strong>45 to 59 Contested</strong>, and below that <strong>Crowded</strong>.</p>
<div class="callout warn"><p><strong>It sorts ideas, it does not predict.</strong> A term marked Open can still be a bad market. Use the score to decide which terms to look at first, then look at them.</p></div>`,
      },
      {
        id: 'read',
        h: 'Reading the results',
        html: `<ul>
<li><strong>Open and specific</strong> is the sweet spot: the top apps are old or weak and the term has enough demand.</li>
<li><strong>Crowded but monetized</strong> means the money is real but so is the competition. Only worth it with a clear angle.</li>
<li><strong>“too few”</strong> means fewer than five results came back, so there is nothing to score.</li>
</ul>
<p>Check the summary above the table on a search page too. It shows total and median installs, median age and rating, the share with purchases or ads, and the share not updated for 18 months for the first ten results.</p>`,
      },
      {
        id: 'pro',
        h: 'Free and Pro',
        html: `<p>Free scores the first ten terms of a list. <a href="../index.html#pricing">Pro</a> scores without that limit with <strong>Score all</strong>, saves up to 20 lists of keywords, and compares one term across countries. A <strong>Track</strong> button puts any term straight into the <a href="track-keyword-rankings-google-play.html">rank tracker</a> for an app on your Watchlist.</p>`,
      },
    ],
    faq: [
      ['Is this search volume?', 'No. Google does not publish search volume for Play. The score reads what the top results look like, which is a proxy for demand and competition, not a count of searches.'],
      ['Which countries does it use?', 'The countries set in the settings page, up to 8, defaulting to US, GB, DE, JP and VN.'],
    ],
    related: ['track-keyword-rankings-google-play', 'see-exact-installs-on-google-play'],
  },

  {
    slug: 'track-keyword-rankings-google-play',
    kicker: 'Pro',
    title: 'Track your Google Play keyword rankings every day',
    desc: 'Follow where an app ranks for a keyword in any country. The tracker checks once a day in the background, keeps 90 days and can notify you when a rank moves.',
    image: 'screenshot-4-watchlist.png',
    read: 6,
    sections: [
      {
        id: 'what',
        h: 'What the rank tracker does',
        html: `<p>For an app on your Watchlist you choose a keyword and a country. Once a day the extension's background worker searches Google Play for that term in that country, finds where the app appears, and writes down the position. Over time the positions are drawn as a history, so you see whether last week's update helped.</p>
<p>A position of <strong>0 means “not among the first 30 results”</strong>. The tracker looks at the first 30, not the whole list.</p>`,
      },
      {
        id: 'setup',
        h: 'Set it up',
        html: `<ol>
<li><strong>Star the app.</strong> Click ☆ on its row in the side panel. The tracker works on apps in your Watchlist.</li>
<li><strong>Open its details</strong> with <strong>More</strong> and find the <strong>Rank tracker</strong> section.</li>
<li><strong>Type a keyword</strong> in “Keyword to follow”, pick a country and click <strong>Follow</strong>. PlayLens looks it up right away and says “Now at #…” or that it is not in the first 30.</li>
<li>Or from the <strong>Keywords</strong> tab, click <strong>Track</strong> on any suggested term while an app is chosen.</li>
<li><strong>Check now</strong> refreshes today's place of every keyword on demand. Otherwise it runs by itself once a day.</li>
</ol>
${fig('screenshot-4-watchlist.png', 'Watchlist tab with starred apps', 'The Watchlist tab: the apps you follow and what changed since you last looked.')}`,
      },
      {
        id: 'limits',
        h: 'Free and Pro limits',
        html: `<div class="tablewrap"><table>
<tr><th></th><th>Free</th><th>Pro</th></tr>
<tr><td>Keyword and country pairs</td><td>3</td><td>150</td></tr>
<tr><td>Alerts</td><td>—</td><td>Desktop notifications</td></tr>
</table></div>
<p>The panel shows “<em>N of M followed</em>” so you always know how many pairs you have left. The three free pairs are enough to follow your one most important keyword in a few countries.</p>`,
      },
      {
        id: 'alerts',
        h: 'Alerts',
        html: `<p>With Pro you can switch on <strong>Alerts</strong> in the settings page. Chrome then asks for the optional <code>notifications</code> permission. The permission is requested only when you switch alerts on, and users who stay on Free never see it. An alert fires when a followed keyword moves, or when a watched app changes version, price or rating.</p>`,
      },
      {
        id: 'private',
        h: 'Where the data lives',
        html: `<p>Positions are stored in your browser's local storage under the app's id, up to 90 days each. Nothing is uploaded. Make a copy any time with <strong>Backup</strong> in the Export menu (Pro), and load it back with <strong>Restore</strong>.</p>
<div class="callout"><p>The checks are plain searches on play.google.com, the same ones you could do by hand. A result list can differ a little between runs and between accounts, so read a one-place move as noise and look at the trend.</p></div>`,
      },
    ],
    faq: [
      ['Does it work when Chrome is closed?', 'No. The daily check runs in the browser’s background worker, so Chrome must be running. A day with no check is a gap in the line, not a lost history.'],
      ['Will it slow my browser?', 'No. It makes a handful of requests once a day, only for pairs you follow, and nothing while the Watchlist is empty.'],
    ],
    related: ['watchlist-competitor-monitoring', 'google-play-keyword-research'],
  },

  {
    slug: 'watchlist-competitor-monitoring',
    kicker: 'Monitoring',
    title: 'Monitor competitors with the PlayLens Watchlist',
    desc: 'Star an app and PlayLens notes version, name, price and rating changes and measures real installs per day. How to read it, report on it and back it up.',
    image: 'screenshot-4-watchlist.png',
    read: 6,
    sections: [
      {
        id: 'star',
        h: 'Follow an app',
        html: `<p>Click ☆ next to an app in the side panel (or in its details). It joins the <strong>Watchlist</strong> tab. From then on PlayLens remembers its numbers and tells you what changed since you last looked: <strong>version, name, price and rating</strong>.</p>
${fig('screenshot-4-watchlist.png', 'The Watchlist tab', 'Five apps starred from a search page.')}`,
      },
      {
        id: 'growth',
        h: 'Measured growth, not an average',
        html: `<p>Each day you browse, PlayLens saves one snapshot of every app it saw (history is on by default and can be switched off). From two snapshots on it can show installs per day measured over that time, which is more honest about a current trend than the lifetime average on the cards.</p>
<p>It needs at least two daily snapshots, so a newly followed app shows the measured figure from day two.</p>`,
      },
      {
        id: 'bg',
        h: 'Background refresh',
        html: `<p>About every six hours the background worker re-reads the pages of the apps on your Watchlist and puts the number of changed apps on the toolbar icon. Nothing is requested while the list is empty, and you can turn it off with the <code>bgRefresh</code> setting.</p>`,
      },
      {
        id: 'compare',
        h: 'Compare apps side by side',
        html: `<p>Click ⇄ on any row to add the app to a comparison, then <strong>Compare</strong> in the panel's toolbar. Free compares 2 apps in a table. Pro compares up to 6 and adds history charts of installs and ratings.</p>
<p>The charts use colours that stay distinct for colour-blind readers, and each line also has its own dash pattern and marker, a legend, a tooltip and a data table.</p>`,
      },
      {
        id: 'report',
        h: 'Report and backup (Pro)',
        html: `<ul>
<li><strong>Report HTML / Report MD</strong> — one file of what moved in the Watchlist over 7, 30 or 90 days. Handy to paste into a weekly update.</li>
<li><strong>Backup</strong> — everything recorded on the device (watchlist, daily numbers, ranks) as a JSON file. <strong>Restore</strong> loads a PlayLens backup, skipping entries it cannot read.</li>
</ul>
<p>These sit in the <strong>Export</strong> menu.</p>`,
      },
    ],
    faq: [
      ['How many apps can I follow?', 'There is no cap on the Watchlist itself. Pro limits apply to the rank tracker pairs and to how many apps you compare at once.'],
      ['Reviewer names?', 'Never collected. The review viewer leaves reviewer names out on purpose.'],
    ],
    related: ['track-keyword-rankings-google-play', 'read-low-star-reviews-google-play'],
  },

  {
    slug: 'read-low-star-reviews-google-play',
    kicker: 'Research',
    title: 'Find what users hate: reading low-star reviews on Google Play',
    desc: 'The latest 1 to 3 star reviews of any app, the words that come up most, and an export you can filter by stars and date. Without reviewer names.',
    image: 'screenshot-3-details.png',
    read: 5,
    sections: [
      {
        id: 'why',
        h: 'Why low-star reviews',
        html: `<p>Five-star reviews say “nice”. One- to three-star reviews say what is missing, what broke and what people would pay to have fixed. For a competitor that is a ready-made list of features you could do better.</p>`,
      },
      {
        id: 'open',
        h: 'Open them',
        html: `<ol>
<li>In the side panel, open an app's details with <strong>More</strong>.</li>
<li>Click <strong>Low-star reviews</strong>. The newest 1–3★ reviews load, and <strong>More</strong> reads the next batch.</li>
<li>Above the list, a few chips show the words that come up most, with how many of the reviews mention each.</li>
</ol>
${fig('screenshot-3-details.png', 'App details drawer with ratings, listing and screenshots', 'The details drawer: exact installs, the 1–5★ spread with the share of 1–2★, price, data safety, developer contact and screenshots.')}`,
      },
      {
        id: 'export',
        h: 'Export',
        html: `<p><strong>Export CSV</strong> or <strong>Export JSON</strong> reads the reviews and saves them, filtered by stars and date. <strong>Stop</strong> ends the read early and saves what is already there. Reviewer names are left out on purpose.</p>`,
      },
      {
        id: 'details',
        h: 'Also in the details drawer',
        html: `<ul>
<li>Exact installs next to Play's bucket, release date, and installs per day since launch and measured.</li>
<li>Ratings per install, and the spread of 1–5★ with the share of 1–2★.</li>
<li>Price, in-app purchases and ads, category, version, minimum Android, data safety labels.</li>
<li>Developer email and website with a copy button, and links to AppBrain, APKMirror and the App Store.</li>
<li><strong>Compare countries</strong>: rating and prices per country, one request each, only when you ask.</li>
</ul>`,
      },
    ],
    faq: [
      ['Where do the reviews come from?', 'From the same endpoint the Play site itself calls. They are requested only when you click, never in the background.'],
    ],
    related: ['watchlist-competitor-monitoring', 'see-exact-installs-on-google-play'],
  },

  {
    slug: 'playlens-pro-polar-licence',
    kicker: 'Pro',
    title: 'PlayLens Pro: what it adds and how the licence works',
    desc: 'Everything on the cards stays free. Pro adds the rank tracker, alerts, charts, reports, backups and saved keyword lists. How buying and activating a key works.',
    image: 'screenshot-1-panel.png',
    read: 5,
    sections: [
      {
        id: 'free',
        h: 'What stays free',
        html: `<p>Everything you see on the cards, the side panel, the Watchlist, reviews, keyword ideas, country comparison, developer portfolio summary and the CSV and JSON exports is free, with no time limit and no account. Pro does not take any of that away.</p>`,
      },
      {
        id: 'pro',
        h: 'What Pro adds',
        html: `<p>Pro covers what takes time to build up or runs in the background.</p>
<div class="tablewrap"><table>
<tr><th>Feature</th><th>Free</th><th>Pro</th></tr>
<tr><td><a href="track-keyword-rankings-google-play.html">Rank tracker</a></td><td>3 pairs</td><td>150 pairs, 90 days</td></tr>
<tr><td>Alerts</td><td>—</td><td>Desktop notifications</td></tr>
<tr><td>Compare apps</td><td>2, no charts</td><td>Up to 6 with history charts</td></tr>
<tr><td>Watchlist report</td><td>—</td><td>HTML or Markdown</td></tr>
<tr><td>Backup and restore</td><td>—</td><td>Yes</td></tr>
<tr><td><a href="google-play-keyword-research.html">Keyword lists</a></td><td>First ten scored</td><td>Score all, 20 saved lists, opportunity by country</td></tr>
</table></div>`,
      },
      {
        id: 'buy',
        h: 'Buying and activating',
        html: `<ol>
<li>Choose a plan on the <a href="../index.html#pricing">pricing section</a>: monthly, yearly or lifetime.</li>
<li>Checkout is run by <a href="https://polar.sh">Polar</a>, the seller of record: it takes payment, handles tax and refunds, and emails you a licence key beginning with <code>PLAY-</code>.</li>
<li>Open the PlayLens settings page, paste the key and activate it. One key works on up to 3 of your browsers.</li>
</ol>
<div class="callout warn"><p><strong>Launching.</strong> Buying is not open yet. Until it is, the pricing section says “Coming soon”, the settings page says so too, and the extension sends nothing to Polar.</p></div>`,
      },
      {
        id: 'check',
        h: 'What the licence check sends',
        html: `<p>When you enter a key, it is sent to Polar (<code>api.polar.sh</code>) along with a label for your browser, and then about once a day while a key is stored. Nothing else leaves your browser. If you are offline, Pro keeps working for two weeks. If a key is revoked or refunded, Pro locks on the next check. The key is masked on the settings page, and <strong>Deactivate</strong> frees its device slot.</p>
<p>See the <a href="../privacy.html">privacy policy</a> for the full list.</p>`,
      },
      {
        id: 'honest',
        h: 'An honest note',
        html: `<p>PlayLens is open source under the MIT licence, and the check runs in your browser, so anyone can read how it works and change it. Pro is a convenience and a way to support the work, not copy protection.</p>`,
      },
    ],
    faq: [
      ['Can I move my licence to a new computer?', 'Yes. Deactivate it on the old browser in the settings page to free the slot, or free it from the Polar customer portal, then enter it on the new one.'],
    ],
    related: ['track-keyword-rankings-google-play', 'watchlist-competitor-monitoring'],
  },
];

module.exports = { posts, DATE };
