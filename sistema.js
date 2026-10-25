(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n):'Por completar';
let options={},host,view='',busy=false,message='';
// Toda la lectura sale de memoria (el store). No hay consultas a Google al navegar entre vistas.
const S=()=>options.store?options.store.state():{};
const today=()=>options.store?options.store.today():new Date().toISOString().slice(0,10);

const defs={
 VEHICULOS:{title:'Registrar auto',key:'vehiculo_id',data:'inventory',fields:[['patente','Patente','text'],['marca','Marca','text'],['modelo','Modelo','text'],['anio','Año','number']]},
 AUTOS_OPERACION:{title:'Ficha del auto',key:'vehiculo_id',data:'operations',fields:[['vehiculo_id','Auto','auto'],['modalidad','Modalidad',['PROPIO','CONSIGNADO']],['fecha_ingreso','Ingreso','date'],['estado_auto','Estado',['PREPARACION','DISPONIBLE','RESERVADO','VENDIDO','RETIRADO']],['notas','Notas','text']]},
 PROYECCIONES:{title:'Compromiso de cobro o pago',key:'proyeccion_id',data:'forecasts',fields:[['fecha','Fecha esperada','date'],['direccion','Dirección',['ENTRADA','SALIDA']],['tipo','Tipo',['CUOTA_VENTA','INGRESO_ESPERADO','DEUDA','CONSIGNACION','GASTO_PREVISTO','SERVICIO_30_DIAS']],['descripcion','Descripción','text'],['vehiculo_id','Auto, si corresponde','auto-optional'],['monto','Monto','number']]},
 APORTES_CAPITAL_SOCIOS:{title:'Aporte de socio (capital o trabajo)',key:'aporte_id',data:'contributions',fields:[['socio','Socio o descripción','text'],['fecha','Fecha','date'],['monto','Monto','number']]},
 PRESTAMOS:{title:'Préstamo',key:'prestamo_id',data:'loans',fields:[['nombre','Nombre / contraparte','text'],['sentido','Tipo',['RECIBIDO','OTORGADO']],['saldo_inicial','Principal pendiente al cierre de la fecha','number'],['fecha_saldo','Fecha del saldo','date'],['fecha_vencimiento','Vencimiento','date']]}
};
function setup(o={}){options=o;message='';}
const table=(headers,rows)=>'<div class="oc-table-scroll"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const title=v=>String(v||'').replaceAll('_',' ').toLowerCase();
const car=id=>{const v=(S().inventory||[]).find(x=>String(x.vehiculo_id)===String(id));return v?[v.vehiculo_id,v.patente,v.marca,v.modelo].filter(Boolean).join(' · '):id;};
const button=(tab,text)=>'<button data-system-new="'+tab+'">'+text+'</button>';
const edit=(tab,id)=>'<button data-system-edit="'+tab+'" data-record="'+esc(id)+'">Editar</button>';
// Verde si es cero; el número en rojo si falta.
const count=n=>n===0?'<b class="oc-ok">0 ✓</b>':'<b class="oc-bad">'+esc(n)+'</b>';
const chip=(text,tone)=>'<span class="oc-chip oc-chip-'+tone+'">'+esc(text)+'</span>';

