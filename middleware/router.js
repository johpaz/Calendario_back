const { consultarHandler } = require('../controllers/consultarController');
const { handleAgendar } = require('../controllers/agregarController');
const { routeConversacion } = require('../controllers/conversacionController');
const {handleEditar} = require('../controllers/editarController')
const {handleBorrar}= require('../controllers/borrarController')

let conversationContext = {};

const routeInput = async (mensaje, userId = 'default') => {
    console.log(mensaje);
    
    const texto = mensaje.toLowerCase().trim();
    
    try {
        // Manejo de contexto existente
        const currentContext = conversationContext[userId];
        if (currentContext?.pendingAction) {
            switch(currentContext.pendingAction) {
                case 'consultar':
                    return consultarHandler(mensaje, userId, conversationContext);
                case 'agregar':
                    return handleAgendar(mensaje, userId, conversationContext);
                case 'editar':
                    return handleEditar(mensaje, userId, conversationContext);
                case 'borrar':
                    return handleBorrar(mensaje, userId, conversationContext);
            }
        }

        // Detección inicial de intenciones
        const accion = detectarIntencion(texto);
      
        
        
        if (!conversationContext[userId]) {
            conversationContext[userId] = { greeted: false };
        }

        // Manejo de saludo inicial
        const saludo = manejarSaludo(userId, conversationContext);

        // Enrutamiento por acción
        switch(accion) {
            case 'consultar':
                conversationContext[userId].pendingAction = 'consultar';
                return consultarHandler(mensaje, userId, conversationContext, saludo);
            
            case 'agregar':
                conversationContext[userId].pendingAction = 'agregar';
                return handleAgendar(mensaje, userId, conversationContext, saludo);
            
            case 'editar':
                conversationContext[userId].pendingAction = 'editar';
                return handleEditar(mensaje, userId, conversationContext, saludo);
            
            case 'borrar':
                conversationContext[userId].pendingAction = 'borrar';
                return handleBorrar(mensaje, userId, conversationContext, saludo);
            
            default:
                return routeConversacion(mensaje, conversationContext, userId);
        }
    } catch (err) {
        console.error('Error en routeInput:', err);
        return { 
            status: 'error', 
            mensaje: '⚠️ Error temporal en el sistema. Por favor intenta nuevamente.' 
        };
    }
};

// Funciones auxiliares
const detectarIntencion = (texto) => {
    const intenciones = {
        'consultar': [
            'consultar', 'ver', 'revisar', 'mostrar', 'listar',
            'qué tengo', 'qué hay', 'cuáles son', 'buscar'
        ],
        'agregar': [
            'agrega', 'añadir', 'crear', 'nuevo', 'programar','agendar',
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
        if (sinónimos.some(palabra => texto.includes(palabra))) {
            return accion;
        }
    }
    return null;
};

const manejarSaludo = (userId, context) => {
    if (!context[userId].greeted) {
        context[userId].greeted = true;
        return '¡Hola! Soy Agente Sofía 😊. ';
    }
    return '';
};

module.exports = { routeInput };