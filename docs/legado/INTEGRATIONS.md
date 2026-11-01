> Rescatado del repo antiguo joacoAviles/aviarockets.cl (demo React con datos ficticios, sept-2026) antes de eliminarlo. Referencia histórica; no describe el sistema actual.

# Integraciones y roadmap

Fecha de revisión: 05-10-2026. **Ninguna conexión está activa.** Los horizontes son una propuesta que depende de contratos, permisos, equipo y validación técnica. Las APIs documentadas no garantizan acceso para esta empresa.

## Corto plazo · 0–3 meses

| Proveedor | Evidencia y alcance | Condiciones antes de implementar |
|---|---|---|
| [Chileautos](https://www.chileautos.cl/staticpages/global-inventory-integration) | Documentación pública de stock y leads | Contrato, habilitación de integrador, validación de formato. La API de stock no autoriza extraer precios de todos los avisos. |
| [Mercado Libre](https://developers.mercadolibre.cl/es_cl/publica-vehiculos) | API de publicación de vehículos | OAuth, cuenta habilitada, categorías/atributos y condiciones. Validar cambios recientes de contacto para dealers. |
| [Boostr](https://github.com/boostrapps/api-patentes-chile) | Consulta de patente documentada | API key, plan, cobertura, procedencia, precisión y licencia. No se asume acceso a VIN o PRT en el mismo endpoint. |
| [Bsale](https://docs.bsale.dev/) | API pública para integración | Acceso comercial, mapeo de documentos y pagos, plan de cuentas y validación tributaria. |
| [Khipu](https://docs.khipu.com/) | APIs de pagos y datos | Cuenta comercial, callbacks/webhooks verificados, idempotencia y conciliación con reservas. |

Primera etapa productiva recomendada: persistencia/roles en servidor, importación validada, catálogos, documentos de respaldo y conciliación manual antes de conectar canales. La importación del Excel debe reportar errores y exigir revisión de las categorías, no transferir ciegamente sumatorias.

## Mediano plazo · 3–6 meses

| Proveedor | Evidencia y alcance | Condiciones antes de implementar |
|---|---|---|
| [Fintoc](https://docs.fintoc.com/docs/products-and-institutions-movements) | Productos de movimientos y conciliación | Contrato, consentimiento, cobertura bancaria, frecuencia y manejo de reversas. |
| [Nubox](https://developers.nubox.com/) | Portal describe comprobantes/asientos, documentos y pagos | Acceso partner, mapeo contable y clasificación de operaciones. |
| [Defontana](https://apiintegraciones.defontana.com/inicio) | Portal público de integraciones | Validar endpoints, permisos y contrato; no se probó un endpoint autenticado. |
| [SII](https://www.sii.cl/destacados/factura_electronica/factura_etapas_5.html) | Requisitos para certificación DTE en sistemas propios/de mercado | Emisor habilitado, certificado digital, folios y pruebas; preferir proveedor adecuado al caso. No aplicar IVA uniforme a todos los vehículos/consignaciones. |
| [Autofact](https://www.autofact.cl/) | Candidato para antecedentes e informes | API empresarial, permisos, licencias y cobertura pendientes de confirmación; no se verificó una API abierta. |
| [Meta / WhatsApp](https://developers.facebook.com/docs/whatsapp/cloud-api/) | Candidato para comunicación y leads | Validar permisos, revisión de app, consentimiento, ventanas y plantillas. No equiparar WhatsApp o Lead Ads a publicación en Facebook Marketplace. |
| [Chipax](https://www.chipax.com/) | Referencia pública de finanzas y conciliación | API o intercambio exportable por confirmar con proveedor. |

En esta fase: asientos de doble partida, auxiliares CxC/CxP, notas de crédito, devoluciones, contratos de consignación, retomas enlazadas, cierres mensuales y conciliación muchos-a-muchos.

## Largo plazo · 6–12+ meses

- [Yapo](https://www.yapo.cl/): confirmar canal comercial y acuerdo de integración; publicación manual asistida como alternativa. No se verificó API abierta.
- Inteligencia de mercado: licenciar comparables de proveedores/portales, registrar fuente y fecha, deduplicar, normalizar versión/km/equipamiento y medir error. No hacer scraping sin condiciones de uso compatibles. El acceso a publicaciones propias no otorga acceso general al mercado.
- VIN, PRT y tasación: verificar capacidades por proveedor; [PRT](https://www.prt.cl/) es referencia de consulta, no evidencia de API pública. Registrar calidad y antigüedad de datos. No inventar historial vehicular ante una consulta fallida.
- Open finance y crédito: evaluar cobertura, consentimiento y requisitos aplicables con proveedor y asesoría pertinente; [Khipu](https://docs.khipu.com/) publica productos de datos. No se presume acceso regulatorio universal ni aprobación de créditos automática.
- Evaluar firma electrónica, ERP multi-sucursal, almacenamiento documental, observabilidad y controles de seguridad una vez definido el sistema productivo.

## Diseño de conectores futuros

Adaptadores separados para publicación, leads, vehículo, bancos y contabilidad; contratos tipados, cola de salida, reintentos con límites, IDs externos, deduplicación, webhooks firmados y estados por canal. Guardar origen, fecha y licencia de datos. Secretos exclusivamente en servidor; separar sandbox/productivo. Auditoría de la operación de negocio y de la entrega al proveedor. Esta arquitectura es propuesta, no código conectado en la demo.
