(function(root){
'use strict';
// Rentabilidad y control (solo Alex): resultado real por auto, resultado mensual y punto de equilibrio, stock y precios,
// liquidación al consignador, reglas de conciliación, comisiones, canales, calendario tributario, flujo 13 semanas y gastos personales.
// Todo se calcula desde la caja asignada (el banco manda). Nada se asigna solo: las reglas proponen y la persona confirma.
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const POR_ACLARAR='b428e0d5-0ea5-4e87-92ee-9196cf74526c';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Math.round(n)):'—';
const pct=n=>Number.isFinite(n)?n.toFixed(1).replace('.',',')+'%':'—';
const num=v=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
const isDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const fmtDate=v=>isDay(v)?v.slice(8,10)+'-'+v.slice(5,7)+'-'+v.slice(0,4):'—';
const perLabel=p=>/^\d{4}-\d{2}$/.test(p||'')?MESES[Number(p.slice(5,7))-1]+'-'+p.slice(2,4):p;
const todayCL=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);
const addMonths=(p,k)=>{let y=Number(p.slice(0,4)),m=Number(p.slice(5,7))+k;while(m>12){m-=12;y++;}while(m<1){m+=12;y--;}return y+'-'+String(m).padStart(2,'0');};
const addDays=(d,k)=>new Date(Date.parse(d+'T12:00:00Z')+k*86400000).toISOString().slice(0,10);
const lastDay=p=>new Date(Date.UTC(Number(p.slice(0,4)),Number(p.slice(5,7)),0)).toISOString().slice(0,10);
const dayDiff=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
const text=m=>[m.descripcion,m.referencia,m.contraparte].filter(Boolean).join(' ');
const okMove=m=>m.estado_registro!=='ANULADO'&&(!m.ambiente||m.ambiente==='PRODUCCION')&&!/^(rejected|cancelled|refunded|charged_back)$/i.test(String(m.estado_fuente||''))&&num(m.monto)!==null&&Number(m.monto)>0&&isDay(m.fecha_operacion)&&['ENTRADA','SALIDA'].includes(m.direccion);
const isPersonal=m=>/retiro de socio|gasto personal/i.test(String(m.categoria||'')+' '+String(m.concepto_nombre||''));
const isAclarar=m=>String(m.concepto_id)===POR_ACLARAR||/por aclarar/i.test(String(m.concepto_nombre||''));
const CHANNELS=[['CHILEAUTOS','Chileautos',/CHILEAUTOS|CHILE AUTOS/i,null],['FACEBOOK','Facebook / Instagram',/FACEBK|FACEBOOK|META ?ADS|INSTAGRAM/i,null],['CLAXO','Claxo',/CLAXO/i,/claxo/i],['CYC','Cars and Coffee',/CARS ?(AND|&) ?COFFEE|C&C/i,/cars and coffee|c&c/i],['REFERIDO','Referido',null,null],['OTRO','Local / otro',null,null]];
const DEFAULT_RULES=[
 {pattern:'WHOOSH',concept:'TRANSPORTE',dir:'SALIDA',note:'Traslados Whoosh'},
 {pattern:'AUTOFACT',concept:'TRAMITES',dir:'SALIDA',note:'Transferencias e informes Autofact'},
 {pattern:'CLAXO',concept:'name:claxo',dir:'SALIDA',note:'Publicación Claxo'},
 {pattern:'FACEBK|FACEBOOK',concept:'MARKETING',dir:'SALIDA',note:'Publicidad Meta'},
 {pattern:'CHILEAUTOS',concept:'MARKETING',dir:'SALIDA',note:'Publicación Chileautos'},
 {pattern:'PARKING|ESTAC|SIMPLEPAR|AP LAS CONDES',concept:'TRANSPORTE',dir:'SALIDA',note:'Estacionamientos'},
 {pattern:'COPEC|ARAMCO|SHELL|PETROBRAS',concept:'TRANSPORTE',dir:'SALIDA',note:'Combustible'},
 {pattern:'MUNICIPALIDAD|MUNI DE',concept:'TRAMITES',dir:'SALIDA',note:'Permisos y trámites municipales'},
 {pattern:'PREVIRED',concept:'IMPOSICIONES',dir:'SALIDA',note:'Imposiciones'},
 {pattern:'TESORERIA|TGR',concept:'IMPUESTOS',dir:'SALIDA',note:'Impuestos (F29)'}
];

