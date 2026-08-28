const API_URL = 'https://api.lrcmux.dev/get'
const CLIENT_ID = 'tiramisu/0.1 (https://github.com/haidmoham/tiramisu)'
const REQUIRED_SUCCESS_RATE = 0.9

const requiredTracks = [
  { title: 'This Modern Love', artist: 'Bloc Party' },
  { title: 'Melancholy', artist: 'Driveways' },
  { title: 'cbd', artist: 'brakence' },
]

// Billboard Hot 100, chart dated 2026-08-29. Metadata only: no lyric text is stored.
const popularTracks = [
  { title: "Choosin' Texas", artist: 'Ella Langley' },
  { title: 'Boston', artist: 'STELLA LEFTY' },
  { title: 'I Knew It, I Knew You', artist: 'Taylor Swift' },
  { title: 'Been By Now', artist: 'Morgan Wallen' },
  { title: 'Hate That I Made You Love Me', artist: 'Ariana Grande' },
  { title: "I Can't Love You Anymore", artist: 'Ella Langley & Morgan Wallen' },
  { title: 'So Easy (To Fall In Love)', artist: 'Olivia Dean' },
  { title: 'Dracula', artist: 'Tame Impala & JENNIE' },
  { title: 'Man I Need', artist: 'Olivia Dean' },
  { title: 'Be Her', artist: 'Ella Langley' },
  { title: 'Risk It All', artist: 'Bruno Mars' },
  { title: 'Drop Dead', artist: 'Olivia Rodrigo' },
  { title: 'I Just Might', artist: 'Bruno Mars' },
  { title: 'Stupid Song', artist: 'Olivia Rodrigo' },
  { title: 'Midnight Sun', artist: 'Zara Larsson' },
  { title: 'Janice STFU', artist: 'Drake' },
  { title: 'Be By You', artist: 'Luke Combs' },
  { title: 'Loser', artist: 'Tame Impala' },
  { title: 'Oh Yeah?', artist: 'Steve Lacy' },
  { title: 'Earrings', artist: 'Malcolm Todd' },
]

const coverageTracks = [
  { title: 'Bohemian Rhapsody', artist: 'Queen', genre: 'rock', year: 1975, language: 'en' },
  { title: 'Jolene', artist: 'Dolly Parton', genre: 'country', year: 1973, language: 'en' },
  { title: 'Billie Jean', artist: 'Michael Jackson', genre: 'pop', year: 1982, language: 'en' },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana', genre: 'rock', year: 1991, language: 'en' },
  { title: 'Juicy', artist: 'The Notorious B.I.G.', genre: 'hip-hop', year: 1994, language: 'en' },
  { title: 'Crazy in Love', artist: 'Beyoncé', genre: 'r&b', year: 2003, language: 'en' },
  { title: 'Get Lucky', artist: 'Daft Punk', genre: 'electronic', year: 2013, language: 'en' },
  { title: 'Despacito', artist: 'Luis Fonsi', genre: 'latin', year: 2017, language: 'es' },
  { title: 'Dernière danse', artist: 'Indila', genre: 'pop', year: 2013, language: 'fr' },
  { title: '아이와 나의 바다', artist: 'IU', genre: 'k-pop', year: 2021, language: 'ko' },
]

assertCorpusShape()

const requiredResults = await checkTracks('required', requiredTracks)
const corpusResults = await checkTracks('corpus', [...popularTracks, ...coverageTracks])
const requiredPassed = requiredResults.every((result) => result.ok)
const corpusPassCount = corpusResults.filter((result) => result.ok).length
const corpusRate = corpusPassCount / corpusResults.length

console.log(`\nrequired: ${requiredResults.filter((result) => result.ok).length}/${requiredResults.length}`)
console.log(`catalog: ${corpusPassCount}/${corpusResults.length} (${Math.round(corpusRate * 100)}%)`)

if (!requiredPassed || corpusRate < REQUIRED_SUCCESS_RATE) {
  process.exitCode = 1
}

async function checkTracks(label, tracks) {
  console.log(`\n${label}`)
  const results = []

  for (const track of tracks) {
    const result = await checkTrack(track)
    results.push(result)
    const mark = result.ok ? '✓' : '×'
    const detail = result.ok
      ? `${result.lineCount} lines via ${result.provider}`
      : result.reason
    console.log(`${mark} ${track.title} — ${track.artist} (${detail})`)
    await wait(250)
  }

  return results
}

async function checkTrack(track) {
  const url = new URL(API_URL)
  url.searchParams.set('title', track.title)
  url.searchParams.set('artist', track.artist)
  url.searchParams.set('format', 'json')
  url.searchParams.set('level', 'none')

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': CLIENT_ID },
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      return { ok: false, reason: `http ${response.status}` }
    }

    const payload = await response.json()
    const lineCount = Array.isArray(payload?.lines)
      ? payload.lines.filter((line) => typeof line?.text === 'string' && line.text.trim()).length
      : 0

    if (lineCount === 0) {
      return { ok: false, reason: 'no lyric lines' }
    }

    return {
      ok: true,
      lineCount,
      provider: response.headers.get('x-source') || payload?.meta?.source?.id || 'unknown',
    }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.name : 'request failed',
    }
  }
}

function assertCorpusShape() {
  const genres = new Set(coverageTracks.map((track) => track.genre))
  const decades = new Set(coverageTracks.map((track) => Math.floor(track.year / 10) * 10))
  const nonEnglish = coverageTracks.filter((track) => track.language !== 'en')

  if (popularTracks.length !== 20 || coverageTracks.length !== 10) {
    throw new Error('The live corpus must remain weighted 20 popular tracks to 10 coverage tracks.')
  }
  if (genres.size < 6 || decades.size < 4 || nonEnglish.length < 3) {
    throw new Error('The live corpus no longer meets its genre, decade, or language coverage floor.')
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
