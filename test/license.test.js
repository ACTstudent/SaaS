const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/license.js');

test('signed keys verify and tampered keys fail', async () => {
  const { publicKey, privateKey } = await L.generateKeyPair();
  const key = await L.sign({ v: 1, p: 'plus', id: 'pp_TEST123', t: 1 }, privateKey);
  assert.ok(key.startsWith('INK1.'));
  const ok = await L.verify(key, publicKey);
  assert.equal(ok.ok, true);
  assert.equal(ok.data.id, 'pp_TEST123');
  // whitespace from copy/paste is tolerated
  assert.equal((await L.verify(key.slice(0, 20) + '\n ' + key.slice(20), publicKey)).ok, true);
  // edited payload
  const [, body, sig] = key.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, p: 'plus', id: 'free', t: 1 })).toString('base64url');
  assert.equal((await L.verify(`INK1.${forged}.${sig}`, publicKey)).reason, 'signature');
  // key from a different signer
  const other = await L.generateKeyPair();
  assert.equal((await L.verify(await L.sign({ v: 1, p: 'plus', id: 'x', t: 1 }, other.privateKey), publicKey)).reason, 'signature');
  assert.equal((await L.verify('hello', publicKey)).reason, 'format');
  assert.equal((await L.verify(key, '')).reason, 'nokey');
  assert.ok(body);
});

// A fake PayPal API: orders by id, recording what the function sends.
const MERCHANT = 'MERCHANT123';
function fakePayPal(orders) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    const method = (init && init.method) || 'GET';
    calls.push({ host: u.host, path: u.pathname, method, body: init && init.body });
    const reply = (status, body) => new Response(JSON.stringify(body), { status });
    if (u.pathname === '/v1/oauth2/token') {
      assert.equal(init.headers.Authorization, 'Basic ' + Buffer.from('cid:secret').toString('base64'));
      return reply(200, { access_token: 'tok', expires_in: 32400 });
    }
    assert.equal(init.headers.Authorization, 'Bearer tok');
    if (u.pathname === '/v2/checkout/orders' && method === 'POST') return reply(201, { id: 'NEWORDER0000001', status: 'CREATED' });
    const m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/);
    const o = m && orders[m[1]];
    if (!o) return reply(404, { name: 'RESOURCE_NOT_FOUND', details: [{ issue: 'INVALID_RESOURCE_ID' }] });
    if (m[2]) {
      if (o.captureReply) { const r = o.captureReply.shift(); if (r) return reply(r[0], r[1]); }
      if (o.order.status === 'COMPLETED') return reply(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
      if (o.order.status !== 'APPROVED') return reply(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_NOT_APPROVED' }] });
      o.order.status = 'COMPLETED';
      o.order.purchase_units[0].payments = { captures: [{ id: 'CAP' + m[1], status: o.captureStatus || 'COMPLETED', amount: o.order.purchase_units[0].amount }] };
      return reply(201, { id: m[1], status: 'COMPLETED' });
    }
    return reply(200, o.order);
  };
  return { fetch, calls, captures: (id) => calls.filter((c) => c.path === `/v2/checkout/orders/${id}/capture`).length };
}
const unit = (over) => Object.assign({ reference_id: 'inkwell-plus', amount: { currency_code: 'USD', value: '10.00' }, payee: { email_address: 'seller@example.com', merchant_id: MERCHANT } }, over);
const order = (id, status, u, extra) => Object.assign({ order: { id, intent: 'CAPTURE', status, create_time: '2026-10-04T12:00:00Z', purchase_units: Array.isArray(u) ? u : [u || unit()] } }, extra);
const issue = (status, name) => [status, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: name }] }];

async function payEnv() {
  const pair = await L.generateKeyPair();
  return { pair, env: { PAYPAL_CLIENT_ID: 'cid', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_MERCHANT_ID: MERCHANT, LICENSE_PRIVATE_KEY: pair.privateKey } };
}
async function withFetch(fake, fn) {
  const realFetch = global.fetch;
  global.fetch = fake;
  try { return await fn(); } finally { global.fetch = realFetch; }
}
const post = (onRequestPost, env, action, body) => onRequestPost({ request: new Request('https://site/api/paypal/' + action, { method: 'POST', body: JSON.stringify(body || {}) }), env, params: { action } });

