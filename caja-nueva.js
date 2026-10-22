(function(root){
'use strict';
// Caja cuadrada: desde la fecha de arranque cada cuenta parte de un saldo inicial y solo mueven el saldo los movimientos completos
// (fecha, ingreso/egreso, importe confirmado, concepto y, si es de auto, el auto). Lo anterior vive en la Caja histórica.
const ENT='ENTRADA',SAL='SALIDA';
const dirOk=m=>[ENT,SAL].includes(m.direction)&&!m.directionInferred;
const carOk=m=>!m.classification?.vehicleOperation||!!m.classification.vehicleId;
const isQuickOpen=m=>m.source==='ATAJO'&&!m.confirmed;
function missing(m){
 const out=[];
 if(!m.date)out.push('Fecha');
 if(!dirOk(m))out.push('Ingreso o egreso');
 if(!m.classification)out.push('Concepto');else if(!carOk(m))out.push('Auto');
 if(!Number.isFinite(m.amount)||!m.confirmed)out.push('Importe');
 return out;
}
const isComplete=m=>missing(m).length===0;
const signed=m=>(m.direction===ENT?1:-1)*m.amount;
const isNew=(m,start)=>!!m.date&&m.date>start;
// Saldo de cada cuenta y saldo corrido después de cada movimiento completo (en orden de fecha).
function balances(accounts,movements,start){
 const out={};
 accounts.forEach(a=>{
  const rows=movements.map((m,i)=>({m,i})).filter(({m})=>m.accountId===a.id&&isNew(m,a.cut||start)&&isComplete(m)).sort((x,y)=>x.m.date.localeCompare(y.m.date)||x.i-y.i);
  const running={};let acc=a.opening;
  rows.forEach(({m})=>{if(acc!==null){acc+=signed(m);running[m.id]=acc;}});
  const pending=movements.filter(m=>m.accountId===a.id&&isNew(m,a.cut||start)&&!isComplete(m)&&!isQuickOpen(m));
  out[a.id]={opening:a.opening,computed:acc,running,pending:{count:pending.length,sum:pending.reduce((s,m)=>s+(Number.isFinite(m.amount)?m.amount:0),0)}};
 });
 return out;
}
const dayDiff=(a,b)=>Math.round((Date.parse(a)-Date.parse(b))/86400000);
// Gasto registrado por atajo ↔ movimiento que llegó del banco o Mercado Pago: misma cuenta, importe y dirección, fecha cercana.
function findMatches(list){
 const used=new Set(),out=[];
 for(const q of list.filter(isQuickOpen)){
  const near=list.filter(x=>x.source!=='ATAJO'&&!x.classification&&!used.has(x.id)&&x.accountId===q.accountId&&x.amount===q.amount&&(!x.direction||x.direction===q.direction)&&x.date&&q.date&&dayDiff(x.date,q.date)>=-1&&dayDiff(x.date,q.date)<=5)
   .sort((a,b)=>Math.abs(dayDiff(a.date,q.date))-Math.abs(dayDiff(b.date,q.date)));
  if(near[0]){used.add(near[0].id);out.push({quick:q,target:near[0]});}
 }
 return out;
}
const api={missing,isComplete,balances,findMatches,isNew};
if(typeof module!=='undefined')module.exports=api;
if(!root.document)return;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n):'—';
const fmtDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.slice(8,10)+'-'+v.slice(5,7)+'-'+v.slice(0,4):'Sin fecha';
let s,config,start,matched=false;
function reset(){s=null;config=null;matched=false;document.querySelectorAll('[data-cn-dialog]').forEach(d=>d.remove());}
function setup(options={}){
 config=options;start=options.cashStart||'2026-10-15';matched=false;
 s={movements:(options.movements||[]).slice(),concepts:options.concepts||[],inventory:options.inventory||[],tab:'',message:'',busy:false,checks:{},limit:80};
}
const snapshot=()=>s?{movements:s.movements,concepts:s.concepts}:null;
function replaceMovements(list){if(s)s.movements=list;}
const accountsInfo=()=>config?.accountsInfo?config.accountsInfo():[];
const carLabel=v=>[v.patente||'Sin patente',v.modelo].filter(Boolean).join(' · ');
function carIndex(){const seen={},map=new Map();s.inventory.forEach(v=>{let l=carLabel(v);if(seen[l])l+=' #'+v.id;seen[l]=1;map.set(l,v);});return map;}
function markup(){return '<section id="oc-caja-nueva" class="oc-card"></section>';}
function mount(parent){const el=parent.querySelector('#oc-caja-nueva');if(el&&s){draw(el);autoMatch(el);}}
function conceptsFor(m){return s.concepts.filter(c=>m.direction===ENT?['INGRESO','TRANSFERENCIA','APORTE_CAPITAL','PRESTAMO'].includes(c.nature):m.direction===SAL?c.nature!=='INGRESO':true);}
function check(id){try{return JSON.parse(localStorage.getItem('oc-cuadre-'+id));}catch{return null;}}
function accountCard(a,b){
 const real=s.checks[a.id]??check(a.id),pend=b.pending.count?`<small class="oc-warn-text">${b.pending.count} por completar · ${money(b.pending.sum)}</small>`:'<small>Todo al día</small>';
 const diffText=real?(real.diff===0?`<span class="oc-chip oc-chip-ok">Cuadra · ${fmtDate(real.at)}</span>`:`<span class="oc-chip oc-chip-bad">Diferencia ${money(real.diff)} · ${fmtDate(real.at)}</span>`):'';
 return `<article class="cn-card"><small>${esc(a.name)}</small><strong>${b.computed===null?'Sin saldo inicial':money(b.computed)}</strong>${pend}<div class="cn-check"><input type="number" step="1" inputmode="numeric" placeholder="Saldo real hoy" data-real="${esc(a.id)}"><button type="button" data-cuadrar="${esc(a.id)}">Cuadrar</button></div>${diffText}</article>`;
}
function rowMarkup(m,b,mode){
 const tone=m.direction===ENT&&!m.directionInferred?'oc-in':m.direction===SAL&&!m.directionInferred?'oc-out':'oc-unknown',miss=missing(m);
 const sign=m.direction===SAL?'−':m.direction===ENT?'+':'';
 let right='';
 if(mode==='completar'){
  const c=m.classification,list=conceptsFor(m),vehicle=c?.vehicleOperation;
  right='<div class="cn-controls">'+
   (!dirOk(m)?`<span class="cn-q">${m.direction?'Sugerido: '+(m.direction===ENT?'ingreso':'egreso'):'¿Fue ingreso o egreso?'}</span><button data-dir="${m.id}" data-v="${ENT}">Fue ingreso</button><button data-dir="${m.id}" data-v="${SAL}">Fue egreso</button>`:'')+
   (dirOk(m)?`<select data-concept="${m.id}"><option value="">${c?esc(c.name):'Concepto por asignar'}</option>${list.filter(x=>x.id!==c?.id).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>`:'')+
   (vehicle?`<input list="cn-cars" data-car="${m.id}" placeholder="Patente, marca o modelo" value="${esc(c.vehicleId?carLabel(s.inventory.find(v=>String(v.id)===String(c.vehicleId))||{}):'')}">`:'')+
   (miss.length===1&&miss[0]==='Importe'?`<button data-confirm="${m.id}">Importe correcto</button>`:'')+'</div>';
 }
 const run=mode==='movimientos'&&b?.running[m.id]!==undefined?`<small class="cn-run">Saldo ${money(b.running[m.id])}</small>`:'';
 const tag=mode==='atajos'?'<span class="oc-chip oc-chip-warn">Registrado · espera el movimiento real</span>':miss.length&&mode==='completar'?miss.map(x=>`<span class="oc-chip oc-chip-bad">Falta ${esc(x.toLowerCase())}</span>`).join(' '):'';
 return `<article class="oc-caja-row oc-row-${tone}${m.saving?' oc-saving':''}${mode==='atajos'?' cn-gray':''}"><div><small>${esc(m.account)} · ${fmtDate(m.date)}</small><h3>${esc(m.description)}</h3><strong class="oc-amount ${tone}">${sign}${money(m.amount)}</strong> ${tag}${m.classification?`<small>${esc(m.classification.name)}${m.classification.vehicleId?' · auto asignado':''}</small>`:''}${run}</div>${right}</article>`;
}
function draw(el){
 const infos=accountsInfo(),bal=balances(infos,s.movements,start),all=s.movements.filter(m=>isNew(m,start));
 const todo=all.filter(m=>!isComplete(m)&&!isQuickOpen(m)).sort((a,b)=>b.date.localeCompare(a.date)),done=all.filter(isComplete).sort((a,b)=>b.date.localeCompare(a.date)),quick=all.filter(isQuickOpen).sort((a,b)=>b.date.localeCompare(a.date));
 if(!s.tab)s.tab=todo.length?'completar':'movimientos';
 const list=s.tab==='completar'?todo:s.tab==='atajos'?quick:done;
 const balOf=m=>bal[m.accountId];
 const needSetup=infos.some(a=>a.opening===null||a.cut!==start);
 const completable=todo.filter(m=>{const x=missing(m);return x.length===1&&x[0]==='Importe';});
 el.innerHTML=`<p class="oc-eyebrow">CAJA Y BANCOS · DESDE ${esc(fmtDate(start))}</p><h2>Saldo exacto, movimiento a movimiento.</h2><p>Un movimiento mueve el saldo cuando tiene fecha, ingreso o egreso, concepto, auto (si es de auto) e importe confirmado. Lo anterior al ${esc(fmtDate(start))} está en <b>Caja histórica</b>.</p>
 ${needSetup&&config.saveBalance?`<div class="oc-notice"><strong>Falta fijar los saldos iniciales</strong><p>Saldos al cierre del ${esc(fmtDate(start))}. Se guardan una sola vez.</p><button id="cn-setup">Fijar saldos iniciales</button></div>`:''}
 ${s.message?`<p role="status">${esc(s.message)}</p>`:''}
 <div class="cn-cards">${infos.map(a=>accountCard(a,bal[a.id])).join('')||'<p>Sin cuentas.</p>'}</div>
 <div class="oc-tabs"><button class="oc-tab${s.tab==='completar'?' active':''}" data-cn-tab="completar">Por completar (${todo.length})</button><button class="oc-tab${s.tab==='movimientos'?' active':''}" data-cn-tab="movimientos">Movimientos (${done.length})</button><button class="oc-tab${s.tab==='atajos'?' active':''}" data-cn-tab="atajos">Registrados por atajo (${quick.length})</button></div>
 ${s.tab==='completar'&&completable.length>1?`<p><button id="cn-confirm-all">Confirmar ${completable.length} importes ya completos</button></p>`:''}
 <datalist id="cn-cars">${[...carIndex().keys()].map(l=>`<option value="${esc(l)}"></option>`).join('')}</datalist>
 <div class="oc-caja-list">${list.slice(0,s.limit).map(m=>rowMarkup(m,balOf(m),s.tab)).join('')||'<p>Nada por aquí.</p>'}</div>
 ${list.length>s.limit?`<p><button id="cn-more">Mostrar más (${list.length-s.limit})</button></p>`:''}`;
 wire(el);
}
function replace(m){s.movements=s.movements.map(x=>x.id===m.id?m:x);}
async function persist(el,next){
 const prev=s.movements.find(x=>x.id===next.id);if(!prev||prev.saving)return;
 const undo=config.applyLocal?config.applyLocal(next):()=>{};
 replace({...next,saving:true});draw(el);
 try{const saved=await config.saveMovement(next);replace({...(saved||next),saving:false});s.message='Guardado.';}
 catch(e){undo();replace(prev);s.message=e.message;}
 draw(el);
}
async function run(el,m,fn){
 if(m.saving)return;replace({...m,saving:true});draw(el);
 try{const next=await fn();replace({...next,saving:false});s.message='Guardado.';}
 catch(e){replace(m);s.message=e.message;}
 draw(el);
}
function wire(el){
 el.querySelectorAll('[data-cn-tab]').forEach(b=>b.onclick=()=>{s.tab=b.dataset.cnTab;s.limit=80;draw(el);});
 const more=el.querySelector('#cn-more');if(more)more.onclick=()=>{s.limit+=100;draw(el);};
 const setupBtn=el.querySelector('#cn-setup');if(setupBtn)setupBtn.onclick=()=>setupDialog(el);
 el.querySelectorAll('[data-cuadrar]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.cuadrar,input=el.querySelector(`[data-real="${id}"]`);if(!input||input.value==='')return;
  const a=accountsInfo().find(x=>x.id===id),b2=balances([a],s.movements,start)[id];if(b2.computed===null)return;
  const at=new Date().toLocaleDateString('en-CA',{timeZone:'America/Santiago'}),rec={real:Number(input.value),diff:Number(input.value)-b2.computed,at};
  s.checks[id]=rec;try{localStorage.setItem('oc-cuadre-'+id,JSON.stringify(rec));}catch{}draw(el);
 });
 el.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>{const m=s.movements.find(x=>x.id===b.dataset.dir);run(el,m,async()=>config.setDirection(m,b.dataset.v));});
 el.querySelectorAll('[data-concept]').forEach(b=>b.onchange=()=>{
  if(!b.value)return;const m=s.movements.find(x=>x.id===b.dataset.concept),c=s.concepts.find(x=>x.id===b.value);
  try{const next=root.OCCaja.classify(m,c,m.classification?.vehicleId||null,s.inventory.map(v=>({...v,id:v.id})));
   if(['APORTE_CAPITAL','PRESTAMO'].includes(c.nature)){s.message='Los aportes y préstamos se completan en la Caja histórica con su detalle.';draw(el);return;}
   persist(el,next);}catch(e){s.message=e.message;draw(el);}
 });
 el.querySelectorAll('[data-car]').forEach(b=>b.onchange=()=>{
  const v=carIndex().get(b.value.trim());if(!v){s.message='Elige un auto de la lista (patente, marca o modelo).';draw(el);return;}
  const m=s.movements.find(x=>x.id===b.dataset.car);try{persist(el,root.OCCaja.assignVehicle(m,v.id,s.inventory));}catch(e){s.message=e.message;draw(el);}
 });
 el.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=()=>{const m=s.movements.find(x=>x.id===b.dataset.confirm);run(el,m,()=>config.confirmAmount(m));});
 const all=el.querySelector('#cn-confirm-all');
 if(all)all.onclick=async()=>{
  const rows=s.movements.filter(m=>isNew(m,start)&&!isQuickOpen(m)).filter(m=>{const x=missing(m);return x.length===1&&x[0]==='Importe';}).slice(0,60);
  s.busy=true;let n=0;
  for(const m of rows){try{const cur=s.movements.find(x=>x.id===m.id);replace(await config.confirmAmount(cur));n++;}catch(e){s.message=e.message;break;}}
  s.busy=false;if(!s.message)s.message=n+' importes confirmados.';draw(el);
 };
 el.querySelectorAll('.oc-saving button,.oc-saving select,.oc-saving input').forEach(b=>b.disabled=true);
}
// Macheo automático al abrir: cada gasto registrado por atajo se une al movimiento real equivalente.
async function autoMatch(el){
 if(matched||!config?.quickMatch)return;matched=true;
 const pairs=findMatches(s.movements);let n=0;
 for(const {quick,target} of pairs){
  try{const next=await config.quickMatch(quick,target);
   const t=s.movements.find(x=>x.id===target.id);
   s.movements=s.movements.filter(x=>x.id!==quick.id).map(x=>x.id===target.id?{...x,version:Number(next.version||x.version+1),direction:quick.direction,directionInferred:false,confirmed:true,classification:quick.classification,status:quick.status}:x);
   if(t)n++;}catch(e){break;}
 }
 if(n){s.message=n+' gastos registrados por atajo se machearon con su movimiento.';if(el.isConnected)draw(el);}
}
function setupDialog(el){
 const infos=accountsInfo(),defaults=a=>a.opening!==null?a.opening:/mercado/i.test(a.name)?3402265:/^caja\b/i.test(a.name)?5040000:0;
 const d=document.createElement('dialog');d.className='oc-dialog';d.dataset.cnDialog='';
 d.innerHTML=`<form><h2>Saldos iniciales al cierre del ${esc(fmtDate(start))}</h2><div class="oc-caja-form">${infos.map(a=>`<label>${esc(a.name)}<input name="${esc(a.id)}" type="number" step="1" required value="${defaults(a)}"></label>`).join('')}</div><p role="status"></p><button type="submit">Guardar saldos</button> <button type="button" id="cn-cancel">Cancelar</button></form>`;
 document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();d.querySelector('#cn-cancel').onclick=()=>d.close();
 d.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const status=d.querySelector('[role=status]'),f=new FormData(e.target);
  try{for(const a of infos){status.textContent='Guardando '+a.name+'…';const cur=accountsInfo().find(x=>x.id===a.id);await config.saveBalance(a.id,Number(f.get(a.id)),start,cur.version);}
   d.close();s.message='Saldos iniciales guardados.';draw(el);}
  catch(err){status.textContent=err.message;}
 };
}
root.OCCajaNueva={...api,setup,reset,markup,mount,snapshot,replaceMovements};
})(typeof globalThis==='undefined'?this:globalThis);
