(function(root){
'use strict';
const accounts=['MERCADO PAGO','SECURITY PERSONAL','CAJA','SECURITY EMPRESA','BANCO CHILE'];
const defaults=[
 {id:'claxo',name:'Pago recurrente Claxo',category:'RP',nature:'GASTO',cost:'FIJO',recurring:true,vehicleOperation:'',version:1},
 {id:'cyc',name:'Pago CYC',category:'Marketing',nature:'GASTO',cost:'FIJO',recurring:false,vehicleOperation:'',version:1},
 ...['COMPRA','ARREGLO','VENTA'].map(op=>({id:op,name:{COMPRA:'Compra de auto',ARREGLO:'Arreglo de auto',VENTA:'Venta de auto'}[op],category:'Vehículos',nature:op==='VENTA'?'INGRESO':'COSTO',cost:op==='VENTA'?'NO_APLICA':'VARIABLE',recurring:false,vehicleOperation:op,version:1}))
];
function validate(c,others=[]){
 if(!String(c.name||'').trim()||!String(c.category||'').trim())throw Error('Completa nombre y categoría.');
 if(others.some(x=>x.id!==c.id&&x.name.toLowerCase().trim()===c.name.toLowerCase().trim()))throw Error('Ese concepto ya existe.');
 if(!['GASTO','COSTO','INGRESO','TRANSFERENCIA','APORTE_CAPITAL','PRESTAMO'].includes(c.nature)||!['FIJO','VARIABLE','NO_APLICA'].includes(c.cost)||!['','COMPRA','ARREGLO','VENTA'].includes(c.vehicleOperation))throw Error('Clasificación no válida.');
 if(c.vehicleOperation&&c.nature!==(c.vehicleOperation==='VENTA'?'INGRESO':'COSTO'))throw Error('Compra y arreglo son costos; venta es ingreso.');
 return {...c,name:c.name.trim(),category:c.category.trim()};
}
function classify(m,c,vehicleId,inventory){
 c=validate(c);
 if(m.direction==='ENTRADA'&&['COSTO','GASTO'].includes(c.nature)||m.direction==='SALIDA'&&c.nature==='INGRESO')throw Error('El concepto no corresponde a la dirección del movimiento.');
 if(c.vehicleOperation&&vehicleId&&!inventory.some(v=>v.id===vehicleId))throw Error('Selecciona un auto del inventario.');
 return {...m,...(m.classification?.id!==c.id?{activityId:'',forecastId:'',prestamoId:'',loanComponent:'',socio:''}:{}),classification:{...c,vehicleId:c.vehicleOperation?(vehicleId||null):null},status:c.vehicleOperation&&!vehicleId?'POR_ASIGNAR_AUTO':'CLASIFICADO'};
}
function assignVehicle(m,id,inventory){
 if(!m.classification?.vehicleOperation||id&&!inventory.some(v=>v.id===id))throw Error('Selecciona un auto del inventario.');
 return {...m,...(m.classification.vehicleId!==id?{activityId:'',forecastId:''}:{}),classification:{...m.classification,vehicleId:id||null},status:id?'CLASIFICADO':'POR_ASIGNAR_AUTO'};
}
function inventoryLabel(v){return [v.id,v.patente||v.plate||'Sin patente',v.modelo||v.model||v.name||'Sin modelo'].join(' · ');}
function vehicleTotals(movements,id){
 const result={purchase:0,repairs:0,sales:0,unconfirmed:0};
 for(const m of movements){const c=m.classification;if(!c||c.vehicleId!==id)continue;if(m.confirmed!==true||!Number.isSafeInteger(m.amount)||m.amount<0){result.unconfirmed++;continue;}const key={COMPRA:'purchase',ARREGLO:'repairs',VENTA:'sales'}[c.vehicleOperation];if(key)result[key]+=m.amount;}
 return {...result,result:result.sales-result.purchase-result.repairs};
}
const api={accounts,defaults,validate,classify,assignVehicle,vehicleTotals,inventoryLabel};
if(typeof module!=='undefined')module.exports=api;
if(!root.document)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n):'—';
let s,config,key;
function reset(){s=null;config=null;document.querySelectorAll('[data-caja-dialog]').forEach(d=>d.remove());}
function setup(options={}){
 config=options;config.canManageConcepts=options.preview||options.canManageConcepts===true;key='oc-conceptos-v1-'+(options.preview?'preview':options.userId||'local');
 let concepts=defaults.map(c=>({...c}));try{const data=JSON.parse(localStorage.getItem(key));if(Array.isArray(data)&&data.length)concepts=data.map(c=>validate(c,data));}catch{}
 s={concepts:options.concepts||concepts,inventory:options.inventory||(options.preview?[{id:'DEMO-AUTO-001',patente:'DEMO01',modelo:'Modelo de ejemplo'}]:[]),movements:options.movements||(options.preview?[
 {id:'demo-1',account:'SECURITY EMPRESA',description:'Claxo',amount:90,direction:'SALIDA',confirmed:true,status:'PENDIENTE'},
 {id:'demo-2',account:'BANCO CHILE',description:'Cars and Coffee',amount:1200000,direction:'SALIDA',confirmed:true,status:'PENDIENTE'},
 {id:'demo-3',account:'MERCADO PAGO',description:'Taller · reparación vehículo',amount:250000,direction:'SALIDA',confirmed:true,status:'PENDIENTE'}]:[]),vehicleChoices:{},tab:'movimientos',filter:'PENDIENTE',account:'',message:'',busy:false};
}
function markup(){return '<section id="oc-caja" class="oc-card"></section>';}
function mount(parent){const el=parent.querySelector('#oc-caja');if(el&&s)draw(el);}
function tags(c){return [c.category,c.nature,c.cost==='NO_APLICA'?'':('Costo '+c.cost.toLowerCase()),c.recurring?'Recurrente':''].filter(Boolean).map(t=>`<span class="oc-caja-tag">${esc(t)}</span>`).join('');}
function conceptOptions(m){return s.concepts.filter(c=>m.direction==='ENTRADA'?['INGRESO','TRANSFERENCIA','APORTE_CAPITAL','PRESTAMO'].includes(c.nature):m.direction==='SALIDA'?c.nature!=='INGRESO':true);}
function vehicleControl(m){
 const selected=m.classification?.vehicleId||s.vehicleChoices[m.id]||'';
 return `<label>Inventario · ID / patente / modelo<select data-vehicle="${esc(m.id)}"><option value="">Por asignar auto</option>${s.inventory.map(v=>`<option value="${esc(v.id)}" ${v.id===selected?'selected':''}>${esc(inventoryLabel(v))}</option>`).join('')}</select></label>`;
}
function row(m){
 const c=m.classification,list=conceptOptions(m),suggestion=list.find(c=>c.id==='claxo'&&/claxo/i.test(m.description)||c.id==='cyc'&&/cars.*coff|\bcyc\b/i.test(m.description));
 return `<article class="oc-caja-row"><div><small>${esc(m.account)}</small><h3>${esc(m.description)}</h3>${!m.confirmed?'<small>Importe por confirmar</small>':''}<strong class="oc-amount ${m.direction==='ENTRADA'?'oc-in':m.direction==='SALIDA'?'oc-out':'oc-unknown'}">${m.direction==='SALIDA'?'−':m.direction==='ENTRADA'?'+':''}${money(m.amount)}</strong></div><div>${c?`<h3>${esc(c.name)}</h3><p>${tags(c)}</p>${c.vehicleOperation?vehicleControl(m):''}<button data-change="${esc(m.id)}">Cambiar concepto</button> <button data-links="${esc(m.id)}">Vincular actividad o compromiso</button>`:`${suggestion?`<button data-quick="${esc(suggestion.id)}" data-movement="${esc(m.id)}">${esc(suggestion.name)} ✓</button><p>${tags(suggestion)}</p>`:''}<label>Asignar concepto<select data-concept="${esc(m.id)}"><option value="">Seleccionar…</option>${list.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>${vehicleControl(m)}`}</div></article>`;
}
function draw(el){
 const rows=s.movements.filter(m=>(!s.account||s.account===m.account)&&(!s.filter||s.filter===m.status));
 el.innerHTML=`<p class="oc-eyebrow">CAJA Y BANCOS</p><h2>Elige qué es. El resto queda clasificado.</h2><p>Los movimientos llegan a sus cuentas. Asigna un concepto y, cuando corresponda, un auto.</p><div class="oc-notice">${config.preview?'Ejemplos para probar el flujo. No modifica movimientos reales.':config.saveMovement?'Movimientos de tus cuentas.':'Conexión automática pendiente. Puedes preparar conceptos como borrador en este navegador.'}</div><div class="oc-cash-tools"><button data-tab="movimientos">Movimientos</button><button data-tab="conceptos">Mis conceptos</button><button id="caja-new">+ Crear concepto</button></div><p role="status">${esc(s.message)}</p>${s.tab==='conceptos'?`<div class="oc-area-grid">${s.concepts.map(c=>`<article class="oc-card"><h3>${esc(c.name)}</h3><p>${tags(c)}</p>${c.vehicleOperation?'<p>Se asigna a un auto del inventario.</p>':''}<button data-edit="${esc(c.id)}">Editar</button></article>`).join('')}</div>`:`<div class="oc-cash-tools"><label>Cuenta<select id="caja-account"><option value="">Todas las cuentas</option>${accounts.map(a=>`<option ${a===s.account?'selected':''}>${a}</option>`).join('')}</select></label><label>Ver<select id="caja-filter">${[['PENDIENTE','Por clasificar'],['POR_ASIGNAR_AUTO','Por asignar auto'],['CLASIFICADO','Clasificados'],['','Todos']].map(([v,l])=>`<option value="${v}" ${v===s.filter?'selected':''}>${l}</option>`).join('')}</select></label></div><p>${rows.length} movimientos · ${s.movements.filter(m=>m.status==='POR_ASIGNAR_AUTO').length} por asignar auto</p><div class="oc-caja-list">${rows.length?rows.map(row).join(''):'<p class="oc-empty">No hay movimientos en esta vista.</p>'}</div>`}`;
 el.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{s.tab=b.dataset.tab;draw(el);});el.querySelector('#caja-new').onclick=()=>edit(el);
 el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(el,s.concepts.find(c=>c.id===b.dataset.edit)));
 for(const [id,k] of [['caja-account','account'],['caja-filter','filter']]){const input=el.querySelector('#'+id);if(input)input.onchange=()=>{s[k]=input.value;draw(el);};}
 el.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>choose(el,b.dataset.movement,b.dataset.quick));
 el.querySelectorAll('[data-concept]').forEach(b=>b.onchange=()=>{if(b.value)choose(el,b.dataset.concept,b.value);});
 el.querySelectorAll('[data-vehicle]').forEach(b=>b.onchange=async()=>{const m=s.movements.find(m=>m.id===b.dataset.vehicle);if(!m.classification?.vehicleOperation){s.vehicleChoices[m.id]=b.value;return;}try{await save(el,assignVehicle(m,b.value,s.inventory));}catch(e){s.message=e.message;draw(el);}});
 el.querySelectorAll('[data-change]').forEach(b=>b.onclick=()=>{const m=s.movements.find(m=>m.id===b.dataset.change),d=dialog(`<h2>Cambiar concepto</h2><select>${conceptOptions(m).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><button id="apply">Aplicar</button><button id="cancel">Cancelar</button>`);d.querySelector('#apply').onclick=()=>{const id=d.querySelector('select').value;d.close();choose(el,m.id,id);};});
 el.querySelectorAll('[data-links]').forEach(b=>b.onclick=()=>linkDetails(el,s.movements.find(m=>m.id===b.dataset.links)));
 if(!config.canManageConcepts){el.querySelector('#caja-new').remove();el.querySelectorAll('[data-edit]').forEach(b=>b.remove());}
 if(s.busy)el.querySelectorAll('button,select').forEach(b=>b.disabled=true);
}
function dialog(html){const d=document.createElement('dialog');d.className='oc-dialog';d.dataset.cajaDialog='';d.innerHTML=html;document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();const cancel=d.querySelector('#cancel');if(cancel)cancel.onclick=()=>d.close();return d;}
async function save(el,m){
 if(s.busy)throw Error('Espera a que termine el guardado.');const current=s;s.busy=true;draw(el);
 try{if(!config.preview){if(!config.saveMovement)throw Error('Falta conectar Google para guardar movimientos.');await config.saveMovement(m);}if(s!==current)return;s.movements=s.movements.map(old=>old.id===m.id?m:old);s.message=config.preview?'Ejemplo clasificado.':'Movimiento clasificado.';}
 finally{if(s===current){s.busy=false;draw(el);}}
}
async function choose(el,id,conceptId){
 const m=s.movements.find(m=>m.id===id),c=s.concepts.find(c=>c.id===conceptId);
 try{const next=classify(m,c,s.vehicleChoices[id]||m.classification?.vehicleId||null,s.inventory);if(['APORTE_CAPITAL','PRESTAMO'].includes(c.nature)){linkDetails(el,next);return;}await save(el,next);if(s&&next.status==='POR_ASIGNAR_AUTO'){s.filter='POR_ASIGNAR_AUTO';draw(el);}}
 catch(e){if(s){s.message=e.message;draw(el);}}
}

