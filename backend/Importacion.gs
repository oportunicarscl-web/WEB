function osMoney_(v){
 if(typeof v==='number')return Number.isSafeInteger(v)?v:null;
 let s=String(v===undefined||v===null?'':v).trim().replace(/CLP|\$|\s/g,'');if(!s)return null;
 if(/^\(.*\)$/.test(s))s='-'+s.slice(1,-1);
 if(/^-?\d{1,3}([.,]\d{3})+$/.test(s))s=s.replace(/[.,]/g,'');
 return /^[+-]?\d+$/.test(s)&&Number.isSafeInteger(Number(s))?Number(s):null;
}
function osBankDate_(v,format){
 let s=String(v||'').trim();if(format==='DD/MM/YYYY'){const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return '';s=m[3]+'-'+m[2]+'-'+m[1];}
 return osDate_(s)?s:'';
}
function osNormalizeBank_(row,profile){
 const map=JSON.parse(profile.mapeo_json);const get=k=>map[k]===undefined?'':row[map[k]];
 const errors=[];let amount=null,direction='',v=osMoney_(get('amount'));
 if(profile.modo_importe==='SIGNED'){if(v!==null&&v!==0){amount=Math.abs(v);direction=v>0?'ENTRADA':'SALIDA';}}
 else if(profile.modo_importe==='CREDIT_DEBIT'){
  const credit=osMoney_(get('credit')),debit=osMoney_(get('debit'));
  if((credit!==null&&credit<0)||(debit!==null&&debit<0)||(credit>0&&debit>0)||get('credit')!==''&&get('credit')!==undefined&&credit===null||get('debit')!==''&&get('debit')!==undefined&&debit===null)errors.push('Cargos/abonos incompatibles');
  else if(credit>0){amount=credit;direction='ENTRADA';}else if(debit>0){amount=debit;direction='SALIDA';}
 }else if(profile.modo_importe==='ABS_DIRECTION'){
  if(v!==null&&v>0)amount=v;const type=String(get('direction')||'').trim();const dirs=map.directionValues||{};direction=dirs[type]||'';
 }else throw Error('Modo de importe no configurado.');
 const day=osBankDate_(get('date'),profile.formato_fecha);if(!day)errors.push('Fecha por revisar');
 if(amount===null||!['ENTRADA','SALIDA'].includes(direction))errors.push('Importe o dirección por revisar');
 const state=String(get('state')||'');
 // No generic "approved" shortcut: a profile must explicitly identify the
 // effective ledger events. Payment-status exports must remain provisional.
 const effective=profile.estado_efectivo==='CARTOLA_EFECTIVA'||profile.estado_efectivo&&state===profile.estado_efectivo;
 if(!effective)errors.push('Efecto bancario por confirmar');
 return {fecha_operacion:day,fecha_original:String(get('date')||''),direccion:direction,monto:amount===null?'':amount,descripcion:String(get('description')||''),referencia:String(get('reference')||''),contraparte:String(get('counterparty')||''),operacion_origen_id:String(get('id')||''),estado_fuente:state,monto_bruto:osMoney_(get('gross'))===null?'':osMoney_(get('gross')),neto_informado:osMoney_(get('net'))===null?'':osMoney_(get('net')),comisiones:osMoney_(get('fee'))===null?'':osMoney_(get('fee')),saldo_cartola:osMoney_(get('balance'))===null?'':osMoney_(get('balance')),errors};
}
function osHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function osImport_(p,actor){
 if(!actor.manage)throw Error('Solo administración o gerencia puede importar fuentes.');
 if(!Array.isArray(p.rows)||!p.rows.length||p.rows.length>50||!/^[-\w]{1,100}$/.test(p.batch||''))throw Error('Lote inválido (máximo 50 filas).');
 if(p.offset!==undefined&&(!Number.isSafeInteger(p.offset)||p.offset<0||p.offset>10000000))throw Error('Posición de lote inválida.');
 const profiles=osTable_('PERFILES_IMPORTACION').rows.filter(r=>r.perfil_id===p.profileId&&r.habilitado==='SI'&&ocProd_(r));if(profiles.length!==1)throw Error('Perfil no habilitado.');const profile=profiles[0];
 if(Number(profile.version)!==p.profileVersion)throw Error('Cambió el perfil de importación.');
 const accounts=ocTable_('OC_MAESTROS_ID','CUENTAS_FINANCIERAS').rows.filter(r=>r.cuenta_id===profile.cuenta_id&&ocProd_(r));if(accounts.length!==1||accounts[0].moneda!=='CLP')throw Error('Cuenta CLP no configurada.');
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS');let added=0,repeated=0,review=0;
 const normalized=p.rows.map((item,i)=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||JSON.stringify(item).length>15000)throw Error('Fila inválida.');
  const x=osNormalizeBank_(item,profile),source=x.operacion_origen_id;
  const id='MOV-'+osHash_(profile.cuenta_id+'|'+(source?'ID|'+source:'LOTE|'+p.batch+'|'+(Number(p.offset||0)+i))).slice(0,40);
  const fingerprint=osHash_(JSON.stringify([profile.cuenta_id,x.fecha_operacion,x.monto,x.direccion,x.referencia,x.descripcion]));
  return {id,x,source,fingerprint,item,i};
 });
 normalized.forEach(({id,x,source,fingerprint,item,i})=>{
  if(t.rows.some(r=>r.movimiento_id===id)){repeated++;return;}
  const possible=!source&&t.rows.some(r=>r.hash_origen===fingerprint);if(possible)x.errors.push('Posible duplicado; revisar sin borrar');
  const now=new Date().toISOString(),patch=Object.assign({},x,{movimiento_id:id,cuenta_id:profile.cuenta_id,moneda:'CLP',hash_origen:fingerprint,ambiente:'PRODUCCION',estado_registro:'ACTIVO',origen:'IMPORTACION',version:1,created_at:now,created_by:actor.id,updated_at:now,updated_by:actor.id,lote_importacion_id:p.batch,perfil_id:profile.perfil_id,perfil_version:profile.version,fuente_fila:Number(p.offset||0)+i,origen_json:JSON.stringify(item),estado_importacion:x.errors.length?'POR_REVISAR':'CONFIRMADO',observacion:x.errors.join('; '),monto_confirmado:x.errors.length?'NO':'SI',incluir_en_saldo:x.errors.length?'NO':'SI',estado_clasificacion:'PENDIENTE',estado_conciliacion:'PENDIENTE',calidad:x.errors.length?'PENDIENTE_VERIFICACION':'CONFIRMADO'});
  delete patch.errors;ocPatchRow_(t,t.sheet.getLastRow()+1,patch);t.rows.push(patch);added++;if(x.errors.length)review++;
 });
 return {added,repeated,review};
}
