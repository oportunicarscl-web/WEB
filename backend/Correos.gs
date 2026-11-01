// Oportunicars · Correos gerenciales (solo Alex configura): destinatarios, frecuencia, día, hora y secciones.
// Archivo NUEVO en el proyecto Apps Script: 'Correos.gs'. Requiere también 'CorreoCore.gs' (= correo-core.js de la web)
// y que ocExtra_ (Atajo.gs) llame a ocMailExtra_. El correo se arma con OCCorreoCore.build(): el mismo código de la vista previa.
// Envío: un disparador cada hora (enviarCorreosProgramados) revisa si es el día y la hora configurados y si ya salió.
// Canales: GMAIL (MailApp, cuenta Google dueña del script) o LARK (API de Lark Mail con la cuenta Lark que Alex conecte).
// Onboarding desde la web: «Autorizar Gmail» usa el enlace de autorización del script; Lark usa OAuth y vuelve a doGet.
const OC_MAIL_CONFIG='OC_MAIL_CONFIG',OC_MAIL_LAST='OC_MAIL_LAST',OC_MAIL_LOG='OC_MAIL_LOG',OC_MAIL_HANDLER='enviarCorreosProgramados';
const OC_MAIL_TZ='America/Santiago',OC_LARK='OC_LARK_MAIL',OC_LARK_SCOPE='mail:user_mailbox.message:send offline_access';

