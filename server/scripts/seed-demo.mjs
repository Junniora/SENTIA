import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const examples = [
  { name: 'Ana Ejemplo', phone: 'demo:contacto:ana', title: 'Información sobre jornadas de atención', status: 'OPEN', priority: 'MEDIUM', messages: [
    ['INBOUND', 'Hola, quisiera saber cuándo será la próxima jornada de atención de la Brigada 105.'],
    ['OUTBOUND', 'Hola, Ana. Registraremos tu solicitud para confirmar las fechas disponibles.'],
    ['INBOUND', 'Gracias, me interesa conocer también los requisitos.']
  ] },
  { name: 'Luis Ejemplo', phone: 'demo:contacto:luis', title: 'Seguimiento de solicitud de apoyo', status: 'IN_PROGRESS', priority: 'HIGH', messages: [
    ['INBOUND', 'Buen día, quiero consultar el estado de mi solicitud de apoyo.'],
    ['OUTBOUND', 'Estamos revisando tu solicitud. El equipo dará seguimiento mediante un ticket.'],
    ['INBOUND', 'Quedo pendiente, muchas gracias.']
  ] },
  { name: 'María Ejemplo', phone: 'demo:contacto:maria', title: 'Orientación completada', status: 'RESOLVED', priority: 'LOW', messages: [
    ['INBOUND', '¿Dónde puedo consultar los servicios que ofrece la brigada?'],
    ['OUTBOUND', 'Hemos atendido tu consulta de orientación. Este es un historial de ejemplo.'],
    ['INBOUND', 'Ya recibí la información, gracias por la atención.']
  ] }
];

try {
  await prisma.$transaction(async tx => {
    // Stable IDs make reruns additive: existing tickets and messages retain edits.
    for (const [index, example] of examples.entries()) {
      const contact = await tx.contact.upsert({
        where: { phoneNumber: example.phone }, update: {},
        create: { name: `${example.name} [DEMO]`, phoneNumber: example.phone }
      });
      const conversation = await tx.conversation.upsert({
        where: { id: `sentia-demo-conversation-${index + 1}` }, update: {},
        create: { id: `sentia-demo-conversation-${index + 1}`, contactId: contact.id, status: example.status === 'RESOLVED' ? 'CLOSED' : 'OPEN' }
      });
      for (const [position, [direction, content]] of example.messages.entries()) {
        await tx.message.upsert({
          where: { externalMessageId: `sentia-demo-message-${index + 1}-${position + 1}` }, update: {},
          create: {
            externalMessageId: `sentia-demo-message-${index + 1}-${position + 1}`,
            conversationId: conversation.id, direction, content, messageType: 'text',
            createdAt: new Date(Date.now() - (60 - index * 10 - position) * 60000)
          }
        });
      }
      await tx.ticket.upsert({
        where: { id: `sentia-demo-ticket-${index + 1}` }, update: {},
        create: {
          id: `sentia-demo-ticket-${index + 1}`, contactId: contact.id,
          conversationId: conversation.id, title: `[DEMO] ${example.title}`,
          description: 'Solicitud ficticia para practicar el seguimiento en SENTIA. No corresponde a una persona real.',
          status: example.status, priority: example.priority
        }
      });
    }
  });
  console.log('Ejemplos disponibles: 3 contactos, 3 conversaciones, 9 mensajes y 3 tickets.');
  console.log('Los mensajes salientes son historial ficticio; no se enviaron mensajes por WhatsApp.');
} catch {
  console.error('No se pudieron cargar los ejemplos. Revisa PostgreSQL y DATABASE_URL.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
