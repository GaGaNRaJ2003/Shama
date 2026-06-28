# Shama: Student-Friendly Technical Requirements

## 🎯 **Project Scope for Resume**
- **Target**: 5-10 carefully curated ghazals
- **Focus**: Polished UI/UX and smooth workflow
- **Goal**: Demonstrate full-stack development skills
- **Budget**: $0 (free tier services only)

---

## 🏗️ **Simplified Architecture**

### Frontend Stack (Free)
- **Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS + Framer Motion
- **State Management**: Zustand (lightweight)
- **Deployment**: Vercel (free tier)
- **Icons**: Lucide React (free)
- **Fonts**: Google Fonts (free)

### Backend Stack (Free)
- **Framework**: Node.js + Express
- **Database**: MongoDB Atlas (free tier)
- **Deployment**: Render (free tier)
- **Authentication**: JWT tokens
- **File Storage**: Cloudinary (free tier)

### AI Services (Free Tiers)
- **Text Generation**: OpenAI API (free $5 credit)
- **TTS**: Web Speech API (browser-native, free)
- **Translation**: Google Translate API (free tier)

---

## 📦 **Essential Dependencies**

### Frontend (package.json)
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-router-dom": "^6.8.0",
  "typescript": "^5.0.0",
  "tailwindcss": "^3.3.0",
  "framer-motion": "^10.16.0",
  "zustand": "^4.4.0",
  "axios": "^1.6.0",
  "lucide-react": "^0.294.0",
  "react-query": "^3.39.0",
  "react-hook-form": "^7.48.0",
  "react-intersection-observer": "^9.5.0"
}
```

### Backend (package.json)
```json
{
  "express": "^4.18.0",
  "cors": "^2.8.5",
  "helmet": "^7.1.0",
  "joi": "^17.11.0",
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3",
  "mongoose": "^8.0.0",
  "openai": "^4.20.0",
  "cloudinary": "^1.41.0",
  "dotenv": "^16.3.0",
  "express-rate-limit": "^7.1.0"
}
```

---

## 🎨 **UI/UX Focus Areas**

### Design System
- **Theme**: Warm metallic industrial control panel with subtle film grain
- **Colors**: 
  - Background: `#14110f` (Espresso Metal)
  - Dividers/Borders: `#3d322a` (Bronze/Copper Wireframe)
  - Text Primary: `#f4efea` (Warm Off-white)
  - Text Muted: `#a3968a` (Warm Sand)
  - Accent (Brushed Copper): `#d98a5b`
  - Highlight/Hover (Golden Brass): `#e6b875`
- **Typography**: 
  - Interface/English: Space Mono & Inter (Google Fonts) for uppercase technical labels, brackets, and active statuses
  - Urdu: Jameel Noori Nastaleeq (web font) for authentic rendering of script
- **Animations**: Sharp border-glow transitions, active cell highlights, subtle noise grain shimmer

### Key UI Components
1. **Control Console Grid**: Sharp column frames separated by 1px solid bronze borders (no gaps/margins, strict cells)
2. **Ghazal Grid Cards**: Tabular product-style cards with hover-outlines and bracket numbers (e.g. `[01]`)
3. **Line Companion Deck**: Synchronized lyrics sheet inside a rigid scrolling window
4. **Mechanical Player Deck**: Tape deck or control console visualizer panel with monospace dials and play indicators `[▶ PLAY]`
5. **Language Control Grid**: Uppercase toggle panel using indicator icons like `[•]` and `[ ]`

### Responsive Design
- Mobile-first approach
- Breakpoints: 320px, 768px, 1024px
- Touch-friendly interactions
- PWA capabilities for mobile app feel

---

## 🔄 **Core Workflow**

### 1. **Homepage Experience**
```
Landing → Hero Animation → Featured Ghazals → Quick Demo
```

### 2. **Ghazal Exploration**
```
Select Ghazal → Audio Player → Click Line → AI Explanation → Voice Narration
```

### 3. **Language Switching**
```
Toggle Language → Smooth Transition → Maintain Context → Update UI
```

### 4. **Voice Interaction**
```
Click Play → TTS Reads Line → AI Explains → TTS Reads Explanation
```

---

## 🗄️ **Data Structure**

### Ghazal Schema
```javascript
{
  id: String,
  title: String,
  artist: String,
  era: String,
  language: String,
  audioUrl: String,
  verses: [
    {
      id: String,
      originalText: String,
      transliteration: String,
      translations: {
        english: String,
        hindi: String,
        romanUrdu: String
      },
      explanations: {
        simple: String,
        detailed: String,
        literaryDevices: [String]
      }
    }
  ],
  metadata: {
    mood: String,
    themes: [String],
    difficulty: String
  }
}
```

---

## 🔌 **Free API Integration**

### 1. **OpenAI API** (Free $5 credit)
- **Usage**: Generate explanations for verses
- **Rate Limit**: 3 requests/minute (free tier)
- **Implementation**: Cache responses to stay within limits

