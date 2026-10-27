// Oportunicars · Atajo de registro rápido, confirmación de importe y macheo (la dirección ya está en osDirection_).
// Archivo NUEVO: crear 'Atajo.gs' y pegar todo. Luego, en doPost, antes de throw Error('Acción desconocida.'), agregar:
//   if(typeof ocExtra_==='function'){const x=ocExtra_(p,current);if(x!==undefined)return ocJson_({ok:true,data:x});}
// Y en OC_MOV_FIELDS (Carga.gs) agregar: 'estado_importacion','origen','observacion','created_at'.
const OC_ATAJO_FIELDS=['movimiento_id','cuenta_id','fecha_operacion','monto','direccion','descripcion','referencia','monto_confirmado','incluir_en_saldo','version','concepto_id','concepto_nombre','concepto_version','categoria','naturaleza','tipo_costo','recurrente','operacion_auto','vehiculo_id','estado_clasificacion','estado_fuente','tipo_fuente','estado_importacion','origen','observacion','created_at','ambiente','estado_registro'];

function ocExtra_(p,actor){
 if(p.action==='quickData')return ocQuickData_();
 if(p.action==='confirmAmount')return ocConfirmAmount_(p,actor);
 if(p.action==='quick')return ocQuick_(p,actor);
 if(p.action==='quickMatch')return ocQuickMatch_(p,actor);
 if(p.action==='unassign')return ocUnassign_(p,actor);
 if(p.action==='flipDirection')return ocFlipDirection_(p,actor);
 if(p.action==='manualAdd')return ocManualAdd_(p,actor);
 if(p.action==='manualVoid')return ocManualVoid_(p,actor);
 if(p.action==='quickEdit')return ocQuickEdit_(p,actor);
 if(p.action==='quickVoid')return ocQuickVoid_(p,actor);
 if(p.action==='syncMercadoPago')return osMpSync_(p,actor);
 if(p.action==='saveMpToken')return osMpSaveToken_(p,actor);
 if(typeof ocLiqExtra_==='function'){const x=ocLiqExtra_(p,actor);if(x!==undefined)return x;}
 if(typeof ocSociosExtra_==='function'){const x=ocSociosExtra_(p,actor);if(x!==undefined)return x;}
 if(typeof ocExtrasExtra_==='function'){const x=ocExtrasExtra_(p,actor);if(x!==undefined)return x;}
 return undefined;
}
function ocToday_(){return Utilities.formatDate(new Date(),'America/Santiago','yyyy-MM-dd');}
function ocIsCash_(a){return String(a.tipo||'').toUpperCase()==='EFECTIVO'||/caja|efectivo/i.test(String(a.nombre||''));}
function ocMovRow_(t,id){const m=t.rows.filter(r=>r.movimiento_id===id&&ocProd_(r));if(m.length!==1)throw Error('Movimiento no encontrado o duplicado.');return m[0];}
function ocBump_(r,actor,patch){return Object.assign(patch,{updated_at:new Date().toISOString(),updated_by:actor.id,version:Number(r.version||1)+1});}
function ocSlimMov_(r){const o={};OC_ATAJO_FIELDS.forEach(k=>{if(r[k]!==undefined&&r[k]!==null)o[k]=(r[k] instanceof Date)?Utilities.formatDate(r[k],'America/Santiago','yyyy-MM-dd'):r[k];});return o;}

