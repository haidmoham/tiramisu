# search review

Baseline: `3e51fe0`. Review branch: `codex/search-experience`.

The live reader labeled old results with newly typed, unsubmitted text. Clearing
an empty search did not clear its draft. Pending searches disabled submission,
and failed searches left old result buttons visible without a retry action.

Search labels now follow the submitted query. Queries normalize whitespace and
persist with the selected mode in `?q=…&by=…`. Bookmarks and reloads restore them.
A replacement search aborts its predecessor, and late or timed-out responses
cannot change the current shelf. Pending requests expire after 20 seconds.
Loading, empty, and error states expose clear recovery actions. Clearing search
restores the curated shelf and smart mode. Reader return restores query, results,
scroll position, and the selected result's keyboard focus within the same tab.
Album context distinguishes recordings, and ranking keeps accented artist names
as complete tokens. Existing retrieval and branding are preserved.

Verification: build, lint, 73 unit tests, and 24 browser tests passed. Browser
coverage includes 390px and 1280px query entry, URL/reload restoration, keyboard
selection, reader return, result relevance, theme, comments, and touch scrolling.
The public LRCLIB endpoint returned 20 candidates for `bloc party` during the
initial audit; a later exact-query probe returned HTTP 503. Catalog availability
is external. Recovery behavior is tested with controlled responses. Broad typo
retrieval, unavailable lyrics, and real-device iOS keyboard behavior remain
outside this bounded change. No main merge or custom-domain cutover is included.
