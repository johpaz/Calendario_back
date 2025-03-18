// helpers/fuzzyHelpers.js

/**
 * Función para calcular la similitud entre dos textos.
 * Puedes usar una librería como RapidFuzz o fuzzywuzzy.
 * Aquí se muestra una implementación muy simple para ilustrar.
 */
function calcularSimilitud(texto1, texto2) {
    texto1 = texto1.toLowerCase();
    texto2 = texto2.toLowerCase();
    return texto2.includes(texto1) ? 100 : 0;
  }
  
  module.exports = { calcularSimilitud };
  