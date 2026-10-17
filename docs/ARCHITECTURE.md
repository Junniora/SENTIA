# Arquitectura
El navegador utiliza Vue 3 con Composition API, Quasar, Pinia, Vue Router y Axios. El router verifica la sesión antes de mostrar el panel; el backend aplica JWT y consulta el usuario y rol vigentes en PostgreSQL para cada petición protegida. El token expira en 8 horas y se guarda en sessionStorage; en una fase de producción evaluar cookies HttpOnly, CSP y revocación de sesiones.

Express separa configuración, middleware, controladores, rutas, validadores y servicios. Zod valida entorno y entradas; Prisma encapsula acceso a PostgreSQL. Los errores públicos no incluyen trazas, SQL, contraseñas ni cuerpos de mensajes. Los logs solo incluyen método, ruta, estado y duración. CORS admite un origen configurado. El login limita intentos por IP en memoria; un despliegue con réplicas necesita un limitador compartido y configuración explícita de proxy confiable.

El webhook utiliza express.raw antes del parser JSON para conservar los bytes originales. Solo procesa después de verificar HMAC. Una transacción por mensaje y un bloqueo advisory por teléfono serializan la selección de conversación; un índice único evita duplicados. Un error persistente devuelve 5xx para que Meta pueda reintentar; no se confirma antes de persistir. No hay cola durable en esta fase; evaluar una cola para grandes lotes y observabilidad operativa antes de producción.

Los eventos sin mensajes se confirman sin crear registros. Los mensajes no textuales guardan el tipo, sin descargar medios. La conexión no se declara verificada por tener variables. No existe cliente de envío en esta etapa.

La interfaz AiProvider en server/src/services/ai/index.ts define el contrato de un futuro proveedor. Su implementación se inyectaría en un servicio de negocio separado; hoy no se invoca ningún modelo. Productos, cotizaciones y medios podrán agregarse mediante modelos y migraciones nuevas.
