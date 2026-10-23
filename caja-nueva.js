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
const inRange=(m,start,mode)=>mode==='hist'?(!m.date||m.date<=start):isNew(m,start);
// Saldo de cada cuenta y saldo corrido después de cada movimiento completo (en orden de fecha).
function balances(accounts,movements,start,mode){
 const out={};
 accounts.forEach(a=>{
  const hist=mode==='hist',cut=hist?start:(a.cut||start);
  const rows=movements.map((m,i)=>({m,i})).filter(({m})=>m.accountId===a.id&&inRange(m,cut,mode)&&isComplete(m)).sort((x,y)=>x.m.date.localeCompare(y.m.date)||x.i-y.i);
  const running={};let acc=hist?0:a.opening;
  rows.forEach(({m})=>{if(acc!==null){acc+=signed(m);running[m.id]=acc;}});
  const pending=movements.filter(m=>m.accountId===a.id&&inRange(m,cut,mode)&&!isComplete(m)&&!isQuickOpen(m));
  out[a.id]={opening:a.opening,computed:acc,running,pending:{count:pending.length,sum:pending.reduce((s,m)=>s+(Number.isFinite(m.amount)?m.amount:0),0)}};
 });
 return out;
}
// Segundo factor: saldo inicial + TODOS los movimientos desde el corte (completos o no), para cruzarlo con el saldo real del banco/Mercado Pago.
function movementBalance(a,movements,start){
 if(a.opening===null||a.opening===undefined)return null;
 const cut=a.cut||start;let acc=a.opening,n=0,skipped=0;
 movements.filter(m=>m.accountId===a.id&&isNew(m,cut)).forEach(m=>{
  if((m.direction!==ENT&&m.direction!==SAL)||!Number.isFinite(m.amount)){skipped++;return;}
  acc+=m.direction===ENT?m.amount:-m.amount;n++;
 });
 return {value:acc,count:n,skipped};
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
const api={missing,isComplete,balances,findMatches,isNew,inRange,movementBalance};
if(typeof module!=='undefined')module.exports=api;
if(!root.document)return;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n):'—';
const fmtDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.slice(8,10)+'-'+v.slice(5,7)+'-'+v.slice(0,4):'Sin fecha';
let s,config,start,matched=false,mode='nueva';
function reset(){s=null;config=null;matched=false;document.querySelectorAll('[data-cn-dialog]').forEach(d=>d.remove());}
function setup(options={}){
 config=options;start=options.cashStart||'2026-10-15';matched=false;
 s={movements:(options.movements||[]).slice(),concepts:options.concepts||[],inventory:options.inventory||[],tab:{nueva:'',hist:''},editing:'',message:'',busy:false,checks:{},limit:80};
}
const snapshot=()=>s?{movements:s.movements,concepts:s.concepts}:null;
function replaceMovements(list){if(s)s.movements=list;}
function addMovements(list){if(!s)return;const ids=new Set(list.map(m=>m.id));s.movements=[...list,...s.movements.filter(m=>!ids.has(m.id))];}
function movementsBySource(src){return s?s.movements.filter(m=>m.source===src):[];}
function removeMovement(id){if(s)s.movements=s.movements.filter(m=>m.id!==id);}
const accountsInfo=()=>config?.accountsInfo?config.accountsInfo():[];
const carLabel=v=>[v.patente||'Sin patente',v.modelo].filter(Boolean).join(' · ');
function carIndex(){const seen={},map=new Map();s.inventory.forEach(v=>{let l=carLabel(v);if(seen[l])l+=' #'+v.id;seen[l]=1;map.set(l,v);});return map;}
function markup(m){mode=m==='hist'?'hist':'nueva';return '<section id="oc-caja-nueva" class="oc-card"></section>';}
function mount(parent){const el=parent.querySelector('#oc-caja-nueva');if(el&&s){draw(el);if(mode==='nueva')autoMatch(el);}}
function conceptsFor(m){return s.concepts.filter(c=>m.direction===ENT?['INGRESO','TRANSFERENCIA','APORTE_CAPITAL','PRESTAMO'].includes(c.nature):m.direction===SAL?c.nature!=='INGRESO':true);}
const realMp=a=>s&&s.mpBalance&&/mercado/i.test(a.name)?Number(s.mpBalance.saldo):null;
function totalLine(infos,bal){
 const shown=a=>/mercado/i.test(a.name)?(movementBalance(a,s.movements,start)||{}).value:bal[a.id]&&bal[a.id].computed,known=infos.filter(a=>shown(a)!==null&&shown(a)!==undefined),total=known.reduce((t,a)=>t+shown(a),0);
 const sync=config.syncMercadoPago?`<button id="cn-mp" class="cn-sync${s.syncing?' spin':''}" title="Actualizar Mercado Pago" aria-label="Actualizar Mercado Pago" ${s.syncing?'disabled':''}>⟳</button>`:'';
 const mpBal=s.mpBalance&&s.mpBalance.at?`<small>${esc(fmtDate(String(s.mpBalance.at).slice(0,10)))} ${esc(String(s.mpBalance.at).slice(11,16))}</small>`:'';
 return `<p class="cn-total"><small>Saldo total</small> <strong>${known.length?money(total):'—'}</strong> ${sync} ${mpBal}</p>`;
}
async function syncMp(el){
 if(s.syncing)return;s.syncing=true;draw(el);
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 try{
  let r=await config.syncMercadoPago('iniciar'),added=r.agregados||0,done=r.completados||0,since=r.desde,hold=r.porLiberar||0,voided=r.anulados||0,bal=null,notes=[].concat(r.avisos||[]);
  for(let i=0;i<14&&r.fase==='reporte_pendiente';i++){
   s.message='Esperando el reporte de Mercado Pago ('+Math.min(100,(i+1)*7)+'%)…';draw(el);await wait(12000);
   r=await config.syncMercadoPago('revisar');added+=r.agregados||0;done+=r.completados||0;if(r.saldoMercadoPago)bal=r.saldoMercadoPago;if(r.avisos)notes=notes.concat(r.avisos);
  }
  s.movements=await config.reloadMovements();
  if(bal)s.mpBalance={saldo:bal.saldo,at:bal.at};
  s.message=(added?`Mercado Pago: ${added} movimiento${added===1?'':'s'} nuevo${added===1?'':'s'}`:'Mercado Pago al día')+(done?`, ${done} completado${done===1?'':'s'} (fecha o dirección)`:'')+(hold?` · ${hold} por liberar`:'')+(voided?` · ${voided} anulado${voided===1?'':'s'} (Mercado Pago los canceló)`:'')+(since?` · revisado desde ${fmtDate(since)}`:'')+'.'+(r.fase==='reporte_pendiente'?' El reporte de retiros y saldo aún no llega; aprieta de nuevo en unos minutos.':'')+(notes.length?' '+notes.join(' '):'');
 }catch(e){
  if(/^TOKEN:/.test(e.message)){s.message=e.message.replace(/^TOKEN:\s*/,'')+(config.isAdmin?'':' Pídele a Alex que registre el token.');if(config.isAdmin){s.syncing=false;draw(el);tokenDialog(el);return;}}
  else s.message=e.message;
 }
 s.syncing=false;draw(el);if(mode==='nueva')autoMatch(el);
}
function tokenDialog(el){
 const d=document.createElement('dialog');d.className='oc-dialog';d.dataset.cnDialog='';
 d.innerHTML=`<form><h2>Claves de Mercado Pago</h2><p><small>Se guardan solo en tu Google Apps Script; nunca vuelven a mostrarse. El Access Token es obligatorio; con Client ID y Secret el sistema renueva el token solo.</small></p><div class="oc-caja-form"><label>Access Token<input name="accessToken" type="password" autocomplete="off" required></label><label>Public Key (opcional)<input name="publicKey" autocomplete="off"></label><label>Client ID (opcional)<input name="clientId" autocomplete="off"></label><label>Client Secret (opcional)<input name="clientSecret" type="password" autocomplete="off"></label></div><p role="status"></p><button type="submit">Guardar y actualizar</button> <button type="button" id="cn-cancel">Cancelar</button></form>`;
 document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();d.querySelector('#cn-cancel').onclick=()=>d.close();
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const st=d.querySelector('[role=status]');st.textContent='Validando con Mercado Pago…';
  try{await config.saveMpToken(Object.fromEntries(new FormData(e.target)));d.close();if(el&&el.id==='oc-caja-nueva'){s.message='Token guardado.';draw(el);syncMp(el);}else alert('Claves guardadas.');}catch(err){st.textContent=err.message;}};
}
function movLine(a){
 if(!/mercado/i.test(a.name))return '';
 const mb=movementBalance(a,s.movements,start);if(!mb)return '';
 const real=realMp(a),diff=real===null?null:real-mb.value;
 return `<small class="cn-mov">Por movimientos desde ${esc(fmtDate(a.cut||start))}: <b>${money(mb.value)}</b> (${mb.count} mov.${mb.skipped?`, ${mb.skipped} sin dirección o importe`:''})${diff===null?'':` · diferencia con el real: <b class="${diff===0?'cn-ok':'cn-bad'}">${diff===0?'cuadra':money(diff)}</b>`}</small>`;
}
function accountCard(a,bl){
 if(mode==='hist'){
  const gap=a.opening===null?null:a.opening-bl.computed,pend=bl.pending.count?`<small class="oc-warn-text">${bl.pending.count} por completar · ${money(bl.pending.sum)}</small>`:'<small>Todo al día</small>';
  return `<article class="cn-card"><small>${esc(a.name)}</small><strong>${money(bl.computed)}</strong><small>Según lo registrado hasta el ${esc(fmtDate(start))}</small>${a.opening!==null?`<small>Saldo real al ${esc(fmtDate(start))}: <b>${money(a.opening)}</b></small><small>${gap===0?'Historia completa':'Falta reconstruir '+money(gap)}</small>`:''}${pend}</article>`;
 }
 if(/mercado/i.test(a.name)){const mb=movementBalance(a,s.movements,start),real=realMp(a);return `<article class="cn-card"><small>${esc(a.name)}</small><strong>${mb?money(mb.value):'Sin saldo inicial'}</strong>${real!==null?`<small class="cn-mp-real${mb&&mb.value===real?' cn-ok':''}">${money(real)}</small>`:''}</article>`;}
 const pend=bl.pending.count?`<small class="oc-warn-text">${bl.pending.count} por completar · ${money(bl.pending.sum)}</small>`:'<small>Todo al día</small>';
 return `<article class="cn-card"><small>${esc(a.name)}</small><strong>${realMp(a)!==null?money(realMp(a)):bl.computed===null?'Sin saldo inicial':money(bl.computed)}</strong>${realMp(a)!==null?`<small>Saldo real de Mercado Pago al ${esc(fmtDate(String(s.mpBalance.at||'').slice(0,10)))} ${esc(String(s.mpBalance.at||'').slice(11,16))} · según lo clasificado ${bl.computed===null?'—':money(bl.computed)}</small>`:''}${pend}${movLine(a)}</article>`;
}
function controls(m){
 const c=m.classification,list=conceptsFor(m),vehicle=c?.vehicleOperation,miss=missing(m);
 return '<div class="cn-controls">'+
  (!dirOk(m)?`<span class="cn-q">${m.direction?'Sugerido: '+(m.direction===ENT?'ingreso':'egreso'):'¿Fue ingreso o egreso?'}</span><button data-dir="${m.id}" data-v="${ENT}">Fue ingreso</button><button data-dir="${m.id}" data-v="${SAL}">Fue egreso</button>`:'')+
  (dirOk(m)?`<select data-concept="${m.id}"><option value="">${c?esc(c.name):'Concepto por asignar'}</option>${list.filter(x=>x.id!==c?.id).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>`:'')+
  (vehicle?`<input list="cn-cars" data-car="${m.id}" placeholder="Patente, marca o modelo" value="${esc(c.vehicleId?carLabel(s.inventory.find(v=>String(v.id)===String(c.vehicleId))||{}):'')}">`:'')+
  (miss.length===1&&miss[0]==='Importe'?`<button data-confirm="${m.id}">Importe correcto</button>`:'')+
  (c||m.confirmed?`<button data-unassign="${m.id}" class="cn-undo">Deshacer asignación</button>`:'')+'</div>';
}
function gear(m){
 const open=s.gear===m.id;
 return `<div class="cn-gearbox"><button class="cn-gear" data-gear="${m.id}" title="Cambiar ingreso/egreso" aria-label="Cambiar ingreso o egreso">⚙</button>${open?`<span class="cn-flip"><button data-flip="${m.id}" data-v="${ENT}"${m.direction===ENT&&!m.directionInferred?' disabled':''}>Es ingreso</button><button data-flip="${m.id}" data-v="${SAL}"${m.direction===SAL&&!m.directionInferred?' disabled':''}>Es egreso</button></span>`:''}</div>`;
}
function rowMarkup(m,bl,tab){
 const tone=m.direction===ENT&&!m.directionInferred?'oc-in':m.direction===SAL&&!m.directionInferred?'oc-out':'oc-unknown',miss=missing(m);
 const sign=m.direction===SAL?'−':m.direction===ENT?'+':'';
 const open=tab==='completar'||s.editing===m.id,quick=tab==='atajos';
 const right=quick?'':open?controls(m):`<div class="cn-controls"><button data-edit="${m.id}" class="cn-edit">Corregir</button></div>`;
 const run=tab==='movimientos'&&bl?.running[m.id]!==undefined?`<small class="cn-run">Saldo ${money(bl.running[m.id])}</small>`:'';
 const tag=quick?'<span class="oc-chip oc-chip-warn">Registrado · espera el movimiento real</span>':miss.length&&tab==='completar'?miss.map(x=>`<span class="oc-chip oc-chip-bad">Falta ${esc(x.toLowerCase())}</span>`).join(' '):'';
 return `<article class="oc-caja-row oc-row-${tone}${m.saving?' oc-saving':''}${quick?' cn-gray':''}"><div><small>${esc(m.account)} · ${fmtDate(m.date)}</small><h3>${esc(m.description)}</h3><strong class="oc-amount ${tone}">${sign}${money(m.amount)}</strong> ${tag}${m.classification?`<small>${esc(m.classification.name)}${m.classification.vehicleId?' · auto asignado':''}</small>`:''}${run}</div><div class="cn-side">${right}${quick?'':gear(m)}</div></article>`;
}
function draw(el){
 const hist=mode==='hist',infos=accountsInfo(),bal=balances(infos,s.movements,start,mode),all=s.movements.filter(m=>inRange(m,start,mode));
 const byDate=(a,b)=>(b.date||'').localeCompare(a.date||'');
 const todo=all.filter(m=>!isComplete(m)&&!isQuickOpen(m)).sort(byDate),done=all.filter(isComplete).sort(byDate),quick=all.filter(isQuickOpen).sort(byDate);
 const tabs=s.tab;if(!tabs[mode])tabs[mode]=todo.length?'completar':'movimientos';const tab=tabs[mode];
 const list=tab==='completar'?todo:tab==='atajos'?quick:done;
 const balOf=m=>bal[m.accountId];
 const needSetup=!hist&&infos.some(a=>a.opening===null);
 const completable=todo.filter(m=>{const x=missing(m);return x.length===1&&x[0]==='Importe';});
 const head=hist?`<p class="oc-eyebrow">CAJA HISTÓRICA · HASTA EL ${esc(fmtDate(start))}</p><h2>Reconstruye el pasado, sin apuro.</h2><p>Mismos movimientos y mismas reglas que Caja y bancos. El saldo de cada cuenta es lo que suman los movimientos ya registrados correctamente; cuando la historia esté completa debe coincidir con el saldo real del ${esc(fmtDate(start))}.</p>`:`<p class="oc-eyebrow">CAJA Y BANCOS · DESDE ${esc(fmtDate(start))}</p><h2>Saldo exacto, movimiento a movimiento.</h2><p>Los saldos iniciales al ${esc(fmtDate(start))} son definitivos. Un movimiento mueve el saldo cuando tiene fecha, ingreso o egreso, concepto, auto (si es de auto) e importe confirmado.</p>`;
 el.innerHTML=`${head}
 ${needSetup&&config.saveBalance?`<div class="oc-notice"><strong>Faltan saldos iniciales</strong><p>Se fijan una sola vez y no se pueden modificar.</p><button id="cn-setup">Fijar saldos iniciales</button></div>`:''}
 ${s.message?`<p role="status">${esc(s.message)}</p>`:''}
 ${hist?'':totalLine(infos,bal)}
 <div class="cn-cards">${infos.map(a=>accountCard(a,bal[a.id])).join('')||'<p>Sin cuentas.</p>'}</div>
 <div class="oc-tabs"><button class="oc-tab${tab==='completar'?' active':''}" data-cn-tab="completar">Por completar (${todo.length})</button><button class="oc-tab${tab==='movimientos'?' active':''}" data-cn-tab="movimientos">Movimientos (${done.length})</button>${quick.length||!hist?`<button class="oc-tab${tab==='atajos'?' active':''}" data-cn-tab="atajos">Registrados por atajo (${quick.length})</button>`:''}</div>
 ${tab==='completar'&&completable.length>1?`<p><button id="cn-confirm-all">Confirmar ${completable.length} importes ya completos</button></p>`:''}
 <datalist id="cn-cars">${[...carIndex().keys()].map(l=>`<option value="${esc(l)}"></option>`).join('')}</datalist>
 <div class="oc-caja-list">${list.slice(0,s.limit).map(m=>rowMarkup(m,balOf(m),tab)).join('')||'<p>Nada por aquí.</p>'}</div>
 ${list.length>s.limit?`<p><button id="cn-more">Mostrar más (${list.length-s.limit})</button></p>`:''}`;
 wire(el);
}
function replace(m){s.movements=s.movements.map(x=>x.id===m.id?m:x);}
async function persist(el,next){
 const prev=s.movements.find(x=>x.id===next.id);if(!prev||prev.saving)return;
 const undo=config.applyLocal?config.applyLocal(next):()=>{};
 replace({...next,saving:true});draw(el);
 try{const saved=await config.saveMovement(next);replace({...(saved||next),saving:false});s.editing='';s.message='Guardado.';}
 catch(e){undo();replace(prev);s.message=e.message;}
 draw(el);
}
async function run(el,m,fn){
 if(m.saving)return;replace({...m,saving:true});draw(el);
 try{const next=await fn();replace({...next,saving:false});s.editing='';s.message='Guardado.';}
 catch(e){replace(m);s.message=e.message;}
 draw(el);
}
function wire(el){
 el.querySelectorAll('[data-cn-tab]').forEach(b=>b.onclick=()=>{s.tab[mode]=b.dataset.cnTab;s.limit=80;draw(el);});
 const more=el.querySelector('#cn-more');if(more)more.onclick=()=>{s.limit+=100;draw(el);};
 const mp=el.querySelector('#cn-mp');if(mp)mp.onclick=()=>syncMp(el);
 const setupBtn=el.querySelector('#cn-setup');if(setupBtn)setupBtn.onclick=()=>setupDialog(el);
 el.querySelectorAll('[data-gear]').forEach(b=>b.onclick=()=>{s.gear=s.gear===b.dataset.gear?'':b.dataset.gear;draw(el);});
 el.querySelectorAll('[data-flip]').forEach(b=>b.onclick=async()=>{
  const m=s.movements.find(x=>x.id===b.dataset.flip);if(!m||m.saving)return;s.gear='';s.message='Cambiando…';draw(el);
  try{await config.flipDirection(m,b.dataset.v);s.movements=await config.reloadMovements();s.message='Cambiado a '+(b.dataset.v===ENT?'ingreso':'egreso')+'.';}catch(e){s.message=e.message;}
  draw(el);
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
 el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{s.editing=b.dataset.edit;draw(el);});
 el.querySelectorAll('[data-unassign]').forEach(b=>b.onclick=()=>{const m=s.movements.find(x=>x.id===b.dataset.unassign);if(!m||!config.unassign)return;if(!confirm('¿Deshacer la asignación de este movimiento? Vuelve a «Por completar» y deja de contar en el saldo.'))return;s.editing='';run(el,m,()=>config.unassign(m));});
 el.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=()=>{const m=s.movements.find(x=>x.id===b.dataset.confirm);run(el,m,()=>config.confirmAmount(m));});
 const all=el.querySelector('#cn-confirm-all');
 if(all)all.onclick=async()=>{
  const rows=s.movements.filter(m=>inRange(m,start,mode)&&!isQuickOpen(m)).filter(m=>{const x=missing(m);return x.length===1&&x[0]==='Importe';}).slice(0,60);
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
root.OCCajaNueva={...api,tokenDialog:el=>tokenDialog(el),setup,reset,markup,mount,snapshot,replaceMovements,addMovements,movementsBySource,removeMovement};
})(typeof globalThis==='undefined'?this:globalThis);
