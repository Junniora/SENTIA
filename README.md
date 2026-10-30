# SENTIA · Brigada 105

SENTIA es un sistema de asistencia y gestión de atención de la **Brigada 105**. Su objetivo es centralizar contactos, consultar conversaciones de WhatsApp y dar seguimiento a solicitudes mediante tickets desde un panel administrativo.

Esta primera versión incluye autenticación, indicadores obtenidos de PostgreSQL, historial de mensajes y gestión inicial de tickets. La recepción por WhatsApp requiere configurar una cuenta de Meta. La fase 1 incorpora un agente Gemini y envío de respuestas por WhatsApp mediante una cola persistente en PostgreSQL. Está desactivado por defecto y requiere configuración y validación real autorizada. Consulta [el informe de fase 1](docs/AGENT_PHASE1.md).

## Tickets desde la IA

En `/chat` puedes describir un problema y pedir **“Crea un ticket”**. La IA recopila la información que falte y el backend guarda el ticket real para revisarlo en el panel. La conversación muestra su referencia y estado. Ver [funcionamiento y pruebas](docs/AI_TICKETS.md).

## Chat web público · canal principal

Abre **http://localhost:5173/chat** para conversar con SENTIA sin cuenta administrativa ni configuración de WhatsApp. El chat utiliza Gemini, conserva su historial en PostgreSQL y aparece en el panel bajo el filtro **Web Chat**. Mantén `AI_AUTO_REPLY=false`: el control del canal web es `WEB_CHAT_AI_ENABLED`, activado por defecto cuando `AI_ENABLED` y la clave están disponibles.

Consulta [configuración, seguridad y pruebas del chat web](docs/WEB_CHAT.md). La migración aditiva del canal web ya se aplicó a PostgreSQL 18 local y se comprobó una conversación real con Gemini desde el navegador.

## Qué puedes hacer

| Sección | Uso |
|---|---|
| Inicio de sesión | Acceder con una cuenta de administrador |
| Resumen | Consultar contactos, conversaciones y tickets abiertos o resueltos |
| Conversaciones | Filtrar Web Chat/WhatsApp, buscar y consultar el historial de cliente e IA |
| Contactos | Consultar teléfono, fecha de registro y detalle |
| Tickets | Crear solicitudes y actualizar su estado |
| Configuración | Revisar disponibilidad de la API, configuración de WhatsApp y cambiar el tema |

## Tecnologías

- **Frontend:** Vue 3, Composition API, TypeScript, Quasar, Pinia, Vue Router y Axios.
- **Backend:** Node.js, Express, TypeScript, Prisma, Zod, JWT y bcrypt.
- **Datos:** PostgreSQL 16, con migraciones Prisma.
- **Integración:** webhooks GET/POST de WhatsApp Cloud API, con validación de firma, prevención de duplicados, envío de texto y eventos de entrega. Gemini utiliza el SDK oficial @google/genai.

## Requisitos

- Node.js 22 o 24 y npm.
- PostgreSQL 18 instalado localmente **o** PostgreSQL 16 con Docker Compose.
- PowerShell para los comandos de esta guía.
- pgAdmin es opcional: permite administrar PostgreSQL, pero no sustituye al servidor.

Ejecuta los comandos desde la carpeta raíz del proyecto, donde está package.json. Los archivos .env contienen credenciales locales y estón excluidos de Git. Nunca copies sus valores reales al README ni a un repositorio.

> **Instalaci?n local con PostgreSQL 18:** consulta [la configuraci?n verificada y soluci?n de P1012](docs/LOCAL_POSTGRESQL18.md). El backend utiliza `server/.env`; `.env.example` es solo una plantilla.

## Inicializar por primera vez

Elige una de las dos opciones siguientes. Si SENTIA ya está configurado en tu equipo, ve directamente a **Iniciar el proyecto en el día a día**.

### Opción A: PostgreSQL instalado en Windows

