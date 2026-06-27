// Vercel serverless function — server-side, key stays secret.
// NGX Pulse returns { stocks: [...], market: {...} }. Array is at json.stocks.
// Key read from NGX_PULSE_KEY env var. Never hardcode (public repo).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const MAP = {
    MTNN: 'MTN', ZENITHBANK: 'ZENITH', GTCO: 'GTCO', DANGCEM: 'DANGCEM',
    WAPCO: 'WAPCO', SEPLAT: 'SEPLAT', ARADEL: 'ARADEL', FIDELITYBK: 'FIDELITY',
    UBA: 'UBA', NEM: 'NEM', TRANSCORP: 'TRANSCORP', NAHCO: 'NAHCO',
    STERLINGNG: 'STERLING', NGXGROUP: 'NGXGROUP', PRESCO: 'PRESCO',
    OKOMUOIL: 'OKOMU', CUSTODIAN: 'CUSTODIAN',
  };

  const prices = {};
  let source = 'none';
  let asi = null;
  let marketStatus = null;
  let tradeDate = null;
  const KEY = process.env.NGX_PULSE_KEY;

  if (KEY) {
    try {
      const r = await fetch('https://www.ngxpulse.ng/api/ngxdata/stocks', {
        headers: { 'X-API-Key': KEY, 'Accept': 'application/json' },
      });
      if (r.ok) {
        const json = await r.json();
        const rows = Array.isArray(json?.stocks) ? json.stocks : [];
        for (const s of rows) {
          const internal = MAP[s.symbol];
          const px = s.current_price;
          const chg = s.change_percent;
          if (internal && typeof px === 'number') {
            prices[internal] = {
              price: px,
              change: typeof chg === 'number' ? chg : null,
              prevClose: s.previous_close ?? null,
              source: 'ngxpulse',
              timestamp: new Date().toISOString(),
            };
          }
        }
        // Pull live ASI / market block
        if (json?.market) {
          asi = {
            value: json.market.asi,
            change: json.market.pct_change,
            advancers: json.market.advancers,
            decliners: json.market.decliners,
            unchanged: json.market.unchanged,
          };
          marketStatus = json.market.market_status || null;
        }
        tradeDate = json?.as_of || null;
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

  // FX: EUR/NGN
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
  res.status(200).json({
    ok: equityCount > 0,
    source,
    count: equityCount,
    asi,
    marketStatus,
    tradeDate,
    prices,
    fetchedAt: new Date().toISOString(),
  });
}