// ---------- Cálculos puros (probados en tests) ----------
// Líneas de caja de un auto, solo lo asignado (sin la ficha).
function carCash(c){
 const L=c.lines||[],sum=f=>L.filter(f).reduce((s,l)=>s+l.amount,0);
 return {cobrado:sum(l=>l.op==='VENTA'&&l.dir==='ENTRADA'),pagado:sum(l=>l.op==='COMPRA'&&l.dir==='SALIDA'),gastos:sum(l=>l.op!=='COMPRA'&&l.op!=='VENTA'&&l.dir==='SALIDA'),devoluciones:sum(l=>l.op!=='VENTA'&&l.dir==='ENTRADA')};
}
// Resultado real por auto: caja cobrada − pagada − gastos, comparado con la ficha (planilla). Tolerancia $1.000.
function carResult(c,op,closed){
 const k=carCash(c),fv=num(op&&op.precio_venta),fc=num(op&&op.costo_compra),tol=1000,res=k.cobrado-k.pagado-k.gastos+k.devoluciones-(c.parking||0);
 const diffs=[];if(fv!==null&&k.cobrado>0&&Math.abs(fv-k.cobrado)>tol)diffs.push('Venta ficha '+money(fv)+' ≠ cobrado '+money(k.cobrado));
 if(fc!==null&&k.pagado>0&&Math.abs(fc-k.pagado)>tol)diffs.push('Compra ficha '+money(fc)+' ≠ pagado '+money(k.pagado));
 let estado='CUADRADO';if(!k.cobrado)estado='FALTA_COBRO';else if(!k.pagado)estado='FALTA_PAGO';else if(diffs.length)estado='DIFIERE';else if(c.unconfirmed)estado='POR_CONFIRMAR';
 if(closed)estado='CERRADO';
 return {...k,fichaVenta:fv,fichaCompra:fc,resultado:res,margen:k.cobrado>0?res/k.cobrado*100:null,diffs,estado};
}
// Resultado mensual: margen de los autos vendidos en el mes (devengado por auto) + otros ingresos − gastos de operación.
// Fuera del resultado: compras y ventas de autos (ya están en el margen), transferencias, aportes, préstamos, gastos personales y «Por aclarar».
function monthly(movements,cars,today){
 const by={},get=k=>by[k]||(by[k]={month:k,sold:0,margin:0,sales:0,marginMissing:0,otherIn:0,fixed:0,variable:0,personal:0,aclarar:0,unassigned:0,unassignedN:0,expenses:{}});
 (cars||[]).filter(c=>c.sold&&isDay(c.saleDate)&&c.saleDate<=today).forEach(c=>{const e=get(c.saleDate.slice(0,7));e.sold++;if(c.result!==null&&c.result!==undefined){e.margin+=c.result;e.sales+=c.sale||0;}else e.marginMissing++;});
 (movements||[]).filter(okMove).filter(m=>m.fecha_operacion<=today).forEach(m=>{
  const e=get(m.fecha_operacion.slice(0,7)),a=Number(m.monto),nat=String(m.naturaleza||'');
  if(!m.concepto_id){e.unassigned+=a;e.unassignedN++;return;}
  if(isPersonal(m)){if(m.direccion==='SALIDA')e.personal+=a;else e.personal-=a;return;}
  if(isAclarar(m)){e.aclarar+=(m.direccion==='SALIDA'?1:-1)*a;return;}
  if(['TRANSFERENCIA','APORTE_CAPITAL','PRESTAMO'].includes(nat)&&m.componente_prestamo!=='INTERES')return;
  if(m.vehiculo_id||['COMPRA','VENTA'].includes(m.operacion_auto))return;
  if(nat==='INGRESO'){e.otherIn+=a;return;}
  const sign=m.direccion==='SALIDA'?1:-1,k=m.concepto_nombre||'Otro';
  if(String(m.tipo_costo)==='FIJO')e.fixed+=sign*a;else e.variable+=sign*a;
  e.expenses[k]=(e.expenses[k]||0)+sign*a;
 });
 return Object.values(by).sort((a,b)=>a.month.localeCompare(b.month)).map(e=>({...e,opex:e.fixed+e.variable,result:e.margin+e.otherIn-e.fixed-e.variable}));
}
// Punto de equilibrio: gastos de operación promedio (últimos 3 meses cerrados) / margen promedio por auto (últimos 6 meses).
function breakeven(rows,cars,today){
 const cur=today.slice(0,7),closed=rows.filter(r=>r.month<cur).slice(-3),opex=closed.length?closed.reduce((s,r)=>s+r.opex,0)/closed.length:null;
 const from=addMonths(cur,-6),sold=(cars||[]).filter(c=>c.sold&&c.result!==null&&c.result!==undefined&&isDay(c.saleDate)&&c.saleDate.slice(0,7)>=from&&c.saleDate<=today);
 const perCar=sold.length?sold.reduce((s,c)=>s+c.result,0)/sold.length:null,be=opex!==null&&perCar>0?opex/perCar:null;
 const now=rows.find(r=>r.month===cur)||{sold:0,margin:0,result:0,opex:0};
 return {opex,perCar,cars:be,soldNow:now.sold,marginNow:now.margin,missing:be===null?null:Math.max(0,Math.ceil(be)-now.sold),months:closed.map(r=>r.month),sample:sold.length};
}
// Stock: días, capital propio inmovilizado, alerta 45/60/90 y precio sugerido (rebaja escalonada, nunca bajo el costo).
function stock(cars,prices,today){
 return (cars||[]).filter(c=>!c.sold&&c.status!=='RETIRADO').map(c=>{
  const d=c.days,lvl=d===null||d===undefined?'':d>=90?'ROJO':d>=60?'NARANJO':d>=45?'AMARILLO':'',cut=lvl==='ROJO'?.06:lvl==='NARANJO'?.04:lvl==='AMARILLO'?.02:0;
  const own=c.modality==='PROPIO',capital=own?(c.purchase||0)+(c.preparation||0):0,hist=(prices&&prices[c.id])||[];
  let sug=c.listPrice&&cut?Math.round(c.listPrice*(1-cut)/10000)*10000:null;if(sug!==null&&own&&capital&&sug<capital)sug=Math.ceil(capital/10000)*10000;
  const first=hist.length?hist[0][1]:null;
  return {id:c.id,label:c.label,modality:c.modality,status:c.status,days:d,listPrice:c.listPrice,capital,own,level:lvl,suggested:sug,history:hist,drop:first&&c.listPrice?(c.listPrice-first)/first*100:null,parking:c.parking||0};
 }).sort((a,b)=>(b.days||0)-(a.days||0));
}
// Precio de hoy en el historial (solo si cambió). Máx. 12 registros por auto.
function recordPrices(prices,cars,today){
 const out={...(prices||{})};let changed=false;
 (cars||[]).forEach(c=>{if(!c.listPrice||c.sold)return;const h=(out[c.id]||[]).slice(),last=h[h.length-1];if(!last||last[1]!==c.listPrice){h.push([today,c.listPrice]);out[c.id]=h.slice(-12);changed=true;}});
 return changed?out:null;
}
// Liquidación al consignador: venta − comisión − gastos descontables = saldo del dueño; menos lo ya pagado = pendiente.
function consignment(c,op,owner){
 const k=carCash(c),sale=k.cobrado||num(op&&op.precio_venta)||0,raw=num(op&&op.comision_consignacion);
 const pactada=raw===null?null:raw>0&&raw<=100?Math.round(sale*raw/100):raw,desc=owner&&owner.desc?k.gastos:0;
 const saldo=pactada===null?null:sale-pactada-desc;
 return {sale,cobrado:k.cobrado,pagado:k.pagado,gastos:k.gastos,desc,comision:pactada,comisionImplicita:pactada===null&&c.sold?sale-k.pagado-desc:null,saldo,pendiente:saldo===null?null:saldo-k.pagado,payments:(c.lines||[]).filter(l=>l.op==='COMPRA'&&l.dir==='SALIDA')};
}
// Reglas: movimientos sin asignar cuyo texto calza el patrón y la dirección.
function ruleMatches(movements,rule){
 let re;try{re=new RegExp(rule.pattern,'i');}catch(e){return [];}
 return (movements||[]).filter(okMove).filter(m=>!m.concepto_id&&(!rule.dir||m.direccion===rule.dir)&&re.test(text(m)));
}
function resolveConcept(concepts,ref){
 if(!ref)return null;if(String(ref).startsWith('name:')){const re=new RegExp(String(ref).slice(5),'i');return concepts.find(c=>re.test(c.name))||null;}
 return concepts.find(c=>String(c.id)===String(ref))||null;
}
// Avance de conciliación por mes: % sin asignar (meta < 5%).
function progress(movements,today){
 const by={};(movements||[]).filter(okMove).filter(m=>m.fecha_operacion<=today).forEach(m=>{const k=m.fecha_operacion.slice(0,7),e=by[k]||(by[k]={month:k,n:0,un:0,amount:0,unAmount:0});e.n++;e.amount+=Number(m.monto);if(!m.concepto_id){e.un++;e.unAmount+=Number(m.monto);}});
 return Object.values(by).sort((a,b)=>b.month.localeCompare(a.month)).map(e=>({...e,pct:e.n?e.un/e.n*100:0}));
}
// Comisiones por regla: por persona y mes sobre los autos vendidos (margen, venta o monto fijo por auto).
function commissions(cars,rules,today){
 const out={};(cars||[]).filter(c=>c.sold&&isDay(c.saleDate)&&c.saleDate<=today).forEach(c=>{const m=c.saleDate.slice(0,7);(rules||[]).forEach(r=>{
  if(r.desde&&m<r.desde||r.hasta&&m>r.hasta)return;if(r.modalidad&&r.modalidad!=='TODOS'&&r.modalidad!==c.modality)return;
  const v=Number(r.valor)||0,base=r.base==='VENTA'?(c.sale||0):r.base==='FIJO'?1:Math.max(0,c.result||0),amt=r.base==='FIJO'?v:Math.round(base*v/100);
  const e=out[m]||(out[m]={});const p=e[r.persona]||(e[r.persona]={total:0,cars:[]});p.total+=amt;p.cars.push({id:c.id,label:c.label,amount:amt});});});
 return out;
}
// Canales: gasto por canal (patrón del texto o concepto) y ventas atribuidas por auto.
function channelSpend(movements,from,to){
 const out={};CHANNELS.forEach(c=>out[c[0]]=0);
 (movements||[]).filter(okMove).filter(m=>m.direccion==='SALIDA'&&m.fecha_operacion>=from&&m.fecha_operacion<=to).forEach(m=>{
  const ch=CHANNELS.find(c=>c[3]&&c[3].test(String(m.concepto_nombre||''))||c[2]&&c[2].test(text(m)));if(ch)out[ch[0]]+=Number(m.monto);});
 return out;
}
// Calendario tributario: F29 (IVA, PPM, retenciones de honorarios) día 20 del mes siguiente; Previred día 13; F22 el 30 de abril.
function taxCalendar(movements,cars,today){
 const cur=today.slice(0,7),list=[],ms=(movements||[]).filter(okMove).filter(m=>m.direccion==='SALIDA');
 const found=(re,conc,from,to)=>ms.filter(m=>m.fecha_operacion>=from&&m.fecha_operacion<=to&&(conc.test(String(m.concepto_nombre||'')+' '+String(m.concepto_id||''))||re.test(text(m))));
 for(let k=-3;k<=3;k++){const per=addMonths(cur,k),nx=addMonths(per,1);
  const iva=(cars||[]).filter(c=>c.sold&&c.modality==='PROPIO'&&isDay(c.saleDate)&&c.saleDate.slice(0,7)===per&&c.result>0).reduce((s,c)=>s+c.result*19/119,0);
  const f29=found(/TESORER|TGR|F29|SII/i,/impuesto/i,nx+'-01',lastDay(nx)),pr=found(/PREVIRED/i,/imposicion/i,nx+'-01',lastDay(nx));
  list.push({id:'F29-'+per,name:'F29 · IVA, PPM y retenciones de '+perLabel(per),due:nx+'-20',paid:f29.reduce((s,m)=>s+Number(m.monto),0),moves:f29.length,estimate:iva});
  list.push({id:'PREV-'+per,name:'Previred · imposiciones de '+perLabel(per),due:nx+'-13',paid:pr.reduce((s,m)=>s+Number(m.monto),0),moves:pr.length,estimate:null});
 }
 const y=Number(today.slice(0,4)),f22due=(today.slice(5)>'04-30'?y+1:y)+'-04-30';
 list.push({id:'F22-'+f22due.slice(0,4),name:'F22 · Renta anual (año comercial '+(Number(f22due.slice(0,4))-1)+')',due:f22due,paid:0,moves:0,estimate:null,annual:true});
 return list.map(t=>({...t,status:t.paid>0?'PAGADO':t.due<today?'VENCIDO':dayDiff(today,t.due)<=10?'PROXIMO':'FUTURO'})).sort((a,b)=>a.due.localeCompare(b.due));
}
// Flujo de caja proyectado 13 semanas: saldo de hoy + margen esperado por ventas − gastos semanales ± proyecciones − pagos a consignadores.
function cashPlan(opening,plan,forecasts,consignorDue,today){
 const dow=(new Date(today+'T12:00:00Z').getUTCDay()+6)%7,start=addDays(today,-dow),weeks=[];let bal=opening;
 const weeklyIn=(Number(plan.carsPerWeek)||0)*(Number(plan.marginPerCar)||0),weeklyOut=(Number(plan.opexMonth)||0)*12/52;
 for(let i=0;i<13;i++){const a=addDays(start,i*7),b=addDays(a,6),fc=(forecasts||[]).filter(f=>f.pending>0&&isDay(f.fecha)&&(i===0?f.fecha<=b:f.fecha>=a&&f.fecha<=b));
  const fin=fc.filter(f=>f.direccion==='ENTRADA').reduce((s,f)=>s+f.pending,0),fout=fc.filter(f=>f.direccion==='SALIDA').reduce((s,f)=>s+f.pending,0),cons=i===0?consignorDue:0;
  const open=bal;bal=bal+weeklyIn+fin-weeklyOut-fout-cons;weeks.push({from:a,to:b,open,sales:weeklyIn,forecastIn:fin,opex:weeklyOut,forecastOut:fout,consignors:cons,close:bal});}
 return weeks;
}

