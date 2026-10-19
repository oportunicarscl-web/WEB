const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const tables={};
 function sheet(name,rows){const headers=Object.keys(rows[0]);const data=[headers,...rows.map(r=>headers.map(h=>r[h]))];const s={data,getLastRow:()=>data.length,getDataRange:()=>({getValues:()=>data.map(r=>r.slice())}),getRange:(row,col,n,width)=>({getValues:()=>[Array.from({length:width},(_,i)=>data[row-1]?.[col-1+i]??'')],getFormulas:()=>[Array(width).fill('')],setValues:values=>{data[row-1]=values[0].slice();}})};tables[name]=s;return s;}
 sheet('USUARIOS',[{auth_user_id:'user1',nombre:'Operario',email:'user@example.test',rol:'OPERACIONES',habilitado:'SI',ambiente:'PRODUCCION',estado_registro:'ACTIVO'}]);
 sheet('CONCEPTOS_CAJA',[{concepto_id:'ARREGLO',nombre:'Arreglo',categoria:'Vehículos',naturaleza:'COSTO',tipo_costo:'VARIABLE',recurrente:'NO',operacion_auto:'ARREGLO',habilitado:'SI',version:1}]);
 sheet('VEHICULOS',[{vehiculo_id:'car1',patente:'TEST01',marca:'Marca',modelo:'Modelo',version_vehiculo:'',ambiente:'PRODUCCION',estado_registro:'ACTIVO'}]);
 sheet('CUENTAS_FINANCIERAS',[{cuenta_id:'acc1',nombre:'CAJA',ambiente:'PRODUCCION',estado_registro:'BORRADOR'}]);
 sheet('MOVIMIENTOS_BANCARIOS',[{movimiento_id:'m1',cuenta_id:'acc1',descripcion:'Taller',referencia:'',monto:100,direccion:'SALIDA',ambiente:'PRODUCCION',estado_registro:'BORRADOR',version:1,monto_confirmado:'NO',incluir_en_saldo:'NO',concepto_id:'',concepto_nombre:'',concepto_version:'',categoria_id:'',categoria:'',naturaleza:'',tipo_costo:'',recurrente:'',operacion_auto:'',vehiculo_id:'',estado_clasificacion:'',updated_at:'',updated_by:''}]);
 const props={OC_SUPABASE_URL:'https://project.supabase.co',OC_SUPABASE_KEY:'public',OC_MAESTROS_ID:'masters',OC_FINANZAS_ID:'finance'};
 const context={PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},SpreadsheetApp:{openById:()=>({getSheetByName:n=>tables[n]}),flush(){}},UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({id:'user1',email:'user@example.test'})})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../backend/Caja.gs'),'utf8'),context);
 return {context,tables,call:p=>context.doPost({postData:{contents:JSON.stringify({token:'x'.repeat(40),...p})}})};
}
test('Google autentica identidad y exige habilitación y correo coincidente',()=>{
 const {call,tables}=setup();assert.equal(call({action:'bootstrap'}).data.inventory[0].patente,'TEST01');
 tables.USUARIOS.data[1][2]='otro@example.test';assert.equal(call({action:'bootstrap'}).ok,false);
 assert.equal(call({token:'',action:'bootstrap'}).ok,false);
});
test('Clasificación usa concepto de Sheets y actualiza una sola fila sin confirmar saldo',()=>{
 const {call,tables}=setup(),p={action:'classify',id:'m1',expectedVersion:1,conceptId:'ARREGLO',conceptVersion:1,vehicleId:'car1',monto:999};
 const result=call(p);assert.equal(result.ok,true);assert.equal(result.data.version,2);assert.equal(result.data.amount,100);assert.equal(result.data.confirmed,false);assert.equal(result.data.classification.category,'Vehículos');assert.equal(tables.MOVIMIENTOS_BANCARIOS.data.length,2);
 assert.equal(call(p).ok,false);
});
test('Rechaza auto inexistente y no permite editar conceptos a operaciones',()=>{
 const {call}=setup();assert.equal(call({action:'classify',id:'m1',expectedVersion:1,conceptId:'ARREGLO',conceptVersion:1,vehicleId:'missing'}).ok,false);
 assert.equal(call({action:'concept',concept:{}}).ok,false);
});
test('Por asignar auto persiste y una corrección conserva el movimiento',()=>{
 const {call,tables}=setup();const base={action:'classify',id:'m1',conceptId:'ARREGLO',conceptVersion:1};
 assert.equal(call({...base,expectedVersion:1,vehicleId:''}).data.status,'POR_ASIGNAR_AUTO');
 assert.equal(call({...base,expectedVersion:2,vehicleId:'car1'}).data.status,'CLASIFICADO');assert.equal(tables.MOVIMIENTOS_BANCARIOS.data.length,2);
});
test('Detecta categoría faltante antes de abrir Caja y restringe diagnóstico a gerencia',()=>{
 const {call,tables,context}=setup();
 assert.equal(context.revisarEstructuraCaja().compatible,true);
 const i=tables.MOVIMIENTOS_BANCARIOS.data[0].indexOf('categoria');
 tables.MOVIMIENTOS_BANCARIOS.data.forEach(row=>row.splice(i,1));
 assert.equal(context.revisarEstructuraCaja().compatible,false);
 assert.equal(call({action:'bootstrap'}).ok,false);
 assert.equal(call({action:'schema'}).ok,false);
});
