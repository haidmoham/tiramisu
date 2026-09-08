# tiramisu design checkpoint

original moving color blob restored as the central visual motif. the blog-inspired type, blue-hour/cream palette, coral details and reading surfaces remain. the photo masthead has been replaced by the color field.

verified: 62 unit tests, lint, production build, and 24 text/background contrast pairings pass (minimum 4.74:1). desktop and 390px search, reader and comments recovery state visually inspected after restoring the blob. no horizontal overflow; the keyboard skip link focuses main-content. theme, focus reading and signature pause checks passed. the external comments service was unavailable in the local check; its recovery state remained readable.

run `node scripts/check-contrast.mjs` to check the palette. this is a targeted check, not a complete accessibility audit.

preview: http://localhost:5188/
production: https://tiramisu.shin86.dev/

published the approved redesign from `7f95c68` on 2026-09-07. vercel deployment `dpl_EYUF1KBGvXriF2VaRBTNpdW9466x` is ready and assigned to the custom domain. verified HTTP 200 for the homepage, matching production JS/CSS bundles, and signature asset. the fresh live browser check timed out; the desktop/mobile visual checks above were performed locally before publication.


reader refinement: the title card stays sticky above scrolling lyrics (155px desktop, 80px mobile). the reading backing uses 40% paper, a 14px backdrop blur, a faint sheen and a translucent edge. light-theme lyric ink is deepened and phone lyrics are at least 24px. sampled shader endpoint composites exceed the 3:1 large-text threshold (3.60:1 light, 7.33:1 dark); this is a sampled check, not an exhaustive animated-pixel audit. light/somber and desktop/390px scroll views were visually checked, with no phone horizontal overflow.
