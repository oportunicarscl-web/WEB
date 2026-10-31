# Correos gerenciales

Menú de Alex › **Correos**. Configura el correo gerencial semanal: destinatarios (activar/pausar cada uno), frecuencia (semanal, cada 2 o cada 4 semanas), día, hora de Chile, asunto, mensaje opcional al inicio y secciones. La vista previa se arma con los datos ya cargados y el mismo motor del envío (`correo-core.js`), así que es exactamente lo que llega.

## Contenido (solo gerencial)

Período: los 7 días (o 14/28) que terminan el día anterior al envío; enviado un lunes es la semana lunes–domingo anterior. Compara con el período anterior.

- Números del período: autos vendidos, utilidad de ventas (venta − compra − costos), ingresos del negocio, flujo neto, caja, autos en stock, por cobrar, por pagar.
- Semáforo: ventas, rentabilidad, flujo, caja e inventario (>60 días).
- Flujo de caja de las últimas 8 semanas (ingresos del negocio, salidas, aportes de socios aparte).
- Ventas del período con utilidad y margen por auto, y utilidad por semana.
- Caja por cuenta y caja total al cierre de cada semana (desde el 15-oct-2026, igual que Caja y bancos).
- Inventario: propios/consignados, antigüedad del stock.
- Capital de los socios: cuánto se recupera si hoy se cierra y se vende todo.
- Composición de gastos de las últimas 4 semanas.

No incluye nada operativo (movimientos por clasificar, tareas, pendientes). Los gráficos son tablas HTML para verse igual en Gmail, Apple Mail y Outlook. Colores de series validados para daltonismo.

## Apps Script

- `CorreoCore.gs` = copia de `correo-core.js`. `Correos.gs` = `backend/Correos.gs`. En `ocExtra_` (Atajo.gs) se agrega la llamada a `ocMailExtra_`.
- Acciones (solo Alex): `mailLoad`, `mailSave` (con versión), `mailSend` (`to: 'me'` prueba con la configuración en edición, `to: 'all'` destinatarios guardados).
- Ejecutar una vez `activarCorreosSemanales()` desde el editor: autoriza el envío de correo y crea el disparador horario `enviarCorreosProgramados`, que envía solo en el día/hora configurados y una vez por día (cada N semanas si corresponde).
- Propiedades: `OC_MAIL_CONFIG` (configuración), `OC_MAIL_LAST` (último envío automático), `OC_MAIL_LOG` (últimos 30 envíos). Cambios de configuración quedan en AUDITORIA_SISTEMA.
- El remitente es la cuenta de Google dueña del script (cuota diaria de MailApp).