// Datos livianos para la página del atajo (conceptos, autos y cuentas).
function ocQuickData_(){
 const m='OC_MAESTROS_ID';
 return {
  concepts:ocTable_(m,'CONCEPTOS_CAJA').rows.filter(r=>r.habilitado==='SI').map(ocConcept_),
  inventory:ocTable_(m,'VEHICULOS').rows.filter(ocProd_).map(r=>({id:String(r.vehiculo_id),patente:String(r.patente||''),marca:String(r.marca||''),modelo:String(r.modelo||''),version:String(r.version_vehiculo||'')})),
  accounts:ocTable_(m,'CUENTAS_FINANCIERAS').rows.filter(ocProd_).map(r=>({id:String(r.cuenta_id),nombre:String(r.nombre),tipo:String(r.tipo||''),efectivo:ocIsCash_(r)})),
  today:ocToday_()
 };
}
function ocConfirmAmount_(p,actor){
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),r=ocMovRow_(t,p.id);
 if(Number(r.version||1)!==p.expectedVersion)throw Error('El movimiento cambió. Recarga antes de guardar.');
 if(typeof r.monto!=='number'||r.monto<0)throw Error('El movimiento no tiene un importe válido.');
 if(['ENTRADA','SALIDA'].indexOf(r.direccion)<0)throw Error('Define primero si fue ingreso o egreso.');
 const patch=ocBump_(r,actor,{monto_confirmado:'SI',incluir_en_saldo:'SI'});ocPatchRow_(t,r._row,patch);return {version:patch.version};
}
// Validación pura (probada en tests): devuelve el registro normalizado o lanza error.
function ocQuickValidate_(p,concept,account,vehicle,today){
 if(!/^[-\w]{8,60}$/.test(String(p.requestId||'')))throw Error('Solicitud inválida.');
 const amount=Number(p.amount);if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000000)throw Error('Ingresa un monto válido.');
 if(['ENTRADA','SALIDA'].indexOf(p.direction)<0)throw Error('Indica si entró o salió dinero.');
 if(!account)throw Error('Cuenta no encontrada.');
 if(p.conceptId&&!concept)throw Error('Concepto no disponible.');
 if(concept&&(p.direction==='ENTRADA'&&['GASTO','COSTO'].indexOf(concept.nature)>=0||p.direction==='SALIDA'&&concept.nature==='INGRESO'))throw Error('El concepto no corresponde a si entró o salió dinero.');
 if(concept&&concept.vehicleOperation&&p.vehicleId&&!vehicle)throw Error('Auto no encontrado.');
 let date=String(p.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today||date<new Date(Date.parse(today)-60*86400000).toISOString().slice(0,10))date=today;
 return {amount:amount,direction:p.direction,date:date,vehicleId:concept&&concept.vehicleOperation?(vehicle?vehicle.id:''):'',note:String(p.note||'').slice(0,120)};
}
function ocQuick_(p,actor){
 const fin=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),maestros='OC_MAESTROS_ID';
 const concepts=ocTable_(maestros,'CONCEPTOS_CAJA').rows.filter(c=>c.concepto_id===p.conceptId&&c.habilitado==='SI');
 const concept=concepts.length===1?ocConcept_(concepts[0]):null;if(concept)ocValidateConcept_(concept);
 const C=concept||{id:'',name:'',version:'',category:'',nature:'',cost:'',recurring:false,vehicleOperation:''};
 const accounts=ocTable_(maestros,'CUENTAS_FINANCIERAS').rows.filter(a=>a.cuenta_id===p.accountId&&ocProd_(a)),account=accounts.length===1?accounts[0]:null;
 const cars=p.vehicleId?ocTable_(maestros,'VEHICULOS').rows.filter(v=>String(v.vehiculo_id)===String(p.vehicleId)&&ocProd_(v)):[],car=cars.length===1?{id:String(cars[0].vehiculo_id),patente:String(cars[0].patente||'')}:null;
 const q=ocQuickValidate_(p,concept,account,car,ocToday_());
 const id='ATJ-'+osHash_('atajo|'+p.requestId).slice(0,24),existing=fin.rows.filter(r=>r.movimiento_id===id);
 if(existing.length)return ocSlimMov_(existing[0]);
 const cash=ocIsCash_(account),now=new Date().toISOString();
 const row={movimiento_id:id,cuenta_id:String(account.cuenta_id),fecha_operacion:q.date,moneda:'CLP',direccion:q.direction,monto:q.amount,descripcion:[concept?concept.name:'Por asignar',car&&car.patente,q.note].filter(Boolean).join(' · '),hash_origen:'ATAJO|'+p.requestId,ambiente:'PRODUCCION',estado_registro:'ACTIVO',origen:'MANUAL',calidad:'CONFIRMADO',version:1,created_at:now,created_by:actor.id,updated_at:now,updated_by:actor.id,
  monto_confirmado:cash?'SI':'NO',incluir_en_saldo:cash?'SI':'NO',tipo_fuente:'atajo',estado_importacion:'ATAJO',concepto_id:C.id,concepto_nombre:C.name,concepto_version:C.version,categoria:C.category,naturaleza:C.nature,tipo_costo:C.cost,recurrente:concept?(C.recurring?'SI':'NO'):'',operacion_auto:C.vehicleOperation,vehiculo_id:q.vehicleId,estado_clasificacion:!concept?'PENDIENTE':C.vehicleOperation&&!q.vehicleId?'POR_ASIGNAR_AUTO':'CLASIFICADO'};
 ocPatchRow_(fin,fin.sheet.getLastRow()+1,row);return ocSlimMov_(row);
}
// Une un gasto registrado por atajo con el movimiento que llegó del banco o Mercado Pago (misma cuenta, importe y dirección).
function ocQuickMatch_(p,actor){
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),q=ocMovRow_(t,p.quickId),x=ocMovRow_(t,p.targetId);
 if(q.estado_importacion!=='ATAJO')throw Error('El registro rápido ya no está pendiente.');
 if(x.estado_importacion==='ATAJO'||x.concepto_id)throw Error('El movimiento ya está clasificado.');
 if(Number(x.version||1)!==p.expectedVersion)throw Error('El movimiento cambió. Recarga antes de guardar.');
 if(String(q.cuenta_id)!==String(x.cuenta_id)||Number(q.monto)!==Number(x.monto)||(x.direccion&&x.direccion!==q.direccion))throw Error('Cuenta, importe o dirección no coinciden.');
 const copy={direccion:q.direccion,concepto_id:q.concepto_id,concepto_nombre:q.concepto_nombre,concepto_version:q.concepto_version,categoria:q.categoria,naturaleza:q.naturaleza,tipo_costo:q.tipo_costo,recurrente:q.recurrente,operacion_auto:q.operacion_auto,vehiculo_id:q.vehiculo_id,estado_clasificacion:q.estado_clasificacion,monto_confirmado:'SI',incluir_en_saldo:'SI',observacion:'Macheado con registro rápido '+q.movimiento_id};
 const tp=ocBump_(x,actor,copy),qp=ocBump_(q,actor,{estado_registro:'ANULADO',estado_importacion:'MACHEADO',observacion:'Macheado con '+x.movimiento_id});
 ocPatchRow_(t,x._row,tp);ocPatchRow_(t,q._row,qp);
 return {quickId:q.movimiento_id,target:ocSlimMov_(Object.assign({},x,tp))};
}

