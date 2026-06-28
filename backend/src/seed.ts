import { supabase, isDbConfigured } from './lib/supabase.js'

const worksData = [
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
        hindi: 'आख़िर इस درد کی دوا کیا ہے',
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
        hindi: 'यूॅं ہی पहलू में बैठे रहो',
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
        hindi: 'गुलوں में रंग भरे बाद-ए-नौबहार چلے',
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

async function seed() {
  if (!isDbConfigured) {
    console.log('[SEED_DB] Supabase database credentials not found. Seeding skipped.')
    return
  }

  console.log('[SEED_DB] Seeding Supabase database tables...')

  try {
    // Clean up existing records
    const { error: clearLinesErr } = await supabase.from('lines').delete().neq('id', 'placeholder')
    const { error: clearWorksErr } = await supabase.from('works').delete().neq('id', 'placeholder')

    if (clearLinesErr) {
      console.warn('[SEED_DB] Warning clearing lines table:', clearLinesErr.message)
    }
    if (clearWorksErr) {
      console.warn('[SEED_DB] Warning clearing works table:', clearWorksErr.message)
    }

    // Insert headers and lines
    for (const work of worksData) {
      const { id, title, artist, poet, form, audioUrl, coverUrl, lines } = work
      
      const { error: workInsertErr } = await supabase
        .from('works')
        .insert({ id, title, artist, poet, form, audio_url: audioUrl, cover_url: coverUrl })

      if (workInsertErr) {
        console.error(`[SEED_DB] Error inserting work ${title}:`, workInsertErr.message)
        continue
      }
      console.log(`[SEED_DB] Inserted work: ${title}`)

      for (const line of lines) {
        const {
          id: lineId,
          urdu,
          hindi,
          roman,
          englishText,
          transliteration,
          translation,
          simple,
          detailed,
          vocabulary
        } = line

        const { error: lineInsertErr } = await supabase
          .from('lines')
          .insert({
            id: lineId,
            work_id: id,
            urdu,
            hindi,
            roman,
            english_text: englishText,
            transliteration,
            translation,
            simple,
            detailed,
            vocabulary
          })

        if (lineInsertErr) {
          console.error(`[SEED_DB] Error inserting line ${lineId} of ${title}:`, lineInsertErr.message)
        }
      }
    }
    console.log('[SEED_DB] Database seeding completed successfully!')
  } catch (err: any) {
    console.error('[SEED_DB] Seeding crashed:', err.message)
  }
}

seed()
