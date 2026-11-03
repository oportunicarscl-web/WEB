const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const C=require('../cartolas.js');
// Datos ficticios con el mismo formato que la copia del PDF de Scotiabank.
const HEAD='Desde 01/03/2026 Hasta 31/03/2026\nFecha Emisión 31/03/2026 Saldo inicial 1.000.000\nFecha Descripción Docto. Cargos Abonos Saldo';
const LINES=['02/03/2026 TEF 11111111-1 CLIENTE UNO 000000000 500.000 1.500.000',
 '02/03/2026 REDCOMPRA BENCINA 012345678 20.000 1.480.000',
 '03/03/2026 TEF 22222222-2 PROVEEDOR 000000000 5.000 1.475.000',
 '03/03/2026 TEF 22222222-2 PROVEEDOR 000000000 5.000 1.470.000',
 '3/16/26, 5:32 PM Consulta detalle de cartola emitida',
 'https://www.scotiabank.cl/x?tab=cartolas 1/2Fecha Descripción Docto. Cargos Abonos Saldo',
 '04/03/2026 PAGO IMPTO SII 170885023 000000000 70.000 1.400.000',
 '05/03/2026 GIRO POR CAJA 000000000 1.450.000 -50.000'];
test('Cartolas: reconoce Scotiabank e ignora encabezados y pies de página',()=>{
 const r=C.parse(HEAD+'\n'+LINES.join('\n'));
 assert.equal(r.format.id,'scotiabank');assert.equal(r.rows.length,6);assert.equal(r.bad,0);assert.ok(r.ok);
 assert.equal(r.opening,1000000);assert.equal(r.openingSource,'cartola');assert.equal(r.final,-50000);
 assert.deepEqual(r.rows.map(x=>x.direction),['ENTRADA','SALIDA','SALIDA','SALIDA','SALIDA','SALIDA']);
 assert.equal(r.rows[4].description,'PAGO IMPTO SII 170885023');assert.equal(r.rows[4].doc,'000000000');
 assert.deepEqual(r.totals,{in:500000,out:1550000});
});
test('Cartolas: dos cargos iguales el mismo día tienen huellas distintas',()=>{
 const r=C.parse(HEAD+'\n'+LINES.join('\n'));
 assert.notEqual(C.fingerprint('A',r.rows[2]),C.fingerprint('A',r.rows[3]));
});
test('Cartolas: sin encabezado pide saldo inicial o lo ancla con la cartola anterior',()=>{
 const only=LINES.join('\n');
 const a=C.parse(only);assert.equal(a.rows[0].error,'Falta el saldo inicial');assert.equal(a.bad,1);
 const b=C.parse(only,{known:[1000000]});assert.equal(b.bad,0);assert.equal(b.openingSource,'anterior');
 const c=C.parse(only,{opening:1000000});assert.equal(c.bad,0);assert.equal(c.openingSource,'manual');
});
test('Cartolas: un saldo que no calza se marca como descuadre',()=>{
 const r=C.parse(HEAD+'\n'+LINES[0]+'\n02/03/2026 REDCOMPRA BENCINA 012345678 20.000 1.490.000');
 assert.equal(r.bad,1);assert.match(r.rows[1].error,/Descuadre/);assert.equal(r.ok,false);
});
test('Cartolas: copia desde Excel con columnas de cargo y abono',()=>{
 const r=C.parse('01/03/2026\tTEF CLIENTE\t000000000\t\t100.000\t100.000\n02/03/2026\tREDCOMPRA X\t012345678\t1.000\t\t99.000',{opening:0});
 assert.equal(r.format.id,'scotiabank');assert.equal(r.bad,0);assert.deepEqual(r.rows.map(x=>x.direction),['ENTRADA','SALIDA']);
});
test('Cartolas: texto sin formato bancario no se toma como cartola',()=>{
 assert.equal(C.detect('15-10-2026 ; Depósito ; 250.000'),null);
 assert.equal(C.parse('hola').format,null);
});
test('Cartolas: sugiere la cuenta del banco detectado',()=>{
 const f=C.detect(LINES[0]),accs=[{id:'1',name:'MERCADO PAGO'},{id:'2',name:'SCOTIABANK PERSONAL'}];
 assert.equal(C.accountFor(f,accs).id,'2');
});
// Backend: misma validación de la cadena de saldos que la web.
function backend(){const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../backend/Cartolas.gs','utf8'),ctx);return ctx;}
test('Cartolas (backend): acepta la cadena correcta y rechaza descuadres',()=>{
 const g=backend(),r=C.parse(HEAD+'\n'+LINES.join('\n')),rows=r.rows.map(x=>({date:x.date,direction:x.direction,amount:x.amount,balance:x.balance,description:x.description,doc:x.doc}));
 assert.equal(g.ocCartolaValidate_({opening:r.opening,rows},'2026-10-27').length,6);
 assert.throws(()=>g.ocCartolaValidate_({opening:r.opening+1,rows},'2026-10-27'),/Descuadre en la línea 1/);
 assert.throws(()=>g.ocCartolaValidate_({rows},'2026-10-27'),/saldo inicial/);
 assert.throws(()=>g.ocCartolaValidate_({opening:0,rows:[{...rows[0],date:'2027-01-01'}]},'2026-10-27'),/Fecha/);
 assert.equal(g.ocCartolaFingerprint_('A',rows[2]),C.fingerprint('A',r.rows[2]));
});

// ---- Mercado Pago · «Actividad» pegada ----
const MP_TEXT=fs.readFileSync(__dirname+'/fixtures/mp-actividad.txt','utf8');
test('Mercado Pago Actividad: detecta formato y lee 25 movimientos con fecha, sentido y monto',()=>{
 assert.equal(C.detect(MP_TEXT).id,'mercadopago');
 const r=C.parse(MP_TEXT,{today:'2026-11-03'});
 assert.equal(r.rows.length,25);assert.equal(r.rows.filter(x=>x.skip).length,0);
 assert.deepEqual([r.rows[0].date,r.rows[0].direction,r.rows[0].amount,r.rows[0].description],['2026-10-23','ENTRADA',3431730,'Transferencia recibida · Cristian Orlando Loncón Vásquez']);
 assert.deepEqual([r.rows[4].direction,r.rows[4].amount,r.rows[4].method],['SALIDA',26466,'Mastercard prepago']);
 assert.equal(r.rows.filter(x=>x.amount===5000000).length,5);
 assert.equal(r.rows[24].date,'2026-10-19');
});
test('Mercado Pago Actividad: año anterior al cruzar de enero a diciembre y omite no aprobados',()=>{
 const t='5 de enero\nTienda\n10:00\nTienda\nPago online\nAprobado\n-\n$\n1.000\n30 de diciembre\nJuan\n09:00\nJuan\nTransferencia recibida\nRechazado\n+\n$\n2.000';
 const r=C.parse(t,{format:'mercadopago',today:'2026-01-10'});
 assert.deepEqual(r.rows.map(x=>x.date),['2026-01-05','2025-12-30']);
 assert.equal(r.rows[1].skip,'Rechazado');assert.equal(r.totals.in,0);
});
test('Mercado Pago Actividad: cruza con lo existente una vez por fila (±1 día)',()=>{
 const r=C.parse(MP_TEXT,{today:'2026-11-03'});
 C.matchExisting(r.rows,[{id:'a',date:'2026-10-21',direction:'ENTRADA',amount:5000000},{id:'b',date:'2026-10-22',direction:'ENTRADA',amount:5000000},{id:'c',date:'2026-10-21',direction:'SALIDA',amount:316066}]);
 assert.equal(r.rows.filter(x=>x.state==='dup').length,3);assert.equal(r.rows.filter(x=>x.state==='new').length,22);
});
test('Backend MP Actividad: valida y cruza igual que la web',()=>{
 const b=backend(),rows=b.ocMpActivityValidate_({rows:[{date:'2026-10-21',direction:'ENTRADA',amount:5000000,description:'x',time:'17:51'},{date:'2026-10-21',direction:'ENTRADA',amount:5000000,description:'x'}]},'2026-11-03');
 const hit=b.ocMpActivityMatch_(rows,[{id:'a',date:'2026-10-20',direction:'ENTRADA',amount:5000000}]);
 assert.equal(hit.filter(Boolean).length,1);
 assert.throws(()=>b.ocMpActivityValidate_({rows:[{date:'2026-12-01',direction:'ENTRADA',amount:1,description:'x'}]},'2026-11-03'));
});
