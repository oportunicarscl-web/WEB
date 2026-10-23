// Conexión con Google Apps Script.
// Una sola consulta ('load') al iniciar. Después todo se lee de memoria; al guardar solo se envía y se recibe el registro cambiado.
(function(root){
 'use strict';
 const TABLE_LIST={VEHICULOS:'inventory',AUTOS_OPERACION:'operations',ACTIVIDADES_AUTOS:'activities',PROYECCIONES:'forecasts',PRESTAMOS:'loans'};
 const TABLE_KEY={VEHICULOS:'vehiculo_id',AUTOS_OPERACION:'vehiculo_id',ACTIVIDADES_AUTOS:'actividad_id',PROYECCIONES:'proyeccion_id',PRESTAMOS:'prestamo_id'};
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date());
 const inventoryItem=v=>({id:v.vehiculo_id,patente:v.patente,modelo:[v.marca,v.modelo,v.version_vehiculo].filter(Boolean).join(' ')});

 // La fecha viene como fecha de la hoja (AAAA-MM-DD), texto DD/MM/AAAA o la fecha original de Mercado Pago (ISO con zona).
 // Arranque de la caja cuadrada: saldos iniciales al cierre de este día; lo anterior es la Caja histórica.
 const CASH_START='2026-10-15';
 function parseDay(v){const s=String(v||'').trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):'';}
 // Solo cuenta lo efectivo: lo rechazado, cancelado, vencido o solo autorizado (sin capturar) no se muestra ni suma.
 const effective=r=>{const s=String(r.estado_fuente||'').toLowerCase();return !s||s==='approved'||s==='accredited';};
 // Dirección sugerida por el tipo de operación cuando la fuente no la trae. Se confirma al clasificar.
 function inferDirection(r){
  const type=String(r.tipo_fuente||'').toLowerCase(),text=String(r.descripcion||'');
  if(type==='account_fund'||type==='pos_payment')return 'ENTRADA';
  if(type==='regular_payment')return /link/i.test(text)?'ENTRADA':'SALIDA';
  return '';
 }
 // Misma lógica que el backend (ocMovement_), para no pedir dos veces los movimientos.
 function mapMovement(r,accounts){
  const c=r.concepto_id?{id:String(r.concepto_id),name:String(r.concepto_nombre),version:Number(r.concepto_version),category:String(r.categoria||''),nature:String(r.naturaleza),cost:String(r.tipo_costo),recurring:r.recurrente==='SI',vehicleOperation:String(r.operacion_auto||''),vehicleId:r.vehiculo_id?String(r.vehiculo_id):null}:null;
  return {id:String(r.movimiento_id),version:Number(r.version||1),date:parseDay(r.fecha_operacion)||parseDay(r.fecha_original),account:accounts[String(r.cuenta_id)]||String(r.cuenta_id),description:String(r.descripcion||r.referencia||'Movimiento'),amount:typeof r.monto==='number'?r.monto:null,direction:String(r.direccion||'')||inferDirection(r),directionInferred:!r.direccion&&!!inferDirection(r),confirmed:r.monto_confirmado==='SI'&&r.incluir_en_saldo==='SI',accountId:String(r.cuenta_id),source:String(r.estado_importacion||''),origin:String(r.origen||''),status:c?(r.estado_clasificacion||(c.vehicleOperation&&!c.vehicleId?'POR_ASIGNAR_AUTO':'CLASIFICADO')):'PENDIENTE',classification:c,activityId:String(r.actividad_id||''),forecastId:String(r.proyeccion_id||''),prestamoId:String(r.prestamo_id||''),loanComponent:String(r.componente_prestamo||''),socio:String(r.socio||'')};
 }
 // Copia a la fila cruda los campos de clasificación, para que los reportes cambien al instante.
 function patchRaw(raw,m){
  const c=m.classification;
  Object.assign(raw,m.direction&&!m.directionInferred?{direccion:m.direction}:{},{concepto_id:c?c.id:'',concepto_nombre:c?c.name:'',concepto_version:c?c.version:'',categoria:c?c.category:'',naturaleza:c?c.nature:'',tipo_costo:c?c.cost:'',recurrente:c&&c.recurring?'SI':'NO',operacion_auto:c?c.vehicleOperation:'',vehiculo_id:c&&c.vehicleId?c.vehicleId:'',estado_clasificacion:c?m.status:'PENDIENTE',actividad_id:m.activityId||'',proyeccion_id:m.forecastId||'',prestamo_id:m.prestamoId||'',componente_prestamo:m.loanComponent||'',socio:m.socio||'',version:m.version});
 }

 function createStore(call,loaded){
  const D={strictFrom:CASH_START,inventory:loaded.inventory,operations:loaded.operations,activities:loaded.activities,movements:loaded.movements.filter(effective),hidden:loaded.movements.filter(r=>!effective(r)).length,accounts:loaded.accounts,forecasts:loaded.forecasts,loans:loaded.loans,companyStart:loaded.companyStart||'',sync:loaded.sync||null,canFinance:true};
  let cache=null;const invalidate=()=>{cache=null;};
  const accountNames=()=>Object.fromEntries(D.accounts.map(a=>[a.cuenta_id,a.nombre]));
  function state(){
   if(!cache){
    const report=root.OCSystemCore.reports({...D,fixed:[]},today());
    cache={...D,raw:D,report,links:{forecasts:D.forecasts.map(f=>({proyeccion_id:f.proyeccion_id,fecha:f.fecha,direccion:f.direccion,descripcion:f.descripcion,vehiculo_id:f.vehiculo_id})),loans:D.loans.map(l=>({prestamo_id:l.prestamo_id,nombre:l.nombre}))}};
   }
   return cache;
  }
  const upsert=(list,key,patch)=>{const i=list.findIndex(r=>r[key]===patch[key]);if(i>=0)Object.assign(list[i],patch);else list.push({...patch});};
  return {
   state,today,
   movementsForCaja(){const names=accountNames();return D.movements.filter(r=>r.estado_registro!=='ANULADO').map(r=>mapMovement(r,names));},
   hiddenCount(){return D.hidden;},
   replaceMovements(l){D.movements=l.movements.filter(effective);D.hidden=l.movements.filter(r=>!effective(r)).length;D.accounts=l.accounts;invalidate();return this.movementsForCaja();},
   accountsInfo(){return D.accounts.filter(a=>a.estado_registro!=='ANULADO').map(a=>({id:String(a.cuenta_id),name:String(a.nombre),opening:a.saldo_inicial===''||a.saldo_inicial===undefined?null:Number(a.saldo_inicial),cut:parseDay(a.fecha_saldo_inicial),version:Number(a.version||1)}));},
   mapped(id){const raw=D.movements.find(r=>String(r.movimiento_id)===id);return raw?mapMovement(raw,accountNames()):null;},
   addRaw(raw){if(!D.movements.some(r=>String(r.movimiento_id)===String(raw.movimiento_id)))D.movements.push(raw);invalidate();return this.mapped(String(raw.movimiento_id));},
   patchRaw(id,patch){const raw=D.movements.find(r=>String(r.movimiento_id)===id);if(raw){Object.assign(raw,patch);invalidate();}},
   inventoryForCaja(){return D.inventory.map(inventoryItem);},
   async save(table,record,requestId,expectedVersion){
    const patch=await call('saveSystem',{table,record,requestId,expectedVersion});
    upsert(D[TABLE_LIST[table]],TABLE_KEY[table],patch);invalidate();return patch;
   },
   async saveBalance(id,balance,date,expectedVersion){
    const patch=await call('saveBalance',{id,balance,date,expectedVersion});
    const a=D.accounts.find(x=>x.cuenta_id===id);if(a)Object.assign(a,patch);invalidate();return patch;
   },
   async saveStart(date){await call('saveCompanyStart',{date});D.companyStart=date;invalidate();},
   // Claxo: se sincroniza en Google y solo se vuelve a pedir el inventario (no todo el sistema).
   async syncClaxo(){const r=await call('syncClaxo'),rows=await call('inventory');D.inventory=rows.inventory;D.sync=rows.sync||r.at||null;invalidate();return r;},
   // Cambio local inmediato (optimista). Devuelve cómo deshacerlo si Google rechaza el guardado.
   applyLocal(m){const raw=D.movements.find(r=>String(r.movimiento_id)===m.id);if(!raw)return()=>{};const before={...raw};patchRaw(raw,m);invalidate();return()=>{Object.assign(raw,before);invalidate();};},
   applySaved(saved){const raw=D.movements.find(r=>String(r.movimiento_id)===saved.id);if(raw){patchRaw(raw,saved);invalidate();}}
  };
 }

 async function connect(client,user){
  const endpoint=root.OCGoogleConfig?.endpoint;
  if(!endpoint)throw Error('La conexión con Google todavía no está activada.');
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint))throw Error('La dirección de conexión Google no es válida.');
  async function call(action,payload={}){
   const {data,error}=await client.auth.getSession();if(error||!data.session?.access_token)throw Error('Inicia sesión nuevamente.');
   const control=new AbortController(),timer=setTimeout(()=>control.abort(),action==='syncMercadoPago'||action==='load'?150000:30000);
   try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,action,token:data.session.access_token}),credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',signal:control.signal});
    if(!response.ok)throw Error('Google no respondió correctamente.');
    const result=await response.json();if(!result.ok)throw Error(result.error||'No se pudo guardar.');return result.data;
   }catch(e){if(e.name==='AbortError')throw Error('Google demoró en responder. Recarga para comprobar si se guardó.');throw e;}
   finally{clearTimeout(timer);}
  }
  const loaded=await call('load');                       // ← la única consulta grande
  if(loaded.profile.id!==user.id)throw Error('La identidad de la sesión no coincide.');
  const store=createStore(call,loaded),st=store.state();
  return {profile:loaded.profile,system:{connected:true,store,call,canManage:loaded.profile.manage},caja:{connected:true,canManageConcepts:loaded.profile.manage,concepts:loaded.concepts,inventory:store.inventoryForCaja(),movements:store.movementsForCaja(),activities:st.activities,forecasts:st.links.forecasts,loans:st.links.loans,
   async saveConcept(concept){return call('concept',{concept});},
   async saveMovement(m){let version=m.version;if(m.directionInferred&&['ENTRADA','SALIDA'].includes(m.direction)){const d=await call('setDirection',{id:m.id,direction:m.direction,expectedVersion:version});version=Number(d.version||version+1);}
    const saved=await call('classify',{id:m.id,expectedVersion:version,conceptId:m.classification.id,conceptVersion:m.classification.version,vehicleId:m.classification.vehicleId,activityId:m.activityId||'',forecastId:m.forecastId||'',prestamoId:m.prestamoId||'',loanComponent:m.loanComponent||'',socio:m.socio||''});saved.date=saved.date||m.date;saved.directionInferred=false;store.applySaved(saved);return saved;},
   async setDirection(m,direction){const d=await call('setDirection',{id:m.id,direction,expectedVersion:m.version});store.applySaved({...m,direction,version:Number(d.version||m.version+1),directionInferred:false});return {...m,direction,version:Number(d.version||m.version+1),directionInferred:false};},
   hiddenCount:store.hiddenCount,cashStart:CASH_START,accountsInfo:store.accountsInfo,
   async saveBalance(id,balance,date,version){return store.saveBalance(id,balance,date,version);},
   async confirmAmount(m){const r=await call('confirmAmount',{id:m.id,expectedVersion:m.version});store.patchRaw(m.id,{monto_confirmado:'SI',incluir_en_saldo:'SI',version:r.version});return {...m,confirmed:true,version:Number(r.version)};},
   async unassign(m){const r=await call('unassign',{id:m.id,expectedVersion:m.version});store.patchRaw(m.id,{concepto_id:'',concepto_nombre:'',concepto_version:'',categoria:'',naturaleza:'',tipo_costo:'',recurrente:'',operacion_auto:'',vehiculo_id:'',estado_clasificacion:'PENDIENTE',actividad_id:'',proyeccion_id:'',prestamo_id:'',componente_prestamo:'',socio:'',monto_confirmado:'NO',incluir_en_saldo:'NO',version:r.version});return store.mapped(m.id);},
   async manualAdd(accountId,requestId,rows){const saved=await call('manualAdd',{accountId,requestId,rows});return saved.map(raw=>store.addRaw(raw)).filter(Boolean);},
   async saveMpToken(t){return call('saveMpToken',t);},
   async syncMercadoPago(fase){return call('syncMercadoPago',{fase});},
   async reloadMovements(){const l=await call('load');return store.replaceMovements(l);},
   async manualVoid(id){await call('manualVoid',{id});store.patchRaw(id,{estado_registro:'ANULADO'});return true;},
   async quickMatch(q,x){const r=await call('quickMatch',{quickId:q.id,targetId:x.id,expectedVersion:x.version});store.patchRaw(q.id,{estado_registro:'ANULADO'});store.patchRaw(x.id,r.target);return r.target;},
   applyLocal:store.applyLocal
  }};
 }
 root.OCGoogleCaja={CASH_START,connect,mapMovement,createStore,parseDay,effective,inferDirection};
})(window);
