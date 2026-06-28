import { useState, useEffect, useRef } from 'react'
import {
  Play,
  Pause,
  Volume2,
  BookOpen,
  HelpCircle,
  FileText,
  VolumeX,
  Search
} from 'lucide-react'
import './App.css'
import { ShaderBackdrop } from './components/aesthetic/ShaderBackdrop'
import { LiquidLogoMark } from './components/aesthetic/LiquidLogoMark'
import { MehfilScene } from './components/aesthetic/MehfilScene'

interface VocabularyItem {
  term: string
  meaning: string
}

interface LineData {
  id: string
  urdu: string
  hindi: string
  roman: string
  englishText: string
  transliteration: string
  translation: string
  simple: string
  detailed: string
  vocabulary: VocabularyItem[]
}

interface WorkData {
  id: string
  title: string
  artist: string
  poet: string
  form: string
  audioUrl: string
  coverUrl?: string
  lines: LineData[]
}

const catalog: WorkData[] = [
  {
    id: '01',
    title: 'Dil-e-Nadaan Tujhe',
    artist: 'Jagjit & Chitra Singh',
    poet: 'Mirza Ghalib',
    form: 'Ghazal',
    audioUrl: 'https://ia801902.us.archive.org/30/items/mirza-ghalib-tv-serial-complete-all-ghazals-jagjit-singh-original/01%20-%20Dil-E-Nadaan%20Tujhe%20Hua%20Kya%20Hai.mp3',
    coverUrl: '/cover_01.png',
    lines: [
      {
        id: 'L01',
        urdu: 'دلِ ناداں تجھے ہوا کیا ہے',
        hindi: 'दिल-ए-नादाँ तुझे हुआ क्या है',
        roman: 'dil-e-nadaan tujhe hua kya hai',
        englishText: 'O innocent heart, what has happened to you?',
        transliteration: 'Dil-e-nādān tujhe huā kyā hai',
        translation: 'O naive, innocent heart, what is wrong with you?',
        simple: 'The poet addresses their own foolish, innocent heart, questioning its sudden state of longing and agitation.',
        detailed: 'Ghalib uses "dil-e-nadaan" (foolish/innocent heart) to create a dialogic tension between rational intellect and irrational emotion. It establishes a sense of helpless self-reflection.',
        vocabulary: [
          { term: 'Dil-e-nadaan', meaning: 'Innocent, naive, or foolish heart' },
          { term: 'Tujhe', meaning: 'To you' },
          { term: 'Hua kya hai', meaning: 'What has happened' }
        ]
      },
      {
        id: 'L02',
        urdu: 'آخر اس درد کی دوا کیا ہے',
        hindi: 'आख़िर इस दर्द की दवा क्या है',
        roman: 'aakhir is dard ki dawa kya hai',
        englishText: 'What cure can there finally be for this ache?',
        transliteration: 'Ākhir is dard kī dawā kyā hai',
        translation: 'What cure is there, ultimately, for this pain?',
        simple: 'The poet asks what remedy could possibly soothe the emotional ache of longing that they feel.',
        detailed: 'The word "dawa" (cure/medicine) contrasts with "dard" (emotional pain). Ghalib asks a rhetorical question, knowing that the pain of love and existence has no earthly cure.',
        vocabulary: [
          { term: 'Aakhir', meaning: 'After all, finally, or ultimately' },
          { term: 'Dard', meaning: 'Pain or heartache' },
          { term: 'Dawa', meaning: 'Cure, medicine, or remedy' }
        ]
      }
    ]
  },
  {
    id: '02',
    title: 'Aaj Jaane Ki Zid',
    artist: 'Farida Khanum',
    poet: 'Fayyaz Hashmi',
    form: 'Geet / Ghazal',
    audioUrl: 'https://ia800104.us.archive.org/15/items/FaridaKhanumAajJaaneKiZidNaKaro/FaridaKhanum-AajJaaneKiZidNaKaro.mp3',
    coverUrl: '/cover_02.png',
    lines: [
      {
        id: 'L03',
        urdu: 'آج جانے کی ضد نہ کرو',
        hindi: 'आज जाने की ज़िद न करो',
        roman: 'aaj jaane ki zid na karo',
        englishText: 'Do not insist on leaving tonight',
        transliteration: 'Āj jāne kī zid na karo',
        translation: 'Do not insist on leaving today/tonight.',
        simple: 'A gentle plea to the beloved to stay a little longer, begging them not to insist on departing.',
        detailed: 'The refrain "zid na karo" represents the emotional desperation of the lover. The poem uses immediate conversational Hindi/Urdu which makes it deeply relatable.',
        vocabulary: [
          { term: 'Aaj', meaning: 'Today / Tonight' },
          { term: 'Jaane ki', meaning: 'Of leaving / departing' },
          { term: 'Zid', meaning: 'Obstinacy, insistence, or stubborn demand' }
        ]
      },
      {
        id: 'L04',
        urdu: 'یوں ہی پہلو میں بیٹھے رہو',
        hindi: 'यूॅं ही पहलू में बैठे रहो',
        roman: 'yoon hi pehlu mein baithe raho',
        englishText: 'Just keep sitting close beside me',
        transliteration: 'Yūñ hī pehlū meñ baiṭhe raho',
        translation: 'Just keep sitting by my side like this.',
        simple: 'Asking the beloved to remain close, sitting side-by-side, sharing the physical space of intimacy.',
        detailed: '"Pehlu" literally means side, flank, or lap. To sit in the "pehlu" is a classic South Asian idiom of romantic and protective proximity, symbolizing safety and affection.',
        vocabulary: [
          { term: 'Yoon hi', meaning: 'Just like this, casually' },
          { term: 'Pehlu', meaning: 'Flank, side, lap, or close proximity' },
          { term: 'Baithe raho', meaning: 'Keep sitting' }
        ]
      }
    ]
  },
  {
    id: '03',
    title: 'Gulon Mein Rang Bhare',
    artist: 'Mehdi Hassan',
    poet: 'Faiz Ahmed Faiz',
    form: 'Ghazal',
    audioUrl: 'https://ia803407.us.archive.org/15/items/MehdiHassanGulonMeinRangBhare/MehdiHassan-GulonMeinRangBhare.mp3',
    coverUrl: '/cover_03.png',
    lines: [
      {
        id: 'L05',
        urdu: 'گلوں میں رنگ بھرے بادِ نوبہار چلے',
        hindi: 'गुलों में रंग भरे बाद-ए-नौबहार चले',
        roman: 'gulon mein rang bhare baad-e-naubahar chale',
        englishText: 'Let the flowers fill with color, let the spring breeze blow',
        transliteration: 'Gulōñ meñ raṅg bhare bād-e-naubahār chale',
        translation: 'May the flowers fill with color, and the spring breeze start blowing.',
        simple: 'The poet wishes for spring to return to the garden, hoping the flowers bloom and the wind refreshes the earth.',
        detailed: 'Written while Faiz was imprisoned, this verse operates on two levels: a romantic longing for the beloved and a revolutionary call for political awakening (spring) to revive the nation (garden).',
        vocabulary: [
          { term: 'Gulon', meaning: 'Flowers' },
          { term: 'Rang bhare', meaning: 'Fill with color' },
          { term: 'Baad-e-naubahar', meaning: 'Breeze of early spring' },
          { term: 'Chale', meaning: 'Let it move / blow' }
        ]
      },
      {
        id: 'L06',
        urdu: 'چلے بھی آؤ کہ گلشن کا کاروبار چلے',
        hindi: 'چلے بھی آؤ کہ گلشن کا کاروبار چلے',
        roman: 'chale bhi aao ke gulshan ka karobar chale',
        englishText: 'Come back now, so the business of the garden can resume',
        transliteration: 'Chale bhī āo ke gulshan kā kārobār chale',
        translation: 'Come back, so that the normal business of the garden may proceed.',
        simple: 'Imploring the beloved to return, because without them, the beauty of the garden is idle and lifeless.',
        detailed: 'The phrase "gulshan ka karobar" (the business of the garden) is an ironic, beautiful coupling of commerce and nature. It signifies that the poet’s entire universe remains halted until the beloved returns.',
        vocabulary: [
          { term: 'Chale aao', meaning: 'Come along / return' },
          { term: 'Gulshan', meaning: 'Garden / homeland' },
          { term: 'Karobar', meaning: 'Business, affairs, or daily commerce' }
        ]
      }
    ]
  }
]

