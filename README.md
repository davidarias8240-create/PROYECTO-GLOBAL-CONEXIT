# PROYECTO-GLOBAL-CONEXIT

## Despliegue en Hostinger

El frontend se compila desde `mini-erp` con `npm run build`. Vite genera el sitio en `dist/` en la raíz del repositorio; el `.htaccess` raíz lo sirve en `/` y deja las rutas `/backend` para PHP. Si el despliegue de Git no ejecuta el build, incluye en el repositorio el contenido generado en `dist/`.

El frontend usa `/backend` en el mismo origen. Para desarrollo, ejecuta `npm run dev` desde `mini-erp`; Vite reenvía las solicitudes a XAMPP en `http://localhost/PROYECTO-GLOBAL-CONEXIT/backend`. Si la carpeta del proyecto bajo `htdocs` tiene otro nombre, configura `VITE_PHP_PROJECT_PATH` con su ruta URL, por ejemplo `/mi-proyecto`.

## Correo saliente con PHPMailer

Instala las dependencias desde la raíz del proyecto:

```powershell
composer install
```

En el hosting también debes desplegar la carpeta `vendor/` generada por Composer junto con el backend; no está incluida en Git.

En XAMPP, si Composer indica que falta ZIP, habilita `extension=zip` en `C:\xampp\php\php.ini` o ejecútalo temporalmente así:

```powershell
C:\xampp\php\php.exe -d extension=zip C:\ProgramData\ComposerSetup\bin\composer.phar install
```

Copia `backend\config\mail.local.php.example` como `backend\config\mail.local.php`, completa los datos SMTP exactos de tu proveedor y sube ese archivo al hosting. El archivo local está excluido de Git; no lo agregues al repositorio. Configura `encryption` como `tls` con el puerto indicado para STARTTLS (frecuentemente 587), o `ssl` con el puerto indicado para SSL implícito (frecuentemente 465); confirma los valores con tu proveedor. Para recibir las solicitudes en otro buzón, cambia `notification_email`; si se omite, se usa el usuario SMTP. El solicitante también recibe una copia en el correo que registró. Para Gmail, usa una contraseña de aplicación con verificación en dos pasos, no la contraseña normal de la cuenta. El helper elimina los espacios de formato de las contraseñas de aplicación de Gmail.

Si el endpoint responde HTTP 500, consulta el `error_log` de PHP del hosting. El navegador solo muestra el estado HTTP; el log contiene el error de PHPMailer que permite identificar si falló la conexión, la autenticación o el certificado SMTP. No publiques ese log sin ocultar direcciones, usuarios y otros datos sensibles.

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

## Pagos de facturas con Wompi

El portal de clientes inicia los pagos con el Widget oficial de Wompi. La llave pública, la firma de integridad y el saldo en centavos los entrega el backend; la factura solo se marca pagada después de validar el webhook `transaction.updated` y consultar la transacción directamente en la API de Wompi. `backend/clientes/pagar_simulado.php` está deshabilitado y responde `410`.

Antes de habilitar los pagos en una base existente, aplica la migración que crea los intentos de pago (los intentos pendientes no se insertan en `pago`):

```powershell
Get-Content -Raw .\mini-erp\Database\migracion_pagos_wompi.sql | & C:\xampp\mysql\bin\mysql.exe -u root -p
```

En una instalación nueva, la tabla también está incluida en `mini-erp\Database\datos_dashboard.sql`. Habilita la extensión PHP `curl` para que el webhook pueda verificar cada ID de transacción con la API de Wompi.

Define estas variables en la configuración privada del servidor web o del sistema operativo; no las pongas en Vite, el frontend, `.htaccess` versionado ni en el repositorio. Reinicia Apache/PHP después de cambiarlas:

| Variable | Uso |
| --- | --- |
| `WOMPI_ENVIRONMENT` | `sandbox` o `production`; controla el ambiente en que el portal inicia pagos. Por defecto es `sandbox`. |
| `WOMPI_SANDBOX_PUBLIC_KEY` | Llave pública Sandbox (`pub_test_...`). |
| `WOMPI_SANDBOX_INTEGRITY_SECRET` | Secreto de integridad Sandbox. |
| `WOMPI_SANDBOX_EVENTS_SECRET` | Secreto de eventos Sandbox. |
| `WOMPI_PRODUCTION_PUBLIC_KEY` | Llave pública Producción (`pub_prod_...`). |
| `WOMPI_PRODUCTION_INTEGRITY_SECRET` | Secreto de integridad Producción. |
| `WOMPI_PRODUCTION_EVENTS_SECRET` | Secreto de eventos Producción. |

El servidor selecciona las llaves de inicio según `WOMPI_ENVIRONMENT`; los webhooks se validan con el secreto correspondiente al `environment` firmado en cada evento (`test` o `prod`). Se puede dejar la configuración de Producción definida sin activarla; no cambies `WOMPI_ENVIRONMENT` a `production` hasta que terminen las pruebas y el sitio use HTTPS.

### Registrar el webhook

1. Publica el backend en una URL HTTPS accesible desde internet.
2. En el Dashboard de Comercios de Wompi, selecciona el ambiente Sandbox y registra como URL de eventos `https://<tu-dominio>/backend/webhooks/wompi.php`.
3. Suscribe el evento `transaction.updated` y configura `WOMPI_SANDBOX_EVENTS_SECRET` con el secreto de eventos Sandbox del Dashboard.
4. Para Producción, registra por separado esa URL en el ambiente Producción y configura su secreto distinto en `WOMPI_PRODUCTION_EVENTS_SECRET`. Wompi mantiene URLs de eventos separadas por ambiente.

El webhook valida el checksum con las propiedades y el timestamp del evento, y contrasta el ID, referencia, estado, moneda y monto con la consulta servidor-a-servidor de la transacción. Los eventos repetidos no duplican el pago; si hay un intento pendiente, la factura no admite otro hasta que Wompi comunique un estado final.

### Prueba manual en Sandbox

1. Aplica la migración, configura las tres variables `WOMPI_SANDBOX_*`, verifica que `WOMPI_ENVIRONMENT=sandbox` y reinicia el servidor.
2. Configura la URL HTTPS del webhook en el ambiente Sandbox y confirma que PHP tenga cURL habilitado.
3. Crea o selecciona una factura real de prueba con saldo pendiente y entra al portal con su cuenta de cliente.
4. Pulsa **Pagar factura**. Comprueba que se abra el Widget modal y completa una transacción con los datos de prueba publicados por Wompi para Sandbox.
5. Al cerrar el Widget, el portal debe mostrar **Pago pendiente de confirmación**. No debe mostrar la factura pagada hasta que Wompi envíe el webhook válido.
6. Después de recibir `transaction.updated` con estado `APPROVED`, recarga el portal y verifica que el saldo sea cero, la factura esté pagada y exista un único pago `REGISTRADO`. Reenvía el mismo evento desde las herramientas Sandbox para comprobar que no se duplica.
7. Repite con una transacción rechazada o pendiente: no debe crearse un pago confirmado ni cambiar el saldo/estado de la factura. Los intentos pendientes bloquean un segundo cobro hasta recibir un estado final.

No se almacenan datos de tarjeta ni se crean cobros recurrentes. El cliente inicia cada pago individualmente desde su factura.
