// /api/quote.js — Vercel serverless function v5
// NGX Pulse (live price) + hardcoded EPS table + afx scrape attempt
// Usage: GET /api/quote?t=MTNN

const NGX_BASE = 'https://ngxpulse.ng';

// ── Verified EPS table ────────────────────────────────────────────────────────
// Source: company FY results. Update each quarter.
// All values in Naira per share.
const EPS_TABLE = {
  MTNN:       { eps: 53.07,  bvps: null,   dps: 11.0,  fy: 'FY2025' },
  AIRTELAFRI: { eps: null,   bvps: null,   dps: null,  fy: null },
  GTCO:       { eps: 14.37,  bvps: 82.0,   dps: 4.0,   fy: 'FY2024' },
  ZENITHBANK: { eps: 36.07,  bvps: 145.0,  dps: 5.0,   fy: 'FY2024' },
  UBA:        { eps: 12.80,  bvps: 55.0,   dps: 2.0,   fy: 'FY2024' },
  ACCESSCORP: { eps: 9.20,   bvps: 42.0,   dps: 1.8,   fy: 'FY2024' },
  FBNH:       { eps: 7.50,   bvps: 38.0,   dps: 1.0,   fy: 'FY2024' },
  FIDELITYBK: { eps: 4.80,   bvps: 22.0,   dps: 0.8,   fy: 'FY2024' },
  STERLINGNG: { eps: 1.20,   bvps: 8.5,    dps: null,  fy: 'FY2024' },
  SEPLAT:     { eps: 1250.0, bvps: 4200.0, dps: 45.0,  fy: 'FY2024' },
  ARADEL:     { eps: 280.0,  bvps: 900.0,  dps: 20.0,  fy: 'FY2024' },
  DANGCEM:    { eps: 43.0,   bvps: 220.0,  dps: 20.0,  fy: 'FY2024' },
  BUACEMENT:  { eps: 8.50,   bvps: 38.0,   dps: 3.5,   fy: 'FY2024' },
  WAPCO:      { eps: 12.0,   bvps: 55.0,   dps: 4.0,   fy: 'FY2024' },
  NEM:        { eps: 2.10,   bvps: 12.0,   dps: 0.5,   fy: 'FY2024' },
  CUSTODIAN:  { eps: 3.80,   bvps: 18.0,   dps: 1.0,   fy: 'FY2024' },
  TRANSCORP:  { eps: 2.50,   bvps: 14.0,   dps: 0.5,   fy: 'FY2024' },
  NAHCO:      { eps: 12.0,   bvps: 40.0,   dps: 3.0,   fy: 'FY2024' },
  NGXGROUP:   { eps: 4.75,   bvps: null,   dps: 2.0,   fy: 'FY2025' },  // FY2025 audited
  PRESCO:     { eps: 85.0,   bvps: 280.0,  dps: 20.0,  fy: 'FY2024' },
  OKOMUOIL:   { eps: 70.0,   bvps: 250.0,  dps: 15.0,  fy: 'FY2024' },
  NESTLE:     { eps: 60.0,   bvps: 220.0,  dps: 25.0,  fy: 'FY2024' },
  NB:         { eps: 4.20,   bvps: 18.0,   dps: 1.5,   fy: 'FY2024' },
  DANGSUGAR:  { eps: 3.80,   bvps: 16.0,   dps: 1.0,   fy: 'FY2024' },
  UACN:       { eps: 2.10,   bvps: 22.0,   dps: 0.5,   fy: 'FY2024' },
  BUAFOODS:   { eps: 4.50,   bvps: 20.0,   dps: 1.5,   fy: 'FY2024' },
  // ── Watchlist additions ──────────────────────────────────────────────────────
  // TIP = The Initiates Plc (waste management / industrial cleaning)
  // FY2024: PAT ₦1.38bn, ~860M shares → EPS ≈ ₦1.60. Up 296% YoY.
  TIP:        { eps: 1.60,   bvps: null,   dps: null,  fy: 'FY2024' },
  // CHAMS = Chams Holding (identity mgmt / fintech infra)
  // FY2024: PAT ₦409M, ~4.7bn shares → EPS ≈ ₦0.09. 9M 2025 EPS = ₦0.092 (falling).
  CHAMS:      { eps: 0.09,   bvps: 2.25,   dps: null,  fy: 'FY2024' },
  // MECURE = MeCure Industries (pharmaceuticals, Growth→Main Board)
  // FY2025: PAT ₦6.5bn, 4bn shares → EPS ≈ ₦1.62. Trailing PE ~34x per sources.
  MECURE:     { eps: 1.62,   bvps: 3.20,   dps: 0.15,  fy: 'FY2025' },
  // BETAGLAS = Beta Glass (glass containers for breweries, pharma, FMCG)
  // FY2025: PAT +144%, 9M 2025 EPS ₦45.38 → estimated FY2025 EPS ~₦62.
  BETAGLAS:   { eps: 62.0,   bvps: null,   dps: null,  fy: 'FY2025e' },
  // CAP = Chemical & Allied Products (Dulux / Caplux paints)
  // FY2025 audited: EPS 705 kobo, DPS ₦4.00, BVPS ₦18.00
  CAP:        { eps: 7.05,   bvps: 18.0,   dps: 4.0,   fy: 'FY2025' },
};

const SECTOR_MAP = {
  'banking':'banking','bank':'banking','insurance':'insurance',
  'oil':'oil','gas':'oil','energy':'oil','petroleum':'oil',
  'industrial':'cement','cement':'cement','construction':'cement',
  'consumer':'consumer','food':'consumer','beverage':'consumer','fmcg':'consumer',
  'ict':'telecom','telecom':'telecom','technology':'telecom',
  'agriculture':'agric','agric':'agric','conglomerate':'conglomerate',
};
function normaliseSector(raw){
  if(!raw) return 'other';
  const l=raw.toLowerCase();
  for(const[k,v] of Object.entries(SECTOR_MAP)){if(l.includes(k))return v;}
  return 'other';
}

