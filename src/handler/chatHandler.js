const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const multer = require('multer');
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.API_KEY });
const { routeInput } = require('../middleware/router');

// Configuración de Multer para guardar archivos en la carpeta "uploads/"
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    // Puedes conservar el nombre original o asignar uno fijo, por ejemplo, "audio.mp3"
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

const chatHandler = async (req, res) => {
    const { mensaje } = req.body;
  
    if (!mensaje) {
      return res.json({ status: 'error', mensaje: 'Envía un mensaje, ¡soy Agente Sofía y quiero ayudarte! 😊' });
    }
  
    try {
      const respuesta = await routeInput(mensaje);
      res.json(respuesta);
    } catch (err) {
      console.error('Error detallado:', err);
      res.json({ status: 'error', mensaje: `Error procesando la solicitud, lo siento 😔. Detalle: ${err.message}` });
    }
  };
  

// Función para transcribir el audio
const transcribeAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', mensaje: 'No se recibió archivo de audio.' });
    }

    const originalPath = path.join(__dirname, '../uploads', req.file.filename);
    console.log("Archivo original:", originalPath);
    
    const outputPath = `${originalPath}.wav`;

    // Convertir el audio a WAV usando ffmpeg
    ffmpeg(originalPath)
      .toFormat('wav')
      .on('end', async () => {
        try {
          // Realizar la transcripción con el modelo Whisper-1 de OpenAI
          const transcriptionResponse = await openai.audio.transcriptions.create({
            file: fs.createReadStream(outputPath),
            model: 'whisper-1'
          });

          // Eliminar archivos temporales
          fs.unlink(originalPath, (err) => { if (err) console.error('Error eliminando el archivo original:', err); });
          fs.unlink(outputPath, (err) => { if (err) console.error('Error eliminando el archivo convertido:', err); });

          const transcribedText = transcriptionResponse.text;
          console.log('Transcripción:', transcribedText);

          // Procesar la transcripción a través del router para obtener la respuesta de la agenda
          const respuesta = await routeInput(transcribedText);
          res.json({
            status: 'success',
            transcribedText,
            response: respuesta
          });
        } catch (err) {
          console.error('Error en la transcripción:', err);
          res.status(500).json({ status: 'error', mensaje: 'Error en la transcripción.', error: err.message });
        }
      })
      .on('error', (err) => {
        console.error('Error al convertir el audio:', err);
        res.status(500).json({ status: 'error', mensaje: 'Error al convertir el audio.', error: err.message });
      })
      .save(outputPath);
  } catch (err) {
    console.error('Error en el handler de transcripción:', err);
    res.status(500).json({ status: 'error', mensaje: 'Error en la transcripción.', error: err.message });
  }
};

module.exports = { 
    transcribeAudio, upload,
    chatHandler
 };