const carFin=id=>((S().report||{}).cars||[]).find(c=>String(c.id)===String(id))||null;
const pct=v=>v===null||v===undefined?'—':(Math.round(v*10)/10).toLocaleString('es-CL')+'%';
const tone=v=>v===null||v===undefined?'':v>=0?' class="oc-ok"':' class="oc-bad"';
// Resumen del auto con lo que ya está asignado en Caja y bancos.
const fmtDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.slice(8,10)+'-'+v.slice(5,7)+'-'+v.slice(0,4):'Sin fecha';
const lineRows=ls=>'<ul class="oc-lines">'+ls.map(l=>'<li><span>'+esc(fmtDay(l.date))+'</span><span>'+esc(l.text)+(l.concept?' <small>· '+esc(l.concept)+'</small>':'')+(l.confirmed?'':' <small class="oc-bad">por confirmar</small>')+'</span><b>'+money(l.amount)+'</b></li>').join('')+'</ul>';
// Fila desplegable: clic para ver los movimientos de caja que la componen.
const fold=(label,total,ls,extra)=>'<details class="oc-fold"><summary><span>'+label+'</span><b>'+total+'</b></summary>'+(ls.length?lineRows(ls):'<p class="oc-bad">Todavía no hay movimientos asignados.</p>')+(extra||'')+'</details>';
// Resumen del auto con lo que ya está asignado en Caja y bancos; cada línea se abre para ver el detalle.
function finPanel(id){
 const c=carFin(id);if(!id||!c)return '<p>Elige un auto para ver lo asignado en Caja y bancos.</p>';
 const cons=c.modality==='CONSIGNADO',ls=c.lines||[],res=c.sale!==null&&c.purchase!==null?c.sale-c.purchase-c.preparation:null;
 const buy=ls.filter(l=>l.op==='COMPRA'&&l.dir==='SALIDA'),sale=ls.filter(l=>l.op==='VENTA'&&l.dir==='ENTRADA'),costs=ls.filter(l=>l.dir==='SALIDA'&&l.op!=='COMPRA'&&l.op!=='VENTA');
 const groups={};costs.forEach(l=>{(groups[l.concept||'Sin concepto']=groups[l.concept||'Sin concepto']||[]).push(l);});
 const costBody=Object.keys(groups).sort((a,b)=>groups[b].reduce((s,l)=>s+l.amount,0)-groups[a].reduce((s,l)=>s+l.amount,0)).map(k=>fold(esc(k),money(groups[k].reduce((s,l)=>s+l.amount,0)),groups[k])).join('');
 return '<div class="oc-fin">'+
  fold(cons?'Pago al dueño (concepto Compra)':'Compra',c.purchase===null?'<span class="oc-bad">Falta asignar</span>':money(c.purchase),buy)+
  '<details class="oc-fold"><summary><span>Arreglos y costos del auto</span><b>'+money(c.preparation)+'</b></summary>'+(costBody||'<p class="oc-bad">Todavía no hay costos asignados.</p>')+'</details>'+
  fold('Venta cobrada',c.income>0?money(c.income):'<span class="oc-bad">Falta asignar</span>',sale)+
  '<div class="oc-fold-total"><span>'+(cons?'Margen (comisión)':'Margen')+'</span><b'+tone(res)+'>'+(res===null?'—':money(res)+' · '+pct(c.sale>0?res/c.sale*100:null))+'</b></div></div>'+
  '<small>Fecha de ingreso: '+esc(c.entryDate?fmtDay(c.entryDate)+(c.entryInferred?' (primera compra)':''):'sin dato')+' · Día de venta: '+esc(c.saleDateCaja?fmtDay(c.saleDateCaja)+' (último cobro)':'sin cobro')+' · Días en inventario: '+esc(c.days??'—')+'.</small><br><small>Todo viene de la caja asignada a este auto. Para cambiarlo, edita el movimiento en Caja y bancos.</small>';
}
function markup(v){
 view=v;
 const labels={operaciones:'Autos y operación',gestion:'Finanzas y patrimonio',compromisos:'Compromisos no caja',analitica:'Reportes consolidados',parametros:'Configuración'};
 if(!options.connected)return '<section class="oc-card"><h2>'+(labels[v]||'Resumen')+'</h2><p>La conexión con Google todavía no está activada. Aquí aparecerán tus datos reales.</p></section>';
 const st=S(),r=st.report||{},cars=r.cars||[];let content='';
 if(v==='resumen')content=operational(r,cars);
 else if(v==='analitica')content=management(r,cars)+(root.OCCaja?.expenseMarkup()||'');
 else if(!st.canFinance&&v!=='operaciones')content='<section class="oc-card">Tu perfil no tiene acceso a finanzas.</section>';
 else if(v==='operaciones')content=operations(st,cars);
 else if(v==='gestion')content=root.OCFinanzas?root.OCFinanzas.markup(st.raw,r,today()):'';
 else if(v==='compromisos')content=commitments(r);
 else if(v==='parametros')content=settings(st,r);
 return '<div id="os-panel"><p role="status" id="os-message" class="'+(message.startsWith('⚠')?'oc-msg-warn':'')+'">'+esc(message)+'</p>'+content+'</div>';
}

// ---------- Seguimiento operacional ----------
function operational(r,cars){
 const a=r.dashboard||{},day=r.today||today(),total=new Date(Number(day.slice(0,4)),Number(day.slice(5,7)),0).getDate(),pending=a.pendingAccounts||[];
 const open=pending.reduce((s,x)=>s+x.count,0);
 return '<section class="oc-metrics"><article><p>Stock</p><strong>'+(a.stockCount??cars.filter(c=>!c.sold).length)+'</strong></article><article><p>Avance del mes</p><strong>Día '+Number(day.slice(8))+' / '+total+'</strong></article><article><p>Movimientos por resolver</p><strong>'+count(open)+'</strong></article></section>'+
 '<section class="oc-card"><h2>Movimientos sin conciliar</h2>'+table(['Cuenta','Sin clasificar','Por asignar auto','Total'],pending.map(x=>[esc(x.name),count(x.noConcept),count(x.carPending),count(x.count)]).concat([['<b>Todas las cuentas</b>',count(pending.reduce((s,x)=>s+x.noConcept,0)),count(pending.reduce((s,x)=>s+x.carPending,0)),count(open)]]))+'</section>'+
 '<section class="oc-card"><h2>Inventario propio</h2>'+table(['Auto','Estado','Ingreso','Días en inventario'],cars.filter(c=>c.modality==='PROPIO'&&!c.sold&&c.status!=='RETIRADO').map(c=>[esc(car(c.id)),esc(title(c.status)),esc(c.entryDate),esc(c.days??'—')]))+'</section>';
}

