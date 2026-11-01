const assert=require('assert');
require('../system-core.js');const K=require('../correo-core.js');const {fixture}=require('./correos.fixture.cjs');

// Configuración: valida correos, repetidos, día/hora y que activar exige destinatarios.
const base=K.defaults();
assert.strictEqual(base.enabled,false);assert.strictEqual(base.weekday,1);assert.strictEqual(base.frequency,'SEMANAL');
assert.throws(()=>K.normalize({recipients:[{email:'alex@'}]}),/Correo inválido/);
assert.throws(()=>K.normalize({recipients:[{email:'a@b.cl'},{email:'A@b.cl '}]}),/repetido/);
assert.throws(()=>K.normalize({enabled:true,recipients:[]}),/al menos un destinatario/);
assert.throws(()=>K.normalize({hour:24}),/Hora/);assert.throws(()=>K.normalize({weekday:0}),/Día/);assert.throws(()=>K.normalize({frequency:'DIARIA'}),/Frecuencia/);
const cfg=K.normalize({enabled:true,recipients:[{email:' Alex@Oportunicars.cl ',name:'Alex'},{email:'tutu@oportunicars.cl',active:false}],sections:{gastos:false},subject:''});
assert.strictEqual(cfg.recipients[0].email,'alex@oportunicars.cl');assert.strictEqual(cfg.recipients[1].active,false);
assert.strictEqual(cfg.sections.gastos,false);assert.strictEqual(cfg.sections.flujo,true);assert.strictEqual(cfg.subject,'Oportunicars · Resumen semanal');

// Programación: lunes 8:00, una vez por día; cada 2 semanas espera 13 días desde el último.
assert.strictEqual(K.isoDow('2026-11-02'),1);assert.strictEqual(K.isoDow('2026-11-01'),7);
assert.strictEqual(K.due(cfg,{day:'2026-11-02',hour:7},null),false);
assert.strictEqual(K.due(cfg,{day:'2026-11-02',hour:8},null),true);
assert.strictEqual(K.due(cfg,{day:'2026-11-02',hour:15},{day:'2026-11-02'}),false);
assert.strictEqual(K.due(cfg,{day:'2026-11-03',hour:9},null),false);
assert.strictEqual(K.due({...cfg,enabled:false},{day:'2026-11-02',hour:9},null),false);
const q={...cfg,frequency:'QUINCENAL'};
assert.strictEqual(K.due(q,{day:'2026-11-09',hour:9},{day:'2026-11-02'}),false);
assert.strictEqual(K.due(q,{day:'2026-11-16',hour:9},{day:'2026-11-02'}),true);
assert.strictEqual(K.nextRun(cfg,{day:'2026-10-31',hour:20},null).day,'2026-11-02');
assert.strictEqual(K.nextRun(cfg,{day:'2026-11-02',hour:9},{day:'2026-11-02'}).day,'2026-11-09');
assert.strictEqual(K.nextRun(q,{day:'2026-11-03',hour:9},{day:'2026-11-02'}).day,'2026-11-16');

// Período: los 7 días que terminan ayer (enviado lunes = semana lunes–domingo anterior).
assert.deepStrictEqual(K.periodOf('2026-11-02',1).from,'2026-10-26');assert.deepStrictEqual(K.periodOf('2026-11-02',1).to,'2026-11-01');
assert.strictEqual(K.periodOf('2026-11-02',2).from,'2026-10-19');

