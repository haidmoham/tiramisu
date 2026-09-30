# lyrics sourcing review

Base: merged search PR #6, `ba68cb8a147be302c9a1619fca584158237826ac`.
Branch: `codex/lyrics-sourcing`. This pass is a separate review change.

## acceptance recording

Alice by Cherry, Safe In Your Stare, released 2021-09-24, approximately 4:01.
The metadata lookup identifies Deezer track 2924992271, duration 241 seconds.
The parent's independent research identifies Spotify track
[4X8vRe0aLuv2lYOD2CuKWd](https://open.spotify.com/track/4X8vRe0aLuv2lYOD2CuKWd),
with ©/℗ 2021 Cherry. Earlier search research observed additional Spotify IDs;
none is used to manufacture lyrics or substitute another recording.

The supplied Library screenshot was materialized with its Library identity
preserved and visually inspected. It shows Alice — Cherry and the unavailable
lyric state from the search preview. It supplies evidence of the UI, not of an
external lyric source or permission to reproduce text.

## current sources and constraints

| Service | App use | Contract and coverage | Permission/provenance limit |
| --- | --- | --- | --- |
| [LRCLIB](https://lrclib.net/docs) | Keyword/title search and stable-ID lyric get | Free/keyless API; search returns at most 20, without pagination. Exact duration matching has a ±2s tolerance. Alice title/artist structured search returned empty; exact get returned 404. A miss can later resolve through upstream background fetching. | The [server's MIT license](https://github.com/tranxuanthang/lrclib) covers software; it is not evidence of a blanket lyric reproduction license. |
| [lyrics.ovh](https://github.com/NTag/lyrics.ovh) | Metadata suggestions only | Its documented suggestion endpoint returns Deezer metadata. Alice/Cherry exists there. Its separate lyric endpoint returned 404 in the audit. | Metadata discovery does not prove lyric availability. No new full-text integration added. |
| [LrcMux](https://lrcmux.dev/docs) | Existing selected-track lyric retrieval | `level=none` allows unsynced text; it is not a synced-only request. Duration is integer seconds. JSON exposes track identity and `meta.source`; 429 supplies Retry-After. Exact Alice requests with/without album and duration returned 404. | Aggregation availability does not establish permission to reproduce every upstream source. This pass preserves source attribution without claiming a license. No private endpoint or antibot workaround added. |
| [Genius API](https://genius.engineering/introducing-the-genius-api/) | Existing comments integration; a new labelled external search link on lyric failures | Official API is for metadata/search/annotations; no verified authorized full-text source for Alice was found. | External search is labelled “search Genius”, not “read lyrics”. No full-text scraping integration. |

Provider coverage snapshots are in [search-review.md](search-review.md).
No verified authorized public full lyric source for this exact recording was
found. A public page or API response alone does not establish permission for
app reproduction. [Musixmatch](https://www.postman.com/musixmatch-dev) and
[LyricFind](https://www.lyricfind.com/products/lyric-display) are licensed-source
candidates; current coverage, entitlements, cost, territory, attribution, and
caching terms need confirmation before implementation. No account, contract,
API credential, outreach, or paid service was created.

## bounded implementation

- Metadata summaries carry duration and separate lyric availability. A metadata
  suggestion is labelled “lyrics not confirmed”; it does not promise a sheet.
- Existing LrcMux responses must match normalized title/artist and supplied
  album/duration before any lines are displayed. Typography and accents are
  normalized, while live/remix/version words remain significant. Integer API
  duration is rounded; recording validation uses the original duration ±2s.
- LRCLIB recovery of a missing metadata link requires a unique recording match,
  including supplied album/duration. A differing version or ambiguous set never
  silently selects the first candidate. The returned document is checked too.
- Different albums remain separate when combining metadata and lyric catalogs.
- LRCLIB attribution and LrcMux upstream source name/URL are retained and shown.
  Only HTTP(S) source links without embedded credentials are accepted.
- Missing lyrics, instrumentals, source restrictions, unconfirmed recordings,
  and provider outages have separate reader states. Saved metadata links retain
  title and artist after reload. Missing/outage states offer retry; external
  search preserves the song/artist query. The lyric request expires after 20s,
  and aborted/late responses cannot replace its state.
- Both existing adapters honor 429 Retry-After, including HTTP dates, by blocking
  new network requests until the cooldown expires. The reader disables retry
  during that interval. There are no automated retries or forced refreshes.
- No application-level lyric or miss cache was added. A miss is retryable and
  does not become a permanent negative entry. Existing upstream/CDN cache
  policies remain external; future caching requires source-specific permission.

## verification and publication

Unit regressions cover recording/version/duration mismatch, ambiguity, distinct
albums, preserved attribution and safe links, typed failure states, Retry-After,
saved-link identity, and retry recovery. Headless browser coverage exercises
Alice/Cherry and outage/retry/attribution on 390px and 1280px surfaces. Real lyric
text is not stored in fixtures or printed in reports.

Shared Chrome remains reserved for the other task. Production and custom
aliases have not been changed. The search PR merge did not trigger an observed
automatic production deployment: Vercel's newest production deployment was
still seven days old immediately after the merge. This sourcing change requires
its own preview review and has no automatic merge authorization.

## laptop handoff — 2026-09-30

This is an explicitly WIP review checkpoint, not a verified release.

- Intermediate build/lint and 86 unit tests passed.
- Expanded final unit run: 92/95 passed; three existing UI tests timed out at
  5s (no-results, clear-to-curated-shelf, ThemeToggle). An earlier unrestricted
  worker run failed during fork startup. These are observed timeout failures,
  not waived checks or proof of an environment-only cause.
- Final browser run: 27/28 passed, including both new Alice/retry/attribution
  flows at 390px and 1280px. The existing native touch-scrolling test exceeded
  its 30s timeout. No test timeouts were increased to hide failures.
- Final build/lint did not run because the preceding unit command failed;
  rerun these on desktop. `git diff --check` passed before checkpoint commit.
- No sourcing preview was deployed and no sourcing changes were merged.

Next: clone/fetch `codex/lyrics-sourcing`, run `npm ci`, rerun the unit suite
with at most two workers, build/lint and the failed browser case, then publish
a review preview after checks pass. Source coverage for Alice remains missing;
new licensed-provider integration still needs verified terms/access.

## Windows review verification - 2026-09-30

The isolated Windows checkout verified the handoff SHA
`811551d2464e9c292982dd6d69a9626e954a26be` and merged search base above.
There is no tracked project `AGENTS.md` or `.agents` directory in this branch;
installed global and local Poneglyph instructions were read.

- `npm ci` completed from the committed lockfile. It reported one high-severity
  dependency advisory; dependencies were not changed in this bounded slice.
- Initial unit run passed 95/95 with two workers. The final run passed 96/96
  after adding a regression for distinct albums/durations within metadata
  suggestions. Exact metadata duplicates are still removed.
- `npm run build`, `npm run lint`, and `git diff --check` passed. The build
  reports existing large-chunk and dependency annotation warnings.
- Final `npm run test:e2e -- --workers=1` passed 28/28, including native touch
  scrolling and Alice/retry/attribution at 390px and 1280px. An intermediate run
  passed 26/28: its outage fixture recovered on the first request, allowing
  development-mode effect replay to consume the failure. The fixture now stays
  unavailable until explicit retry and verifies one additional request. No
  assertion was removed or timeout increased.
- Failure states offer labelled Genius search and Spotify listening search
  links. Neither link claims a verified lyric sheet or exact listening result.
- No interactive in-app browser tool was exposed. Headless Chromium checks are
  automated coverage; a real mobile device and previously opened mobile tab
  remain untested. External provider coverage and lyric permissions remain as
  documented above; mocked browser content is invented QA text.

This slice remains for draft PR and preview review only. No merge, production
cutover, custom alias change, provider account, or credential was authorized.
