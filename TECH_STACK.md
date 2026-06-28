# Shama Tech Stack

## 1. Current Repository State
- Root contains product planning docs plus `frontend/` and `backend/`.
- `frontend/` is a Vite React app with the Shama aesthetic preview wired in.
- `backend/` exists but is currently empty.
- There is no root Git repository detected from this workspace path.
- `frontend/node_modules/` is present locally and should stay out of source control.

## 2. Current Frontend Stack
- Runtime: React 19.1
- Language: TypeScript 5.8
- Build tool: Vite 7
- Routing: React Router DOM 7
- Data fetching/cache: TanStack React Query 5
- HTTP client: Axios
- State: Zustand 5
- Animation: Framer Motion 12
- Forms: React Hook Form 7
- Icons: Lucide React
- Styling: Tailwind CSS 4 installed; current preview uses custom CSS in `App.css` and `index.css`
- Linting: ESLint 9 with TypeScript ESLint and React Hooks rules
- 3D/WebGL: Three.js, React Three Fiber, ShaderGradient, Paper Design shaders
- Glass/refraction prep: html2canvas for future liquid-glass page sampling

## 2.1 Aesthetic Repos Set Up
- `ruucm/shadergradient`: installed as `@shadergradient/react`; currently used by `ShaderBackdrop`.
- `paper-design/liquid-logo`: source demo inspected; its reusable dependency `@paper-design/shaders-react` is installed and currently used by `LiquidLogoMark` via `LiquidMetal`.
- `dashersw/liquid-glass-js`: vanilla WebGL inspiration; `html2canvas` is installed and `LiquidGlassPanel` provides the current React wrapper surface.
- `pmndrs/react-three-fiber`: installed as `@react-three/fiber` with `three` and `@types/three`; currently used by `MehfilScene`.

## 3. Recommended MVP Architecture

### Frontend
Keep the frontend as a Vite React SPA for the first milestone.

Recommended structure:
```text
frontend/src/
  app/
  components/
  data/
  features/
    library/
    listening-room/
    language/
    narration/
  hooks/
  lib/
  styles/
  types/
```

### Backend
Start with seeded local JSON or TypeScript data in the frontend until the listening room is excellent. Add a backend once the data model stabilizes.

Recommended backend when needed:
- Node.js + Express or Fastify
- TypeScript
- MongoDB Atlas or Supabase Postgres
- OpenAI API for explanation generation
- Server-side caching for generated explanations
- Rate limiting and request validation

### Content Storage
For MVP:
- Store curated works in versioned static files.
- Use embedded public sources only where rights allow.
- Keep AI-generated explanations checked into seed data after review.

For later:
- Database-backed catalog.
- Admin workflow for content editing.
- Audit fields for source, reviewer, confidence, and last updated date.

## 4. AI And Voice Choices

### MVP
- Use pre-reviewed seed explanations for core demo reliability.
- Use the browser Web Speech API for narration.
- Add OpenAI generation behind an explicit feature flag once backend exists.

### Later
- OpenAI Responses API or equivalent server-side integration for line Q&A.
- Cache generated explanations by work id, line id, language, and depth.
- Optional premium TTS provider for higher-quality Urdu/Hindi/English narration.

## 5. Data Contracts

### Work
```ts
type Work = {
  id: string
  title: string
  alternateTitles?: string[]
  form: 'ghazal' | 'qawwali' | 'nazm' | 'geet' | 'kafi' | 'other'
  artist: string
  poet?: string
  composer?: string
  language: string[]
  era?: string
  sourceUrl?: string
  embedUrl?: string
  durationSeconds?: number
  moods: string[]
  themes: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  attribution: string
  lines: Line[]
}
```

### Line
```ts
type Line = {
  id: string
  startTime?: number
  endTime?: number
  originalText: string
  script: 'urdu' | 'devanagari' | 'latin' | 'mixed'
  transliteration: string
  translations: {
    english?: string
    hindi?: string
    romanUrdu?: string
  }
  vocabulary?: VocabularyNote[]
  explanations: {
    simple: string
    detailed?: string
    performanceContext?: string
    alternateReadings?: string[]
  }
  literaryDevices?: string[]
  culturalReferences?: string[]
}
```

### Vocabulary Note
```ts
type VocabularyNote = {
  term: string
  transliteration?: string
  meaning: string
  note?: string
}
```

## 6. UX Technical Priorities
- Build the listening room as the main screen, structured like an industrial control panel.
- Use stable layout dimensions for wireframe grids, playback console, and annotation decks.
- Respect `prefers-reduced-motion`.
- Favor text-based technical indicators (e.g. `[•]`, `[ ]`, `[+]`, `[▶]`, `↳`) and uppercase typography; use Lucide icons sparingly to preserve the minimalist terminal feel.
- Keep the color system warm and metallic: espresso metal base (`#14110f`), dark bronze dividers (`#3d322a`), brushed copper (`#d98a5b`), and golden brass accents (`#e6b875`).
- Avoid decorative elements that interfere with text readability; utilize subtle grain texture.

## 7. Testing Strategy

### Frontend
- `npm run lint`
- `npm run build`
- Component tests once reusable components exist.
- Browser smoke test for desktop and mobile viewports after major UI work.

### Backend Later
- Unit tests for content transforms and validation.
- API integration tests for catalog, explanation, and narration endpoints.
- Contract tests for the work/line schema.

## 8. Deployment

### MVP
- Frontend: Vercel or Netlify.
- Data: static bundled seed data.
- No backend required for first public prototype if AI is pre-generated.

### Full Stack
- Frontend: Vercel.
- Backend: Render, Railway, Fly.io, or Vercel serverless functions.
- Database: Supabase or MongoDB Atlas.
- Media: Cloudinary or rights-compliant external embeds.

## 9. Environment Variables
Expected later, not required for the current starter app:

```text
VITE_API_BASE_URL=
OPENAI_API_KEY=
DATABASE_URL=
JWT_SECRET=
CORS_ORIGIN=
```

Never expose server-only secrets through `VITE_` variables.

## 10. Immediate Technical Next Steps
1. Turn the aesthetic preview into the first listening-room shell.
2. Add a typed seed catalog with one fully annotated ghazal.
3. Build line selection, explanation tabs, language toggle, and narration controls.
4. Code-split the heavy WebGL shader layer before production.
5. Decide whether the backend is needed after the first catalog workflow is working.
