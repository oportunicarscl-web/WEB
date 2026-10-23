const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('../admin.js');
test('Administrar: interpreta líneas de cartola con montos chilenos y signo',()=>{
 const r=A.parseLines('15-10-2026 ; Depósito cliente ; 250.000\n16/10/26;Pago proveedor;-$48.500\n2026-10-17\tArriendo\t(1.200.000)\n18-10-2026;Cargo;10.000;\n19-10-2026;Abono;;5.000\nmala;x;1');
 assert.deepEqual([r[0].date,r[0].direction,r[0].amount],['2026-10-15','ENTRADA',250000]);
 assert.deepEqual([r[1].date,r[1].direction,r[1].amount],['2026-10-16','SALIDA',48500]);
 assert.deepEqual([r[2].direction,r[2].amount],['SALIDA',1200000]);
 assert.deepEqual([r[3].direction,r[3].amount],['SALIDA',10000]);
 assert.deepEqual([r[4].direction,r[4].amount],['ENTRADA',5000]);
 assert.equal(r[5].error,'Fecha inválida');
});
test('Administrar: rechaza líneas incompletas o con fecha imposible',()=>{
 const r=A.parseLines('31-02-2026;x;100\nsolo dos;columnas\n10-10-2026;;100\n10-10-2026;algo;abc');
 assert.ok(r.every(x=>x.error));
});
