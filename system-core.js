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
  // Todo sale de la caja asignada al auto: compra (o pago al dueño en consignados), costos y cobros de venta.
  const purchases=ms.filter(m=>m.operacion_auto==='COMPRA'&&m.direccion==='SALIDA'),purchase=purchases.length?purchases.reduce((s,m)=>s+Number(m.monto),0):n(o.costo_compra);
  const preparation=ms.filter(m=>m.naturaleza==='COSTO'&&m.operacion_auto!=='COMPRA'&&m.operacion_auto!=='VENTA').reduce((s,m)=>s+Number(m.monto),0)+as.reduce((s,a)=>s+Math.max(0,(n(a.costo)||0)-ms.filter(m=>m.actividad_id===a.actividad_id&&m.naturaleza==='COSTO'&&m.operacion_auto!=='COMPRA').reduce((sum,m)=>sum+Number(m.monto),0)),0);
  const saleMoves=ms.filter(m=>m.operacion_auto==='VENTA'&&m.direccion==='ENTRADA'),income=saleMoves.reduce((s,m)=>s+Number(m.monto),0);
  const saleDateCaja=saleMoves.map(m=>m.fecha_operacion).sort().pop()||'';
  const sold=o.estado_auto==='VENDIDO',sale=income>0?income:n(o.precio_venta),own=o.modalidad==='PROPIO';
  const cost=own&&purchase!==null?purchase+preparation:null;
  const saleDate=sold&&date(o.fecha_venta)?o.fecha_venta:(saleDateCaja||o.fecha_venta||'');
  const end=sold&&date(saleDate)?saleDate:today;
  const days=date(o.fecha_ingreso)?Math.max(0,Math.floor((Date.parse(end)-Date.parse(o.fecha_ingreso))/86400000)):null;
  // Margen = venta cobrada − compra (o pago al dueño) − costos. En consignados ese margen es la comisión, aunque no se cobre explícita.
  const result=sold&&sale!==null&&purchase!==null?sale-purchase-preparation:null;
  const margin=result!==null&&sale>0?result/sale*100:null;
  const salePending=!sold&&income>0&&o.estado_auto!=='RETIRADO';
  return {id:v.vehiculo_id,label:[v.patente,v.marca,v.modelo].filter(Boolean).join(' · '),status:o.estado_auto||'POR_REVISAR',modality:o.modalidad||'POR_DEFINIR',days,parkingDays:days,entryDate:o.fecha_ingreso||'',saleDate,activities:as.length,repairs:as.filter(a=>a.tipo==='ARREGLO').length,purchase,preparation,cost,sale,income,sold,result,margin,commission:o.modalidad==='CONSIGNADO'?result:null,salePending,saleDateCaja};
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
 const fixed=fixedFromCaja(confirmed,today);
 const month=today.slice(0,7),monthMoves=confirmed.filter(m=>String(m.fecha_operacion).slice(0,7)===month);
 const dashboard=analytics(d,today,cars,confirmed,accountRows);
 const reconciliation=reconcile(d,today),warnings=reconciliation.filter(x=>x.status==='DESCUADRE').map(x=>x.name+': falta un flujo por '+Math.abs(x.diff)+' ('+(x.diff>0?'entrada':'salida')+').');
 return {dashboard,today,reconciliation,warnings,accounts:accountRows,cars,forecasts:pending,loans,cash,stock,receivable,debt:obligations+loanDebt,loanAsset,patrimony:issues.length?null:cash+stock+receivable+loanAsset-obligations-loanDebt,issues,fixedMonthly:fixed,projectedIncome:pending.filter(f=>f.direccion==='ENTRADA'&&String(f.fecha).slice(0,7)===month).reduce((s,f)=>s+f.pending,0),salesMonth:ops.filter(o=>o.estado_auto==='VENDIDO'&&String(o.fecha_venta).slice(0,7)===month).length,entries:monthMoves.filter(m=>m.direccion==='ENTRADA'&&m.naturaleza!=='TRANSFERENCIA').reduce((s,m)=>s+Number(m.monto),0),exits:monthMoves.filter(m=>m.direccion==='SALIDA'&&m.naturaleza!=='TRANSFERENCIA').reduce((s,m)=>s+Number(m.monto),0),unclassified:moves.filter(m=>!m.concepto_id).length};
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
 return {start,companyStartKnown:!!date(d.companyStart),history,stockCount:cars.filter(c=>!c.sold&&c.status!=='RETIRADO').length,revenue:current.some(c=>c.sale===null)?null:current.reduce((s,c)=>s+c.sale,0),margin:!margins.length||margins.some(x=>x===null)?null:margins.reduce((s,x)=>s+x,0)/margins.length,lastSold:sold.slice(0,4),expenses,states,carExpenses:carExpenses(confirmed,today),pendingAccounts:d.accounts.map(a=>{const own=d.movements.filter(m=>active(m)&&m.cuenta_id===a.cuenta_id),noConcept=own.filter(m=>!m.concepto_id).length,carPending=own.filter(m=>m.concepto_id&&m.estado_clasificacion==='POR_ASIGNAR_AUTO').length;return {name:a.nombre,count:noConcept+carPending,noConcept,carPending};})};
}
const signed=m=>(m.direccion==='ENTRADA'?1:-1)*Number(m.monto);
const monthOf=v=>String(v).slice(0,7);
// Costos fijos = lo que la caja ya clasificó como costo FIJO. Promedio de hasta 3 meses cerrados; si no hay, el mes en curso.
function fixedFromCaja(confirmed,today){
 const month=monthOf(today),by={};
 confirmed.filter(m=>m.direccion==='SALIDA'&&m.tipo_costo==='FIJO'&&m.naturaleza!=='TRANSFERENCIA').forEach(m=>{const k=monthOf(m.fecha_operacion);by[k]=(by[k]||0)+Number(m.monto);});
 const closed=Object.keys(by).filter(k=>k<month).sort().slice(-3);
 return closed.length?Math.round(closed.reduce((s,k)=>s+by[k],0)/closed.length):(by[month]||0);
}
// Costos asignados a un auto (lavado, combustible, fotos, publicación, arreglos…) sumados por concepto. Compra y venta no entran.
function carExpenses(confirmed,today){
 const month=monthOf(today),by={};
 confirmed.filter(m=>m.direccion==='SALIDA'&&m.vehiculo_id&&m.operacion_auto&&!['COMPRA','VENTA'].includes(m.operacion_auto)).forEach(m=>{
  const k=m.concepto_nombre||'Sin concepto',e=by[k]||(by[k]={name:k,total:0,month:0,count:0,cars:new Set()});
  e.total+=Number(m.monto);e.count++;e.cars.add(m.vehiculo_id);if(monthOf(m.fecha_operacion)===month)e.month+=Number(m.monto);
 });
 return Object.values(by).map(e=>({name:e.name,total:e.total,month:e.month,count:e.count,cars:e.cars.size})).sort((a,b)=>b.total-a.total);
}
// Cuadre: compara el saldo calculado con una referencia independiente (saldo real ingresado o saldo_cartola).
// diff > 0: el banco tiene más que el sistema (falta una ENTRADA). diff < 0: falta una SALIDA.
function reconcileAccount(a,movements,today,real){
 const out={id:a.cuenta_id,name:a.nombre,opening:n(a.saldo_inicial),cut:date(a.fecha_saldo_inicial),computed:null,diff:null,status:'SIN_SALDO',unconfirmed:{count:0,sum:0},candidates:[],firstBreak:null,reference:null};
 if(out.opening===null||!out.cut)return out;
 const own=movements.filter(m=>m.cuenta_id===a.cuenta_id&&active(m)),ok=own.filter(paid).filter(m=>date(m.fecha_operacion)&&m.fecha_operacion>out.cut&&m.fecha_operacion<=today);
 const open=own.filter(m=>!paid(m)||!date(m.fecha_operacion));
 out.unconfirmed={count:open.length,sum:open.reduce((s,m)=>s+(['ENTRADA','SALIDA'].includes(m.direccion)&&n(m.monto)!==null?signed(m):0),0)};
 out.computed=out.opening+ok.reduce((s,m)=>s+signed(m),0);
 out.status='SIN_REFERENCIA';
 const finish=()=>{out.status=out.diff===0?'OK':'DESCUADRE';if(out.diff)out.candidates=open.filter(m=>n(m.monto)!==null&&Number(m.monto)===Math.abs(out.diff)).map(m=>({id:m.movimiento_id,description:m.descripcion||'',amount:Number(m.monto),date:m.fecha_operacion||''}));};
 if(n(real)!==null){out.reference='REAL';out.diff=Number(real)-out.computed;finish();return out;}
 const stmt=ok.filter(m=>n(m.saldo_cartola)!==null);
 if(stmt.length){
  const days=[...new Set(stmt.map(m=>m.fecha_operacion))].sort();let prev=0,found=null,last=0;
  days.forEach(day=>{const expected=out.opening+ok.filter(m=>m.fecha_operacion<=day).reduce((s,m)=>s+signed(m),0);
   const gaps=stmt.filter(m=>m.fecha_operacion===day).map(m=>Number(m.saldo_cartola)-expected),gap=gaps.reduce((b,x)=>Math.abs(x)<Math.abs(b)?x:b,gaps[0]);
   if(!found&&gap!==prev)found={from:days[days.indexOf(day)-1]||out.cut,to:day,amount:gap-prev};prev=gap;last=gap;});
  out.reference='CARTOLA';out.diff=last;out.firstBreak=found;finish();
 }
 return out;
}
function reconcile(d,today,real){real=real||{};return d.accounts.filter(active).map(a=>reconcileAccount(a,d.movements,today,real[a.cuenta_id]));}
const api={reports,paid,date,number:n,active,signed,reconcile,reconcileAccount,fixedFromCaja,carExpenses};if(typeof module!=='undefined')module.exports=api;root.OCSystemCore=api;
})(typeof globalThis==='undefined'?this:globalThis);
