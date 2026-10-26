(function(root){
'use strict';
// Liquidaciones y pagos fijos (solo Alex): lo que se DEBE cada mes, por componentes, separado de lo que se PAGÓ (caja).
// Un pago puede cubrir varios componentes o meses; un mes puede pagarse con varios movimientos.
// Sueldo JT: base + variable (regla y tope abiertos). Arriendo: arriendo + estacionamientos. Cars and Coffee: cuota.
// Las planillas son la referencia del flujo (CSV) para encontrar cada pago: nunca suman en los totales.
const OBLIGS={
 JT:{label:'Sueldo JT',intro:'Base fija por mes y variable aparte (regla y tope por definir: se ingresan a mano).',
  comps:[['BASE','Base',3000000],['VARIABLE','Variable',null]],
  planilla:[{n:52,mes:'2025-12',monto:3000000,origen:'SCOTIA'},{n:139,mes:'2026-01',monto:5741907,origen:'SCOTIA'},{n:177,mes:'2026-01',monto:6000000,origen:'SCOTIA'},
   {n:261,mes:'2026-02',monto:6000000,origen:'SCOTIA'},{n:374,mes:'2026-03',monto:6000000,origen:'SCOTIA'},{n:470,mes:'2026-05',monto:6000000,origen:'MP'},
   {n:571,mes:'2026-06',monto:6000000,origen:'MP'},{n:634,mes:'2026-07',monto:3000000,origen:'MP'},{n:723,mes:'2026-08',monto:5000820,origen:'Sin cuenta'},
   {n:801,mes:'2026-09',monto:6000000,origen:'Sin cuenta'},{n:854,mes:'2026-10',dia:'2026-10-01',monto:1000000,origen:'MP'},{n:860,mes:'2026-10',dia:'2026-10-02',monto:5000000,origen:'MP'}]},
 ARRIENDO:{label:'Arriendo y estacionamientos',intro:'Un monto fijo de arriendo y otro de estacionamientos, editables mes a mes. El pago puede venir junto o separado.',
  comps:[['ARRIENDO','Arriendo',2078857],['ESTACIONAMIENTO','Estacionamientos',397276]],
  planilla:[{n:117,mes:'2026-01',monto:300000,origen:'SCOTIA c/fact'},{n:128,mes:'2026-01',monto:952500,origen:'SCOTIA c/fact'},{n:220,mes:'2026-02',monto:2047970,origen:'SCOTIA'},
   {n:305,mes:'2026-03',monto:2078857,origen:'MP'},{n:446,mes:'2026-04',monto:2078857,origen:'MP'},{n:600,mes:'2026-06',monto:2078857,origen:'MP'},
   {n:694,mes:'2026-07',monto:2476133,origen:'Sin cuenta'},{n:725,mes:'2026-08',monto:2078857,origen:'Sin cuenta'},{n:827,mes:'2026-09',monto:2476133,origen:'MP · Netparking'},
   {n:869,mes:'2026-10',dia:'2026-10-13',monto:2476628,origen:'MP · Netparking'}]},
 CYC:{label:'Cars and Coffee',intro:'Cuota mensual fija, editable mes a mes.',comps:[['CUOTA','Cuota',2142000]],
  planilla:[{n:536,mes:'2026-05',monto:2142000,origen:'MP'},{n:591,mes:'2026-06',monto:2142000,origen:'MP'},{n:651,mes:'2026-07',monto:2142000,origen:'Sin cuenta'},
   {n:713,mes:'2026-08',monto:2142000,origen:'Sin cuenta'},{n:794,mes:'2026-09',monto:2142000,origen:'Sin cuenta'},{n:855,mes:'2026-10',dia:'2026-10-01',monto:2142000,origen:'MP'}]}
};
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n):'—';
const fmtDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.slice(8,10)+'-'+v.slice(5,7)+'-'+v.slice(0,4):'Sin fecha';
const perLabel=p=>/^\d{4}-\d{2}$/.test(p||'')?MESES[Number(p.slice(5,7))-1]+'-'+p.slice(2,4):p;
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);
const addMonths=(p,k)=>{let y=Number(p.slice(0,4)),m=Number(p.slice(5,7))+k;while(m>12){m-=12;y++;}while(m<1){m+=12;y--;}return y+'-'+String(m).padStart(2,'0');};
const dayDiff=(a,b)=>Math.abs(Date.parse(a)-Date.parse(b))/86400000;
const compOrder=(ob,c)=>{const i=(OBLIGS[ob]?.comps||[]).findIndex(x=>x[0]===c);return i<0?99:i;};

