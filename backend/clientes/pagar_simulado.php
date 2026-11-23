<?php
header("Content-Type: application/json; charset=UTF-8");
http_response_code(410);
echo json_encode([
    "error" => "El pago simulado fue deshabilitado. Inicia los pagos desde el portal con Wompi."
], JSON_UNESCAPED_UNICODE);
