// Vercel serverless function — server-side, key stays secret.
// PRIMARY: NGX Pulse  GET /api/ngxdata/stocks  (X-API-Key header)
// FX:      open.er-api.com  (free, no key) for EUR/NGN
// BRENT:   stooq.com CSV    (free, no key)
//
// The NGX Pulse key is read from the NGX_PULSE_KEY environment variable.
// NEVER hardcode the key here — this repo is public.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Cache 5 min at the edge so we stay well under 100 calls/day on the free tier
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  // NGX Pulse ticker -> our internal symbol
  const MAP = {
    MTNN: 'MTN',
    ZENITHBANK: 'ZENITH',
    GTCO: 'GTCO',
    DANGCEM: 'DANGCEM',
    WAPCO: 'WAPCO',
    SEPLAT: 'SEPLAT',
    ARADEL: 'ARADEL',
    FIDELITYBK: 'FIDELITY',
    UBA: 'UBA',
    NEM: 'NEM',
    TRANSCORP: 'TRANSCORP',
    NAHCO: 'NAHCO',
    STERLINGNG: 'STERLING',
    STERLING: 'STERLING', // edge case — some feeds still use STERLING
    NGXGROUP: 'NGXGROUP',
    PRESCO: 'PRESCO',
    OKOMUOIL: 'OKOMU',
    CUSTODIAN: 'CUSTODIAN',
  };

  const prices = {};
  let source = 'none';

  // ── PRIMARY: NGX Pulse bulk equities ──
  const KEY = process.env.NGX_PULSE_KEY;
  if (KEY) {
    try {
      const r = await fetch('https://www.ngxpulse.ng/api/ngxdata/stocks', {
        headers: {
          'X-API-Key': KEY,
          'Accept': 'application/json',
        },
      });
      if (r.ok) {
        const all = await r.json();
        if (Array.isArray(all)) {
          for (const s of all) {
            const internal = MAP[s.symbol];
            if (internal && typeof s.current_price === 'number') {
              prices[internal] = {
                price: s.current_price,
                change: typeof s.change_percent === 'number' ? s.change_percent : null,
                source: 'ngxpulse',
                timestamp: new Date().toISOString(),
              };
            }
          }
        }
        if (Object.keys(prices).length > 0) source = 'NGX Pulse';
      } else {
        source = `ngxpulse-error-${r.status}`;
      }
    } catch (e) {
      source = 'ngxpulse-fetch-failed';
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
    prices,
    fetchedAt: new Date().toISOString(),
  });
}