test('PayPal function: creates a $10 order and issues keys only for completed upgrade payments', async () => {
  const { onRequestPost } = await import('../functions/api/paypal/[action].js');
  const { pair, env } = await payEnv();
  const pp = fakePayPal({
    APPROVED0000001: order('APPROVED0000001', 'APPROVED'),
    CREATED00000001: order('CREATED00000001', 'CREATED'),
    PENDING00000001: order('PENDING00000001', 'APPROVED', null, { captureStatus: 'PENDING' }),
    DECLINED0000001: order('DECLINED0000001', 'APPROVED', null, { captureReply: [issue(422, 'INSTRUMENT_DECLINED')] }),
    REFUSED00000001: order('REFUSED00000001', 'APPROVED', null, { captureReply: [issue(422, 'TRANSACTION_REFUSED')] }),
    BUSY00000000001: order('BUSY00000000001', 'APPROVED', null, { captureReply: [issue(409, 'PREVIOUS_REQUEST_IN_PROGRESS')] }),
    CARDFAIL0000001: order('CARDFAIL0000001', 'APPROVED', null, { captureStatus: 'DECLINED' }),
  });
  const call = (action, body) => post(onRequestPost, env, action, body);
  const capture = (orderID) => call('capture', { orderID });
  await withFetch(pp.fetch, async () => {
    // Creating an order: the server sets the price, in USD, for the upgrade product, with no shipping
    const created = await call('order');
    assert.equal(created.status, 200);
    assert.equal((await created.json()).id, 'NEWORDER0000001');
    const sent = JSON.parse(pp.calls.find((c) => c.path === '/v2/checkout/orders').body);
    assert.equal(sent.intent, 'CAPTURE');
    assert.deepEqual(sent.purchase_units[0].amount, { currency_code: 'USD', value: '10.00' });
    assert.equal(sent.purchase_units[0].reference_id, 'inkwell-plus');
    assert.equal(sent.application_context.shipping_preference, 'NO_SHIPPING');
    assert.equal(pp.calls[0].path, '/v1/oauth2/token');
    assert.ok(pp.calls.every((c) => c.host === 'api-m.sandbox.paypal.com')); // sandbox unless PAYPAL_ENV=live

    // Approved order: captured, then a valid key; asking again returns the same key without a second capture
    const r = await capture('APPROVED0000001');
    assert.equal(r.status, 200);
    const { key } = await r.json();
    const v = await L.verify(key, pair.publicKey);
    assert.equal(v.ok, true);
    assert.equal(v.data.id, 'pp_APPROVED0000001');
    assert.equal(v.data.t, Date.parse('2026-10-04T12:00:00Z') / 1000);
    assert.equal((await (await capture('APPROVED0000001')).json()).key, key);
    assert.equal(pp.captures('APPROVED0000001'), 1);

    const expect = async (id, status, error) => {
      const res = await capture(id);
      assert.equal(res.status, status, id);
      assert.equal((await res.json()).error, error, id);
    };
    await expect('CREATED00000001', 402, 'not_approved'); // buyer never approved
    await expect('PENDING00000001', 402, 'pending');
    await expect('DECLINED0000001', 402, 'declined'); // the app restarts PayPal so the buyer can pick another card
    assert.equal((await capture('DECLINED0000001')).status, 200); // ...and the next capture goes through
    await expect('REFUSED00000001', 402, 'failed');
    await expect('BUSY00000000001', 402, 'pending');
    await expect('CARDFAIL0000001', 402, 'failed');
    await expect('MISSING00000001', 404, 'not_found');
    await expect('not an id', 400, 'missing_order');
    assert.equal((await call('refund')).status, 404);
  });
});

