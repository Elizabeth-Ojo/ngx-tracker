// Vercel serverless function — server-side, key stays secret.
// DEBUG BUILD: add ?debug=1 to the URL to see the raw NGX Pulse structure.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const MAP = {
    MTNN: 'MTN', ZENITHBANK: 'ZENITH', GTCO: 'GTCO', DANGCEM: 'DANGCEM',
    WAPCO: 'WAPCO', SEPLAT: 'SEPLAT', ARADEL: 'ARADEL', FIDELITYBK: 'FIDELITY',
    UBA: 'UBA', NEM: 'NEM', TRANSCORP: 'TRANSCORP', NAHCO: 'NAHCO',
    STERLINGNG: 'STERLING', STERLING: 'STERLING', NGXGROUP: 'NGXGROUP',
    PRESCO: 'PRESCO', OKOMUOIL: 'OKOMU', CUSTODIAN: 'CUSTODIAN',
  };

  const prices = {};
  let source = 'none';
  const KEY = process.env.NGX_PULSE_KEY;
  const isDebug = req.query?.debug === '1';

  if (KEY) {
    try {
      const r = await fetch('https://www.ngxpulse.ng/api/ngxdata/stocks', {
        headers: { 'X-API-Key': KEY, 'Accept': 'application/json' },
      });
      if (r.ok) {
        const json = await r.json();

        // DEBUG: dump the structure so we can see real field names
        if (isDebug) {
          const rows = Array.isArray(json) ? json
                     : Array.isArray(json?.data) ? json.data
                     : null;
          return res.status(200).json({
            topLevelKeys: Object.keys(json || {}),
            isArray: Array.isArray(json),
            dataIsArray: Array.isArray(json?.data),
            rowCount: rows ? rows.length : 0,
            firstRow: rows ? rows[0] : json,
            firstThreeSymbols: rows ? rows.slice(0, 3).map(x => x.symbol || x.ticker || x.canonical_symbol || Object.keys(x)) : null,
          });
        }

        const rows = Array.isArray(json) ? json
                   : Array.isArray(json?.data) ? json.data
                   : [];
        for (const s of rows) {
          const ticker = s.symbol || s.canonical_symbol || s.ticker;
          const internal = MAP[ticker];
          const px = s.current_price ?? s.close ?? s.price ?? s.last_price;
          const chg = s.change_percentage ?? s.change_percent ?? s.changePercentage ?? null;
          if (internal && typeof px === 'number') {
            prices[internal] = {
              price: px,
              change: typeof chg === 'number' ? chg : null,
              source: 'ngxpulse',
              timestamp: new Date().toISOString(),
            };
          }
        }
        source = Object.keys(prices).length > 0 ? 'NGX Pulse' : 'ngxpulse-no-match';
      } else {
        source = `ngxpulse-error-${r.status}`;
      }
    } catch (e) {
      source = 'ngxpulse-fetch-failed';
    }
  } else {
    source = 'no-key-set';
  }

  // FX
  try {
    const fx = await fetch('https://open.er-api.com/v6/latest/EUR', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (fx.ok) { const d = await fx.json(); if (d?.rates?.NGN) prices['EUR_NGN'] = { price: d.rates.NGN, source: 'er-api' }; }
  } catch (e) {}

  // Brent
  try {
    const br = await fetch('https://stooq.com/q/l/?s=cb.f&f=sd2t2ohlcv&h&e=csv', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (br.ok) { const csv = await br.text(); const lines = csv.trim().split('\n'); if (lines.length >= 2) { const cols = lines[1].split(','); const close = parseFloat(cols[6]); if (!isNaN(close)) prices['BRENT'] = { price: close, change: null, source: 'stooq' }; } }
  } catch (e) {}

  const equityCount = Object.keys(prices).filter((k) => k !== 'EUR_NGN' && k !== 'BRENT').length;
  res.status(200).json({ ok: equityCount > 0, source, count: equityCount, prices, fetchedAt: new Date().toISOString() });
}
