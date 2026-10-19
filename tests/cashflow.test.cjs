const {test}=require('node:test');
const assert=require('node:assert/strict');
const c=require('../cashflow.js');
const map={date:0,amount:1,reference:2,id:3,credit:'',debit:''};
const a='CTA-MERCADO-PAGO';
test('Cinco cuentas independientes; pesos enteros y fechas reales',()=>{
 assert.equal(c.accounts.length,5);assert.equal(c.amount('1.200.000'),1200000);assert.equal(c.amount('1,200,000'),1200000);assert.equal(c.amount('(1200)'),-1200);assert.equal(c.amount('+1200'),1200);assert.equal(c.amount('1,25'),null);assert.equal(c.amount(''),null);
 assert.equal(c.date('31/02/2026'),null);assert.equal(c.date('17/10/2026'),'2026-10-17');
});
test('Dirección se conserva y no se acepta Mercado Pago provisional',()=>{
 const r=c.normalize([['2026-10-17',100,'REF','ID','SALIDA','NO','approved']],{...map,direction:4,confirmed:5,sourceState:6},a)[0];
 assert.equal(r.direction,'SALIDA');assert.ok(r.errors.includes('Monto efectivo por confirmar'));
 assert.deepEqual(c.suggestions([r],[r]),[null]);
});
test('Duplicados en el mismo banco se señalan todos; otras cuentas no',()=>{
 const r=c.normalize([['2026-10-17',100,'R','ID']],map,a)[0];
 assert.ok(c.duplicates([r,r]).every(x=>x.duplicate));
 assert.ok(c.duplicates([r,{...r,account:'CTA-CAJA'}]).every(x=>!x.duplicate));
});
test('Coincidencias únicas; rechaza reutilización, distinta cuenta y referencia vacía',()=>{
 const r=c.normalize([['2026-10-17',100,'R','ID']],map,a)[0];
 assert.equal(c.suggestions([r],[{...r}])[0].amount,100);
 assert.deepEqual(c.suggestions([r,r],[r]),[null,null]);
 assert.deepEqual(c.suggestions([r],[r,{...r}]),[null]);
 assert.deepEqual(c.suggestions([r],[{...r,account:'CTA-CAJA'}]),[null]);
 assert.deepEqual(c.suggestions([{...r,reference:''}],[{...r,reference:''}]),[null]);
});
test('Cargos y abonos no permiten signos negativos ni ambas direcciones',()=>{
 const m={date:0,credit:1,debit:2};
 assert.equal(c.normalize([['2026-10-17',0,200]],m,a)[0].direction,'SALIDA');
 assert.ok(c.normalize([['2026-10-17',200,200]],m,a)[0].errors.length);
 assert.ok(c.normalize([['2026-10-17','texto',200]],m,a)[0].errors.length);
});
test('Lectura XLSX mantiene encabezados y fechas de Excel',()=>{
 const x=require('../vendor/xlsx.full.min.js');const wb=x.utils.book_new();
 x.utils.book_append_sheet(wb,x.utils.aoa_to_sheet([['Fecha','Monto'],[new Date(2026,9,17),-12000]]),'Cartola');
 const read=x.read(x.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer',cellDates:true});
 const rows=x.utils.sheet_to_json(read.Sheets.Cartola,{header:1,raw:true});
 const r=c.normalize(rows.slice(1),{date:0,amount:1},a)[0];assert.equal(r.date,'2026-10-17');assert.equal(r.amount,12000);assert.equal(r.direction,'SALIDA');assert.equal(r.errors.length,0);
});
