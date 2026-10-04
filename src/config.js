/* Launch settings. Fill these in when the store and domain exist; empty values keep the app in preview mode. */
(function (root) {
  root.InkwellConfig = {
    brand: 'Inkwell',
    price: '$10',
    // PayPal REST app client ID (public; the secret stays on the server). Use the sandbox app's ID until
    // launch. Empty = no PayPal buttons; the upgrade dialog offers "Unlock for testing" instead.
    paypalClientId: '',
    // Server function that creates the $10 order and turns a completed payment into a license key
    // (functions/api/paypal/[action].js).
    paymentApi: '/api/paypal',
    // Ed25519 public key (base64) that license keys are checked against.
    // PREVIEW ONLY: replace with a production pair from `npm run keygen` before launch.
    licensePublicKey: '53b6fzYuF8s/EvOt1SOQszctEjmaLvi4IP81vs/NoNA=',
    // Shown when a payment can't be confirmed, and on the privacy page.
    supportEmail: '',
  };
})(typeof self !== 'undefined' ? self : this);
