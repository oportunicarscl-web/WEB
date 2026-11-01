> Rescatado del repo antiguo joacoAviles/aviarockets.cl (demo React con datos ficticios, sept-2026) antes de eliminarlo. Referencia histórica; no describe el sistema actual.

# Del Excel a Oportunicars

## Inspección completa, antes de construir

Archivo original: `FLUJO OPORTUNICARS.xlsx`. SHA-256: `2a5b9ed3a6a69fe82139860d81d7fdd40e881d187cf8ecd94cd8dbc36aca2b5e`.

Se leyeron las 130 hojas visibles y todas las celdas no vacías: 13.225; se extrajeron 2.315 fórmulas con sus valores guardados, incluyendo `ArrayFormula.text`. No hay hojas ocultas. El consolidado tiene 158 filas usadas, 20 columnas, 2.538 celdas pobladas y 2.004 fórmulas. `MES 0` tiene 896 filas, 24 columnas, 5.098 celdas pobladas y 77 fórmulas. Las otras 128 hojas son fichas de vehículo, usualmente A1:C19, con 234 fórmulas en conjunto. Se recorrieron todas las fichas, datos, notas de gastos y fórmulas; la salida privada completa no se incluye aquí para no publicar patentes, personas, montos o movimientos reales.

El análisis detectó 0 errores en valores **guardados**, lo que no demuestra ausencia de errores lógicos ni recálculo correcto. Hay 348 fórmulas con resultado guardado vacío/nulo. Se identificaron 66 patrones de fórmulas al normalizar números. No se alteró el original.

## Mapeo

| Fuente | Significado observado | Modelo de la demo |
|---|---|---|
| CONSOLIDADO STOCK A:M | Identificador, patente, descripción, compra/gasto/precio, estado, fechas y publicación | Vehicle + costos relacionados; joins por ID estable |
| CONSOLIDADO STOCK N | `precio − (toma + gastos)` | Contribución directa, separada de costos de tenencia y comerciales |
| CONSOLIDADO STOCK O | `N / (toma + gastos)` | Rentabilidad sobre costo, no porcentaje sobre ventas |
| CONSOLIDADO STOCK P:Q | Estado adicional y fecha de venta | Etapa comercial y soldAt |
| Fichas A2:B10 | Patente, marca/modelo, año/km, toma, gastos y estimación | Identidad, adquisición, costos detallados y precio |
| Fichas B11 | PROPIO, CONSIGNADO, VENDIDO, RETIRADO | Separar modalidad de adquisición de etapa comercial |
| Fichas B12:B19 | Ingreso, preparación, transmisión, color, combustible, publicación, foto, lista | Checklist y atributos; demo implementa los atributos visibles necesarios |
| Fichas C9 | Texto libre de arreglos y gastos | Líneas de Cost y órdenes de trabajo |
| MES 0 A:J | Secuencia, mes, centro de costo, comentario, patente, ingreso, egreso, suma auto, fondos y contraparte | Movimiento, categoría, vehículo, cuenta y proveedor |
| MES 0 sumatorias laterales | Caja, aportes y agrupaciones manuales | Agregaciones por categoría y auxiliar, evitando sumar subtotales dos veces |

## Fórmulas y riesgos encontrados

1. 1.690 fórmulas usan `IFERROR(INDIRECT(...),"")` para leer fichas por nombre. El texto de patente actúa como relación. No hubo nombres faltantes entre los 128 identificadores poblados del consolidado y sus hojas. La app usa IDs para no depender de nombres de pestaña; no convierte faltantes en ceros.
2. 157 filas tienen fórmula de contribución y 157 porcentaje sobre costo, incluidas filas de plantilla. No deben contarse como 157 vehículos: sólo hay 128 identificadores poblados.
3. Algunas fichas calculan toma como precio estimado menos 5%; se interpreta como liquidación de consignación en esas fichas, **no como regla universal de comisión**. La demo representa un pacto de liquidación fijo y una comisión comercial separada, con tasas ficticias explícitas.
4. Gastos contienen sumas de importes y referencias a movimientos. Hay fórmulas de comisión sobre ingresos o egresos, con signos negativos. La app usa montos positivos y tipos de movimiento explícitos.
5. `MES 0!N852` enumera una lista extensa de referencias: G53 aparece dos veces, y G2541 está fuera del rango usado (896 filas). Debe revisarse, no reproducirse como regla del ERP. El indicador de caja de N845 usa un rango fijo hasta fila 1452; filas futuras fuera de ese rango podrían omitirse.
6. “Ubicación” mezcla propiedad y estado; preparado/publicado/foto son indicadores independientes. La app exige checklist antes de publicar.
7. Categorías incluyen variantes de venta/compra, preparación/lavado, permisos/PRT, combustibles/TAG, publicidad, arriendos, estacionamiento, comisiones, impuestos, garantías, aportes y gastos generales. La taxonomía requiere normalización; no se debe tratar todo egreso como gasto de vehículo ni todo ingreso como venta.
8. Capital de trabajo, aportes, movimientos de scooter y conceptos no atribuibles a un auto necesitan cuentas o centros separados. La demo no convierte automáticamente esos conceptos en ventas o COGS; la migración productiva debe resolverlos con el contador.

## Fórmulas de la demo

- Días: diferencia calendario entre ingreso y corte fijo 05-10-2026; vendidos usan fecha de venta.
- Costo directo: suma de gastos del vehículo, excluyendo liquidación al consignante.
- Parking: días × tarifa diaria ficticia. La capacidad mensual se muestra separada, sin duplicar el costo.
- Capital: compra propia × 12% anual simple × días/365; cero para consignación.
- Contribución: precio de cierre o publicación − compra/liquidación − directo − parking − capital − comisión comercial.
- Retorno original: (precio − compra/liquidación − directo) / (compra/liquidación + directo); si el denominador es cero, no disponible.
- Margen de contribución: contribución / precio; no utilidad tributaria.
- Alerta: >60 días y precio sobre mediana ficticia; prioridad adicional para contribución negativa.
- Compra máxima orientativa: 90% de mediana − costos y comisión supuestos; mantiene costos actuales y no recalibra capital ante cada oferta. Se declara su limitación en la interfaz.

## Privacidad y trazabilidad

No se publica el Excel, su extracción celda a celda ni datos históricos identificables. El escenario usa IDs `DEMO-*`, clientes y proveedores rotulados Demo e importes nuevos. Los nombres de marca/modelo son genéricos de mercado. Este documento publica sólo estructura, fórmulas representativas y hallazgos necesarios para explicar el diseño.
