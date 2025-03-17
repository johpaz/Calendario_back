const {Router}= require('express');

const {chatRoutes,transcribeAudioRoutes} = require('./chatRoutes');

router = Router();  


router.use('/chat', chatRoutes);
router.use('/transcribe', transcribeAudioRoutes);   

module.exports = router;