// ---------- Estado y datos ----------
let config={},s=null;
function setup(options={}){config=options;s={tab:'autos',filter:'',busy:false,message:'',progress:'',open:{},sel:{},period:'6',pricesSaved:false,plan:null,ruleOpen:''};}
function reset(){s=null;}
function markup(){return '<section id="oc-rent" class="oc-card"></section>';}
function mount(parent){const el=parent.querySelector('#oc-rent');if(!el||!s)return;draw(el);}
const st=()=>config.store?config.store.state():{report:{cars:[]},movements:[],operations:[]};
const neg=()=>(st().settings&&st().settings.negocio)||{};
const concepts=()=>(root.OCCajaNueva&&root.OCCajaNueva.snapshot()&&root.OCCajaNueva.snapshot().concepts)||(config.caja&&config.caja.concepts)||[];
const opOf=id=>(st().operations||[]).find(o=>String(o.vehiculo_id)===String(id))||null;
const T=()=>todayCL();
async function saveNeg(key,value){const r=await config.call('saveSettings',{negocioKey:key,negocioValue:value});config.store.setSettings(r);return r;}
const rules=()=>neg().rules||DEFAULT_RULES.map((r,i)=>({id:'R'+(i+1),...r}));

// Asigna un concepto a una lista de movimientos, uno por uno (la caja es la fuente de verdad: cada guardado valida versión).
async function assign(el,ids,concept,label){
 if(s.busy)return;s.busy=true;let ok=0,fail=[];const inv=(config.store.inventoryForCaja()||[]).map(v=>({...v,id:v.id}));
 for(let i=0;i<ids.length;i++){s.progress=(label||'Asignando')+' '+(i+1)+' de '+ids.length+'…';draw(el);
  try{const m=config.store.mapped(String(ids[i]));if(!m)throw Error('No está en la caja.');if(m.classification)throw Error('Ya tiene concepto.');
   const next=root.OCCaja.classify(m,concept,null,inv);await config.caja.saveMovement(next);ok++;}
  catch(e){fail.push((ids[i])+': '+e.message);}}
 try{root.OCCajaNueva&&root.OCCajaNueva.replaceMovements(config.store.movementsForCaja());}catch(e){}
 s.busy=false;s.progress='';s.message=ok+' movimiento'+(ok===1?'':'s')+' asignado'+(ok===1?'':'s')+' a «'+concept.name+'».'+(fail.length?' '+fail.length+' no se pudieron: '+fail.slice(0,3).join(' · '):'');s.sel={};draw(el);
}

