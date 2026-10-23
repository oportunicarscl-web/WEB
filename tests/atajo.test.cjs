const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ctx={Utilities:{},Date,Error};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../backend/Atajo.gs'),'utf8'),ctx);
const base={requestId:'abcdef123456',amount:15000,direction:'SALIDA',accountId:'a',date:'2026-10-20'};
const gasto={id:'c',name:'Combustible',nature:'COSTO',vehicleOperation:'COSTO_AUTO'},ingreso={id:'v',name:'Venta',nature:'INGRESO',vehicleOperation:'VENTA'};
test('Atajo: valida y normaliza un gasto con auto',()=>{
 const q=ctx.ocQuickValidate_(base,gasto,{cuenta_id:'a'},{id:'7'},'2026-10-22');assert.equal(q.vehicleId,'7');assert.equal(q.date,'2026-10-20');assert.equal(q.amount,15000);
});
test('Atajo: concepto por asignar es válido; fecha futura o vieja vuelve a hoy',()=>{
 const q=ctx.ocQuickValidate_({...base,conceptId:'',date:'2027-01-01'},null,{cuenta_id:'a'},null,'2026-10-22');assert.equal(q.date,'2026-10-22');assert.equal(q.vehicleId,'');
 assert.equal(ctx.ocQuickValidate_({...base,date:'2025-01-01'},gasto,{cuenta_id:'a'},null,'2026-10-22').date,'2026-10-22');
});
test('Atajo: rechaza monto inválido, concepto inconsistente con la dirección y cuenta inexistente',()=>{
 assert.throws(()=>ctx.ocQuickValidate_({...base,amount:0},gasto,{},null,'2026-10-22'));
 assert.throws(()=>ctx.ocQuickValidate_({...base,amount:10.5},gasto,{},null,'2026-10-22'));
 assert.throws(()=>ctx.ocQuickValidate_({...base,conceptId:'v'},ingreso,{},null,'2026-10-22'));
 assert.throws(()=>ctx.ocQuickValidate_(base,gasto,null,null,'2026-10-22'));
 assert.throws(()=>ctx.ocQuickValidate_({...base,requestId:'x'},gasto,{},null,'2026-10-22'));
});
test('Manual: valida línea, rechaza fecha futura, monto o descripción vacía',()=>{
 const ok=ctx.ocManualValidate_({amount:5000,direction:'SALIDA',date:'2026-10-20',description:' Compra caja chica '},'2026-10-22');assert.equal(ok.description,'Compra caja chica');
 assert.throws(()=>ctx.ocManualValidate_({amount:5000,direction:'SALIDA',date:'2026-11-20',description:'x'},'2026-10-22'));
 assert.throws(()=>ctx.ocManualValidate_({amount:0,direction:'SALIDA',date:'2026-10-20',description:'x'},'2026-10-22'));
 assert.throws(()=>ctx.ocManualValidate_({amount:5,direction:'SALIDA',date:'2026-10-20',description:' '},'2026-10-22'));
 assert.equal(ctx.ocIsAdminUser_({name:' Alex '}),true);assert.equal(ctx.ocIsAdminUser_({name:'Gonzalo'}),false);
});
