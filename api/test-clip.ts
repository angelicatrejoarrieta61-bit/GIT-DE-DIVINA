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

    // Probar ambos endpoints de Clip
    const endpoints = [
        'https://api-gw.payclip.com/payments?limit=1',
        'https://api.payclip.com/payments?limit=1',
    ];

    const results = [];

    for (const url of endpoints) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${secretKey}`,
                },
            });
            const data = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
            results.push({
                url,
                status: response.status,
                ok: response.ok,
                response: data,
            });
        } catch (err) {
            results.push({ url, status: 'ERROR', error: String(err) });
        }
    }

    const anyOk = results.some(r => r.ok);

    return res.status(anyOk ? 200 : 401).json({
        status: anyOk ? '✅ ÉXITO — La API Key funciona' : '❌ FALLO — Ambos endpoints rechazaron la llave',
        keyPreview: secretKey.slice(0, 8) + '...' + secretKey.slice(-4),
        keyLength: secretKey.length,
        results,
        fix: anyOk ? null : 'Verifica que CLIP_SECRET sea tu API Key SECRETA de Clip (Panel de desarrolladores)',
    });
}