function linkDetails(el,m){
 const select=(name,rows,current)=>'<select name="'+name+'"><option value="">Sin vincular</option>'+rows.map(([id,label])=>'<option value="'+esc(id)+'" '+(id===current?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select>';
 const c=m.classification||{},d=dialog('<form><h2>Detalle del movimiento</h2>'+(c.nature==='APORTE_CAPITAL'?'<label>Socio<input name="socio" required value="'+esc(m.socio||'')+'"></label>':'')+(c.nature==='PRESTAMO'?'<label>Préstamo'+select('prestamoId',(config.loans||[]).map(l=>[l.prestamo_id,l.nombre]),m.prestamoId)+'</label><label>Componente'+select('loanComponent',[['DESEMBOLSO','Desembolso'],['AMORTIZACION','Devolución de principal'],['INTERES','Interés']],m.loanComponent)+'</label>':'')+'<label>Actividad'+select('activityId',(config.activities||[]).filter(a=>a.vehiculo_id===c.vehicleId).map(a=>[a.actividad_id,[a.fecha,a.tipo,a.descripcion].join(' · ')]),m.activityId)+'</label><label>Cuota o proyección'+select('forecastId',(config.forecasts||[]).filter(f=>f.direccion===m.direction&&(!f.vehiculo_id||f.vehiculo_id===c.vehicleId)).map(f=>[f.proyeccion_id,f.fecha+' · '+f.descripcion]),m.forecastId)+'</label><p role="status"></p><button type="submit">Guardar</button> <button type="button" id="cancel">Cancelar</button></form>');
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;try{await save(el,{...m,...Object.fromEntries(new FormData(e.target))});d.close();}catch(e){d.querySelector('[role=status]').textContent=e.message;}finally{b.disabled=false;}};
}

function edit(el,original){
 if(!config.canManageConcepts)return;
 const c=original||{name:'',category:'',nature:'GASTO',cost:'FIJO',recurring:false,vehicleOperation:''};
 const select=(name,values)=>`<select name="${name}">${values.map(([v,l])=>`<option value="${v}" ${c[name]===v?'selected':''}>${l}</option>`).join('')}</select>`;
 const d=dialog(`<form><h2>${original?'Editar':'Crear'} concepto</h2><div class="oc-caja-form"><label>Nombre<input name="name" required maxlength="100" value="${esc(c.name)}" placeholder="Pago CYC"></label><label>Categoría<input name="category" required maxlength="80" value="${esc(c.category)}" placeholder="Marketing, RP…"></label><label>Qué es${select('nature',[['GASTO','Gasto'],['COSTO','Costo'],['INGRESO','Ingreso'],['TRANSFERENCIA','Transferencia interna'],['APORTE_CAPITAL','Aporte de capital'],['PRESTAMO','Préstamo']])}</label><label>Tipo de costo${select('cost',[['FIJO','Fijo'],['VARIABLE','Variable'],['NO_APLICA','No aplica']])}</label><label><input type="checkbox" name="recurring" ${c.recurring?'checked':''}> Pago recurrente</label></div><p>Al asignar este concepto se aplican todas estas clasificaciones.</p><p role="status"></p><button type="submit">Guardar concepto</button> <button type="button" id="cancel">Cancelar</button></form>`);
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),button=e.target.querySelector('[type=submit]');button.disabled=true;try{
 const next=validate({id:original?.id||crypto.randomUUID(),name:f.get('name'),category:f.get('category'),nature:f.get('nature'),cost:f.get('cost'),vehicleOperation:original?.vehicleOperation||'',recurring:f.has('recurring'),version:(original?.version||0)+1},s.concepts);
 const concepts=original?s.concepts.map(c=>c.id===next.id?next:c):[...s.concepts,next];
 if(config.saveConcept)await config.saveConcept(next);else localStorage.setItem(key,JSON.stringify(concepts));s.concepts=concepts;s.message=config.saveConcept?'Concepto guardado.':'Concepto guardado como borrador en este navegador.';d.close();draw(el);
 }catch(e){d.querySelector('[role=status]').textContent=e.message;button.disabled=false;}};
}
root.OCCaja={...api,setup,reset,markup,mount,updateSources(data){if(!s)return;s.inventory=(data.inventory||[]).map(v=>({id:v.vehiculo_id,patente:v.patente,modelo:[v.marca,v.modelo,v.version_vehiculo].filter(Boolean).join(' ')}));config.activities=data.activities;config.forecasts=data.links?.forecasts||[];config.loans=data.links?.loans||[];}};
})(typeof window==='undefined'?globalThis:window);
