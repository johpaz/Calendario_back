// controllers/editarController.js

const { editarEvento, buscarEventosPorNombre } = require('../services/agenda');
const { parseFecha, parseHora } = require('../helpers/dateHelpers');
const contextManager = require('../utils/contextManager');

const camposEditables = ['nombre', 'fecha', 'hora_inicio', 'hora_fin'];

const errorResponse = (mensaje) => ({
  status: 'error',
  mensaje: `⚠️ ${mensaje}`
});

const handleEditar = async (mensaje, userId) => {
  // Obtiene o inicializa el contexto para el usuario.
  let context = contextManager.getContext(userId) || {};
  if (!context.data) {
    context.data = {};
    contextManager.updateContext(userId, context);
  }
  
  try {
    // Flujo de confirmación final
    if (context.pendingAction === 'confirmar_editar') {
      return await procesarConfirmacionEdicion(mensaje, userId);
    }

    // Paso 1: Si aún no se han obtenido candidatos, se busca el evento por nombre.
    if (!context.data.candidatos) {
      if (mensaje.trim().toLowerCase() === 'editar') {
        return {
          status: 'pending',
          mensaje: '✏️ Por favor, ingresa el nombre del evento que deseas editar.'
        };
      }
      return await buscarEventos(mensaje, userId);
    }

    // Paso 2: Si no se ha seleccionado el evento, se interpreta el input como el ID.
    if (!context.data.eventoSeleccionado) {
      return await seleccionarEvento(mensaje, userId);
    }

    // Paso 3: Flujo interactivo campo a campo.
    return await procesarFlujoEdicion(mensaje, userId);

  } catch (error) {
    contextManager.clearContext(userId);
    return errorResponse(error.message);
  }
};

// Paso 1: Buscar eventos por nombre (búsqueda parcial)
const buscarEventos = async (nombre, userId) => {
  const eventos = await buscarEventosPorNombre(nombre);
  if (!eventos || eventos.length === 0) {
    return errorResponse(`No se encontraron eventos con el nombre "${nombre}"`);
  }
  // Guardamos los candidatos en el contexto.
  const context = contextManager.getContext(userId);
  context.data = {
    ...context.data,
    paso: 2,
    candidatos: eventos
  };
  contextManager.updateContext(userId, context);
  return {
    eventos: eventos,
    status: 'pending',
    mensaje: `📋 Eventos encontrados:\n${formatearListaEventos(eventos)}\n✏️ Ingresa el ID del evento a editar:`
  };
};

// Paso 2: Seleccionar el evento a editar por ID.
const seleccionarEvento = async (idInput, userId) => {
  const context = contextManager.getContext(userId);
  const evento = context.data.candidatos.find(e => e.id.toString() === idInput.trim());
  if (!evento) {
    return errorResponse('❌ ID inválido. Por favor, ingresa un número de la lista.');
  }
  // Inicializamos el flujo de edición.
  context.data.eventoSeleccionado = evento;
  context.data.cambios = {};  
  context.data.editSteps = camposEditables;
  context.data.currentStep = 0;
  context.data.awaitingResponse = 'confirmarCambio'; // Preguntar si se desea cambiar el primer campo.
  context.pendingAction = 'editar';
  contextManager.updateContext(userId, context);
  return {
    status: 'pending',
    mensaje: `✅ Seleccionaste:\n${formatearEvento(evento)}\n¿Deseas cambiar el campo "nombre" (actual: "${evento.nombre}")? Responde "sí" para editar o "no" para conservarlo.`
  };
};