// Deshace la asignación de un movimiento: vuelve a «Por completar» (sin concepto, auto ni confirmación) y queda auditado.
function ocUnassign_(p,actor){
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),r=ocMovRow_(t,p.id);
 if(Number(r.version||1)!==p.expectedVersion)throw Error('El movimiento cambió. Recarga antes de guardar.');
 if(r.estado_importacion==='ATAJO')throw Error('Un registro rápido no se deshace aquí.');
 const clear={concepto_id:'',concepto_nombre:'',concepto_version:'',categoria:'',naturaleza:'',tipo_costo:'',recurrente:'',operacion_auto:'',vehiculo_id:'',estado_clasificacion:'PENDIENTE',actividad_id:'',proyeccion_id:'',prestamo_id:'',componente_prestamo:'',socio:'',aporte_id:'',monto_confirmado:'NO',incluir_en_saldo:'NO'};
 const before={concepto:r.concepto_id,vehiculo:r.vehiculo_id,socio:r.socio,confirmado:r.monto_confirmado,version:r.version};
 const patch=ocBump_(r,actor,clear);
 if(typeof osAudit_==='function')osAudit_(actor,'DESHACER_ASIGNACION','MOVIMIENTOS_BANCARIOS',p.id,before);
 ocPatchRow_(t,r._row,patch);return {version:patch.version};
}
// Cambio manual de ingreso/egreso (rueda de cada movimiento). Si el concepto asignado ya no corresponde, se deshace la asignación.
function ocFlipDirection_(p,actor){
 if(['ENTRADA','SALIDA'].indexOf(p.direction)<0)throw Error('Selecciona ingreso o egreso.');
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),r=ocMovRow_(t,p.id);
 if(Number(r.version||1)!==p.expectedVersion)throw Error('El movimiento cambió. Recarga antes de guardar.');
 if(r.estado_importacion==='ATAJO')throw Error('Un registro rápido no se cambia aquí.');
 if(r.direccion===p.direction)return {version:Number(r.version||1),direction:p.direction};
 const nat=String(r.naturaleza||''),choca=!!r.concepto_id&&(p.direction==='ENTRADA'&&['COSTO','GASTO'].indexOf(nat)>=0||p.direction==='SALIDA'&&nat==='INGRESO');
 const clear=choca?{concepto_id:'',concepto_nombre:'',concepto_version:'',categoria:'',naturaleza:'',tipo_costo:'',recurrente:'',operacion_auto:'',vehiculo_id:'',estado_clasificacion:'PENDIENTE',actividad_id:'',proyeccion_id:'',prestamo_id:'',componente_prestamo:'',socio:'',aporte_id:'',monto_confirmado:'NO',incluir_en_saldo:'NO'}:{};
 const patch=ocBump_(r,actor,Object.assign({direccion:p.direction},clear));
 if(typeof osAudit_==='function')osAudit_(actor,'CAMBIAR_DIRECCION','MOVIMIENTOS_BANCARIOS',p.id,{antes:r.direccion,despues:p.direction,concepto_deshecho:choca?r.concepto_id:''});
 ocPatchRow_(t,r._row,patch);return {version:patch.version,direction:p.direction,desclasificado:choca};
}
// Saldos iniciales de la caja cuadrada: se fijan UNA vez y no se vuelven a modificar (solo se escriben si la cuenta no tiene saldo).
function fijarSaldosIniciales(){
 const t=ocTable_('OC_MAESTROS_ID','CUENTAS_FINANCIERAS'),fecha='2026-10-15',out=[];
 t.rows.filter(ocProd_).forEach(r=>{
  const nombre=String(r.nombre||''),vacio=r.saldo_inicial===''||r.saldo_inicial===null||r.saldo_inicial===undefined;
  if(!vacio){out.push(nombre+': ya tenía saldo inicial, no se toca');return;}
  const monto=/mercado/i.test(nombre)?3402265:/^\s*caja\s*$/i.test(nombre)?5040000:0;
  ocPatchRow_(t,r._row,{saldo_inicial:monto,fecha_saldo_inicial:fecha,version:Number(r.version||1)+1,updated_at:new Date().toISOString(),updated_by:'saldos-iniciales-2026-10-15'});
  out.push(nombre+': '+monto);
 });
 console.log(JSON.stringify(out));
}

