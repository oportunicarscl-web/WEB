# Oportunicars — Sistema de Gestión

La navegación tiene Caja y bancos, Autos y operación, Finanzas y patrimonio, Reportes y Configuración. Operaciones accede a los dos primeros; Gerencia y Administración a todos. Supabase verifica la identidad; USUARIOS en Google decide el rol y habilitación.

## Datos y funcionamiento

- MOVIMIENTOS_BANCARIOS es el único registro de dinero. Clasificar actualiza la misma fila y conserva importe, dirección y calidad bancaria. Los conceptos se administran en CONCEPTOS_CAJA.
- VEHICULOS conserva el catálogo de Claxo por su ID original. AUTOS_OPERACION guarda ingreso, modalidad, estado, compra y venta. ACTIVIDADES_AUTOS guarda estacionamiento, arreglos, limpieza y fotos, con costo y estado.
- Vincular un pago a una actividad evita sumar dos veces el costo. Un pago parcial no reduce el costo total registrado de esa actividad. El costo de compra usa el mayor entre el declarado y los pagos de compra confirmados, para que un pago parcial no reduzca el costo conocido. Si falta el costo completo, el resultado sigue siendo parcial.
- COSTOS_FIJOS registra la previsión mensual. PROYECCIONES registra ingresos y pagos esperados, cuotas de ventas y obligaciones. Los costos fijos se muestran separados, sin generar pagos ni duplicar previsiones manuales.
- PRESTAMOS registra el saldo de principal al cierre de una fecha. Desembolsos y amortizaciones posteriores modifican principal; intereses no lo modifican. No registrar el mismo principal como otra deuda en PROYECCIONES.
- APORTES_CAPITAL_SOCIOS es una vista materializada de los movimientos clasificados como aporte, nunca otra entrada a sumar. Se actualiza con los reportes.
- AUDITORIA_SISTEMA registra las solicitudes de cambio antes de escribir. Un evento de solicitud no es prueba de que el cambio terminó; el registro y su versión son la fuente del resultado.

Patrimonio: saldos de cuentas + stock propio al costo + cuotas por cobrar + préstamos otorgados pendientes − obligaciones registradas − préstamos recibidos pendientes. Consignados se excluyen del stock propio. Valores incompletos mantienen patrimonio sin total. No garantiza que una deuda no registrada exista: se debe verificar la completitud del levantamiento.

Los saldos iniciales son al cierre del día indicado. Solo se suman movimientos posteriores a esa fecha y hasta hoy. El resultado por auto es parcial si faltan costos; no equivale a una utilidad contable auditada. El resultado de consignados usa la comisión declarada menos preparación.

## Apps Script

Los archivos de backend y system-core.js se ensamblan en outputs/Sistema_Oportunicars.gs en el workspace. El código está preparado para Apps Script V8. El despliegue web debe ejecutarse como propietario; todas las peticiones con datos pasan por token Supabase y USUARIOS. No publicar Sheets ni incluir claves privilegiadas en el navegador.

Orden de activación:

1. Ejecutar migrarSistemaDefinitivo(). Configura IDs, respalda los seis libros con checkpoints, agrega columnas y tablas, elimina solo las nueve pestañas autorizadas, oculta las demás heredadas y renombra libros sin sufijo de prueba. No convierte datos ficticios en producción.
2. Ejecutar sincronizarStockClaxo(). Consultar stock público del concesionario, actualizar por ID, conservar historia y datos operativos. Ausencia del catálogo público no equivale a venta. Respuesta vacía o inválida detiene el proceso.
3. Completar ingreso/modalidad/costos que la fuente no aporta, saldos iniciales y préstamos existentes. Revisar los 426 registros provisionales de MP con una fuente de movimientos efectivos.
4. Ejecutar actualizarReportesSistema() y luego activarActualizacionesSistema(): stock cada seis horas, reportes cada hora. Esas funciones existen, pero no se afirma que los disparadores estén activos sin ejecución exitosa.
5. Publicar una versión de la web app, probar autenticación, lectura y escritura con una cuenta autorizada. Recién entonces configurar google-config.js con el endpoint y publicar la web.

El 19 de octubre de 2026 la migración finalizó y se verificaron las tablas compatibles: 5 usuarios, 25 vehículos, 8 conceptos y 426 movimientos. La sincronización real actualizó 25 vehículos; se generaron reportes y activaron los disparadores. Se corrigieron las validaciones que apuntaban a identificadores DEMO y el almacenamiento de fechas como valores de fecha. Las relaciones editadas desde la web se validan en el backend.

## Entradas bancarias

El endpoint `import` requiere Gerencia/Administración, perfil habilitado, versión del perfil, lote estable y máximo 50 filas por solicitud (además del límite de 50 KB). El proceso automático consume ese endpoint con identidad autorizada; no se colocan claves de banco en el HTML. No hay scraper de bancos instalado.

PERFILES_IMPORTACION configura una cuenta, mapeo_json (campos canónicos a encabezados), modo SIGNED, CREDIT_DEBIT o ABS_DIRECTION, fecha YYYY-MM-DD o DD/MM/YYYY y estado efectivo. ABS_DIRECTION usa directionValues dentro del mapa. Referencia, contraparte, ID, saldo, comisiones y demás detalles son opcionales. Se conserva cada fila de origen como JSON; un dato faltante no se inventa.

El modo CARTOLA_EFECTIVA debe usarse solo para una cartola que ya representa entradas/salidas efectivas. En MP un estado de pago aprobado no confirma una liquidación. Datos ambiguos se guardan por revisar y fuera del saldo.

Identidad del movimiento: cuenta + ID del evento bancario estable; sin ID, lote + posición. Reimportar el mismo lote no duplica. Una coincidencia de contenido de otro lote queda por revisar, no se elimina. Los perfiles deben mapear el ID del evento efectivo, no un ID de pago reutilizado para venta, comisión y liquidación. Un registro ya existente no se sobrescribe al reimportar: sus correcciones requieren revisión, no cambiar silenciosamente una clasificación.

Faltan cartolas reales de Security Personal, Security Empresa y Banco Chile para certificar los perfiles concretos. No se han inventado sus encabezados.

## Verificación

Pruebas locales de cálculo de patrimonio, consignados, costos vinculados, cuotas, préstamos, permisos, control de versiones y reintentos de importación. UI real revisada en Safari con la sesión de Alex: rol Gerencia, inventario y 426 movimientos visibles. Se guardó el concepto Claxo sin cambiar sus valores; respuesta de Google confirmada. El servicio rechaza peticiones sin sesión. El dominio admin.oportunicars.cl requiere un certificado HTTPS válido en GitHub Pages; el HTML bloquea el login remoto por HTTP. La vista preview conserva únicamente ejemplos aislados en memoria.
