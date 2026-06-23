import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, AlertTriangle, Shield, Lock } from 'lucide-react';

// ─── PORTFOLIO DATA — CHD SOURCE OF TRUTH (Jun 23 2026, 18:10 WAT screenshot)
// Units and avg costs from CHD app. DANGCEM = 129 CHD + 17 Bamboo = 146 total.
const POSITIONS = [
  { symbol: 'MTN',       name: 'MTN Nigeria',              units: 1100,  avgCost: 771.44,   tier: 'T1', sector: 'Telecom',     ftse: true,  noExit: true,  frozen: true,  stop: null,    stopNote: 'FROZEN — 25% T1 cap binding' },
  { symbol: 'ZENITH',    name: 'Zenith Bank',               units: 5000,  avgCost: 120.43,   tier: 'T1', sector: 'Banking',     ftse: true,  noExit: true,  frozen: false, stop: null,    stopNote: 'No-Exit — FTSE confirmed' },
  { symbol: 'SEPLAT',    name: 'Seplat Energy',             units: 20,    avgCost: 9088.14,  tier: 'T2', sector: 'Energy',      ftse: true,  noExit: true,  frozen: false, stop: null,    stopNote: 'No-Exit — add gate: Brent >$90' },
  { symbol: 'ARADEL',    name: 'Aradel Holdings',           units: 256,   avgCost: 1760.89,  tier: 'T2', sector: 'Energy',      ftse: 'pot', noExit: false, frozen: false, stop: null,    stopNote: 'FTSE potential — Brent $85/30d gate' },
  { symbol: 'GTCO',      name: 'GTCO',                     units: 3000,  avgCost: 134.79,   tier: 'T1', sector: 'Banking',     ftse: true,  noExit: true,  frozen: false, stop: null,    stopNote: 'No-Exit — FTSE confirmed' },
  { symbol: 'DANGCEM',   name: 'Dangote Cement',            units: 146,   avgCost: 946.60,   tier: 'T1', sector: 'Industrial',  ftse: true,  noExit: true,  frozen: true,  stop: null,    stopNote: 'No-Exit — LOCKED (129 CHD + 17 Bamboo)' },
  { symbol: 'WAPCO',     name: 'Lafarge Africa',            units: 500,   avgCost: 310.78,   tier: 'T2', sector: 'Industrial',  ftse: true,  noExit: true,  frozen: false, stop: null,    stopNote: 'No-Exit — FTSE confirmed' },
  { symbol: 'FIDELITY',  name: 'Fidelity Bank',             units: 5000,  avgCost: 19.82,    tier: 'T2', sector: 'Banking',     ftse: false, noExit: false, frozen: false, stop: null,    stopNote: '' },
  { symbol: 'UBA',       name: 'United Bank for Africa',    units: 2250,  avgCost: 42.50,    tier: 'T2', sector: 'Banking',     ftse: true,  noExit: false, frozen: false, stop: 37,      stopNote: 'Kill-gate: Jul 27 H1 YoY PBT + close <₦37' },
  { symbol: 'NEM',       name: 'NEM Insurance',             units: 4300,  avgCost: 32.07,    tier: 'T3', sector: 'Insurance',   ftse: false, noExit: false, frozen: false, stop: null,    stopNote: 'NAICOM Jul 30 catalyst' },
  { symbol: 'TRANSCORP', name: 'Transcorp',                 units: 1500,  avgCost: 46.87,    tier: 'T3', sector: 'Conglomerate',ftse: false, noExit: false, frozen: false, stop: 36,      stopNote: 'Kill-gate: Q2 revenue decline' },
  { symbol: 'NGXGROUP',  name: 'NGX Group',                 units: 1000,  avgCost: 147.19,   tier: 'T3', sector: 'Financial',   ftse: false, noExit: false, frozen: false, stop: 140,     stopNote: 'STOP BREACH — ₦118 vs ₦140 stop. Thesis doc required.' },
  { symbol: 'STERLING',  name: 'Sterling Financial Holdings',units: 7300, avgCost: 7.91,     tier: 'T3', sector: 'Banking',     ftse: false, noExit: false, frozen: false, stop: 6.5,     stopNote: 'Compounder — P/E ~5x, recap done' },
  { symbol: 'NAHCO',     name: 'NAHCO',                     units: 241,   avgCost: 186.68,   tier: 'T3', sector: 'Aviation',    ftse: false, noExit: false, frozen: false, stop: 150,     stopNote: '+34 bonus pending All Crown credit. Stop mechanical ex-div adj.' },
  { symbol: 'PRESCO',    name: 'Presco',                    units: 32,    avgCost: 2093.29,  tier: 'T3', sector: 'Agri',        ftse: false, noExit: false, frozen: false, stop: null,    stopNote: 'Cherry-Pick fails #7 — rights dilution' },
  { symbol: 'OKOMU',     name: 'Okomu Oil Palm',            units: 16,    avgCost: 1678.05,  tier: 'T3', sector: 'Agri',        ftse: false, noExit: false, frozen: false, stop: null,    stopNote: '' },
  { symbol: 'CUSTODIAN', name: 'Custodian Investment',      units: 37,    avgCost: 83.85,    tier: 'T3', sector: 'Insurance',   ftse: false, noExit: false, frozen: false, stop: null,    stopNote: 'Failed entry gates — exit candidate post Sep 21' },
];

