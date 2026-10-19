const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveRole,canAccess,tablesFor,roles}=require('../workspace.js');
test('Los cuatro perfiles acordados usan metadata administrada',()=>{
 for(const [name,role] of Object.entries({jt:'operativo',mmusa:'operativo',alex:'gerencial',gonzalo:'gerencial'}))
  assert.equal(resolveRole({app_metadata:{oc_username:name}}),role);
});
test('El nombre visible y el correo no conceden permisos',()=>{
 assert.equal(resolveRole({user_metadata:{name:'alex',oc_role:'administrador'},email:'alex@example.com'}),null);
 assert.equal(resolveRole({app_metadata:{oc_username:'__proto__',oc_role:'toString'}}),null);
 assert.equal(resolveRole(null),null);
});
test('Separación entre operación, gerencia y administración',()=>{
 assert.equal(roles.operativo.home,'operacional');assert.equal(roles.gerencial.home,'gerencial');
 assert.equal(canAccess('operativo','finanzas'),true);
 assert.equal(canAccess('administrador','contabilidad'),false);
 assert.equal(canAccess('operativo','parametros'),false);
 assert.equal(canAccess('gerencial','finanzas'),true);
 assert.equal(canAccess('gerencial','parametros'),true);
 assert.equal(canAccess('administrador','parametros'),true);
 assert.equal(canAccess(null,'maestros'),false);
});
test('Contabilidad queda fuera del menú; las tablas se conservan y usuarios no se filtran',()=>{
 const vm=require('node:vm'),fs=require('node:fs');const context={window:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../schema.js'),'utf8'),context);
 const schema=context.window.OCSchema;
 const covered=new Set(roles.administrador.areas.flatMap(a=>tablesFor(a,schema).map(t=>t.name)));
 assert.equal(schema.tables.length,13);
 for(const name of ['CENTROS_COSTO','PRECIOS_HISTORICOS','PROSPECTOS','DOCUMENTOS_FINANCIEROS','PLAN_CUENTAS','ASIENTOS','ASIENTO_LINEAS','PERIODOS','MOVIMIENTOS_SOCIOS']) assert.equal(schema.tables.some(t=>t.name===name),false);
 const names=new Set(schema.tables.map(t=>t.name));
 for(const t of schema.tables)for(const f of t.fields)if(f.ref)assert.ok(names.has(f.ref),t.name+'.'+f.name);
 assert.equal(roles.administrador.areas.length,6);
 assert.equal(canAccess('operativo','gestion'),false);
 assert.equal(canAccess('gerencial','gestion'),true);
 assert.equal(tablesFor('maestros',schema).some(t=>t.name==='USUARIOS'),false);
 assert.equal(tablesFor('inexistente',schema).length,0);
});
