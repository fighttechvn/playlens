const { CWS, GH, esc, head, nav, footer } = require('./layout');
const { posts } = require('./posts');

const FAQ = [
  ['How do I see the download count of an app without opening it?', 'Install PlayLens and open any Google Play list page. The exact install count, rating, number of ratings, last-updated date and app age appear on each app card directly — no clicking through.'],
  ['Which Google Play pages does it work on?', 'Any page that shows a grid or row of app cards: developer pages, search results, category and collection pages, Similar apps, and the Play home page.'],
  ['Are the review counts exact?', 'Yes. Play’s own cards round to something like 824K. PlayLens reads the structured data on each app’s detail page, so you get 824.1K — the real figure, useful when comparing two apps that both round to the same number.'],
  ['Can I export the list to a spreadsheet?', 'Yes. Open the side panel and click Export — copy the table, or download it as CSV or JSON with every field, ready for Sheets or Excel.'],
  ['Is PlayLens free? What does Pro add?', 'Everything you see on the cards, the side panel, the watchlist, reviews, keyword ideas and exports is free. Pro adds a daily rank tracker with history, alerts, comparison charts, reports, backups and saved keyword lists.'],
  ['Does it collect or send my data anywhere?', 'No account, no analytics and no server of ours. PlayLens runs only on play.google.com, fetches the same public pages you could open yourself, and keeps what it stores on your device. The one exception is a Pro licence key, which is sent to Polar to check it is valid.'],
  ['Does it work in Edge, Brave or Opera?', 'Yes — it is a standard Manifest V3 extension, so any Chromium-based browser can load it.'],
];

const jsonld = () => `  <script type="application/ld+json">
  ${JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'PlayLens',
      alternateName: 'PlayLens – App Stats for Google Play',
      applicationCategory: 'BrowserApplication',
      applicationSubCategory: 'Chrome Extension',
      operatingSystem: 'Chrome, Edge, Brave, any Chromium browser',
      description: 'Chrome extension that shows exact installs, ratings, app age and last-updated dates for every app on Google Play list pages, with a side panel to compare, follow and export them.',
      url: 'https://fighttechvn.github.io/playlens/',
      installUrl: CWS,
      downloadUrl: CWS,
      screenshot: 'https://fighttechvn.github.io/playlens/assets/demo.png',
      softwareVersion: '2.1.0',
      license: 'https://opensource.org/licenses/MIT',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      author: { '@type': 'Organization', name: 'FightTech VN', url: 'https://github.com/fighttechvn' },
    },
    null,
    2
  ).replace(/\n/g, '\n  ')}
  </script>
  <script type="application/ld+json">
  ${JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
    null,
    2
  ).replace(/\n/g, '\n  ')}
  </script>
`;

