import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const secretKey = process.env.CLIP_SECRET;

    if (!secretKey) {
        return res.status(500).json({
            status: '❌ FALLO',
            error: 'CLIP_SECRET no está configurada en Vercel',
            fix: 'Ve a Vercel → Settings → Environment Variables → agrega CLIP_SECRET',
        });
    }

    // Test: hacer una petición de lectura a la API de Clip para verificar autenticación
    try {
        const response = await fetch('https://api.payclip.com/payments?limit=1', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${secretKey}`,
            },
        });

        if (response.ok) {
            return res.status(200).json({
                status: '✅ ÉXITO',
                message: 'La API Key de Clip es válida y funciona correctamente',
                keyPreview: secretKey.slice(0, 8) + '...' + secretKey.slice(-4),
            });
        } else {
            const data = await response.json().catch(() => ({}));
            return res.status(401).json({
                status: '❌ FALLO',
                error: 'Clip rechazó la llave — probablemente es incorrecta',
                clipStatus: response.status,
                clipResponse: data,
                keyPreview: secretKey.slice(0, 8) + '...' + secretKey.slice(-4),
                fix: 'Verifica que CLIP_SECRET sea tu API Key SECRETA (no la pública)',
            });
        }
    } catch (err) {
        return res.status(500).json({
            status: '❌ FALLO',
            error: 'No se pudo conectar con Clip',
            details: String(err),
        });
    }
}