### 2. **Web Speech API** (Free, browser-native)
- **Usage**: Text-to-speech for explanations
- **Features**: Multiple voices, speed control
- **Fallback**: ElevenLabs free tier if needed

### 3. **Google Translate API** (Free tier)
- **Usage**: Basic translations
- **Limit**: 500,000 characters/day
- **Implementation**: Cache translations

### 4. **Cloudinary** (Free tier)
- **Usage**: Store audio files and images
- **Limit**: 25 GB storage, 25 GB bandwidth/month
- **Perfect for**: 5-10 ghazals with audio

---

## 🚀 **Deployment Strategy**

### Frontend (Vercel - Free)
- **Domain**: `shama.vercel.app` (free subdomain)
- **Features**: Automatic deployments, SSL, CDN
- **Custom Domain**: Optional (if you have one)

### Backend (Render - Free)
- **Domain**: `shama-api.onrender.com`
- **Features**: Automatic deployments, SSL
- **Limitations**: Sleeps after 15 minutes of inactivity

### Database (MongoDB Atlas - Free)
- **Storage**: 512 MB (plenty for 5-10 ghazals)
- **Features**: Automatic backups, monitoring
- **Connection**: Free tier with connection pooling

---

## 📊 **Performance Optimization**

### Frontend Performance
- **Lazy Loading**: Load ghazals on demand
- **Image Optimization**: Next.js Image component
- **Code Splitting**: Route-based splitting
- **Caching**: Service worker for offline access

### Backend Performance
- **Response Caching**: Cache AI responses for 24 hours
- **Database Indexing**: Optimize queries
- **Rate Limiting**: Prevent abuse
- **Error Handling**: Graceful fallbacks

---

## 🧪 **Testing Strategy**

### Frontend Testing
- **Unit Tests**: Jest + React Testing Library
- **Component Tests**: Test key interactions
- **E2E Tests**: Playwright (free)

### Backend Testing
- **API Tests**: Jest + Supertest
- **Integration Tests**: Test database operations
- **Load Testing**: Artillery (free)

---

## 📈 **Analytics & Monitoring**

### Free Analytics
- **Google Analytics**: Track user behavior
- **Vercel Analytics**: Performance metrics
- **Console Logging**: Error tracking

### User Feedback
- **Simple Feedback Form**: Google Forms (free)
- **GitHub Issues**: Track bugs and features

---

## 💰 **Cost Breakdown: $0**

### Development Phase
- **Domain**: Free subdomain (vercel.app)
- **Hosting**: Vercel (free) + Render (free)
- **Database**: MongoDB Atlas (free)
- **Storage**: Cloudinary (free)
- **AI APIs**: OpenAI free credit ($5)
- **Monitoring**: Built-in analytics (free)

### Production Phase
- **Same as development** - all free tiers
- **Scale**: Can upgrade later if needed

---

## 📋 **Development Timeline**

### Week 1-2: Setup & Basic UI
- Project setup with Vite + React
- Tailwind CSS configuration
- Basic routing and layout
- Hero section with animations

### Week 3-4: Core Features
- Ghazal data structure
- Audio player integration
- Line-by-line interaction
- Basic AI integration

### Week 5-6: Polish & Deploy
- Voice assistant integration
- Language switching
- Mobile optimization
- Deployment and testing

### Week 7: Resume Prep
- Documentation
- Demo video
- GitHub repository cleanup
- Portfolio integration

---

## 🎯 **Resume Highlights**

### Technical Skills Demonstrated
- **Frontend**: React, TypeScript, Tailwind, Framer Motion
- **Backend**: Node.js, Express, MongoDB
- **APIs**: OpenAI, Web Speech, Google Translate
- **Deployment**: Vercel, Render, MongoDB Atlas
- **Testing**: Jest, React Testing Library
- **Performance**: Optimization, caching, lazy loading

### Project Features
- **AI Integration**: Real-time text generation
- **Voice Technology**: Text-to-speech implementation
- **Multi-language**: Urdu, Hindi, English support
- **Responsive Design**: Mobile-first approach
- **Modern UI/UX**: Smooth animations and interactions
- **Full-stack**: Complete application with database

### Portfolio Impact
- **Live Demo**: Deployed application
- **Code Quality**: Clean, well-documented code
- **User Experience**: Polished, professional interface
- **Technical Depth**: Multiple technologies integrated
- **Cultural Relevance**: Unique, meaningful project

---

## 🔧 **Development Tools (All Free)**

### Code Editor
- **VS Code** with extensions:
  - ESLint, Prettier
  - Tailwind CSS IntelliSense
  - TypeScript support
  - GitHub Copilot (student access)

### Design Tools
- **Figma** (free tier)
- **Canva** (free tier)
- **Unsplash** (free images)

### Version Control
- **GitHub** (free)
- **GitHub Pages** (free hosting for portfolio)

---

*This approach ensures you create an impressive, fully-functional project that showcases your skills without any financial investment. Focus on polish and user experience over scale!* 