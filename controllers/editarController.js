const { editarEvento, buscarEventosPorNombre } = require('../services/agenda');
const { parseFecha, parseHora } = require('../helpers/dateHelpers');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuración de las APIs
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Campos que se pueden editar en un evento
const camposEditables = ['nombre', 'fecha', 'hora_inicio', 'hora_fin'];

/**
 * Maneja la edición de eventos usando un enfoque conversacional natural
 */
const handleEditar = async (mensaje, userId, conversationContext, saludo = '', parametros = {}) => {
    try {
        // Inicializa el contexto de edición si no existe
        if (!conversationContext[userId].edicion) {
            conversationContext[userId].edicion = {
                paso: 1,
                candidatos: null,
                eventoSeleccionado: null,
                cambios: {},
                editSteps: [...camposEditables],
                currentStep: 0,
                awaitingResponse: null
            };
            
            // Si recibimos parámetros con el título del evento desde la detección de intenciones
            if (parametros.titulo) {
                return buscarEventos(parametros.titulo, userId, conversationContext, saludo);
            } else {
                // Generamos una respuesta natural con Gemini
                const promptInicial = `Eres Sofía, una asistente virtual amigable y conversacional. Genera una respuesta natural para pedirle al usuario el nombre del evento que desea editar en su agenda. Sé amable pero concisa (máximo 2 frases).`;
                const respuesta = await generarRespuestaConversacional(promptInicial);
                
                // Guardamos la respuesta en el historial para mantener contexto
                conversationContext[userId].history.push({
                    role: 'assistant',
                    content: saludo + respuesta
                });
                
                return { 
                    status: 'pending', 
                    mensaje: saludo + respuesta 
                };
            }
        }
        
        // Obtenemos el contexto de edición actual
        const contextoEdicion = conversationContext[userId].edicion;
        
        // Manejamos el flujo según el paso actual
        switch(contextoEdicion.paso) {
            case 1: // Solicitud del nombre del evento
                return buscarEventos(mensaje, userId, conversationContext);
                
            case 2: // Selección del evento entre candidatos
                return seleccionarEvento(mensaje, userId, conversationContext);
                
            case 3: // Proceso de edición de campos
                return procesarFlujoEdicion(mensaje, userId, conversationContext);
                
            case 4: // Confirmación final de la edición
                return procesarConfirmacionEdicion(mensaje, userId, conversationContext);
                
            default:
                throw new Error('Paso no reconocido en el flujo de edición');
        }
    } catch (error) {
        console.error('Error en handleEditar:', error);
        
        // Limpiamos el contexto específico de edición
        if (conversationContext[userId]) {
            delete conversationContext[userId].edicion;
            conversationContext[userId].pendingAction = null;
        }
        
        // Generamos una respuesta de error más natural
        const mensajeError = await generarRespuestaConversacional(
            `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para informar al usuario que ocurrió un error al procesar su solicitud de edición. Menciona que puedes intentar nuevamente si lo desea. Sé empática pero concisa (máximo 2 frases).`
        );
        
        // Guardamos el error en el historial
        if (conversationContext[userId] && conversationContext[userId].history) {
            conversationContext[userId].history.push({
                role: 'assistant',
                content: mensajeError
            });
        }
        
        return { 
            status: 'error', 
            mensaje: mensajeError
        };
    }
};

/**
 * Busca eventos por nombre usando el servicio de agenda
 */