// Live prices from CHD screenshots (18:10 WAT Jun 23 2026) — used as fallback
const CHD_SNAPSHOT = {
  MTN: 830, ZENITH: 117.90, SEPLAT: 11363.90, ARADEL: 1750, GTCO: 129,
  DANGCEM: 1070, WAPCO: 317.40, FIDELITY: 18.15, UBA: 40, NEM: 29,
  TRANSCORP: 43, NGXGROUP: 118.05, STERLING: 7.65, NAHCO: 148.50,
  PRESCO: 2300, OKOMU: 1418, CUSTODIAN: 81.25,
};

const SECTOR_CAPS = { Banking: 40, Energy: 25 };
const CATALYSTS = [
  { date: '2026-07-24', label: 'MTN Q2 results', urgency: 'high' },
  { date: '2026-07-27', label: 'UBA H1 kill-gate', urgency: 'critical' },
  { date: '2026-07-30', label: 'NAICOM recap deadline (NEM)', urgency: 'critical' },
  { date: '2026-09-21', label: 'FTSE Frontier $840M–$1.04B inflows', urgency: 'anchor' },
];

const C = {
  bg: '#080c14', surface: '#0f1623', high: '#172030',
  border: '#1a2840', accent: '#00c9a7', gold: '#f0a500',
  red: '#ef4444', green: '#00c9a7', yellow: '#f0a500',
  text: '#dde5f0', muted: '#5a7298', dim: '#2d4060',
  ftse: '#8b5cf6', noExit: '#ef4444', frozen: '#3b82f6',
};

const fmt = (n, dp = 2) => n == null ? '—' : n.toLocaleString('en-NG', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtM = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `₦${(n / 1e3).toFixed(0)}K`;
  return `₦${n.toFixed(0)}`;
};
const pct = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const daysTo = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);

const gl = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:${C.bg}; }
  tbody tr:hover { background: ${C.high} !important; }
  ::-webkit-scrollbar { width:4px; height:4px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:2px; }
  a { color:${C.accent}; }
