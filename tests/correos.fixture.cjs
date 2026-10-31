// Datos ficticios para probar el correo semanal (no son cifras reales de Oportunicars).
const day=(d,k)=>new Date(Date.parse(d+'T12:00:00Z')+k*86400000).toISOString().slice(0,10);
function fixture(){
 const cars=[['V1','KXLP12','Toyota','Hilux',-70,'PROPIO',14500000,19900000,-4],['V2','JHTR45','Mazda','CX-5',-40,'PROPIO',12800000,16400000,-10],
  ['V3','LBCD90','Kia','Sportage',-25,'CONSIGNADO',11000000,13300000,-3],['V4','PQRS11','Hyundai','Tucson',-95,'PROPIO',10500000,null,null],
  ['V5','TTZZ33','Chevrolet','Tracker',-12,'PROPIO',9800000,null,null],['V6','MMNN77','Suzuki','Vitara',-65,'CONSIGNADO',8000000,null,null],
  ['V7','RRSS21','Nissan','Kicks',-33,'PROPIO',9200000,null,null],['V8','WWQQ55','Peugeot','2008',-5,'PROPIO',10100000,null,null],
  ['V9','AABB88','Subaru','XV',-80,'PROPIO',11300000,14200000,-17]];
 const today='2026-11-02',inventory=[],operations=[],movements=[];let n=0;
 const mv=(cuenta,fecha,monto,dir,o)=>movements.push(Object.assign({movimiento_id:'M'+(++n),cuenta_id:cuenta,fecha_operacion:fecha,monto,direccion:dir,monto_confirmado:'SI',incluir_en_saldo:'SI',estado_registro:'ACTIVO',ambiente:'PRODUCCION'},o));
 cars.forEach(([id,pat,marca,modelo,entry,mod,buy,sale,sold])=>{
  inventory.push({vehiculo_id:id,patente:pat,marca,modelo,precio_publicado:buy*1.3,estado_registro:'ACTIVO'});
  operations.push({vehiculo_id:id,modalidad:mod,fecha_ingreso:day(today,entry),estado_auto:'DISPONIBLE',estado_registro:'ACTIVO'});
  mv('SCOTIA',day(today,entry),buy,'SALIDA',{concepto_id:'COMPRA',naturaleza:'COSTO',operacion_auto:'COMPRA',vehiculo_id:id,tipo_costo:'VARIABLE'});
  mv('MP',day(today,entry+2),180000,'SALIDA',{concepto_id:'ARREGLO',concepto_nombre:'Arreglo de auto',naturaleza:'COSTO',operacion_auto:'ARREGLO',vehiculo_id:id,tipo_costo:'VARIABLE',categoria:'Preparación'});
  if(sale)mv('MP',day(today,sold),sale,'ENTRADA',{concepto_id:'VENTA',naturaleza:'INGRESO',operacion_auto:'VENTA',vehiculo_id:id});
 });
 for(let w=0;w<9;w++){const d=day(today,-7*w-3);
  mv('MP',d,520000,'SALIDA',{concepto_id:'MKT',naturaleza:'GASTO',categoria:'Marketing',tipo_costo:'VARIABLE'});
  mv('SCOTIA',d,180000,'SALIDA',{concepto_id:'SERV',naturaleza:'GASTO',categoria:'Servicios',tipo_costo:'FIJO'});
  if(w%4===1){mv('MP',d,2476628,'SALIDA',{concepto_id:'ARRIENDO',naturaleza:'GASTO',categoria:'Arriendo',tipo_costo:'FIJO'});mv('MP',d,3000000,'SALIDA',{concepto_id:'SUELDO_JT',naturaleza:'GASTO',categoria:'Remuneraciones',tipo_costo:'FIJO'});}
 }
 mv('SCOTIA','2026-09-10',25000000,'ENTRADA',{concepto_id:'APORTE',naturaleza:'APORTE_CAPITAL',socio:'Alex'});
 mv('SCOTIA','2026-09-10',25000000,'ENTRADA',{concepto_id:'APORTE',naturaleza:'APORTE_CAPITAL',socio:'Gonzalo'});
 mv('MP',day(today,-9),4000000,'ENTRADA',{concepto_id:'APORTE',naturaleza:'APORTE_CAPITAL',socio:'Alex'});
 const accounts=[{cuenta_id:'MP',nombre:'Mercado Pago',saldo_inicial:18500000,fecha_saldo_inicial:'2026-10-15',estado_registro:'ACTIVO'},{cuenta_id:'SCOTIA',nombre:'Scotiabank Personal',saldo_inicial:22300000,fecha_saldo_inicial:'2026-10-15',estado_registro:'ACTIVO'},{cuenta_id:'CAJA',nombre:'Caja efectivo',saldo_inicial:350000,fecha_saldo_inicial:'2026-10-15',estado_registro:'ACTIVO'}];
 return {today,loaded:{inventory,operations,activities:[],movements,accounts,forecasts:[{proyeccion_id:'P1',direccion:'ENTRADA',tipo:'CUOTA',monto:2400000,fecha:'2026-11-20',estado_registro:'ACTIVO'},{proyeccion_id:'P2',direccion:'SALIDA',tipo:'CONSIGNACION',monto:6100000,fecha:'2026-11-10',estado_registro:'ACTIVO'}],loans:[],settings:{parkingDays:30,parkingRate:1}}};
}
module.exports={fixture};
