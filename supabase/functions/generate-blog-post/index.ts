import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── 1. Obtener productos de la tabla real ──────────────────
    // Columnas reales: name, brand, description, price, image_url
    const { data: productos, error: prodError } = await supabase
      .from("products")
      .select("name, brand, description, price, image_url")
      .eq("in_stock", true)
      .limit(50);

    if (prodError || !productos || productos.length === 0) {
      throw new Error("No se encontraron productos: " + prodError?.message);
    }

    // Elegir producto aleatorio
    const producto = productos[Math.floor(Math.random() * productos.length)];

    // ── 2. Generar contenido con Claude ────────────────────────
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: `Eres escritor SEO senior de Divina Store MX. Tienda de dermocosmetica en CDMX.
Marcas: ISDIN, La Roche-Posay, Vichy. Precio promedio $700-$1000 MXN.
Tono: experto accesible, español mexicano natural, sin anglicismos ni slang.
Menciona siempre CDMX, contaminacion ambiental, precio en MXN y autenticidad garantizada.
REGLA ABSOLUTA: Responde UNICAMENTE con un objeto JSON valido, sin markdown, sin texto extra.
El JSON debe tener exactamente estas claves:
{
  "title": "string (55-65 chars, include keyword)",
  "slug": "string (url-safe, kebab-case)",
  "excerpt": "string (150-160 chars)",
  "content": "string (HTML limpio: h2, h3, p, ul, li, strong — minimo 900 palabras)",
  "category": "Cuidado de Piel | Rutinas | Ingredientes | Consejos | Marketing",
  "tags": ["string"],
  "author": "Equipo Divina"
}`,
        messages: [
          {
            role: "user",
            content: `Crea un post de blog SEO sobre este producto de Divina Store:
Nombre: ${producto.name}
Marca: ${producto.brand ?? "marca premium"}
Descripcion: ${producto.description ?? "producto dermocosmetico premium"}
Precio: $${producto.price} MXN

El post debe rankear para busquedas reales en Mexico.
Incluye contexto CDMX, problema de piel real, ingredientes activos con evidencia cientifica y CTA a divinastore.com.mx`,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errBody}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content?.[0]?.text ?? "";

    // ── 3. Parsear JSON de Claude ──────────────────────────────
    let postData: Record<string, unknown>;
    try {
      postData = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Respuesta de Claude no contiene JSON valido");
      postData = JSON.parse(match[0]);
    }

    // ── 4. Generar slug único con timestamp si es necesario ────
    const slug = String(postData.slug ?? `post-${Date.now()}`);

    // ── 5. Imagen: usar image_url del producto o Unsplash ──────
    const seedNum = slug.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const coverImage = producto.image_url
      ?? `https://source.unsplash.com/800x500/?skincare,beauty,cosmetics&sig=${seedNum}`;

    // ── 6. Insertar en blog_posts ──────────────────────────────
    const { data: insertedPost, error: insertError } = await supabase
      .from("blog_posts")
      .insert({
        title:       postData.title,
        slug,
        excerpt:     postData.excerpt,
        content:     postData.content,
        category:    postData.category,
        tags:        postData.tags,
        author:      postData.author ?? "Equipo Divina",
        cover_image: coverImage,
        published:   true,
        created_at:  new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw new Error("Error insertando en blog_posts: " + insertError.message);
    }

    return new Response(
      JSON.stringify({ success: true, post: insertedPost, producto: producto.name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
