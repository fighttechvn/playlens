// Builds the static site in docs/: landing page, blog, privacy page, sitemap.
// Run: node tools/build-site.js   (docs/ is what GitHub Pages serves)
const fs = require('fs');
const path = require('path');
const { SITE, CWS, esc, head, nav, footer } = require('./site/layout');
const { posts, DATE } = require('./site/posts');
const { home } = require('./site/home');

const DOCS = path.join(__dirname, '..', 'docs');
const write = (rel, text) => {
  const f = path.join(DOCS, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};

const card = (p, base = '') =>
  `<a class="pcard" href="${base}${p.slug}.html"><img src="${base ? '' : '../'}assets/${p.image}" alt="" loading="lazy" width="1280" height="800" /><div class="b"><span class="k">${esc(p.kicker)}</span><h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p><span class="m">${p.read} min read</span></div></a>`;

function postPage(p) {
  const base = '../';
  const url = SITE + 'blog/' + p.slug + '.html';
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: p.title,
      description: p.desc,
      image: SITE + 'assets/' + p.image,
      datePublished: '2026-10-01',
      dateModified: '2026-10-01',
      author: { '@type': 'Organization', name: 'FightTech VN' },
      publisher: { '@type': 'Organization', name: 'FightTech VN' },
      mainEntityOfPage: url,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'PlayLens', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: SITE + 'blog/' },
        { '@type': 'ListItem', position: 3, name: p.title, item: url },
      ],
    },
  ];
  if (p.faq && p.faq.length)
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    });
  const extra = ld.map((o) => `  <script type="application/ld+json">${JSON.stringify(o)}</script>\n`).join('');
  const rel = (p.related || []).map((s) => posts.find((x) => x.slug === s)).filter(Boolean);
  return (
    head({ base, title: p.title + ' — PlayLens', desc: p.desc, path: 'blog/' + p.slug + '.html', image: 'assets/' + p.image, type: 'article', extra }) +
    nav(base, 'blog') +
    `
<div class="wrap">
  <div class="crumbs"><a href="${base}">Home</a> / <a href="./">Guides</a> / ${esc(p.title)}</div>
  <header class="post-head">
    <span class="eyebrow">${esc(p.kicker)}</span>
    <h1 style="margin-top:14px">${esc(p.title)}</h1>
    <p class="lede">${esc(p.desc)}</p>
    <div class="meta"><span>FightTech VN</span><span>Updated ${DATE}</span><span>${p.read} min read</span></div>
  </header>
  <div class="post-grid">
    <aside class="toc" aria-label="On this page"><h4>On this page</h4><ol>
${p.sections.map((s) => `      <li><a href="#${s.id}">${esc(s.h)}</a></li>`).join('\n')}${p.faq && p.faq.length ? '\n      <li><a href="#faq">Questions</a></li>' : ''}
    </ol></aside>
    <article class="prose">
${p.sections.map((s) => `<h2 id="${s.id}">${esc(s.h)}</h2>\n${s.html}`).join('\n')}
${
  p.faq && p.faq.length
    ? `<h2 id="faq">Questions</h2>\n` + p.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n')
    : ''
}
      <div class="cta-box">
        <h3>Try it on a real Play page</h3>
        <p>PlayLens is free, open source and needs no account.</p>
        <a class="btn btn-primary" href="${CWS}">Add to Chrome</a>
      </div>
    </article>
  </div>
  ${
    rel.length
      ? `<section class="related"><h2>Keep reading</h2><div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">${rel.map((r) => card(r)).join('')}</div></section>`
      : ''
  }
</div>
` +
    footer(base)
  );
}

function blogIndex() {
  const base = '../';
  return (
    head({
      base,
      title: 'Guides — PlayLens',
      desc: 'Step-by-step guides to PlayLens: exact installs, keyword research, rank tracking, competitor monitoring and low-star reviews on Google Play.',
      path: 'blog/',
    }) +
    nav(base, 'blog') +
    `
<div class="wrap">
  <header class="page-head">
    <span class="eyebrow">Guides</span>
    <h1>Learn PlayLens, one feature at a time</h1>
    <p>Practical walkthroughs for researching apps and keywords on Google Play, with the real screens.</p>
  </header>
  <div class="cards" style="margin-bottom:24px">
${posts.map((p) => card(p)).join('\n')}
  </div>
</div>
` +
    footer(base)
  );
}

function privacy() {
  const base = '';
  const body = fs.readFileSync(path.join(__dirname, 'site', 'privacy.body.html'), 'utf8');
  return (
    head({
      base,
      title: 'Privacy policy — PlayLens',
      desc: 'Privacy policy for the PlayLens Chrome extension. No data collection, no tracking, everything stays in your browser.',
      path: 'privacy.html',
    }) +
    nav(base, '') +
    `
<main class="wrap narrow plain">
${body}
</main>
` +
    footer(base)
  );
}

write('index.html', home());
write('blog/index.html', blogIndex());
posts.forEach((p) => write('blog/' + p.slug + '.html', postPage(p)));
write('privacy.html', privacy());
const urls = ['', 'blog/', ...posts.map((p) => 'blog/' + p.slug + '.html'), 'privacy.html'];
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>2026-10-01</lastmod></url>`).join('\n') +
    `\n</urlset>\n`
);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);
console.log('built', 2 + posts.length + 1, 'pages');
