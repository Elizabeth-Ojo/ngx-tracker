// /api/quote.js — Vercel serverless function v3
// Usage: GET /api/quote?t=MTNN
// Add ?debug=1 to see raw stock list structure

const NGX_BASE = 'https://ngxpulse.ng';

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
  for(const [k,v] of Object.entries(SECTOR_MAP)){if(l.includes(k))return v;}
  return 'other';
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if(req.method==='OPTIONS') return res.status(200).end();

  const ticker=(req.query.t||'').toUpperCase().trim();
  const debug=req.query.debug==='1';
  if(!ticker) return res.status(400).json({error:'Missing ticker. Use ?t=MTNN'});

  const key=process.env.NGX_API_KEY;
  if(!key) return res.status(500).json({error:'NGX_API_KEY not set in Vercel env vars.'});

  const headers={'X-API-Key':key,'Content-Type':'application/json'};

  try{
    const allRes=await fetch(`${NGX_BASE}/api/ngxdata/stocks`,{headers});
    if(!allRes.ok){
      const body=await allRes.text();
      return res.status(allRes.status).json({error:`NGX Pulse: ${body}`});
    }
    const raw=await allRes.json();
    const stocks=Array.isArray(raw)?raw:(raw.data||raw.stocks||[]);

    // Debug mode — return first 3 items so we can see the real structure
    if(debug){
      return res.status(200).json({
        total:stocks.length,
        sample:stocks.slice(0,3),
        keys:stocks.length?Object.keys(stocks[0]):[],
      });
    }

    // Flexible match across any field that might hold the ticker
    const match=s=>{
      const check=v=>typeof v==='string'&&v.toUpperCase()===ticker;
      return check(s.symbol)||check(s.ticker)||check(s.code)||check(s.Symbol)||check(s.Ticker);
    };
    const stock=stocks.find(match);

    if(!stock){
      // Return a hint: list tickers that contain the search string
      const hints=stocks
        .filter(s=>Object.values(s).some(v=>typeof v==='string'&&v.toUpperCase().includes(ticker)))
        .slice(0,5)
        .map(s=>s.symbol||s.ticker||s.code||JSON.stringify(s).slice(0,60));
      return res.status(404).json({
        error:`"${ticker}" not found in NGX Pulse stock list (${stocks.length} stocks loaded).`,
        hints:hints.length?hints:'No partial matches found. Check ticker spelling.',
        tip:'Try ?debug=1 to see the raw data structure.',
      });
    }

    // Normalise field names — NGX Pulse may use different keys
    const price=stock.current_price??stock.price??stock.close??stock.lastPrice??null;
    const peRatio=stock.pe_ratio??stock.pe??stock.PERatio??null;
    const sharesRaw=stock.shares_outstanding??stock.sharesOutstanding??stock.shares??null;
    const sharesM=sharesRaw?Math.round(sharesRaw/1_000_000):null;

    // Dividend history
    let dividendPerShare=null;
    try{
      const divRes=await fetch(`${NGX_BASE}/api/ngxdata/dividends/${ticker}`,{headers});
      if(divRes.ok){
        const divData=await divRes.json();
        const divs=Array.isArray(divData)?divData:(divData.data||[]);
        const cutoff=new Date();cutoff.setFullYear(cutoff.getFullYear()-1);
        const trailing=divs.filter(d=>{
          const dt=new Date(d.payment_date||d.ex_date||d.declaration_date||0);
          return dt>=cutoff;
        });
        if(trailing.length) dividendPerShare=trailing.reduce((s,d)=>s+(d.amount||d.cash_amount||0),0);
      }
    }catch(_){}

    return res.status(200).json({
      ticker:stock.symbol||stock.ticker||ticker,
      name:stock.name||stock.companyName||ticker,
      price,
      pe_ratio:peRatio,
      sector:normaliseSector(stock.sector||stock.industry||''),
      sector_raw:stock.sector||stock.industry||null,
      shares_outstanding_m:sharesM,
      market_cap_bn:(price&&sharesM)?+(price*sharesM/1000).toFixed(1):null,
      dividend_per_share:dividendPerShare,
      change_percent:stock.change_percent??stock.changePercent??stock.pct_change??null,
      volume:stock.volume??null,
      source:'NGX Pulse',
      source_url:`https://ngxpulse.ng/stocks/${ticker.toLowerCase()}`,
      asof:new Date().toISOString(),
    });

  }catch(err){
    return res.status(500).json({error:err.message||'Unexpected error'});
  }
}