`;

export default function App() {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [spin, setSpin] = useState(false);
  const [tab, setTab] = useState('portfolio'); // portfolio | sectors | catalysts

  // Merge: API prices override CHD snapshot fallback
  const getPrice = (sym) => prices[sym]?.price || CHD_SNAPSHOT[sym];
  const getChange = (sym) => prices[sym]?.change ?? null;
  const eurNgn = prices?.EUR_NGN?.price || 1578;
  const brent = prices?.BRENT;

  const totalCost = POSITIONS.reduce((s, p) => s + p.avgCost * p.units, 0);
  const totalLive = POSITIONS.reduce((s, p) => s + getPrice(p.symbol) * p.units, 0);
  const totalPnl = totalLive - totalCost;
  const totalPnlPct = (totalPnl / totalCost) * 100;

  const fetchPrices = useCallback(async () => {
    setLoading(true); setSpin(true); setError(null);
    try {
      const res = await fetch('/api/prices');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) { setPrices(data.prices); setLastUpdate(data.fetchedAt); }
      else setError(data.error || 'Fetch error');
    } catch (e) {
      setError('API unavailable — showing CHD snapshot prices (Jun 23)');
    } finally { setLoading(false); setTimeout(() => setSpin(false), 700); }
  }, []);

  useEffect(() => {
    fetchPrices();
    const iv = setInterval(() => {
      const h = new Date().getHours();
      if (h >= 8 && h < 16) fetchPrices();
    }, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [fetchPrices]);

  // Sector weights
  const sectorData = (() => {
    const s = {};
    for (const p of POSITIONS) {
      const v = getPrice(p.symbol) * p.units;
      s[p.sector] = (s[p.sector] || 0) + v;
    }
    return Object.entries(s)
      .map(([name, val]) => ({ name, pct: (val / totalLive) * 100, cap: SECTOR_CAPS[name] }))
      .sort((a, b) => b.pct - a.pct);
  })();

  const stopAlerts = POSITIONS.filter(p => p.stop && getPrice(p.symbol) <= p.stop);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", fontSize: 14 }}>
      <style>{gl}</style>

      {/* ── HEADER ── */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg,${C.accent},#0088bb)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 800, fontSize: 14, color: '#000' }}>₦</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>NGX Portfolio</div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: "'IBM Plex Mono',monospace" }}>Elizabeth Balogun · CHD C323028ET</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {stopAlerts.length > 0 && (
            <span style={{ background: '#ef444422', border: '1px solid #ef444455', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: C.red, fontWeight: 700 }}>
              ⚠ {stopAlerts.length} STOP BREACH{stopAlerts.length > 1 ? 'ES' : ''}
            </span>
          )}
          {error && <span style={{ background: '#ef444415', border: `1px solid ${C.red}44`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#fca5a5', maxWidth: 220 }}>{error}</span>}
          {!error && lastUpdate && <span style={{ background: `${C.accent}22`, border: `1px solid ${C.accent}55`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: C.accent, fontFamily: "'IBM Plex Mono',monospace" }}>● Live</span>}
          <span style={{ background: `${C.gold}18`, border: `1px solid ${C.gold}44`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: C.gold }}>FTSE {daysTo('2026-09-21')}d</span>
          <button onClick={fetchPrices} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <RefreshCw size={12} style={{ animation: spin ? 'spin .7s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '18px 14px' }}>

        {/* ── MACRO ROW ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Portfolio Value', value: fmtM(totalLive), sub: `≈ €${fmt(totalLive / eurNgn, 0)}`, color: C.text },
            { label: 'Total P&L', value: pct(totalPnlPct), sub: `${totalPnl >= 0 ? '+' : ''}${fmtM(totalPnl)}`, color: totalPnl >= 0 ? C.green : C.red },
            { label: 'EUR/NGN', value: prices?.EUR_NGN ? `₦${fmt(eurNgn, 0)}` : '₦1,578*', sub: 'spot', color: C.accent },
            { label: 'Brent', value: brent ? `$${fmt(brent.price, 1)}` : '$79*', sub: brent ? pct(brent.change) : 'snapshot', color: brent?.change >= 0 ? C.green : C.red },
            { label: 'UBA Kill-Gate', value: `${daysTo('2026-07-27')}d`, sub: '27 Jul 2026', color: C.red },
            { label: 'NAICOM', value: `${daysTo('2026-07-30')}d`, sub: '30 Jul 2026', color: C.red },
            { label: 'FTSE Sep 21', value: `${daysTo('2026-09-21')}d`, sub: '$840M–$1.04B', color: C.gold },
            { label: 'Positions', value: `${POSITIONS.length}`, sub: `${POSITIONS.filter(p=>p.noExit).length} no-exit`, color: C.text },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 13px' }}>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 5 }}>{label}</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 17, color }}>{value}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* ── TABS ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {['portfolio', 'sectors', 'catalysts'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${tab === t ? C.accent : C.border}`, background: tab === t ? `${C.accent}18` : 'none', color: tab === t ? C.accent : C.muted, cursor: 'pointer', fontWeight: tab === t ? 600 : 400, fontSize: 13, textTransform: 'capitalize' }}>
              {t}
            </button>
          ))}
        </div>

        {/* ── PORTFOLIO TABLE ── */}
        {tab === 'portfolio' && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={15} color={C.accent} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>17 Positions</span>
              <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.muted }}>
                {lastUpdate ? `Live · ${new Date(lastUpdate).toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'})}` : 'CHD snapshot · Jun 23 18:10 WAT'}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0b1220' }}>
                    {['Stock','Tier','Units','Avg Cost','Price','Day%','Value','P&L%','EUR','Stop','Status'].map((h, i) => (
                      <th key={h} style={{ padding: '9px 13px', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i <= 1 ? 'left' : 'right', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {POSITIONS.map((p, i) => {
                    const lp = getPrice(p.symbol);
                    const chg = getChange(p.symbol);
                    const val = lp * p.units;
                    const plPct = ((lp - p.avgCost) / p.avgCost) * 100;
                    const eurVal = val / eurNgn;
                    const breached = p.stop && lp <= p.stop;
                    const nearStop = p.stop && !breached && ((lp - p.stop) / p.stop) < 0.05;
                    const tierColors = { T1: '#a78bfa', T2: '#60a5fa', T3: '#34d399' };

                    return (
                      <tr key={p.symbol} style={{ borderBottom: `1px solid ${C.border}`, background: breached ? '#ef444408' : 'transparent' }}>
                        {/* Stock */}
                        <td style={{ padding: '10px 13px', minWidth: 190 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 13 }}>{p.symbol}</span>
                              {p.ftse === true && <span style={{ background: '#8b5cf618', border: '1px solid #8b5cf644', borderRadius: 4, padding: '1px 5px', fontSize: 9, color: '#a78bfa', fontWeight: 700 }}>FTSE</span>}
                              {p.ftse === 'pot' && <span style={{ background: '#8b5cf610', border: '1px solid #8b5cf633', borderRadius: 4, padding: '1px 5px', fontSize: 9, color: '#c4b5fd' }}>FTSE?</span>}
                              {p.noExit && <span style={{ background: '#ef444415', border: '1px solid #ef444435', borderRadius: 4, padding: '1px 5px', fontSize: 9, color: '#fca5a5', fontWeight: 600 }}>NO-EXIT</span>}
                              {p.frozen && <span style={{ background: '#3b82f615', border: '1px solid #3b82f635', borderRadius: 4, padding: '1px 5px', fontSize: 9, color: '#93c5fd', fontWeight: 600 }}>FROZEN</span>}
                            </div>
                            <span style={{ fontSize: 10, color: C.muted }}>{p.name}</span>
                          </div>
                        </td>
                        {/* Tier */}
                        <td style={{ padding: '10px 13px' }}>
                          <span style={{ background: `${tierColors[p.tier]}18`, border: `1px solid ${tierColors[p.tier]}44`, borderRadius: 4, padding: '2px 7px', fontSize: 10, color: tierColors[p.tier], fontWeight: 700 }}>{p.tier}</span>
                        </td>
                        {/* Units */}
                        <td style={{ padding: '10px 13px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.muted }}>{p.units.toLocaleString()}</td>
                        {/* Avg */}
                        <td style={{ padding: '10px 13px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.muted }}>₦{fmt(p.avgCost)}</td>
                        {/* Live price */}
                        <td style={{ padding: '10px 13px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: C.text }}>
                          {loading && !CHD_SNAPSHOT[p.symbol] ? <span style={{ color: C.dim }}>…</span> : `₦${fmt(lp)}`}
                        </td>
                        {/* Day % */}
                        <td style={{ padding: '10px 13px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: chg == null ? C.dim : chg >= 0 ? C.green : C.red }}>
                          {chg != null ? pct(chg) : '—'}
                        </td>
                        {/* Value */}
                        <td style={{ padding: '10px 13px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{fmtM(val)}</td>
                        {/* P&L% */}
                        <td style={{ padding: '10px 13px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, color: plPct >= 0 ? C.green : C.red }}>
                          {pct(plPct)}
                        </td>
                        {/* EUR */}
                        <td style={{ padding: '10px 13px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: C.muted }}>€{fmt(eurVal, 0)}</td>
                        {/* Stop */}
                        <td style={{ padding: '10px 13px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: breached ? C.red : nearStop ? C.yellow : C.dim }}>
                          {p.stop ? `₦${p.stop}` : '—'}
                        </td>
                        {/* Status */}
                        <td style={{ padding: '10px 13px', textAlign: 'right' }}>
                          {breached ? (
                            <span style={{ background: '#ef444422', border: '1px solid #ef444455', borderRadius: 4, padding: '2px 7px', color: C.red, fontSize: 10, fontWeight: 700 }}>⚠ BREACH</span>
                          ) : p.frozen ? (
                            <Lock size={12} color={C.frozen} />
                          ) : p.noExit ? (
                            <Shield size={12} color='#fca5a5' />
                          ) : nearStop ? (
                            <span style={{ color: C.yellow, fontSize: 10 }}>Near stop</span>
                          ) : (
                            <span style={{ color: C.dim, fontSize: 11 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Open items strip */}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 18px' }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Open items / kill-gates</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {POSITIONS.filter(p => p.stopNote).map(p => (
                  <div key={p.symbol} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: C.text, minWidth: 90 }}>{p.symbol}</span>
                    <span style={{ color: C.muted }}>{p.stopNote}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SECTORS TAB ── */}
        {tab === 'sectors' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginBottom: 20 }}>
            {sectorData.map(({ name, pct: p, cap }) => {
              const breached = cap && p > cap;
              const barPct = cap ? Math.min((p / cap) * 100, 100) : Math.min(p * 2, 100);
              return (
                <div key={name} style={{ background: breached ? '#ef444410' : C.surface, border: `1px solid ${breached ? '#ef444455' : C.border}`, borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{name} {breached && '⚠'}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 800, fontSize: 28, color: breached ? C.red : C.text }}>{p.toFixed(1)}%</div>
                  {cap && <div style={{ fontSize: 10, color: breached ? C.red : C.dim, marginTop: 4 }}>Cap: {cap}% {breached ? '— BREACH' : ''}</div>}
                  <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: C.border }}>
                    <div style={{ width: `${barPct}%`, height: '100%', borderRadius: 2, background: breached ? C.red : C.accent, transition: 'width .5s' }} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>
                    {POSITIONS.filter(p2 => p2.sector === name).map(p2 => p2.symbol).join(' · ')}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CATALYSTS TAB ── */}
        {tab === 'catalysts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {CATALYSTS.map(c => {
              const d = daysTo(c.date);
              const colors = { critical: C.red, high: C.gold, anchor: C.accent };
              const col = colors[c.urgency] || C.muted;
              return (
                <div key={c.date} style={{ background: `${col}0a`, border: `1px solid ${col}33`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 800, fontSize: 32, color: col, minWidth: 60 }}>{d}</div>
                  <div>
                    <div style={{ fontSize: 10, color: col, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>days · {c.date}</div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 3, textTransform: 'capitalize' }}>{c.urgency}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '14px 20px', fontSize: 11, color: C.dim, textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace" }}>
        NGX Advisory v3.3 · Data: Yahoo Finance (server-side) + CHD fallback · 4% round-trip · Irish CGT · CHD C323028ET
      </footer>
    </div>
  );
}
