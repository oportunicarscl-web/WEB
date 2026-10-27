const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../system-core.js');
function data(){return {accounts:[{cuenta_id:'a',nombre:'Banco',saldo_inicial:1000,fecha_saldo_inicial:'2026-10-01'}],inventory:[{vehiculo_id:'v',patente:'TEST'}],operations:[{vehiculo_id:'v',modalidad:'PROPIO',fecha_ingreso:'2026-10-01',estado_auto:'DISPONIBLE',costo_compra:100}],activities:[],movements:[],fixed:[],forecasts:[],loans:[]};}
function movement(overrides={}){return {cuenta_id:'a',fecha_operacion:'2026-10-02',monto:50,direccion:'SALIDA',monto_confirmado:'SI',incluir_en_saldo:'SI',naturaleza:'COSTO',...overrides};}
test('Patrimonio incluye stock propio al costo y no precio publicado ni consignados',()=>{const d=data();d.inventory[0].precio_publicado=9999;let r=core.reports(d,'2026-10-18');assert.equal(r.patrimony,1100);d.operations[0].modalidad='CONSIGNADO';r=core.reports(d,'2026-10-18');assert.equal(r.stock,0);assert.equal(r.patrimony,1000);});
test('Costo de actividad y pago vinculado no se duplican, tampoco los pagos parciales',()=>{const d=data();d.activities=[{actividad_id:'act',vehiculo_id:'v',tipo:'ARREGLO',costo:80}];d.movements=[movement({vehiculo_id:'v',actividad_id:'act',operacion_auto:'ARREGLO'})];const r=core.reports(d,'2026-10-18');assert.equal(r.cars[0].preparation,80);assert.equal(r.cash,950);assert.equal(r.stock,180);});
test('Cuota cobrada reduce cuenta por cobrar sin duplicar entrada bancaria',()=>{const d=data();d.forecasts=[{proyeccion_id:'p',tipo:'CUOTA_VENTA',direccion:'ENTRADA',monto:200}];d.movements=[movement({direccion:'ENTRADA',proyeccion_id:'p',naturaleza:'INGRESO'})];const r=core.reports(d,'2026-10-18');assert.equal(r.cash,1050);assert.equal(r.receivable,150);assert.equal(r.patrimony,1300);});
test('Faltantes no producen patrimonio falso y el saldo inicial no duplica día de corte',()=>{const d=data();d.movements=[movement({fecha_operacion:'2026-10-01'})];assert.equal(core.reports(d,'2026-10-18').cash,1000);d.accounts[0].saldo_inicial='';assert.equal(core.reports(d,'2026-10-18').patrimony,null);d.accounts[0].saldo_inicial=0;d.movements[0].monto_confirmado='NO';assert.equal(core.reports(d,'2026-10-18').patrimony,null);});
test('Amortización reduce deuda; intereses no reducen principal',()=>{const d=data();d.loans=[{prestamo_id:'l',sentido:'RECIBIDO',saldo_inicial:500,fecha_saldo:'2026-10-01'}];d.movements=[movement({prestamo_id:'l',componente_prestamo:'AMORTIZACION'}),movement({prestamo_id:'l',componente_prestamo:'INTERES',monto:10})];const r=core.reports(d,'2026-10-18');assert.equal(r.debt,450);assert.equal(r.cash,940);});
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../backend/Sistema.gs'),'utf8'),ctx);vm.runInContext(fs.readFileSync(require.resolve('../backend/Importacion.gs'),'utf8'),ctx);
test('Perfil de banco simple no exige información exclusiva de Mercado Pago',()=>{const p={mapeo_json:JSON.stringify({date:'Fecha',credit:'Abono',debit:'Cargo',description:'Detalle'}),modo_importe:'CREDIT_DEBIT',formato_fecha:'DD/MM/YYYY',estado_efectivo:'CARTOLA_EFECTIVA'};const r=ctx.osNormalizeBank_({Fecha:'18/10/2026',Cargo:'1.200.000',Detalle:'CYC'},p);assert.equal(r.monto,1200000);assert.equal(r.direccion,'SALIDA');assert.equal(r.errors.length,0);assert.equal(r.operacion_origen_id,'');});
test('MP approved sin evidencia de efecto bancario permanece provisional',()=>{const p={mapeo_json:JSON.stringify({date:'fecha',amount:'bruto',state:'estado'}),modo_importe:'SIGNED',formato_fecha:'YYYY-MM-DD',estado_efectivo:'settled'};const r=ctx.osNormalizeBank_({fecha:'2026-10-18',bruto:100,estado:'approved'},p);assert.ok(r.errors.length);});
test('Importe positivo sin modo de dirección no se adivina y fecha imposible se rechaza',()=>{const p={mapeo_json:JSON.stringify({date:'fecha',amount:'monto'}),modo_importe:'ABS_DIRECTION',formato_fecha:'YYYY-MM-DD',estado_efectivo:'CARTOLA_EFECTIVA'};const r=ctx.osNormalizeBank_({fecha:'2026-02-31',monto:100},p);assert.ok(r.errors.length>=2);assert.equal(r.direccion,'');});
test('Stock desconocido se muestra incompleto, no como cero',()=>{const d=data();d.operations=[];assert.equal(core.reports(d,'2026-10-19').stock,null);d.operations=[{vehiculo_id:'v',modalidad:'PROPIO',estado_auto:'DISPONIBLE',costo_compra:''}];assert.equal(core.reports(d,'2026-10-19').stock,null);});
test('Estacionamiento calculado: fecha de venta congela días e ignora días manuales',()=>{const d=data();d.activities=[{vehiculo_id:'v',tipo:'ESTACIONAMIENTO',dias:999}];d.operations[0].estado_auto='VENDIDO';d.operations[0].fecha_venta='2026-10-11';d.operations[0].precio_venta=150;const r=core.reports(d,'2026-10-19');assert.equal(r.cars[0].parkingDays,10);assert.equal(r.dashboard.lastSold[0].result,50);});
test('Servicio a plazo afecta deuda pero no caja; pago parcial reduce compromiso',()=>{const d=data();d.forecasts=[{proyeccion_id:'s',direccion:'SALIDA',tipo:'SERVICIO_30_DIAS',monto:300}];let r=core.reports(d,'2026-10-19');assert.equal(r.cash,1000);assert.equal(r.debt,300);d.movements=[movement({proyeccion_id:'s',monto:100})];r=core.reports(d,'2026-10-19');assert.equal(r.cash,900);assert.equal(r.debt,200);});
test('Historia no inventa saldos anteriores al corte y no cuenta transferencias como ingreso',()=>{const d=data();d.companyStart='2026-08-01';d.movements=[movement({naturaleza:'TRANSFERENCIA',direccion:'ENTRADA'})];const r=core.reports(d,'2026-10-19');assert.equal(r.dashboard.history.length,3);assert.equal(r.dashboard.history[0].balance,null);assert.equal(r.dashboard.history[2].entries,0);assert.equal(r.dashboard.history[2].balance,1050);});

