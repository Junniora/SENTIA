# PostgreSQL 18 local y solución de P1012

Verificado el 29 de octubre de 2026 en Windows, sin Docker.

## Causa y corrección

El archivo `server/.env` no existía. `.env.example` es una plantilla y Prisma no lo carga como configuración real. Se creó `server/.env` conservando la configuración local facilitada, se generó un JWT_SECRET criptográficamente seguro con Node.js y se dejaron `AI_ENABLED=false` y `AI_AUTO_REPLY=false`.

Los scripts npm de la raíz delegan al workspace server, por lo que Prisma carga `server/.env` correctamente. No fue necesario cambiar el cargador, actualizar Prisma ni usar variables temporales para ejecutar migraciones. El `.env` de la raíz corresponde a Docker y no se utilizó. La plantilla del backend contiene una contraseña de ejemplo; la real permanece únicamente en el archivo local ignorado por Git.

## Verificaciones realizadas

- Servicio `postgresql-x64-18`: Running.
- Servidor: PostgreSQL 18.4, accesible en `127.0.0.1:5432`.
- Base `sentia` y rol `sentia`: ya existían; no se crearon ni se cambiaron contraseñas.
- `sentia` es propietario de la base, puede iniciar sesión, conectar y crear objetos en public; no es superusuario.
- Se inspeccionaron las relaciones de todos los esquemas no internos: la base estaba vacía antes de migrar. No había datos que respaldar.
- `server/.env` está excluido de Git, comprobado con `git check-ignore`.
- Prisma Client 6.19.3 generado; backend TypeScript compilado.
- Tablas verificadas: User, Contact, Conversation, Message, Ticket, ReplyJob y _prisma_migrations.
- Consultas Prisma a los seis modelos: correctas, todos con cero registros.
- Backend HTTP temporal: `/health` devolvió 200 y `{"status":"ok","database":"up"}`. Se cerró el proceso de comprobación.
- El agente permaneció inactivo. No se llamaron Gemini ni Meta.

## Comandos ejecutados

Desde la raíz:

```powershell
npm.cmd exec -w server -- prisma migrate status
npm.cmd run db:migrate
npm.cmd run db:generate
npm.cmd run build -w server
npm.cmd exec -w server -- prisma migrate status
```

La primera consulta de estado detectó dos migraciones pendientes y no presentó P1012. Tras verificar base, propietario, permisos y ausencia de objetos, `migrate deploy` aplicó:

- `20261016000000_initial`
- `20261029000000_agent`

La última consulta indicó `Database schema is up to date!`. También se utilizaron pg_isready, consultas de solo lectura por psql, consultas Prisma y una petición HTTP local. No se ejecutaron reset, db push, DROP ni borrados.

## Uso diario

Conserva `server/.env` y no lo vuelvas a copiar desde la plantilla. Desde la raíz, abre una terminal para cada proceso:

```powershell
npm.cmd run dev:server
```

```powershell
npm.cmd run dev:client
```

La API utiliza el puerto configurado en `server/.env`, normalmente 3000. Consulta `http://localhost:3000/health` con el backend en ejecución. No es necesario repetir las migraciones en cada arranque.

No ejecutes el inicializador antiguo `scripts/setup-local.ps1` sobre esta instalación: está orientado a PostgreSQL 16 y a crear una instalación nueva. PostgreSQL 18 ya está configurado y debe conservarse.

## Pendiente

La base aún no tiene usuarios administrativos. Para acceder al panel, configura ADMIN_NAME, ADMIN_EMAIL y ADMIN_PASSWORD en `server/.env` y ejecuta `npm.cmd run db:admin`; eso crea el primer administrador y no cambia su contraseña posteriormente.

Las pruebas optativas de la cola requieren otra base aislada con nombre que contenga test; no se ejecutaron contra sentia. Las credenciales reales de Gemini y Meta siguen pendientes. No actives las respuestas automáticas hasta autorizar y preparar esa validación. No subas `.env` a Git ni compartas sus valores.
