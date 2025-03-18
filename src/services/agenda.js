const mongoose = require("mongoose");
const Evento = require("../../database"); // Importa el modelo de eventos

// Función para verificar conflictos de horario
async function hayConflicto(fecha, horaInicio, horaFin, excludeId = null) {
  const inicioNuevo = new Date(`${fecha}T${horaInicio}`);
  const finNuevo = new Date(`${fecha}T${horaFin}`);

  const query = { fecha };
  if (excludeId) query._id = { $ne: excludeId };

  const eventos = await Evento.find(query);

  return eventos.some((evento) => {
    const inicioExistente = new Date(`${evento.fecha}T${evento.hora_inicio}`);
    const finExistente = new Date(`${evento.fecha}T${evento.hora_fin}`);
    return inicioNuevo < finExistente && finNuevo > inicioExistente;
  });
}

// Función para agendar un nuevo evento
async function agendarEvento(nombre, fecha, horaInicio, horaFin) {
  if (await hayConflicto(fecha, horaInicio, horaFin)) {
    return { status: "error", mensaje: "Conflicto de horario detectado." };
  }

  const evento = new Evento({ nombre, fecha, hora_inicio: horaInicio, hora_fin: horaFin });
  await evento.save();
  return { status: "success", mensaje: "Reunión agendada con éxito.", evento };
}

// Función para consultar eventos entre fechas
async function consultarAgenda(fechaInicio, fechaFin) {
  const eventos = await Evento.find({ fecha: { $gte: fechaInicio, $lte: fechaFin } });
  return { status: "success", mensaje: "Eventos encontrados.", eventos };
}

// Función para editar evento por nombre
async function editarEventoPorNombre(nombreActual, nuevoNombre, fecha, horaInicio, horaFin) {
  const evento = await Evento.findOne({ nombre: nombreActual });
  if (!evento) return { status: "error", mensaje: "Evento no encontrado." };

  if (await hayConflicto(fecha, horaInicio, horaFin, evento._id)) {
    return { status: "error", mensaje: "Conflicto de horario detectado." };
  }

  evento.nombre = nuevoNombre;
  evento.fecha = fecha;
  evento.hora_inicio = horaInicio;
  evento.hora_fin = horaFin;
  await evento.save();

  return { status: "success", mensaje: "Evento editado con éxito.", evento };
}

// Función para buscar eventos por nombre
async function buscarEventosPorNombre(nombre) {
  return await Evento.find({ nombre: new RegExp(nombre, "i") });
}

// Función para editar evento por ID
async function editarEvento(id, nuevoNombre, fecha, horaInicio, horaFin) {
  const evento = await Evento.findById(id);
  if (!evento) return { status: "error", mensaje: "Evento no encontrado." };

  evento.nombre = nuevoNombre;
  evento.fecha = fecha;
  evento.hora_inicio = horaInicio;
  evento.hora_fin = horaFin;
  await evento.save();

  return { status: "success", mensaje: "Evento editado con éxito.", evento };
}

// Función para borrar evento por ID
async function borrarEvento(idEvento) {
  const evento = await Evento.findByIdAndDelete(idEvento);
  if (!evento) return { status: "error", mensaje: "No se encontró el evento." };
  return { status: "success", mensaje: "Evento borrado con éxito." };
}

// Función para borrar evento por nombre
async function borrarEventoPorNombre(nombre) {
  const evento = await Evento.findOneAndDelete({ nombre });
  if (!evento) return { status: "error", mensaje: "Evento no encontrado." };
  return { status: "success", mensaje: "Evento borrado con éxito." };
}

// Función para buscar eventos por fecha
async function buscarEventosPorFecha(fecha) {
  return await Evento.find({ fecha });
}

module.exports = {
  agendarEvento,
  consultarAgenda,
  editarEventoPorNombre,
  borrarEventoPorNombre,
  buscarEventosPorNombre,
  borrarEvento,
  editarEvento,
  buscarEventosPorFecha,
};
