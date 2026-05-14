const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

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

    const { imageBase64 } = req.body;
    if (!imageBase64) {
        return res.status(400).json({ error: 'No se recibió imagen' });
    }

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

// Cualquier otra ruta sirve el index.html (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
