const assert=require('assert');const R=require('../rentabilidad.js');
const mv=(id,date,dir,amount,extra={})=>({movimiento_id:id,fecha_operacion:date,direccion:dir,monto:amount,estado_registro:'ACTIVO',...extra});
// Auto cuadrado: cobrado y pagado coinciden con la ficha.
const car={id:'1',label:'ABCD12',sold:true,saleDate:'2026-10-10',modality:'PROPIO',result:1000000,sale:10000000,unconfirmed:0,parking:0,
 lines:[{op:'COMPRA',dir:'SALIDA',amount:8500000},{op:'ARREGLO',dir:'SALIDA',amount:500000},{op:'VENTA',dir:'ENTRADA',amount:10000000}]};
let r=R.carResult(car,{precio_venta:10000000,costo_compra:8500000});
assert.strictEqual(r.estado,'CUADRADO');assert.strictEqual(r.resultado,1000000);assert.strictEqual(Math.round(r.margen),10);
assert.strictEqual(R.carResult(car,{precio_venta:10500000,costo_compra:8500000}).estado,'DIFIERE');
assert.strictEqual(R.carResult({...car,lines:car.lines.slice(0,2)},{}).estado,'FALTA_COBRO');
assert.strictEqual(R.carResult(car,{},{d:'2026-10-11'}).estado,'CERRADO');
// Resultado mensual: excluye compras/ventas de autos, transferencias, personales y Por aclarar; separa fijos y variables.
const ms=[mv('a','2026-10-02','SALIDA',3000000,{concepto_id:'SUELDO_JT',concepto_nombre:'Sueldo JT',naturaleza:'GASTO',tipo_costo:'FIJO'}),
 mv('b','2026-10-03','SALIDA',200000,{concepto_id:'TRANSPORTE',concepto_nombre:'Transporte',naturaleza:'GASTO',tipo_costo:'VARIABLE'}),
 mv('c','2026-10-04','SALIDA',8500000,{concepto_id:'COMPRA',naturaleza:'COSTO',operacion_auto:'COMPRA',vehiculo_id:'1'}),
 mv('d','2026-10-05','SALIDA',500000,{concepto_id:'TRANSFERENCIA',naturaleza:'TRANSFERENCIA'}),
 mv('e','2026-10-06','SALIDA',40000,{concepto_id:'b428e0d5-0ea5-4e87-92ee-9196cf74526c',concepto_nombre:'Por Aclarar',naturaleza:'GASTO'}),
 mv('f','2026-10-07','SALIDA',90000,{concepto_id:'P',concepto_nombre:'Gasto personal / retiro de socio',categoria:'Retiro de socio',naturaleza:'GASTO'}),
 mv('g','2026-10-08','SALIDA',10000),mv('h','2026-09-08','SALIDA',2000000,{concepto_id:'ARRIENDO',concepto_nombre:'Arriendo',naturaleza:'GASTO',tipo_costo:'FIJO'})];
