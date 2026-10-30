# Avances

## Tickets por IA

El chat web puede crear tickets reales a petición del cliente, con validación, asociación a la sesión, confirmación transaccional y prevención de duplicados. Se verificó con Gemini real y PostgreSQL. Backend/frontend compilan; suite: 33 aprobadas, 0 fallos, 2 integraciones antiguas de WhatsApp omitidas. No requiere migración ni nuevas variables. Detalles: [AI_TICKETS.md](AI_TICKETS.md).

## Chat web público

Implementado y validado el canal /chat sin depender de Meta. Migración aditiva aplicada a PostgreSQL 18, respaldada previamente. Sesiones públicas aisladas, controles de abuso persistentes, contexto Gemini, errores e historial administrativo por canal. Backend y frontend compilan. Suite con integración web PostgreSQL: 30 aprobadas, 0 fallos, 2 pruebas antiguas WhatsApp omitidas. Prueba real por HTTP y por navegador, incluyendo móvil, modo oscuro y recarga del historial: correctas. AI_AUTO_REPLY permanece false; no se enviaron mensajes a Meta. Ver [informe del chat web](WEB_CHAT.md).

Estado al 29 de octubre de 2026. Implementado significa presente en código; no acredita prueba con proveedores reales.

- Base existente conservada: autenticación, panel, contactos, conversaciones, tickets y webhook HMAC.
- Fase 1 implementada: proveedor Gemini, contexto PostgreSQL, cliente de envío Meta, cola persistente con recuperación, estados reales, datos multimedia y visualización del agente.
- Compilación backend y frontend: correcta.
- Pruebas: 25 locales aprobadas con mocks y HTTP local; dos integraciones PostgreSQL optativas pendientes.
- Migración aditiva creada y esquema Prisma validado; aplicación y conservación comprobada sobre una base real pendientes.
- No se hicieron llamadas a Gemini, envíos de WhatsApp, despliegues ni cambios en bases existentes.
- No se declara terminada la fase: faltan las validaciones PostgreSQL y reales autorizadas, además de revisión visual.

Detalle de archivos, configuración, pruebas, limitaciones y próximos pasos: [AGENT_PHASE1.md](AGENT_PHASE1.md).

## Configuración local posterior: PostgreSQL 18

Se resolvió P1012 creando server/.env, sin modificar el cargador de Prisma. PostgreSQL 18.4 y la base sentia existente se verificaron; estaba vacía. Ambas migraciones quedaron aplicadas, Prisma Client se generó, TypeScript compiló y /health devolvió 200 con database:up. Se verificaron los seis modelos, incluida ReplyJob. No se ejecutaron las suites de integración de la cola ni pruebas reales Gemini/Meta; las respuestas automáticas permanecen desactivadas. Ver [informe local](LOCAL_POSTGRESQL18.md).
