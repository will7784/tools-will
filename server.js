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

const VISION_PROMPT = `Eres un experto contable chileno especializado en leer cartolas bancarias del Banco de Chile. Extrae TODOS los movimientos con 100% de precisión.

INSTRUCCIONES DE ANÁLISIS PASO A PASO:
1. Identifica la estructura de la tabla en la imagen.
2. Localiza las columnas: Fecha, Descripción/Detalle, Canal/Sucursal, N° Documento, Cargos (CLP), Abonos (CLP), Saldo (CLP).
3. Lee fila por fila de arriba hacia abajo.
4. Si una descripción está partida en varias líneas, únela en un solo comentario.
5. Cada movimiento tiene EXACTAMENTE un monto: o en Cargos, o en Abonos. NUNCA ambos.

REGLAS CRÍTICAS PARA CLASIFICAR:
- Cargos (columna 5) = SALIDA de dinero del banco → tipo "CARGO", numero_mov "2"
- Abonos (columna 6) = ENTRADA de dinero al banco → tipo "ABONO", numero_mov "1"
- Si la descripción contiene "CHEQUE" o "CHQ" Y el monto está en Cargos → tipo "CHEQUE", numero_mov = número del documento (columna 4). Si no hay número, usa "0".
- Si la descripción contiene "DEPOSITO" o "DEPÓSITO" Y el monto está en Abonos → tipo "DEPOSITO", numero_mov = número del documento si existe, si no "1".
- "Traspaso a..." / "Transferencia a..." → generalmente CARGO (salida)
- "Traspaso desde..." / "Transferencia desde..." / "TRASPASO DESDE" → generalmente ABONO (entrada)
- "PAGO" solo no garantiza cargo: "PAGO RECIBIDO" puede ser ABONO.

VALIDACIÓN POR SALDOS:
- El saldo debe bajar después de un CARGO/CHEQUE.
- El saldo debe subir después de un ABONO/DEPOSITO.
- Si detectas inconsistencia, corrige el tipo basándote en la variación del saldo.

FORMATO DE FECHAS:
- La fecha puede venir como "15 Ene", "15/01/2024", "15-01-2024", etc.
- Convierte SIEMPRE a formato dd/mm/aaaa.
- Si el año no está explícito, infiere el año actual.

FORMATO DE MONTOS:
- Quita puntos de miles y comas decimales.
- Devuelve números enteros puros (ej: 85000000 en vez de 85.000.000).
- El campo saldo_despues es el saldo que aparece en la columna "Saldo (CLP)" DESPUÉS de ese movimiento.

EJEMPLOS CORRECTOS:
- Fila: 02/01/2024 | Traspaso a 96571220-8 FMU | - | - | 85.000.000 | - | 45.234.123
  → {"fecha":"02/01/2024","comentario":"Traspaso a 96571220-8 FMU","tipo":"CARGO","numero_mov":"2","monto":85000000,"saldo_despues":45234123}
- Fila: 03/01/2024 | TRASPASO DESDE OTRA CUENTA | - | - | - | 33.000.000 | 78.234.123
  → {"fecha":"03/01/2024","comentario":"TRASPASO DESDE OTRA CUENTA","tipo":"ABONO","numero_mov":"1","monto":33000000,"saldo_despues":78234123}
- Fila: 05/01/2024 | Cheque 12345 | Sucursal 123 | 12345 | 150.000 | - | 78.084.123
  → {"fecha":"05/01/2024","comentario":"Cheque 12345","tipo":"CHEQUE","numero_mov":"12345","monto":150000,"saldo_despues":78084123}

DEVUELVE EXCLUSIVAMENTE este JSON válido sin texto adicional ni markdown:
{"movimientos":[{"fecha":"dd/mm/aaaa","comentario":"...","tipo":"CARGO|ABONO|CHEQUE|DEPOSITO","numero_mov":"número","monto":12345,"saldo_despues":123456}]}

No incluyas filas vacías, totales, ni saldos iniciales/finales. Solo movimientos individuales.`;

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