// ---------- Resumen gerencial ----------
function bars(label,items,moneyValues=false,extra=''){
 const max=Math.max(1,...items.map(x=>Math.abs(x[1]||0)));
 return '<section class="oc-card oc-chart"><h2>'+esc(label)+'</h2>'+(!items.length?'<p>Sin registros todavía.</p>':items.map(([name,value])=>'<div class="oc-bar-row"><span>'+esc(name)+'</span><div class="oc-bar-track"><i style="width:'+(value===null?0:Math.abs(value)/max*100)+'%;background:'+(value<0?'#a23e38':'#947243')+'"></i></div><b>'+(value===null?'Sin datos':moneyValues?money(value):esc(value))+'</b></div>').join(''))+extra+'</section>';
}
const mill=v=>{const m=Math.round(v/1e5)/10;return String(m).replace('.',',')+'M';};
// Ticks redondos en millones (1M, 2M, 5M, 10M…) entre el mínimo y el máximo.
const niceTicks=(low,high)=>{const raw=Math.max(1e6,(high-low)/5),p=Math.pow(10,Math.floor(Math.log10(raw))),step=[1,2,5,10].map(k=>k*p).find(x=>x>=raw);const out=[];for(let v=Math.ceil(low/step)*step;v<=high&&out.length<12;v+=step)if(v!==0)out.push(v);return out;};
function trend(label,rows,series,wide){
 const vals=rows.flatMap(r=>series.map(s=>r[s[0]])).filter(Number.isFinite),low=Math.min(0,...vals),high=Math.max(1,...vals),range=high-low||1;
 const W=wide?1200:760,H=wide?340:235,base=H-45,top=wide?20:30;
 const x=i=>(wide?70:40)+i*(W-(wide?110:80))/Math.max(1,rows.length-1),y=v=>base-(v-low)/range*(base-top);
 let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(label)+'"><line x1="'+(wide?70:40)+'" y1="'+base+'" x2="'+(W-40)+'" y2="'+base+'" stroke="#c9bdac"/>';
 if(wide)niceTicks(low,high).forEach(v=>{svg+='<line x1="70" y1="'+y(v)+'" x2="'+(W-40)+'" y2="'+y(v)+'" stroke="#eee7db"/><text x="62" y="'+(y(v)+4)+'" text-anchor="end" font-size="12" fill="#82735d">'+esc(mill(v))+'</text>';});
 series.forEach(([key,name,color])=>{let part=[];const flush=()=>{if(part.length)svg+='<polyline fill="none" stroke="'+color+'" stroke-width="3" points="'+part.join(' ')+'"/>';part=[];};rows.forEach((r,i)=>{if(!Number.isFinite(r[key])){flush();return;}part.push(x(i)+','+y(r[key]));svg+='<circle cx="'+x(i)+'" cy="'+y(r[key])+'" r="4" fill="'+color+'"><title>'+esc(r.month+' · '+name+': '+money(r[key]))+'</title></circle>';});flush();});
 (wide?rows.map((r,i)=>i):[0,rows.length-1]).filter((v,i,a)=>a.indexOf(v)===i&&v>=0).forEach(i=>svg+='<text x="'+x(i)+'" y="'+(base+25)+'" text-anchor="middle" font-size="12">'+esc(wide?mmmYY(rows[i].month):rows[i].month)+'</text>');svg+='</svg>';
 return '<section class="oc-card oc-chart'+(wide?' os-wide':'')+'"><h2>'+esc(label)+'</h2>'+svg+'<p>'+series.map(s=>'<span style="color:'+s[2]+'">● '+esc(s[1])+'</span>').join(' · ')+'</p>'+(!vals.length?'<p>Sin saldos confirmados para este período.</p>':'')+'<details><summary>Ver valores por mes</summary>'+table(['Mes',...series.map(s=>s[1])],rows.map(r=>[esc(r.month),...series.map(s=>money(r[s[0]]))]))+'</details></section>';
}
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const mmmYY=m=>/^\d{4}-\d{2}$/.test(m||'')?MESES[Number(m.slice(5,7))-1]+'-'+m.slice(2,4):String(m||'');
// Rentabilidad en %: largo de barra = margen sobre la venta; se muestra el % y el monto.
function marginChart(list){
 const rows=list.map(c=>({label:c.label,result:c.result,pct:c.result!==null&&c.sale>0?c.result/c.sale*100:null})),max=Math.max(1,...rows.map(r=>Math.abs(r.pct||0)));
 return '<section class="oc-card oc-chart"><h2>Rentabilidad · últimos 4 vendidos</h2>'+(!rows.length?'<p>Sin registros todavía.</p>':rows.map(r=>'<div class="oc-bar-row"><span>'+esc(r.label)+'</span><div class="oc-bar-track"><i style="width:'+(r.pct===null?0:Math.abs(r.pct)/max*100)+'%;background:'+(r.pct<0?'#a23e38':'#947243')+'"></i></div><b>'+(r.pct===null?'Sin datos':pct(r.pct)+'<small style="display:block;font-weight:400">'+money(r.result)+'</small>')+'</b></div>').join(''))+'<p><small>Margen sobre el precio de venta.</small></p></section>';
}
function salesChart(rows){const max=Math.max(1,...rows.map(r=>r.sales));return '<section class="oc-card oc-chart"><h2>Ventas mensuales</h2><div class="oc-sales-chart">'+rows.map(r=>'<div><b>'+r.sales+'</b><i style="height:'+r.sales/max*120+'px"></i><small>'+esc(mmmYY(r.month))+'</small></div>').join('')+'</div><p>Ventas registradas por mes</p></section>';}
// Costos asignados a un auto, sumados por concepto (lavados, combustible, fotografías, publicaciones…).
function carExpensesCard(rows){
 const total=rows.reduce((s,x)=>s+x.total,0),month=rows.reduce((s,x)=>s+x.month,0);
 return bars('Costos asignados a autos, por concepto',rows.map(x=>[x.name+' · '+x.cars+(x.cars===1?' auto':' autos'),x.total]),true,
  rows.length?'<p><b>Total asignado a autos: '+money(total)+'</b> · este mes '+money(month)+'</p><details><summary>Ver por concepto</summary>'+table(['Concepto','Autos','Movimientos','Este mes','Total'],rows.map(x=>[esc(x.name),x.cars,x.count,money(x.month),money(x.total)]))+'</details>':'<p>Cuando asignes un costo a un auto en Caja y bancos (lavado, combustible, fotos, publicación) aparecerá sumado aquí.</p>');
}
// Caja: los mismos saldos por cuenta que Caja y bancos. Stock propio al costo: compra + gastos de cada auto propio en stock.
function cashTotal(){
 const rows=root.OCCajaNueva&&root.OCCajaNueva.accountBalances?root.OCCajaNueva.accountBalances():[],known=rows.filter(a=>Number.isFinite(a.value));
 return known.length?known.reduce((t,a)=>t+a.value,0):null;
}
const stockAtCost=cars=>cars.filter(c=>c.modality==='PROPIO'&&!c.sold&&c.status!=='RETIRADO').reduce((t,c)=>t+(c.purchase||0)+(c.preparation||0),0);
// ¿Si cerramos hoy y vendemos todo, recuperamos lo que pusieron los socios?
// Lo recuperable = caja + stock propio (al costo o a precio publicado) + por cobrar + préstamos otorgados − deudas.
function capitalCard(r,cars,cash,stock){
 const cap=r.capital||{total:0,rows:[],count:0},stockCars=cars.filter(c=>c.modality==='PROPIO'&&!c.sold&&c.status!=='RETIRADO');
 const listed=stockCars.reduce((t,c)=>t+(Number.isFinite(c.listPrice)&&c.listPrice>0?c.listPrice:(c.purchase||0)+(c.preparation||0)),0);
 const rest=(r.receivable||0)+(r.loanAsset||0)-(r.debt||0),atCost=(cash||0)+stock+rest,atList=(cash||0)+listed+rest;
 if(!cap.total)return '<section class="oc-card os-capital"><h2>Capital de los socios</h2><p>Todavía no hay aportes en la caja. Cuando registres los aportes de los socios en Caja histórica (concepto de aporte de capital) aquí verás cuánto se recuperaría si hoy se cierra y se vende todo.</p></section>';
 const max=Math.max(cap.total,atList,atCost,1),w=v=>Math.max(0,Math.min(100,v/max*100)),line=w(cap.total);
 const row=(label,value,note)=>{const ok=Math.min(Math.max(value,0),cap.total),gap=cap.total-ok,extra=Math.max(0,value-cap.total);
  return '<div class="os-cap-row"><span>'+esc(label)+'<small>'+esc(note)+'</small></span><div class="os-cap-track"><i class="os-cap-ok" style="width:'+w(ok)+'%"></i><i class="os-cap-gap" style="left:'+w(ok)+'%;width:'+w(gap)+'%"></i>'+(extra?'<i class="os-cap-extra" style="left:'+w(cap.total)+'%;width:'+w(extra)+'%"></i>':'')+'<em style="left:'+line+'%"></em></div><b>'+money(value)+'<small class="'+(gap?'oc-bad':'oc-ok')+'">'+(gap?'Faltan '+money(gap):'Se recupera todo')+'</small></b></div>';};
 const pctCost=Math.round(Math.max(0,atCost)/cap.total*100),gapCost=Math.max(0,cap.total-atCost);
 return '<section class="oc-card os-capital"><div class="os-cap-head"><div><p class="oc-eyebrow">CAPITAL DE LOS SOCIOS</p><h2>Si hoy cerramos y vendemos todo, se recupera '+money(Math.max(0,atCost))+' de '+money(cap.total)+' ('+pctCost+' %)</h2>'+(gapCost?'<p class="oc-bad"><b>Faltan '+money(gapCost)+'</b> para devolver lo aportado.</p>':'<p class="oc-ok"><b>Alcanza para devolver todo lo aportado.</b></p>')+'</div></div>'+
  '<div class="os-cap-chart"><div class="os-cap-row"><span>Aportado por los socios<small>registrado en la caja</small></span><div class="os-cap-track"><i class="os-cap-in" style="width:'+line+'%"></i><em style="left:'+line+'%"></em></div><b>'+money(cap.total)+'</b></div>'+
  row('Cerrando hoy · stock al costo',atCost,'caja + autos a lo que costaron')+row('Cerrando hoy · stock a precio publicado',atList,'caja + autos vendidos al precio de Claxo')+'</div>'+
  '<p class="os-cap-legend"><span><i class="os-cap-in"></i>Aportado</span><span><i class="os-cap-ok"></i>Se recupera</span><span><i class="os-cap-gap"></i>No se recupera</span><span><i class="os-cap-extra"></i>Sobra</span></p>'+
  '<details><summary>Ver cómo se calcula</summary>'+table(['Concepto','Al costo','A precio publicado'],[['Caja y bancos',money(cash),money(cash)],['Stock propio ('+stockCars.length+' autos)',money(stock),money(listed)],['Por cobrar',money(r.receivable||0),money(r.receivable||0)],['Préstamos otorgados',money(r.loanAsset||0),money(r.loanAsset||0)],['Deudas',money(r.debt?-r.debt:0),money(r.debt?-r.debt:0)],['<b>Se recupera</b>','<b>'+money(atCost)+'</b>','<b>'+money(atList)+'</b>'],['<b>Aportado por los socios</b>','<b>'+money(cap.total)+'</b>','<b>'+money(cap.total)+'</b>']])+
  '<p><small>Aportes registrados en la caja: '+(Object.keys(cap.bySocio||{}).length?Object.entries(cap.bySocio).map(([k,v])=>esc(k)+' '+money(v)).join(' · '):'—')+'.</small></p></details></section>';
}
function management(r,cars){
 const a=r.dashboard||{},h=a.history||[],cash=cashTotal(),stock=stockAtCost(cars);
 const patrimony=cash===null?null:cash+stock+(r.receivable||0)+(r.loanAsset||0)-(r.debt||0);
 const salesNow=((h[h.length-1]||{}).month===String(r.today||today()).slice(0,7)?h[h.length-1].sales:0);
 const metrics=[['Ventas del mes',salesNow],['Utilidad de ventas del mes',money(a.profit??0),(a.profitSales?pct(a.profit/a.profitSales*100)+' sobre la venta':'venta − compra − costos')+(a.profitMissing?' · '+a.profitMissing+' sin compra asignada':'')],['Margen promedio',Number.isFinite(a.margin)?a.margin.toFixed(1)+' %':'Sin datos'],['Autos en stock',a.stockCount??cars.filter(c=>!c.sold).length],['Cuentas por cobrar',money(r.receivable)],['Cuentas por pagar',money(r.debt)]];
 return '<section class="oc-metrics oc-six">'+metrics.map(([k,v,note])=>'<article><p>'+k+'</p><strong>'+v+'</strong>'+(note?'<small>'+esc(note)+'</small>':'')+'</article>').join('')+'</section><p>Historia desde '+esc(a.start||'el primer registro')+(a.companyStartKnown?'':' · primer dato disponible; fecha de creación por definir')+'. Los importes sin confirmar no se presentan como saldos reales.</p>'+
 capitalCard(r,cars,cash,stock)+'<div class="oc-dashboard-grid">'+salesChart(h)+bars('Estado de inventario',Object.entries(a.states||{}))+marginChart(a.lastSold||[])+bars('Composición de gastos',Object.entries(a.expenses||{}),true)+carExpensesCard(a.carExpenses||[])+bars('Patrimonio actual',[['Caja',cash],['Stock propio al costo',stock],['Por cobrar',r.receivable],['Préstamos otorgados',r.loanAsset],['Obligaciones',r.debt===null?null:r.debt?-r.debt:0],['Patrimonio',patrimony]],true)+trend('Flujo de caja mensual',h,[['business','Ingresos del negocio','#36765a'],['contributions','Aportes de socios','#2f5f8a'],['fixedExits','Gastos fijos','#a23e38'],['variableExits','Gastos no fijos','#d08a2e']],true)+'</div>'+
 trend('Saldos bancarios históricos',h,[['balance','Saldo consolidado','#947243']],true)+
 '<section class="oc-card"><h2>Resultado por auto</h2>'+table(['Auto','Estado','Días','Compra','Preparación','Venta','Resultado'],cars.map(c=>[esc(car(c.id)),esc(title(c.status)),esc(c.days??'—'),money(c.purchase),money(c.preparation),money(c.sale),money(c.result)]))+'</section>';
}

