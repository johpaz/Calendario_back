const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.API_KEY });
const os = require('os');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);



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
  

  const transcribeAudio = async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ status: 'error', mensaje: 'No se recibió archivo de audio.' });
      }
  
      // Guardar el buffer del archivo en un directorio temporal (/tmp)
      const tempDir = os.tmpdir();
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const originalPath = path.join(tempDir, `audio-${uniqueSuffix}`);
      await fs.promises.writeFile(originalPath, req.file.buffer);
  
      const outputPath = `${originalPath}.wav`;
  
      // Convertir el audio a WAV usando ffmpeg
      ffmpeg(originalPath)
        .toFormat('wav')
        .on('end', async () => {
          try {
            const transcriptionResponse = await openai.audio.transcriptions.create({
              file: fs.createReadStream(outputPath),
              model: 'whisper-1'
            });
  
            // Eliminar los archivos temporales
            fs.unlink(originalPath, (err) => { if (err) console.error('Error eliminando el archivo original:', err); });
            fs.unlink(outputPath, (err) => { if (err) console.error('Error eliminando el archivo convertido:', err); });
  
            const transcribedText = transcriptionResponse.text;
            console.log('Transcripción:', transcribedText);
  
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
    transcribeAudio,
    chatHandler
 };