test('Margen del auto sale de la caja: venta − compra − costos, también en consignados', () => {
 const mv=(o)=>movement({monto_confirmado:'SI',incluir_en_saldo:'SI',vehiculo_id:'v',...o});
 const d=data();d.accounts[0].saldo_inicial=0;d.operations=[{vehiculo_id:'v',modalidad:'PROPIO',fecha_ingreso:'2026-10-01',estado_auto:'VENDIDO',fecha_venta:'2026-10-10',precio_venta:1}];
 d.movements=[mv({monto:10000,operacion_auto:'COMPRA'}),mv({monto:500,operacion_auto:'ARREGLO'}),mv({monto:100,operacion_auto:'COSTO_AUTO'}),mv({monto:14000,direccion:'ENTRADA',naturaleza:'INGRESO',operacion_auto:'VENTA',fecha_operacion:'2026-10-12'})];
 let c=core.reports(d,'2026-10-18').cars[0];
 assert.equal(c.purchase,10000);assert.equal(c.preparation,600);assert.equal(c.sale,14000);assert.equal(c.result,3400);assert.equal(Math.round(c.margin),24);
 d.operations[0].modalidad='CONSIGNADO';c=core.reports(d,'2026-10-18').cars[0];assert.equal(c.commission,3400);
 d.movements=d.movements.filter(m=>m.operacion_auto!=='COMPRA');d.operations[0].costo_compra='';c=core.reports(d,'2026-10-18').cars[0];assert.equal(c.result,null);
 d.operations[0].estado_auto='DISPONIBLE';c=core.reports(d,'2026-10-18').cars[0];assert.equal(c.salePending,true);assert.equal(c.saleDateCaja,'2026-10-12');
});

test('Costos asignados a un auto cuentan aunque el importe siga por confirmar, sin tocar saldos', () => {
 const d=data();d.accounts[0].saldo_inicial=0;d.operations=[];
 d.movements=[{cuenta_id:'a',fecha_operacion:'2026-10-05',monto:80,direccion:'',monto_confirmado:'NO',incluir_en_saldo:'NO',naturaleza:'COSTO',operacion_auto:'ARREGLO',vehiculo_id:'v'}];
 const r=core.reports(d,'2026-10-18'),c=r.cars[0];
 assert.equal(c.preparation,80);assert.equal(c.unconfirmed,1);assert.equal(c.hasFicha,false);assert.equal(r.cash,0);
});

