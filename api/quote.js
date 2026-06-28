// /api/quote.js — Vercel serverless function v4
// NGX Pulse for live price + afx.kwayisi.org for EPS/PE
// Usage: GET /api/quote?t=MTNN
const NGX_BASE = 'https://ngxpulse.ng';
const AFX_BASE = 'https://afx.kwayisi.org';
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
// Parse PE and EPS from afx.kwayisi HTML page for a ticker
async function fetchAfxData(ticker){
try{
const url=`${AFX_BASE}/ngx/equity/?q=${encodeURIComponent(ticker)}`;
const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}});
if(!r.ok) return null;
const html=await r.text();
// Extract key figures from the HTML table
const extract=(label)=>{
// Match pattern: label followed by a number in the table
const re=new RegExp(label+'[^\\d-]*([\\d,.-]+)','i');
const m=html.match(re);
if(!m) return null;
const n=parseFloat(m[1].replace(/,/g,''));
return isNaN(n)?null:n;
};
const pe = extract('P/E') || extract('Price.*Earnings') || extract('PE Ratio');
const eps = extract('EPS') || extract('Earnings Per Share');
const bvps = extract('Book Value') || extract('BVPS') || extract('NAV Per Share');
const dps = extract('Dividend Per Share') || extract('DPS');
const dy = extract('Dividend Yield');
return {pe, eps, bvps, dps, dy, source_url: url};
}catch(_){return null;}
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
// 1. NGX Pulse — live price, volume, market cap
const [allRes, afxData] = await Promise.all([
fetch(`${NGX_BASE}/api/ngxdata/stocks`,{headers}),
fetchAfxData(ticker),
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
error:`"${ticker}" not found on NGX Pulse (${stocks.length} stocks checked).`,
tip:'Check the ticker symbol is correct, e.g. MTNN, GTCO, ZENITHBANK',
});
}
const price = stock.current_price ?? stock.price ?? null;
const sharesRaw = stock.shares_outstanding ?? null;
const sharesM = sharesRaw ? Math.round(sharesRaw/1_000_000) : null;
// 2. Compute PE from price ÷ EPS (afx), or use reported PE
const eps = afxData?.eps ?? null;
const bvps = afxData?.bvps ?? null;
const dps = afxData?.dps ?? null;
const peCalc= (price && eps && eps>0) ? +(price/eps).toFixed(1) : null;
const peRaw = afxData?.pe ?? null;
const pe = peCalc ?? peRaw ?? null;
// 3. Dividend — NGX Pulse dividends endpoint
let dividendPerShare = dps; // prefer afx value
if(!dividendPerShare){
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
dividendPerShare=trailing.reduce((s,d)=>s+(d.amount||d.cash_amount||0),0);
}
}catch(_){}
}
const sources=['NGX Pulse (price, volume)'];
if(afxData) sources.push('afx.kwayisi.org (EPS, fundamentals)');
return res.status(200).json({
ticker: stock.symbol||ticker,
name: stock.name||ticker,
price,
eps_trailing: eps,
pe_ratio: pe,
pe_computed: peCalc, // price ÷ eps
pe_reported: peRaw, // as stated by source
book_value_per_share: bvps,
sector: normaliseSector(stock.sector||''),
sector_raw: stock.sector||null,
shares_outstanding_m: sharesM,
market_cap_bn:(price&&sharesM)?+(price*sharesM/1000).toFixed(1):null,
dividend_per_share: dividendPerShare,
change_percent: stock.change_percent??null,
volume: stock.volume??null,
sources,
source_url: `https://ngxpulse.ng/stocks/${ticker.toLowerCase()}`,
afx_url: afxData?.source_url??null,
asof: new Date().toISOString(),
});
}catch(err){
return res.status(500).json({error:err.message||'Unexpected error'});
}
}
