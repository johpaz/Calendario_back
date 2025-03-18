const { GoogleGenerativeAI } = require('@google/generative-ai');
const calendarFuncs = require('../services/agenda');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Función para analizar el mensaje usando Gemini y extraer la intención y parámetros.
 * (Este ejemplo asume que se usa para la acción "borrar".)
 */
const analizarMensajeConGemini = async (mensaje, historial) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
Eres un asistente de agenda que analiza mensajes para extraer intenciones y parámetros.
La intención actual es borrar un evento.
Formato de respuesta (SOLO JSON):
{
  "accion": "borrar",
  "parametros": {
    "nombre": "nombre del evento o null",
    "id": "id del evento o null"
  },
  "explicacion": "Breve explicación de tu análisis"
}
MENSAJE: ${mensaje}
HISTORIAL:
${historial.slice(-3).map(m => m.role + ": " + m.content).join("\n")}
    `;
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    console.log("Gemini response (borrar):", responseText);
    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      console.error("Error parseando JSON en borrarIA:", parseError);
      // Fallback básico
      return {
        accion: "borrar",
        parametros: { nombre: null, id: null },
        explicacion: "Fallback: se detectó intención de borrar un evento"
      };
    }
  } catch (error) {
    console.error("Error en analizarMensajeConGemini en borrarIA:", error);
    return {
      accion: "borrar",
      parametros: { nombre: null, id: null },
      explicacion: "Fallback: error en API, se asume borrado"
    };
  }
};

/**
 * Controlador para borrar un evento.
 * Flujo:
 * 1. Si no se recibe ni un ID ni un nombre, se establece pendingAction = "espera_detalles_borrar"
 *    y se solicita al usuario que proporcione el nombre del evento a borrar.
 * 2. Si pendingAction es "espera_detalles_borrar", se intenta capturar el nombre usando
 *    parametros.originalText, parametros.message o parametros.mensaje; si no se recibe, se
 *    usa el último mensaje del historial.
 * 3. Si se recibe un ID o se identifica un único evento por nombre, se solicita confirmación antes de borrar.
 * 4. En estado "confirmar_borrado", se captura la respuesta para proceder o cancelar.
 * Además, se retorna la propiedad "eventos" con la lista de eventos encontrados.
 */
const handleBorrar = async (parametros, userId, conversationContext) => {
  try {
    console.log(`-- Inicio handleBorrar para usuario ${userId} --`);
    console.log("Parámetros recibidos:", parametros);

    // Paso 0: Si ya estamos en estado "confirmar_borrado", procesar la respuesta.
    if (conversationContext[userId].pendingAction === "confirmar_borrado") {
      let confirmacion = (parametros.originalText || parametros.message || parametros.mensaje || "").toLowerCase().trim();
      // Fallback: usar el último mensaje del historial si no se recibió confirmación.
      if (!confirmacion && conversationContext[userId].history && conversationContext[userId].history.length > 0) {
        confirmacion = conversationContext[userId].history[conversationContext[userId].history.length - 1].content.toLowerCase().trim();
      }
      console.log(`Usuario ${userId} - Confirmación recibida: "${confirmacion}"`);
      if (confirmacion === "sí" || confirmacion === "si") {
        const eventId = conversationContext[userId].eventoAEliminar;
        if (!eventId) {
          return { status: "error", mensaje: "No se encontró el evento a borrar." };
        }
        const resultado = await calendarFuncs.borrarEvento(eventId);
        conversationContext[userId].pendingAction = null;
        conversationContext[userId].eventoAEliminar = null;
        console.log(`Usuario ${userId} - Evento borrado tras confirmación:`, resultado);
        return { ...resultado };
      } else {
        conversationContext[userId].pendingAction = null;
        conversationContext[userId].eventoAEliminar = null;
        console.log(`Usuario ${userId} - Borrado cancelado por el usuario.`);
        return { status: "info", mensaje: "Borrado cancelado." };
      }
    }

    // Paso 1: Si no se recibió ni ID ni nombre, solicitar el nombre del evento.
    if (!parametros.id && !parametros.nombre) {
      console.log(`Usuario ${userId} - No se recibieron datos para identificar el evento.`);
      conversationContext[userId].pendingAction = "espera_detalles_borrar";
      return {
        status: "info",
        mensaje: "Para borrar un evento, por favor proporciona el nombre del evento a borrar.",
        pendingAction: "espera_detalles_borrar"
      };
    }

    // Paso 2: Si estamos en estado "espera_detalles_borrar", capturar el nombre.
    if (conversationContext[userId].pendingAction === "espera_detalles_borrar") {
      let nombre = parametros.originalText || parametros.message || parametros.mensaje || "";
      if (!nombre && conversationContext[userId].history && conversationContext[userId].history.length > 0) {
        nombre = conversationContext[userId].history[conversationContext[userId].history.length - 1].content;
      }
      nombre = nombre.trim();
      console.log(`Usuario ${userId} - Pending Action: espera_detalles_borrar, nombre recibido: "${nombre}"`);
      if (!nombre) {
        return {
          status: "info",
          mensaje: "Por favor, proporciona el nombre del evento a borrar.",
          pendingAction: "espera_detalles_borrar"
        };
      }
      parametros.nombre = nombre;
      conversationContext[userId].pendingAction = null;
      console.log(`Usuario ${userId} - Se capturó nombre para borrar: ${nombre}`);
    }

    // Paso 3: Si se recibió un ID, pedir confirmación.
    if (parametros.id) {
      console.log(`Usuario ${userId} - Borrando evento por ID: ${parametros.id}`);
      conversationContext[userId].pendingAction = "confirmar_borrado";
      conversationContext[userId].eventoAEliminar = parametros.id;
      return {
        status: "info",
        mensaje: `Se ha identificado el evento con ID ${parametros.id}. ¿Estás seguro de que deseas borrarlo? Responde "sí" para confirmar o "no" para cancelar.`,
        pendingAction: "confirmar_borrado",
        eventos: [] // No se retorna lista de eventos ya que se usó ID
      };
    }

    // Paso 4: Si se recibió un nombre, buscar eventos por ese nombre.
    if (parametros.nombre) {
      console.log(`Usuario ${userId} - Buscando evento por nombre: ${parametros.nombre}`);
      const eventos = await calendarFuncs.buscarEventosPorNombre(parametros.nombre);
      console.log(`Usuario ${userId} - Eventos encontrados:`, eventos);
      if (!eventos || eventos.length === 0) {
        return {
          status: "error",
          mensaje: "No se encontró ningún evento con ese nombre.",
          
        };
      } else if (eventos.length > 1) {
        conversationContext[userId].pendingAction = "seleccionar_evento_para_borrar";
        conversationContext[userId].eventOptions = eventos;
        return {
          status: "info",
          mensaje: `Se encontraron varios eventos. Por favor, indica el número del evento que deseas borrar:\n${eventos.map((e, i) => `${i + 1}. ${e.nombre} (${e.fecha} ${e.hora_inicio}-${e.hora_fin})`).join("\n")}`,
          pendingAction: "seleccionar_evento_para_borrar",
          eventos: eventos
        };
      } else {
        const eventoId = eventos[0]._id;
        console.log(`Usuario ${userId} - Evento identificado para borrar: ${eventoId}`);
        conversationContext[userId].pendingAction = "confirmar_borrado";
        conversationContext[userId].eventoAEliminar = eventoId;
        return {
          status: "info",
          mensaje: `Se ha identificado el evento "${eventos[0].nombre}" con fecha ${eventos[0].fecha} y horario ${eventos[0].hora_inicio} - ${eventos[0].hora_fin}. ¿Estás seguro de que deseas borrarlo? Responde "sí" para confirmar o "no" para cancelar.`,
          pendingAction: "confirmar_borrado",
          eventos: eventos
        };
      }
    }

    // Fallback en caso de no cumplir ninguna condición.
    return {
      status: "error",
      mensaje: "No se pudo determinar qué evento borrar. Por favor, proporciona más detalles.",
      eventos: []
    };
  } catch (error) {
    console.error(`Error en handleBorrar para usuario ${userId}:`, error);
    return {
      status: "error",
      mensaje: "Ocurrió un error al borrar el evento.",
      eventos: []
    };
  }
};

module.exports = { handleBorrar };
