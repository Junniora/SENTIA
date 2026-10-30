# API REST

El historial público GET /api/public/chat/messages también devuelve tickets de la sesión (id, title, status, priority, createdAt). Su creación desde IA es interna, validada y transaccional; no se acepta un contactId o conversationId del visitante o del modelo. No hay edición pública de tickets. Ver [AI_TICKETS.md](AI_TICKETS.md).
El chat público está documentado en [WEB_CHAT.md](WEB_CHAT.md). Sus rutas no requieren JWT administrativo: POST /api/public/chat/session crea una sesión y GET/POST /api/public/chat/messages requieren su token público. Las rutas administrativas de conversaciones admiten channel=WEB o WHATSAPP.

JSON. Errores: {"error":"mensaje"}. Rutas administrativas: Authorization: Bearer <JWT>, usuario existente y rol ADMIN. /api/auth/me admite cualquier usuario autenticado. Sin sesión: 401; rol insuficiente: 403; validación: 400; inexistente: 404; conflicto: 409; fallo interno: 500.

| Método | Ruta | Resultado |
|---|---|---|
| GET | /health | 200 con database:up o 503 con database:down |
| POST | /api/auth/login | email y password; devuelve token; 429 tras 20 intentos/15 min/IP |
| GET | /api/auth/me | id, name, email, role; nunca passwordHash |
| GET | /api/dashboard | contacts, conversations, openTickets, resolvedTickets |
| GET | /api/settings | configuración sin secretos; conexión Meta NOT_VERIFIED; agent incluye enabled, autoReply, configured, whatsappReady, active, provider y model (presencia de configuración, no verificación real) |
| GET | /api/contacts | {items,total}; offset >= 0, 50 por página |
| GET | /api/contacts/:id | contacto y conteos relacionados |
| GET | /api/conversations | {items,total}; offset, search por nombre o teléfono |
| GET | /api/conversations/:id | conversación y contacto |
| GET | /api/conversations/:id/messages | {items,total}; offset; más recientes primero; incluye source, deliveryStatus, deliveryError, mediaId, mimeType y job con state/errorCode |
| GET | /api/tickets | {items,total}; offset; incluye contacto |
| POST | /api/tickets | 201; contactId, title, description, priority opcional, conversationId opcional |
| PATCH | /api/tickets/:id | title, description, priority o status; al menos un campo |
| GET | /webhooks/whatsapp | hub.mode=subscribe, hub.verify_token, hub.challenge |
| POST | /webhooks/whatsapp | JSON original con X-Hub-Signature-256; sin JWT |

Tickets requieren title 1–200 y description 1–10000 caracteres; prioridad LOW/MEDIUM/HIGH, por defecto MEDIUM. Estados OPEN/IN_PROGRESS/RESOLVED. No se implementan DELETE, registro público ni envío manual desde el panel. El envío automático se realiza internamente mediante la cola; no hay endpoint público para generar o enviar. Los eventos de estado firmados de Meta actualizan las salidas persistidas. El frontend muestra el alcance inicial; el selector de contacto para tickets carga los primeros 50 contactos (pendiente selector remoto para grandes volúmenes).
