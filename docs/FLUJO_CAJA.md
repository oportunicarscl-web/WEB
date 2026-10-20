> Referencia de la importación inicial. La interfaz de carga manual descrita aquí fue reemplazada por [La Caja](LA_CAJA.md); ya no se presenta al operario. Se conservan las reglas de integridad de los datos.

# Flujo de caja por cuenta

## Modelo operativo

Una tabla MOVIMIENTOS_BANCARIOS reúne los movimientos de MERCADO PAGO, SECURITY PERSONAL, CAJA, SECURITY EMPRESA y BANCO CHILE. Cada fila lleva cuenta_id. CAJA tiene tipo EFECTIVO; Mercado Pago, MERCADO_PAGO; las otras, BANCO. Las cuentas no tienen saldo inicial confirmado todavía. Los datos de una cuenta personal se distinguen por cuenta; su clasificación empresarial debe revisarse.

Los 426 registros de Mercado Pago fueron copiados a la tabla común y verificados por copia de vuelta en Safari. MP_PENDIENTES conserva la fuente; no debe alimentar un segundo total. No hay movimientos cargados para las otras cuatro cuentas. No incluir registros DEMO en las consultas de producción.

## Estados independientes

- estado_fuente: estado original del proveedor; una operación rechazada no equivale a un movimiento efectivo.
- estado_conciliacion: PENDIENTE, PARCIAL o CONCILIADO; solo cambiar en servidor al comprobar las asignaciones de CONCILIACIONES.
- monto_confirmado: SI/NO. En esta importación monto conserva el bruto provisional; monto_bruto, neto_informado, comisiones y reembolsado preservan sus significados originales. No sustituir automáticamente bruto por neto.
- direccion: ENTRADA/SALIDA. Vacía en los registros importados hasta verificarla.
- incluir_en_saldo: NO en toda esta importación. Su activación requiere movimiento efectivo, fecha, dirección e importe confirmados. Conciliar con un documento y confirmar el efecto bancario son verificaciones distintas.
- categoria_id, descripcion, tipo_fuente, fecha_original, operacion_origen_id y observacion conservan la clasificación y trazabilidad.

Sin saldo inicial confirmado no mostrar saldo disponible como cero. Se puede mostrar flujo del período solo para movimientos efectivos confirmados, identificando lo excluido. Reembolsos y comisiones necesitan movimientos o asignaciones respaldadas; no fabricar líneas a partir de un historial de pagos. Transferencias internas afectan cada cuenta y se eliminan del ingreso/gasto consolidado cuando ambas partes están vinculadas.

## Interfaz disponible

Finanzas muestra cinco cuentas, selector de cuenta de carga, lector local XLSX/XLS/CSV/TSV, selector de hoja y fila de encabezados, mapeo de columnas, validación de pesos enteros, fechas, cargos y abonos, detección de posibles duplicados y carga de cobros/pagos de referencia. Los archivos no salen del navegador. Se borran de memoria al cerrar sesión o vaciar la sesión; exportar el borrador antes de salir.

Las sugerencias solo relacionan dos filas sin errores y con cuenta, dirección, fecha, monto y referencia iguales; rechazan ambigüedad o reutilización de una referencia. La aceptación produce un borrador exportable JSON, nunca una conciliación bancaria definitiva. No resuelve aún pagos parciales, agrupados, diferencias por comisión o emparejamiento de transferencias. Una repetición sin ID puede ser legítima: los posibles duplicados se señalan y se conservan.

Las columnas estándar monto_confirmado, estado_fuente y direccion se respetan al importar la tabla normalizada. Un archivo normalizado con varias cuentas se rechaza hasta filtrarlo por la cuenta seleccionada. No se ignoran hojas o filas excedentes silenciosamente: el límite de lectura es 10 MB / aproximadamente 10.000 filas por hoja.

## Pendiente para operación compartida

La web todavía no lee ni guarda en Google. Se requiere autorizar y desplegar el backend de Apps Script, validar la sesión Supabase y resolver el rol desde USUARIOS de Google. La implementación anterior de roles vía app_metadata no es la arquitectura final acordada. Supabase se limita a autenticación.

El backend debe validar cuenta, actor, versión, estado y monto; deduplicar por cuenta y origen; bloquear escrituras concurrentes; persistir lote, movimiento, asignaciones y auditoría; permitir asignaciones parciales/agrupadas sin exceder el importe; y conservar el documento de respaldo. No usar la interfaz como barrera de seguridad. Las validaciones importadas de Sheets aún conservan referencias de prueba antiguas y necesitan actualizarse; no se han certificado las protecciones nativas. Los campos de responsable y saldo inicial pendientes no se inventaron.

## Dependencia y comprobaciones

SheetJS CE 0.20.3 está incluido localmente en vendor, con licencia Apache 2.0. Fuente oficial: https://docs.sheetjs.com/docs/getting-started/installation/standalone/ y https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js.

Ejecutar `node --test tests/*.test.cjs`. Incluye importación XLSX de prueba, fechas inválidas, importes locales, direcciones, duplicados, ambigüedad y bloqueo de registros provisionales. La vista previa se revisa en Safari; no implica despliegue de producción.
