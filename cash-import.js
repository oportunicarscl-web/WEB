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
 root.OCCashImport=api;
})(typeof window==='undefined'?globalThis:window);
