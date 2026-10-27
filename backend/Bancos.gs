// Each bank owns an input sheet. Original columns stay intact. Only the shared
// ledger is used for balances. Profile mappings match the bank's actual export.
const OS_BANK_INPUTS={MERCADO_PAGO:'MERCADO PAGO',SCOTIABANK_PERSONAL:'SCOTIABANK PERSONAL',CAJA:'CAJA',BANCO_CHILE:'BANCO CHILE'};
function prepararEntradasBancos(){
 const b=SpreadsheetApp.openById(ocProperty_('OC_FINANZAS_ID'));
 Object.keys(OS_BANK_INPUTS).forEach(name=>{let s=b.getSheetByName(name);if(!s){s=b.insertSheet(name);s.getRange(1,1,1,6).setValues([['fecha','descripcion','abono','cargo','referencia','saldo']]);s.getRange('A1').setNote('Pega aquí los encabezados y filas de la cartola original. Puedes reemplazar estas columnas. Configura su correspondencia en PERFILES_IMPORTACION antes de importar.');s.setFrozenRows(1);}s.showSheet();});
 osEnsure_(SpreadsheetApp.openById(ocProperty_('OC_CONTROL_ID')),'PERFILES_IMPORTACION',osHeaders_('PERFILES_IMPORTACION').concat(['hoja_entrada','lote_entrada']));
 return {hojas:Object.keys(OS_BANK_INPUTS)};
}
function importarHojasBancos(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('Importación en curso.');
 try{
 const profiles=osTable_('PERFILES_IMPORTACION').rows.filter(p=>ocProd_(p)&&p.habilitado==='SI'&&p.hoja_entrada),b=SpreadsheetApp.openById(ocProperty_('OC_FINANZAS_ID')),out=[];
 profiles.forEach(p=>{if(!Object.hasOwn(OS_BANK_INPUTS,p.hoja_entrada))throw Error('Hoja no permitida.');if(!/^[-\w]{1,100}$/.test(p.lote_entrada||''))throw Error('Define lote_entrada para '+p.hoja_entrada);const s=b.getSheetByName(p.hoja_entrada),data=s.getDataRange().getValues(),heads=data.shift().map(String);if(new Set(heads).size!==heads.length)throw Error('Encabezados repetidos en '+p.hoja_entrada);const rows=data.map(row=>Object.fromEntries(heads.map((h,i)=>[h,row[i] instanceof Date?Utilities.formatDate(row[i],'America/Santiago',p.formato_fecha==='DD/MM/YYYY'?'dd/MM/yyyy':'yyyy-MM-dd'):row[i]]))).filter(row=>Object.values(row).some(v=>v!==''));for(let i=0;i<rows.length;i+=50)out.push({hoja:p.hoja_entrada,...osImport_({profileId:p.perfil_id,profileVersion:Number(p.version),rows:rows.slice(i,i+50),offset:i,batch:p.lote_entrada},{manage:true,id:'IMPORTACION_HOJAS'})});});return out;
 }finally{lock.releaseLock();}
}
function actualizarSistemaV4(){
 prepararSistemaOportunicars();console.log(JSON.stringify(prepararEntradasBancos()));console.log(JSON.stringify(poblarFuentesBancariasExistentes()));
 const props=PropertiesService.getScriptProperties();props.setProperty('OS_MIGRATION_VERSION','4');if(!props.getProperty('OC_FECHA_CREACION'))props.setProperty('OC_FECHA_CREACION','2025-10-01');
 console.log(JSON.stringify(actualizarReportesSistema()));
}
function poblarFuentesBancariasExistentes(){
 const b=SpreadsheetApp.openById(ocProperty_('OC_FINANZAS_ID')),accounts=ocTable_('OC_MAESTROS_ID','CUENTAS_FINANCIERAS').rows.filter(ocProd_),moves=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS').rows.filter(ocProd_);
 const result=[];
 Object.keys(OS_BANK_INPUTS).forEach(name=>{const s=b.getSheetByName(name);if(s.getLastRow()>1){result.push({hoja:name,conservada:true});return;}const account=accounts.find(a=>String(a.nombre).trim().toUpperCase()===OS_BANK_INPUTS[name]);if(!account)return;const rows=moves.filter(m=>m.cuenta_id===account.cuenta_id).map(m=>{let raw={};try{raw=JSON.parse(m.origen_json||'{}');}catch(e){}if(!raw||Array.isArray(raw)||typeof raw!=='object')raw={};if(!Object.keys(raw).length)raw={fecha_original:m.fecha_original||m.fecha_operacion,descripcion:m.descripcion,monto_informado:m.monto,direccion:m.direccion,referencia:m.referencia};return {...raw,_movimiento_id:m.movimiento_id};});if(!rows.length)return;const headers=Array.from(new Set(rows.flatMap(Object.keys)));s.clearContents();if(s.getMaxColumns()<headers.length)s.insertColumnsAfter(s.getMaxColumns(),headers.length-s.getMaxColumns());s.getRange(1,1,1,headers.length).setValues([headers]);s.getRange(2,1,rows.length,headers.length).setValues(rows.map(r=>headers.map(h=>ocLiteral_(typeof r[h]==='object'?JSON.stringify(r[h]):r[h]===undefined?'':r[h]))));s.setFrozenRows(1);result.push({hoja:name,filas:rows.length});});return result;
}
