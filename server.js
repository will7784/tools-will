const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Cargar librerías PDF de forma lazy para evitar crash en arranque
let pdfToImg = null;
let pdfParse = null;

async function getPdfToImg() {
    if (!pdfToImg) {
        pdfToImg = await import('pdf-to-img');
    }
    return pdfToImg;
}

async function getPdfParse() {
    if (!pdfParse) {
        pdfParse = require('pdf-parse');
    }
    return pdfParse;
}

app.use(express.json({ limit: '50mb' }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname)));

function buildPrompt(ocrText) {
    return `Eres un extractor de datos tabulares. Tu tarea es convertir texto OCR de una cartola bancaria en datos estructurados.

TEXTO OCR EXTRAÍDO:
---
${ocrText}
---

ESTRUCTURA DE LA CARTOLA (Banco de Chile):
Cada fila tiene: FECHA | DESCRIPCION | SUCURSAL | N° DOCTO | CARGOS | ABONOS | SALDO

INSTRUCCIONES PARA INTERPRETAR EL TEXTO OCR:
1. El texto OCR puede tener los números desalineados o en líneas mezcladas. Tú debes reconstruir las filas lógicas.
2. Identifica la FECHA al inicio de cada línea (formato dd/mm).
3. La DESCRIPCIÓN es el texto que sigue a la fecha (ej: "CARGO SEGURO", "TRASPASO DE:...", "APP-TRASPASO A:...").
4. Los NÚMEROS que aparecen después de la descripción son: CARGOS (salidas), ABONOS (entradas) y SALDO.
5. REGLA CRÍTICA para separar CARGOS vs ABONOS:
   - Lee el texto de la descripción. Si contiene "TRASPASO DE:" o "TRASPASO DE ", el monto principal es un ABONO (entrada).
   - Si contiene "TRASPASO A:" o "APP-TRASPASO A:", el monto principal es un CARGO (salida).
   - Si contiene "CARGO SEGURO" o "PAGO EN SII" o "PAGO AUTOMATICO", es un CARGO (salida).
   - Si contiene "PAGO:PROVEEDORES", es un ABONO (entrada, depósito de proveedores).
   - Si la descripción NO dice nada específico, observa el orden de los números: el primer número grande después de la descripción suele ser el monto del movimiento, y el último número de la línea es el SALDO.

6. Para cada fila, determina:
   - monto_cargo: el monto si es una salida de dinero (si no, 0)
   - monto_abono: el monto si es una entrada de dinero (si no, 0)
   - saldo_despues: el saldo final que aparece al final de la fila

FORMATO DE SALIDA:
{"movimientos":[{"fecha":"dd/mm/aaaa","comentario":"...","monto_cargo":0,"monto_abono":1274944,"saldo_despues":123456}]}

- Quita puntos de miles. Ej: 1.274.944 → 1274944
- Si el año no aparece, usa 2026.
- No incluyas filas de "SALDO INICIAL" o "SALDO FINAL".
- Solo devuelve el JSON puro. Sin markdown, sin explicaciones.`;
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

const VISION_PROMPT = `Eres un sistema de extracción de datos tabulares. NO razones sobre la dirección del dinero. SOLO lee la tabla y extrae los números que ves en cada celda.

ESTRUCTURA DE LA TABLA (de izquierda a derecha):
1. FECHA
2. DETALLE / DESCRIPCIÓN
3. SUCURSAL
4. N° DOCTO
5. MONTO CHEQUES O CARGOS (columna de SALIDAS)
6. MONTO DEPOSITOS O ABONOS (columna de ENTRADAS)
7. SALDO

INSTRUCCIONES CRÍTICAS:
1. PRIMERO identifica visualmente cuál es la columna 5 (Cargos) y cuál es la columna 6 (Abonos).
2. Lee fila por fila de ARRIBA hacia ABAJO.
3. Para CADA fila, extrae el número que aparece en la columna 5 (si hay) y el número que aparece en la columna 6 (si hay).
4. NORMALMENTE una fila tiene número en UNA sola columna (5 o 6), no en ambas.
5. Extrae también el SALDO de la columna 7 al final de la fila.
6. Si una descripción está partida en varias líneas, únela.

REGLA DE ORO: NO uses la descripción para decidir si es cargo o abono. Usa ÚNICAMENTE la columna donde está el número:
- Número en columna 5 → va en "monto_cargo"
- Número en columna 6 → va en "monto_abono"

Esto es FUNDAMENTAL: una fila puede decir "Cargo Seguro" en la descripción, pero si el número está en la columna 6, el monto va en "monto_abono", NO en "monto_cargo". La descripción es solo texto; la dirección del dinero la determina la COLUMNA numérica.

FORMATO DE SALIDA (JSON estricto):
{"movimientos":[{"fecha":"dd/mm/aaaa","comentario":"...","monto_cargo":0,"monto_abono":1274944,"saldo_despues":123456}]}

- "monto_cargo": número entero de la columna 5, o 0 si está vacía
- "monto_abono": número entero de la columna 6, o 0 si está vacía
- "saldo_despues": saldo de la columna 7
- Quita puntos de miles. Ej: 1.274.944 → 1274944
- Si una fila tiene número en ambas columnas (raro), pon el número en ambos campos.

EJEMPLO REAL DE ESTA CARTOLA:
- Fila: 02/04 | CARGO SEGURO PROTECCION BANCARIA | CENTRAL | - | 8.160 | - | 1.813.658
  → {"fecha":"02/04/2026","comentario":"Cargo Seguro Proteccion Bancaria","monto_cargo":8160,"monto_abono":0,"saldo_despues":1813658}
- Fila: 02/04 | TRASPASO DE:CLAUDIO ANDRES ASMAD T | INTERNET | - | - | 1.274.944 | 3.080.442
  → {"fecha":"02/04/2026","comentario":"Traspaso de:Claudio Andres Asmad T","monto_cargo":0,"monto_abono":1274944,"saldo_despues":3080442}
- Fila: 06/04 | APP-TRASPASO A:Dolores Gazitua | INTERNET | - | 450.000 | - | 3.933.267
  → {"fecha":"06/04/2026","comentario":"APP-Traspaso A:Dolores Gazitua","monto_cargo":450000,"monto_abono":0,"saldo_despues":3933267}
- Fila: 20/04 | PAGO:PROVEEDORES 09696520K | CENTRAL | - | - | 28.824.495 | 26.536.749
  → {"fecha":"20/04/2026","comentario":"Pago:Proveedores 09696520K","monto_cargo":0,"monto_abono":28824495,"saldo_despues":26536749}

SOLO devuelve el JSON. Sin explicaciones, sin markdown.`;

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

// Endpoint para extraer texto nativo de un PDF o convertir a imagen si es escaneado
app.post('/api/extract-pdf-text', async (req, res) => {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) {
        return res.status(400).json({ error: 'No se recibió PDF' });
    }

    try {
        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        const pdfParser = await getPdfParse();
        const parsed = await pdfParser(pdfBuffer);
        const text = parsed.text || '';

        // Si el PDF tiene texto sustancial (más de 200 chars), devolverlo
        if (text.trim().length > 200) {
            console.log(`PDF nativo: extraídos ${text.trim().length} caracteres de texto`);
            return res.json({ hasText: true, text: text.trim() });
        }

        // Si no tiene texto, es un PDF escaneado: convertir a imagen
        console.log('PDF escaneado detectado (sin texto nativo). Convirtiendo a imagen...');
        try {
            const pdfLib = await getPdfToImg();
            const dataUrl = `data:application/pdf;base64,${pdfBase64}`;
            const doc = await pdfLib.pdf(dataUrl, { scale: 3 });
            let firstPageBuffer = null;
            for await (const image of doc) {
                firstPageBuffer = image;
                break;
            }
            if (!firstPageBuffer) {
                throw new Error('No se pudo renderizar el PDF');
            }
            const imageBase64 = firstPageBuffer.toString('base64');
            res.json({ hasText: false, imageBase64, mimeType: 'image/png' });
        } catch (convertErr) {
            console.error('Error convirtiendo PDF a imagen:', convertErr);
            res.status(500).json({
                error: 'El PDF no tiene texto seleccionable y no se pudo convertir a imagen. Asegúrate de que npm install se ejecutó correctamente en Railway.'
            });
        }
    } catch (error) {
        console.error('Error extrayendo PDF:', error);
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
