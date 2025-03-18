const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../database');
const calendarFuncs = require('../services/agenda'); // Ajustar ruta según tu estructura

// Configuración de la API de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Funciones auxiliares para procesar fechas y horas
const procesarFecha = (fechaStr) => {
  if (!fechaStr) return null;
  try {
    const hoy = new Date();
    if (fechaStr.toLowerCase().includes('hoy')) {
      return hoy.toISOString().split('T')[0];
    }
    if (fechaStr.toLowerCase().includes('mañana')) {
      const mañana = new Date(hoy);
      mañana.setDate(hoy.getDate() + 1);
      return mañana.toISOString().split('T')[0];
    }
    if (/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(fechaStr)) {
      const partes = fechaStr.split(/[\/\-\.]/);
      const fecha = new Date(`${partes[2]}-${partes[1]}-${partes[0]}`);
      return fecha.toISOString().split('T')[0];
    }
    return fechaStr;
  } catch (e) {
    console.error('Error al procesar fecha:', e);
    return fechaStr;
  }
};

const procesarHora = (horaStr) => {
  if (!horaStr) return null;
  try {
    if (horaStr.toLowerCase().includes('am') || horaStr.toLowerCase().includes('pm')) {
      const [hora, minuto] = horaStr.replace(/[^\d:]/g, '').split(':');
      let horaNum = parseInt(hora);
      if (horaStr.toLowerCase().includes('pm') && horaNum < 12) {
        horaNum += 12;
      } else if (horaStr.toLowerCase().includes('am') && horaNum === 12) {
        horaNum = 0;
      }
      return `${horaNum.toString().padStart(2, '0')}:${minuto || '00'}`;
    }
    if (/\d{1,2}:\d{2}/.test(horaStr)) {
      const [hora, minuto] = horaStr.split(':');
      return `${parseInt(hora).toString().padStart(2, '0')}:${minuto}`;
    }
    if (/^\d{1,2}$/.test(horaStr)) {
      return `${parseInt(horaStr).toString().padStart(2, '0')}:00`;
    }
    return horaStr;
  } catch (e) {
    console.error('Error al procesar hora:', e);
    return horaStr;
  }
};

/**
 * Controlador universal que maneja todas las operaciones de calendario
 */