function ocMailExtra_(p,actor){
 const actions=['mailLoad','mailSave','mailSend','mailLarkSave','mailLarkStart','mailLarkDisconnect'];
 if(actions.indexOf(p.action)<0)return undefined;
 if(!ocIsAdminUser_(actor))throw Error('Correos: acceso solo para Alex.');
 if(p.action==='mailLoad')return ocMailState_(actor);
 if(p.action==='mailSave')return ocMailSave_(p,actor);
 if(p.action==='mailSend')return ocMailSendNow_(p,actor);
 if(p.action==='mailLarkSave')return ocLarkSave_(p,actor);
 if(p.action==='mailLarkStart')return ocLarkStart_(actor,p);
 if(p.action==='mailLarkDisconnect'){const l=ocLarkGet_();osAudit_(actor,'CORREOS_LARK_DESCONECTAR','PROPIEDADES',OC_LARK,{cuenta:l.account||''});['access','accessExp','refresh','refreshExp','account','connectedAt','refreshedAt'].forEach(k=>delete l[k]);ocLarkPut_(l);return ocMailState_(actor);}
}
function ocMailProps_(){return PropertiesService.getScriptProperties();}
function ocMailJson_(key,fallback){try{const v=ocMailProps_().getProperty(key);return v?JSON.parse(v):fallback;}catch(e){return fallback;}}
// Configuración guardada (si algo quedó inválido, vuelve a los valores por defecto sin activar envíos).
function ocMailConfig_(){
 const raw=ocMailJson_(OC_MAIL_CONFIG,null);if(!raw)return OCCorreoCore.defaults();
 try{return OCCorreoCore.normalize(raw);}catch(e){const d=OCCorreoCore.defaults();d.version=Number(raw.version)||0;return d;}
}
function ocMailNow_(){const d=new Date();return {day:Utilities.formatDate(d,OC_MAIL_TZ,'yyyy-MM-dd'),hour:Number(Utilities.formatDate(d,OC_MAIL_TZ,'H'))};}
function ocMailTrigger_(){return ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()===OC_MAIL_HANDLER);}
// Crea el disparador horario si falta. Devuelve null o el motivo por el que no se pudo (p. ej. permisos aún no autorizados).
function ocMailEnsureTrigger_(){
 try{if(!ocMailTrigger_())ScriptApp.newTrigger(OC_MAIL_HANDLER).timeBased().everyHours(1).create();return null;}
 catch(e){return 'No se pudo programar el envío automático: ejecuta activarCorreosSemanales() una vez desde el editor de Apps Script. ('+e.message+')';}
}
function ocMailState_(actor){
 const cfg=ocMailConfig_(),last=ocMailJson_(OC_MAIL_LAST,null),now=ocMailNow_();
 let trigger=false,quota=null,sender='';
 try{trigger=ocMailTrigger_();}catch(e){}
 try{quota=MailApp.getRemainingDailyQuota();}catch(e){}
 try{sender=Session.getEffectiveUser().getEmail();}catch(e){}
 return {config:cfg,last:last,log:ocMailJson_(OC_MAIL_LOG,[]),next:OCCorreoCore.nextRun(cfg,now,last),trigger:trigger,quota:quota,sender:sender,me:ocMailActorEmail_(actor),now:now,channels:ocMailChannels_()};
}
function ocMailSave_(p,actor){
 const prior=ocMailConfig_();
 if(Number(prior.version||0)!==Number(p.expectedVersion||0))throw Error('La configuración de correos cambió. Recarga antes de guardar.');
 const cfg=OCCorreoCore.normalize(Object.assign({},p.config||{}));cfg.version=Number(prior.version||0)+1;
 if(cfg.enabled&&cfg.channel==='LARK'&&!ocLarkGet_().refresh)throw Error('Conecta la cuenta Lark antes de activar el envío por Lark.');
 osAudit_(actor,'CORREOS_CONFIG','PROPIEDADES',OC_MAIL_CONFIG,{antes:prior,despues:cfg});
 ocMailProps_().setProperty(OC_MAIL_CONFIG,JSON.stringify(cfg));
 const state=ocMailState_(actor);
 if(cfg.enabled){const err=ocMailEnsureTrigger_();if(err)state.warning=err;else state.trigger=true;}
 return state;
}
function ocMailActorEmail_(actor){
 const rows=ocTable_('OC_MAESTROS_ID','USUARIOS').rows.filter(r=>ocProd_(r)&&r.auth_user_id===actor.id);
 return rows.length===1?String(rows[0].email||'').trim().toLowerCase():'';
}
// Enviar ahora: a mí (prueba, puede usar la configuración que se está editando) o a los destinatarios guardados.
function ocMailSendNow_(p,actor){
 let cfg,to;
 if(p.to==='me'){
  cfg=OCCorreoCore.normalize(Object.assign({},p.config||ocMailConfig_(),{enabled:false}));
  const me=ocMailActorEmail_(actor);if(!me)throw Error('No encontré tu correo en USUARIOS.');to=[me];
 }else if(p.to==='all'){
  cfg=ocMailConfig_();to=cfg.recipients.filter(r=>r.active).map(r=>r.email);
  if(!to.length)throw Error('No hay destinatarios activos guardados.');
 }else throw Error('Destino inválido.');
 ocMailDeliver_(cfg,to,p.to==='me'?'PRUEBA':'MANUAL',actor.name||actor.id);
 return ocMailState_(actor);
}
// Arma el correo con los datos actuales y lo envía. Registra el resultado (también si falla) y lo relanza.
function ocMailDeliver_(cfg,to,kind,by){
 const entry={at:new Date().toISOString(),day:ocMailNow_().day,kind:kind,by:String(by||''),to:to,subject:'',ok:false,error:''};
 try{
  const loaded=osLoad_({id:'correos',name:'sistema'}),D=OCCorreoCore.prepare(loaded);
  const mail=OCCorreoCore.build(D,ocToday_(),cfg);entry.subject=mail.subject;
  const subject=(kind==='PRUEBA'?'[Prueba] ':'')+mail.subject;entry.channel=cfg.channel||'GMAIL';
  if(entry.channel==='LARK')ocLarkSend_(to,subject,mail.html,mail.text);
  else MailApp.sendEmail({to:to.join(','),subject:subject,htmlBody:mail.html,body:mail.text,name:'Oportunicars'});
  entry.ok=true;
 }catch(e){entry.error=String(e&&e.message||e);if(/script\.send_mail|permiso para llamar a MailApp|permission to call MailApp/i.test(entry.error))entry.error='Falta autorizar Gmail: en Correos › Canal de envío pulsa «Autorizar Gmail» con la cuenta dueña del sistema.';}
 const log=ocMailJson_(OC_MAIL_LOG,[]);log.unshift(entry);ocMailProps_().setProperty(OC_MAIL_LOG,JSON.stringify(log.slice(0,30)));
 if(!entry.ok)throw Error('No se pudo enviar el correo: '+entry.error);
 return entry;
}
// Disparador horario: envía solo cuando corresponde (día, hora y frecuencia configurados; una vez por día).
function enviarCorreosProgramados(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(30000))return;
 try{
  const cfg=ocMailConfig_(),now=ocMailNow_(),last=ocMailJson_(OC_MAIL_LAST,null);
  // Lark: mantiene viva la conexión renovando el token cada 2 días aunque no toque enviar (el refresh token vence si no se usa).
  if(cfg.channel==='LARK'){try{const l=ocLarkGet_();if(l.refresh&&Date.now()-Number(l.refreshedAt||0)>2*86400000)ocLarkAccess_(true);}catch(e){}}
  if(!OCCorreoCore.due(cfg,now,last))return {enviado:false};
  // Se marca antes de enviar: si falla, queda en el historial y no se reintenta cada hora.
  ocMailProps_().setProperty(OC_MAIL_LAST,JSON.stringify({day:now.day,at:new Date().toISOString()}));
  try{ocMailDeliver_(cfg,cfg.recipients.filter(r=>r.active).map(r=>r.email),'AUTO','programado');return {enviado:true};}
  catch(e){return {enviado:false,error:e.message};}
 }finally{lock.releaseLock();}
}
// Ejecutar UNA vez desde el editor: autoriza el envío de correos y deja el disparador horario.
function activarCorreosSemanales(){
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===OC_MAIL_HANDLER).forEach(t=>ScriptApp.deleteTrigger(t));
 ScriptApp.newTrigger(OC_MAIL_HANDLER).timeBased().everyHours(1).create();
 return {programado:true,cuota_diaria:MailApp.getRemainingDailyQuota(),remitente:Session.getEffectiveUser().getEmail(),config:ocMailConfig_()};
}
// Vista del correo sin enviarlo (desde el editor): devuelve asunto y tamaño, útil para diagnosticar.
function probarCorreoSemanal(){
 const D=OCCorreoCore.prepare(osLoad_({id:'correos',name:'sistema'})),m=OCCorreoCore.build(D,ocToday_(),ocMailConfig_());
 return {asunto:m.subject,periodo:m.period,bytes:m.html.length,texto:m.text};
}

