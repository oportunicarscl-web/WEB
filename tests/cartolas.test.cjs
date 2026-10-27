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
