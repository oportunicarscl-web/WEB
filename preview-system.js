// Isolated, in-memory UI fixture. Never writes to Google or uses real business data.
function previewSystem(){
 const D={inventory:[{vehiculo_id:'EJEMPLO-1',patente:'PRUEBA',marca:'Auto',modelo:'de prueba'}],operations:[],activities:[],movements:[],forecasts:[],loans:[],accounts:[{cuenta_id:'test',nombre:'Cuenta de prueba',saldo_inicial:0,fecha_saldo_inicial:'2026-10-01',version:1}],companyStart:'',sync:null,canFinance:true};
 const lists={AUTOS_OPERACION:['operations','vehiculo_id'],ACTIVIDADES_AUTOS:['activities','actividad_id'],PROYECCIONES:['forecasts','proyeccion_id'],PRESTAMOS:['loans','prestamo_id'],VEHICULOS:['inventory','vehiculo_id']};
 const today=()=>'2026-10-18';let cache=null;
 const state=()=>cache||(cache={...D,raw:D,report:OCSystemCore.reports({...D,fixed:[]},today()),links:{forecasts:D.forecasts,loans:D.loans}});
 return {connected:true,store:{state,today,
  async save(table,record,requestId,expectedVersion){const [list,key]=lists[table],row={...record,[key]:record[key]||requestId,version:expectedVersion+1},i=D[list].findIndex(r=>r[key]===row[key]);if(i>=0)D[list][i]=row;else D[list].push(row);cache=null;return row;},
  async saveBalance(id,balance,date){const a=D.accounts.find(a=>a.cuenta_id===id);Object.assign(a,{saldo_inicial:balance,fecha_saldo_inicial:date,version:a.version+1});cache=null;},
  async saveStart(date){D.companyStart=date;cache=null;},
  async syncClaxo(){throw Error('La vista previa no accede a Claxo.');}}};
}
