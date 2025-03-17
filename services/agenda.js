const db = require('../database');

function hayConflicto(fecha, horaInicio, horaFin, excludeId = null, callback) {
  const inicioNuevo = new Date(`${fecha}T${horaInicio}`);
  const finNuevo = new Date(`${fecha}T${horaFin}`);

  let query = 'SELECT * FROM eventos WHERE fecha = ?';
  let params = [fecha];
  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }

  dataBase.all(query, params, (err, rows) => {
    if (err) return callback(err);
    const conflicto = rows.some(evento => {
      const inicioExistente = new Date(`${evento.fecha}T${evento.hora_inicio}`);
      const finExistente = new Date(`${evento.fecha}T${evento.hora_fin}`);
      return inicioNuevo < finExistente && finNuevo > inicioExistente;
    });
    callback(null, conflicto);
  });
}

function agendarEvento(nombre, fecha, horaInicio, horaFin, callback) {
  hayConflicto(fecha, horaInicio, horaFin, null, (err, conflicto) => {
    if (err) return callback(err);
    if (conflicto) {
      return callback(null, { status: 'error', mensaje: 'Conflicto de horario detectado.' });
    }
    db.run(
      'INSERT INTO eventos (nombre, fecha, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)',
      [nombre, fecha, horaInicio, horaFin],
      function (err) {
        if (err) return callback(err);
        callback(null, {
          status: 'success',
          mensaje: 'Reunión agendada con éxito.',
          evento: { id: this.lastID, nombre, fecha, hora_inicio: horaInicio, hora_fin: horaFin }
        });
      }
    );
  });
}
function consultarAgenda(fechaInicio, fechaFin, callback) {
    const sql = 'SELECT * FROM eventos WHERE fecha BETWEEN ? AND ?';
    db.all(sql, [fechaInicio, fechaFin], (err, rows) => {
      if (err) return callback(err);
      callback(null, { status: 'success', mensaje: 'Eventos encontrados.', eventos: rows });
    });
  }
  


function editarEventoPorNombre(nombreActual, nuevoNombre, fecha, horaInicio, horaFin, callback) {
  // Primero se busca el evento por nombre
  db.get('SELECT * FROM eventos WHERE nombre = ?', [nombreActual], (err, evento) => {
    if (err) return callback(err);
    if (!evento) {
      return callback(null, { status: 'error', mensaje: 'Evento no encontrado.' });
    }
    // Se chequea si los nuevos datos generan conflicto, ignorando el evento actual (mediante su id)
    hayConflicto(fecha, horaInicio, horaFin, evento.id, (err, conflicto) => {
      if (err) return callback(err);
      if (conflicto) {
        return callback(null, { status: 'error', mensaje: 'Conflicto de horario detectado.' });
      }
      // Se actualiza el evento usando su id (en la cláusula WHERE)
      db.run(
        'UPDATE eventos SET nombre = ?, fecha = ?, hora_inicio = ?, hora_fin = ? WHERE id = ?',
        [nuevoNombre, fecha, horaInicio, horaFin, evento.id],
        function (err) {
          if (err) return callback(err);
          if (this.changes === 0) {
            return callback(null, { status: 'error', mensaje: 'Evento no encontrado.' });
          }
          callback(null, {
            status: 'success',
            mensaje: 'Evento editado con éxito.',
            evento: { id: evento.id, nombre: nuevoNombre, fecha, hora_inicio: horaInicio, hora_fin: horaFin }
          });
        }
      );
    });
  });
}

// Función para buscar un evento por nombre (búsqueda parcial)
const buscarEventosPorNombre = async (nombre) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM eventos WHERE nombre LIKE ?',
      [`%${nombre}%`],
      (err, rows) => {
        if (err) {
          console.error('Error en buscarEventosPorNombre:', err);
          return reject(err);
        }
        resolve(rows);
      }
    );
  });
};

// Función para editar un evento (por búsqueda parcial de nombre)
const editarEvento = async (id, nuevoNombre, fecha, horaInicio, horaFin) => {

  
  return new Promise((resolve, reject) => {
    // Buscamos el evento por su id
    db.get('SELECT * FROM eventos WHERE id = ?', [id], (err, evento) => {
      if (err) return reject(err);
      if (!evento) {
        return resolve({ status: 'error', mensaje: 'Evento no encontrado.' });
      }
      // Aquí podrías agregar una verificación de conflictos, si lo deseas.
      db.run(
        'UPDATE eventos SET nombre = ?, fecha = ?, hora_inicio = ?, hora_fin = ? WHERE id = ?',
        [nuevoNombre, fecha, horaInicio, horaFin, id],
        function (err) {
          if (err) return reject(err);
          if (this.changes === 0) {
            return resolve({ status: 'error', mensaje: 'No se actualizó el evento.' });
          }
          resolve({
            status: 'success',
            mensaje: 'Evento editado con éxito.',
            evento: { id, nombre: nuevoNombre, fecha, hora_inicio: horaInicio, hora_fin: horaFin }
          });
        }
      );
    });
  });
};



const borrarEvento = async (idEvento) => {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM eventos WHERE id = ?',
      [idEvento],
      function (err) {
        if (err) {
          console.error('Error en borrarEvento:', err);
          return reject(err);
        }
        if (this.changes === 0) {
          return reject(new Error('No se encontró el evento'));
        }
        resolve({ success: true, changes: this.changes });
      }
    );
  });
};



function borrarEventoPorNombre(nombre, callback) {
  db.get('SELECT * FROM eventos WHERE nombre = ?', [nombre], (err, evento) => {
    if (err) return callback(err);
    if (!evento) return callback(null, { status: 'error', mensaje: 'Evento no encontrado.' });
    db.run('DELETE FROM eventos WHERE id = ?', [evento.id], function (err) {
      if (err) return callback(err);
      if (this.changes === 0) return callback(null, { status: 'error', mensaje: 'Evento no encontrado.' });
      callback(null, { status: 'success', mensaje: 'Evento borrado con éxito.' });
    });
  });
}


module.exports = { agendarEvento, consultarAgenda, editarEventoPorNombre, borrarEventoPorNombre,buscarEventosPorNombre,
  borrarEvento,editarEvento
}