test('PayPal function: refuses orders for another product, price or payee before taking any money', async () => {
  const { onRequestPost } = await import('../functions/api/paypal/[action].js');
  const { env } = await payEnv();
  const bad = {
    CHEAP0000000001: order('CHEAP0000000001', 'APPROVED', unit({ amount: { currency_code: 'USD', value: '1.00' } })),
    EUROS0000000001: order('EUROS0000000001', 'APPROVED', unit({ amount: { currency_code: 'EUR', value: '10.00' } })),
    OTHERITEM000001: order('OTHERITEM000001', 'APPROVED', unit({ reference_id: 'something-else' })),
    ATTACKER0000001: order('ATTACKER0000001', 'APPROVED', unit({ payee: { email_address: 'attacker@example.com', merchant_id: 'ATTACKER9' } })),
    NOPAYEE00000001: order('NOPAYEE00000001', 'APPROVED', unit({ payee: undefined })),
    TWOUNITS0000001: order('TWOUNITS0000001', 'APPROVED', [unit(), unit({ reference_id: 'extra' })]),
    AUTHORIZE000001: Object.assign(order('AUTHORIZE000001', 'APPROVED'), {}),
  };
  bad.AUTHORIZE000001.order.intent = 'AUTHORIZE';
  const pp = fakePayPal(bad);
  await withFetch(pp.fetch, async () => {
    for (const id of Object.keys(bad)) {
      const res = await post(onRequestPost, env, 'capture', { orderID: id });
      assert.equal(res.status, 403, id);
      assert.equal((await res.json()).error, 'wrong_product', id);
      assert.equal(pp.captures(id), 0, id + ' must not be captured');
    }
  });
});

test('PayPal function: setup problems stop payments before anyone is charged', async () => {
  const mod = await import('../functions/api/paypal/[action].js');
  const { env } = await payEnv();
  const pp = fakePayPal({ APPROVED0000002: order('APPROVED0000002', 'APPROVED') });
  await withFetch(pp.fetch, async () => {
    for (const missing of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_MERCHANT_ID', 'LICENSE_PRIVATE_KEY']) {
      const e = Object.assign({}, env, { [missing]: '' });
      assert.equal((await post(mod.onRequestPost, e, 'order')).status, 500, missing);
    }
    // A malformed signing key (or the public key pasted by mistake) is caught before an order or capture
    const pub = (await L.generateKeyPair()).publicKey;
    for (const badKey of ['bm90LWEta2V5', pub]) {
      const e = Object.assign({}, env, { LICENSE_PRIVATE_KEY: badKey });
      assert.equal((await post(mod.onRequestPost, e, 'order')).status, 500);
      const res = await post(mod.onRequestPost, e, 'capture', { orderID: 'APPROVED0000002' });
      assert.equal((await res.json()).error, 'not_configured');
    }
    assert.equal(pp.calls.length, 0);
  });
});

test('PayPal function: payment checks and live mode', async () => {
  const mod = await import('../functions/api/paypal/[action].js');
  const env = { PAYPAL_MERCHANT_ID: MERCHANT };
  const done = (status, cap) => ({ id: 'X', intent: 'CAPTURE', status, purchase_units: [Object.assign(unit(), { payments: { captures: [Object.assign({ amount: { currency_code: 'USD', value: '10.00' } }, cap)] } })] });
  assert.equal(mod.checkPayment(done('COMPLETED', { status: 'COMPLETED' }), env), '');
  assert.equal(mod.checkPayment(done('COMPLETED', { status: 'COMPLETED', amount: { currency_code: 'USD', value: '10' } }), env), '');
  assert.equal(mod.checkPayment(done('COMPLETED', { status: 'REFUNDED' }), env), 'refunded');
  assert.equal(mod.checkPayment(done('COMPLETED', { status: 'PARTIALLY_REFUNDED' }), env), 'refunded');
  assert.equal(mod.checkPayment(done('COMPLETED', { status: 'FAILED' }), env), 'failed');
  assert.equal(mod.checkPayment(done('COMPLETED', { status: 'COMPLETED', amount: { currency_code: 'EUR', value: '10.00' } }), env), 'not_paid');
  assert.equal(mod.checkPayment(done('COMPLETED', { status: 'COMPLETED' }), { PAYPAL_MERCHANT_ID: 'SOMEONE' }), 'wrong_product');
  assert.equal(mod.PRICE, '10.00');

  const { privateKey } = await L.generateKeyPair();
  const hosts = new Set();
  await withFetch(async (url) => { hosts.add(new URL(url).host); return new Response('{}', { status: 500 }); }, async () => {
    const res = await post(mod.onRequestPost, { PAYPAL_ENV: 'live', PAYPAL_CLIENT_ID: 'live-id', PAYPAL_CLIENT_SECRET: 's', PAYPAL_MERCHANT_ID: MERCHANT, LICENSE_PRIVATE_KEY: privateKey }, 'order');
    assert.equal(res.status, 502);
    assert.deepEqual([...hosts], ['api-m.paypal.com']);
  });
});
