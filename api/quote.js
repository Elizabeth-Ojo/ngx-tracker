// /api/quote.js — Vercel serverless function
// Fetches live NGX price + PE from NGX Pulse, keeping the API key server-side.
// Usage: GET /api/quote?t=MTNN

const NGX_BASE = 'https://ngxpulse.ng';

const SECTOR_MAP = {
  'banking': 'banking', 'bank': 'banking',
  'insurance': 'insurance',
  'oil': 'oil', 'gas': 'oil', 'energy': 'oil', 'petroleum': 'oil',
  'industrial': 'cement', 'cement': 'cement', 'construction': 'cement',
  'consumer': 'consumer', 'food': 'consumer', 'beverage': 'consumer', 'fmcg': 'consumer',
  'ict': 'telecom', 'telecom': 'telecom', 'technology': 'telecom',
  'agriculture': 'agric', 'agric': 'agric',
  'conglomerate': 'conglomerate',
};

function normaliseSector(raw) {
  if (!raw) return 'other';
  const lower = raw.toLowerCase();
  for (const [k, v] of Object.entries(SECTOR_MAP)) {
    if (lower.includes(k)) return v;
  }
  return 'other';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ticker = (req.query.t || '').toUpperCase().trim();
  if (!ticker) return res.status(400).json({ error: 'Missing ticker. Use ?t=MTNN' });

  const key = process.env.NGX_API_KEY;
  if (!key) return res.status(500).json({ error: 'NGX_API_KEY env variable not set in Vercel.' });

  const headers = { 'X-API-Key': key, 'Content-Type': 'application/json' };

  try {
    // Fetch all stocks — this endpoint reliably returns current_price + pe_ratio
    const allRes = await fetch(`${NGX_BASE}/api/ngxdata/stocks`, { headers });

    if (!allRes.ok) {
      const body = await allRes.text();
      return res.status(allRes.status).json({ error: `NGX Pulse error: ${body}` });
    }

    const allStocks = await allRes.json();
    const stocks = Array.isArray(allStocks) ? allStocks : (allStocks.data || []);

    // Find the matching ticker
    const stock = stocks.find(s =>
      (s.symbol || '').toUpperCase() === ticker ||
      (s.ticker || '').toUpperCase() === ticker
    );

    if (!stock) {
      return res.status(404).json({
        error: `"${ticker}" not found in NGX Pulse stock list. Check the ticker is correct.`
      });
    }

    // Trailing annual dividend — sum last 12 months
    let dividendPerShare = null;
    try {
      const divRes = await fetch(`${NGX_BASE}/api/ngxdata/dividends/${ticker}`, { headers });
      if (divRes.ok) {
        const divData = await divRes.json();
        const divs = Array.isArray(divData) ? divData : (divData.data || []);
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
    } catch (_) {}

    const sharesM = stock.shares_outstanding
      ? Math.round(stock.shares_outstanding / 1_000_000)
      : null;

    const price = stock.current_price ?? stock.price ?? stock.close ?? null;

    return res.status(200).json({
      ticker:               stock.symbol || ticker,
      name:                 stock.name || ticker,
      price,
      pe_ratio:             stock.pe_ratio ?? null,
      sector:               normaliseSector(stock.sector),
      sector_raw:           stock.sector || null,
      shares_outstanding_m: sharesM,
      market_cap_bn:        (price && sharesM)
                              ? +(price * sharesM / 1000).toFixed(1)
                              : null,
      dividend_per_share:   dividendPerShare,
      change_percent:       stock.change_percent ?? stock.pct_change ?? null,
      volume:               stock.volume ?? null,
      source:               'NGX Pulse',
      source_url:           `https://ngxpulse.ng/stocks/${ticker.toLowerCase()}`,
      asof:                 new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
