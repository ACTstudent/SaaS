# Inkwell Resume Builder

A resume builder that runs entirely in the browser. "Inkwell" is a placeholder name.

- **Resume Builder:** 5 templates (Classic, Two-column, Side headings, Header band, ATS simple), 6 design presets plus accent/font/spacing/paper options, drag or arrow reordering of sections, live preview with page-break markers, PDF export (browser Save as PDF, so text stays selectable for ATS), copy as plain text, responsive layout.
- **Built-in Resume Writing Assistant** (`src/engine.js`): rule-based, no network. Grammar, spelling, awkward phrasing, rephrase, make concise, professional tone, stronger action verbs, filler-word removal, repeated-word detection, and resume-specific tips (action-verb starts, tense by role, measurable results, clichés, bullet length, period consistency, splitting paragraphs over 7 lines, and turning 3+ points in one line into bullets).
- **Formats and resume score** (`src/templates.js` FORMATS, `computeScore` in `src/app.js`): Chronological, Hybrid or Skills-based section order; the score also checks page length (1 page, or 2 with 10+ years), body text 10.5 to 12 pt, margins of at least 0.75 in, and standard section headings.
- **Pricing limits:** Free keeps 3 resumes (the example doesn't count); the one-time $10 upgrade raises it to 20. PayPal checkout is built but **not connected** (no PayPal account yet), so the upgrade dialog has an "Unlock for testing" button.
- **Storage:** `localStorage` in the user's browser. No accounts. The only server code is the payment function at `/api/paypal`.

## Layout

| Path | What |
| --- | --- |
| `index.html` | Page markup (dev entry; open directly in a browser) |
| `src/config.js` | Launch settings: PayPal client ID, payment API path, license public key, support email |
| `src/engine.js` | Writing Assistant rules engine (browser global + CommonJS) |
| `src/license.js` | License keys for the upgrade (Ed25519, checked on the device) |
| `src/templates.js` | Templates, presets, sample resume, resume renderer, plain-text export |
| `src/app.js` | Landing page, dashboard, editor, assistant panel, plan limits, backups, export |
| `src/styles.css` | App styles, resume templates, print styles |
| `public/` | Favicon, app icons, share image, manifest, offline worker, privacy and terms pages, Cloudflare headers |
| `functions/api/paypal/[action].js` | Cloudflare Pages Function: creates the $10 PayPal order, completes the payment and returns a license key |
| `scripts/build.mjs` | Builds `dist/site/` (upload this), `dist/index.html` and `dist/artifact.html` |
| `scripts/keygen.mjs`, `scripts/issue-key.mjs` | Make the signing key pair; issue a key by hand |
| `test/` | Engine, license and checkout-function tests |

```
npm test                                  # engine, template, license and payment tests
SITE_URL=https://your.domain npm run build
npm run keygen                            # production license key pair
```

## How the upgrade works

1. When `paypalClientId` is set, the upgrade dialog shows PayPal's buttons (PayPal account, or a debit or credit card without a PayPal account). Without it, the dialog offers "Unlock for testing". Venmo can be added later with `&enable-funding=venmo` in the SDK URL in `src/app.js` once it has been tested on a phone.
2. Clicking a button calls `POST /api/paypal/order`. The server creates a PayPal order for $10.00 USD (the price is `PRICE` in the function, so the browser can't change it; if you change it, also change `price` in `src/config.js`, `index.html` and `public/terms.html`).
3. After the buyer approves in the PayPal window, the app calls `POST /api/paypal/capture` with the order ID. The server first reads the order and refuses anything that isn't the upgrade, at $10.00, paid to `PAYPAL_MERCHANT_ID`, before any money moves. Then it completes the payment, reads the order back, and returns a signed key only when the payment is complete (the same key every time for that order). The order ID is saved in the browser first, so a closed tab or lost connection can finish unlocking on the next visit, and the upgrade window offers "Finish unlocking" instead of a second payment.
4. The app checks the key's signature on the device and unlocks 20 resumes. The buyer is shown the key to unlock other browsers, and it is included in backups.

The plan only counts while a valid key backs it, so editing the saved data no longer unlocks the upgrade. Someone could still share a key or patch the page's code; that is the trade-off for having no accounts.

## Launch checklist

1. **Name and domain.** Replace "Inkwell" (`src/config.js`, `index.html`, `public/*`), then build with `SITE_URL`.
2. **Signing keys.** Run `npm run keygen`. Put the public key in `src/config.js` (the current one is a preview key) and the private key in the hosting secret `LICENSE_PRIVATE_KEY`.
3. **PayPal.** Open a PayPal Business account. In the PayPal developer dashboard (Apps & Credentials), create a REST app: test with its Sandbox credentials and a sandbox buyer account first, then switch to Live. Put the client ID in `src/config.js` as `paypalClientId`, and set the hosting secrets `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID` (the seller account's merchant ID, under Account settings > Business information; the sandbox business account has its own) and `PAYPAL_ENV=live` (leave `PAYPAL_ENV` unset for the sandbox). Use a sandbox signing key pair while testing so sandbox keys don't work on the live site. Decide how sales tax/VAT is handled; PayPal does not collect it for you.
4. **Hosting.** Cloudflare Pages: upload `dist/site/` with the `functions/` folder next to it (`wrangler pages deploy dist/site`), or connect a GitHub repo.
5. **Legal pages.** Fill in the bracketed placeholders in `public/privacy.html` and `public/terms.html` and have them reviewed.
