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
  channel()+
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
// Canal de envío y su puesta en marcha (onboarding) sin salir de Correos.
const endpoint=()=>(root.OCGoogleConfig&&root.OCGoogleConfig.endpoint)||'';
function channel(){
 const c=s.draft,ch=(s.data&&s.data.channels)||{},g=ch.gmail||{},l=ch.lark||{},lark=c.channel==='LARK';
 const opt=(v,label,sub)=>'<label class="ml-ch'+(c.channel===v?' ml-ch-on':'')+'"><input type="radio" name="ml-channel" value="'+v+'" '+(c.channel===v?'checked':'')+'><span><b>'+label+'</b><small>'+sub+'</small></span></label>';
 let body='';
 if(!lark){
  body='<div class="ml-step"><p>'+(g.authorized?'<span class="oc-chip oc-chip-ok">Autorizado</span> ':'<span class="oc-chip oc-chip-warn">Falta autorizar</span> ')+'Los correos salen desde <b>'+esc(g.sender||'la cuenta Google dueña del sistema')+'</b> (máx. ~100 destinatarios al día).</p>'+
   (g.authorized?'':'<ol><li>Pulsa <b>Autorizar Gmail</b>. Se abre Google en otra pestaña.</li><li>Entra con <b>'+esc(g.sender||'la cuenta dueña del sistema')+'</b> (si estás con otra cuenta, cámbiala ahí).</li><li>Acepta los permisos y vuelve aquí: pulsa <b>Comprobar</b>.</li></ol>'+
   '<div class="ml-actions"><button id="ml-gauth" class="ml-primary" '+(g.url?'':'disabled title="Google no entregó el enlace: ejecuta activarCorreosSemanales() en el editor"')+'>Autorizar Gmail</button><button id="ml-check">Comprobar</button></div>')+
   (g.error?'<p class="ml-hint">'+esc(g.error)+'</p>':'')+'</div>';
 }else{
  const redirect=endpoint()||l.redirectUri||'';
  body='<div class="ml-step"><p class="ml-step-t"><span>1</span> Crea la app en Lark</p><ol><li>En <a href="'+(l.domain==='feishu'?'https://open.feishu.cn/app':'https://open.larksuite.com/app')+'" target="_blank" rel="noopener">Lark Developer</a> crea una <b>app personalizada</b> (Custom App).</li>'+
   '<li>En <b>Permisos</b> agrega <code>mail:user_mailbox.message:send</code> y <code>offline_access</code>.</li>'+
   '<li>En <b>Seguridad › Redirect URLs</b> agrega esta URL exacta: <span class="ml-copy"><code id="ml-redirect">'+esc(redirect)+'</code><button id="ml-copy" type="button">Copiar</button></span></li>'+
   '<li>Activa <b>Refresh user_access_token</b> y publica una versión de la app (la aprueba el admin de Lark).</li></ol></div>'+
   '<div class="ml-step"><p class="ml-step-t"><span>2</span> Credenciales de la app</p><div class="ml-grid3 ml-lark"><label>App ID<input id="ml-lapp" value="'+esc(l.appId||'')+'" placeholder="cli_…" autocomplete="off"></label>'+
   '<label>App Secret<input id="ml-lsec" type="password" autocomplete="new-password" placeholder="'+(l.hasSecret?'Guardado ••••'+esc(l.secretEnd||''):'Pega el App Secret')+'"></label>'+
   '<label>Región<select id="ml-ldom"><option value="larksuite"'+(l.domain!=='feishu'?' selected':'')+'>Lark (larksuite.com)</option><option value="feishu"'+(l.domain==='feishu'?' selected':'')+'>Feishu (feishu.cn)</option></select></label></div>'+
   '<div class="ml-actions"><button id="ml-lsave">Guardar credenciales</button></div><p class="ml-hint">El App Secret queda guardado en Google y no se vuelve a mostrar.</p></div>'+
   '<div class="ml-step"><p class="ml-step-t"><span>3</span> Conecta la cuenta que envía</p>'+(l.connected?'<p><span class="oc-chip oc-chip-ok">Conectado</span> Envía como <b>'+esc(l.account||'cuenta Lark')+'</b>'+(l.connectedAt?' · desde '+esc(new Date(l.connectedAt).toLocaleDateString('es-CL')):'')+'</p><div class="ml-actions"><button id="ml-lconn">Reconectar</button><button id="ml-ldisc">Desconectar</button><button id="ml-check">Comprobar</button></div>':
   '<p>Entra con la cuenta Lark desde la que saldrán los correos (por ejemplo, una de @oportunicars.cl) y acepta.</p><div class="ml-actions"><button id="ml-lconn" class="ml-primary" '+(l.appId&&l.hasSecret?'':'disabled title="Guarda primero las credenciales"')+'>Conectar cuenta Lark</button><button id="ml-check">Comprobar</button></div>')+'</div>';
 }
 return '<h3>Canal de envío</h3><div class="ml-channels">'+opt('GMAIL','Gmail','Cuenta Google del sistema · sin configuración extra')+opt('LARK','Lark Mail','Desde una cuenta Lark de la empresa')+'</div>'+body;
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
// Abre la ventana antes de esperar a Google (si no, el navegador la bloquea) y luego le pone la dirección.
async function openAuth(el,action,payload){
 const w=window.open('about:blank','_blank');
 try{const r=action?await call(action,payload):{url:payload};if(!r.url)throw Error('No llegó el enlace de autorización.');if(w)w.location=r.url;else location.assign(r.url);s.message='Termina la autorización en la otra pestaña y luego pulsa «Comprobar».';s.tone='';}
 catch(e){if(w)w.close();s.message=e.message;s.tone='bad';}
 draw(el);
}
async function recheck(el){s.busy=true;draw(el);try{const d=await call('mailLoad',{});const keep=s.dirty?clone(s.draft):null;take(d);if(keep){s.draft=keep;s.dirty=true;}const ch=d.channels||{};const ok=s.draft.channel==='LARK'?ch.lark&&ch.lark.connected:ch.gmail&&ch.gmail.authorized;s.message=ok?'Canal listo para enviar.':'Todavía no aparece autorizado.';s.tone=ok?'ok':'warn';}catch(e){s.message=e.message;s.tone='bad';}s.busy=false;draw(el);}
async function run(el,action,payload,ok){
 s.busy=true;s.message=action==='mailSend'?'Enviando…':'Guardando…';s.tone='';draw(el);
 try{const data=await call(action,payload);const keep=action!=='mailSave'&&s.dirty?clone(s.draft):null;take(data);if(keep){s.draft=keep;s.dirty=true;}s.message=data.warning||ok;s.tone=data.warning?'warn':'ok';}
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
 el.querySelectorAll('[name="ml-channel"]').forEach(r=>r.onchange=()=>{c.channel=r.value;changed(el,true);});
 const on=(q,f)=>{const b=el.querySelector(q);if(b)b.onclick=f;};
 on('#ml-gauth',()=>{const u=s.data&&s.data.channels&&s.data.channels.gmail&&s.data.channels.gmail.url;if(u)openAuth(el,null,u);});
 el.querySelectorAll('#ml-check').forEach(b=>b.onclick=()=>recheck(el));
 on('#ml-copy',()=>{const t=el.querySelector('#ml-redirect').textContent;try{navigator.clipboard.writeText(t);s.message='URL copiada.';s.tone='ok';}catch(e){}draw(el);});
 on('#ml-lsave',()=>{const appId=el.querySelector('#ml-lapp').value,appSecret=el.querySelector('#ml-lsec').value,domain=el.querySelector('#ml-ldom').value;
  run(el,'mailLarkSave',{appId,appSecret,domain},'Credenciales de Lark guardadas.');});
 on('#ml-lconn',()=>openAuth(el,'mailLarkStart',{redirect:endpoint()}));
 on('#ml-ldisc',()=>{if(confirm('¿Desconectar la cuenta Lark? Los correos por Lark dejarán de salir hasta reconectar.'))run(el,'mailLarkDisconnect',{},'Lark desconectado.');});
 $('#ml-all').onclick=()=>{const n=c.recipients.filter(r=>r.active).length;if(!n){s.message='No hay destinatarios activos.';s.tone='bad';draw(el);return;}
  if(!confirm('¿Enviar ahora el resumen a '+n+' destinatario'+(n===1?'':'s')+'?'))return;run(el,'mailSend',{to:'all'},'Correo enviado a '+n+' destinatario'+(n===1?'':'s')+'.');};
}
root.OCCorreos={setup,reset,markup,mount};
})(typeof globalThis==='undefined'?this:globalThis);