const universalController = async (mensaje, userId, conversationContext) => {
  try {
    console.log(`Procesando mensaje en controlador universal: ${mensaje}`);
    
    // Detectar la intención y extraer parámetros con Gemini
    const analisis = await analizarMensajeConGemini(mensaje, conversationContext[userId].history);
    console.log('Análisis de Gemini:', analisis);
    
    const { accion, parametros } = analisis;
    
    // Validar y procesar parámetros
    const fecha = procesarFecha(parametros.fecha);
    const horaInicio = procesarHora(parametros.horaInicio);
    const horaFin = procesarHora(parametros.horaFin || (horaInicio ? agregarDuracion(horaInicio, 60) : null)); // Por defecto 1 hora
    const titulo = parametros.titulo;
    let id = parametros.id;
    
    // Ejecutar la acción correspondiente
    let resultado;
    switch (accion) {
      case 'consultar':
        if (!parametros.fecha) {
          return solicitarInformacionFaltante(accion, parametros, userId, conversationContext);
        }
        // Si el usuario menciona "hoy" o "mañana", se usará esa fecha para inicio y fin
        resultado = await ejecutarConsulta(fecha, parametros.fechaFin);
        break;
        
      case 'agregar':
        if (!titulo || !fecha || !horaInicio) {
          return solicitarInformacionFaltante(accion, { titulo, fecha, horaInicio }, userId, conversationContext);
        }
        resultado = await ejecutarAgendamiento(titulo, fecha, horaInicio, horaFin);
        break;

        case 'editar':
          // Intentamos obtener el ID desde el mensaje o del contexto
          if (!id) {
            if (conversationContext[userId] && conversationContext[userId].currentEventId) {
              // Si el contexto ya tiene un evento seleccionado, se usa ese ID
              id = conversationContext[userId].currentEventId;
            } else if (titulo) {
              // Si se proporcionó un título, se busca por nombre (o combinación de criterios)
              const eventosEncontrados = await buscarEventos(parametros);
              if (eventosEncontrados && eventosEncontrados.length === 1) {
                id = eventosEncontrados[0].id;
                conversationContext[userId].currentEventId = id;
              } else if (eventosEncontrados && eventosEncontrados.length > 1) {
                return manejarResultadosBusqueda(eventosEncontrados, 'editar', parametros, userId, conversationContext);
              } else {
                return {
                  status: 'error',
                  mensaje: 'No se encontró el evento que deseas editar. Por favor, proporciona más detalles.'
                };
              }
            } else if (fecha) {
              // Si no hay título pero se indica una fecha (por ejemplo "hoy"), se busca por fecha
              const eventosEncontrados = await calendarFuncs.buscarEventosPorFecha(fecha);
              if (eventosEncontrados && eventosEncontrados.length === 1) {
                id = eventosEncontrados[0].id;
                conversationContext[userId].currentEventId = id;
              } else if (eventosEncontrados && eventosEncontrados.length > 1) {
                return manejarResultadosBusqueda(eventosEncontrados, 'editar', parametros, userId, conversationContext);
              } else {
                return {
                  status: 'error',
                  mensaje: 'No se encontró ningún evento en esa fecha para editar. Por favor, proporciona más detalles.'
                };
              }
            } else {
              return {
                status: 'error',
                mensaje: 'No se proporcionó suficiente información para identificar el evento a editar.'
              };
            }
          }
          
          // Verificamos si se han proporcionado nuevos datos para la edición
          if (!parametros.nuevoTitulo && !fecha && !horaInicio && !horaFin) {
            return solicitarInformacionFaltante(accion, parametros, userId, conversationContext);
          }
          
          resultado = await ejecutarEdicion(id, titulo, fecha, horaInicio, horaFin, parametros.nuevoTitulo, conversationContext, userId);
          break;
        
      case 'borrar':
        if (!titulo && !id) {
          const eventosEncontrados = await buscarEventos(parametros);
          return manejarResultadosBusqueda(eventosEncontrados, 'borrar', parametros, userId, conversationContext);
        }
        resultado = await ejecutarBorrado(id, titulo);
        break;
        
      default:
        return {
          status: 'success',
          mensaje: 'No he entendido qué quieres hacer con tu agenda. ¿Quieres consultar, agregar, editar o borrar algún evento?'
        };
    }
    
    const respuesta = await generarRespuesta(accion, resultado, parametros);
    actualizarHistorial(userId, conversationContext, 'assistant', respuesta);
    
    return {
      status: resultado.status || 'success',
      mensaje: respuesta,
      eventos: resultado.eventos || resultado.evento || null
    };
  } catch (error) {
    console.error('Error en controlador universal:', error);
    return { 
      status: 'error', 
      mensaje: '⚠️ Ha ocurrido un error al procesar tu solicitud. Por favor, intenta de nuevo con más detalles.' 
    };
  }
};

/**
 * Analiza el mensaje con Gemini para detectar intención y extraer parámetros
 */
