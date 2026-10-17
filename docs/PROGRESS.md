# Avances

Implementado significa presente en código; la validación en PostgreSQL se indica por separado.

## Semana 3
- Git: implementado. Se conservó el repositorio existente; sin remoto ni publicación.
- Estructura: implementada. Monorepositorio npm, client/server/docs y configuración reproducible.
- Base de datos: parcialmente implementada. Prisma, relaciones, índices y migración SQL generados; aplicación y conexión pendientes por ausencia de Docker/PostgreSQL.
- Backend inicial: implementado. Compila, arranca, valida entorno, protege rutas y responde HTTP. Login con datos persistentes pendiente de validación.

## Semana 4
- Endpoints WhatsApp: implementados. GET y POST separados, firma sobre bytes originales, filtro de número y transacciones.
- Validación de webhooks: parcialmente implementada. HMAC y HTTP probados; persistencia, concurrencia y deduplicación reales pendientes de PostgreSQL. Conexión Meta pendiente.
- Panel: implementado. Login, resumen, conversaciones con búsqueda e historial, contactos, tickets y configuración; responsive y claro/oscuro. Compilación correcta; validación visual y navegación con datos reales pendientes.
- Pruebas funcionales: parcialmente implementadas. Ocho pruebas locales aprobadas y prueba de integración optativa preparada. Migraciones, credenciales reales, ngrok y E2E pendientes.

## Trabajo posterior
Resolver avisos de dependencias Prisma antes de producción; ejecutar suite con PostgreSQL; verificar cuenta Meta y túnel; probar UI en navegador; selector remoto de contactos para más de 50 registros; gestión de usuarios; envío de mensajes; medios y proveedor IA. No hay respuestas simuladas ni indicadores inventados.
