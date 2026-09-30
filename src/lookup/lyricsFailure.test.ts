import {it, expect} from 'vitest'
import {classifyLyricsFailure, RecordingMismatchError, retryAfterTime} from './lyricsFailure'
import {LrcLibLyricsUnavailableError, LrcLibRequestError} from './LrcLibLyricsProvider'
import {LrcMuxRequestError} from './LrcMuxLyricsProvider'

it('distinguishes source absence, restrictions, instrumentals, ambiguity and outages', () => {
  expect(classifyLyricsFailure(new LrcLibRequestError(404))).toEqual({kind:'not-found'})
  expect(classifyLyricsFailure(new LrcMuxRequestError(403))).toEqual({kind:'restricted'})
  expect(classifyLyricsFailure(new LrcLibLyricsUnavailableError('instrumental','instrumental'))).toEqual({kind:'instrumental'})
  expect(classifyLyricsFailure(new RecordingMismatchError())).toEqual({kind:'ambiguous'})
  expect(classifyLyricsFailure(new LrcLibRequestError(503))).toMatchObject({kind:'provider-unavailable'})
  expect(classifyLyricsFailure(new TypeError('network unavailable'))).toEqual({kind:'provider-unavailable'})
})
it('parses Retry-After seconds and HTTP dates without caching permanent misses', () => {
  const now = Date.parse('2026-09-30T18:00:00Z')
  expect(retryAfterTime('12',now)).toBe(now+12000)
  expect(retryAfterTime('Wed, 30 Sep 2026 18:01:00 GMT',now)).toBe(now+60000)
  expect(retryAfterTime('bad',now)).toBeUndefined()
  expect(retryAfterTime('-1',now)).toBeUndefined()
  expect(retryAfterTime('0',now)).toBeUndefined()
})