const analizarMensajeConGemini = async (mensaje, historial) => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = `
  Eres un asistente de agenda que analiza mensajes para extraer intenciones y parámetros.

  CONTEXTO DE FUNCIONES DISPONIBLES:
  - agendarEvento(nombre, fecha, horaInicio, horaFin)
  - consultarAgenda(fechaInicio, fechaFin)
  - editarEvento(id, nuevoNombre, fecha, horaInicio, horaFin)
  - borrarEvento(idEvento)
  - buscarEvento)(parametros)
  - buscarEventosPorNombre(nombre)
  - buscarEventosPorFecha(fecha)

  EJEMPLOS SQL:
  1. hayConflicto(fecha, horaInicio, horaFin, excludeId): Verifica si existe conflicto en el horario.
  2. agendarEvento(nombre, fecha, horaInicio, horaFin): Agenda un nuevo evento y retorna un objeto con status, mensaje y datos del evento.
  3. consultarAgenda(fechaInicio, fechaFin): Consulta los eventos entre dos fechas y retorna una lista de eventos.
  4. editarEventoPorNombre(nombreActual, nuevoNombre, fecha, horaInicio, horaFin): Edita un evento buscado por nombre.
  5. borrarEventoPorNombre(nombre): Borra un evento buscado por nombre.
  6. buscarEventosPorNombre(nombre): Realiza una búsqueda parcial de eventos cuyo nombre contenga la cadena proporcionada y retorna una lista de coincidencias.
  7. buscarEventosPorFecha(fecha). Si se especifica "hoy" o "mañana", se debe interpretar como la fecha actual o la siguiente, respectivamente.
  8. buscarEventos(parametros) Puede buscar eventos por nombre o fecha se debe interpretar como la fecha actual(hoy) o la siguiente(mañana), respectivamente..
 
 
  DATOS REQUERIDOS SEGÚN LA INTENCIÓN:
  - Para agregar (crear) un evento: Se requiere el título, la fecha, la hora de inicio y la hora de fin.
  - Para consultar eventos: Se requiere la fecha de inicio. Si se ingresa "hoy" o "mañana", se usará esa fecha como inicio y fin.
  - Para editar un evento: Se requiere el identificador (ID) que puede tomar del contexto cuando da el nombre del evento, si no tiene contexto ejecuta la funcion buscarEventos(puede buscar por nombre o por fecha), Si se ingresa una fecha como "hoy" o "mañana", se usará esa fecha actual, y luego debe pedirle el dato que va a cambiar. por ejemplo  los nuevos datos (nuevo título, fecha, hora de inicio y hora de fin).
  - Para borrar un evento: Se requiere el identificador (ID) o el nombre del evento.
  
  Analiza el siguiente mensaje y extrae la intención y los parámetros relevantes.
  
  FORMATO DE RESPUESTA (RESPONDE SOLO EN FORMATO JSON, SIN BLOQUES DE CÓDIGO):
  {
    "accion": "consultar|agregar|editar|borrar",
    "parametros": {
      "titulo": "título del evento o null",
      "fecha": "fecha del evento o null",
      "fechaFin": "fecha fin para consultas de rango o null",
      "horaInicio": "hora de inicio o null",
      "horaFin": "hora de fin o null",
      "id": "id del evento si se menciona o null",
      "nuevoTitulo": "nuevo título en caso de edición o null"
    },
    "explicacion": "breve explicación de tu análisis"
  }
  
  MENSAJE: ${mensaje}
  
  HISTORIAL RECIENTE (si es relevante):
  ${historial.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    try {
      let cleanedResponse = response;
      if (response.includes("```json")) {
        cleanedResponse = response.replace(/```json\n|\n```/g, "");
      } else if (response.includes("```")) {
        cleanedResponse = response.replace(/```\n|\n```/g, "");
      }
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : cleanedResponse;
      return JSON.parse(jsonString);
    } catch (e) {
      console.error('Error al parsear respuesta JSON de Gemini:', e);
      console.log('Respuesta original:', response);
      return {
        accion: detectarAccionBasica(mensaje),
        parametros: extractParametrosBasicos(mensaje),
        explicacion: "Fallback: Detección básica por palabras clave"
      };
    }
  } catch (error) {
    console.error('Error al consultar Gemini:', error);
    return {
      accion: detectarAccionBasica(mensaje),
      parametros: extractParametrosBasicos(mensaje),
      explicacion: "Error en API: Detección básica"
    };
  }
};


