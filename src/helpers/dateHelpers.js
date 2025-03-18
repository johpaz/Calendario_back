// helpers/dateHelpers.js

// Función para remover acentos de una cadena.
function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Función para formatear una fecha en YYYY-MM-DD
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Diccionario de meses
const meses = {
  'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
  'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
  'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
};

// Función para interpretar fechas en lenguaje natural
function parseFecha(texto, baseDate = new Date()) {
  texto = texto.toLowerCase().trim();

  if (texto.includes('hoy')) return formatDate(baseDate);
  if (texto.includes('mañana')) {
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }

  // Rango de fechas: "del 10 al 15 de marzo"
  const rangoPattern = /del\s+(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/;
  const rangoMatch = texto.match(rangoPattern);
  if (rangoMatch) {
    const diaInicio = rangoMatch[1].padStart(2, '0');
    const diaFin = rangoMatch[2].padStart(2, '0');
    const mes = meses[rangoMatch[3]];
    const year = rangoMatch[4] || String(baseDate.getFullYear());
    return { inicio: `${year}-${mes}-${diaInicio}`, fin: `${year}-${mes}-${diaFin}` };
  }

  // Fecha única: "el 23 de marzo"
  const singlePattern = /(?:el\s+)?(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/;
  const singleMatch = texto.match(singlePattern);
  if (singleMatch) {
    const dia = singleMatch[1].padStart(2, '0');
    const mes = meses[singleMatch[2]];
    const year = singleMatch[3] || String(baseDate.getFullYear());
    return `${year}-${mes}-${dia}`;
  }

  return null;
}
function parseFecha(texto, baseDate = new Date()) {
  // Validar entrada
  if (!texto || typeof texto !== 'string') return null;

  texto = texto.toLowerCase().trim();

  // Mantener el resto de la lógica igual...
  // [El código existente aquí]
}
const procesarFecha = (fechaStr) => {
  try {
    if (!fechaStr) return new Date().toISOString().split('T')[0]; // Fecha actual por defecto
    return formatDate(parseFecha(fechaStr));
  } catch (e) {
    console.error('Error procesando fecha:', e);
    return null;
  }
};

// Función para interpretar horas en formato "10:30 am"
function parseHora(texto) {
  const regex = /^(?:a\s+las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/;
  const match = texto.match(regex);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  let minutes = match[2] || "00";
  const meridiem = match[3];

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:${minutes}`;
}

// Función para interpretar duraciones "2 horas"
function parseDuration(texto) {
  const regex = /(\d+)\s*(hora|horas|h)/;
  const match = texto.match(regex);
  return match ? parseInt(match[1], 10) : 1;
}

module.exports = { removeAccents, formatDate, procesarFecha, parseFecha, parseHora, parseDuration };
