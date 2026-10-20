const OS_BOOKS={
 OC_MAESTROS_ID:{id:'1c_SfT_ESWReisnyXKyXKFBSGw-y5Mom1ukn_M7KA23A',name:'OC_01_CONFIGURACION',keep:['VEHICULOS','USUARIOS','CUENTAS_FINANCIERAS','CONCEPTOS_CAJA']},
 OC_OPERACIONES_ID:{id:'1jBs8bVZOzw8srehFZevEVTsKjUuobRrHEEnU3RK8dUM',name:'OC_02_AUTOS_OPERACION',keep:['AUTOS_OPERACION','ACTIVIDADES_AUTOS']},
 OC_FINANZAS_ID:{id:'1uqHLceRUphLl1P_EH1ht089h6oSH_0mlvlSvPJ1QBAE',name:'OC_03_FINANZAS',keep:['MOVIMIENTOS_BANCARIOS','COSTOS_FIJOS','PROYECCIONES','PRESTAMOS','APORTES_CAPITAL_SOCIOS']},
 OC_ARCHIVO_ID:{id:'1fYDTZCg0C9Y1zBoD8VPuzKSwQkQxq346puxJ3vflqOQ',name:'OC_04_ARCHIVO',keep:[]},
 OC_CONTROL_ID:{id:'1nETErwPp3WdaxhnICpeWiFxk4_jnI2xgzRKx-WmcL74',name:'OC_05_CONTROL',keep:['PERFILES_IMPORTACION','AUDITORIA_SISTEMA']},
 OC_REPORTES_ID:{id:'1DqsoDGP60gpnPov6WBPWSmZiNMnnqtpww2Dqicj8UDg',name:'OC_06_REPORTES',keep:['RESUMEN','RESULTADO_AUTOS']}
};
function configurarSistema(){
 const props=PropertiesService.getScriptProperties();Object.keys(OS_BOOKS).forEach(k=>props.setProperty(k,OS_BOOKS[k].id));
 props.setProperties({OC_SUPABASE_URL:'https://lxyqosqgvkgjybgffdob.supabase.co',OC_SUPABASE_KEY:'sb_publishable_1J_TfuzcCqaqtDVDIaiLAw_uCufZXHC'});
 return {configurado:true};
}
function migrarSistemaDefinitivo(){
 configurarSistema();
 // Durable per-book backups BEFORE any structural or naming changes.
 const props=PropertiesService.getScriptProperties();
 Object.keys(OS_BOOKS).forEach(k=>{const key='OS_BACKUP_V3_'+k;if(!props.getProperty(key)){const f=DriveApp.getFileById(OS_BOOKS[k].id);const backup=f.makeCopy('RESPALDO_ANTES_SISTEMA_'+OS_BOOKS[k].name+'_'+new Date().toISOString());props.setProperty(key,backup.getId());}});
 prepararSistemaOportunicars();
 const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('Otro proceso está en curso.');
 try {
  const remove=['CENTROS_COSTO','PRECIOS_HISTORICOS','PROSPECTOS','DOCUMENTOS_FINANCIEROS','PLAN_CUENTAS','ASIENTOS','ASIENTO_LINEAS','PERIODOS','MOVIMIENTOS_SOCIOS'];
  Object.keys(OS_BOOKS).forEach(k=>{
   const b=SpreadsheetApp.openById(OS_BOOKS[k].id),readme=osEnsure_(b,'SISTEMA',['OPORTUNICARS — SISTEMA DE GESTIÓN']);
   readme.getRange(2,1,5,1).setValues([['Fuente única de dinero: MOVIMIENTOS_BANCARIOS.'],['Clasificación en una fila; los reportes no se suman como movimientos.'],['Los datos históricos no se convierten en producción al renombrar.'],['Las pestañas anteriores se conservan ocultas salvo las eliminaciones aprobadas, respaldadas antes.'],['La autorización y el despliegue de la web son pasos distintos de esta migración.']]);
   readme.showSheet();remove.forEach(n=>{const s=b.getSheetByName(n);if(s)b.deleteSheet(s);});
   b.getSheets().forEach(s=>{if(s.getName()==='SISTEMA'||OS_BOOKS[k].keep.indexOf(s.getName())>=0)s.showSheet();else s.hideSheet();});
   b.rename(OS_BOOKS[k].name);
  });
  props.setProperty('OS_MIGRATION_VERSION','3');
  return {migrado:true,estructura:revisarEstructuraCaja(),respaldos:Object.keys(OS_BOOKS).map(k=>props.getProperty('OS_BACKUP_V3_'+k))};
 }finally{lock.releaseLock();}
}
function actualizarReportesSistema(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('Otro proceso está en curso.');
 try {
  const d=osData_({manage:true,role:'administrador'}),r=d.report,b=SpreadsheetApp.openById(ocProperty_('OC_REPORTES_ID'));
  const summary=osEnsure_(b,'RESUMEN',['fecha','indicador','valor','observacion']);
  const rows=[['Caja',r.cash],['Stock propio al costo',r.stock],['Cuotas por cobrar',r.receivable],['Deudas',r.debt],['Patrimonio estimado',r.patrimony],['Costos fijos mensuales',r.fixedMonthly]].map(x=>[r.today,x[0],x[1]===null?'':x[1],r.issues.join(' ')]);
  summary.getRange(2,1,rows.length,4).setValues(rows);
  const cars=osEnsure_(b,'RESULTADO_AUTOS',['vehiculo_id','auto','estado','modalidad','dias_stock','dias_estacionamiento','costo_compra','preparacion','costo_total','precio_venta','cobrado','resultado']);
  const data=r.cars.map(c=>[c.id,c.label,c.status,c.modality,c.days,c.parkingDays,c.purchase,c.preparation,c.cost,c.sale,c.income,c.result].map(v=>v===null?'':ocLiteral_(v)));
  if(cars.getLastRow()>1)cars.getRange(2,1,cars.getLastRow()-1,12).clearContent();if(data.length)cars.getRange(2,1,data.length,12).setValues(data);
  const moves=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS').rows.filter(ocProd_).filter(m=>m.naturaleza==='APORTE_CAPITAL');
  const a=osTable_('APORTES_CAPITAL_SOCIOS');
  // Derived snapshot; financial totals always read the original movement.
  if(a.sheet.getLastRow()>1)a.sheet.getRange(2,1,a.sheet.getLastRow()-1,a.headers.length).clearContent();
  moves.forEach(m=>ocPatchRow_(a,a.sheet.getLastRow()+1,{aporte_id:m.aporte_id,socio:m.socio,movimiento_id:m.movimiento_id,fecha:m.fecha_operacion,moneda:m.moneda,monto:m.monto,estado:OCSystemCore.paid(m)?'CONFIRMADO':'POR_REVISAR',ambiente:'PRODUCCION',estado_registro:'ACTIVO'}));
  return {actualizado:true,fecha:r.today,autos:data.length,advertencias:r.issues};
 }finally{lock.releaseLock();}
}
function activarActualizacionesSistema(){activarSincronizacionClaxo();if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='actualizarReportesSistema'))ScriptApp.newTrigger('actualizarReportesSistema').timeBased().everyHours(1).create();return {claxo:'cada 6 horas',reportes:'cada hora'};}

function finalizarYVerificarSistema(){
 console.log(JSON.stringify({estructura:revisarEstructuraCaja(),conteos:comprobarConexionCaja(),migracion:PropertiesService.getScriptProperties().getProperty('OS_MIGRATION_VERSION')}));
 console.log(JSON.stringify({stock:sincronizarStockClaxo()}));
 console.log(JSON.stringify({reportes:actualizarReportesSistema()}));
 console.log(JSON.stringify({actualizaciones:activarActualizacionesSistema()}));
}
function diagnosticarValidacionesStock(){
 const t=ocTable_('OC_MAESTROS_ID','VEHICULOS');
 console.log(JSON.stringify(t.sheet.getRange(2,1,1,t.headers.length).getDataValidations()[0].map((v,i)=>({campo:t.headers[i],criterio:v?String(v.getCriteriaType()):'',valores:v?v.getCriteriaValues().map(x=>String(x)):[]}))));
}

