const { GoogleGenerativeAI } = require('@google/generative-ai');
const calendarFuncs = require('../services/agenda');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const EventoModel = require('../../database'); // Modelo Mongoose

/**
 * Función auxiliar para extraer una posible nueva fecha desde un mensaje.
 */
const extraerNuevaFecha = (mensaje) => {
  const regex = /(?:fecha\s*(?:a)?\s*)([\d]{1,2}(?:\s*de\s*[a-záéíóúñ]+(?:\s*\d{4})?)?)/i;
  const match = mensaje.match(regex);
  return match ? match[1].trim() : null;
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
 * Función para limpiar bloques Markdown y obtener un JSON válido.
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
 * Controlador para la acción "editar".
 * Flujo:
 * - Si no se tiene identificador del evento (currentEventId) y no se recibe "nombre", se pide el nombre (estado "espera_nombre_editar").
 * - En ese estado se captura el input del usuario y se asigna a parametros.nombre.
 * - Luego se buscan los eventos por nombre. Si hay múltiples, se pide selección.
 * - Cuando se identifica el evento, se pregunta qué campo desea editar (estado "seleccionar_campo_editar").
 * - Se captura el campo y luego el nuevo valor (estado "capturar_valor_edicion").
 * - Finalmente, se pide confirmación (estado "confirmar_edicion") y se ejecuta la actualización.
 */
const handleEditar = async (parametros, userId, conversationContext) => {
  try {
    // Inicializar el contexto si no existe.
    if (!conversationContext[userId]) {
      conversationContext[userId] = { history: [] };
    }

    // Paso 1: Si no se tiene currentEventId y no se ha recibido nombre, pedirlo.
    if (!conversationContext[userId].currentEventId && !parametros.nombre) {
      conversationContext[userId].pendingAction = "espera_nombre_editar";
      return {
        status: "info",
        mensaje: "Por favor, dime el nombre del evento que deseas editar.",
        pendingAction: "espera_nombre_editar"
      };
    }

    // Paso 2: Si estamos en estado "espera_nombre_editar", capturar el nombre del evento.
    if (conversationContext[userId].pendingAction === "espera_nombre_editar") {
      let nombreEvento = parametros.message || parametros.originalText || "";
      nombreEvento = nombreEvento.trim();
      console.log(`Usuario ${userId} - Capturado nombre para identificación: "${nombreEvento}"`);
      if (!nombreEvento) {
        return {
          status: "info",
          mensaje: "Por favor, proporciona el nombre del evento a editar.",
          pendingAction: "espera_nombre_editar"
        };
      }
      parametros.nombre = nombreEvento;
      conversationContext[userId].pendingAction = null;
    }

    // Paso 3: Buscar el evento por nombre (si no se tiene ID)
    let eventId = parametros.id || conversationContext[userId].currentEventId;
    if (!eventId) {
      if (parametros.nombre) {
        const eventos = await calendarFuncs.buscarEventosPorNombre(parametros.nombre);
        console.log(`Usuario ${userId} - Eventos encontrados para "${parametros.nombre}":`, eventos);
        if (!eventos || eventos.length === 0) {
          return {
            status: "error",
            mensaje: "No se encontró ningún evento con ese nombre."
          };
        } else if (eventos.length > 1) {
          conversationContext[userId].pendingAction = "seleccionar_evento_editar";
          conversationContext[userId].eventOptions = eventos;
          return {
            status: "info",
            mensaje: `Se encontraron varios eventos. Por favor, indica el número del evento que deseas editar:\n${eventos.map((e, i) => `${i + 1}. ${e.nombre} (${e.fecha} ${e.hora_inicio}-${e.hora_fin})`).join("\n")}`,
            pendingAction: "seleccionar_evento_editar",
            eventos: eventos
          };
        } else {
          eventId = eventos[0]._id;
          conversationContext[userId].currentEventId = eventId;
        }
      } else {
        return {
          status: "error",
          mensaje: "No se proporcionaron suficientes datos para identificar el evento a editar."
        };
      }
    }
    console.log(`Usuario ${userId} - Evento identificado: ${eventId}`);
    
    // Paso 4: Si no se reciben datos de modificación, pedir qué campo editar.
    if (
      (!parametros.nuevoTitulo || parametros.nuevoTitulo.trim() === "") &&
      (!parametros.nuevaFecha || parametros.nuevaFecha.trim() === "") &&
      (!parametros.nuevaHoraInicio || parametros.nuevaHoraInicio.trim() === "") &&
      (!parametros.nuevaHoraFin || parametros.nuevaHoraFin.trim() === "")
    ) {
      conversationContext[userId].pendingAction = "seleccionar_campo_editar";
      return {
        status: "info",
        mensaje: "He identificado el evento. ¿Qué campo deseas editar? (nombre, fecha, hora de inicio, hora de fin)",
        pendingAction: "seleccionar_campo_editar",
        eventos: [{ _id: eventId }]
      };
    }
    
    // Paso 5: Si estamos en estado "seleccionar_campo_editar", capturar el campo.
    if (conversationContext[userId].pendingAction === "seleccionar_campo_editar") {
      const campo = (parametros.message || "").toLowerCase().trim();
      const camposValidos = ["nombre", "fecha", "hora de inicio", "hora de fin"];
      if (!camposValidos.includes(campo)) {
        return {
          status: "error",
          mensaje: "Campo inválido. Por favor elige entre: nombre, fecha, hora de inicio o hora de fin."
        };
      }
      conversationContext[userId].campoEdicion = campo;
      conversationContext[userId].pendingAction = "capturar_valor_edicion";
      return {
        status: "info",
        mensaje: `Por favor ingresa el nuevo valor para ${campo}:`,
        pendingAction: "capturar_valor_edicion"
      };
    }
    
    // Paso 6: Si estamos en estado "capturar_valor_edicion", capturar el nuevo valor.
    if (conversationContext[userId].pendingAction === "capturar_valor_edicion") {
      const campo = conversationContext[userId].campoEdicion;
      const nuevoValor = (parametros.message || "").trim();
      if (!nuevoValor) {
        return {
          status: "info",
          mensaje: `Por favor, ingresa el nuevo valor para ${campo}.`,
          pendingAction: "capturar_valor_edicion"
        };
      }
      conversationContext[userId].nuevoValor = nuevoValor;
      conversationContext[userId].pendingAction = "confirmar_edicion";
      return {
        status: "info",
        mensaje: `¿Confirmas cambiar ${campo} a "${nuevoValor}"? (Sí/No)`,
        pendingAction: "confirmar_edicion"
      };
    }
    
    // Paso 7: Confirmar edición.
    if (conversationContext[userId].pendingAction === "confirmar_edicion") {
      if ((parametros.message || "").toLowerCase() !== "sí" && (parametros.message || "").toLowerCase() !== "si") {
        conversationContext[userId] = {}; // Resetear contexto
        return { status: "info", mensaje: "Edición cancelada." };
      }
      
      // Obtener datos para actualizar.
      const eventoIdFinal = conversationContext[userId].currentEventId;
      const campo = conversationContext[userId].campoEdicion;
      const nuevoValor = conversationContext[userId].nuevoValor;
      
      // Preparar datos a actualizar.
      const updateData = {};
      switch(campo) {
        case "nombre":
          updateData.nombre = nuevoValor;
          break;
        case "fecha":
          updateData.fecha = procesarFecha(nuevoValor);
          break;
        case "hora de inicio":
          updateData.hora_inicio = procesarHora(nuevoValor);
          break;
        case "hora de fin":
          updateData.hora_fin = procesarHora(nuevoValor);
          break;
      }
      
      // Ejecutar la actualización en la BD.
      const resultado = await calendarFuncs.editarEvento(eventoIdFinal, updateData);
      conversationContext[userId] = {}; // Limpiar el contexto
      return {
        status: "success",
        mensaje: `Evento actualizado correctamente: ${resultado.nombre} (${resultado.fecha})`,
        evento: resultado
      };
    }
    
    return { status: "error", mensaje: "Flujo de edición no reconocido." };
    
  } catch (error) {
    console.error("Error en handleEditar:", error);
    return { status: "error", mensaje: "Ocurrió un error procesando tu solicitud." };
  }
};

module.exports = { handleEditar };
