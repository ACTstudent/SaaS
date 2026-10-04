/*
 * License keys for the one-time upgrade. A key is a small signed payload:
 *   INK1.<base64url(JSON payload)>.<base64url(Ed25519 signature of the payload part)>
 * The app checks the signature on the device with the public key, so no server call is needed to unlock.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ResumeLicense = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PREFIX = 'INK1.';
  const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;

  function bytesToB64(bytes) {
    let s = '';
    const b = new Uint8Array(bytes);
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function b64ToBytes(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  const toUrl = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromUrl = (u) => { const b = u.replace(/-/g, '+').replace(/_/g, '/'); return b + '='.repeat((4 - (b.length % 4)) % 4); };
  const utf8 = (s) => new TextEncoder().encode(s);

  function normalize(key) { return String(key || '').replace(/\s+/g, ''); }

  /** Returns { ok: true, data } or { ok: false, reason: 'format'|'signature'|'plan'|'unsupported'|'nokey' }. */
  async function verify(key, publicKeyB64) {
    key = normalize(key);
    if (!publicKeyB64) return { ok: false, reason: 'nokey' };
    if (!key.startsWith(PREFIX)) return { ok: false, reason: 'format' };
    const parts = key.slice(PREFIX.length).split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'format' };
    const sc = subtle();
    if (!sc) return { ok: false, reason: 'unsupported' };
    let pub;
    try {
      pub = await sc.importKey('raw', b64ToBytes(publicKeyB64), { name: 'Ed25519' }, false, ['verify']);
    } catch (e) {
      return { ok: false, reason: 'unsupported' };
    }
    let good = false, data = null;
    try {
      good = await sc.verify({ name: 'Ed25519' }, pub, b64ToBytes(fromUrl(parts[1])), utf8(parts[0]));
      if (good) data = JSON.parse(new TextDecoder().decode(b64ToBytes(fromUrl(parts[0]))));
    } catch (e) {
      return { ok: false, reason: 'format' };
    }
    if (!good) return { ok: false, reason: 'signature' };
    if (!data || data.v !== 1 || data.p !== 'plus') return { ok: false, reason: 'plan' };
    return { ok: true, data };
  }

  /** Signs a payload with a PKCS#8 Ed25519 private key (base64). Used by the key script and the checkout function. */
  async function sign(payload, privateKeyB64) {
    const sc = subtle();
    const priv = await sc.importKey('pkcs8', b64ToBytes(privateKeyB64), { name: 'Ed25519' }, false, ['sign']);
    const body = toUrl(bytesToB64(utf8(JSON.stringify(payload))));
    const sig = await sc.sign({ name: 'Ed25519' }, priv, utf8(body));
    return PREFIX + body + '.' + toUrl(bytesToB64(sig));
  }

  async function generateKeyPair() {
    const sc = subtle();
    const kp = await sc.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    return {
      publicKey: bytesToB64(await sc.exportKey('raw', kp.publicKey)),
      privateKey: bytesToB64(await sc.exportKey('pkcs8', kp.privateKey)),
    };
  }

  return { PREFIX, verify, sign, generateKeyPair, normalize };
});
