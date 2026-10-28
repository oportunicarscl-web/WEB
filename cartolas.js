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
const FORMATS=[scotiabank];

function detect(text){
 let best=null,score=0;FORMATS.forEach(f=>{const n=f.detect(String(text||''));if(n>score){score=n;best=f;}});
 return best;
}

// opening: saldo antes de la primera línea (número) · known: saldos de cartola ya guardados en la cuenta (para anclar sin encabezado).
function parse(text,opts={}){
 const src=String(text||''),format=opts.format?FORMATS.find(f=>f.id===opts.format):detect(src);
 if(!format)return {format:null,rows:[],ignored:0,ok:false,error:'No reconozco el formato. Pega las líneas de movimientos tal como salen de la cartola.'};
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

const api={FORMATS,detect,parse,fingerprint,accountFor,clp};
if(typeof module!=='undefined')module.exports=api;
root.OCCartolas=api;
})(typeof globalThis==='undefined'?this:globalThis);
