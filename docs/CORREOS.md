# Correos gerenciales

Menú de Alex › **Correos**. Configura el correo gerencial semanal: destinatarios (activar/pausar cada uno), frecuencia (semanal, cada 2 o cada 4 semanas), día, hora de Chile, asunto, mensaje opcional al inicio y secciones. La vista previa se arma con los datos ya cargados y el mismo motor del envío (`correo-core.js`), así que es exactamente lo que llega.

## Contenido (solo gerencial)

Período: los 7 días (o 14/28) que terminan el día anterior al envío; enviado un lunes es la semana lunes–domingo anterior. Compara con el período anterior.

- Números del período: autos vendidos, utilidad de ventas (venta − compra − costos), ingresos del negocio, flujo neto, caja, autos en stock, por cobrar, por pagar.
- Semáforo: ventas, rentabilidad, flujo, caja e inventario (>60 días).
- Flujo de caja de las últimas 8 semanas (ingresos del negocio, salidas, aportes de socios aparte).
- Ventas del período con utilidad y margen por auto, y utilidad por semana.
- Caja por cuenta y caja total al cierre de cada semana (desde el 15-oct-2026, igual que Caja y bancos).
- Inventario: propios/consignados, antigüedad del stock y costo de capital del stock propio (compra × tasa anual × días / 365; tasa configurable en Correos, 12 % por defecto).
- Autos para revisar precio: más de 60 días en stock o margen esperado negativo al precio publicado (compra + gastos + estacionamiento + capital). No hay precio de mercado conectado; la alerta no compara con avisos similares.
- En ventas: utilidad después del costo de capital de lo vendido.
- Capital de los socios: cuánto se recupera si hoy se cierra y se vende todo.
- Composición de gastos de las últimas 4 semanas.

No incluye nada operativo (movimientos por clasificar, tareas, pendientes). Los gráficos son tablas HTML para verse igual en Gmail, Apple Mail y Outlook. Colores de series validados para daltonismo.

## Apps Script

- `CorreoCore.gs` = copia de `correo-core.js`. `Correos.gs` = `backend/Correos.gs`. `CorreoSistema.gs` = copia privada del motor de reportes actual (`OCMailSystemCore`), generada con `node tools/build-correo-sistema.cjs`: el `OCSystemCore` global del proyecto es antiguo (sin `active`) y no se toca. En `ocExtra_` (Atajo.gs) se agrega la llamada a `ocMailExtra_`.
- Acciones (solo Alex): `mailLoad`, `mailSave` (con versión), `mailSend` (`to: 'me'` prueba con la configuración en edición, `to: 'all'` destinatarios guardados).
- Ejecutar una vez `activarCorreosSemanales()` desde el editor: autoriza el envío de correo y crea el disparador horario `enviarCorreosProgramados`, que envía solo en el día/hora configurados y una vez por día (cada N semanas si corresponde).
- Propiedades: `OC_MAIL_CONFIG` (configuración), `OC_MAIL_LAST` (último envío automático), `OC_MAIL_LOG` (últimos 30 envíos). Cambios de configuración quedan en AUDITORIA_SISTEMA.
- El remitente es la cuenta de Google dueña del script (cuota diaria de MailApp).

## Canal de envío (se elige en Correos)

- **Gmail**: `MailApp` con la cuenta Google dueña del script. Si falta el permiso `script.send_mail`, Correos muestra «Falta autorizar» y el botón **Autorizar Gmail** (enlace de `ScriptApp.getAuthorizationInfo`); se abre con la cuenta dueña del sistema, se aceptan permisos y se pulsa **Comprobar**.
- **Lark Mail**: API `POST /open-apis/mail/v1/user_mailboxes/me/messages/send`, que exige `user_access_token` (OAuth de usuario). Onboarding en 3 pasos dentro de Correos:
  1. App personalizada en Lark Developer con permisos `mail:user_mailbox.message:send` y `offline_access`, la URL del web app (la misma de `google-config.js`) en Redirect URLs, «Refresh user_access_token» activado y versión publicada.
  2. App ID + App Secret + región (Lark/Feishu). El secret queda en `OC_LARK_MAIL` (propiedades del script) y nunca vuelve al navegador.
  3. **Conectar cuenta Lark**: autoriza en Lark y vuelve a `doGet` (`ocMailCallback_`), que canjea el código y guarda el refresh token.
- El refresh token de Lark rota en cada uso; el disparador horario lo renueva cada 2 días para que no venza entre envíos. Si Lark lo revoca o vence, Correos pide reconectar.
