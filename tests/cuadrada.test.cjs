const {test}=require('node:test'),assert=require('node:assert/strict');
const N=require('../caja-nueva.js'),core=require('../system-core.js');
const mv=o=>({id:'m'+Math.random(),accountId:'a',account:'MP',date:'2026-10-16',direction:'SALIDA',directionInferred:false,confirmed:true,amount:1000,classification:{id:'x',name:'Lavado',vehicleOperation:'COSTO_AUTO',vehicleId:'7'},source:'',...o});
const acc=[{id:'a',name:'MP',opening:5000,cut:'2026-10-15',version:1}];
test('Saldo corrido: solo mueven el saldo los movimientos completos posteriores al corte',()=>{
 const a=mv({date:'2026-10-16',amount:1000}),b=mv({date:'2026-10-17',direction:'ENTRADA',amount:500,classification:{id:'v',name:'Venta',vehicleOperation:'VENTA',vehicleId:'7'}}),c=mv({amount:300,confirmed:false}),d=mv({amount:200,classification:null}),e=mv({date:'2026-10-14',amount:999}),f=mv({amount:50,classification:{id:'x',name:'Lavado',vehicleOperation:'COSTO_AUTO',vehicleId:null}});
 const r=N.balances(acc,[b,a,c,d,e,f],'2026-10-15').a;
 assert.equal(r.computed,4500);assert.equal(r.running[a.id],4000);assert.equal(r.running[b.id],4500);assert.equal(r.pending.count,3);
 assert.deepEqual(N.missing(f),['Auto']);assert.deepEqual(N.missing(c),['Importe']);assert.deepEqual(N.missing(d),['Concepto']);
});
test('Dirección sugerida no cuenta hasta confirmarla',()=>{assert.deepEqual(N.missing(mv({directionInferred:true})),['Ingreso o egreso']);});
test('Macheo: atajo con el movimiento real de misma cuenta, importe y dirección',()=>{
 const q=mv({source:'ATAJO',confirmed:false,amount:20000,date:'2026-10-20'}),x=mv({amount:20000,date:'2026-10-21',classification:null,confirmed:false}),other=mv({amount:19000,date:'2026-10-21',classification:null}),wrongAcc=mv({amount:20000,accountId:'b',classification:null});
 const p=N.findMatches([q,x,other,wrongAcc]);assert.equal(p.length,1);assert.equal(p[0].target.id,x.id);
});
test('El saldo del sistema exige concepto y auto desde el arranque, no antes',()=>{
 const d={accounts:[{cuenta_id:'a',nombre:'MP',saldo_inicial:1000,fecha_saldo_inicial:'2026-10-15'}],movements:[{cuenta_id:'a',fecha_operacion:'2026-10-16',monto:100,direccion:'SALIDA',monto_confirmado:'SI',incluir_en_saldo:'SI'},{cuenta_id:'a',fecha_operacion:'2026-10-17',monto:50,direccion:'SALIDA',monto_confirmado:'SI',incluir_en_saldo:'SI',concepto_id:'c'}],inventory:[],operations:[],activities:[],forecasts:[],loans:[],strictFrom:'2026-10-15'};
 assert.equal(core.reports(d,'2026-10-20').accounts[0].balance,950);
});
test('Caja histórica: suma lo registrado correctamente hasta el corte, sin saldo inicial',()=>{
 const a=mv({date:'2026-10-01',direction:'ENTRADA',amount:700}),b=mv({date:'2026-10-02',amount:200}),c=mv({date:'2026-10-03',amount:50,confirmed:false}),d=mv({date:'2026-10-16',amount:999}),u=mv({date:'',amount:10});
 const r=N.balances(acc,[a,b,c,d,u],'2026-10-15','hist').a;
 assert.equal(r.computed,500);assert.equal(r.pending.count,2);
});
