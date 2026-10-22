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
