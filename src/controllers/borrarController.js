// controllers/borrarController.js

const { borrarEvento } = require('../services/agenda');
const { buscarEventosPorNombre } = require('../services/agenda');
const contextManager = require('../utils/contextManager');

const errorResponse = (mensaje) => ({
  status: 'error',
  mensaje: `⚠️ ${mensaje}`
});

// Helper para formatear la lista de eventos.
const formatearListaEventos = (eventos) =>
  eventos.map(e => `🆔 ${e.id} | ${e.nombre} | ${e.fecha} | ${e.hora_inicio}-${e.hora_fin}`).join('\n');

const handleBorrar = async (mensaje, userId) => {
  // Obtiene o inicializa el contexto para el usuario.
  let context = contextManager.getContext(userId) || {};
  if (!context.data) {
    context.data = {};
    contextManager.updateContext(userId, { data: context.data });
  }

  try {
    // Si ya se estableció la acción pendiente de confirmación de borrado,
    // se procesa la respuesta final.
    if (context.pendingAction === 'confirmar_borrar') {
      const confirmacion = mensaje.trim().toLowerCase();
      if (confirmacion === 'si' || confirmacion === 'sí') {
        try {
          await borrarEvento(context.data.eventoSeleccionado.id);
          contextManager.clearContext(userId);
          return { status: 'success', mensaje: '✅ Evento borrado exitosamente.' };
        } catch (error) {
          contextManager.clearContext(userId);
          return errorResponse('❌ Error al borrar el evento.');
        }
      }
      contextManager.clearContext(userId);
      return { status: 'success', mensaje: '❌ Borrado cancelado.' };
    }

    // Si aún no se han obtenido candidatos, se busca el evento por nombre.
    if (!context.data.candidatos) {
      // Si el mensaje es solo "borrar", solicitamos el nombre explícitamente.
      if (mensaje.trim().toLowerCase() === 'borrar') {
        return {
          status: 'pending',
          mensaje: '✏️ Por favor, ingresa el nombre del evento que deseas borrar.'
        };
      }
      const eventos = await buscarEventosPorNombre(mensaje.trim());
      if (!eventos || eventos.length === 0) {
        return errorResponse(`No se encontraron eventos similares a "${mensaje.trim()}"`);
      }
      context.data.candidatos = eventos;
      contextManager.updateContext(userId, context);
      return {
        eventos:eventos,
        status: 'pending',
        mensaje: `📋 Eventos encontrados:\n${formatearListaEventos(eventos)}\n✏️ Ingresa el ID del evento que deseas borrar:`
      };
    }

    // Si ya se tienen candidatos pero no se ha seleccionado el evento, se interpreta el input como el ID.
    if (!context.data.eventoSeleccionado) {
      const idSeleccionado = mensaje.trim();
      const evento = context.data.candidatos.find(e => e.id.toString() === idSeleccionado);
      if (!evento) {
        return errorResponse(`No se encontró ningún evento con el ID "${idSeleccionado}".`);
      }
      context.data.eventoSeleccionado = evento;
      context.pendingAction = 'confirmar_borrar';
      contextManager.updateContext(userId, context);
      return {
        status: 'pending',
        mensaje: `Vas a borrar el evento "${evento.nombre}" programado para el ${evento.fecha} de ${evento.hora_inicio} a ${evento.hora_fin}. ¿Confirmas? (Responde "sí" para confirmar)`
      };
    }

    return errorResponse('Flujo de borrado no reconocido.');
  } catch (error) {
    contextManager.clearContext(userId);
    return errorResponse(error.message);
  }
};

module.exports = { handleBorrar };