function home() {
  const base = '';
  const teaser = posts.slice(0, 3);
  return (
    head({
      base,
      title: 'PlayLens — App Stats for Google Play',
      desc: 'Free Chrome extension showing exact installs, ratings, app age and last-updated dates on every app card in Google Play search, developer and collection lists.',
      path: '',
      extra: jsonld(),
    }) +
    nav(base, '') +
    `
<header class="hero">
  <div class="wrap">
    <span class="eyebrow">Chrome extension · open source</span>
    <h1>Every app's real numbers, <em>right on Google Play</em></h1>
    <p class="lead">Exact installs, ratings, app age and last-updated dates under every app card — in search, on developer pages and in collections. Then compare, follow and export them from one side panel.</p>
    <div class="cta-row">
      <a class="btn btn-primary btn-lg" href="${CWS}">Add to Chrome — it's free</a>
      <a class="btn btn-lg" href="blog/">Read the guides</a>
    </div>
    <ul class="trust">
      <li>On the Chrome Web Store</li>
      <li>MIT licensed</li>
      <li>No account, no tracking</li>
      <li>Data stays in your browser</li>
    </ul>
    <div class="frame">
      <div class="bar"><i></i><i></i><i></i><span>play.google.com/store/search?q=focus timer</span></div>
      <img src="assets/demo.png" width="2000" height="1120" alt="PlayLens on a Google Play search results page: rank, installs, ratings and update date under every app card, and the side panel with a summary and a sortable table" />
    </div>
  </div>
</header>

<section class="sec" aria-labelledby="h-card">
  <div class="wrap sample">
    <div class="sec-head">
      <span class="eyebrow">On every card</span>
      <h2 id="h-card">Play says “10M+”. PlayLens says 49.2M.</h2>
      <p>Play rounds installs into buckets, so two very different apps look the same. PlayLens reads the real figure from each app's page and adds age, growth and freshness, colour-coded so the stale ones stand out.</p>
      <p><a href="blog/see-exact-installs-on-google-play.html"><strong>How to read the info line →</strong></a></p>
    </div>
    <div class="sample-card" role="img" aria-label="Example of an info line under an app card: rank 2, 49.2 million installs, 813 thousand ratings, updated Sep 23 2026, 12 years old, about 11.1 thousand installs per day">
      <div class="row"><div class="ic"></div><div><b>Example app</b><div class="sub">Example developer · ★ 4.6</div></div></div>
      <div class="lines">
        <span><em>rank · installs</em>#2 ⬇49.2M · 813K rv</span>
        <span><em>last update</em><span class="fresh">⟳ Sep 23, 2026</span></span>
        <span><em>age · growth</em>12y old · ~11.1K/day</span>
        <span><em>for comparison</em><span class="stale">⟳ Jan 14, 2025</span></span>
      </div>
    </div>
  </div>
</section>

<section class="sec" id="features" aria-labelledby="h-feat">
  <div class="wrap">
    <div class="sec-head"><span class="eyebrow">Features</span><h2 id="h-feat">Research a market without opening forty tabs</h2><p>Everything below is free unless it is marked Pro.</p></div>
    <div class="feat">
      <div><span class="tag">Cards</span><h3>Numbers on every card</h3><p>Exact installs, number of ratings, update date by freshness, app age and installs per day, under each card's own rating.</p><a class="more" href="blog/see-exact-installs-on-google-play.html">Guide →</a></div>
      <div><span class="tag">Search</span><h3>Rank on search results</h3><p>Every result carries its position. The table and the exports keep it together with the search term.</p></div>
      <div><span class="tag">Panel</span><h3>Sortable side panel</h3><p>Every app on the page in a table: choose columns, filter by installs, rating, age or freshness, export CSV or JSON with all fields.</p></div>
      <div><span class="tag">Keywords</span><h3>Keyword ideas with a verdict</h3><p>Play's own suggestions for a word, each scored Open, Contested or Crowded from its first ten results.</p><a class="more" href="blog/google-play-keyword-research.html">Guide →</a></div>
      <div><span class="tag">Watchlist</span><h3>Follow competitors</h3><p>Star an app. PlayLens notes version, name, price and rating changes and measures installs per day from a daily record.</p><a class="more" href="blog/watchlist-competitor-monitoring.html">Guide →</a></div>
      <div><span class="tag">Reviews</span><h3>Low-star reviews</h3><p>The latest 1–3★ reviews with the words that come up most, exportable by stars and date. Reviewer names are left out.</p><a class="more" href="blog/read-low-star-reviews-google-play.html">Guide →</a></div>
      <div><span class="tag">Pro</span><h3>Daily rank tracker</h3><p>Follow keyword and country pairs, checked once a day in the background with 90 days of history.</p><a class="more" href="blog/track-keyword-rankings-google-play.html">Guide →</a></div>
      <div><span class="tag">Pro</span><h3>Compare with charts</h3><p>Up to 6 apps side by side, with installs and rating history drawn in colour-blind-safe charts.</p></div>
      <div><span class="tag">Pro</span><h3>Alerts, reports, backups</h3><p>Desktop notifications, a Watchlist report in HTML or Markdown, and a full backup you can restore.</p><a class="more" href="blog/playlens-pro-polar-licence.html">Guide →</a></div>
    </div>
  </div>
</section>

<section class="sec" aria-labelledby="h-how">
  <div class="wrap">
    <div class="sec-head"><span class="eyebrow">How it works</span><h2 id="h-how">Working in 30 seconds</h2></div>
    <ol class="steps">
      <li><h3>Install</h3><p>Add PlayLens from the Chrome Web Store. No sign-up, nothing to configure.</p></li>
      <li><h3>Open any Play list</h3><p>A search, a developer page or a collection. The numbers appear under every card.</p></li>
      <li><h3>Open the panel</h3><p>Sort, filter and export the list, star apps to follow them, score keywords.</p></li>
    </ol>
    <details class="faq" style="margin-top:28px"><summary style="cursor:pointer;color:var(--muted);font-size:14px">Or install it from the source</summary>
      <ol style="font-size:14.5px;color:var(--muted)">
        <li><a href="${GH}/releases/latest/download/playlens.zip">Download <code>playlens.zip</code></a> and unzip it.</li>
        <li>Open <code>chrome://extensions</code> and turn on <strong>Developer mode</strong>.</li>
        <li>Click <strong>Load unpacked</strong> and pick the unzipped folder.</li>
      </ol>
    </details>
  </div>
</section>

<section class="sec" aria-labelledby="h-use">
  <div class="wrap">
    <div class="sec-head"><span class="eyebrow">Use cases</span><h2 id="h-use">Who it is for</h2></div>
    <div class="uses">
      <div class="use"><h3>Indie developers choosing an idea</h3><p>See which search terms have weak, stale or small results before you build, and what the top apps charge.</p></div>
      <div class="use"><h3>ASO and growth teams</h3><p>Follow where your app ranks for the terms that matter, by country, and get told when it moves.</p></div>
      <div class="use"><h3>Product managers watching competitors</h3><p>Know when a rival ships a new version, changes price or starts losing rating, without checking by hand.</p></div>
      <div class="use"><h3>Researchers and analysts</h3><p>Export clean CSV or JSON of a whole list with 36 fields, ready for a spreadsheet.</p></div>
    </div>
  </div>
</section>

<section class="sec" id="pricing" aria-labelledby="h-price">
  <div class="wrap">
    <div class="sec-head center"><span class="eyebrow">Pricing</span><h2 id="h-price">Free for everything you see. Pro for what takes time.</h2></div>
    <div class="plans">
      <div class="plan">
        <h3>Free</h3>
        <p class="price">$0, no account, no time limit</p>
        <ul>
          <li>Exact installs, ratings, age and update date on every card</li>
          <li>Side panel, filters, CSV and JSON export</li>
          <li>Watchlist with change detection and measured growth</li>
          <li>Low-star reviews, keyword ideas, country comparison, developer pages</li>
          <li>Follow 3 keywords by country in the rank tracker</li>
          <li>Compare 2 apps side by side</li>
        </ul>
        <p style="margin:auto 0 0;padding-top:22px"><a class="btn" style="width:100%" href="${CWS}">Add to Chrome</a></p>
      </div>
      <div class="plan pro">
        <span class="badge">Pro</span>
        <h3>Pro</h3>
        <p class="price">Billed and taxed by Polar · cancel any time</p>
        <ul>
          <li>Rank tracker: 150 keyword and country pairs <small>Checked once a day in the background, with 90 days of history.</small></li>
          <li>Alerts when a keyword moves or a watched app changes <small>Desktop notifications, asked for only when you switch them on.</small></li>
          <li>Compare up to 6 apps with history charts</li>
          <li>Watchlist report as HTML or Markdown</li>
          <li>Backup and restore of your watchlist, history and ranks</li>
          <li>Saved keyword lists, “Score all”, opportunity by country</li>
        </ul>
        <div class="tiers" id="tiers">
          <a class="tier" data-plan="monthly" aria-disabled="true"><span>Monthly</span><strong>$4.99</strong><em>Coming soon</em></a>
          <a class="tier" data-plan="yearly" aria-disabled="true"><span>Yearly</span><strong>$39</strong><em>Coming soon</em><span class="tag">Save 35%</span></a>
          <a class="tier" data-plan="lifetime" aria-disabled="true"><span>Lifetime</span><strong>$89</strong><em>Coming soon</em></a>
        </div>
        <p class="fine">You get a licence key by email. Paste it in the PlayLens settings; it works on up to 3 of your browsers. Prices in USD.</p>
      </div>
    </div>
    <p class="fine" style="text-align:center;max-width:70ch;margin:20px auto 0">PlayLens stays open source (MIT). Pro is a convenience and a way to support the work, not copy protection. The key is checked with Polar about once a day and nothing else leaves your browser — see the <a href="privacy.html">privacy policy</a> and <a href="blog/playlens-pro-polar-licence.html">how the licence works</a>.</p>
  </div>
</section>

<section class="sec" aria-labelledby="h-blog">
  <div class="wrap">
    <div class="sec-head"><span class="eyebrow">Guides</span><h2 id="h-blog">Learn each feature</h2><p>Short, practical walkthroughs with real screenshots.</p></div>
    <div class="cards">
${teaser
  .map(
    (p) => `      <a class="pcard" href="blog/${p.slug}.html"><img src="assets/${p.image}" alt="" loading="lazy" width="1280" height="800" /><div class="b"><span class="k">${esc(p.kicker)}</span><h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p><span class="m">${p.read} min read</span></div></a>`
  )
  .join('\n')}
    </div>
    <p style="margin-top:22px"><a href="blog/"><strong>All guides →</strong></a></p>
  </div>
</section>

<section class="sec" id="faq" aria-labelledby="h-faq">
  <div class="wrap">
    <div class="sec-head"><span class="eyebrow">FAQ</span><h2 id="h-faq">Questions</h2></div>
    <div class="faq">
${FAQ.map(([q, a]) => `      <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2>See the real numbers behind every Play listing</h2>
    <p>Free, open source, and nothing to sign up for.</p>
    <a class="btn btn-primary btn-lg" href="${CWS}">Add to Chrome — it's free</a>
  </div>
</section>

<script>
  // Fill these in once the Polar checkout links exist (Polar → Products →
  // Checkout Links). While a value is empty its button stays "Coming soon".
  var CHECKOUT = { monthly: '', yearly: '', lifetime: '' };
  document.querySelectorAll('#tiers .tier').forEach(function (a) {
    var url = CHECKOUT[a.getAttribute('data-plan')];
    if (!/^https:\\/\\/(buy|sandbox-buy)\\.polar\\.sh\\//.test(url || '')) return;
    a.href = url;
    a.removeAttribute('aria-disabled');
    a.querySelector('em').textContent = 'Buy now';
  });
</script>
` +
    footer(base)
  );
}

module.exports = { home };
