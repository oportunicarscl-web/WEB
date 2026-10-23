// Oportunicars · Sincronización completa de Mercado Pago desde la web (botón junto al saldo total).
// 1) Pagos aprobados (cobros y pagos) desde el último movimiento de MP menos 3 días.
// 2) Reporte de «dinero liberado» (incluye retiros, transferencias, devoluciones): se pide en cada click y se importa el último listo.
// 3) Saldo de la cuenta según Mercado Pago, si el token lo permite.
// Los errores de token salen con el prefijo «TOKEN:» para que la web abra el cuadro de claves (solo Alex).
function osMpProp_(k){return PropertiesService.getScriptProperties().getProperty(k)||'';}
function osMpSet_(k,v){PropertiesService.getScriptProperties().setProperty(k,v);}
function osMpRefresh_(){
 const id=osMpProp_('MP_CLIENT_ID'),sec=osMpProp_('MP_CLIENT_SECRET');if(!id||!sec)return false;
 const r=UrlFetchApp.fetch(OS_MP_API+'/oauth/token',{method:'post',contentType:'application/json',payload:JSON.stringify({client_id:id,client_secret:sec,grant_type:'client_credentials'}),muteHttpExceptions:true});
 if(r.getResponseCode()!==200)return false;const t=JSON.parse(r.getContentText()).access_token;if(!t)return false;osMpSet_('MP_ACCESS_TOKEN',t);return true;
}
// Pedido autenticado; si el token venció y hay Client ID/Secret, lo renueva solo.
function osMpFetch_(path,opt,retry){
 const token=osMpProp_('MP_ACCESS_TOKEN');if(!token)throw Error('TOKEN: falta el token de Mercado Pago.');
 const o=Object.assign({muteHttpExceptions:true},opt||{});o.headers=Object.assign({Authorization:'Bearer '+token,accept:'application/json'},o.headers||{});
 const r=UrlFetchApp.fetch(path.indexOf('http')===0?path:OS_MP_API+path,o);const c=r.getResponseCode();
 if(c===401&&!retry&&osMpRefresh_())return osMpFetch_(path,opt,true);
 if(c===401)throw Error('TOKEN: Mercado Pago rechazó el token (venció o es inválido).');
 return r;
}
function osMpJson_(path,opt){const r=osMpFetch_(path,opt);if(r.getResponseCode()>=300)throw Error('Mercado Pago respondió '+r.getResponseCode()+' en '+path.split('?')[0]);return JSON.parse(r.getContentText());}
function osMpMeId_(){const u=osMpJson_('/users/me');return String(u.id);}
function osMpSaveToken_(p,actor){
 if(!actor||!actor.manage||!ocIsAdminUser_(actor))throw Error('Solo Alex puede guardar las claves de Mercado Pago.');
 const at=String(p.accessToken||'').trim();if(!/^[A-Za-z0-9_-]{20,}$/.test(at))throw Error('El Access Token no parece válido.');
 const r=UrlFetchApp.fetch(OS_MP_API+'/users/me',{headers:{Authorization:'Bearer '+at,accept:'application/json'},muteHttpExceptions:true});
 if(r.getResponseCode()!==200)throw Error('Mercado Pago rechazó ese Access Token ('+r.getResponseCode()+').');
 osMpSet_('MP_ACCESS_TOKEN',at);
 [['publicKey','MP_PUBLIC_KEY'],['clientId','MP_CLIENT_ID'],['clientSecret','MP_CLIENT_SECRET']].forEach(x=>{const v=String(p[x[0]]||'').trim();if(v&&/^[A-Za-z0-9_-]{6,}$/.test(v))osMpSet_(x[1],v);});
 const u=JSON.parse(r.getContentText());return {guardado:true,cuenta:String(u.nickname||u.email||u.id||''),renovable:!!(osMpProp_('MP_CLIENT_ID')&&osMpProp_('MP_CLIENT_SECRET'))};
}
function osMpLastDay_(profile){
 let last='';ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS').rows.forEach(m=>{if(m.cuenta_id===profile.cuenta_id&&ocProd_(m)){const d=osDate_(osClean_(m).fecha_operacion)||'';if(d&&d>last&&d<=Utilities.formatDate(new Date(),'America/Santiago','yyyy-MM-dd'))last=d;}});
 return last;
}
function osMpShift_(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10);}
// Pagos (como cobrador o como pagador) actualizados desde beginIso. Solo los aprobados cuentan: se ignoran rechazados, pendientes, cancelados.
function osMpSearchRange_(beginIso,me){
 const out={},add=q=>{let offset=0,total=1;while(offset<total&&offset<2000){
  const b=osMpJson_('/v1/payments/search?sort=date_created&criteria=desc&range=date_last_updated&begin_date='+encodeURIComponent(beginIso)+'&end_date=NOW&limit=50&offset='+offset+q);
  total=b.paging?b.paging.total:0;(b.results||[]).forEach(x=>{out[String(x.id)]=x;});offset+=50;if(!(b.results||[]).length)break;}};
 add('');try{add('&payer.id='+encodeURIComponent(me));}catch(e){if(/^TOKEN/.test(e.message))throw e;}
 return Object.keys(out).map(k=>out[k]).filter(x=>x.status==='approved');
}
function osMpImportRows_(profile,rows,tag){
 const res={recibidos:rows.length,agregados:0,repetidos:0,porRevisar:0};
 for(let i=0;i<rows.length;i+=50){
  const r=osImport_({profileId:profile.perfil_id,profileVersion:Number(profile.version),rows:rows.slice(i,i+50),offset:i,batch:tag},{manage:true,id:'MERCADO_PAGO_API'});
  res.agregados+=r.added;res.repetidos+=r.repeated;res.porRevisar+=r.review;
 }
 return res;
}
function osMpKnown_(profile){const k={};ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS').rows.forEach(m=>{if(m.cuenta_id===profile.cuenta_id&&String(m.operacion_origen_id||'')!=='')k[String(m.operacion_origen_id)]=true;});return k;}
function osMpPayments_(profile,beginDay,today){
 const me=osMpMeId_(),known=osMpKnown_(profile);
 const rows=osMpSearchRange_(beginDay+'T00:00:00.000-03:00',me).filter(p=>!known[String(p.id)]).map(p=>{
  const r=osMpRow_(p,today),d=osMpDirection_(p,me);r.estado='LIQUIDADO';r.direccion=d||r.direccion;return r;}).filter(r=>r.fecha);
 return osMpImportRows_(profile,rows,'MP-API-'+today.replace(/-/g,''));
}
// ---- Reporte de dinero liberado (todo: pagos, transferencias, retiros, devoluciones) ----
const OS_MP_COLS=['DATE','SOURCE_ID','EXTERNAL_REFERENCE','RECORD_TYPE','DESCRIPTION','NET_CREDIT_AMOUNT','NET_DEBIT_AMOUNT','GROSS_AMOUNT','MP_FEE_AMOUNT','PAYMENT_METHOD'];
function osMpReportConfig_(){
 const g=osMpFetch_('/v1/account/release_report/config');if(g.getResponseCode()===200)return true;
 const attempt=(cols,tz)=>osMpFetch_('/v1/account/release_report/config',{method:'post',contentType:'application/json',payload:JSON.stringify({file_name_prefix:'oportunicars-liberado',display_timezone:tz,frequency:{hour:0,type:'daily',value:1},include_withdrawal_at_end:true,execute_after_withdrawal:false,report_translation:'en',columns:cols.map(k=>({key:k}))})}).getResponseCode();
 const withBal=OS_MP_COLS.concat(['BALANCE_AMOUNT']);
 const ok=c=>c>=200&&c<300;
 return ok(attempt(withBal,'GMT-03'))||ok(attempt(OS_MP_COLS,'GMT-03'))||ok(attempt(OS_MP_COLS,'GMT-04'));
}
function osCsv_(text){
 const rows=[];let row=[],cur='',q=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(q){if(c==='"'){if(text[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}
  else if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cur);cur='';if(row.length>1||row[0]!=='')rows.push(row);row=[];}else cur+=c;}
 if(cur!==''||row.length){row.push(cur);rows.push(row);}
 return rows;
}
function osMpNum_(v){const n=Number(String(v||'0').replace(/[^\d.\-]/g,''));return isFinite(n)?n:0;}
// Convierte el CSV del reporte en filas canónicas (una por movimiento de dinero real). Pura: se prueba sin Google.
function osMpReportRows_(csv,today){
 const t=osCsv_(csv);if(t.length<2)return {rows:[],balance:null};
 const h=t[0].map(x=>String(x).trim().toUpperCase()),ix=k=>h.indexOf(k),seen={};let balance=null;const rows=[];
 t.slice(1).forEach(c=>{
  const get=k=>ix(k)>=0?String(c[ix(k)]||'').trim():'',type=get('RECORD_TYPE').toLowerCase(),desc=get('DESCRIPTION');
  const cr=Math.round(osMpNum_(get('NET_CREDIT_AMOUNT'))),db=Math.round(osMpNum_(get('NET_DEBIT_AMOUNT')));
  if(ix('BALANCE_AMOUNT')>=0&&get('BALANCE_AMOUNT')!=='')balance=Math.round(osMpNum_(get('BALANCE_AMOUNT')));
  if(type==='initial_available_balance'||type==='total'||type==='final_available_balance')return;
  const day=get('DATE').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
  const amount=cr>0?cr:db>0?db:Math.abs(Math.round(osMpNum_(get('GROSS_AMOUNT'))));if(!amount)return;
  const dir=cr>0&&db<=0?'ENTRADA':db>0&&cr<=0?'SALIDA':osMpNum_(get('GROSS_AMOUNT'))<0?'SALIDA':'ENTRADA';
  let id=get('SOURCE_ID');
  if(!id){const base='REL-'+day+'-'+dir+'-'+amount+'-'+desc.replace(/\W+/g,'').slice(0,12);seen[base]=(seen[base]||0)+1;id=base+'-'+seen[base];}
  rows.push({id_evento:id,fecha:day,fecha_liberacion:day,monto:amount,direccion:dir,estado:'LIQUIDADO',descripcion:desc||type||'Movimiento Mercado Pago',pagador:'',bruto:'',neto:'',comision:Math.round(osMpNum_(get('MP_FEE_AMOUNT')))||''});
 });
 return {rows:rows,balance:balance};
}
function osMpReport_(profile,beginDay,today){
 const out={estado:'',agregados:0,saldoInformado:null};
 if(!osMpReportConfig_())out.estado='No pude configurar el reporte (revisa permisos del token).';
 const used=osMpProp_('OC_MP_REPORT_USED');
 const list=osMpJson_('/v1/account/release_report/list');
 const ready=(Array.isArray(list)?list:[]).filter(r=>r.file_name&&String(r.date_created||'')>used).sort((a,b)=>String(b.date_created).localeCompare(String(a.date_created)));
 if(ready.length){
  const f=osMpFetch_('/v1/account/release_report/'+encodeURIComponent(ready[0].file_name));
  if(f.getResponseCode()===200){
   const parsed=osMpReportRows_(f.getContentText(),today),known=osMpKnown_(profile),fresh=parsed.rows.filter(r=>!known[String(r.id_evento)]);
   const r=osMpImportRows_(profile,fresh,'MP-REL-'+today.replace(/-/g,''));out.agregados=r.agregados;out.saldoInformado=parsed.balance;
   osMpSet_('OC_MP_REPORT_USED',String(ready[0].date_created));out.estado='Reporte importado.';
  }
 }
 const last=Number(osMpProp_('OC_MP_REPORT_REQ')||0);
 if(Date.now()-last>15*60*1000){
  const b=osMpFetch_('/v1/account/release_report',{method:'post',contentType:'application/json',payload:JSON.stringify({begin_date:beginDay+'T00:00:00Z',end_date:new Date().toISOString()})});
  if(b.getResponseCode()===202){osMpSet_('OC_MP_REPORT_REQ',String(Date.now()));out.estado=(out.estado?out.estado+' ':'')+'Pedí un reporte nuevo; aprieta de nuevo en unos minutos para importarlo.';}
 }
 return out;
}
function osMpBalance_(me){
 try{const r=osMpFetch_('/users/'+me+'/mercadopago_account/balance');if(r.getResponseCode()!==200)return null;const b=JSON.parse(r.getContentText());
  const n=x=>Number.isFinite(Number(x))?Math.round(Number(x)):null;return {disponible:n(b.available_balance),noDisponible:n(b.unavailable_balance),total:n(b.total_amount)};}
 catch(e){if(/^TOKEN/.test(e.message))throw e;return null;}
}
function osMpSync_(p,actor){
 if(!actor||!actor.manage)throw Error('Acceso restringido.');
 const profile=osMpProfile_(),today=Utilities.formatDate(new Date(),'America/Santiago','yyyy-MM-dd');
 const last=osMpLastDay_(profile),begin=osMpShift_(last||osMpShift_(today,30),last?3:0);
 const out={desde:begin,at:new Date().toISOString(),avisos:[]};
 out.pagos=osMpPayments_(profile,begin,today);
 try{out.reporte=osMpReport_(profile,begin,today);}catch(e){if(/^TOKEN/.test(e.message))throw e;out.avisos.push('Reporte: '+e.message);}
 const bal=osMpBalance_(osMpMeId_());if(bal){out.saldoMercadoPago=bal;osMpSet_('OC_MP_BALANCE',JSON.stringify(Object.assign({at:out.at},bal)));}
 else out.avisos.push('Mercado Pago no entregó el saldo de la cuenta con este token.');
 osMpSet_('OC_MP_LAST_SYNC',out.at);
 out.agregados=(out.pagos.agregados||0)+((out.reporte&&out.reporte.agregados)||0);
 return out;
}
