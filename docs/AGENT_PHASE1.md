# Fase 1 · Gemini y WhatsApp bidireccional

Implementación de código: 29 de octubre de 2026. La fase **no se declara validada de extremo a extremo**: faltan PostgreSQL y credenciales autorizadas para Gemini/Meta en este entorno.

## Cambios entregados

- Proveedor Gemini con SDK oficial `@google/genai@2.32.0`, adaptado a `AiProvider`, instrucciones de identidad y errores sanitizados.
- Contexto acotado a la conversación de PostgreSQL, cronológico, con roles usuario/asistente y sin mensajes salientes no confirmados. No se usan datos del seed DEMO para generar respuestas: sus destinatarios no son teléfonos válidos.
- Envío de texto por Cloud API, con destinatario validado, timeout, ID externo y correlación de callbacks.
- Cola PostgreSQL `ReplyJob`: creación atómica con el mensaje entrante, unicidad por mensaje, secuencia por recepción, exclusión por conversación, leases y recuperación.
- Webhook responde después de persistir, sin esperar a Gemini ni Meta. Se conservan HMAC, transacciones y deduplicación.
- Registro real de estados, IDs de medios, MIME y captions. Descarga autenticada de imágenes preparada; no conectada a generación.
- Panel existente: historial humano/IA, estados y errores comprensibles, actualización cada cinco segundos mientras está abierto, configuración sin secretos.

## Modelo y dependencias

Migración nueva: `server/prisma/migrations/20261029000000_agent/migration.sql`.

Agrega columnas a Message: source, deliveryStatus, deliveryError, statusAt, mediaId, mimeType y replyToId único. Crea ReplyJob con secuencia, estado, intentos, disponibilidad y lease. No contiene DROP, DELETE ni cambios a los registros existentes. Los mensajes anteriores conservan estado UNKNOWN, sin inventar entregas. El origen anterior queda HUMAN; el seed existente no es una fuente IA.

La migración fue revisada estáticamente y el esquema validado con Prisma; **no se aplicó a una base**. Antes de aplicarla a una instalación real, respalda esa base y comprueba primero sobre una copia. Ejecuta `npm.cmd run db:generate` y `npm.cmd run db:migrate`. No uses reset ni db push.

Única dependencia directa añadida: `@google/genai`. package-lock.json incorpora sus dependencias transitivas. Se instalaron los workspaces para compilar. No se agregó Redis, infraestructura externa ni librería de colas.

## Configuración manual

