// helpers/errorHandler.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const manejarErrores = async (error, contexto = 'general', parametros = {}) => {
  // Log detallado para desarrollo
  console.error(`[Error] Contexto: ${contexto}`, {
    message: error.message,
    stack: error.stack,
    parametros,
    timestamp: new Date().toISOString()
  });

  // Diccionario de mensajes base
  const mensajesBase = {
    consulta: 'Error al consultar la agenda',
    agregar: 'Error al crear el evento',
    editar: 'Error al actualizar el evento',
    borrar: 'Error al eliminar el evento',
    general: 'Error al procesar la solicitud',
    validacion: 'Datos incompletos o inválidos',
    conflicto: 'Conflicto de horario detectado',
    no_encontrado: 'El elemento solicitado no existe'
  };

  // Detección de tipo de error usando Gemini
  const detectarTipoError = async () => {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Clasifica este error para un sistema de agenda: "${error.message}". Opciones: validacion|conflicto|no_encontrado|general`;
      
      const result = await model.generateContent(prompt);
      const tipo = (await result.response.text()).trim().toLowerCase();
      
      return ['validacion', 'conflicto', 'no_encontrado'].includes(tipo) 
        ? tipo 
        : 'general';
    } catch (geminiError) {
      return 'general';
    }
  };

  // Respuestas amigables
  const generarMensajeUsuario = async (tipoError) => {
    const mensajes = {
      validacion: '⚠️ Por favor verifica los datos ingresados:',
      conflicto: '⏰ Hay un conflicto de horarios:',
      no_encontrado: '🔍 No encontré lo que buscas:',
      general: '⚠️ Ocurrió un error inesperado:'
    };

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Traduce este error técnico a un mensaje amigable en español (máximo 15 palabras): ${error.message}`;
      
      const result = await model.generateContent(prompt);
      const detalle = await result.response.text();
      
      return `${mensajes[tipoError]} ${detalle.trim()}`;
    } catch (geminiError) {
      return `${mensajes[tipoError]} ${mensajesBase[contexto]}`;
    }
  };

  // Ejecución sincrónica para uso en controladores
  const tipoError = await detectarTipoError();
  const mensajeUsuario = await generarMensajeUsuario(tipoError);

  return {
    status: 'error',
    codigo: mapearCodigos(tipoError),
    mensaje: mensajeUsuario,
    detalles: {
      tipo: tipoError,
      contexto,
      timestamp: new Date().toISOString()
    }
  };
};

const mapearCodigos = (tipo) => {
  const codigos = {
    validacion: 400,
    conflicto: 409,
    no_encontrado: 404,
    general: 500
  };
  return codigos[tipo] || 500;
};

module.exports = { manejarErrores };