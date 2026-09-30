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

Alice by Cherry is the exact acceptance recording: Spotify track
`0v5ovlm1Go2tkZJrXg26Hg` (single) and `4vWEwuhsAWuezeUoYAp3aP` (Safe In Your
Stare), duration 241935ms. The metadata provider identifies the album recording
as Deezer track `2924992271`, duration 241s.

Read-only live probes on 2026-09-30 found:
- LRCLIB `search?q=Alice Cherry`: HTTP 200, 20 unrelated matches, no exact pair.
- lyrics.ovh `suggest/Alice Cherry`: HTTP 200, 15 candidates; the exact pair was
  thirteenth, beyond the former twelve-result truncation.
- Broad `Alice` and `Cherry` searches in both catalogs omitted this recording.
- Structured LRCLIB title/artist search returned 503 twice, then HTTP 200 with
  an empty array. Exact LRCLIB get, with and without album constraints, returned
  404. LrcMux exact requests with and without album/duration and the single-album
  variant returned 404. lyrics.ovh `/v1/Cherry/Alice` also returned 404.

Search now enriches useful primary results with the metadata catalog, ranks the
full response before limiting it, and prioritizes exact title/artist pairs in
both orders. Duplicate metadata preserves the primary stable lyric ID. An
independent five-second enrichment timeout preserves useful primary results
when metadata fails. Known unavailable/404 reader responses explain source
absence and show the selected recording identity, with a return to the search.
The correct recording is discoverable; readable lyrics remain absent from the
current providers. No alternate song or lyric text is substituted.

Verification: build, lint, 78 unit tests, and 26 isolated headless browser tests
passed. Browser coverage includes 390px and 1280px query entry, URL/reload
restoration, keyboard selection, reader return, result relevance, theme,
comments, touch scrolling, and the exact Alice/Cherry discovery/absence path.
A temporary real-provider Vitest probe also passed: `Alice Cherry` returned the
exact recording first. It was removed after verification to avoid a
network-dependent permanent test.

The previous preview had live Chrome verification for Bloc Party search,
opening Sunday, and restoring the draft, focus, and scroll on return. Updated
Alice coverage uses isolated headless Chromium and real-provider probes; shared
Chrome is reserved for another task. Broad typo retrieval and real-device iOS
keyboard behavior remain outside this bounded change. Catalog availability is
external. No main merge or custom-domain cutover is included.
