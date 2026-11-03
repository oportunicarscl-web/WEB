(function(root){
'use strict';
// Cartolas bancarias pegadas como texto. Cada banco tiene su propio formato; se detecta solo por el contenido.
// La dirección (cargo/abono) sale de la cadena de saldos: saldo − saldo anterior = ±monto. Si no cuadra, la línea no se guarda.
// Para agregar un banco nuevo (p. ej. Banco Chile) basta sumar un formato a FORMATS con detect() y parseLine().

const pad=n=>String(n).padStart(2,'0');
function isoDate(d,m,y){
 if(String(y).length===2)y='20'+y;const iso=y+'-'+pad(m)+'-'+pad(d);
 return !isNaN(Date.parse(iso))&&new Date(iso+'T12:00:00Z').toISOString().slice(0,10)===iso?iso:'';
}
// Montos chilenos: 5.000.000 · $5.000.000 · -5.000.000 · 5.000.000,00
function clp(v){
 let s=String(v==null?'':v).trim();if(!s)return null;
 const neg=/^-|^\(.*\)$|-$/.test(s);s=s.replace(/[$\s()-]/g,'').replace(/,\d{1,2}$/,'');
 if(!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(s))return null;const n=Number(s.replace(/\./g,''));return neg?-n:n;
}
const DATE=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

// ---- Scotiabank · «Consulta detalle de cartola emitida» ----
// Copia del PDF:  dd/mm/aaaa DESCRIPCIÓN DOCTO MONTO SALDO      (un solo monto; cargo o abono se deduce del saldo)
// Copia de Excel: dd/mm/aaaa ⇥ DESCRIPCIÓN ⇥ DOCTO ⇥ CARGO ⇥ ABONO ⇥ SALDO
// La copia del PDF puede venir con saltos de línea cortados o pegados al pie de página: se lee el texto completo
// buscando cada «fecha … docto monto saldo», sin depender de que cada movimiento quede en su propia línea.
const AMT='\\$?\\d{1,3}(?:\\.\\d{3})*',BAL='-?\\$?\\d{1,3}(?:\\.\\d{3})*';
const SCOTIA_MOV=new RegExp('^(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s+(.+?)\\s+(\\d{6,12})\\s+('+AMT+')\\s+('+BAL+')(?=\\s|$)');
const DATE_START=/(^|\s)(\d{2}\/\d{2}\/\d{4})\s/g;
function scotiaTab(line){
 const t=line.split('\t').map(x=>x.trim());
 if(t.length<6||!DATE.test(t[0])||!/^\d{6,12}$/.test(t[2]))return null;
 const [,d,m,y]=t[0].match(DATE),date=isoDate(d,m,y),out=clp(t[3]),inn=clp(t[4]),balance=clp(t[5]);
 if(!date||balance===null||(!out)===(!inn))return null;
 return {date,description:t[1].replace(/\s+/g,' '),doc:t[2],amount:Math.abs(out||inn),balance,direction:inn?'ENTRADA':'SALIDA'};
}
function scotiaSegment(seg){
 const m=seg.match(SCOTIA_MOV);if(!m)return null;
 const date=isoDate(m[1],m[2],m[3]),amount=clp(m[6]),balance=clp(m[7]);
 if(!date||!amount||balance===null)return null;
 return {date,description:m[4].trim(),doc:m[5],amount:Math.abs(amount),balance,direction:''};
}
const scotiabank={
 id:'scotiabank',name:'Scotiabank',account:/scotia/i,
 detect(text){return this.read(text).rows.length;},
 read(text){
  const src=String(text||''),rows=[];
  if(/\t/.test(src)){src.split(/\r?\n/).forEach(l=>{const r=scotiaTab(l.trim());if(r)rows.push(r);});if(rows.length)return {rows,ignored:src.split(/\r?\n/).filter(l=>l.trim()).length-rows.length};}
  const flat=src.replace(/\s+/g,' '),starts=[];let m;DATE_START.lastIndex=0;
  while((m=DATE_START.exec(flat)))starts.push(m.index+m[1].length);
  let ignored=0;
  starts.forEach((st,i)=>{const r=scotiaSegment(flat.slice(st,i+1<starts.length?starts[i+1]:flat.length).trim());if(r)rows.push(r);else ignored++;});
  return {rows,ignored};
 },
 header(text){
  const g=re=>{const m=text.match(re);return m?m[1]:'';};
  const opening=clp(g(/Saldo\s+inicial\s*:?\s*(-?\$?\s*\d[\d.]*)/i)),from=g(/Desde\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i),to=g(/Hasta\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const iso=v=>{const m=v.match(DATE);return m?isoDate(m[1],m[2],m[3]):'';};
  return {opening,from:iso(from),to:iso(to)};
 }
};

// ---- Mercado Pago · pantalla «Actividad» (seleccionar todo y copiar) ----
// Bloques:  Nombre ⏎ hh:mm ⏎ (nombre repetido) ⏎ Tipo ⏎ [Medio] ⏎ Estado ⏎ + / - ⏎ $ ⏎ monto,  bajo encabezados «23 de octubre».
// No trae saldo ni año: el año sale de la fecha de hoy (la lista va de lo más nuevo a lo más antiguo).
// Solo se importan los «Aprobado»; los demás se muestran como omitidos.
const MESES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
const MP_DAY=/^(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+(?:de\s+|del\s+)?(\d{4}))?$/i,MP_TIME=/^\d{1,2}:\d{2}$/;
const MP_STATUS=/^(aprobado|devuelto parcialmente|rechazado|cancelado|devuelto|reembolsado|pendiente|en proceso|en mediaci[oó]n|contracargo|anulado|expirado)$/i;
const shiftDay=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const mercadopago={
 id:'mercadopago',name:'Mercado Pago · Actividad',account:/mercado/i,noBalance:true,
 detect(text){return /\b\d{1,2}:\d{2}\b/.test(text)&&/transferencia|pago|aprobado/i.test(text)?this.read(text).rows.length:0;},
 read(text,opts={}){
  const L=String(text||'').split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
  const today=opts.today||new Date().toISOString().slice(0,10),rows=[];
  let year=Number(today.slice(0,4)),lastM=null,day='',ignored=0;
  for(let i=0;i<L.length;i++){
   const l=L[i];
   if(/^hoy$/i.test(l)||/^ayer$/i.test(l)){day=/^hoy$/i.test(l)?today:shiftDay(today,-1);lastM=Number(day.slice(5,7));year=Number(day.slice(0,4));continue;}
   const dm=l.match(MP_DAY);
   if(dm&&MESES[dm[2].toLowerCase()]){
    const m=MESES[dm[2].toLowerCase()];
    if(dm[3])year=Number(dm[3]);else if(lastM===null){if((isoDate(dm[1],m,year)||'9')>today)year--;}else if(m>lastM)year--;
    lastM=m;day=isoDate(dm[1],m,year);continue;
   }
   if(!MP_TIME.test(l)||!day||i===0)continue;
   const name=L[i-1],mid=[];let sign='',amount=null,j=i+1;
   for(;j<L.length&&j<i+14;j++){
    const t=L[j],one=t.match(/^([+\-−])\s*\$\s*(\d[\d.]*)(?:,\d{1,2})?$/);
    if(one){sign=one[1];amount=clp(one[2]);break;}
    if(/^[+\-−]$/.test(t)&&L[j+1]==='$'&&clp(L[j+2])!==null){sign=t;amount=clp(L[j+2]);j+=2;break;}
    if(MP_TIME.test(t)||MP_DAY.test(t))break;
    mid.push(t);
   }
   if(!amount){ignored++;continue;}
   const info=mid.filter(t=>t.split(name).join('').trim()!==''),status=info.find(t=>MP_STATUS.test(t))||'',rest=info.filter(t=>t!==status);
   // «Operación 1234» es el número de operación de Mercado Pago (el mismo de la API): sirve para cruzar exacto.
   const opLine=rest.find(t=>/^Operaci[oó]n \d{6,}$/.test(t)),op=opLine?opLine.replace(/\D/g,''):'',words=rest.filter(t=>t!==opLine);
   const type=words[0]||'',method=words.slice(1).join(' · ');
   const description=[type,name].filter(Boolean).join(' · ')+(op?' · Op. '+op:'');
   rows.push({date:day,time:l,counterpart:name,type,method,status,description,doc:op,op,amount,balance:null,direction:sign==='+'?'ENTRADA':'SALIDA'});
   i=j;
  }
  return {rows,ignored};
 }
};
// Cruza lo pegado con lo que ya está en la cuenta (sincronizado por la API o pegado antes). Primero por número de operación
// (la API guarda las ventas con link netas de comisión: el monto no calza). Después mismo sentido y monto,
// primero el mismo día y después ±1 día. Cada movimiento existente se usa una sola vez (5 transferencias iguales = 5).
function matchExisting(rows,existing){
 const used=new Set(),dd=(a,b)=>Math.abs(Date.parse(a)-Date.parse(b))/864e5,pool=(existing||[]).filter(e=>e&&e.date);
 const pass=(how,ok)=>rows.forEach(r=>{if(r.skip||r.match)return;const m=pool.find(e=>!used.has(e.id)&&ok(r,e));if(m){used.add(m.id);r.match=m;r.how=how;}});
 const same=(r,e)=>!(r.op&&e.op&&e.op!==r.op)&&e.amount===r.amount,dir=(r,e)=>!e.direction||e.direction===r.direction;
 pass('op',(r,e)=>r.op&&e.op===r.op);
 pass('dia',(r,e)=>same(r,e)&&dir(r,e)&&dd(e.date,r.date)===0);
 pass('±1',(r,e)=>same(r,e)&&dir(r,e)&&dd(e.date,r.date)<=1);
 pass('±3',(r,e)=>same(r,e)&&dir(r,e)&&dd(e.date,r.date)<=3);   // pagos con tarjeta: la API los fecha al liquidarse
 pass('sentido',(r,e)=>same(r,e)&&e.direction&&e.direction!==r.direction&&dd(e.date,r.date)<=1); // mismo movimiento con el sentido al revés
 rows.forEach(r=>{r.state=r.skip?'skip':r.match?'dup':'new';r.dirFix=!!(r.match&&r.match.direction!==r.direction);});
 return rows;
}
const FORMATS=[scotiabank,mercadopago];


function detect(text){
 let best=null,score=0;FORMATS.forEach(f=>{const n=f.detect(String(text||''));if(n>score){score=n;best=f;}});
 return best;
}

// opening: saldo antes de la primera línea (número) · known: saldos de cartola ya guardados en la cuenta (para anclar sin encabezado).
function parse(text,opts={}){
 const src=String(text||''),format=opts.format?FORMATS.find(f=>f.id===opts.format):detect(src);
 if(!format)return {format:null,rows:[],ignored:0,ok:false,error:'No reconozco el formato. Pega las líneas de movimientos tal como salen de la cartola.'};
 if(format.noBalance){
  const read=format.read(src,opts),rows=read.rows.map((r,i)=>({line:i+1,...r}));
  rows.forEach(r=>{if(!/^(aprobado|devuelto parcialmente)$/i.test(r.status))r.skip=r.status||'Sin estado';});
  const ok=rows.filter(r=>!r.skip),sum=d=>ok.filter(r=>r.direction===d).reduce((t,r)=>t+r.amount,0);
  return {format:{id:format.id,name:format.name,noBalance:true},header:{},rows,ignored:read.ignored,opening:null,openingSource:'',final:null,totals:{in:sum('ENTRADA'),out:sum('SALIDA')},bad:0,needsOpening:false,
   ok:ok.length>0,error:!rows.length?'No encontré movimientos en el texto pegado.':''};
 }
 const header=format.header?format.header(src):{},read=format.read(src),ignored=read.ignored;
 const rows=read.rows.map((r,i)=>({line:i+1,...r}));
 // Saldo de partida: el que escribió el usuario, el del encabezado pegado o uno ya guardado que encaje con la primera línea.
 let opening=Number.isFinite(opts.opening)?opts.opening:null,openingSource=opening!==null?'manual':'';
 if(opening===null&&Number.isFinite(header.opening)){opening=header.opening;openingSource='cartola';}
 if(opening===null&&rows.length&&opts.known&&opts.known.length){
  const f=rows[0],cands=f.direction?[f.balance+(f.direction==='ENTRADA'?-f.amount:f.amount)]:[f.balance-f.amount,f.balance+f.amount];
  const hit=[...new Set(cands.filter(c=>opts.known.includes(c)))];if(hit.length===1){opening=hit[0];openingSource='anterior';}
 }
 let prev=opening,inn=0,out=0;
 rows.forEach(r=>{
  if(prev===null){r.error='Falta el saldo inicial';prev=r.balance;return;}
  const d=r.balance-prev;
  if(r.direction){if(d!==(r.direction==='ENTRADA'?r.amount:-r.amount))r.error='Descuadre: el saldo no calza con el monto';}
  else if(d===r.amount)r.direction='ENTRADA';else if(d===-r.amount)r.direction='SALIDA';else r.error='Descuadre: el saldo no calza con el monto';
  if(!r.error){if(r.direction==='ENTRADA')inn+=r.amount;else out+=r.amount;}
  prev=r.balance;
 });
 const bad=rows.filter(r=>r.error).length,needsOpening=opening===null&&rows.length>0;
 return {format:{id:format.id,name:format.name},header,rows,ignored,opening,openingSource,final:rows.length?rows[rows.length-1].balance:opening,totals:{in:inn,out},bad,needsOpening,
  ok:rows.length>0&&!bad,error:!rows.length?'No encontré movimientos en el texto pegado.':''};
}
// Huella única del movimiento en su cuenta. El saldo distingue dos cargos iguales el mismo día.
function fingerprint(accountId,r){return ['CARTOLA',accountId,r.date,r.direction,r.amount,r.balance,r.doc||''].join('|');}
// Cuenta sugerida para el formato detectado.
function accountFor(format,accounts){const f=format&&FORMATS.find(x=>x.id===format.id);if(!f||!f.account)return null;const m=(accounts||[]).filter(a=>f.account.test(a.name));return m.length===1?m[0]:null;}

const api={FORMATS,detect,parse,fingerprint,accountFor,clp,matchExisting};
if(typeof module!=='undefined')module.exports=api;
root.OCCartolas=api;
})(typeof globalThis==='undefined'?this:globalThis);
