// -----------------------------------------------------------------------------
// Shama · seed ghazal dataset (proof-of-concept "universal" meaning corpus)
//
// In the full product these couplet meanings are generated on demand by the LLM
// meaning engine and cached in Supabase. Until an API key is wired, this file IS
// that cache — five iconic ghazals authored the way the engine will output them,
// so Mehfil Mode (synced couplets + meanings) is fully demonstrable today.
//
// `t` on a line is its start time (seconds) in the resolved recording. null = not
// yet stamped; stamp them in-app via the "Sync couplets" authoring tool, or let
// YT Music's time-synced lyrics fill them automatically when available.
//
// NOTE: Urdu/Hindi scripts are best-effort transliterations of well-known verses
// and are worth a native-speaker proof-read; Roman, translations and meanings are
// the primary experience.
// -----------------------------------------------------------------------------

export interface VocabularyItem {
  term: string
  meaning: string
}

export interface LineData {
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
  t?: number | null
}

export interface WorkData {
  id: string
  title: string
  artist: string
  poet: string
  form: string
  audioUrl: string
  coverUrl?: string
  ytQuery?: string
  mood?: string
  lines: LineData[]
}

export const catalog: WorkData[] = [
  {
    id: '01',
    title: 'Dil-e-Nadaan Tujhe Hua Kya Hai',
    artist: 'Jagjit & Chitra Singh',
    poet: 'Mirza Ghalib',
    form: 'Ghazal',
    audioUrl: '',
    coverUrl: '/cover_01.png',
    ytQuery: 'Dil-e-nadan Tujhe Hua Kya Hai Jagjit Singh Chitra Singh',
    mood: 'Wonder & Restlessness',
    lines: [
      {
        id: 'L01-1',
        urdu: 'دلِ ناداں تجھے ہوا کیا ہے',
        hindi: 'दिल-ए-नादाँ तुझे हुआ क्या है',
        roman: 'dil-e-nadaan tujhe hua kya hai',
        englishText: 'O innocent heart, what has happened to you?',
        transliteration: 'Dil-e-nādāñ tujhe huā kyā hai',
        translation: 'O naive heart, what is it that has come over you?',
        simple: 'Ghalib turns inward and questions his own foolish heart — what is this sudden restlessness?',
        detailed: 'The address to "dil-e-nadaan" sets up the whole ghazal as a dialogue between reason and a heart that will not listen. It is tender and exasperated at once.',
        vocabulary: [
          { term: 'Dil-e-nadaan', meaning: 'Innocent / naive heart' },
          { term: 'Hua kya hai', meaning: 'What has happened' }
        ],
        t: null
      },
      {
        id: 'L01-2',
        urdu: 'آخر اس درد کی دوا کیا ہے',
        hindi: 'आख़िर इस दर्द की दवा क्या है',
        roman: 'aakhir is dard ki dawa kya hai',
        englishText: 'After all, what is the cure for this ache?',
        transliteration: 'Ākhir is dard kī dawā kyā hai',
        translation: 'What, in the end, is the remedy for this pain?',
        simple: 'He asks whether there is any cure at all for the ache of longing — knowing there may be none.',
        detailed: 'The rhyme of "dawa" (cure) against "hua" (happened) frames love as an illness with no earthly medicine — a recurring Ghalibian paradox.',
        vocabulary: [
          { term: 'Dard', meaning: 'Pain / ache' },
          { term: 'Dawa', meaning: 'Cure / medicine' }
        ],
        t: null
      },
      {
        id: 'L01-3',
        urdu: 'ہم ہیں مشتاق اور وہ بیزار',
        hindi: 'हम हैं मुश्ताक़ और वो बेज़ार',
        roman: 'hum hain mushtaaq aur wo bezaar',
        englishText: 'I am full of longing, and she is indifferent',
        transliteration: 'Ham haiñ mushtāq aur wo bezār',
        translation: 'I brim with yearning while she remains weary of me.',
        simple: 'He aches for the beloved, but she is tired and unmoved — a mismatch that bewilders him.',
        detailed: 'The stark antithesis mushtaaq/bezaar (eager/averse) captures the cruel asymmetry of one-sided love that runs through the couplet.',
        vocabulary: [
          { term: 'Mushtaaq', meaning: 'Eager, full of longing' },
          { term: 'Bezaar', meaning: 'Weary, averse, fed up' }
        ],
        t: null
      },
      {
        id: 'L01-4',
        urdu: 'یا الٰہی یہ ماجرا کیا ہے',
        hindi: 'या इलाही ये माजरा क्या है',
        roman: 'ya ilahi ye majra kya hai',
        englishText: 'O God, what is this strange affair?',
        transliteration: 'Yā ilāhī ye mājrā kyā hai',
        translation: 'O Lord, what is this whole affair about?',
        simple: 'Baffled, he appeals to God himself to explain the mystery of such unequal love.',
        detailed: 'Turning from the beloved to the divine, Ghalib makes his private confusion cosmic — the lover demands a metaphysical accounting.',
        vocabulary: [
          { term: 'Ya ilahi', meaning: 'O my God' },
          { term: 'Majra', meaning: 'Affair, matter, incident' }
        ],
        t: null
      },
      {
        id: 'L01-5',
        urdu: 'میں نے مانا کہ کچھ نہیں غالبؔ',
        hindi: 'मैं ने माना कि कुछ नहीं ग़ालिब',
        roman: 'main ne maana ke kuchh nahin \'Ghalib\'',
        englishText: 'I grant that Ghalib is worth nothing —',
        transliteration: 'Maiñ ne mānā ke kuchh nahīñ Ghālib',
        translation: 'I concede that Ghalib amounts to nothing at all,',
        simple: 'Ghalib mockingly agrees he is worthless — setting up a witty punchline in his own signature couplet.',
        detailed: 'This is the maqta, where the poet names himself. The self-deprecation is a set-up for the closing jest about getting something for free.',
        vocabulary: [
          { term: 'Maana', meaning: 'Granted / I accept' },
          { term: 'Maqta', meaning: 'The closing couplet bearing the poet’s pen-name' }
        ],
        t: null
      },
      {
        id: 'L01-6',
        urdu: 'مفت ہاتھ آئے تو برا کیا ہے',
        hindi: 'मुफ़्त हाथ आए तो बुरा क्या है',
        roman: 'muft haath aaye to bura kya hai',
        englishText: 'but if he comes free of cost, what is the harm?',
        transliteration: 'Muft hāth āye to burā kyā hai',
        translation: 'yet if he is to be had for free, where is the harm?',
        simple: 'The witty close: even if Ghalib is worthless, a free thing is no loss — keep him anyway.',
        detailed: 'Ghalib turns his own worthlessness into a bargain. The humour undercuts the ghazal’s ache, a hallmark of his ironic voice.',
        vocabulary: [
          { term: 'Muft', meaning: 'Free of cost' },
          { term: 'Bura kya hai', meaning: 'What is the harm' }
        ],
        t: null
      }
    ]
  },
  {
    id: '02',
    title: 'Aaj Jaane Ki Zid Na Karo',
    artist: 'Farida Khanum',
    poet: 'Fayyaz Hashmi',
    form: 'Geet / Ghazal',
    audioUrl: '',
    coverUrl: '/cover_02.png',
    ytQuery: 'Aaj Jane Ki Zid Na Karo Farida Khanum',
    mood: 'Longing & Pleading',
    lines: [
      {
        id: 'L02-1',
        urdu: 'آج جانے کی ضد نہ کرو',
        hindi: 'आज जाने की ज़िद न करो',
        roman: 'aaj jaane ki zid na karo',
        englishText: 'Do not insist on leaving tonight',
        transliteration: 'Āj jāne kī zid na karo',
        translation: 'Please, do not be so stubborn about leaving today.',
        simple: 'A gentle, aching plea to the beloved not to insist on going.',
        detailed: 'The refrain "zid na karo" is soft yet desperate; the whole song lives in the tension between one who wants to stay and one poised to leave.',
        vocabulary: [
          { term: 'Zid', meaning: 'Stubborn insistence' },
          { term: 'Na karo', meaning: 'Do not do (it)' }
        ],
        t: 8
      },
      {
        id: 'L02-2',
        urdu: 'یوں ہی پہلو میں بیٹھے رہو',
        hindi: 'यूँ ही पहलू में बैठे रहो',
        roman: 'yun hi pehlu mein baithe raho',
        englishText: 'Just stay here, seated by my side',
        transliteration: 'Yūñ hī pehlū meñ baiṭhe raho',
        translation: 'Just keep sitting close beside me, exactly like this.',
        simple: 'She asks only for nearness — to keep sitting together a little longer.',
        detailed: '"Pehlu" (one’s side/flank) is the classic idiom of intimacy and shelter; the request is not for grand romance but simple, unbroken closeness.',
        vocabulary: [
          { term: 'Yun hi', meaning: 'Just like this' },
          { term: 'Pehlu', meaning: 'Side, close proximity' }
        ],
        t: 34
      },
      {
        id: 'L02-3',
        urdu: 'ہائے مر جائیں گے، ہم تو لٹ جائیں گے',
        hindi: 'हाय मर जाएँगे, हम तो लुट जाएँगे',
        roman: 'haaye mar jaayenge, hum to lut jaayenge',
        englishText: 'Oh, I will die — I will be utterly ruined',
        transliteration: 'Hāye mar jāeñge, ham to luṭ jāeñge',
        translation: 'I shall die of it; I shall be completely undone.',
        simple: 'She dramatises the pain of parting — his leaving would ruin her utterly.',
        detailed: 'The hyperbole of dying and being "looted" (lut jaana) renders separation as both death and robbery, heightening the emotional stakes.',
        vocabulary: [
          { term: 'Mar jaayenge', meaning: 'Will die' },
          { term: 'Lut jaayenge', meaning: 'Will be ruined / plundered' }
        ],
        t: 92
      },
      {
        id: 'L02-4',
        urdu: 'ایسی باتیں کیا نہ کرو',
        hindi: 'ऐसी बातें किया न करो',
        roman: 'aisi baaten kiya na karo',
        englishText: 'Do not speak such things to me',
        transliteration: 'Aisī bāteñ kiyā na karo',
        translation: 'Do not keep saying such things (about leaving).',
        simple: 'She begs him to stop even talking of departure — the words themselves wound.',
        detailed: 'The plea shifts from the act to the very speech of leaving; in this intimacy, words carry the same violence as the act itself.',
        vocabulary: [
          { term: 'Baaten', meaning: 'Words, talk' },
          { term: 'Kiya na karo', meaning: 'Do not keep doing' }
        ],
        t: 118
      },
      {
        id: 'L02-5',
        urdu: 'تم ہی سوچو ذرا، کیوں نہ روکیں تمہیں',
        hindi: 'तुम ही सोचो ज़रा, क्यूँ न रोकें तुम्हें',
        roman: 'tum hi socho zara, kyun na roken tumhein',
        englishText: 'Think for a moment — why would I not stop you?',
        transliteration: 'Tum hī socho zarā, kyūñ na rokeñ tumheñ',
        translation: 'Just think — why would I not try to hold you back?',
        simple: 'She reasons with him: of course she will try to stop him; how could she not?',
        detailed: 'A turn to logic amid emotion — the rhetorical question makes her clinging feel not weak but inevitable, even righteous.',
        vocabulary: [
          { term: 'Socho zara', meaning: 'Think a little' },
          { term: 'Roken', meaning: 'To stop / hold back' }
        ],
        t: 150
      },
      {
        id: 'L02-6',
        urdu: 'جان جاتی ہے جب اٹھ کے جاتے ہو تم',
        hindi: 'जान जाती है जब उठ के जाते हो तुम',
        roman: 'jaan jaati hai jab uth ke jaate ho tum',
        englishText: 'My very life departs when you rise to leave',
        transliteration: 'Jān jātī hai jab uṭh ke jāte ho tum',
        translation: 'My life itself slips away the moment you get up to go.',
        simple: 'Every time he rises to leave, she feels her life leaving with him.',
        detailed: 'The equation of his departure with her death completes the song’s central metaphor: his presence is her breath, his leaving a small dying.',
        vocabulary: [
          { term: 'Jaan jaati hai', meaning: 'Life departs' },
          { term: 'Uth ke jaate ho', meaning: 'You rise and go' }
        ],
        t: 176
      }
    ]
  },
  {
    id: '03',
    title: 'Gulon Mein Rang Bhare',
    artist: 'Mehdi Hassan',
    poet: 'Faiz Ahmed Faiz',
    form: 'Ghazal',
    audioUrl: '',
    coverUrl: '/cover_03.png',
    ytQuery: 'Gulon Mein Rang Bhare Mehdi Hassan',
    mood: 'Hope & Exile',
    lines: [
      {
        id: 'L03-1',
        urdu: 'گلوں میں رنگ بھرے بادِ نوبہار چلے',
        hindi: 'गुलों में रंग भरे बाद-ए-नौबहार चले',
        roman: 'gulon mein rang bhare baad-e-naubahar chale',
        englishText: 'Let the breeze of new spring fill the flowers with colour',
        transliteration: 'Gulōñ meñ rañg bhare bād-e-naubahār chale',
        translation: 'May the new spring breeze come and pour colour into the flowers.',
        simple: 'A wish for spring to return and bring the garden back to life and colour.',
        detailed: 'Written in prison, the "spring" is at once a longed-for beloved and a longed-for political renewal; the garden is the nation waiting to bloom.',
        vocabulary: [
          { term: 'Gulon', meaning: 'Flowers' },
          { term: 'Baad-e-naubahar', meaning: 'Breeze of early spring' }
        ],
        t: null
      },
      {
        id: 'L03-2',
        urdu: 'چلے بھی آؤ کہ گلشن کا کاروبار چلے',
        hindi: 'चले भी आओ कि गुलशन का कारोबार चले',
        roman: 'chale bhi aao ke gulshan ka karobar chale',
        englishText: 'Do come, so the garden’s work may carry on',
        transliteration: 'Chale bhī āo ke gulshan kā kārobār chale',
        translation: 'Come back, so that the garden’s whole business may resume.',
        simple: 'He begs the beloved to return so that life in the garden can start moving again.',
        detailed: 'The unexpected word "karobar" (commerce) yokes trade to nature: without the beloved, even the garden’s ordinary bustle is suspended.',
        vocabulary: [
          { term: 'Gulshan', meaning: 'Garden' },
          { term: 'Karobar', meaning: 'Business, daily affairs' }
        ],
        t: null
      },
      {
        id: 'L03-3',
        urdu: 'قفس اداس ہے یارو صبا سے کچھ تو کہو',
        hindi: 'क़फ़स उदास है यारो सबा से कुछ तो कहो',
        roman: 'qafas udaas hai yaaro saba se kuchh to kaho',
        englishText: 'The cage is desolate, friends — say something to the morning breeze',
        transliteration: 'Qafas udās hai yāro, sabā se kuchh to kaho',
        translation: 'The prison-cage is forlorn, friends; send some word with the breeze.',
        simple: 'From his lonely cage he asks friends to send a message out through the wind.',
        detailed: 'The "qafas" (cage) is literal imprisonment made lyrical; the saba (breeze) becomes the only messenger able to cross the bars.',
        vocabulary: [
          { term: 'Qafas', meaning: 'Cage / prison' },
          { term: 'Saba', meaning: 'Gentle morning breeze' }
        ],
        t: null
      },
      {
        id: 'L03-4',
        urdu: 'کہیں تو بہرِ خدا آج ذکرِ یار چلے',
        hindi: 'कहीं तो बहर-ए-ख़ुदा आज ज़िक्र-ए-यार चले',
        roman: 'kahin to bahr-e-khuda aaj zikr-e-yaar chale',
        englishText: 'For God’s sake, let there be some talk of the beloved today',
        transliteration: 'Kahīñ to bahr-e-khudā āj zikr-e-yār chale',
        translation: 'Somewhere, for God’s sake, let the beloved be spoken of today.',
        simple: 'He longs, desperately, just to hear the beloved mentioned somewhere.',
        detailed: 'The plea "bahr-e-khuda" (for God’s sake) measures the depth of deprivation: even mere mention of the beloved would be sustenance.',
        vocabulary: [
          { term: 'Bahr-e-khuda', meaning: 'For God’s sake' },
          { term: 'Zikr-e-yaar', meaning: 'Mention of the beloved' }
        ],
        t: null
      },
      {
        id: 'L03-5',
        urdu: 'مقام فیضؔ کوئی راہ میں جچا ہی نہیں',
        hindi: 'मक़ाम फ़ैज़ कोई राह में जचा ही नहीं',
        roman: 'maqaam \'Faiz\' koi raah mein jacha hi nahin',
        englishText: 'No resting-place along the way suited me, Faiz',
        transliteration: 'Maqām Faiz koī rāh meñ jachā hī nahīñ',
        translation: 'Faiz, no way-station on the road ever felt right to me.',
        simple: 'In the closing couplet, Faiz says no stopping point on the journey ever satisfied him.',
        detailed: 'The maqta frames the poet as a perpetual traveller who will not settle short of the goal — leading to the famous image of walking from the beloved’s street straight to the gallows.',
        vocabulary: [
          { term: 'Maqaam', meaning: 'Station, resting place' },
          { term: 'Jacha nahin', meaning: 'Did not appeal / suit' }
        ],
        t: null
      }
    ]
  },
  {
    id: '04',
    title: 'Ranjish Hi Sahi',
    artist: 'Mehdi Hassan',
    poet: 'Ahmed Faraz',
    form: 'Ghazal',
    audioUrl: '',
    ytQuery: 'Ranjish Hi Sahi Mehdi Hassan',
    mood: 'Heartbreak & Reunion',
    lines: [
      {
        id: 'L04-1',
        urdu: 'رنجش ہی سہی دل ہی دکھانے کے لیے آ',
        hindi: 'रंजिश ही सही दिल ही दुखाने के लिए आ',
        roman: 'ranjish hi sahi dil hi dukhaane ke liye aa',
        englishText: 'Let it be spite, then — come even just to wound my heart',
        transliteration: 'Ranjish hī sahī dil hī dukhāne ke liye ā',
        translation: 'Even if only to hurt me, even in anger — just come.',
        simple: 'He tells the estranged beloved: come for any reason at all, even to hurt me — only come.',
        detailed: 'The stunning premise: presence, even hostile presence, is preferable to absence. "Ranjish hi sahi" concedes the quarrel just to win the visit.',
        vocabulary: [
          { term: 'Ranjish', meaning: 'Resentment, estrangement' },
          { term: 'Sahi', meaning: 'So be it / granted' }
        ],
        t: null
      },
      {
        id: 'L04-2',
        urdu: 'آ پھر سے مجھے چھوڑ کے جانے کے لیے آ',
        hindi: 'आ फिर से मुझे छोड़ के जाने के लिए आ',
        roman: 'aa phir se mujhe chhod ke jaane ke liye aa',
        englishText: 'Come, even if only to leave me again',
        transliteration: 'Ā phir se mujhe chhoṛ ke jāne ke liye ā',
        translation: 'Come — even if it is only to abandon me once more.',
        simple: 'He would accept being left all over again, if it means seeing the beloved even briefly.',
        detailed: 'The paradox deepens: he invites the very pain of parting, because a fresh wound of reunion outweighs the numbness of permanent loss.',
        vocabulary: [
          { term: 'Chhod ke jaana', meaning: 'To leave / abandon' },
          { term: 'Phir se', meaning: 'Once again' }
        ],
        t: null
      },
      {
        id: 'L04-3',
        urdu: 'کس کس کو بتائیں گے جدائی کا سبب ہم',
        hindi: 'किस किस को बताएँगे जुदाई का सबब हम',
        roman: 'kis kis ko bataayenge judai ka sabab hum',
        englishText: 'To how many will I explain the reason for our parting?',
        transliteration: 'Kis kis ko batāeñge judāī kā sabab ham',
        translation: 'To how many people am I to explain why we parted?',
        simple: 'He is weary of accounting to the world for why the two of them separated.',
        detailed: 'Private grief meets public scrutiny; the repetition "kis kis ko" conveys the exhausting inquisition a broken love invites from society.',
        vocabulary: [
          { term: 'Judai', meaning: 'Separation' },
          { term: 'Sabab', meaning: 'Cause, reason' }
        ],
        t: null
      },
      {
        id: 'L04-4',
        urdu: 'تو مجھ سے خفا ہے تو زمانے کے لیے آ',
        hindi: 'तू मुझ से ख़फ़ा है तो ज़माने के लिए आ',
        roman: 'tu mujh se khafa hai to zamaane ke liye aa',
        englishText: 'If you are angry with me, then come for the world’s sake',
        transliteration: 'Tū mujh se khafā hai to zamāne ke liye ā',
        translation: 'If you are cross with me, then come at least for the world to see.',
        simple: 'If not for him, then come just to keep up appearances before society.',
        detailed: 'He offers the beloved a face-saving pretext — even a performance of reconciliation would spare him the endless explanations.',
        vocabulary: [
          { term: 'Khafa', meaning: 'Displeased, angry' },
          { term: 'Zamaane ke liye', meaning: 'For the sake of the world' }
        ],
        t: null
      },
      {
        id: 'L04-5',
        urdu: 'اب تک دلِ خوش فہم کو تجھ سے ہیں امیدیں',
        hindi: 'अब तक दिल-ए-ख़ुश-फ़हम को तुझ से हैं उम्मीदें',
        roman: 'ab tak dil-e-khush-fahm ko tujh se hain umeeden',
        englishText: 'Even now this self-deceiving heart keeps hoping for you',
        transliteration: 'Ab tak dil-e-khush-fahm ko tujh se haiñ umīdeñ',
        translation: 'Even now, my wishfully-hoping heart still expects something of you.',
        simple: 'Against all sense, his over-optimistic heart still holds out hope for the beloved.',
        detailed: '"Dil-e-khush-fahm" — the heart that flatters itself with pleasant misreadings — names the lover’s incurable, clear-eyed self-deception.',
        vocabulary: [
          { term: 'Khush-fahm', meaning: 'Given to happy / wishful misunderstanding' },
          { term: 'Umeeden', meaning: 'Hopes, expectations' }
        ],
        t: null
      }
    ]
  },
  {
    id: '05',
    title: 'Chupke Chupke Raat Din',
    artist: 'Ghulam Ali',
    poet: 'Hasrat Mohani',
    form: 'Ghazal',
    audioUrl: '',
    ytQuery: 'Chupke Chupke Raat Din Ghulam Ali',
    mood: 'Nostalgia & Tenderness',
    lines: [
      {
        id: 'L05-1',
        urdu: 'چپکے چپکے رات دن آنسو بہانا یاد ہے',
        hindi: 'चुपके चुपके रात दिन आँसू बहाना याद है',
        roman: 'chupke chupke raat din aansu bahana yaad hai',
        englishText: 'I still remember weeping quietly, night and day',
        transliteration: 'Chupke chupke rāt din āñsū bahānā yād hai',
        translation: 'I remember shedding silent tears, night and day.',
        simple: 'He remembers how, in those days, he cried secretly all the time.',
        detailed: 'The soft doubling "chupke chupke" sets the ghazal’s whole register: love recalled in hushed, private detail rather than declared aloud.',
        vocabulary: [
          { term: 'Chupke chupke', meaning: 'Quietly, secretly' },
          { term: 'Aansu bahana', meaning: 'To shed tears' }
        ],
        t: null
      },
      {
        id: 'L05-2',
        urdu: 'ہم کو اب تک عاشقی کا وہ زمانہ یاد ہے',
        hindi: 'हम को अब तक आशिक़ी का वो ज़माना याद है',
        roman: 'hum ko ab tak aashiqui ka wo zamana yaad hai',
        englishText: 'To this day I remember that season of love',
        transliteration: 'Ham ko ab tak āshiqī kā wo zamānā yād hai',
        translation: 'Even now I recall that whole era of our young love.',
        simple: 'All these years later, that time of being in love is still vivid to him.',
        detailed: 'The refrain "yaad hai" (I remember) turns the ghazal into an album of intimate images, each couplet a preserved photograph of first love.',
        vocabulary: [
          { term: 'Aashiqui', meaning: 'The state of being in love' },
          { term: 'Zamana', meaning: 'Era, time, season' }
        ],
        t: null
      },
      {
        id: 'L05-3',
        urdu: 'تجھ سے ملتے ہی وہ کچھ بے باک ہو جانا مرا',
        hindi: 'तुझ से मिलते ही वो कुछ बेबाक हो जाना मेरा',
        roman: 'tujh se milte hi wo kuchh bebaak ho jaana mera',
        englishText: 'The way I grew so bold the moment we met',
        transliteration: 'Tujh se milte hī wo kuchh bebāk ho jānā merā',
        translation: 'How, the instant we met, I would turn so fearless and forward.',
        simple: 'He recalls how meeting her made him suddenly daring and uninhibited.',
        detailed: 'The memory captures the transformation love works on the shy lover — proximity dissolving reticence into "bebaaki" (boldness).',
        vocabulary: [
          { term: 'Bebaak', meaning: 'Bold, uninhibited, fearless' },
          { term: 'Milte hi', meaning: 'The moment (we) met' }
        ],
        t: null
      },
      {
        id: 'L05-4',
        urdu: 'اور ترا دانتوں میں وہ انگلی دبانا یاد ہے',
        hindi: 'और तेरा दाँतों में वो उँगली दबाना याद है',
        roman: 'aur tera daanton mein wo ungli dabana yaad hai',
        englishText: 'and I remember you biting your finger between your teeth',
        transliteration: 'Aur terā dāñtoñ meñ wo uñglī dabānā yād hai',
        translation: 'and I remember that shy way you would bite your finger.',
        simple: 'He remembers her bashful gesture — pressing a finger between her teeth.',
        detailed: 'A tiny, exact physical detail does the emotional work: the beloved’s coy startle is preserved with a tenderness that needs no abstraction.',
        vocabulary: [
          { term: 'Daanton mein ungli dabana', meaning: 'To bite the finger (a gesture of shy surprise)' }
        ],
        t: null
      },
      {
        id: 'L05-5',
        urdu: 'آ گیا گر وصل کی شب بھی کہیں ذکرِ فراق',
        hindi: 'आ गया गर वस्ल की शब भी कहीं ज़िक्र-ए-फ़िराक़',
        roman: 'aa gaya gar wasl ki shab bhi kahin zikr-e-firaaq',
        englishText: 'If even on our night of union some mention of parting arose',
        transliteration: 'Ā gayā gar wasl kī shab bhī kahīñ zikr-e-firāq',
        translation: 'If, even on the night of union, talk of separation crept in,',
        simple: 'He recalls that even in their happiest night together, a mention of future parting could surface.',
        detailed: 'The couplet holds union and separation in one frame — wasl and firaaq — the lover’s awareness that every meeting already contains its farewell.',
        vocabulary: [
          { term: 'Wasl', meaning: 'Union, meeting' },
          { term: 'Zikr-e-firaaq', meaning: 'Mention of separation' }
        ],
        t: null
      },
      {
        id: 'L05-6',
        urdu: 'وہ ترا رو رو کے مجھ کو بھی رلانا یاد ہے',
        hindi: 'वो तेरा रो रो के मुझ को भी रुलाना याद है',
        roman: 'wo tera ro ro ke mujh ko bhi rulana yaad hai',
        englishText: 'I remember how, weeping, you would set me weeping too',
        transliteration: 'Wo terā ro ro ke mujh ko bhī rulānā yād hai',
        translation: 'I remember how your weeping would make me weep as well.',
        simple: 'He remembers how her tears would move him to tears alongside her.',
        detailed: 'The mirrored weeping seals the ghazal’s intimacy: grief shared so completely that the two lovers dissolve into a single act of crying.',
        vocabulary: [
          { term: 'Ro ro ke', meaning: 'Weeping continuously' },
          { term: 'Rulana', meaning: 'To make (someone) cry' }
        ],
        t: null
      }
    ]
  }
]

export default catalog
