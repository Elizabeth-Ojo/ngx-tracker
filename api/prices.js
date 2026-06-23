// Vercel serverless function — runs server-side, no CORS issues
// Fetches NGX prices from Yahoo Finance (NGX tickers use .LG suffix)
// Falls back to afx.kwayisi.org scrape for unlisted tickers

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300'); // cache 5 min

  // Yahoo Finance ticker map for NGX stocks
  // Format: NGX_SYMBOL -> Yahoo ticker
  const YAHOO_MAP = {
    MTN: 'MTNN.LG',
    ZENITH: 'ZENITHBANK.LG',
    GTCO: 'GTCO.LG',
    DANGCEM: 'DANGCEM.LG',
    WAPCO: 'WAPCO.LG',
    SEPLAT: 'SEPLAT.LG',
    ARADEL: 'ARADEL.LG',
    FIDELITY: 'FIDELITYBK.LG',
    UBA: 'UBA.LG',
    NEM: 'NEM.LG',
    TRANSCORP: 'TRANSCORP.LG',
    NAHCO: 'NAHCO.LG',
    STERLING: 'STERLINGBANK.LG',
    NGXGROUP: 'NGXGROUP.LG',
    PRESCO: 'PRESCO.LG',
    OKOMU: 'OKOMUOIL.LG',
    CUSTODIAN: 'CUSTODIAN.LG',
  };

  const symbols = Object.values(YAHOO_MAP).join(',');

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketPreviousClose`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NGXTracker/1.0)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);

    const data = await response.json();
    const quotes = data?.quoteResponse?.result || [];

    // Reverse map: Yahoo ticker -> NGX symbol
    const reverseMap = Object.fromEntries(
      Object.entries(YAHOO_MAP).map(([k, v]) => [v, k])
    );

    const prices = {};
    for (const q of quotes) {
      const symbol = reverseMap[q.symbol];
      if (symbol) {
        prices[symbol] = {
          price: q.regularMarketPrice,
          change: q.regularMarketChangePercent,
          prevClose: q.regularMarketPreviousClose,
          source: 'yahoo',
          timestamp: new Date().toISOString(),
        };
      }
    }

    // Also fetch EUR/NGN and Brent
    const fxUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=EURNGN%3DX,BZ%3DF`;
    const fxRes = await fetch(fxUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (fxRes.ok) {
      const fxData = await fxRes.json();
      const fxQuotes = fxData?.quoteResponse?.result || [];
      const eurngnQ = fxQuotes.find((q) => q.symbol === 'EURNGN=X');
      const brentQ = fxQuotes.find((q) => q.symbol === 'BZ=F');
      if (eurngnQ) prices['EUR_NGN'] = { price: eurngnQ.regularMarketPrice, source: 'yahoo' };
      if (brentQ) prices['BRENT'] = { price: brentQ.regularMarketPrice, change: brentQ.regularMarketChangePercent, source: 'yahoo' };
    }

    res.status(200).json({ ok: true, prices, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message, prices: {} });
  }
}