// ---------- Autos y operación ----------
// Grupos: stock (con ficha y sin vender), sinficha (sin ficha o por revisar), vendidos.
const hasMoney=c=>c.preparation>0||c.purchase!==null||c.income>0;
const carGroup=c=>c.sold?'vendidos':((!c.hasFicha||c.status==='POR_REVISAR')&&!hasMoney(c))?'sinficha':'stock';
let carTab='stock';
function carFilters(cars){
 const n=g=>cars.filter(c=>carGroup(c)===g).length,tab=(id,label,k)=>'<button type="button" class="oc-tab'+(carTab===id?' active':'')+'" data-car-tab="'+id+'">'+label+' ('+k+')</button>';
 return '<div class="oc-cash-tools">'+tab('stock','En stock',n('stock'))+tab('sinficha','Sin ficha',n('sinficha'))+tab('vendidos','Vendidos',n('vendidos'))+tab('todos','Todos',cars.length)+'<input id="os-car-search" type="search" placeholder="Buscar patente o modelo" aria-label="Buscar auto"></div>';
}
function opsTable(cars){
 const rows=cars.slice().sort((a,b)=>(b.income>0)-(a.income>0)||(b.purchase!==null)-(a.purchase!==null)||b.preparation-a.preparation).map(c=>{
  const cons=c.modality==='CONSIGNADO',cells=[esc(car(c.id)),esc(title(c.status))+(!c.hasFicha?'<br>'+chip('Falta ficha','bad'):'')+(c.salePending?'<br>'+chip('Vendido por caja: cerrar ficha','warn'):'')+(c.unconfirmed?'<br><small>'+c.unconfirmed+' importe(s) por confirmar</small>':''),esc(c.days??'—'),(c.purchase===null?(c.sold?'<b class="oc-bad">Falta</b>':'—'):money(c.purchase))+(cons&&c.purchase!==null?'<br><small>pago al dueño</small>':''),c.preparation?money(c.preparation):'—',c.income>0?money(c.income):'—','<b'+tone(c.result)+'>'+(c.result===null?'—':money(c.result))+'</b>',pct(c.margin),(c.salePending?'<button data-os-sell="'+esc(c.id)+'">Marcar vendido</button> ':'')+'<button data-system-edit="AUTOS_OPERACION" data-record="'+esc(c.id)+'">Ficha</button>'];
  return '<tr data-group="'+carGroup(c)+'" data-text="'+esc(car(c.id).toLowerCase())+'"'+(carTab!=='todos'&&carGroup(c)!==carTab?' hidden':'')+'>'+cells.map(x=>'<td>'+x+'</td>').join('')+'</tr>';
 }).join('');
 return '<div class="oc-table-scroll"><table id="os-cars"><thead><tr>'+['Auto','Estado','Días','Compra','Costos','Venta cobrada','Margen','%',''].map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function filterCars(){
 const q=((host.querySelector('#os-car-search')||{}).value||'').trim().toLowerCase();
 host.querySelectorAll('#os-cars tbody tr').forEach(tr=>{tr.hidden=!((carTab==='todos'||tr.dataset.group===carTab||q)&&(!q||tr.dataset.text.includes(q)));});
 host.querySelectorAll('[data-car-tab]').forEach(b=>b.classList.toggle('active',b.dataset.carTab===carTab));
}
function operations(st,cars){
 return '<section class="oc-card"><h2>Autos y operación</h2><p>Registra el auto, completa su ficha y márcalo vendido. El margen sale de la caja asignada al auto: compra (o pago al dueño en consignados), arreglos y costos, y venta cobrada. Lavados, arreglos, fotos y otros costos se asignan al auto desde Caja y bancos: no hace falta crear una actividad.</p><div class="oc-system-actions">'+button('VEHICULOS','Registrar auto')+button('AUTOS_OPERACION','Completar ficha')+'<button id="os-sell">Vender auto</button>'+(options.canManage?'<button id="os-sync">Actualizar stock de Claxo</button>':'')+'</div><p>Última sincronización: '+esc(st.sync?new Date(st.sync).toLocaleString('es-CL',{timeZone:'America/Santiago'}):'Pendiente')+'</p>'+
 carFilters(cars)+opsTable(cars)+'</section>';
}

// ---------- Compromisos no caja: solo cobros/pagos y préstamos (los costos fijos salen de la caja) ----------
function commitments(r){
 return '<section class="oc-metrics"><article><p>Por cobrar</p><strong>'+money(r.receivable)+'</strong></article><article><p>Por pagar (deudas y servicios)</p><strong>'+money(r.debt)+'</strong></article></section>'+
 '<section class="oc-card"><h2>Compromisos no caja</h2><p>Cuotas de ventas, servicios a plazo y deudas que todavía no pasan por el banco. Se descuentan al vincular el cobro o pago en Caja y bancos; crearlos aquí no mueve dinero.</p><div class="oc-system-actions">'+button('PROYECCIONES','Crear compromiso de cobro o pago')+button('PRESTAMOS','Agregar préstamo')+'</div></section>'+
 '<section class="oc-card"><h2>Ingresos y pagos esperados</h2>'+table(['Fecha','Concepto','Tipo','Pendiente',''],(r.forecasts||[]).map(x=>[esc(x.fecha),esc(x.descripcion),esc(title(x.tipo)),money(x.pending),edit('PROYECCIONES',x.proyeccion_id)]))+'</section>'+
 '<section class="oc-card"><h2>Préstamos</h2>'+table(['Nombre','Tipo','Principal pendiente',''],(r.loans||[]).map(x=>[esc(x.nombre),esc(title(x.sentido)),money(x.balance),edit('PRESTAMOS',x.prestamo_id)]))+'</section>';
}

// ---------- Configuración ----------
function reconText(x){
 if(x.status==='OK')return chip('Cuadra con '+(x.reference==='REAL'?'el saldo real':'la cartola'),'ok');
 if(x.status==='DESCUADRE')return chip('Falta un flujo · '+(x.diff>0?'entrada':'salida')+' de '+money(Math.abs(x.diff)),'bad')+(x.firstBreak?'<br><small>Entre '+esc(x.firstBreak.from)+' y '+esc(x.firstBreak.to)+'</small>':'');
 if(x.status==='SIN_SALDO')return '<small>Falta saldo inicial</small>';
 return '<small>Sin cartola con saldo. Usa «Cuadrar» con el saldo real del banco.</small>';
}
function settings(st,r){
 const rec=Object.fromEntries((r.reconciliation||[]).map(x=>[x.id,x]));
 return '<section class="oc-card"><h2>Configuración del sistema</h2><p>Los usuarios y permisos se administran en la hoja USUARIOS de Google. Supabase se utiliza únicamente para iniciar sesión.</p><h3>Inicio de la historia</h3><input id="os-start" type="date" value="'+esc(r.dashboard?.start||'2025-10-01')+'"><button id="os-start-save">Guardar fecha de inicio</button><h3>Saldos de apertura por cuenta</h3><p>Saldo al cierre del día indicado. El sistema suma movimientos posteriores y avisa si el saldo no cuadra con los flujos: significa que falta un flujo (o que el saldo o la fecha están mal).</p>'+
 (r.warnings&&r.warnings.length?'<div class="oc-warn"><b>No cuadra:</b><ul>'+r.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></div>':'')+
 table(['Cuenta','Saldo inicial','Fecha de corte','Saldo calculado hoy','Cuadre',''],(st.accounts||[]).map(a=>{const x=rec[a.cuenta_id]||{};return [esc(a.nombre),a.saldo_inicial===''?'Por completar':money(Number(a.saldo_inicial)),esc(a.fecha_saldo_inicial),x.computed===null||x.computed===undefined?'—':money(x.computed),reconText(x),'<button data-balance="'+esc(a.cuenta_id)+'">Editar saldo</button> <button data-reconcile="'+esc(a.cuenta_id)+'">Cuadrar</button>'];}))+'</section>';
}

function rerender(){const c=host.querySelector('#oc-content');if(c)c.innerHTML=markup(view);mount(host);}
const flash=(text)=>{message=text;rerender();};
function dialog(body){const d=document.createElement('dialog');d.className='oc-dialog';d.innerHTML=body;document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return d;}
function input([name,label,type],value){
 let control='';
 if(type==='auto'||type==='auto-optional')control='<select name="'+name+'">'+(type==='auto-optional'?'<option value="">Sin auto</option>':'<option value="">Selecciona un auto</option>')+(S().inventory||[]).map(v=>'<option value="'+esc(v.vehiculo_id)+'" '+(value===v.vehiculo_id?'selected':'')+'>'+esc(car(v.vehiculo_id))+'</option>').join('')+'</select>';
 else if(Array.isArray(type))control='<select name="'+name+'">'+type.map(v=>'<option '+(value===v?'selected':'')+' value="'+v+'">'+esc(title(v))+'</option>').join('')+'</select>';
 else control='<input name="'+name+'" type="'+type+'" '+(type==='number'?'min="0" step="1"':'')+' value="'+esc(value??'')+'">';
 return '<label>'+label+control+'</label>';
}

function form(tab,id){
 const def=defs[tab],find=key=>(S()[def.data]||[]).find(r=>r[def.key]===key)||{},existing=find(id);
 const d=dialog('<form><h2>'+def.title+'</h2><div class="oc-caja-form">'+def.fields.map(f=>input(f,existing[f[0]]??(f[0]===def.key?id:''))).join('')+'</div>'+(tab==='AUTOS_OPERACION'?'<div id="os-fin"></div>':'')+'<p role="status"></p><button type="submit">Guardar</button> <button type="button" data-cancel>Cancelar</button></form>');
 const requestId=crypto.randomUUID(),pick=d.querySelector('[name="'+def.key+'"]');
 d.querySelector('[data-cancel]').onclick=()=>d.close();
 // Al elegir otro auto en «Completar ficha», se cargan los datos de su ficha.
 const showFin=()=>{const box=d.querySelector('#os-fin');if(box)box.innerHTML=finPanel(pick&&pick.value);};showFin();
 if(pick&&pick.tagName==='SELECT')pick.onchange=()=>{showFin();const rec=find(pick.value);def.fields.forEach(([name])=>{const el=d.querySelector('[name="'+name+'"]');if(el&&name!==def.key)el.value=rec[name]??(el.tagName==='SELECT'?el.options[0].value:'');});};
 d.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const button=d.querySelector('[type=submit]');button.disabled=true;
  try{
   const f=Object.fromEntries(new FormData(e.target)),current=find(f[def.key]||id);
   if(tab==='AUTOS_OPERACION'&&f.estado_auto==='VENDIDO'&&current.estado_auto!=='VENDIDO')throw Error('Para marcarlo vendido usa «Vender auto»: toma el cobro de la caja.');
   await options.store.save(tab,{...current,...f},requestId,Number(current.version||0));
   root.OCCaja?.updateSources(S());d.close();flash('Registro guardado en Google.');
  }catch(err){d.querySelector('[role=status]').textContent=err.message;}finally{button.disabled=false;}
 };
}
// Vender auto: el cobro y la fecha salen de la caja asignada al auto; aquí solo se marca como vendido.
function sell(preselect){
 const ops=S().operations||[],cars=((S().report||{}).cars||[]),open=(S().inventory||[]).filter(v=>{const o=ops.find(x=>String(x.vehiculo_id)===String(v.vehiculo_id));return !o||!['VENDIDO','RETIRADO'].includes(o.estado_auto);});
 const ready=open.filter(v=>(carFin(v.vehiculo_id)||{}).income>0),rest=open.filter(v=>!((carFin(v.vehiculo_id)||{}).income>0));
 const option=v=>'<option value="'+esc(v.vehiculo_id)+'" '+(v.vehiculo_id===preselect?'selected':'')+'>'+esc(car(v.vehiculo_id))+'</option>';
 const d=dialog('<form><h2>Vender auto</h2><div class="oc-caja-form"><label>Auto<select name="vehiculo_id"><option value="">Selecciona un auto</option>'+(ready.length?'<optgroup label="Con venta cobrada en caja">'+ready.map(option).join('')+'</optgroup>':'')+'<optgroup label="Sin venta asignada todavía">'+rest.map(option).join('')+'</optgroup></select></label><label>Fecha de venta<input name="fecha_venta" type="date" required value="'+esc(today())+'"></label></div><div id="os-fin"></div><p role="status"></p><button type="submit">Marcar como vendido</button> <button type="button" data-cancel>Cancelar</button></form>');
 const requestId=crypto.randomUUID(),pick=d.querySelector('[name=vehiculo_id]'),dateInput=d.querySelector('[name=fecha_venta]');
 const refresh=()=>{d.querySelector('#os-fin').innerHTML=finPanel(pick.value);const c=carFin(pick.value);if(c&&c.saleDateCaja)dateInput.value=c.saleDateCaja;};
 pick.onchange=refresh;refresh();d.querySelector('[data-cancel]').onclick=()=>d.close();
 d.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const button=d.querySelector('[type=submit]'),status=d.querySelector('[role=status]');button.disabled=true;
  try{
   const f=Object.fromEntries(new FormData(e.target)),current=ops.find(x=>String(x.vehiculo_id)===String(f.vehiculo_id)),c=carFin(f.vehiculo_id);
   if(!f.vehiculo_id)throw Error('Selecciona un auto.');
   if(!current||!current.modalidad||!current.fecha_ingreso)throw Error('Primero completa la ficha del auto (modalidad e ingreso).');
   if(!c||!(c.income>0))throw Error('Primero asigna el ingreso de la venta a este auto en Caja y bancos (concepto de venta).');
   if(c.purchase===null)throw Error(current.modalidad==='CONSIGNADO'?'Falta asignar el pago al dueño (concepto Compra) para calcular tu comisión.':'Falta asignar la compra del auto en Caja y bancos.');
   const record={...current,fecha_venta:f.fecha_venta,precio_venta:Math.round(c.income),estado_auto:'VENDIDO'};
   if(current.modalidad==='CONSIGNADO')record.comision_consignacion=Math.max(0,Math.round(c.income-c.purchase-c.preparation));
   await options.store.save('AUTOS_OPERACION',record,requestId,Number(current.version||0));
   root.OCCaja?.updateSources(S());d.close();flash('Auto marcado como vendido. Margen calculado desde la caja.');
  }catch(err){status.textContent=err.message;}finally{button.disabled=false;}
 };
}
function reconSummary(x){
 if(x.status==='SIN_SALDO')return 'Ingresa saldo y fecha de corte.';
 if(x.status==='SIN_REFERENCIA')return 'Saldo calculado hoy: '+money(x.computed)+'. No hay una cartola con saldo para comprobarlo; usa «Cuadrar» con el saldo real del banco.';
 if(x.status==='OK')return '✓ Cuadra con '+(x.reference==='REAL'?'el saldo real':'la cartola')+'. Saldo calculado: '+money(x.computed)+'.';
 const parts=['⚠ No cuadra: falta '+(x.diff>0?'una ENTRADA':'una SALIDA')+' por '+money(Math.abs(x.diff))+'.'];
 if(x.firstBreak)parts.push('El quiebre aparece entre '+x.firstBreak.from+' y '+x.firstBreak.to+'.');
 if(x.unconfirmed.count)parts.push(x.unconfirmed.count+' movimiento(s) sin importe, dirección o fecha confirmados quedan fuera del saldo.');
 if(x.candidates.length)parts.push('Podría ser: '+x.candidates.map(c=>c.description+' '+c.date+' '+money(c.amount)).join('; ')+'.');
 return parts.join(' ');
}
function balance(id){
 const a=S().accounts.find(x=>x.cuenta_id===id),moves=S().raw.movements;
 const d=dialog('<form><h2>'+esc(a.nombre)+'</h2><label>Saldo al cierre del día<input name="balance" type="number" step="1" required value="'+esc(a.saldo_inicial)+'"></label><label>Fecha de corte<input name="date" type="date" required value="'+esc(a.fecha_saldo_inicial)+'"></label><p id="os-check" role="status"></p><p role="alert"></p><button>Guardar saldo</button> <button type="button" data-cancel>Cancelar</button></form>');
 const form_=d.querySelector('form'),check=d.querySelector('#os-check'),hypo=()=>({...a,saldo_inicial:form_.balance.value===''?'':Number(form_.balance.value),fecha_saldo_inicial:form_.date.value});
 const live=()=>{const x=root.OCSystemCore.reconcileAccount(hypo(),moves,today());check.textContent=reconSummary(x);check.className=x.status==='DESCUADRE'?'oc-msg-warn':x.status==='OK'?'oc-ok':'';};
 form_.balance.oninput=live;form_.date.oninput=live;live();
 d.querySelector('[data-cancel]').onclick=()=>d.close();
 form_.onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target),b=e.target.querySelector('button');b.disabled=true;
  try{
   await options.store.saveBalance(id,Number(f.get('balance')),f.get('date'),Number(a.version));
   const x=root.OCSystemCore.reconcile(S().raw,today()).find(r=>r.id===id);d.close();
   flash(x&&x.status==='DESCUADRE'?'⚠ Saldo guardado, pero '+a.nombre+' no cuadra con los flujos. '+reconSummary(x).replace('⚠ ',''):'Saldo guardado.');
  }catch(err){d.querySelector('[role=alert]').textContent=err.message;}finally{b.disabled=false;}
 };
}
// Cuadrar: compara el saldo calculado con el saldo real que ve el usuario en el banco.
function reconcileDialog(id){
 const a=S().accounts.find(x=>x.cuenta_id===id),moves=S().raw.movements,base=root.OCSystemCore.reconcileAccount(a,moves,today());
 const d=dialog('<form method="dialog"><h2>Cuadrar '+esc(a.nombre)+'</h2><p>Saldo calculado hoy por el sistema: <b>'+money(base.computed)+'</b></p><label>Saldo real hoy en el banco<input name="real" type="number" step="1" required></label><p id="os-check" role="status"></p><button type="button" data-cancel>Cerrar</button></form>');
 const real=d.querySelector('[name=real]'),out=d.querySelector('#os-check');
 real.oninput=()=>{if(real.value===''){out.textContent='';return;}const x=root.OCSystemCore.reconcileAccount(a,moves,today(),Number(real.value));out.textContent=reconSummary(x);out.className=x.status==='DESCUADRE'?'oc-msg-warn':'oc-ok';};
 d.querySelector('[data-cancel]').onclick=()=>d.close();
}

