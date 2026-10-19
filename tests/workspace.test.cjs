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
 assert.equal(canAccess('operativo','finanzas'),false);
 assert.equal(canAccess('operativo','parametros'),false);
 assert.equal(canAccess('gerencial','finanzas'),true);
 assert.equal(canAccess('gerencial','parametros'),false);
 assert.equal(canAccess('administrador','parametros'),true);
 assert.equal(canAccess(null,'maestros'),false);
});
test('Cada una de las 59 tablas tiene un módulo; usuarios no se filtran por maestros',()=>{
 const vm=require('node:vm'),fs=require('node:fs');const context={window:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../schema.js'),'utf8'),context);
 const schema=context.window.OCSchema;
 const covered=new Set(roles.administrador.areas.flatMap(a=>tablesFor(a,schema).map(t=>t.name)));
 assert.equal(schema.tables.length,59);assert.equal(covered.size,59);
 assert.equal(tablesFor('maestros',schema).some(t=>t.name==='USUARIOS'),false);
 assert.equal(tablesFor('inexistente',schema).length,0);
});