test('Día de venta = último cobro de venta en caja; ingreso inferido de la primera compra; días de inventario', () => {
 const mv=o=>movement({vehiculo_id:'v',...o});
 const d=data();d.accounts[0].saldo_inicial=0;d.operations=[{vehiculo_id:'v',modalidad:'PROPIO',estado_auto:'VENDIDO',fecha_venta:'2026-10-30',precio_venta:1}];
 d.movements=[mv({monto:100,operacion_auto:'COMPRA',fecha_operacion:'2026-09-01'}),mv({monto:30,direccion:'ENTRADA',naturaleza:'INGRESO',operacion_auto:'VENTA',fecha_operacion:'2026-09-20'}),mv({monto:70,direccion:'ENTRADA',naturaleza:'INGRESO',operacion_auto:'VENTA',fecha_operacion:'2026-10-11'})];
 const c=core.reports(d,'2026-10-18').cars[0];
 assert.equal(c.saleDate,'2026-10-11');assert.equal(c.entryDate,'2026-09-01');assert.equal(c.entryInferred,true);assert.equal(c.days,40);
 assert.equal(c.lines.filter(l=>l.op==='VENTA').length,2);
 d.operations[0].fecha_ingreso='2026-09-05';assert.equal(core.reports(d,'2026-10-18').cars[0].days,36);
});
test('Ids numéricos en caja se unen al inventario de texto y una venta cobrada marca vendido',()=>{const d=data();d.operations=[];d.inventory=[{vehiculo_id:'100',patente:'ARGO'}];d.movements=[movement({vehiculo_id:100,operacion_auto:'VENTA',direccion:'ENTRADA',naturaleza:'INGRESO',monto:4250000,monto_confirmado:'NO',fecha_operacion:'2026-09-30'}),movement({vehiculo_id:100,operacion_auto:'ARREGLO',monto:1000,monto_confirmado:'NO'})];const c=core.reports(d,'2026-10-18').cars[0];assert.equal(c.income,4250000);assert.equal(c.preparation,1000);assert.equal(c.sold,true);assert.equal(c.status,'VENDIDO');assert.equal(c.saleDate,'2026-09-30');});



test('Capital de socios: aporte ingresado a mano sin socio toma el nombre de la descripción',()=>{
 const d=data();d.movements=[movement({naturaleza:'APORTE_CAPITAL',direccion:'ENTRADA',monto:4170000,descripcion:'ALEX'}),movement({naturaleza:'APORTE_CAPITAL',direccion:'ENTRADA',monto:5000000,socio:'Alex'})];
 const c=core.reports(d,'2026-10-25').capital;assert.equal(c.bySocio.Alex,9170000);assert.equal(c.bySocio['Sin socio'],undefined);
});



test('Capital de socios: sin datos en duro, es lo registrado en la caja con concepto de aporte',()=>{
 const d=data();d.contributions=[{aporte_id:'t',socio:'Socios',monto:133470000,estado:'REGISTRADO'}];
 d.movements=[movement({naturaleza:'APORTE_CAPITAL',direccion:'ENTRADA',monto:36500000,socio:'Gonzalo',monto_confirmado:'NO',incluir_en_saldo:'NO'}),movement({naturaleza:'APORTE_CAPITAL',direccion:'ENTRADA',monto:5000000,socio:'Alex'})];
 const c=core.reports(d,'2026-10-25').capital;assert.equal(c.total,41500000);assert.equal(c.bySocio.Gonzalo,36500000);
});

test('Flujo mensual separa negocio, aportes de socios, gastos fijos y no fijos; utilidad de ventas del mes',()=>{
 const d=data();d.accounts[0].saldo_inicial=0;d.operations=[{vehiculo_id:'v',modalidad:'PROPIO',fecha_ingreso:'2026-10-01',estado_auto:'VENDIDO',fecha_venta:'2026-10-10',precio_venta:1}];
 d.movements=[movement({monto:9500,operacion_auto:'COMPRA',vehiculo_id:'v',tipo_costo:'VARIABLE'}),movement({monto:300,tipo_costo:'FIJO',naturaleza:'GASTO'}),
  movement({monto:10100,direccion:'ENTRADA',naturaleza:'INGRESO',operacion_auto:'VENTA',vehiculo_id:'v',fecha_operacion:'2026-10-12'}),
  movement({monto:5000,direccion:'ENTRADA',naturaleza:'APORTE_CAPITAL',monto_confirmado:'NO',incluir_en_saldo:'NO'})];
 const r=core.reports(d,'2026-10-20'),h=r.dashboard.history.find(x=>x.month==='2026-10');
 assert.equal(h.business,10100);assert.equal(h.contributions,5000);assert.equal(h.fixedExits,300);assert.equal(h.variableExits,9500);
 assert.equal(r.dashboard.profit,600);assert.equal(r.dashboard.profitSales,10100);
});
test('Costo de estacionamiento: sobre N días suma (días − N) × valor; configurable',()=>{const d=data();d.operations[0].estado_auto='VENDIDO';d.operations[0].fecha_venta='2026-10-11';d.operations[0].precio_venta=150;
 const base=core.reports({...d,settings:{parkingDays:30,parkingRate:0}},'2026-10-19').cars[0];
 const r=core.reports({...d,settings:{parkingDays:5,parkingRate:3}},'2026-10-19').cars[0];
 assert.equal(r.parking,(base.days-5)*3);assert.equal(r.result,base.result-r.parking);
 assert.equal(core.reports({...d,settings:{parkingDays:999,parkingRate:3}},'2026-10-19').cars[0].parking,0);});
