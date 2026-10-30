# Chat web público · implementación y validación

Actualización: la IA ya puede crear tickets reales a petición del cliente. Incluye confirmación persistida, tarjeta de seguimiento y prevención de duplicados. Ver [tickets por IA](AI_TICKETS.md).

Fecha local: 29 de octubre de 2026.

## Uso

Desde la raíz, inicia cada proceso en una terminal:

```powershell
npm.cmd run dev:server
```

```powershell
npm.cmd run dev:client
```

Abre **http://localhost:5173/chat** como cliente. No requiere cuenta administrativa. El panel sigue en **http://localhost:5173/login**; en Conversaciones selecciona **Web Chat** y abre el detalle. También se muestran los contactos web para crear tickets manualmente. Si ya había un backend abierto antes del cambio, reinícialo para cargar las rutas y el cliente Prisma actualizados.

La ruta pública conserva su sesión en sessionStorage, separada del JWT administrativo. Nueva conversación crea un contacto y una conversación distintos; no elimina la anterior. Al cerrar la pestaña se pierde la credencial local; en la misma pestaña se puede recargar y recuperar el historial. La sesión expira a las 24 horas por defecto; los registros siguen disponibles al administrador.

## Configuración

Se conservó server/.env sin sobrescribir sus valores. Se reutilizan DATABASE_URL, JWT_SECRET, GEMINI_API_KEY, GEMINI_MODEL y AI_ENABLED. No se requieren credenciales Meta. AI_AUTO_REPLY permanece false y controla exclusivamente WhatsApp.

Nuevas variables, todas opcionales y documentadas en server/.env.example:

| Variable | Predeterminado | Función |
|---|---|---|
| WEB_CHAT_AI_ENABLED | true | Habilita IA del canal web; requiere también AI_ENABLED y clave Gemini |
| WEB_CHAT_SESSION_HOURS | 24 | Expiración fija de sesión, de 1 a 168 horas |
| WEB_CHAT_MAX_MESSAGES | 50 | Máximo de consultas por conversación, hasta 200 |
| WEB_CHAT_MAX_CONCURRENT | 3 | Generaciones web simultáneas entre todos los procesos |
| WEB_CHAT_DAILY_LIMIT | 500 | Generaciones web por día UTC entre todos los visitantes |

Se reutilizan AI_TIMEOUT_MS y los límites de contexto existentes. Las consultas fallidas también consumen presupuesto. El límite diario es por solicitudes, no garantiza un límite monetario: configura también las cuotas y facturación de tu cuenta Gemini.

CORS_ORIGIN identifica al frontend autorizado. En desarrollo se aceptan localhost y 127.0.0.1 equivalentes con el mismo protocolo y puerto. Fuera de desarrollo configura la URL exacta; no se permite cualquier origen. En producción requiere HTTPS, expiración apropiada, protección perimetral contra abuso y evaluación de privacidad/retención. Express no confía en X-Forwarded-For arbitrario; si colocas un proxy, configura su confianza explícitamente antes de usar la IP para límites.

## Endpoints

| Método y ruta | Uso |
|---|---|
| POST /api/public/chat/session | Body {}. Devuelve token aleatorio, vencimiento y disponibilidad IA |
| GET /api/public/chat/messages | Historial exclusivamente de la sesión autenticada |
| POST /api/public/chat/messages | Body {requestId: UUID, content: texto}, persiste entrada y respuesta |
| GET /api/conversations?channel=WEB | Consulta administrativa con JWT y rol ADMIN |
| GET /api/conversations/:id/messages | Historial administrativo existente, con estado del trabajo |

Las dos rutas públicas de messages requieren Authorization: Bearer con el token público. No aceptan un ID de conversación para elegir datos. El token administrativo no sirve como token público. Las respuestas no incluyen claves, teléfono interno, hash de sesión ni el identificador externo utilizado para deduplicar. Devuelven requestId para recuperar un resultado tras perder la conexión.

No hay endpoint de archivos. Solo JSON de texto, máximo 4.000 caracteres y 16 KB por cuerpo HTTP; archivos, multipart y propiedades adicionales se rechazan. Vue representa el contenido como texto interpolado, sin v-html.

## Prisma y migración

Migración **20261030000000_web_chat**, aditiva y ya aplicada a PostgreSQL 18 local:

- Conversation.channel, predeterminado WHATSAPP para conservar el origen de lo anterior, e índice por canal/fecha.
- WebSession: hash SHA-256 único del token aleatorio de 256 bits, conversación única y expiración.
- PublicRateBucket: contadores persistentes por ventana para límites compartidos.
- Se reutilizan Contact, Conversation, Message y ReplyJob. Los contactos web usan un identificador sintético con prefijo web: en phoneNumber; no representa un teléfono real.

Se guardó un respaldo privado previo en .local-backups/, excluido de Git. La base no tenía conversaciones ni mensajes antes de migrar. No se eliminaron tablas ni datos anteriores. migrate status confirmó el esquema actualizado.

## Flujo y confiabilidad

El envío web es síncrono con timeout: persiste primero la entrada y una ReplyJob en GENERATING; después consulta Gemini fuera de la transacción. Al completar, guarda la salida AI/AVAILABLE y marca DONE de forma atómica. El cliente muestra el indicador de generación hasta recibir el resultado. AVAILABLE significa disponible en el historial web, no entrega por Meta ni lectura acreditada.

Las tareas web **no** las reclama el trabajador de WhatsApp. Ese trabajador filtra WHATSAPP, y AI_AUTO_REPLY=false no impide la generación web. No se realiza ninguna llamada a Meta para atender el chat.

