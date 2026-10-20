// Finanzas y patrimonio: rendimiento del capital, proyecciones estadísticas y tamaño óptimo de flota.
// Todo se calcula en el navegador con los datos ya cargados; no hace consultas a Google.
(function(root){
'use strict';
const core=root.OCSystemCore||(typeof require!=='undefined'?require('./system-core.js'):null);
const NON_OPERATING=['TRANSFERENCIA','APORTE_CAPITAL','PRESTAMO'];
const OP_LABEL={COMPRA:'Compra',ARREGLO:'Arreglo',VENTA:'Venta',COSTO_AUTO:'Costo del auto'};
const sum=a=>a.reduce((s,x)=>s+x,0),avg=a=>a.length?sum(a)/a.length:0;
const ym=s=>String(s).slice(0,7);
const nextMonth=k=>{let y=Number(k.slice(0,4)),m=Number(k.slice(5,7))+1;if(m>12){m=1;y++;}return y+'-'+String(m).padStart(2,'0');};
const daysIn=k=>new Date(Date.UTC(Number(k.slice(0,4)),Number(k.slice(5,7)),0)).getUTCDate();

function confirmed(d,today){return d.movements.filter(core.active).filter(core.paid).filter(m=>core.date(m.fecha_operacion)&&m.fecha_operacion<=today);}
function monthList(start,today){const out=[];for(let k=ym(start);k<=ym(today)&&out.length<600;k=nextMonth(k))out.push(k);return out;}

// ---------- Rendimiento del capital ----------
function analyze(d,r,today){
 const moves=confirmed(d,today),sold=r.cars.filter(c=>c.sold);
 const contributions=moves.filter(m=>m.direccion==='ENTRADA'&&m.naturaleza==='APORTE_CAPITAL');
 const bySocio={};contributions.forEach(m=>{const k=m.socio||'Sin nombre';bySocio[k]=(bySocio[k]||0)+Number(m.monto);});
 const capital=sum(contributions.map(m=>Number(m.monto)));
 const carResult=sum(sold.map(c=>c.result||0)),overhead=sum(moves.filter(m=>m.direccion==='SALIDA'&&m.naturaleza==='GASTO').map(m=>Number(m.monto)));
 const profit=carResult-overhead,months=Math.max(1,r.dashboard.history.length);
 const parts=[r.cash,r.stock,r.receivable,r.loanAsset],assets=parts.some(x=>x===null||x===undefined)?null:sum(parts);
 const liabilities=r.debt===null?null:r.debt,equity=r.patrimony;
 const ratio=(a,b)=>a!==null&&b!==null&&b>0?a/b:null,annual=x=>x===null?null:x*12/months;
 const days=sold.map(c=>c.days).filter(Number.isFinite);
 return {
  capital,bySocio,carResult,overhead,profit,months,partial:sold.some(c=>c.result===null),soldCount:sold.length,
  assets,liabilities,equity,
  roe:ratio(profit,capital),roeAnnual:annual(ratio(profit,capital)),
  roa:ratio(profit,assets),roaAnnual:annual(ratio(profit,assets)),
  multiple:ratio(equity,capital),leverage:ratio(liabilities,equity),stockShare:ratio(r.stock,assets),
  avgDays:days.length?avg(days):null,turnover:days.length&&avg(days)>0?365/avg(days):null
 };
}

// ---------- Series mensuales por temática ----------
function theme(m){const base=m.categoria||'Sin categoría';return m.operacion_auto?base+' · '+(OP_LABEL[m.operacion_auto]||m.operacion_auto):base;}
function monthlySeries(d,today,start){
 const months=monthList(start,today),income={},expense={};
 confirmed(d,today).filter(m=>!NON_OPERATING.includes(m.naturaleza)).forEach(m=>{
  const bucket=m.direccion==='ENTRADA'&&m.naturaleza==='INGRESO'?income:m.direccion==='SALIDA'&&['GASTO','COSTO'].includes(m.naturaleza)?expense:null;if(!bucket)return;
  const k=theme(m),i=months.indexOf(ym(m.fecha_operacion));if(i<0)return;
  (bucket[k]||(bucket[k]=months.map(()=>0)))[i]+=Number(m.monto);
 });
 return {months,income,expense};
}
// Regresión lineal sobre hasta 6 meses cerrados. Si la pendiente no es distinguible del ruido (|t|<1.5) o hay <4 meses, usa el promedio. <3 meses: no proyecta.
function trendForecast(values,horizon=3){
 const y=values.slice(-6),k=y.length;if(k<3)return null;
 const xs=y.map((_,i)=>i),mx=avg(xs),my=avg(y),sxx=sum(xs.map(x=>(x-mx)**2)),sxy=sum(xs.map((x,i)=>(x-mx)*(y[i]-my)));
 const slope=sxx?sxy/sxx:0,icpt=my-slope*mx,resid=y.map((v,i)=>v-(icpt+slope*i)),sd=Math.sqrt(sum(resid.map(e=>e*e))/Math.max(1,k-2));
 const t=sd>0?slope/(sd/Math.sqrt(sxx)):(slope===0?0:Infinity),useTrend=k>=4&&Math.abs(t)>=1.5;
 const est=Array.from({length:horizon},(_,j)=>Math.max(0,Math.round(useTrend?icpt+slope*(k+j):my)));
 return {est,sd:Math.round(sd),mean:Math.round(my),slope:Math.round(slope),n:k,method:useTrend?'tendencia':'promedio',confidence:k>=6?'media':'baja'};
}
function projections(d,today,start,horizon=3){
 const s=monthlySeries(d,today,start),closed=s.months.filter(k=>k<ym(today)).length,build=bucket=>Object.entries(bucket).map(([name,vals])=>({name,last3:Math.round(avg(vals.slice(0,closed).slice(-3))),forecast:trendForecast(vals.slice(0,closed),horizon),total:sum(vals)})).sort((a,b)=>b.total-a.total);
 const income=build(s.income),expense=build(s.expense),tot=rows=>Array.from({length:horizon},(_,j)=>rows.some(x=>x.forecast)?sum(rows.map(x=>x.forecast?x.forecast.est[j]:x.last3)):null);
 const nextMonths=[];for(let k=ym(today),i=0;i<horizon;i++){k=nextMonth(k);nextMonths.push(k);}
 return {closedMonths:closed,nextMonths,income,expense,totalIncome:tot(income),totalExpense:tot(expense)};
}

// ---------- Rentabilidad por cantidad de autos ----------
// Ventas/mes = k·N^β (N = autos promedio en stock). β por regresión log-log con la historia (acotado 0,3–1); sin historia β=1.
// Utilidad(N) = margen por auto vendido · ventas(N) − gastos generales − costo mensual del capital inmovilizado.
function stockByMonth(cars,months,today){
 return months.map(k=>{const first=k+'-01',days=k===ym(today)?Number(today.slice(8)):daysIn(k),last=k+'-'+String(days).padStart(2,'0');let present=0;
  cars.forEach(c=>{if(!core.date(c.entryDate))return;const a=c.entryDate>first?c.entryDate:first,end=c.sold&&core.date(c.saleDate)?c.saleDate:today,b=end<last?end:last;if(b<a)return;present+=(Date.parse(b)-Date.parse(a))/86400000+1;});
  return {month:k,stock:present/days};});
}
function fleetModel(d,r,today,params={}){
 const hist=r.dashboard.history,months=hist.map(h=>h.month),sb=stockByMonth(r.cars,months,today);
 const pts=hist.map((h,i)=>({n:sb[i].stock,sales:h.sales})).filter(p=>p.n>=0.5);
 const soldOk=r.cars.filter(c=>c.sold&&c.result!==null),margin=soldOk.length?avg(soldOk.map(c=>c.result)):null;
 const costs=r.cars.filter(c=>c.modality==='PROPIO'&&c.cost!==null).map(c=>c.cost),carCost=costs.length?avg(costs):null;
 const closed=months.filter(k=>k<ym(today)),byMonth={};
 confirmed(d,today).filter(m=>m.direccion==='SALIDA'&&m.naturaleza==='GASTO').forEach(m=>{const k=ym(m.fecha_operacion);byMonth[k]=(byMonth[k]||0)+Number(m.monto);});
 const recent=closed.slice(-3).filter(k=>byMonth[k]!==undefined),overhead=recent.length?avg(recent.map(k=>byMonth[k])):(byMonth[ym(today)]||0);
 const currentN=r.cars.filter(c=>!c.sold&&c.status!=='RETIRADO').length,usable=pts.filter(p=>p.sales>0);
 if(margin===null||carCost===null||!usable.length||currentN===0)return {ready:false,reason:'Faltan autos vendidos con resultado, costo de compra de autos propios o historia de ventas para modelar.',margin,carCost,overhead,currentN};
 let beta=1,k=sum(usable.map(p=>p.sales))/sum(usable.map(p=>p.n)),method='proporcional';
 const lx=usable.map(p=>Math.log(p.n)),ly=usable.map(p=>Math.log(p.sales)),mx=avg(lx),my=avg(ly),sxx=sum(lx.map(x=>(x-mx)**2));
 if(usable.length>=4&&Math.sqrt(sxx/usable.length)>=0.15){beta=Math.min(1,Math.max(0.3,sum(lx.map((x,i)=>(x-mx)*(ly[i]-my)))/sxx));k=Math.exp(my-beta*mx);method='ajustado a la historia';}
 const carry=params.costOfCapital??0.01,capacity=Math.max(1,Math.round(params.capacity||Math.floor(((r.cash||0)+(r.stock||0))/carCost)||currentN*2));
 const profit=N=>margin*k*N**beta-overhead-carry*carCost*N,curve=[];for(let N=0;N<=Math.min(capacity,80);N++)curve.push({n:N,profit:Math.round(profit(N))});
 let best=curve[1]||curve[0];curve.forEach(p=>{if(p.n>0&&p.profit>best.profit)best=p;});
 const breakEven=curve.find(p=>p.n>0&&p.profit>=0)||null,salesNow=k*currentN**beta,marginalNow=margin*k*beta*currentN**(beta-1)-carry*carCost;
 return {ready:true,margin:Math.round(margin),carCost:Math.round(carCost),overhead:Math.round(overhead),carry,capacity,beta,k,method,monthsUsed:usable.length,
  confidence:usable.length<4?'insuficiente':usable.length<8?'baja':'media',currentN,salesNow,profitNow:Math.round(profit(currentN)),profitPerCar:Math.round(profit(currentN)/currentN),
  contributionPerCar:Math.round(margin*salesNow/currentN),marginalNow:Math.round(marginalNow),optimal:best,breakEven:breakEven&&breakEven.n,curve};
}

const api={analyze,monthlySeries,trendForecast,projections,fleetModel,stockByMonth,theme};
if(typeof module!=='undefined')module.exports=api;
if(!root.document)return;

// ---------- Presentación ----------
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n):'Sin datos';
const pct=n=>Number.isFinite(n)?(n*100).toFixed(1).replace('.',',')+' %':'Sin datos';
const mult=n=>Number.isFinite(n)?n.toFixed(2).replace('.',',')+'×':'Sin datos';
const month=k=>{const [y,m]=k.split('-');return ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][Number(m)-1]+' '+y.slice(2);};
const table=(h,rows)=>'<div class="oc-table-scroll"><table><thead><tr>'+h.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const signClass=n=>!Number.isFinite(n)||n===0?'':n>0?' oc-pos':' oc-neg';
let ui={capacity:null,carry:1};

