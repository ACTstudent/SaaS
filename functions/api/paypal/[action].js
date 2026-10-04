/*
 * Cloudflare Pages Function: the $10 upgrade, paid with PayPal.
 *
 *   POST /api/paypal/order    -> { id }    creates a PayPal order for the upgrade (price set here, not by the browser)
 *   POST /api/paypal/capture  { orderID } -> { key }
 *        checks the order the buyer approved is the upgrade, paid to this merchant at the right price, then takes
 *        the payment, confirms it completed and returns a signed license key. The key is derived only from the
 *        order, so calling again returns the same key.
 *
 * Environment secrets (Cloudflare Pages > Settings > Variables and secrets):
 *   PAYPAL_CLIENT_ID       from the PayPal developer dashboard (Apps & Credentials)
 *   PAYPAL_CLIENT_SECRET   same app's secret
 *   PAYPAL_MERCHANT_ID     the seller account's merchant ID (PayPal account settings > Business information);
 *                          keys are only issued for money paid to this account
 *   PAYPAL_ENV             "live" for real payments; anything else uses the sandbox
 *   LICENSE_PRIVATE_KEY    from `npm run keygen` (base64 PKCS#8 Ed25519)
 *
 * Error codes returned to the app: missing_order, not_found, wrong_product, not_approved, declined (the buyer can
 * pick another way to pay), failed, pending, refunded, not_paid, paypal_unavailable, not_configured.
 */
const PREFIX = 'INK1.';
export const PRODUCT = 'inkwell-plus';
// Keep in step with `price` in src/config.js and the prices written in index.html and public/terms.html.
export const PRICE = '10.00';
const ORDER_ID = /^[A-Z0-9]{10,30}$/;
// Capture refusals PayPal documents as final for this order; the buyer has to start a new payment.
const CAPTURE_FAILED = new Set(['PAYER_ACTION_REQUIRED', 'TRANSACTION_REFUSED', 'PAYER_CANNOT_PAY', 'MAX_NUMBER_OF_PAYMENT_ATTEMPTS_EXCEEDED', 'ORDER_EXPIRED']);

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// The signing key is imported (and so checked) before any payment is taken; keep it while the worker stays warm.
let cachedSigner = null;
async function importSigner(privateKeyB64) {
  const secret = String(privateKeyB64 || '').trim();
  if (cachedSigner && cachedSigner.secret === secret) return cachedSigner.key;
  const key = await crypto.subtle.importKey('pkcs8', fromB64(secret), { name: 'Ed25519' }, false, ['sign']);
  cachedSigner = { secret, key };
  return key;
}
async function signWith(key, payload) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, new TextEncoder().encode(body));
  return PREFIX + body + '.' + b64url(sig);
}
export async function signLicense(payload, privateKeyB64) {
  return signWith(await importSigner(privateKeyB64), payload);
}

const apiBase = (env) => (env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

// Access tokens last hours; reuse one while this worker stays warm.
let cachedToken = null;
async function accessToken(env) {
  const now = Date.now();
  if (cachedToken && cachedToken.client === env.PAYPAL_CLIENT_ID && cachedToken.base === apiBase(env) && cachedToken.expires > now) return cachedToken.value;
  const res = await fetch(apiBase(env) + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_CLIENT_SECRET),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('PayPal token request failed: HTTP ' + res.status);
  const data = await res.json();
  cachedToken = { client: env.PAYPAL_CLIENT_ID, base: apiBase(env), value: data.access_token, expires: now + Math.max(0, (data.expires_in || 0) - 120) * 1000 };
  return data.access_token;
}

async function paypal(env, path, init) {
  const token = await accessToken(env);
  const res = await fetch(apiBase(env) + path, {
    method: (init && init.method) || 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: init && init.body,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
const issueOf = (body) => (body && Array.isArray(body.details) && body.details[0] && body.details[0].issue) || '';
const cents = (a) => (a && a.currency_code === 'USD' && /^\d+(\.\d{1,2})?$/.test(String(a.value)) ? Math.round(parseFloat(a.value) * 100) : NaN);
const isPrice = (a) => cents(a) === Math.round(parseFloat(PRICE) * 100);

// Is this order the upgrade, at the upgrade price, paying this merchant? Checked before any money moves.
export function checkProduct(order, env) {
  const units = order && Array.isArray(order.purchase_units) ? order.purchase_units : [];
  if (!units.length) return 'not_found';
  const unit = units[0];
  if (order.intent !== 'CAPTURE' || units.length !== 1 || unit.reference_id !== PRODUCT || !isPrice(unit.amount)) return 'wrong_product';
  if (!unit.payee || !env.PAYPAL_MERCHANT_ID || unit.payee.merchant_id !== env.PAYPAL_MERCHANT_ID) return 'wrong_product';
  return '';
}

// Has the money arrived? Returns an error code, or '' when the upgrade is paid for.
export function checkPayment(order, env) {
  const product = checkProduct(order, env);
  if (product) return product;
  const unit = order.purchase_units[0];
  const captures = (unit.payments && unit.payments.captures) || [];
  if (captures.some((c) => c.status === 'COMPLETED' && isPrice(c.amount))) return order.status === 'COMPLETED' ? '' : 'pending';
  if (captures.some((c) => c.status === 'PENDING')) return 'pending';
  if (captures.some((c) => c.status === 'REFUNDED' || c.status === 'PARTIALLY_REFUNDED')) return 'refunded';
  if (captures.some((c) => c.status === 'DECLINED' || c.status === 'FAILED')) return 'failed';
  if (order.status === 'CREATED' || order.status === 'PAYER_ACTION_REQUIRED') return 'not_approved';
  if (order.status === 'VOIDED') return 'failed';
  return 'not_paid';
}

const STATUS = { wrong_product: 403, not_found: 404 };
const fail = (code) => json({ error: code }, STATUS[code] || 402);

async function createOrder(env) {
  const { status, body } = await paypal(env, '/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: PRODUCT,
        description: 'Resume builder upgrade: keep up to 20 resumes (one-time)',
        amount: { currency_code: 'USD', value: PRICE },
      }],
      // Digital product: don't ask for a shipping address.
      application_context: { shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
    }),
  });
  if ((status !== 201 && status !== 200) || !body.id) {
    console.error('PayPal create order failed', status, JSON.stringify(body).slice(0, 500));
    return json({ error: 'paypal_unavailable' }, 502);
  }
  return json({ id: body.id });
}

