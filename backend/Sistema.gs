// Oportunicars — Sistema de Gestión. Business data stays in Google.
const OC_SYSTEM_TABLES={
 VEHICULOS:{book:'OC_MAESTROS_ID',key:'vehiculo_id',fields:['vehiculo_id','patente','marca','modelo','anio']},
 AUTOS_OPERACION:{book:'OC_OPERACIONES_ID',key:'vehiculo_id',fields:['vehiculo_id','modalidad','fecha_ingreso','estado_auto','costo_compra','fecha_venta','precio_venta','comision_consignacion','notas']},
 ACTIVIDADES_AUTOS:{book:'OC_OPERACIONES_ID',key:'actividad_id',fields:['actividad_id','vehiculo_id','fecha','tipo','descripcion','dias','costo','estado']},
 COSTOS_FIJOS:{book:'OC_FINANZAS_ID',key:'costo_fijo_id',fields:['costo_fijo_id','nombre','concepto_id','monto_mensual','dia_pago','habilitado']},
 PROYECCIONES:{book:'OC_FINANZAS_ID',key:'proyeccion_id',fields:['proyeccion_id','fecha','direccion','tipo','descripcion','vehiculo_id','monto']},
 PRESTAMOS:{book:'OC_FINANZAS_ID',key:'prestamo_id',fields:['prestamo_id','nombre','sentido','saldo_inicial','fecha_saldo','fecha_vencimiento']},
 APORTES_CAPITAL_SOCIOS:{book:'OC_FINANZAS_ID',key:'aporte_id',fields:['aporte_id','socio','movimiento_id','fecha','moneda','monto','estado']},
 PERFILES_IMPORTACION:{book:'OC_CONTROL_ID',key:'perfil_id',fields:['perfil_id','nombre','cuenta_id','version','mapeo_json','modo_importe','formato_fecha','estado_efectivo','habilitado']},
 AUDITORIA_SISTEMA:{book:'OC_CONTROL_ID',key:'evento_id',fields:['evento_id','fecha','actor_id','accion','tabla','registro_id','detalle']}
};
const OC_META=['ambiente','estado_registro','version','created_at','created_by','updated_at','updated_by'];
function osHeaders_(name){return Array.from(new Set(OC_SYSTEM_TABLES[name].fields.concat(OC_META)));}
function osTable_(name){if(!OC_SYSTEM_TABLES[name])throw Error('Tabla no permitida.');return ocTable_(OC_SYSTEM_TABLES[name].book,name);}
function osDate_(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;}
function osClean_(r){const x={};Object.keys(r).forEach(k=>{if(k!=='_row')x[k]=r[k] instanceof Date?Utilities.formatDate(r[k],'America/Santiago','yyyy-MM-dd'):r[k];});return x;}
function osRows_(name){return osTable_(name).rows.filter(ocProd_).map(osClean_);}
function osFinance_(actor){return actor.manage||actor.role==='finanzas';}
function osData_(actor){
 const financial=true;
 const d={inventory:ocTable_('OC_MAESTROS_ID','VEHICULOS').rows.filter(ocProd_).map(osClean_),operations:osRows_('AUTOS_OPERACION'),activities:osRows_('ACTIVIDADES_AUTOS'),movements:ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS').rows.filter(ocProd_).map(osClean_),accounts:ocTable_('OC_MAESTROS_ID','CUENTAS_FINANCIERAS').rows.filter(ocProd_).map(osClean_),fixed:financial?osRows_('COSTOS_FIJOS'):[],forecasts:financial?osRows_('PROYECCIONES'):[],loans:financial?osRows_('PRESTAMOS'):[]};
 d.companyStart=PropertiesService.getScriptProperties().getProperty('OC_FECHA_CREACION')||'';
 const today=Utilities.formatDate(new Date(),'America/Santiago','yyyy-MM-dd');
 const result=OCSystemCore.reports(d,today);
 return {inventory:d.inventory,operations:d.operations,activities:d.activities,fixed:d.fixed,forecasts:d.forecasts,loans:d.loans,accounts:financial?d.accounts:[],canFinance:financial,report:financial?result:{today,cars:result.cars,unclassified:result.unclassified},links:{forecasts:osRows_('PROYECCIONES').map(f=>({proyeccion_id:f.proyeccion_id,fecha:f.fecha,direccion:f.direccion,descripcion:f.descripcion,vehiculo_id:f.vehiculo_id})),loans:osRows_('PRESTAMOS').map(l=>({prestamo_id:l.prestamo_id,nombre:l.nombre}))},sync:PropertiesService.getScriptProperties().getProperty('OC_CLAXO_LAST_SYNC')||null};
}
// ---- Carga única para la web (v5) ----
// Lee cada hoja UNA vez y devuelve filas livianas. La web calcula los reportes localmente.
const OC_MOV_FIELDS=['movimiento_id','cuenta_id','fecha_operacion','monto','direccion','descripcion','referencia','monto_confirmado','incluir_en_saldo','version','concepto_id','concepto_nombre','concepto_version','categoria','naturaleza','tipo_costo','recurrente','operacion_auto','vehiculo_id','estado_clasificacion','actividad_id','proyeccion_id','prestamo_id','componente_prestamo','socio','saldo_cartola','operacion_origen_id','ambiente','estado_registro'];
function osSlim_(r,fields){const x=osClean_(r),o={};fields.forEach(k=>{if(x[k]!==undefined)o[k]=x[k];});return o;}
function osLoad_(actor){
 const maestros='OC_MAESTROS_ID',prod=(book,name)=>ocTable_(book,name).rows.filter(ocProd_);
 return {
  profile:actor,
  inventory:prod(maestros,'VEHICULOS').map(osClean_),operations:osRows_('AUTOS_OPERACION'),activities:osRows_('ACTIVIDADES_AUTOS'),forecasts:osRows_('PROYECCIONES'),loans:osRows_('PRESTAMOS'),accounts:prod(maestros,'CUENTAS_FINANCIERAS').map(osClean_),
  concepts:ocTable_(maestros,'CONCEPTOS_CAJA').rows.filter(r=>r.habilitado==='SI').map(ocConcept_),
  movements:prod('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS').map(r=>osSlim_(r,OC_MOV_FIELDS)),
  companyStart:PropertiesService.getScriptProperties().getProperty('OC_FECHA_CREACION')||'',
  sync:PropertiesService.getScriptProperties().getProperty('OC_CLAXO_LAST_SYNC')||null,
  today:Utilities.formatDate(new Date(),'America/Santiago','yyyy-MM-dd')
 };
}
// Tras sincronizar Claxo solo cambia el inventario: se pide únicamente esa hoja.
function osInventory_(){return {inventory:ocTable_('OC_MAESTROS_ID','VEHICULOS').rows.filter(ocProd_).map(osClean_),sync:PropertiesService.getScriptProperties().getProperty('OC_CLAXO_LAST_SYNC')||null};}
function osEnsure_(book,name,headers){
 let sheet=book.getSheetByName(name);if(!sheet)sheet=book.insertSheet(name);
 const width=sheet.getLastColumn(),old=width?sheet.getRange(1,1,1,width).getValues()[0].map(String):[];
 if(new Set(old.filter(Boolean)).size!==old.filter(Boolean).length)throw Error('Encabezados duplicados: '+name);
 const extra=headers.filter(h=>old.indexOf(h)<0);
 if(extra.length){const end=width+extra.length;if(sheet.getMaxColumns()<end)sheet.insertColumnsAfter(sheet.getMaxColumns(),end-sheet.getMaxColumns());sheet.getRange(1,width+1,1,extra.length).setValues([extra]);}
 sheet.setFrozenRows(1);return sheet;
}
function prepararSistemaOportunicars(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('Sistema ocupado.');
 try {
  Object.keys(OC_SYSTEM_TABLES).forEach(n=>osEnsure_(SpreadsheetApp.openById(ocProperty_(OC_SYSTEM_TABLES[n].book)),n,osHeaders_(n)));
  const masters=SpreadsheetApp.openById(ocProperty_('OC_MAESTROS_ID')),finance=SpreadsheetApp.openById(ocProperty_('OC_FINANZAS_ID'));
  osEnsure_(masters,'VEHICULOS',['claxo_estado','claxo_presente','claxo_actualizado_at','precio_publicado','imagen_url']);
  osEnsure_(masters,'CONCEPTOS_CAJA',['concepto_id','nombre','categoria','naturaleza','tipo_costo','recurrente','operacion_auto','habilitado','version']);
  osEnsure_(finance,'MOVIMIENTOS_BANCARIOS',['concepto_id','concepto_nombre','concepto_version','categoria','naturaleza','tipo_costo','recurrente','operacion_auto','vehiculo_id','estado_clasificacion','perfil_id','perfil_version','fuente_fila','origen_json','prestamo_id','componente_prestamo','aporte_id','actividad_id','proyeccion_id','socio','estado_importacion']);
  const concepts=ocTable_('OC_MAESTROS_ID','CONCEPTOS_CAJA');
  [['TRANSFERENCIA','Transferencia entre cuentas','TRANSFERENCIA'],['APORTE_CAPITAL','Aporte de capital de socio','APORTE_CAPITAL'],['PRESTAMO','Préstamo: principal o interés','PRESTAMO']].forEach(x=>{if(!concepts.rows.some(c=>c.concepto_id===x[0]))ocPatchRow_(concepts,concepts.sheet.getLastRow()+1,{concepto_id:x[0],nombre:x[1],categoria:x[2],naturaleza:x[2],tipo_costo:'NO_APLICA',recurrente:'NO',operacion_auto:'',habilitado:'SI',version:1});});
  SpreadsheetApp.flush();return {ok:true,estructura:revisarEstructuraCaja(),tablas:Object.keys(OC_SYSTEM_TABLES)};
 }finally{lock.releaseLock();}
}
function osAudit_(actor,action,table,id,detail){
 const t=osTable_('AUDITORIA_SISTEMA');
 ocPatchRow_(t,t.sheet.getLastRow()+1,{evento_id:Utilities.getUuid(),fecha:new Date().toISOString(),actor_id:actor.id,accion:action,tabla:table,registro_id:id,detalle:JSON.stringify(detail).slice(0,15000),ambiente:'PRODUCCION',estado_registro:'ACTIVO'});
}
function osSave_(p,actor){
 const table=p.table,allowed=['VEHICULOS','AUTOS_OPERACION','ACTIVIDADES_AUTOS','COSTOS_FIJOS','PROYECCIONES','PRESTAMOS'];
 if(allowed.indexOf(table)<0)throw Error('Registro no permitido.');
 if(['VEHICULOS','AUTOS_OPERACION','ACTIVIDADES_AUTOS','PROYECCIONES','PRESTAMOS'].indexOf(table)<0&&!osFinance_(actor))throw Error('Se requiere acceso financiero.');
 const def=OC_SYSTEM_TABLES[table],input=p.record||{},patch={};
 def.fields.forEach(k=>{const v=input[k]===undefined?'':input[k];if(!['string','number'].includes(typeof v)||String(v).length>2000)throw Error('Valor inválido: '+k);patch[k]=typeof v==='string'?v.trim():v;});
 const id=patch[def.key]||p.requestId;if(typeof id!=='string'||!/^[\w-]{1,100}$/.test(id))throw Error('Identificador inválido.');patch[def.key]=id;
 ['fecha','fecha_ingreso','fecha_venta','fecha_saldo','fecha_vencimiento'].forEach(k=>{if(patch[k]&&!osDate_(patch[k]))throw Error('Fecha inválida: '+k);});
 ['costo_compra','precio_venta','comision_consignacion','costo','dias','monto_mensual','monto','saldo_inicial','dia_pago'].forEach(k=>{if(patch[k]!==undefined&&patch[k]!==''){const v=Number(patch[k]);if(!Number.isSafeInteger(v)||v<0)throw Error('Importe o cantidad inválida: '+k);patch[k]=v;}});
 const enums={modalidad:['PROPIO','CONSIGNADO'],estado_auto:['PREPARACION','DISPONIBLE','RESERVADO','VENDIDO','RETIRADO'],tipo:table==='ACTIVIDADES_AUTOS'?['ESTACIONAMIENTO','ARREGLO','LIMPIEZA','FOTOS','OTRO']:['CUOTA_VENTA','INGRESO_ESPERADO','DEUDA','CONSIGNACION','GASTO_PREVISTO','SERVICIO_30_DIAS'],direccion:['ENTRADA','SALIDA'],sentido:['RECIBIDO','OTORGADO'],habilitado:['SI','NO'],estado:['PENDIENTE','EN_CURSO','HECHO']};
 Object.keys(enums).forEach(k=>{if(patch[k]!==undefined&&patch[k]!==''&&enums[k].indexOf(patch[k])<0)throw Error('Opción inválida: '+k);});
 const required={VEHICULOS:['patente','marca','modelo'],AUTOS_OPERACION:['modalidad','fecha_ingreso','estado_auto'],ACTIVIDADES_AUTOS:['vehiculo_id','fecha','tipo','estado'],COSTOS_FIJOS:['nombre','monto_mensual','dia_pago','habilitado'],PROYECCIONES:['fecha','direccion','tipo','descripcion','monto'],PRESTAMOS:['nombre','sentido','saldo_inicial','fecha_saldo']}[table];
 required.forEach(k=>{if(patch[k]==='')throw Error('Completa '+k);});
 if(patch.dia_pago!==undefined&&(patch.dia_pago<1||patch.dia_pago>28))throw Error('Día de pago entre 1 y 28.');
 if(table!=='VEHICULOS'&&patch.vehiculo_id&&ocInventory_().filter(v=>v.id===patch.vehiculo_id).length!==1)throw Error('Auto no encontrado.');
 if(table==='AUTOS_OPERACION'&&patch.estado_auto==='VENDIDO'&&(!patch.fecha_venta||patch.precio_venta===''))throw Error('Completa fecha y precio de venta.');
 if(table==='VEHICULOS'&&ocInventory_().some(v=>v.id!==id&&v.patente.replace(/[^A-Z0-9]/gi,'').toUpperCase()===patch.patente.replace(/[^A-Z0-9]/gi,'').toUpperCase()))throw Error('La patente ya existe. Edita su ficha.');
 if(patch.fecha_venta&&patch.fecha_ingreso&&patch.fecha_venta<patch.fecha_ingreso)throw Error('La venta no puede preceder al ingreso.');
 if(table==='PROYECCIONES'&&patch.tipo==='CUOTA_VENTA'&&(patch.direccion!=='ENTRADA'||!patch.vehiculo_id))throw Error('Una cuota de venta requiere auto y entrada.');
 const t=osTable_(table),matches=t.rows.filter(r=>r[def.key]===id);
 if(matches.length>1)throw Error('Identificador duplicado.');
 const prior=matches[0];if(Number(prior?prior.version:0)!==p.expectedVersion)throw Error('El registro cambió. Recarga antes de guardar.');
 const now=new Date().toISOString();Object.assign(patch,{ambiente:'PRODUCCION',estado_registro:'ACTIVO',version:(prior?Number(prior.version):0)+1,created_at:prior?prior.created_at:now,created_by:prior?prior.created_by:actor.id,updated_at:now,updated_by:actor.id});
 // Audit intent precedes mutation; records the requested action even on failure.
 osAudit_(actor,'SOLICITUD_GUARDAR',table,id,{antes:prior?osClean_(prior):null,despues:patch});
 ocPatchRow_(t,prior?prior._row:t.sheet.getLastRow()+1,patch);return patch;
}
function osAccountSave_(p,actor){
 if(!osFinance_(actor))throw Error('Acceso financiero requerido.');
 if(!Number.isSafeInteger(p.balance)||!osDate_(p.date))throw Error('Saldo o fecha inválidos.');
 const t=ocTable_('OC_MAESTROS_ID','CUENTAS_FINANCIERAS'),rs=t.rows.filter(r=>r.cuenta_id===p.id&&ocProd_(r));if(rs.length!==1)throw Error('Cuenta no encontrada.');const r=rs[0];
 if(Number(r.version)!==p.expectedVersion)throw Error('La cuenta cambió.');
 const patch={saldo_inicial:p.balance,fecha_saldo_inicial:p.date,version:Number(r.version)+1,updated_at:new Date().toISOString(),updated_by:actor.id};
 osAudit_(actor,'SOLICITUD_SALDO','CUENTAS_FINANCIERAS',p.id,{antes:osClean_(r),despues:patch});ocPatchRow_(t,r._row,patch);return patch;
}
function osClaxo_(){
 const response=UrlFetchApp.fetch('https://oportunicars.claxo.cl/api/vehicle/vehicles/search?companyId=6978be99650dbd3aa13a02c9',{method:'post',contentType:'application/json',payload:JSON.stringify({brand:null,model:null,year:null,maxKm:0,gasType:null,minPrice:null,maxPrice:null,city:null,sellerType:null,transmission:null,exteriorColor:null,interiorColor:null}),muteHttpExceptions:true,followRedirects:true});
 if(response.getResponseCode()!==200)throw Error('Claxo no respondió correctamente.');
 const rows=JSON.parse(response.getContentText());if(!Array.isArray(rows)||!rows.length||rows.length>5000)throw Error('Respuesta de stock vacía o inválida; inventario conservado.');
 const ids=new Set();rows.forEach(v=>{if(!v._id||ids.has(v._id)||v.companyId!=='6978be99650dbd3aa13a02c9'||typeof v.brand!=='string'||typeof v.model!=='string')throw Error('Claxo devolvió registros incompatibles.');ids.add(v._id);});
 const t=ocTable_('OC_MAESTROS_ID','VEHICULOS'),now=new Date().toISOString();let added=0,updated=0;
 rows.forEach(v=>{
  const matches=t.rows.filter(r=>r.vehiculo_id===v._id);if(matches.length>1)throw Error('Auto duplicado: '+v._id);const old=matches[0];
  const patch={vehiculo_id:v._id,patente:String(v.licensePlate||''),marca:v.brand,modelo:v.model,version_vehiculo:String(v.trim||''),anio:Number(v.year)||'',kilometraje:Number(v.kilometers)||0,color:String(v.exteriorColor||''),claxo_estado:String(v.status||''),claxo_presente:'SI',claxo_actualizado_at:now,precio_publicado:Number(v.price)||'',imagen_url:typeof v.image==='string'&&/^https:\/\//.test(v.image)?v.image:'',updated_at:now,updated_by:'SISTEMA_CLAXO',version:Number(old?old.version:0)+1};
  if(!old)Object.assign(patch,{ambiente:'PRODUCCION',estado_registro:'ACTIVO',origen:'API',calidad:'PENDIENTE_VERIFICACION',created_at:now,created_by:'SISTEMA_CLAXO'});
  ocPatchRow_(t,old?old._row:t.sheet.getLastRow()+1,patch);old?updated++:added++;
 });
 // Missing from public stock is not evidence of a sale. Keep history and costs.
 t.rows.filter(r=>ocProd_(r)&&!ids.has(r.vehiculo_id)).forEach(r=>ocPatchRow_(t,r._row,{claxo_presente:'NO',claxo_actualizado_at:now}));
 PropertiesService.getScriptProperties().setProperty('OC_CLAXO_LAST_SYNC',now);return {added,updated,total:rows.length,at:now};
}
function sincronizarStockClaxo(){const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('Sincronización en curso.');try{return osClaxo_();}finally{lock.releaseLock();}}
function activarSincronizacionClaxo(){const current=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='sincronizarStockClaxo');if(!current.length)ScriptApp.newTrigger('sincronizarStockClaxo').timeBased().everyHours(6).create();return {programada:true};}
function osClassifyLinks_(p,c,r,vehicle,actor){
 const patch={actividad_id:'',proyeccion_id:'',prestamo_id:'',componente_prestamo:'',socio:'',aporte_id:''};
 if(c.nature==='APORTE_CAPITAL'){
  if(r.direccion!=='ENTRADA'||!String(p.socio||'').trim())throw Error('El aporte requiere una entrada y nombre del socio.');
  patch.socio=String(p.socio).trim().slice(0,100);patch.aporte_id='APORTE-'+r.movimiento_id;
 }
 if(c.nature==='PRESTAMO'){
  const loans=osRows_('PRESTAMOS').filter(l=>l.prestamo_id===p.prestamoId);if(loans.length!==1)throw Error('Selecciona un préstamo registrado.');
  if(['DESEMBOLSO','AMORTIZACION','INTERES'].indexOf(p.loanComponent)<0)throw Error('Selecciona principal o interés.');
  const incoming=loans[0].sentido==='RECIBIDO'?p.loanComponent==='DESEMBOLSO':p.loanComponent!=='DESEMBOLSO';
  if(r.direccion!==(incoming?'ENTRADA':'SALIDA'))throw Error('Dirección incompatible con el préstamo.');
  patch.prestamo_id=p.prestamoId;patch.componente_prestamo=p.loanComponent;
 }
 if(p.activityId){const as=osRows_('ACTIVIDADES_AUTOS').filter(a=>a.actividad_id===p.activityId);if(as.length!==1||!vehicle||as[0].vehiculo_id!==vehicle||c.nature!=='COSTO')throw Error('La actividad debe corresponder al auto y costo.');patch.actividad_id=p.activityId;}
 if(p.forecastId){const fs=osRows_('PROYECCIONES').filter(f=>f.proyeccion_id===p.forecastId);if(fs.length!==1||fs[0].direccion!==r.direccion||fs[0].vehiculo_id&&fs[0].vehiculo_id!==vehicle)throw Error('Proyección incompatible.');patch.proyeccion_id=p.forecastId;}
 osAudit_(actor,'SOLICITUD_CLASIFICAR','MOVIMIENTOS_BANCARIOS',r.movimiento_id,{concepto:c.id,vinculos:patch,version_anterior:r.version});
 return patch;
}