const buscarEventos = async (nombre, userId, conversationContext, saludo = '') => {
    try {
        // Buscar eventos que coincidan con el nombre
        const eventos = await buscarEventosPorNombre(nombre);
        
        if (!eventos.length) {
            // Generar una respuesta natural para cuando no se encuentran eventos
            const prompt = `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para informar al usuario que no se encontraron eventos con el nombre "${nombre}". Pregúntale si desea buscar con otro nombre. Sé empática pero concisa.`;
            const respuesta = await generarRespuestaConversacional(prompt);
            
            // Guardamos en el historial
            conversationContext[userId].history.push({
                role: 'assistant',
                content: respuesta
            });
            
            return { eventos : respuesta, status: 'pending', mensaje: respuesta };
        }
        
        // Actualizar el contexto de edición
        conversationContext[userId].edicion.paso = 2;
        conversationContext[userId].edicion.candidatos = eventos;
        
        // Formatear la lista de eventos para mostrar
        const listaEventos = formatearListaEventos(eventos);
        
        // Generar una respuesta natural con la lista de eventos
        const prompt = `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para mostrar al usuario una lista de eventos encontrados con el nombre "${nombre}" y pedirle que seleccione uno por su ID. La lista de eventos es:\n\n${listaEventos}\n\nIncluye la lista completa de eventos en tu respuesta y sé amable pero concisa.`;
        const respuesta = await generarRespuestaConversacional(prompt);
        
        // Guardar en historial
        conversationContext[userId].history.push({
            role: 'assistant',
            content: saludo + respuesta
        });
        
        return { status: 'pending', mensaje: saludo + respuesta };
    } catch (error) {
        throw new Error(`Error al buscar eventos: ${error.message}`);
    }
};

/**
 * Selecciona un evento específico para editar
 */
const seleccionarEvento = async (idInput, userId, conversationContext) => {
    const contextoEdicion = conversationContext[userId].edicion;
    const evento = contextoEdicion.candidatos.find(e => e.id.toString() === idInput.trim());
    
    if (!evento) {
        // Generar una respuesta natural para ID inválido
        const prompt = `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para informar al usuario que el ID "${idInput}" no corresponde a ninguno de los eventos mostrados. Pídele que ingrese uno de los IDs de la lista. Sé amable pero concisa.`;
        const respuesta = await generarRespuestaConversacional(prompt);
        
        // Guardar en historial
        conversationContext[userId].history.push({
            role: 'assistant',
            content: respuesta
        });
        
        return { status: 'pending', mensaje: respuesta };
    }
    
    // Actualizar el contexto con el evento seleccionado
    contextoEdicion.eventoSeleccionado = evento;
    contextoEdicion.cambios = {};
    contextoEdicion.paso = 3;
    contextoEdicion.currentStep = 0;
    contextoEdicion.awaitingResponse = 'confirmarCambio';
    
    // Formatear mensaje con los detalles del evento
    const detallesEvento = formatearEvento(evento);
    const campo = camposEditables[contextoEdicion.currentStep];
    
    // Generar una respuesta natural para el evento seleccionado
    const prompt = `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para confirmar al usuario que ha seleccionado el evento con estos detalles:\n\n${detallesEvento}\n\nPregúntale si desea modificar el campo "${campo}" (actualmente: "${evento[campo]}"). Sé conversacional pero concisa. La respuesta debe solicitar claramente un sí o no.`;
    const respuesta = await generarRespuestaConversacional(prompt);
    
    // Guardar en historial
    conversationContext[userId].history.push({
        role: 'assistant',
        content: respuesta
    });
    
    return { status: 'pending', mensaje: respuesta };
};

/**
 * Procesa el flujo de edición campo por campo
 */
