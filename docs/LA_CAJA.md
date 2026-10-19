# La Caja

La Caja es la bandeja operativa de movimientos de todas las cuentas. La carga pertenece a procesos automáticos (scraping o conectores), no al operario. La pantalla no pide facturas, identificadores, archivos ni cruces con otro libro. Contabilidad desaparece de la navegación; se conservan las tablas existentes.

## Conceptos

Mis conceptos permite crear y editar nombre, categoría, naturaleza (gasto, costo, ingreso o transferencia interna), tipo de costo, recurrencia. Claxo viene preparado como RP / gasto / fijo / recurrente. CYC como Marketing / gasto / fijo; su recurrencia es editable y no se presupone una periodicidad. Una elección aplica todas las dimensiones a la vez. Los conceptos de compra y arreglo son costos; venta es ingreso.

Las clasificaciones guardan una copia de la versión del concepto aplicada. Editar un concepto no cambia silenciosamente movimientos anteriores. Cambiar concepto sobre un movimiento sustituye su clasificación, sin generar otro movimiento. La detección por descripción solo sugiere Claxo/CYC; requiere el clic del operario.

## Autos

Compra, arreglo y venta se asignan directamente a un vehículo del inventario. Cada movimiento muestra el selector con ID · patente · modelo, sin un campo «Relación con un auto» ni un diálogo intermedio. Por asignar auto conserva el concepto con vehículo vacío y tiene un filtro propio. Al registrar el vehículo, puede vincularse al mismo movimiento desde esa vista. Se permite corregir la vinculación sin duplicar importes. El cálculo por vehículo usa esos movimientos: compras, arreglos, ventas y ventas menos costos registrados; no representa rentabilidad completa si faltan movimientos. Los importes no confirmados permanecen fuera del cálculo.

## Estado implementado

Interfaz y lógica funcional en vista previa. El catálogo se conserva como borrador local por usuario del navegador mientras no exista persistencia Google. Los ejemplos están aislados en el perfil de vista previa. En sesión real, el guardado de movimientos falla explícitamente si no se ha conectado Google. No se simula haber conciliado ni sincronizado. La clasificación comercial no confirma por sí sola el importe o la dirección bancaria.

`OCWorkspace.open({user,signOut,caja:{concepts,inventory,movements,saveConcept,saveMovement}})` permite inyectar datos y persistencia autenticada. `inventory` contiene `{id,patente,modelo}` (acepta `plate`, `model` o `name` como compatibilidad); los movimientos contienen `{id,account,description,amount,direction,confirmed,status,classification?}`. `account` es el nombre de una de las cinco cuentas. El adaptador Google debe mapear los IDs de cuenta y vehículo de Sheets, confirmar los datos de origen y actualizar la misma fila por ID y versión; nunca anexar otra fila al reclasificar. Los IDs son internos y no se solicitan al operario. Los callbacks solo deben resolver después del guardado real; el servidor debe validar sesión, rol, inventario y versión.

Pendiente: ingestión automática, adaptador de inventario real y escritura compartida en Google. Supabase solo autentica. Las tablas de negocio siguen en Google. Esta entrega no despliega un scraper ni una API y no cambia movimientos bancarios reales.

La importación Excel queda como utilidad interna de preparación en cash-import.js; no aparece en la pantalla del operario.
