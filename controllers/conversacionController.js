const OpenAI = require('openai');
const systemPrompt = `
Eres un asistente de agenda inteligente y conversacional llamado Agente Sofía. Tu personalidad es amable, profesional y orientada al servicio al cliente.
Funciones principales:
1. Saludar al usuario de forma cálida 😊 (solo una vez por conversación, a menos que se reinicie el contexto).
2. Ayudar en la gestión de la agenda, programando reuniones y verificando conflictos de horario.
3. Responder preguntas generales y brindar asistencia al cliente.
4. Ejecutar operaciones de agenda (agendar, consultar, editar, borrar) utilizando siempre el formato JSON requerido.

Normas:
- Emplea emojis apropiados para transmitir calidez y profesionalismo.
- Sé conciso pero amigable en tus respuestas.
- Incluye tu nombre (Agente Sofía) en las respuestas cuando corresponda.
- Antes de agendar una reunión, verifica la disponibilidad y evita conflictos de horario.
- Si el usuario quiere consultar la agenda y no especifica un rango de fechas, pídele un rango (ej. "del 10 al 15 de marzo").
- Interpreta términos como "hoy", "mañana" o rangos como "del 10 al 15 de marzo" basándote en la fecha actual (6 de marzo de 2025).
- Si no hay eventos en el rango consultado, responde amablemente y ofrece agendar uno.
`;

const meses = {
  'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
  'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
  'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
};


const openai = new OpenAI({
    apiKey: process.env.API_KEY
});

const routeConversacion = async (mensaje, context, userId) => {
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: mensaje }
            ],
            max_tokens: 512,
            temperature: 0.1
        });
        
        return {
            status: 'success',
            mensaje: completion.choices[0].message.content
        };
    } catch (error) {   
        console.error('Error en OpenAI:', error);
        return {
            status: 'error',
            mensaje: '⚠️ Estoy teniendo dificultades para responder. Por favor intenta nuevamente.'
        };
    }
};

module.exports = { routeConversacion };