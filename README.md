# SENTIA · Brigada 105
Primera etapa de un centro de atención: Vue 3, TypeScript, Quasar, Pinia, Express, Prisma y PostgreSQL. Desarrollo local; no se ha publicado ningún servicio ni repositorio remoto.

## Requisitos y ejecución (PowerShell)
Node.js 22 o 24, npm y Docker con Compose. Desde la raíz:

```powershell
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
npm.cmd install
```
Edita las contraseñas de PostgreSQL en ambos archivos y genera JWT_SECRET con al menos 32 caracteres aleatorios. No uses el valor de ejemplo fuera de desarrollo. Si la contraseña contiene caracteres especiales, codifícala para DATABASE_URL.

```powershell
docker compose up -d --wait
npm.cmd run db:generate
npm.cmd run db:migrate
```
Configura ADMIN_NAME, ADMIN_EMAIL y ADMIN_PASSWORD (12–72 caracteres) en server/.env y ejecuta:

```powershell
npm.cmd run db:admin
```
El inicializador solo permite crear el primer administrador. Elimina ADMIN_PASSWORD del archivo después de utilizarlo. No existe registro público ni contraseña predefinida.

En dos terminales:

```powershell
npm.cmd run dev:server
npm.cmd run dev:client
```
Abre http://localhost:5173. El frontend usa el proxy Vite hacia http://localhost:3000. Para alojar el cliente por separado, define VITE_API_URL y configura CORS_ORIGIN en el servidor. Una publicación requiere TLS y configurar el fallback del router a index.html.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run start -w server
```

## Estructura
```text
client/                 Vue, Quasar, Pinia, Router, Axios
  src/views/            Login y panel administrativo
  src/stores/           Autenticación
server/
  prisma/               Modelos y migración inicial
  src/config/           Entorno validado
  src/controllers/      Webhooks
  src/middleware/       JWT, roles y errores
  src/routes/           API REST
  src/services/         WhatsApp e interfaz futura de IA
  src/validators/       Validación de tickets
  src/lib/              Prisma
  src/types/            Tipos compartidos internos
  tests/                Pruebas HTTP, HMAC y fixtures
 docs/                  Arquitectura, API, datos, pruebas y avances
 docker-compose.yml     PostgreSQL local
```

## Variables
Raíz: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB.
Servidor: DATABASE_URL, JWT_SECRET, PORT (3000), CORS_ORIGIN (http://localhost:5173), WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN. Las variables Meta pueden quedar vacías para ejecutar el panel; los webhooks devuelven 503 sin sus secretos. ADMIN_* solo se utiliza durante la inicialización.
Cliente: VITE_API_URL opcional, nunca secretos.

## Alcance
Incluye consultas de contactos y conversaciones, historial paginado, indicadores reales, creación y actualización de tickets, preferencias de tema y estado de configuración. Todos los datos administrativos requieren rol ADMIN. AGENT está reservado para una etapa posterior. WhatsApp no está conectado ni verificado. No se envían mensajes, no hay respuestas IA y no se descargan adjuntos. Ver [pruebas](docs/TESTING.md), [API](docs/API.md) y [configuración WhatsApp](docs/WHATSAPP_SETUP.md).
