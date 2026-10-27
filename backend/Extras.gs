// Oportunicars · Extras: parámetros (costo de estacionamiento), edición completa de movimientos y control de sesiones.
// En el proyecto Apps Script vive al final de Carga.gs. ocExtra_ (Atajo.gs) ya lo llama.

// ---------- Parámetros ----------
// Autos con más de N días de inventario suman costo de estacionamiento: (días − N) × valor por día.
function ocSettings_(){
 const p=PropertiesService.getScriptProperties(),n=(k,d)=>{const v=Number(p.getProperty(k));return Number.isFinite(v)&&p.getProperty(k)!==null?v:d;};
 return {parkingDays:n('OC_PARKING_DAYS',30),parkingRate:n('OC_PARKING_RATE',1)};
}
function ocSaveSettings_(p,actor){
 if(!actor.manage)throw Error('Solo Gerencia o Administración cambia parámetros.');
 const days=Number(p.parkingDays),rate=Number(p.parkingRate);
 if(!Number.isSafeInteger(days)||days<0||days>3650)throw Error('Días libres inválidos.');
 if(!Number.isSafeInteger(rate)||rate<0||rate>10000000)throw Error('Valor por día inválido.');
 const before=ocSettings_();PropertiesService.getScriptProperties().setProperties({OC_PARKING_DAYS:String(days),OC_PARKING_RATE:String(rate)});
 osAudit_(actor,'PARAMETROS','PROPIEDADES','ESTACIONAMIENTO',{antes:before,despues:{parkingDays:days,parkingRate:rate}});
 return ocSettings_();
}

