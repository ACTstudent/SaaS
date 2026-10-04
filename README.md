# Inkwell Resume Builder

A free resume builder that runs entirely in the browser. "Inkwell" is a placeholder name.

- **Resume Builder:** 6 templates (Classic, Two-column, Side headings, Header band, Photo, ATS simple), an optional profile photo (cropped and shrunk to about 25 KB before saving), 6 design presets plus accent/font/spacing/paper options, drag or arrow reordering of sections, live preview with page-break markers, PDF export (browser Save as PDF, so text stays selectable for ATS), copy as plain text, responsive layout.
- **Built-in Resume Writing Assistant** (`src/engine.js`): rule-based, no network. Grammar, spelling, awkward phrasing, rephrase, make concise, professional tone, stronger action verbs, filler-word removal, repeated-word detection, and resume-specific tips (action-verb starts, tense by role, measurable results, clichés, bullet length, period consistency, splitting paragraphs over 7 lines, and turning 3+ points in one line into bullets).
- **Formats and resume score** (`src/templates.js` FORMATS, `computeScore` in `src/app.js`): Chronological, Hybrid or Skills-based section order; the score also checks page length (1 page, or 2 with 10+ years), body text 10.5 to 12 pt, margins of at least 0.75 in, and standard section headings.
- **Free:** every feature, no limit on resumes, no account and no payments. The paid upgrade (PayPal checkout and license keys) was removed; it is in the git history before the commit that made the app free.
- **Storage:** `localStorage` in the user's browser, so the browser's storage (about 5 MB) is the only ceiling; the app warns when it's full. No accounts and no server code.

## Layout

| Path | What |
| --- | --- |
| `index.html` | Page markup (dev entry; open directly in a browser) |
| `src/engine.js` | Writing Assistant rules engine (browser global + CommonJS) |
| `src/templates.js` | Templates, presets, sample resume, resume renderer, plain-text export |
| `src/app.js` | Landing page, dashboard, editor, assistant panel, backups, export |
| `src/styles.css` | App styles, resume templates, print styles |
| `public/` | Favicon, app icons, share image, manifest, offline worker, privacy and terms pages, Cloudflare headers |
| `scripts/build.mjs` | Builds `dist/site/` (upload this), `dist/index.html` and `dist/artifact.html` |
| `test/` | Writing Assistant engine and template tests |

```
npm test                                  # engine and template tests
SITE_URL=https://your.domain npm run build
```

## Launch checklist

1. **Name and domain.** Replace "Inkwell" (`index.html`, `public/*`), then build with `SITE_URL`.
2. **Hosting.** Any static host: upload `dist/site/`, or connect the GitHub repo (Vercel or Cloudflare Pages).
3. **Legal pages.** Fill in the bracketed placeholders in `public/privacy.html` and `public/terms.html` and have them reviewed.
