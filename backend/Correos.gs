// Oportunicars · Correos gerenciales (solo Alex configura): destinatarios, frecuencia, día, hora y secciones.
// Archivo NUEVO en el proyecto Apps Script: 'Correos.gs'. Requiere también 'CorreoCore.gs' (= correo-core.js de la web)
// y que ocExtra_ (Atajo.gs) llame a ocMailExtra_. El correo se arma con OCCorreoCore.build(): el mismo código de la vista previa.
// Envío: un disparador cada hora (enviarCorreosProgramados) revisa si es el día y la hora configurados y si ya salió.
const OC_MAIL_CONFIG='OC_MAIL_CONFIG',OC_MAIL_LAST='OC_MAIL_LAST',OC_MAIL_LOG='OC_MAIL_LOG',OC_MAIL_HANDLER='enviarCorreosProgramados';
const OC_MAIL_TZ='America/Santiago';

function ocMailExtra_(p,actor){
 const actions=['mailLoad','mailSave','mailSend'];
 if(actions.indexOf(p.action)<0)return undefined;
 if(!ocIsAdminUser_(actor))throw Error('Correos: acceso solo para Alex.');
 if(p.action==='mailLoad')return ocMailState_(actor);
 if(p.action==='mailSave')return ocMailSave_(p,actor);
 if(p.action==='mailSend')return ocMailSendNow_(p,actor);
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
 return {config:cfg,last:last,log:ocMailJson_(OC_MAIL_LOG,[]),next:OCCorreoCore.nextRun(cfg,now,last),trigger:trigger,quota:quota,sender:sender,me:ocMailActorEmail_(actor),now:now};
}
function ocMailSave_(p,actor){
 const prior=ocMailConfig_();
 if(Number(prior.version||0)!==Number(p.expectedVersion||0))throw Error('La configuración de correos cambió. Recarga antes de guardar.');
 const cfg=OCCorreoCore.normalize(Object.assign({},p.config||{}));cfg.version=Number(prior.version||0)+1;
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
  MailApp.sendEmail({to:to.join(','),subject:(kind==='PRUEBA'?'[Prueba] ':'')+mail.subject,htmlBody:mail.html,body:mail.text,name:'Oportunicars'});
  entry.ok=true;
 }catch(e){entry.error=String(e&&e.message||e);}
 const log=ocMailJson_(OC_MAIL_LOG,[]);log.unshift(entry);ocMailProps_().setProperty(OC_MAIL_LOG,JSON.stringify(log.slice(0,30)));
 if(!entry.ok)throw Error('No se pudo enviar el correo: '+entry.error);
 return entry;
}
// Disparador horario: envía solo cuando corresponde (día, hora y frecuencia configurados; una vez por día).
function enviarCorreosProgramados(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(30000))return;
 try{
  const cfg=ocMailConfig_(),now=ocMailNow_(),last=ocMailJson_(OC_MAIL_LAST,null);
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
