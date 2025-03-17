// controllers/agendarController.js

const { parseFecha, parseHora, parseDuration } = require('../helpers/dateHelpers');
const contextManager = require('../utils/contextManager');
const agendaService = require('../services/agenda');

const errorResponse = (mensaje) => ({
  status: 'error',
  mensaje: `⚠️ ${mensaje}`
});

const procesarNombreEvento = (nombre, userId) => {
  const nombreEvento = nombre.trim();
  if (!nombreEvento) return errorResponse('El nombre del evento es requerido.');
  
  // Actualizamos el contexto para pasar al siguiente paso (1 -> 2)
  const context = contextManager.getContext(userId);
  context.data = { paso: 2, nombre: nombreEvento, intentos: 0 };
  contextManager.updateContext(userId, { data: context.data });
  
  return {
    status: 'pending',
    mensaje: '📅 ¿Para qué fecha será el evento? (Ej: "15 de marzo" o "mañana")'
  };
};

const procesarFechaEvento = (mensaje, userId) => {
  const fecha = parseFecha(mensaje);
  if (!fecha) return errorResponse('No entendí la fecha. Por favor, ingresa una fecha válida.');
  
  const fechaStr = typeof fecha === 'object' ? fecha.inicio : fecha;
  const context = contextManager.getContext(userId);
  context.data.paso = 3;
  context.data.fecha = fechaStr;
  contextManager.updateContext(userId, { data: context.data });
  
  return {
    status: 'pending',
    mensaje: '⏰ ¿A qué hora comienza el evento? (Ej: "a las 14:00" o "a las 2 pm")'
  };
};

const procesarHoraInicio = (mensaje, userId) => {
  const hora = parseHora(mensaje);
  if (!hora) return errorResponse('No entendí la hora de inicio. Por favor, ingresa un horario válido.');
  
  const context = contextManager.getContext(userId);
  context.data.paso = 4;
  context.data.hora_inicio = hora;
  contextManager.updateContext(userId, { data: context.data });
  
  return {
    status: 'pending',
    mensaje: '⏳ ¿Cuál es la duración del evento? (Ej: "1 hora" o "2 horas")'
  };
};

const procesarDuracion = (mensaje, userId) => {
  const duration = parseDuration(mensaje);
  const context = contextManager.getContext(userId);
  context.data.paso = 5;
  context.data.duration = duration;
  
  // Calcular hora_fin sumando la duración (en horas)
  const [startHour, minutes] = context.data.hora_inicio.split(':').map(Number);
  const endHour = startHour + duration;
  context.data.hora_fin = `${String(endHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  contextManager.updateContext(userId, { data: context.data });
  
  return {
    status: 'pending',
    mensaje: `Vas a agendar el evento "${context.data.nombre}" para el ${context.data.fecha} a las ${context.data.hora_inicio} con duración de ${duration} hora(s). ¿Confirmas? (Responde "sí" para confirmar)`
  };
};

const confirmarAgendamiento = (mensaje, userId) => {
  const respuesta = mensaje.trim().toLowerCase();
  const context = contextManager.getContext(userId);
  
  if (respuesta === 'si' || respuesta === 'sí') {
    return new Promise((resolve) => {
      agendaService.agendarEvento(
        context.data.nombre,
        context.data.fecha,
        context.data.hora_inicio,
        context.data.hora_fin,
        (err, resultado) => {
          if (resultado.status === "error") {
            resolve({ status: 'error', mensaje: 'La fecha y hora tienen conflicto, selecciona otro horario.' });
          } else {
            contextManager.clearContext(userId);
            resolve({
              eventos:[context.data],
              status: 'success',
              mensaje: `¡Listo! Se ha agendado el evento "${context.data.nombre}" para el ${context.data.fecha} a las ${context.data.hora_inicio} con duración de ${context.data.duration} hora(s).`
            });
          }
        }
      );
    });
  } else {
    return { status: 'pending', mensaje: 'Entendido. Si deseas modificar o cancelar el agendamiento, indícame.' };
  }
};

const handleAgendar = async (mensaje, userId) => {
  try {
    const context = contextManager.getContext(userId);
    if (context.intentos > 2) {
      contextManager.clearContext(userId);
      return errorResponse('Demasiados intentos fallidos. Por favor, comienza de nuevo.');
    }
    
    // Si no hay datos en el contexto, iniciamos el flujo.
    if (!context.data || Object.keys(context.data).length === 0) {
      contextManager.updateContext(userId, { pendingAction: 'agendar', data: { paso: 1, intentos: 0 } });
      return { status: 'pending', mensaje: '📝 Por favor, ingresa el nombre del evento:' };
    }
    
    // Flujo de confirmación: si ya se está confirmando el agendamiento.
    if (context.pendingAction === 'confirmar_agendar') {
      return await confirmarAgendamiento(mensaje, userId);
    }
    
    // Procesamos según el paso actual.
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
        // En el paso 5 se espera confirmación, se establece el pendingAction.
        contextManager.updateContext(userId, { pendingAction: 'confirmar_agendar' });
        return confirmarAgendamiento(mensaje, userId);
      default:
        contextManager.clearContext(userId);
        return errorResponse('Flujo de agendamiento inválido.');
    }
  } catch (error) {
    contextManager.clearContext(userId);
    return errorResponse('Error en el proceso de agendamiento.');
  }
};

module.exports = { handleAgendar };
