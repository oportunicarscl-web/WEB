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
function setup(options={}){config=options;s={tab:'uno',message:'',busy:false,parsed:[],requestId:uid(),account:'',text:''};}
function markup(){return '<section id="oc-admin" class="oc-card"></section>';}
function mount(parent){const el=parent.querySelector('#oc-admin');if(el&&s)draw(el);}
function carLabel(v){return [v.patente||'Sin patente',v.modelo].filter(Boolean).join(' · ');}
function carMap(){const seen={},m=new Map();(config.inventory||[]).forEach(v=>{let l=carLabel(v);if(seen[l])l+=' #'+v.id;seen[l]=1;m.set(l,v);});return m;}
function accounts(){return config?.accountsInfo?config.accountsInfo():[];}
function accountSelect(){const a=accounts();if(!s.account&&a[0])s.account=a[0].id;return `<label>Cuenta<select id="ad-account">${a.map(x=>`<option value="${esc(x.id)}" ${x.id===s.account?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`;}
function conceptOptions(){return `<option value="">Concepto por asignar</option>`+(config.concepts||[]).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');}
function draw(el){
 const manual=(root.OCCajaNueva?.movementsBySource('MANUAL')||[]).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,40);
 el.innerHTML=`<p class="oc-eyebrow">ADMINISTRAR</p><h2>Movimientos a mano</h2><p>Respaldo para lo que la API de Mercado Pago o la cartola automática no traen. Quedan con el importe confirmado; si les asignas concepto (y auto) cuentan en el saldo de inmediato. Las importaciones automáticas tendrán su propia opción.</p>
 ${s.message?`<p role="status">${esc(s.message)}</p>`:''}
 <div class="oc-tabs"><button class="oc-tab${s.tab==='uno'?' active':''}" data-ad-tab="uno">Un movimiento</button><button class="oc-tab${s.tab==='varios'?' active':''}" data-ad-tab="varios">Pegar varias líneas</button><button class="oc-tab${s.tab==='lista'?' active':''}" data-ad-tab="lista">Ingresados a mano (${manual.length})</button></div>
 <datalist id="ad-cars">${[...carMap().keys()].map(l=>`<option value="${esc(l)}"></option>`).join('')}</datalist>
 ${s.tab==='uno'?one():s.tab==='varios'?many():list(manual)}`;
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
 const ok=s.parsed.filter(x=>!x.error),bad=s.parsed.length-ok.length;
 return `<div class="oc-caja-form">${accountSelect()}<label>Líneas<textarea id="ad-text" rows="8" placeholder="15-10-2026 ; Depósito cliente ; 250.000&#10;16-10-2026 ; Pago proveedor ; -48.500">${esc(s.text)}</textarea></label></div>
 <p><small>Una línea por movimiento: <b>fecha ; descripción ; monto</b> (negativo = salió). También sirve <b>fecha ; descripción ; cargo ; abono</b>. Pega desde Excel o la cartola.</small></p>
 <p><button id="ad-parse">Revisar líneas</button></p>
 ${s.parsed.length?`<div class="oc-table-scroll"><table><thead><tr><th>#</th><th>Fecha</th><th>Descripción</th><th>Monto</th><th></th></tr></thead><tbody>${s.parsed.map(x=>x.error?`<tr><td>${x.line}</td><td colspan="3">${esc(x.raw)}</td><td><span class="oc-chip oc-chip-bad">${esc(x.error)}</span></td></tr>`:`<tr><td>${x.line}</td><td>${esc(fmtDate(x.date))}</td><td>${esc(x.description)}</td><td class="${x.direction==='ENTRADA'?'oc-in':'oc-out'}">${x.direction==='ENTRADA'?'+':'−'}${money(x.amount)}</td><td><span class="oc-chip oc-chip-ok">Listo</span></td></tr>`).join('')}</tbody></table></div>
 <p>${ok.length} listas${bad?` · ${bad} con error (corrígelas para guardar)`:''}</p><p><button id="ad-save" ${bad||!ok.length||s.busy?'disabled':''}>Guardar ${ok.length} movimientos</button></p>`:''}`;
}
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
 const acc=el.querySelector('#ad-account');if(acc)acc.onchange=()=>{s.account=acc.value;};
 const one=el.querySelector('#ad-one');
 if(one)one.onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(one)),car=f.car?carMap().get(f.car.trim()):null;
  if(f.car&&!car){s.message='Elige un auto de la lista.';draw(el);return;}
  submit(el,[{date:f.date,direction:f.direction,amount:Number(f.amount),description:f.description,conceptId:f.conceptId||'',vehicleId:car?String(car.id):''}],f.accountId||s.account);};
 const text=el.querySelector('#ad-text');if(text)text.oninput=()=>{s.text=text.value;};
 const parse=el.querySelector('#ad-parse');if(parse)parse.onclick=()=>{s.parsed=parseLines(s.text);s.requestId=uid();draw(el);};
 const save=el.querySelector('#ad-save');if(save)save.onclick=()=>submit(el,s.parsed.filter(x=>!x.error).map(x=>({date:x.date,direction:x.direction,amount:x.amount,description:x.description})),s.account);
 el.querySelectorAll('[data-ad-void]').forEach(b=>b.onclick=async()=>{
  if(!confirm('¿Anular este movimiento ingresado a mano? Deja de contar en las cajas.'))return;
  try{await config.manualVoid(b.dataset.adVoid);root.OCCajaNueva?.removeMovement(b.dataset.adVoid);s.message='Movimiento anulado.';}catch(e){s.message=e.message;}draw(el);
 });
}
root.OCAdmin={...api,setup,reset,markup,mount};
})(typeof globalThis==='undefined'?this:globalThis);