// Cálculo con datos ficticios: mismas reglas que el Resumen (utilidad = venta − compra − costos − estacionamiento).
const f=fixture(),D=K.prepare(f.loaded),R=K.compute(D,f.today,K.defaults());
assert.strictEqual(R.cur.sales.count,2);
const hilux=R.cur.sales.list.find(c=>c.id==='V1');assert.strictEqual(hilux.result,19900000-14500000-180000-hilux.parking);
assert.strictEqual(R.cur.sales.profit,R.cur.sales.list.reduce((s,c)=>s+c.result,0));
// Ingresos del negocio excluyen aportes de socios; transferencias no cuentan.
assert.strictEqual(R.cur.flows.business,19900000+13300000);assert.strictEqual(R.cur.flows.contributions,0);
assert.strictEqual(R.series[6].contributions,4000000);
assert.strictEqual(R.cur.flows.net,R.cur.flows.business-R.cur.flows.exits);
// Caja: saldos desde el 15-oct; antes de esa fecha no hay saldo comparable.
assert.ok(Number.isFinite(R.cash));assert.strictEqual(R.series[0].cash,null);
assert.strictEqual(R.cash,R.accounts.reduce((s,a)=>s+a.balance,0));
// Inventario y capital.
assert.strictEqual(R.stock.count,R.stock.ages.reduce((s,a)=>s+a.count,0)+R.stock.noDays);
assert.strictEqual(R.capital.total,54000000);

// HTML: sin secciones apagadas, sin nada operativo, con marca y escapado del mensaje.
const m=K.build(D,f.today,{...cfg,note:'<b>hola</b>',sections:{...cfg.sections,gastos:false}});
assert.ok(m.subject.includes('semana del 26 oct al 1 nov'));
assert.ok(m.html.includes('oportuni<span'));assert.ok(m.html.includes('&lt;b&gt;hola&lt;/b&gt;'));
assert.ok(!m.html.includes('Composición de gastos'));assert.ok(m.html.includes('Flujo de caja'));
assert.ok(!/por clasificar|pendientes de|tareas/i.test(m.html));
assert.ok(!/<script|<svg/i.test(m.html));
assert.ok(m.text.includes('Autos vendidos: 2'));
// Sin datos no se cae.
const empty=K.build(K.prepare({}),'2026-11-02',K.defaults());assert.ok(empty.html.includes('No hubo ventas'));
// Costo de capital y alertas de precio.
assert.strictEqual(K.defaults().capitalRate,12);assert.throws(()=>K.normalize({capitalRate:150}),/capital/);assert.strictEqual(K.normalize({capitalRate:'9,5'}).capitalRate,9.5);
const sold=R.cur.sales.list.find(c=>c.id==='V1');assert.strictEqual(sold.capital,Math.round(14500000*0.12*sold.days/365));
assert.strictEqual(R.cur.sales.afterCapital,R.cur.sales.profit-R.cur.sales.list.filter(c=>c.result!==null).reduce((s,c)=>s+c.capital,0));
assert.ok(R.prices.length>=1&&R.prices.every(a=>a.reason));assert.ok(R.prices.every(a=>a.reason==='NEGATIVO'||a.days>60));
const tucson=R.prices.find(a=>a.label.includes('Tucson'));assert.strictEqual(tucson.reason,'MAS_90');assert.strictEqual(tucson.expected,tucson.list-tucson.cost);
assert.ok(R.stock.capitalStock>0&&R.stock.capitalPeriod>0);
const R0=K.compute(D,f.today,K.normalize({capitalRate:0}));assert.strictEqual(R0.stock.capitalStock,0);assert.strictEqual(R0.cur.sales.afterCapital,R0.cur.sales.profit);
const mh=K.build(D,f.today,K.defaults()).html;assert.ok(mh.includes('para revisar precio')&&mh.includes('Ajustar precio')&&mh.includes('Utilidad después de capital'));
console.log('correos ok');
// backend/CorreoSistema.gs debe estar generado desde el system-core.js actual (node tools/build-correo-sistema.cjs).
{const fs=require('fs'),src=fs.readFileSync(__dirname+'/../system-core.js','utf8').trimEnd(),gs=fs.readFileSync(__dirname+'/../backend/CorreoSistema.gs','utf8');
 assert.ok(gs.includes(src.slice(0,src.lastIndexOf('})(typeof globalThis'))),'CorreoSistema.gs desactualizado: ejecuta node tools/build-correo-sistema.cjs');}
