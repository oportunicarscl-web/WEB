// Isolated, in-memory UI fixture. Never writes to Google or uses real business data.
function previewSystem(){
 const data={inventory:[{vehiculo_id:'EJEMPLO-1',patente:'PRUEBA',marca:'Auto',modelo:'de prueba'}],operations:[],activities:[],fixed:[],forecasts:[],loans:[],accounts:[{cuenta_id:'test',nombre:'Cuenta de prueba',saldo_inicial:0,fecha_saldo_inicial:'2026-10-01',version:1}],canFinance:true,sync:null,links:{forecasts:[],loans:[]}};
 const coreData=()=>({...data,movements:[]});
 const refresh=async()=>{data.report=OCSystemCore.reports(coreData(),'2026-10-18');data.links={forecasts:data.forecasts,loans:data.loans};return data;};
 data.report=OCSystemCore.reports(coreData(),'2026-10-18');
 return {connected:true,data,refresh,async call(action,p){
  if(action==='syncClaxo')throw Error('La vista previa no accede a Claxo.');
  if(action==='saveBalance'){const a=data.accounts.find(a=>a.cuenta_id===p.id);Object.assign(a,{saldo_inicial:p.balance,fecha_saldo_inicial:p.date,version:a.version+1});return;}
  const maps={AUTOS_OPERACION:['operations','vehiculo_id'],ACTIVIDADES_AUTOS:['activities','actividad_id'],COSTOS_FIJOS:['fixed','costo_fijo_id'],PROYECCIONES:['forecasts','proyeccion_id'],PRESTAMOS:['loans','prestamo_id']},[list,key]=maps[p.table];const record={...p.record,[key]:p.record[key]||p.requestId,version:p.expectedVersion+1};const index=data[list].findIndex(r=>r[key]===record[key]);if(index>=0)data[list][index]=record;else data[list].push(record);return record;
 }};
}
