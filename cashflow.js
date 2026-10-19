(function(root){
 'use strict';
 const accounts=[['CTA-MERCADO-PAGO','MERCADO PAGO'],['CTA-SECURITY-PERSONAL','SECURITY PERSONAL'],['CTA-CAJA','CAJA'],['CTA-SECURITY-EMPRESA','SECURITY EMPRESA'],['CTA-BANCO-CHILE','BANCO CHILE']];
 function amount(value){
  if(typeof value==='number')return Number.isSafeInteger(value)?value:null;
  let s=String(value??'').trim().replace(/\$|CLP|\s/g,'');
  if(!s)return null;
  if(/^\(.*\)$/.test(s))s='-'+s.slice(1,-1);
  if(/^-?\d{1,3}([.,]\d{3})+$/.test(s))s=s.replace(/[.,]/g,'');
  if(!/^[+-]?\d+$/.test(s))return null;
  const n=Number(s);return Number.isSafeInteger(n)?n:null;
 }
 function date(value){
  if(value instanceof Date&&!isNaN(value))return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  let s=String(value??'').trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if(!m){const d=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);if(d)m=['',d[3],d[2].padStart(2,'0'),d[1].padStart(2,'0')];}
  if(!m)return null;
  const normalized=`${m[1]}-${m[2]}-${m[3]}`,t=new Date(normalized+'T12:00:00Z');
  return !isNaN(t)&&t.toISOString().slice(0,10)===normalized?normalized:null;
 }
 function normalize(rows,map,account){
  if(!accounts.some(a=>a[0]===account))throw Error('Selecciona una cuenta.');
  return rows.filter(r=>r.some(v=>String(v??'').trim())).map((r,i)=>{
   const get=k=>map[k]===undefined||map[k]===''?'':r[Number(map[k])];
   const errors=[],day=date(get('date')),credit=amount(get('credit')),debit=amount(get('debit')),signed=amount(get('amount'));
   let direction='',value=null;
   const mapped=k=>map[k]!==undefined&&map[k]!=='';
   if(mapped('credit')||mapped('debit')){
    if((credit!==null&&credit<0)||(debit!==null&&debit<0)||(credit>0&&debit>0))errors.push('Revisar cargos y abonos');
    else if(credit>0){direction='ENTRADA';value=credit;}else if(debit>0){direction='SALIDA';value=debit;}else errors.push('Falta importe');
    if(String(get('credit')??'').trim()&&credit===null||String(get('debit')??'').trim()&&debit===null)errors.push('Importe no válido');
   }else if(signed!==null&&signed!==0){value=Math.abs(signed);direction=signed>0?'ENTRADA':'SALIDA';}else errors.push('Falta importe válido');
   if(mapped('direction')){const explicit=String(get('direction')??'').trim().toUpperCase();if(!['ENTRADA','SALIDA'].includes(explicit))errors.push('Dirección por confirmar');else direction=explicit;}
   if(mapped('confirmed')&&String(get('confirmed')).toUpperCase()!=='SI')errors.push('Monto efectivo por confirmar');
   if(mapped('sourceState')&&String(get('sourceState')).toLowerCase()!=='approved')errors.push('Estado de origen sin aprobación');
   if(!day)errors.push('Fecha no válida');
   const reference=String(get('reference')??'').trim(),description=String(get('description')??'').trim();
   const id=String(get('id')??'').trim();
   return {account,date:day,amount:value,direction,reference,description,sourceId:id,line:i+1,errors,review:'PENDIENTE'};
  });
 }
 function key(r){return r.sourceId?`${r.account}|id|${r.sourceId}`:JSON.stringify([r.account,r.date,r.direction,r.amount,r.reference,r.description]);}
 function duplicates(rows,previous=[]){
  const counts=new Map();[...previous,...rows].forEach(r=>counts.set(key(r),(counts.get(key(r))||0)+1));
  return rows.map(r=>({...r,duplicate:counts.get(key(r))>1}));
 }
 function suggestions(bank,ledger){
  const candidates=bank.map(b=>b.errors.length||b.duplicate?[]:ledger.filter(l=>!l.errors.length&&!l.duplicate&&l.account===b.account&&l.direction===b.direction&&l.amount===b.amount&&l.date===b.date&&b.reference&&l.reference===b.reference));
  const use=new Map();candidates.forEach(c=>c.forEach(l=>use.set(l,(use.get(l)||0)+1)));
  return candidates.map(c=>c.length===1&&use.get(c[0])===1?c[0]:null);
 }
 const api={accounts,amount,date,normalize,duplicates,suggestions};
 if(typeof module!=='undefined')module.exports=api;
 if(!root.document)return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>n===null?'—':new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n);
 let state={bank:[],ledger:[],account:accounts[0][0],filter:'',draft:null,message:''};
 function reset(){state={bank:[],ledger:[],account:accounts[0][0],filter:'',draft:null,message:''};}
 function markup(){return '<section id="oc-cashflow" class="oc-card"></section>';}
 function mount(parent){const el=parent.querySelector('#oc-cashflow');if(el)draw(el);}
 function draw(el){
  const bank=state.bank.filter(r=>!state.filter||r.account===state.filter),matched=suggestions(state.bank,state.ledger);
  el.innerHTML=`<p class="oc-eyebrow">FINANZAS / FLUJO DE CAJA</p><h2>Todas tus cuentas, una sola revisión.</h2><p>Los movimientos se registran por cuenta y se vinculan con su cobro, pago o transferencia.</p><div class="oc-notice"><strong>Preparación local · Guardado en Google pendiente</strong><p>Puedes revisar archivos y exportar un borrador. Los datos cargados permanecen en esta sesión; no se envían a un servidor ni se consideran conciliados.</p></div>
  <div class="oc-cash-accounts">${accounts.map(a=>`<button data-account="${a[0]}" aria-pressed="${state.filter===a[0]}"><strong>${a[1]}</strong><small>${state.bank.filter(r=>r.account===a[0]).length} filas cargadas en esta sesión</small><span>Saldo: sin verificar</span></button>`).join('')}</div>
  <div class="oc-cash-tools"><label>Cuenta del archivo<select id="cash-account">${accounts.map(a=>`<option value="${a[0]}" ${state.account===a[0]?'selected':''}>${a[1]}</option>`).join('')}</select></label><label class="oc-upload">1. Cargar cartola Excel / CSV<input id="cash-bank" type="file" accept=".xlsx,.xls,.csv,.tsv"></label><label class="oc-upload">2. Cargar cobros / pagos de referencia<input id="cash-ledger" type="file" accept=".xlsx,.xls,.csv,.tsv"></label></div>
  <p role="status">${esc(state.message)}</p>${state.draft?mapping():''}
  <div class="oc-cash-tools"><button id="cash-all">Ver todas las cuentas</button><button id="cash-match" ${matched.some(Boolean)?'':'disabled'}>Aceptar coincidencias como borrador (${matched.filter(Boolean).length})</button><button id="cash-export" ${state.bank.length?'':'disabled'}>Exportar revisión</button><button id="cash-clear">Vaciar sesión</button></div>
  <p>${bank.length} filas visibles · ${state.ledger.length} referencias cargadas. Las coincidencias requieren cuenta, dirección, fecha, monto y referencia iguales y únicos. Las transferencias entre cuentas se revisan como transferencias internas.</p>
  <div class="oc-table-scroll"><table><thead><tr><th>Cuenta / fecha</th><th>Descripción / referencia</th><th>Dirección</th><th>Importe CLP</th><th>Revisión</th></tr></thead><tbody>${bank.length?bank.map(r=>`<tr><td>${esc(accounts.find(a=>a[0]===r.account)?.[1])}<br>${esc(r.date)}</td><td>${esc(r.description)}<br><small>${esc(r.reference)}</small></td><td>${esc(r.direction)}</td><td>${money(r.amount)}</td><td>${esc(r.errors.join(' · ')||(r.duplicate?'Posible duplicado':r.review))}</td></tr>`).join(''):'<tr><td colspan="5">Carga una cartola para revisar. Los movimientos de Sheets aparecerán aquí cuando se active la conexión.</td></tr>'}</tbody></table></div>`;
  el.querySelector('#cash-account').onchange=e=>{state.account=e.target.value;};
  el.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.account;draw(el);});
  el.querySelector('#cash-all').onclick=()=>{state.filter='';draw(el);};
  for(const kind of ['bank','ledger'])el.querySelector('#cash-'+kind).onchange=e=>load(e.target.files[0],kind,el);
  el.querySelector('#cash-clear').onclick=()=>{reset();draw(el);};
  el.querySelector('#cash-match').onclick=()=>{matched.forEach((l,i)=>{if(l){state.bank[i].review='COINCIDENCIA ACEPTADA · BORRADOR';state.bank[i].matchedReference=l.sourceId||l.reference;}});state.message='Revisión preparada. No se ha guardado ni conciliado en Google.';draw(el);};
  el.querySelector('#cash-export').onclick=()=>{
   const data={version:1,estado:'BORRADOR_NO_GUARDADO_EN_GOOGLE',exportedAt:new Date().toISOString(),movimientos:state.bank,referencias:state.ledger};
   const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='revision-flujo-caja.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  if(state.draft){
   el.querySelector('#cash-sheet').onchange=e=>{state.draft.sheet=e.target.value;draw(el);};
   el.querySelector('#cash-header').onchange=e=>{state.draft.header=Math.max(1,Number(e.target.value)||1);draw(el);};
   el.querySelector('#cash-cancel').onclick=()=>{state.draft=null;draw(el);};
   el.querySelector('#cash-apply').onclick=()=>{try{
    const map=Object.fromEntries([...el.querySelectorAll('[data-map]')].map(s=>[s.dataset.map,s.value]));
    if(map.date===''||map.amount===''&&map.credit===''&&map.debit==='')throw Error('Selecciona fecha y monto, o cargos / abonos.');
    const selected=Object.values(map).filter(v=>v!=='');if(new Set(selected).size!==selected.length)throw Error('Cada columna debe tener una función distinta.');
    const d=state.draft,headers=d.sheets[d.sheet][d.header-1],rows=d.sheets[d.sheet].slice(d.header);
    for(const [k,name] of Object.entries({confirmed:'monto_confirmado',sourceState:'estado_fuente',direction:'direccion'})){const index=headers.indexOf(name);if(index>=0)map[k]=index;}
    const accountIndex=headers.indexOf('cuenta_id');
    if(accountIndex>=0&&rows.some(r=>r.some(v=>String(v??'').trim())&&r[accountIndex]!==d.account))throw Error('La hoja contiene otra cuenta. Filtra el archivo por la cuenta seleccionada antes de cargar.');
    const parsed=normalize(rows,map,d.account);
    if(!parsed.length)throw Error('No hay movimientos debajo del encabezado.');
    state[d.kind]=duplicates([...state[d.kind],...parsed]);state.draft=null;state.bank.forEach(r=>{r.review='PENDIENTE';delete r.matchedReference;});state.message=`${parsed.length} filas añadidas para revisión. Los errores y posibles duplicados quedan señalados.`;draw(el);
   }catch(e){state.message=e.message;el.querySelector('[role=status]').textContent=e.message;}};
  }
 }
 function mapping(){
  const d=state.draft,headers=d.sheets[d.sheet][d.header-1]||[],names={date:'Fecha',amount:'Monto con signo (+ entrada / − salida)',credit:'Abonos',debit:'Cargos',reference:'Referencia',description:'Descripción',id:'ID único de origen'};
  return `<section class="oc-cash-mapping"><h3>Revisar columnas · ${esc(accounts.find(a=>a[0]===d.account)[1])}</h3><label>Hoja<select id="cash-sheet">${Object.keys(d.sheets).map(s=>`<option ${s===d.sheet?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label>Fila de encabezados<input id="cash-header" type="number" min="1" max="100" value="${d.header}"></label><div class="oc-cash-tools">${Object.entries(names).map(([k,n])=>`<label>${n}<select data-map="${k}"><option value="">Sin usar</option>${headers.map((h,i)=>`<option value="${i}">${esc(h||'Columna '+(i+1))}</option>`).join('')}</select></label>`).join('')}</div><p>Importes en pesos enteros. Usa monto con signo o cargos/abonos separados. Un importe sin signo se interpreta como entrada; confirma que sea el formato de tu cartola.</p><button id="cash-apply">Añadir a revisión</button> <button id="cash-cancel">Cancelar carga</button></section>`;
 }
 async function load(file,kind,el){
  if(!file)return;
  const account=state.account;
  try{
   if(file.size>10*1024*1024)throw Error('El archivo supera 10 MB. Divide la cartola por período.');
   const wb=root.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true,raw:true,sheetRows:10002});
   const sheets={};for(const name of wb.SheetNames){const ws=wb.Sheets[name];if(ws['!fullref']&&ws['!fullref']!==ws['!ref'])throw Error('La hoja supera 10.000 filas. Divide el archivo.');sheets[name]=root.XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});}
   if(!wb.SheetNames.length)throw Error('El archivo no contiene hojas.');
   state.draft={sheets,sheet:wb.SheetNames[0],header:1,kind,account};state.message='Selecciona las columnas antes de incorporar las filas.';draw(el);
  }catch(e){state.message='No se pudo cargar: '+e.message;draw(el);}
 }
 root.OCCashflow={...api,markup,mount,reset};
})(typeof window==='undefined'?globalThis:window);
