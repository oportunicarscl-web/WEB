const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),vm=require('vm');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../backend/MercadoPagoSync.gs','utf8')+';this.osMpReportRows_=osMpReportRows_;this.osCsv_=osCsv_;this.osMpShift_=osMpShift_;',ctx);
test('reporte: créditos, débitos, ids sintéticos y saldo',()=>{
 const csv='DATE,SOURCE_ID,RECORD_TYPE,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT,GROSS_AMOUNT,BALANCE_AMOUNT\n2026-10-20T10:00:00.000-03:00,,initial_available_balance,,0.00,0.00,0.00,1000\n2026-10-20T11:00:00.000-03:00,111,release,payment,"1.250",0.00,1300,2250\n2026-10-21T09:00:00.000-03:00,,release,withdrawal,0.00,500,-500,1750\n2026-10-21T09:05:00.000-03:00,,release,withdrawal,0.00,500,-500,1250\n';
 const r=ctx.osMpReportRows_(csv,'2026-10-22');
 assert.equal(r.rows.length,3);assert.equal(r.rows[0].direccion,'ENTRADA');assert.equal(r.rows[1].direccion,'SALIDA');
 assert.notEqual(r.rows[1].id_evento,r.rows[2].id_evento);assert.equal(r.balance,1250);assert.equal(r.rows[0].id_evento,'111');
});
test('shift de días',()=>{assert.equal(ctx.osMpShift_('2026-10-15',3),'2026-10-12');});
