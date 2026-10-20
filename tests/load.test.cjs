const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const ctx=vm.createContext({}),D=iso=>vm.runInContext('new Date("'+iso+'")',ctx),reads={},tables={};
 function sheet(name,rows){const headers=Object.keys(rows[0]),data=[headers,...rows.map(r=>headers.map(h=>r[h]))];reads[name]=0;tables[name]={getLastRow:()=>data.length,getDataRange:()=>({getValues:()=>{reads[name]++;return data.map(r=>r.slice());}})};}
 const meta={ambiente:'PRODUCCION',estado_registro:'ACTIVO'};
 sheet('USUARIOS',[{auth_user_id:'u1',nombre:'Alex',email:'a@x.cl',rol:'SOCIO',habilitado:'SI',...meta}]);
 sheet('VEHICULOS',[{vehiculo_id:'c1',patente:'AB1234',marca:'Kia',modelo:'Rio',version_vehiculo:'',...meta}]);
 sheet('CUENTAS_FINANCIERAS',[{cuenta_id:'acc',nombre:'MERCADO PAGO',saldo_inicial:0,fecha_saldo_inicial:D('2026-10-01T12:00:00Z'),version:1,moneda:'CLP',...meta}]);
 sheet('CONCEPTOS_CAJA',[{concepto_id:'lavado',nombre:'Lavado',categoria:'Vehículos',naturaleza:'COSTO',tipo_costo:'VARIABLE',recurrente:'NO',operacion_auto:'COSTO_AUTO',habilitado:'SI',version:1}]);
 sheet('MOVIMIENTOS_BANCARIOS',[{movimiento_id:'m1',cuenta_id:'acc',fecha_operacion:D('2026-10-05T12:00:00Z'),monto:100,direccion:'ENTRADA',descripcion:'Venta',monto_confirmado:'SI',incluir_en_saldo:'SI',version:1,concepto_id:'',origen_json:'x'.repeat(5000),hash_origen:'h',...meta}]);
 for(const n of ['AUTOS_OPERACION','ACTIVIDADES_AUTOS','PROYECCIONES','PRESTAMOS','AUDITORIA_SISTEMA'])sheet(n,[{[n==='AUTOS_OPERACION'?'vehiculo_id':'id']:'x',...meta}]);
 const props={OC_SUPABASE_URL:'https://p.supabase.co',OC_SUPABASE_KEY:'k',OC_MAESTROS_ID:'m',OC_FINANZAS_ID:'f',OC_OPERACIONES_ID:'o',OC_CONTROL_ID:'c',OC_CLAXO_LAST_SYNC:'2026-10-19T10:00:00Z',OC_FECHA_CREACION:'2026-10-01'};
 Object.assign(ctx,{PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},SpreadsheetApp:{openById:()=>({getSheetByName:n=>tables[n]}),flush(){}},UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({id:'u1',email:'a@x.cl'})})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType:()=>JSON.parse(t)})},Utilities:{formatDate:d=>d.toISOString().slice(0,10),getUuid:()=>'uuid'}});
 for(const f of ['Caja.gs','Sistema.gs'])vm.runInContext(fs.readFileSync(require.resolve('../backend/'+f),'utf8'),ctx);
 return {reads,call:p=>ctx.doPost({postData:{contents:JSON.stringify({token:'x'.repeat(40),...p})}})};
}
test('load entrega todo en una sola consulta: cada hoja se lee una vez y las filas viajan livianas',()=>{
 const {reads,call}=setup(),r=call({action:'load'});assert.equal(r.ok,true,r.error);
 for(const n of ['VEHICULOS','AUTOS_OPERACION','ACTIVIDADES_AUTOS','PROYECCIONES','PRESTAMOS','CUENTAS_FINANCIERAS','CONCEPTOS_CAJA','MOVIMIENTOS_BANCARIOS'])assert.equal(reads[n],1,n);
 const d=r.data;assert.equal(d.movements.length,1);assert.equal(d.movements[0].origen_json,undefined);assert.equal(d.movements[0].hash_origen,undefined);
 assert.equal(d.movements[0].fecha_operacion,'2026-10-05');assert.equal(d.accounts[0].fecha_saldo_inicial,'2026-10-01');
 assert.equal(d.concepts[0].vehicleOperation,'COSTO_AUTO');assert.equal(d.companyStart,'2026-10-01');assert.equal(d.profile.id,'u1');
});
test('Tras sincronizar Claxo solo se vuelve a pedir el inventario',()=>{
 const {reads,call}=setup(),r=call({action:'inventory'});assert.equal(r.ok,true,r.error);
 assert.equal(r.data.inventory[0].patente,'AB1234');assert.equal(reads.VEHICULOS,1);assert.equal(reads.MOVIMIENTOS_BANCARIOS,0);
});
test('El concepto «costo del auto» es válido solo como costo',()=>{
 const {call}=setup(),c={id:'foto',name:'Fotos',category:'Vehículos',nature:'COSTO',cost:'VARIABLE',recurring:false,vehicleOperation:'COSTO_AUTO',version:2};
 assert.equal(call({action:'concept',concept:{...c,nature:'GASTO'}}).ok,false);
});
