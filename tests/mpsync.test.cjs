const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),vm=require('vm');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../backend/MercadoPagoSync.gs','utf8')+';this.R=osMpReportRows_;this.E=osMpPaymentEvent_;this.S=osMpShift_;this.T=osMpRepTime_;',ctx);
test('reporte de liberaciones: solo payment/payout, ignora reservas; el saldo es la fila final del reporte',()=>{
 const csv='DATE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT;BALANCE_AMOUNT\n2026-08-23T00:00:00.000-03:00;;;4866442.00;0.00;4866442.00\n2026-08-24T12:51:04.000-03:00;10;reserve_for_payout;0.00;49400.00;4817042.00\n2026-08-24T12:51:06.000-03:00;10;reserve_for_payout;49400.00;0.00;4866442.00\n2026-08-24T12:51:06.000-03:00;10;payout;0.00;49400.00;4817042.00\n2026-08-24T13:05:39.000-03:00;11;payment;23909.00;0.00;4840951.00\n;;;18045342.00;0.00;0.00\n';
 const r=ctx.R(csv);assert.equal(r.rows.length,2);
 assert.deepEqual(r.rows.map(x=>[x.id,x.direccion,x.monto]),[['PAYOUT-10','SALIDA',49400],['11','ENTRADA',23909]]);
 assert.equal(r.balance,18045342);
});
test('pago aprobado: dirección por cobrador/pagador; autorizados quedan por liberar; ignora rechazados',()=>{
 const base={id:1,status:'approved',date_approved:'2026-10-21T16:52:41.000-04:00',transaction_amount:1000,transaction_details:{net_received_amount:962},payment_type_id:'credit_card'};
 const ent=ctx.E({...base,collector:{id:5}},'5');assert.equal(ent.direccion,'ENTRADA');assert.equal(ent.monto,962);
 const sal=ctx.E({...base,collector:{id:9},payer_id:5},'5');assert.equal(sal.direccion,'SALIDA');assert.equal(sal.monto,1000);
 assert.equal(ctx.E({...base,status:'rejected',collector:{id:5}},'5'),null);const hold=ctx.E({...base,status:'authorized',payer_id:5,collector:{id:9},description:'Entel'},'5');assert.equal(hold.porLiberar,true);assert.equal(hold.direccion,'SALIDA');assert.equal(hold.monto,1000);assert.match(hold.descripcion,/^Por liberar/);assert.equal(ctx.E({...base,status:'cancelled',payer_id:5,collector:{id:9}},'5'),null);
 assert.equal(ctx.E({...base,collector:{id:9},payer_id:7},'5'),null);
});
test('shift de días',()=>{assert.equal(ctx.S('2026-10-15',3),'2026-10-12');});
test('saldo por movimientos: inicial + todos los movimientos desde el corte, completos o no',()=>{
 const {movementBalance}=require('../caja-nueva.js');
 const a={id:'mp',opening:1000,cut:'2026-10-15'};
 const mv=[{accountId:'mp',date:'2026-10-14',direction:'ENTRADA',amount:999},{accountId:'mp',date:'2026-10-16',direction:'ENTRADA',amount:500},{accountId:'mp',date:'2026-10-17',direction:'SALIDA',amount:200},{accountId:'mp',date:'2026-10-17',direction:'',amount:7},{accountId:'otra',date:'2026-10-17',direction:'ENTRADA',amount:50}];
 assert.deepEqual(movementBalance(a,mv,'2026-10-15'),{value:1300,count:2,skipped:1});
 assert.equal(movementBalance({id:'mp',opening:null},mv,'2026-10-15'),null);
});

{const assert=require('assert');
 const csv='DATE,SOURCE_ID,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT,GROSS_AMOUNT,MP_FEE_AMOUNT,TAXES_AMOUNT,PAYMENT_METHOD,TRANSACTION_APPROVAL_DATE,BUSINESS_UNIT,SUB_UNIT,BALANCE_AMOUNT,PAYMENT_METHOD_TYPE,PURCHASE_ID\n'
 +'2026-10-22T09:14:35.000-03:00,184467516793,payout,0.00,10000000.00,10000000.00,0,0,,,,,18088798.00,,\n'
 +',,,18045342.00,0.00,18484464.00,-439122.00,0.00,,,,,0.00,,\n';
 const r=ctx.R(csv);assert.strictEqual(r.balance,18045342);assert.strictEqual(r.rows.length,1);assert.strictEqual(r.rows[0].id,'PAYOUT-184467516793');
 assert.strictEqual(ctx.T({date_created:'2026-10-23T03:27:46.000-04:00'}),Date.parse('2026-10-23T03:27:46Z'));
 assert.strictEqual(ctx.T({date_created:'2026-10-23T12:44:39.065329Z'}),Date.parse('2026-10-23T12:44:39.065Z'));
 console.log('ok mp summary + hora');}