// Función para ejecutar consulta
const ejecutarConsulta = (fechaInicio, fechaFin) => {
  return new Promise((resolve, reject) => {
    let fechaInicioReal = fechaInicio;
    let fechaFinReal = fechaFin || fechaInicio; // Si falta fecha final, se usa la misma fecha
    if (!fechaInicioReal) {
      const hoy = new Date().toISOString().split('T')[0];
      fechaInicioReal = hoy;
      fechaFinReal = hoy;
    }
    try {
      if (typeof calendarFuncs === 'undefined' || !calendarFuncs.consultarAgenda) {
        console.error('Error: calendarFuncs no está disponible o no tiene el método consultarAgenda');
        return resolve({
          status: 'success',
          eventos: [],
          mensaje: 'No se pudieron cargar los eventos. La funcionalidad de calendario no está disponible.'
        });
      }
      calendarFuncs.consultarAgenda(fechaInicioReal, fechaFinReal, (err, resultado) => {
        if (err) {
          console.error('Error al consultar agenda:', err);
          return reject(err);
        }
        resolve(resultado || { status: 'success', eventos: [] });
      });
    } catch (error) {
      console.error('Error al ejecutar consulta:', error);
      resolve({
        status: 'success',
        eventos: [],
        mensaje: 'Ocurrió un error al consultar los eventos.'
      });
    }
  });
};

/**
 * Métodos de fallback para detección básica
 */
const detectarAccionBasica = (texto) => {
  const textoNormalizado = texto.toLowerCase();
  if (/consulta|ver|muestra|lista/.test(textoNormalizado)) return 'consultar';
  if (/agrega|añade|crea|nuevo|agenda/.test(textoNormalizado)) return 'agregar';
  if (/edita|modifica|cambia|actualiza/.test(textoNormalizado)) return 'editar';
  if (/borra|elimina|cancela|quita/.test(textoNormalizado)) return 'borrar';
  return null;
};

const extractParametrosBasicos = (texto) => {
  const params = { titulo: null, fecha: null, horaInicio: null, horaFin: null, id: null };
  const fechaMatch = texto.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{1,2}-\d{1,2}-\d{2,4})/);
  if (fechaMatch) params.fecha = fechaMatch[0];
  const horaMatch = texto.match(/(\d{1,2}:\d{2})|(\d{1,2} ?(?:am|pm))/i);
  if (horaMatch) params.horaInicio = horaMatch[0];
  const tituloMatch = texto.match(/"([^"]+)"|'([^']+)'|llamad[oa] ([^,\.]+)|titulad[oa] ([^,\.]+)|nombrad[oa] ([^,\.]+)/);
  if (tituloMatch) {
    for (let i = 1; i < tituloMatch.length; i++) {
      if (tituloMatch[i]) {
        params.titulo = tituloMatch[i].trim();
        break;
      }
    }
  }
  return params;
};

/**
 * Funciones para ejecutar las acciones en la base de datos
 */
const ejecutarAgendamiento = (nombre, fecha, horaInicio, horaFin) => {
  return new Promise((resolve, reject) => {
    calendarFuncs.agendarEvento(nombre, fecha, horaInicio, horaFin, (err, resultado) => {
      if (err) return reject(err);
      resolve(resultado);
    });
  });
};

const ejecutarEdicion = async (id, nombreActual, fecha, horaInicio, horaFin, nuevoNombre) => {
  if (id) {
    return await calendarFuncs.editarEvento(id, nuevoNombre || nombreActual, fecha, horaInicio, horaFin);
  }
  return new Promise((resolve, reject) => {
    calendarFuncs.editarEventoPorNombre(
      nombreActual, 
      nuevoNombre || nombreActual, 
      fecha, 
      horaInicio, 
      horaFin, 
      (err, resultado) => {
        if (err) return reject(err);
        resolve(resultado);
      }
    );
  });
};

const ejecutarBorrado = async (id, nombre) => {
  if (id) {
    return await calendarFuncs.borrarEvento(id);
  }
  return new Promise((resolve, reject) => {
    calendarFuncs.borrarEventoPorNombre(nombre, (err, resultado) => {
      if (err) return reject(err);
      resolve(resultado);
    });
  });
};

