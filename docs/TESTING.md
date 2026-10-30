# Pruebas · 29 de octubre de 2026

## Validación posterior del chat web

Backend y frontend compilan. Ejecutando RUN_WEB_CHAT_DB_TESTS=1, la suite termina con **30 aprobadas, 0 fallos y 2 omitidas** (integraciones antiguas WhatsApp). La nueva integración usa PostgreSQL real y Gemini simulado, limpiando solo sus registros. Las llamadas reales pequeñas al chat público y al navegador devolvieron “SENTIA web conectado correctamente.” y “Chat web verificado.”. Se comprobó reintento idempotente, vistas desktop/móvil, modo oscuro y recarga del historial. No se llamó a Meta. Detalles y limitación EPERM de generación de Prisma: [WEB_CHAT.md](WEB_CHAT.md).

Para repetir la prueba web contra la base local configurada, con las migraciones aplicadas:

```powershell
$env:RUN_WEB_CHAT_DB_TESTS='1'
npm.cmd test
Remove-Item Env:RUN_WEB_CHAT_DB_TESTS
```

Los resultados siguientes corresponden a la fase anterior; no sustituyen la validación web posterior.

Resultados de esta sesión:

| Comprobación | Resultado |
|---|---|
| Instalación de dependencias y SDK oficial | Correcta |
| Prisma generate | Correcto, 6.19.3 |
| Prisma validate | Correcto, URL ficticia sin conectar |
| Backend TypeScript | Correcto |
| Frontend vue-tsc + Vite | Correcto; requirió permisos ampliados por lectura de esbuild |
| Pruebas locales HTTP y unitarias | 25 aprobadas |
| Integraciones PostgreSQL | 2 omitidas (optativas) |
| Migración nueva aplicada | No: no hay PostgreSQL disponible |
| Gemini y Meta reales | No se hicieron llamadas |
| Navegador completo | Pendiente |
| npm audit | 5 avisos altos y 1 moderado |

La suite usa mocks del SDK Gemini y cliente HTTP Meta: comprueba mapeo de roles e instrucciones, cuotas, autenticación, HTTP, respuestas vacías/bloqueadas, errores de conexión, contexto acotado, persistencia antes del envío, reanudación de respuestas guardadas, control de propiedad, resultados inciertos y ventana de atención. Se conservan las pruebas HMAC, protección de rutas y tickets. /health devolvió 503 al no disponer de PostgreSQL; no se considera una conexión exitosa.

Ejecuta desde raíz, cada comando por separado:

```powershell
npm.cmd run db:generate
npm.cmd test
npm.cmd run build
```

## Integración PostgreSQL aislada (pendiente)

Crea una base dedicada cuyo nombre contenga test, sin datos reales. Aplica ambas migraciones a esa base. No uses producción, una base compartida con un trabajador activo ni datos que deban conservarse. Los tests no aplican ni resetean migraciones.

```powershell
$env:TEST_DATABASE_URL='postgresql://usuario:clave@127.0.0.1:5432/sentia_test'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npm.cmd run db:migrate
$env:RUN_DB_TESTS='1'
npm.cmd test
Remove-Item Env:RUN_DB_TESTS
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:DATABASE_URL
```

Las dos suites requieren TEST_DATABASE_URL y rechazan nombres que no contienen test. Se ejecutan con proveedores simulados y no arrancan el trabajador automático. Crean y limpian únicamente sus registros de prueba. La base debe estar aislada y sin tareas ajenas porque se comprueba la selección real de la cola.

La suite existente comprueba login, permisos, recepción/deduplicación y tickets. La nueva comprueba inserción concurrente duplicada, unicidad de tarea, orden de claims, recuperación de leases y fencing, contexto guardado, salida IA, estados fuera de orden, correlación tras envío incierto, medios y respuesta API utilizada por el panel. Preparada en código, no ejecutada aquí.

## Auditoría

Se consultó npm audit sin aplicar correcciones automáticas. Los avisos afectan a Prisma/@prisma/config/deepmerge-ts, body-parser, Zod y Vite. Prisma y Zod requieren evaluar cambios mayores. No se ejecutó audit fix --force. Resolver y repetir la auditoría antes de producción.

La prueba real autorizada y las limitaciones se describen en [AGENT_PHASE1.md](AGENT_PHASE1.md).
