const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../system-core.js'),F=require('../finanzas.js');
const mv=(o={})=>({cuenta_id:'a',fecha_operacion:'2026-10-02',monto:50,direccion:'SALIDA',monto_confirmado:'SI',incluir_en_saldo:'SI',naturaleza:'GASTO',...o});
const base=()=>({accounts:[{cuenta_id:'a',nombre:'Banco',saldo_inicial:1000,fecha_saldo_inicial:'2026-10-01'}],inventory:[{vehiculo_id:'v1',patente:'A'},{vehiculo_id:'v2',patente:'B'}],operations:[{vehiculo_id:'v1',modalidad:'PROPIO',fecha_ingreso:'2026-10-01',estado_auto:'DISPONIBLE',costo_compra:100},{vehiculo_id:'v2',modalidad:'PROPIO',fecha_ingreso:'2026-10-01',estado_auto:'DISPONIBLE',costo_compra:100}],activities:[],movements:[],fixed:[],forecasts:[],loans:[]});
test('Costos asignados a autos se suman por concepto; compra y venta no entran',()=>{
 const d=base();d.movements=[mv({naturaleza:'COSTO',operacion_auto:'COSTO_AUTO',concepto_nombre:'Lavado',vehiculo_id:'v1',monto:10}),mv({naturaleza:'COSTO',operacion_auto:'COSTO_AUTO',concepto_nombre:'Lavado',vehiculo_id:'v2',monto:15}),mv({naturaleza:'COSTO',operacion_auto:'COSTO_AUTO',concepto_nombre:'Combustible',vehiculo_id:'v1',monto:30}),mv({naturaleza:'COSTO',operacion_auto:'COMPRA',concepto_nombre:'Compra',vehiculo_id:'v1',monto:500}),mv({naturaleza:'COSTO',concepto_nombre:'Lavado',monto:99})];
 const rows=core.reports(d,'2026-10-19').dashboard.carExpenses;
 assert.deepEqual(rows.map(x=>[x.name,x.total,x.cars]),[['Combustible',30,1],['Lavado',25,2]]);
});
test('Un costo asignado a un auto (COSTO_AUTO) suma a la preparación sin crear actividad',()=>{
 const d=base();d.movements=[mv({naturaleza:'COSTO',operacion_auto:'COSTO_AUTO',vehiculo_id:'v1',monto:40})];
 assert.equal(core.reports(d,'2026-10-19').cars.find(c=>c.id==='v1').preparation,40);
});
test('Costos fijos salen de la caja (promedio de meses cerrados), no de COSTOS_FIJOS',()=>{
 const d=base();d.fixed=[{costo_fijo_id:'x',monto_mensual:999999,habilitado:'SI'}];
 d.movements=[mv({fecha_operacion:'2026-08-10',monto:100,tipo_costo:'FIJO'}),mv({fecha_operacion:'2026-09-10',monto:200,tipo_costo:'FIJO'}),mv({fecha_operacion:'2026-10-05',monto:900,tipo_costo:'FIJO'}),mv({fecha_operacion:'2026-09-11',monto:700,tipo_costo:'VARIABLE'})];
 assert.equal(core.reports(d,'2026-10-19').fixedMonthly,150);
});
test('Cuadre: saldo real distinto del calculado avisa que falta un flujo y sugiere el candidato',()=>{
 const d=base();d.movements=[mv({monto:50,movimiento_id:'m1'}),mv({monto:300,movimiento_id:'m2',monto_confirmado:'NO',descripcion:'Pago pendiente'})];
 const ok=core.reconcileAccount(d.accounts[0],d.movements,'2026-10-19',950);assert.equal(ok.status,'OK');assert.equal(ok.computed,950);
 const bad=core.reconcileAccount(d.accounts[0],d.movements,'2026-10-19',650);
 assert.equal(bad.status,'DESCUADRE');assert.equal(bad.diff,-300);assert.equal(bad.candidates[0].id,'m2');assert.equal(bad.unconfirmed.count,1);
 assert.equal(core.reconcileAccount(d.accounts[0],d.movements,'2026-10-19').status,'SIN_REFERENCIA');
 assert.equal(core.reconcileAccount({cuenta_id:'a',nombre:'x',saldo_inicial:'',fecha_saldo_inicial:''},[],'2026-10-19',5).status,'SIN_SALDO');
});
test('Cuadre con cartola: detecta el tramo donde falta un flujo',()=>{
 const d=base();
 d.movements=[mv({fecha_operacion:'2026-10-02',monto:100,saldo_cartola:900}),mv({fecha_operacion:'2026-10-05',monto:50,saldo_cartola:700})];
 const x=core.reconcileAccount(d.accounts[0],d.movements,'2026-10-19');
 assert.equal(x.status,'DESCUADRE');assert.equal(x.diff,-150);assert.equal(x.firstBreak.amount,-150);assert.equal(x.firstBreak.from,'2026-10-02');assert.equal(x.firstBreak.to,'2026-10-05');
 assert.equal(core.reports(d,'2026-10-19').warnings.length,1);
});
test('Pronóstico: <3 meses no proyecta; sin tendencia usa promedio; con tendencia extrapola',()=>{
 assert.equal(F.trendForecast([1,2]),null);
 const flat=F.trendForecast([100,100,100,100,100,100]);assert.equal(flat.method,'promedio');assert.deepEqual(flat.est,[100,100,100]);
 const up=F.trendForecast([100,200,300,400,500,600]);assert.equal(up.method,'tendencia');assert.deepEqual(up.est,[700,800,900]);
 assert.equal(F.trendForecast([100,400,150,380,120,390]).method,'promedio');
 assert.ok(F.trendForecast([5,5,5]).est.every(x=>x>=0));
});
test('ROE y ROA sobre capital aportado por socios y activos',()=>{
 const d=base();d.operations[0]={...d.operations[0],estado_auto:'VENDIDO',fecha_venta:'2026-10-10',precio_venta:300};
 d.movements=[mv({naturaleza:'APORTE_CAPITAL',direccion:'ENTRADA',monto:1000,socio:'Alex'}),mv({naturaleza:'GASTO',categoria:'Marketing',monto:20})];
 const r=core.reports(d,'2026-10-19'),a=F.analyze(d,r,'2026-10-19');
 assert.equal(a.capital,1000);assert.equal(a.bySocio.Alex,1000);assert.equal(a.carResult,200);assert.equal(a.overhead,20);assert.equal(a.profit,180);assert.equal(a.roe,0.18);
 assert.ok(a.roa>0&&a.roa<a.roe);
 d.movements=[];assert.equal(F.analyze(d,core.reports(d,'2026-10-19'),'2026-10-19').roe,null);
});
test('Modelo de flota: sin ventas con resultado no inventa un óptimo',()=>{
 const d=base();assert.equal(F.fleetModel(d,core.reports(d,'2026-10-19'),'2026-10-19').ready,false);
});
test('Modelo de flota: con historia produce óptimo dentro de la capacidad',()=>{
 const d=base();d.companyStart='2026-05-01';d.operations=[];d.inventory=[];let n=0;
 [['2026-05-20',1],['2026-06-15',2],['2026-07-10',2],['2026-08-12',2],['2026-09-18',3],['2026-10-08',2]].forEach(([day,q])=>{for(let i=0;i<q;i++){n++;d.inventory.push({vehiculo_id:'v'+n});d.operations.push({vehiculo_id:'v'+n,modalidad:'PROPIO',fecha_ingreso:new Date(Date.parse(day)-45*864e5).toISOString().slice(0,10),estado_auto:'VENDIDO',costo_compra:600,fecha_venta:day,precio_venta:720});}});
 for(let i=0;i<4;i++){d.inventory.push({vehiculo_id:'s'+i});d.operations.push({vehiculo_id:'s'+i,modalidad:'PROPIO',fecha_ingreso:'2026-09-20',estado_auto:'DISPONIBLE',costo_compra:600});}
 d.accounts=[{cuenta_id:'a',nombre:'B',saldo_inicial:5000,fecha_saldo_inicial:'2026-04-30'}];
 const f=F.fleetModel(d,core.reports(d,'2026-10-19'),'2026-10-19',{capacity:12,costOfCapital:0.01});
 assert.equal(f.ready,true);assert.equal(f.margin,120);assert.equal(f.currentN,4);assert.ok(f.beta>=0.3&&f.beta<=1);assert.ok(f.optimal.n>=1&&f.optimal.n<=12);
 assert.equal(f.curve.length,13);assert.equal(f.profitNow,f.curve[4].profit);assert.ok(f.curve.every(p=>p.profit<=f.optimal.profit));
});
