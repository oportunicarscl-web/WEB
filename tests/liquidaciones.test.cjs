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
{
 const L=require('../liquidaciones.js'),assert=require('assert');
 assert.equal(L.businessDays('2026-11-02','2026-11-13'),10);
 assert.equal(L.businessDays('2026-11-07','2026-11-08'),0);
 assert.equal(L.monthsWorked('2025-11-15','2026-11-14'),11);
 assert.equal(L.monthsWorked('2025-11-15','2026-11-15'),12);
 const v=L.vacation({trabajador_id:'a',fecha_ingreso:'2025-11-15',dias_vacaciones_anuales:15,vacaciones_saldo_inicial:2},[{trabajador_id:'a',tipo:'VACACIONES',dias:5},{trabajador_id:'a',tipo:'LICENCIA',dias:3},{trabajador_id:'b',tipo:'VACACIONES',dias:9}],'2026-11-15');
 assert.deepEqual([v.devengado,v.tomado,v.saldo,v.licencia],[15,5,12,3]);
 const ms=L.months([{liquidacion_id:'1',persona:'JT',periodo:'2026-01',componente:'BASE',monto:3000000},{liquidacion_id:'2',persona:'JT',periodo:'2026-01',componente:'IMPOSICIONES',monto:400000},{liquidacion_id:'3',persona:'JT',periodo:'2026-02',componente:'BASE',monto:3000000}],[{liquidacion_id:'1',monto:3000000},{liquidacion_id:'3',monto:3500000}]);
 const h=L.history(ms);
 assert.deepEqual(h.rows.map(r=>r.acumulado),[400000,-100000]);
 assert.equal(h.years[0].comps.IMPOSICIONES,400000);
 console.log('rrhh ok');
}
{
 const L=require('../liquidaciones.js'),assert=require('assert');
 assert.equal(L.businessDays('2026-09-14','2026-09-25'),9); // 18-09 feriado
 const v=L.vacation({trabajador_id:'a',fecha_ingreso:'2015-03-01',anios_previos:5,dias_vacaciones_anuales:15},[],'2026-11-07');
 assert.equal(v.progresivo,2);assert.equal(v.anual,17);assert.equal(v.periodos.length,12);assert.ok(v.acumulaExceso);
 const w=L.vacation({trabajador_id:'b',fecha_ingreso:'2025-11-01'},[{trabajador_id:'b',tipo:'VACACIONES',desde:'2026-02-02',dias:5}],'2026-11-07');
 assert.deepEqual([w.periodos.length,w.periodos[0].tomado,w.periodos[1].completo,w.progresivo],[2,5,false,0]);
 console.log('rrhh2 ok');
}
{
 const L=require('../liquidaciones.js'),assert=require('assert');
 // JT: ingreso 01-11-2025, al 10-11-2026 cumplió el 1.er año (15 con derecho) + 9 días del 2.º período (9/30 × 1,25 = 0,38).
 const jt={trabajador_id:'TRB-JT',fecha_ingreso:'2025-11-01',dias_vacaciones_anuales:15,sueldo_base:3000000,persona_liq:'JT',dias_administrativos_anuales:3};
 let v=L.vacation(jt,[],'2026-11-10');
 assert.deepEqual([v.conDerecho,v.proporcional,v.saldo,v.periodos.length,v.proximoAniversario],[15,0.38,15.38,2,'2026-11-01'.replace('2026','2027')]);
 // FIFO: 12 días tomados en dic-2026 salen del 1.er período aunque caen en el 2.º.
 v=L.vacation(jt,[{trabajador_id:'TRB-JT',tipo:'VACACIONES',desde:'2026-12-01',dias:12}],'2026-12-20');
 assert.deepEqual([v.periodos[0].tomado,v.periodos[0].saldo,v.periodos[1].tomado,v.periodos[0].bloque10],[12,3,0,true]);
 // Dos períodos completos sin tomar: alerta de acumulación y fecha límite.
 v=L.vacation(jt,[],'2027-12-01');assert.ok(v.acumulaExceso);assert.equal(v.vence,'2028-11-01');
 // Progresivo: sin años previos recién a los 13 años con este empleador; con 10 previos, a los 3 años.
 assert.equal(L.progresivoEn(0,12),0);assert.equal(L.progresivoEn(0,13),1);assert.equal(L.progresivoEn(10,3),1);assert.equal(L.progresivoEn(25,6),2);
 // Días corridos para pagar feriado: 15 hábiles desde viernes 06-11-2026 → hasta el 27-11 = 21 corridos.
 assert.equal(L.toCalendarDays('2026-11-06',15),21);
 // Remuneración íntegra: base + promedio de los últimos 3 variables.
 const fv=L.feriadoValue(jt,[{persona:'JT',componente:'VARIABLE',periodo:'2026-08',monto:2000820},{persona:'JT',componente:'VARIABLE',periodo:'2026-09',monto:3000000},{persona:'JT',componente:'VARIABLE',periodo:'2026-10',monto:3000000},{persona:'JT',componente:'VARIABLE',periodo:'2026-06',monto:9}],15,'2026-11-06');
 assert.deepEqual([fv.variable,fv.corridos,fv.diario],[2666940,21,188898]);
 // Administrativos: cupo 3, se renuevan en el aniversario; los del año anterior no cuentan.
 const ev=[{trabajador_id:'TRB-JT',tipo:'ADMINISTRATIVO',desde:'2026-10-15',dias:1},{trabajador_id:'TRB-JT',tipo:'ADMINISTRATIVO',desde:'2026-11-05',dias:0.5}];
 assert.deepEqual(L.adminDays(jt,ev,'2026-11-10'),{cupo:3,usado:0.5,disponible:2.5,desde:'2026-11-01',hasta:'2027-11-01',calendario:false});
 assert.equal(L.adminDays({...jt,admin_renovacion:'CALENDARIO'},ev,'2026-11-10').usado,1.5);
 // Permisos legales: matrimonio 5 hábiles saltando fin de semana; duelo hijo 10 corridos.
 assert.deepEqual(L.permitRange('MATRIMONIO','2026-11-12'),{hasta:'2026-11-18',dias:5});
 assert.deepEqual(L.permitRange('DUELO_HIJO','2026-11-12'),{hasta:'2026-11-21',dias:10});
 console.log('rrhh3 ok');
}
