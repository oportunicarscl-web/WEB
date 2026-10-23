// Oportunicars · Sincronización de Mercado Pago (botón ⟳ junto al saldo total y disparador por hora).
// Sin perfiles de importación: escribe directo en MOVIMIENTOS_BANCARIOS (importe confirmado, dirección explícita).
//  fase 'iniciar': pagos APROBADOS (/v1/payments/search, cobros y pagos) desde el último movimiento de MP −3 días + pide el reporte de liberaciones.
//  fase 'revisar': descarga el reporte listo y agrega lo que no está: retiros (payout), y rellena fecha/dirección de filas antiguas. Entrega el saldo real.
// Errores de token salen con prefijo «TOKEN:» (la web abre el cuadro de claves, solo Alex).
function osMpProp_(k){return PropertiesService.getScriptProperties().getProperty(k)||'';}
function osMpSet_(k,v){PropertiesService.getScriptProperties().setProperty(k,v);}
function osMpRefresh_(){
 const id=osMpProp_('MP_CLIENT_ID'),sec=osMpProp_('MP_CLIENT_SECRET');if(!id||!sec)return false;
 const r=UrlFetchApp.fetch(OS_MP_API+'/oauth/token',{method:'post',contentType:'application/json',payload:JSON.stringify({client_id:id,client_secret:sec,grant_type:'client_credentials'}),muteHttpExceptions:true});
 if(r.getResponseCode()!==200)return false;const t=JSON.parse(r.getContentText()).access_token;if(!t)return false;osMpSet_('MP_ACCESS_TOKEN',t);return true;
}
function osMpFetch_(path,opt,retry){
 const token=osMpProp_('MP_ACCESS_TOKEN');if(!token)throw Error('TOKEN: falta el token de Mercado Pago.');
 const o=Object.assign({muteHttpExceptions:true},opt||{});o.headers=Object.assign({Authorization:'Bearer '+token,accept:'application/json'},o.headers||{});
 const r=UrlFetchApp.fetch(path.indexOf('http')===0?path:OS_MP_API+path,o);const c=r.getResponseCode();
 if(c===401&&!retry&&osMpRefresh_())return osMpFetch_(path,opt,true);
 if(c===401)throw Error('TOKEN: Mercado Pago rechazó el token (venció o es inválido).');
 return r;
}
function osMpJson_(path,opt){const r=osMpFetch_(path,opt);if(r.getResponseCode()>=300)throw Error('Mercado Pago respondió '+r.getResponseCode()+' en '+path.split('?')[0]);return JSON.parse(r.getContentText());}
function osMpMeId_(){return String(osMpJson_('/users/me').id);}
function osMpSaveToken_(p,actor){
 if(!actor||!actor.manage||!ocIsAdminUser_(actor))throw Error('Solo Alex puede guardar las claves de Mercado Pago.');
 const at=String(p.accessToken||'').trim();if(!/^[A-Za-z0-9_-]{20,}$/.test(at))throw Error('El Access Token no parece válido.');
 const r=UrlFetchApp.fetch(OS_MP_API+'/users/me',{headers:{Authorization:'Bearer '+at,accept:'application/json'},muteHttpExceptions:true});
 if(r.getResponseCode()!==200)throw Error('Mercado Pago rechazó ese Access Token ('+r.getResponseCode()+').');
 osMpSet_('MP_ACCESS_TOKEN',at);
 [['publicKey','MP_PUBLIC_KEY'],['clientId','MP_CLIENT_ID'],['clientSecret','MP_CLIENT_SECRET']].forEach(x=>{const v=String(p[x[0]]||'').trim();if(v&&/^[A-Za-z0-9_-]{6,}$/.test(v))osMpSet_(x[1],v);});
 const u=JSON.parse(r.getContentText());return {guardado:true,cuenta:String(u.nickname||u.email||u.id||''),renovable:!!(osMpProp_('MP_CLIENT_ID')&&osMpProp_('MP_CLIENT_SECRET'))};
}
// ---- piezas puras (se prueban sin Google) ----
function osMpShift_(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10);}
function osMpNum_(v){const n=Number(String(v==null?'':v).replace(/[^\d.\-]/g,''));return isFinite(n)?n:0;}
function osCsv_(text,sep){
 const rows=[];let row=[],cur='',q=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(q){if(c==='"'){if(text[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}
  else if(c==='"')q=true;else if(c===sep){row.push(cur);cur='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cur);cur='';if(row.length>1||row[0]!=='')rows.push(row);row=[];}else cur+=c;}
 if(cur!==''||row.length){row.push(cur);rows.push(row);}
 return rows;
}
// Pago de la API -> evento de caja (o null si no es efectivo). Solo APROBADOS. Entrada = soy cobrador; salida = soy el pagador.
function osMpPaymentEvent_(p,me){
 if(!p||p.status!=='approved')return null;
 const col=String((p.collector&&p.collector.id)||p.collector_id||''),payer=String(p.payer_id||(p.payer&&p.payer.id)||'');
 const iso0=String(p.date_approved||p.date_created||''),day=typeof osMpDay_==='function'?osMpDay_(iso0):iso0.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const dir=col===me?'ENTRADA':payer===me?'SALIDA':'';if(!dir)return null;
 const net=Math.round(Number(p.transaction_details&&p.transaction_details.net_received_amount)||0),gross=Math.round(Number(p.transaction_amount)||0);
 const amount=dir==='ENTRADA'?(net>0?net:gross):gross;if(!(amount>0))return null;
 const commerce=p.point_of_interaction&&p.point_of_interaction.transaction_data&&p.point_of_interaction.transaction_data.commerce&&p.point_of_interaction.transaction_data.commerce.name;
 const type=String(p.payment_type_id||''),desc=String(p.description||commerce||'').trim();
 const label=dir==='ENTRADA'?(type==='bank_transfer'?'Transferencia recibida':type==='credit_card'?'Cobro con tarjeta':'Dinero recibido en Mercado Pago'):(commerce?'Compra '+commerce:'Pago o transferencia enviada');
 return {id:String(p.id),fecha:day,direccion:dir,monto:amount,descripcion:(desc&&desc!==commerce?label+' · '+desc:label),tipo_fuente:String(p.operation_type||'payment'),iso:String(p.date_approved||p.date_created||'')};
}
// CSV del reporte de liberaciones (separador ; o ,) -> eventos reales (payment y payout) + saldo corrido. Ignora reserve_* y la fila de totales.
function osMpReportRows_(csv){
 const first=String(csv).split(/\r?\n/,1)[0],sep=first.split(';').length>first.split(',').length?';':',';
 const t=osCsv_(String(csv).replace(/^﻿/,''),sep);if(t.length<2)return {rows:[],balance:null,balanceAt:''};
 const h=t[0].map(x=>String(x).trim().toUpperCase()),ix=k=>h.indexOf(k),rows=[];let balance=null,balanceAt='';
 t.slice(1).forEach(c=>{
  const get=k=>ix(k)>=0?String(c[ix(k)]||'').trim():'',id=get('SOURCE_ID'),desc=get('DESCRIPTION').toLowerCase(),day=get('DATE').slice(0,10);
  if(!id||!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
  if(get('BALANCE_AMOUNT')!==''){balance=Math.round(osMpNum_(get('BALANCE_AMOUNT')));balanceAt=get('DATE');}
  if(desc!=='payment'&&desc!=='payout')return;
  const cr=Math.round(osMpNum_(get('NET_CREDIT_AMOUNT'))),db=Math.round(osMpNum_(get('NET_DEBIT_AMOUNT')));
  const dir=cr>0&&db<=0?'ENTRADA':db>0&&cr<=0?'SALIDA':'';const amount=cr>0?cr:db;if(!dir||!(amount>0))return;
  rows.push({id:desc==='payout'?'PAYOUT-'+id:id,fecha:day,direccion:dir,monto:amount,descripcion:desc==='payout'?'Retiro desde Mercado Pago':(dir==='ENTRADA'?'Dinero recibido en Mercado Pago':'Pago o transferencia enviada'),tipo_fuente:desc,iso:get('DATE'),esRetiro:desc==='payout'});
 });
 return {rows:rows,balance:balance,balanceAt:balanceAt};
}
// ---- hoja ----
function osMpAccount_(){
 const a=ocTable_('OC_MAESTROS_ID','CUENTAS_FINANCIERAS').rows.filter(x=>ocProd_(x)&&x.estado_registro!=='ANULADO'&&/mercado/i.test(String(x.nombre||'')));
 if(a.length!==1)throw Error('No encuentro una única cuenta «Mercado Pago» en Cuentas.');return String(a[0].cuenta_id);
}
function osMpFin_(){return ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS');}
function osMpIndex_(fin,cuenta){const k={};fin.rows.forEach(r=>{if(r.cuenta_id!==cuenta)return;if(String(r.operacion_origen_id||'')!=='')k[String(r.operacion_origen_id)]=r;const m=/^MP-(\d+)$/.exec(String(r.movimiento_id||''));if(m&&!k[m[1]])k[m[1]]=r;});return k;}
function osMpLastDay_(fin,cuenta){
 const today=Utilities.formatDate(new Date(),'America/Santiago','yyyy-MM-dd');let last='';
 fin.rows.forEach(m=>{if(m.cuenta_id===cuenta&&ocProd_(m)){const d=osDate_(osClean_(m).fecha_operacion)||'';if(d&&d>last&&d<=today)last=d;}});return last;
}
// Escribe una fila nueva; si la hoja rechaza algún valor por su catálogo (validación de datos), reintenta sin los campos opcionales.
function osMpWrite_(fin,row){
 const drops=[[],['tipo_fuente'],['tipo_fuente','referencia'],['tipo_fuente','estado_fuente','calidad','lote_importacion_id','estado_conciliacion']];let last;
 for(let i=0;i<drops.length;i++){
  const r=Object.assign({},row);drops[i].forEach(k=>{if(fin.headers.indexOf(k)>=0)r[k]='';else delete r[k];});
  Object.keys(r).forEach(k=>{if(fin.headers.indexOf(k)<0)delete r[k];});
  try{ocPatchRow_(fin,fin.sheet.getLastRow()+1,r);Object.assign(row,r);return;}catch(e){last=e;if(!/inv[aá]lido|cat[aá]logo|validaci/i.test(String(e.message)))throw e;}
 }
 throw Error(String(last.message)+' (Mercado Pago '+row.operacion_origen_id+')');
}
// Agrega los eventos que no existen y completa fecha/dirección en filas antiguas de MP que las tenían vacías. Devuelve conteos.
function osMpApply_(fin,cuenta,events){
 const idx=osMpIndex_(fin,cuenta),now=new Date().toISOString(),out={agregados:0,completados:0,fallidos:0,error:''};
 events.forEach(e=>{
  const ex=idx[e.id];
  const row={movimiento_id:'MP-'+e.id,cuenta_id:cuenta,fecha_operacion:e.fecha,moneda:'CLP',direccion:e.direccion,monto:e.monto,descripcion:e.descripcion,referencia:'MP-'+e.id,hash_origen:'MP|'+e.id,ambiente:'PRODUCCION',estado_registro:'ACTIVO',origen:'IMPORTACION',calidad:'CONFIRMADO',version:1,created_at:now,created_by:'MERCADO_PAGO_API',updated_at:now,updated_by:'MERCADO_PAGO_API',monto_confirmado:'SI',incluir_en_saldo:'SI',tipo_fuente:e.tipo_fuente,estado_fuente:'approved',operacion_origen_id:e.id,fecha_original:e.iso,estado_importacion:'CONFIRMADO',estado_clasificacion:'PENDIENTE',estado_conciliacion:'PENDIENTE',lote_importacion_id:'MP-API'};
  if(ex){
   const patch={};if(!osDate_(osClean_(ex).fecha_operacion))patch.fecha_operacion=e.fecha;if(!ex.direccion)patch.direccion=e.direccion;
   // Completa campos vacíos de filas a medio escribir (sin tocar clasificación ni lo ya cargado)
   ['monto','descripcion','referencia','hash_origen','tipo_fuente','estado_fuente','operacion_origen_id','fecha_original','estado_importacion','estado_clasificacion','estado_conciliacion','lote_importacion_id','monto_confirmado','incluir_en_saldo','moneda','ambiente','estado_registro','origen','calidad','created_at','created_by'].forEach(k=>{if((ex[k]===undefined||ex[k]===''||ex[k]===null)&&fin.headers.indexOf(k)>=0)patch[k]=row[k];});
   if(Object.keys(patch).length&&out.completados<300){patch.version=Number(ex.version||1)+1;patch.updated_at=now;patch.updated_by='MERCADO_PAGO_API';try{ocPatchRow_(fin,ex._row,patch);Object.assign(ex,patch);out.completados++;}catch(err){out.fallidos=(out.fallidos||0)+1;out.error=String(err.message);}}
   return;
  }
  osMpWrite_(fin,row);fin.rows.push(row);idx[e.id]=row;out.agregados++;
 });
 return out;
}
function osMpSearchRange_(beginIso){
 const out={};let offset=0,total=1;
 while(offset<total&&offset<3000){
  const b=osMpJson_('/v1/payments/search?sort=date_created&criteria=desc&range=date_last_updated&begin_date='+encodeURIComponent(beginIso)+'&end_date=NOW&limit=50&offset='+offset);
  total=b.paging?b.paging.total:0;(b.results||[]).forEach(x=>{out[String(x.id)]=x;});offset+=50;if(!(b.results||[]).length)break;
 }
 return Object.keys(out).map(k=>out[k]);
}
function osMpBegin_(fin,cuenta){
 const today=Utilities.formatDate(new Date(),'America/Santiago','yyyy-MM-dd'),last=osMpLastDay_(fin,cuenta);
 return last?osMpShift_(last,3):osMpShift_(today,30);
}
function osMpStart_(){
 const cuenta=osMpAccount_(),fin=osMpFin_(),begin=osMpBegin_(fin,cuenta),me=osMpMeId_();
 const events=osMpSearchRange_(begin+'T00:00:00.000-03:00').map(p=>osMpPaymentEvent_(p,me)).filter(Boolean);
 const r=osMpApply_(fin,cuenta,events);
 let reportId='',reportWarn='';
 try{const b=osMpFetch_('/v1/account/release_report',{method:'post',contentType:'application/json',payload:JSON.stringify({begin_date:begin+'T03:00:00Z',end_date:Utilities.formatDate(new Date(),'UTC',"yyyy-MM-dd'T'HH:mm:ss'Z'")})});
  if(b.getResponseCode()===202){const j=JSON.parse(b.getContentText());reportId=String(j.id||'');osMpSet_('OC_MP_REPORT_REQ',JSON.stringify({id:reportId,at:Date.now(),begin:begin}));}
  else reportWarn='Mercado Pago no aceptó pedir el reporte de saldo (HTTP '+b.getResponseCode()+'): '+String(b.getContentText()).slice(0,160);}catch(e){if(/^TOKEN/.test(e.message))throw e;reportWarn='No pude pedir el reporte de saldo: '+String(e.message).slice(0,160);}
 return {fase:reportId?'reporte_pendiente':'listo',desde:begin,agregados:r.agregados,completados:r.completados,pagosRevisados:events.length,avisos:(r.fallidos?['No pude completar '+r.fallidos+' filas antiguas: '+r.error]:[]).concat(reportWarn?[reportWarn]:[])};
}
function osMpCheck_(){
 const cuenta=osMpAccount_(),fin=osMpFin_();let req;try{req=JSON.parse(osMpProp_('OC_MP_REPORT_REQ')||'null');}catch(e){req=null;}
 if(!req)return {fase:'listo',agregados:0,completados:0};
 const list=osMpJson_('/v1/account/release_report/list'),since=new Date(req.at-120000).toISOString();
 const ready=(Array.isArray(list)?list:[]).filter(r=>r.file_name&&(String(r.id)===String(req.id)||String(r.date_created||'')>=since)).sort((a,b)=>String(b.date_created).localeCompare(String(a.date_created)));
 if(!ready.length){if(Date.now()-req.at>20*60000){osMpSet_('OC_MP_REPORT_REQ','');return {fase:'listo',agregados:0,completados:0,avisos:['El reporte de Mercado Pago no llegó a tiempo; vuelve a intentar.']};}return {fase:'reporte_pendiente',agregados:0,completados:0};}
 const f=osMpFetch_('/v1/account/release_report/'+encodeURIComponent(ready[0].file_name));
 if(f.getResponseCode()!==200)return {fase:'reporte_pendiente',agregados:0,completados:0};
 const parsed=osMpReportRows_(f.getContentText()),r=osMpApply_(fin,cuenta,parsed.rows);
 osMpSet_('OC_MP_REPORT_REQ','');
 if(parsed.balance!==null)osMpSet_('OC_MP_BALANCE',JSON.stringify({saldo:parsed.balance,at:parsed.balanceAt}));
 return {fase:'listo',agregados:r.agregados,completados:r.completados,avisos:r.fallidos?['No pude completar '+r.fallidos+' filas antiguas: '+r.error]:[],retiros:parsed.rows.filter(x=>x.esRetiro).length,saldoMercadoPago:parsed.balance===null?null:{saldo:parsed.balance,at:parsed.balanceAt}};
}
function osMpSync_(p,actor){
 if(!actor||!actor.manage)throw Error('Acceso restringido.');
 const out=p&&p.fase==='revisar'?osMpCheck_():osMpStart_();
 if(!out.saldoMercadoPago){try{const b=JSON.parse(osMpProp_('OC_MP_BALANCE')||'null');if(b&&b.saldo!==undefined)out.saldoMercadoPago=b;}catch(e){}}
 if(out.fase==='listo')osMpSet_('OC_MP_LAST_SYNC',new Date().toISOString());
 out.at=new Date().toISOString();return out;
}
// Disparador por hora: hace las dos fases en una sola ejecución (espera el reporte hasta ~4 minutos).
function sincronizarMercadoPagoAuto(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(20000))return;
 try{let r=osMpStart_();for(let i=0;i<12&&r.fase==='reporte_pendiente';i++){Utilities.sleep(20000);r=osMpCheck_();}return r;}finally{lock.releaseLock();}
}
function activarSyncMercadoPago(){
 if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='sincronizarMercadoPagoAuto'))ScriptApp.newTrigger('sincronizarMercadoPagoAuto').timeBased().everyHours(1).create();return {programada:true};
}