async function readOrder(env, id) {
  const got = await paypal(env, '/v2/checkout/orders/' + encodeURIComponent(id));
  if (got.status === 404) return { error: 'not_found' };
  if (got.status !== 200) {
    console.error('PayPal get order failed', got.status, JSON.stringify(got.body).slice(0, 500));
    return { error: 'paypal_unavailable' };
  }
  return { order: got.body };
}

async function captureOrder(request, env, signer) {
  const input = await request.json().catch(() => ({}));
  const id = String((input && input.orderID) || '');
  if (!ORDER_ID.test(id)) return json({ error: 'missing_order' }, 400);

  // 1. Read the order and refuse anything that isn't the upgrade before charging the buyer.
  let read = await readOrder(env, id);
  if (read.error) return read.error === 'paypal_unavailable' ? json({ error: read.error }, 502) : fail(read.error);
  const product = checkProduct(read.order, env);
  if (product) return fail(product);

  // 2. Take the payment, unless an earlier attempt already did.
  if (read.order.status !== 'COMPLETED') {
    const cap = await paypal(env, '/v2/checkout/orders/' + encodeURIComponent(id) + '/capture', { method: 'POST' });
    const issue = issueOf(cap.body);
    if (cap.status === 404) return fail('not_found');
    if (issue === 'INSTRUMENT_DECLINED') return fail('declined');
    if (issue === 'ORDER_NOT_APPROVED') return fail('not_approved');
    if (CAPTURE_FAILED.has(issue)) return fail('failed');
    if (cap.status === 202 || issue === 'PREVIOUS_REQUEST_IN_PROGRESS') return fail('pending');
    if (cap.status >= 500 || cap.status === 401 || cap.status === 403 || cap.status === 429) {
      console.error('PayPal capture failed', cap.status, issue);
      return json({ error: 'paypal_unavailable' }, 502);
    }
    // 2xx, or ORDER_ALREADY_CAPTURED on a retry: the order itself says what happened.
    read = await readOrder(env, id);
    if (read.error) return read.error === 'paypal_unavailable' ? json({ error: read.error }, 502) : fail(read.error);
  }

  // 3. Issue the key only for a completed payment of the right amount.
  const problem = checkPayment(read.order, env);
  if (problem) return fail(problem);
  const t = Math.floor(Date.parse(read.order.create_time || '') / 1000) || 0;
  return json({ key: await signWith(signer, { v: 1, p: 'plus', id: 'pp_' + read.order.id, t }) });
}

export async function onRequestPost({ request, env, params }) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET || !env.PAYPAL_MERCHANT_ID || !env.LICENSE_PRIVATE_KEY) return json({ error: 'not_configured' }, 500);
  let signer;
  try {
    signer = await importSigner(env.LICENSE_PRIVATE_KEY);
  } catch (e) {
    console.error('LICENSE_PRIVATE_KEY is not a valid Ed25519 PKCS#8 key', e);
    return json({ error: 'not_configured' }, 500);
  }
  try {
    if (params.action === 'order') return await createOrder(env);
    if (params.action === 'capture') return await captureOrder(request, env, signer);
    return json({ error: 'not_found' }, 404);
  } catch (e) {
    console.error('PayPal request failed', e);
    return json({ error: 'paypal_unavailable' }, 502);
  }
}
