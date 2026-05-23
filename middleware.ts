import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Bots de redes sociales y crawlers
const BOT_AGENTS = [
  'facebookexternalhit', 'Facebot', 'Twitterbot', 'LinkedInBot',
  'WhatsApp', 'Slackbot', 'TelegramBot', 'Googlebot',
  'bingbot', 'Applebot', 'Pinterest', 'Discordbot',
];

function isBot(userAgent: string): boolean {
  return BOT_AGENTS.some(bot => userAgent.toLowerCase().includes(bot.toLowerCase()));
}

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || '';
  const { pathname } = request.nextUrl;

  // Solo interceptar rutas de producto para bots
  if (!isBot(userAgent) || !pathname.startsWith('/producto/')) {
    return NextResponse.next();
  }

  const slug = pathname.replace('/producto/', '');
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  try {
    // Fetch del producto desde Supabase
    const res = await fetch(
      `${supabaseUrl}/rest/v1/products?slug=eq.${slug}&select=name,description,price,brand,image_url,in_stock&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    const data = await res.json();
    const product = data?.[0];

    if (!product) return NextResponse.next();

    const siteUrl = 'https://www.divinastore.com.mx';
    const productUrl = `${siteUrl}/producto/${slug}`;
    const imageUrl = product.image_url
      ? `${supabaseUrl}/storage/v1/render/image/public/${product.image_url}?width=1200&quality=80`
      : `${siteUrl}/og-image.jpg`;

    const description = product.description
      ? product.description.replace(/<[^>]*>/g, '').trim().slice(0, 200)
      : `Compra ${product.name}${product.brand ? ` de ${product.brand}` : ''} en México. $${product.price} MXN. Envío a toda la república.`;

    const title = `${product.name}${product.brand ? ` | ${product.brand}` : ''} — Divina Store MX`;

    const html = `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />

  <!-- Open Graph -->
  <meta property="og:type" content="product" />
  <meta property="og:url" content="${productUrl}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="es_MX" />
  <meta property="og:site_name" content="Divina Store MX" />
  <meta property="product:price:amount" content="${product.price}" />
  <meta property="product:price:currency" content="MXN" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${imageUrl}" />

  <!-- Canonical -->
  <link rel="canonical" href="${productUrl}" />

  <!-- Redirect usuarios normales a la SPA -->
  <script>window.location.href = "${productUrl}";</script>
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
  <a href="${productUrl}">Ver producto</a>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

  } catch (err) {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/producto/:slug*'],
};
