const assert=require('assert');const L=require('../liquidaciones.js');
const liqs=[{liquidacion_id:'b12',periodo:'2025-12',componente:'BASE',monto:3000000},{liquidacion_id:'v12',periodo:'2025-12',componente:'VARIABLE',monto:2741907},{liquidacion_id:'b01',periodo:'2026-01',componente:'BASE',monto:3000000}];
// Un pago cubre base + variable de diciembre.
assert.deepStrictEqual(L.fifo(L.pendingByLiq(liqs,[],''),5741907),{b12:3000000,v12:2741907});
// Dos pagos para un mes; el saldo baja con ambos.
const imps=[{movimiento_id:'m1',liquidacion_id:'b01',monto:1000000},{movimiento_id:'m2',liquidacion_id:'b01',monto:2000000}];
const ms=L.months(liqs,imps);assert.strictEqual(ms[1].saldo,0);assert.strictEqual(ms[0].saldo,5741907);
// Editar el reparto de m2 no cuenta lo suyo como pagado.
assert.strictEqual(L.pendingByLiq(liqs,imps,'m2').find(l=>l.liquidacion_id==='b01').pendiente,2000000);
// Planilla: monto exacto cerca del mes, prefiere imputado.
const mov=[{id:'a',direction:'SALIDA',amount:6000000,date:'2026-02-10'},{id:'b',direction:'SALIDA',amount:6000000,date:'2026-02-20'}];
const r=L.matchPlanilla([{n:1,mes:'2026-02',monto:6000000}],mov,new Set(['b']));assert.strictEqual(r[0].hit.id,'b');
const r2=L.matchPlanilla([{n:1,mes:'2026-02',monto:6000000},{n:2,mes:'2026-02',monto:6000000}],mov,new Set(['a','b']));assert.deepStrictEqual(r2.map(x=>x.hit.id),['a','b']);
console.log('liquidaciones ok');
