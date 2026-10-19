(function (root) {
  'use strict';
  const areas = [
    {id:'comercial',name:'Comercial',hint:'Prospectos, reservas y ventas',tables:['PROSPECTOS','RESERVAS','VENTAS','VENTA_DETALLES','PRECIOS_HISTORICOS']},
    {id:'operaciones',name:'Operaciones',hint:'Ingresos, preparación y entregas',tables:['INGRESOS_VEHICULOS','COMPRAS','CONSIGNACIONES','COSTOS_VEHICULOS','ENTREGAS','GARANTIAS','TAREAS']},
    {id:'finanzas',name:'Finanzas',hint:'Cobros, pagos y conciliación',book:'OC_03_FINANZAS'},
    {id:'contabilidad',name:'Contabilidad',hint:'Cuentas, asientos y cierres',book:'OC_04_CONTABILIDAD'},
    {id:'maestros',name:'Datos maestros',hint:'Vehículos, personas y empresas',book:'OC_01_MAESTROS',exclude:['USUARIOS','PARAMETROS']},
    {id:'control',name:'Control',hint:'Auditoría e importaciones',book:'OC_05_CONTROL'},
    {id:'analitica',name:'Informes',hint:'Resultados y seguimiento',book:'OC_06_ANALITICA'},
    {id:'parametros',name:'Parámetros',hint:'Catálogos, usuarios y configuración',tables:['USUARIOS','PARAMETROS']}
  ];
  const roles = {
    operativo:{label:'Operaciones',home:'operacional',areas:['comercial','operaciones','maestros']},
    gerencial:{label:'Gerencia',home:'gerencial',areas:['comercial','operaciones','finanzas','contabilidad','maestros','control','analitica']},
    administrador:{label:'Administración',home:'gerencial',areas:areas.map(a=>a.id)},
    finanzas:{label:'Finanzas',home:'operacional',areas:['finanzas','maestros']},
    contabilidad:{label:'Contabilidad',home:'operacional',areas:['contabilidad','finanzas']},
    comercial:{label:'Comercial',home:'operacional',areas:['comercial','maestros']}
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
    host?.remove();host=null;session=null;role=null;query='';table='';
    document.body.classList.remove('workspace-open');
    document.title='Oportunicars · Acceso';
  }
  function open(options) {
    close(); session=options; preview=options.preview===true;
    role=resolveRole(options.user);view=role?roles[role].home:'pendiente';
    host=document.createElement('div');host.id='oc-workspace';
    document.body.append(host);document.body.classList.add('workspace-open');
    render();
  }
  function navigate(next) {
    if (!['operacional','gerencial','pendiente'].includes(next)&&!canAccess(role,next)) return;
    if(next==='gerencial'&&!['gerencial','administrador'].includes(role))return;
    view=next;table='';query='';render();
  }
  function render() {
    const name=session.user.app_metadata?.oc_username || session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuario';
    const title=view==='gerencial'?'Resumen gerencial':view==='operacional'?'Resumen operacional':view==='pendiente'?'Acceso pendiente':areas.find(a=>a.id===view)?.name;
    document.title=title+' · Oportunicars';
    host.replaceChildren(node(`
      <aside class="oc-sidebar"><a class="oc-brand" href="#" aria-label="Inicio Oportunicars"><b>oportuni<span>cars</span></b><small>GESTIÓN DEL NEGOCIO</small></a>
      <div class="oc-profile"><span class="oc-avatar">${esc(String(name).slice(0,2).toUpperCase())}</span><div><strong>${esc(name)}</strong><small>${role?roles[role].label:'Perfil por asignar'}</small></div></div>
      <nav aria-label="Áreas">${role?'<p class="oc-nav-label">TU ESPACIO</p>'+nav(roles[role].home,'Resumen')+(['gerencial','administrador'].includes(role)?nav('operacional','Seguimiento operacional'):'')+
      '<p class="oc-nav-label">ÁREAS DE TRABAJO</p>'+areas.filter(a=>canAccess(role,a.id)).map(a=>nav(a.id,a.name)).join(''):''}</nav>
      <div class="oc-sidebar-bottom"><small>${preview?'VISTA PREVIA · SIN SESIÓN REAL':'Oportunicars · Panel de trabajo'}</small><button id="oc-signout">Cerrar sesión</button></div></aside>
      <main class="oc-main"><header class="oc-header"><div><p class="oc-eyebrow">OPORTUNICARS / ${role?roles[role].label.toUpperCase():'ACCESO'}</p><h1 tabindex="-1">${title}</h1></div><span class="oc-status">Conexión de datos pendiente</span></header>
      ${preview?'<div class="oc-preview">Vista previa de interfaz. El perfil de prueba no concede acceso a cuentas ni datos reales.</div>':''}
      <div id="oc-content">${view==='pendiente'?pending():['operacional','gerencial'].includes(view)?summary():moduleView()}</div>
      <footer class="oc-footer">Los importes y resultados aparecerán cuando exista una fuente conectada y verificada.</footer></main>
    `));
    host.querySelector('.oc-brand').onclick=e=>{e.preventDefault();navigate(role?roles[role].home:'pendiente');};
    host.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
    host.querySelector('#oc-signout').onclick=()=>session.signOut();
    host.querySelectorAll('[data-table]').forEach(b=>b.onclick=()=>{table=b.dataset.table;query='';render();});
    const search=host.querySelector('#oc-search');
    if(search)search.oninput=()=>{query=search.value;renderTables();};
    host.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>showFields(b.dataset.detail));
    host.querySelector('h1')?.focus({preventScroll:true});
  }
  function nav(id,text){return `<button data-nav="${id}" class="oc-nav ${view===id?'active':''}" ${view===id?'aria-current="page"':''}>${text}<span>↗</span></button>`;}
  function pending(){return '<section class="oc-empty"><span class="oc-empty-icon">○</span><h2>Tu cuenta está verificada</h2><p>Falta que el administrador asigne tu perfil de trabajo. Una vez asignado, entra nuevamente para ver tu resumen y tus áreas.</p><p>No necesitas crear otra cuenta.</p></section>';}
  function summary() {
    const manager=view==='gerencial';
    const metrics=manager?[['Ventas del período','Operaciones cerradas'],['Margen operacional','Ingresos y costos verificados'],['Caja disponible','Cuentas conciliadas'],['Inventario','Vehículos y capital invertido']]:
      [['Pendientes de hoy','Tareas y vencimientos'],['Vehículos en preparación','Trabajo en curso'],['Reservas activas','Seguimiento comercial'],['Próximas entregas','Compromisos por cumplir']];
    const allowed=areas.filter(a=>canAccess(role,a.id));
    return `<section class="oc-intro"><div><h2>${manager?'Una mirada completa al negocio.':'Lo importante para avanzar hoy.'}</h2><p>${manager?'Resultados, exposición y decisiones pendientes en un solo lugar.':'Organiza el trabajo diario y entra directamente al área que necesitas.'}</p></div><span class="oc-date">${new Intl.DateTimeFormat('es-CL',{dateStyle:'long'}).format(new Date())}</span></section>
    <section class="oc-metrics" aria-label="Indicadores">${metrics.map(([n,d])=>`<article><p>${n}</p><strong>—</strong><small>${d}</small><span>Sin datos conectados</span></article>`).join('')}</section>
    <div class="oc-columns"><section class="oc-card"><div class="oc-section-heading"><h2>${manager?'Prioridades de gestión':'Tu agenda de trabajo'}</h2><span>Por conectar</span></div>
    <div class="oc-agenda">${(manager?['Revisar resultados del período','Conciliar movimientos pendientes','Evaluar antigüedad del inventario']:['Revisar preparación de vehículos','Confirmar reservas y entregas','Resolver tareas y documentación']).map((s,i)=>`<div><span class="oc-number">0${i+1}</span><div><strong>${s}</strong><p>Los pendientes reales aparecerán al conectar los datos.</p></div></div>`).join('')}</div></section>
    <section class="oc-card oc-dark"><p class="oc-eyebrow">SIGUIENTE PASO</p><h2>${manager?'Del movimiento al resultado.':'Cada operación, en su lugar.'}</h2><p>${manager?'La clasificación y conciliación financiera alimentarán el flujo de caja. Un historial de pagos sin dirección confirmada no equivale a un saldo.':'Registra y consulta el ciclo de cada vehículo, desde su ingreso hasta la entrega.'}</p><button data-nav="${manager?'finanzas':allowed.some(a=>a.id==='operaciones')?'operaciones':allowed[0].id}">Ir al área <span>↗</span></button></section></div>
    <section><div class="oc-section-heading"><h2>Áreas de trabajo</h2><span>Según tu perfil</span></div><div class="oc-area-grid">${allowed.map((a,i)=>`<button class="oc-area" data-nav="${a.id}"><small>0${i+1}</small><strong>${a.name} <span>↗</span></strong><p>${a.hint}</p></button>`).join('')}</div></section>`;
  }
  function moduleView(){
    if(!canAccess(role,view))return pending();
    const ts=tablesFor(view,root.OCSchema);
    const selected=ts.find(t=>t.name===table);
    if(selected)return `<button data-nav="${view}" class="oc-back">← Volver a ${areas.find(a=>a.id===view).name}</button><section class="oc-card"><div class="oc-section-heading"><div><p class="oc-eyebrow">${esc(selected.book)}</p><h2>${label(selected.name)}</h2></div><button data-detail="${selected.name}">Ver campos y reglas</button></div><p>${esc(selected.grain)}</p><div class="oc-table-scroll"><table><thead><tr>${selected.fields.slice(0,7).map(f=>`<th>${label(f.name)}</th>`).join('')}</tr></thead><tbody><tr><td colspan="7"><div class="oc-empty"><h3>Esta tabla aún no está conectada</h3><p>La estructura está preparada. La consulta y el registro se habilitarán al conectar una fuente con permisos de servidor.</p></div></td></tr></tbody></table></div></section>`;
    return `<section class="oc-intro"><div><h2>${areas.find(a=>a.id===view).hint}</h2><p>Selecciona una sección para consultar su estructura y reglas.</p></div><label class="oc-search">Buscar sección<input id="oc-search" type="search" placeholder="Nombre de la sección" value="${esc(query)}"></label></section>${view==='finanzas'?'<div class="oc-notice"><strong>Mercado Pago · Pendientes de clasificar</strong><p>La revisión de operaciones se integrará aquí. No se muestran movimientos privados en esta versión de la interfaz.</p></div>':''}<div id="oc-tables">${tableCards(ts)}</div>${view==='parametros'?'<section class="oc-card"><h2>Perfiles de acceso</h2><p>jt y mmusa: Operaciones. Alex y Gonzalo: Gerencia. La asignación se administra en el servicio de identidad.</p><p>Los permisos reales deben verificarse también al consultar o modificar datos.</p></section>':''}`;
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
