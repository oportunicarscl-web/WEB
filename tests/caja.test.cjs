const {test}=require('node:test');
const a=require('node:assert/strict');
const c=require('../caja.js');
const inventory=[{id:'auto1',name:'Auto 1'},{id:'auto2',name:'Auto 2'}];
const movement={id:'mov1',direction:'SALIDA',amount:1200000,confirmed:true};
test('El inventario muestra ID, patente y modelo sin pedir otra relación',()=>{
 a.equal(c.inventoryLabel({id:'AUTO-42',patente:'ABCD12',modelo:'Toyota Yaris'}),'AUTO-42 · ABCD12 · Toyota Yaris');
 const linked=c.classify(movement,c.defaults.find(x=>x.id==='COMPRA'),'auto1',inventory);
 const pending=c.assignVehicle(linked,'',inventory);a.equal(pending.id,linked.id);a.equal(pending.status,'POR_ASIGNAR_AUTO');
});
test('Un concepto aplica todas las clasificaciones y conserva el importe',()=>{
 const r=c.classify(movement,c.defaults.find(x=>x.id==='cyc'),null,inventory);
 a.equal(r.classification.category,'Marketing');a.equal(r.classification.nature,'GASTO');a.equal(r.classification.cost,'FIJO');a.equal(r.amount,1200000);a.equal(r.id,'mov1');
});
test('Por asignar auto permite vincular y corregir sin duplicar',()=>{
 const pending=c.classify(movement,c.defaults.find(x=>x.id==='ARREGLO'),null,inventory);
 a.equal(pending.status,'POR_ASIGNAR_AUTO');a.equal(pending.classification.vehicleId,null);
 const linked=c.assignVehicle(pending,'auto1',inventory);a.equal(linked.id,movement.id);a.equal(linked.status,'CLASIFICADO');
 const changed=c.assignVehicle(linked,'auto2',inventory);a.equal(c.vehicleTotals([changed],'auto1').repairs,0);a.equal(c.vehicleTotals([changed],'auto2').repairs,1200000);
 a.throws(()=>c.assignVehicle(pending,'unknown',inventory));
});
test('Compra, arreglo y venta calculan resultado; no suman pendientes sin monto confirmado',()=>{
 const rows=['COMPRA','ARREGLO','VENTA'].map((id,i)=>c.classify({...movement,id:String(i),direction:id==='VENTA'?'ENTRADA':'SALIDA',amount:[5000000,300000,6200000][i]},c.defaults.find(x=>x.id===id),'auto1',inventory));
 const t=c.vehicleTotals([...rows,{...rows[0],id:'unknown',confirmed:false}],'auto1');a.equal(t.result,900000);a.equal(t.unconfirmed,1);
});
test('Editar concepto no cambia clasificaciones anteriores ni admite duplicados',()=>{
 const concept={...c.defaults[0]},r=c.classify(movement,concept,null,inventory);concept.category='Otra';a.equal(r.classification.category,'RP');
 a.throws(()=>c.validate({...concept,id:'new'},c.defaults));
 a.throws(()=>c.classify(movement,c.defaults.find(x=>x.id==='VENTA'),null,inventory));
});
test('Gasto clasificado muestra egreso rojo aun si banco no entrega dirección; no confirma dinero',()=>{const m={amount:100377,confirmed:false,direction:'',classification:{id:'claxo',nature:'GASTO'}};a.equal(c.displayDirection(m),'SALIDA');a.equal(m.confirmed,false);a.equal(c.displayDirection({...m,classification:{nature:'INGRESO'}}),'ENTRADA');a.equal(c.displayDirection({...m,classification:null}),'');a.equal(c.displayDirection({...m,direction:'ENTRADA'}),'ENTRADA');});
test('Claxo permanece visible entre gastos, separado de pagos confirmados',()=>{const rows=[{amount:100377,confirmed:false,classification:{id:'claxo',nature:'GASTO'}}];const g=c.expenseGroups(c.defaults,rows).find(g=>g.concept.id==='claxo');a.equal(g.registered,100377);a.equal(g.confirmed,0);a.equal(g.pending.length,1);a.equal(c.expenseGroups(c.defaults,[]).find(g=>g.concept.id==='claxo').rows.length,0);});
test('Clasificaciones históricas no desaparecen si cambió el ID del catálogo',()=>{const m={amount:100377,confirmed:false,classification:{id:'LEGACY-CLAXO',name:'Pago recurrente Claxo',nature:'GASTO'}};const g=c.expenseGroups(c.defaults,[m]);a.equal(g.find(x=>x.concept.id==='claxo').registered,100377);a.equal(g.flatMap(x=>x.rows).length,1);});
