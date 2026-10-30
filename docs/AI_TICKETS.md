# Tickets creados por IA desde el chat web

Implementado y verificado el 29 de octubre de 2026.

## Nombre del solicitante

Antes de crear el ticket, la IA pregunta a nombre de quién registrarlo. Basta un nombre o alias; no exige apellidos, teléfono ni correo. Si ya se aportó en el historial, lo reutiliza. El backend exige un nombre válido y expresado en mensajes del propio cliente, o uno ya guardado en su contacto; si falta, guarda una pregunta y no crea el ticket.

El nombre se guarda en Contact.name en la misma transacción del ticket y su confirmación. Se muestra como Solicitante en el panel y A nombre de en la tarjeta del chat. No es una identidad verificada. Si falla el ticket, también se revierte el cambio del nombre. No requiere migración.

Verificación real: Gemini preguntó “¿A nombre de quién registro el ticket?” y no creó ningún registro hasta recibir el nombre ficticio Elena Torres. Después guardó el ticket y su contacto correctamente. El ticket de esta comprobación quedó marcado [PRUEBA] en el panel. Backend y frontend compilan y las 33 pruebas siguen aprobadas.

## Uso

Reinicia el backend y el frontend si estaban abiertos. En /chat describe el problema y pide, por ejemplo:

> Mi laptop no enciende y ya probé otro enchufe. Crea un ticket para que el equipo le dé seguimiento.

Gemini pregunta si falta información. Pedir orientación o hablar con un asesor no basta para autorizar un ticket. Al solicitarlo con un caso concreto, el backend crea el registro real y devuelve título, referencia y estado. El chat muestra una tarjeta de solo lectura; el administrador lo consulta y actualiza desde Tickets.

La disponibilidad utiliza la misma configuración del chat. No hay variables nuevas, dependencias nuevas ni migración. AI_AUTO_REPLY sigue desactivado y la creación de tickets por IA se habilita únicamente en el canal web.

## Implementación y garantías

GeminiProvider.respond devuelve una respuesta JSON estructurada con texto y una propuesta de ticket opcional. Se reutilizan el proveedor, su contexto y los validadores de tickets. El modo generate de WhatsApp conserva sus instrucciones sin acciones.

La propuesta admite exclusivamente título, descripción, prioridad y nombre del solicitante (requesterName). Zod rechaza IDs de contactos, conversaciones, estado, asignación u otros campos. La propiedad se obtiene en el servidor de la conversación autenticada; el modelo no puede elegir otra cuenta.

La respuesta de Gemini todavía no constituye una creación. En una única transacción PostgreSQL se verifica el lease, se reclama el trabajo, se bloquea la conversación, se comprueba si tiene un ticket abierto, se crea o reutiliza el ticket y se guarda la confirmación. La confirmación final y su ID los construye el backend tras la operación, sin depender de una afirmación del modelo.

Si falla cualquier paso se revierte todo y el trabajo queda FAILED. No se guarda una respuesta que afirme que el ticket se creó. Los reintentos del mismo requestId reutilizan el resultado; solicitudes repetidas distintas también reutilizan el ticket activo de la conversación. Cuando el anterior está RESOLVED, se puede abrir otro al solicitarlo.

Por ahora hay como máximo un ticket activo creado por este flujo en cada conversación. Para problemas distintos que deban gestionarse en paralelo se puede iniciar otra conversación. La IA no cierra, modifica, asigna ni consulta tickets de terceros; no promete tiempos de respuesta ni envía notificaciones al equipo.

GET /api/public/chat/messages incluye tickets de esa sesión con id, title, status, priority y createdAt. La tarjeta refleja los cambios de estado administrativos al actualizar el historial. No hay endpoint público para editar tickets.

## Pruebas

- Backend y frontend compilan.
- Suite con RUN_WEB_CHAT_DB_TESTS=1: **33 aprobadas, 0 fallos, 2 integraciones antiguas de WhatsApp omitidas**.
- Se ejecutan los archivos de prueba secuencialmente para que sus comprobaciones de concurrencia global no interfieran entre suites que comparten PostgreSQL.
- Mock SDK: JSON estructurado, validación de prioridades y rechazo de IDs arbitrarios.
- PostgreSQL real con IA simulada: consulta sin creación, ticket persistido con dueño correcto, aislamiento entre sesiones, idempotencia, reutilización de abierto, creación tras resolución y rollback ante fallo de almacenamiento.
- Gemini real: “Quiero crear un ticket” produjo una pregunta y cero tickets. Al añadir el problema concreto creó **[PRUEBA] Laptop no enciende**, prioridad MEDIUM y estado OPEN. La repetición del requestId conservó un solo ticket.
- Ese ticket real de prueba se conservó en el panel administrativo para que puedas revisarlo. No se enviaron mensajes a Meta, no se cambiaron credenciales ni se realizaron despliegues.

## Archivos

Modificados: services/ai/index.ts, services/ai/gemini.ts, services/ai/prompt.ts, services/web-chat.ts, client/src/views/Chat.vue, server/tests/gemini.test.ts y server/package.json.

Creados: server/src/validators/ai-reply.ts, server/tests/web-ticket-database.test.ts y esta documentación. README, WEB_CHAT, API y avances se actualizaron para reflejar el nuevo alcance.
