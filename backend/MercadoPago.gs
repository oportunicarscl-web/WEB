// Mercado Pago: trae los pagos recibidos CON FECHA y completa la fecha de los movimientos ya cargados.
// Requiere la propiedad de script MP_ACCESS_TOKEN (Proyecto > Configuración > Propiedades del script).
// La API entrega date_approved (fecha del pago) y money_release_date (fecha en que el dinero queda disponible).
const OS_MP_API='https://api.mercadopago.com';
function osMpHeaders_(){return {Authorization:'Bearer '+ocProperty_('MP_ACCESS_TOKEN'),accept:'application/json'};}
function osMpDay_(iso){if(!iso)return '';const d=new Date(iso);return isNaN(d.getTime())?'':Utilities.formatDate(d,'America/Santiago','yyyy-MM-dd');}
function osMpProfile_(){
 const rows=osTable_('PERFILES_IMPORTACION').rows.filter(p=>ocProd_(p)&&p.habilitado==='SI'&&p.hoja_entrada==='MERCADO_PAGO');
 if(rows.length!==1)throw Error('Falta exactamente un perfil habilitado con hoja_entrada MERCADO_PAGO en PERFILES_IMPORTACION.');return rows[0];
}
// Fila canónica. Perfil sugerido (PERFILES_IMPORTACION):
//   modo_importe ABS_DIRECTION · formato_fecha YYYY-MM-DD · estado_efectivo LIQUIDADO
//   mapeo_json {"id":"id_evento","date":"fecha","amount":"monto","direction":"direccion","state":"estado","description":"descripcion","counterparty":"pagador","gross":"bruto","net":"neto","fee":"comision","directionValues":{"ENTRADA":"ENTRADA"}}
function osMpRow_(p,today){
 const day=osMpDay_(p.date_approved||p.date_created),release=osMpDay_(p.money_release_date);
 const fees=(p.fee_details||[]).reduce((s,f)=>s+Number(f.amount||0),0),net=p.transaction_details&&p.transaction_details.net_received_amount;
 // Un pago aprobado NO es dinero liquidado: solo se marca LIQUIDADO si ya pasó la fecha de liberación.
 const settled=p.status==='approved'&&release&&release<=today;
 return {id_evento:String(p.id),fecha:day,fecha_liberacion:release,monto:Math.round(Number(p.transaction_amount||0)),direccion:'ENTRADA',estado:settled?'LIQUIDADO':String(p.status||''),descripcion:String(p.description||p.payment_method_id||'Pago Mercado Pago'),pagador:p.payer&&p.payer.email?String(p.payer.email):'',bruto:Math.round(Number(p.transaction_amount||0)),neto:net===undefined?'':Math.round(Number(net)),comision:Math.round(fees)};
}
function osMpMe_(){const r=UrlFetchApp.fetch(OS_MP_API+'/users/me',{headers:osMpHeaders_(),muteHttpExceptions:true});if(r.getResponseCode()!==200)throw Error('Mercado Pago respondió '+r.getResponseCode()+' en /users/me');return String(JSON.parse(r.getContentText()).id);}
// La dirección se completa solo con evidencia: si mi cuenta es el cobrador es ENTRADA; si es el pagador, SALIDA. Si no, no se adivina.
function osMpDirection_(p,me){return String(p.collector_id)===me?'ENTRADA':(p.payer&&String(p.payer.id)===me?'SALIDA':'');}
function osMpSearch_(days){
 const out=[];let offset=0,total=1;
 while(offset<total&&offset<2000){
  const url=OS_MP_API+'/v1/payments/search?sort=date_created&criteria=desc&range=date_last_updated&begin_date=NOW-'+days+'DAYS&end_date=NOW&limit=50&offset='+offset;
  const r=UrlFetchApp.fetch(url,{headers:osMpHeaders_(),muteHttpExceptions:true});
  if(r.getResponseCode()!==200)throw Error('Mercado Pago respondió '+r.getResponseCode());
  const body=JSON.parse(r.getContentText());total=body.paging?body.paging.total:0;out.push.apply(out,body.results||[]);offset+=50;if(!(body.results||[]).length)break;
 }
 return out;
}
// Pagos nuevos de los últimos N días (por defecto 7; el disparador por hora llama sin argumento).
function osMpPull_(days){
 const profile=osMpProfile_(),today=Utilities.formatDate(new Date(),'America/Santiago','yyyy-MM-dd');
 const known={};ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS').rows.forEach(m=>{if(m.cuenta_id===profile.cuenta_id&&m.operacion_origen_id!=='')known[String(m.operacion_origen_id)]=true;});
 const fresh=osMpSearch_(typeof days==='number'&&days>0?days:7).filter(p=>!known[String(p.id)]).map(p=>osMpRow_(p,today)).filter(r=>r.fecha);
 const out={recibidos:fresh.length,agregados:0,repetidos:0,porRevisar:0};
 for(let i=0;i<fresh.length;i+=50){
  const r=osImport_({profileId:profile.perfil_id,profileVersion:Number(profile.version),rows:fresh.slice(i,i+50),offset:i,batch:'MP-API-'+today.replace(/-/g,'')},{manage:true,id:'MERCADO_PAGO_API'});
  out.agregados+=r.added;out.repetidos+=r.repeated;out.porRevisar+=r.review;
 }
 return out;
}
function traerPagosMercadoPago(days){
 const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('Otro proceso está en curso.');
 try{return osMpPull_(days);}finally{lock.releaseLock();}
}
// Completa fecha_operacion en los movimientos de Mercado Pago que no la tienen (los 426 provisionales) y, si la dirección está vacía,
// la completa con evidencia del propio pago. Hasta 100 por ejecución: repetir hasta que 'pendientes' sea 0. No cambia importe ni clasificación.
function completarFechasMercadoPago(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('Otro proceso está en curso.');
 try{
  const profile=osMpProfile_(),t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS');
  const missing=t.rows.filter(r=>ocProd_(r)&&r.cuenta_id===profile.cuenta_id&&!osDate_(osClean_(r).fecha_operacion)&&String(r.operacion_origen_id||'')!=='');
  const batch=missing.slice(0,100),now=new Date().toISOString(),me=osMpMe_();let updated=0,failed=0,directions=0;
  const responses=UrlFetchApp.fetchAll(batch.map(r=>({url:OS_MP_API+'/v1/payments/'+encodeURIComponent(String(r.operacion_origen_id)),headers:osMpHeaders_(),muteHttpExceptions:true})));
  responses.forEach((res,i)=>{
   if(res.getResponseCode()!==200){failed++;return;}
   const p=JSON.parse(res.getContentText()),iso=p.date_approved||p.date_created,day=osMpDay_(iso);if(!day){failed++;return;}
   const patch={fecha_operacion:day,version:Number(batch[i].version||1)+1},dir=osMpDirection_(p,me);
   [['fecha_original',iso],['updated_at',now],['updated_by','SISTEMA_MP']].forEach(x=>{if(t.headers.indexOf(x[0])>=0)patch[x[0]]=x[1];});
   if(!batch[i].direccion&&dir){patch.direccion=dir;directions++;}
   ocPatchRow_(t,batch[i]._row,patch);updated++;
  });
  return {actualizados:updated,direccionesCompletadas:directions,fallidos:failed,pendientes:missing.length-updated};
 }finally{lock.releaseLock();}
}
// Completa la dirección de los movimientos de Mercado Pago que no la traen, solo donde el tipo de operación la prueba:
// account_fund (depósito a la cuenta) y pos_payment (venta presencial) son ENTRADA. El resto se define al clasificar en la web.
function osMpDirections_(){
 const profile=osMpProfile_(),t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),now=new Date().toISOString();let done=0;
 t.rows.filter(r=>ocProd_(r)&&r.cuenta_id===profile.cuenta_id&&!r.direccion&&['account_fund','pos_payment'].indexOf(String(r.tipo_fuente))>=0&&String(r.estado_fuente||'approved')==='approved').forEach(r=>{
  const patch={direccion:'ENTRADA',version:Number(r.version||1)+1};if(t.headers.indexOf('updated_at')>=0)patch.updated_at=now;if(t.headers.indexOf('updated_by')>=0)patch.updated_by='SISTEMA_MP';
  ocPatchRow_(t,r._row,patch);done++;
 });
 return {direccionesCompletadas:done};
}
function completarDireccionesMercadoPago(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('Otro proceso está en curso.');
 try{return osMpDirections_();}finally{lock.releaseLock();}
}
// Botón «Actualizar Mercado Pago» de la web (el router ya tiene el candado). Solo administradores.
function osMpSync_(p,actor){
 if(!actor||!actor.manage)throw Error('Acceso restringido.');
 if(!PropertiesService.getScriptProperties().getProperty('MP_ACCESS_TOKEN'))throw Error('Falta el token de Mercado Pago (propiedad MP_ACCESS_TOKEN).');
 const days=Math.min(30,Math.max(1,Math.floor(Number(p.days)||7))),r=osMpPull_(days),d=osMpDirections_();
 PropertiesService.getScriptProperties().setProperty('OC_MP_LAST_SYNC',new Date().toISOString());
 return {dias:days,recibidos:r.recibidos,agregados:r.agregados,repetidos:r.repetidos,porRevisar:r.porRevisar,direccionesCompletadas:d.direccionesCompletadas,at:new Date().toISOString()};
}
function activarPagosMercadoPago(){if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='traerPagosMercadoPago'))ScriptApp.newTrigger('traerPagosMercadoPago').timeBased().everyHours(1).create();return {programada:true};}
