// Oportunicars · Liquidaciones y pagos fijos (solo Alex): sueldo JT, arriendo + estacionamientos, Cars and Coffee.
// En el proyecto Apps Script vive al final de Carga.gs. ocExtra_ (Atajo.gs) ya lo llama.
// Modelo: lo que se DEBE (LIQUIDACIONES: persona + período + componente BASE/VARIABLE) está separado de lo que se PAGÓ
// (MOVIMIENTOS_BANCARIOS). IMPUTACIONES_SUELDO une ambos: un pago puede cubrir base y variable, o varios meses,
// y un mes puede pagarse con varios movimientos. Las reglas de variable y tope quedan abiertas: los montos se ingresan a mano.
const OC_LIQ_TABLES={
 LIQUIDACIONES:['liquidacion_id','persona','periodo','componente','monto','nota'],
 IMPUTACIONES_SUELDO:['imputacion_id','movimiento_id','liquidacion_id','persona','monto']
};
const OC_LIQ_META=['ambiente','estado_registro','version','created_at','created_by','updated_at','updated_by'];
const OC_LIQ_CONCEPT={concepto_id:'SUELDO_JT',nombre:'Sueldo JT',categoria:'Remuneraciones',naturaleza:'GASTO',tipo_costo:'FIJO',recurrente:'SI',operacion_auto:'',habilitado:'SI',version:1};
const OC_LIQ_CONCEPTS=[OC_LIQ_CONCEPT,{concepto_id:'ARRIENDO',nombre:'Arriendo y estacionamientos',categoria:'Arriendo',naturaleza:'GASTO',tipo_costo:'FIJO',recurrente:'SI',operacion_auto:'',habilitado:'SI',version:1}];
// Cada obligación (campo persona) tiene sus componentes y el concepto con que se clasifica el pago en la caja.
const OC_LIQ_OBLIG={JT:{concept:'SUELDO_JT',comps:['BASE','VARIABLE']},ARRIENDO:{concept:'ARRIENDO',comps:['ARRIENDO','ESTACIONAMIENTO']},CYC:{concept:'C&C',comps:['CUOTA']}};