const procesarFlujoEdicion = async (mensaje, userId, conversationContext) => {
    const contextoEdicion = conversationContext[userId].edicion;
    const { eventoSeleccionado, editSteps, currentStep } = contextoEdicion;
    const campo = editSteps[currentStep];
    const respuesta = mensaje.trim().toLowerCase();
    
    // Si estamos esperando confirmación para cambiar un campo
    if (contextoEdicion.awaitingResponse === 'confirmarCambio') {
        if (esAfirmacion(respuesta)) {
            contextoEdicion.awaitingResponse = 'nuevoValor';
            
            // Generar una pregunta natural para solicitar el nuevo valor
            let prompt;
            switch(campo) {
                case 'nombre':
                    prompt = `Eres Sofía, una asistente virtual amigable. Genera una pregunta natural para solicitar al usuario el nuevo nombre para el evento "${eventoSeleccionado.nombre}". Sé conversacional pero concisa.`;
                    break;
                case 'fecha':
                    prompt = `Eres Sofía, una asistente virtual amigable. Genera una pregunta natural para solicitar al usuario la nueva fecha para el evento "${eventoSeleccionado.nombre}" (actualmente: ${eventoSeleccionado.fecha}). Menciona que use el formato DD/MM/YYYY pero hazlo de forma conversacional, no como un robot. Sé amable pero concisa.`;
                    break;
                case 'hora_inicio':
                    prompt = `Eres Sofía, una asistente virtual amigable. Genera una pregunta natural para solicitar al usuario la nueva hora de inicio para el evento "${eventoSeleccionado.nombre}" (actualmente: ${eventoSeleccionado.hora_inicio}). Menciona que use el formato HH:MM pero hazlo de forma conversacional, no como un robot. Sé amable pero concisa.`;
                    break;
                case 'hora_fin':
                    prompt = `Eres Sofía, una asistente virtual amigable. Genera una pregunta natural para solicitar al usuario la nueva hora de finalización para el evento "${eventoSeleccionado.nombre}" (actualmente: ${eventoSeleccionado.hora_fin}). Menciona que use el formato HH:MM pero hazlo de forma conversacional, no como un robot. Sé amable pero concisa.`;
                    break;
            }
            
            const instruccion = await generarRespuestaConversacional(prompt);
            
            // Guardar en historial
            conversationContext[userId].history.push({
                role: 'assistant',
                content: instruccion
            });
            
            return { status: 'pending', mensaje: instruccion };
        } 
        else if (esNegacion(respuesta)) {
            // Si no quiere cambiar este campo, usamos el valor actual
            contextoEdicion.cambios[campo] = eventoSeleccionado[campo];
            contextoEdicion.currentStep++;
            
            // Seguimos con el flujo
            return continuarFlujoEdicion(userId, conversationContext);
        } 
        else {
            // Respuesta no reconocida - generamos una respuesta natural
            const prompt = `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para indicar al usuario que no entendiste su respuesta. Necesitas saber si quiere cambiar el campo "${campo}" del evento. Pídele que responda con un sí o no. Sé amable pero concisa.`;
            const respuestaNoReconocida = await generarRespuestaConversacional(prompt);
            
            // Guardar en historial
            conversationContext[userId].history.push({
                role: 'assistant',
                content: respuestaNoReconocida
            });
            
            return { status: 'pending', mensaje: respuestaNoReconocida };
        }
    }
    // Si estamos esperando el nuevo valor para un campo
    else if (contextoEdicion.awaitingResponse === 'nuevoValor') {
        try {
            // Validar el nuevo valor según el tipo de campo
            contextoEdicion.cambios[campo] = validarCampo(campo, mensaje, eventoSeleccionado);
            contextoEdicion.currentStep++;
            
            // Seguimos con el flujo
            return continuarFlujoEdicion(userId, conversationContext);
        } catch (error) {
            // Generar una respuesta natural para el error de validación
            const prompt = `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para informar al usuario que hubo un problema con el valor que ingresó para el campo "${campo}". El error es: "${error.message}". Pídele que intente nuevamente. Sé amable pero concisa.`;
            const respuestaError = await generarRespuestaConversacional(prompt);
            
            // Guardar en historial
            conversationContext[userId].history.push({
                role: 'assistant',
                content: respuestaError
            });
            
            return { status: 'pending', mensaje: respuestaError };
        }
    }
};

/**
 * Continúa el flujo de edición al siguiente campo o a la confirmación final
 */
