const {Router}= require('express');
const {chatHandler, transcribeAudio} = require('../handler/chatHandler');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });


const chatRoutes = Router();
const transcribeAudioRoutes = Router();

chatRoutes.post('/', chatHandler);
transcribeAudioRoutes.post('/',upload.single('audio'), transcribeAudio);

module.exports = {
    chatRoutes,
    transcribeAudioRoutes
}