// Script properties: OC_MAESTROS_ID, OC_FINANZAS_ID, OC_SUPABASE_URL, OC_SUPABASE_KEY.
// Deploy as owner. Every data request is authenticated against Supabase AND USUARIOS.
function doGet() { return ocJson_({ok:true,service:'Oportunicars Sistema de Gestión',version:3}); }
function doPost(e) {
  try {
    ocAccountCache_=null;
    if (!e || !e.postData || e.postData.contents.length>50000) throw Error('Solicitud inválida.');
    const p=JSON.parse(e.postData.contents),actor=ocActor_(p.token);
    if(p.action==='bootstrap')return ocJson_({ok:true,data:ocBootstrap_(actor)});
    if(p.action==='system')return ocJson_({ok:true,data:osData_(actor)});
    if(p.action==='load'&&typeof osLoad_==='function')return ocJson_({ok:true,data:osLoad_(actor)});
    if(p.action==='inventory'&&typeof osInventory_==='function')return ocJson_({ok:true,data:osInventory_()});
    if(p.action==='schema'){if(!actor.manage)throw Error('Acceso restringido.');return ocJson_({ok:true,data:revisarEstructuraCaja()});}
    const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('Hay otro guardado en curso. Intenta nuevamente.');
    try {
      // Revalidate permissions after acquiring the lock.
      const current=ocActor_(p.token);
      if(p.action==='saveSystem')return ocJson_({ok:true,data:osSave_(p,current)});
      if(p.action==='saveCompanyStart'){if(!current.manage||!osDate_(p.date))throw Error('Fecha o permiso inválido.');PropertiesService.getScriptProperties().setProperty('OC_FECHA_CREACION',p.date);return ocJson_({ok:true});}
      if(p.action==='saveBalance')return ocJson_({ok:true,data:osAccountSave_(p,current)});
      if(p.action==='import')return ocJson_({ok:true,data:osImport_(p,current)});
      if(p.action==='syncClaxo'){if(!current.manage&&!(typeof ocIsJT_==='function'&&ocIsJT_(current)))throw Error('Acceso restringido.');return ocJson_({ok:true,data:osClaxo_()});}
      if(p.action==='classify')return ocJson_({ok:true,data:ocClassify_(p,current)});
      if(p.action==='concept')return ocJson_({ok:true,data:ocSaveConcept_(p,current)});
      throw Error('Acción desconocida.');
    } finally {lock.releaseLock();}
  } catch(err) {return ocJson_({ok:false,error:String(err.message||'No se pudo completar la operación.')});}
}
function ocJson_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function ocProperty_(key){const v=PropertiesService.getScriptProperties().getProperty(key);if(!v)throw Error('Falta configurar la conexión Google.');return v;}
function ocTable_(book,name){
  const sheet=SpreadsheetApp.openById(ocProperty_(book)).getSheetByName(name);if(!sheet)throw Error('Falta la hoja '+name+'.');
  if(sheet.getLastRow()>20000)throw Error('La hoja requiere paginación antes de continuar.');
  const values=sheet.getDataRange().getValues(),headers=values.shift().map(String);
  const nonempty=headers.filter(Boolean);if(new Set(nonempty).size!==nonempty.length)throw Error('Encabezados duplicados en '+name+'.');
  return {sheet,headers,rows:values.map((v,i)=>{const r={_row:i+2};headers.forEach((h,j)=>{if(h)r[h]=v[j];});return r;}).filter(r=>r[headers[0]]!=='')};
}
function ocProd_(r){return r.ambiente==='PRODUCCION'&&r.estado_registro!=='ANULADO';}
function ocActor_(token){
  if(typeof token!=='string'||token.length<30||token.length>10000)throw Error('Inicia sesión nuevamente.');
  const base=ocProperty_('OC_SUPABASE_URL');if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(base))throw Error('Configuración de identidad inválida.');
  const result=UrlFetchApp.fetch(base+'/auth/v1/user',{headers:{apikey:ocProperty_('OC_SUPABASE_KEY'),Authorization:'Bearer '+token},muteHttpExceptions:true});
  if(result.getResponseCode()!==200)throw Error('Sesión inválida o vencida.');
  const u=JSON.parse(result.getContentText());if(typeof ocSessionGuard_==='function')ocSessionGuard_(u,token);
  const matches=ocTable_('OC_MAESTROS_ID','USUARIOS').rows.filter(r=>r.auth_user_id===u.id);
  if(matches.length!==1)throw Error('Tu usuario no está configurado correctamente en Google.');
  const row=matches[0],roles={OPERACIONES:'operativo',SOCIO:'gerencial',ADMINISTRADOR:'administrador',FINANZAS:'finanzas'};
  if(!ocProd_(row)||row.estado_registro!=='ACTIVO'||row.habilitado!=='SI'||!Object.prototype.hasOwnProperty.call(roles,row.rol)||String(row.email).trim().toLowerCase()!==String(u.email||'').toLowerCase())throw Error('Tu usuario no está habilitado en Google.');
  return {id:u.id,name:row.nombre,role:roles[row.rol],manage:row.rol==='SOCIO'||row.rol==='ADMINISTRADOR'};
}
function ocConcept_(r){return {id:String(r.concepto_id),name:String(r.nombre),category:String(r.categoria),nature:String(r.naturaleza),cost:String(r.tipo_costo),recurring:r.recurrente==='SI',vehicleOperation:String(r.operacion_auto||''),version:Number(r.version)};}
function ocInventory_(){return ocTable_('OC_MAESTROS_ID','VEHICULOS').rows.filter(ocProd_).map(r=>({id:String(r.vehiculo_id),patente:String(r.patente||''),modelo:[r.marca,r.modelo,r.version_vehiculo].filter(Boolean).join(' ')}));}
function ocMovement_(r,accounts){
  const c=r.concepto_id?{id:String(r.concepto_id),name:String(r.concepto_nombre),version:Number(r.concepto_version),category:String(r.categoria||''),nature:String(r.naturaleza),cost:String(r.tipo_costo),recurring:r.recurrente==='SI',vehicleOperation:String(r.operacion_auto||''),vehicleId:r.vehiculo_id?String(r.vehiculo_id):null}:null;
  return {id:String(r.movimiento_id),version:Number(r.version||1),date:ocDay_(r.fecha_operacion),account:accounts[String(r.cuenta_id)]||String(r.cuenta_id),description:String(r.descripcion||r.referencia||'Movimiento'),amount:typeof r.monto==='number'?r.monto:null,direction:String(r.direccion||''),confirmed:r.monto_confirmado==='SI'&&r.incluir_en_saldo==='SI',status:c?(r.estado_clasificacion|| (c.vehicleOperation&&!c.vehicleId?'POR_ASIGNAR_AUTO':'CLASIFICADO')):'PENDIENTE',classification:c,activityId:String(r.actividad_id||''),forecastId:String(r.proyeccion_id||''),prestamoId:String(r.prestamo_id||''),loanComponent:String(r.componente_prestamo||''),socio:String(r.socio||'')};
}
function ocDay_(v){return v instanceof Date?Utilities.formatDate(v,'America/Santiago','yyyy-MM-dd'):String(v||'').slice(0,10);}
function ocAccounts_(){const out={};ocTable_('OC_MAESTROS_ID','CUENTAS_FINANCIERAS').rows.filter(ocProd_).forEach(r=>out[String(r.cuenta_id)]=String(r.nombre));return out;}
function ocBootstrap_(actor){const check=revisarEstructuraCaja();if(!check.compatible)throw Error('La estructura de Google debe actualizarse antes de usar Caja: '+check.hojas.filter(r=>!r.compatible).map(r=>r.hoja+': '+(r.faltan||[r.error]).join(', ')).join('; '));return {profile:actor,inventory:ocInventory_(),concepts:ocTable_('OC_MAESTROS_ID','CONCEPTOS_CAJA').rows.filter(r=>r.habilitado==='SI').map(ocConcept_),movements:ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS').rows.filter(ocProd_).map(r=>ocMovement_(r,ocAccountsCached_()))};}
// Request-local cache only; never caches tokens or permissions.
var ocAccountCache_;
function ocAccountsCached_(){return ocAccountCache_||(ocAccountCache_=ocAccounts_());}
function ocValidateConcept_(c){
  if(!c||typeof c.id!=='string'||!/^[\w&.-]{1,80}$/.test(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>100||typeof c.category!=='string'||!c.category.trim()||c.category.length>80)throw Error('Nombre o categoría inválidos.');
  if(['GASTO','COSTO','INGRESO','TRANSFERENCIA','APORTE_CAPITAL','PRESTAMO'].indexOf(c.nature)<0||['FIJO','VARIABLE','NO_APLICA'].indexOf(c.cost)<0||['','COMPRA','ARREGLO','VENTA','COSTO_AUTO'].indexOf(c.vehicleOperation)<0||typeof c.recurring!=='boolean')throw Error('Clasificación inválida.');
  if(c.vehicleOperation&&c.nature!==(c.vehicleOperation==='VENTA'?'INGRESO':'COSTO'))throw Error('Compra y arreglo son costos; venta es ingreso.');
}
function ocLiteral_(v){return typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v;}
function ocCellValue_(field,value){
  if(typeof value==='string'&&(/^fecha(?:_|$)/.test(field)||/_at$/.test(field))&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)){const d=new Date(value.length===10?value+'T12:00:00Z':value);if(!isNaN(d.getTime()))return d;}
  return value;
}
function ocPatchRow_(t,row,patch){
  Object.keys(patch).forEach(k=>{if(t.headers.indexOf(k)<0)throw Error('Falta la columna '+k+'.');});
  const range=t.sheet.getRange(row,1,1,t.headers.length),values=range.getValues()[0],formulas=range.getFormulas()[0];
  const next=t.headers.map((h,i)=>{if(!Object.prototype.hasOwnProperty.call(patch,h)&&formulas[i])return formulas[i];const v=Object.prototype.hasOwnProperty.call(patch,h)?patch[h]:values[i];return ocLiteral_(ocCellValue_(h,v));});
  range.setValues([next]);SpreadsheetApp.flush();
}
function ocClassify_(p,actor){
  const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),matches=t.rows.filter(r=>r.movimiento_id===p.id&&ocProd_(r));
  if(matches.length!==1)throw Error('Movimiento no encontrado o duplicado.');const r=matches[0];
  if(Number(r.version||1)!==p.expectedVersion)throw Error('El movimiento cambió. Recarga antes de guardar.');
  const concepts=ocTable_('OC_MAESTROS_ID','CONCEPTOS_CAJA').rows.filter(c=>c.concepto_id===p.conceptId&&c.habilitado==='SI');
  if(concepts.length!==1)throw Error('Concepto no disponible.');const c=ocConcept_(concepts[0]);ocValidateConcept_(c);
  if(p.conceptVersion!==c.version)throw Error('El concepto cambió. Recarga antes de guardar.');
  if(r.direccion==='ENTRADA'&&['GASTO','COSTO'].indexOf(c.nature)>=0||r.direccion==='SALIDA'&&c.nature==='INGRESO')throw Error('El concepto no corresponde a la dirección del movimiento.');
  const vehicle=c.vehicleOperation?(p.vehicleId||''):'';
  if(vehicle&&ocInventory_().filter(v=>v.id===vehicle).length!==1)throw Error('Auto no encontrado en inventario.');
  const patch={concepto_id:c.id,concepto_nombre:c.name,concepto_version:c.version,categoria:c.category,naturaleza:c.nature,tipo_costo:c.cost,recurrente:c.recurring?'SI':'NO',operacion_auto:c.vehicleOperation,vehiculo_id:vehicle,estado_clasificacion:c.vehicleOperation&&!vehicle?'POR_ASIGNAR_AUTO':'CLASIFICADO',updated_at:new Date().toISOString(),updated_by:actor.id,version:Number(r.version||1)+1};
  if(typeof osClassifyLinks_==='function')Object.assign(patch,osClassifyLinks_(p,c,r,vehicle,actor));
  ocPatchRow_(t,r._row,patch);return ocMovement_(Object.assign({},r,patch),ocAccounts_());
}
function ocSaveConcept_(p,actor){
  if(!actor.manage)throw Error('Solo Gerencia o Administración puede editar conceptos.');const c=p.concept;ocValidateConcept_(c);
  const t=ocTable_('OC_MAESTROS_ID','CONCEPTOS_CAJA'),matches=t.rows.filter(r=>r.concepto_id===c.id);
  if(matches.length>1)throw Error('Concepto duplicado.');
  if(t.rows.some(r=>r.concepto_id!==c.id&&String(r.nombre).trim().toLowerCase()===c.name.trim().toLowerCase()))throw Error('Ya existe ese concepto.');
  if(c.version!==(matches.length?Number(matches[0].version)+1:1))throw Error('El concepto cambió. Recarga antes de guardar.');
  const patch={concepto_id:c.id,nombre:c.name.trim(),categoria:c.category.trim(),naturaleza:c.nature,tipo_costo:c.cost,recurrente:c.recurring?'SI':'NO',operacion_auto:c.vehicleOperation,habilitado:'SI',version:c.version};
  ocPatchRow_(t,matches.length?matches[0]._row:t.sheet.getLastRow()+1,patch);return ocConcept_(patch);
}
function comprobarConexionCaja(){
  const names=[['OC_MAESTROS_ID','USUARIOS'],['OC_MAESTROS_ID','VEHICULOS'],['OC_MAESTROS_ID','CONCEPTOS_CAJA'],['OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS']];
  return names.map(x=>({hoja:x[1],filas:ocTable_(x[0],x[1]).rows.length}));
}

// Read-only compatibility check. Run before publishing a new version.
// Does not initialize sample rows, rename books or delete business data.
function revisarEstructuraCaja(){
  const required={
    USUARIOS:['auth_user_id','email','nombre','rol','habilitado','ambiente','estado_registro'],
    VEHICULOS:['vehiculo_id','patente','marca','modelo','ambiente','estado_registro'],
    CUENTAS_FINANCIERAS:['cuenta_id','nombre','ambiente','estado_registro'],
    CONCEPTOS_CAJA:['concepto_id','nombre','categoria','naturaleza','tipo_costo','recurrente','operacion_auto','habilitado','version'],
    MOVIMIENTOS_BANCARIOS:['movimiento_id','cuenta_id','monto','direccion','ambiente','estado_registro','version','monto_confirmado','incluir_en_saldo','concepto_id','concepto_nombre','concepto_version','categoria','naturaleza','tipo_costo','recurrente','operacion_auto','vehiculo_id','estado_clasificacion','updated_at','updated_by']
  };
  const results=Object.keys(required).map(name=>{
    try {const t=ocTable_(name==='MOVIMIENTOS_BANCARIOS'?'OC_FINANZAS_ID':'OC_MAESTROS_ID',name);
      const missing=required[name].filter(h=>t.headers.indexOf(h)<0);
      return {hoja:name,compatible:missing.length===0,faltan:missing};
    }catch(e){return {hoja:name,compatible:false,error:String(e.message)};}
  });
  return {compatible:results.every(r=>r.compatible),hojas:results,importacionPorPerfiles:typeof osImport_==='function',capitalYPrestamos:typeof osClassifyLinks_==='function',scrapersBancariosInstalados:false};
}

// Additive, repeatable preparation of the definitive design. Never relabels
// sample records, changes original bank values, or deletes historical columns.
function prepararEstructuraCaja(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('Hay otro proceso en curso.');
  try {
    const defs={
      CONCEPTOS_CAJA:['concepto_id','nombre','categoria','naturaleza','tipo_costo','recurrente','operacion_auto','habilitado','version'],
      APORTES_CAPITAL_SOCIOS:['aporte_id','persona_id','movimiento_id','fecha','moneda','monto','estado'],
      PRESTAMOS:['prestamo_id','persona_id','empresa_id','sentido','fecha_inicio','fecha_vencimiento','moneda','principal_pactado','tasa','estado'],
      MOVIMIENTOS_BANCARIOS:['concepto_id','concepto_nombre','concepto_version','categoria','naturaleza','tipo_costo','recurrente','operacion_auto','vehiculo_id','estado_clasificacion','perfil_id','perfil_version','fuente_fila','origen_json','prestamo_id','componente_prestamo','aporte_id']
    };
    Object.keys(defs).forEach(name=>{
      const book=SpreadsheetApp.openById(ocProperty_(name==='CONCEPTOS_CAJA'?'OC_MAESTROS_ID':'OC_FINANZAS_ID'));
      let sheet=book.getSheetByName(name);
      if(!sheet){if(name==='MOVIMIENTOS_BANCARIOS')throw Error('No se encontró la tabla de movimientos.');sheet=book.insertSheet(name);}
      const width=sheet.getLastColumn(),headers=width?sheet.getRange(1,1,1,width).getValues()[0].map(String):[];
      const nonempty=headers.filter(Boolean);if(new Set(nonempty).size!==nonempty.length)throw Error('Encabezados duplicados en '+name);
      const missing=defs[name].filter(h=>headers.indexOf(h)<0);
      if(missing.length){const total=width+missing.length;if(total>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),total-sheet.getMaxColumns());sheet.getRange(1,width+1,1,missing.length).setValues([missing]);}
    });
    SpreadsheetApp.flush();return revisarEstructuraCaja();
  } finally {lock.releaseLock();}
}
