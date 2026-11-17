# Stripe en Divina — configuración pendiente

Integración: **Payment Element** (formulario de tarjeta dentro del checkout de Divina; Stripe lo pinta en un iframe seguro).
Servidor: `api/stripe.ts` (PaymentIntents + webhook, API REST con `fetch`, sin dependencias nuevas).
Cliente: `src/pages/CheckoutPage.tsx` carga `https://js.stripe.com/v3/` y monta el Payment Element en `#stripe-payment-element`.
Base: `supabase/migrations/20261116120000_orders_stripe.sql` (columnas `stripe_*` y candado de estado).

## Variables en Vercel (Settings → Environment Variables)

| Variable | Valor | Dónde se usa |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` (o `sk_test_…` para probar) | `api/stripe.ts` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` (o `pk_test_…`) | checkout (pública por diseño) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` del webhook de abajo | `api/stripe.ts` (firma) |

Las llaves `live` y `test` son pares distintos: no mezclar. Después de cambiarlas → **Redeploy**.

## Webhook (Developers → Webhooks → Add endpoint)

- URL: `https://www.divinastore.com.mx/api/stripe`
- Eventos: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
- Copiar el **Signing secret** a `STRIPE_WEBHOOK_SECRET`.

## Cómo funciona

1. La clienta llena envío y tarjeta en `/checkout` (la tarjeta nunca toca el servidor de Divina).
2. Al pagar: se crea el pedido `pending` → `/api/stripe · create` recalcula el total con precios de la base y crea el PaymentIntent (MXN, solo tarjeta) → el navegador confirma con `stripe.confirmPayment`. Si el banco pide 3-D Secure, Stripe lo abre en un modal en la misma página.
3. Aprobado → `/api/stripe · status` lo confirma con Stripe y marca el pedido `paid` (el navegador nunca lo marca) → `/pago-exitoso`. El webhook hace lo mismo por si la pestaña se cerró.
4. Rechazado → el pedido se cancela con el motivo y la clienta ve el error sin salir del checkout.

## Probar sin dinero real

Con llaves `test`: tarjeta `4242 4242 4242 4242`, fecha futura, CVC cualquiera. 3-D Secure: `4000 0027 6000 3184`. Rechazo: `4000 0000 0000 0002`.

## Pendientes

- Cuenta de Stripe a nombre de quien opera Divina y con el giro real (dermocosmética en línea).
- Páginas `/terminos` y `/privacidad` (hoy dan 404; Stripe las suele pedir para activar la cuenta).
- Imágenes del checkout con logos de Clip (Admin → Checkout).
- Comisión de Stripe en el cálculo de márgenes (hoy sigue el 5 % de Clip).

Recursos: https://docs.stripe.com/payments/payment-element · https://support.stripe.com