/**
 * Busca eventos por criterios parciales
 */
const buscarEventos = async (parametros) => {
  const { titulo, fecha } = parametros;
  if (titulo) {
    try {
      const eventos = await calendarFuncs.buscarEventosPorNombre(titulo);
      if (fecha && eventos.length > 0) {
        return eventos.filter(e => e.fecha === fecha);
      }
      return eventos;
    } catch (error) {
      console.error('Error al buscar eventos por nombre:', error);
      throw error;
    }
  }
  if (fecha) {
    return new Promise((resolve, reject) => {
      calendarFuncs.consultarAgenda(fecha, fecha, (err, resultado) => {
        if (err) return reject(err);
        resolve(resultado.eventos || []);
      });
    });
  }
  return [];
};

/**
 * Maneja resultados de búsqueda cuando hay múltiples coincidencias
 */
const manejarResultadosBusqueda = (eventos, accion, parametros, userId, conversationContext) => {
  if (!eventos || eventos.length === 0) {
    return {
      status: 'error',
      mensaje: 'No encontré eventos que coincidan con tu descripción. ¿Podrías proporcionar más detalles?'
    };
  }
  
  if (eventos.length === 1) {
    const evento = eventos[0];
    conversationContext[userId].currentEventId = evento.id;
    if (accion === 'editar') {
      return {
        status: 'success',
        mensaje: `He encontrado el evento "${evento.nombre}" (${evento.fecha}, ${evento.hora_inicio}). ¿Qué detalles quieres modificar?`,
        pendingAction: 'editar_confirmado',
        datos: evento
      };
    } else if (accion === 'borrar') {
      return {
        status: 'success',
        mensaje: `He encontrado el evento "${evento.nombre}" (${evento.fecha}, ${evento.hora_inicio}). ¿Confirmas que quieres eliminarlo?`,
        pendingAction: 'borrar_confirmado',
        datos: evento
      };
    }
  }
  
  const opciones = eventos.slice(0, 5).map((e, i) => 
    `${i+1}. "${e.nombre}" (${e.fecha}, ${e.hora_inicio}-${e.hora_fin})`
  ).join('\n');
  
  conversationContext[userId].eventOptions = eventos.slice(0, 5);
  conversationContext[userId].pendingAction = `seleccionar_evento_para_${accion}`;
  
  return {
    status: 'success',
    mensaje: `He encontrado varios eventos que podrían coincidir. ¿A cuál te refieres?\n\n${opciones}\n\nPor favor, indica el número o proporciona más detalles.`,
    pendingAction: `seleccionar_evento_para_${accion}`,
    eventos: eventos.slice(0, 5)
  };
};

/**
 * Solicita información faltante al usuario en lenguaje natural
 */
