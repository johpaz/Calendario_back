const { GoogleGenerativeAI } = require('@google/generative-ai');
const calendarFuncs = require('../services/agenda');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Procesa una fecha a formato ISO (YYYY-MM-DD).
 * Ahora admite formatos como "19 de Marzo" (con o sin año).
 */
const procesarFecha = (fechaStr) => {
  if (!fechaStr) return null;
  try {
    const hoy = new Date();
    const hoyISO = hoy.toISOString().split('T')[0];
    
    const fechaLower = fechaStr.toLowerCase().trim();

    // Manejar expresiones relativas
    if (fechaLower.includes('hoy')) {
      return hoyISO;
    }
    if (fechaLower.includes('mañana')) {
      const manana = new Date(hoy);
      manana.setDate(hoy.getDate() + 1);
      return manana.toISOString().split('T')[0];
    }
    
    // Manejar formato numérico con separadores (ej. 19/03/2025, 19-03-2025)
    if (/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(fechaStr)) {
      const partes = fechaStr.split(/[\/\-\.]/);
      // Suponemos formato día-mes-año
      const dia = partes[0].padStart(2, '0');
      const mes = partes[1].padStart(2, '0');
      const anio = partes[2].length === 2 ? '20' + partes[2] : partes[2];
      return `${anio}-${mes}-${dia}`;
    }
    
    // Manejar formato "19 de Marzo" o "19 de Marzo 2025"
    const regexMes = /(\d{1,2})\s*de\s*([a-záéíóúñ]+)(?:\s*(\d{4}))?/i;
    const match = fechaStr.match(regexMes);
    if (match) {
      const dia = match[1].padStart(2, '0');
      const mesNombre = match[2].toLowerCase();
      const anio = match[3] ? match[3] : hoy.getFullYear();
      const meses = {
        "enero": "01",
        "febrero": "02",
        "marzo": "03",
        "abril": "04",
        "mayo": "05",
        "junio": "06",
        "julio": "07",
        "agosto": "08",
        "septiembre": "09",
        "setiembre": "09",
        "octubre": "10",
        "noviembre": "11",
        "diciembre": "12"
      };
      const mes = meses[mesNombre];
      if (mes) {
        return `${anio}-${mes}-${dia}`;
      }
    }
    
    // Si no coincide ningún formato, se retorna la cadena original
    return fechaStr;
  } catch (e) {
    console.error('Error al procesar fecha:', e);
    return fechaStr;
  }
};

/**
 * Procesa una hora y la devuelve en formato "HH:MM".
 */
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
 * Genera una respuesta natural para la consulta usando Gemini.
 */
const generarRespuestaConsulta = async (resultado, fechaInicio, fechaFin) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
      Eres Sofía, un asistente de agenda muy amigable.
      Acabas de consultar los eventos desde el ${fechaInicio} hasta el ${fechaFin}.
      Resultado obtenido: ${JSON.stringify(resultado)}.
      Genera una respuesta breve y natural (2-3 oraciones) mencionando la cantidad de eventos encontrados y, de haber alguno, sus detalles principales.
      Respuesta:
    `;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Error al generar respuesta con Gemini en consulta:', error);
    const cant = resultado.eventos ? resultado.eventos.length : 0;
    return `He encontrado ${cant} evento(s) entre el ${fechaInicio} y el ${fechaFin}.`;
  }
};

/**
 * Controlador independiente para la acción "consulta".
 * Permite buscar por:
 *  - Nombre (parámetro "titulo")
 *  - Una sola fecha (parámetro "fecha" sin "fechaFin")
 *  - Rango de fechas (parámetros "fecha" y "fechaFin")
 *  - Horario específico del día (parámetro "horaInicio" o "horaFin", junto con "fecha")
 */
const handleConsulta = async (parametros, userId, conversationContext) => {
  try {
    // Consulta por nombre (búsqueda por título)
    if (parametros.titulo) {
      const eventos = await calendarFuncs.buscarEventosPorNombre(parametros.titulo);
      if (!eventos || eventos.length === 0) {
        return {
          status: 'success',
          mensaje: `No se encontraron eventos con el nombre "${parametros.titulo}".`,
          eventos: []
        };
      }
      const fechaReferencia = parametros.fecha ? procesarFecha(parametros.fecha) : 'sin fecha';
      const respuesta = await generarRespuestaConsulta({ eventos }, fechaReferencia, fechaReferencia);
      return {
        status: 'success',
        mensaje: respuesta,
        eventos
      };
    }
    
    // Consulta por horario específico: requiere al menos una fecha
    if ((parametros.horaInicio || parametros.horaFin) && parametros.fecha) {
      const fecha = procesarFecha(parametros.fecha);
      let eventos = await calendarFuncs.buscarEventosPorFecha(fecha);
      if (parametros.horaInicio) {
        const horaInicio = procesarHora(parametros.horaInicio);
        eventos = eventos.filter(e => e.hora_inicio === horaInicio);
      }
      if (parametros.horaFin) {
        const horaFin = procesarHora(parametros.horaFin);
        eventos = eventos.filter(e => e.hora_fin === horaFin);
      }
      const respuesta = await generarRespuestaConsulta({ eventos }, fecha, fecha);
      return {
        status: 'success',
        mensaje: respuesta,
        eventos
      };
    }
    
    // Consulta por una sola fecha
    if (parametros.fecha && !parametros.fechaFin) {
      const fecha = procesarFecha(parametros.fecha);
      const eventos = await calendarFuncs.buscarEventosPorFecha(fecha);
      const respuesta = await generarRespuestaConsulta({ eventos }, fecha, fecha);
      return {
        status: 'success',
        mensaje: respuesta,
        eventos
      };
    }
    
    // Consulta por rango de fechas
    if (parametros.fecha && parametros.fechaFin) {
      const fechaInicio = procesarFecha(parametros.fecha);
      const fechaFin = procesarFecha(parametros.fechaFin);
      const resultado = await calendarFuncs.consultarAgenda(fechaInicio, fechaFin);
      // Asegurarse que solo se incluyan los eventos dentro del rango
      const eventosFiltrados = resultado.eventos.filter(e => {
        return e.fecha >= fechaInicio && e.fecha <= fechaFin;
      });
      const respuesta = await generarRespuestaConsulta({ eventos: eventosFiltrados }, fechaInicio, fechaFin);
      return {
        status: 'success',
        mensaje: respuesta,
        eventos: eventosFiltrados
      };
    }
    
    // Si no se proporciona información suficiente, se solicita al usuario
    conversationContext[userId].pendingAction = 'espera_fecha_consulta';
    return {
      status: 'info',
      mensaje: 'Para consultar eventos, por favor proporciona una fecha, un rango de fechas o el nombre del evento.',
      pendingAction: 'espera_fecha_consulta'
    };
  } catch (error) {
    console.error('Error en handleConsulta:', error);
    return {
      status: 'error',
      mensaje: 'Ocurrió un error al consultar los eventos.'
    };
  }
};

module.exports = { handleConsulta };
