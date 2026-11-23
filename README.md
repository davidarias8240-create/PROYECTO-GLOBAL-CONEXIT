# PROYECTO-GLOBAL-CONEXIT

## Despliegue en Hostinger

El frontend se compila desde `mini-erp` con `npm run build`. Vite genera el sitio en `dist/` en la raíz del repositorio; el `.htaccess` raíz lo sirve en `/` y deja las rutas `/backend` para PHP. Si el despliegue de Git no ejecuta el build, incluye en el repositorio el contenido generado en `dist/`.

El frontend usa `/backend` en el mismo origen. Para desarrollo, ejecuta `npm run dev` desde `mini-erp`; Vite reenvía las solicitudes a XAMPP en `http://localhost/PROYECTO-GLOBAL-CONEXIT/backend`. Si la carpeta del proyecto bajo `htdocs` tiene otro nombre, configura `VITE_PHP_PROJECT_PATH` con su ruta URL, por ejemplo `/mi-proyecto`.

## Correo saliente con PHPMailer

Instala las dependencias desde la raíz del proyecto:

```powershell
composer install
```

En XAMPP, si Composer indica que falta ZIP, habilita `extension=zip` en `C:\xampp\php\php.ini` o ejecútalo temporalmente así:

```powershell
C:\xampp\php\php.exe -d extension=zip C:\ProgramData\ComposerSetup\bin\composer.phar install
```

Copia `backend\config\mail.local.php.example` como `backend\config\mail.local.php` y completa el usuario y la contraseña de aplicación SMTP. El archivo local está excluido de Git; no lo agregues al repositorio. Para recibir las solicitudes en otro buzón, agrega `notification_email` a ese arreglo; si se omite, se usa el usuario SMTP. El solicitante también recibe una copia en el correo que registró. Para Gmail, usa una contraseña de aplicación con verificación en dos pasos, no la contraseña normal de la cuenta. El helper elimina los espacios de formato de las contraseñas de aplicación de Gmail.

Desde un endpoint PHP, carga `backend/config/mailer.php` y llama:

```php
enviarCorreo("destinatario@dominio.com", "Asunto", "<p>Mensaje</p>");
```

La función lanza una excepción si falta configuración o si PHPMailer no puede enviar el correo; captura ese error en el endpoint que la invoque.

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
