// Shared page chrome for the landing page and the blog. `base` is the path
// back to docs/ ('' from the root, '../' from docs/blog/).
const SITE = 'https://fighttechvn.github.io/playlens/';
const CWS = 'https://chromewebstore.google.com/detail/playlens-%E2%80%93-app-stats-for/hnhlkgnfbcijmnaaclpliogmmnflekko';
const GH = 'https://github.com/fighttechvn/playlens';
const FONTS =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="13.5" cy="13.5" r="9" fill="none" stroke="currentColor" stroke-width="3"/><path d="M11 9.8v7.4l6.2-3.7z" fill="var(--accent)"/><path d="m20.5 20.5 7 7" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>`;

function head({ base, title, desc, path, image, type = 'website', extra = '' }) {
  const url = SITE + path;
  const img = SITE + (image || 'assets/demo.png');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${url}" />
  <meta name="author" content="FightTech VN" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:type" content="${type}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:site_name" content="PlayLens" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${img}" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔎</text></svg>" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="${FONTS}" />
  <link rel="stylesheet" href="${base}site.css" />
${extra}</head>
<body>`;
}

function nav(base, current) {
  const l = (href, label, key) => `<a href="${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="nav" aria-label="Main">
  <div class="wrap">
    <a class="brand" href="${base || './'}">${LOGO}PlayLens</a>
    <div class="links">
      ${l(base + 'index.html#features', 'Features', 'f')}
      ${l(base + 'index.html#pricing', 'Pricing', 'p')}
      ${l(base + 'blog/', 'Blog', 'blog')}
      ${l(base + 'index.html#faq', 'FAQ', 'q')}
      ${l(GH, 'GitHub', 'g')}
    </div>
    <a class="btn btn-primary btn-sm" href="${CWS}">Add to Chrome</a>
  </div>
</nav>`;
}

function footer(base) {
  return `<footer class="foot">
  <div class="wrap">
    <div class="cols">
      <div>
        <a class="brand" href="${base || './'}">${LOGO}PlayLens</a>
        <p class="about">Open-source Chrome extension for Google Play research. No account, no analytics, no servers of our own.</p>
      </div>
      <div><h4>Product</h4><ul>
        <li><a href="${base}index.html#features">Features</a></li>
        <li><a href="${base}index.html#pricing">Pricing</a></li>
        <li><a href="${CWS}">Chrome Web Store</a></li>
        <li><a href="${GH}/releases/latest/download/playlens.zip">Download the zip</a></li>
      </ul></div>
      <div><h4>Guides</h4><ul>
        <li><a href="${base}blog/">All guides</a></li>
        <li><a href="${base}blog/see-exact-installs-on-google-play.html">Exact installs</a></li>
        <li><a href="${base}blog/google-play-keyword-research.html">Keyword research</a></li>
        <li><a href="${base}blog/track-keyword-rankings-google-play.html">Rank tracking</a></li>
      </ul></div>
      <div><h4>Project</h4><ul>
        <li><a href="${GH}">Source code</a></li>
        <li><a href="${GH}/issues">Report an issue</a></li>
        <li><a href="${base}privacy.html">Privacy policy</a></li>
        <li><a href="https://github.com/fighttechvn">FightTech VN</a></li>
      </ul></div>
    </div>
    <p class="legal">PlayLens is MIT licensed. It is an independent project, not affiliated with, endorsed by or sponsored by Google. Google Play is a trademark of Google&nbsp;LLC. © 2026 FightTech VN.</p>
  </div>
</footer>
</body>
</html>
`;
}

module.exports = { SITE, CWS, GH, esc, head, nav, footer, LOGO };