const continuarFlujoEdicion = async (userId, conversationContext) => {
    const contextoEdicion = conversationContext[userId].edicion;
    
    // Si aún hay campos por revisar
    if (contextoEdicion.currentStep < camposEditables.length) {
        const siguienteCampo = camposEditables[contextoEdicion.currentStep];
        const valorActual = contextoEdicion.eventoSeleccionado[siguienteCampo];
        
        contextoEdicion.awaitingResponse = 'confirmarCambio';
        
        // Generar una pregunta natural para el siguiente campo
        const prompt = `Eres Sofía, una asistente virtual amigable. Genera una pregunta natural para preguntar al usuario si desea modificar el campo "${siguienteCampo}" (actualmente: "${valorActual}") del evento "${contextoEdicion.eventoSeleccionado.nombre}". Sé conversacional pero concisa. La respuesta debe solicitar claramente un sí o no.`;
        const mensaje = await generarRespuestaConversacional(prompt);
        
        // Guardar en historial
        conversationContext[userId].history.push({
            role: 'assistant',
            content: mensaje
        });
        
        return { status: 'pending', mensaje };
    }
    
    // Si hemos terminado con todos los campos, pedimos confirmación final
    contextoEdicion.paso = 4;
    const cambiosFormateados = mostrarCambios(contextoEdicion.eventoSeleccionado, contextoEdicion.cambios);
    
    // Generar una solicitud de confirmación natural
    const prompt = `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para mostrar al usuario los cambios que va a realizar en el evento "${contextoEdicion.eventoSeleccionado.nombre}" y pedirle confirmación. Los cambios son:\n\n${cambiosFormateados}\n\nSé conversacional pero concisa. La respuesta debe solicitar claramente una confirmación (sí/no).`;
    const mensaje = await generarRespuestaConversacional(prompt);
    
    // Guardar en historial
    conversationContext[userId].history.push({
        role: 'assistant',
        content: mensaje
    });
    
    return { status: 'pending', mensaje };
};

/**
 * Procesa la confirmación final de la edición
 */
const procesarConfirmacionEdicion = async (respuesta, userId, conversationContext) => {
    const contextoEdicion = conversationContext[userId].edicion;
    
    if (esAfirmacion(respuesta.trim().toLowerCase())) {
        try {
            // Realizar la edición en la base de datos
            const { eventoSeleccionado, cambios } = contextoEdicion;
            await editarEvento(
                eventoSeleccionado.id, 
                cambios.nombre, 
                cambios.fecha, 
                cambios.hora_inicio, 
                cambios.hora_fin
            );
            
            // Limpiar el contexto de edición
            delete conversationContext[userId].edicion;
            conversationContext[userId].pendingAction = null;
            
            // Generar una respuesta de éxito natural
            const prompt = `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para confirmar al usuario que el evento "${eventoSeleccionado.nombre}" ha sido actualizado exitosamente con los cambios solicitados. Sé amable y entusiasta pero concisa.`;
            const mensaje = await generarRespuestaConversacional(prompt);
            
            // Guardar en historial
            conversationContext[userId].history.push({
                role: 'assistant',
                content: mensaje
            });
            
            return { status: 'success', mensaje };
        } catch (error) {
            // Generar una respuesta de error natural
            const prompt = `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para informar al usuario que hubo un problema al guardar los cambios en el evento "${contextoEdicion.eventoSeleccionado.nombre}". Sé empática pero concisa.`;
            const mensajeError = await generarRespuestaConversacional(prompt);
            
            // Guardar en historial
            conversationContext[userId].history.push({
                role: 'assistant',
                content: mensajeError
            });
            
            throw new Error('Error al actualizar el evento en la base de datos');
        }
    } else if (esNegacion(respuesta.trim().toLowerCase())) {
        // Limpiar el contexto de edición
        delete conversationContext[userId].edicion;
        conversationContext[userId].pendingAction = null;
        
        // Generar una respuesta de cancelación natural
        const prompt = `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para confirmar al usuario que ha cancelado la edición del evento "${contextoEdicion.eventoSeleccionado.nombre}" y que no se realizaron cambios. Sé amable pero concisa.`;
        const mensaje = await generarRespuestaConversacional(prompt);
        
        // Guardar en historial
        conversationContext[userId].history.push({
            role: 'assistant',
            content: mensaje
        });
        
        return { status: 'success', mensaje };
    } else {
        // Generar una respuesta para solicitud no reconocida
        const prompt = `Eres Sofía, una asistente virtual amigable. Genera una respuesta natural para indicar al usuario que no entendiste su respuesta. Necesitas saber si confirma los cambios en el evento "${contextoEdicion.eventoSeleccionado.nombre}". Pídele que responda con un sí o no. Sé amable pero concisa.`;
        const mensajeNoReconocido = await generarRespuestaConversacional(prompt);
        
        // Guardar en historial
        conversationContext[userId].history.push({
            role: 'assistant',
            content: mensajeNoReconocido
        });
        
        return { status: 'pending', mensaje: mensajeNoReconocido };
    }
};