function ocLiqExtra_(p,actor){
 const actions=['liqLoad','liqSave','liqSeed','liqVoid','liqAllocate'];
 if(actions.indexOf(p.action)<0)return undefined;
 if(!ocIsAdminUser_(actor))throw Error('Liquidaciones: acceso solo para Alex.');
 ocLiqEnsure_();
 if(p.action==='liqLoad')return ocLiqData_();
 if(p.action==='liqSave')return ocLiqSave_(p,actor);
 if(p.action==='liqSeed')return ocLiqSeed_(p,actor);
 if(p.action==='liqVoid')return ocLiqVoid_(p,actor);
 if(p.action==='liqAllocate')return ocLiqAllocate_(p,actor);
}
// Crea las hojas y el concepto «Sueldo JT» la primera vez (sin pasos manuales).
function ocLiqEnsure_(){
 const props=PropertiesService.getScriptProperties();if(props.getProperty('OC_LIQ_READY')==='3')return;
 const book=SpreadsheetApp.openById(ocProperty_('OC_FINANZAS_ID'));
 Object.keys(OC_LIQ_TABLES).forEach(n=>osEnsure_(book,n,OC_LIQ_TABLES[n].concat(OC_LIQ_META)));
 const c=ocTable_('OC_MAESTROS_ID','CONCEPTOS_CAJA');
 OC_LIQ_CONCEPTS.forEach(k=>{if(!c.rows.some(r=>r.concepto_id===k.concepto_id)){ocPatchRow_(c,c.sheet.getLastRow()+1,k);c.rows.push(k);}});
 props.setProperty('OC_LIQ_READY','3');
}
function ocLiqTable_(name){return ocTable_('OC_FINANZAS_ID',name);}
function ocLiqPeriod_(v){
 if(v instanceof Date)return Utilities.formatDate(v,'America/Santiago','yyyy-MM');
 const s=String(v||'').replace(/^'/,'').trim();return /^\d{4}-(0[1-9]|1[0-2])$/.test(s)?s:'';
}
function ocLiqPersona_(v){const s=String(v||'').trim().toUpperCase();if(!Object.prototype.hasOwnProperty.call(OC_LIQ_OBLIG,s))throw Error('Obligación inválida.');return s;}
function ocLiqComp_(persona,c){c=String(c||'');if(OC_LIQ_OBLIG[persona].comps.indexOf(c)<0)throw Error('Componente inválido.');return c;}
function ocLiqRow_(r){const x=osClean_(r);x.periodo=ocLiqPeriod_(r.periodo);x.monto=Number(r.monto)||0;x.version=Number(r.version||1);return x;}
function ocLiqData_(){
 return {
  liquidaciones:ocLiqTable_('LIQUIDACIONES').rows.filter(ocProd_).map(ocLiqRow_),
  imputaciones:ocLiqTable_('IMPUTACIONES_SUELDO').rows.filter(ocProd_).map(r=>{const x=osClean_(r);x.monto=Number(r.monto)||0;return x;}),
  conceptId:OC_LIQ_CONCEPT.concepto_id,
  obligaciones:Object.keys(OC_LIQ_OBLIG).reduce((o,k)=>{o[k]={concept:OC_LIQ_OBLIG[k].concept,comps:OC_LIQ_OBLIG[k].comps};return o;},{})
 };
}
function ocLiqStamp_(prior,actor){const now=new Date().toISOString();return {ambiente:'PRODUCCION',estado_registro:'ACTIVO',version:(prior?Number(prior.version||1):0)+1,created_at:prior?prior.created_at:now,created_by:prior?prior.created_by:actor.id,updated_at:now,updated_by:actor.id};}
function ocLiqId_(persona,periodo,componente){return 'LIQ-'+persona.replace(/[^A-Z0-9]/g,'')+'-'+periodo+'-'+componente;}
// Crea o edita una línea (BASE o VARIABLE) de un período. Una sola línea activa por persona+período+componente.
function ocLiqSave_(p,actor){
 const r=p.record||{},persona=ocLiqPersona_(r.persona),periodo=ocLiqPeriod_(r.periodo),componente=ocLiqComp_(persona,r.componente);
 if(!periodo)throw Error('Período inválido (AAAA-MM).');
 const monto=Number(r.monto);if(!Number.isSafeInteger(monto)||monto<0||monto>1000000000)throw Error('Monto inválido.');
 const nota=String(r.nota||'').trim().slice(0,300);
 const t=ocLiqTable_('LIQUIDACIONES'),same=t.rows.filter(x=>ocProd_(x)&&String(x.persona).toUpperCase()===persona&&ocLiqPeriod_(x.periodo)===periodo&&x.componente===componente);
 const id=String(r.liquidacion_id||'')||ocLiqId_(persona,periodo,componente);
 if(same.some(x=>x.liquidacion_id!==id))throw Error('Ya existe '+componente+' de '+periodo+' para '+persona+'. Edítala.');
 const prior=t.rows.filter(x=>ocProd_(x)&&x.liquidacion_id===id)[0];
 if(Number(prior?prior.version||1:0)!==Number(p.expectedVersion||0))throw Error('La liquidación cambió. Recarga antes de guardar.');
 const patch=Object.assign({liquidacion_id:id,persona:persona,periodo:"'"+periodo,componente:componente,monto:monto,nota:nota},ocLiqStamp_(prior,actor));
 osAudit_(actor,'LIQ_GUARDAR','LIQUIDACIONES',id,{antes:prior?osClean_(prior):null,despues:patch});
 ocPatchRow_(t,prior?prior._row:t.sheet.getLastRow()+1,patch);
 return ocLiqData_();
}
// Genera un componente fijo (p. ej. BASE o ARRIENDO) en cada mes faltante entre dos períodos (no toca meses que ya lo tienen).
function ocLiqSeed_(p,actor){
 const persona=ocLiqPersona_(p.persona),comp=ocLiqComp_(persona,p.componente||OC_LIQ_OBLIG[persona].comps[0]),from=ocLiqPeriod_(p.desde),to=ocLiqPeriod_(p.hasta),base=Number(p.base);
 if(!from||!to||from>to)throw Error('Rango de meses inválido.');
 if(!Number.isSafeInteger(base)||base<0||base>1000000000)throw Error('Monto inválido.');
 const t=ocLiqTable_('LIQUIDACIONES'),have=new Set(t.rows.filter(x=>ocProd_(x)&&String(x.persona).toUpperCase()===persona&&x.componente===comp).map(x=>ocLiqPeriod_(x.periodo)));
 let y=Number(from.slice(0,4)),m=Number(from.slice(5,7)),n=0;
 for(let guard=0;guard<60;guard++){
  const per=y+'-'+String(m).padStart(2,'0');if(per>to)break;
  if(!have.has(per)){const id=ocLiqId_(persona,per,comp);ocPatchRow_(t,t.sheet.getLastRow()+1,Object.assign({liquidacion_id:id,persona:persona,periodo:"'"+per,componente:comp,monto:base,nota:''},ocLiqStamp_(null,actor)));t.rows.push({liquidacion_id:id});n++;}
  m++;if(m>12){m=1;y++;}
 }
 osAudit_(actor,'LIQ_GENERAR','LIQUIDACIONES',persona,{componente:comp,desde:from,hasta:to,monto:base,creadas:n});
 return ocLiqData_();
}
function ocLiqVoid_(p,actor){
 const t=ocLiqTable_('LIQUIDACIONES'),r=t.rows.filter(x=>ocProd_(x)&&x.liquidacion_id===p.id)[0];if(!r)throw Error('Liquidación no encontrada.');
 if(Number(r.version||1)!==Number(p.expectedVersion))throw Error('La liquidación cambió. Recarga.');
 if(ocLiqTable_('IMPUTACIONES_SUELDO').rows.some(x=>ocProd_(x)&&x.liquidacion_id===p.id))throw Error('Tiene pagos imputados: quítalos antes de anularla.');
 const patch={estado_registro:'ANULADO',updated_at:new Date().toISOString(),updated_by:actor.id,version:Number(r.version||1)+1};
 osAudit_(actor,'LIQ_ANULAR','LIQUIDACIONES',p.id,{antes:osClean_(r)});ocPatchRow_(t,r._row,patch);
 return ocLiqData_();
}
// Reemplaza la imputación completa de un movimiento: items=[{liquidacionId,monto}] (vacío = quitar).
// Si el movimiento no tiene concepto, queda clasificado con el concepto de la obligación (Sueldo JT, Arriendo, C&C).
function ocLiqAllocate_(p,actor){
 const mt=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),mv=mt.rows.filter(r=>ocProd_(r)&&String(r.movimiento_id)===String(p.movementId));
 if(mv.length!==1)throw Error('Movimiento no encontrado o duplicado.');const m=mv[0];
 if(m.direccion!=='SALIDA')throw Error('Solo se imputan egresos (salidas de dinero).');
 const total=Number(m.monto);if(!Number.isSafeInteger(total)||total<=0)throw Error('El movimiento no tiene importe.');
 const items=Array.isArray(p.items)?p.items:[];if(items.length>40)throw Error('Demasiadas líneas.');
 const lt=ocLiqTable_('LIQUIDACIONES'),liqs={};lt.rows.filter(ocProd_).forEach(r=>{liqs[r.liquidacion_id]=r;});
 const seen={};let sum=0;
 const clean=items.map(it=>{
  const id=String(it.liquidacionId||''),monto=Number(it.monto);
  if(!liqs[id])throw Error('Liquidación no encontrada: '+id);if(seen[id])throw Error('Liquidación repetida.');seen[id]=1;
  if(!Number.isSafeInteger(monto)||monto<=0)throw Error('Monto inválido en la imputación.');sum+=monto;
  return {id:id,monto:monto,persona:String(liqs[id].persona)};
 });
 if(sum>total)throw Error('Lo imputado ('+sum+') supera el monto del movimiento ('+total+').');
 const owners=Array.from(new Set(clean.map(x=>x.persona)));if(owners.length>1)throw Error('Un pago se imputa a una sola obligación.');
 const classify=clean.length&&!m.concepto_id;
 if(classify&&Number(m.version||1)!==Number(p.expectedVersion))throw Error('El movimiento cambió. Recarga antes de guardar.');
 const it=ocLiqTable_('IMPUTACIONES_SUELDO'),now=new Date().toISOString(),prev=it.rows.filter(r=>ocProd_(r)&&String(r.movimiento_id)===String(m.movimiento_id));
 osAudit_(actor,'LIQ_IMPUTAR','IMPUTACIONES_SUELDO',String(m.movimiento_id),{antes:prev.map(osClean_),despues:clean});
 prev.forEach(r=>ocPatchRow_(it,r._row,{estado_registro:'ANULADO',updated_at:now,updated_by:actor.id,version:Number(r.version||1)+1}));
 clean.forEach(x=>{ocPatchRow_(it,it.sheet.getLastRow()+1,Object.assign({imputacion_id:'IMP-'+Utilities.getUuid(),movimiento_id:String(m.movimiento_id),liquidacion_id:x.id,persona:x.persona,monto:x.monto},ocLiqStamp_(null,actor)));});
 let movement=null;
 if(classify){
  const cid=(OC_LIQ_OBLIG[owners[0]]||OC_LIQ_OBLIG.JT).concept,row=ocTable_('OC_MAESTROS_ID','CONCEPTOS_CAJA').rows.filter(r=>r.concepto_id===cid&&r.habilitado==='SI')[0];
  if(!row)throw Error('Falta el concepto '+cid+' en la caja.');const c=ocConcept_(row);
  const patch={concepto_id:c.id,concepto_nombre:c.name,concepto_version:c.version,categoria:c.category,naturaleza:c.nature,tipo_costo:c.cost,recurrente:c.recurring?'SI':'NO',operacion_auto:'',vehiculo_id:'',estado_clasificacion:'CLASIFICADO',updated_at:now,updated_by:actor.id,version:Number(m.version||1)+1};
  ocPatchRow_(mt,m._row,patch);movement=ocSlimMov_(Object.assign({},m,patch));
 }
 return Object.assign(ocLiqData_(),{movement:movement});
}
