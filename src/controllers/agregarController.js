const { parseFecha, parseHora, parseDuration } = require('../helpers/dateHelpers');
const contextManager = require('../utils/contextManager');
const agendaService = require('../services/agenda');

const generarRespuestaError = (mensaje, sugerencia = '') => ({
  status: 'error',
  mensaje: `⚠️ ${mensaje}${sugerencia ? ` ${sugerencia}` : ''}`
});

const procesarNombreEvento = (mensaje, userId) => {
  const nombreEvento = mensaje.trim();
  if (!nombreEvento) return generarRespuestaError('El nombre del evento es requerido.', 'Ejemplo: "Reunión con equipo de ventas"');

  const context = contextManager.getContext(userId);
  context.data = { paso: 2, nombre: nombreEvento, intentos: 0 };
  contextManager.updateContext(userId, { data: context.data });

  return {
    status: 'pending',
    mensaje: `📅 ¿Para qué fecha será el evento "${nombreEvento}"? Puedes decir "mañana", "el próximo lunes" o "15 de marzo".`
  };
};

const procesarFechaEvento = (mensaje, userId) => {
  const fecha = parseFecha(mensaje);
  if (!fecha) return generarRespuestaError('No entendí la fecha.', 'Puedes decir "mañana", "el próximo viernes" o "15 de marzo".');

  const context = contextManager.getContext(userId);
  context.data.paso = 3;
  context.data.fecha = fecha.inicio || fecha;
  contextManager.updateContext(userId, { data: context.data });

  return {
    status: 'pending',
    mensaje: `⏰ ¿A qué hora comienza el evento "${context.data.nombre}" el ${context.data.fecha}?`
  };
};

const procesarHoraInicio = (mensaje, userId) => {
  const hora = parseHora(mensaje);
  if (!hora) return generarRespuestaError('No entendí la hora.', 'Ejemplo: "2:00 pm" o "14:00".');

  const context = contextManager.getContext(userId);
  context.data.paso = 4;
  context.data.hora_inicio = hora;
  contextManager.updateContext(userId, { data: context.data });

  return {
    status: 'pending',
    mensaje: `⏳ ¿Cuánto durará el evento "${context.data.nombre}"? Ejemplo: "1 hora", "90 minutos".`
  };
};

const procesarDuracion = (mensaje, userId) => {
  const duration = parseDuration(mensaje);
  if (!duration) return generarRespuestaError('No entendí la duración.', 'Ejemplo: "1 hora", "2h 30min".');

  const context = contextManager.getContext(userId);
  const [startHour, minutes] = context.data.hora_inicio.split(':').map(Number);
  const endHour = startHour + duration;
  context.data.hora_fin = `${String(endHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  context.data.paso = 5;

  contextManager.updateContext(userId, { data: context.data });

  return {
    status: 'pending',
    mensaje: `✅ Vas a agendar "${context.data.nombre}" el ${context.data.fecha} de ${context.data.hora_inicio} a ${context.data.hora_fin}. ¿Confirmas? Responde "sí" para confirmar o "editar" para cambiar algo.`
  };
};

const confirmarAgendamiento = async (mensaje, userId) => {
  const respuesta = mensaje.trim().toLowerCase();
  const context = contextManager.getContext(userId);

  if (respuesta === 'sí' || respuesta === 'si') {
    return new Promise((resolve) => {
      agendaService.agendarEvento(
        context.data.nombre,
        context.data.fecha,
        context.data.hora_inicio,
        context.data.hora_fin,
        (err, resultado) => {
          if (resultado.status === 'error') {
            resolve({
              status: 'error',
              mensaje: '⚠️ La fecha y hora tienen conflicto con otro evento. ¿Quieres probar otro horario?'
            });
          } else {
            contextManager.clearContext(userId);
            resolve({
              status: 'success',
              mensaje: `🎉 ¡Evento "${context.data.nombre}" agendado exitosamente para el ${context.data.fecha} a las ${context.data.hora_inicio} con duración de ${context.data.duration} hora(s)!`
            });
          }
        }
      );
    });
  } else if (respuesta === 'editar') {
    context.data.paso = 1;
    contextManager.updateContext(userId, { data: context.data });
    return { status: 'pending', mensaje: '🔄 Entendido. ¿Qué deseas modificar? Puedes decir "nombre", "fecha", "hora" o "duración".' };
  } else {
    return { status: 'pending', mensaje: '🤔 No entendí tu respuesta. Responde "sí" para confirmar o "editar" para cambiar algo.' };
  }
};

const handleAgendar = async (mensaje, userId) => {
  try {
    const context = contextManager.getContext(userId);

    if (context.intentos > 2) {
      contextManager.clearContext(userId);
      return generarRespuestaError('Demasiados intentos fallidos. Por favor, comienza de nuevo.');
    }

    if (!context.data || Object.keys(context.data).length === 0) {
      contextManager.updateContext(userId, { pendingAction: 'agendar', data: { paso: 1, intentos: 0 } });
      return { status: 'pending', mensaje: '📝 ¿Cómo se llama el evento que deseas agendar?' };
    }

    if (context.pendingAction === 'confirmar_agendar') {
      return await confirmarAgendamiento(mensaje, userId);
    }

    switch (context.data.paso) {
      case 1:
        return procesarNombreEvento(mensaje, userId);
      case 2:
        return procesarFechaEvento(mensaje, userId);
      case 3:
        return procesarHoraInicio(mensaje, userId);
      case 4:
        return procesarDuracion(mensaje, userId);
      case 5:
        contextManager.updateContext(userId, { pendingAction: 'confirmar_agendar' });
        return await confirmarAgendamiento(mensaje, userId);
      default:
        contextManager.clearContext(userId);
        return generarRespuestaError('Flujo de agendamiento inválido.');
    }
  } catch (error) {
    contextManager.clearContext(userId);
    return generarRespuestaError('Error en el proceso de agendamiento.');
  }
};

module.exports = { handleAgendar };
