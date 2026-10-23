const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),vm=require('vm');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../backend/MercadoPagoSync.gs','utf8')+';this.R=osMpReportRows_;this.E=osMpPaymentEvent_;this.S=osMpShift_;',ctx);
test('reporte de liberaciones: solo payment/payout, ignora reservas y totales, saldo corrido',()=>{
 const csv='DATE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT;BALANCE_AMOUNT\n2026-08-23T00:00:00.000-03:00;;;4866442.00;0.00;4866442.00\n2026-08-24T12:51:04.000-03:00;10;reserve_for_payout;0.00;49400.00;4817042.00\n2026-08-24T12:51:06.000-03:00;10;reserve_for_payout;49400.00;0.00;4866442.00\n2026-08-24T12:51:06.000-03:00;10;payout;0.00;49400.00;4817042.00\n2026-08-24T13:05:39.000-03:00;11;payment;23909.00;0.00;4840951.00\n;;;18045342.00;0.00;0.00\n';
 const r=ctx.R(csv);assert.equal(r.rows.length,2);
 assert.deepEqual(r.rows.map(x=>[x.id,x.direccion,x.monto]),[['PAYOUT-10','SALIDA',49400],['11','ENTRADA',23909]]);
 assert.equal(r.balance,4840951);
});
test('pago aprobado: dirección por cobrador/pagador; ignora rechazados y autorizados',()=>{
 const base={id:1,status:'approved',date_approved:'2026-10-21T16:52:41.000-04:00',transaction_amount:1000,transaction_details:{net_received_amount:962},payment_type_id:'credit_card'};
 const ent=ctx.E({...base,collector:{id:5}},'5');assert.equal(ent.direccion,'ENTRADA');assert.equal(ent.monto,962);
 const sal=ctx.E({...base,collector:{id:9},payer_id:5},'5');assert.equal(sal.direccion,'SALIDA');assert.equal(sal.monto,1000);
 assert.equal(ctx.E({...base,status:'rejected',collector:{id:5}},'5'),null);assert.equal(ctx.E({...base,status:'authorized',payer_id:5,collector:{id:9}},'5'),null);
 assert.equal(ctx.E({...base,collector:{id:9},payer_id:7},'5'),null);
});
test('shift de días',()=>{assert.equal(ctx.S('2026-10-15',3),'2026-10-12');});