// ---- Administrar: movimientos a mano (respaldo de las importaciones automáticas). Solo el usuario Alex. ----
function ocIsAdminUser_(actor){return String(actor&&actor.name||'').trim().toLowerCase()==='alex';}
// Validación pura de una línea manual (probada en tests).
function ocManualValidate_(r,today){
 const amount=Number(r.amount);if(!Number.isSafeInteger(amount)||amount<=0||amount>10000000000)throw Error('Monto inválido.');
 if(['ENTRADA','SALIDA'].indexOf(r.direction)<0)throw Error('Indica si entró o salió dinero.');
 const date=String(r.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(Date.parse(date))||date>today||date<'2024-01-01')throw Error('Fecha inválida: '+date);
 const description=String(r.description||'').trim().slice(0,200);if(!description)throw Error('Falta la descripción.');
 return {amount:amount,direction:r.direction,date:date,description:description};
}
function ocManualAdd_(p,actor){
 if(!ocIsAdminUser_(actor))throw Error('Solo el administrador de la caja puede registrar movimientos a mano.');
 if(!/^[-\w]{8,60}$/.test(String(p.requestId||'')))throw Error('Solicitud inválida.');
 if(!Array.isArray(p.rows)||!p.rows.length||p.rows.length>60)throw Error('Envía entre 1 y 60 movimientos.');
 const maestros='OC_MAESTROS_ID',fin=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),today=ocToday_();
 const accounts=ocTable_(maestros,'CUENTAS_FINANCIERAS').rows.filter(a=>a.cuenta_id===p.accountId&&ocProd_(a));if(accounts.length!==1)throw Error('Cuenta no encontrada.');
 const concepts=ocTable_(maestros,'CONCEPTOS_CAJA').rows.filter(c=>c.habilitado==='SI'),cars=ocTable_(maestros,'VEHICULOS').rows.filter(ocProd_);
 const out=[],now=new Date().toISOString();
 const prepared=p.rows.map((r,i)=>{
  const q=ocManualValidate_(r,today);let C=null,car='';
  if(r.conceptId){const m=concepts.filter(c=>c.concepto_id===r.conceptId);if(m.length!==1)throw Error('Concepto no disponible en la línea '+(i+1)+'.');C=ocConcept_(m[0]);
   if(q.direction==='ENTRADA'&&['GASTO','COSTO'].indexOf(C.nature)>=0||q.direction==='SALIDA'&&C.nature==='INGRESO')throw Error('El concepto no corresponde a la dirección en la línea '+(i+1)+'.');
   if(C.vehicleOperation&&r.vehicleId){if(cars.filter(v=>String(v.vehiculo_id)===String(r.vehicleId)).length!==1)throw Error('Auto no encontrado en la línea '+(i+1)+'.');car=String(r.vehicleId);}}
  return {q:q,C:C,car:car,id:'MAN-'+osHash_('manual|'+p.requestId+'|'+i).slice(0,24)};
 });
 prepared.forEach(x=>{
  const ex=fin.rows.filter(r=>r.movimiento_id===x.id);if(ex.length){out.push(ocSlimMov_(ex[0]));return;}
  const C=x.C||{id:'',name:'',version:'',category:'',nature:'',cost:'',recurring:false,vehicleOperation:''};
  const row={movimiento_id:x.id,cuenta_id:String(p.accountId),fecha_operacion:x.q.date,moneda:'CLP',direccion:x.q.direction,monto:x.q.amount,descripcion:x.q.description,hash_origen:'MANUAL|'+x.id,ambiente:'PRODUCCION',estado_registro:'ACTIVO',origen:'MANUAL',calidad:'CONFIRMADO',version:1,created_at:now,created_by:actor.id,updated_at:now,updated_by:actor.id,
   monto_confirmado:'SI',incluir_en_saldo:'SI',tipo_fuente:'manual',estado_importacion:'MANUAL',concepto_id:C.id,concepto_nombre:C.name,concepto_version:C.version,categoria:C.category,naturaleza:C.nature,tipo_costo:C.cost,recurrente:x.C?(C.recurring?'SI':'NO'):'',operacion_auto:C.vehicleOperation,vehiculo_id:x.car,estado_clasificacion:!x.C?'PENDIENTE':C.vehicleOperation&&!x.car?'POR_ASIGNAR_AUTO':'CLASIFICADO'};
  ocPatchRow_(fin,fin.sheet.getLastRow()+1,row);fin.rows.push(row);out.push(ocSlimMov_(row));
 });
 if(typeof osAudit_==='function')osAudit_(actor,'MOVIMIENTOS_MANUALES','MOVIMIENTOS_BANCARIOS',String(p.requestId),{cuenta:p.accountId,cantidad:out.length});
 return out;
}
function ocManualVoid_(p,actor){
 if(!ocIsAdminUser_(actor))throw Error('Solo el administrador de la caja puede anular movimientos manuales.');
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),r=ocMovRow_(t,p.id);
 if(r.estado_importacion!=='MANUAL')throw Error('Solo se anulan movimientos ingresados a mano.');
 if(typeof osAudit_==='function')osAudit_(actor,'ANULAR_MANUAL','MOVIMIENTOS_BANCARIOS',p.id,{monto:r.monto,descripcion:r.descripcion});
 ocPatchRow_(t,r._row,ocBump_(r,actor,{estado_registro:'ANULADO'}));return {id:p.id};
}

