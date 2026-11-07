(function(root){
'use strict';
// Liquidaciones y pagos fijos (solo Alex): lo que se DEBE cada mes, por componentes, separado de lo que se PAGÓ (caja).
// Un pago puede cubrir varios componentes o meses; un mes puede pagarse con varios movimientos.
// Sueldo JT: base + variable (regla y tope abiertos). Arriendo: arriendo + estacionamientos. Cars and Coffee: cuota.
// Las planillas son la referencia del flujo (CSV) para encontrar cada pago: nunca suman en los totales.
const OBLIGS={
 JT:{label:'Sueldo JT',intro:'Sueldo base fijo por mes, comisiones (variable) aparte e imposiciones pagadas (AFP, salud, SII). Los montos se ingresan a mano.',
  comps:[['BASE','Sueldo base',3000000],['VARIABLE','Comisiones',null],['IMPOSICIONES','Imposiciones',null]],
  planilla:[{n:52,mes:'2025-12',monto:3000000,origen:'SCOTIA'},{n:139,mes:'2026-01',monto:5741907,origen:'SCOTIA'},{n:177,mes:'2026-01',monto:6000000,origen:'SCOTIA'},
   {n:261,mes:'2026-02',monto:6000000,origen:'SCOTIA'},{n:374,mes:'2026-03',monto:6000000,origen:'SCOTIA'},{n:470,mes:'2026-05',monto:6000000,origen:'MP'},
   {n:571,mes:'2026-06',monto:6000000,origen:'MP'},{n:634,mes:'2026-07',monto:3000000,origen:'MP'},{n:723,mes:'2026-08',monto:5000820,origen:'Sin cuenta'},
   {n:801,mes:'2026-09',monto:6000000,origen:'Sin cuenta'},{n:854,mes:'2026-10',dia:'2026-10-01',monto:1000000,origen:'MP'},{n:860,mes:'2026-10',dia:'2026-10-02',monto:5000000,origen:'MP'}]},
 ARRIENDO:{label:'Arriendo y estacionamientos',intro:'Un monto fijo de arriendo y otro de estacionamientos, editables mes a mes. El pago puede venir junto o separado.',
  comps:[['ARRIENDO','Arriendo',2078857],['ESTACIONAMIENTO','Estacionamientos',397276]],
  planilla:[{n:117,mes:'2026-01',monto:300000,origen:'SCOTIA c/fact'},{n:128,mes:'2026-01',monto:952500,origen:'SCOTIA c/fact'},{n:220,mes:'2026-02',monto:2047970,origen:'SCOTIA'},
   {n:305,mes:'2026-03',monto:2078857,origen:'MP'},{n:446,mes:'2026-04',monto:2078857,origen:'MP'},{n:600,mes:'2026-06',monto:2078857,origen:'MP'},
   {n:694,mes:'2026-07',monto:2476133,origen:'Sin cuenta'},{n:725,mes:'2026-08',monto:2078857,origen:'Sin cuenta'},{n:827,mes:'2026-09',monto:2476133,origen:'MP · Netparking'},
   {n:869,mes:'2026-10',dia:'2026-10-13',monto:2476628,origen:'MP · Netparking'}]},
 CYC:{label:'Cars and Coffee',intro:'Cuota mensual fija, editable mes a mes.',comps:[['CUOTA','Cuota',2142000]],
  planilla:[{n:536,mes:'2026-05',monto:2142000,origen:'MP'},{n:591,mes:'2026-06',monto:2142000,origen:'MP'},{n:651,mes:'2026-07',monto:2142000,origen:'Sin cuenta'},
   {n:713,mes:'2026-08',monto:2142000,origen:'Sin cuenta'},{n:794,mes:'2026-09',monto:2142000,origen:'Sin cuenta'},{n:855,mes:'2026-10',dia:'2026-10-01',monto:2142000,origen:'MP'}]}
};
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n):'—';
const fmtDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.slice(8,10)+'-'+v.slice(5,7)+'-'+v.slice(0,4):'Sin fecha';
const perLabel=p=>/^\d{4}-\d{2}$/.test(p||'')?MESES[Number(p.slice(5,7))-1]+'-'+p.slice(2,4):p;
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);
const addMonths=(p,k)=>{let y=Number(p.slice(0,4)),m=Number(p.slice(5,7))+k;while(m>12){m-=12;y++;}while(m<1){m+=12;y--;}return y+'-'+String(m).padStart(2,'0');};
const dayDiff=(a,b)=>Math.abs(Date.parse(a)-Date.parse(b))/86400000;
const compOrder=(ob,c)=>{const i=(OBLIGS[ob]?.comps||[]).findIndex(x=>x[0]===c);return i<0?99:i;};

