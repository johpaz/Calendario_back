const { GoogleGenerativeAI } = require('@google/generative-ai');
const { handleConsulta } = require('../controllers/consultasIA');
const { handleAgregar } = require('../controllers/agendarIA');
const { handleEditar } = require('../controllers/editarIA');
const { handleBorrar } = require('../controllers/borrarIA');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Función para actualizar el historial de conversación del usuario.
 */
const actualizarHistorial = (userId, conversationContext, role, content) => {
  conversationContext[userId].history.push({ role, content });
  if (conversationContext[userId].history.length > 10) {
    conversationContext[userId].history = conversationContext[userId].history.slice(-10);
  }
};

/**
 * Limpia el texto recibido de bloques de código Markdown, extrayendo el JSON.
 */
const limpiarJSON = (texto) => {
  // Busca bloques de código marcados con ```json ... ```
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
Eres un asistente de agenda que analiza mensajes para extraer intenciones y parámetros.

Ejemplos de acciones:
- consultar: para consultar eventos.
- agregar: para agendar un evento.
- editar: para editar un evento.
- borrar: para borrar un evento.

Formato de respuesta (SOLO JSON):
{
  "accion": "consultar|agregar|editar|borrar",
  "parametros": {
    "nombre": "nombre del evento o null",
    "fecha": "fecha del evento o null",
    "horaInicio": "hora de inicio o null",
    "horaFin": "hora de fin o null",
    "id": "id del evento si se menciona o null",
    "nuevoTitulo": "nuevo nombre (en caso de edición) o null"
  },
  "explicacion": "Breve explicación de tu análisis"
}

MENSAJE: ${mensaje}
HISTORIAL:
${historial.slice(-3).map(m => m.role + ": " + m.content).join("\n")}
    `;
    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    console.log("Gemini response:", responseText);
    // Limpia las marcas de código Markdown.
    responseText = limpiarJSON(responseText);
    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      console.error("Error parseando JSON en analizarMensajeConGemini:", parseError);
      // Fallback básico
      return {
        accion: "ninguna",
        parametros: {},
        explicacion: "No se pudo extraer la acción; se asume que no hay intención de agenda."
      };
    }
  } catch (error) {
    console.error("Error en analizarMensajeConGemini:", error);
    return {
      accion: "ninguna",
      parametros: {},
      explicacion: "Error en API; se asume que no hay intención de agenda."
    };
  }
};

/**
 * Función para generar una respuesta natural usando Gemini.
 */
const generarRespuesta = async (accion, resultado, parametros) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
Genera una respuesta natural y amigable para un asistente de agenda llamado Sofía.
Acción: ${accion || "no detectada"}
Resultado: ${JSON.stringify(resultado)}
Parámetros: ${JSON.stringify(parametros)}
Si no se detecta una acción clara, responde:
"No he entendido qué deseas hacer con tu agenda. ¿Quieres consultar, agregar, editar o borrar algún evento?"
Respuesta:
    `;
    const res = await model.generateContent(prompt);
    return res.response.text().trim();
  } catch (error) {
    console.error("Error al generar respuesta:", error);
    return "No he entendido qué deseas hacer con tu agenda. ¿Quieres consultar, agregar, editar o borrar algún evento?";
  }
};

/**
 * Controlador universal que procesa el mensaje, actualiza el contexto y delega la acción.
 * Si no se detecta una acción, se genera una respuesta en lenguaje natural.
 */
const universalController = async (mensaje, userId, conversationContext) => {
  try {
    console.log(`Mensaje recibido: ${mensaje}`);
    
    // Inicializar contexto si no existe.
    if (!conversationContext[userId]) {
      conversationContext[userId] = { 
        greeted: false,
        history: [],
        pendingAction: null,
        lastActionParams: {},
        lastAction: null,
        currentEventId: null,
        eventOptions: []
      };
    }
    
    // Agregar el mensaje al historial.
    conversationContext[userId].history.push({ role: 'user', content: mensaje });
    
    // Si el mensaje es un agradecimiento, responder sin procesar acción.
    const mensajeLower = mensaje.toLowerCase();
    if (mensajeLower.includes("gracias") || mensajeLower.includes("muchas gracias")) {
      return { status: "success", mensaje: "¡De nada! Si necesitas algo más, aquí estaré." };
    }
    
    // Analizar el mensaje con Gemini.
    const analisis = await analizarMensajeConGemini(mensaje, conversationContext[userId].history);
    console.log("Análisis de Gemini:", analisis);
    const { accion, parametros } = analisis;
    
    // Mapeo de acciones a controladores.
    const controladores = {
      consultar: handleConsulta,
      agregar: handleAgregar,
      editar: handleEditar,
      borrar: handleBorrar
    };
    
    // Si no se detecta una acción válida, generar respuesta en lenguaje natural.
    if (!controladores[accion]) {
      console.log(`Acción no detectada para mensaje: "${mensaje}"`);
      const respuesta = await generarRespuesta(accion, {}, parametros);
      actualizarHistorial(userId, conversationContext, "assistant", respuesta);
      return { status: "info", mensaje: respuesta };
    }
    
    // Guardar la acción y parámetros en el contexto.
    conversationContext[userId].lastAction = accion;
    conversationContext[userId].lastActionParams = parametros;
    
    // Delegar la acción al handler correspondiente.
    const resultado = await controladores[accion](parametros, userId, conversationContext);
    if (resultado.pendingAction) {
      return resultado;
    }
    
    // Generar respuesta natural.
    const respuesta = await generarRespuesta(accion, resultado, parametros);
    actualizarHistorial(userId, conversationContext, "assistant", respuesta);
    
    // Limpiar el contexto de la acción.
    conversationContext[userId].pendingAction = null;
    conversationContext[userId].lastAction = null;
    conversationContext[userId].lastActionParams = null;
    
    return {
      status: resultado.status || "success",
      mensaje: respuesta,
      eventos: resultado.eventos || resultado.evento || null
    };
  } catch (error) {
    console.error("Error en controlador universal:", error);
    return { 
      status: "error", 
      mensaje: "⚠️ Ha ocurrido un error al procesar tu solicitud. Por favor, intenta de nuevo con más detalles." 
    };
  }
};

module.exports = { universalController };
