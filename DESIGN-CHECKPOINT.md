# tiramisu design checkpoint

original moving color blob restored as the central visual motif. the blog-inspired type, blue-hour/cream palette, coral details and reading surfaces remain. the photo masthead has been replaced by the color field.

verified: 62 unit tests, lint, production build, and 24 text/background contrast pairings pass (minimum 4.74:1). desktop and 390px search, reader and comments recovery state visually inspected after restoring the blob. no horizontal overflow; the keyboard skip link focuses main-content. theme, focus reading and signature pause checks passed. the external comments service was unavailable in the local check; its recovery state remained readable.

run `node scripts/check-contrast.mjs` to check the palette. this is a targeted check, not a complete accessibility audit.

preview: http://localhost:5188/
publication held while the owner reviews the redesign.
