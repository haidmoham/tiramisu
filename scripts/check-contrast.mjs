import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const css = readFileSync(new URL('../src/styles/blog-grammar.css', import.meta.url), 'utf8')
function luminance(hex) {
  const rgb = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
}
const ratio = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a)
  return (values[0] + .05) / (values[1] + .05)
}
let count = 0
for (const theme of ['light', 'dark']) {
  const block = css.split(`html[data-theme='${theme}']{`)[1].split('}')[0]
  const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[a-f\d]{6})(?=;)/gi)].map(m => [m[1], m[2]]))
  for (const foreground of ['ink', 'ink-soft', 'ink-faint', 'red']) {
    for (const background of ['paper', 'surface-solid', 'surface-muted']) {
      const value = ratio(tokens[foreground], tokens[background])
      assert.ok(value >= 4.5, `${theme}: ${foreground} on ${background}: ${value.toFixed(2)} < 4.5`)
      console.log(`${theme}: ${foreground} / ${background}: ${value.toFixed(2)}:1`)
      count++
    }
  }
}
console.log(`${count} text contrast checks passed (WCAG AA 4.5:1). Photo masthead needs visual review separately.`)
