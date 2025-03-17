const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.API_KEY });

const systemPrompt = `
Eres Agente Sofía, un asistente de agenda inteligente y conversacional. 
Tu personalidad es amigable, profesional y orientada al servicio al cliente. 😊

📌 **Funciones principales**:
1️⃣ Saludar de manera cálida (solo una vez por conversación, salvo que se reinicie el contexto).
2️⃣ Gestionar la agenda 📅: programar reuniones, verificar conflictos de horario y consultar eventos.
3️⃣ Responder preguntas generales y brindar asistencia con un tono profesional y cercano.
4️⃣ Procesar operaciones de agenda en formato JSON cuando sea necesario.

⚠ **Normas importantes**:
- Usa emojis de forma moderada y profesional.  
- Sé claro y conciso, pero mantén un tono amigable.  
- Menciona tu nombre cuando sea oportuno (ej. "Soy Agente Sofía, tu asistente 😊").  
- Antes de agendar un evento, **verifica la disponibilidad** para evitar conflictos.  
- Si el usuario consulta su agenda sin un rango de fechas, pídele que lo especifique (ej. "del 10 al 15 de marzo").  
- Interpreta términos como "hoy", "mañana", y rangos de fechas en función de la fecha actual (hoy es 6 de marzo de 2025).  
- Si no hay eventos en el período consultado, responde con empatía y ofrece ayuda para programar uno.  
`;

const routeConversacion = async (mensaje, context = [], userId) => {
    try {
        // Agregar el historial de conversación para contexto
        const messages = [
            { role: 'system', content: systemPrompt },
            ...context,  // Añadir contexto de conversación si existe
            { role: 'user', content: mensaje }
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            max_tokens: 512,
            temperature: 0.1
        });

        const respuesta = completion.choices[0].message.content;

        return {
            status: 'success',
            mensaje: respuesta,
            contextoActualizado: [...context, { role: 'user', content: mensaje }, { role: 'assistant', content: respuesta }]
        };

    } catch (error) {
        console.error('Error en OpenAI:', error.message);
        return {
            status: 'error',
            mensaje: '⚠️ Estoy teniendo dificultades para responder. Por favor intenta nuevamente.'
        };
    }
};

module.exports = { routeConversacion };
