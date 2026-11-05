# PROYECTO-GLOBAL-CONEXIT

## Facturación automática

El proceso de facturación se ejecuta desde PHP CLI, no al abrir el panel. Primero valida el resultado sin escribir en la base de datos:

```powershell
C:\xampp\php\php.exe C:\xampp\htdocs\PROYECTO-GLOBAL-CONEXIT\backend\facturas\generar_automaticas.php --dry-run
```

Para registrar las facturas, ejecútalo con `--execute`. El proceso toma el día de inicio de cada contrato como su corte mensual, usa el precio actual de su plan y crea el período y la factura pendientes en una sola transacción. Reutiliza el plazo de vencimiento más común de los períodos válidos existentes; si no hay períodos válidos, configura `GLOBAL_CONEXIT_BILLING_DUE_DAYS` con el número de días de vencimiento antes de ejecutar.

Para automatizarlo en Windows, crea una tarea diaria en el Programador de tareas:

- **Programa:** `C:\xampp\php\php.exe`
- **Argumentos:** `C:\xampp\htdocs\PROYECTO-GLOBAL-CONEXIT\backend\facturas\generar_automaticas.php --execute`
- **Iniciar en:** `C:\xampp\htdocs\PROYECTO-GLOBAL-CONEXIT`

La tarea no se registra automáticamente. Antes de habilitarla, revisa la simulación y confirma el horario y el plazo de vencimiento configurado. El proceso puede repetirse con seguridad: bloquea el contrato durante la generación y no crea otra factura para el mismo contrato y período.

## Idempotencia de pagos

Los pagos nuevos usan una clave de idempotencia para evitar duplicados si se reenvía la misma solicitud. En instalaciones existentes, aplica una sola vez la migración antes de registrar pagos desde el panel:

```powershell
Get-Content -Raw .\mini-erp\Database\migracion_pagos_idempotencia.sql | & C:\xampp\mysql\bin\mysql.exe -u root -p
```

La migración agrega la columna y el índice único a `global_conexit`; los pagos existentes se conservan sin cambios.
