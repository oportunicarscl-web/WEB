(function(root){
'use strict';
// Tablero gerencial estilo terminal: lo esencial en una pantalla, con el histórico de 12 meses al lado de cada número.
// Lee los mismos datos que el resto (reporte de la caja) y usa los cálculos de Rentabilidad (monthly, breakeven, stock).
const MES=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fin=n=>typeof n==='number'&&Number.isFinite(n);
// Montos compactos: $12,4M · $850K · $9.000
const short=n=>{if(!fin(n))return '—';const a=Math.abs(n),s=n<0?'−':'';if(a>=1e6)return s+'$'+(a/1e6).toFixed(a>=1e8?0:1).replace('.',',')+'M';if(a>=1e4)return s+'$'+Math.round(a/1e3)+'K';return s+'$'+Math.round(a).toLocaleString('es-CL');};
const full=n=>fin(n)?(n<0?'−':'')+'$'+Math.round(Math.abs(n)).toLocaleString('es-CL'):'—';
const lab=p=>MES[Number(p.slice(5,7))-1]+' '+p.slice(2,4);
const addMonths=(p,k)=>{let y=Number(p.slice(0,4)),m=Number(p.slice(5,7))+k;while(m>12){m-=12;y++;}while(m<1){m+=12;y--;}return y+'-'+String(m).padStart(2,'0');};

// Mini gráfico de línea (o barras con signo) para 12 valores.
function spark(vals,opt={}){
 const w=120,h=32,v=vals.map(x=>fin(x)?x:null),nums=v.filter(x=>x!==null);if(nums.length<2)return '<svg class="tb-spark" viewBox="0 0 '+w+' '+h+'"></svg>';
 const min=Math.min(0,...nums),max=Math.max(0,...nums),rng=max-min||1,X=i=>i/(v.length-1)*w,Y=x=>h-2-(x-min)/rng*(h-4);
 if(opt.bars){const bw=w/v.length-2;return '<svg class="tb-spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+v.map((x,i)=>x===null?'':'<rect x="'+(i*(w/v.length)+1)+'" y="'+Math.min(Y(x),Y(0))+'" width="'+bw+'" height="'+Math.max(1,Math.abs(Y(x)-Y(0)))+'" class="'+(x<0?'neg':'pos')+(i===v.length-1?' cur':'')+'"/>').join('')+'</svg>';}
 let d='';v.forEach((x,i)=>{if(x!==null)d+=(d?'L':'M')+X(i).toFixed(1)+' '+Y(x).toFixed(1);});
 const li=v.map((x,i)=>x===null?-1:i).filter(i=>i>=0).pop();
 return '<svg class="tb-spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+(min<0?'<line x1="0" x2="'+w+'" y1="'+Y(0)+'" y2="'+Y(0)+'" class="zero"/>':'')+'<path d="'+d+'"/><circle cx="'+X(li)+'" cy="'+Y(v[li])+'" r="2.4"/></svg>';
}
const delta=(cur,prev,invert)=>{if(!fin(cur)||!fin(prev))return '';const d=cur-prev,up=d>=0,good=invert?!up:up;return '<span class="tb-d '+(d===0?'':good?'up':'down')+'">'+(d===0?'＝':up?'▲':'▼')+' '+short(Math.abs(d))+' vs mes ant.</span>';};

function render(st,today){
 const R=st.report||{},cars=R.cars||[],RT=root.OCRentabilidad;if(!RT)return '';
 const rows=RT.monthly(st.movements,cars,today),be=RT.breakeven(rows,cars,today),stk=RT.stock(cars,null,today),prog=RT.progress(st.movements,today);
 const hist=(R.dashboard&&R.dashboard.history)||[],cur=today.slice(0,7),months=[];for(let k=11;k>=0;k--)months.push(addMonths(cur,-k));
 const M=p=>rows.find(r=>r.month===p)||{month:p,sold:0,margin:0,opex:0,result:0,otherIn:0,personal:0,inversion:0},H=p=>hist.find(h=>h.month===p)||{},P=p=>prog.find(x=>x.month===p)||{pct:null,un:0,n:0};
 const now=M(cur),prev=M(addMonths(cur,-1)),cash=(R.accounts||[]).reduce((s,a)=>s+(a.balance||0),0);
 const own=stk.filter(s=>s.own),capital=own.reduce((s,x)=>s+x.capital,0),avgDays=stk.length?Math.round(stk.reduce((s,x)=>s+(x.days||0),0)/stk.length):null,old=stk.filter(x=>x.level==='ROJO').length;
 const aport=(R.capital&&R.capital.total)||0,recov=cash+capital+(R.receivable||0)+(R.loanAsset||0)-(R.debt||0),recPct=aport?recov/aport*100:null;
 const un=(R.dashboard&&R.dashboard.unclassified)||{in:{},out:{}},unN=(un.in.count||0)+(un.out.count||0),unAmt=(un.in.sum||0)+(un.out.sum||0);
 const allN=prog.reduce((s,p)=>s+p.n,0),allUn=prog.reduce((s,p)=>s+p.un,0),conc=allN?100-allUn/allN*100:null;
 const dayN=Number(today.slice(8,10)),dim=Number(new Date(Date.UTC(Number(cur.slice(0,4)),Number(cur.slice(5,7)),0)).getUTCDate());
 const beCars=be.cars,bePct=beCars?Math.min(100,now.sold/beCars*100):0,pace=beCars?beCars*dayN/dim:null;
 const series=f=>months.map(f);

 const hero=(title,big,sub,sp,foot,cls)=>'<article class="tb-hero'+(cls?' '+cls:'')+'"><header>'+title+'</header><strong>'+big+'</strong><small>'+sub+'</small>'+sp+'<footer>'+foot+'</footer></article>';
 const tile=(title,val,sub,cls)=>'<article class="tb-tile'+(cls?' '+cls:'')+'"><header>'+title+'</header><b>'+val+'</b><small>'+sub+'</small></article>';

 const heroes=
  hero('RESULTADO DEL MES',short(now.result),'margen autos + otros ingresos − gastos de operación',spark(series(p=>M(p).result),{bars:true}),delta(now.result,prev.result)+' <span class="tb-mute">'+lab(addMonths(cur,-1))+': '+short(prev.result)+'</span>',now.result<0?'neg':'pos')+
  hero('AUTOS VENDIDOS',now.sold+'<em> / '+(beCars?beCars.toFixed(1).replace('.',','):'—')+'</em>','vendidos este mes / necesarios para cubrir gastos','<div class="tb-meter"><i style="width:'+bePct+'%"></i>'+(pace?'<s style="left:'+Math.min(100,pace/beCars*100)+'%" title="Ritmo esperado a hoy"></s>':'')+'</div>'+spark(series(p=>M(p).sold),{bars:true}),(be.missing?'Faltan <b>'+be.missing+'</b> · ':'')+'margen prom. '+short(be.perCar)+'/auto',now.sold>=(beCars||0)?'pos':'')+
  hero('CAJA',short(cash),'saldo de las cuentas hoy',spark(series(p=>H(p).balance)),'<span class="tb-mute">'+(R.accounts||[]).map(a=>esc(String(a.name).split(' ')[0])+' '+short(a.balance)).join(' · ')+'</span>')+
  hero('STOCK',stk.length+'<em> autos</em>',own.length+' propios · '+(stk.length-own.length)+' consignados',spark(series(p=>{const c=cars.filter(x=>x.entryDate&&x.entryDate.slice(0,7)<=p&&(!x.sold||!x.saleDate||x.saleDate.slice(0,7)>p)&&x.status!=='RETIRADO');return c.length;})),'capital propio <b>'+short(capital)+'</b> · '+(avgDays??'—')+' días prom.'+(old?' · <span class="tb-warn">'+old+' con +90 días</span>':''));

 const tiles=
  tile('GASTOS OPERACIÓN',short(now.opex),'prom. 3 meses '+short(be.opex))+
  tile('MARGEN POR AUTO',short(be.perCar),be.sample+' autos · 6 meses')+
  tile('CAPITAL SOCIOS',recPct===null?'—':Math.round(recPct)+'%','recuperable de '+short(aport),recPct!==null&&recPct<100?'warn':'')+
  tile('CONCILIACIÓN',conc===null?'—':Math.round(conc)+'%',unN+' movimientos sin asignar ('+short(unAmt)+')',conc!==null&&conc<95?'warn':'');

 const maxAbs=Math.max(1,...months.map(p=>Math.abs(M(p).result)));
 const table='<div class="tb-table"><table><thead><tr><th>MES</th><th>AUTOS</th><th>MARGEN</th><th>GASTOS</th><th>RESULTADO</th><th></th><th>CAJA FIN</th><th>SIN ASIGNAR</th></tr></thead><tbody>'+
  months.slice().reverse().map(p=>{const r=M(p),h=H(p),g=P(p),w=Math.abs(r.result)/maxAbs*100;
   return '<tr'+(p===cur?' class="cur"':'')+'><td>'+lab(p)+(p===cur?' ●':'')+'</td><td>'+(r.sold||'·')+'</td><td>'+short(r.margin)+'</td><td>'+short(r.opex)+'</td><td class="'+(r.result<0?'neg':'pos')+'">'+short(r.result)+'</td><td class="tb-barcell"><span class="'+(r.result<0?'neg':'pos')+'" style="width:'+w+'%"></span></td><td>'+short(h.balance)+'</td><td class="'+(g.pct>=5?'warn':'')+'">'+(g.n?Math.round(g.pct)+'%':'·')+'</td></tr>';}).join('')+
  '</tbody></table></div>';

 const stamp=new Date().toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'});
 return '<section class="tb"><div class="tb-bar"><span><b>OPORTUNICARS</b> · RESUMEN</span><span>'+Number(today.slice(8,10))+' '+MES[Number(today.slice(5,7))-1]+' '+today.slice(0,4)+' · '+stamp+'</span></div>'+
  '<div class="tb-heroes">'+heroes+'</div><div class="tb-tiles">'+tiles+'</div>'+
  '<div class="tb-sec"><span>ÚLTIMOS 12 MESES</span><small>resultado = margen de autos vendidos + otros ingresos − gastos de operación · fuera: transferencias, aportes, préstamos, personales, otros negocios y por aclarar</small></div>'+table+'</section>';
}
const api={render,spark,short};if(typeof module!=='undefined')module.exports=api;root.OCTablero=api;
})(typeof globalThis==='undefined'?this:globalThis);
