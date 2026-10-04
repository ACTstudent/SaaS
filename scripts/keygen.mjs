// Prints a new Ed25519 key pair for license keys.
//   public key  -> src/config.js licensePublicKey
//   private key -> Cloudflare secret LICENSE_PRIVATE_KEY (never commit it)
import { createRequire } from 'node:module';
const License = createRequire(import.meta.url)('../src/license.js');
const { publicKey, privateKey } = await License.generateKeyPair();
console.log('licensePublicKey (src/config.js):\n' + publicKey + '\n');
console.log('LICENSE_PRIVATE_KEY (secret, keep out of the repo):\n' + privateKey);
