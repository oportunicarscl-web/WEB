# Panel posterior al acceso

El login y la recuperación existentes siguen usando Supabase. Tras el acceso, el panel resuelve el rol y abre el resumen correspondiente. No incluye movimientos reales, credenciales privadas ni indicadores ficticios. Las 59 tablas se distribuyen en ocho áreas y permiten consultar campos y catálogos.

## Asignación de cuentas

Asignar desde un entorno administrador de Supabase, identificando primero el UUID real de cada cuenta:

| Cuenta | app_metadata.oc_username | app_metadata.oc_role |
|---|---|---|
| jt | jt | operativo |
| mmusa | mmusa | operativo |
| Alex | alex | gerencial |
| Gonzalo | gonzalo | gerencial |

Los UUID y correos exactos no están en este repositorio. Esta entrega no modifica usuarios de Supabase. oc_role tiene prioridad y admite también administrador, finanzas, contabilidad y comercial. Nunca usar user_metadata, nombres visibles ni el correo para conceder permisos. Sin rol asignado se muestra acceso pendiente.

Administración accede a parámetros. Gerencia ve todas las áreas salvo parámetros. Operaciones accede a Comercial, Operaciones y Datos maestros; Usuarios y Parámetros no aparecen en Datos maestros.

## Alcance y siguiente integración

Implementa interfaz, navegación, filtro de secciones, diccionario, resumen según rol y cierre de sesión. Los indicadores no representan cifras calculadas. Las tablas no permiten guardar ni simulan persistencia.

La sesión real se verifica con auth.getUser() del login existente. Ocultar navegación es solo presentación: cada endpoint debe verificar JWT y permisos de servidor cuando se conecten datos. No exponer escritura de Apps Script sin autenticación, claves de servicio ni datos privados en archivos estáticos. Supabase requiere RLS para datos; Sheets requiere autorización en su API.

Las 426 operaciones de Mercado Pago permanecen en Sheets. Deben leerse por una API autenticada, conservando clasificación pendiente, dirección desconocida y exclusión del saldo.

preview.html permite revisar perfiles con estructura pública. No autentica ni accede a datos. Puede excluirse del despliegue si no se desea vista previa pública.

## Comprobaciones

Ejecutar: node --test tests/workspace.test.cjs
Servir esta carpeta y abrir preview.html.
La comprobación real con las cuatro cuentas y las políticas del backend requiere acceso a su configuración administradora; no queda validada por pruebas de interfaz.