// ---- Corregir o anular un atajo mal ingresado. Solo el administrador (Alex). ----
function ocQuickRow_(t,p){const r=ocMovRow_(t,p.id);if(r.estado_importacion!=='ATAJO')throw Error('Solo se corrigen movimientos registrados por atajo.');if(Number(r.version||1)!==Number(p.expectedVersion))throw Error('El atajo cambió. Recarga antes de guardar.');return r;}
function ocQuickEdit_(p,actor){
 if(!ocIsAdminUser_(actor))throw Error('Solo el administrador puede corregir atajos.');
 const m='OC_MAESTROS_ID',fin=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),r=ocQuickRow_(fin,p);
 const q=ocManualValidate_({amount:p.amount,direction:p.direction,date:p.date,description:'atajo'},ocToday_());
 const accounts=ocTable_(m,'CUENTAS_FINANCIERAS').rows.filter(a=>a.cuenta_id===p.accountId&&ocProd_(a));if(accounts.length!==1)throw Error('Cuenta no encontrada.');const account=accounts[0];
 let C=null;if(p.conceptId){const cs=ocTable_(m,'CONCEPTOS_CAJA').rows.filter(c=>c.concepto_id===p.conceptId&&c.habilitado==='SI');if(cs.length!==1)throw Error('Concepto no disponible.');C=ocConcept_(cs[0]);ocValidateConcept_(C);
  if(q.direction==='ENTRADA'&&['GASTO','COSTO'].indexOf(C.nature)>=0||q.direction==='SALIDA'&&C.nature==='INGRESO')throw Error('El concepto no corresponde a si entró o salió dinero.');}
 let car=null;if(C&&C.vehicleOperation&&p.vehicleId){const vs=ocTable_(m,'VEHICULOS').rows.filter(v=>String(v.vehiculo_id)===String(p.vehicleId)&&ocProd_(v));if(vs.length!==1)throw Error('Auto no encontrado.');car={id:String(vs[0].vehiculo_id),patente:String(vs[0].patente||'')};}
 const note=String(p.note||'').trim().slice(0,120),cash=ocIsCash_(account),E={id:'',name:'',version:'',category:'',nature:'',cost:'',recurring:false,vehicleOperation:''},K=C||E;
 const patch=ocBump_(r,actor,{cuenta_id:String(account.cuenta_id),fecha_operacion:q.date,direccion:q.direction,monto:q.amount,descripcion:[C?C.name:'Por asignar',car&&car.patente,note].filter(Boolean).join(' · '),
  monto_confirmado:cash?'SI':'NO',incluir_en_saldo:cash?'SI':'NO',concepto_id:K.id,concepto_nombre:K.name,concepto_version:K.version,categoria:K.category,naturaleza:K.nature,tipo_costo:K.cost,recurrente:C?(K.recurring?'SI':'NO'):'',operacion_auto:K.vehicleOperation,vehiculo_id:car?car.id:'',estado_clasificacion:!C?'PENDIENTE':K.vehicleOperation&&!car?'POR_ASIGNAR_AUTO':'CLASIFICADO'});
 if(typeof osAudit_==='function')osAudit_(actor,'CORREGIR_ATAJO','MOVIMIENTOS_BANCARIOS',p.id,{antes:ocSlimMov_(r),despues:patch});
 ocPatchRow_(fin,r._row,patch);return ocSlimMov_(Object.assign({},r,patch));
}
function ocQuickVoid_(p,actor){
 if(!ocIsAdminUser_(actor))throw Error('Solo el administrador puede anular atajos.');
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),r=ocQuickRow_(t,p);
 if(typeof osAudit_==='function')osAudit_(actor,'ANULAR_ATAJO','MOVIMIENTOS_BANCARIOS',p.id,{monto:r.monto,descripcion:r.descripcion});
 ocPatchRow_(t,r._row,ocBump_(r,actor,{estado_registro:'ANULADO'}));return {id:p.id};
}
