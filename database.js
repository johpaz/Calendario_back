const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URL_ONLINE 

// Conectar a MongoDB sin opciones innecesarias
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch(err => console.error("❌ Error al conectar a MongoDB:", err));

// Definir el esquema de eventos
const eventoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  fecha: { type: String, required: true },
  hora_inicio: { type: String, required: true },
  hora_fin: { type: String, required: true }
});

// Crear el modelo "Evento"
const Evento = mongoose.model("Evento", eventoSchema);

// Insertar eventos iniciales si la colección está vacía
(async () => {
  const count = await Evento.countDocuments();
  if (count === 0) {
    await Evento.insertMany([
      { nombre: "Llamada con cliente", fecha: "2025-03-10", hora_inicio: "13:30", hora_fin: "14:30" },
      { nombre: "Revisión de código", fecha: "2025-03-10", hora_inicio: "15:00", hora_fin: "16:00" }
    ]);
    console.log("📅 Eventos iniciales cargados en MongoDB.");
  }
})();

module.exports = Evento;
