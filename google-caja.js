// Conexión con Google Apps Script.
// Una sola consulta ('load') al iniciar. Después todo se lee de memoria; al guardar solo se envía y se recibe el registro cambiado.
(function(root){
 'use strict';
 const TABLE_LIST={VEHICULOS:'inventory',AUTOS_OPERACION:'operations',ACTIVIDADES_AUTOS:'activities',PROYECCIONES:'forecasts',PRESTAMOS:'loans'};
 const TABLE_KEY={VEHICULOS:'vehiculo_id',AUTOS_OPERACION:'vehiculo_id',ACTIVIDADES_AUTOS:'actividad_id',PROYECCIONES:'proyeccion_id',PRESTAMOS:'prestamo_id'};
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date());
 const inventoryItem=v=>({id:v.vehiculo_id,patente:v.patente,modelo:[v.marca,v.modelo,v.version_vehiculo].filter(Boolean).join(' ')});

 // Misma lógica que el backend (ocMovement_), para no pedir dos veces los movimientos.
 function mapMovement(r,accounts){
  const c=r.concepto_id?{id:String(r.concepto_id),name:String(r.concepto_nombre),version:Number(r.concepto_version),category:String(r.categoria||''),nature:String(r.naturaleza),cost:String(r.tipo_costo),recurring:r.recurrente==='SI',vehicleOperation:String(r.operacion_auto||''),vehicleId:r.vehiculo_id?String(r.vehiculo_id):null}:null;
  return {id:String(r.movimiento_id),version:Number(r.version||1),date:String(r.fecha_operacion||'').slice(0,10),account:accounts[String(r.cuenta_id)]||String(r.cuenta_id),description:String(r.descripcion||r.referencia||'Movimiento'),amount:typeof r.monto==='number'?r.monto:null,direction:String(r.direccion||''),confirmed:r.monto_confirmado==='SI'&&r.incluir_en_saldo==='SI',status:c?(r.estado_clasificacion||(c.vehicleOperation&&!c.vehicleId?'POR_ASIGNAR_AUTO':'CLASIFICADO')):'PENDIENTE',classification:c,activityId:String(r.actividad_id||''),forecastId:String(r.proyeccion_id||''),prestamoId:String(r.prestamo_id||''),loanComponent:String(r.componente_prestamo||''),socio:String(r.socio||'')};
 }
 // Copia a la fila cruda los campos de clasificación, para que los reportes cambien al instante.
 function patchRaw(raw,m){
  const c=m.classification;
  Object.assign(raw,{concepto_id:c?c.id:'',concepto_nombre:c?c.name:'',concepto_version:c?c.version:'',categoria:c?c.category:'',naturaleza:c?c.nature:'',tipo_costo:c?c.cost:'',recurrente:c&&c.recurring?'SI':'NO',operacion_auto:c?c.vehicleOperation:'',vehiculo_id:c&&c.vehicleId?c.vehicleId:'',estado_clasificacion:c?m.status:'PENDIENTE',actividad_id:m.activityId||'',proyeccion_id:m.forecastId||'',prestamo_id:m.prestamoId||'',componente_prestamo:m.loanComponent||'',socio:m.socio||'',version:m.version});
 }

 function createStore(call,loaded){
  const D={inventory:loaded.inventory,operations:loaded.operations,activities:loaded.activities,movements:loaded.movements,accounts:loaded.accounts,forecasts:loaded.forecasts,loans:loaded.loans,companyStart:loaded.companyStart||'',sync:loaded.sync||null,canFinance:true};
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
   movementsForCaja(){const names=accountNames();return D.movements.map(r=>mapMovement(r,names));},
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
   const control=new AbortController(),timer=setTimeout(()=>control.abort(),30000);
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
   async saveMovement(m){const saved=await call('classify',{id:m.id,expectedVersion:m.version,conceptId:m.classification.id,conceptVersion:m.classification.version,vehicleId:m.classification.vehicleId,activityId:m.activityId||'',forecastId:m.forecastId||'',prestamoId:m.prestamoId||'',loanComponent:m.loanComponent||'',socio:m.socio||''});saved.date=saved.date||m.date;store.applySaved(saved);return saved;},
   applyLocal:store.applyLocal
  }};
 }
 root.OCGoogleCaja={connect,mapMovement,createStore};
})(window);
