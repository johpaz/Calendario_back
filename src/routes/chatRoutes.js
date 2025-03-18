const {Router}= require('express');
const {chatHandler, transcribeAudio,upload} = require('../handler/chatHandler');

const chatRoutes = Router();
const transcribeAudioRoutes = Router();

chatRoutes.post('/', chatHandler);
transcribeAudioRoutes.post('/',upload.single('audio'), transcribeAudio);

module.exports = {
    chatRoutes,
    transcribeAudioRoutes
}