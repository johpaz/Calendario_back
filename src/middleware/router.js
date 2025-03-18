// Importaciones necesarias
const { OpenAI } = require('openai');
const { universalController } = require('../controllers/controladorUniversa');

// Configuración de las APIs
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
                pendingAction: null,
                lastActionParams: {},
                lastAction: null,
                currentEventId: null,
                eventOptions: []
            };
        }

        // Agregar mensaje a la historia
        conversationContext[userId].history.push({
            role: 'user',
            content: mensaje
        });
        
        // Obtener saludo si corresponde
        const saludo = manejarSaludo(userId);
        
        try {
            // Si hay una acción pendiente o se detecta una intención relacionada con la agenda
            if (conversationContext[userId].pendingAction || detectarIntencionSimple(mensaje)) {
                // Intentar procesar con el controlador universal
                try {
                    const respuesta = await universalController(mensaje, userId, conversationContext);
                    
                    // Si hay una respuesta válida, devolverla con el saludo adecuado
                    if (respuesta && typeof respuesta === 'object') {
                        return {
                            ...respuesta,
                            mensaje: saludo + (respuesta.mensaje || 'He procesado tu solicitud.')
                        };
                    } else {
                        // Fallback si la respuesta no es válida
                        console.warn('Respuesta no válida del controlador universal:', respuesta);
                        return manejarConversacionGeneral(mensaje, userId, saludo);
                    }
                } catch (controllerError) {
                    console.error('Error al procesar con universalController:', controllerError);
                    
                    // Si falla el controlador universal, intentar con la conversación general
                    return manejarConversacionGeneral(mensaje, userId, saludo);
                }
            } else {
                // Si no se detecta intención relacionada con la agenda, usar la conversación general
                return manejarConversacionGeneral(mensaje, userId, saludo);
            }
        } catch (processingError) {
            console.error('Error al procesar el mensaje:', processingError);
            return manejarConversacionGeneral(mensaje, userId, saludo);
        }
    } catch (err) {
        console.error('Error general en routeInput:', err);
        return { 
            status: 'error', 
            mensaje: '⚠️ Error temporal en el sistema. Por favor intenta nuevamente.' 
        };
    }
};

/**
 * Método mejorado para detección de intenciones basado en palabras clave
 */
const detectarIntencionSimple = (texto) => {
    if (!texto) return false;
    
    const textoNormalizado = texto.toLowerCase().trim();
    
    // Palabras clave para detectar intenciones relacionadas con la agenda
    const palabrasClaveAgenda = [
        'consultar', 'ver', 'revisar', 'mostrar', 'listar', 'buscar',
        'agrega', 'añadir', 'crear', 'nuevo', 'programar', 'agendar',
        'editar', 'modificar', 'cambiar', 'actualizar', 'ajustar',
        'borrar', 'eliminar', 'quitar', 'suprimir', 'cancelar',
        'cita', 'evento', 'reunión', 'agenda', 'calendario',
        'planear', 'recordatorio', 'recordar', 'organizar'
    ];

    return palabrasClaveAgenda.some(palabra => textoNormalizado.includes(palabra));
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