(function(root){
 'use strict';
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
  const data=await call('bootstrap');if(data.profile.id!==user.id)throw Error('La identidad de la sesión no coincide.');
  const systemData=await call('system');
  return {profile:data.profile,system:{connected:true,data:systemData,call,refresh:async()=>{const fresh=await call('bootstrap');root.OCCaja?.replaceData(fresh);return call('system');}},caja:{connected:true,canManageConcepts:data.profile.manage,concepts:data.concepts,inventory:data.inventory,movements:data.movements,activities:systemData.activities,forecasts:systemData.links.forecasts,loans:systemData.links.loans,
   async saveConcept(concept){return call('concept',{concept});},
   async saveMovement(m){const saved=await call('classify',{id:m.id,expectedVersion:m.version,conceptId:m.classification.id,conceptVersion:m.classification.version,vehicleId:m.classification.vehicleId,activityId:m.activityId||'',forecastId:m.forecastId||'',prestamoId:m.prestamoId||'',loanComponent:m.loanComponent||'',socio:m.socio||''});Object.assign(m,saved);return saved;}
  }};
 }
 root.OCGoogleCaja={connect};
})(window);
