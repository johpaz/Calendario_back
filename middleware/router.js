// Importaciones necesarias
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const { consultarHandler } = require('../controllers/consultarController');
const { handleAgendar } = require('../controllers/agregarController');
const { routeConversacion } = require('../controllers/conversacionController');
const { handleEditar } = require('../controllers/editarController');
const { handleBorrar } = require('../controllers/borrarController');

// Configuración de las APIs
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Almacenamiento de contexto de conversación
let conversationContext = {};

/**
 * Función principal para enrutar los mensajes de entrada
 */
const routeInput = async (mensaje, userId = 'default') => {
    console.log(`Mensaje recibido: ${mensaje}`);
    
    try {
        // Inicializar contexto si no existe
        if (!conversationContext[userId]) {
            conversationContext[userId] = { 
                greeted: false,
                history: [],
                pendingAction: null
            };
        }

        // Agregar mensaje a la historia
        conversationContext[userId].history.push({
            role: 'user',
            content: mensaje
        });
        
        // Manejo de acciones pendientes
        if (conversationContext[userId].pendingAction) {
            return handlePendingAction(mensaje, userId);
        }

        // Obtener saludo si corresponde
        const saludo = manejarSaludo(userId);
        
        // Detectar intención con Gemini
        const intencionDetectada = await detectarIntencionConIA(mensaje, conversationContext[userId].history);
        console.log(`Intención detectada: ${intencionDetectada.accion}`);

        // Enrutar según la intención detectada
        if (intencionDetectada.accion) {
            conversationContext[userId].pendingAction = intencionDetectada.accion;
            conversationContext[userId].lastActionParams = intencionDetectada.parametros;
            
            // Direccionar a los manejadores correspondientes con los parámetros extraídos
            switch(intencionDetectada.accion) {
                case 'consultar':
                    return consultarHandler(mensaje, userId, conversationContext, saludo, intencionDetectada.parametros);
                case 'agregar':
                    return handleAgendar(mensaje, userId, conversationContext, saludo, intencionDetectada.parametros);
                case 'editar':
                    return handleEditar(mensaje, userId, conversationContext, saludo, intencionDetectada.parametros);
                case 'borrar':
                    return handleBorrar(mensaje, userId, conversationContext, saludo, intencionDetectada.parametros);
                default:
                    return manejarConversacionGeneral(mensaje, userId, saludo);
            }
        } else {
            // Si no se detecta una intención específica, derivar a conversación general
            return manejarConversacionGeneral(mensaje, userId, saludo);
        }
    } catch (err) {
        console.error('Error en routeInput:', err);
        return { 
            status: 'error', 
            mensaje: '⚠️ Error temporal en el sistema. Por favor intenta nuevamente.' 
        };
    }
};

/**
 * Maneja las acciones pendientes según el contexto actual
 */
const handlePendingAction = async (mensaje, userId) => {
    const pendingAction = conversationContext[userId].pendingAction;
    
    switch(pendingAction) {
        case 'consultar':
            return consultarHandler(mensaje, userId, conversationContext);
        case 'agregar':
            return handleAgendar(mensaje, userId, conversationContext);
        case 'editar':
            return handleEditar(mensaje, userId, conversationContext);
        case 'borrar':
            return handleBorrar(mensaje, userId, conversationContext);
        default:
            // Limpiar acción pendiente si no coincide con ninguna conocida
            conversationContext[userId].pendingAction = null;
            return manejarConversacionGeneral(mensaje, userId, '');
    }
};

/**
 * Detecta la intención usando Gemini 1.5
 * @returns {Object} - Objeto con la acción detectada y parámetros extraídos
 */
