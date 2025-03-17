// helpers/dateHelpers.js

// Función para remover acentos de una cadena.
function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const meses = {
  'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
  'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
  'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
};
function parseFecha(texto, baseDate = new Date('2025-03-06')) {
  texto = texto.toLowerCase().trim();
  if (texto.includes('hoy')) return formatDate(baseDate);
  if (texto.includes('mañana')) {
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }
  const rangoPattern1 = /del\s+(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/;
  const rangoMatch1 = texto.match(rangoPattern1);
  if (rangoMatch1) {
    const diaInicio = rangoMatch1[1].padStart(2, '0');
    const diaFin = rangoMatch1[2].padStart(2, '0');
    const mes = meses[rangoMatch1[3]];
    const year = rangoMatch1[4] ? rangoMatch1[4] : String(baseDate.getFullYear());
    return { inicio: `${year}-${mes}-${diaInicio}`, fin: `${year}-${mes}-${diaFin}` };
  }
  const singlePattern = /(?:el\s+)?(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/;
  const singleMatch = texto.match(singlePattern);
  if (singleMatch) {
    const dia = singleMatch[1].padStart(2, '0');
    const mes = meses[singleMatch[2]];
    const year = singleMatch[3] ? singleMatch[3] : String(baseDate.getFullYear());
    return `${year}-${mes}-${dia}`;
  }
  return null;
}

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

function parseDuration(texto) {
  const regex = /(\d+)\s*(hora|horas|h)/;
  const match = texto.match(regex);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1;
}

module.exports = { removeAccents, formatDate, parseFecha, parseHora, parseDuration };