export function App() {
  const [worksList, setWorksList] = useState<any[]>(catalog)
  const [activeWork, setActiveWork] = useState<WorkData>(catalog[0])
  const [activeLine, setActiveLine] = useState<LineData>(catalog[0].lines[0])
  const [scriptMode, setScriptMode] = useState<'URDU' | 'HINDI' | 'ROMAN' | 'ENGLISH'>('URDU')
  const [activeTab, setActiveTab] = useState<'SIMPLE' | 'LITERARY' | 'GLOSSARY'>('SIMPLE')
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [playbackProgress, setPlaybackProgress] = useState<number>(0)
  const [volume, setVolume] = useState<number>(75)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false)

  // Console View state: 'LISTENING' | 'CATALOG' | 'FEATURED'
  const [currentView, setCurrentView] = useState<'LISTENING' | 'CATALOG' | 'FEATURED'>('LISTENING')
  const [searchTerm, setSearchTerm] = useState<string>('')

  // Playable Audio Refs & Timestamps
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [duration, setDuration] = useState<number>(0)

  // Fetch list of works on mount
  useEffect(() => {
    fetch('http://localhost:5000/api/works')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          // Merge local audio URLs to API headers if database urls aren't hydrated
          const enriched = data.map((item: any) => {
            const localMatch = catalog.find((c) => c.id === item.id)
            return {
              ...item,
              audioUrl: item.audio_url || item.audioUrl || (localMatch ? localMatch.audioUrl : ''),
              coverUrl: item.cover_url || item.coverUrl || (localMatch ? localMatch.coverUrl : '')
            }
          })
          setWorksList(enriched)
        }
      })
      .catch(() => {
        console.log('[API_FALLBACK] Operating in local mock data mode.')
      })
  }, [])

  // Sync Audio source when activeWork changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = activeWork.audioUrl
      audioRef.current.load()
      if (isPlaying) {
        audioRef.current.play().catch((err) => {
          console.log('[AUDIO_PLAY_BLOCKED] Autoplay waiting for interaction:', err.message)
          setIsPlaying(false)
        })
      } else {
        setPlaybackProgress(0)
        setCurrentTime(0)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWork])

  // Sync Volume variables
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

  const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true)
      }).catch((err) => {
        console.error('[AUDIO_PLAY_FAILED]', err.message)
      })
    }
  }

  const handleWorkSelect = (work: any) => {
    if (work.lines && work.lines.length > 0) {
      setActiveWork(work)
      setActiveLine(work.lines[0])
      return
    }

    // Fetch full details from API
    fetch(`http://localhost:5000/api/works/${work.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.lines && data.lines.length > 0) {
          const formattedLines = data.lines.map((l: any) => ({
            ...l,
            englishText: l.english_text || l.englishText
          }))
          const localMatch = catalog.find((c) => c.id === work.id)
          const mergedWork = {
            ...data,
            audioUrl: data.audio_url || data.audioUrl || (localMatch ? localMatch.audioUrl : ''),
            coverUrl: data.cover_url || data.coverUrl || (localMatch ? localMatch.coverUrl : ''),
            lines: formattedLines
          }
          setActiveWork(mergedWork)
          setActiveLine(formattedLines[0])
        } else {
          loadLocalFallback(work.id)
        }
      })
      .catch(() => {
        loadLocalFallback(work.id)
      })
  }

  const loadLocalFallback = (id: string) => {
    const local = catalog.find((w) => w.id === id)
    if (local) {
      setActiveWork(local)
      setActiveLine(local.lines[0])
    }
  }

  const handleLineSelect = (line: LineData) => {
    setActiveLine(line)
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }

  const toggleSpeech = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }

    const textToSpeak =
      activeTab === 'SIMPLE'
        ? activeLine.simple
        : activeTab === 'LITERARY'
        ? activeLine.detailed
        : activeLine.vocabulary.map((v) => `${v.term} means ${v.meaning}`).join('. ')

    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utterance.rate = 0.9
      utterance.onend = () => setIsSpeaking(false)
      setIsSpeaking(true)
      window.speechSynthesis.speak(utterance)
    } else {
      alert('Text-to-speech is not supported in this browser.')
    }
  }

  const renderScriptText = (line: LineData) => {
    switch (scriptMode) {
      case 'URDU':
        return line.urdu
      case 'HINDI':
        return line.hindi
      case 'ROMAN':
        return line.roman
      case 'ENGLISH':
        return line.englishText
      default:
        return line.urdu
    }
  }

  // Format Time Helper (MM:SS)
  const formatTime = (time: number) => {
    if (isNaN(time)) return '00:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const filteredCatalog = worksList.filter(
    (work) =>
      work.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      work.poet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      work.artist.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const activateCuratorSelection = (workId: string) => {
    const matched = worksList.find((w) => w.id === workId)
    if (matched) {
      handleWorkSelect(matched)
      setIsPlaying(true)
      setCurrentView('LISTENING')
      // Wait briefly for state loading then play
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play().catch(() => {})
        }
      }, 300)
    }
  }

  return (
    <main className="shama-shell">
      <div className="noise-overlay" />
      <ShaderBackdrop />

      {/* Hidden audio tag context */}
      <audio
        ref={audioRef}
        src={activeWork.audioUrl}
        preload="auto"
        onTimeUpdate={() => {
          if (audioRef.current) {
            const current = audioRef.current.currentTime
            setCurrentTime(current)
            const pct = (current / duration) * 100
            setPlaybackProgress(isNaN(pct) ? 0 : pct)
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration)
          }
        }}
        onEnded={() => {
          setIsPlaying(false)
          setPlaybackProgress(0)
          setCurrentTime(0)
        }}
      />

      <div className="console-container">
        {/* Header Bar */}
        <header className="console-header">
          <div className="brand-section">
            <LiquidLogoMark />
            <div>
              <span className="mono-tag">Acoustic Audio System</span>
              <h1 className="console-title">
                SHAMA // CONSOLE <span className="status-dot status-dot--green" />
              </h1>
            </div>
            
            {/* View selectors */}
            <nav className="console-nav">
              <button
                type="button"
                className={`console-nav-btn ${
                  currentView === 'LISTENING' ? 'console-nav-btn--active' : ''
                }`}
                onClick={() => setCurrentView('LISTENING')}
              >
                [01] Listening Deck
              </button>
              <button
                type="button"
                className={`console-nav-btn ${
                  currentView === 'CATALOG' ? 'console-nav-btn--active' : ''
                }`}
                onClick={() => setCurrentView('CATALOG')}
              >
                [02] Catalog
              </button>
              <button
                type="button"
                className={`console-nav-btn ${
                  currentView === 'FEATURED' ? 'console-nav-btn--active' : ''
                }`}
                onClick={() => setCurrentView('FEATURED')}
              >
                [03] Curator Picks
              </button>
            </nav>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }} className="nav-extra">
            <span className="mono-tag" style={{ opacity: 0.6 }}>
              AUDIO_STATE: {isPlaying ? 'PLAY' : 'STOP'}
            </span>
            <span className="mono-tag">
              SYS_TINT: BRONZE
            </span>
          </div>
        </header>

        {/* View switching logic */}
        {currentView === 'LISTENING' && (
          <div className="console-body">
            {/* Panel 1: Library Catalog Sidebar */}
            <aside className="console-panel">
              <div className="panel-header">
                <h2 className="panel-title">[01] SELECT WORK</h2>
                <span className="mono-tag">DECK_LIST</span>
              </div>
              <div className="panel-content" style={{ padding: '12px' }}>
                <div className="bracket-list">
                  {worksList.map((work) => (
                    <button
                      key={work.id}
                      type="button"
                      className={`bracket-item-btn ${
                        activeWork.id === work.id ? 'bracket-item-btn--active' : ''
                      }`}
                      onClick={() => handleWorkSelect(work)}
                    >
                      <span className="bracket-indicator">[{work.id}]</span>
                      <div style={{ flex: 1 }}>
                        <div className="item-main-text">{work.title}</div>
                        <div className="item-sub-text">
                          {work.poet.toUpperCase()} // {work.form.toUpperCase()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            {/* Panel 2: Listening Deck */}
            <section className="console-panel" style={{ borderRight: '1px solid var(--color-border)' }}>
              <div className="panel-header">
                <h2 className="panel-title">[02] PLAYBACK PANEL</h2>
                <div className="mono-tag" style={{ color: 'var(--color-highlight)' }}>
                  {activeWork.artist.toUpperCase()}
                </div>
              </div>

              {/* 3D Scene Viewport */}
              <div className="scene-deck">
                <MehfilScene isPlaying={isPlaying} coverUrl={activeWork.coverUrl} onTogglePlay={handlePlayPause} />
              </div>

              {/* Hardware-like Audio Player Deck */}
              <div className="player-deck">
                <div className="player-controls">
                  <button
                    type="button"
                    className="console-btn console-btn--primary"
                    onClick={handlePlayPause}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
                  </button>
                </div>

                {/* Monospace Interactive Waveform Progress */}
                <div
                  className="waveform-display"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const clickX = e.clientX - rect.left
                    const percentage = clickX / rect.width
                    if (audioRef.current && duration) {
                      audioRef.current.currentTime = percentage * duration
                    }
                  }}
                >
                  <div
                    className="waveform-progress"
                    style={{ width: `${playbackProgress}%` }}
                  />
                  <div className="waveform-bars">
                    {Array.from({ length: 40 }).map((_, i) => {
                      const isActive = (i / 40) * 100 <= playbackProgress
                      const barHeight =
                        4 + Math.abs(Math.sin((i + playbackProgress * 0.1) * 0.5)) * 14
                      return (
                        <div
                          key={i}
                          className={`waveform-bar ${isActive ? 'waveform-bar--active' : ''}`}
                          style={{ height: `${barHeight}px` }}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Volume & Timestamp knobs */}
                <div className="volume-section" style={{ gap: '14px' }}>
                  <span style={{ fontSize: '0.74rem', opacity: 0.8 }} className="timestamp">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setIsMuted(!isMuted)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-text-muted)',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        setVolume(Number(e.target.value))
                        if (isMuted) setIsMuted(false)
                      }}
                      style={{
                        width: '50px',
                        height: '4px',
                        accentColor: 'var(--color-accent)',
                        cursor: 'pointer'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Script Toggles */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'rgba(16, 13, 11, 0.4)'
                }}
              >
                {(['URDU', 'HINDI', 'ROMAN', 'ENGLISH'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`tab-btn ${scriptMode === mode ? 'tab-btn--active' : ''}`}
                    onClick={() => setScriptMode(mode)}
                    style={{ borderBottom: 'none' }}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {/* Lyrics Sheet Scroll */}
              <div className="panel-content lyrics-deck" style={{ padding: 0 }}>
                {activeWork.lines.map((line, index) => (
                  <div
                    key={line.id}
                    className={`sher-block ${
                      activeLine.id === line.id ? 'sher-block--active' : ''
                    }`}
                    onClick={() => handleLineSelect(line)}
                  >
                    <div
                      className="mono-tag"
                      style={{ fontSize: '0.66rem', color: 'var(--color-accent)', marginBottom: '8px' }}
                    >
                      COUPLET // [0{index + 1}]
                    </div>
                    <h3 className="verse-original">{renderScriptText(line)}</h3>
                    <p className="verse-translit">↳ {line.transliteration}</p>
                    <p className="verse-trans">{line.translation}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Panel 3: Annotation Companion Deck */}
            <aside className="console-panel">
              <div className="panel-header">
                <h2 className="panel-title">[03] ANNOTATION PANEL</h2>
                <span className="mono-tag">DECK</span>
              </div>

              {/* Tab Deck */}
              <div className="tab-deck">
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'SIMPLE' ? 'tab-btn--active' : ''}`}
                  onClick={() => setActiveTab('SIMPLE')}
                >
                  <BookOpen size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  <span>Simple</span>
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'LITERARY' ? 'tab-btn--active' : ''}`}
                  onClick={() => setActiveTab('LITERARY')}
                >
                  <FileText size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  <span>Poetic</span>
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'GLOSSARY' ? 'tab-btn--active' : ''}`}
                  onClick={() => setActiveTab('GLOSSARY')}
                >
                  <HelpCircle size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  <span>Glossary</span>
                </button>
              </div>

              <div className="panel-content">
                {/* Selected Line Header */}
                <div
                  style={{
                    marginBottom: '18px',
                    borderBottom: '1px solid var(--color-border)',
                    paddingBottom: '12px'
                  }}
                >
                  <span className="mono-tag" style={{ color: 'var(--color-highlight)' }}>
                    ACTIVE COUPLET DETAIL
                  </span>
                  <p className="verse-translit" style={{ marginTop: '8px', fontSize: '0.86rem' }}>
                    "{activeLine.roman}"
                  </p>
                </div>

                {/* Tab Content Display */}
                {activeTab === 'SIMPLE' && (
                  <div className="explanation-card">
                    <div className="explanation-card-header">Simple Meaning</div>
                    <div className="explanation-card-body">{activeLine.simple}</div>
                  </div>
                )}

                {activeTab === 'LITERARY' && (
                  <div className="explanation-card">
                    <div className="explanation-card-header">Literary Analysis & Metaphors</div>
                    <div className="explanation-card-body">{activeLine.detailed}</div>
                  </div>
                )}

                {activeTab === 'GLOSSARY' && (
                  <div className="explanation-card">
                    <div className="explanation-card-header">Vocabulary & Glossary</div>
                    <div className="explanation-card-body">
                      <ul style={{ margin: 0, paddingLeft: '14px', listStyleType: 'square' }}>
                        {activeLine.vocabulary.map((vocab, index) => (
                          <li key={index} style={{ marginBottom: '8px' }}>
                            <strong style={{ color: 'var(--color-highlight)' }}>{vocab.term}</strong>: {vocab.meaning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* TTS Control Area */}
                <div
                  style={{
                    marginTop: '24px',
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: '20px'
                  }}
                >
                  <button
                    type="button"
                    className={`console-btn ${isSpeaking ? 'console-btn--active' : ''}`}
                    onClick={toggleSpeech}
                    style={{ width: '100%' }}
                  >
                    <Volume2 size={14} />
                    <span>{isSpeaking ? 'STOP AUDIO DESCRIPTION' : 'NARRATE DESCRIPTION'}</span>
                  </button>
                  <div className="item-sub-text" style={{ textAlign: 'center', marginTop: '8px' }}>
                    Reads explanation using browser TTS
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* View 2: Searchable catalog grid */}
        {currentView === 'CATALOG' && (
          <div className="catalog-deck">
            <div className="catalog-search-row">
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '16px',
                    color: 'var(--color-text-muted)'
                  }}
                />
                <input
                  type="text"
                  className="console-input"
                  placeholder="SEARCH BY TITLE, POET, ARTIST..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ paddingLeft: '44px' }}
                />
              </div>
            </div>

            <table className="catalog-table">
              <thead>
                <tr>
                  <th className="catalog-th" style={{ width: '80px' }}>Code</th>
                  <th className="catalog-th">Title</th>
                  <th className="catalog-th">Poet</th>
                  <th className="catalog-th">Artist</th>
                  <th className="catalog-th">Form</th>
                  <th className="catalog-th" style={{ width: '120px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCatalog.map((work) => (
                  <tr key={work.id} className="catalog-tr" onClick={() => handleWorkSelect(work)}>
                    <td className="catalog-td">[{work.id}]</td>
                    <td className="catalog-td" style={{ fontWeight: 'bold', color: 'var(--color-highlight)' }}>
                      {work.title}
                    </td>
                    <td className="catalog-td">{work.poet}</td>
                    <td className="catalog-td">{work.artist}</td>
                    <td className="catalog-td">
                      <span className="catalog-tag">{work.form}</span>
                    </td>
                    <td className="catalog-td">
                      <button
                        type="button"
                        className="console-btn"
                        style={{ padding: '4px 8px', fontSize: '0.66rem' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleWorkSelect(work)
                          setCurrentView('LISTENING')
                        }}
                      >
                        LOAD DECK
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredCatalog.length === 0 && (
                  <tr>
                    <td colSpan={6} className="catalog-td" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      NO CORRESPONDING RECORD FOUND IN THE ARCHIVE
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* View 3: Curatorpicks featured highlights */}
        {currentView === 'FEATURED' && (
          <div className="featured-deck">
            <div>
              <span className="mono-tag" style={{ color: 'var(--color-accent)' }}>
                CURATORIAL ANNOTATION DESK
              </span>
              <h2
                style={{
                  fontFamily: 'Space Mono',
                  fontSize: '1.6rem',
                  textTransform: 'uppercase',
                  margin: '8px 0 24px 0',
                  letterSpacing: '0.02em'
                }}
              >
                Ghazal Highlights of the Curation Cycle
              </h2>
            </div>

            <div className="featured-grid">
              {/* Card 1: Ghazal of the Day */}
              <article className="featured-card">
                <span className="featured-label">[Ghazal of the Day]</span>
                <h3 className="featured-card-title">Dil-e-Nadaan Tujhe</h3>
                <div className="featured-card-meta">Poet: Mirza Ghalib // Singer: Jagjit Singh</div>
                <p className="featured-card-desc">
                  Mirza Ghalib's timeless inquiry into the naive heart's desires. This rendition by Jagjit & Chitra Singh represents a watershed moment in classical ghazal composition, featuring smooth, minimal acoustic strings and clear, emotional vocal delivery that brings Ghalib's wordplay to life.
                </p>
                <button
                  type="button"
                  className="console-btn console-btn--primary"
                  onClick={() => activateCuratorSelection('01')}
                >
                  [▶ PLAY SELECTION]
                </button>
              </article>

              {/* Card 2: Ghazal of the Week */}
              <article className="featured-card">
                <span className="featured-label">[Ghazal of the Week]</span>
                <h3 className="featured-card-title">Aaj Jaane Ki Zid Na Karo</h3>
                <div className="featured-card-meta">Poet: Fayyaz Hashmi // Singer: Farida Khanum</div>
                <p className="featured-card-desc">
                  An iconic song of separation and persistent love. Farida Khanum's legendary rendition captures the sheer longing of the beloved. Her performance shows how classical music uses repetition and vocal modulations to express romantic devotion.
                </p>
                <button
                  type="button"
                  className="console-btn console-btn--primary"
                  onClick={() => activateCuratorSelection('02')}
                >
                  [▶ PLAY SELECTION]
                </button>
              </article>

              {/* Card 3: Ghazal of the Month */}
              <article className="featured-card">
                <span className="featured-label">[Ghazal of the Month]</span>
                <h3 className="featured-card-title">Gulon Mein Rang Bhare</h3>
                <div className="featured-card-meta">Poet: Faiz Ahmed Faiz // Singer: Mehdi Hassan</div>
                <p className="featured-card-desc">
                  Penned in prison, Faiz's verses blend the traditional flower-garden romantic motifs with a subtle revolutionary cry for spring. Sung by the king of ghazal Mehdi Hassan, this recording remains a masterclass in classic raag composition.
                </p>
                <button
                  type="button"
                  className="console-btn console-btn--primary"
                  onClick={() => activateCuratorSelection('03')}
                >
                  [▶ PLAY SELECTION]
                </button>
              </article>
            </div>
          </div>
        )}

        {/* Console Footer */}
        <footer className="footer-section">
          SHAMA INSTRUMENTS DIGITAL DECK [V1.0.0-PROTOTYPE] // COPPER-BRONZE SHELL SYSTEM // METALLIC STACK COMPLIANT
        </footer>
      </div>
    </main>
  )
}

export default App
