// Vercel serverless function — server-side, key stays secret.
// NGX Pulse wraps data as { success, data: [...] } — parse accordingly.
// Key read from NGX_PULSE_KEY env var. Never hardcode (public repo).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  // NGX Pulse ticker -> our internal symbol
  const MAP = {
    MTNN: 'MTN', ZENITHBANK: 'ZENITH', GTCO: 'GTCO', DANGCEM: 'DANGCEM',
    WAPCO: 'WAPCO', SEPLAT: 'SEPLAT', ARADEL: 'ARADEL', FIDELITYBK: 'FIDELITY',
    UBA: 'UBA', NEM: 'NEM', TRANSCORP: 'TRANSCORP', NAHCO: 'NAHCO',
    STERLINGNG: 'STERLING', STERLING: 'STERLING', NGXGROUP: 'NGXGROUP',
    PRESCO: 'PRESCO', OKOMUOIL: 'OKOMU', CUSTODIAN: 'CUSTODIAN',
  };

  const prices = {};
  let source = 'none';
  let debug = {};

  const KEY = process.env.NGX_PULSE_KEY;

  // Try several possible equities endpoints; NGX Pulse may use /stocks or /equities
  const ENDPOINTS = [
    'https://www.ngxpulse.ng/api/ngxdata/stocks',
    'https://www.ngxpulse.ng/api/ngxdata/equities',
  ];

  if (KEY) {
    for (const url of ENDPOINTS) {
      try {
        const r = await fetch(url, {
          headers: { 'X-API-Key': KEY, 'Accept': 'application/json' },
        });
        debug[url] = r.status;
        if (r.ok) {
          const json = await r.json();
          // NGX Pulse wraps as { success, data: [...] }. Also handle bare array.
          const rows = Array.isArray(json) ? json
                     : Array.isArray(json?.data) ? json.data
                     : [];
          for (const s of rows) {
            const ticker = s.symbol || s.canonical_symbol || s.ticker;
            const internal = MAP[ticker];
            // price field could be current_price, close, or price
            const px = s.current_price ?? s.close ?? s.price;
            const chg = s.change_percentage ?? s.change_percent ?? null;
            if (internal && typeof px === 'number') {
              prices[internal] = {
                price: px,
                change: typeof chg === 'number' ? chg : null,
                source: 'ngxpulse',
                timestamp: new Date().toISOString(),
              };
            }
          }
          if (Object.keys(prices).length > 0) {
            source = `NGX Pulse (${url.split('/').pop()})`;
            break; // got data, stop trying endpoints
          }
        }
      } catch (e) {
        debug[url] = 'fetch-failed';
      }
    }
    if (Object.keys(prices).length === 0 && source === 'none') {
      source = 'ngxpulse-no-match';
    }
  } else {
    source = 'no-key-set';
  }

  // ── FX: EUR/NGN (free, no key) ──
  try {
    const fx = await fetch('https://open.er-api.com/v6/latest/EUR', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (fx.ok) {
      const d = await fx.json();
      if (d?.rates?.NGN) prices['EUR_NGN'] = { price: d.rates.NGN, source: 'er-api' };
    }
  } catch (e) {}

  // ── BRENT (free, no key) ──
  try {
    const br = await fetch('https://stooq.com/q/l/?s=cb.f&f=sd2t2ohlcv&h&e=csv', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (br.ok) {
      const csv = await br.text();
      const lines = csv.trim().split('\n');
      if (lines.length >= 2) {
        const cols = lines[1].split(',');
        const close = parseFloat(cols[6]);
        if (!isNaN(close)) prices['BRENT'] = { price: close, change: null, source: 'stooq' };
      }
    }
  } catch (e) {}

  const equityCount = Object.keys(prices).filter((k) => k !== 'EUR_NGN' && k !== 'BRENT').length;

  res.status(200).json({
    ok: equityCount > 0,
    source,
    count: equityCount,
    debug,
    prices,
    fetchedAt: new Date().toISOString(),
  });
}
