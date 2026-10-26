(function(root){
'use strict';
// Configuración extra: Socios (lista cerrada para los aportes), aportes sin socio y Conceptos de caja (crear/editar).
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n):'—';
const fmtDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.slice(8,10)+'-'+v.slice(5,7)+'-'+v.slice(0,4):'Sin fecha';
const norm=v=>String(v||'').trim().toLowerCase();
// Socio sugerido para un aporte: el ya escrito o un nombre que aparezca en la descripción (TUTU = Gonzalo).
function suggest(m,socios,alias={tutu:'gonzalo'}){
 const names=socios.map(x=>x.nombre),hit=n=>names.find(x=>norm(x)===norm(n));
 if(m.socio&&hit(m.socio))return hit(m.socio);
 const d=norm(m.description);
 for(const n of names)if(d.includes(norm(n)))return n;
 for(const [a,n] of Object.entries(alias))if(d.includes(a)&&hit(n))return hit(n);
 return '';
}
const api={suggest};
if(typeof module!=='undefined')module.exports=api;
if(!root.document)return;

let config=null,s=null,cache=null,pending=null;
function reset(){config=null;s=null;cache=null;pending=null;document.querySelectorAll('[data-cf-dialog]').forEach(d=>d.remove());}
function setup(options={}){config=options;s={message:'',busy:false,picks:{}};}
// Lista de socios (una sola consulta; la reutilizan Caja histórica y esta vista).
async function socios(force){
 if(!config?.call)return [];
 if(cache&&!force)return cache;
 if(!pending)pending=config.call('socios',{}).then(r=>{cache=r||[];pending=null;return cache;},e=>{pending=null;throw e;});
 return pending;
}
function markup(){return '<div id="oc-config-extra"></div>';}
function mount(parent){const el=parent.querySelector('#oc-config-extra');if(!el||!s)return;draw(el);if(!cache)socios().then(()=>draw(el),e=>{s.message=e.message;draw(el);});}
const concepts=()=>root.OCCajaNueva?.snapshot()?.concepts||[];
const aportes=()=>(root.OCCajaNueva?.snapshot()?.movements||[]).filter(m=>m.classification?.nature==='APORTE_CAPITAL');
const NAT={GASTO:'Gasto',COSTO:'Costo',INGRESO:'Ingreso',TRANSFERENCIA:'Transferencia',APORTE_CAPITAL:'Aporte de capital',PRESTAMO:'Préstamo'};
function draw(el){
 const list=cache||[],names=new Set(list.map(x=>norm(x.nombre))),ap=aportes(),bad=ap.filter(m=>!names.has(norm(m.socio)));
 const by={};ap.filter(m=>names.has(norm(m.socio))).forEach(m=>{const k=list.find(x=>norm(x.nombre)===norm(m.socio)).nombre;by[k]=(by[k]||0)+m.amount;});
 el.innerHTML=`${s.message?`<p role="status">${esc(s.message)}</p>`:''}
 <section class="oc-card"><h2>Socios</h2><p>Lista cerrada para asignar los aportes de capital (siempre ingresos).</p>
  ${cache?`<div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Socio</th><th>Aportado (caja)</th><th>Estado</th><th></th></tr></thead><tbody>${list.map(x=>`<tr><td><b>${esc(x.nombre)}</b></td><td>${money(by[x.nombre]||0)}</td><td>${x.habilitado==='NO'?'Deshabilitado':'Activo'}</td><td><button data-cf-socio="${esc(x.socio_id)}">Editar</button></td></tr>`).join('')||'<tr><td colspan="4">Aún no hay socios.</td></tr>'}</tbody></table></div>
  <p><button id="cf-socio-new"${s.busy?' disabled':''}>Agregar socio</button></p>`:'<p>Cargando socios…</p>'}
 </section>
 ${cache&&bad.length?`<section class="oc-card"><h2>Aportes sin socio (${bad.length})</h2><p>Aportes de capital cuyo socio está vacío o no está en la lista. Elige el socio de cada uno (viene sugerido desde la descripción).</p>
  <div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Fecha</th><th>Cuenta</th><th>Descripción</th><th>Monto</th><th>Socio</th></tr></thead><tbody>
  ${bad.map(m=>{const pick=s.picks[m.id]??suggest(m,list);return `<tr><td>${esc(fmtDate(m.date))}</td><td>${esc(m.account)}</td><td>${esc(m.description)}${m.socio?` <small>(«${esc(m.socio)}»)</small>`:''}</td><td>${money(m.amount)}</td><td><select data-cf-pick="${esc(m.id)}"><option value="">Elegir…</option>${list.filter(x=>x.habilitado!=='NO').map(x=>`<option${x.nombre===pick?' selected':''}>${esc(x.nombre)}</option>`).join('')}</select></td></tr>`;}).join('')}
  </tbody></table></div><p><button id="cf-apply"${s.busy?' disabled':''}>Guardar socios elegidos</button></p></section>`:''}
 <section class="oc-card"><h2>Conceptos de caja</h2><p>Los conceptos con que se clasifican los movimientos en Caja y bancos y Caja histórica.</p>
  <div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Concepto</th><th>Categoría</th><th>Qué es</th><th>Costo</th><th>Auto</th><th></th></tr></thead><tbody>
  ${concepts().map(c=>`<tr><td><b>${esc(c.name)}</b>${c.recurring?' <small>· recurrente</small>':''}</td><td>${esc(c.category)}</td><td>${esc(NAT[c.nature]||c.nature)}</td><td>${esc(c.cost==='NO_APLICA'?'—':c.cost==='FIJO'?'Fijo':'Variable')}</td><td>${esc(c.vehicleOperation||'—')}</td><td>${config.canManage?`<button data-cf-concept="${esc(c.id)}">Editar</button>`:''}</td></tr>`).join('')}
  </tbody></table></div>${config.canManage?`<p><button id="cf-concept-new">Crear concepto</button></p>`:'<p><small>Solo Gerencia o Administración edita conceptos.</small></p>'}</section>`;
 wire(el);
}
function dialog(html){const d=document.createElement('dialog');d.className='oc-dialog';d.dataset.cfDialog='';d.innerHTML=html;document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();const c=d.querySelector('[data-cf-cancel]');if(c)c.onclick=()=>d.close();return d;}
function socioDialog(el,x){
 const d=dialog(`<form><h2>${x?'Editar':'Agregar'} socio</h2><div class="oc-caja-form"><label>Nombre<input name="nombre" required maxlength="60" value="${esc(x?.nombre||'')}"></label>
  <label>Estado<select name="habilitado"><option value="SI">Activo</option><option value="NO"${x?.habilitado==='NO'?' selected':''}>Deshabilitado</option></select></label></div>
  ${x?'<p><small>Cambiar el nombre no cambia los aportes ya asignados con el nombre anterior: quedarán en «Aportes sin socio» para reasignarlos.</small></p>':''}
  <p role="status"></p><button type="submit">Guardar</button> <button type="button" data-cf-cancel>Cancelar</button></form>`);
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),b=e.target.querySelector('[type=submit]');b.disabled=true;
  try{cache=await config.call('socioSave',{expectedVersion:x?x.version:0,record:{socio_id:x?.socio_id||'',nombre:f.nombre,habilitado:f.habilitado}});d.close();s.message='Socio guardado.';draw(el);}
  catch(err){d.querySelector('[role=status]').textContent=err.message;b.disabled=false;}};
}
async function applyPicks(el){
 const list=cache||[],names=new Set(list.map(x=>norm(x.nombre)));
 const rows=aportes().filter(m=>!names.has(norm(m.socio))).map(m=>[m,s.picks[m.id]??suggest(m,list)]).filter(([,p])=>p);
 if(!rows.length){s.message='Elige al menos un socio.';draw(el);return;}
 if(!config.saveMovement){s.message='Falta la conexión con Google.';draw(el);return;}
 s.busy=true;let n=0;
 for(const [m,p] of rows){s.message=`Guardando ${n+1} de ${rows.length}…`;draw(el);
  try{const saved=await config.saveMovement({...m,socio:p});root.OCCajaNueva?.addMovements([saved]);n++;}catch(e){s.message=e.message+` (${n} guardados)`;break;}}
 s.busy=false;if(n===rows.length)s.message=`${n} aporte${n===1?'':'s'} asignado${n===1?'':'s'}.`;s.picks={};draw(el);
}
function conceptDialog(el,original){
 const c=original||{name:'',category:'',nature:'GASTO',cost:'FIJO',recurring:false,vehicleOperation:''};
 const sel=(name,cur,values)=>`<select name="${name}">${values.map(([v,l])=>`<option value="${v}"${cur===v?' selected':''}>${l}</option>`).join('')}</select>`;
 const d=dialog(`<form><h2>${original?'Editar':'Crear'} concepto</h2><div class="oc-caja-form">
  <label>Nombre<input name="name" required maxlength="100" value="${esc(c.name)}"></label><label>Categoría<input name="category" required maxlength="80" value="${esc(c.category)}"></label>
  <label>Qué es${sel('nature',c.nature,Object.entries(NAT))}</label><label>Tipo de costo${sel('cost',c.cost,[['FIJO','Fijo'],['VARIABLE','Variable'],['NO_APLICA','No aplica']])}</label>
  <label>Se asigna a un auto${sel('op',c.vehicleOperation,[['','No se asigna a un auto'],['COSTO_AUTO','Costo del auto (lavado, combustible…)'],['ARREGLO','Arreglo'],['COMPRA','Compra'],['VENTA','Venta']])}</label>
  <label><input type="checkbox" name="recurring"${c.recurring?' checked':''}> Pago recurrente</label></div>
  <p role="status"></p><button type="submit">Guardar</button> <button type="button" data-cf-cancel>Cancelar</button></form>`);
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),b=e.target.querySelector('[type=submit]');b.disabled=true;
  try{const op=f.get('op')||'';
   const next={id:original?.id||(crypto.randomUUID?crypto.randomUUID():String(Date.now())),name:String(f.get('name')).trim(),category:String(f.get('category')).trim(),nature:op==='VENTA'?'INGRESO':op?'COSTO':f.get('nature'),cost:f.get('cost'),vehicleOperation:op,recurring:f.has('recurring'),version:(original?.version||0)+1};
   if(concepts().some(x=>x.id!==next.id&&norm(x.name)===norm(next.name)))throw Error('Ese concepto ya existe.');
   const saved=await config.saveConcept(next);root.OCCajaNueva?.upsertConcept(saved||next);d.close();s.message='Concepto guardado.';draw(el);}
  catch(err){d.querySelector('[role=status]').textContent=err.message;b.disabled=false;}};
}
function wire(el){
 const nw=el.querySelector('#cf-socio-new');if(nw)nw.onclick=()=>socioDialog(el,null);
 el.querySelectorAll('[data-cf-socio]').forEach(b=>b.onclick=()=>socioDialog(el,(cache||[]).find(x=>x.socio_id===b.dataset.cfSocio)));
 el.querySelectorAll('[data-cf-pick]').forEach(x=>x.onchange=()=>{s.picks[x.dataset.cfPick]=x.value;});
 const ap=el.querySelector('#cf-apply');if(ap)ap.onclick=()=>applyPicks(el);
 const nc=el.querySelector('#cf-concept-new');if(nc)nc.onclick=()=>conceptDialog(el,null);
 el.querySelectorAll('[data-cf-concept]').forEach(b=>b.onclick=()=>conceptDialog(el,concepts().find(c=>c.id===b.dataset.cfConcept)));
}
root.OCConfig={...api,setup,reset,markup,mount,socios};
})(typeof globalThis==='undefined'?this:globalThis);
