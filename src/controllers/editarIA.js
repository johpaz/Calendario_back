const { GoogleGenerativeAI } = require('@google/generative-ai');
const calendarFuncs = require('../services/agenda');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const EventoModel = require('../../database'); // Modelo Mongoose

/**
 * Función para limpiar el texto removiendo bloques Markdown.
 */
const limpiarJSON = (texto) => {
  const regex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = texto.match(regex);
  if (match && match[1]) {
    return match[1];
  }
  return texto;
};

/**
 * Función para analizar el mensaje usando Gemini y extraer la intención y parámetros.
 * Se espera que Gemini devuelva un JSON con la siguiente estructura:
 * {
 *   "accion": "editar",
 *   "parametros": {
 *       "id": "ID del evento o null",
 *       "nombre": "Nombre del evento a editar o null",
 *       "nuevoTitulo": "Nuevo nombre (en caso de edición) o null",
 *       "nuevaFecha": "Nueva fecha en formato YYYY-MM-DD o null",
 *       "nuevaHoraInicio": "Nueva hora de inicio en formato HH:MM o null",
 *       "nuevaHoraFin": "Nueva hora de fin en formato HH:MM o null"
 *   },
 *   "explicacion": "Explicación breve"
 * }
 */
const analizarMensajeConGemini = async (mensaje, historial) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
Eres un asistente de agenda experto que recibe solicitudes de edición en lenguaje natural.
Genera un JSON con los parámetros necesarios para editar un evento en la base de datos.
Si el usuario no proporciona el ID, utiliza el campo "nombre" para identificar el evento.
El JSON debe tener la siguiente estructura:
{
  "accion": "editar",
  "parametros": {
    "id": "ID del evento (si se conoce) o null",
    "nombre": "Nombre del evento a editar o null",
    "nuevoTitulo": "Nuevo nombre del evento o null",
    "nuevaFecha": "Nueva fecha en formato YYYY-MM-DD o null",
    "nuevaHoraInicio": "Nueva hora de inicio en formato HH:MM o null",
    "nuevaHoraFin": "Nueva hora de fin en formato HH:MM o null"
  },
  "explicacion": "Breve explicación de la solicitud"
}
MENSAJE: ${mensaje}
HISTORIAL:
${historial.slice(-3).map(m => m.role + ": " + m.content).join("\n")}
    `;
    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    console.log("Gemini response:", responseText);
    responseText = limpiarJSON(responseText);
    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      console.error("Error parseando JSON en analizarMensajeConGemini:", parseError);
      return {
        accion: "editar",
        parametros: {},
        explicacion: "No se pudo extraer la acción; se asume que no hay intención de editar."
      };
    }
  } catch (error) {
    console.error("Error en analizarMensajeConGemini:", error);
    return {
      accion: "editar",
      parametros: {},
      explicacion: "Error en API; se asume que no hay intención de editar."
    };
  }
};

/**
 * Procesa una fecha a formato ISO (YYYY-MM-DD).
 */
const procesarFecha = (fechaStr) => {
  if (!fechaStr) return null;
  try {
    const hoy = new Date();
    const hoyISO = hoy.toISOString().split('T')[0];
    const fechaLower = fechaStr.toLowerCase().trim();
    if (fechaLower === 'hoy') return hoyISO;
    if (fechaLower === 'mañana') {
      const manana = new Date(hoy);
      manana.setDate(hoy.getDate() + 1);
      return manana.toISOString().split('T')[0];
    }
    const meses = {
      "enero": "01", "febrero": "02", "marzo": "03", "abril": "04",
      "mayo": "05", "junio": "06", "julio": "07", "agosto": "08",
      "septiembre": "09", "setiembre": "09", "octubre": "10",
      "noviembre": "11", "diciembre": "12"
    };
    if (meses[fechaLower]) {
      return `${hoy.getFullYear()}-${meses[fechaLower]}-01`;
    }
    if (/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(fechaStr)) {
      const partes = fechaStr.split(/[\/\-\.]/);
      const dia = partes[0].padStart(2, '0');
      const mes = partes[1].padStart(2, '0');
      const anio = partes[2].length === 2 ? '20' + partes[2] : partes[2];
      return `${anio}-${mes}-${dia}`;
    }
    const regexMes = /(\d{1,2})\s*de\s*([a-záéíóúñ]+)(?:\s*(\d{4}))?/i;
    const match = fechaStr.match(regexMes);
    if (match) {
      const dia = match[1].padStart(2, '0');
      const mesNombre = match[2].toLowerCase();
      const anio = match[3] ? match[3] : hoy.getFullYear();
      if (meses[mesNombre]) {
        return `${anio}-${meses[mesNombre]}-${dia}`;
      }
    }
    return fechaStr;
  } catch (e) {
    console.error("Error al procesar fecha:", e);
    return fechaStr;
  }
};

/**
 * Procesa una hora y la devuelve en formato "HH:MM".
 */
const procesarHora = (horaStr) => {
  if (!horaStr) return null;
  try {
    if (horaStr.toLowerCase().includes("am") || horaStr.toLowerCase().includes("pm")) {
      const [hora, minuto] = horaStr.replace(/[^\d:]/g, "").split(":");
      let horaNum = parseInt(hora);
      if (horaStr.toLowerCase().includes("pm") && horaNum < 12) horaNum += 12;
      else if (horaStr.toLowerCase().includes("am") && horaNum === 12) horaNum = 0;
      return `${horaNum.toString().padStart(2, "0")}:${minuto || "00"}`;
    }
    if (/\d{1,2}:\d{2}/.test(horaStr)) {
      const [hora, minuto] = horaStr.split(":");
      return `${parseInt(hora).toString().padStart(2, "0")}:${minuto}`;
    }
    if (/^\d{1,2}$/.test(horaStr)) return `${parseInt(horaStr).toString().padStart(2, "0")}:00`;
    return horaStr;
  } catch (e) {
    console.error("Error al procesar hora:", e);
    return horaStr;
  }
};

/**
 * Genera una respuesta natural para confirmar la edición usando Gemini.
 */
const generarRespuestaEditar = async (resultado) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
Eres Sofía, un asistente de agenda muy amigable.
Acabas de editar un evento.
Resultado: ${JSON.stringify(resultado)}.
Genera una respuesta breve y natural confirmando la edición con los detalles actualizados del evento.
Respuesta:
    `;
    const res = await model.generateContent(prompt);
    return res.response.text().trim();
  } catch (error) {
    console.error("Error al generar respuesta en editar:", error);
    return "El evento ha sido editado.";
  }
};

