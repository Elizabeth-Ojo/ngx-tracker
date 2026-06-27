// Vercel serverless function — server-side, key stays secret.
// Returns ALL NGX Pulse stocks keyed by NGX ticker, so any of the 146
// tickers can be added in the app and still get a live price.
// Key read from NGX_PULSE_KEY env var. Never hardcode (public repo).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const prices = {};   // keyed by NGX ticker: { p: price, c: change%, n: name }
  let source = 'none';
  let asi = null, marketStatus = null, tradeDate = null;
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
          if (s.symbol && typeof s.current_price === 'number') {
            prices[s.symbol] = {
              p: s.current_price,
              c: typeof s.change_percent === 'number' ? s.change_percent : null,
              n: s.name || s.symbol,
            };
          }
        }
        if (json?.market) {
          asi = {
            value: json.market.asi, change: json.market.pct_change,
            advancers: json.market.advancers, decliners: json.market.decliners,
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
  let eurNgn = null;
  try {
    const fx = await fetch('https://open.er-api.com/v6/latest/EUR', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (fx.ok) { const d = await fx.json(); if (d?.rates?.NGN) eurNgn = d.rates.NGN; }
  } catch (e) {}

  // Brent
  let brent = null;
  try {
    const br = await fetch('https://stooq.com/q/l/?s=cb.f&f=sd2t2ohlcv&h&e=csv', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (br.ok) { const csv = await br.text(); const lines = csv.trim().split('\n'); if (lines.length >= 2) { const cols = lines[1].split(','); const close = parseFloat(cols[6]); if (!isNaN(close)) brent = close; } }
  } catch (e) {}

  const count = Object.keys(prices).length;
  res.status(200).json({
    ok: count > 0,
    source, count, asi, marketStatus, tradeDate,
    eurNgn, brent,
    prices,
    fetchedAt: new Date().toISOString(),
  });
}
