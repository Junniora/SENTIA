# Arquitectura

El canal principal ahora es el chat web público /chat. Reutiliza GeminiProvider y buildContext; sus sesiones se autentican mediante tokens aleatorios almacenados como hashes. PostgreSQL conserva Conversation/Message y ReplyJob. La generación web es síncrona con timeout, límites persistentes y leases; las tareas WEB no pasan al trabajador de WhatsApp. La administración sigue protegida por JWT. Ver [arquitectura y validación web](WEB_CHAT.md).

Vue 3/Quasar consulta la API protegida por JWT. La sesión permanece en sessionStorage; Express verifica el usuario y el rol vigente en cada petición. Se conservan Pinia, Axios, modo claro/oscuro y rutas existentes.

El webhook conserva bytes originales y valida HMAC antes de interpretar eventos. Cada mensaje entra en una transacción PostgreSQL que identifica contacto y conversación, evita duplicados y, cuando el agente está activo, crea una ReplyJob única. El ACK no espera a proveedores.

El trabajador interno consulta la cola durable con leases y SKIP LOCKED. Procesa tareas por secuencia de recepción, sin adelantar tareas previas activas de una misma conversación. Contexto limitado → AiProvider → Gemini → respuesta persistida → Meta Cloud API → resultado persistido. Los errores no se propagan a otros módulos administrativos.

AiProvider no depende de WhatsApp. Gemini utiliza @google/genai con instrucciones de sistema, timeout y un intento SDK por generación; la cola controla hasta tres intentos. No hay herramientas administrativas accesibles al modelo.

Message distingue origen, dirección, entrega y medios. Los eventos de Meta actualizan estados sin regresiones de entrega. Un envío incierto no se repite automáticamente: se espera correlación por callback o revisión humana. No se promete exactamente una entrega a través de sistemas externos.

Seguridad conservada: Zod, JWT, bcrypt, permisos ADMIN, límite de login por IP, tamaños HTTP limitados y errores sin cuerpos/credenciales. Los timeouts externos son menores que el lease. Se validan destinatarios y ventana de 24 horas; no hay envío de plantillas en esta fase. La descarga preparada de imágenes valida host HTTPS, formato y tamaño y nunca persiste URLs temporales.

Al desactivar el agente no se pierde la administración ni los mensajes. Las tareas anteriores quedan pausadas y se reevalúan al reactivar. No se generan tareas retroactivas para mensajes recibidos con el agente inactivo.

Consulta [Fase 1](AGENT_PHASE1.md) para configuración, archivos, recuperación, pruebas y límites. La arquitectura está implementada; su persistencia y concurrencia reales siguen pendientes de validación PostgreSQL. En producción quedan pendientes auditoría, observabilidad, limitador compartido, CSP y evaluación de cookies HttpOnly/revocación.
