// Oportunicars · Socios (Configuración). Lista cerrada para asignar los aportes de capital.
// En el proyecto Apps Script vive al final de Carga.gs. ocExtra_ (Atajo.gs) ya lo llama.
const OC_SOCIOS_FIELDS=['socio_id','nombre','habilitado','ambiente','estado_registro','version','created_at','created_by','updated_at','updated_by'];
function ocSociosExtra_(p,actor){
 if(['socios','socioSave'].indexOf(p.action)<0)return undefined;
 ocSociosEnsure_();
 if(p.action==='socios')return ocSociosList_();
 if(!actor.manage)throw Error('Solo Gerencia o Administración edita socios.');
 const r=p.record||{},nombre=String(r.nombre||'').trim().replace(/\s+/g,' ');
 if(!/^[\wÁÉÍÓÚÑáéíóúñ .'-]{2,60}$/.test(nombre))throw Error('Nombre de socio inválido.');
 const habilitado=r.habilitado==='NO'?'NO':'SI',t=ocTable_('OC_MAESTROS_ID','SOCIOS');
 const id=String(r.socio_id||'')||'SOCIO-'+nombre.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,30);
 if(t.rows.some(x=>ocProd_(x)&&x.socio_id!==id&&String(x.nombre).trim().toLowerCase()===nombre.toLowerCase()))throw Error('Ese socio ya existe.');
 const prior=t.rows.filter(x=>ocProd_(x)&&x.socio_id===id)[0];
 if(Number(prior?prior.version||1:0)!==Number(p.expectedVersion||0))throw Error('El socio cambió. Recarga.');
 const now=new Date().toISOString(),patch={socio_id:id,nombre:nombre,habilitado:habilitado,ambiente:'PRODUCCION',estado_registro:'ACTIVO',version:(prior?Number(prior.version||1):0)+1,created_at:prior?prior.created_at:now,created_by:prior?prior.created_by:actor.id,updated_at:now,updated_by:actor.id};
 osAudit_(actor,'SOCIO_GUARDAR','SOCIOS',id,{antes:prior?osClean_(prior):null,despues:patch});
 ocPatchRow_(t,prior?prior._row:t.sheet.getLastRow()+1,patch);return ocSociosList_();
}
function ocSociosEnsure_(){
 const props=PropertiesService.getScriptProperties();if(props.getProperty('OC_SOCIOS_READY')==='1')return;
 osEnsure_(SpreadsheetApp.openById(ocProperty_('OC_MAESTROS_ID')),'SOCIOS',OC_SOCIOS_FIELDS);
 props.setProperty('OC_SOCIOS_READY','1');
}
function ocSociosList_(){return ocTable_('OC_MAESTROS_ID','SOCIOS').rows.filter(ocProd_).map(r=>({socio_id:String(r.socio_id),nombre:String(r.nombre),habilitado:String(r.habilitado||'SI'),version:Number(r.version||1)}));}