// ---------- Edición completa de un movimiento (rueda → Editar) ----------
// Lo ingresado por personas (a mano o por atajo) se corrige entero: cuenta, fecha, monto, ingreso/egreso, descripción, concepto y auto,
// y se puede eliminar. Lo importado del banco o de Mercado Pago conserva cuenta, fecha, monto y descripción: solo se corrige
// ingreso/egreso, concepto y auto; nunca se elimina.
function ocMovOwn_(r){return ['MANUAL','ATAJO'].indexOf(String(r.estado_importacion||''))>=0||String(r.origen||'')==='MANUAL';}
function ocMovCanEdit_(r,actor){return actor.manage||ocIsAdminUser_(actor)||String(r.created_by||'')===String(actor.id);}
function ocMovEdit_(p,actor){
 const m='OC_MAESTROS_ID',fin=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),r=ocMovRow_(fin,p.id);
 if(Number(r.version||1)!==Number(p.expectedVersion))throw Error('El movimiento cambió. Recarga antes de guardar.');
 if(!ocMovCanEdit_(r,actor))throw Error('Solo quien lo registró o Gerencia puede corregirlo.');
 const own=ocMovOwn_(r),f=p.fields||{},patch={};
 const day=v=>v instanceof Date?Utilities.formatDate(v,'America/Santiago','yyyy-MM-dd'):String(v||'');
 if(own){
  const q=ocManualValidate_({amount:f.amount,direction:f.direction,date:f.date,description:f.description},ocToday_());
  const accounts=ocTable_(m,'CUENTAS_FINANCIERAS').rows.filter(a=>a.cuenta_id===f.accountId&&ocProd_(a));if(accounts.length!==1)throw Error('Cuenta no encontrada.');
  Object.assign(patch,{cuenta_id:String(f.accountId),fecha_operacion:q.date,monto:q.amount,direccion:q.direction,descripcion:q.description});
  if(ocIsCash_(accounts[0]))Object.assign(patch,{monto_confirmado:'SI',incluir_en_saldo:'SI'});
 }else{
  if(f.accountId&&f.accountId!==String(r.cuenta_id)||f.date&&f.date!==day(r.fecha_operacion)||f.amount!==undefined&&f.amount!==''&&Number(f.amount)!==Number(r.monto))throw Error('Movimiento importado: cuenta, fecha y monto vienen del banco y no se cambian.');
  if(['ENTRADA','SALIDA'].indexOf(f.direction)<0)throw Error('Indica si fue ingreso o egreso.');
  patch.direccion=f.direction;
 }
 const dir=patch.direccion;
 // Concepto y auto: vacío = por asignar. Aportes, préstamos y transferencias se asignan desde la caja (piden detalle).
 const keepLinks=String(f.conceptId||'')===String(r.concepto_id||'');
 let C=null;
 if(f.conceptId){
  const cs=ocTable_(m,'CONCEPTOS_CAJA').rows.filter(c=>c.concepto_id===f.conceptId&&c.habilitado==='SI');if(cs.length!==1)throw Error('Concepto no disponible.');C=ocConcept_(cs[0]);ocValidateConcept_(C);
  if(dir==='ENTRADA'&&['GASTO','COSTO'].indexOf(C.nature)>=0||dir==='SALIDA'&&C.nature==='INGRESO')throw Error('El concepto no corresponde a si entró o salió dinero.');
  if(!keepLinks&&['APORTE_CAPITAL','PRESTAMO'].indexOf(C.nature)>=0)throw Error('Aportes y préstamos se asignan desde la caja (piden socio o préstamo).');
  if(keepLinks&&C.nature==='APORTE_CAPITAL'&&dir!=='ENTRADA')throw Error('Un aporte siempre es ingreso.');
 }
 let car='';
 if(C&&C.vehicleOperation&&f.vehicleId){const vs=ocTable_(m,'VEHICULOS').rows.filter(v=>String(v.vehiculo_id)===String(f.vehicleId)&&ocProd_(v));if(vs.length!==1)throw Error('Auto no encontrado.');car=String(vs[0].vehiculo_id);}
 const E={id:'',name:'',version:'',category:'',nature:'',cost:'',recurring:false,vehicleOperation:''},K=C||E;
 Object.assign(patch,{concepto_id:K.id,concepto_nombre:K.name,concepto_version:K.version,categoria:K.category,naturaleza:K.nature,tipo_costo:K.cost,recurrente:C?(K.recurring?'SI':'NO'):'',operacion_auto:K.vehicleOperation,vehiculo_id:car,estado_clasificacion:!C?'PENDIENTE':K.vehicleOperation&&!car?'POR_ASIGNAR_AUTO':'CLASIFICADO'});
 if(!keepLinks)Object.assign(patch,{actividad_id:'',proyeccion_id:'',prestamo_id:'',componente_prestamo:'',socio:'',aporte_id:''});
 const full=ocBump_(r,actor,patch);
 osAudit_(actor,'EDITAR_MOVIMIENTO','MOVIMIENTOS_BANCARIOS',p.id,{propio:own,antes:ocSlimMov_(r),despues:full});
 ocPatchRow_(fin,r._row,full);return ocSlimMov_(Object.assign({},r,full));
}
function ocMovVoid_(p,actor){
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),r=ocMovRow_(t,p.id);
 if(Number(r.version||1)!==Number(p.expectedVersion))throw Error('El movimiento cambió. Recarga antes de eliminar.');
 if(!ocMovOwn_(r))throw Error('Los movimientos del banco o de Mercado Pago no se eliminan.');
 if(!ocMovCanEdit_(r,actor))throw Error('Solo quien lo registró o Gerencia puede eliminarlo.');
 osAudit_(actor,'ELIMINAR_MOVIMIENTO','MOVIMIENTOS_BANCARIOS',p.id,{antes:ocSlimMov_(r)});
 ocPatchRow_(t,r._row,ocBump_(r,actor,{estado_registro:'ANULADO'}));return {id:p.id};
}

// ---------- Usuarios ----------
function ocIsJT_(actor){return /^(jt|jos[eé]\s*tom[aá]s)\b/i.test(String(actor&&actor.name||'').trim());}

