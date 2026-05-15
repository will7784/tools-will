const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Cargar pdf-to-img de forma lazy (ESM) para evitar crash en arranque
let pdfToImg = null;
async function getPdfToImg() {
    if (!pdfToImg) {
        pdfToImg = await import('pdf-to-img');
    }
    return pdfToImg;
}

app.use(express.json({ limit: '50mb' }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname)));

function buildPrompt(ocrText) {
    return `A continuación te paso el texto extraído por OCR de una cartola bancaria. Tu tarea es analizarlo y extraer TODOS los movimientos individuales.

TEXTO OCR EXTRAÍDO:
---
${ocrText}
---

Devuélveme EXCLUSIVAMENTE un JSON con esta estructura exacta (sin markdown, sin explicaciones, solo el JSON puro):

{
  "movimientos": [
    {
      "fecha": "dd/mm/aaaa",
      "comentario": "descripción del movimiento",
      "tipo": "CARGO|CHEQUE|ABONO|DEPOSITO",
      "numero_mov": "número",
      "monto": 12345,
      "saldo_despues": 123456
    }
  ]
}

REGLAS CRÍTICAS PARA DETERMINAR tipo, numero_mov Y saldo_despues:

1. IDENTIFICAR CARGO vs ABONO:
   La cartola tiene DOS COLUMNAS separadas: "Cargos (CLP)" y "Abonos (CLP)".
   - Si el monto aparece en la columna de CARGOS (salida de dinero) → tipo = "CARGO" o "CHEQUE"
   - Si el monto aparece en la columna de ABONOS (entrada de dinero) → tipo = "ABONO" o "DEPOSITO"
   - NO asumas que "PAGO" siempre es cargo. Un "PAGO RECIBIDO" o "TRASPASO DESDE..." puede ser ABONO.
   - "TRASPASO A..." generalmente es CARGO (salida).
   - "TRASPASO DESDE..." o "TRASPASO DE..." generalmente es ABONO (entrada).
   - Revisa el saldo después de cada fila: si el saldo SUBIÓ respecto a la fila anterior, ese movimiento es ABONO/DEPOSITO. Si el saldo BAJÓ, es CARGO/CHEQUE.

2. ABONOS (entradas de dinero):
   - Siempre tipo = "ABONO" y numero_mov = "1"

3. CARGOS (salidas de dinero):
   - En el 99% de los casos: tipo = "CARGO" y numero_mov = "2"
   - PERO si detectas explícitamente la palabra "CHEQUE" o "CHQ" o similar en la descripción o en la columna de cargo, entonces:
     * tipo = "CHEQUE"
     * numero_mov = el número de documento/cheque que aparece (ej: "12345")
     * Si no hay número visible, usa "0"
   - Si es una transferencia u otro cargo normal: tipo = "CARGO", numero_mov = "2"

4. DEPÓSITOS:
   - tipo = "DEPOSITO"
   - numero_mov = número de documento si está visible, si no "1"

5. Fecha: devuélvela siempre en formato dd/mm/aaaa. Si el año no está visible, infiere el año actual.

6. Monto: número entero sin decimales. Sin símbolos de moneda ni puntos de miles. Si el OCR trajo comas o puntos mezclados, corrígelo al número entero puro.

7. saldo_despues: saldo que aparece en la columna "Saldo (CLP)" DESPUÉS de este movimiento. Número entero sin decimales. Esto es CRÍTICO para validar la dirección del movimiento.

8. Comentario: descripción completa del movimiento.

9. No incluyas totales, saldos ni resúmenes. Solo movimientos individuales.

10. Si el texto OCR está desordenado o tiene errores, infiere lo mejor posible basándote en el contexto y en la variación de saldos.`;
}

// Proxy para analizar cartola con DeepSeek (modo imagen - legacy)
app.post('/api/analyze-cartola', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'DEEPSEEK_API_KEY no está configurada en las variables de entorno' });
    }

    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
        return res.status(400).json({ error: 'No se recibió archivo' });
    }

    const finalMimeType = mimeType || 'image/png';

    return res.status(400).json({ error: 'Este endpoint legacy requiere un modelo con visión. Usa /api/analyze-cartola-text en su lugar.' });
});

// Proxy para analizar cartola con DeepSeek (modo texto OCR)
app.post('/api/analyze-cartola-text', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'DEEPSEEK_API_KEY no está configurada en las variables de entorno' });
    }

    const { text } = req.body;
    if (!text || text.trim().length < 10) {
        return res.status(400).json({ error: 'No se recibió texto OCR válido' });
    }

    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'user',
                        content: buildPrompt(text)
                    }
                ],
                temperature: 0.1,
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: errData.error?.message || `Error HTTP ${response.status}`
            });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error proxy DeepSeek:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper: convertir PDF base64 a imagen PNG usando pdf-to-img
