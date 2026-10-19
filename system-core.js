(function(root){
'use strict';
const n=v=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v?v:null;
const paid=m=>m.monto_confirmado==='SI'&&m.incluir_en_saldo==='SI'&&['ENTRADA','SALIDA'].includes(m.direccion)&&n(m.monto)!==null&&Number(m.monto)>=0;
const active=r=>r.estado_registro!=='ANULADO'&&(!r.ambiente||r.ambiente==='PRODUCCION');
function reports(d,today){
 const moves=d.movements.filter(active),confirmed=moves.filter(paid).filter(m=>date(m.fecha_operacion)&&m.fecha_operacion<=today),activities=d.activities.filter(active),ops=d.operations.filter(active);
 const accountRows=d.accounts.filter(active).map(a=>{
  const opening=n(a.saldo_inicial),cut=date(a.fecha_saldo_inicial),rows=confirmed.filter(m=>m.cuenta_id===a.cuenta_id&&date(m.fecha_operacion)&&cut&&m.fecha_operacion>cut&&m.fecha_operacion<=today);
  return {id:a.cuenta_id,name:a.nombre,balance:opening===null||!cut?null:opening+rows.reduce((s,m)=>s+(m.direccion==='ENTRADA'?1:-1)*Number(m.monto),0)};
 });
 const cars=d.inventory.filter(active).map(v=>{
  const o=ops.find(x=>x.vehiculo_id===v.vehiculo_id)||{},ms=confirmed.filter(m=>m.vehiculo_id===v.vehiculo_id),as=activities.filter(a=>a.vehiculo_id===v.vehiculo_id);
  const purchases=ms.filter(m=>m.operacion_auto==='COMPRA'),purchase=purchases.length?Math.max(n(o.costo_compra)||0,purchases.reduce((s,m)=>s+Number(m.monto),0)):n(o.costo_compra);
  const preparation=ms.filter(m=>m.naturaleza==='COSTO'&&m.operacion_auto!=='COMPRA').reduce((s,m)=>s+Number(m.monto),0)+as.reduce((s,a)=>s+Math.max(0,(n(a.costo)||0)-ms.filter(m=>m.actividad_id===a.actividad_id&&m.naturaleza==='COSTO'&&m.operacion_auto!=='COMPRA').reduce((sum,m)=>sum+Number(m.monto),0)),0);
  const sold=o.estado_auto==='VENDIDO',sale=n(o.precio_venta),commission=n(o.comision_consignacion),own=o.modalidad==='PROPIO';
  const cost=own&&purchase!==null?purchase+preparation:null;
  const end=sold&&date(o.fecha_venta)?o.fecha_venta:today;
  const days=date(o.fecha_ingreso)?Math.max(0,Math.floor((Date.parse(end)-Date.parse(o.fecha_ingreso))/86400000)):null;
  const income=ms.filter(m=>m.operacion_auto==='VENTA'&&m.direccion==='ENTRADA').reduce((s,m)=>s+Number(m.monto),0);
  return {id:v.vehiculo_id,label:[v.patente,v.marca,v.modelo].filter(Boolean).join(' · '),status:o.estado_auto||'POR_REVISAR',modality:o.modalidad||'POR_DEFINIR',days,parkingDays:days,entryDate:o.fecha_ingreso||'',saleDate:o.fecha_venta||'',activities:as.length,repairs:as.filter(a=>a.tipo==='ARREGLO').length,purchase,preparation,cost,sale,income,sold,result:sold?(own?(sale!==null&&cost!==null?sale-cost:null):(o.modalidad==='CONSIGNADO'&&commission!==null?commission-preparation:null)):null};
 });
 const pending=d.forecasts.filter(active).map(f=>{
  const settled=confirmed.filter(m=>m.proyeccion_id===f.proyeccion_id&&m.direccion===f.direccion).reduce((s,m)=>s+Number(m.monto),0);
  return {...f,pending:Math.max(0,(n(f.monto)||0)-settled)};
 });
 const receivable=pending.filter(f=>f.direccion==='ENTRADA'&&f.tipo!=='INGRESO_ESPERADO').reduce((s,f)=>s+f.pending,0);
 const obligations=pending.filter(f=>f.direccion==='SALIDA'&&['DEUDA','CONSIGNACION','SERVICIO_30_DIAS'].includes(f.tipo)).reduce((s,f)=>s+f.pending,0);
 const loans=d.loans.filter(active).map(l=>{
  const base=n(l.saldo_inicial),cut=date(l.fecha_saldo),rows=confirmed.filter(m=>m.prestamo_id===l.prestamo_id&&cut&&date(m.fecha_operacion)&&m.fecha_operacion>cut&&m.fecha_operacion<=today);
  return {...l,balance:base===null||!cut?null:base+rows.reduce((s,m)=>s+(m.componente_prestamo==='DESEMBOLSO'?Number(m.monto):m.componente_prestamo==='AMORTIZACION'?-Number(m.monto):0),0)};
 });
 const issues=[];
 if(!accountRows.length||accountRows.some(a=>a.balance===null))issues.push('Faltan saldos iniciales y fechas de corte de cuentas.');
 if(moves.some(m=>!paid(m)))issues.push('Hay movimientos bancarios sin importe o dirección confirmados.');
 if(moves.filter(paid).some(m=>!date(m.fecha_operacion)))issues.push('Hay movimientos confirmados sin fecha válida.');
 if(cars.some(c=>!c.sold&&(c.modality==='POR_DEFINIR'||c.modality==='PROPIO'&&c.cost===null)))issues.push('Falta modalidad o costo de compra de autos en stock.');
 if(loans.some(l=>l.balance===null||l.balance<0))issues.push('Revisar saldos iniciales o amortizaciones de préstamos.');
 const cash=accountRows.some(a=>a.balance===null)||!accountRows.length?null:accountRows.reduce((s,a)=>s+a.balance,0);
 const stock=cars.some(c=>!c.sold&&c.status!=='RETIRADO'&&(c.modality==='POR_DEFINIR'||c.modality==='PROPIO'&&c.cost===null))?null:cars.filter(c=>!c.sold&&c.status!=='RETIRADO'&&c.modality==='PROPIO').reduce((s,c)=>s+(c.cost||0),0);
 const loanDebt=loans.filter(l=>l.sentido==='RECIBIDO').reduce((s,l)=>s+(l.balance||0),0),loanAsset=loans.filter(l=>l.sentido==='OTORGADO').reduce((s,l)=>s+(l.balance||0),0);
 const fixed=d.fixed.filter(active).filter(f=>f.habilitado==='SI').reduce((s,f)=>s+(n(f.monto_mensual)||0),0);
 const month=today.slice(0,7),monthMoves=confirmed.filter(m=>String(m.fecha_operacion).slice(0,7)===month);
 const dashboard=analytics(d,today,cars,confirmed,accountRows);
 return {dashboard,today,accounts:accountRows,cars,forecasts:pending,loans,cash,stock,receivable,debt:obligations+loanDebt,loanAsset,patrimony:issues.length?null:cash+stock+receivable+loanAsset-obligations-loanDebt,issues,fixedMonthly:fixed,projectedIncome:pending.filter(f=>f.direccion==='ENTRADA'&&String(f.fecha).slice(0,7)===month).reduce((s,f)=>s+f.pending,0),salesMonth:ops.filter(o=>o.estado_auto==='VENDIDO'&&String(o.fecha_venta).slice(0,7)===month).length,entries:monthMoves.filter(m=>m.direccion==='ENTRADA'&&m.naturaleza!=='TRANSFERENCIA').reduce((s,m)=>s+Number(m.monto),0),exits:monthMoves.filter(m=>m.direccion==='SALIDA'&&m.naturaleza!=='TRANSFERENCIA').reduce((s,m)=>s+Number(m.monto),0),unclassified:moves.filter(m=>!m.concepto_id).length};
}
function analytics(d,today,cars,confirmed,accounts){
 const dates=[...(d.movements||[]).map(m=>m.fecha_operacion),...cars.map(c=>c.entryDate)].filter(date).filter(x=>x<=today).sort();
 const start=date(d.companyStart)||dates[0]||today;
 const months=[];for(let y=Number(start.slice(0,4)),m=Number(start.slice(5,7));y*12+m<=Number(today.slice(0,4))*12+Number(today.slice(5,7));m++){if(m>12){m=1;y++;}if(months.length>1200)break;months.push(y+'-'+String(m).padStart(2,'0'));}
 const history=months.map(month=>{const end=month===today.slice(0,7)?today:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);const ms=confirmed.filter(m=>m.fecha_operacion.slice(0,7)===month&&m.naturaleza!=='TRANSFERENCIA');const sold=cars.filter(c=>c.sold&&c.saleDate.slice(0,7)===month);const balances=d.accounts.map(a=>{const cut=date(a.fecha_saldo_inicial),base=n(a.saldo_inicial);return !cut||base===null||end<cut?null:base+confirmed.filter(m=>m.cuenta_id===a.cuenta_id&&m.fecha_operacion>cut&&m.fecha_operacion<=end).reduce((s,m)=>s+(m.direccion==='ENTRADA'?1:-1)*Number(m.monto),0);});return {month,sales:sold.length,revenue:sold.some(c=>c.sale===null)?null:sold.reduce((s,c)=>s+c.sale,0),entries:ms.filter(m=>m.direccion==='ENTRADA').reduce((s,m)=>s+Number(m.monto),0),exits:ms.filter(m=>m.direccion==='SALIDA').reduce((s,m)=>s+Number(m.monto),0),balance:!balances.length||balances.some(x=>x===null)?null:balances.reduce((s,v)=>s+v,0)};});
 const sold=cars.filter(c=>c.sold).sort((a,b)=>b.saleDate.localeCompare(a.saleDate)),current=sold.filter(c=>c.saleDate.slice(0,7)===today.slice(0,7));
 const margins=current.map(c=>c.result!==null&&c.sale>0?c.result/c.sale*100:null);
 const expenses={};confirmed.filter(m=>m.direccion==='SALIDA'&&m.naturaleza==='GASTO').forEach(m=>{const k=m.categoria||'Sin categoría';expenses[k]=(expenses[k]||0)+Number(m.monto);});
 const states={};cars.filter(c=>!c.sold&&c.status!=='RETIRADO').forEach(c=>{const k=c.modality==='CONSIGNADO'?'CONSIGNADO':c.status;states[k]=(states[k]||0)+1;});
 return {start,companyStartKnown:!!date(d.companyStart),history,stockCount:cars.filter(c=>!c.sold&&c.status!=='RETIRADO').length,revenue:current.some(c=>c.sale===null)?null:current.reduce((s,c)=>s+c.sale,0),margin:!margins.length||margins.some(x=>x===null)?null:margins.reduce((s,x)=>s+x,0)/margins.length,lastSold:sold.slice(0,4),expenses,states,pendingAccounts:d.accounts.map(a=>({name:a.nombre,count:d.movements.filter(m=>active(m)&&m.cuenta_id===a.cuenta_id&&(!m.concepto_id||m.estado_clasificacion==='POR_ASIGNAR_AUTO')).length}))};
}
const api={reports,paid,date,number:n};if(typeof module!=='undefined')module.exports=api;root.OCSystemCore=api;
})(typeof globalThis==='undefined'?this:globalThis);