1. Comprueba en services.msc que el servicio postgresql-x64-16 está en ejecución. Conserva la contraseña del usuario postgres que elegiste durante la instalación.
2. Instala las dependencias:

   ```powershell
   npm.cmd install
   ```

3. Ejecuta el inicializador local:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
   ```

4. Escribe la contraseña de postgres cuando se solicite y pulsa Enter. No se muestran caracteres mientras escribes.

El script espera PostgreSQL 16 en C:\Program Files\PostgreSQL\16 y el servidor en 127.0.0.1:5432. Crea el usuario y la base sentia, genera credenciales aleatorias, configura server/.env, genera Prisma Client, aplica las migraciones y crea el primer administrador.

**Acceso inicial generado por el script:**

- Correo: admin@sentia.local.
- Contraseña: el valor de ADMIN_PASSWORD en server/.env, sin incluir ADMIN_PASSWORD=.

El inicializador se detiene si ya existe el usuario o la base sentia para conservar la instalación existente. No lo ejecutes cada vez que arranques el proyecto. Si falla después de crear la base y guardar el entorno, corrige el error y continúa con el comando indicado; no vuelvas a crear todo.

### Opción B: PostgreSQL con Docker Compose

1. Instala dependencias y crea los archivos de configuración **solo si aón no existen**:

   ```powershell
   npm.cmd install
   Copy-Item .env.example .env
   Copy-Item server/.env.example server/.env
   ```

2. En el archivo .env de la raíz configura POSTGRES_USER, POSTGRES_PASSWORD y POSTGRES_DB. En server/.env configura DATABASE_URL con esos mismos datos. Si la contraseña contiene caracteres especiales, codifícalos para su uso en una URL.
3. Genera un secreto y pega el resultado en JWT_SECRET de server/.env:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. En server/.env configura ADMIN_NAME, ADMIN_EMAIL y ADMIN_PASSWORD con tus propios valores. La contraseña inicial debe tener entre 12 y 72 caracteres.
5. Inicia la base, aplica migraciones y crea el administrador:

   ```powershell
   docker compose up -d --wait
   npm.cmd run db:generate
   npm.cmd run db:migrate
   npm.cmd run db:admin
   ```

No ejecutes al mismo tiempo PostgreSQL local y Docker sobre el puerto 5432. El volumen de Docker conserva los datos entre arranques. Evita docker compose down -v si necesitas conservarlos.

## Iniciar el proyecto en el día a día

1. Asegúrate de que PostgreSQL está activo. Si usas Docker:

   ```powershell
   docker compose up -d --wait
   ```

2. Abre una terminal para el backend:

   ```powershell
   npm.cmd run dev:server
   ```

3. Abre otra terminal en la raíz para el frontend:

   ```powershell
   npm.cmd run dev:client
   ```

4. Entra a **http://localhost:5173/login** e introduce las credenciales del administrador. Puedes usar tambión http://127.0.0.1:5173/login.
5. Comprueba **http://localhost:3000/health**: con la base disponible devuelve status: ok y database: up.

Mantón ambas terminales abiertas. Para detener cada proceso pulsa **Ctrl + C** en su terminal. No necesitas repetir la creación de la base, migraciones iniciales ni creación del administrador en cada arranque.

## Cómo usar el panel

1. **Inicia sesión.** No existe registro público de usuarios. El inicializador crea la primera cuenta ADMIN; el rol AGENT está reservado para una etapa posterior.
2. **Consulta el resumen.** Los indicadores proceden de la base de datos. Una instalación nueva muestra ceros porque todavía no tiene registros.
3. **Recibe contactos y conversaciones.** Al configurar WhatsApp y recibir un mensaje válido, el backend registra el contacto, una conversación y el mensaje. También se crean contactos al iniciar una conversación desde el chat web. Esta versión no incluye creación manual de contactos desde el panel.
4. **Busca una conversación.** En Conversaciones, escribe el nombre o teléfono, pulsa Enter o el icono de búsqueda y abre Ver detalle. Puedes cargar mensajes anteriores cuando el historial lo permita.
5. **Consulta contactos.** Abre Contactos para ver sus datos y fecha de registro.
6. **Crea un ticket.** En Tickets, pulsa Nuevo ticket, selecciona un contacto existente, completa título y descripción, elige prioridad y guarda. Si no hay contactos, puedes iniciar una conversación desde /chat; también se crean contactos mediante WhatsApp si se configura.
7. **Da seguimiento.** Actualiza el estado del ticket a OPEN, IN_PROGRESS o RESOLVED desde su selector. Las prioridades disponibles son LOW, MEDIUM y HIGH.
8. **Ajusta la apariencia.** Usa el botón de tema de la barra superior o el interruptor de Configuración. La preferencia se conserva en el navegador.
9. **Cierra sesión** desde la barra lateral cuando termines.

El selector de contactos de nuevos tickets carga los primeros 50 registros; un selector remoto para volúmenes mayores queda pendiente. La vista de mensajes diferencia entradas, salidas IA y estados de envío; se actualiza mientras está abierta. No hay envío manual desde el panel.

## Configuración del entorno

| Archivo | Variables | Propósito |
|---|---|---|
| .env de la raíz | POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB | Configuración de Docker Compose; no es necesario para PostgreSQL instalado directamente |
| server/.env | DATABASE_URL | Conexión del backend a PostgreSQL |
| server/.env | JWT_SECRET | Firma de sesiones; al menos 32 caracteres aleatorios |
| server/.env | PORT, CORS_ORIGIN | Puerto de API (3000) y origen permitido (http://localhost:5173) |
| server/.env | ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD | Creación inicial del administrador |
| server/.env | WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN | Configuración de Meta |
| server/.env | GEMINI_API_KEY, GEMINI_MODEL, AI_ENABLED, AI_AUTO_REPLY | Configuración y habilitación del agente; desactivado por defecto |
| server/.env | WHATSAPP_GRAPH_VERSION | Versión de Graph soportada por tu aplicación |
| client/.env, opcional | VITE_API_URL | Dirección de API cuando el cliente se sirve por separado |

En desarrollo, Vite redirige /api y /health al backend en http://localhost:3000; client/.env no es necesario para ese caso. Si cambias el puerto del backend, ajusta tambión el proxy en client/vite.config.ts.

ADMIN_* solo se utiliza al crear la cuenta; editar ADMIN_PASSWORD después no modifica la contraseña guardada en la base. Guarda la contraseña de acceso en un lugar privado y luego puedes eliminar ADMIN_PASSWORD del entorno. Nunca pongas secretos en variables VITE_* porque son visibles para el navegador.

## Habilitar WhatsApp

El panel funciona aunque las variables de Meta estón vacías. Para recibir mensajes reales necesitas una aplicación de Meta, un número habilitado y un callback HTTPS; en desarrollo puedes usar ngrok.

Sigue [WHATSAPP_SETUP.md](docs/WHATSAPP_SETUP.md). Los endpoints son GET /webhooks/whatsapp para verificación y POST /webhooks/whatsapp para recepción. Tener credenciales configuradas no acredita una conexión real: el panel mantiene el estado de conexión como no verificado. El envío de texto y las respuestas Gemini están implementados con cola persistente; su validación real sigue pendiente. La descarga autenticada de imágenes está preparada, pero aún no se utiliza en generación multimodal. Fuera de la ventana de 24 horas no se envía texto; las plantillas no están implementadas.

## Comandos de mantenimiento

| Comando | Acción |
|---|---|
| npm.cmd install | Instalar dependencias desde la raíz |
| npm.cmd run db:generate | Generar Prisma Client tras instalar o cambiar el esquema |
| npm.cmd run db:migrate | Aplicar migraciones versionadas pendientes |
| npm.cmd run db:admin | Crear el primer administrador con ADMIN_* |
| npm.cmd test | Ejecutar pruebas locales; integración PostgreSQL es optativa |
| npm.cmd run build | Comprobar TypeScript y compilar backend y frontend |
| npm.cmd run start -w server | Ejecutar el backend compilado |

La compilación deja el frontend en client/dist y el backend en server/dist. Publicar el frontend requiere un servidor web con fallback a index.html para las rutas de Vue Router. Un despliegue real requiere configurar TLS, CORS y la URL de API; los comandos de desarrollo estón pensados para uso local.

## Solución de problemas

| Problema | Qué revisar |
|---|---|
| pgAdmin muestra connection timeout expired | Que PostgreSQL Server está instalado y su servicio activo; host 127.0.0.1 y puerto 5432 |
| El script muestra no password supplied | Introduce la contraseña de postgres antes de pulsar Enter; la entrada es invisible |
| PowerShell no reconoce -ExecutionPolicy | Copia el comando completo, empezando por powershell |
| Ya existe el usuario o la base sentia | Usa la configuración existente y los comandos de migración; el inicializador no debe repetirse |
| /health devuelve 503 | PostgreSQL no responde o DATABASE_URL no permite conectarse |
| El login falla | Usa las credenciales de la cuenta creada, no las del usuario postgres; reinicia sesión si el JWT expiró |
| No aparecen campos de acceso tras actualizar código | Recarga con Ctrl + F5 y comprueba que el frontend está arrancado |
| El panel está vacío | Es normal sin datos; los mensajes entrantes crean contactos y conversaciones |
| Puerto ocupado | Detón la instancia anterior; revisa la URL que Vite imprime si selecciona otro puerto y ajusta CORS si hace falta |

## Estructura del repositorio

```text
sentia/
+-- client/
|   +-- src/
|       +-- stores/          Sesión de usuario con Pinia
|       +-- views/           Login y panel administrativo
+-- server/
|   +-- prisma/              Esquema y migraciones
|   +-- src/
|   |   +-- config/          Variables de entorno
|   |   +-- controllers/     Controladores de webhooks
|   |   +-- middleware/      Autenticación, roles y errores
|   |   +-- routes/          API REST
|   |   +-- services/        WhatsApp e interfaz futura de IA
|   |   +-- validators/      Validación de entradas
|   |   +-- lib/             Prisma
|   |   +-- types/           Tipos internos
|   +-- tests/               Pruebas HTTP y fixtures
+-- scripts/                 Inicialización local en Windows
+-- docs/                    Documentación técnica
+-- docker-compose.yml
+-- .env.example
+-- README.md
```

## Documentación y alcance actual

- [Chat web público: uso, configuración y validación](docs/WEB_CHAT.md).
- [Fase 1: implementación, configuración y validación pendiente](docs/AGENT_PHASE1.md).
- [Arquitectura](docs/ARCHITECTURE.md).
- [Base de datos](docs/DATABASE.md).
- [Endpoints de API](docs/API.md).
- [Configuración de WhatsApp y ngrok](docs/WHATSAPP_SETUP.md).
- [Pruebas y limitaciones](docs/TESTING.md).
- [Avances de implementación](docs/PROGRESS.md).

En esta sesión se comprobaron generación y validación del esquema Prisma, compilación de backend/frontend y 25 pruebas locales. Dos integraciones PostgreSQL se omitieron por falta de servidor. No se aplicó la migración nueva ni se probaron Gemini/Meta reales o la interfaz completa en navegador. Los resultados anteriores no acreditan la nueva fase.

Antes de producción queda pendiente resolver los avisos de dependencias Prisma documentados en TESTING.md. Las siguientes etapas contemplan administración de usuarios, envío manual, visión multimodal, conocimiento y cotizaciones. El informe [AGENT_PHASE1.md](docs/AGENT_PHASE1.md) detalla los archivos, variables, pruebas y limitaciones de la integración actual.
