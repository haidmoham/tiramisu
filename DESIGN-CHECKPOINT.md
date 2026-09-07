# blog grammar checkpoint

blue-hour masthead, cream and coral themes, restrained search rows, serif lyrics, and the approved 100.8px 86 signature. reader identity now stays in document flow to avoid covering lyrics.

verified in the in-app browser at 390px: search and reader have no horizontal overflow; light/dark themes, comments tab, focus reading, keyboard focus and signature pause work. desktop visual review completed before the final spacing fixes.

run `node scripts/check-contrast.mjs` for the 24 text token/background pairings in both themes. the photo masthead requires separate visual review. this is a targeted check, not a full accessibility audit.

initial unit tests, lint and build passed. the final parallel test rerun exhausted worker startup time; retry uses `npm test -- --maxWorkers=1`. inspect final test output before publication. remaining: finish desktop reader and mobile comments content checks, rerun final build after contrast changes, then publish if requested.

preview: http://localhost:5188/
