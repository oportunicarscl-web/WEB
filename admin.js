(function(root){
'use strict';
// Administrar: movimientos ingresados a mano (respaldo de las importaciones automáticas). Visible solo para el usuario Alex.
const pad=n=>String(n).padStart(2,'0');
function parseDate(v){
 const s=String(v||'').trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return s;
 m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);if(!m)return '';
 const y=m[3].length===2?'20'+m[3]:m[3],iso=y+'-'+pad(m[2])+'-'+pad(m[1]);
 return !isNaN(Date.parse(iso))&&new Date(iso+'T12:00:00Z').toISOString().slice(0,10)===iso?iso:'';
}
function parseAmount(v){
 let s=String(v==null?'':v).trim();if(!s)return null;
 const neg=/^\(.*\)$/.test(s)||/^-/.test(s)||/-$/.test(s);
 s=s.replace(/[^\d.,]/g,'');if(/[.,]\d{1,2}$/.test(s))s=s.replace(/[.,]\d{1,2}$/,'');s=s.replace(/[.,]/g,'');
 if(!/^\d+$/.test(s))return null;const n=Number(s);return neg?-n:n;
}
// Una línea por movimiento: fecha ; descripción ; monto (negativo = salió)  — o bien fecha ; descripción ; cargo ; abono.
function parseLines(text){
 return String(text||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map((line,i)=>{
  const c=line.split(/\t|;|\|/).map(x=>x.trim()),base={line:i+1,raw:line};
  if(c.length<3)return {...base,error:'Usa: fecha ; descripción ; monto'};
  const date=parseDate(c[0]);if(!date)return {...base,error:'Fecha inválida'};
  let amount;
  if(c.length>=4&&(c[2]!==''||c[3]!=='')){const out=parseAmount(c[2]),inn=parseAmount(c[3]);amount=inn?Math.abs(inn):out?-Math.abs(out):null;}
  else amount=parseAmount(c[c.length-1]);
  if(!amount)return {...base,error:'Monto inválido'};
  const description=c.slice(1,c.length>=4?c.length-2:c.length-1).join(' ').trim();if(!description)return {...base,error:'Falta la descripción'};
  return {...base,date,description,direction:amount>0?'ENTRADA':'SALIDA',amount:Math.abs(amount)};
 });
}
const api={parseLines,parseDate,parseAmount};
if(typeof module!=='undefined')module.exports=api;
if(!root.document)return;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n):'—';
const fmtDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.slice(8,10)+'-'+v.slice(5,7)+'-'+v.slice(0,4):'Sin fecha';
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);
let config,s;
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
function reset(){config=null;s=null;}
function setup(options={}){config=options;s={tab:'uno',message:'',busy:false,parsed:[],cart:null,opening:null,requestId:uid(),account:'',text:''};}
function markup(){return '<section id="oc-admin" class="oc-card"></section>';}
function mount(parent){const el=parent.querySelector('#oc-admin');if(el&&s)draw(el);}
function carLabel(v){return [v.patente||'Sin patente',v.modelo].filter(Boolean).join(' · ');}
function carMap(){const seen={},m=new Map();(config.inventory||[]).forEach(v=>{let l=carLabel(v);if(seen[l])l+=' #'+v.id;seen[l]=1;m.set(l,v);});return m;}
function accounts(){return config?.accountsInfo?config.accountsInfo():[];}
function accountSelect(){const a=accounts();if(!s.account&&a[0])s.account=a[0].id;return `<label>Cuenta<select id="ad-account">${a.map(x=>`<option value="${esc(x.id)}" ${x.id===s.account?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`;}
function conceptOptions(){return `<option value="">Concepto por asignar</option>`+(config.concepts||[]).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');}
function draw(el){
 const manual=(root.OCCajaNueva?.movementsBySource('MANUAL')||[]).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,40);
 el.innerHTML=`<p class="oc-eyebrow">ADMINISTRAR</p><h2>Movimientos a mano</h2><p>Respaldo para lo que la API de Mercado Pago o la cartola automática no traen. Quedan con el importe confirmado; si les asignas concepto (y auto) cuentan en el saldo de inmediato. En «Pegar cartola» se copian los movimientos tal como salen de la cartola del banco: el formato se reconoce solo y cargo o abono se deduce del saldo.</p>
 ${s.message?`<p role="status">${esc(s.message)}</p>`:''}
 <div class="oc-tabs"><button class="oc-tab${s.tab==='uno'?' active':''}" data-ad-tab="uno">Un movimiento</button><button class="oc-tab${s.tab==='varios'?' active':''}" data-ad-tab="varios">Pegar cartola</button><button class="oc-tab${s.tab==='lotes'?' active':''}" data-ad-tab="lotes">Cartolas importadas (${batches().length})</button><button class="oc-tab${s.tab==='lista'?' active':''}" data-ad-tab="lista">Ingresados a mano (${manual.length})</button><button class="oc-tab${s.tab==='mp'?' active':''}" data-ad-tab="mp">Mercado Pago</button></div>
 <datalist id="ad-cars">${[...carMap().keys()].map(l=>`<option value="${esc(l)}"></option>`).join('')}</datalist>
 ${s.tab==='uno'?one():s.tab==='varios'?many():s.tab==='lotes'?lots():s.tab==='mp'?mp():list(manual)}`;
 wire(el);
}
function one(){
 return `<form id="ad-one" class="oc-caja-form" autocomplete="off">${accountSelect()}
 <label>Fecha<input name="date" type="date" required value="${today()}" max="${today()}"></label>
 <label>Tipo<select name="direction"><option value="ENTRADA">Entró dinero</option><option value="SALIDA">Salió dinero</option></select></label>
 <label>Monto<input name="amount" type="number" min="1" step="1" inputmode="numeric" required></label>
 <label>Descripción<input name="description" type="text" maxlength="200" required></label>
 <label>Concepto (opcional)<select name="conceptId">${conceptOptions()}</select></label>
 <label>Auto (opcional)<input name="car" list="ad-cars" placeholder="Patente, marca o modelo"></label>
 <p><button type="submit" ${s.busy?'disabled':''}>Guardar movimiento</button></p></form>`;
}
function many(){
 if(s.cart)return cartView();
 const ok=s.parsed.filter(x=>!x.error),bad=s.parsed.length-ok.length;
 return `<div class="oc-caja-form">${accountSelect()}<label>Líneas<textarea id="ad-text" rows="10" placeholder="Pega aquí las líneas de la cartola (Scotiabank: tal cual se copian del PDF, con o sin el encabezado).&#10;También sirve: 15-10-2026 ; Depósito cliente ; 250.000">${esc(s.text)}</textarea></label></div>
 <p><small>Cartolas reconocidas: <b>Scotiabank</b> (copia del PDF «Consulta detalle de cartola emitida» o desde Excel). Las líneas de encabezado y pie de página se ignoran solas. Para otros casos: <b>fecha ; descripción ; monto</b> (negativo = salió) o <b>fecha ; descripción ; cargo ; abono</b>.</small></p>
 <p><button id="ad-parse">Revisar líneas</button></p>
 ${s.parsed.length?`<div class="oc-table-scroll"><table><thead><tr><th>#</th><th>Fecha</th><th>Descripción</th><th>Monto</th><th></th></tr></thead><tbody>${s.parsed.map(x=>x.error?`<tr><td>${x.line}</td><td colspan="3">${esc(x.raw)}</td><td><span class="oc-chip oc-chip-bad">${esc(x.error)}</span></td></tr>`:`<tr><td>${x.line}</td><td>${esc(fmtDate(x.date))}</td><td>${esc(x.description)}</td><td class="${x.direction==='ENTRADA'?'oc-in':'oc-out'}">${x.direction==='ENTRADA'?'+':'−'}${money(x.amount)}</td><td><span class="oc-chip oc-chip-ok">Listo</span></td></tr>`).join('')}</tbody></table></div>
 <p>${ok.length} listas${bad?` · ${bad} con error (corrígelas para guardar)`:''}</p><p><button id="ad-save" ${bad||!ok.length||s.busy?'disabled':''}>Guardar ${ok.length} movimientos</button></p>`:''}`;
}
// ---- Cartolas bancarias ----
const C=()=>root.OCCartolas;
const isBankAccount=a=>!!a&&!/caja|efectivo|mercado/i.test(a.name);
const movs=src=>root.OCCajaNueva?.movementsBySource?root.OCCajaNueva.movementsBySource(src):[];
function accountMovs(accountId){return ['CARTOLA','MANUAL','ATAJO'].flatMap(movs).filter(m=>String(m.accountId)===String(accountId));}
function analyze(){
 const fmt=C()&&C().detect(s.text);if(!fmt){s.cart=null;return false;}
 if(!s.accountTouched){const a=C().accountFor(fmt,accounts());if(a)s.account=a.id;}
 const own=accountMovs(s.account),imported=own.filter(m=>m.source==='CARTOLA'),known=imported.map(m=>m.balance).filter(Number.isFinite);
 const r=C().parse(s.text,{format:fmt.id,opening:Number.isFinite(s.opening)?s.opening:undefined,known});
 const prints=new Set(imported.map(m=>C().fingerprint(String(s.account),{date:m.date,direction:m.direction,amount:m.amount,balance:m.balance,doc:m.doc})));
 const hand=own.filter(m=>m.source!=='CARTOLA'),dayDiff=(a,b)=>Math.abs(Date.parse(a)-Date.parse(b))/864e5,used=new Set();
 r.rows.forEach(x=>{if(x.error)return;
  if(prints.has(C().fingerprint(String(s.account),x))){x.state='dup';return;}
  const h=hand.find(m=>!used.has(m.id)&&m.amount===x.amount&&m.direction===x.direction&&dayDiff(m.date,x.date)<=3);
  if(h){used.add(h.id);x.state='maybe';x.match=h;}else x.state='new';
 });
 // Continuidad: el saldo inicial debería ser el saldo con que terminó la cartola anterior.
 const first=r.rows[0],before=first?imported.filter(m=>m.date<first.date&&Number.isFinite(m.balance)):[];
 const sign=m=>m.direction==='ENTRADA'?m.amount:-m.amount,last=before.reduce((d,m)=>m.date>d?m.date:d,'');
 r.gap=r.opening!==null&&before.length&&!before.some(m=>m.balance===r.opening)?(before.find(m=>m.date===last&&!before.some(o=>o!==m&&o.balance-sign(o)===m.balance))||before.find(m=>m.date===last)):null;
 s.cart=r;return true;
}
function cartView(){
 const r=s.cart,acc=accounts().find(a=>a.id===s.account),okRows=r.rows.filter(x=>!x.error),fresh=okRows.filter(x=>x.state!=='dup'),dups=okRows.length-fresh.length,maybe=fresh.filter(x=>x.state==='maybe').length;
 const src={cartola:'del encabezado pegado',anterior:'de la cartola anterior',manual:'ingresado por ti'}[r.openingSource]||'';
 const chip=x=>x.error?`<span class="oc-chip oc-chip-bad">${esc(x.error)}</span>`:x.state==='dup'?'<span class="oc-chip">Ya importada</span>':x.state==='maybe'?`<span class="oc-chip oc-chip-warn" title="${esc(fmtDate(x.match.date)+' · '+x.match.description)}">¿Ya ingresada a mano?</span>`:'<span class="oc-chip oc-chip-ok">Nueva</span>';
 const amt=(x,d)=>x.direction===d?money(x.amount):x.direction?'':'<small>?</small>';
 const blocked=!isBankAccount(acc);
 return `<div class="oc-caja-form">${accountSelect()}</div>
 <p><b>Formato: ${esc(r.format.name)}</b> · ${r.rows.length} movimientos${r.ignored?` · ${r.ignored} líneas de encabezado o pie ignoradas`:''}</p>
 ${blocked?'<p><span class="oc-chip oc-chip-bad">Elige la cuenta bancaria de esta cartola (no Caja ni Mercado Pago).</span></p>':''}
 ${r.opening===null?`<div class="oc-caja-form"><p>No encuentro el saldo inicial: pega también el encabezado de la cartola, escríbelo, o indica qué fue la primera línea.</p>
  <label>Saldo inicial<input id="ad-opening" inputmode="numeric" placeholder="Ej. 12.560.266"></label><p><button id="ad-opening-ok">Usar saldo</button> <button data-ad-first="SALIDA">La 1.ª línea es cargo</button> <button data-ad-first="ENTRADA">La 1.ª línea es abono</button></p></div>`
  :`<p>Saldo inicial ${money(r.opening)} <small>(${esc(src)})</small> → saldo final ${money(r.final)} · <span class="oc-in">Abonos +${money(r.totals.in)}</span> · <span class="oc-out">Cargos −${money(r.totals.out)}</span> · ${r.bad?`<span class="oc-chip oc-chip-bad">${r.bad} con descuadre</span>`:'<span class="oc-chip oc-chip-ok">✓ Cuadra con el saldo de la cartola</span>'}</p>`}
 ${r.gap?`<p><span class="oc-chip oc-chip-warn">Ojo</span> La cartola anterior importada terminó el ${esc(fmtDate(r.gap.date))} con ${money(r.gap.balance)} y esta parte con ${money(r.opening)}: puede faltar una cartola entre medio.</p>`:''}
 <div class="oc-table-scroll"><table><thead><tr><th>#</th><th>Fecha</th><th>Descripción</th><th>Docto.</th><th>Cargo</th><th>Abono</th><th>Saldo</th><th></th></tr></thead><tbody>${r.rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(fmtDate(x.date))}</td><td>${esc(x.description)}</td><td><small>${esc(x.doc)}</small></td><td class="oc-out">${amt(x,'SALIDA')}</td><td class="oc-in">${amt(x,'ENTRADA')}</td><td>${money(x.balance)}</td><td>${chip(x)}</td></tr>`).join('')}</tbody></table></div>
 <p>${fresh.length} nuevas${dups?` · ${dups} ya estaban importadas (no se repiten)`:''}${maybe?` · ${maybe} parecen ingresadas a mano o por atajo: revísalas después en la Caja`:''}</p>
 <p><button id="ad-cart-save" ${r.bad||!fresh.length||blocked||s.busy?'disabled':''}>Importar ${fresh.length} movimientos</button> <button id="ad-cart-back">Volver a pegar</button></p>`;
}
async function saveCart(el){
 if(s.busy||!s.cart||s.cart.bad)return;s.busy=true;s.message='Importando cartola…';draw(el);
 try{
  const rows=s.cart.rows.map(x=>({date:x.date,direction:x.direction,amount:x.amount,balance:x.balance,description:x.description,doc:x.doc}));
  const r=await config.cartolaImport(s.account,s.requestId,s.cart.format.id,s.cart.opening,rows);
  root.OCCajaNueva?.addMovements(r.saved);
  s.message=`${r.saved.length} movimientos importados${r.skipped?` · ${r.skipped} ya estaban`:''}. Quedan en «Por completar» para asignar concepto y auto.`;
  s.cart=null;s.text='';s.opening=null;s.accountTouched=false;s.requestId=uid();
 }catch(e){s.message=e.message;}
 s.busy=false;draw(el);
}
function batches(){
 const by=new Map();movs('CARTOLA').forEach(m=>{if(!m.batch)return;const b=by.get(m.batch)||{id:m.batch,account:m.account,rows:[]};b.rows.push(m);by.set(m.batch,b);});
 return [...by.values()].map(b=>{const d=b.rows.map(m=>m.date).sort();return {...b,from:d[0],to:d[d.length-1],classified:b.rows.filter(m=>m.classification).length};}).sort((a,b)=>b.to.localeCompare(a.to));
}
function lots(){
 const l=batches();
 return l.length?`<div class="oc-caja-list">${l.map(b=>`<article class="oc-caja-row"><div><small>${esc(b.account)}</small><h3>${esc(fmtDate(b.from))} al ${esc(fmtDate(b.to))}</h3><strong>${b.rows.length} movimientos</strong><small>${b.classified} con concepto · ${b.rows.length-b.classified} por completar</small></div><div class="cn-controls"><button data-ad-lot="${esc(b.id)}" data-n="${b.rows.length}" data-c="${b.classified}" class="cn-undo">Anular importación</button></div></article>`).join('')}</div>`:'<p>Todavía no hay cartolas importadas.</p>';
}
function mp(){return `<p>Claves de la API de Mercado Pago (Access Token, y opcionalmente Public Key, Client ID y Client Secret). Se guardan en Google y no se vuelven a mostrar. Si algún día el token falla, el botón de actualizar te abrirá este mismo cuadro.</p><p><button id="ad-token">Registrar o cambiar claves</button></p>`;}
function list(rows){
 return rows.length?`<div class="oc-caja-list">${rows.map(m=>`<article class="oc-caja-row"><div><small>${esc(m.account)} · ${esc(fmtDate(m.date))}</small><h3>${esc(m.description)}</h3><strong class="oc-amount ${m.direction==='ENTRADA'?'oc-in':'oc-out'}">${m.direction==='SALIDA'?'−':'+'}${money(m.amount)}</strong>${m.classification?`<small>${esc(m.classification.name)}</small>`:'<small>Sin concepto: queda en «Por completar»</small>'}</div><div class="cn-controls"><button data-ad-void="${esc(m.id)}" class="cn-undo">Anular</button></div></article>`).join('')}</div>`:'<p>Todavía no hay movimientos ingresados a mano.</p>';
}
async function submit(el,rows,accountId){
 if(s.busy)return;s.busy=true;s.message='Guardando…';draw(el);
 try{const saved=await config.manualAdd(accountId,s.requestId,rows);root.OCCajaNueva?.addMovements(saved);s.message=saved.length+' movimiento'+(saved.length===1?'':'s')+' guardado'+(saved.length===1?'':'s')+'.';s.requestId=uid();s.parsed=[];s.text='';}
 catch(e){s.message=e.message;}
 s.busy=false;draw(el);
}
function wire(el){
 el.querySelectorAll('[data-ad-tab]').forEach(b=>b.onclick=()=>{s.tab=b.dataset.adTab;s.message='';draw(el);});
 const acc=el.querySelector('#ad-account');if(acc)acc.onchange=()=>{s.account=acc.value;s.accountTouched=true;if(s.cart){s.opening=null;analyze();draw(el);}};
 const one=el.querySelector('#ad-one');
 if(one)one.onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(one)),car=f.car?carMap().get(f.car.trim()):null;
  if(f.car&&!car){s.message='Elige un auto de la lista.';draw(el);return;}
  submit(el,[{date:f.date,direction:f.direction,amount:Number(f.amount),description:f.description,conceptId:f.conceptId||'',vehicleId:car?String(car.id):''}],f.accountId||s.account);};
 const tk=el.querySelector('#ad-token');if(tk)tk.onclick=()=>root.OCCajaNueva?.tokenDialog(el);
 const text=el.querySelector('#ad-text');if(text)text.oninput=()=>{s.text=text.value;};
 const parse=el.querySelector('#ad-parse');if(parse)parse.onclick=()=>{s.opening=null;s.requestId=uid();if(analyze())s.parsed=[];else s.parsed=parseLines(s.text);draw(el);};
 const back=el.querySelector('#ad-cart-back');if(back)back.onclick=()=>{s.cart=null;s.opening=null;draw(el);};
 const cs=el.querySelector('#ad-cart-save');if(cs)cs.onclick=()=>saveCart(el);
 const op=el.querySelector('#ad-opening-ok');if(op)op.onclick=()=>{const v=C().clp(el.querySelector('#ad-opening').value);if(v===null){s.message='Saldo inicial inválido.';draw(el);return;}s.opening=v;analyze();draw(el);};
 el.querySelectorAll('[data-ad-first]').forEach(b=>b.onclick=()=>{const f=s.cart&&s.cart.rows[0];if(!f)return;s.opening=f.balance+(b.dataset.adFirst==='ENTRADA'?-f.amount:f.amount);analyze();draw(el);});
 el.querySelectorAll('[data-ad-lot]').forEach(b=>b.onclick=async()=>{
  const c=Number(b.dataset.c);if(!confirm(`¿Anular esta importación? Se quitan sus ${b.dataset.n} movimientos de la caja${c?` y se pierde la asignación de los ${c} que ya tienen concepto`:''}. Puedes volver a pegar la cartola después.`))return;
  try{const ids=await config.cartolaVoid(b.dataset.adLot);ids.forEach(id=>root.OCCajaNueva?.removeMovement(id));s.message=`Importación anulada (${ids.length} movimientos).`;}catch(e){s.message=e.message;}draw(el);
 });
 const save=el.querySelector('#ad-save');if(save)save.onclick=()=>submit(el,s.parsed.filter(x=>!x.error).map(x=>({date:x.date,direction:x.direction,amount:x.amount,description:x.description})),s.account);
 el.querySelectorAll('[data-ad-void]').forEach(b=>b.onclick=async()=>{
  if(!confirm('¿Anular este movimiento ingresado a mano? Deja de contar en las cajas.'))return;
  try{await config.manualVoid(b.dataset.adVoid);root.OCCajaNueva?.removeMovement(b.dataset.adVoid);s.message='Movimiento anulado.';}catch(e){s.message=e.message;}draw(el);
 });
}
root.OCAdmin={...api,setup,reset,markup,mount};
})(typeof globalThis==='undefined'?this:globalThis);
