const express = require('express');
const cors = require('cors');
require('dotenv').config();
const index = require('./routes/index');

const app = express();
app.use(cors());
app.use(express.json());



// Configuración general
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Rutas
app.use('/', index);



app.listen(3000, () => {
  console.log('Servidor corriendo en puerto 3000');
});