/**
 * Genera una respuesta conversacional usando Gemini
 */
const generarRespuestaConversacional = async (prompt) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error('Error al generar respuesta conversacional:', error);
        // Fallback para casos de error con API
        return prompt.includes('error') 
            ? "Lo siento, ha ocurrido un error al procesar tu solicitud. ¿Podemos intentarlo nuevamente?" 
            : "¿Podrías confirmar si deseas continuar con esta acción?";
    }
};

/**
 * Valida un campo según su tipo
 */
const validarCampo = (campo, mensaje, evento) => {
    const valor = mensaje.trim();
    
    if (campo === 'fecha') {
        const fechaParseada = parseFecha(valor);
        if (!fechaParseada) {
            throw new Error('El formato de fecha no es válido. Utiliza DD/MM/YYYY');
        }
        return fechaParseada;
    } 
    else if (campo === 'hora_inicio' || campo === 'hora_fin') {
        const horaParseada = parseHora(valor);
        if (!horaParseada) {
            throw new Error('El formato de hora no es válido. Utiliza HH:MM');
        }
        return horaParseada;
    }
    
    // Para el campo nombre, simplemente devolvemos el valor
    return valor;
};

/**
 * Comprueba si una respuesta es afirmativa
 */
const esAfirmacion = (respuesta) => {
    const afirmaciones = ['sí', 'si', 'claro', 'ok', 'okay', 'vale', 'por supuesto', 'afirmativo', 'correcto', 'exacto', 'seguro', 'confirmo'];
    return afirmaciones.some(afirmacion => respuesta.includes(afirmacion));
};

/**
 * Comprueba si una respuesta es negativa
 */
const esNegacion = (respuesta) => {
    const negaciones = ['no', 'nope', 'negativo', 'nunca', 'jamás', 'cancelar', 'cancelado', 'detener'];
    return negaciones.some(negacion => respuesta.includes(negacion));
};

/**
 * Formatea una lista de eventos para mostrar
 */
const formatearListaEventos = (eventos) => {
    return eventos.map(e => `🆔 ${e.id} | 📌 ${e.nombre} | 🗓 ${e.fecha} | ⏰ ${e.hora_inicio}-${e.hora_fin}`).join('\n');
};

/**
 * Formatea un evento para mostrar
 */
const formatearEvento = (evento) => {
    return `📌 ${evento.nombre}\n🗓 ${evento.fecha}\n⏰ ${evento.hora_inicio}-${evento.hora_fin}`;
};

/**
 * Formatea los cambios realizados para mostrar
 */
const mostrarCambios = (original, cambios) => {
    return Object.entries(cambios).map(([campo, valor]) => {
        // Si el valor no ha cambiado, no lo incluimos en el resumen
        if (valor === original[campo]) return null;
        
        // Formateamos el cambio
        return `➡️ ${campo.toUpperCase()}: ${original[campo]} → ${valor}`;
    }).filter(Boolean).join('\n'); // Filtramos los nulls y unimos con saltos de línea
};

module.exports = { handleEditar };