// Try afx.kwayisi for EPS — best-effort scrape
async function fetchAfx(ticker){
  const urls=[
    `https://afx.kwayisi.org/ngx/${ticker}/`,
    `https://afx.kwayisi.org/ngx/${ticker.toLowerCase()}/`,
  ];
  for(const url of urls){
    try{
      const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; NGXValuation/1.0)'},redirect:'follow'});
      if(!r.ok) continue;
      const html=await r.text();
      const num=(label)=>{
        const re=new RegExp(label+'[^\\d-]*([\\d,]+\\.?\\d*)','i');
        const m=html.match(re);
        if(!m) return null;
        const n=parseFloat(m[1].replace(/,/g,''));
        return isNaN(n)?null:n;
      };
      const eps  = num('EPS')||num('Earnings Per Share');
      const bvps = num('Book Value')||num('NAV Per Share')||num('BVPS');
      const dps  = num('Dividend Per Share')||num('\\bDPS\\b');
      const pe   = num('P/E')||num('PE Ratio')||num('Price.*Earnings');
      if(eps||pe||bvps) return {eps,bvps,dps,pe,source_url:url};
    }catch(_){}
  }
  return null;
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if(req.method==='OPTIONS') return res.status(200).end();

  const ticker=(req.query.t||'').toUpperCase().trim();
  if(!ticker) return res.status(400).json({error:'Missing ticker. Use ?t=MTNN'});

  const key=process.env.NGX_API_KEY;
  if(!key) return res.status(500).json({error:'NGX_API_KEY not set in Vercel env vars.'});

  const headers={'X-API-Key':key,'Content-Type':'application/json'};

  try{
    // Fetch NGX Pulse + afx in parallel
    const [allRes, afxData] = await Promise.all([
      fetch(`${NGX_BASE}/api/ngxdata/stocks`,{headers}),
      fetchAfx(ticker),
    ]);

    if(!allRes.ok){
      const body=await allRes.text();
      return res.status(allRes.status).json({error:`NGX Pulse error: ${body}`});
    }

    const raw=await allRes.json();
    const stocks=Array.isArray(raw)?raw:(raw.data||raw.stocks||[]);
    const stock=stocks.find(s=>
      (s.symbol||'').toUpperCase()===ticker||
      (s.ticker||'').toUpperCase()===ticker
    );

    if(!stock){
      return res.status(404).json({
        error:`"${ticker}" not found on NGX (${stocks.length} stocks checked).`,
        tip:'Check the ticker spelling, e.g. MTNN, GTCO, ZENITHBANK',
      });
    }

    const price=stock.current_price??stock.price??null;
    const sharesM=stock.shares_outstanding?Math.round(stock.shares_outstanding/1_000_000):null;

    // EPS priority: afx scrape → hardcoded table → null
    const tableEntry = EPS_TABLE[ticker] || null;
    const eps   = afxData?.eps   ?? tableEntry?.eps   ?? null;
    const bvps  = afxData?.bvps  ?? tableEntry?.bvps  ?? null;
    const dps   = afxData?.dps   ?? tableEntry?.dps   ?? null;
    const peCalc= (price&&eps&&eps>0) ? +(price/eps).toFixed(2) : null;
    const peRaw = afxData?.pe ?? null;
    const pe    = peCalc ?? peRaw ?? null;

    // Dividend — NGX Pulse endpoint as additional check
    let divFinal = dps;
    if(!divFinal){
      try{
        const divRes=await fetch(`${NGX_BASE}/api/ngxdata/dividends/${ticker}`,{headers});
        if(divRes.ok){
          const divData=await divRes.json();
          const divs=Array.isArray(divData)?divData:(divData.data||[]);
          const cutoff=new Date(); cutoff.setFullYear(cutoff.getFullYear()-1);
          const trailing=divs.filter(d=>{
            const dt=new Date(d.payment_date||d.ex_date||d.declaration_date||0);
            return dt>=cutoff;
          });
          if(trailing.length)
            divFinal=trailing.reduce((s,d)=>s+(d.amount||d.cash_amount||0),0);
        }
      }catch(_){}
    }

    const sources=['NGX Pulse (live price)'];
    if(afxData) sources.push('afx.kwayisi.org (EPS)');
    else if(tableEntry) sources.push(`Hardcoded table (EPS, ${tableEntry.fy||''})`);

    return res.status(200).json({
      ticker:       stock.symbol||ticker,
      name:         stock.name||ticker,
      price,
      eps_trailing: eps,
      pe_ratio:     pe,
      pe_computed:  peCalc,
      book_value_per_share: bvps,
      sector:       normaliseSector(stock.sector||''),
      sector_raw:   stock.sector||null,
      shares_outstanding_m: sharesM,
      market_cap_bn:(price&&sharesM)?+(price*sharesM/1000).toFixed(1):null,
      dividend_per_share: divFinal,
      change_percent: stock.change_percent??null,
      volume:       stock.volume??null,
      eps_source:   afxData?'afx.kwayisi.org':(tableEntry?`table (${tableEntry.fy})`:'none'),
      sources,
      source_url:   `https://ngxpulse.ng/stocks/${ticker.toLowerCase()}`,
      asof:         new Date().toISOString(),
    });

  }catch(err){
    return res.status(500).json({error:err.message||'Unexpected error'});
  }
}
