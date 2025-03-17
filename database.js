const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Asegurarse de que el directorio db exista
const dbDir = path.join(__dirname, '../db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const dbPath = path.join(dbDir, 'agenda.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos:', err.message);
  } else {
    console.log('Conexión a la base de datos establecida.');
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      fecha TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL
    )
  `);

  db.get('SELECT COUNT(*) as count FROM eventos', (err, row) => {
    if (err) {
      console.error('Error al verificar la tabla:', err.message);
      return;
    }
    if (row.count === 0) {
      const stmt = db.prepare('INSERT INTO eventos (nombre, fecha, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)');
      stmt.run('Llamada con cliente', '2025-03-10', '13:30', '14:30');
      stmt.run('Revisión de código', '2025-03-10', '15:00', '16:00');
      stmt.finalize();
      console.log('Agenda inicial cargada.');
    }
  });
});

module.exports = db;