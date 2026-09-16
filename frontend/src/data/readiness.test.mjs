/**
 * Readiness scoring — run: node src/data/readiness.test.mjs
 *
 * The score exists to answer one question honestly: will this ghazal actually
 * teach you anything? So the cases that matter are the deceptive ones — a
 * recording that follows along beautifully but has no couplets we can explain.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Evaluate the TS module's pure functions without a build step.
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'readiness.ts'),
  'utf8'
)
const body = src
  .replace(/^'use client'$/m, '')
  .replace(/export interface [\s\S]*?\n}\n/m, '')
  .replace(/export /g, '')
  .replace(/: Readiness \| undefined/g, '')
  .replace(/: Record<string, Readiness>/g, '')
  .replace(/: Readiness/g, '')
  .replace(/: string/g, '')
  .replace(/: number/g, '')
  .replace(/: boolean/g, '')
const { score, describe } = new Function(`${body}; return { score, describe }`)()

const failures = []
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' ' + detail}`)
  if (!cond) failures.push(name)
}

const make = (o = {}) => ({
  hasLyrics: true, hasSynced: true, timingReliable: true,
  coverage: 0.8, couplets: 8, checkedAt: Date.now(), ...o,
})

console.log('\n-- Readiness scoring -----------------------------------------------')

const best = make()
const noWords = make({ hasLyrics: false, hasSynced: false, timingReliable: false, coverage: 0, couplets: 0 })
// The case from the screenshot: synced beautifully, but nothing to learn from.
const syncedNoCouplets = make({ coverage: 0, couplets: 0 })
const untimed = make({ hasSynced: false, timingReliable: false, coverage: 0 })
// Timings borrowed from another rendition: the words and meanings are there,
// but the page can only roughly follow the singer.
const approx = make({ timingReliable: false, coverage: 0.8, couplets: 6 })

check('a fully prepared ghazal scores near the top', score(best) >= 0.9, `(${score(best)})`)
check('no words at all scores zero', score(noWords) === 0, `(${score(noWords)})`)
check('unmeasured scores zero', score(undefined) === 0)
check('synced-but-no-couplets ranks BELOW fully prepared',
  score(syncedNoCouplets) < score(best), `(${score(syncedNoCouplets)} vs ${score(best)})`)
check('synced-but-no-couplets still beats having no words',
  score(syncedNoCouplets) > score(noWords))
check('timed beats untimed', score(best) > score(untimed))
check('more couplets ranks higher',
  score(make({ couplets: 8 })) > score(make({ couplets: 2 })))
check('higher coverage ranks higher',
  score(make({ coverage: 0.9 })) > score(make({ coverage: 0.2 })))
check('score stays within 0..1',
  [best, noWords, syncedNoCouplets, untimed, make({ coverage: 5, couplets: 99 })]
    .every((r) => score(r) >= 0 && score(r) <= 1))
check('approximate timings stay below the top tier',
  score(approx) < 0.7, `(${score(approx)})`)
check('approximate timings still beat untimed',
  score(approx) > score(untimed), `(${score(approx)} vs ${score(untimed)})`)

console.log('\n-- Honest descriptions ---------------------------------------------')
check('no lyrics', describe(noWords) === 'no words found', `(${describe(noWords)})`)
check('untimed', describe(untimed) === 'words, not timed', `(${describe(untimed)})`)
check('synced without couplets does NOT claim meanings',
  !describe(syncedNoCouplets).includes('meaning'), `(${describe(syncedNoCouplets)})`)
check('well covered advertises meanings', describe(best).includes('meanings'), `(${describe(best)})`)
check('approximate timings are called approximate',
  describe(approx) === 'words, timings approximate', `(${describe(approx)})`)
check('unchecked is stated as such', describe(undefined) === 'not checked yet')

console.log()
if (failures.length) {
  console.log(`${failures.length} FAILED: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('All readiness tests passed.')