// ---------- Vistas ----------
const TABS=[['autos','Resultado por auto'],['mes','Resultado mensual'],['stock','Stock y precios'],['consigna','Consignadores'],['reglas','Conciliación por reglas'],['comisiones','Comisiones'],['canales','Canales de venta'],['impuestos','Calendario tributario'],['flujo','Flujo 13 semanas'],['personal','Gastos personales']];
function draw(el){
 if(!s)return;const tab=TABS.find(t=>t[0]===s.tab)?s.tab:'autos',taxes=taxCalendar(st().movements,st().report.cars,T()),alert=taxes.filter(t=>t.status==='PROXIMO'||t.status==='VENCIDO'&&dayDiff(t.due,T())<=40);
 el.innerHTML=`<p class="oc-eyebrow">SOLO ADMINISTRACIÓN · DESDE LA CAJA ASIGNADA</p><h2>Rentabilidad y control</h2>
 ${alert.length?`<p class="rt-alert">⏰ ${alert.map(t=>esc(t.name)+' · vence '+fmtDate(t.due)+(t.status==='VENCIDO'?' (vencido sin pago registrado)':'')).join(' · ')}</p>`:''}
 <div class="oc-tabs rt-tabs">${TABS.map(([k,l])=>`<button class="oc-tab${tab===k?' active':''}" data-rt-tab="${k}">${l}</button>`).join('')}</div>
 ${s.progress?`<p role="status" class="rt-progress">${esc(s.progress)}</p>`:''}${s.message?`<p role="status" class="rt-msg">${esc(s.message)} <button class="lq-link" data-rt-clear>Cerrar</button></p>`:''}
 <div class="rt-body">${({autos:viewCars,mes:viewMonth,stock:viewStock,consigna:viewConsign,reglas:viewRules,comisiones:viewComm,canales:viewChannels,impuestos:()=>viewTaxes(taxes),flujo:viewFlow,personal:viewPersonal})[tab]()}</div>`;
 el.onclick=e=>click(el,e);el.onchange=e=>change(el,e);
 if(tab==='stock')autoPrices(el);
}
const badge=(k,l)=>`<span class="rt-badge rt-${k}">${esc(l)}</span>`;
const ESTADOS={CUADRADO:['ok','Cuadrado'],CERRADO:['done','Cerrado'],FALTA_COBRO:['warn','Falta cobro'],FALTA_PAGO:['warn','Falta pago / compra'],DIFIERE:['bad','Difiere de la ficha'],POR_CONFIRMAR:['warn','Montos por confirmar']};
function viewCars(){
 const closed=neg().closed||{},q=s.filter.toLowerCase();
 const rows=(st().report.cars||[]).filter(c=>c.sold).map(c=>({c,r:carResult(c,opOf(c.id),closed[c.id])})).filter(x=>!q||x.c.label.toLowerCase().includes(q)||x.r.estado.toLowerCase().includes(q)).sort((a,b)=>String(b.c.saleDate).localeCompare(String(a.c.saleDate)));
 const cnt=k=>rows.filter(x=>x.r.estado===k).length,tot=rows.reduce((s,x)=>s+x.r.resultado,0);
 return `<p>Por auto vendido: lo <b>cobrado</b> (ventas asignadas), lo <b>pagado</b> (compra o pago al dueño) y los <b>gastos</b> asignados, contra la ficha (planilla). Un auto cuadrado se puede cerrar.</p>
 <section class="oc-metrics oc-six rt-kpi"><article><p>Vendidos</p><strong>${rows.length}</strong></article><article><p>Cuadrados</p><strong>${cnt('CUADRADO')}</strong></article><article><p>Cerrados</p><strong>${cnt('CERRADO')}</strong></article><article><p>Falta cobro / pago</p><strong>${cnt('FALTA_COBRO')+cnt('FALTA_PAGO')}</strong></article><article><p>Difieren de la ficha</p><strong>${cnt('DIFIERE')}</strong></article><article><p>Resultado caja</p><strong>${money(tot)}</strong></article></section>
 <label class="rt-search">Buscar <input data-rt-filter value="${esc(s.filter)}" placeholder="Patente, modelo o estado"></label>
 <div class="oc-table-scroll"><table class="lq-table rt-table"><thead><tr><th>Auto</th><th>Modalidad</th><th>Venta</th><th>Cobrado</th><th>Pagado</th><th>Gastos</th><th>Resultado</th><th>Margen</th><th>Estado</th><th></th></tr></thead><tbody>
 ${rows.map(({c,r})=>`<tr><td><button class="lq-link" data-rt-open="${esc(c.id)}">${esc(c.label)}</button></td><td>${esc(c.modality)}</td><td>${fmtDate(c.saleDate)}</td><td>${money(r.cobrado)}${r.fichaVenta!==null?`<br><small>ficha ${money(r.fichaVenta)}</small>`:''}</td><td>${money(r.pagado)}${r.fichaCompra!==null?`<br><small>ficha ${money(r.fichaCompra)}</small>`:''}</td><td>${money(r.gastos)}${c.parking?`<br><small>+ estac. ${money(c.parking)}</small>`:''}</td><td><b>${money(r.resultado)}</b></td><td>${pct(r.margen)}</td><td>${badge(...ESTADOS[r.estado])}${r.diffs.length?`<br><small>${esc(r.diffs.join(' · '))}</small>`:''}</td>
  <td>${r.estado==='CUADRADO'?`<button data-rt-close="${esc(c.id)}">Cerrar</button>`:r.estado==='CERRADO'?`<button class="lq-link" data-rt-reopen="${esc(c.id)}">Reabrir</button>`:''}</td></tr>
  ${s.open[c.id]?`<tr class="rt-detail"><td colspan="10">${linesTable(c.lines)}</td></tr>`:''}`).join('')}
 </tbody></table></div>`;
}
const linesTable=L=>L&&L.length?`<table class="lq-table"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Concepto</th><th>Tipo</th><th>Monto</th></tr></thead><tbody>${L.map(l=>`<tr><td>${fmtDate(l.date)}</td><td>${esc(l.text)}</td><td>${esc(l.concept)}</td><td>${esc(l.op||'—')}</td><td>${l.dir==='ENTRADA'?'+':'−'}${money(l.amount)}${l.confirmed?'':' <small>por confirmar</small>'}</td></tr>`).join('')}</tbody></table>`:'<p class="lq-empty">Sin movimientos asignados.</p>';
function viewMonth(){
 const R=st().report,rows=monthly(st().movements,R.cars,T()),be=breakeven(rows,R.cars,T()),cur=T().slice(0,7);
 return `<p>Margen de los autos vendidos en el mes (cobrado − pagado − gastos del auto) más otros ingresos, menos los gastos de operación. Quedan fuera: transferencias, aportes, préstamos, gastos personales y «Por aclarar».</p>
 <section class="oc-metrics oc-six rt-kpi"><article><p>Gastos de operación / mes</p><strong>${money(be.opex)}</strong><small>promedio ${be.months.map(perLabel).join(', ')||'—'}</small></article><article><p>Margen promedio por auto</p><strong>${money(be.perCar)}</strong><small>${be.sample} autos, últimos 6 meses</small></article><article><p>Punto de equilibrio</p><strong>${be.cars===null?'—':be.cars.toFixed(1).replace('.',',')+' autos/mes'}</strong></article><article><p>Vendidos este mes</p><strong>${be.soldNow}</strong></article><article><p>Faltan este mes</p><strong>${be.missing===null?'—':be.missing}</strong><small>para cubrir los gastos</small></article><article><p>Margen del mes</p><strong>${money(be.marginNow)}</strong></article></section>
 <div class="oc-table-scroll"><table class="lq-table rt-table"><thead><tr><th>Mes</th><th>Autos</th><th>Margen autos</th><th>Otros ingresos</th><th>Gastos fijos</th><th>Gastos variables</th><th>Resultado</th><th>Personales</th><th>Por aclarar</th><th>Sin asignar</th></tr></thead><tbody>
 ${rows.slice().reverse().map(r=>`<tr${r.month===cur?' class="rt-current"':''}><td><button class="lq-link" data-rt-open="M${r.month}">${perLabel(r.month)}</button></td><td>${r.sold}${r.marginMissing?` <small>(${r.marginMissing} sin margen)</small>`:''}</td><td>${money(r.margin)}</td><td>${money(r.otherIn)}</td><td>${money(r.fixed)}</td><td>${money(r.variable)}</td><td class="${r.result<0?'rt-neg':'rt-pos'}"><b>${money(r.result)}</b></td><td>${money(r.personal)}</td><td>${money(r.aclarar)}</td><td>${r.unassignedN?money(r.unassigned)+` <small>(${r.unassignedN})</small>`:'—'}</td></tr>
  ${s.open['M'+r.month]?`<tr class="rt-detail"><td colspan="10">${Object.entries(r.expenses).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span class="oc-chip">${esc(k)} ${money(v)}</span>`).join(' ')||'Sin gastos.'}</td></tr>`:''}`).join('')}
 </tbody></table></div>`;
}
function summaryCard(){
 if(!s||!config.store)return '';try{const R=st().report,rows=monthly(st().movements,R.cars,T()),be=breakeven(rows,R.cars,T()),cur=rows.find(r=>r.month===T().slice(0,7))||{result:0,margin:0,opex:0};
  return `<section class="oc-metrics oc-six rt-kpi rt-summary"><article><p>Resultado del mes</p><strong class="${cur.result<0?'rt-neg':''}">${money(cur.result)}</strong><small>margen autos + otros − gastos</small></article><article><p>Margen autos del mes</p><strong>${money(cur.margin)}</strong></article><article><p>Gastos de operación del mes</p><strong>${money(cur.opex)}</strong></article><article><p>Punto de equilibrio</p><strong>${be.cars===null?'—':be.cars.toFixed(1).replace('.',',')+' autos'}</strong><small>por mes</small></article><article><p>Vendidos este mes</p><strong>${be.soldNow}</strong></article><article><p>Faltan para equilibrio</p><strong>${be.missing===null?'—':be.missing}</strong></article></section>`;}catch(e){return '';}
}
function viewStock(){
 const rows=stock(st().report.cars,neg().prices,T()),own=rows.filter(r=>r.own),cap=own.reduce((s,r)=>s+r.capital,0),lv=k=>rows.filter(r=>r.level===k).length;
 return `<p>Autos en stock (sin vendidos ni retirados). Alertas a los 45, 60 y 90 días; el precio sugerido rebaja 2%, 4% y 6% y nunca baja del costo en autos propios. El historial guarda cada cambio de precio publicado.</p>
 <section class="oc-metrics oc-six rt-kpi"><article><p>Autos en stock</p><strong>${rows.length}</strong><small>${own.length} propios · ${rows.length-own.length} consignados</small></article><article><p>Capital inmovilizado</p><strong>${money(cap)}</strong><small>autos propios al costo</small></article><article><p>Días promedio</p><strong>${rows.length?Math.round(rows.reduce((s,r)=>s+(r.days||0),0)/rows.length):'—'}</strong></article><article><p>45–59 días</p><strong>${lv('AMARILLO')}</strong></article><article><p>60–89 días</p><strong>${lv('NARANJO')}</strong></article><article><p>90+ días</p><strong>${lv('ROJO')}</strong><small>${money(own.filter(r=>r.level==='ROJO').reduce((s,r)=>s+r.capital,0))} propios</small></article></section>
 <div class="oc-table-scroll"><table class="lq-table rt-table"><thead><tr><th>Auto</th><th>Modalidad</th><th>Estado</th><th>Días</th><th>Precio publicado</th><th>Capital</th><th>Estac.</th><th>Alerta</th><th>Sugerido</th><th>Historial</th></tr></thead><tbody>
 ${rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${esc(r.modality)}</td><td>${esc(r.status)}</td><td>${r.days??'—'}</td><td>${money(r.listPrice)}</td><td>${r.own?money(r.capital):'—'}</td><td>${r.parking?money(r.parking):'—'}</td><td>${r.level?badge(r.level==='ROJO'?'bad':r.level==='NARANJO'?'warn':'soft',r.level==='ROJO'?'90+ días':r.level==='NARANJO'?'60+ días':'45+ días'):''}</td><td>${r.suggested?money(r.suggested):'—'}</td><td>${r.history.length>1?r.history.map(h=>`<small>${fmtDate(h[0])} ${money(h[1])}</small>`).join('<br>')+(r.drop!==null?`<br><small>${pct(r.drop)} desde el primero</small>`:''):'<small>sin cambios</small>'}</td></tr>`).join('')}
 </tbody></table></div>`;
}
async function autoPrices(el){
 if(s.pricesSaved||s.busy)return;s.pricesSaved=true;const next=recordPrices(neg().prices,st().report.cars,T());if(!next)return;
 try{await saveNeg('prices',next);if(s.tab==='stock')draw(el);}catch(e){s.message='No se pudo guardar el historial de precios: '+e.message;draw(el);}
}
function viewConsign(){
 const owners=neg().owners||{},rows=(st().report.cars||[]).filter(c=>c.modality==='CONSIGNADO').map(c=>({c,k:consignment(c,opOf(c.id),owners[c.id])})).sort((a,b)=>(b.c.sold?1:0)-(a.c.sold?1:0)||String(b.c.saleDate).localeCompare(String(a.c.saleDate)));
 const sold=rows.filter(x=>x.c.sold),due=sold.filter(x=>x.k.pendiente>0).reduce((s,x)=>s+x.k.pendiente,0);
 return `<p>Por auto consignado: venta − comisión pactada (ficha: % si es ≤ 100, monto si es mayor) − gastos descontables al dueño = saldo del dueño; menos lo pagado (compra asignada al auto) = pendiente. Imprime la liquidación para el dueño.</p>
 <section class="oc-metrics oc-six rt-kpi"><article><p>Consignados</p><strong>${rows.length}</strong><small>${sold.length} vendidos</small></article><article><p>Deuda con dueños</p><strong>${money(due)}</strong><small>${sold.filter(x=>x.k.pendiente>0).length} autos con saldo pendiente</small></article><article><p>Sin comisión en ficha</p><strong>${sold.filter(x=>x.k.comision===null).length}</strong><small>se muestra la implícita</small></article></section>
 <div class="oc-table-scroll"><table class="lq-table rt-table"><thead><tr><th>Auto</th><th>Dueño</th><th>Venta</th><th>Comisión</th><th>Gastos al dueño</th><th>Saldo dueño</th><th>Pagado</th><th>Pendiente</th><th></th></tr></thead><tbody>
 ${rows.map(({c,k})=>{const o=owners[c.id]||{};return `<tr><td>${esc(c.label)}<br><small>${c.sold?'Vendido '+fmtDate(c.saleDate):esc(c.status)}</small></td><td>${esc(o.name||'—')}</td><td>${money(k.sale)}</td><td>${k.comision!==null?money(k.comision):k.comisionImplicita!==null?money(k.comisionImplicita)+' <small>implícita</small>':'—'}</td><td>${o.desc?money(k.gastos):'<small>no se descuentan ('+money(k.gastos)+')</small>'}</td><td>${money(k.saldo)}</td><td>${money(k.pagado)}</td><td class="${k.pendiente>0?'rt-neg':''}">${k.pendiente===null?'—':money(k.pendiente)}</td><td><button class="lq-link" data-rt-owner="${esc(c.id)}">Dueño</button> · <button class="lq-link" data-rt-print="${esc(c.id)}">Liquidación</button></td></tr>`;}).join('')}
 </tbody></table></div><p><small>Para registrar un pago al dueño, asígnalo en la caja como «Compra de auto» con este auto: aparece aquí como pagado.</small></p>`;
}
function ownerDialog(el,id){
 const c=(st().report.cars||[]).find(x=>x.id===id),o=(neg().owners||{})[id]||{},d=document.createElement('dialog');d.className='oc-dialog';
 d.innerHTML=`<form method="dialog"><h2>Dueño · ${esc(c?c.label:id)}</h2><div class="oc-caja-form"><label>Nombre<input name="name" maxlength="80" value="${esc(o.name||'')}"></label><label>RUT<input name="rut" maxlength="15" value="${esc(o.rut||'')}"></label><label>Cuenta para el pago<input name="bank" maxlength="120" value="${esc(o.bank||'')}"></label><label><input type="checkbox" name="desc"${o.desc?' checked':''}> Los gastos del auto se descuentan al dueño</label></div><p role="status"></p><button value="ok">Guardar</button> <button value="cancel" formnovalidate>Cancelar</button></form>`;
 document.body.append(d);d.showModal();d.addEventListener('close',async()=>{if(d.returnValue==='ok'){const f=new FormData(d.querySelector('form')),all={...(neg().owners||{})};all[id]={name:String(f.get('name')||'').trim(),rut:String(f.get('rut')||'').trim(),bank:String(f.get('bank')||'').trim(),desc:f.has('desc')};
  try{await saveNeg('owners',all);s.message='Datos del dueño guardados.';}catch(e){s.message=e.message;}draw(el);}d.remove();});
}
function printConsign(id){
 const c=(st().report.cars||[]).find(x=>x.id===id),o=(neg().owners||{})[id]||{},k=consignment(c,opOf(id),o),w=window.open('','_blank');if(!w)return;
 w.document.write(`<!doctype html><meta charset="utf-8"><title>Liquidación ${esc(c.label)}</title><style>body{font:14px Arial,sans-serif;margin:32px;color:#222}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}td:last-child{text-align:right}h1{font-size:20px}.t{font-weight:bold}</style>
 <h1>Liquidación de venta en consignación</h1><p>Oportuni Cars SpA · RUT 78.331.651-K · ${fmtDate(T())}</p>
 <table><tr><td>Vehículo</td><td>${esc(c.label)}</td></tr><tr><td>Dueño</td><td>${esc(o.name||'')}${o.rut?' · RUT '+esc(o.rut):''}</td></tr><tr><td>Fecha de venta</td><td>${fmtDate(c.saleDate)}</td></tr></table>
 <table><tr><td>Precio de venta</td><td>${money(k.sale)}</td></tr><tr><td>Comisión Oportuni Cars</td><td>− ${money(k.comision!==null?k.comision:k.comisionImplicita)}</td></tr>${k.desc?`<tr><td>Gastos del auto descontados</td><td>− ${money(k.desc)}</td></tr>`:''}<tr class="t"><td>Saldo para el dueño</td><td>${money(k.saldo!==null?k.saldo:k.sale-(k.comisionImplicita||0)-k.desc)}</td></tr></table>
 <h3>Pagos realizados</h3><table>${k.payments.map(p=>`<tr><td>${fmtDate(p.date)} · ${esc(p.text)}</td><td>${money(p.amount)}</td></tr>`).join('')||'<tr><td>Sin pagos registrados</td><td></td></tr>'}<tr class="t"><td>Total pagado</td><td>${money(k.pagado)}</td></tr><tr class="t"><td>Saldo pendiente</td><td>${money(k.pendiente!==null?k.pendiente:0)}</td></tr></table>
 ${o.bank?`<p>Pago a: ${esc(o.bank)}</p>`:''}<br><br><table><tr><td style="border:0;width:50%">______________________<br>Oportuni Cars SpA</td><td style="border:0;text-align:left">______________________<br>${esc(o.name||'Dueño')}</td></tr></table><script>print()<\/script>`);w.document.close();
}
function viewRules(){
 const C=concepts(),R=rules(),mv=st().movements,prog=progress(mv,T()).slice(0,12),saved=!!neg().rules;
 const accts=(config.store.accountsInfo()||[]).map(a=>{const last=(mv||[]).filter(m=>String(m.cuenta_id)===a.id&&isDay(m.fecha_operacion)).map(m=>m.fecha_operacion).sort().pop()||'';return {...a,last};});
 return `<p>Cada regla busca movimientos <b>sin asignar</b> cuyo texto calza el patrón. Revisa la lista y asigna solo lo que marques. Meta: menos de 5% sin asignar por mes.</p>
 <h3>Carga mensual de cartolas</h3><div class="rt-chips">${accts.map(a=>`<span class="oc-chip${a.last&&dayDiff(a.last,T())>10?' rt-chip-warn':''}">${esc(a.name)} · último movimiento ${fmtDate(a.last)}</span>`).join(' ')} <small>Carga Mercado Pago (pegar «Actividad») y cartolas en Administrar.</small></div>
 <h3>Avance por mes</h3><div class="oc-table-scroll"><table class="lq-table rt-table"><thead><tr><th>Mes</th><th>Movimientos</th><th>Sin asignar</th><th>% sin asignar</th><th>Monto sin asignar</th><th>Meta &lt;5%</th></tr></thead><tbody>${prog.map(p=>`<tr><td>${perLabel(p.month)}</td><td>${p.n}</td><td>${p.un}</td><td>${pct(p.pct)}</td><td>${money(p.unAmount)}</td><td>${p.pct<5?badge('ok','Cumple'):badge('bad','Falta')}</td></tr>`).join('')}</tbody></table></div>
 <h3>Reglas ${saved?'':'<small>(sugeridas, aún no guardadas)</small>'}</h3>
 ${R.map(r=>{const c=resolveConcept(C,r.concept),ms=ruleMatches(mv,r),tot=ms.reduce((s,m)=>s+Number(m.monto),0),open=s.ruleOpen===r.id,sel=s.sel[r.id]||{};
  return `<article class="rt-rule"><div><b>${esc(r.note||r.pattern)}</b> · patrón <code>${esc(r.pattern)}</code> · ${r.dir==='ENTRADA'?'ingresos':r.dir==='SALIDA'?'egresos':'ambos'} → ${c?esc(c.name):'<span class="rt-neg">concepto no encontrado ('+esc(r.concept)+')</span>'}</div>
  <div>${ms.length?`<button class="lq-link" data-rt-rule="${esc(r.id)}">${ms.length} sin asignar · ${money(tot)}</button>`:'<small>Nada pendiente</small>'} <button class="lq-link" data-rt-redit="${esc(r.id)}">Editar</button> <button class="lq-link" data-rt-rdel="${esc(r.id)}">Quitar</button></div>
  ${open&&ms.length?`<div class="oc-table-scroll"><table class="lq-table"><thead><tr><th><input type="checkbox" data-rt-all="${esc(r.id)}"${ms.every(m=>sel[m.movimiento_id]!==false)?' checked':''}></th><th>Fecha</th><th>Movimiento</th><th>Monto</th></tr></thead><tbody>${ms.map(m=>`<tr><td><input type="checkbox" data-rt-pick="${esc(r.id)}" value="${esc(m.movimiento_id)}"${sel[m.movimiento_id]!==false?' checked':''}></td><td>${fmtDate(m.fecha_operacion)}</td><td>${esc(text(m))}</td><td>${money(Number(m.monto))}</td></tr>`).join('')}</tbody></table></div>
   ${c?`<button data-rt-apply="${esc(r.id)}"${s.busy?' disabled':''}>Asignar ${ms.filter(m=>sel[m.movimiento_id]!==false).length} a «${esc(c.name)}»</button>`:''}`:''}</article>`;}).join('')}
 <p><button data-rt-radd>Agregar regla</button> ${saved?'':'<button data-rt-rsave>Guardar estas reglas</button>'}</p>`;
}
function ruleDialog(el,id){
 const R=rules(),r=R.find(x=>x.id===id)||{id:'R'+uid().slice(0,8),pattern:'',concept:'',dir:'SALIDA',note:''},C=concepts().filter(c=>!['APORTE_CAPITAL','PRESTAMO'].includes(c.nature)&&!c.vehicleOperation).sort((a,b)=>a.name.localeCompare(b.name)),cur=resolveConcept(concepts(),r.concept),d=document.createElement('dialog');d.className='oc-dialog';
 d.innerHTML=`<form method="dialog"><h2>${R.some(x=>x.id===id)?'Editar':'Nueva'} regla</h2><div class="oc-caja-form"><label>Nombre<input name="note" maxlength="60" value="${esc(r.note)}"></label><label>Patrón (texto o A|B)<input name="pattern" required maxlength="120" value="${esc(r.pattern)}"></label><label>Dirección<select name="dir">${[['SALIDA','Egresos'],['ENTRADA','Ingresos'],['','Ambos']].map(([v,l])=>`<option value="${v}"${r.dir===v?' selected':''}>${l}</option>`).join('')}</select></label><label>Concepto<select name="concept">${C.map(c=>`<option value="${esc(c.id)}"${cur&&cur.id===c.id?' selected':''}>${esc(c.name)}</option>`).join('')}</select></label></div><p><small>Solo conceptos que no van a un auto: ventas, compras y arreglos se asignan en la caja con su patente.</small></p><button value="ok">Guardar</button> <button value="cancel" formnovalidate>Cancelar</button></form>`;
 document.body.append(d);d.showModal();d.addEventListener('close',async()=>{if(d.returnValue==='ok'){const f=new FormData(d.querySelector('form')),next={id:r.id,note:String(f.get('note')||'').trim(),pattern:String(f.get('pattern')||'').trim(),dir:String(f.get('dir')||''),concept:String(f.get('concept')||'')};
  try{new RegExp(next.pattern,'i');const all=R.some(x=>x.id===r.id)?R.map(x=>x.id===r.id?next:x):[...R,next];await saveNeg('rules',all);s.message='Regla guardada.';}catch(e){s.message=e.message;}draw(el);}d.remove();});
}
function viewComm(){
 const R=neg().commissions||[],data=commissions(st().report.cars,R,T()),months=Object.keys(data).sort().reverse(),people=[...new Set(R.map(r=>r.persona))];
 const paid={};(st().movements||[]).filter(okMove).filter(m=>m.direccion==='SALIDA'&&/comision/i.test(String(m.concepto_nombre||'')+' '+String(m.concepto_id||''))).forEach(m=>{const k=m.fecha_operacion.slice(0,7);paid[k]=(paid[k]||0)+Number(m.monto);});
 const allMonths=[...new Set([...months,...Object.keys(paid)])].sort().reverse();
 return `<p>Reglas de comisión por persona: % del margen del auto, % de la venta o monto fijo por auto vendido, con modalidad y vigencia. El cálculo se compara con las comisiones pagadas en la caja (concepto Comisiones). La variable de JT se ingresa en Liquidaciones.</p>
 <div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Persona</th><th>Base</th><th>Valor</th><th>Modalidad</th><th>Vigencia</th><th></th></tr></thead><tbody>${R.map(r=>`<tr><td>${esc(r.persona)}</td><td>${r.base==='VENTA'?'% de la venta':r.base==='FIJO'?'Fijo por auto':'% del margen'}</td><td>${r.base==='FIJO'?money(Number(r.valor)):esc(r.valor)+'%'}</td><td>${esc(r.modalidad||'TODOS')}</td><td>${r.desde?perLabel(r.desde):'siempre'}${r.hasta?' a '+perLabel(r.hasta):''}</td><td><button class="lq-link" data-rt-cedit="${esc(r.id)}">Editar</button> <button class="lq-link" data-rt-cdel="${esc(r.id)}">Quitar</button></td></tr>`).join('')||'<tr><td colspan="6" class="lq-empty">Sin reglas todavía.</td></tr>'}</tbody></table></div>
 <p><button data-rt-cadd>Agregar regla de comisión</button></p>
 <div class="oc-table-scroll"><table class="lq-table rt-table"><thead><tr><th>Mes</th>${people.map(p=>`<th>${esc(p)}</th>`).join('')}<th>Total calculado</th><th>Pagado en caja</th></tr></thead><tbody>${allMonths.map(m=>{const e=data[m]||{},t=Object.values(e).reduce((s,x)=>s+x.total,0);return `<tr><td>${perLabel(m)}</td>${people.map(p=>`<td>${e[p]?money(e[p].total)+` <small>(${e[p].cars.length})</small>`:'—'}</td>`).join('')}<td><b>${money(t)}</b></td><td>${money(paid[m]||0)}</td></tr>`;}).join('')}</tbody></table></div>`;
}
function commDialog(el,id){
 const R=neg().commissions||[],r=R.find(x=>x.id===id)||{id:uid().slice(0,8),persona:'',base:'MARGEN',valor:'',modalidad:'TODOS',desde:'',hasta:''},d=document.createElement('dialog');d.className='oc-dialog';
 const sel=(n,cur,v)=>`<select name="${n}">${v.map(([a,b])=>`<option value="${a}"${cur===a?' selected':''}>${b}</option>`).join('')}</select>`;
 d.innerHTML=`<form method="dialog"><h2>Regla de comisión</h2><div class="oc-caja-form"><label>Persona<input name="persona" required maxlength="40" value="${esc(r.persona)}" placeholder="JT, vendedor externo…"></label><label>Base${sel('base',r.base,[['MARGEN','% del margen del auto'],['VENTA','% de la venta'],['FIJO','Monto fijo por auto']])}</label><label>Valor (% o $)<input name="valor" type="number" min="0" step="any" required value="${esc(r.valor)}"></label><label>Modalidad${sel('modalidad',r.modalidad,[['TODOS','Todos'],['PROPIO','Propios'],['CONSIGNADO','Consignados']])}</label><label>Desde (mes)<input name="desde" type="month" value="${esc(r.desde)}"></label><label>Hasta (mes)<input name="hasta" type="month" value="${esc(r.hasta)}"></label></div><button value="ok">Guardar</button> <button value="cancel" formnovalidate>Cancelar</button></form>`;
 document.body.append(d);d.showModal();d.addEventListener('close',async()=>{if(d.returnValue==='ok'){const f=new FormData(d.querySelector('form')),next={id:r.id,persona:String(f.get('persona')).trim(),base:String(f.get('base')),valor:Number(f.get('valor')),modalidad:String(f.get('modalidad')),desde:String(f.get('desde')||''),hasta:String(f.get('hasta')||'')};
  try{await saveNeg('commissions',R.some(x=>x.id===r.id)?R.map(x=>x.id===r.id?next:x):[...R,next]);s.message='Regla de comisión guardada.';}catch(e){s.message=e.message;}draw(el);}d.remove();});
}
function viewChannels(){
 const months=Number(s.period)||6,to=T(),from=months>=99?'2000-01-01':addMonths(to.slice(0,7),-(months-1))+'-01',spend=channelSpend(st().movements,from,to),ch=neg().channels||{};
 const sold=(st().report.cars||[]).filter(c=>c.sold&&isDay(c.saleDate)&&c.saleDate>=from&&c.saleDate<=to).sort((a,b)=>b.saleDate.localeCompare(a.saleDate));
 const by={};CHANNELS.forEach(c=>by[c[0]]={n:0,margin:0});let none=0;sold.forEach(c=>{const k=ch[c.id];if(by[k]){by[k].n++;by[k].margin+=c.result||0;}else none++;});
 return `<p>Gasto de publicación por canal (texto del movimiento o concepto) y autos vendidos atribuidos a cada canal. Asigna el canal de cada venta abajo.</p>
 <label>Período <select data-rt-period>${[['3','Últimos 3 meses'],['6','Últimos 6 meses'],['12','Últimos 12 meses'],['99','Todo']].map(([v,l])=>`<option value="${v}"${s.period===v?' selected':''}>${l}</option>`).join('')}</select></label>
 <div class="oc-table-scroll"><table class="lq-table rt-table"><thead><tr><th>Canal</th><th>Gasto</th><th>Ventas</th><th>Costo por venta</th><th>Margen generado</th><th>Retorno</th></tr></thead><tbody>${CHANNELS.map(([k,l])=>{const b=by[k],g=spend[k]||0;return `<tr><td>${esc(l)}</td><td>${money(g)}</td><td>${b.n}</td><td>${b.n&&g?money(g/b.n):'—'}</td><td>${money(b.margin)}</td><td>${g?(b.margin/g).toFixed(1).replace('.',',')+'×':'—'}</td></tr>`;}).join('')}<tr><td>Sin canal asignado</td><td>—</td><td>${none}</td><td></td><td></td><td></td></tr></tbody></table></div>
 <h3>Canal de cada venta</h3><div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Auto</th><th>Venta</th><th>Margen</th><th>Canal</th></tr></thead><tbody>${sold.map(c=>`<tr><td>${esc(c.label)}</td><td>${fmtDate(c.saleDate)}</td><td>${money(c.result)}</td><td><select data-rt-channel="${esc(c.id)}"><option value="">—</option>${CHANNELS.map(([k,l])=>`<option value="${k}"${ch[c.id]===k?' selected':''}>${esc(l)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`;
}
function viewTaxes(list){
 const lab={PAGADO:['ok','Pagado'],VENCIDO:['bad','Vencido sin pago'],PROXIMO:['warn','Próximo'],FUTURO:['soft','Pendiente']};
 return `<p>Obligaciones mensuales y anuales. Un mes queda «pagado» cuando hay un egreso con concepto Impuestos (F29) o Imposiciones (Previred), o con TGR / Previred en el texto, dentro del mes de vencimiento.</p>
 <div class="oc-table-scroll"><table class="lq-table rt-table"><thead><tr><th>Obligación</th><th>Vence</th><th>Estado</th><th>Pagado en caja</th><th>IVA estimado sobre margen</th></tr></thead><tbody>${list.map(t=>`<tr><td>${esc(t.name)}</td><td>${fmtDate(t.due)}</td><td>${badge(...lab[t.status])}</td><td>${t.paid?money(t.paid)+` <small>(${t.moves})</small>`:'—'}</td><td>${t.estimate?money(t.estimate):'—'}</td></tr>`).join('')}</tbody></table></div>
 <ul class="rt-notes"><li><b>F29</b>: IVA, PPM y retenciones de honorarios (15,25% en 2026). Plazo hasta el día 20 del mes siguiente si declaras por internet con factura electrónica; día 12 si no.</li><li><b>IVA sobre margen</b>: estimación del 19% incluido en el margen de autos propios vendidos (margen × 19/119). Es una referencia para provisionar: confirma la base con tu contador.</li><li><b>Previred</b>: cotizaciones del mes anterior, hasta el día 13 por internet.</li><li><b>F22</b>: renta anual en abril. Patentes municipales (enero y julio) dependen de la comuna.</li></ul>`;
}
function planDefaults(){
 const R=st().report,rows=monthly(st().movements,R.cars,T()),be=breakeven(rows,R.cars,T()),from=addDays(T(),-84),sold=(R.cars||[]).filter(c=>c.sold&&isDay(c.saleDate)&&c.saleDate>=from&&c.saleDate<=T()).length;
 return {carsPerWeek:Math.round(sold/12*10)/10,marginPerCar:Math.round(be.perCar||0),opexMonth:Math.round(be.opex||0)};
}
function viewFlow(){
 const R=st().report,saved=neg().plan||{},def=planDefaults(),plan={...def,...saved},opening=(R.accounts||[]).reduce((s,a)=>s+(a.balance||0),0);
 const owners=neg().owners||{},due=(R.cars||[]).filter(c=>c.modality==='CONSIGNADO'&&c.sold).map(c=>consignment(c,opOf(c.id),owners[c.id])).filter(k=>k.pendiente>0).reduce((s,k)=>s+k.pendiente,0);
 const weeks=cashPlan(opening,plan,R.forecasts||[],due,T()),low=weeks.reduce((m,w)=>w.close<m.close?w:m,weeks[0]);
 return `<p>Proyección semanal desde el saldo de hoy en las cuentas. Supuestos editables (por defecto: últimas 12 semanas de ventas, margen promedio y gastos de operación promedio). Suma las proyecciones registradas y paga primero lo pendiente a consignadores.</p>
 <form class="oc-caja-form rt-plan" data-rt-plan><label>Autos vendidos por semana<input name="carsPerWeek" type="number" step="0.1" min="0" value="${esc(plan.carsPerWeek)}"></label><label>Margen por auto<input name="marginPerCar" type="number" step="1000" value="${esc(plan.marginPerCar)}"></label><label>Gastos de operación por mes<input name="opexMonth" type="number" step="1000" min="0" value="${esc(plan.opexMonth)}"></label><button>Guardar supuestos</button> <button type="button" class="lq-link" data-rt-plandef>Volver a los calculados</button></form>
 <section class="oc-metrics oc-six rt-kpi"><article><p>Saldo hoy</p><strong>${money(opening)}</strong></article><article><p>Deuda con consignadores</p><strong>${money(due)}</strong><small>semana 1</small></article><article><p>Saldo mínimo</p><strong class="${low.close<0?'rt-neg':''}">${money(low.close)}</strong><small>semana del ${fmtDate(low.from)}</small></article><article><p>Saldo en 13 semanas</p><strong>${money(weeks[12].close)}</strong></article></section>
 <div class="oc-table-scroll"><table class="lq-table rt-table"><thead><tr><th>Semana</th><th>Saldo inicial</th><th>Margen ventas</th><th>Proyecciones +</th><th>Gastos</th><th>Proyecciones −</th><th>Consignadores</th><th>Saldo final</th></tr></thead><tbody>${weeks.map(w=>`<tr><td>${fmtDate(w.from)}</td><td>${money(w.open)}</td><td>${money(w.sales)}</td><td>${money(w.forecastIn)}</td><td>${money(w.opex)}</td><td>${money(w.forecastOut)}</td><td>${w.consignors?money(w.consignors):'—'}</td><td class="${w.close<0?'rt-neg':''}"><b>${money(w.close)}</b></td></tr>`).join('')}</tbody></table></div>`;
}
const personalConcept=()=>concepts().find(c=>/retiro de socio|gasto personal/i.test(c.name+' '+c.category))||null;
function viewPersonal(){
 const mv=(st().movements||[]).filter(okMove),pc=personalConcept(),acl=mv.filter(isAclarar).sort((a,b)=>b.fecha_operacion.localeCompare(a.fecha_operacion)),per=mv.filter(isPersonal),sel=s.sel.P||{};
 const byM={};per.forEach(m=>{const k=m.fecha_operacion.slice(0,7);byM[k]=(byM[k]||0)+(m.direccion==='SALIDA'?1:-1)*Number(m.monto);});
 return `<p>Gastos personales pagados con la cuenta de la empresa: se registran como <b>retiro de socio</b> y quedan fuera del resultado operacional. Los movimientos en «Por aclarar» se pasan aquí solo los que marques.</p>
 ${pc?`<p>Concepto: <b>${esc(pc.name)}</b></p>`:`<p><button data-rt-pcreate${s.busy?' disabled':''}>Crear concepto «Gasto personal / retiro de socio»</button></p>`}
 <section class="oc-metrics oc-six rt-kpi"><article><p>Retiros registrados</p><strong>${money(per.reduce((s,m)=>s+(m.direccion==='SALIDA'?1:-1)*Number(m.monto),0))}</strong><small>${per.length} movimientos</small></article><article><p>Por aclarar</p><strong>${money(acl.reduce((s,m)=>s+(m.direccion==='SALIDA'?1:-1)*Number(m.monto),0))}</strong><small>${acl.length} movimientos</small></article></section>
 ${Object.keys(byM).length?`<p>${Object.keys(byM).sort().reverse().map(k=>`<span class="oc-chip">${perLabel(k)} ${money(byM[k])}</span>`).join(' ')}</p>`:''}
 <h3>Por aclarar</h3>${acl.length?`<div class="oc-table-scroll"><table class="lq-table"><thead><tr><th></th><th>Fecha</th><th>Movimiento</th><th>Monto</th></tr></thead><tbody>${acl.map(m=>`<tr><td>${m.direccion==='SALIDA'?`<input type="checkbox" data-rt-ppick value="${esc(m.movimiento_id)}"${sel[m.movimiento_id]?' checked':''}>`:''}</td><td>${fmtDate(m.fecha_operacion)}</td><td>${esc(text(m))}</td><td>${m.direccion==='SALIDA'?'−':'+'}${money(Number(m.monto))}</td></tr>`).join('')}</tbody></table></div>
 ${pc?`<button data-rt-papply${s.busy?' disabled':''}>Pasar ${Object.values(sel).filter(Boolean).length} marcados a retiro de socio</button>`:''}`:'<p class="lq-empty">Nada en «Por aclarar».</p>'}`;
}
// Pasar de «Por aclarar» a otro concepto: primero se desasigna y luego se clasifica (la caja exige movimiento libre).
async function moveConcept(el,ids,concept){
 if(s.busy)return;s.busy=true;let ok=0;const fail=[],inv=(config.store.inventoryForCaja()||[]).map(v=>({...v,id:v.id}));
 for(let i=0;i<ids.length;i++){s.progress='Pasando '+(i+1)+' de '+ids.length+'…';draw(el);
  try{let m=config.store.mapped(String(ids[i]));if(m.classification){m=await config.caja.unassign(m);m=config.store.mapped(String(ids[i]));}
   await config.caja.saveMovement(root.OCCaja.classify(m,concept,null,inv));ok++;}catch(e){fail.push(e.message);}}
 try{root.OCCajaNueva&&root.OCCajaNueva.replaceMovements(config.store.movementsForCaja());}catch(e){}
 s.busy=false;s.progress='';s.sel={};s.message=ok+' movimientos pasados a «'+concept.name+'».'+(fail.length?' Fallaron '+fail.length+': '+fail.slice(0,2).join(' · '):'');draw(el);
}

// ---------- Eventos ----------
async function click(el,e){
 const b=e.target.closest('button,[data-rt-pick],[data-rt-all],[data-rt-ppick]');if(!b)return;const d=b.dataset;
 if(d.rtTab){s.tab=d.rtTab;s.message='';s.ruleOpen='';draw(el);return;}
 if(d.rtClear!==undefined){s.message='';draw(el);return;}
 if(d.rtOpen){s.open[d.rtOpen]=!s.open[d.rtOpen];draw(el);return;}
 if(d.rtClose||d.rtReopen){const id=d.rtClose||d.rtReopen,all={...(neg().closed||{})};if(d.rtClose){const c=st().report.cars.find(x=>x.id===id),r=carResult(c,opOf(id),null);all[id]={d:T(),r:Math.round(r.resultado)};}else delete all[id];
  try{await saveNeg('closed',all);s.message=d.rtClose?'Auto cerrado: queda como cuadrado contra la planilla.':'Auto reabierto.';}catch(err){s.message=err.message;}draw(el);return;}
 if(d.rtOwner){ownerDialog(el,d.rtOwner);return;}
 if(d.rtPrint){printConsign(d.rtPrint);return;}
 if(d.rtRule){s.ruleOpen=s.ruleOpen===d.rtRule?'':d.rtRule;draw(el);return;}
 if(d.rtRedit){ruleDialog(el,d.rtRedit);return;}
 if(d.rtRadd!==undefined){ruleDialog(el,'');return;}
 if(d.rtRsave!==undefined){try{await saveNeg('rules',rules());s.message='Reglas guardadas.';}catch(err){s.message=err.message;}draw(el);return;}
 if(d.rtRdel){if(!confirmInline(b))return;try{await saveNeg('rules',rules().filter(r=>r.id!==d.rtRdel));s.message='Regla quitada.';}catch(err){s.message=err.message;}draw(el);return;}
 if(d.rtApply){const r=rules().find(x=>x.id===d.rtApply),c=resolveConcept(concepts(),r.concept),sel=s.sel[r.id]||{},ids=ruleMatches(st().movements,r).filter(m=>sel[m.movimiento_id]!==false).map(m=>m.movimiento_id);if(!c||!ids.length)return;await assign(el,ids,c,'Asignando «'+c.name+'»');return;}
 if(d.rtCadd!==undefined){commDialog(el,'');return;}
 if(d.rtCedit){commDialog(el,d.rtCedit);return;}
 if(d.rtCdel){if(!confirmInline(b))return;try{await saveNeg('commissions',(neg().commissions||[]).filter(r=>r.id!==d.rtCdel));}catch(err){s.message=err.message;}draw(el);return;}
 if(d.rtPlandef!==undefined){try{await saveNeg('plan',null);s.message='Supuestos calculados desde la caja.';}catch(err){s.message=err.message;}draw(el);return;}
 if(d.rtPcreate!==undefined){s.busy=true;draw(el);try{const c={id:uid(),name:'Gasto personal / retiro de socio',category:'Retiro de socio',nature:'GASTO',cost:'NO_APLICA',vehicleOperation:'',recurring:false,version:1};const saved=await config.caja.saveConcept(c);root.OCCajaNueva&&root.OCCajaNueva.upsertConcept(saved&&saved.id?saved:c);s.message='Concepto creado.';}catch(err){s.message=err.message;}s.busy=false;draw(el);return;}
 if(d.rtPapply!==undefined){const ids=Object.entries(s.sel.P||{}).filter(x=>x[1]).map(x=>x[0]),c=personalConcept();if(c&&ids.length)await moveConcept(el,ids,c);return;}
}
function confirmInline(b){if(b.dataset.armed)return true;b.dataset.armed='1';b.textContent='¿Seguro? Toca de nuevo';setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent='Quitar';}},4000);return false;}
async function change(el,e){
 const t=e.target,d=t.dataset;
 if(d.rtFilter!==undefined){s.filter=t.value;draw(el);const i=el.querySelector('[data-rt-filter]');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}return;}
 if(d.rtPick){const m=s.sel[d.rtPick]||(s.sel[d.rtPick]={});m[t.value]=t.checked;draw(el);return;}
 if(d.rtAll){const r=rules().find(x=>x.id===d.rtAll),m=s.sel[d.rtAll]={};ruleMatches(st().movements,r).forEach(x=>m[x.movimiento_id]=t.checked);draw(el);return;}
 if(d.rtPpick!==undefined){const m=s.sel.P||(s.sel.P={});m[t.value]=t.checked;draw(el);return;}
 if(d.rtPeriod!==undefined){s.period=t.value;draw(el);return;}
 if(d.rtChannel){const all={...(neg().channels||{})};if(t.value)all[d.rtChannel]=t.value;else delete all[d.rtChannel];try{await saveNeg('channels',all);}catch(err){s.message=err.message;}draw(el);return;}
}
if(typeof document!=='undefined')document.addEventListener('submit',async e=>{const f=e.target.closest&&e.target.closest('[data-rt-plan]');if(!f||!s)return;e.preventDefault();const x=new FormData(f),el=document.getElementById('oc-rent');
 try{await saveNeg('plan',{carsPerWeek:Number(x.get('carsPerWeek')),marginPerCar:Number(x.get('marginPerCar')),opexMonth:Number(x.get('opexMonth'))});s.message='Supuestos guardados.';}catch(err){s.message=err.message;}if(el)draw(el);});

const api={carCash,carResult,monthly,breakeven,stock,recordPrices,consignment,ruleMatches,resolveConcept,progress,commissions,channelSpend,taxCalendar,cashPlan,DEFAULT_RULES,CHANNELS};
if(typeof module!=='undefined')module.exports=api;
root.OCRentabilidad={...api,setup,reset,markup,mount,summaryCard};
})(typeof globalThis==='undefined'?this:globalThis);