// ---------- Sesiones ----------
// Solo correos @oportunicars.cl. Cada correo puede tener hasta 3 sesiones abiertas (p. ej. computador, web del teléfono y atajo);
// al abrir una cuarta se cierra la que lleva más tiempo sin usarse.
const OC_SESSION_MAX=3;
function ocSessionGuard_(u,token){
 if(!/@oportunicars\.cl$/i.test(String(u&&u.email||'').trim()))throw Error('Solo se permiten cuentas @oportunicars.cl.');
 let sid='';try{sid=String(JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(token.split('.')[1].replace(/=+$/,'')+'==='.slice((token.split('.')[1].length+3)%4))).getDataAsString()).session_id||'');}catch(e){sid='';}
 if(!sid)return;
 const props=PropertiesService.getScriptProperties(),key='OC_SES_'+u.id,now=Date.now();
 let list=[];try{list=JSON.parse(props.getProperty(key)||'[]');}catch(e){list=[];}
 const mine=list.filter(x=>x.s===sid)[0];
 if(mine){if(mine.x)throw Error('SESION_CERRADA: se abrieron más de '+OC_SESSION_MAX+' sesiones con tu correo. Ingresa nuevamente.');if(now-mine.t<3600000)return;mine.t=now;}
 else list.push({s:sid,t:now});
 const live=list.filter(x=>!x.x).sort((a,b)=>b.t-a.t);
 live.slice(OC_SESSION_MAX).forEach(x=>{x.x=1;});
 list=list.filter(x=>!x.x||now-x.t<90*86400000).slice(-20);
 props.setProperty(key,JSON.stringify(list));
}