Agrega estas variables a tu `server/.env` existente, sin reemplazar sus credenciales:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
AI_ENABLED=false
AI_AUTO_REPLY=false
WHATSAPP_GRAPH_VERSION=v26.0
AI_TIMEOUT_MS=30000
META_TIMEOUT_MS=15000
AI_CONTEXT_MESSAGES=20
AI_CONTEXT_CHARS=16000
WORKER_POLL_MS=2000
```

También hacen falta DATABASE_URL, JWT_SECRET, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_ACCESS_TOKEN. No se creó un .env real ni se cambiaron credenciales.

AI_ENABLED y AI_AUTO_REPLY aceptan exactamente true/false. Sin clave Gemini el panel y la API administrativa siguen funcionando. El trabajador solo actúa con ambas banderas activas y credenciales de envío, versión Graph y App Secret presentes. Presencia de credenciales **no acredita** conexión, cuota ni permisos.

Se eligió Flash-Lite 3.5 porque la documentación actual lo lista estable, multimodal y con nivel gratuito; la disponibilidad y cuotas dependen de la cuenta y pueden cambiar. El modelo es configurable. Fuentes consultadas: [modelo oficial](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [tarifas](https://ai.google.dev/gemini-api/docs/pricing), [SDK oficial](https://github.com/googleapis/js-genai). No se garantiza gratuidad en una cuenta con facturación.

La versión Graph debe contrastarse con la versión soportada por tu aplicación. v26.0 es un valor de configuración de ejemplo; no se verificó una llamada con esa versión. La página de Meta devolvió HTTP 429 durante la consulta de documentación. Referencias: [versiones Graph](https://developers.facebook.com/docs/graph-api/changelog/), [Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview).

## Confiabilidad y límites

El trabajador arranca dentro del proceso backend. Un ciclo procesa una tarea y espera WORKER_POLL_MS; los ciclos no se solapan. PostgreSQL controla propiedad mediante intento y lease de 120 segundos, mayor que los timeouts configurables. Múltiples procesos usan SKIP LOCKED y excluyen tareas anteriores activas de la misma conversación. El orden es el de recepción persistida, no un orden global garantizado por Meta.

Estados de tarea: PENDING → GENERATING → READY → SENDING → DONE. Gemini puede pasar a RETRY, con hasta tres intentos y espera creciente. Errores definitivos pasan a FAILED. Generaciones abandonadas se recuperan hasta ese límite. Una respuesta ya guardada en READY se reutiliza al reiniciar.

El estado SENDING se persiste **antes** de llamar a Meta. Si se pierde la respuesta o el proceso muere, se conserva UNCERTAIN; no se reenvía automáticamente. Meta no proporciona en este flujo una transacción atómica compartida con PostgreSQL: no se promete exactamente una entrega. Un crash entre persistir SENDING y comenzar HTTP puede dejar un mensaje sin enviar. Se prioriza evitar duplicados; requiere revisión humana. Un callback con biz_opaque_callback_data puede correlacionarlo y confirmar su resultado. No existe botón ni endpoint de reenvío automático.

Los estados SENT/DELIVERED/READ no retroceden por eventos fuera de orden; SENT significa aceptado por Meta, no entregado. Los estados originales UNKNOWN se conservan. No se inventan respuestas de respaldo ante fallos de Gemini. Los errores se guardan como códigos sin texto sensible del proveedor y se muestran en el historial.

La ventana de texto se comprueba antes de generar y antes de enviar: 24 horas desde el mensaje que origina la respuesta. Es una decisión conservadora: aunque exista un mensaje posterior, una tarea antigua puede expirar. Fuera de ventana se registra WINDOW_EXPIRED; no se implementa envío de plantillas ni evasión de restricciones. Meta aplica además sus propios permisos y límites.

Desactivar las banderas pausa las tareas ya persistidas; al reactivarlas se recuperan y se comprueba la ventana. Los mensajes recibidos mientras el agente está inactivo se guardan, pero no se encolan retroactivamente.

## Prueba real de Gemini y WhatsApp (pendiente, ejecutar manualmente)

1. Prepara una instalación local con PostgreSQL, administrador y las migraciones aplicadas.
2. Crea una clave de Gemini autorizada en Google AI Studio. Configura clave y modelo solo en server/.env. Comprueba la cuota y el plan de esa cuenta.
3. Configura en Meta un número de prueba y destinatario autorizados, token con permisos, App Secret, verify token, identificador del número y versión Graph soportada.
4. Arranca backend y frontend con los comandos habituales. Publica solo el webhook mediante un túnel HTTPS que tú autorices; registra GET/POST /webhooks/whatsapp y suscribe messages.
5. Activa AI_ENABLED=true y AI_AUTO_REPLY=true y reinicia el backend. En Configuración, comprueba la presencia de credenciales y habilitación; no equivale a conexión verificada.
6. Desde el número autorizado escribe “Hola, mi computadora no enciende”. Comprueba la respuesta en WhatsApp y su entrada OUTBOUND/AI en el panel.
7. Responde “No hace nada”. Confirma que utiliza el contexto y no empieza una conversación nueva.
8. Revisa que el mensaje aparece como aceptado, entregado o leído únicamente tras la respuesta/evento correspondiente.
9. Comprueba cuotas o credenciales inválidas en una cuenta de pruebas y revisa el error sanitizado. Restablece la configuración y vuelve a desactivar las banderas al terminar.

Estas pruebas enviarán información a proveedores externos y podrían consumir cuota o generar cargos según la cuenta. **No se ejecutaron aquí.**

## Pruebas realizadas y pendientes

- Prisma generate: correcto.
- Prisma validate: correcto usando una URL ficticia, sin conexión.
- Backend TypeScript: correcto.
- Frontend vue-tsc + Vite: correcto; esbuild requirió ejecución fuera de la restricción de lectura del sandbox.
- 25 pruebas locales aprobadas; dos integraciones PostgreSQL optativas omitidas por falta de servidor.
- Mocks: SDK Gemini, envío Meta, errores y cuotas, contexto, límites, ventana de atención, persistencia antes del envío y resultado incierto. Estas pruebas no acreditan persistencia real.
- Suite PostgreSQL preparada: recepción duplicada concurrente, tareas únicas, orden de claims, fencing, recuperación, contexto, callbacks, multimedia y API del panel. Pendiente de ejecutar.
- Revisión visual completa en navegador y prueba real con Gemini/Meta: pendientes.
- npm audit: 6 avisos (5 altos, 1 moderado): cadena Prisma/config/deepmerge-ts, body-parser, Zod y Vite. No se aplicó audit fix --force ni migraciones mayores de dependencias.

## Archivos

Creados:
- server/prisma/migrations/20261029000000_agent/migration.sql
- server/src/services/agent.ts
- server/src/services/worker.ts
- server/src/services/meta.ts
- server/src/services/delivery.ts
- server/src/services/provider-error.ts
- server/src/services/ai/gemini.ts
- server/src/services/ai/context.ts
- server/src/services/ai/prompt.ts
- server/tests/agent.test.ts
- server/tests/gemini.test.ts
- server/tests/agent-database.test.ts
- docs/AGENT_PHASE1.md

Modificados:
- server/prisma/schema.prisma, server/src/config/env.ts, server/src/index.ts
- server/src/services/ai/index.ts, server/src/services/whatsapp.ts, server/src/routes/api.ts
- server/package.json, package-lock.json, server/.env.example, .gitignore
- client/src/views/Panel.vue
- server/tests/database.test.ts
- README.md, docs/ARCHITECTURE.md, docs/DATABASE.md, docs/API.md, docs/WHATSAPP_SETUP.md, docs/TESTING.md, docs/PROGRESS.md

## Pendientes

Aplicar y comprobar migración sobre PostgreSQL aislado, ejecutar integración y validación real autorizada, revisar UI en navegador y resolver auditoría de dependencias. La visión aún no está implementada: faltan conectar downloadImage con AiProvider, incorporar partes multimodales al contrato, controles de privacidad y pruebas reales de análisis. Tampoco se implementan RAG, catálogo, reglas empresariales, herramientas para crear tickets por IA, cotizaciones ni envío manual desde el panel.