async function pdfBase64ToPngBase64(base64Pdf) {
    const pdfLib = await getPdfToImg();
    const dataUrl = `data:application/pdf;base64,${base64Pdf}`;
    const doc = await pdfLib.pdf(dataUrl, { scale: 3 });
    let firstPageBuffer = null;
    for await (const image of doc) {
        firstPageBuffer = image;
        break; // Solo primera página
    }
    if (!firstPageBuffer) {
        throw new Error('No se pudo convertir el PDF a imagen');
    }
    return firstPageBuffer.toString('base64');
}

const VISION_PROMPT = `Eres un experto contable chileno especializado en leer cartolas bancarias del Banco de Chile. Tu tarea es extraer TODOS los movimientos con 100% de precisión.

ESTRUCTURA EXACTA DE LA TABLA (lee esto primero):
La imagen muestra una tabla con estas columnas de izquierda a derecha:
1. FECHA (dd/mm)
2. DETALLE DE TRANSACCION (descripción del movimiento)
3. SUCURSAL (Central, Internet, etc.)
4. N° DOCTO (número de documento)
5. MONTO CHEQUES O CARGOS (SALIDAS de dinero)
6. MONTO DEPOSITOS O ABONOS (ENTRADAS de dinero)
7. SALDO (saldo después del movimiento)

INSTRUCCIONES DE ANÁLISIS PASO A PASO:
1. PRIMERO describe mentalmente la estructura de la tabla que ves.
2. Lee fila por fila de ARRIBA hacia ABAJO, sin saltarte ninguna.
3. Para CADA fila, identifica en qué COLUMNA está el monto: columna 5 (CARGOS) o columna 6 (ABONOS). NUNCA ambas.
4. Si una descripción ocupa varias líneas, únela en una sola.
5. Extrae el SALDO de la columna 7 DESPUÉS de cada movimiento.

REGLAS ABSOLUTAS DE CLASIFICACIÓN (obedece estas reglas sin excepción):
- Si el monto está en la columna 5 (CARGOS/CHEQUES) → tipo = "CARGO", numero_mov = "2"
- Si el monto está en la columna 6 (DEPOSITOS/ABONOS) → tipo = "ABONO", numero_mov = "1"
- "APP-TRASPASO A:NOMBRE" o "TRASPASO A:" → siempre CARGO (salida), numero_mov = "2"
- "TRASPASO DE:NOMBRE" o "TRASPASO DE:" → siempre ABONO (entrada), numero_mov = "1"
- "CARGO SEGURO PROTECCION BANCARIA" → siempre CARGO, numero_mov = "2"
- "PAGO EN SII" o "PAGO AUTOMATICO TARJETA DE CREDITO" → siempre CARGO, numero_mov = "2"
- "PAGO:PROVEEDORES" → siempre ABONO (es un depósito de proveedores), numero_mov = "1"
- Si la descripción contiene "CHEQUE" y el monto está en Cargos → tipo = "CHEQUE", numero_mov = número del doc o "0"

VALIDACIÓN CRUZADA OBLIGATORIA (haz esto para CADA fila):
Después de extraer una fila, verifica:
- ¿El saldo subió respecto a la fila anterior? → DEBE ser ABONO/DEPOSITO
- ¿El saldo bajó respecto a la fila anterior? → DEBE ser CARGO/CHEQUE
- ¿El monto extraído coincide con |saldo_actual - saldo_anterior|?
  * Si NO coincide, usa la diferencia de saldos como el monto CORRECTO.
  * Esto es CRÍTICO porque a veces los números se confunden entre filas adyacentes.

FORMATO DE FECHAS:
- Convierte SIEMPRE a dd/mm/aaaa.
- Si el año no aparece, usa el año que aparece en el encabezado de la cartola.

FORMATO DE MONTOS Y SALDOS:
- Quita puntos de miles y comas decimales.
- Devuelve SOLO números enteros puros (ej: 85000000 en vez de 85.000.000).
- El campo "saldo_despues" es el saldo de la columna 7 DESPUÉS de ese movimiento.
- El campo "monto" es el valor de la columna 5 o 6.

EJEMPLOS DE ESTA CARTOLA ESPECÍFICA:
- "CARGO SEGURO PROTECCION BANCARIA" con 8.160 en Cargos y saldo 1.813.658
  → {"fecha":"02/04/2026","comentario":"Cargo Seguro Proteccion Bancaria","tipo":"CARGO","numero_mov":"2","monto":8160,"saldo_despues":1813658}
- "TRASPASO DE:CLAUDIO ANDRES ASMAD T" con 1.274.944 en Abonos y saldo 3.080.442
  → {"fecha":"02/04/2026","comentario":"Traspaso de:Claudio Andres Asmad T","tipo":"ABONO","numero_mov":"1","monto":1274944,"saldo_despues":3080442}
- "APP-TRASPASO A:Dolores Gazitua" con 450.000 en Cargos y saldo 3.933.267
  → {"fecha":"06/04/2026","comentario":"APP-Traspaso A:Dolores Gazitua","tipo":"CARGO","numero_mov":"2","monto":450000,"saldo_despues":3933267}
- "PAGO:PROVEEDORES 09696520K" con 28.824.495 en Abonos
  → {"fecha":"20/04/2026","comentario":"Pago:Proveedores 09696520K","tipo":"ABONO","numero_mov":"1","monto":28824495,"saldo_despues":26536749}

REGLA DE ORO:
Si extraes un movimiento y el saldo no cuadra con el tipo o el monto, CORRÍGELO. Es mejor estar lento y correcto que rápido y equivocado.

DEVUELVE EXCLUSIVAMENTE este JSON válido sin texto adicional ni markdown:
{"movimientos":[{"fecha":"dd/mm/aaaa","comentario":"...","tipo":"CARGO|ABONO|CHEQUE|DEPOSITO","numero_mov":"número","monto":12345,"saldo_despues":123456}]}

No incluyas filas vacías, totales, saldos iniciales/finales, ni filas que solo digan "SALDO INICIAL" o "SALDO FINAL". Solo movimientos individuales con fecha.`;

