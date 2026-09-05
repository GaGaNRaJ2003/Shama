'use client'

import { useState } from 'react'

/** Definitions of the form itself — nothing here is derived from a recording. */
const TERMS = [
  {
    urdu: 'مطلع',
    name: 'Matla',
    desc: 'The opening couplet. Both of its lines carry the rhyme and the refrain, setting the pattern the rest of the ghazal answers to.',
  },
  {
    urdu: 'ردیف',
    name: 'Radif',
    desc: 'The phrase repeated at the end of every second line — the sound you begin to wait for.',
  },
  {
    urdu: 'قافیہ',
    name: 'Qafiya',
    desc: 'The rhyme that falls immediately before the radif, changing from couplet to couplet.',
  },
  {
    urdu: 'مقطع',
    name: 'Maqta',
    desc: 'The closing couplet, where the poet often signs off with their takhallus — their pen name.',
  },
  {
    urdu: 'شعر',
    name: 'Sher',
    desc: 'A single couplet. Each one stands complete on its own; a ghazal is a sequence of them, not a single argument.',
  },
]

export function GhazalAnatomy() {
  const [open, setOpen] = useState(false)

  return (
    <div className="anatomy">
      <button
        type="button"
        className="text-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Close · anatomy of a ghazal' : 'Anatomy of a ghazal'}
      </button>

      {open && (
        <div className="anatomy-list">
          {TERMS.map((t) => (
            <div key={t.name}>
              <span className="anatomy-name">{t.name}</span>
              <span className="anatomy-term" lang="ur" dir="rtl">
                {t.urdu}
              </span>
              <p className="anatomy-desc">{t.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default GhazalAnatomy
