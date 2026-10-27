// Oportunicars · Extras: parámetros (costo de estacionamiento), edición completa de movimientos y control de sesiones.
// En el proyecto Apps Script vive al final de Carga.gs. ocExtra_ (Atajo.gs) ya lo llama.

// ---------- Parámetros ----------
// Autos con más de N días de inventario suman costo de estacionamiento: (días − N) × valor por día.
function ocSettings_(){
 const p=PropertiesService.getScriptProperties(),n=(k,d)=>{const v=Number(p.getProperty(k));return Number.isFinite(v)&&p.getProperty(k)!==null?v:d;};
 return {parkingDays:n('OC_PARKING_DAYS',30),parkingRate:n('OC_PARKING_RATE',1)};
}
function ocSaveSettings_(p,actor){
 if(!actor.manage)throw Error('Solo Gerencia o Administración cambia parámetros.');
 const days=Number(p.parkingDays),rate=Number(p.parkingRate);
 if(!Number.isSafeInteger(days)||days<0||days>3650)throw Error('Días libres inválidos.');
 if(!Number.isSafeInteger(rate)||rate<0||rate>10000000)throw Error('Valor por día inválido.');
 const before=ocSettings_();PropertiesService.getScriptProperties().setProperties({OC_PARKING_DAYS:String(days),OC_PARKING_RATE:String(rate)});
 osAudit_(actor,'PARAMETROS','PROPIEDADES','ESTACIONAMIENTO',{antes:before,despues:{parkingDays:days,parkingRate:rate}});
 return ocSettings_();
}

// ---------- Edición completa de un movimiento (rueda → Editar) ----------
// Lo ingresado por personas (a mano o por atajo) se corrige entero: cuenta, fecha, monto, ingreso/egreso, descripción, concepto y auto,
// y se puede eliminar. Lo importado del banco o de Mercado Pago conserva cuenta, fecha, monto y descripción: solo se corrige
// ingreso/egreso, concepto y auto; nunca se elimina.
function ocMovOwn_(r){return ['MANUAL','ATAJO'].indexOf(String(r.estado_importacion||''))>=0||String(r.origen||'')==='MANUAL';}
function ocMovCanEdit_(r,actor){return actor.manage||ocIsAdminUser_(actor)||String(r.created_by||'')===String(actor.id);}
function ocMovEdit_(p,actor){
 const m='OC_MAESTROS_ID',fin=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),r=ocMovRow_(fin,p.id);
 if(Number(r.version||1)!==Number(p.expectedVersion))throw Error('El movimiento cambió. Recarga antes de guardar.');
 if(!ocMovCanEdit_(r,actor))throw Error('Solo quien lo registró o Gerencia puede corregirlo.');
 const own=ocMovOwn_(r),f=p.fields||{},patch={};
 const day=v=>v instanceof Date?Utilities.formatDate(v,'America/Santiago','yyyy-MM-dd'):String(v||'');
 if(own){
  const q=ocManualValidate_({amount:f.amount,direction:f.direction,date:f.date,description:f.description},ocToday_());
  const accounts=ocTable_(m,'CUENTAS_FINANCIERAS').rows.filter(a=>a.cuenta_id===f.accountId&&ocProd_(a));if(accounts.length!==1)throw Error('Cuenta no encontrada.');
  Object.assign(patch,{cuenta_id:String(f.accountId),fecha_operacion:q.date,monto:q.amount,direccion:q.direction,descripcion:q.description});
  if(ocIsCash_(accounts[0]))Object.assign(patch,{monto_confirmado:'SI',incluir_en_saldo:'SI'});
 }else{
  if(f.accountId&&f.accountId!==String(r.cuenta_id)||f.date&&f.date!==day(r.fecha_operacion)||f.amount!==undefined&&f.amount!==''&&Number(f.amount)!==Number(r.monto))throw Error('Movimiento importado: cuenta, fecha y monto vienen del banco y no se cambian.');
  if(['ENTRADA','SALIDA'].indexOf(f.direction)<0)throw Error('Indica si fue ingreso o egreso.');
  patch.direccion=f.direction;
 }
 const dir=patch.direccion;
 // Concepto y auto: vacío = por asignar. Aportes, préstamos y transferencias se asignan desde la caja (piden detalle).
 const keepLinks=String(f.conceptId||'')===String(r.concepto_id||'');
 let C=null;
 if(f.conceptId){
  const cs=ocTable_(m,'CONCEPTOS_CAJA').rows.filter(c=>c.concepto_id===f.conceptId&&c.habilitado==='SI');if(cs.length!==1)throw Error('Concepto no disponible.');C=ocConcept_(cs[0]);ocValidateConcept_(C);
  if(dir==='ENTRADA'&&['GASTO','COSTO'].indexOf(C.nature)>=0||dir==='SALIDA'&&C.nature==='INGRESO')throw Error('El concepto no corresponde a si entró o salió dinero.');
  if(!keepLinks&&['APORTE_CAPITAL','PRESTAMO'].indexOf(C.nature)>=0)throw Error('Aportes y préstamos se asignan desde la caja (piden socio o préstamo).');
  if(keepLinks&&C.nature==='APORTE_CAPITAL'&&dir!=='ENTRADA')throw Error('Un aporte siempre es ingreso.');
 }
 let car='';
 if(C&&C.vehicleOperation&&f.vehicleId){const vs=ocTable_(m,'VEHICULOS').rows.filter(v=>String(v.vehiculo_id)===String(f.vehicleId)&&ocProd_(v));if(vs.length!==1)throw Error('Auto no encontrado.');car=String(vs[0].vehiculo_id);}
 const E={id:'',name:'',version:'',category:'',nature:'',cost:'',recurring:false,vehicleOperation:''},K=C||E;
 Object.assign(patch,{concepto_id:K.id,concepto_nombre:K.name,concepto_version:K.version,categoria:K.category,naturaleza:K.nature,tipo_costo:K.cost,recurrente:C?(K.recurring?'SI':'NO'):'',operacion_auto:K.vehicleOperation,vehiculo_id:car,estado_clasificacion:!C?'PENDIENTE':K.vehicleOperation&&!car?'POR_ASIGNAR_AUTO':'CLASIFICADO'});
 if(!keepLinks)Object.assign(patch,{actividad_id:'',proyeccion_id:'',prestamo_id:'',componente_prestamo:'',socio:'',aporte_id:''});
 const full=ocBump_(r,actor,patch);
 osAudit_(actor,'EDITAR_MOVIMIENTO','MOVIMIENTOS_BANCARIOS',p.id,{propio:own,antes:ocSlimMov_(r),despues:full});
 ocPatchRow_(fin,r._row,full);return ocSlimMov_(Object.assign({},r,full));
}
function ocMovVoid_(p,actor){
 const t=ocTable_('OC_FINANZAS_ID','MOVIMIENTOS_BANCARIOS'),r=ocMovRow_(t,p.id);
 if(Number(r.version||1)!==Number(p.expectedVersion))throw Error('El movimiento cambió. Recarga antes de eliminar.');
 if(!ocMovOwn_(r))throw Error('Los movimientos del banco o de Mercado Pago no se eliminan.');
 if(!ocMovCanEdit_(r,actor))throw Error('Solo quien lo registró o Gerencia puede eliminarlo.');
 osAudit_(actor,'ELIMINAR_MOVIMIENTO','MOVIMIENTOS_BANCARIOS',p.id,{antes:ocSlimMov_(r)});
 ocPatchRow_(t,r._row,ocBump_(r,actor,{estado_registro:'ANULADO'}));return {id:p.id};
}

