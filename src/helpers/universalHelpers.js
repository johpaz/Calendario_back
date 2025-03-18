const { GoogleGenerativeAI } = require('@google/generative-ai');
const { parseFecha, parseHora, parseDuration } = require('./dateHelpers');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Procesamiento de fechas y horas
const procesarFecha = (fechaStr) => {
  const parsed = parseFecha(fechaStr);
  return parsed ? parsed.toISOString().split('T')[0] : null;
};

const procesarHora = (horaStr) => {
  return parseHora(horaStr)?.slice(0, 5) || null; // Formato HH:MM
};

// Generación de respuestas naturales
const generarRespuesta = async (accion, datos) => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = `Genera una respuesta en español para la acción ${accion} con estos datos:
  ${JSON.stringify(datos, null, 2)}
  
  Requisitos:
  - Máximo 2 oraciones
  - Tono amigable y profesional
  - Incluye datos relevantes
  - Usa formato de fecha y hora natural (ej: "25 de octubre a las 15:30")`;
  
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    return `He procesado tu solicitud de ${accion} correctamente.`;
  }
};

// Manejo centralizado de errores
const manejarErrores = (error, contexto = 'general') => {
  console.error(`Error en ${contexto}:`, error);
  
  const mensajes = {
    consulta: 'Error al consultar la agenda',
    agendamiento: 'Error al crear el evento',
    edicion: 'Error al actualizar el evento',
    borrado: 'Error al eliminar el evento',
    general: 'Error al procesar la solicitud'
  };
  
  return {
    status: 'error',
    mensaje: `⚠️ ${mensajes[contexto]}. Por favor inténtalo de nuevo.`
  };
};

module.exports = {
  procesarFecha,
  procesarHora,
  generarRespuesta,
  manejarErrores
};