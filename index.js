const express = require('express');
const cors = require('cors');
require('dotenv').config();
const index = require('./src/routes/index');
const bodyParser = require("body-parser");

const app = express();


// Configuración general
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configura body-parser con un límite de 10 MB (ajusta según tus necesidades)
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true}));


// Rutas
app.use('/', index);



app.listen(3000, () => {
  console.log('Servidor corriendo en puerto 3000');
});
