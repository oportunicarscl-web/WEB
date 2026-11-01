// Oportunicars · Correo gerencial semanal.
// Mismo archivo en la web (vista previa en «Correos») y en Apps Script (envío programado): así lo que Alex ve es lo que llega.
// Solo lectura gerencial: resultados, caja, inventario y capital. Nada operativo (pendientes, tareas, clasificación).
// Los números salen de OCSystemCore.reports(), igual que el Resumen gerencial.
(function(root){
'use strict';
const CASH_START='2026-10-15';
const DAY=86400000;
// Marca: marfil, tinta café, camel. Paleta de series validada (CVD): ingresos teal, salidas naranjo, aportes azul.
const C={bg:'#f6efe3',card:'#fffdf8',line:'#e3d6bf',ink:'#3b2f21',muted:'#786a58',camel:'#8c6d3f',camelSoft:'#eee1ca',
 inc:'#00897b',out:'#c9671a',cap:'#3d5fb0',ok:'#1c7a47',okBg:'#ccebd8',warn:'#8a5d00',warnBg:'#f7e6bf',bad:'#a23e38',badBg:'#f6d2cf',track:'#f3eee5'};
const HAND="'Caveat','Segoe Print','Bradley Hand',cursive";
const MONO="'IBM Plex Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace";
const SANS="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const DIAS=['','lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
const SECTIONS=[['semaforo','Semáforo de la semana'],['flujo','Flujo de caja por semana'],['ventas','Ventas y rentabilidad'],['caja','Caja y bancos'],['inventario','Inventario'],['precios','Autos para revisar precio'],['capital','Capital de los socios'],['gastos','Composición de gastos']];
const FREQUENCIES={SEMANAL:{weeks:1,label:'Semanal'},QUINCENAL:{weeks:2,label:'Cada 2 semanas'},MENSUAL:{weeks:4,label:'Cada 4 semanas'}};

const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
const isDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const addDays=(d,k)=>new Date(Date.parse(d+'T12:00:00Z')+k*DAY).toISOString().slice(0,10);
const between=(d,a,b)=>isDay(d)&&d>=a&&d<=b;
// Formato chileno sin depender de Intl (Apps Script no siempre trae es-CL).
function money(v){if(!Number.isFinite(v))return '—';const s=String(Math.round(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g,'.');return (v<0?'−':'')+'$'+s;}
function short(v){if(!Number.isFinite(v))return '—';const a=Math.abs(v),sg=v<0?'−':'';if(a>=1e6)return sg+'$'+(Math.round(a/1e5)/10).toString().replace('.',',')+'M';if(a>=1e3)return sg+'$'+Math.round(a/1e3)+'k';return sg+'$'+Math.round(a);}
const dm=d=>Number(d.slice(8,10))+' '+MESES[Number(d.slice(5,7))-1];
const pct=v=>Number.isFinite(v)?(Math.round(v*10)/10).toString().replace('.',',')+' %':'—';
const plural=(n,a,b)=>n===1?a:b;

// ---------- Configuración ----------
function defaults(){return {enabled:false,frequency:'SEMANAL',weekday:1,hour:8,recipients:[],subject:'Oportunicars · Resumen semanal',note:'',capitalRate:12,channel:'GMAIL',sections:SECTIONS.reduce((o,s)=>{o[s[0]]=true;return o;},{}),version:0};}
const EMAIL=/^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;
// Valida y normaliza (la usan el backend al guardar y la web antes de enviar).
function normalize(input){
 const c=Object.assign(defaults(),input||{}),out=defaults();
 out.enabled=c.enabled===true;
 if(!FREQUENCIES[c.frequency])throw Error('Frecuencia inválida.');out.frequency=c.frequency;
 const wd=Number(c.weekday);if(!Number.isInteger(wd)||wd<1||wd>7)throw Error('Día de envío inválido.');out.weekday=wd;
 const h=Number(c.hour);if(!Number.isInteger(h)||h<0||h>23)throw Error('Hora de envío inválida.');out.hour=h;
 const seen={};out.recipients=(Array.isArray(c.recipients)?c.recipients:[]).map(r=>({email:String(r&&r.email||'').trim().toLowerCase(),name:String(r&&r.name||'').trim().slice(0,60),active:!(r&&r.active===false)})).filter(r=>r.email).map(r=>{
  if(!EMAIL.test(r.email)||r.email.length>120)throw Error('Correo inválido: '+r.email);
  if(seen[r.email])throw Error('Correo repetido: '+r.email);seen[r.email]=1;return r;});
 if(out.recipients.length>25)throw Error('Máximo 25 destinatarios.');
 if(out.enabled&&!out.recipients.some(r=>r.active))throw Error('Para activar el envío agrega al menos un destinatario activo.');
 out.subject=String(c.subject||'').trim().slice(0,120)||defaults().subject;
 out.note=String(c.note||'').trim().slice(0,600);
 // Costo de capital: tasa anual (%) sobre lo invertido en cada auto propio mientras está en stock.
 if(['GMAIL','LARK'].indexOf(c.channel)<0)throw Error('Canal de envío inválido.');out.channel=c.channel;
 const rate=Number(String(c.capitalRate).replace(',','.'));if(!Number.isFinite(rate)||rate<0||rate>100)throw Error('Tasa de costo de capital inválida (0 a 100 %).');out.capitalRate=Math.round(rate*100)/100;
 const s=c.sections||{};SECTIONS.forEach(([k])=>{out.sections[k]=s[k]!==false;});
 out.version=Number(c.version)||0;
 return out;
}
// Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha AAAA-MM-DD.
const isoDow=d=>{const x=new Date(d+'T12:00:00Z').getUTCDay();return x===0?7:x;};
// ¿Corresponde enviar ahora? Día y hora configurados, no enviado hoy y, si es cada N semanas, ya pasaron N semanas del último.
function due(cfg,now,last){
 if(!cfg||!cfg.enabled||!cfg.recipients.some(r=>r.active))return false;
 if(isoDow(now.day)!==cfg.weekday||now.hour<cfg.hour)return false;
 if(last&&last.day===now.day)return false;
 const weeks=FREQUENCIES[cfg.frequency].weeks;
 if(last&&isDay(last.day)&&weeks>1&&(Date.parse(now.day)-Date.parse(last.day))/DAY<weeks*7-1)return false;
 return true;
}
// Próximo envío programado (para mostrarlo en la configuración).
function nextRun(cfg,now,last){
 if(!cfg||!cfg.enabled)return null;
 for(let k=0;k<70;k++){
  const day=addDays(now.day,k),probe=k===0&&now.hour>cfg.hour?now:{day,hour:cfg.hour};
  if(due(cfg,probe,last))return {day,hour:probe.hour,label:DIAS[cfg.weekday]+' '+dm(day)+' a las '+String(cfg.hour).padStart(2,'0')+':00'+(probe===now?' · sale en la próxima hora':'')};
 }
 return null;
}

// ---------- Datos ----------
// Mismo tratamiento que la web al cargar (google-caja.js): solo lo efectivo, la ficha más reciente por auto y la caja cuadrada desde el 15-oct.
function prepare(loaded,cashStart){
 const effective=r=>{const s=String(r.estado_fuente||'').toLowerCase();return !s||s==='approved'||s==='accredited';};
 const latest=rows=>{const by={};(rows||[]).forEach(r=>{const k=String(r.vehiculo_id).trim(),o=by[k],t=x=>String(x.updated_at||x.created_at||'');if(!o||t(r)>=t(o))by[k]=Object.assign({},r,{vehiculo_id:k});});return Object.keys(by).map(k=>by[k]);};
 return {strictFrom:cashStart||CASH_START,inventory:loaded.inventory||[],operations:latest(loaded.operations),activities:loaded.activities||[],movements:(loaded.movements||[]).filter(effective),accounts:loaded.accounts||[],forecasts:loaded.forecasts||[],loans:loaded.loans||[],contributions:loaded.contributions||[],settings:loaded.settings||{},companyStart:loaded.companyStart||'',fixed:[]};
}
// En Apps Script el correo usa su propia copia actual del motor (OCMailSystemCore, ver backend/CorreoSistema.gs):
// la copia global antigua del proyecto no tiene las mismas funciones. En la web se usa el OCSystemCore cargado.
function core(){
 const c=root.OCMailSystemCore||root.OCSystemCore;
 if(!c||['reports','paid','active'].some(k=>typeof c[k]!=='function'))throw Error('El motor de reportes está desactualizado: falta CorreoSistema.gs en Apps Script.');
 return c;
}
// Período: los 7·N días que terminan ayer (días completos). Si sale el lunes, es la semana lunes–domingo anterior.
function periodOf(today,weeks){const to=addDays(today,-1),from=addDays(to,-(7*weeks)+1);return {from,to,weeks,label:weeks===1?'Semana del '+dm(from)+' al '+dm(to):'Del '+dm(from)+' al '+dm(to)};}
function cashOf(report){const known=(report.accounts||[]).filter(a=>Number.isFinite(a.balance));return known.length?known.reduce((s,a)=>s+a.balance,0):null;}
const stockCars=cars=>cars.filter(c=>!c.sold&&c.status!=='RETIRADO');
const carCost=c=>(c.purchase||0)+(c.preparation||0)+(c.parking||0);
// Costo de capital de un auto propio: compra × tasa anual × días en stock / 365 (consignados no inmovilizan capital propio).
const capitalOf=(c,rate)=>c.modality==='PROPIO'&&Number.isFinite(c.purchase)&&Number.isFinite(c.days)?Math.round(c.purchase*rate/100*c.days/365):0;

function flows(D,from,to){
 const C0=core(),act=D.movements.filter(C0.active);
 const confirmed=act.filter(C0.paid).filter(m=>between(m.fecha_operacion,from,to)&&m.naturaleza!=='TRANSFERENCIA');
 const sum=list=>list.reduce((s,m)=>s+Number(m.monto),0);
 const ins=confirmed.filter(m=>m.direccion==='ENTRADA'),outs=confirmed.filter(m=>m.direccion==='SALIDA');
 // Aportes: lo clasificado como aporte de capital aunque el importe siga por confirmar (como el Resumen).
 const dirOf=m=>['ENTRADA','SALIDA'].indexOf(m.direccion)>=0?m.direccion:(m.naturaleza==='INGRESO'||m.naturaleza==='APORTE_CAPITAL'?'ENTRADA':'');
 const aportes=act.filter(m=>m.naturaleza==='APORTE_CAPITAL'&&dirOf(m)==='ENTRADA'&&num(m.monto)!==null&&between(m.fecha_operacion,from,to));
 const business=sum(ins.filter(m=>m.naturaleza!=='APORTE_CAPITAL')),purchases=sum(outs.filter(m=>m.operacion_auto==='COMPRA')),fixed=sum(outs.filter(m=>m.operacion_auto!=='COMPRA'&&m.tipo_costo==='FIJO')),other=sum(outs.filter(m=>m.operacion_auto!=='COMPRA'&&m.tipo_costo!=='FIJO'));
 const cats={};outs.filter(m=>m.naturaleza==='GASTO').forEach(m=>{const k=m.categoria||'Sin categoría';cats[k]=(cats[k]||0)+Number(m.monto);});
 return {business,contributions:sum(aportes),purchases,fixed,other,exits:purchases+fixed+other,net:business-(purchases+fixed+other),categories:cats};
}
function salesOf(cars,from,to,rate){
 const sold=cars.filter(c=>c.sold&&between(c.saleDate,from,to)).sort((a,b)=>a.saleDate.localeCompare(b.saleDate));
 const known=sold.filter(c=>c.result!==null);
 const profit=known.reduce((s,c)=>s+c.result,0),saleSum=known.reduce((s,c)=>s+(c.sale||0),0);
 const capital=known.reduce((s,c)=>s+capitalOf(c,rate||0),0);
 return {count:sold.length,list:sold.map(c=>Object.assign({},c,{capital:capitalOf(c,rate||0)})),profit,capital,afterCapital:profit-capital,missing:sold.length-known.length,margin:saleSum>0?profit/saleSum*100:null,revenue:sold.reduce((s,c)=>s+(c.sale||0),0)};
}
// Arma todos los números del correo para la fecha de envío «today».
function compute(D,today,cfg){
 cfg=cfg||defaults();const C0=core(),weeks=FREQUENCIES[cfg.frequency]?FREQUENCIES[cfg.frequency].weeks:1;
 const P=periodOf(today,weeks),prevTo=addDays(P.from,-1),prev={from:addDays(prevTo,-(7*weeks)+1),to:prevTo};
 const now=C0.reports(D,P.to),before=C0.reports(D,prev.to),cut=D.strictFrom||CASH_START;
 // Antes del arranque de la caja cuadrada no hay saldo comparable.
 const cash=P.to<cut?null:cashOf(now),cashPrev=prev.to<cut?null:cashOf(before);
 // Últimas 8 semanas (siempre semanales) para los gráficos.
 const series=[];for(let i=7;i>=0;i--){const to=addDays(P.to,-7*i),from=addDays(to,-6),f=flows(D,from,to),r=i===0?now:C0.reports(D,to),s=salesOf(r.cars,from,to,cfg.capitalRate);series.push({from,to,label:dm(from),business:f.business,exits:f.exits,contributions:f.contributions,cash:to<cut?null:cashOf(r),sales:s.count,profit:s.profit});}
 const stock=stockCars(now.cars),own=stock.filter(c=>c.modality==='PROPIO'),cons=stock.filter(c=>c.modality==='CONSIGNADO');
 const ages=[['0–30 días',0,30,C.ok],['31–60 días',31,60,C.camel],['61–90 días',61,90,C.out],['Más de 90 días',91,1e9,C.bad]].map(([label,a,b,color])=>{const cs=stock.filter(c=>Number.isFinite(c.days)&&c.days>=a&&c.days<=b);return {label,color,count:cs.length,cost:cs.filter(c=>c.modality==='PROPIO').reduce((s,c)=>s+carCost(c),0)};});
 const noDays=stock.filter(c=>!Number.isFinite(c.days)).length;
 const stockCost=own.reduce((s,c)=>s+carCost(c),0),listed=own.reduce((s,c)=>s+(Number.isFinite(c.listPrice)&&c.listPrice>0?c.listPrice:carCost(c)),0);
 const daysKnown=stock.filter(c=>Number.isFinite(c.days)),avgDays=daysKnown.length?Math.round(daysKnown.reduce((s,c)=>s+c.days,0)/daysKnown.length):null;
 const entered=now.cars.filter(c=>between(c.entryDate,P.from,P.to)).length;
 const rate=cfg.capitalRate||0,capitalStock=own.reduce((s,c)=>s+capitalOf(c,rate),0);
 // Lo que cuesta mantener el capital invertido en el stock propio durante el período (compra × tasa × días del período / 365).
 const capitalPeriod=Math.round(own.reduce((s,c)=>s+(Number.isFinite(c.purchase)?c.purchase:0),0)*rate/100*7*weeks/365);
 // Alerta de precio: más de 60 días en stock, o margen esperado negativo al precio publicado (compra + gastos + estacionamiento + capital).
 // No hay precio de mercado conectado: la alerta usa antigüedad y margen esperado, no comparables.
 const priceAlerts=stock.map(c=>{const own=c.modality==='PROPIO',cap=capitalOf(c,rate),cost=own&&Number.isFinite(c.purchase)?carCost(c)+cap:null,list=Number.isFinite(c.listPrice)&&c.listPrice>0?c.listPrice:null,expected=cost!==null&&list!==null?list-cost:null;
   const reason=expected!==null&&expected<0?'NEGATIVO':Number.isFinite(c.days)&&c.days>90?'MAS_90':Number.isFinite(c.days)&&c.days>60?'MAS_60':'';
   return {label:c.label||c.id,days:c.days,modality:c.modality,list,cost,capital:cap,expected,margin:expected!==null&&list?expected/list*100:null,reason};})
  .filter(a=>a.reason).sort((a,b)=>(a.reason==='NEGATIVO'?-1e6:0)-(b.reason==='NEGATIVO'?-1e6:0)||(b.days||0)-(a.days||0));
 const rest=(now.receivable||0)+(now.loanAsset||0)-(now.debt||0);
 const capital={total:(now.capital&&now.capital.total)||0,bySocio:(now.capital&&now.capital.bySocio)||{},atCost:(cash||0)+stockCost+rest,atList:(cash||0)+listed+rest};
 const fourFrom=addDays(P.to,-27),cats=flows(D,fourFrom,P.to).categories;
 return {cfg,today,period:P,prev,cur:{flows:flows(D,P.from,P.to),sales:salesOf(now.cars,P.from,P.to,cfg.capitalRate)},old:{flows:flows(D,prev.from,prev.to),sales:salesOf(before.cars,prev.from,prev.to,cfg.capitalRate)},
  cash,cashPrev,accounts:(now.accounts||[]).map(a=>{const b=(before.accounts||[]).find(x=>x.id===a.id);return {name:a.name,balance:P.to<cut?null:a.balance,prev:b&&prev.to>=cut?b.balance:null};}),
  prices:priceAlerts,capitalRate:rate,stock:{capitalStock,capitalPeriod,count:stock.length,own:own.length,consigned:cons.length,cost:stockCost,listed,avgDays,ages,noDays,entered,old60:stock.filter(c=>Number.isFinite(c.days)&&c.days>60).length},
  receivable:now.receivable||0,debt:now.debt||0,capital,series,expenses:{from:fourFrom,to:P.to,cats}};
}

// ---------- HTML (tablas en línea: se ve igual en Gmail, Apple Mail y Outlook) ----------
const T='role="presentation" cellpadding="0" cellspacing="0" border="0"';
const card=(inner,title,kicker)=>'<tr><td style="padding:0 0 16px"><table '+T+' width="100%" style="background:'+C.card+';border:1px solid '+C.line+';border-radius:14px"><tr><td class="oc-in" style="padding:22px 24px">'+(kicker?'<div style="font:600 10px/1 '+SANS+';letter-spacing:1.7px;color:'+C.camel+';text-transform:uppercase;margin:0 0 8px">'+esc(kicker)+'</div>':'')+(title?'<div style="font:700 19px/1.25 '+SANS+';letter-spacing:-.3px;color:'+C.ink+';margin:0 0 14px">'+title+'</div>':'')+inner+'</td></tr></table></td></tr>';
const small=(t,color)=>'<div style="font:400 12px/1.45 '+SANS+';color:'+(color||C.muted)+';margin-top:4px">'+t+'</div>';
const dot=color=>'<span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:'+color+';vertical-align:0;margin-right:6px"></span>';
function delta(cur,prev,opts){
 opts=opts||{};if(!Number.isFinite(cur)||!Number.isFinite(prev))return '';
 const d=cur-prev;if(d===0)return '<span style="color:'+C.muted+'">'+(opts.compact?'= sin cambio':'= igual que la anterior')+'</span>';
 const good=opts.lowerIsBetter?d<0:d>0,color=good?C.ok:C.bad,arrow=d>0?'▲':'▼';
 return '<span style="color:'+color+';font-weight:600">'+arrow+' '+(opts.count?Math.abs(d)+' '+plural(Math.abs(d),opts.unit||'',opts.units||''):short(Math.abs(d)))+'</span>'+(opts.compact?'':' <span style="color:'+C.muted+'">vs '+(opts.prevLabel||'anterior')+'</span>');
}
function kpi(label,value,sub){return '<td width="50%" valign="top" style="padding:6px"><table '+T+' width="100%" style="background:#fffaf1;border:1px solid '+C.line+';border-radius:12px"><tr><td style="padding:14px 16px"><div style="font:600 10px/1.3 '+SANS+';letter-spacing:1.2px;color:'+C.muted+';text-transform:uppercase">'+label+'</div><div style="font:500 24px/1.25 '+MONO+';color:'+C.ink+';margin-top:6px;letter-spacing:-.5px">'+value+'</div>'+(sub?'<div style="font:400 12px/1.4 '+SANS+';margin-top:4px">'+sub+'</div>':'')+'</td></tr></table></td>';}
function legend(items){return '<div style="margin-top:12px;font:400 12px/1.9 '+SANS+';color:'+C.ink+'">'+items.map(([color,label])=>'<span style="white-space:nowrap;margin-right:16px;display:inline-block">'+dot(color)+esc(label)+'</span>').join(' ')+'</div>';}
// Barras verticales por semana. series: [[key,color,label]]. Cada barra lleva su valor encima (identidad no depende solo del color).
function columns(rows,series,fmt,maxH){
 maxH=maxH||110;const vals=rows.flatMap(r=>series.map(s=>r[s[0]])).filter(Number.isFinite),max=Math.max(1,...vals.map(Math.abs));
 // Varias series: barras delgadas sin rótulos (la leyenda da la identidad y la tabla de abajo los montos exactos).
 const w=series.length>2?10:series.length>1?12:22,labelAll=series.length===1;
 // Para que quepa en el teléfono: valor en la semana destacada y, si es una serie, también en la semana más alta.
 let peak=-1;if(labelAll){let best=-Infinity;rows.forEach((r,i)=>{const v=r[series[0][0]];if(Number.isFinite(v)&&Math.abs(v)>best){best=Math.abs(v);peak=i;}});}
 const cols=rows.map((r,i)=>{
  const showLabel=labelAll&&(i===rows.length-1||i===peak);
  const bars=series.map(([k,color])=>{const v=r[k],h=Number.isFinite(v)&&v!==0?Math.max(3,Math.round(Math.abs(v)/max*maxH)):0;
   return '<td valign="bottom" align="center" style="padding:0 1px"><div style="font:500 9px/1.2 '+MONO+';color:'+C.muted+';margin-bottom:3px;white-space:nowrap">'+(showLabel&&Number.isFinite(v)&&v!==0?esc(fmt(v)):'&nbsp;')+'</div><div style="width:'+w+'px;height:'+h+'px;line-height:'+h+'px;font-size:1px;background:'+(v<0?C.bad:color)+';border-radius:4px 4px 0 0">&nbsp;</div></td>';}).join('');
  const last=i===rows.length-1;
  return '<td valign="bottom" align="center" style="padding:0 2px;'+(last?'background:'+C.camelSoft+';border-radius:8px 8px 0 0;':'')+'"><table '+T+' style="margin:0 auto"><tr>'+bars+'</tr></table></td>';}).join('');
 const labels=rows.map((r,i)=>'<td align="center" style="padding:6px 0 0;font:'+(i===rows.length-1?'700':'400')+' 10px/1.2 '+SANS+';color:'+(i===rows.length-1?C.ink:C.muted)+';white-space:nowrap;border-top:1px solid #c9bdac">'+esc(r.label)+'</td>').join('');
 return '<table '+T+' width="100%" style="table-layout:fixed;height:'+(maxH+24)+'px"><tr style="height:'+(maxH+20)+'px">'+cols+'</tr><tr>'+labels+'</tr></table>';
}
// Barra horizontal con pista (track). value/max en %, texto a la derecha.
function hbar(label,value,max,color,right,note){
 const p=Math.max(0,Math.min(100,max>0?value/max*100:0)),pw=Math.round(p);
 return '<tr><td style="padding:7px 10px 7px 0;font:400 13px/1.3 '+SANS+';color:'+C.ink+';width:38%">'+label+(note?small(note):'')+'</td><td style="padding:7px 0"><table '+T+' width="100%" style="background:'+C.track+';border-radius:6px"><tr>'+(pw>0?'<td width="'+pw+'%" style="background:'+color+';height:14px;border-radius:6px;font-size:1px;line-height:14px">&nbsp;</td>':'')+(pw<100?'<td style="height:14px;font-size:1px;line-height:14px">&nbsp;</td>':'')+'</tr></table></td><td align="right" style="padding:7px 0 7px 12px;font:500 13px/1.3 '+MONO+';color:'+C.ink+';white-space:nowrap;width:1%">'+right+'</td></tr>';
}
function chip(status){const s={ok:['Bien',C.ok,C.okBg],warn:['En revisión',C.warn,C.warnBg],bad:['Atención',C.bad,C.badBg]}[status];return '<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:'+s[2]+';color:'+s[1]+';font:700 12px/1.4 '+SANS+';white-space:nowrap">'+dot(s[1])+s[0]+'</span>';}

function semaforo(R){
 const cs=R.cur.sales,os=R.old.sales,f=R.cur.flows,st=R.stock;
 const share=st.count?st.old60/st.count:0;
 const rows=[
  ['Ventas',cs.count>os.count?'ok':cs.count===os.count&&cs.count>0?'ok':cs.count===os.count?'warn':'bad',cs.count+' '+plural(cs.count,'auto','autos')+' (anterior: '+os.count+')'],
  ['Rentabilidad',cs.count===0?'warn':cs.profit>0&&(cs.margin===null||cs.margin>=5)?'ok':cs.profit>0?'warn':'bad',cs.count?short(cs.profit)+(cs.margin!==null?' · margen '+pct(cs.margin):''):'Sin ventas en el período'],
  ['Flujo del negocio',f.net>=0?'ok':f.business>0?'warn':'bad','Entró '+short(f.business)+' · salió '+short(f.exits)],
  ['Caja',R.cash===null?'warn':R.cashPrev===null||R.cash>=R.cashPrev?'ok':R.cash>=R.cashPrev*0.85?'warn':'bad',R.cash===null?'Sin saldos iniciales':short(R.cash)+(R.cashPrev!==null?' (anterior: '+short(R.cashPrev)+')':'')],
  ['Inventario',share<=0.25?'ok':share<=0.5?'warn':'bad',st.old60+' de '+st.count+' '+plural(st.count,'auto','autos')+' con más de 60 días']
 ];
 const good=rows.filter(r=>r[1]==='ok').length,mood=good>=4?'¡Vamos bien!':good>=2?'Semana mixta':'Semana para revisar';
 return card('<table '+T+' width="100%">'+rows.map(([k,s,t])=>'<tr><td style="padding:8px 0;border-bottom:1px solid #f0e7d8;font:600 14px/1.3 '+SANS+';color:'+C.ink+'">'+k+small(esc(t))+'</td><td align="right" style="padding:8px 0;border-bottom:1px solid #f0e7d8">'+chip(s)+'</td></tr>').join('')+'</table>',
  'Semáforo de la semana <span style="font:600 26px/1 '+HAND+';color:'+C.camel+';margin-left:8px;letter-spacing:0">'+mood+'</span>','RESUMEN EN UNA MIRADA');
}
function flujo(R){
 const s=R.series,anyCap=s.some(r=>r.contributions>0);
 const series=[['business',C.inc,'Ingresos del negocio'],['exits',C.out,'Salidas (compras + gastos)']].concat(anyCap?[['contributions',C.cap,'Aportes de socios']]:[]);
 const f=R.cur.flows;
 return card(columns(s,series,short)+legend(series.map(x=>[x[1],x[2]]))+
  '<table '+T+' width="100%" style="margin-top:16px;border-top:1px solid #f0e7d8"><tr><td style="padding:10px 0 2px;font:600 13px/1.3 '+SANS+';color:'+C.ink+'" colspan="2">Este período</td></tr>'+
  [['Ingresos del negocio',f.business,C.inc],['Compras de autos y pagos a dueños',-f.purchases,C.out],['Gastos fijos',-f.fixed,C.out],['Otros gastos y costos',-f.other,C.out]].concat(f.contributions?[['Aportes de socios',f.contributions,C.cap]]:[]).map(([k,v,c])=>'<tr><td style="padding:4px 0;font:400 13px/1.3 '+SANS+';color:'+C.ink+'">'+dot(c)+k+'</td><td align="right" style="font:500 13px/1.3 '+MONO+';color:'+C.ink+'">'+money(v)+'</td></tr>').join('')+
  '<tr><td style="padding:8px 0 0;border-top:1px solid '+C.line+';font:700 14px/1.3 '+SANS+';color:'+C.ink+'">Flujo neto del negocio</td><td align="right" style="padding:8px 0 0;border-top:1px solid '+C.line+';font:600 15px/1.3 '+MONO+';color:'+(f.net<0?C.bad:C.ok)+'">'+money(f.net)+'</td></tr></table>'+
  small('Solo movimientos confirmados. Las transferencias entre cuentas propias no cuentan; los aportes de socios se muestran aparte del negocio.'),
  'Flujo de caja · últimas 8 semanas','DINERO QUE ENTRA Y SALE');
}
function ventas(R){
 const s=R.cur.sales,rows=s.list,maxP=Math.max(1,...rows.map(c=>Math.abs(c.result||0)));
 const top=columns(R.series,[['profit',C.camel,'Utilidad']],short,80);
 const body=!rows.length?'<p style="font:400 14px/1.5 '+SANS+';color:'+C.muted+';margin:0 0 6px">No hubo ventas en este período.</p>':
  '<table '+T+' width="100%">'+rows.map(c=>hbar(esc(c.label||c.id),Math.abs(c.result||0),maxP,c.result===null?C.track:c.result<0?C.bad:C.ok,c.result===null?'<span style="color:'+C.muted+'">Sin compra</span>':money(c.result)+'<div style="font:400 11px/1.3 '+SANS+';color:'+C.muted+'">'+(c.sale>0?pct(c.result/c.sale*100)+' de '+short(c.sale):'')+'</div>',(c.modality==='CONSIGNADO'?'Consignado':'Propio')+' · vendido el '+dm(c.saleDate)+(Number.isFinite(c.days)?' · '+c.days+' días en stock':''))).join('')+'</table>'+
  (s.capital?'<table '+T+' width="100%" style="margin-top:10px;border-top:1px solid #f0e7d8"><tr><td style="padding:8px 0 0;font:400 13px/1.3 '+SANS+';color:'+C.ink+'">Costo de capital de lo vendido ('+pct(R.capitalRate)+' anual)</td><td align="right" style="padding:8px 0 0;font:500 13px/1.3 '+MONO+';color:'+C.ink+'">'+money(-s.capital)+'</td></tr><tr><td style="padding:4px 0 0;font:700 14px/1.3 '+SANS+';color:'+C.ink+'">Utilidad después de capital</td><td align="right" style="padding:4px 0 0;font:600 15px/1.3 '+MONO+';color:'+(s.afterCapital<0?C.bad:C.ok)+'">'+money(s.afterCapital)+'</td></tr></table>':'')+
  (s.missing?small(s.missing+' '+plural(s.missing,'venta','ventas')+' sin compra asignada en la caja: su utilidad no se suma todavía.'):'');
 return card(body+'<div style="font:600 13px/1.3 '+SANS+';color:'+C.ink+';margin:18px 0 8px">Utilidad por semana</div>'+top+small('Utilidad = venta cobrada − compra (o pago al dueño) − costos asignados al auto.'),
  'Ventas del período: '+s.count+' '+plural(s.count,'auto','autos'),'VENTAS Y RENTABILIDAD');
}
function caja(R){
 const acc=R.accounts.filter(a=>Number.isFinite(a.balance)),max=Math.max(1,...acc.map(a=>Math.abs(a.balance)));
 return card('<table '+T+' width="100%">'+acc.map(a=>hbar(esc(a.name),Math.abs(a.balance),max,a.balance<0?C.bad:C.camel,money(a.balance)+'<div style="font:400 11px/1.3 '+SANS+'">'+delta(a.balance,a.prev,{compact:true})+'</div>')).join('')+'</table>'+
  '<div style="font:600 13px/1.3 '+SANS+';color:'+C.ink+';margin:18px 0 8px">Caja total al cierre de cada semana</div>'+columns(R.series,[['cash',C.camel,'Caja']],short,80)+
  small('Debajo de cada saldo, el cambio respecto del cierre anterior. Saldos calculados desde el 15 de octubre de 2026 con movimientos completos, igual que Caja y bancos.'),
  'Caja al cierre: '+money(R.cash),'CAJA Y BANCOS');
}
function inventario(R){
 const st=R.stock,max=Math.max(1,...st.ages.map(a=>a.count));
 return card('<table '+T+' width="100%"><tr>'+kpi('Propios',String(st.own),'al costo '+short(st.cost))+kpi('Consignados',String(st.consigned),st.entered?st.entered+' '+plural(st.entered,'ingreso','ingresos')+' en el período':'sin ingresos en el período')+'</tr></table>'+
  '<div style="font:600 13px/1.3 '+SANS+';color:'+C.ink+';margin:16px 0 4px">Antigüedad del stock</div><table '+T+' width="100%">'+st.ages.map(a=>hbar(esc(a.label),a.count,max,a.color,a.count+' '+plural(a.count,'auto','autos'),a.cost?'propios al costo '+short(a.cost):'')).join('')+'</table>'+
  (st.noDays?small(st.noDays+' '+plural(st.noDays,'auto sin','autos sin')+' fecha de ingreso.'):'')+(R.capitalRate?'<table '+T+' width="100%" style="margin-top:12px;background:#fffaf1;border:1px solid '+C.line+';border-radius:12px"><tr><td style="padding:12px 16px;font:400 13px/1.45 '+SANS+';color:'+C.ink+'"><b>Costo de capital del stock propio</b> ('+pct(R.capitalRate)+' anual)'+small('Lo que cuesta tener la plata invertida en estos autos.')+'</td><td align="right" style="padding:12px 16px;font:500 14px/1.4 '+MONO+';color:'+C.ink+';white-space:nowrap">'+short(st.capitalStock)+'<div style="font:400 11px/1.3 '+SANS+';color:'+C.muted+'">acumulado</div>'+short(st.capitalPeriod)+'<div style="font:400 11px/1.3 '+SANS+';color:'+C.muted+'">'+(R.period.weeks===1?'esta semana':'este período')+'</div></td></tr></table>':'')+
  small('Promedio: '+(st.avgDays===null?'—':st.avgDays+' días')+' en stock. Sobre 30 días cada auto suma costo de estacionamiento.'),
  st.count+' '+plural(st.count,'auto','autos')+' en stock','INVENTARIO');
}
function precios(R){
 const list=R.prices.slice(0,8);
 if(!list.length)return card('<p style="font:400 14px/1.5 '+SANS+';color:'+C.ink+';margin:0">Ningún auto supera los 60 días ni tiene margen esperado negativo. '+chip('ok')+'</p>','Autos para revisar precio','ALERTA DE PRECIO');
 const tag={NEGATIVO:['Margen negativo','bad'],MAS_90:['Ajustar precio','bad'],MAS_60:['Ajustar precio','warn']};
 const rows=list.map(a=>{const t=tag[a.reason];
  return '<tr><td style="padding:10px 0;border-bottom:1px solid #f0e7d8;font:600 13px/1.35 '+SANS+';color:'+C.ink+'">'+esc(a.label)+small((a.modality==='CONSIGNADO'?'Consignado':'Propio')+' · '+(Number.isFinite(a.days)?a.days+' días en stock':'sin fecha de ingreso')+(a.list?' · publicado '+short(a.list):''))+
   (a.expected!==null?small('Costo '+short(a.cost)+(a.capital?' (incl. capital '+short(a.capital)+')':'')+' → margen esperado <b style="color:'+(a.expected<0?C.bad:C.ok)+'">'+short(a.expected)+(a.margin!==null?' · '+pct(a.margin):'')+'</b>'+(a.expected>0?' · espacio para rebajar sin perder: '+short(a.expected):''),C.muted):'')+
   '</td><td align="right" valign="top" style="padding:10px 0 10px 10px;border-bottom:1px solid #f0e7d8">'+chip(t[1]).replace(/Atención|En revisión/,t[0])+'</td></tr>';}).join('');
 return card('<table '+T+' width="100%">'+rows+'</table>'+(R.prices.length>list.length?small('Y '+(R.prices.length-list.length)+' más.'):'')+
  small('Alerta cuando un auto supera los 60 días en stock o su margen esperado al precio publicado es negativo. Aún no hay precio de mercado conectado: la alerta no compara con avisos similares.'),
  R.prices.length+' '+plural(R.prices.length,'auto','autos')+' para revisar precio','ALERTA DE PRECIO');
}
function capital(R){
 const k=R.capital;if(!k.total)return '';
 const max=Math.max(k.total,k.atCost,k.atList,1),pc=Math.round(Math.max(0,k.atCost)/k.total*100),gap=Math.max(0,k.total-k.atCost);
 return card('<p style="font:400 14px/1.5 '+SANS+';color:'+C.ink+';margin:0 0 6px">Si hoy se cierra y se vende todo, se recupera <b>'+money(Math.max(0,k.atCost))+'</b> de <b>'+money(k.total)+'</b> aportados ('+pc+' %).</p>'+
  (gap?'<p style="font:700 14px/1.5 '+SANS+';color:'+C.bad+';margin:0 0 8px">Faltan '+money(gap)+' para devolver lo aportado.</p>':'<p style="font:700 14px/1.5 '+SANS+';color:'+C.ok+';margin:0 0 8px">Alcanza para devolver todo lo aportado.</p>')+
  '<table '+T+' width="100%">'+hbar('Aportado por los socios',k.total,max,C.cap,money(k.total))+hbar('Cerrando hoy · stock al costo',Math.max(0,k.atCost),max,k.atCost>=k.total?C.ok:C.out,money(k.atCost))+hbar('Cerrando hoy · a precio publicado',Math.max(0,k.atList),max,k.atList>=k.total?C.ok:C.out,money(k.atList))+'</table>'+
  small('Recuperable = caja + stock propio + por cobrar + préstamos otorgados − deudas. Aportes: '+(Object.keys(k.bySocio).map(n=>esc(n)+' '+short(k.bySocio[n])).join(' · ')||'—')+'.'),
  'Capital de los socios','¿RECUPERAMOS LO APORTADO?');
}
function gastos(R){
 const e=R.expenses,list=Object.keys(e.cats).map(k=>[k,e.cats[k]]).sort((a,b)=>b[1]-a[1]),total=list.reduce((s,x)=>s+x[1],0);
 if(!total)return '';
 // Una sola magnitud por categoría: barras de un tono (camel), ordenadas de mayor a menor, con % y monto.
 const top=list.slice(0,6),rest=list.slice(6).reduce((s,x)=>s+x[1],0);if(rest)top.push(['Otras',rest]);
 return card('<table '+T+' width="100%">'+top.map(([k,v])=>hbar(esc(k),v,top[0][1],C.camel,money(v)+'<div style="font:400 11px/1.3 '+SANS+';color:'+C.muted+'">'+Math.round(v/total*100)+' %</div>')).join('')+'</table>'+small('Total gastos: '+money(total)+'. Del '+dm(e.from)+' al '+dm(e.to)+'. No incluye compras de autos.'),
  'Composición de gastos · últimas 4 semanas','EN QUÉ SE VA EL DINERO');
}
function headline(R){
 const s=R.cur.sales,f=R.cur.flows,parts=[];
 parts.push(s.count?'Se '+plural(s.count,'vendió ','vendieron ')+'<b>'+s.count+' '+plural(s.count,'auto','autos')+'</b>'+(s.profit?' con una utilidad de <b>'+short(s.profit)+'</b>':''):'No hubo ventas');
 parts.push('el negocio generó <b>'+short(f.business)+'</b> y salieron <b>'+short(f.exits)+'</b>');
 if(R.cash!==null)parts.push('la caja cerró en <b>'+short(R.cash)+'</b>');
 return parts.join(', ')+'.';
}
function render(R,opts){
 opts=opts||{};const cfg=R.cfg,sec=cfg.sections||{},P=R.period,cs=R.cur.sales,os=R.old.sales,f=R.cur.flows,of=R.old.flows;
 const prevLabel=P.weeks===1?'semana anterior':'período anterior';
 const kpis='<table '+T+' width="100%"><tr>'+kpi('Autos vendidos',String(cs.count),delta(cs.count,os.count,{count:true,unit:'auto',units:'autos',prevLabel}))+kpi('Utilidad de ventas',short(cs.profit),cs.margin!==null?'margen '+pct(cs.margin):'<span style="color:'+C.muted+'">venta − compra − costos</span>')+'</tr><tr>'+
  kpi('Ingresos del negocio',short(f.business),delta(f.business,of.business,{prevLabel}))+kpi('Flujo neto',short(f.net),delta(f.net,of.net,{prevLabel}))+'</tr><tr>'+
  kpi('Caja hoy',short(R.cash),delta(R.cash,R.cashPrev,{prevLabel}))+kpi('Autos en stock',String(R.stock.count),R.stock.avgDays!==null?R.stock.avgDays+' días promedio':'')+'</tr><tr>'+
  kpi('Por cobrar',short(R.receivable),'')+kpi('Por pagar',short(R.debt),'')+'</tr></table>';
 const body=[
  card(kpis,'','LOS NÚMEROS DEL PERÍODO'),
  sec.semaforo!==false?semaforo(R):'',sec.flujo!==false?flujo(R):'',sec.ventas!==false?ventas(R):'',sec.caja!==false?caja(R):'',
  sec.inventario!==false?inventario(R):'',sec.precios!==false?precios(R):'',sec.capital!==false?capital(R):'',sec.gastos!==false?gastos(R):''].join('');
 const url=opts.url||'https://admin.oportunicars.cl';
 const pre=esc(P.label+' · '+(cs.count?cs.count+' '+plural(cs.count,'venta','ventas')+' · ':'')+'caja '+short(R.cash));
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>'+esc(cfg.subject)+'</title>'+
  '<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">'+
  '<style>@media (max-width:620px){.oc-w{width:100%!important}.oc-p{padding-left:8px!important;padding-right:8px!important}.oc-in{padding:18px 14px!important}}</style></head>'+
  '<body style="margin:0;padding:0;background:'+C.bg+';color:'+C.ink+'"><div style="display:none;max-height:0;overflow:hidden;opacity:0">'+pre+'</div>'+
  '<table '+T+' width="100%" style="background:'+C.bg+'"><tr><td align="center" class="oc-p" style="padding:28px 16px">'+
  '<table '+T+' width="640" class="oc-w" style="width:640px;max-width:640px">'+
  '<tr><td style="padding:0 4px 18px"><table '+T+' width="100%"><tr><td valign="bottom"><div style="font:700 30px/1 '+SANS+';letter-spacing:-1.5px;color:'+C.ink+'">oportuni<span style="color:'+C.camel+'">cars</span></div><div style="font:600 9px/1 '+SANS+';letter-spacing:2px;color:'+C.muted+';margin-top:7px">GESTIÓN DEL NEGOCIO · RESUMEN GERENCIAL</div></td>'+
  '<td align="right" valign="bottom"><div style="display:inline-block;border:1.5px solid '+C.ink+';border-radius:6px;padding:6px 12px;font:600 20px/1.1 '+HAND+';color:'+C.ink+';text-align:left">'+esc(P.weeks===1?'Semana':'Período')+'<br>'+esc(dm(P.from)+' – '+dm(P.to))+'</div></td></tr></table></td></tr>'+
  '<tr><td style="padding:0 0 16px"><table '+T+' width="100%" style="background:#53432f;border-radius:14px"><tr><td style="padding:22px 24px"><div style="font:600 10px/1 '+SANS+';letter-spacing:1.7px;color:#e1cfae;margin-bottom:10px">'+esc(P.label.toUpperCase())+'</div><div style="font:400 17px/1.5 '+SANS+';color:#fff9ed">'+headline(R)+'</div>'+
  (cfg.note?'<div style="margin-top:14px;padding-top:12px;border-top:1px solid #7a664c;font:600 21px/1.3 '+HAND+';color:#f3dfb8">'+esc(cfg.note).replace(/\n/g,'<br>')+'</div>':'')+'</td></tr></table></td></tr>'+
  body+
  '<tr><td align="center" style="padding:8px 0 6px"><a href="'+esc(url)+'" style="display:inline-block;background:'+C.ink+';color:#fff9ed;text-decoration:none;font:600 14px/1 '+SANS+';padding:14px 22px;border-radius:10px">Ver el resumen completo →</a></td></tr>'+
  '<tr><td align="center" style="padding:18px 10px 0;font:400 11px/1.6 '+SANS+';color:'+C.muted+'">Oportunicars · <span style="font:600 15px/1 '+HAND+';color:'+C.camel+'">Autos que mueven tus sueños</span><br>Correo automático '+esc((FREQUENCIES[cfg.frequency]||FREQUENCIES.SEMANAL).label.toLowerCase())+' con datos al '+esc(dm(P.to))+'. Los importes sin confirmar no se suman como saldos.</td></tr>'+
  '</table></td></tr></table></body></html>';
}
function text(R){
 const s=R.cur.sales,f=R.cur.flows;
 return ['Oportunicars · '+R.period.label,'','Autos vendidos: '+s.count+' · utilidad '+money(s.profit),'Ingresos del negocio: '+money(f.business)+' · salidas '+money(f.exits)+' · flujo neto '+money(f.net),'Caja al cierre: '+money(R.cash),'Autos en stock: '+R.stock.count+' (propios al costo '+money(R.stock.cost)+')','','Ver el resumen completo: https://admin.oportunicars.cl'].join('\n');
}
// Correo listo: asunto, HTML y texto plano.
function build(D,today,cfg,opts){
 const c=normalize(cfg||defaults()),R=compute(D,today,c);
 return {subject:c.subject+' · '+(R.period.weeks===1?'semana':'período')+' del '+dm(R.period.from)+' al '+dm(R.period.to),html:render(R,opts),text:text(R),period:R.period,data:R};
}
const CHANNELS={GMAIL:'Gmail (cuenta Google del sistema)',LARK:'Lark Mail'};
const api={CHANNELS,CASH_START,SECTIONS,FREQUENCIES,DIAS,defaults,normalize,due,nextRun,isoDow,prepare,periodOf,compute,build,render,money,short};
if(typeof module!=='undefined')module.exports=api;root.OCCorreoCore=api;
})(typeof globalThis==='undefined'?this:globalThis);