function kpis(a){
 const cards=[
  ['ROE (utilidad / capital de socios)',pct(a.roe),a.roeAnnual===null?'':'Anualizado '+pct(a.roeAnnual),a.roe],
  ['ROA (utilidad / activos)',pct(a.roa),a.roaAnnual===null?'':'Anualizado '+pct(a.roaAnnual),a.roa],
  ['Patrimonio / capital aportado',mult(a.multiple),a.multiple===null?'':(a.multiple>=1?'El capital ha crecido':'El capital ha disminuido'),a.multiple===null?null:a.multiple-1],
  ['Endeudamiento (pasivos / patrimonio)',mult(a.leverage),'',null],
  ['Activos en stock de autos',pct(a.stockShare),'Capital inmovilizado',null],
  ['Rotación del stock',a.turnover===null?'Sin datos':a.turnover.toFixed(1).replace('.',',')+' veces/año',a.avgDays===null?'':'Promedio '+Math.round(a.avgDays)+' días por auto vendido',null]
 ];
 return '<section class="oc-metrics oc-six">'+cards.map(([k,v,sub,sig])=>'<article><p>'+esc(k)+'</p><strong class="'+signClass(sig).trim()+'">'+esc(v)+'</strong><small>'+esc(sub)+'</small></article>').join('')+'</section>';
}
function structure(a,r){
 const rows=[['Caja y bancos',r.cash],['Stock propio al costo',r.stock],['Por cobrar',r.receivable],['Préstamos otorgados',r.loanAsset],['Pasivos',a.liabilities===null?null:-a.liabilities],['Patrimonio',a.equity]];
 const max=Math.max(1,...rows.map(x=>Math.abs(x[1]||0)));
 return '<section class="oc-card oc-chart"><h2>Balance simplificado</h2>'+rows.map(([n,v])=>'<div class="oc-bar-row"><span>'+esc(n)+'</span><div class="oc-bar-track"><i style="width:'+(v===null?0:Math.abs(v)/max*100)+'%;background:'+(v<0?'#a23e38':'#947243')+'"></i></div><b>'+money(v)+'</b></div>').join('')+'</section>';
}
function capitalCard(a){
 const rows=Object.entries(a.bySocio).sort((x,y)=>y[1]-x[1]);
 return '<section class="oc-card"><h2>Capital aportado por los socios</h2>'+(rows.length?table(['Socio','Aportado'],rows.map(([s,v])=>[esc(s),money(v)]).concat([['<b>Total</b>','<b>'+money(a.capital)+'</b>']])):'<p>Aún no hay aportes de capital clasificados en Caja y bancos. Sin ese dato el ROE no se puede calcular.</p>')+
  '<p>Utilidad del período: resultado de autos vendidos '+money(a.carResult)+' menos gastos generales '+money(a.overhead)+' = <b class="'+signClass(a.profit).trim()+'">'+money(a.profit)+'</b>'+(a.partial?' · parcial: hay autos vendidos sin costo completo':'')+'. Período: '+a.months+' mes(es) de historia.</p></section>';
}
function projectionCard(p){
 const head=['Temática','Promedio últimos 3 meses',...p.nextMonths.map(month),'Método'];
 const row=x=>[esc(x.name),money(x.last3),...(x.forecast?x.forecast.est.map(money):p.nextMonths.map(()=>'<small>Sin historia (menos de 3 meses)</small>')),x.forecast?esc(x.forecast.method+' · '+x.forecast.n+' meses · ±'+money(x.forecast.sd)):'—'];
 const totalRow=(label,t)=>['<b>'+label+'</b>','',...p.nextMonths.map((_,j)=>'<b>'+money(t[j])+'</b>'),''];
 return '<section class="oc-card"><h2>Proyección por temática (estadística)</h2><p>Se calcula con la caja confirmada de meses cerrados ('+p.closedMonths+' disponibles), sin usar compromisos. Regresión lineal sobre hasta 6 meses; si la tendencia no es distinguible del ruido se proyecta el promedio.</p>'+
  '<h3>Ingresos</h3>'+table(head,p.income.map(row).concat(p.income.length?[totalRow('Total ingresos',p.totalIncome)]:[]))+(p.income.length?'':'<p>Sin ingresos clasificados todavía.</p>')+
  '<h3>Gastos y costos</h3>'+table(head,p.expense.map(row).concat(p.expense.length?[totalRow('Total gastos y costos',p.totalExpense)]:[]))+(p.expense.length?'':'<p>Sin gastos clasificados todavía.</p>')+'</section>';
}
function curveSvg(f){
 const pts=f.curve,xs=pts.map(p=>p.n),ys=pts.map(p=>p.profit),lo=Math.min(0,...ys),hi=Math.max(1,...ys),rg=hi-lo||1,X=n=>50+n/Math.max(1,xs[xs.length-1])*660,Y=v=>190-(v-lo)/rg*160;
 let svg='<svg viewBox="0 0 760 235" role="img" aria-label="Utilidad mensual estimada según cantidad de autos"><line x1="50" y1="'+Y(0)+'" x2="710" y2="'+Y(0)+'" stroke="#c9bdac"/>';
 svg+='<polyline fill="none" stroke="#947243" stroke-width="3" points="'+pts.map(p=>X(p.n)+','+Y(p.profit)).join(' ')+'"/>';
 [[f.currentN,'Hoy','#3b2f21'],[f.optimal.n,'Óptimo estimado','#36765a']].forEach(([n,label,color])=>{if(n>0&&n<=xs[xs.length-1]){const p=pts[n];svg+='<line x1="'+X(n)+'" y1="30" x2="'+X(n)+'" y2="190" stroke="'+color+'" stroke-dasharray="4 4"/><circle cx="'+X(n)+'" cy="'+Y(p.profit)+'" r="5" fill="'+color+'"/><text x="'+X(n)+'" y="22" text-anchor="middle" font-size="12" fill="'+color+'">'+label+' ('+n+')</text>';}});
 return svg+'<text x="50" y="215" font-size="12">0 autos</text><text x="710" y="215" text-anchor="end" font-size="12">'+xs[xs.length-1]+' autos</text></svg>';
}
function fleetCard(f){
 if(!f.ready)return '<section class="oc-card"><h2>Rentabilidad según cantidad de autos</h2><p>'+esc(f.reason)+'</p></section>';
 const rows=[['Margen promedio por auto vendido',money(f.margin)],['Costo promedio de un auto propio',money(f.carCost)],['Gastos generales por mes',money(f.overhead)],['Autos en stock hoy',String(f.currentN)],['Ventas estimadas por mes con el stock de hoy',f.salesNow.toFixed(1).replace('.',',')],['Aporte bruto por auto en stock (por mes)',money(f.contributionPerCar)],['Utilidad mensual estimada hoy',money(f.profitNow)],['Utilidad mensual por auto (después de gastos generales y capital)',money(f.profitPerCar)],['Aporte de un auto adicional (marginal, por mes)',money(f.marginalNow)],['Autos para cubrir los gastos generales',f.breakEven===null?'No alcanza con la capacidad indicada':String(f.breakEven)],['Cantidad óptima estimada',f.optimal.n+' autos · utilidad '+money(f.optimal.profit)+'/mes']];
 return '<section class="oc-card oc-chart"><h2>Rentabilidad según cantidad de autos</h2><p>Modelo: ventas/mes = k·N<sup>β</sup> con β='+f.beta.toFixed(2).replace('.',',')+' ('+esc(f.method)+', '+f.monthsUsed+' meses con datos). Confianza <b>'+esc(f.confidence)+'</b>: es una estimación estadística, no una garantía.</p>'+
  '<div class="oc-fleet-inputs"><label>Capacidad máxima de autos<input id="of-capacity" type="number" min="1" max="80" step="1" value="'+f.capacity+'"></label><label>Costo mensual del capital (%)<input id="of-carry" type="number" min="0" max="10" step="0.1" value="'+(f.carry*100).toFixed(1)+'"></label></div>'+curveSvg(f)+table(['Indicador','Valor'],rows.map(r=>[esc(r[0]),'<b>'+esc(r[1])+'</b>']))+'</section>';
}
function markup(d,r,today){
 const a=analyze(d,r,today),p=projections(d,today,r.dashboard.start),f=fleetModel(d,r,today,{capacity:ui.capacity,costOfCapital:ui.carry/100});
 return kpis(a)+(r.warnings&&r.warnings.length?'<section class="oc-card oc-warn"><h2>Cuentas que no cuadran</h2><ul>'+r.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></section>':'')+
  '<div class="oc-dashboard-grid">'+structure(a,r)+capitalCard(a)+'</div>'+projectionCard(p)+'<div id="of-fleet">'+fleetCard(f)+'</div>';
}
function mount(host,d,r,today){
 const box=host.querySelector('#of-fleet');if(!box)return;
 const bind=()=>{const cap=box.querySelector('#of-capacity'),carry=box.querySelector('#of-carry');if(!cap)return;
  const apply=()=>{ui.capacity=Math.max(1,Math.min(80,Number(cap.value)||1));ui.carry=Math.max(0,Math.min(10,Number(carry.value)||0));box.innerHTML=fleetCard(fleetModel(d,r,today,{capacity:ui.capacity,costOfCapital:ui.carry/100}));bind();};
  cap.onchange=apply;carry.onchange=apply;};
 bind();
}
root.OCFinanzas={...api,markup,mount};
})(typeof window==='undefined'?globalThis:window);