// ---------- Usuarios ----------
function ocIsJT_(actor){return /^(jt|jos[eé]\s*tom[aá]s)\b/i.test(String(actor&&actor.name||'').trim());}

// ---------- Sesiones ----------
// Solo correos @oportunicars.cl. Cada correo puede tener hasta 3 sesiones abiertas (p. ej. computador, web del teléfono y atajo);
// al abrir una cuarta se cierra la que lleva más tiempo sin usarse.
const OC_SESSION_MAX=3;
function ocSessionGuard_(u,token){
 if(!/@oportunicars\.cl$/i.test(String(u&&u.email||'').trim()))throw Error('Solo se permiten cuentas @oportunicars.cl.');
 let sid='';try{sid=String(JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(token.split('.')[1].replace(/=+$/,'')+'==='.slice((token.split('.')[1].length+3)%4))).getDataAsString()).session_id||'');}catch(e){sid='';}
 if(!sid)return;
 const props=PropertiesService.getScriptProperties(),key='OC_SES_'+u.id,now=Date.now();
 let list=[];try{list=JSON.parse(props.getProperty(key)||'[]');}catch(e){list=[];}
 const mine=list.filter(x=>x.s===sid)[0];
 if(mine){if(mine.x)throw Error('SESION_CERRADA: se abrieron más de '+OC_SESSION_MAX+' sesiones con tu correo. Ingresa nuevamente.');if(now-mine.t<3600000)return;mine.t=now;}
 else list.push({s:sid,t:now});
 const live=list.filter(x=>!x.x).sort((a,b)=>b.t-a.t);
 live.slice(OC_SESSION_MAX).forEach(x=>{x.x=1;});
 list=list.filter(x=>!x.x||now-x.t<90*86400000).slice(-20);
 props.setProperty(key,JSON.stringify(list));
}

function ocExtrasExtra_(p,actor){
 if(p.action==='settings')return ocSettings_();
 if(p.action==='saveSettings')return ocSaveSettings_(p,actor);
 if(p.action==='movEdit')return ocMovEdit_(p,actor);
 if(p.action==='movVoid')return ocMovVoid_(p,actor);
 return undefined;
}
