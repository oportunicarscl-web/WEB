// Genera backend/CorreoSistema.gs: copia privada del motor de reportes actual (system-core.js) para el correo en Apps Script.
// No pisa el OCSystemCore global del proyecto (más antiguo y usado por acciones heredadas): queda en OCMailSystemCore.
// Uso: node tools/build-correo-sistema.cjs
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','system-core.js'),'utf8');
const tail="})(typeof globalThis==='undefined'?this:globalThis);";
if(!src.trimEnd().endsWith(tail))throw Error('system-core.js cambió su cierre: revisar el generador.');
const body=src.trimEnd().slice(0,-tail.length)+'})(OC_MAIL_SYS_ROOT);';
const out='// GENERADO por tools/build-correo-sistema.cjs desde system-core.js. No editar a mano.\n'+
 '// Copia privada del motor de reportes para el correo gerencial (OCMailSystemCore).\n'+
 'var OC_MAIL_SYS_ROOT={};\n'+body+'\nvar OCMailSystemCore=OC_MAIL_SYS_ROOT.OCSystemCore;\n';
fs.writeFileSync(path.join(__dirname,'..','backend','CorreoSistema.gs'),out);
console.log('backend/CorreoSistema.gs',out.length,'bytes');