// ---------- Cálculos puros (probados en tests) ----------
// Por mes: cada componente, devengado, pagado (imputado) y saldo.
function months(liqs,imps){
 const paid={};imps.forEach(i=>{paid[i.liquidacion_id]=(paid[i.liquidacion_id]||0)+Number(i.monto);});
 const by={};liqs.forEach(l=>{const r=by[l.periodo]=by[l.periodo]||{periodo:l.periodo,lines:{},pagado:0};r.lines[l.componente]=l;r.pagado+=paid[l.liquidacion_id]||0;});
 return Object.values(by).sort((a,b)=>a.periodo.localeCompare(b.periodo)).map(r=>{const dev=Object.values(r.lines).reduce((a,l)=>a+l.monto,0);return {...r,base:r.lines.BASE||null,variable:r.lines.VARIABLE||null,devengado:dev,saldo:dev-r.pagado};});
}
// Saldo pendiente de cada línea, sin contar lo imputado por un movimiento (para editar su reparto).
function pendingByLiq(liqs,imps,exceptMovement){
 const paid={};imps.filter(i=>i.movimiento_id!==exceptMovement).forEach(i=>{paid[i.liquidacion_id]=(paid[i.liquidacion_id]||0)+Number(i.monto);});
 return liqs.map(l=>({...l,pendiente:l.monto-(paid[l.liquidacion_id]||0)}));
}
// Reparto sugerido: lo más antiguo primero; dentro del mes, en el orden de los componentes (base antes que variable).
function fifo(pending,amount,ob){
 const order=pending.filter(l=>l.pendiente>0).sort((a,b)=>a.periodo.localeCompare(b.periodo)||compOrder(ob||a.persona,a.componente)-compOrder(ob||b.persona,b.componente));
 let left=amount;const out={};
 for(const l of order){if(left<=0)break;const x=Math.min(left,l.pendiente);out[l.liquidacion_id]=x;left-=x;}
 return out;
}
const isOut=m=>m.direction!=='ENTRADA'&&Number.isFinite(m.amount)&&m.amount>0&&!!m.date;
// Egresos individuales o sumados (hasta maxk, todos dentro de `span` días) que dan exactamente el monto, cerca de una fecha.
function combos(movs,target,center,win,opts={}){
 const span=opts.span??7,maxk=opts.maxk??3,skip=opts.skip||new Set(),limit=opts.limit??8;
 const pool=movs.filter(m=>isOut(m)&&m.amount<=target&&!skip.has(m.id)&&dayDiff(m.date,center)<=win).sort((a,b)=>dayDiff(a.date,center)-dayDiff(b.date,center)).slice(0,45);
 const out=pool.filter(m=>m.amount===target).map(m=>[m]);
 const rec=(start,k,acc,sum)=>{if(out.length>=limit)return;
  for(let i=start;i<pool.length;i++){const m=pool[i],s=sum+m.amount;if(s>target)continue;
   const ds=[...acc,m].map(x=>Date.parse(x.date));if((Math.max(...ds)-Math.min(...ds))/86400000>span)continue;
   if(k===1){if(s===target&&acc.length)out.push([...acc,m]);}else rec(i+1,k-1,[...acc,m],s);if(out.length>=limit)return;}};
 for(let k=2;k<=maxk&&out.length<limit;k++)rec(0,k,[],0);
 return out;
}
// Cada fila de la planilla busca un egreso (o suma de egresos) de su monto cerca de su mes o día. Prefiere los ya imputados.
function matchPlanilla(rows,movements,imputed){
 const used=new Set();
 return rows.map(r=>{
  const center=r.dia||r.mes+'-15',win=r.dia?4:30;
  const singles=movements.filter(m=>isOut(m)&&m.amount===r.monto&&dayDiff(m.date,center)<=win&&!used.has(m.id))
   .sort((a,b)=>(imputed.has(b.id)-imputed.has(a.id))||dayDiff(a.date,center)-dayDiff(b.date,center));
  const hit=singles.find(m=>imputed.has(m.id));if(hit){used.add(hit.id);return {...r,hit,candidates:[]};}
  const cands=singles.length?singles.map(m=>[m]):combos(movements,r.monto,center,win,{skip:used,limit:4});
  return {...r,hit:null,candidates:cands};
 });
}
// ---------- RRHH ----------
// Feriados legales de Chile (días que no cuentan como hábiles para vacaciones). Si falta uno, se corrigen los días a mano.
const FERIADOS_CL=new Set([
 '2025-01-01','2025-04-18','2025-04-19','2025-05-01','2025-05-21','2025-06-20','2025-06-29','2025-07-16','2025-08-15','2025-09-18','2025-09-19','2025-10-12','2025-10-31','2025-11-01','2025-11-16','2025-12-08','2025-12-14','2025-12-25',
 '2026-01-01','2026-04-03','2026-04-04','2026-05-01','2026-05-21','2026-06-21','2026-06-29','2026-07-16','2026-08-15','2026-09-18','2026-09-19','2026-10-12','2026-10-31','2026-11-01','2026-12-08','2026-12-25',
 '2027-01-01','2027-03-26','2027-03-27','2027-05-01','2027-05-21','2027-06-21','2027-06-28','2027-07-16','2027-08-15','2027-09-17','2027-09-18','2027-09-19','2027-10-11','2027-10-31','2027-11-01','2027-12-08','2027-12-25']);
const isoOk=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'');
// Días hábiles (lunes a viernes, sin feriados) entre dos fechas, ambas incluidas.
function businessDays(a,b,holidays=FERIADOS_CL){
 if(!isoOk(a)||!isoOk(b)||b<a)return 0;
 let n=0;for(let d=new Date(a+'T12:00:00Z');d.toISOString().slice(0,10)<=b;d.setUTCDate(d.getUTCDate()+1)){const w=d.getUTCDay(),k=d.toISOString().slice(0,10);if(w!==0&&w!==6&&!holidays.has(k))n++;}return n;
}
// Meses completos trabajados entre el ingreso y una fecha.
function monthsWorked(from,to){
 if(!isoOk(from)||!to||to<from)return 0;
 let m=(Number(to.slice(0,4))-Number(from.slice(0,4)))*12+Number(to.slice(5,7))-Number(from.slice(5,7));if(Number(to.slice(8,10))<Number(from.slice(8,10)))m--;return Math.max(0,m);
}
const addYears=(iso,k)=>(Number(iso.slice(0,4))+k)+iso.slice(4);
// Feriado legal (art. 67 y 68 CT): 15 días hábiles por año (1,25 por mes) + feriado progresivo:
// con 10 años cotizados (máximo 10 con empleadores anteriores), un día más por cada 3 años nuevos con este empleador.
function vacation(worker,events,asOf){
 const end=worker.fecha_termino&&worker.fecha_termino<asOf?worker.fecha_termino:asOf,base=Number(worker.dias_vacaciones_anuales)||15;
 const meses=monthsWorked(worker.fecha_ingreso,end),anios=Math.floor(meses/12),previos=Math.min(10,Number(worker.anios_previos)||0);
 const progresivo=previos+anios>=10&&previos>0?Math.floor((previos+anios-10)/3):0,anual=base+progresivo;
 const devengado=Math.round(meses*anual/12*100)/100,inicial=Number(worker.vacaciones_saldo_inicial)||0;
 const own=(events||[]).filter(e=>e.trabajador_id===worker.trabajador_id),sum=t=>own.filter(e=>e.tipo===t).reduce((a,e)=>a+(Number(e.dias)||0),0);
 const tomado=sum('VACACIONES'),saldo=Math.round((inicial+devengado-tomado)*100)/100;
 // Períodos (años laborales): cuánto se ganó y cuánto se tomó en cada uno.
 const periodos=[];if(isoOk(worker.fecha_ingreso)){for(let k=0;k<=anios;k++){const desde=addYears(worker.fecha_ingreso,k),hasta=addYears(worker.fecha_ingreso,k+1);if(desde>end)break;
  const completo=hasta<=end,gan=completo?anual:Math.round(monthsWorked(desde,end)*anual/12*100)/100;
  periodos.push({n:k+1,desde,hasta,completo,ganado:gan,tomado:own.filter(e=>e.tipo==='VACACIONES'&&e.desde>=desde&&e.desde<hasta).reduce((a,e)=>a+(Number(e.dias)||0),0)});}}
 const sueldo=Number(worker.sueldo_base)||0,valorDia=sueldo/30;
 return {meses,anios,anual,base,progresivo,devengado,inicial,tomado,saldo,periodos,acumulaExceso:saldo>anual*2,
  valorPendiente:Math.round(Math.max(0,saldo)*7/5*valorDia),licencia:sum('LICENCIA'),permiso:sum('PERMISO'),ausencia:sum('AUSENCIA')};
}
const antiguedad=m=>`${Math.floor(m/12)} año${Math.floor(m/12)===1?'':'s'} y ${m%12} mes${m%12===1?'':'es'}`;
// Histórico por año: totales por componente, devengado, pagado y saldo acumulado mes a mes.
function history(ms){
 let acc=0;const rows=ms.map(r=>{acc+=r.saldo;return {...r,acumulado:acc};}),years={};
 rows.forEach(r=>{const y=r.periodo.slice(0,4),t=years[y]=years[y]||{anio:y,meses:0,devengado:0,pagado:0,comps:{}};t.meses++;t.devengado+=r.devengado;t.pagado+=r.pagado;Object.values(r.lines).forEach(l=>{t.comps[l.componente]=(t.comps[l.componente]||0)+l.monto;});});
 return {rows,years:Object.values(years).sort((a,b)=>a.anio.localeCompare(b.anio))};
}
const api={months,pendingByLiq,fifo,combos,matchPlanilla,businessDays,monthsWorked,vacation,history,FERIADOS_CL,OBLIGS};
if(typeof module!=='undefined')module.exports=api;
if(!root.document)return;