// ---------- Cálculos puros (probados en tests) ----------
// Por mes: cada componente, devengado, pagado (imputado) y saldo.
function months(liqs,imps){
 const paid={};imps.forEach(i=>{paid[i.liquidacion_id]=(paid[i.liquidacion_id]||0)+Number(i.monto);});
 const by={};liqs.forEach(l=>{const r=by[l.periodo]=by[l.periodo]||{periodo:l.periodo,lines:{},pagado:0};r.lines[l.componente]=l;r.pagado+=paid[l.liquidacion_id]||0;});
 return Object.values(by).sort((a,b)=>a.periodo.localeCompare(b.periodo)).map(r=>{const dev=Object.values(r.lines).reduce((a,l)=>a+l.monto,0);return {...r,base:r.lines.BASE||null,variable:r.lines.VARIABLE||null,devengado:dev,saldo:dev-r.pagado};});
}
// Saldo pendiente de cada línea, sin contar lo imputado por un movimiento (para editar su reparto).
function pendingByLiq(liqs,imps,exceptMovement){
 const paid={};imps.filter(i=>i.movimiento_id!==exceptMovement).forEach(i=>{paid[i.liquidacion_id]=(paid[i.liquidacion_id]||0)+Number(i.monto);});
 return liqs.map(l=>({...l,pendiente:l.monto-(paid[l.liquidacion_id]||0)}));
}
// Reparto sugerido: lo más antiguo primero; dentro del mes, en el orden de los componentes (base antes que variable).
function fifo(pending,amount,ob){
 const order=pending.filter(l=>l.pendiente>0).sort((a,b)=>a.periodo.localeCompare(b.periodo)||compOrder(ob||a.persona,a.componente)-compOrder(ob||b.persona,b.componente));
 let left=amount;const out={};
 for(const l of order){if(left<=0)break;const x=Math.min(left,l.pendiente);out[l.liquidacion_id]=x;left-=x;}
 return out;
}
const isOut=m=>m.direction!=='ENTRADA'&&Number.isFinite(m.amount)&&m.amount>0&&!!m.date;
// Egresos individuales o sumados (hasta maxk, todos dentro de `span` días) que dan exactamente el monto, cerca de una fecha.
function combos(movs,target,center,win,opts={}){
 const span=opts.span??7,maxk=opts.maxk??3,skip=opts.skip||new Set(),limit=opts.limit??8;
 const pool=movs.filter(m=>isOut(m)&&m.amount<=target&&!skip.has(m.id)&&dayDiff(m.date,center)<=win).sort((a,b)=>dayDiff(a.date,center)-dayDiff(b.date,center)).slice(0,45);
 const out=pool.filter(m=>m.amount===target).map(m=>[m]);
 const rec=(start,k,acc,sum)=>{if(out.length>=limit)return;
  for(let i=start;i<pool.length;i++){const m=pool[i],s=sum+m.amount;if(s>target)continue;
   const ds=[...acc,m].map(x=>Date.parse(x.date));if((Math.max(...ds)-Math.min(...ds))/86400000>span)continue;
   if(k===1){if(s===target&&acc.length)out.push([...acc,m]);}else rec(i+1,k-1,[...acc,m],s);if(out.length>=limit)return;}};
 for(let k=2;k<=maxk&&out.length<limit;k++)rec(0,k,[],0);
 return out;
}
// Cada fila de la planilla busca un egreso (o suma de egresos) de su monto cerca de su mes o día. Prefiere los ya imputados.
function matchPlanilla(rows,movements,imputed){
 const used=new Set();
 return rows.map(r=>{
  const center=r.dia||r.mes+'-15',win=r.dia?4:30;
  const singles=movements.filter(m=>isOut(m)&&m.amount===r.monto&&dayDiff(m.date,center)<=win&&!used.has(m.id))
   .sort((a,b)=>(imputed.has(b.id)-imputed.has(a.id))||dayDiff(a.date,center)-dayDiff(b.date,center));
  const hit=singles.find(m=>imputed.has(m.id));if(hit){used.add(hit.id);return {...r,hit,candidates:[]};}
  const cands=singles.length?singles.map(m=>[m]):combos(movements,r.monto,center,win,{skip:used,limit:4});
  return {...r,hit:null,candidates:cands};
 });
}
const api={months,pendingByLiq,fifo,combos,matchPlanilla,OBLIGS};
if(typeof module!=='undefined')module.exports=api;
if(!root.document)return;