// ---------- Canales de envío ----------
function ocMailRedirect_(){try{return String(ScriptApp.getService().getUrl()||'').replace(/\/dev$/,'/exec');}catch(e){return '';}}
// Estado de cada canal para la pantalla de Correos. Nunca devuelve el App Secret ni los tokens.
function ocMailChannels_(){
 const gmail={authorized:null,url:''};
 try{const info=ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);gmail.authorized=info.getAuthorizationStatus()===ScriptApp.AuthorizationStatus.NOT_REQUIRED;if(!gmail.authorized)gmail.url=String(info.getAuthorizationUrl()||'');}catch(e){gmail.error=String(e.message||e);}
 try{gmail.sender=Session.getEffectiveUser().getEmail();}catch(e){}
 const l=ocLarkGet_();
 return {gmail:gmail,lark:{appId:l.appId||'',hasSecret:!!l.secret,secretEnd:l.secret?String(l.secret).slice(-4):'',domain:l.domain||'larksuite',connected:!!l.refresh,account:l.account||'',connectedAt:l.connectedAt||'',refreshExp:l.refreshExp||null,redirectUri:ocMailRedirect_(),scope:OC_LARK_SCOPE}};
}
function ocLarkGet_(){return ocMailJson_(OC_LARK,{});}
function ocLarkPut_(x){ocMailProps_().setProperty(OC_LARK,JSON.stringify(x));}
function ocLarkHosts_(d){return d==='feishu'?{auth:'https://accounts.feishu.cn',api:'https://open.feishu.cn'}:{auth:'https://accounts.larksuite.com',api:'https://open.larksuite.com'};}
// Paso 1: credenciales de la app personalizada de Lark (App ID + App Secret). El secret solo se reemplaza si viene uno nuevo.
function ocLarkSave_(p,actor){
 const l=ocLarkGet_(),appId=String(p.appId||'').trim(),secret=String(p.appSecret||'').trim(),domain=p.domain==='feishu'?'feishu':'larksuite';
 if(!/^cli_[A-Za-z0-9]{6,40}$/.test(appId))throw Error('App ID inválido (empieza con cli_).');
 if(secret&&!/^[A-Za-z0-9]{16,80}$/.test(secret))throw Error('App Secret inválido.');
 if(!secret&&!l.secret)throw Error('Falta el App Secret.');
 const changed=appId!==l.appId||domain!==l.domain||!!secret;
 const next=changed?{appId:appId,domain:domain,secret:secret||l.secret}:l;
 osAudit_(actor,'CORREOS_LARK_APP','PROPIEDADES',OC_LARK,{appId:appId,domain:domain,secretCambiado:!!secret,desconecta:changed&&!!l.refresh});
 ocLarkPut_(next);return ocMailState_(actor);
}
// Paso 2: enlace de autorización de Lark. Vuelve a este mismo web app (doGet) con code y state.
// La URL de retorno es la del web app que usa la web (la envía el navegador); debe estar registrada tal cual en la app de Lark.
function ocLarkStart_(actor,p){
 const l=ocLarkGet_();if(!l.appId||!l.secret)throw Error('Primero guarda el App ID y el App Secret de Lark.');
 const sent=String(p&&p.redirect||''),redirect=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(sent)?sent:ocMailRedirect_();if(!redirect)throw Error('No pude obtener la URL del web app para el retorno de Lark.');
 l.state=Utilities.getUuid();l.stateExp=Date.now()+15*60000;l.redirect=redirect;l.stateBy=actor.id;ocLarkPut_(l);
 const q={client_id:l.appId,redirect_uri:redirect,scope:OC_LARK_SCOPE,state:l.state};
 return {url:ocLarkHosts_(l.domain).auth+'/open-apis/authen/v1/authorize?'+Object.keys(q).map(k=>k+'='+encodeURIComponent(q[k])).join('&')};
}
function ocLarkToken_(l,body){
 const r=UrlFetchApp.fetch(ocLarkHosts_(l.domain).api+'/open-apis/authen/v2/oauth/token',{method:'post',contentType:'application/json; charset=utf-8',payload:JSON.stringify(Object.assign({client_id:l.appId,client_secret:l.secret},body)),muteHttpExceptions:true});
 let j={};try{j=JSON.parse(r.getContentText());}catch(e){}
 if(j.code!==0||!j.access_token){const err=Error('Lark: '+(j.error_description||j.msg||j.error||('HTTP '+r.getResponseCode()))+(j.code?' ('+j.code+')':''));err.larkCode=j.code;throw err;}
 const now=Date.now();l.access=j.access_token;l.accessExp=now+Number(j.expires_in||7200)*1000;
 if(j.refresh_token){l.refresh=j.refresh_token;l.refreshExp=now+Number(j.refresh_token_expires_in||0)*1000;}
 l.refreshedAt=now;return l;
}
// Retorno de Lark al web app (doGet ?code=&state=). Devuelve una página o null si la petición no es de Lark.
function ocMailCallback_(e){
 const q=e&&e.parameter||{};if(!q.state||!(q.code||q.error))return null;
 const l=ocLarkGet_();
 if(!l.state||q.state!==l.state||Date.now()>Number(l.stateExp||0))return ocMailPage_('No se pudo conectar Lark','El enlace venció o no corresponde. Vuelve a Correos y pulsa «Conectar cuenta Lark» otra vez.',false);
 delete l.state;delete l.stateExp;
 if(q.error){ocLarkPut_(l);return ocMailPage_('Conexión cancelada','Lark no autorizó el acceso ('+String(q.error).slice(0,60)+'). Puedes intentarlo de nuevo desde Correos.',false);}
 try{
  ocLarkToken_(l,{grant_type:'authorization_code',code:String(q.code),redirect_uri:l.redirect});
  if(!l.refresh)throw Error('Lark no entregó refresh token: agrega el permiso offline_access y activa «Refresh user_access_token» en la app, publica una versión y vuelve a conectar.');
  let account='';
  try{const r=JSON.parse(UrlFetchApp.fetch(ocLarkHosts_(l.domain).api+'/open-apis/authen/v1/user_info',{headers:{Authorization:'Bearer '+l.access},muteHttpExceptions:true}).getContentText());const d=r&&r.data||{};account=d.enterprise_email||d.email||d.name||'';}catch(err){}
  l.account=account;l.connectedAt=new Date().toISOString();ocLarkPut_(l);
  try{osAudit_({id:l.stateBy||'lark'},'CORREOS_LARK_CONECTAR','PROPIEDADES',OC_LARK,{cuenta:account});}catch(err){}
  return ocMailPage_('Lark conectado','Los correos saldrán desde '+(account||'la cuenta Lark autorizada')+'. Ya puedes cerrar esta ventana y volver a Correos.',true);
 }catch(err){ocLarkPut_(l);return ocMailPage_('No se pudo conectar Lark',String(err.message||err),false);}
}
function ocMailPage_(title,text,ok){
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return HtmlService.createHtmlOutput('<div style="font:15px/1.6 -apple-system,Segoe UI,sans-serif;background:#f6efe3;color:#3b2f21;min-height:100vh;padding:48px 20px;box-sizing:border-box"><div style="max-width:460px;margin:auto;background:#fffdf8;border:1px solid #e3d6bf;border-radius:14px;padding:28px"><div style="font:700 24px/1 sans-serif;letter-spacing:-1px">oportuni<span style="color:#8c6d3f">cars</span></div><h2 style="margin:22px 0 8px;color:'+(ok?'#1c7a47':'#a23e38')+'">'+esc(title)+'</h2><p>'+esc(text)+'</p></div></div>').setTitle('Oportunicars · Correos');
}
// Token de usuario vigente; lo renueva si vence en menos de 5 minutos (o si force). El refresh token rota en cada uso.
function ocLarkAccess_(force){
 const l=ocLarkGet_();if(!l.refresh)throw Error('Lark no está conectado: conéctalo en Correos › Canal de envío.');
 if(!force&&l.access&&Number(l.accessExp||0)-Date.now()>5*60000)return {l:l,token:l.access};
 try{ocLarkToken_(l,{grant_type:'refresh_token',refresh_token:l.refresh});ocLarkPut_(l);return {l:l,token:l.access};}
 catch(e){if([20037,20064,20073,20074].indexOf(e.larkCode)>=0){['access','accessExp','refresh','refreshExp'].forEach(k=>delete l[k]);ocLarkPut_(l);throw Error('La conexión con Lark venció o fue revocada: vuelve a conectar la cuenta en Correos. '+e.message);}throw e;}
}
function ocLarkSend_(to,subject,html,text){
 const a=ocLarkAccess_(false);
 const r=UrlFetchApp.fetch(ocLarkHosts_(a.l.domain).api+'/open-apis/mail/v1/user_mailboxes/me/messages/send',{method:'post',contentType:'application/json; charset=utf-8',headers:{Authorization:'Bearer '+a.token},
  payload:JSON.stringify({subject:subject,to:to.map(x=>({mail_address:x})),body_html:html,body_plain_text:text,head_from:{name:'Oportunicars'}}),muteHttpExceptions:true});
 let j={};try{j=JSON.parse(r.getContentText());}catch(e){}
 if(j.code!==0)throw Error('Lark Mail: '+(j.msg||('HTTP '+r.getResponseCode()))+(j.code?' ('+j.code+')':''));
 return j.data;
}
