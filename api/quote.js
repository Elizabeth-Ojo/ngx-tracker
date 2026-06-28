// /api/quote.js — Vercel serverless function
// Proxies NGX Pulse so the API key never touches the browser.
// Usage: GET /api/quote?t=MTNN

const NGX_BASE = 'https://www.ngxpulse.ng';

const SECTOR_MAP = {
  'Banking':           'banking',
  'Insurance':         'insurance',
  'Oil And Gas':       'oil',
  'Industrial Goods':  'cement',
  'Consumer Goods':    'consumer',
  'ICT':               'telecom',
  'Agriculture':       'agric',
  'Conglomerates':     'conglomerate',
  'Financial Services':'banking',
  'Healthcare':        'other',
  'Services':          'other',
  'Utilities':         'other',
};

function normaliseSector(raw) {
  if (!raw) return 'other';
  for (const [k, v] of Object.entries(SECTOR_MAP)) {
    if (raw.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return 'other';
}

export default async function handler(req, res) {
  // CORS — allow the same Vercel domain and Claude artifacts
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ticker = (req.query.t || '').toUpperCase().trim();
  if (!ticker) {
    return res.status(400).json({ error: 'Missing ticker. Use ?t=MTNN' });
  }

  const key = process.env.NGX_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'NGX_API_KEY env variable not set in Vercel.' });
  }

  const headers = { 'X-API-Key': key, 'Content-Type': 'application/json' };

  try {
    // 1. Live price + PE from NGX Pulse
    const priceRes = await fetch(
      `${NGX_BASE}/api/ngxdata/prices/${ticker}`,
      { headers }
    );

    if (!priceRes.ok) {
      const body = await priceRes.text();
      if (priceRes.status === 404) {
        return res.status(404).json({ error: `Ticker "${ticker}" not found on NGX Pulse.` });
      }
      return res.status(priceRes.status).json({ error: body });
    }

    const stock = await priceRes.json();

    // 2. Dividend history — derive trailing annual dividend per share
    let dividendPerShare = null;
    try {
      const divRes = await fetch(
        `${NGX_BASE}/api/ngxdata/dividends/${ticker}`,
        { headers }
      );
      if (divRes.ok) {
        const divData = await divRes.json();
        const divs = Array.isArray(divData) ? divData : (divData.data || []);
        // Sum dividend amounts in the last 12 months
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        const trailing = divs.filter(d => {
          const dt = new Date(d.payment_date || d.ex_date || d.declaration_date || 0);
          return dt >= cutoff;
        });
        if (trailing.length) {
          dividendPerShare = trailing.reduce((s, d) => s + (d.amount || d.cash_amount || 0), 0);
        }
      }
    } catch (_) {
      // dividends are optional — don't block the response
    }

    // 3. Build clean response
    const sharesM = stock.shares_outstanding
      ? Math.round(stock.shares_outstanding / 1_000_000)
      : null;

    const payload = {
      ticker:               stock.symbol || ticker,
      name:                 stock.name || ticker,
      price:                stock.current_price ?? null,
      pe_ratio:             stock.pe_ratio ?? null,
      sector:               normaliseSector(stock.sector),
      sector_raw:           stock.sector || null,
      shares_outstanding_m: sharesM,
      market_cap_bn:        (stock.current_price && sharesM)
                              ? +(stock.current_price * sharesM / 1000).toFixed(1)
                              : null,
      dividend_per_share:   dividendPerShare,
      change_percent:       stock.change_percent ?? null,
      volume:               stock.volume ?? null,
      source:               'NGX Pulse',
      source_url:           `https://ngxpulse.ng/stocks/${ticker.toLowerCase()}`,
      asof:                 new Date().toISOString(),
    };

    return res.status(200).json(payload);

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