// ---------- Vista ----------
let config,s;
function reset(){config=null;s=null;document.querySelectorAll('[data-lq-dialog]').forEach(d=>d.remove());}
function setup(options={}){config=options;s={ob:'JT',tab:'meses',data:null,loading:false,message:'',busy:false,search:'',month:''};}
function markup(){return '<section id="oc-liq" class="oc-card"></section>';}
function mount(parent){const el=parent.querySelector('#oc-liq');if(!el||!s)return;if(!s.data&&!s.loading)load(el);else draw(el);}
const call=(a,p)=>config.call(a,p);
const O=()=>OBLIGS[s.ob];
const movements=()=>(root.OCCajaNueva?.snapshot()?.movements)||[];
const allLiqs=()=>s.data?.liquidaciones||[];
const liqs=()=>allLiqs().filter(l=>String(l.persona).toUpperCase()===s.ob);
const imps=()=>(s.data?.imputaciones||[]).filter(i=>String(i.persona||'JT').toUpperCase()===s.ob);
const conceptOf=ob=>s.data?.obligaciones?.[ob]?.concept||(ob==='JT'?'SUELDO_JT':ob==='CYC'?'C&C':ob);
const cashAccount=()=>(config.accountsInfo?config.accountsInfo():[]).find(a=>/caja|efectivo/i.test(a.name));
async function load(el){
 s.loading=true;s.message='Cargando liquidaciones…';draw(el);
 try{s.data=await call('liqLoad',{});s.message='';}catch(e){s.message=e.message;}
 s.loading=false;draw(el);
}
async function act(el,fn,ok){
 if(s.busy)return false;s.busy=true;s.message='Guardando…';draw(el);
 try{const r=await fn();if(r&&r.liquidaciones)s.data={...s.data,...r,movement:undefined};s.message=ok||'Guardado.';return r||true;}
 catch(e){s.message=e.message;return false;}
 finally{s.busy=false;draw(el);}
}
function draw(el){
 const ms=months(liqs(),imps()),tot=ms.reduce((a,r)=>({dev:a.dev+r.devengado,pag:a.pag+r.pagado}),{dev:0,pag:0});
 const tabs=[['meses','Por mes'],['pagos','Pagos imputados'],['planilla','Planilla vs caja'],['buscar','Buscar egresos']];
 el.innerHTML=`<p class="oc-eyebrow">LIQUIDACIONES Y PAGOS FIJOS · SOLO ALEX</p>
 <div class="oc-tabs lq-obligs">${Object.entries(OBLIGS).map(([k,o])=>`<button class="oc-tab${s.ob===k?' active':''}" data-lq-ob="${k}">${esc(o.label)}</button>`).join('')}</div>
 <h2>${esc(O().label)}: lo que se debe y lo que se pagó</h2><p>${esc(O().intro)} Cada pago de la caja se reparte entre los meses y componentes que cubre.</p>
 ${s.message?`<p role="status">${esc(s.message)}</p>`:''}
 ${s.data?`<div class="lq-kpis"><div><small>Devengado</small><b>${money(tot.dev)}</b></div><div><small>Pagado (imputado)</small><b>${money(tot.pag)}</b></div><div><small>Por pagar</small><b class="${tot.dev-tot.pag>0?'cn-bad':'cn-ok'}">${money(tot.dev-tot.pag)}</b></div></div>
 <div class="oc-tabs">${tabs.map(([k,l])=>`<button class="oc-tab${s.tab===k?' active':''}" data-lq-tab="${k}">${l}</button>`).join('')}</div>
 ${s.tab==='meses'?viewMonths(ms):s.tab==='pagos'?viewPaid():s.tab==='planilla'?viewPlanilla():viewSearch()}`:''}`;
 wire(el);
}
function viewMonths(ms){
 const comps=O().comps;
 return `<p>${comps.filter(c=>c[2]!==null).map(c=>`<button data-lq-seed="${c[0]}"${s.busy?' disabled':''}>Generar ${esc(c[1].toLowerCase())} de meses faltantes</button>`).join(' ')} <button id="lq-new"${s.busy?' disabled':''}>Agregar línea</button></p>
 ${ms.length?`<div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Mes</th>${comps.map(c=>`<th>${esc(c[1])}</th>`).join('')}<th>Devengado</th><th>Pagado</th><th>Saldo</th></tr></thead><tbody>
 ${ms.map(r=>`<tr><td><b>${esc(perLabel(r.periodo))}</b></td>${comps.map(c=>`<td>${cell(r,c[0])}</td>`).join('')}<td>${money(r.devengado)}</td><td>${money(r.pagado)}</td><td class="${r.saldo>0?'cn-bad':r.saldo<0?'cn-warn':'cn-ok'}">${r.saldo===0?'✓':money(r.saldo)}</td></tr>`).join('')}
 </tbody></table></div><p><small>Toca un monto para editarlo ese mes. Saldo rojo = falta pagar o imputar; negativo = se imputó más de lo devengado.</small></p>`
 :`<p>Aún no hay líneas. Genera ${esc(comps[0][1].toLowerCase())} desde el primer mes.</p>`}`;
}
function cell(r,comp){const l=r.lines[comp];return l?`<button class="lq-link" data-lq-edit="${esc(l.liquidacion_id)}">${money(l.monto)}</button>`:`<button class="lq-link lq-empty" data-lq-add="${esc(r.periodo)}|${comp}">+ agregar</button>`;}
function byMovement(){const g={};imps().forEach(i=>{(g[i.movimiento_id]=g[i.movimiento_id]||[]).push(i);});return g;}
function liqName(id){const l=allLiqs().find(x=>x.liquidacion_id===id);if(!l)return id;const c=(OBLIGS[l.persona]?.comps||[]).find(x=>x[0]===l.componente);return (c?c[1]:l.componente)+' '+perLabel(l.periodo);}
function moveRow(m,extra=''){return `<article class="oc-caja-row"><div><small>${esc(m.account)} · ${esc(fmtDate(m.date))}${m.classification?' · '+esc(m.classification.name):''}${m.direction?'':' · sin dirección'}</small><h3>${esc(m.description)}</h3><strong class="oc-amount oc-out">−${money(m.amount)}</strong>${extra}</div><div><button data-lq-alloc="${esc(m.id)}"${s.busy?' disabled':''}>Imputar</button></div></article>`;}
function viewPaid(){
 const g=byMovement(),ms=movements(),cid=conceptOf(s.ob);
 const imputed=ms.filter(m=>g[m.id]).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
 const otherImp=new Set((s.data?.imputaciones||[]).map(i=>i.movimiento_id));
 const open=ms.filter(m=>!otherImp.has(m.id)&&isOut(m)&&m.classification?.id===cid);
 const lost=Object.keys(g).filter(id=>!ms.some(m=>m.id===id));
 return `${open.length?`<h3>Clasificados como ${esc(O().label)} sin imputar (${open.length})</h3><div class="oc-caja-list">${open.map(m=>moveRow(m)).join('')}</div>`:''}
 <h3>Imputados (${imputed.length})</h3>${imputed.length?`<div class="oc-caja-list">${imputed.map(m=>{const sum=g[m.id].reduce((a,i)=>a+i.monto,0);return moveRow(m,`<small>${g[m.id].map(i=>esc(liqName(i.liquidacion_id))+': '+money(i.monto)).join(' · ')}${sum!==m.amount?` · <b class="cn-bad">sin repartir ${money(m.amount-sum)}</b>`:''}</small>`);}).join('')}</div>`:'<p>Todavía no hay pagos imputados. Usa «Planilla vs caja» o «Buscar egresos».</p>'}
 ${lost.length?`<p class="cn-bad"><small>${lost.length} imputación(es) apuntan a movimientos anulados: ${lost.map(esc).join(', ')}.</small></p>`:''}
 <p><button id="lq-cash"${s.busy?' disabled':''}>Registrar pago en efectivo</button></p>`;
}
function comboLabel(c){return c.map(m=>`${esc(m.account)} · ${esc(fmtDate(m.date))} · ${money(m.amount)}${m.classification?' · '+esc(m.classification.name):''}`).join(' + ');}
function comboButtons(c){return c.map(m=>`<button data-lq-alloc="${esc(m.id)}">${c.length>1?'Imputar '+money(m.amount):'Imputar'}</button>`).join(' ');}
function viewPlanilla(){
 const imputed=new Set((s.data?.imputaciones||[]).map(i=>i.movimiento_id)),rows=matchPlanilla(O().planilla,movements(),imputed);
 const ok=rows.filter(r=>r.hit).length;
 return `<p>Pagos según la planilla de flujo. Cada uno debe existir en alguna cuenta (solo o sumando varios egresos) e imputarse; si no aparece, se registra como pago en efectivo. ${ok}/${rows.length} listos.</p>
 <div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Fila</th><th>Mes</th><th>Monto</th><th>Origen planilla</th><th>En la caja</th></tr></thead><tbody>
 ${rows.map(r=>`<tr><td>${r.n}</td><td>${esc(r.dia?fmtDate(r.dia):perLabel(r.mes))}</td><td>${money(r.monto)}</td><td>${esc(r.origen)}</td><td>${r.hit?`<span class="oc-chip">✓ ${esc(r.hit.account)} · ${esc(fmtDate(r.hit.date))}</span> <button class="lq-link" data-lq-alloc="${esc(r.hit.id)}">ver reparto</button>`
  :r.candidates.length?r.candidates.slice(0,3).map(c=>`<div class="lq-cand"><small>${c.length>1?'Suma: ':''}${comboLabel(c)}</small> ${comboButtons(c)}</div>`).join('')+` <button class="lq-link" data-lq-cashrow="${r.n}">o registrar en efectivo</button>`
  :`<span class="oc-chip oc-chip-bad">No está en ninguna cuenta</span> <button data-lq-cashrow="${r.n}">Registrar en efectivo</button>`}</td></tr>`).join('')}
 </tbody></table></div><p><small>Coincidencia por monto exacto (un egreso o la suma de 2–3 egresos dentro de 7 días) y fecha ±30 días del mes (±4 días si la planilla tiene día). Revisa antes de imputar.</small></p>`;
}
function viewSearch(){
 const q=Number(String(s.search).replace(/\D/g,'')),g=new Set((s.data?.imputaciones||[]).map(i=>i.movimiento_id));
 const center=s.month?s.month+'-15':null,win=s.month?30:4000;
 const res=q?combos(movements(),q,center||today(),win,{limit:20,maxk:s.month?3:1}):[];
 return `<div class="oc-caja-form"><label>Monto exacto<input id="lq-q" inputmode="numeric" value="${esc(s.search)}" placeholder="2142000"></label><label>Mes (para buscar sumas)<input id="lq-m" type="month" value="${esc(s.month)}"></label></div>
 ${q?(res.length?`<div class="oc-caja-list">${res.map(c=>c.length===1?moveRow(c[0],g.has(c[0].id)?'<small>Ya imputado</small>':''):`<article class="oc-caja-row"><div><small>Suma de ${c.length} egresos</small><h3>${comboLabel(c)}</h3><strong class="oc-amount oc-out">−${money(q)}</strong></div><div>${comboButtons(c)}</div></article>`).join('')}</div>`:'<p>No hay egresos (ni sumas) con ese monto.</p>'):'<p>Busca en todas las cuentas egresos de ese monto. Con un mes elegido busca también sumas de 2 o 3 egresos cercanos.</p>'}`;
}
function dialog(html){
 const d=document.createElement('dialog');d.className='oc-dialog';d.dataset.lqDialog='';d.innerHTML=html;document.body.append(d);
 d.addEventListener('close',()=>d.remove());d.showModal();const c=d.querySelector('[data-lq-cancel]');if(c)c.onclick=()=>d.close();return d;
}
function lineDialog(el,l,preset){
 const comps=O().comps,per=l?l.periodo:preset?.periodo||addMonths(today().slice(0,7),-1),comp=l?l.componente:preset?.componente||comps[comps.length-1][0];
 const def=(comps.find(c=>c[0]===comp)||[])[2];
 const d=dialog(`<form><h2>${l?'Editar':'Agregar'} línea · ${esc(O().label)}</h2><div class="oc-caja-form">
  <label>Mes<input name="periodo" type="month" required value="${esc(per)}"${l?' disabled':''}></label>
  <label>Componente<select name="componente"${l?' disabled':''}>${comps.map(c=>`<option value="${c[0]}"${comp===c[0]?' selected':''}>${esc(c[1])}</option>`).join('')}</select></label>
  <label>Monto<input name="monto" type="number" min="0" step="1" inputmode="numeric" required value="${l?l.monto:def??''}"></label>
  <label>Nota<input name="nota" maxlength="300" value="${esc(l?.nota||'')}" placeholder="Cómo se calculó, acuerdo, etc."></label></div>
  <p role="status"></p><button type="submit">Guardar</button> <button type="button" data-lq-cancel>Cancelar</button>${l?` <button type="button" id="lq-void" class="oc-danger">Anular línea</button>`:''}</form>`);
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));d.close();
  await act(el,()=>call('liqSave',{expectedVersion:l?l.version:0,record:{liquidacion_id:l?.liquidacion_id||'',persona:s.ob,periodo:l?l.periodo:f.periodo,componente:l?l.componente:f.componente,monto:Number(f.monto),nota:f.nota}}),'Línea guardada.');};
 const v=d.querySelector('#lq-void');if(v)v.onclick=async()=>{if(!confirm('¿Anular esta línea?'))return;d.close();await act(el,()=>call('liqVoid',{id:l.liquidacion_id,expectedVersion:l.version}),'Línea anulada.');};
}
function seedDialog(el,comp){
 const c=O().comps.find(x=>x[0]===comp),ms=liqs().map(l=>l.periodo).sort();
 const d=dialog(`<form><h2>Generar ${esc(c[1].toLowerCase())}</h2><p>Crea la línea «${esc(c[1])}» en cada mes que aún no la tiene, con el mismo monto. No modifica meses existentes; después puedes cambiar cualquier mes a mano.</p><div class="oc-caja-form">
  <label>Desde<input name="desde" type="month" required value="${esc(ms[0]||O().planilla[0]?.mes||'2025-11')}"></label><label>Hasta<input name="hasta" type="month" required value="${esc(addMonths(today().slice(0,7),-1))}"></label>
  <label>Monto mensual<input name="base" type="number" min="0" step="1" required value="${c[2]??''}"></label></div>
  <button type="submit">Generar</button> <button type="button" data-lq-cancel>Cancelar</button></form>`);
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));d.close();
  await act(el,()=>call('liqSeed',{persona:s.ob,componente:comp,desde:f.desde,hasta:f.hasta,base:Number(f.base)}),'Líneas generadas.');};
}
function allocDialog(el,m){
 if(!m){s.message='Movimiento no encontrado.';draw(el);return;}
 const otherOb=(s.data?.imputaciones||[]).find(i=>i.movimiento_id===m.id&&String(i.persona||'JT').toUpperCase()!==s.ob);
 if(otherOb){s.message='Ese pago ya está imputado a '+(OBLIGS[String(otherOb.persona).toUpperCase()]?.label||otherOb.persona)+'.';draw(el);return;}
 const current={};imps().filter(i=>i.movimiento_id===m.id).forEach(i=>{current[i.liquidacion_id]=i.monto;});
 const pend=pendingByLiq(liqs(),imps(),m.id).sort((a,b)=>a.periodo.localeCompare(b.periodo)||compOrder(s.ob,a.componente)-compOrder(s.ob,b.componente));
 const preset=Object.keys(current).length?current:fifo(pend,m.amount,s.ob);
 const rows=pend.filter(l=>l.pendiente>0||preset[l.liquidacion_id]);
 const comps=O().comps,lastComp=comps[comps.length-1];
 const d=dialog(`<form class="lq-alloc"><h2>Imputar pago · ${esc(O().label)}</h2><p>${esc(m.account)} · ${esc(fmtDate(m.date))} · ${esc(m.description)} · <b>${money(m.amount)}</b></p>
  ${rows.length?`<div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Línea</th><th>Pendiente</th><th>Imputar</th></tr></thead><tbody>${rows.map(l=>`<tr><td>${esc(liqName(l.liquidacion_id))}</td><td>${money(l.pendiente)}</td><td><input type="number" min="0" step="1" inputmode="numeric" data-lq-amt="${esc(l.liquidacion_id)}" value="${preset[l.liquidacion_id]||''}"></td></tr>`).join('')}</tbody></table></div>`:'<p>No hay líneas pendientes. Agrega la línea del mes primero.</p>'}
  <details><summary>Agregar una línea de un mes y cargarle parte de este pago</summary><div class="oc-caja-form"><label>Mes<input type="month" id="lq-nv-per" value="${esc(addMonths((m.date||today()).slice(0,7),s.ob==='JT'?-1:0))}"></label><label>Componente<select id="lq-nv-comp">${comps.map(c=>`<option value="${c[0]}"${c===lastComp?' selected':''}>${esc(c[1])}</option>`).join('')}</select></label><label>Monto<input type="number" min="1" step="1" id="lq-nv-amt"></label></div><button type="button" id="lq-nv">Crear línea</button></details>
  <p id="lq-sum"></p><p role="status"></p><button type="submit">Guardar reparto</button> <button type="button" data-lq-cancel>Cancelar</button>${Object.keys(current).length?' <button type="button" id="lq-clear" class="oc-danger">Quitar imputación</button>':''}
  ${m.classification?'':`<p><small>El movimiento no tiene concepto: quedará clasificado como «${esc(O().label)}» en la caja.</small></p>`}${m.direction==='SALIDA'&&!m.directionInferred?'':'<p><small>El movimiento quedará marcado como egreso.</small></p>'}</form>`);
 const inputs=[...d.querySelectorAll('[data-lq-amt]')],sumEl=d.querySelector('#lq-sum');
 const total=()=>inputs.reduce((a,i)=>a+(Number(i.value)||0),0);
 const paint=()=>{const t=total(),diff=m.amount-t;sumEl.innerHTML=`Repartido ${money(t)} de ${money(m.amount)} ${diff===0?'<b class="cn-ok">· cuadra</b>':diff>0?`<b class="cn-warn">· quedan ${money(diff)} sin repartir</b>`:`<b class="cn-bad">· excede en ${money(-diff)}</b>`}`;};
 inputs.forEach(i=>i.oninput=paint);paint();
 const save=async items=>{d.close();
  const r=await act(el,async()=>{let mv=m;
   if(items.length&&(mv.direction!=='SALIDA'||mv.directionInferred)){if(!config.setDirection)throw Error('Falta conexión para fijar la dirección.');mv=await config.setDirection(mv,'SALIDA');root.OCCajaNueva?.addMovements([mv]);}
   return call('liqAllocate',{movementId:mv.id,expectedVersion:mv.version,items});},items.length?'Pago imputado.':'Imputación quitada.');
  if(r&&r.movement&&config.store){config.store.patchRaw(m.id,r.movement);const mm=config.store.mapped(m.id);if(mm)root.OCCajaNueva?.addMovements([mm]);draw(el);}};
 d.querySelector('form').onsubmit=e=>{e.preventDefault();if(total()>m.amount){d.querySelector('[role=status]').textContent='Lo repartido supera el monto del pago.';return;}
  save(inputs.filter(i=>Number(i.value)>0).map(i=>({liquidacionId:i.dataset.lqAmt,monto:Number(i.value)})));};
 const clr=d.querySelector('#lq-clear');if(clr)clr.onclick=()=>{if(confirm('¿Quitar toda la imputación de este pago?'))save([]);};
 d.querySelector('#lq-nv').onclick=async()=>{const per=d.querySelector('#lq-nv-per').value,comp=d.querySelector('#lq-nv-comp').value,amt=Number(d.querySelector('#lq-nv-amt').value);
  if(!per||!amt){d.querySelector('[role=status]').textContent='Indica mes y monto.';return;}
  d.close();const ok=await act(el,()=>call('liqSave',{expectedVersion:0,record:{persona:s.ob,periodo:per,componente:comp,monto:amt,nota:'Creado al imputar '+m.id}}),'Línea creada.');
  if(ok)allocDialog(el,movements().find(x=>x.id===m.id)||m);};
}
function cashDialog(el,row){
 const acc=cashAccount();if(!acc){s.message='No hay una cuenta de efectivo (CAJA) configurada.';draw(el);return;}
 if(!config.manualAdd){s.message='Registrar a mano requiere la conexión con Google.';draw(el);return;}
 const date=row?(row.dia||(row.mes+'-'+(row.mes===today().slice(0,7)?today().slice(8,10):'28'))):today();
 const d=dialog(`<form><h2>Pago en efectivo · ${esc(O().label)}</h2><p>Queda en la cuenta ${esc(acc.name)} con el concepto de la obligación y luego eliges qué meses cubre.</p><div class="oc-caja-form">
  <label>Fecha<input name="date" type="date" required max="${today()}" value="${esc(date>today()?today():date)}"></label>
  <label>Monto<input name="amount" type="number" min="1" step="1" required value="${row?row.monto:''}"></label>
  <label>Descripción<input name="description" maxlength="200" required value="${esc(O().label)}${row?' · planilla fila '+row.n:''} (efectivo)"></label></div>
  <p role="status"></p><button type="submit">Registrar</button> <button type="button" data-lq-cancel>Cancelar</button></form>`);
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),b=e.target.querySelector('[type=submit]');b.disabled=true;
  try{const saved=await config.manualAdd(acc.id,uid(),[{date:f.date,direction:'SALIDA',amount:Number(f.amount),description:f.description,conceptId:conceptOf(s.ob)}]);
   root.OCCajaNueva?.addMovements(saved);d.close();s.message='Pago en efectivo registrado.';draw(el);if(saved[0])allocDialog(el,saved[0]);}
  catch(err){d.querySelector('[role=status]').textContent=err.message;b.disabled=false;}};
}
function wire(el){
 el.querySelectorAll('[data-lq-ob]').forEach(b=>b.onclick=()=>{s.ob=b.dataset.lqOb;s.message='';draw(el);});
 el.querySelectorAll('[data-lq-tab]').forEach(b=>b.onclick=()=>{s.tab=b.dataset.lqTab;s.message='';draw(el);});
 el.querySelectorAll('[data-lq-seed]').forEach(b=>b.onclick=()=>seedDialog(el,b.dataset.lqSeed));
 const nw=el.querySelector('#lq-new');if(nw)nw.onclick=()=>lineDialog(el,null);
 el.querySelectorAll('[data-lq-edit]').forEach(b=>b.onclick=()=>lineDialog(el,liqs().find(l=>l.liquidacion_id===b.dataset.lqEdit)));
 el.querySelectorAll('[data-lq-add]').forEach(b=>b.onclick=()=>{const [periodo,componente]=b.dataset.lqAdd.split('|');lineDialog(el,null,{periodo,componente});});
 el.querySelectorAll('[data-lq-alloc]').forEach(b=>b.onclick=()=>allocDialog(el,movements().find(m=>m.id===b.dataset.lqAlloc)));
 el.querySelectorAll('[data-lq-cashrow]').forEach(b=>b.onclick=()=>cashDialog(el,O().planilla.find(r=>String(r.n)===b.dataset.lqCashrow)));
 const cash=el.querySelector('#lq-cash');if(cash)cash.onclick=()=>cashDialog(el,null);
 const q=el.querySelector('#lq-q');if(q)q.onchange=()=>{s.search=q.value;draw(el);};
 const mo=el.querySelector('#lq-m');if(mo)mo.onchange=()=>{s.month=mo.value;draw(el);};
}
root.OCLiquidaciones={...api,setup,reset,markup,mount};
})(typeof globalThis==='undefined'?this:globalThis);
