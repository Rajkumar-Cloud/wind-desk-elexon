import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown, CircleHelp, Clock3, Download, ExternalLink, Gauge, Layers3, RefreshCw, Wind, Zap } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE || '';
const fmt = (n, digits=0) => n == null ? '—' : new Intl.NumberFormat('en-GB', {maximumFractionDigits: digits, minimumFractionDigits: digits}).format(n);
const time = (s) => s ? new Intl.DateTimeFormat('en-GB', {hour:'2-digit', minute:'2-digit', timeZone:'Europe/London'}).format(new Date(s)) : '—';
const dateLabel = (s, options={weekday:'short', day:'numeric', month:'short'}) => new Intl.DateTimeFormat('en-GB', {...options, timeZone:'Europe/London'}).format(new Date(`${s}T12:00:00Z`));

function Metric({label, value, unit, sub, accent='teal', icon: Icon}) {
 return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${accent}`}><Icon size={16}/></span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-sub">{sub}</div></div>
}

function App() {
 const [data, setData] = useState(null);
 const [status, setStatus] = useState('loading');
 const [error, setError] = useState('');
 const [cutoff, setCutoff] = useState('11:00');
 const [selectedDate, setSelectedDate] = useState('2026-01-14');
 const [view, setView] = useState('day');
 const [refreshKey, setRefreshKey] = useState(0);

 useEffect(() => {
   let cancelled = false;
   setStatus('loading'); setError('');
   fetch(`${API}/api/month?year=2026&month=1&cutoff=${encodeURIComponent(cutoff)}`)
     .then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.detail || `Request failed (${r.status})`); return body; })
     .then(body => { if (!cancelled) { setData(body); setStatus('ready'); if (!body.points.some(p => p.deliveryDate === selectedDate)) setSelectedDate(body.points.find(p => p.forecastMw != null)?.deliveryDate || '2026-01-01'); } })
     .catch(e => { if (!cancelled) { setError(e.message); setStatus('error'); } });
   return () => { cancelled = true; };
 }, [cutoff, refreshKey]);

 const byDay = useMemo(() => {
  const map = new Map();
  for (const p of data?.points || []) { if (!map.has(p.deliveryDate)) map.set(p.deliveryDate, []); map.get(p.deliveryDate).push(p); }
  return [...map.entries()].map(([day, points]) => {
   const fp = points.filter(p=>p.forecastMw!=null); const paired=points.filter(p=>p.forecastMw!=null && p.actualMw!=null);
   return {day, points, forecast:fp.length?fp.reduce((s,p)=>s+p.forecastMw,0)/fp.length:null, actual:paired.length?paired.reduce((s,p)=>s+p.actualMw,0)/paired.length:null, count:paired.length, err:paired.length?paired.reduce((s,p)=>s+Math.abs(p.forecastMw-p.actualMw),0)/paired.length:null};
  });
 }, [data]);
 const selected = byDay.find(d=>d.day===selectedDate) || byDay[0];
 const chartData = (selected?.points || []).map(p=>({period:`${time(p.startTime)}`, forecast:p.forecastMw, actual:p.actualMw, error:p.forecastMw!=null && p.actualMw!=null ? p.forecastMw-p.actualMw : null}));
 const daySummary = selected?.points?.filter(p=>p.forecastMw!=null && p.actualMw!=null) || [];
 const dayMae = daySummary.length ? daySummary.reduce((s,p)=>s+Math.abs(p.forecastMw-p.actualMw),0)/daySummary.length : null;
 const dayBias = daySummary.length ? daySummary.reduce((s,p)=>s+p.forecastMw-p.actualMw,0)/daySummary.length : null;
 const exportCsv = () => {
  if (!data) return;
  const rows = [['startTime','deliveryDate','settlementPeriod','forecastMW','forecastPublishedAt','actualMW','errorMW'], ...data.points.map(p=>[p.startTime,p.deliveryDate,p.period,p.forecastMw ?? '',p.publishTime ?? '',p.actualMw ?? '',p.forecastMw!=null&&p.actualMw!=null ? p.forecastMw-p.actualMw : ''])];
  const blob = new Blob([rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n')],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='wind-desk-january-2026.csv'; a.click(); URL.revokeObjectURL(a.href);
 };
 const avgForecast = selected?.forecast;
 const avgActual = selected?.actual;
 const cover = data?.summary?.forecastCoveragePct;

 return <div className="app-shell">
  <aside className="sidebar">
   <div className="brand"><div className="brand-mark"><Wind size={19}/></div><div><b>Northstar</b><span>ENERGY TRADING</span></div></div>
   <div className="workspace-label">WORKSPACE</div>
   <nav><a className="nav-item active"><Activity size={17}/> Wind desk <span className="nav-dot"/></a><a className="nav-item"><Layers3 size={17}/> Market overview</a><a className="nav-item"><Gauge size={17}/> Forecast quality</a></nav>
   <div className="sidebar-bottom"><div className="connection"><span className="pulse"/><div><b>Elexon BMRS</b><small>Data connection</small></div><span className="connection-state">LIVE</span></div><div className="profile"><div className="avatar">JR</div><div><b>Jordan Reid</b><small>Power trading</small></div><ChevronDown size={15}/></div></div>
  </aside>
  <main className="main-area">
   <header className="topbar"><div className="breadcrumbs">Trading tools <span>/</span> <b>Wind desk</b></div><div className="top-actions"><div className="range-pill"><span className="live-dot"/> HISTORICAL REVIEW <span className="divider"/> JAN 2026</div><button className="icon-button" aria-label="Help"><CircleHelp size={18}/></button><div className="avatar top-avatar">JR</div></div></header>
   <div className="content">
    <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> DAY-AHEAD PROCUREMENT</div><h1>Wind desk</h1><p>See the forecast available at decision time, and how it performed against metered outturn.</p></div><div className="heading-actions"><label className="cutoff-control"><Clock3 size={16}/><span>Decision cutoff</span><input aria-label="Decision cutoff UK local time" type="time" value={cutoff} onChange={e=>setCutoff(e.target.value)}/><span className="uk-tag">UK</span></label><button className="secondary-button" onClick={()=>setRefreshKey(k=>k+1)} disabled={status==='loading'}><RefreshCw size={15} className={status==='loading'?'spin':''}/> Refresh</button><button className="primary-button" onClick={exportCsv} disabled={!data}><Download size={15}/> Export</button></div></section>
    {status==='loading' && <div className="notice loading-notice"><span className="loader"/> Loading January wind forecasts and outturn from Elexon…</div>}
    {status==='error' && <div className="notice error-notice"><b>Data could not be loaded.</b> {error}.<span className="error-gap"> </span><button onClick={()=>setRefreshKey(k=>k+1)}>Try again</button><small>Check the API connection and README for Docker troubleshooting steps.</small></div>}
    {status==='ready' && <>
     <section className="decision-banner"><div className="banner-icon"><Zap size={19}/></div><div className="banner-copy"><b>January review · Day-ahead wind position</b><span>Each delivery day uses the latest Elexon forecast published by {cutoff} UK time on the previous day. Actuals are matched by settlement period.</span></div><div className="banner-meta"><span>MODELLED CUT-OFF</span><b>{cutoff} UK</b></div><div className="banner-meta"><span>FORECAST COVERAGE</span><b>{fmt(cover,1)}%</b></div></section>
     <section className="metrics-grid">
      <Metric label="Mean forecast wind" value={fmt(data.summary.meanForecastMw)} unit="MW" sub="Jan · selected day-ahead snapshots" icon={Wind}/>
      <Metric label="Forecast MAE" value={fmt(data.summary.maeMw)} unit="MW" sub="Lower is better · matched periods" accent="amber" icon={Activity}/>
      <Metric label="Forecast bias" value={data.summary.biasMw==null?'—':`${data.summary.biasMw>0?'+':''}${fmt(data.summary.biasMw)}`} unit="MW" sub={data.summary.biasMw==null?'No matched periods':data.summary.biasMw>0?'Over-forecast on average':'Under-forecast on average'} accent="blue" icon={data.summary.biasMw>=0?ArrowUpRight:ArrowDownRight}/>
      <Metric label="Periods matched" value={`${fmt(data.summary.matchedPeriods)} / ${fmt(data.summary.periods)}`} unit="" sub={`MAPE ${fmt(data.summary.mapePct,1)}% · RMSE ${fmt(data.summary.rmseMw)} MW`} accent="violet" icon={CalendarDays}/>
     </section>
     <section className="analysis-grid">
      <div className="panel chart-panel"><div className="panel-heading"><div><div className="panel-kicker">GENERATION PROFILE</div><h2>{selected ? dateLabel(selected.day,{weekday:'long',day:'numeric',month:'long'}) : 'Selected day'}</h2><p>Forecast at decision time vs actual wind output</p></div><div className="segmented"><button className={view==='day'?'chosen':''} onClick={()=>setView('day')}>Day</button><button className={view==='month'?'chosen':''} onClick={()=>setView('month')}>Month</button></div></div>
       <div className="chart-legend"><span><i className="legend-line forecast-line"/> Forecast</span><span><i className="legend-line actual-line"/> Actual</span><span className="unit-note">MW · half-hourly</span></div>
       <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={view==='day'?chartData:byDay.map(d=>({period:dateLabel(d.day,{day:'numeric'}),forecast:d.forecast,actual:d.actual}))} margin={{top:8,right:8,left:0,bottom:0}}><defs><linearGradient id="windFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3cae94" stopOpacity={0.13}/><stop offset="100%" stopColor="#3cae94" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#edf1f1" vertical={false}/><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{fill:'#8a9599',fontSize:11}} interval={view==='day'?7:4}/><YAxis tickLine={false} axisLine={false} tick={{fill:'#8a9599',fontSize:11}} width={48} tickFormatter={v=>`${(v/1000).toFixed(v>=1000?0:1)}${v>=1000?'k':''}`}/><Tooltip formatter={(v,n)=>[`${fmt(v)} MW`,n==='forecast'?'Forecast':'Actual']} labelFormatter={l=>view==='day'?l:`${l} Jan`}/><Area type="monotone" dataKey="forecast" stroke="#2a9d83" strokeWidth={2.5} fill="url(#windFill)" connectNulls={false} dot={false} activeDot={{r:4,fill:'#2a9d83',stroke:'#fff',strokeWidth:2}}/><Line type="monotone" dataKey="actual" stroke="#263d4b" strokeWidth={2} dot={false} activeDot={{r:4,fill:'#263d4b',stroke:'#fff',strokeWidth:2}} connectNulls={false}/></AreaChart></ResponsiveContainer></div>
       <div className="chart-foot"><span><b>{selected?fmt(avgForecast):'—'} MW</b> average forecast</span><span><b>{selected?fmt(avgActual):'—'} MW</b> average actual</span><span className="chart-error">Daily MAE <b>{fmt(dayMae)} MW</b></span></div>
      </div>
      <div className="panel day-panel"><div className="panel-heading compact"><div><div className="panel-kicker">DELIVERY DAYS</div><h2>January 2026</h2><p>Select a day to inspect the forecast vintage</p></div><span className="date-icon"><CalendarDays size={16}/></span></div><div className="day-list">{byDay.map(d=><button key={d.day} className={`day-row ${d.day===selectedDate?'selected':''}`} onClick={()=>setSelectedDate(d.day)}><span className="day-date"><b>{dateLabel(d.day,{day:'2-digit'})}</b><small>{dateLabel(d.day,{weekday:'short',month:'short'})}</small></span><span className="day-bars"><i style={{width:`${Math.min(100,(d.forecast||0)/100)}%`}}/><i className="actual-bar" style={{width:`${Math.min(100,(d.actual||0)/100)}%`}}/></span><span className="day-value">{fmt(d.forecast)}<small>MW</small></span><span className={`day-error ${d.err==null?'muted':''}`}>{d.err==null?'—':fmt(d.err)}<small>MAE</small></span></button>)}</div><div className="day-legend"><span><i className="swatch forecast-swatch"/> Forecast avg</span><span><i className="swatch actual-swatch"/> Actual avg</span></div></div>
     </section>
     <section className="panel table-panel"><div className="table-heading"><div><div className="panel-kicker">SETTLEMENT DETAIL</div><h2>{selected?dateLabel(selected.day,{weekday:'long',day:'numeric',month:'long'}):'Settlement periods'}</h2></div><div className="table-meta">{daySummary.length} matched periods <span/> Half-hourly · UK time</div></div><div className="table-scroll"><table><thead><tr><th>PERIOD</th><th>DELIVERY START</th><th>FORECAST <small>MW</small></th><th>ACTUAL <small>MW</small></th><th>ERROR <small>MW</small></th><th>FORECAST PUBLISHED</th></tr></thead><tbody>{(selected?.points||[]).slice(0,12).map(p=>{const err=p.forecastMw!=null&&p.actualMw!=null?p.forecastMw-p.actualMw:null;return <tr key={p.startTime}><td className="period-cell">SP {String(p.period).padStart(2,'0')}</td><td>{time(p.startTime)}</td><td>{fmt(p.forecastMw)}</td><td>{fmt(p.actualMw)}</td><td className={err==null?'muted':err>0?'error-positive':'error-negative'}>{err==null?'—':`${err>0?'+':''}${fmt(err)}`}</td><td className="published">{time(p.publishTime)} {p.publishTime&&<span>UK</span>}</td></tr>})}</tbody></table>{(selected?.points||[]).length>12&&<div className="table-more">Showing first 12 periods · export CSV for the full month</div>}</div></section>
     <footer><span>Data © Elexon Limited · Source: Elexon BMRS Insights API</span><span><a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream" target="_blank" rel="noreferrer">FUELHH <ExternalLink size={11}/></a><i/> <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream" target="_blank" rel="noreferrer">WINDFOR <ExternalLink size={11}/></a><i/> Prototype · Not a trading instruction</span></footer>
    </>}
   </div>
  </main>
 </div>
}
export default App;