/**
 * Controlador para editar un evento.
 * Se delega a Gemini la interpretación en lenguaje natural y la generación del JSON con todos los parámetros.
 * Si no se proporcionan parámetros, se devuelve un mensaje pidiendo más detalles.
 * Si no se proporciona ID, se busca el evento usando el nombre.
 */
const handleEditar = async (mensaje, userId, conversationContext) => {
  try {
    // Agregar el mensaje al historial.
    if (!conversationContext[userId]) {
      conversationContext[userId] = { history: [] };
    }
    conversationContext[userId].history.push({ role: "user", content: mensaje });
    
    // Analizar el mensaje con Gemini.
    const analisis = await analizarMensajeConGemini(mensaje, conversationContext[userId].history);
    console.log("Análisis de Gemini:", analisis);
    
    // Si no se proporcionan parámetros, devolver un mensaje de error.
    if (!analisis.parametros || Object.values(analisis.parametros).every(val => val === null || val === "")) {
      return { 
        status: "info", 
        mensaje: "No se ha proporcionado suficiente información para editar un evento. Por favor, indica el ID o el nombre del evento y los cambios que deseas realizar (por ejemplo, 'editar el evento prueba, cambiar nombre a nuevo nombre, fecha a 2025-03-19, etc.)." 
      };
    }
    
    const { id, nombre, nuevoTitulo, nuevaFecha, nuevaHoraInicio, nuevaHoraFin } = analisis.parametros;
    let eventId = id;
    
    // Si no se proporcionó el ID, usar el nombre para buscar el evento.
    if (!eventId) {
      if (nombre) {
        const eventos = await calendarFuncs.buscarEventosPorNombre(nombre);
        if (eventos && eventos.length > 0) {
          // Aquí se podría manejar el caso de múltiples coincidencias; se toma el primero por defecto.
          eventId = eventos[0]._id;
        } else {
          return { status: "error", mensaje: "No se encontró ningún evento con ese nombre." };
        }
      } else {
        return { status: "error", mensaje: "No se proporcionaron suficientes datos para identificar el evento a editar." };
      }
    }
    
    // Ejecutar la actualización en la base de datos.
    const resultado = await calendarFuncs.editarEvento(eventId, nuevoTitulo, nuevaFecha, nuevaHoraInicio, nuevaHoraFin);
    return resultado;
  } catch (error) {
    console.error("Error en handleEditar:", error);
    return { status: "error", mensaje: "Ocurrió un error al editar el evento." };
  }
};

module.exports = { handleEditar };
  