function mount(h){
 host=h;
 const start=host.querySelector('#os-start-save');
 if(start)start.onclick=async()=>{start.disabled=true;try{await options.store.saveStart(host.querySelector('#os-start').value);flash('Fecha de inicio guardada.');}catch(e){flash(e.message);}};
 host.querySelectorAll('[data-system-new]').forEach(b=>b.onclick=()=>form(b.dataset.systemNew));
 host.querySelectorAll('[data-system-edit]').forEach(b=>b.onclick=()=>form(b.dataset.systemEdit,b.dataset.record));
 host.querySelectorAll('[data-balance]').forEach(b=>b.onclick=()=>balance(b.dataset.balance));
 host.querySelectorAll('[data-reconcile]').forEach(b=>b.onclick=()=>reconcileDialog(b.dataset.reconcile));
 host.querySelectorAll('[data-car-tab]').forEach(b=>b.onclick=()=>{carTab=b.dataset.carTab;filterCars();});const carSearch=host.querySelector('#os-car-search');if(carSearch)carSearch.oninput=filterCars;
 const sellButton=host.querySelector('#os-sell');if(sellButton)sellButton.onclick=()=>sell();host.querySelectorAll('[data-os-sell]').forEach(b=>b.onclick=()=>sell(b.dataset.osSell));
 const sync=host.querySelector('#os-sync');
 if(sync)sync.onclick=async()=>{if(busy)return;busy=true;sync.disabled=true;try{await options.store.syncClaxo();root.OCCaja?.updateSources(S());busy=false;flash('Inventario actualizado desde Claxo.');}catch(e){busy=false;flash(e.message);}};
 if(view==='gestion'&&root.OCFinanzas){const st=S();root.OCFinanzas.mount(host,st.raw,st.report,today());}
}
root.OCSistema={setup,markup,mount};
})(window);
