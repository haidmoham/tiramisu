interface LyricLineBounds {
  top: number
  bottom: number
}

/** Select the first lyric whose top edge has fully cleared the reader anchor. */
export function resolveActiveLyricIndex(
  lineBounds: readonly LyricLineBounds[],
  anchor: number,
) {
  if (lineBounds.length === 0) return -1
  const firstVisibleIndex = lineBounds.findIndex((bounds) => bounds.top >= anchor)
  return firstVisibleIndex === -1 ? lineBounds.length - 1 : firstVisibleIndex
}
