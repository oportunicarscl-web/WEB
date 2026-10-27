# Cartolas bancarias (Administrar → Pegar cartola)

Solo el usuario Alex. Se copia el texto de la cartola tal como sale del banco y se pega en el cuadro. Nada de las cartolas queda en este repositorio: los movimientos viven solo en `MOVIMIENTOS_BANCARIOS`.

## Formatos

Cada banco tiene su formato en `cartolas.js` (`FORMATS`). El formato se reconoce solo por el contenido. Además, sugiere la cuenta del banco correspondiente.

- **Scotiabank**: «Consulta detalle de cartola emitida».
  - Copia del PDF: `dd/mm/aaaa DESCRIPCIÓN DOCTO MONTO SALDO`. Trae un solo monto; si es cargo o abono se deduce del saldo.
  - Copia desde Excel: columnas separadas con cargo y abono.
  - Las líneas de encabezado, el pie de página y el «1/2» se ignoran solas.
- **Banco Chile**: pendiente. Con una copia real de su cartola se agrega un formato nuevo. No hay que cambiar nada más.
- Si el texto no es de un formato conocido, se usa el ingreso simple: `fecha ; descripción ; monto`.

## Cuadratura

Cada línea debe cumplir: **saldo − saldo anterior = ± monto**. Si una línea no cuadra, se marca como «Descuadre» y la importación no se puede guardar. Google repite esta misma comprobación antes de escribir.

El saldo de partida se toma, en este orden:

1. El que escribas tú, o el que resulta al indicar si la primera línea es cargo o abono.
2. El «Saldo inicial» del encabezado, si lo pegas.
3. El saldo final de la cartola anterior ya importada en esa cuenta.

Si el saldo inicial no coincide con el final de la cartola anterior, aparece un aviso «Ojo»: puede faltar una cartola entre medio.

## Duplicados

Cada movimiento tiene una huella: `cuenta | fecha | dirección | monto | saldo | docto`.

- Volver a pegar una cartola no repite nada.
- Dos cargos iguales el mismo día se distinguen por el saldo.
- Si un movimiento coincide en cuenta, monto y dirección con uno ingresado a mano o por atajo (±3 días), se marca «¿Ya ingresada a mano?». Se importa igual y se revisa en la Caja.

## Después de importar

- Los movimientos entran con importe confirmado y en «Por completar». Cuentan en el saldo al asignarles concepto (y auto, si corresponde).
- Como vienen del banco, se pueden corregir el signo, el concepto y el auto. No se borran de a uno.
- Para deshacer una cartola entera: **Cartolas importadas → Anular importación**. Si alguna línea se dividió, primero hay que unir la división.

## Backend

- `backend/Cartolas.gs` contiene las acciones `cartolaImport` (escribe todo el lote de una vez) y `cartolaVoid`.
- `ajustarCuentasScotiabank()` se ejecuta una vez desde el editor:
  - Renombra SECURITY PERSONAL → SCOTIABANK PERSONAL, con el mismo `cuenta_id`.
  - Anula SECURITY EMPRESA solo si no tiene movimientos.