// Paso 3: Procesar el flujo interactivo campo a campo.
const procesarFlujoEdicion = async (mensaje, userId) => {
  let context = contextManager.getContext(userId);
  let data = context.data;
  
  // Caso A: Esperando confirmación ("sí" o "no") para cambiar el campo actual.
  if (data.awaitingResponse === 'confirmarCambio') {
    const respuesta = mensaje.trim().toLowerCase();
    const campo = data.editSteps[data.currentStep];
    if (respuesta === 'si' || respuesta === 'sí') {
      data.awaitingResponse = 'nuevoValor';
      contextManager.updateContext(userId, context);
      return {
        status: 'pending',
        mensaje: obtenerMensajeCampo(campo, data.eventoSeleccionado[campo]).replace('Ingresa el nuevo', 'Por favor, ingresa el nuevo')
      };
    } else if (respuesta === 'no') {
      data.cambios[campo] = data.eventoSeleccionado[campo];
      data.currentStep++;
      if (data.currentStep < camposEditables.length) {
        data.awaitingResponse = 'confirmarCambio';
        const siguienteCampo = camposEditables[data.currentStep];
        contextManager.updateContext(userId, context);
        return {
          status: 'pending',
          mensaje: `¿Deseas cambiar el campo "${siguienteCampo}" (actual: "${data.eventoSeleccionado[siguienteCampo]}")? Responde "sí" o "no".`
        };
      } else {
        context.pendingAction = 'confirmar_editar';
        contextManager.updateContext(userId, context);
        return {
          status: 'pending',
          mensaje: `Vas a editar el evento "${data.eventoSeleccionado.nombre}" con los siguientes cambios:\n${mostrarCambios(data.eventoSeleccionado, data.cambios)}\n¿Confirmas?`
        };
      }
    } else {
      return errorResponse('Por favor, responde "sí" o "no".');
    }
  }
  // Caso B: Esperando el nuevo valor para el campo actual.
  else if (data.awaitingResponse === 'nuevoValor') {
    const campo = data.editSteps[data.currentStep];
    let nuevoValor;
    if (mensaje.trim().toLowerCase() === 'mantener') {
      nuevoValor = data.eventoSeleccionado[campo];
    } else {
      if (campo === 'fecha') {
        nuevoValor = parseFecha(mensaje) || data.eventoSeleccionado.fecha;
      } else if (campo === 'hora_inicio' || campo === 'hora_fin') {
        nuevoValor = parseHora(mensaje) || data.eventoSeleccionado[campo];
      } else {
        nuevoValor = mensaje.trim();
      }
    }
    data.cambios[campo] = nuevoValor;
    console.log(`DEBUG: Se actualizó ${campo}:`, nuevoValor);
    data.currentStep++;
    if (data.currentStep < camposEditables.length) {
      data.awaitingResponse = 'confirmarCambio';
      const siguienteCampo = camposEditables[data.currentStep];
      contextManager.updateContext(userId, context);
      return {
        status: 'pending',
        mensaje: `¿Deseas cambiar el campo "${siguienteCampo}" (actual: "${data.eventoSeleccionado[siguienteCampo]}")? Responde "sí" o "no".`
      };
    } else {
      context.pendingAction = 'confirmar_editar';
      contextManager.updateContext(userId, context);
      return {
        status: 'pending',
        mensaje: `Vas a editar el evento "${data.eventoSeleccionado.nombre}" con los siguientes cambios:\n${mostrarCambios(data.eventoSeleccionado, data.cambios)}\n¿Confirmas?`
      };
    }
  }
  return errorResponse('Flujo de edición no reconocido.');
};

// Paso 4: Procesar confirmación final y actualizar el evento.
const procesarConfirmacionEdicion = async (respuesta, userId) => {
  const confirmacion = respuesta.trim().toLowerCase();
  const context = contextManager.getContext(userId);
  const evento = context.data.eventoSeleccionado;
  const cambios = context.data.cambios || {};
  
  const nuevoNombre = cambios.nombre || evento.nombre;
  const nuevaFecha = cambios.fecha || evento.fecha;
  const nuevaHoraInicio = cambios.hora_inicio || evento.hora_inicio;
  const nuevaHoraFin = cambios.hora_fin || evento.hora_fin;
  
  if (confirmacion === 'si' || confirmacion === 'sí') {
    try {
      await editarEvento(evento.id, nuevoNombre, nuevaFecha, nuevaHoraInicio, nuevaHoraFin);
      contextManager.clearContext(userId);
      return {
        status: 'success',
        mensaje: '✅ Evento actualizado exitosamente.',
       
      };
    } catch (error) {
      return errorResponse('❌ Error al actualizar el evento.');
    }
  }
  contextManager.clearContext(userId);
  return {
    status: 'success',
    mensaje: '❌ Edición cancelada.'
  };
};

// Funciones de ayuda para formatear mensajes.
const obtenerMensajeCampo = (campo, valorActual) => {
  const mensajes = {
    nombre: `✏️ Ingresa el nuevo nombre (actual: "${valorActual}")\nEscribe "mantener" para conservarlo.`,
    fecha: `📅 Ingresa la nueva fecha (actual: ${valorActual})\nFormato: "dd de mes" o "mañana".`,
    hora_inicio: `⏰ Ingresa la nueva hora de inicio (actual: ${valorActual})\nFormato: "hh:mm".`,
    hora_fin: `⏰ Ingresa la nueva hora final (actual: ${valorActual})\nFormato: "hh:mm".`
  };
  return mensajes[campo];
};

const mostrarCambios = (original, cambios) => {
  return Object.entries(cambios)
    .map(([campo, valor]) => `➡️ ${campo.toUpperCase()}: ${original[campo]} → ${valor}`)
    .join('\n');
};

const formatearListaEventos = (eventos) => 
  eventos.map(e => `🆔 ${e.id} | 📌 ${e.nombre} | 🗓 ${e.fecha} | ⏰ ${e.hora_inicio}-${e.hora_fin}`).join('\n');

const formatearEvento = (evento) => {
  return `📌 ${evento.nombre}\n🗓 ${evento.fecha}\n⏰ ${evento.hora_inicio} - ${evento.hora_fin}`;
};

module.exports = { handleEditar, procesarConfirmacionEdicion };