// ---------- Dividir un pago ----------
// Un movimiento (p. ej. 90.000 de lavados de 3 autos) se reemplaza por N partes que suman exactamente su monto.
// Las partes heredan cuenta, fecha, signo, confirmación y concepto (sin auto) y se trabajan como cualquier movimiento;
// el original queda anulado (no suma) y marcado como dividido. «Unir» deshace la división.
function ocMovSplit_(p,actor){
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),r=ocMovRow_(t,p.id);
 if(Number(r.version||1)!==Number(p.expectedVersion))throw Error('El movimiento cambió. Recarga antes de dividir.');
 const total=Number(r.monto);if(!Number.isSafeInteger(total)||total<=1)throw Error('El movimiento no tiene un monto que dividir.');
 const parts=Array.isArray(p.parts)?p.parts.map(Number):[];
 if(parts.length<2||parts.length>20)throw Error('Divide en 2 a 20 partes.');
 if(parts.some(x=>!Number.isSafeInteger(x)||x<=0))throw Error('Cada parte debe ser un monto mayor que cero.');
 if(parts.reduce((a,b)=>a+b,0)!==total)throw Error('Las partes deben sumar exactamente '+total+'.');
 if(r.prestamo_id||r.socio||r.aporte_id)throw Error('Deshaz la asignación de aporte o préstamo antes de dividir.');
 try{if(ocTable_('OC_FINANZAS_ID','IMPUTACIONES_SUELDO').rows.some(x=>ocProd_(x)&&String(x.movimiento_id)===String(r.movimiento_id)))throw Error('IMP');}catch(e){if(e.message==='IMP')throw Error('Quita la imputación en Liquidaciones antes de dividir.');}
 const now=new Date().toISOString(),tag=Utilities.getUuid().slice(0,4),n=parts.length,base=String(r.movimiento_id),desc=String(r.descripcion||r.referencia||'Movimiento').replace(/^✂ \d+\/\d+ · /,'');
 const keepConcept=!!r.concepto_id&&['APORTE_CAPITAL','PRESTAMO'].indexOf(String(r.naturaleza))<0;
 const out=parts.map((monto,i)=>{
  const id=base+'-D'+(i+1)+tag;
  const row={movimiento_id:id,cuenta_id:r.cuenta_id,fecha_operacion:r.fecha_operacion,fecha_original:r.fecha_original||'',moneda:r.moneda||'CLP',direccion:r.direccion||'',monto:monto,
   descripcion:'✂ '+(i+1)+'/'+n+' · '+desc,referencia:base,hash_origen:'DIV|'+id,ambiente:'PRODUCCION',estado_registro:'ACTIVO',origen:'DIVISION',calidad:r.calidad||'',
   monto_confirmado:r.monto_confirmado||'NO',incluir_en_saldo:r.incluir_en_saldo||'NO',tipo_fuente:r.tipo_fuente||'',estado_fuente:r.estado_fuente||'',estado_importacion:'DIVISION',
   concepto_id:keepConcept?r.concepto_id:'',concepto_nombre:keepConcept?r.concepto_nombre:'',concepto_version:keepConcept?r.concepto_version:'',categoria:keepConcept?r.categoria:'',naturaleza:keepConcept?r.naturaleza:'',tipo_costo:keepConcept?r.tipo_costo:'',recurrente:keepConcept?r.recurrente:'',operacion_auto:keepConcept?r.operacion_auto:'',vehiculo_id:'',
   estado_clasificacion:!keepConcept?'PENDIENTE':r.operacion_auto?'POR_ASIGNAR_AUTO':'CLASIFICADO',observacion:'División '+(i+1)+' de '+n+' de '+base,version:1,created_at:now,created_by:actor.id,updated_at:now,updated_by:actor.id};
  Object.keys(row).forEach(k=>{if(t.headers.indexOf(k)<0)delete row[k];});
  return row;
 });
 osAudit_(actor,'DIVIDIR_MOVIMIENTO','MOVIMIENTOS_BANCARIOS',base,{monto:total,partes:parts,ids:out.map(x=>x.movimiento_id)});
 out.forEach(row=>{ocPatchRow_(t,t.sheet.getLastRow()+1,row);});
 const pp=ocBump_(r,actor,{estado_registro:'ANULADO'});if(t.headers.indexOf('observacion')>=0)pp.observacion='DIVIDIDO en '+n+' partes';
 ocPatchRow_(t,r._row,pp);
 return {parentId:base,children:out.map(ocSlimMov_)};
}
function ocMovUnsplit_(p,actor){
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),base=String(p.parentId||'');
 const kids=t.rows.filter(r=>ocProd_(r)&&String(r.estado_importacion)==='DIVISION'&&String(r.referencia)===base);
 if(!kids.length)throw Error('No hay partes activas de esa división.');
 try{const imp=ocTable_('OC_FINANZAS_ID','IMPUTACIONES_SUELDO').rows;if(kids.some(k=>imp.some(x=>ocProd_(x)&&String(x.movimiento_id)===String(k.movimiento_id))))throw Error('IMP');}catch(e){if(e.message==='IMP')throw Error('Quita las imputaciones de las partes en Liquidaciones antes de unir.');}
 const parents=t.rows.filter(r=>String(r.movimiento_id)===base&&r.ambiente==='PRODUCCION');if(parents.length!==1)throw Error('No se encontró el movimiento original.');
 const parent=parents[0];
 osAudit_(actor,'UNIR_DIVISION','MOVIMIENTOS_BANCARIOS',base,{partes:kids.map(k=>k.movimiento_id)});
 kids.forEach(k=>ocPatchRow_(t,k._row,ocBump_(k,actor,{estado_registro:'ANULADO'})));
 const pp=ocBump_(parent,actor,{estado_registro:'ACTIVO'});if(t.headers.indexOf('observacion')>=0)pp.observacion='';
 ocPatchRow_(t,parent._row,pp);
 return {parent:ocSlimMov_(Object.assign({},parent,pp)),removed:kids.map(k=>String(k.movimiento_id))};
}

function ocExtrasExtra_(p,actor){
 if(p.action==='settings')return ocSettings_();
 if(p.action==='saveSettings')return ocSaveSettings_(p,actor);
 if(p.action==='movEdit')return ocMovEdit_(p,actor);
 if(p.action==='movVoid')return ocMovVoid_(p,actor);
 if(p.action==='movSplit')return ocMovSplit_(p,actor);
 if(p.action==='movUnsplit')return ocMovUnsplit_(p,actor);
 return undefined;
}
