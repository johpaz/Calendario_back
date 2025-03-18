const { GoogleGenerativeAI } = require('@google/generative-ai');
const calendarFuncs = require('../services/agenda');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Función para procesar la fecha en formato ISO (YYYY-MM-DD).
 * Reutiliza la misma lógica que en otros controladores.
 */
const procesarFecha = (fechaStr) => {
  if (!fechaStr) return null;
  try {
    const hoy = new Date();
    const hoyISO = hoy.toISOString().split('T')[0];
    const fechaLower = fechaStr.toLowerCase().trim();

    if (fechaLower.includes('hoy')) return hoyISO;
    if (fechaLower.includes('mañana')) {
      const manana = new Date(hoy);
      manana.setDate(hoy.getDate() + 1);
      return manana.toISOString().split('T')[0];
    }
    if (/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(fechaStr)) {
      const partes = fechaStr.split(/[\/\-\.]/);
      const dia = partes[0].padStart(2, '0');
      const mes = partes[1].padStart(2, '0');
      const anio = partes[2].length === 2 ? '20' + partes[2] : partes[2];
      return `${anio}-${mes}-${dia}`;
    }
    // Formato "19 de Marzo" o "19 de Marzo 2025"
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
      if (mes) return `${anio}-${mes}-${dia}`;
    }
    return fechaStr;
  } catch (e) {
    console.error('Error al procesar fecha:', e);
    return fechaStr;
  }
};

/**
 * Función para procesar la hora y devolverla en formato "HH:MM".
 */
const procesarHora = (horaStr) => {
  if (!horaStr) return null;
  try {
    if (horaStr.toLowerCase().includes('am') || horaStr.toLowerCase().includes('pm')) {
      const [hora, minuto] = horaStr.replace(/[^\d:]/g, '').split(':');
      let horaNum = parseInt(hora);
      if (horaStr.toLowerCase().includes('pm') && horaNum < 12) horaNum += 12;
      else if (horaStr.toLowerCase().includes('am') && horaNum === 12) horaNum = 0;
      return `${horaNum.toString().padStart(2, '0')}:${minuto || '00'}`;
    }
    if (/\d{1,2}:\d{2}/.test(horaStr)) {
      const [hora, minuto] = horaStr.split(':');
      return `${parseInt(hora).toString().padStart(2, '0')}:${minuto}`;
    }
    if (/^\d{1,2}$/.test(horaStr)) return `${parseInt(horaStr).toString().padStart(2, '0')}:00`;
    return horaStr;
  } catch (e) {
    console.error('Error al procesar hora:', e);
    return horaStr;
  }
};

/**
 * Genera una respuesta natural para confirmar el agendamiento usando Gemini.
 */
const generarRespuestaAgregar = async (resultado) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
      Eres Sofía, un asistente de agenda muy amigable.
      Acabas de agendar un evento.
      Resultado: ${JSON.stringify(resultado)}.
      Genera una respuesta breve y natural confirmando el agendamiento con los detalles del evento.
      Respuesta:
    `;
    const res = await model.generateContent(prompt);
    return res.response.text().trim();
  } catch (error) {
    console.error('Error al generar respuesta con Gemini en agregar:', error);
    return `El evento ha sido agendado.`;
  }
};

/**
 * Controlador para agregar un evento.
 * Si el título no se provee, se utiliza "Evento sin título" por defecto.
 */
const handleAgregar = async (parametros, userId, conversationContext) => {
  // Si no se provee título, se asigna un valor por defecto.
  if (!parametros.nombre) {
    parametros.nombre = "Evento sin título";
  }
  
  // Se verifica que se tenga la fecha y la hora de inicio.
  if (!parametros.nombre || !parametros.fecha || !parametros.horaInicio) {
    conversationContext[userId].pendingAction = 'espera_datos_agregar';
    return {
      status: 'info',
      mensaje: 'Para agregar un evento, necesito al menos el nombre , fecha y la hora de inicio. Por favor proporciona esos datos.',
      pendingAction: 'espera_datos_agregar'
    };
  }
  
  const fecha = procesarFecha(parametros.fecha);
  const horaInicio = procesarHora(parametros.horaInicio);
  
  // Si no se provee hora final, se establece por defecto una duración de 1 hora.
  let horaFin = parametros.horaFin ? procesarHora(parametros.horaFin) : null;
  if (!horaFin && horaInicio) {
    const [h, m] = horaInicio.split(':').map(Number);
    let nuevaHora = h + 1;
    if (nuevaHora >= 24) nuevaHora -= 24;
    horaFin = `${nuevaHora.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
  
  try {
    const resultado = await calendarFuncs.agendarEvento(parametros.nombre, fecha, horaInicio, horaFin);
    const respuesta = await generarRespuestaAgregar(resultado);
    return {
      status: resultado.status,
      mensaje: respuesta,
      eventos: [resultado.evento]
    };
  } catch (error) {
    console.error('Error en handleAgregar:', error);
    return {
      status: 'error',
      mensaje: 'Ocurrió un error al agendar el evento.'
    };
  }
};

module.exports = { handleAgregar };
