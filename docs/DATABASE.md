# Base de datos

El chat web agrega Conversation.channel, WebSession y PublicRateBucket mediante la migración aditiva 20261030000000_web_chat. Se aplicó a PostgreSQL 18 local con respaldo previo. Reutiliza Message y ReplyJob; detalles de seguridad, sesiones y estados en [WEB_CHAT.md](WEB_CHAT.md).
PostgreSQL 16. User tiene email único, hash bcrypt y rol ADMIN/AGENT. Contact tiene teléfono único y relaciones uno a muchos con Conversation y Ticket. Conversation pertenece a un contacto y tiene mensajes y tickets. Message pertenece a una conversación; externalMessageId es único cuando existe y permite NULL para futuros mensajes sin ID externo. Ticket siempre pertenece a un contacto; conversationId es opcional y la API verifica que corresponda al mismo contacto.

Estados de conversación: OPEN/CLOSED. Tickets: OPEN/IN_PROGRESS/RESOLVED. Prioridad: LOW/MEDIUM/HIGH. Mensajes: INBOUND/OUTBOUND. Fechas automáticas e índices por contacto, estado y fecha. Las claves foráneas impiden referencias inexistentes; no hay endpoints de eliminación en esta fase.

La migración aditiva 20261029000000_agent agrega origen, estados de entrega, error, fecha de estado, datos de medios y replyToId único a Message. Los registros previos conservan UNKNOWN; no se infieren entregas. Crea ReplyJob con relación única al mensaje entrante, conversationId, secuencia autoincremental, intentos, estado, disponibilidad y lease. La tarea se inserta junto al mensaje en una misma transacción. No se eliminan ni reinician datos. Esta migración aún no se aplicó a PostgreSQL en esta sesión.

Ejecuta npm.cmd run db:generate y npm.cmd run db:migrate desde la raíz después de iniciar PostgreSQL. La migración SQL inicial está versionada. Para evolucionar el esquema: npm.cmd exec -w server -- prisma migrate dev --name nombre_descriptivo. Revisa SQL antes de aplicarlo. No uses db push como sustituto de migraciones. El volumen Docker persiste los datos; no ejecutes down -v si quieres conservarlos.
