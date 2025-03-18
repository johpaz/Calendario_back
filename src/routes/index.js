const {Router}= require('express');
const db = require('../../database');
const {chatRoutes,transcribeAudioRoutes} = require('./chatRoutes');

router = Router();  


router.use('/chat', chatRoutes);
router.use('/transcribe', transcribeAudioRoutes);   

// Función que obtiene todos los eventos de la base de datos
const obtenerEventos = async () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM eventos', (err, rows) => {
        if (err) {
          console.error('Error en obtenerEventos:', err);
          return reject(err);
        }
        resolve(rows);
      });
    });
  };
  
  // Ruta GET que retorna todos los eventos
  router.get('/eventos', async (req, res) => {
    try {
      const eventos = await obtenerEventos();
      res.json(eventos);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener eventos' });
    }
  });
  

module.exports = router;
