// Issues a license key by hand, e.g. for a refund-replacement or a gift.
//   LICENSE_PRIVATE_KEY=... node scripts/issue-key.mjs [note]
import { createRequire } from 'node:module';
const License = createRequire(import.meta.url)('../src/license.js');
const priv = process.env.LICENSE_PRIVATE_KEY;
if (!priv) { console.error('Set LICENSE_PRIVATE_KEY first.'); process.exit(1); }
const id = 'manual_' + (process.argv[2] || Date.now().toString(36)).replace(/[^\w-]/g, '');
console.log(await License.sign({ v: 1, p: 'plus', id, t: Math.floor(Date.now() / 1000) }, priv));