function normalizeOpenAIResponse(data) {
    // OpenAI ya devuelve formato choices[0].message.content
    return data;
}

function normalizeGoogleResponse(data) {
    // Google devuelve candidates[0].content.parts[0].text
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
        choices: [{
            message: {
                content: textContent
            }
        }]
    };
}

async function callOpenAIVision(apiKey, imageBase64, mimeType, prompt) {
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: 4000,
            temperature: 0.1,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
                    { type: 'text', text: prompt }
                ]
            }]
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Error HTTP ${response.status}`);
    }

    const data = await response.json();
    return normalizeOpenAIResponse(data);
}

async function callGoogleVision(apiKey, imageBase64, mimeType, prompt) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { inlineData: { mimeType, data: imageBase64 } },
                    { text: prompt }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 4000
            }
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Error HTTP ${response.status}`);
    }

    const data = await response.json();
    return normalizeGoogleResponse(data);
}

// Endpoint con visión directa - usa OpenAI o Google según disponibilidad
app.post('/api/analyze-cartola-vision', async (req, res) => {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
        return res.status(400).json({ error: 'No se recibió archivo' });
    }

    let finalMimeType = mimeType || 'image/png';
    let imageData = imageBase64;

    try {
        // Si es PDF, intentar convertir a imagen para mejor precisión en tablas
        if (finalMimeType === 'application/pdf') {
            try {
                imageData = await pdfBase64ToPngBase64(imageBase64);
                finalMimeType = 'image/png';
                console.log('PDF convertido a imagen para análisis de visión');
            } catch (pdfErr) {
                console.warn('No se pudo convertir PDF a imagen:', pdfErr.message);
                return res.status(400).json({ error: 'No se pudo convertir el PDF a imagen. Asegúrate de haber ejecutado npm install.' });
            }
        }

        const openAiKey = process.env.OPENAI_API_KEY;
        const googleKey = process.env.GOOGLE_API_KEY;

        let result;
        let provider;

        if (openAiKey) {
            provider = 'OpenAI GPT-4o';
            result = await callOpenAIVision(openAiKey, imageData, finalMimeType, VISION_PROMPT);
        } else if (googleKey) {
            provider = 'Google Gemini 1.5 Flash';
            result = await callGoogleVision(googleKey, imageData, finalMimeType, VISION_PROMPT);
        } else {
            return res.status(500).json({
                error: 'No hay API key de visión configurada. Configura OPENAI_API_KEY o GOOGLE_API_KEY en las variables de entorno.'
            });
        }

        console.log(`Cartola analizada con éxito vía ${provider}`);
        res.json(result);
    } catch (error) {
        console.error('Error visión:', error);
        res.status(500).json({ error: error.message });
    }
});

// Cualquier otra ruta sirve el index.html (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