const solicitarInformacionFaltante = (accion, parametros, userId, conversationContext) => {
  let mensajeSolicitud = '';
  let pendingAction = '';
  
  if (accion === 'consultar') {
    if (!parametros.fecha) {
      mensajeSolicitud = 'Para consultar eventos, por favor proporciona la fecha de inicio (YYYY-MM-DD).';
      pendingAction = 'espera_fecha_consulta';
    } else if (!parametros.fechaFin) {
      mensajeSolicitud = 'Si deseas un rango de fechas, por favor proporciona la fecha de fin (YYYY-MM-DD) o indica que se use la misma fecha.';
      pendingAction = 'espera_fecha_fin';
    }
  } else if (accion === 'agregar') {
    if (!parametros.titulo) {
      mensajeSolicitud = '¿Qué título o nombre quieres darle al evento?';
      pendingAction = 'espera_titulo';
    } else if (!parametros.fecha) {
      mensajeSolicitud = `Para el evento "${parametros.titulo}", ¿en qué fecha quieres agendarlo?`;
      pendingAction = 'espera_fecha';
    } else if (!parametros.horaInicio) {
      mensajeSolicitud = `Para el evento "${parametros.titulo}" del ${parametros.fecha}, ¿a qué hora iniciará?`;
      pendingAction = 'espera_hora';
    }
  } else if (accion === 'editar') {
    // Aquí se asume que ya se recibió el identificador (por ejemplo, en "titulo")
    mensajeSolicitud = `Para editar el evento "${parametros.titulo}", por favor proporciona los nuevos datos que deseas actualizar. Por ejemplo: nuevo título (si aplica), nueva fecha (YYYY-MM-DD), nueva hora de inicio (HH:MM) y nueva hora de fin (HH:MM).`;
    pendingAction = 'espera_nuevos_datos_editar';
  } else if (accion === 'borrar') {
    mensajeSolicitud = '¿Podrías especificar el identificador (ID) o el nombre actual del evento que deseas eliminar?';
    pendingAction = 'espera_identificador';
  }
  
  conversationContext[userId].pendingAction = pendingAction;
  conversationContext[userId].lastActionParams = parametros;
  conversationContext[userId].lastAction = accion;
  
  return {
    status: 'info',
    mensaje: mensajeSolicitud,
    pendingAction
  };
};


/**
 * Genera una respuesta en lenguaje natural basada en el resultado
 */
const generarRespuesta = async (accion, resultado, parametros) => {
  try {
    if (resultado.status === 'error') {
      return resultado.mensaje;
    }
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
    Genera una respuesta natural y amigable para un asistente de agenda llamado Sofía que acaba de:
    
    Acción: ${accion}
    Resultado: ${JSON.stringify(resultado)}
    Parámetros usados: ${JSON.stringify(parametros)}
    
    Reglas importantes:
    1. Sé breve y conciso (máximo 2-3 oraciones).
    2. Usa un tono conversacional amigable.
    3. No uses emojis excesivos (máximo 1).
    4. Incluye detalles relevantes como título, fecha y hora.
    5. NO añadas información que no esté en los datos proporcionados.
    6. NO uses palabras como "sistema" o "base de datos" en la respuesta.
    
    Respuesta:
    `;
    
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Error al generar respuesta natural:', error);
    const respuestas = {
      consultar: resultado.eventos && resultado.eventos.length > 0 
        ? `He encontrado ${resultado.eventos.length} evento(s) para la fecha solicitada.` 
        : 'No encontré eventos para la fecha solicitada.',
      agregar: resultado.status === 'success' 
        ? `He agendado el evento "${resultado.evento?.nombre}" para el ${resultado.evento?.fecha} a las ${resultado.evento?.hora_inicio}.` 
        : 'No pude agendar el evento.',
      editar: resultado.status === 'success' 
        ? `He actualizado el evento correctamente.` 
        : 'No pude actualizar el evento.',
      borrar: resultado.status === 'success' 
        ? 'El evento ha sido eliminado correctamente.' 
        : 'No pude eliminar el evento.'
    };
    return respuestas[accion] || 'He procesado tu solicitud.';
  }
};

/**
 * Actualiza el historial de conversación
 */
const actualizarHistorial = (userId, conversationContext, role, content) => {
  conversationContext[userId].history.push({ role, content });
  if (conversationContext[userId].history.length > 10) {
    conversationContext[userId].history = conversationContext[userId].history.slice(-10);
  }
};

/**
 * Función auxiliar para agregar duración a una hora
 */
const agregarDuracion = (hora, minutos) => {
  try {
    const [h, m] = hora.split(':').map(Number);
    let nuevosMinutos = m + minutos;
    let nuevasHoras = h + Math.floor(nuevosMinutos / 60);
    nuevosMinutos %= 60;
    nuevasHoras %= 24;
    return `${nuevasHoras.toString().padStart(2, '0')}:${nuevosMinutos.toString().padStart(2, '0')}`;
  } catch (e) {
    console.error('Error al calcular hora fin:', e);
    return null;
  }
};

module.exports = { universalController };
