const assert=require('assert');const L=require('../liquidaciones.js');const C=require('../config.js');
const liqs=[{liquidacion_id:'b12',persona:'JT',periodo:'2025-12',componente:'BASE',monto:3000000},{liquidacion_id:'v12',persona:'JT',periodo:'2025-12',componente:'VARIABLE',monto:2741907},{liquidacion_id:'b01',persona:'JT',periodo:'2026-01',componente:'BASE',monto:3000000}];
// Un pago cubre base + variable de diciembre.
assert.deepStrictEqual(L.fifo(L.pendingByLiq(liqs,[],''),5741907,'JT'),{b12:3000000,v12:2741907});
// Dos pagos para un mes; el saldo baja con ambos.
const imps=[{movimiento_id:'m1',liquidacion_id:'b01',monto:1000000},{movimiento_id:'m2',liquidacion_id:'b01',monto:2000000}];
const ms=L.months(liqs,imps);assert.strictEqual(ms[1].saldo,0);assert.strictEqual(ms[0].saldo,5741907);assert.strictEqual(ms[0].lines.VARIABLE.monto,2741907);
assert.strictEqual(L.pendingByLiq(liqs,imps,'m2').find(l=>l.liquidacion_id==='b01').pendiente,2000000);
// Arriendo: arriendo antes que estacionamiento.
const ar=[{liquidacion_id:'e',persona:'ARRIENDO',periodo:'2026-09',componente:'ESTACIONAMIENTO',monto:397276},{liquidacion_id:'a',persona:'ARRIENDO',periodo:'2026-09',componente:'ARRIENDO',monto:2078857}];
assert.deepStrictEqual(L.fifo(L.pendingByLiq(ar,[],''),2476133,'ARRIENDO'),{a:2078857,e:397276});
// Planilla: monto exacto cerca del mes, prefiere imputado.
const mov=[{id:'a',direction:'SALIDA',amount:6000000,date:'2026-02-10'},{id:'b',direction:'SALIDA',amount:6000000,date:'2026-02-20'}];
assert.strictEqual(L.matchPlanilla([{n:1,mes:'2026-02',monto:6000000}],mov,new Set(['b']))[0].hit.id,'b');
assert.deepStrictEqual(L.matchPlanilla([{n:1,mes:'2026-02',monto:6000000},{n:2,mes:'2026-02',monto:6000000}],mov,new Set(['a','b'])).map(x=>x.hit.id),['a','b']);
// Sumas: 1M + 5M = 6M dentro de 7 días; ingresos no cuentan.
const mv2=[{id:'x',direction:'SALIDA',amount:1000000,date:'2026-10-01'},{id:'y',direction:'SALIDA',amount:5000000,date:'2026-10-02'},{id:'z',direction:'ENTRADA',amount:6000000,date:'2026-10-02'},{id:'w',direction:'',amount:2000000,date:'2026-10-03'}];
assert.deepStrictEqual(L.combos(mv2,6000000,'2026-10-15',30).map(c=>c.map(m=>m.id).sort().join('+')),['x+y']);
const pl=L.matchPlanilla([{n:801,mes:'2026-10',monto:6000000}],mv2,new Set());assert.strictEqual(pl[0].candidates[0].length,2);
// Socio sugerido desde la descripción (y alias TUTU → Gonzalo).
const so=[{nombre:'Alex'},{nombre:'Gonzalo'}];
assert.strictEqual(C.suggest({description:'ALEX',socio:''},so),'Alex');
assert.strictEqual(C.suggest({description:'DEPOSITO TUTU MP',socio:''},so),'Gonzalo');
assert.strictEqual(C.suggest({description:'concept cca',socio:'ALEX'},so),'Alex');
assert.strictEqual(C.suggest({description:'concept cca',socio:''},so),'');
console.log('liquidaciones ok');
