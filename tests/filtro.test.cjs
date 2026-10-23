const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs');
test('filtro de cuentas: por defecto todas, se alterna y no deja ninguna vacía',()=>{
 const g={console,setTimeout,Date,Number,Math,String,Array,Object,Set,Map,JSON,Promise,Intl,FormData:class{}};g.globalThis=g;g.document={querySelectorAll:()=>[],createElement:()=>({})};vm.createContext(g);
 vm.runInContext(fs.readFileSync(__dirname+'/../caja-nueva.js','utf8'),g);const N=g.OCCajaNueva;
 const mk=o=>({id:'m'+Math.random(),accountId:'a',account:'A',date:'2026-10-16',direction:'ENTRADA',directionInferred:false,confirmed:false,amount:100,description:'x',classification:null,source:'',status:'PENDIENTE',version:1,...o});
 N.setup({cashStart:'2026-10-15',accountsInfo:()=>[{id:'a',name:'Banco A',opening:0,version:1},{id:'b',name:'Banco B',opening:0,version:1}],movements:[mk({accountId:'a',description:'de A'}),mk({accountId:'b',account:'B',description:'de B'})],concepts:[],inventory:[]});
 const cards=[];const el={innerHTML:'',querySelector:()=>null,id:'oc-caja-nueva',querySelectorAll:sel=>sel==='[data-acc]'?cards:[]};
 const draw=()=>{cards.length=0;N.mount({querySelector:()=>el});const ids=[...el.innerHTML.matchAll(/data-acc="(\w+)"/g)].map(m=>m[1]);ids.forEach(id=>cards.push({dataset:{acc:id},set onclick(f){this._c=f;}, click(){this._c();}}));
  // re-monta para enganchar los handlers
  N.mount({querySelector:()=>el});return el.innerHTML;};
 let h=draw();assert.ok(/de A/.test(h)&&/de B/.test(h));assert.equal((h.match(/cn-sel/g)||[]).length,2);
 cards[0].click();h=el.innerHTML;assert.ok(!/de A/.test(h)&&/de B/.test(h),'A oculta');assert.equal((h.match(/cn-off/g)||[]).length,1);
 cards.length=0;[...el.innerHTML.matchAll(/data-acc="(\w+)"/g)].forEach(m=>cards.push({dataset:{acc:m[1]}}));
});
