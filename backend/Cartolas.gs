// Oportunicars · Importación de cartolas bancarias pegadas desde Administrar (solo Alex).
// Archivo NUEVO: crear 'Cartolas.gs' y pegar todo. ocExtra_ (Atajo.gs) ya lo llama con ocCartolaExtra_.
// La web interpreta el formato de cada banco (cartolas.js); aquí se vuelve a comprobar la cadena de saldos,
// se descartan los movimientos ya importados (misma huella) y se escriben todos de una vez.
// La hoja valida valores: origen ∈ {DEMO,MANUAL,IMPORTACION,API,CALCULO}; referencia debe ser texto (el docto se guarda con ' para no perder los ceros).

function ocCartolaExtra_(p,actor){
 if(p.action==='cartolaImport')return ocCartolaImport_(p,actor);
 if(p.action==='cartolaVoid')return ocCartolaVoid_(p,actor);
 return undefined;
}
function ocCartolaFingerprint_(accountId,r){return ['CARTOLA',accountId,r.date,r.direction,r.amount,r.balance,r.doc||''].join('|');}
// Validación pura (probada en tests): fechas, montos y que cada saldo = saldo anterior ± monto.
function ocCartolaValidate_(p,today){
 if(!Array.isArray(p.rows)||!p.rows.length||p.rows.length>200)throw Error('Envía entre 1 y 200 movimientos por vez.');
 const opening=Number(p.opening);if(!Number.isSafeInteger(opening))throw Error('Falta el saldo inicial de la cartola.');
 let prev=opening;
 return p.rows.map((r,i)=>{
  const n=i+1,amount=Number(r.amount),balance=Number(r.balance),date=String(r.date||'');
  if(!Number.isSafeInteger(amount)||amount<=0||amount>10000000000)throw Error('Monto inválido en la línea '+n+'.');
  if(!Number.isSafeInteger(balance))throw Error('Saldo inválido en la línea '+n+'.');
  if(['ENTRADA','SALIDA'].indexOf(r.direction)<0)throw Error('Falta cargo o abono en la línea '+n+'.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(Date.parse(date))||date>today||date<'2024-01-01')throw Error('Fecha inválida en la línea '+n+': '+date);
  if(balance-prev!==(r.direction==='ENTRADA'?amount:-amount))throw Error('Descuadre en la línea '+n+': el saldo no calza con el monto.');
  prev=balance;
  const description=String(r.description||'').replace(/\s+/g,' ').trim().slice(0,200);if(!description)throw Error('Falta la descripción en la línea '+n+'.');
  const doc=String(r.doc||'').replace(/[^\w-]/g,'').slice(0,30);
  return {date:date,direction:r.direction,amount:amount,balance:balance,description:description,doc:doc};
 });
}
function ocCartolaImport_(p,actor){
 if(!ocIsAdminUser_(actor))throw Error('Solo el administrador de la caja importa cartolas.');
 if(!/^[-\w]{8,60}$/.test(String(p.requestId||'')))throw Error('Solicitud inválida.');
 const format=String(p.format||'').replace(/[^\w-]/g,'').slice(0,30);if(!format)throw Error('Falta el formato de la cartola.');
 const accounts=ocTable_('OC_MAESTROS_ID','CUENTAS_FINANCIERAS').rows.filter(a=>a.cuenta_id===p.accountId&&ocProd_(a));if(accounts.length!==1)throw Error('Cuenta no encontrada.');
 if(ocIsCash_(accounts[0])||/mercado/i.test(String(accounts[0].nombre||'')))throw Error('Las cartolas se importan en cuentas bancarias, no en Caja ni Mercado Pago.');
 const rows=ocCartolaValidate_(p,ocToday_()),fin=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS');
 const batch='CART-'+osHash_('cartola|'+p.accountId+'|'+p.requestId).slice(0,16),now=new Date().toISOString(),acc=String(p.accountId);
 const seen={};fin.rows.forEach(r=>{if(ocProd_(r)&&r.hash_origen)seen[String(r.hash_origen)]=true;});
 const fresh=[];let skipped=0;
 rows.forEach((q,i)=>{
  const key=ocCartolaFingerprint_(acc,q);if(seen[key]){skipped++;return;}seen[key]=true;
  fresh.push({movimiento_id:'CAR-'+osHash_(key+'|'+batch).slice(0,24),cuenta_id:acc,fecha_operacion:q.date,fecha_original:q.date,moneda:'CLP',direccion:q.direction,monto:q.amount,saldo_cartola:q.balance,
   descripcion:q.description,referencia:q.doc?"'"+q.doc:'',hash_origen:key,lote_importacion_id:batch,fuente_fila:Number(p.offset||0)+i+1,tipo_fuente:'cartola_'+format,estado_importacion:'CARTOLA',origen:'IMPORTACION',calidad:'CONFIRMADO',
   monto_confirmado:'SI',incluir_en_saldo:'SI',estado_clasificacion:'PENDIENTE',estado_conciliacion:'PENDIENTE',ambiente:'PRODUCCION',estado_registro:'ACTIVO',version:1,created_at:now,created_by:actor.id,updated_at:now,updated_by:actor.id});
 });
 if(fresh.length){
  Object.keys(fresh[0]).forEach(k=>{if(fin.headers.indexOf(k)<0)throw Error('Falta la columna '+k+' en MOVIMIENTOS_BANCARIOS.');});
  const values=fresh.map(r=>fin.headers.map(h=>Object.prototype.hasOwnProperty.call(r,h)?ocLiteral_(ocCellValue_(h,r[h])):''));
  fin.sheet.getRange(fin.sheet.getLastRow()+1,1,values.length,fin.headers.length).setValues(values);SpreadsheetApp.flush();
 }
 if(typeof osAudit_==='function')osAudit_(actor,'IMPORTAR_CARTOLA','MOVIMIENTOS_BANCARIOS',batch,{cuenta:acc,formato:format,nuevos:fresh.length,ya_estaban:skipped,saldo_final:rows[rows.length-1].balance});
 return {batch:batch,saved:fresh.map(ocCartolaSlim_),skipped:skipped};
}
function ocCartolaSlim_(r){const o=ocSlimMov_(r);if(typeof o.referencia==='string')o.referencia=o.referencia.replace(/^'/,'');['saldo_cartola','lote_importacion_id','hash_origen'].forEach(k=>{if(r[k]!==undefined)o[k]=r[k];});return o;}
// Deshace una importación completa (lote). Si alguna línea se dividió, primero hay que unir la división.
function ocCartolaVoid_(p,actor){
 if(!ocIsAdminUser_(actor))throw Error('Solo el administrador de la caja anula importaciones.');
 const batch=String(p.batch||'');if(!/^CART-[0-9a-f]{16}$/.test(batch))throw Error('Importación inválida.');
 const fin=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),mine=fin.rows.filter(r=>r.lote_importacion_id===batch&&r.estado_importacion==='CARTOLA'&&r.ambiente==='PRODUCCION');
 if(!mine.length)throw Error('Importación no encontrada.');
 const ids={};mine.forEach(r=>ids[String(r.movimiento_id)]=true);
 if(fin.rows.some(r=>ocProd_(r)&&r.estado_importacion==='DIVISION'&&ids[String(r.referencia)]))throw Error('Hay pagos divididos en esta importación: únelos primero (Caja → Unir división).');
 const live=mine.filter(r=>r.estado_registro!=='ANULADO');if(!live.length)return {batch:batch,ids:[]};
 const now=new Date(),last=fin.sheet.getLastRow(),col=h=>{const i=fin.headers.indexOf(h);if(i<0)throw Error('Falta la columna '+h+'.');return fin.sheet.getRange(2,i+1,last-1,1);};
 const patch={estado_registro:r=>'ANULADO',updated_at:r=>now,updated_by:r=>actor.id,version:r=>Number(r.version||1)+1};
 Object.keys(patch).forEach(h=>{const rg=col(h),v=rg.getValues();live.forEach(r=>{v[r._row-2][0]=patch[h](r);});rg.setValues(v);});
 SpreadsheetApp.flush();
 if(typeof osAudit_==='function')osAudit_(actor,'ANULAR_CARTOLA','MOVIMIENTOS_BANCARIOS',batch,{movimientos:live.length,clasificados:live.filter(r=>r.concepto_id).length});
 return {batch:batch,ids:live.map(r=>String(r.movimiento_id))};
}

// ---- Ajuste de cuentas (ejecutar una vez desde el editor) ----
// Security Personal pasa a llamarse Scotiabank Personal (mismo cuenta_id: movimientos y saldo inicial no cambian).
// Las cuentas que ya no se usan se anulan solo si no tienen ningún movimiento activo.
function ajustarCuentasScotiabank(){
 const actor={id:'AJUSTE_CUENTAS'},t=ocTable_('OC_MAESTROS_ID','CUENTAS_FINANCIERAS'),now=new Date().toISOString(),out={renombradas:[],anuladas:[],conservadas:[]};
 const moves=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS').rows.filter(ocProd_);
 const bump=(r,patch)=>Object.assign(patch,{updated_at:now,updated_by:actor.id,version:Number(r.version||1)+1});
 t.rows.filter(ocProd_).forEach(r=>{
  const name=String(r.nombre||'').trim();
  if(/^security personal$/i.test(name)){
   const patch=bump(r,{nombre:'SCOTIABANK PERSONAL'});if(t.headers.indexOf('entidad')>=0)patch.entidad='SCOTIABANK';
   osAudit_(actor,'RENOMBRAR_CUENTA','CUENTAS_FINANCIERAS',String(r.cuenta_id),{antes:name,despues:patch.nombre});ocPatchRow_(t,r._row,patch);out.renombradas.push(name+' → '+patch.nombre);
  }else if(OC_CUENTAS_SIN_USO.some(re=>re.test(name))){
   const n=moves.filter(m=>m.cuenta_id===r.cuenta_id).length;
   if(n){out.conservadas.push(name+' (tiene '+n+' movimientos: revisar antes de quitarla)');return;}
   osAudit_(actor,'ANULAR_CUENTA','CUENTAS_FINANCIERAS',String(r.cuenta_id),{nombre:name});ocPatchRow_(t,r._row,bump(r,{estado_registro:'ANULADO'}));out.anuladas.push(name);
  }
 });
 const b=SpreadsheetApp.openById(ocProperty_('OC_FINANZAS_ID')),old=b.getSheetByName('SECURITY_PERSONAL');
 if(old&&!b.getSheetByName('SCOTIABANK_PERSONAL'))old.setName('SCOTIABANK_PERSONAL');
 console.log(JSON.stringify(out));return out;
}
const OC_CUENTAS_SIN_USO=[/^security empresa$/i];

// Diagnóstico de solo lectura para la importación de cartolas: columnas, cuentas y tiempo de lectura.
function diagnosticarCartolas(){
 const t0=Date.now(),fin=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),t1=Date.now();
 const need=['movimiento_id','cuenta_id','fecha_operacion','fecha_original','moneda','direccion','monto','saldo_cartola','descripcion','referencia','hash_origen','lote_importacion_id','fuente_fila','tipo_fuente','estado_importacion','origen','calidad','monto_confirmado','incluir_en_saldo','estado_clasificacion','estado_conciliacion','ambiente','estado_registro','version','created_at','created_by','updated_at','updated_by'];
 const cuentas=ocTable_('OC_MAESTROS_ID','CUENTAS_FINANCIERAS').rows.filter(ocProd_).map(a=>a.cuenta_id+'='+a.nombre+(ocIsCash_(a)?' (efectivo)':''));
 const out={faltan:need.filter(h=>fin.headers.indexOf(h)<0),filas:fin.rows.length,columnas:fin.headers.length,lecturaMs:t1-t0,cuentas:cuentas};
 console.log(JSON.stringify(out));return out;
}

// Diagnóstico de solo lectura: listas desplegables (validaciones) de MOVIMIENTOS_BANCARIOS.
function diagnosticarValidacionesMovimientos(){
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),row=Math.max(2,t.sheet.getLastRow());
 const v=t.sheet.getRange(row,1,1,t.headers.length).getDataValidations()[0];
 const out=t.headers.map((h,i)=>v[i]?h+': '+String(v[i].getCriteriaType())+' '+JSON.stringify(v[i].getCriteriaValues().map(x=>Array.isArray(x)?x:String(x))):'').filter(Boolean);
 console.log(JSON.stringify(out));return out;
}