const detectarIntencionConIA = async (mensaje, historial) => {
    // Preparar el prompt para Gemini
    const prompt = `
    Eres un agente de agenda inteligente que detecta intenciones en mensajes de usuarios.
    Tu tarea es analizar el siguiente mensaje y determinar si contiene una intención de:
    1. consultar: ver, mostrar o buscar eventos o citas en la agenda
    2. agregar: crear, añadir o agendar un nuevo evento o cita
    3. editar: modificar o actualizar un evento o cita existente
    4. borrar: eliminar o cancelar un evento o cita
    5. ninguna: el mensaje no corresponde a ninguna de las intenciones anteriores
    
    Además, extrae los siguientes parámetros si están presentes:
    - fecha: fecha del evento (día, semana, mes, etc.)
    - hora: hora del evento
    - titulo: título o descripción del evento
    - id: identificador del evento (si se menciona)
    
    Responde en formato JSON como:
    {
      "accion": "consultar|agregar|editar|borrar|ninguna",
      "parametros": {
        "fecha": "valor o null",
        "hora": "valor o null",
        "titulo": "valor o null",
        "id": "valor o null"
      }
    }
    
    Mensaje: ${mensaje}
    `;
    
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const result = await model.generateContent(prompt);
        const response = result.response.text();
        
        // Intentar parsear la respuesta como JSON
        try {
            const jsonResponse = JSON.parse(response);
            return jsonResponse;
        } catch (parseError) {
            console.error('Error al parsear respuesta de Gemini:', parseError);
            // Extraer JSON de la respuesta si no está en formato puro
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            // Fallback a detección simple si no se puede parsear
            return { 
                accion: detectarIntencionSimple(mensaje),
                parametros: {}
            };
        }
    } catch (error) {
        console.error('Error al consultar Gemini:', error);
        // Fallback a detección simple
        return { 
            accion: detectarIntencionSimple(mensaje),
            parametros: {}
        };
    }
};

/**
 * Método de fallback para detección de intenciones basado en palabras clave
 */
const detectarIntencionSimple = (texto) => {
    const textoNormalizado = texto.toLowerCase().trim();
    
    const intenciones = {
        'consultar': [
            'consultar', 'ver', 'revisar', 'mostrar', 'listar',
            'qué tengo', 'qué hay', 'cuáles son', 'buscar'
        ],
        'agregar': [
            'agrega', 'añadir', 'crear', 'nuevo', 'programar', 'agendar',
            'planear', 'establecer', 'fijar', 'registrar'
        ],
        'editar': [
            'editar', 'modificar', 'cambiar', 'actualizar',
            'ajustar', 'corregir', 'actualiza', 'reescribir'
        ],
        'borrar': [
            'borrar', 'eliminar', 'quitar', 'suprimir',
            'cancelar', 'descartar', 'remover', 'borra'
        ]
    };

    for (const [accion, sinónimos] of Object.entries(intenciones)) {
        if (sinónimos.some(palabra => textoNormalizado.includes(palabra))) {
            return accion;
        }
    }
    return null;
};

/**
 * Maneja la conversación general cuando no se detecta una acción específica
 */
const manejarConversacionGeneral = async (mensaje, userId, saludo) => {
    try {
        // Usar OpenAI para manejar la conversación general
        const historialFormatoOpenAI = formatearHistorialParaOpenAI(userId);
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                {
                    role: "system",
                    content: `Eres Sofía, una asistente virtual especializada en gestionar una agenda. 
                    Tu tarea es mantener una conversación amigable y útil cuando el usuario no está haciendo 
                    solicitudes específicas sobre su agenda. Responde de forma concisa, amable y 
                    profesional. Si detectas que el usuario quiere consultar, agregar, editar o eliminar 
                    eventos, recuérdale amablemente que puede solicitar estas acciones de forma clara.
                    No inventes información sobre eventos o citas que no se han mencionado en la conversación.
                    Mantén tus respuestas breves y al punto.`
                },
                ...historialFormatoOpenAI,
            ],
            max_tokens: 250
        });
        
        const respuesta = completion.choices[0].message.content;
        
        // Guardar la respuesta en el historial
        conversationContext[userId].history.push({
            role: 'assistant',
            content: respuesta
        });
        
        // Limitar el tamaño del historial para evitar tokens excesivos
        if (conversationContext[userId].history.length > 10) {
            conversationContext[userId].history = conversationContext[userId].history.slice(-10);
        }
        
        return {
            status: 'success',
            mensaje: saludo + respuesta
        };
    } catch (error) {
        console.error('Error en manejo de conversación general:', error);
        return {
            status: 'error',
            mensaje: saludo + '¿En qué puedo ayudarte con tu agenda hoy?'
        };
    }
};

/**
 * Formatea el historial de conversación para la API de OpenAI
 */
const formatearHistorialParaOpenAI = (userId) => {
    // Tomar solo los últimos mensajes para mantener el contexto sin exceder tokens
    const historyLimit = 5;
    const recentHistory = conversationContext[userId].history.slice(-historyLimit);
    
    return recentHistory;
};

/**
 * Maneja el saludo inicial
 */
const manejarSaludo = (userId) => {
    if (!conversationContext[userId].greeted) {
        conversationContext[userId].greeted = true;
        return '¡Hola! Soy Agente Sofía 😊. ';
    }
    return '';
};

module.exports = { routeInput };