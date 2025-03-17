const { consultarAgenda } = require('../services/agenda');
const { parseFecha } = require('../helpers/dateHelpers');

const consultarHandler = (mensaje, userId, context, saludo = '') => {
  console.log(mensaje);
  
  const fechas = parseFecha(mensaje);
  console.log(fechas);
  
  
  if (!fechas) {
    return {
      status: 'pending',
      mensaje: `${saludo}¿Para qué fechas deseas consultar la agenda? Dime un rango como "del 10 al 15 de marzo" o una fecha como "hoy".`
    };
  }

  const fechaInicio = fechas.inicio || fechas;
  const fechaFin = fechas.fin || fechas;
  
  // Limpiar el contexto si la consulta es exitosa
  delete context[userId];
  
  return new Promise((resolve) => {
    consultarAgenda(fechaInicio, fechaFin, (err, resultado) => {
      if (err) {
        resolve({
          status: 'error',
          mensaje: `${saludo}⚠️ Error al consultar la agenda. Por favor intenta nuevamente.`
        });
      } else if (resultado.eventos.length === 0) {
        resolve({
          status: 'success',
          mensaje: `${saludo}📅 No tienes eventos programados en el rango de ${fechaInicio} a ${fechaFin}. ¿Deseas agendar uno nuevo?`,
          eventos: []
        });
      } else {
        resolve({
          status: 'success',
          mensaje: `${saludo}📅 Estos son tus eventos programados entre ${fechaInicio} y ${fechaFin}:`,
          eventos: resultado.eventos
        });
      }
    });
  });
};

module.exports = { consultarHandler };
