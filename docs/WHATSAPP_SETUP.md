# WhatsApp y Gemini

No existe una conexión real verificada en este entorno. npm.cmd test no necesita credenciales reales ni envía mensajes.

1. Configura una aplicación WhatsApp Business Platform, un número de pruebas y destinatarios autorizados.
2. Agrega a server/.env WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN y WHATSAPP_GRAPH_VERSION. Usa una versión soportada por tu app; el ejemplo incluye v26.0. No publiques credenciales.
3. Configura GEMINI_API_KEY y GEMINI_MODEL. Deja AI_ENABLED=false y AI_AUTO_REPLY=false hasta preparar la prueba autorizada.
4. Arranca PostgreSQL, aplica migraciones y ejecuta backend y frontend.
5. Con un túnel HTTPS autorizado configura /webhooks/whatsapp como callback de Meta y suscribe messages. GET verifica el challenge; POST valida firma del cuerpo original.
6. Activa ambas banderas y reinicia backend. Envía un texto desde un destinatario autorizado; el webhook persiste y la cola procesa contexto, Gemini y envío.
7. Comprueba en el panel el mensaje entrante y la respuesta IA. La respuesta HTTP de envío acredita aceptación; delivered/read solo proceden de callbacks reales.

Los reintentos de recepción no crean una nueva tarea. Los errores de persistencia permiten reintento de Meta. Gemini tiene intentos limitados; los envíos de resultado desconocido no se repiten automáticamente. Fuera de 24 horas no se envía texto: queda WINDOW_EXPIRED. Las plantillas no están implementadas.

Los medios conservan ID, MIME y caption. downloadImage prepara recuperación autenticada y acotada, sin persistir URLs temporales; aún no se conecta a visión Gemini.

Consulta [configuración y prueba completa](AGENT_PHASE1.md) y [pruebas aisladas](TESTING.md). Referencias: [Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview), [versiones Graph](https://developers.facebook.com/docs/graph-api/changelog/), [SDK Gemini](https://github.com/googleapis/js-genai). La documentación web de Meta devolvió 429 durante esta sesión; verifica los detalles en tu panel antes de probar.