Se bloquea la sesión brevemente al admitir una consulta. Solo se permite una generación por conversación. Un bloqueo global breve limita la concurrencia; no mantiene una transacción abierta durante Gemini. Los leases evitan persistir respuestas tardías después de expirar el trabajo.

requestId se conserva en reintentos: una entrada y respuesta ya procesadas se recuperan sin otra llamada a Gemini. Si se reutiliza con otro texto se devuelve 409. Un error de generación queda persistido en FAILED y no se vuelve a consumir cuota al repetir el mismo requestId. El visitante puede enviar otra consulta deliberadamente. Tras un crash, la consulta de historial o el siguiente envío detectan el lease expirado y marcan AI_INTERRUPTED. No se genera de nuevo automáticamente.

El contexto acotado reutiliza buildContext y AiProvider/GeminiProvider, con roles, orden cronológico y salidas AVAILABLE. No mezcla conversaciones ni incluye respuestas fallidas/no enviadas. No existe aún base de conocimiento, catálogo ni motor empresarial de reglas: no se simula una búsqueda. Se utilizan las instrucciones de sistema actuales, que prohíben inventar precios o afirmar acciones no ejecutadas.

## Límites persistentes

- 120 solicitudes HTTP por IP y minuto.
- 30 envíos por IP y minuto.
- 10 sesiones nuevas por IP y hora.
- 10 consultas por sesión y minuto.
- Máximo de consultas por conversación, concurrencia y presupuesto diario configurables.

Los contadores de IP se almacenan con claves hash; no se guarda la IP en texto. Se limpian únicamente contadores de rate limit ya expirados. No se borran conversaciones al expirar sesiones. Los límites distribuidos usan PostgreSQL, sin nueva infraestructura ni dependencias.

## Validación realizada

- Backend TypeScript y frontend vue-tsc/Vite: compilan.
- Suite completa con RUN_WEB_CHAT_DB_TESTS=1: **30 aprobadas, 0 fallos, 2 omitidas**. Las dos omitidas son las integraciones antiguas de WhatsApp, optativas y no necesarias para el canal web.
- Prueba PostgreSQL con Gemini simulado: creación/expiración, aislamiento, persistencia, contexto, concurrencia por sesión y global, reintentos, conflictos, fallos, límites y consulta administrativa JWT. Solo limpia sus propios registros de prueba.
- Pruebas HTTP locales: validación, bearer independiente, límites de cuerpo y rechazo de archivos; comprobación de orígenes y hashes.
- Prueba real por HTTP público con Gemini: **“SENTIA web conectado correctamente.”**, entrada y salida persistidas. Repetición del mismo requestId: dos mensajes totales y ninguna nueva generación.
- Chrome local, escritorio 1440×1000 y móvil 390×844: cuatro sugerencias, interfaz pública sin herramientas administrativas, sin desbordamiento horizontal y sin excepciones JavaScript.
- Envío real desde el navegador: **“Chat web verificado.”**, ambos mensajes visibles; historial conservado al recargar; modo oscuro comprobado.
- La primera prueba de navegador usó un backend temporal limitado por la red del sandbox y produjo AI_TIMEOUT_OR_NETWORK. La repetición con acceso de red autorizado pasó. Se conserva ese error de prueba en el historial, sin falsificar éxito.
- Las conversaciones reales de prueba quedaron visibles para el administrador. No se enviaron mensajes a WhatsApp ni se activó AI_AUTO_REPLY.

Durante db:generate, Windows impidió reemplazar la DLL de Prisma ya cargada por otro proceso (EPERM). El generador sí actualizó los artefactos JavaScript/tipos antes de ese paso, y las consultas reales a WebSession/PublicRateBucket y el chat completo funcionaron. Para repetir db:generate sin ese aviso, detén las instancias que tengan abierto el motor Prisma y vuelve a ejecutarlo; no se forzó el cierre de procesos ajenos. No se cambió versión de Prisma.

## Archivos de esta implementación

Creados:
- client/src/views/Chat.vue
- server/src/services/web-chat.ts
- server/src/routes/public-chat.ts
- server/src/config/cors.ts
- server/prisma/migrations/20261030000000_web_chat/migration.sql
- server/tests/web-chat.test.ts
- server/tests/web-chat-database.test.ts
- docs/WEB_CHAT.md

Modificados:
- client/src/router.ts y client/src/views/Panel.vue
- server/prisma/schema.prisma
- server/src/config/env.ts, server/src/app.ts, server/src/middleware/errors.ts
- server/src/services/ai/context.ts y server/src/services/worker.ts
- server/src/routes/api.ts y server/.env.example
- .gitignore, README.md y documentación de API/arquitectura/pruebas/avances

No se agregaron dependencias ni se modificó server/.env.

## Pendientes y alcance real

Terminado y probado: chat público de texto, sesiones, contexto Gemini, PostgreSQL, controles básicos de abuso, historial y supervisión administrativa.

La orientación técnica conversacional está disponible; no es un diagnóstico definitivo. Productos, inventario y precios no tienen una fuente de conocimiento conectada. El escalamiento humano solo puede recomendarse: no hay entrega automática a un asesor. Los tickets pueden crearse a petición del cliente desde la IA del chat web y también manualmente en el panel. No se implementaron cotizaciones PDF, subida de imágenes, visión, RAG ni canales humanos en vivo. La integración Meta se conserva, pero continúa sin validación real por las restricciones de la cuenta.

No se publicó ni desplegó ningún sitio. Las verificaciones usaron servidores temporales y perfiles de navegador privados.
