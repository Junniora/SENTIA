# Pruebas y resultados · 16 de octubre de 2026

Ejecutado en Windows, Node 24.19.0, npm 11.17.0:

| Verificación | Resultado |
|---|---|
| Instalación npm | Correcta; package-lock.json generado |
| Prisma generate | Correcto, Prisma 6.19.3 |
| Migración SQL desde esquema vacío | Generada con prisma migrate diff |
| Compilación backend TypeScript | Correcta |
| Frontend vue-tsc + Vite | Correcta, 98 módulos |
| Pruebas locales | 8 aprobadas |
| Arranque Express y peticiones HTTP | Correcto dentro de las pruebas |
| Variables inválidas | Rechazadas |
| HMAC válido, cuerpo alterado, firma incompleta | Resultados esperados |
| Challenge GET, token incorrecto | 200 y 403 |
| Rutas sin sesión y JWT inválido | 401 |
| Evento firmado sin mensajes | 200 sin acceso a datos |
| Fixture Meta y filtro de número | Correctos |
| Validación de tickets | Rechaza estados y entradas inválidos |
| Salud sin PostgreSQL | 503, database:down; no se considera conexión exitosa |
| npm audit | 3 avisos altos en prisma / @prisma/config / deepmerge-ts |

La auditoría identifica GHSA-ggr8-5vv4-36mx (agotamiento de pila al fusionar grafos recursivos). La corrección propuesta por npm cambia Prisma a versión mayor; queda pendiente evaluar esa migración antes de producción. No se ejecutó audit fix --force.

Limitaciones: Docker no está instalado. No se aplicaron migraciones a una instancia PostgreSQL ni se verificaron login real, persistencia, tickets o deduplicación en base de datos. No hay credenciales Meta, conexión real, ngrok ni prueba visual en navegador. La comunicación frontend/backend está implementada mediante Axios y proxy, pero no se validó de extremo a extremo en navegador.

La instalación, generación Prisma y pruebas necesitaron permisos fuera del sandbox por restricciones de red, lectura de esbuild y userInfo de tsx. Las repeticiones autorizadas terminaron correctamente.

## Repetir pruebas
Desde raíz: npm.cmd run db:generate; npm.cmd test; npm.cmd run build (cada comando por separado).

## Integración PostgreSQL preparada, pendiente de ejecutar
Usa una base aislada, configura server/.env con DATABASE_URL apuntando a ella y un WHATSAPP_APP_SECRET de prueba. Aplica npm.cmd run db:migrate. En PowerShell:

    $env:RUN_DB_TESTS='1'
    npm.cmd test
    Remove-Item Env:RUN_DB_TESTS

La prueba optativa crea su propio administrador, contacta al webhook por HTTP dos veces, comprueba unicidad de mensaje y conversación, autentica, crea y resuelve un ticket y comprueba rechazo por rol AGENT. Limpia exclusivamente sus propios registros. No debe ejecutarse sobre producción. El esquema y migraciones no se aplican automáticamente desde los tests.