const rows=R.monthly(ms,[car],'2026-10-31'),oct=rows.find(x=>x.month==='2026-10');
assert.strictEqual(oct.fixed,3000000);assert.strictEqual(oct.variable,200000);assert.strictEqual(oct.margin,1000000);assert.strictEqual(oct.result,-2200000);
assert.strictEqual(oct.personal,90000);assert.strictEqual(oct.aclarar,40000);assert.strictEqual(oct.unassignedN,1);
// Equilibrio: gastos promedio de meses cerrados / margen promedio por auto.
const be=R.breakeven(rows,[car],'2026-11-05');assert.strictEqual(be.opex,(2000000+3200000)/2);assert.strictEqual(be.perCar,1000000);assert.strictEqual(be.missing,3);
// Stock: alerta y precio sugerido que no baja del costo.
const st=R.stock([{id:'2',label:'X',sold:false,status:'DISPONIBLE',modality:'PROPIO',days:95,listPrice:10000000,purchase:9600000,preparation:100000}],{}, '2026-11-01');
assert.strictEqual(st[0].level,'ROJO');assert.strictEqual(st[0].suggested,9700000);
assert.deepStrictEqual(R.recordPrices({'2':[['2026-10-01',10000000]]},[{id:'2',listPrice:10000000}],'2026-11-01'),null);
assert.deepStrictEqual(R.recordPrices({},[{id:'2',listPrice:9900000}],'2026-11-01'),{'2':[['2026-11-01',9900000]]});
// Consignación: comisión % de la ficha, pagado y pendiente.
const cc={...car,modality:'CONSIGNADO',lines:[{op:'VENTA',dir:'ENTRADA',amount:10000000},{op:'COMPRA',dir:'SALIDA',amount:5000000}]};
let k=R.consignment(cc,{comision_consignacion:5},{});assert.strictEqual(k.comision,500000);assert.strictEqual(k.saldo,9500000);assert.strictEqual(k.pendiente,4500000);
k=R.consignment(cc,{comision_consignacion:''},{});assert.strictEqual(k.comision,null);assert.strictEqual(k.comisionImplicita,5000000);
// Pago directo al dueño: a la caja entró solo la comisión, sin deuda.
const dc={...cc,lines:[{op:'VENTA',dir:'ENTRADA',amount:600000}]};k=R.consignment(dc,{precio_venta:12000000,comision_consignacion:5},{});assert.strictEqual(k.pendiente,0);assert.strictEqual(k.comision,600000);
assert.strictEqual(R.carResult(dc,{precio_venta:12000000,comision_consignacion:5}).estado,'CUADRADO');
assert.strictEqual(R.consignment({...cc,lines:[]},{precio_venta:12000000},{}).pendiente,null);
// Reglas: solo sin asignar y en la dirección pedida.
const rm=R.ruleMatches([mv('x','2026-10-01','SALIDA',5000,{descripcion:'eCOMMERCE MERPAGO WHOOSHCLS'}),mv('y','2026-10-01','SALIDA',5000,{descripcion:'WHOOSH',concepto_id:'T'}),mv('z','2026-10-01','ENTRADA',5000,{descripcion:'WHOOSH'})],{pattern:'WHOOSH',dir:'SALIDA'});
assert.deepStrictEqual(rm.map(m=>m.movimiento_id),['x']);
assert.strictEqual(R.resolveConcept([{id:'c1',name:'Claxo publicación'}],'name:claxo').id,'c1');
// Comisiones: % del margen por modalidad y vigencia.
const cm=R.commissions([car,{...car,id:'3',modality:'CONSIGNADO'}],[{persona:'JT',base:'MARGEN',valor:10,modalidad:'PROPIO',desde:'2026-01'}],'2026-11-01');
assert.strictEqual(cm['2026-10'].JT.total,100000);assert.strictEqual(cm['2026-10'].JT.cars.length,1);
// Calendario: F29 pagado si hay impuesto en el mes de vencimiento; IVA estimado sobre margen propio.
const tx=R.taxCalendar([mv('t','2026-10-18','SALIDA',300000,{concepto_id:'IMPUESTOS',concepto_nombre:'Impuestos'})],[{...car,saleDate:'2026-09-10',result:1190000}],'2026-10-25');
const f=tx.find(t=>t.id==='F29-2026-09');assert.strictEqual(f.status,'PAGADO');assert.strictEqual(Math.round(f.estimate),190000);
assert.strictEqual(tx.find(t=>t.id==='PREV-2026-09').status,'VENCIDO');
// Flujo 13 semanas: proyección y consignadores en la semana 1.
const w=R.cashPlan(1000000,{carsPerWeek:1,marginPerCar:500000,opexMonth:5200000},[{fecha:'2026-11-12',direccion:'ENTRADA',pending:200000}],300000,'2026-11-05');
assert.strictEqual(w.length,13);assert.strictEqual(w[0].from,'2026-11-02');assert.strictEqual(w[0].close,1000000+500000-1200000-300000);assert.strictEqual(w[1].forecastIn,200000);
console.log('rentabilidad ok');
// Inversiones en otros negocios: fuera del resultado operacional.
{const r2=R.monthly([{movimiento_id:'i',fecha_operacion:'2026-08-30',direccion:'SALIDA',monto:600000,estado_registro:'ACTIVO',concepto_id:'INVERSIONES_OTROS',concepto_nombre:'Inversiones otros negocios',naturaleza:'GASTO',tipo_costo:'NO_APLICA'}],[],'2026-09-01')[0];
require('assert').strictEqual(r2.inversion,600000);require('assert').strictEqual(r2.result,0);console.log('inversiones ok');}
