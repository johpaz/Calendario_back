const { consultarAgenda } = require('../services/agenda');
const { parseFecha } = require('../helpers/dateHelpers');

const consultarHandler = async (mensaje, userId, context, saludo = '') => {
  console.log(mensaje);

  // Usar IA para entender mejor la fecha en lenguaje natural
  let fechas = parseFecha(mensaje);
  console.log(fechas);

  if (!fechas) {
    return {
      status: 'pending',
      mensaje: `${saludo}No entendí la fecha 🤔. ¿Puedes darme un rango como "del 10 al 15 de marzo" o una fecha como "hoy"?`
    };
  }

  const fechaInicio = fechas.inicio || fechas;
  const fechaFin = fechas.fin || fechas;

  // Mantener el contexto en lugar de eliminarlo inmediatamente
  context[userId] = { paso: 'consulta', fechaInicio, fechaFin };

  return new Promise((resolve) => {
    consultarAgenda(fechaInicio, fechaFin, (err, resultado) => {
      if (err) {
        resolve({
          status: 'error',
          mensaje: `${saludo}⚠️ Ocurrió un error al consultar la agenda. Inténtalo de nuevo más tarde.`
        });
      } else if (resultado.eventos.length === 0) {
        resolve({
          status: 'success',
          mensaje: `${saludo}📅 No tienes eventos programados entre ${fechaInicio} y ${fechaFin}. ¿Quieres agendar uno ahora? 😊`,
          eventos: []
        });
      } else {
        const eventosTexto = resultado.eventos.map(e => `📌 ${e.nombre} el ${e.fecha} a las ${e.hora_inicio}`).join("\n");
        resolve({
          status: 'success',
          mensaje: `${saludo}📅 Aquí están tus eventos entre ${fechaInicio} y ${fechaFin}:\n\n${eventosTexto}\n\n¿Qué más necesitas?`,
          eventos: resultado.eventos
        });
      }
    });
  });
};

module.exports = { consultarHandler };
