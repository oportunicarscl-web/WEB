(function(root){
'use strict';
// Correos (solo Alex): configura el correo gerencial semanal — destinatarios, frecuencia, día, hora, asunto, mensaje y secciones.
// La vista previa se arma aquí mismo con los datos ya cargados (sin consultar a Google) y el mismo motor que usa el envío.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let config=null,s=null,timer=null;
const K=()=>root.OCCorreoCore;
function reset(){config=null;s=null;clearTimeout(timer);}
function setup(options={}){config=options;s={data:null,draft:null,loading:false,busy:false,message:'',tone:'',dirty:false};}
function markup(){return '<section id="oc-mail"></section>';}
function mount(parent){const el=parent.querySelector('#oc-mail');if(!el||!s)return;if(!s.data&&!s.loading)load(el);else draw(el);}
const call=(a,p)=>config.call(a,p);
const clone=x=>JSON.parse(JSON.stringify(x));
async function load(el){
 s.loading=true;s.message='Cargando configuración de correos…';s.tone='';draw(el);
 try{take(await call('mailLoad',{}));s.message='';}catch(e){s.message=e.message;s.tone='bad';if(!s.draft)s.draft=K().defaults();}
 s.loading=false;draw(el);
}
function take(data){s.data=data;s.draft=clone(data.config);s.dirty=false;if(data.warning){s.message=data.warning;s.tone='warn';}}
const fmtAt=iso=>{const d=new Date(iso);return isNaN(d)?esc(iso):d.toLocaleString('es-CL',{timeZone:'America/Santiago',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});};
function chip(on,yes,no){return '<span class="oc-chip '+(on?'oc-chip-ok':'oc-chip-warn')+'">'+(on?yes:no)+'</span>';}
function status(){
 const d=s.data||{},c=s.draft;
 const next=d.next?d.next.label:c.enabled?'—':'Pausado';
 return '<div class="ml-status">'+
  '<div><small>Envío automático</small><b>'+chip(c.enabled&&d.trigger,'Activo',c.enabled?'Activo · falta programar':'Pausado')+'</b></div>'+
  '<div><small>Próximo envío</small><b>'+esc(s.dirty?'Guarda para recalcular':next)+'</b></div>'+
  '<div><small>Destinatarios activos</small><b>'+c.recipients.filter(r=>r.active).length+'</b></div>'+
  '<div><small>Último envío</small><b>'+(d.log&&d.log[0]?fmtAt(d.log[0].at)+' '+(d.log[0].ok?'✓':'✗'):'Nunca')+'</b></div>'+
  '<div><small>Remitente</small><b>'+esc(d.sender||'Cuenta de Google del sistema')+'</b></div></div>';
}
function form(){
 const c=s.draft,k=K(),opt=(v,l,sel)=>'<option value="'+v+'"'+(String(v)===String(sel)?' selected':'')+'>'+esc(l)+'</option>';
 const days=[1,2,3,4,5,6,7].map(d=>opt(d,k.DIAS[d].replace(/^./,x=>x.toUpperCase()),c.weekday)).join('');
 const hours=Array.from({length:24},(_,h)=>opt(h,String(h).padStart(2,'0')+':00',c.hour)).join('');
 const freqs=Object.keys(k.FREQUENCIES).map(f=>opt(f,k.FREQUENCIES[f].label,c.frequency)).join('');
 const rows=c.recipients.map((r,i)=>'<tr><td><input data-ml-r="'+i+'" data-f="name" value="'+esc(r.name)+'" placeholder="Nombre" aria-label="Nombre"></td><td><input data-ml-r="'+i+'" data-f="email" type="email" value="'+esc(r.email)+'" placeholder="correo@dominio.cl" aria-label="Correo"></td><td class="ml-c"><input type="checkbox" data-ml-r="'+i+'" data-f="active" '+(r.active?'checked':'')+' aria-label="Activo"></td><td class="ml-c"><button class="lq-link" data-ml-del="'+i+'" aria-label="Quitar">Quitar</button></td></tr>').join('');
 return '<section class="oc-card ml-card"><p class="oc-eyebrow">CORREO GERENCIAL SEMANAL</p><h2>Configuración</h2>'+
  '<label class="ml-switch"><input type="checkbox" id="ml-enabled" '+(c.enabled?'checked':'')+'> <span>Enviar automáticamente</span></label>'+
  '<h3>Destinatarios</h3><table class="ml-recipients"><thead><tr><th>Nombre</th><th>Correo</th><th class="ml-c">Activo</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" class="lq-empty">Sin destinatarios todavía.</td></tr>')+'</tbody></table>'+
  '<button id="ml-add" class="ml-add">+ Agregar destinatario</button>'+
  '<h3>Cuándo</h3><div class="ml-grid3"><label>Frecuencia<select id="ml-freq">'+freqs+'</select></label><label>Día<select id="ml-day">'+days+'</select></label><label>Hora (Chile)<select id="ml-hour">'+hours+'</select></label></div>'+
  '<p class="ml-hint">Resume los '+(k.FREQUENCIES[c.frequency].weeks===1?'7 días':k.FREQUENCIES[c.frequency].weeks*7+' días')+' que terminan el día anterior al envío. Enviado un lunes, es la semana lunes a domingo anterior.</p>'+
  '<h3>Contenido</h3><label class="ml-block">Asunto<input id="ml-subject" value="'+esc(c.subject)+'" maxlength="120"></label>'+
  '<label class="ml-block">Tasa anual de costo de capital (%)<input id="ml-rate" type="number" min="0" max="100" step="0.5" value="'+esc(c.capitalRate)+'"><small class="ml-hint">Se cobra sobre la compra de cada auto propio por los días en stock. Se usa en «Utilidad después de capital» y en las alertas de precio. 0 = no considerar.</small></label>'+
  '<label class="ml-block">Mensaje al inicio (opcional)<textarea id="ml-note" rows="2" maxlength="600" placeholder="Ej.: Esta semana cerramos dos ventas importantes.">'+esc(c.note)+'</textarea></label>'+
  '<fieldset class="ml-sections"><legend>Secciones</legend>'+k.SECTIONS.map(([key,label])=>'<label><input type="checkbox" data-ml-sec="'+key+'" '+(c.sections[key]!==false?'checked':'')+'> '+esc(label)+'</label>').join('')+'<small>Los números del período (KPI) siempre van.</small></fieldset>'+
  '<div class="ml-actions"><button id="ml-save" class="ml-primary" '+(s.busy?'disabled':'')+'>'+(s.dirty?'Guardar cambios':'Guardado')+'</button><button id="ml-test" '+(s.busy?'disabled':'')+'>Enviar prueba a mí</button><button id="ml-all" '+(s.busy||s.dirty?'disabled':'')+' title="'+(s.dirty?'Guarda primero':'')+'">Enviar ahora a destinatarios</button></div>'+
  (s.message?'<p role="status" class="ml-msg '+(s.tone?'ml-'+s.tone:'')+'">'+esc(s.message)+'</p>':'')+'</section>';
}
function history(){
 const log=(s.data&&s.data.log)||[];
 const kind={AUTO:'Programado',MANUAL:'Manual',PRUEBA:'Prueba'};
 return '<section class="oc-card ml-card"><h2>Historial de envíos</h2>'+(!log.length?'<p class="lq-empty">Todavía no se ha enviado ningún correo.</p>':
  '<div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Destinatarios</th><th>Estado</th></tr></thead><tbody>'+log.map(e=>'<tr><td>'+fmtAt(e.at)+'</td><td>'+esc(kind[e.kind]||e.kind)+'</td><td>'+esc((e.to||[]).join(', '))+'</td><td>'+(e.ok?'<span class="oc-chip oc-chip-ok">Enviado</span>':'<span class="oc-chip oc-chip-bad">Error</span><small>'+esc(e.error)+'</small>')+'</td></tr>').join('')+'</tbody></table></div>')+'</section>';
}
// Vista previa: mismo motor y mismos datos que el envío (cargados al iniciar sesión).
function previewHtml(){
 try{
  const st=config.store&&config.store.state&&config.store.state();if(!st||!st.raw)return {error:'Los datos aún no están cargados.'};
  const today=config.store.today?config.store.today():new Date().toISOString().slice(0,10);
  const draft=Object.assign(clone(s.draft),{enabled:false});
  const m=K().build(st.raw,today,draft);return {html:m.html,subject:m.subject};
 }catch(e){return {error:e.message};}
}
function preview(){
 return '<section class="oc-card ml-card ml-preview"><div class="ml-preview-head"><div><p class="oc-eyebrow">VISTA PREVIA · ASÍ LLEGARÁ HOY</p><h2 id="ml-subj"></h2></div></div><iframe id="ml-frame" title="Vista previa del correo" sandbox="allow-same-origin allow-popups"></iframe></section>';
}
function paintPreview(el){
 const p=previewHtml(),f=el.querySelector('#ml-frame'),h=el.querySelector('#ml-subj');if(!f)return;
 h.textContent=p.error?'No se pudo armar la vista previa':p.subject;
 f.srcdoc=p.error?'<p style="font:14px system-ui;padding:20px;color:#a23e38">'+esc(p.error)+'</p>':p.html;
 f.onload=()=>{try{f.style.height=Math.max(600,f.contentDocument.documentElement.scrollHeight+20)+'px';}catch(e){}};
}
function draw(el){
 if(!s.draft){el.innerHTML='<section class="oc-card"><p>'+esc(s.message||'Cargando…')+'</p></section>';return;}
 el.innerHTML=status()+'<div class="ml-layout"><div>'+form()+history()+'</div>'+preview()+'</div>';
 wire(el);paintPreview(el);
}
function changed(el,redraw){s.dirty=true;s.message='';clearTimeout(timer);if(redraw){draw(el);return;}
 const b=el.querySelector('#ml-save');if(b)b.textContent='Guardar cambios';const a=el.querySelector('#ml-all');if(a)a.disabled=true;
 timer=setTimeout(()=>paintPreview(el),400);}
async function run(el,action,payload,ok){
 s.busy=true;s.message='Enviando…';s.tone='';draw(el);
 try{const data=await call(action,payload);const keep=action==='mailSend'&&s.dirty?clone(s.draft):null;take(data);if(keep){s.draft=keep;s.dirty=true;}s.message=data.warning||ok;s.tone=data.warning?'warn':'ok';}
 catch(e){s.message=e.message;s.tone='bad';try{const d=await call('mailLoad',{});s.data.log=d.log;}catch(_){}}
 s.busy=false;draw(el);
}
function validDraft(){try{return K().normalize(s.draft);}catch(e){s.message=e.message;s.tone='bad';return null;}}
function wire(el){
 const c=s.draft,$=q=>el.querySelector(q);
 $('#ml-enabled').onchange=e=>{c.enabled=e.target.checked;changed(el,true);};
 el.querySelectorAll('[data-ml-r]').forEach(i=>{const r=c.recipients[Number(i.dataset.mlR)],f=i.dataset.f;
  if(f==='active')i.onchange=()=>{r.active=i.checked;changed(el,true);};else i.oninput=()=>{r[f]=i.value;changed(el,false);};});
 el.querySelectorAll('[data-ml-del]').forEach(b=>b.onclick=()=>{c.recipients.splice(Number(b.dataset.mlDel),1);changed(el,true);});
 $('#ml-add').onclick=()=>{c.recipients.push({name:'',email:'',active:true});changed(el,true);const ins=el.querySelectorAll('[data-f="name"]');if(ins.length)ins[ins.length-1].focus();};
 $('#ml-freq').onchange=e=>{c.frequency=e.target.value;changed(el,true);};
 $('#ml-day').onchange=e=>{c.weekday=Number(e.target.value);changed(el,true);};
 $('#ml-hour').onchange=e=>{c.hour=Number(e.target.value);changed(el,true);};
 $('#ml-subject').oninput=e=>{c.subject=e.target.value;changed(el,false);};
 $('#ml-note').oninput=e=>{c.note=e.target.value;changed(el,false);};
 $('#ml-rate').oninput=e=>{c.capitalRate=e.target.value===''?0:Number(e.target.value);changed(el,false);};
 el.querySelectorAll('[data-ml-sec]').forEach(i=>i.onchange=()=>{c.sections[i.dataset.mlSec]=i.checked;changed(el,false);});
 $('#ml-save').onclick=()=>{if(!s.dirty)return;c.recipients=c.recipients.filter(r=>String(r.email||'').trim()||String(r.name||'').trim());const v=validDraft();if(!v){draw(el);return;}
  run(el,'mailSave',{config:v,expectedVersion:Number(s.data&&s.data.config&&s.data.config.version||0)},'Configuración guardada.');};
 $('#ml-test').onclick=()=>{const v=validDraft();if(!v){draw(el);return;}run(el,'mailSend',{to:'me',config:v},'Prueba enviada a '+((s.data&&s.data.me)||'tu correo')+'.');};
 $('#ml-all').onclick=()=>{const n=c.recipients.filter(r=>r.active).length;if(!n){s.message='No hay destinatarios activos.';s.tone='bad';draw(el);return;}
  if(!confirm('¿Enviar ahora el resumen a '+n+' destinatario'+(n===1?'':'s')+'?'))return;run(el,'mailSend',{to:'all'},'Correo enviado a '+n+' destinatario'+(n===1?'':'s')+'.');};
}
root.OCCorreos={setup,reset,markup,mount};
})(typeof globalThis==='undefined'?this:globalThis);
