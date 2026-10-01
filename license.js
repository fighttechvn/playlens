// PlayLens Pro — licence keys, checked against Polar (https://polar.sh).
//
// Polar is the seller of record: it takes the payment, handles tax and
// refunds, and emails the buyer a licence key. The key is pasted into the
// extension's settings page. Polar's licence endpoints need no secret and
// allow cross-origin calls, so nothing here needs a server or a new host
// permission.
//
// What leaves the device: the key, the organisation id below and a label for
// this browser, sent to api.polar.sh — only when a key is entered and then
// about once a day while one is stored. Nothing else is sent.
//
// Everything above CONFIG's closing brace is what to change once the Polar
// products exist. Loaded after core.js in the content script, the service
// worker and the settings page.

(function (root) {
  const P = root.PLSI;
  if (!P) return;

  const CONFIG = {
    API: 'https://api.polar.sh', // sandbox: https://sandbox-api.polar.sh
    ORG_ID: '', // Polar → Settings → Organization → Identifier (a UUID)
    CHECKOUT: {
      monthly: '', // https://buy.polar.sh/polar_cl_…
      yearly: '',
      lifetime: '',
    },
    PRICES: { monthly: '$4.99 / month', yearly: '$39 / year', lifetime: '$89 once' },
    PRICING_URL: 'https://fighttechvn.github.io/playlens/#pricing',
  };

  const KEY = 'license';
  const REVALIDATE_MS = 20 * 60 * 60 * 1000; // ask Polar again once a key is 20 h old
  const GRACE_MS = 14 * 24 * 60 * 60 * 1000; // offline this long and Pro keeps working

  const LIMITS = {
    free: { rankPairs: 3, compare: 2, kwLists: 0, notifications: false, history: false, report: false },
    pro: { rankPairs: 150, compare: 6, kwLists: 20, notifications: true, history: true, report: true },
  };

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // True once the owner has put an organisation id in CONFIG.
  const configured = () => UUID.test(CONFIG.ORG_ID);

  const plans = () =>
    ['monthly', 'yearly', 'lifetime'].map((id) => ({
      id,
      price: CONFIG.PRICES[id],
      url: CONFIG.CHECKOUT[id] || '',
    }));

  // Where the "Get Pro" buttons go: a plan's checkout if it is set up,
  // otherwise the pricing section of the landing page.
  const buyUrl = (plan) => CONFIG.CHECKOUT[plan] || CONFIG.PRICING_URL;

  // What a stored record means right now.
  //   pro:    true while the key is granted, not expired, and was confirmed
  //           by Polar within the grace period
  //   reason: why not, for the UI — none | revoked | expired | lapsed
  function status(rec, now) {
    now = now || Date.now();
    if (!rec || !rec.key) return { pro: false, reason: 'none' };
    if (rec.status !== 'granted') return { pro: false, reason: 'revoked' };
    if (rec.expiresAt && rec.expiresAt <= now) return { pro: false, reason: 'expired' };
    if (!rec.validatedAt || now - rec.validatedAt > GRACE_MS) return { pro: false, reason: 'lapsed' };
    return { pro: true, reason: 'active', lifetime: !rec.expiresAt, expiresAt: rec.expiresAt || null };
  }

  const limits = (rec, now) => (status(rec, now).pro ? LIMITS.pro : LIMITS.free);

  const needsCheck = (rec, now) =>
    !!rec && !!rec.key && rec.status === 'granted' && (now || Date.now()) - (rec.validatedAt || 0) > REVALIDATE_MS;

  // "PLAY-ABCD…WXYZ" — enough to recognise a key without showing it whole.
  function mask(key) {
    const k = String(key || '');
    return k.length <= 10 ? k.replace(/./g, '•') : k.slice(0, 5) + '…' + k.slice(-4);
  }

  // ---------- Polar calls ----------

  async function call(path, body) {
    const res = await fetch(CONFIG.API + '/v1/customer-portal/license-keys/' + path, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, organization_id: CONFIG.ORG_ID }),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* an empty body is fine for deactivate */
    }
    return { code: res.status, json };
  }

  function recordFrom(prev, key, activationId, json, now) {
    const exp = json && json.expires_at ? Date.parse(json.expires_at) : 0;
    return {
      key,
      activationId: activationId || null,
      status: json && json.status === 'granted' ? 'granted' : (json && json.status) || 'revoked',
      expiresAt: Number.isFinite(exp) && exp > 0 ? exp : 0,
      validatedAt: now,
      since: (prev && prev.since) || now,
    };
  }

  const read = async () => (await P.store.get(KEY))[KEY] || null;
  const write = (rec) => (rec ? P.store.set({ [KEY]: rec }) : P.store.remove(KEY));

  // Checks a key typed in by the user and, when Polar says the key is limited
  // to a number of devices, claims one slot for this browser. Resolves to
  // { ok:true, state } or { ok:false, error } where error is one of
  // not_configured | empty | not_found | inactive | limit | network.
  async function activate(rawKey, label, now) {
    now = now || Date.now();
    const key = String(rawKey || '').trim();
    if (!configured()) return { ok: false, error: 'not_configured' };
    if (!key) return { ok: false, error: 'empty' };
    try {
      let r = await call('validate', { key });
      if (r.code === 404 || r.code === 422) return { ok: false, error: 'not_found' };
      if (r.code !== 200) return { ok: false, error: 'network' };
      if (r.json.status !== 'granted') return { ok: false, error: 'inactive' };
      let activationId = null;
      if (r.json.limit_activations) {
        const a = await call('activate', { key, label: String(label || 'PlayLens').slice(0, 80) });
        if (a.code === 403) return { ok: false, error: 'limit' };
        if (a.code !== 200 && a.code !== 201) return { ok: false, error: 'network' };
        activationId = a.json.id;
        r = await call('validate', { key, activation_id: activationId });
        if (r.code !== 200) return { ok: false, error: r.code === 404 ? 'not_found' : 'network' };
        if (r.json.status !== 'granted') return { ok: false, error: 'inactive' };
      }
      const rec = recordFrom(await read(), key, activationId, r.json, now);
      await write(rec);
      return { ok: true, state: status(rec, now) };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  // Asks Polar whether the stored key still stands. A refusal (revoked,
  // refunded, cancelled) locks Pro at once; a network failure changes nothing,
  // so travelling or a flaky connection never costs anyone their licence.
  async function revalidate(now) {
    now = now || Date.now();
    const rec = await read();
    if (!rec || !rec.key || !configured()) return { checked: false, state: status(rec, now) };
    try {
      const body = { key: rec.key };
      if (rec.activationId) body.activation_id = rec.activationId;
      const r = await call('validate', body);
      let next = null;
      if (r.code === 200 && r.json) next = recordFrom(rec, rec.key, rec.activationId, r.json, now);
      else if (r.code === 404) next = { ...rec, status: 'revoked', validatedAt: now };
      else return { checked: false, state: status(rec, now) };
      await write(next);
      return { checked: true, state: status(next, now) };
    } catch {
      return { checked: false, state: status(rec, now) };
    }
  }

  // Forgets the key on this device and frees its device slot at Polar.
  async function deactivate() {
    const rec = await read();
    if (rec && rec.activationId && configured()) {
      try {
        await call('deactivate', { key: rec.key, activation_id: rec.activationId });
      } catch {
        /* the slot can also be freed from Polar's customer portal */
      }
    }
    await write(null);
  }

  P.license = {
    CONFIG,
    KEY,
    LIMITS,
    GRACE_MS,
    REVALIDATE_MS,
    configured,
    plans,
    buyUrl,
    status,
    limits,
    needsCheck,
    mask,
    read,
    activate,
    revalidate,
    deactivate,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
