#!/usr/bin/env node
// One-command setup for publishing to the Chrome Web Store.
//
//   node tools/cws-setup.js           # get a refresh token, write .env.cws, push GitHub secrets
//   node tools/cws-setup.js --check   # verify the saved credentials against the store
//
// Needs only Node 18+ and (for the secrets step) the GitHub CLI, logged in.
// The one thing it cannot do is create the OAuth client — that takes your Google
// account. See store/api-publishing.md, step 1–2.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ENV_FILE = path.join(__dirname, '..', '.env.cws');
const REPO = 'fighttechvn/playlens';
const DEFAULT_ITEM = 'hnhlkgnfbcijmnaaclpliogmmnflekko';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const KEYS = ['CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN', 'CWS_ITEM_ID'];

function loadEnv() {
  const env = {};
  if (!fs.existsSync(ENV_FILE)) return env;
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*(CWS_[A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function saveEnv(env) {
  fs.writeFileSync(ENV_FILE, KEYS.map((k) => `${k}=${env[k] || ''}`).join('\n') + '\n', { mode: 0o600 });
  fs.chmodSync(ENV_FILE, 0o600);
}

function ask(question, { hidden = false, fallback = '' } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
  return new Promise((resolve) => {
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a.trim() || fallback);
    });
  });
}

async function token(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.CWS_CLIENT_ID,
      client_secret: env.CWS_CLIENT_SECRET,
      refresh_token: env.CWS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (d.error) {
    const hint = d.error === 'invalid_grant'
      ? ' (the token was revoked or expired — an OAuth consent screen left in "Testing" expires it after 7 days; set it to "In production")'
      : '';
    throw new Error(`${d.error_description || d.error}${hint}`);
  }
  return d.access_token;
}

async function check(env) {
  const access = await token(env);
  const r = await fetch(`https://www.googleapis.com/chromewebstore/v1.1/items/${env.CWS_ITEM_ID}?projection=DRAFT`, {
    headers: { authorization: `Bearer ${access}`, 'x-goog-api-version': '2' },
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(`store said ${r.status}: ${JSON.stringify(d.error || d)}`);
  console.log(`✓ credentials work — item ${d.id}`);
  console.log(`  draft version in the store: ${d.crxVersion || '(unknown)'}  ·  upload state: ${d.uploadState || '-'}`);
  console.log(`  published: ${d.publicKey ? 'yes' : 'see dashboard'}  ·  status: ${(d.itemError || []).length ? JSON.stringify(d.itemError) : 'no errors'}`);
}

function captureCode(port, state) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, `http://127.0.0.1:${port}`);
      if (u.pathname !== '/') { res.writeHead(404).end(); return; }
      const err = u.searchParams.get('error');
      const ok = !err && u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<meta charset=utf-8><body style="font:16px system-ui;padding:3rem"><h2>${ok ? 'Done — you can close this tab.' : 'Something went wrong.'}</h2>${ok ? '' : `<p>${err || 'state mismatch'}</p>`}`);
      server.close();
      ok ? resolve(u.searchParams.get('code')) : reject(new Error(err || 'state mismatch'));
    });
    server.listen(port, '127.0.0.1');
    setTimeout(() => { server.close(); reject(new Error('timed out after 5 minutes waiting for consent')); }, 300000).unref();
  });
}

function ghAvailable() {
  return spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status === 0;
}

function setSecrets(env) {
  for (const k of KEYS) {
    // value goes through stdin — never on the command line or in the log
    const r = spawnSync('gh', ['secret', 'set', k, '--repo', REPO], { input: env[k], stdio: ['pipe', 'ignore', 'inherit'] });
    console.log(r.status === 0 ? `  ✓ ${k}` : `  ✗ ${k} failed`);
  }
}

async function setup() {
  const env = { CWS_ITEM_ID: DEFAULT_ITEM, ...loadEnv() };

  console.log('PlayLens · Chrome Web Store setup\n');
  env.CWS_CLIENT_ID = await ask(`OAuth client ID${env.CWS_CLIENT_ID ? ' [keep saved]' : ''}: `, { fallback: env.CWS_CLIENT_ID });
  env.CWS_CLIENT_SECRET = await ask(`OAuth client secret${env.CWS_CLIENT_SECRET ? ' [keep saved]' : ''}: `, { hidden: true, fallback: env.CWS_CLIENT_SECRET });
  env.CWS_ITEM_ID = await ask(`Item ID [${env.CWS_ITEM_ID}]: `, { fallback: env.CWS_ITEM_ID });
  if (!env.CWS_CLIENT_ID || !env.CWS_CLIENT_SECRET) throw new Error('client ID and secret are required');

  // Desktop-app clients accept a loopback redirect on any port.
  const port = 40000 + crypto.randomInt(20000);
  const redirect = `http://127.0.0.1:${port}`;
  const state = crypto.randomBytes(16).toString('hex');
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    response_type: 'code', client_id: env.CWS_CLIENT_ID, redirect_uri: redirect,
    scope: SCOPE, access_type: 'offline', prompt: 'consent', state,
  });

  const wait = captureCode(port, state);
  console.log('\nOpening Google in your browser — pick the account that owns the store item and approve.');
  console.log('If nothing opens, paste this URL yourself:\n\n  ' + url + '\n');
  spawnSync(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open',
    process.platform === 'win32' ? ['/c', 'start', '', url] : [url], { stdio: 'ignore' });
  const code = await wait;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.CWS_CLIENT_ID, client_secret: env.CWS_CLIENT_SECRET,
      redirect_uri: redirect, grant_type: 'authorization_code',
    }),
  });
  const d = await r.json();
  if (!d.refresh_token) throw new Error(d.error_description || d.error || 'Google returned no refresh token — revoke PlayLens at myaccount.google.com/permissions and run again');
  env.CWS_REFRESH_TOKEN = d.refresh_token;

  saveEnv(env);
  console.log(`✓ saved ${path.relative(process.cwd(), ENV_FILE) || '.env.cws'} (mode 600, gitignored)`);
  await check(env);

  if (!ghAvailable()) {
    console.log('\nGitHub CLI not available/logged in — add the four values from .env.cws as repository secrets by hand.');
    return;
  }
  if (/^y/i.test(await ask(`\nPush the four values to ${REPO} as GitHub Actions secrets? [Y/n] `, { fallback: 'y' }))) {
    setSecrets(env);
  }
  if (/^y/i.test(await ask('Submit for review automatically when a new version reaches main? (otherwise uploads a draft) [y/N] ', { fallback: 'n' }))) {
    spawnSync('gh', ['variable', 'set', 'CWS_AUTO_SUBMIT', '--repo', REPO, '--body', 'true'], { stdio: 'inherit' });
    console.log('  ✓ CWS_AUTO_SUBMIT=true');
  }
  console.log('\nDone. Bump "version" in manifest.json and merge to main — the pipeline does the rest.');
}

(async () => {
  try {
    if (process.argv.includes('--check')) {
      const env = loadEnv();
      const missing = KEYS.filter((k) => !env[k]);
      if (missing.length) throw new Error(`.env.cws is missing ${missing.join(', ')} — run: node tools/cws-setup.js`);
      await check(env);
    } else {
      await setup();
    }
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(1);
  }
})();
