# WhatsApp y ngrok
No existe una conexión real verificada en este entorno. No se necesitan credenciales Meta para ejecutar npm.cmd test.

1. Crea/configura una aplicación WhatsApp Business Platform en Meta y utiliza el número de pruebas autorizado.
2. Configura en server/.env WHATSAPP_APP_SECRET con el secreto real de la aplicación, WHATSAPP_VERIFY_TOKEN con un valor aleatorio elegido por ti, WHATSAPP_PHONE_NUMBER_ID con el identificador de número y WHATSAPP_ACCESS_TOKEN si preparas futuras operaciones de API. Nunca agregues estos archivos a Git.
3. Arranca PostgreSQL, aplica migraciones y ejecuta npm.cmd run dev:server.
4. Con ngrok instalado y autenticado ejecuta: ngrok http 3000. El túnel debe usar HTTPS. No está incluido ni se instala automáticamente.
5. Configura la URL pública seguida de /webhooks/whatsapp como callback y el mismo verify token. Suscribe el campo messages de la cuenta correspondiente.
6. Envía un mensaje desde un número autorizado. Comprueba que aparece en el panel. Reenvía el evento: externalMessageId único debe mantener un solo mensaje.

La verificación GET responde el challenge solo si modo y token coinciden. POST valida HMAC SHA-256 del cuerpo original con App Secret y comparación de tiempo constante. Una firma inválida devuelve 401; secretos ausentes, 503. Solo se guardan mensajes del phone_number_id configurado. Eventos de estado no generan mensajes. Un fallo de persistencia devuelve 5xx, permitiendo reintentos; cada mensaje se guarda transaccionalmente. No hay respuestas automáticas ni envío de mensajes.

Fixture local: server/tests/fixtures/message.json. Las pruebas calculan una firma con secreto efímero y envían eventos por HTTP a un puerto local. Para persistencia y deduplicación ejecuta las pruebas de integración descritas en TESTING.md con una base local separada.

Referencia oficial consultada: [Meta: verificación y recepción de webhooks](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/). La configuración de la cuenta debe contrastarse con el panel actual de Meta antes de una prueba real.
