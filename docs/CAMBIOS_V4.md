# Bancos, operación y gerencia

Inicio histórico provisional: 1 de octubre de 2025. Gerencia puede cambiarlo en Configuración.

Las hojas MERCADO_PAGO, SECURITY_PERSONAL, CAJA, SECURITY_EMPRESA y BANCO_CHILE son entradas originales. MOVIMIENTOS_BANCARIOS sigue siendo la fuente única para saldos y conciliación. Los 426 movimientos existentes de Mercado Pago se copiaron a su hoja de origen con `_movimiento_id` para no volver a importarlos como nuevos.

Para importar cartolas: pegar encabezados y filas en la hoja del banco, configurar un perfil en PERFILES_IMPORTACION con hoja_entrada, lote_entrada y correspondencias mapeo_json, y ejecutar importarHojasBancos. Un mismo lote y posición se reintenta sin duplicar; una nueva cartola sin identificadores usa un lote distinto y los posibles duplicados quedan por revisar. Los formatos reales de Security y Banco Chile requieren una cartola de muestra para fijar sus correspondencias; no se supone que comparten columnas con Mercado Pago.

Compromisos no caja usa PROYECCIONES para servicios y cuentas a plazo y PRESTAMOS para deudas de socios. Al clasificar un movimiento se vincula a su compromiso o préstamo. Un compromiso no crea un movimiento bancario. Las previsiones generales no se cuentan como deuda confirmada; SERVICIO_30_DIAS, DEUDA y CONSIGNACION sí. No registrar la misma deuda simultáneamente como préstamo y compromiso.

Los autos históricos se agregan en Registrar auto y se completan con fechas, modalidad, estado y precios en su ficha. No se eliminan al venderlos. Días en inventario y estacionamiento son fecha de venta menos fecha de ingreso; para stock se usa hoy. Las actividades conservan costos y no requieren días manuales.

Operaciones accede al módulo Gerencia y a compromisos; configurar usuarios, conceptos y saldos conserva sus permisos anteriores. Los gráficos solo usan registros existentes. Un saldo desconocido se muestra sin datos, no como cero. El patrimonio actual incluye stock propio al costo. El gráfico histórico de saldos representa caja y bancos, no una reconstrucción ficticia del patrimonio pasado.

Verificación: 36 pruebas, incluidas fechas de estacionamiento, compromisos y pagos parciales, exclusión de transferencias y ausencia de saldos históricos antes del corte.
