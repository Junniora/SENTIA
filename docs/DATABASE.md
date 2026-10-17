# Base de datos
PostgreSQL 16. User tiene email único, hash bcrypt y rol ADMIN/AGENT. Contact tiene teléfono único y relaciones uno a muchos con Conversation y Ticket. Conversation pertenece a un contacto y tiene mensajes y tickets. Message pertenece a una conversación; externalMessageId es único cuando existe y permite NULL para futuros mensajes sin ID externo. Ticket siempre pertenece a un contacto; conversationId es opcional y la API verifica que corresponda al mismo contacto.

Estados de conversación: OPEN/CLOSED. Tickets: OPEN/IN_PROGRESS/RESOLVED. Prioridad: LOW/MEDIUM/HIGH. Mensajes: INBOUND/OUTBOUND. Fechas automáticas e índices por contacto, estado y fecha. Las claves foráneas impiden referencias inexistentes; no hay endpoints de eliminación en esta fase.

Ejecuta npm.cmd run db:generate y npm.cmd run db:migrate desde la raíz después de iniciar PostgreSQL. La migración SQL inicial está versionada. Para evolucionar el esquema: npm.cmd exec -w server -- prisma migrate dev --name nombre_descriptivo. Revisa SQL antes de aplicarlo. No uses db push como sustituto de migraciones. El volumen Docker persiste los datos; no ejecutes down -v si quieres conservarlos.
