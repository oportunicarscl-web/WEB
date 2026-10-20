(function (root) {
  'use strict';
  const areas = [
    {id:'finanzas',name:'Caja y bancos',hint:'Movimientos y clasificación',tables:['MOVIMIENTOS_BANCARIOS','CONCEPTOS_CAJA']},
    {id:'operaciones',name:'Autos y operación',hint:'Registrar auto, completar ficha, vender y mantener el stock de Claxo',tables:['VEHICULOS','AUTOS_OPERACION','ACTIVIDADES_AUTOS']},
    {id:'gestion',name:'Finanzas y patrimonio',hint:'Rendimiento del capital, proyecciones y tamaño óptimo de flota',tables:['APORTES_CAPITAL_SOCIOS']},
    {id:'compromisos',name:'Compromisos no caja',hint:'Cobros, pagos y préstamos',tables:['PROYECCIONES','PRESTAMOS']},
    {id:'analitica',name:'Gerencia',hint:'Resultados consolidados',tables:[]},
    {id:'parametros',name:'Configuración',hint:'Cuentas, usuarios y conceptos',tables:['USUARIOS','CUENTAS_FINANCIERAS','PERFILES_IMPORTACION']}
  ];
  const roles = {
    operativo:{label:'Operaciones',home:'finanzas',areas:['finanzas','operaciones','analitica','compromisos']},
    gerencial:{label:'Gerencia',home:'finanzas',areas:areas.map(a=>a.id)},
    administrador:{label:'Administración',home:'finanzas',areas:areas.map(a=>a.id)},
    finanzas:{label:'Finanzas',home:'finanzas',areas:['finanzas','gestion','analitica','parametros']}
  };
  const assignments = Object.freeze({jt:'operativo',mmusa:'operativo',alex:'gerencial',gonzalo:'gerencial'});
  function resolveRole(user) {
    // Only administrator-controlled metadata. Never trust display names, localStorage or user_metadata.
    const m = user?.app_metadata || {};
    if (Object.hasOwn(roles,m.oc_role)) return m.oc_role;
    const username = typeof m.oc_username === 'string' ? m.oc_username.trim().toLowerCase() : '';
    return Object.hasOwn(assignments,username) ? assignments[username] : null;
  }
  function canAccess(role,area) { return !!roles[role]?.areas.includes(area); }
  function tablesFor(area,schema) {
    const a=areas.find(a=>a.id===area);
    return a ? schema.tables.filter(t=>(a.tables?.includes(t.name)||a.book===t.book)&&!a.exclude?.includes(t.name)) : [];
  }
  const api={resolveRole,canAccess,tablesFor,assignments,roles};
  if (typeof module !== 'undefined') module.exports=api;
  if (!root.document) return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=v=>v.toLowerCase().replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
  let host,session=null,role=null,view='',table='',query='',preview=false;
  function node(html) { const t=document.createElement('template');t.innerHTML=html;return t.content; }
  function close() {
    root.OCCaja?.reset();
    host?.remove();host=null;session=null;role=null;query='';table='';
    document.body.classList.remove('workspace-open');
    document.title='Oportunicars · Acceso';
  }
  function open(options) {
    close(); session=options; preview=options.preview===true;
    root.OCCaja?.setup({preview,userId:options.user?.id,...options.caja});
    root.OCSistema?.setup({...options.system,canManage:options.profile?.manage});
    role=preview?resolveRole(options.user):(Object.hasOwn(roles,options.profile?.role)?options.profile.role:null);view=role?roles[role].home:'pendiente';
    host=document.createElement('div');host.id='oc-workspace';
    document.body.append(host);document.body.classList.add('workspace-open');
    render();
  }
  // Por ahora solo Caja y bancos y Autos y operación están activas; el resto se ve en el menú pero no carga ni cambia la vista.
  const active=['finanzas','operaciones'];
  function navigate(next) {
    if(!active.includes(next))return;
    if (!['operacional','gerencial','pendiente'].includes(next)&&!canAccess(role,next)) return;
    if(next==='gerencial'&&!['gerencial','administrador','finanzas'].includes(role))return;
    // Las vistas se dibujan con los datos ya cargados: navegar no consulta a Google.
    view=next;table='';query='';render();
  }
  function render() {
    const name=session.profile?.name || session.user.app_metadata?.oc_username || session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuario';
    const title=view==='gerencial'?'Resumen gerencial':view==='operacional'?'Resumen operacional':view==='pendiente'?'Acceso pendiente':areas.find(a=>a.id===view)?.name;
    document.title=title+' · Oportunicars';
    host.replaceChildren(node(`
      <aside class="oc-sidebar"><a class="oc-brand" href="#" aria-label="Inicio Oportunicars"><b>oportuni<span>cars</span></b><small>GESTIÓN DEL NEGOCIO</small></a>
      <div class="oc-profile"><span class="oc-avatar">${esc(String(name).slice(0,2).toUpperCase())}</span><div><strong>${esc(name)}</strong><small>${role?roles[role].label:'Perfil por asignar'}</small></div></div>
      <nav aria-label="Áreas">${role?'<p class="oc-nav-label">TU ESPACIO</p>'+nav(['gerencial','administrador','finanzas'].includes(role)?'gerencial':'operacional','Resumen')+(['gerencial','administrador'].includes(role)?nav('operacional','Seguimiento operacional'):'')+
      '<p class="oc-nav-label">ÁREAS DE TRABAJO</p>'+areas.filter(a=>canAccess(role,a.id)).map(a=>nav(a.id,a.name)).join(''):''}</nav>
      <div class="oc-sidebar-bottom"><small>${preview?'VISTA PREVIA · SIN SESIÓN REAL':'Oportunicars · Sistema de Gestión'}</small><button id="oc-signout">Cerrar sesión</button></div></aside>
      <main class="oc-main"><header class="oc-header"><div><p class="oc-eyebrow">OPORTUNICARS / ${role?roles[role].label.toUpperCase():'ACCESO'}</p><h1 tabindex="-1">${title}</h1></div><span class="oc-status">${session.caja?.connected?'Google conectado':'Conexión de datos pendiente'}</span></header>
      ${preview?'<div class="oc-preview">Vista previa de diseño. Perfil de prueba; sin acceso a cuentas ni datos reales.</div>':''}
      <div id="oc-content">${view==='pendiente'?pending():['operacional','gerencial'].includes(view)?summary():moduleView()}</div>
</main>
    `));
    host.querySelector('.oc-brand').onclick=e=>{e.preventDefault();navigate(role?roles[role].home:'pendiente');};
    host.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
    host.querySelector('#oc-signout').onclick=()=>session.signOut();
    host.querySelectorAll('[data-table]').forEach(b=>b.onclick=()=>{table=b.dataset.table;query='';render();});
    const search=host.querySelector('#oc-search');
    if(search)search.oninput=()=>{query=search.value;renderTables();};
    host.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>showFields(b.dataset.detail));
    root.OCCaja?.mount(host);
    root.OCSistema?.mount(host);

  }
  function nav(id,text){const on=active.includes(id);return `<button data-nav="${id}" class="oc-nav ${view===id?'active':''}${on?'':' oc-nav-soon'}" ${view===id?'aria-current="page"':''}${on?'':' aria-disabled="true" tabindex="-1" title="Disponible próximamente"'}>${text}<span>${on?'↗':''}</span></button>`;}
  function pending(){if(session.connectionError)return '<section class="oc-empty"><h2>Conexión con Google pendiente</h2><p>'+esc(session.connectionError)+'</p><p>Tu sesión de acceso está verificada.</p></section>';return '<section class="oc-empty"><span class="oc-empty-icon">○</span><h2>Tu cuenta está verificada</h2><p>Falta que el administrador asigne tu perfil de trabajo. Una vez asignado, entra nuevamente para ver tu resumen y tus áreas.</p><p>No necesitas crear otra cuenta.</p></section>';}
  function summary(){return root.OCSistema?root.OCSistema.markup(view==='gerencial'?'analitica':'resumen'):pending();}
  function moduleView(){
    if(!canAccess(role,view))return pending();
    if(view==='finanzas'&&root.OCCaja)return root.OCCaja.markup();
    if(root.OCSistema)return root.OCSistema.markup(view);
    const ts=tablesFor(view,root.OCSchema);
    const selected=ts.find(t=>t.name===table);
    if(selected)return `<button data-nav="${view}" class="oc-back">← Volver a ${areas.find(a=>a.id===view).name}</button><section class="oc-card"><div class="oc-section-heading"><div><p class="oc-eyebrow">${esc(selected.book)}</p><h2>${label(selected.name)}</h2></div><button data-detail="${selected.name}">Ver campos y reglas</button></div><p>${esc(selected.grain)}</p><div class="oc-table-scroll"><table><thead><tr>${selected.fields.slice(0,7).map(f=>`<th>${label(f.name)}</th>`).join('')}</tr></thead><tbody><tr><td colspan="7"><div class="oc-empty"><h3>Esta tabla aún no está conectada</h3><p>La estructura está preparada. La consulta y el registro se habilitarán al conectar una fuente con permisos de servidor.</p></div></td></tr></tbody></table></div></section>`;
    return `<section class="oc-intro"><div><h2>${areas.find(a=>a.id===view).hint}</h2><p>Selecciona una sección para consultar su estructura y reglas.</p></div><label class="oc-search">Buscar sección<input id="oc-search" type="search" placeholder="Nombre de la sección" value="${esc(query)}"></label></section>${view==='finanzas'?'<div class="oc-notice"><strong>Mercado Pago · Pendientes de clasificar</strong><p>La revisión de operaciones se integrará aquí. No se muestran movimientos privados en esta versión de la interfaz.</p></div>':''}<div id="oc-tables">${tableCards(ts)}</div>${view==='parametros'?'<section class="oc-card"><h2>Perfiles de acceso</h2><p>jt y mmusa: Operaciones. Alex y Gonzalo: Gerencia. La asignación se administra en USUARIOS de Google.</p><p>Los permisos reales deben verificarse también al consultar o modificar datos.</p></section>':''}`;
  }
  function tableCards(ts){const filtered=ts.filter(t=>label(t.name).toLowerCase().includes(query.toLowerCase()));return filtered.length?`<div class="oc-area-grid">${filtered.map(t=>`<button class="oc-area" data-table="${t.name}"><small>${t.fields.length} CAMPOS</small><strong>${label(t.name)} <span>↗</span></strong><p>${esc(t.grain)}</p></button>`).join('')}</div>`:'<p role="status">No hay secciones que coincidan con la búsqueda.</p>';}
  function renderTables(){const target=host.querySelector('#oc-tables');target.innerHTML=tableCards(tablesFor(view,root.OCSchema));target.querySelectorAll('[data-table]').forEach(b=>b.onclick=()=>{table=b.dataset.table;render();});}
  function showFields(name){
    const t=tablesFor(view,root.OCSchema).find(t=>t.name===name);if(!t)return;
    const dialog=document.createElement('dialog');dialog.className='oc-dialog';
    dialog.append(node(`<form method="dialog"><button class="oc-close" aria-label="Cerrar">×</button><h2>${label(t.name)}</h2><p>Diccionario de campos</p><div class="oc-table-scroll"><table><thead><tr><th>Campo</th><th>Tipo</th><th>Regla</th></tr></thead><tbody>${t.fields.map(f=>`<tr><td>${esc(f.name)}${f.required?' *':''}</td><td>${esc(f.type)}</td><td>${esc(f.ref?'Referencia: '+f.ref:f.catalog?(root.OCSchema.catalogs[f.catalog]||[]).join(' · '):f.pk?'Identificador único':f.calculated?'Calculado':'—')}</td></tr>`).join('')}</tbody></table></div><p>* Campo obligatorio. Estas reglas se aplicarán también en el servidor al habilitar el registro.</p></form>`));
    host.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
  }
  root.OCWorkspace={...api,open,close};
})(typeof window==='undefined'?globalThis:window);
