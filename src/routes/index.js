const {Router}= require('express');
const {chatRoutes,transcribeAudioRoutes} = require('./chatRoutes');
const Evento = require("../../database");
router = Router();  


router.use('/chat', chatRoutes);
router.use('/transcribe', transcribeAudioRoutes);   

const express = require("express");



// Función que obtiene todos los eventos de la base de datos
const obtenerEventos = async () => {
  try {
    return await Evento.find();
  } catch (error) {
    console.error("Error en obtenerEventos:", error);
    throw error;
  }
};

// Ruta GET que retorna todos los eventos
router.get("/eventos", async (req, res) => {
  try {
    const eventos = await obtenerEventos();
    res.json(eventos);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener eventos" });
  }
});

module.exports = router;
