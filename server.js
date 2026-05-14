const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Cargar pdf-to-img de forma lazy para evitar crash en arranque
let pdfToImg = null;
async function getPdfToImg() {
    if (!pdfToImg) {
        pdfToImg = require('pdf-to-img');
    }
    return pdfToImg;
}

app.use(express.json({ limit: '10mb' }));

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

// Endpoint con visión directa usando OpenAI GPT-4o
app.post('/api/analyze-cartola-vision', async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OPENAI_API_KEY no está configurada en las variables de entorno' });
    }

    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
        return res.status(400).json({ error: 'No se recibió archivo' });
    }

    const finalMimeType = mimeType || 'image/png';
    let imageDataUrl = `data:${finalMimeType};base64,${imageBase64}`;

    try {
        let imageUrls = [];

        // Si es PDF, convertir todas las páginas a imágenes
        if (finalMimeType === 'application/pdf') {
            try {
                const { pdf } = await getPdfToImg();
                const pdfBuffer = Buffer.from(imageBase64, 'base64');
                const document = await pdf(pdfBuffer, { scale: 2 });
                for await (const image of document) {
                    imageUrls.push(`data:image/png;base64,${image.toString('base64')}`);
                }
                if (imageUrls.length === 0) {
                    return res.status(400).json({ error: 'No se pudo convertir el PDF a imágenes' });
                }
            } catch (pdfErr) {
                console.error('Error convirtiendo PDF:', pdfErr);
                return res.status(400).json({ error: 'Error al procesar el PDF. Por favor conviértelo a imagen (PNG/JPG) e intenta de nuevo.' });
            }
        } else {
            imageUrls.push(imageDataUrl);
        }

        const pageCount = imageUrls.length;
        const prompt = `Eres un experto contable chileno especializado en leer cartolas bancarias del Banco de Chile. Tu tarea es extraer TODOS los movimientos de la cartola con 100% de precisión.

La tabla tiene estas columnas EXACTAS de izquierda a derecha:
1. Fecha
2. Descripción
3. Canal o Sucursal
4. N° Documento
5. Cargos (CLP) — montos de SALIDA de dinero
6. Abonos (CLP) — montos de ENTRADA de dinero
7. Saldo (CLP) — saldo después del movimiento

REGLAS ABSOLUTAS (no negociables):

A. LECTURA DE MONTOS:
   - Cada fila tiene UN solo monto: o está en Cargos, o está en Abonos. NUNCA en ambas.
   - Si ves un número en la columna "Cargos (CLP)", ese movimiento es SALIDA de dinero.
   - Si ves un número en la columna "Abonos (CLP)", ese movimiento es ENTRADA de dinero.
   - NO inventes montos. Si una celda está vacía o tiene "0", ignórala.

B. CLASIFICACIÓN POR COLUMNA (esto es CRÍTICO):
   - Monto en Cargos → tipo = "CARGO" (numero_mov = "2")
   - Monto en Abonos → tipo = "ABONO" (numero_mov = "1")
   - Si en la columna Cargos dice "CHEQUE" o "CHQ" → tipo = "CHEQUE" (numero_mov = número del documento)

C. VALIDACIÓN CON SALDOS:
   - El saldo debe ir bajando después de un CARGO.
   - El saldo debe ir subiendo después de un ABONO.
   - Si tu clasificación hace que el saldo vaya al revés, ESTÁS MAL. Corrige inmediatamente.

D. EJEMPLO DE LECTURA CORRECTA:
   Fecha: 26/03/2026 | Descripción: "Traspaso a 96571220-8 FMU" | Cargos: 85.000.000 | Abonos: 0 | Saldo: 1.813.658
   → fecha: "26/03/2026", comentario: "Traspaso a 96571220-8 FMU", tipo: "CARGO", numero_mov: "2", monto: 85000000, saldo_despues: 1813658

   Fecha: 26/03/2026 | Descripción: "TRASPASO DESDE OTRA CUENTA CORRIENTE" | Cargos: 0 | Abonos: 33.000.000 | Saldo: 86.813.658
   → fecha: "26/03/2026", comentario: "TRASPASO DESDE OTRA CUENTA CORRIENTE", tipo: "ABONO", numero_mov: "1", monto: 33000000, saldo_despues: 86813658

   Fecha: 02/03/2026 | Descripción: "CARGO SEGURO PROTECCION BANCARIA" | Cargos: 8.151 | Abonos: 0 | Saldo: 45.841.419
   → fecha: "02/03/2026", comentario: "CARGO SEGURO PROTECCION BANCARIA", tipo: "CARGO", numero_mov: "2", monto: 8151, saldo_despues: 45841419

E. FORMATO DE SALIDA:
   - Devuelve EXCLUSIVAMENTE un JSON puro (sin markdown, sin explicaciones).
   - Fecha: dd/mm/aaaa
   - Monto: número entero sin puntos ni comas (ej: 85000000, no 85.000.000)
   - saldo_despues: número entero sin puntos ni comas
   - No incluyas filas sin monto.

F. ANTES de devolver el JSON, verifica:
   1. ¿Cada fila tiene exactamente un monto (cargo O abono, no ambos ni ninguno)?
   2. ¿Los saldos son consistentes (suben con abonos, bajan con cargos)?
   3. ¿No hay montos duplicados entre filas consecutivas?
   4. ¿El número de filas coincide con el número de fechas en la tabla?

Analiza ${pageCount > 1 ? 'estas imágenes' : 'esta imagen'} de la cartola (${pageCount} página${pageCount > 1 ? 's' : ''}) y devuelve SOLO el JSON:`;

        const contentParts = [{ type: 'text', text: prompt }];
        imageUrls.forEach(url => {
            contentParts.push({ type: 'image_url', image_url: { url } });
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: contentParts
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
        console.error('Error OpenAI:', error);
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
