# Shama PRD: Subcontinental Ghazal Listening Experience

## 1. Product Summary
Shama is an immersive listening and meaning companion for ghazals, qawwalis, nazms, and adjacent subcontinental poetic music. The product helps listeners feel the performance first, then understand the language, metaphor, history, and emotional context without breaking the spell of listening.

The first release should be a focused, beautiful web experience around a small curated catalog. It should prove that Shama can turn a difficult couplet into a living moment: original text, transliteration, translation, layered explanation, performance context, and voice narration all tied to the exact line being heard.

## 2. Vision
Explode the subcontinental ghazal listening experience by making every sher, misra, radeef, qaafiya, and metaphor feel approachable, structured, and alive.

Shama should feel like a premium, industrial-grade audio control panel for poetry. Instead of a typical lyrics page, it presents a modular control deck where every sher is framed in a rigid wireframe grid, rendering translation and context in a high-contrast mechanical layout that honors the performance's gravity.

## 3. Target Users
- Diaspora listeners who love the sound of ghazals/qawwalis but miss some Urdu, Hindi, Punjabi, Persian, or Arabic nuance.
- Young South Asian listeners discovering classics through Coke Studio, YouTube, Instagram, family playlists, or concerts.
- Literature and music students studying poetic devices, forms, artists, and performance traditions.
- Serious rasikas who want deeper annotation, context, alternate interpretations, and archival trails.
- Casual listeners looking for mood-led recommendations: ishq, hijr, sukoon, mehfil, devotion, rebellion, nostalgia.

## 4. Core Problem
Ghazals and qawwalis are emotionally immediate but linguistically and culturally layered. Existing music platforms provide playback, and lyric sites provide text, but listeners often need:

- Meaning at the exact line they are hearing.
- Multiple depth levels, from plain-language meaning to literary analysis.
- Transliteration and script switching without losing place.
- Context for idioms, metaphors, religious/cultural references, and poetic form.
- A listening interface designed around poetry, not generic tracks.

## 5. Product Goals
- Make the first 30 seconds visually striking and obviously different from a generic music app.
- Present the experience as a structured, retro-mechanical grid design with uppercase monospace typography, bracket indicators, and a warm metallic brownish/copper tint.
- Let a user select a track, follow synced lines, and understand any line in one tap.
- Support English, Hindi, Urdu script, and Roman Urdu/Hindi display modes.
- Provide layered explanation: simple meaning, poetic interpretation, vocabulary, and literary devices.
- Add browser-native voice narration for explanations in the MVP.
- Keep the MVP small enough to ship: 5-10 curated works with excellent metadata and annotations.

## 6. Non-Goals For MVP
- Full streaming-platform catalog licensing.
- User-uploaded copyrighted audio.
- Social network features.
- Paid subscriptions.
- Fully automated lyric alignment for every uploaded track.
- Perfect scholarly consensus on every interpretation.

## 7. MVP Feature Set

### 7.1 Curated Library
- Display 5-10 works with title, artist, poet, tradition, language, mood, difficulty, duration, and source attribution.
- Support filtering by mood, artist, poet, and language.
- Use high-quality seeded data first; avoid depending on live scraping.

### 7.2 Listening Room
- Audio/video embed or licensed audio source for each work.
- Line-by-line lyric display with current line highlighting.
- Manual line selection when sync data is unavailable.
- Persistent context panel for meaning and annotations.

### 7.3 Line Meaning Companion
Each line should support:
- Original script.
- Transliteration.
- Literal translation.
- Natural translation.
- Simple explanation.
- Deeper poetic interpretation.
- Vocabulary notes.
- Literary devices and references.

### 7.4 Language And Script Modes
- Toggle between English-first, Urdu-first, Hindi-first, and Romanized modes.
- Preserve currently selected track and line during switching.
- Allow mixed mode: original line plus English explanation.

### 7.5 Voice Narration
- Browser Web Speech API for MVP narration.
- Narrate selected line explanation.
- Controls for play/pause, speed, and voice where supported.
- Graceful fallback when no suitable voice is available.

### 7.6 Mood-Led Discovery
- Mood chips: longing, devotion, intoxication, separation, remembrance, surrender, romance, melancholy.
- Each track can carry multiple moods and themes.
- MVP recommendation can be rule-based from metadata.

## 8. Differentiating Experience Principles
- Listening remains primary; explanation should deepen, not interrupt.
- The UI should feel like a high-precision industrial audio console: rigid structural grid dividers, warm metallic textures, film grain, and clean contrast.
- Poetry is not just text. Surface form, sound, repetition, and performance cues.
- Explanations should be layered. Beginners get clarity; advanced listeners get nuance.
- Treat cultural material with care: cite sources, avoid false certainty, mark interpretive claims.

## 9. Key User Flows

### First-Time Listener
1. Opens Shama.
2. Sees a curated featured work and mood entry points.
3. Starts a track.
4. Taps a highlighted line.
5. Reads simple meaning, switches to deeper interpretation, plays narration.
6. Saves or shares the couplet in a later release.

### Language Learner
1. Opens a familiar ghazal.
2. Enables Romanized + English mode.
3. Taps unfamiliar words.
4. Reviews vocabulary and metaphor notes.
5. Replays the line while reading the original.

### Literature Student
1. Filters by poet or literary device.
2. Opens a work.
3. Studies radeef, qaafiya, takhallus, metaphor, and theme notes.
4. Exports or bookmarks notes in a later release.

## 10. Content Model

### Work
- id
- title
- alternateTitles
- form: ghazal, qawwali, nazm, geet, kafi, other
- artist
- poet
- composer
- language
- era
- sourceUrl
- audioUrl or embedUrl
- duration
- moods
- themes
- difficulty
- attribution
- lines

### Line
- id
- startTime
- endTime
- originalText
- script
- transliteration
- translations
- vocabulary
- explanations
- literaryDevices
- culturalReferences

### Explanation
- simple
- detailed
- performanceContext
- alternateReadings
- confidence
- sourceNotes

## 11. Success Metrics
- A new user reaches a line explanation within 60 seconds.
- At least 60% of test users understand a selected couplet better after using Shama.
- Average listening-room session exceeds 3 minutes in early testing.
- At least 5 users report that the experience feels meaningfully different from reading lyrics elsewhere.
- Lighthouse targets: 90+ performance on desktop, 80+ on mobile for MVP.

## 12. Accessibility Requirements
- Keyboard-accessible playback, line selection, tabs, and toggles.
- High contrast text in dark theme.
- Respect reduced-motion preferences.
- Avoid relying only on color for current line state.
- Screen-reader labels for playback, language switching, and explanation controls.

## 13. Risks
- Copyright and licensing around audio, lyrics, and translations.
- AI hallucination in literary explanation.
- Poor Urdu/Hindi font rendering across devices.
- Web Speech API voice quality varies heavily by browser and OS.
- Scope creep from catalog size before the core listening room is excellent.

## 14. MVP Release Criteria
- 5 curated works are available with complete line data.
- Listening room works on desktop and mobile.
- Line selection, language switching, and explanation panel are stable.
- Voice narration works or fails gracefully.
- App can be deployed from `frontend/` with documented environment variables.
- Content attribution is visible for each work.

## 15. Future Expansion
- AI-assisted question answering per selected line.
- Saved couplets, notes, and personal reflections.
- Community annotations with moderation.
- Artist/scholar commentary tracks.
- Emotion-aware playlists.
- Time-synced lyric alignment tooling.
- Offline/PWA mode for saved works.
- Premium patron content and live mehfil events.
