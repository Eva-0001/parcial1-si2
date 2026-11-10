export const env = {
  production: import.meta.env.PROD,
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '',
  /** Tienda (slug de la empresa) que se muestra si la URL no trae ?tienda= */
  empresaPorDefecto: import.meta.env.VITE_EMPRESA || 'fashionstore',
}
