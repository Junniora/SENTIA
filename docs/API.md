# API REST
JSON. Errores: {"error":"mensaje"}. Rutas administrativas: Authorization: Bearer <JWT>, usuario existente y rol ADMIN. /api/auth/me admite cualquier usuario autenticado. Sin sesión: 401; rol insuficiente: 403; validación: 400; inexistente: 404; conflicto: 409; fallo interno: 500.

| Método | Ruta | Resultado |
|---|---|---|
| GET | /health | 200 con database:up o 503 con database:down |
| POST | /api/auth/login | email y password; devuelve token; 429 tras 20 intentos/15 min/IP |
| GET | /api/auth/me | id, name, email, role; nunca passwordHash |
| GET | /api/dashboard | contacts, conversations, openTickets, resolvedTickets |
| GET | /api/settings | configuración sin secretos; conexión Meta NOT_VERIFIED |
| GET | /api/contacts | {items,total}; offset >= 0, 50 por página |
| GET | /api/contacts/:id | contacto y conteos relacionados |
| GET | /api/conversations | {items,total}; offset, search por nombre o teléfono |
| GET | /api/conversations/:id | conversación y contacto |
| GET | /api/conversations/:id/messages | {items,total}; offset; más recientes primero |
| GET | /api/tickets | {items,total}; offset; incluye contacto |
| POST | /api/tickets | 201; contactId, title, description, priority opcional, conversationId opcional |
| PATCH | /api/tickets/:id | title, description, priority o status; al menos un campo |
| GET | /webhooks/whatsapp | hub.mode=subscribe, hub.verify_token, hub.challenge |
| POST | /webhooks/whatsapp | JSON original con X-Hub-Signature-256; sin JWT |

Tickets requieren title 1–200 y description 1–10000 caracteres; prioridad LOW/MEDIUM/HIGH, por defecto MEDIUM. Estados OPEN/IN_PROGRESS/RESOLVED. No se implementan DELETE, registro público ni envío de mensajes. El frontend muestra el alcance inicial; el selector de contacto para tickets carga los primeros 50 contactos (pendiente selector remoto para grandes volúmenes).