// ---------- Vista ----------
let config,s;
function reset(){config=null;s=null;document.querySelectorAll('[data-lq-dialog]').forEach(d=>d.remove());}
function setup(options={}){config=options;s={ob:'JT',tab:'meses',data:null,loading:false,message:'',busy:false,search:'',month:''};}
function markup(){return '<section id="oc-liq" class="oc-card"></section>';}
function mount(parent){const el=parent.querySelector('#oc-liq');if(!el||!s)return;if(!s.data&&!s.loading)load(el);else draw(el);}
const call=(a,p)=>config.call(a,p);
const O=()=>OBLIGS[s.ob];
const movements=()=>(root.OCCajaNueva?.snapshot()?.movements)||[];
const allLiqs=()=>s.data?.liquidaciones||[];
const liqs=()=>allLiqs().filter(l=>String(l.persona).toUpperCase()===s.ob);
const imps=()=>(s.data?.imputaciones||[]).filter(i=>String(i.persona||'JT').toUpperCase()===s.ob);
const conceptOf=ob=>s.data?.obligaciones?.[ob]?.concept||(ob==='JT'?'SUELDO_JT':ob==='CYC'?'C&C':ob);
const cashAccount=()=>(config.accountsInfo?config.accountsInfo():[]).find(a=>/caja|efectivo/i.test(a.name));
async function load(el){
 s.loading=true;s.message='Cargando liquidaciones…';draw(el);
 try{s.data=await call('liqLoad',{});s.message='';}catch(e){s.message=e.message;}
 s.loading=false;draw(el);
}
async function act(el,fn,ok){
 if(s.busy)return false;s.busy=true;s.message='Guardando…';draw(el);
 try{const r=await fn();if(r&&r.liquidaciones)s.data={...s.data,...r,movement:undefined};s.message=ok||'Guardado.';return r||true;}
 catch(e){s.message=e.message;return false;}
 finally{s.busy=false;draw(el);}
}
function draw(el){
 const ms=months(liqs(),imps()),tot=ms.reduce((a,r)=>({dev:a.dev+r.devengado,pag:a.pag+r.pagado}),{dev:0,pag:0});
 const tabs=[['meses','Por mes'],['historico','Histórico'],['pagos','Pagos imputados'],['planilla','Planilla vs caja'],['buscar','Buscar egresos']];
 const obTabs=`<div class="oc-tabs lq-obligs">${Object.entries(OBLIGS).map(([k,o])=>`<button class="oc-tab${s.ob===k?' active':''}" data-lq-ob="${k}">${esc(o.label)}</button>`).join('')}<button class="oc-tab${s.ob==='RRHH'?' active':''}" data-lq-ob="RRHH">RRHH · personas y vacaciones</button></div>`;
 if(s.ob==='RRHH'){el.innerHTML=`<p class="oc-eyebrow">RECURSOS HUMANOS · SOLO ALEX</p>${obTabs}${s.message?`<p role="status">${esc(s.message)}</p>`:''}${s.data?viewRrhh():''}`;wire(el);return;}
 el.innerHTML=`<p class="oc-eyebrow">LIQUIDACIONES Y PAGOS FIJOS · SOLO ALEX</p>
 ${obTabs}
 <h2>${esc(O().label)}: lo que se debe y lo que se pagó</h2><p>${esc(O().intro)} Cada pago de la caja se reparte entre los meses y componentes que cubre.</p>
 ${s.message?`<p role="status">${esc(s.message)}</p>`:''}
 ${s.data?`<div class="lq-kpis"><div><small>Devengado</small><b>${money(tot.dev)}</b></div><div><small>Pagado (imputado)</small><b>${money(tot.pag)}</b></div><div><small>Por pagar</small><b class="${tot.dev-tot.pag>0?'cn-bad':'cn-ok'}">${money(tot.dev-tot.pag)}</b></div></div>
 <div class="oc-tabs">${tabs.map(([k,l])=>`<button class="oc-tab${s.tab===k?' active':''}" data-lq-tab="${k}">${l}</button>`).join('')}</div>
 ${s.tab==='meses'?viewMonths(ms):s.tab==='historico'?viewHistory(ms):s.tab==='pagos'?viewPaid():s.tab==='planilla'?viewPlanilla():viewSearch()}`:''}`;
 wire(el);
}
function viewMonths(ms){
 const comps=O().comps;
 return `<p>${comps.filter(c=>c[2]!==null).map(c=>`<button data-lq-seed="${c[0]}"${s.busy?' disabled':''}>Generar ${esc(c[1].toLowerCase())} de meses faltantes</button>`).join(' ')} <button id="lq-new"${s.busy?' disabled':''}>Agregar línea</button></p>
 ${ms.length?`<div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Mes</th>${comps.map(c=>`<th>${esc(c[1])}</th>`).join('')}<th>Devengado</th><th>Pagado</th><th>Saldo</th></tr></thead><tbody>
 ${ms.map(r=>`<tr><td><b>${esc(perLabel(r.periodo))}</b></td>${comps.map(c=>`<td>${cell(r,c[0])}</td>`).join('')}<td>${money(r.devengado)}</td><td>${money(r.pagado)}</td><td class="${r.saldo>0?'cn-bad':r.saldo<0?'cn-warn':'cn-ok'}">${r.saldo===0?'✓':money(r.saldo)}</td></tr>`).join('')}
 </tbody></table></div><p><small>Toca un monto para editarlo ese mes. Saldo rojo = falta pagar o imputar; negativo = se imputó más de lo devengado.</small></p>`
 :`<p>Aún no hay líneas. Genera ${esc(comps[0][1].toLowerCase())} desde el primer mes.</p>`}`;
}
function viewHistory(ms){
 const comps=O().comps,h=history(ms);
 if(!ms.length)return '<p>Aún no hay líneas para armar el histórico.</p>';
 const max=Math.max(1,...h.rows.map(r=>Math.max(r.devengado,r.pagado))),W=Math.max(320,h.rows.length*46),H=150,colors=['#2f5f8a','#36765a','#b07a1f','#7d5ba6'];
 const bars=h.rows.map((r,i)=>{let y=H-18;const x=i*46+10;const segs=comps.map((c,k)=>{const v=r.lines[c[0]]?.monto||0,hh=v/max*(H-30);y-=hh;return v?`<rect x="${x}" y="${y}" width="16" height="${hh}" fill="${colors[k%4]}"><title>${esc(c[1])} ${esc(perLabel(r.periodo))}: ${money(v)}</title></rect>`:'';}).join('');
  const ph=r.pagado/max*(H-30);return segs+`<rect x="${x+18}" y="${H-18-ph}" width="12" height="${ph}" fill="#9aa5b1"><title>Pagado ${esc(perLabel(r.periodo))}: ${money(r.pagado)}</title></rect><text x="${x+14}" y="${H-4}" font-size="10" text-anchor="middle" fill="currentColor">${esc(perLabel(r.periodo))}</text>`;}).join('');
 return `<div class="lq-kpis">${h.years.map(y=>`<div><small>${esc(y.anio)} · ${y.meses} meses</small><b>${money(y.devengado)}</b><small>${comps.map(c=>`${esc(c[1])} ${money(y.comps[c[0]]||0)}`).join(' · ')} · pagado ${money(y.pagado)}</small></div>`).join('')}</div>
 <div class="oc-table-scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Costo mensual por componente y pagado">${bars}</svg></div>
 <p><small>${comps.map((c,k)=>`<span style="color:${colors[k%4]}">■</span> ${esc(c[1])}`).join(' · ')} · <span style="color:#9aa5b1">■</span> Pagado</small></p>
 <div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Mes</th>${comps.map(c=>`<th>${esc(c[1])}</th>`).join('')}<th>Total</th><th>Pagado</th><th>Saldo del mes</th><th>Saldo acumulado</th></tr></thead><tbody>
 ${h.rows.map(r=>`<tr><td><b>${esc(perLabel(r.periodo))}</b></td>${comps.map(c=>`<td>${r.lines[c[0]]?money(r.lines[c[0]].monto):'—'}</td>`).join('')}<td>${money(r.devengado)}</td><td>${money(r.pagado)}</td><td>${r.saldo===0?'✓':money(r.saldo)}</td><td class="${r.acumulado>0?'cn-bad':r.acumulado<0?'cn-warn':'cn-ok'}">${money(r.acumulado)}</td></tr>`).join('')}
 </tbody></table></div><p><small>Saldo acumulado positivo = se debe; negativo = se pagó (imputó) por adelantado.</small></p>`;
}
const workers=()=>s.data?.trabajadores||[];
const events=()=>s.data?.eventos||[];
const EVT={VACACIONES:'Vacaciones',LICENCIA:'Licencia médica',PERMISO:'Permiso',AUSENCIA:'Ausencia',OTRO:'Otro'};
function viewRrhh(){
 const ws=workers(),t=today();
 if(!ws.length)return `<p>Ficha de cada trabajador con sus datos de contrato, vacaciones (15 días hábiles al año, 1,25 por mes trabajado, más feriado progresivo), licencias y permisos.</p>
  <p><button data-rr-new="JT">Crear ficha de José Tomás Molina (JT)</button> <button data-rr-new="">Agregar otro trabajador</button></p>`;
 const now=events().filter(e=>e.desde<=addDaysIso(t,30)&&e.hasta>=t).sort((a,b)=>a.desde.localeCompare(b.desde));
 return (now.length?`<div class="oc-card"><h3>Ausencias en curso y próximas (30 días)</h3><ul>${now.map(e=>`<li>${esc(workers().find(w=>w.trabajador_id===e.trabajador_id)?.nombre||'')} · ${esc(EVT[e.tipo]||e.tipo)} · ${esc(fmtDate(e.desde))} al ${esc(fmtDate(e.hasta))} (${e.dias} días)${e.desde<=t?' · <b>en curso</b>':''}</li>`).join('')}</ul></div>`:'')+
 ws.map(w=>{const v=vacation(w,events(),t),ev=events().filter(e=>e.trabajador_id===w.trabajador_id).sort((a,b)=>b.desde.localeCompare(a.desde));
  const docs=String(w.documentos||'').split('\n').map(l=>l.split('|').map(x=>x.trim())).filter(x=>x[0]);
  return `<article class="oc-card"><h2>${esc(w.nombre)}</h2><p><small>${[w.cargo,w.rut&&'RUT '+w.rut,w.tipo_contrato,w.jornada,w.fecha_ingreso&&'Ingreso '+fmtDate(w.fecha_ingreso),w.fecha_ingreso&&'Antigüedad '+antiguedad(v.meses),w.fecha_termino&&'Término '+fmtDate(w.fecha_termino)].filter(Boolean).map(esc).join(' · ')}</small></p>
  <p><small>${[w.afp&&'AFP '+w.afp,w.salud&&'Salud '+w.salud,w.sueldo_base!==''&&w.sueldo_base!==undefined&&'Sueldo base '+money(Number(w.sueldo_base)),w.banco&&w.banco+(w.cuenta?' '+w.cuenta:''),w.email,w.telefono].filter(Boolean).map(esc).join(' · ')}</small></p>
  <div class="lq-kpis"><div><small>Vacaciones disponibles</small><b class="${v.saldo<0||v.acumulaExceso?'cn-bad':'cn-ok'}">${v.saldo} días hábiles</b><small>${v.inicial?v.inicial+' iniciales + ':''}${v.devengado} ganados (${v.meses} meses × ${v.anual}/12) − ${v.tomado} tomados</small></div>
  <div><small>Días por año</small><b>${v.anual}</b><small>${v.base} legales${v.progresivo?` + ${v.progresivo} progresivos`:''}</small></div>
  <div><small>Valor referencial de lo pendiente</small><b>${money(v.valorPendiente)}</b><small>saldo × 7/5 días corridos × sueldo/30</small></div>
  <div><small>Licencias · permisos · ausencias</small><b>${v.licencia} · ${v.permiso} · ${v.ausencia}</b><small>días</small></div></div>
  ${w.fecha_ingreso?'':'<p class="cn-bad"><small>Falta la fecha de ingreso: sin ella no se calculan las vacaciones.</small></p>'}
  ${v.acumulaExceso?`<p class="cn-bad"><small>Acumula más de dos períodos de vacaciones (${v.saldo} días). El Código del Trabajo permite acumular hasta dos: conviene programar vacaciones.</small></p>`:''}
  <p><button data-rr-edit="${esc(w.trabajador_id)}">Editar ficha</button> <button data-rr-evt="${esc(w.trabajador_id)}">Registrar vacaciones / licencia / permiso</button></p>
  ${v.periodos.length?`<details><summary>Vacaciones por período</summary><div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Período</th><th>Desde</th><th>Hasta</th><th>Ganados</th><th>Tomados</th></tr></thead><tbody>${v.periodos.map(p=>`<tr><td>${p.n}${p.completo?'':' (en curso)'}</td><td>${esc(fmtDate(p.desde))}</td><td>${esc(fmtDate(p.hasta))}</td><td>${p.ganado}</td><td>${p.tomado}</td></tr>`).join('')}</tbody></table></div></details>`:''}
  ${ev.length?`<div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Días</th><th>Nota</th><th></th></tr></thead><tbody>${ev.map(e=>`<tr><td>${esc(EVT[e.tipo]||e.tipo)}</td><td>${esc(fmtDate(e.desde))}</td><td>${esc(fmtDate(e.hasta))}</td><td>${e.dias}</td><td>${esc(e.nota)}</td><td><button class="lq-link" data-rr-evedit="${esc(e.evento_id)}">editar</button>${e.tipo==='VACACIONES'?` <button class="lq-link" data-rr-comp="${esc(e.evento_id)}">comprobante</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p><small>Sin vacaciones ni licencias registradas.</small></p>'}
  ${docs.length?`<p><small>Documentos: ${docs.map(d=>/^https?:\/\//.test(d[1]||'')?`<a href="${esc(d[1])}" target="_blank" rel="noopener">${esc(d[0])}</a>`:esc(d.join(' '))).join(' · ')}</small></p>`:''}
  ${w.notas?`<p><small>${esc(w.notas)}</small></p>`:''}</article>`;}).join('')+`<p><button data-rr-new="">Agregar trabajador</button></p>`;
}
function addDaysIso(iso,k){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+k);return d.toISOString().slice(0,10);}
// Comprobante de feriado (art. 67 CT): documento para imprimir y firmar por ambas partes.
function comprobante(ev){
 const w=workers().find(x=>x.trabajador_id===ev.trabajador_id);if(!w)return;
 const evs=events().filter(e=>e.trabajador_id===w.trabajador_id&&e.evento_id!==ev.evento_id&&e.desde<=ev.desde),before=vacation(w,evs,ev.desde),after=Math.round((before.saldo-Number(ev.dias))*100)/100;
 const win=window.open('','_blank');if(!win){s.message='El navegador bloqueó la ventana del comprobante.';return;}
 win.document.write(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Comprobante de feriado · ${esc(w.nombre)}</title>
 <style>body{font:15px/1.6 Georgia,serif;max-width:680px;margin:40px auto;padding:0 20px;color:#111}h1{font-size:20px;text-align:center}td{padding:4px 8px;border-bottom:1px solid #ddd}.f{display:flex;justify-content:space-between;margin-top:90px}.f div{border-top:1px solid #111;width:42%;text-align:center;padding-top:6px}@media print{button{display:none}}</style>
 <h1>COMPROBANTE DE FERIADO LEGAL</h1><p>En Santiago, a ${esc(fmtDate(today()))}, se deja constancia de que el trabajador individualizado hace uso de su feriado legal:</p>
 <table><tr><td>Empleador</td><td>Oportuni Cars SpA · RUT 78.331.651-K</td></tr><tr><td>Trabajador</td><td>${esc(w.nombre)}${w.rut?' · RUT '+esc(w.rut):''}</td></tr><tr><td>Cargo</td><td>${esc(w.cargo||'')}</td></tr>
 <tr><td>Fecha de ingreso</td><td>${esc(fmtDate(w.fecha_ingreso))}</td></tr><tr><td>Período</td><td>${esc(fmtDate(ev.desde))} al ${esc(fmtDate(ev.hasta))}</td></tr><tr><td>Días hábiles</td><td>${ev.dias}</td></tr>
 <tr><td>Saldo antes</td><td>${before.saldo} días hábiles</td></tr><tr><td>Saldo después</td><td>${after} días hábiles</td></tr>${ev.nota?`<tr><td>Observación</td><td>${esc(ev.nota)}</td></tr>`:''}</table>
 <p>Retoma sus funciones el día hábil siguiente al término del período.</p><div class="f"><div>Empleador</div><div>Trabajador</div></div><p><button onclick="print()">Imprimir</button></p></html>`);
 win.document.close();
}
function workerDialog(el,w,preset){
 const v=w||preset||{},f=(k,l,type='text',extra='')=>`<label>${l}<input name="${k}" type="${type}" value="${esc(v[k]??'')}" ${extra}></label>`;
 const d=dialog(`<form><h2>${w?'Editar ficha':'Nueva ficha'}</h2><div class="oc-caja-form">
  ${f('nombre','Nombre','text','required maxlength="120"')}${f('rut','RUT')}${f('cargo','Cargo')}${f('fecha_ingreso','Fecha de ingreso','date','required')}${f('fecha_termino','Fecha de término','date')}
  <label>Tipo de contrato<select name="tipo_contrato">${['','Indefinido','Plazo fijo','Por obra','Honorarios'].map(o=>`<option${(v.tipo_contrato||'')===o?' selected':''}>${o}</option>`).join('')}</select></label>
  ${f('jornada','Jornada')}${f('afp','AFP')}${f('salud','Salud (Fonasa / Isapre)')}${f('sueldo_base','Sueldo base','number','min="0" step="1"')}
  ${f('dias_vacaciones_anuales','Días de vacaciones al año','number','min="0" step="0.5" placeholder="15"')}${f('vacaciones_saldo_inicial','Saldo inicial de vacaciones (días)','number','min="0" step="0.5"')}${f('anios_previos','Años cotizados con empleadores anteriores (feriado progresivo)','number','min="0" max="40" step="1"')}
  <label>Liga con sueldos<select name="persona_liq"><option value="">—</option>${Object.entries(OBLIGS).filter(([k])=>k==='JT').map(([k,o])=>`<option value="${k}"${v.persona_liq===k?' selected':''}>${esc(o.label)}</option>`).join('')}</select></label>
  ${f('email','Correo','email')}${f('telefono','Teléfono')}${f('banco','Banco')}${f('cuenta','Cuenta')}
  <label>Notas<input name="notas" maxlength="1000" value="${esc(v.notas||'')}"></label>
  <label>Documentos (uno por línea: nombre | enlace)<textarea name="documentos" rows="3" maxlength="3000" placeholder="Contrato | https://drive.google.com/...">${esc(v.documentos||'')}</textarea></label></div>
  <p role="status"></p><button type="submit">Guardar</button> <button type="button" data-lq-cancel>Cancelar</button></form>`);
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const r=Object.fromEntries(new FormData(e.target));d.close();
  await act(el,()=>call('rrhhSave',{expectedVersion:w?w.version:0,record:{...r,trabajador_id:w?.trabajador_id||''}}),'Ficha guardada.');};
}
function eventDialog(el,workerId,ev){
 const v=ev||{tipo:'VACACIONES',desde:today(),hasta:today(),dias:businessDays(today(),today())};
 const d=dialog(`<form><h2>${ev?'Editar':'Registrar'} · ${esc(workers().find(w=>w.trabajador_id===workerId)?.nombre||'')}</h2><div class="oc-caja-form">
  <label>Tipo<select name="tipo">${Object.entries(EVT).map(([k,l])=>`<option value="${k}"${v.tipo===k?' selected':''}>${l}</option>`).join('')}</select></label>
  <label>Desde<input name="desde" type="date" required value="${esc(v.desde)}"></label><label>Hasta<input name="hasta" type="date" required value="${esc(v.hasta)}"></label>
  <label>Días<input name="dias" type="number" min="0" step="0.5" required value="${esc(v.dias)}"></label>
  <label>Nota<input name="nota" maxlength="300" value="${esc(v.nota||'')}"></label></div>
  <p><small>Vacaciones: se cuentan días hábiles (lunes a viernes, sin feriados legales). Licencias, permisos y ausencias: días corridos. Puedes corregir los días a mano.</small></p>
  <p role="status"></p><button type="submit">Guardar</button> <button type="button" data-lq-cancel>Cancelar</button>${ev?' <button type="button" id="rr-void" class="oc-danger">Anular</button>':''}</form>`);
 const fm=d.querySelector('form'),upd=()=>{const a=fm.desde.value,b=fm.hasta.value;if(fm.tipo.value==='VACACIONES')fm.dias.value=businessDays(a,b);else if(a&&b&&b>=a)fm.dias.value=Math.round((Date.parse(b)-Date.parse(a))/864e5)+1;};
 fm.desde.onchange=()=>{if(fm.hasta.value<fm.desde.value)fm.hasta.value=fm.desde.value;upd();};fm.hasta.onchange=upd;fm.tipo.onchange=upd;
 fm.onsubmit=async e=>{e.preventDefault();const r=Object.fromEntries(new FormData(fm));d.close();
  await act(el,()=>call('rrhhEvent',{expectedVersion:ev?ev.version:0,record:{...r,dias:Number(r.dias),trabajador_id:workerId,evento_id:ev?.evento_id||''}}),'Registrado.');};
 const vd=d.querySelector('#rr-void');if(vd)vd.onclick=async()=>{if(!confirm('¿Anular este registro?'))return;d.close();await act(el,()=>call('rrhhVoid',{id:ev.evento_id,expectedVersion:ev.version}),'Registro anulado.');};
}
function cell(r,comp){const l=r.lines[comp];return l?`<button class="lq-link" data-lq-edit="${esc(l.liquidacion_id)}">${money(l.monto)}</button>`:`<button class="lq-link lq-empty" data-lq-add="${esc(r.periodo)}|${comp}">+ agregar</button>`;}
function byMovement(){const g={};imps().forEach(i=>{(g[i.movimiento_id]=g[i.movimiento_id]||[]).push(i);});return g;}
function liqName(id){const l=allLiqs().find(x=>x.liquidacion_id===id);if(!l)return id;const c=(OBLIGS[l.persona]?.comps||[]).find(x=>x[0]===l.componente);return (c?c[1]:l.componente)+' '+perLabel(l.periodo);}
function moveRow(m,extra=''){return `<article class="oc-caja-row"><div><small>${esc(m.account)} · ${esc(fmtDate(m.date))}${m.classification?' · '+esc(m.classification.name):''}${m.direction?'':' · sin dirección'}</small><h3>${esc(m.description)}</h3><strong class="oc-amount oc-out">−${money(m.amount)}</strong>${extra}</div><div><button data-lq-alloc="${esc(m.id)}"${s.busy?' disabled':''}>Imputar</button></div></article>`;}
function viewPaid(){
 const g=byMovement(),ms=movements(),cid=conceptOf(s.ob);
 const imputed=ms.filter(m=>g[m.id]).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
 const otherImp=new Set((s.data?.imputaciones||[]).map(i=>i.movimiento_id));
 const open=ms.filter(m=>!otherImp.has(m.id)&&isOut(m)&&m.classification?.id===cid);
 const lost=Object.keys(g).filter(id=>!ms.some(m=>m.id===id));
 return `${open.length?`<h3>Clasificados como ${esc(O().label)} sin imputar (${open.length})</h3><div class="oc-caja-list">${open.map(m=>moveRow(m)).join('')}</div>`:''}
 <h3>Imputados (${imputed.length})</h3>${imputed.length?`<div class="oc-caja-list">${imputed.map(m=>{const sum=g[m.id].reduce((a,i)=>a+i.monto,0);return moveRow(m,`<small>${g[m.id].map(i=>esc(liqName(i.liquidacion_id))+': '+money(i.monto)).join(' · ')}${sum!==m.amount?` · <b class="cn-bad">sin repartir ${money(m.amount-sum)}</b>`:''}</small>`);}).join('')}</div>`:'<p>Todavía no hay pagos imputados. Usa «Planilla vs caja» o «Buscar egresos».</p>'}
 ${lost.length?`<p class="cn-bad"><small>${lost.length} imputación(es) apuntan a movimientos anulados: ${lost.map(esc).join(', ')}.</small></p>`:''}
 <p><button id="lq-cash"${s.busy?' disabled':''}>Registrar pago en efectivo</button></p>`;
}
function comboLabel(c){return c.map(m=>`${esc(m.account)} · ${esc(fmtDate(m.date))} · ${money(m.amount)}${m.classification?' · '+esc(m.classification.name):''}`).join(' + ');}
function comboButtons(c){return c.map(m=>`<button data-lq-alloc="${esc(m.id)}">${c.length>1?'Imputar '+money(m.amount):'Imputar'}</button>`).join(' ');}
function viewPlanilla(){
 const imputed=new Set((s.data?.imputaciones||[]).map(i=>i.movimiento_id)),rows=matchPlanilla(O().planilla,movements(),imputed);
 const ok=rows.filter(r=>r.hit).length;
 return `<p>Pagos según la planilla de flujo. Cada uno debe existir en alguna cuenta (solo o sumando varios egresos) e imputarse; si no aparece, se registra como pago en efectivo. ${ok}/${rows.length} listos.</p>
 <div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Fila</th><th>Mes</th><th>Monto</th><th>Origen planilla</th><th>En la caja</th></tr></thead><tbody>
 ${rows.map(r=>`<tr><td>${r.n}</td><td>${esc(r.dia?fmtDate(r.dia):perLabel(r.mes))}</td><td>${money(r.monto)}</td><td>${esc(r.origen)}</td><td>${r.hit?`<span class="oc-chip">✓ ${esc(r.hit.account)} · ${esc(fmtDate(r.hit.date))}</span> <button class="lq-link" data-lq-alloc="${esc(r.hit.id)}">ver reparto</button>`
  :r.candidates.length?r.candidates.slice(0,3).map(c=>`<div class="lq-cand"><small>${c.length>1?'Suma: ':''}${comboLabel(c)}</small> ${comboButtons(c)}</div>`).join('')+` <button class="lq-link" data-lq-cashrow="${r.n}">o registrar en efectivo</button>`
  :`<span class="oc-chip oc-chip-bad">No está en ninguna cuenta</span> <button data-lq-cashrow="${r.n}">Registrar en efectivo</button>`}</td></tr>`).join('')}
 </tbody></table></div><p><small>Coincidencia por monto exacto (un egreso o la suma de 2–3 egresos dentro de 7 días) y fecha ±30 días del mes (±4 días si la planilla tiene día). Revisa antes de imputar.</small></p>`;
}
function viewSearch(){
 const q=Number(String(s.search).replace(/\D/g,'')),g=new Set((s.data?.imputaciones||[]).map(i=>i.movimiento_id));
 const center=s.month?s.month+'-15':null,win=s.month?30:4000;
 const res=q?combos(movements(),q,center||today(),win,{limit:20,maxk:s.month?3:1}):[];
 return `<div class="oc-caja-form"><label>Monto exacto<input id="lq-q" inputmode="numeric" value="${esc(s.search)}" placeholder="2142000"></label><label>Mes (para buscar sumas)<input id="lq-m" type="month" value="${esc(s.month)}"></label></div>
 ${q?(res.length?`<div class="oc-caja-list">${res.map(c=>c.length===1?moveRow(c[0],g.has(c[0].id)?'<small>Ya imputado</small>':''):`<article class="oc-caja-row"><div><small>Suma de ${c.length} egresos</small><h3>${comboLabel(c)}</h3><strong class="oc-amount oc-out">−${money(q)}</strong></div><div>${comboButtons(c)}</div></article>`).join('')}</div>`:'<p>No hay egresos (ni sumas) con ese monto.</p>'):'<p>Busca en todas las cuentas egresos de ese monto. Con un mes elegido busca también sumas de 2 o 3 egresos cercanos.</p>'}`;
}
function dialog(html){
 const d=document.createElement('dialog');d.className='oc-dialog';d.dataset.lqDialog='';d.innerHTML=html;document.body.append(d);
 d.addEventListener('close',()=>d.remove());d.showModal();const c=d.querySelector('[data-lq-cancel]');if(c)c.onclick=()=>d.close();return d;
}
function lineDialog(el,l,preset){
 const comps=O().comps,per=l?l.periodo:preset?.periodo||addMonths(today().slice(0,7),-1),comp=l?l.componente:preset?.componente||comps[comps.length-1][0];
 const def=(comps.find(c=>c[0]===comp)||[])[2];
 const d=dialog(`<form><h2>${l?'Editar':'Agregar'} línea · ${esc(O().label)}</h2><div class="oc-caja-form">
  <label>Mes<input name="periodo" type="month" required value="${esc(per)}"${l?' disabled':''}></label>
  <label>Componente<select name="componente"${l?' disabled':''}>${comps.map(c=>`<option value="${c[0]}"${comp===c[0]?' selected':''}>${esc(c[1])}</option>`).join('')}</select></label>
  <label>Monto<input name="monto" type="number" min="0" step="1" inputmode="numeric" required value="${l?l.monto:def??''}"></label>
  <label>Nota<input name="nota" maxlength="300" value="${esc(l?.nota||'')}" placeholder="Cómo se calculó, acuerdo, etc."></label></div>
  <p role="status"></p><button type="submit">Guardar</button> <button type="button" data-lq-cancel>Cancelar</button>${l?` <button type="button" id="lq-void" class="oc-danger">Anular línea</button>`:''}</form>`);
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));d.close();
  await act(el,()=>call('liqSave',{expectedVersion:l?l.version:0,record:{liquidacion_id:l?.liquidacion_id||'',persona:s.ob,periodo:l?l.periodo:f.periodo,componente:l?l.componente:f.componente,monto:Number(f.monto),nota:f.nota}}),'Línea guardada.');};
 const v=d.querySelector('#lq-void');if(v)v.onclick=async()=>{if(!confirm('¿Anular esta línea?'))return;d.close();await act(el,()=>call('liqVoid',{id:l.liquidacion_id,expectedVersion:l.version}),'Línea anulada.');};
}
function seedDialog(el,comp){
 const c=O().comps.find(x=>x[0]===comp),ms=liqs().map(l=>l.periodo).sort();
 const d=dialog(`<form><h2>Generar ${esc(c[1].toLowerCase())}</h2><p>Crea la línea «${esc(c[1])}» en cada mes que aún no la tiene, con el mismo monto. No modifica meses existentes; después puedes cambiar cualquier mes a mano.</p><div class="oc-caja-form">
  <label>Desde<input name="desde" type="month" required value="${esc(ms[0]||O().planilla[0]?.mes||'2025-11')}"></label><label>Hasta<input name="hasta" type="month" required value="${esc(addMonths(today().slice(0,7),-1))}"></label>
  <label>Monto mensual<input name="base" type="number" min="0" step="1" required value="${c[2]??''}"></label></div>
  <button type="submit">Generar</button> <button type="button" data-lq-cancel>Cancelar</button></form>`);
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));d.close();
  await act(el,()=>call('liqSeed',{persona:s.ob,componente:comp,desde:f.desde,hasta:f.hasta,base:Number(f.base)}),'Líneas generadas.');};
}
function allocDialog(el,m){
 if(!m){s.message='Movimiento no encontrado.';draw(el);return;}
 const otherOb=(s.data?.imputaciones||[]).find(i=>i.movimiento_id===m.id&&String(i.persona||'JT').toUpperCase()!==s.ob);
 if(otherOb){s.message='Ese pago ya está imputado a '+(OBLIGS[String(otherOb.persona).toUpperCase()]?.label||otherOb.persona)+'.';draw(el);return;}
 const current={};imps().filter(i=>i.movimiento_id===m.id).forEach(i=>{current[i.liquidacion_id]=i.monto;});
 const pend=pendingByLiq(liqs(),imps(),m.id).sort((a,b)=>a.periodo.localeCompare(b.periodo)||compOrder(s.ob,a.componente)-compOrder(s.ob,b.componente));
 const preset=Object.keys(current).length?current:fifo(pend,m.amount,s.ob);
 const rows=pend.filter(l=>l.pendiente>0||preset[l.liquidacion_id]);
 const comps=O().comps,lastComp=comps.find(c=>c[0]==='VARIABLE')||comps[comps.length-1];
 const d=dialog(`<form class="lq-alloc"><h2>Imputar pago · ${esc(O().label)}</h2><p>${esc(m.account)} · ${esc(fmtDate(m.date))} · ${esc(m.description)} · <b>${money(m.amount)}</b></p>
  ${rows.length?`<div class="oc-table-scroll"><table class="lq-table"><thead><tr><th>Línea</th><th>Pendiente</th><th>Imputar</th></tr></thead><tbody>${rows.map(l=>`<tr><td>${esc(liqName(l.liquidacion_id))}</td><td>${money(l.pendiente)}</td><td><input type="number" min="0" step="1" inputmode="numeric" data-lq-amt="${esc(l.liquidacion_id)}" value="${preset[l.liquidacion_id]||''}"></td></tr>`).join('')}</tbody></table></div>`:'<p>No hay líneas pendientes. Agrega la línea del mes primero.</p>'}
  <details><summary>Agregar una línea de un mes y cargarle parte de este pago</summary><div class="oc-caja-form"><label>Mes<input type="month" id="lq-nv-per" value="${esc(addMonths((m.date||today()).slice(0,7),s.ob==='JT'?-1:0))}"></label><label>Componente<select id="lq-nv-comp">${comps.map(c=>`<option value="${c[0]}"${c===lastComp?' selected':''}>${esc(c[1])}</option>`).join('')}</select></label><label>Monto<input type="number" min="1" step="1" id="lq-nv-amt"></label></div><button type="button" id="lq-nv">Crear línea</button></details>
  <p id="lq-sum"></p><p role="status"></p><button type="submit">Guardar reparto</button> <button type="button" data-lq-cancel>Cancelar</button>${Object.keys(current).length?' <button type="button" id="lq-clear" class="oc-danger">Quitar imputación</button>':''}
  ${m.classification?'':`<p><small>El movimiento no tiene concepto: quedará clasificado como «${esc(O().label)}» en la caja.</small></p>`}${m.direction==='SALIDA'&&!m.directionInferred?'':'<p><small>El movimiento quedará marcado como egreso.</small></p>'}</form>`);
 const inputs=[...d.querySelectorAll('[data-lq-amt]')],sumEl=d.querySelector('#lq-sum');
 const total=()=>inputs.reduce((a,i)=>a+(Number(i.value)||0),0);
 const paint=()=>{const t=total(),diff=m.amount-t;sumEl.innerHTML=`Repartido ${money(t)} de ${money(m.amount)} ${diff===0?'<b class="cn-ok">· cuadra</b>':diff>0?`<b class="cn-warn">· quedan ${money(diff)} sin repartir</b>`:`<b class="cn-bad">· excede en ${money(-diff)}</b>`}`;};
 inputs.forEach(i=>i.oninput=paint);paint();
 const save=async items=>{d.close();
  const r=await act(el,async()=>{let mv=m;
   if(items.length&&(mv.direction!=='SALIDA'||mv.directionInferred)){if(!config.setDirection)throw Error('Falta conexión para fijar la dirección.');mv=await config.setDirection(mv,'SALIDA');root.OCCajaNueva?.addMovements([mv]);}
   return call('liqAllocate',{movementId:mv.id,expectedVersion:mv.version,items});},items.length?'Pago imputado.':'Imputación quitada.');
  if(r&&r.movement&&config.store){config.store.patchRaw(m.id,r.movement);const mm=config.store.mapped(m.id);if(mm)root.OCCajaNueva?.addMovements([mm]);draw(el);}};
 d.querySelector('form').onsubmit=e=>{e.preventDefault();if(total()>m.amount){d.querySelector('[role=status]').textContent='Lo repartido supera el monto del pago.';return;}
  save(inputs.filter(i=>Number(i.value)>0).map(i=>({liquidacionId:i.dataset.lqAmt,monto:Number(i.value)})));};
 const clr=d.querySelector('#lq-clear');if(clr)clr.onclick=()=>{if(confirm('¿Quitar toda la imputación de este pago?'))save([]);};
 d.querySelector('#lq-nv').onclick=async()=>{const per=d.querySelector('#lq-nv-per').value,comp=d.querySelector('#lq-nv-comp').value,amt=Number(d.querySelector('#lq-nv-amt').value);
  if(!per||!amt){d.querySelector('[role=status]').textContent='Indica mes y monto.';return;}
  d.close();const ok=await act(el,()=>call('liqSave',{expectedVersion:0,record:{persona:s.ob,periodo:per,componente:comp,monto:amt,nota:'Creado al imputar '+m.id}}),'Línea creada.');
  if(ok)allocDialog(el,movements().find(x=>x.id===m.id)||m);};
}
function cashDialog(el,row){
 const acc=cashAccount();if(!acc){s.message='No hay una cuenta de efectivo (CAJA) configurada.';draw(el);return;}
 if(!config.manualAdd){s.message='Registrar a mano requiere la conexión con Google.';draw(el);return;}
 const date=row?(row.dia||(row.mes+'-'+(row.mes===today().slice(0,7)?today().slice(8,10):'28'))):today();
 const d=dialog(`<form><h2>Pago en efectivo · ${esc(O().label)}</h2><p>Queda en la cuenta ${esc(acc.name)} con el concepto de la obligación y luego eliges qué meses cubre.</p><div class="oc-caja-form">
  <label>Fecha<input name="date" type="date" required max="${today()}" value="${esc(date>today()?today():date)}"></label>
  <label>Monto<input name="amount" type="number" min="1" step="1" required value="${row?row.monto:''}"></label>
  <label>Descripción<input name="description" maxlength="200" required value="${esc(O().label)}${row?' · planilla fila '+row.n:''} (efectivo)"></label></div>
  <p role="status"></p><button type="submit">Registrar</button> <button type="button" data-lq-cancel>Cancelar</button></form>`);
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),b=e.target.querySelector('[type=submit]');b.disabled=true;
  try{const saved=await config.manualAdd(acc.id,uid(),[{date:f.date,direction:'SALIDA',amount:Number(f.amount),description:f.description,conceptId:conceptOf(s.ob)}]);
   root.OCCajaNueva?.addMovements(saved);d.close();s.message='Pago en efectivo registrado.';draw(el);if(saved[0])allocDialog(el,saved[0]);}
  catch(err){d.querySelector('[role=status]').textContent=err.message;b.disabled=false;}};
}
function wire(el){
 el.querySelectorAll('[data-lq-ob]').forEach(b=>b.onclick=()=>{s.ob=b.dataset.lqOb;s.message='';draw(el);});
 el.querySelectorAll('[data-lq-tab]').forEach(b=>b.onclick=()=>{s.tab=b.dataset.lqTab;s.message='';draw(el);});
 el.querySelectorAll('[data-lq-seed]').forEach(b=>b.onclick=()=>seedDialog(el,b.dataset.lqSeed));
 const nw=el.querySelector('#lq-new');if(nw)nw.onclick=()=>lineDialog(el,null);
 el.querySelectorAll('[data-lq-edit]').forEach(b=>b.onclick=()=>lineDialog(el,liqs().find(l=>l.liquidacion_id===b.dataset.lqEdit)));
 el.querySelectorAll('[data-lq-add]').forEach(b=>b.onclick=()=>{const [periodo,componente]=b.dataset.lqAdd.split('|');lineDialog(el,null,{periodo,componente});});
 el.querySelectorAll('[data-lq-alloc]').forEach(b=>b.onclick=()=>allocDialog(el,movements().find(m=>m.id===b.dataset.lqAlloc)));
 el.querySelectorAll('[data-lq-cashrow]').forEach(b=>b.onclick=()=>cashDialog(el,O().planilla.find(r=>String(r.n)===b.dataset.lqCashrow)));
 const cash=el.querySelector('#lq-cash');if(cash)cash.onclick=()=>cashDialog(el,null);
 el.querySelectorAll('[data-rr-new]').forEach(b=>b.onclick=()=>workerDialog(el,null,b.dataset.rrNew==='JT'?{nombre:'José Tomás Molina Barros',rut:'17.088.502-3',persona_liq:'JT',sueldo_base:3000000,dias_vacaciones_anuales:15}:{dias_vacaciones_anuales:15}));
 el.querySelectorAll('[data-rr-edit]').forEach(b=>b.onclick=()=>workerDialog(el,workers().find(w=>w.trabajador_id===b.dataset.rrEdit)));
 el.querySelectorAll('[data-rr-evt]').forEach(b=>b.onclick=()=>eventDialog(el,b.dataset.rrEvt,null));
 el.querySelectorAll('[data-rr-comp]').forEach(b=>b.onclick=()=>{const e=events().find(x=>x.evento_id===b.dataset.rrComp);if(e)comprobante(e);});
 el.querySelectorAll('[data-rr-evedit]').forEach(b=>b.onclick=()=>{const e=events().find(x=>x.evento_id===b.dataset.rrEvedit);if(e)eventDialog(el,e.trabajador_id,e);});
 const q=el.querySelector('#lq-q');if(q)q.onchange=()=>{s.search=q.value;draw(el);};
 const mo=el.querySelector('#lq-m');if(mo)mo.onchange=()=>{s.month=mo.value;draw(el);};
}
root.OCLiquidaciones={...api,setup,reset,markup,mount};
})(typeof globalThis==='undefined'?this:globalThis);
