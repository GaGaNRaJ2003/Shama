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
  ,
  {
    id: '06',
    title: 'Hazaaron Khwahishein Aisi',
    artist: 'Jagjit Singh',
    poet: 'Mirza Ghalib',
    form: 'Ghazal',
    audioUrl: '',
    coverUrl: '',
    ytQuery: 'Hazaaron Khwahishein Aisi Jagjit Singh Ghalib',
    mood: 'Despair & Defiance',
    lines: [
      {
        id: 'L06-1',
        urdu: 'ہزاروں خواہشیں ایسی کہ ہر خواہش پہ دم نکلے',
        hindi: 'हज़ारों ख़्वाहिशें ऐसी कि हर ख़्वाहिश पे दम निकले',
        roman: 'hazaaron khwahishein aisi ke har khwahish pe dam nikle',
        englishText: 'A thousand desires, each so strong that one could die for it',
        transliteration: 'Hazārōñ khwāhisheñ aisī ke har khwāhish pe dam nikle',
        translation: 'I have a thousand desires, each worthy enough to die for.',
        simple: 'Ghalib says he has countless yearnings, each so intense it could take his life.',
        detailed: 'The opening establishes the ghazal\'s premise: desire so extravagant that a single lifetime cannot contain even one wish, let alone a thousand. "Dam nikle" — the breath leaving — makes each desire a little death.',
        vocabulary: [
          { term: 'Khwahishein', meaning: 'Desires, wishes' },
          { term: 'Dam nikle', meaning: 'To breathe one\'s last / die' }
        ],
        t: null
      },
      {
        id: 'L06-2',
        urdu: 'بہت نکلے مرے ارمان لیکن پھر بھی کم نکلے',
        hindi: 'बहुत निकले मेरे अरमान लेकिन फिर भी कम निकले',
        roman: 'bahut nikle mere armaan lekin phir bhi kam nikle',
        englishText: 'Many of my longings were fulfilled, yet they still fell short',
        transliteration: 'Bahut nikle mere armān lekin phir bhī kam nikle',
        translation: 'Many of my longings did find expression, yet they remained too few.',
        simple: 'Even though many desires were realized, they always seemed insufficient against the vastness of his wanting.',
        detailed: 'The paradox of fulfillment feeling incomplete — "bahut" (many) vs "kam" (few) — captures the insatiability at the heart of Ghalibian longing.',
        vocabulary: [
          { term: 'Armaan', meaning: 'Longings, unfulfilled desires' },
          { term: 'Kam nikle', meaning: 'Turned out to be insufficient' }
        ],
        t: null
      },
      {
        id: 'L06-3',
        urdu: 'ڈرے کیا موت سے جو شکلِ موت آئے',
        hindi: 'डरे क्या मौत से जो शक्ल-ए-मौत आए',
        roman: 'dare kya maut se jo shakl-e-maut aaye',
        englishText: 'Why fear death when death itself appears before me?',
        transliteration: 'Ḍare kyā maut se jo shakl-e-maut āye',
        translation: 'Why would I fear death, when death-like visage confronts me daily?',
        simple: 'He has faced so much suffering that death no longer frightens him.',
        detailed: 'The lover has been so hollowed by grief that the feared enemy (death) is already a familiar face — fear becomes redundant when you live in dying.',
        vocabulary: [
          { term: 'Maut', meaning: 'Death' },
          { term: 'Shakl-e-maut', meaning: 'The face/form of death' }
        ],
        t: null
      },
      {
        id: 'L06-4',
        urdu: 'نکلنا خلد سے آدم کا سنتے آئے تھے لیکن',
        hindi: 'निकलना ख़ुल्द से आदम का सुनते आए थे लेकिन',
        roman: 'nikalna khuld se aadam ka sunte aaye the lekin',
        englishText: 'We had always heard of Adam being expelled from paradise, but',
        transliteration: 'Nikalnā khuld se Ādam kā sunte āye the lekin',
        translation: 'We had always heard of Adam\'s expulsion from paradise, but —',
        simple: 'Ghalib references the tale of Adam\'s exile from heaven, setting up a comparison.',
        detailed: 'By invoking Adam\'s fall, Ghalib elevates his own exile from the beloved\'s street to a cosmic event — personal heartbreak as a second Fall.',
        vocabulary: [
          { term: 'Khuld', meaning: 'Paradise, heaven' },
          { term: 'Aadam', meaning: 'Adam (the first man)' }
        ],
        t: null
      },
      {
        id: 'L06-5',
        urdu: 'بہت بے آبرو ہو کر تیرے کوچے سے ہم نکلے',
        hindi: 'बहुत बे-आबरू हो कर तेरे कूचे से हम निकले',
        roman: 'bahut be-aabru ho kar tere kooche se hum nikle',
        englishText: 'We left your lane utterly disgraced',
        transliteration: 'Bahut be-ābrū ho kar tere kūche se ham nikle',
        translation: 'We emerged from your street utterly stripped of honour.',
        simple: 'He was so thoroughly humiliated leaving the beloved\'s street that it rivalled Adam\'s expulsion from Eden.',
        detailed: 'The maqta completes the Adam comparison: his departure from the beloved\'s lane was his own fall from grace — "be-aabru" (dishonoured) echoing the shame of exile.',
        vocabulary: [
          { term: 'Be-aabru', meaning: 'Dishonoured, disgraced' },
          { term: 'Koocha', meaning: 'Lane, alley (of the beloved)' }
        ],
        t: null
      }
    ]
  },
  {
    id: '07',
    title: 'Koi Umeed Bar Nahin Aati',
    artist: 'Mehdi Hassan',
    poet: 'Mirza Ghalib',
    form: 'Ghazal',
    audioUrl: '',
    coverUrl: '',
    ytQuery: 'Koi Umeed Bar Nahin Aati Mehdi Hassan Ghalib',
    mood: 'Despair & Resignation',
    lines: [
      {
        id: 'L07-1',
        urdu: 'کوئی امید بر نہیں آتی',
        hindi: 'कोई उम्मीद बर नहीं आती',
        roman: 'koi umeed bar nahin aati',
        englishText: 'No hope bears fruit anymore',
        transliteration: 'Koī umīd bar nahīñ ātī',
        translation: 'Not a single hope comes to fruition.',
        simple: 'Ghalib declares that none of his hopes are being fulfilled — a state of total despair.',
        detailed: 'The opening "koi...nahin" (not a single) creates absolute negation. "Bar aana" (to bear fruit) renders hope as a barren tree, setting the bleakest of tones.',
        vocabulary: [
          { term: 'Umeed', meaning: 'Hope, expectation' },
          { term: 'Bar nahin aati', meaning: 'Does not come to fruition' }
        ],
        t: null
      },
      {
        id: 'L07-2',
        urdu: 'کوئی صورت نظر نہیں آتی',
        hindi: 'कोई सूरत नज़र नहीं आती',
        roman: 'koi surat nazar nahin aati',
        englishText: 'No way out is visible',
        transliteration: 'Koī sūrat nazar nahīñ ātī',
        translation: 'No solution appears in sight.',
        simple: 'He sees no way out, no solution to his predicament.',
        detailed: 'The parallel construction reinforces the despair — neither hope (umeed) nor means (surat) present themselves. The symmetry is suffocating.',
        vocabulary: [
          { term: 'Surat', meaning: 'Way, form, solution' },
          { term: 'Nazar nahin aati', meaning: 'Is not visible / cannot be seen' }
        ],
        t: null
      },
      {
        id: 'L07-3',
        urdu: 'مرتے ہیں آرزو میں مرنے کی',
        hindi: 'मरते हैं आरज़ू में मरने की',
        roman: 'marte hain aarzoo mein marne ki',
        englishText: 'I die in the longing for death itself',
        transliteration: 'Marte haiñ ārzū meñ marne kī',
        translation: 'I am dying in the very desire to die.',
        simple: 'He wants death as a release but even that wish goes unfulfilled — he dies longing to die.',
        detailed: 'A devastating paradox: death, the final remedy, is itself an unattainable desire. The recursion (dying to die) captures absolute helplessness.',
        vocabulary: [
          { term: 'Aarzoo', meaning: 'Longing, desire' },
          { term: 'Marte hain', meaning: 'Are dying / keep dying' }
        ],
        t: null
      },
      {
        id: 'L07-4',
        urdu: 'موت آتی ہے پر نہیں آتی',
        hindi: 'मौत आती है पर नहीं आती',
        roman: 'maut aati hai par nahin aati',
        englishText: 'Death seems to come, but never truly arrives',
        transliteration: 'Maut ātī hai par nahīñ ātī',
        translation: 'Death approaches but never quite arrives.',
        simple: 'Death keeps teasing him — it seems close but never actually comes to end his suffering.',
        detailed: 'The cruel irony: even death is coquettish, approaching and retreating like an indifferent beloved. The lover is denied even the mercy of finality.',
        vocabulary: [
          { term: 'Maut', meaning: 'Death' },
          { term: 'Par nahin aati', meaning: 'But does not come' }
        ],
        t: null
      },
      {
        id: 'L07-5',
        urdu: 'دل سے ترے نشانِ غم گئے جسے',
        hindi: 'दिल से तेरे निशान-ए-ग़म गए जिसे',
        roman: 'dil se tere nishan-e-gam gaye jise',
        englishText: 'The one from whose heart the marks of your grief have faded',
        transliteration: 'Dil se tere nishān-e-gham gaye jise',
        translation: 'The one whose heart has lost the traces of your sorrow —',
        simple: 'He describes someone whose heart no longer bears the scars of love — implying death of feeling.',
        detailed: 'The "nishan-e-gham" (marks of grief) are badges of devotion; their fading is not healing but spiritual death — worse than physical demise.',
        vocabulary: [
          { term: 'Nishan', meaning: 'Mark, trace, sign' },
          { term: 'Gham', meaning: 'Grief, sorrow' }
        ],
        t: null
      },
      {
        id: 'L07-6',
        urdu: 'ہم وہاں ہیں جہاں سے ہم کو بھی کچھ ہماری خبر نہیں آتی',
        hindi: 'हम वहाँ हैं जहाँ से हम को भी कुछ हमारी ख़बर नहीं आती',
        roman: 'hum wahan hain jahan se hum ko bhi kuchh hamari khabar nahin aati',
        englishText: 'I am in a place from where even I receive no news of myself',
        transliteration: 'Ham wahāñ haiñ jahāñ se ham ko bhī kuchh hamārī khabar nahīñ ātī',
        translation: 'I am so far gone that even I get no tidings of myself.',
        simple: 'He has gone to such depths of despair that he is lost even to himself — beyond self-awareness.',
        detailed: 'One of Ghalib\'s most celebrated lines: the self is so alienated that it cannot send word back to itself. Existence beyond the reach of one\'s own consciousness.',
        vocabulary: [
          { term: 'Khabar', meaning: 'News, tidings, awareness' },
          { term: 'Wahan', meaning: 'There (a distant, unreachable place)' }
        ],
        t: null
      }
    ]
  },
  {
    id: '08',
    title: 'Mujhse Pehli Si Mohabbat',
    artist: 'Noor Jehan',
    poet: 'Faiz Ahmed Faiz',
    form: 'Ghazal',
    audioUrl: '',
    coverUrl: '',
    ytQuery: 'Mujhse Pehli Si Mohabbat Noor Jehan Faiz',
    mood: 'Awakening & Sacrifice',
    lines: [
      {
        id: 'L08-1',
        urdu: 'مجھ سے پہلی سی محبت مری محبوب نہ مانگ',
        hindi: 'मुझ से पहली सी मोहब्बत मेरी महबूब न माँग',
        roman: 'mujhse pehli si mohabbat meri mehboob na maang',
        englishText: 'Do not ask of me, my love, the love I once gave you',
        transliteration: 'Mujh se pehlī sī mohabbat merī mehbūb na māñg',
        translation: 'Do not demand from me, beloved, the same love as before.',
        simple: 'Faiz tells his beloved not to expect the same exclusive devotion he once gave — something has changed him.',
        detailed: 'The famous opening redefines love poetry: the lover does not plead for the beloved but pushes back. The cause is political awakening — the world\'s suffering now competes with personal romance.',
        vocabulary: [
          { term: 'Mohabbat', meaning: 'Love' },
          { term: 'Mehboob', meaning: 'Beloved' }
        ],
        t: null
      },
      {
        id: 'L08-2',
        urdu: 'میں نے سمجھا تھا کہ تو ہے تو دراخشاں ہے حیات',
        hindi: 'मैं ने समझा था कि तू है तो दरख़्शाँ है हयात',
        roman: 'main ne samjha tha ke tu hai to darakhshaan hai hayaat',
        englishText: 'I once believed that your presence made life radiant',
        transliteration: 'Maiñ ne samjhā thā ke tū hai to darakhshāñ hai hayāt',
        translation: 'I once thought that life was luminous because you existed.',
        simple: 'He recalls a time when the beloved\'s existence alone made life seem brilliant and worthwhile.',
        detailed: '"Darakhshaan" (radiant) and "hayaat" (life) create an equation: beloved = light = reason to live. The past tense "samjha tha" signals this belief has been revised.',
        vocabulary: [
          { term: 'Darakhshaan', meaning: 'Radiant, luminous' },
          { term: 'Hayaat', meaning: 'Life' }
        ],
        t: null
      },
      {
        id: 'L08-3',
        urdu: 'تیرا غم ہے تو جہاں میں کوئی غم نہیں ہے',
        hindi: 'तेरा ग़म है तो जहाँ में कोई ग़म नहीं है',
        roman: 'tera gham hai to jahan mein koi gham nahin hai',
        englishText: 'If I have your sorrow, then no other sorrow exists in the world',
        transliteration: 'Terā gham hai to jahāñ meñ koī gham nahīñ hai',
        translation: 'When I held your grief, no other grief in the world mattered.',
        simple: 'Once upon a time, loving her was enough — her sorrow blotted out all the world\'s pain.',
        detailed: 'The couplet describes the narcotic exclusivity of romantic love: one grief (hers) anaesthetizes you to all other suffering. The poem will reject this anaesthesia.',
        vocabulary: [
          { term: 'Gham', meaning: 'Grief, sorrow' },
          { term: 'Jahan', meaning: 'World' }
        ],
        t: null
      },
      {
        id: 'L08-4',
        urdu: 'اور بھی دکھ ہیں زمانے میں محبت کے سوا',
        hindi: 'और भी दुख हैं ज़माने में मोहब्बत के सिवा',
        roman: 'aur bhi dukh hain zamaane mein mohabbat ke siva',
        englishText: 'There are other sorrows in the world besides love',
        transliteration: 'Aur bhī dukh haiñ zamāne meñ mohabbat ke sivā',
        translation: 'There are other griefs in this world beyond love alone.',
        simple: 'He acknowledges that the world holds sufferings far greater than romantic heartbreak.',
        detailed: 'The pivotal turn: Faiz breaks the ghazal tradition that makes the beloved the sole axis. Poverty, injustice, oppression — these too demand his heart.',
        vocabulary: [
          { term: 'Dukh', meaning: 'Sorrows, sufferings' },
          { term: 'Ke siva', meaning: 'Besides, apart from' }
        ],
        t: null
      },
      {
        id: 'L08-5',
        urdu: 'راحتیں اور بھی ہیں وصل کی راحت کے سوا',
        hindi: 'राहतें और भी हैं वस्ल की राहत के सिवा',
        roman: 'rahatein aur bhi hain wasl ki raahat ke siva',
        englishText: 'There are other comforts too, beyond the comfort of union',
        transliteration: 'Rāhateñ aur bhī haiñ wasl kī rāhat ke sivā',
        translation: 'There are other consolations beyond the solace of union with you.',
        simple: 'The comfort of being united with the beloved is not the only joy — there are larger causes worth living for.',
        detailed: 'Faiz completes his revolutionary redefinition: "wasl" (union with beloved) is not the only paradise. Social justice, collective liberation offer their own "raahat."',
        vocabulary: [
          { term: 'Rahatein', meaning: 'Comforts, consolations' },
          { term: 'Wasl', meaning: 'Union (with the beloved)' }
        ],
        t: null
      },
      {
        id: 'L08-6',
        urdu: 'مجھ سے پہلی سی محبت مری محبوب نہ مانگ',
        hindi: 'मुझ से पहली सी मोहब्बत मेरी महबूब न माँग',
        roman: 'mujhse pehli si mohabbat meri mehboob na maang',
        englishText: 'Do not ask of me, my love, the love I once gave you',
        transliteration: 'Mujh se pehlī sī mohabbat merī mehbūb na māñg',
        translation: 'Do not demand from me, beloved, the same love as before.',
        simple: 'The refrain returns — the beloved must accept that the poet now belongs also to the wider world.',
        detailed: 'The closing repetition reframes what seemed like romantic betrayal as moral evolution. The refrain is both apology and manifesto.',
        vocabulary: [
          { term: 'Pehli si', meaning: 'Like before, the same as the first' },
          { term: 'Na maang', meaning: 'Do not ask / demand' }
        ],
        t: null
      }
    ]
  },
  {
    id: '09',
    title: 'Wo Jo Hum Mein Tum Mein Qarar Tha',
    artist: 'Abida Parveen',
    poet: 'Faiz Ahmed Faiz',
    form: 'Ghazal',
    audioUrl: '',
    coverUrl: '',
    ytQuery: 'Wo Jo Hum Mein Tum Mein Qarar Tha Abida Parveen Faiz',
    mood: 'Loss & Remembrance',
    lines: [
      {
        id: 'L09-1',
        urdu: 'وہ جو ہم میں تم میں قرار تھا، تمہیں یاد ہو کہ نہ یاد ہو',
        hindi: 'वो जो हम में तुम में क़रार था, तुम्हें याद हो कि न याद हो',
        roman: 'wo jo hum mein tum mein qarar tha, tumhein yaad ho ke na yaad ho',
        englishText: 'That bond which existed between us — you may remember or may not',
        transliteration: 'Wo jo ham meñ tum meñ qarār thā, tumheñ yād ho ke na yād ho',
        translation: 'That covenant between you and me — whether you remember it or not.',
        simple: 'He recalls a mutual understanding between them, noting bitterly that she may have forgotten it entirely.',
        detailed: 'The refrain "tumhein yaad ho ke na yaad ho" is devastating in its casualness — it grants the beloved the right to forget while documenting the forgetting as a wound.',
        vocabulary: [
          { term: 'Qarar', meaning: 'Pact, understanding, peace' },
          { term: 'Yaad ho ke na yaad ho', meaning: 'Whether you remember or not' }
        ],
        t: null
      },
      {
        id: 'L09-2',
        urdu: 'وہ جو لطف مجلسِ یار تھا، تمہیں یاد ہو کہ نہ یاد ہو',
        hindi: 'वो जो लुत्फ़ मजलिस-ए-यार था, तुम्हें याद हो कि न याद हो',
        roman: 'wo jo lutf majlis-e-yaar tha, tumhein yaad ho ke na yaad ho',
        englishText: 'That joy of being in each other\'s company — you may remember or not',
        transliteration: 'Wo jo lutf majlis-e-yār thā, tumheñ yād ho ke na yād ho',
        translation: 'That delight of the beloved\'s gathering — whether you recall it or not.',
        simple: 'He remembers the pleasure of being together in each other\'s company, acknowledging she may not.',
        detailed: '"Majlis-e-yaar" (the beloved\'s assembly) evokes warmth, conversation, laughter — a whole ecology of intimacy now extinct. The refrain lets him mourn without accusing.',
        vocabulary: [
          { term: 'Lutf', meaning: 'Pleasure, delight, grace' },
          { term: 'Majlis-e-yaar', meaning: 'Gathering of the beloved / friends' }
        ],
        t: null
      },
      {
        id: 'L09-3',
        urdu: 'کوئی دل نہ پھینکے نظر میں نگار',
        hindi: 'कोई दिल न फेंके नज़र में निगार',
        roman: 'koi dil na pheinke nazar mein nigaar',
        englishText: 'Let no beauty cast her heart into your gaze',
        transliteration: 'Koī dil na pheñke nazar meñ nigār',
        translation: 'May no beauty throw her heart into your line of sight.',
        simple: 'He prays no one else catches her eye or heart — a jealous, protective wish.',
        detailed: 'The image of a heart being "thrown" into a glance fuses violence and romance; the prayer reveals lingering possessiveness despite the surface composure.',
        vocabulary: [
          { term: 'Nigaar', meaning: 'Beauty, beloved' },
          { term: 'Nazar', meaning: 'Gaze, sight' }
        ],
        t: null
      },
      {
        id: 'L09-4',
        urdu: 'جو مجھے مسرت اور غم دیے تھے تم نے',
        hindi: 'जो मुझे मसर्रत और ग़म दिए थे तुम ने',
        roman: 'jo mujhe masarrat aur gham diye the tum ne',
        englishText: 'The joys and sorrows you gave me',
        transliteration: 'Jo mujhe masarrat aur gham diye the tum ne',
        translation: 'The happiness and grief you bestowed upon me —',
        simple: 'He catalogues what she gave him: both joy and pain, equally treasured.',
        detailed: 'By placing "masarrat" (joy) and "gham" (grief) side by side as equal gifts, Faiz dissolves the boundary between pleasure and pain in love.',
        vocabulary: [
          { term: 'Masarrat', meaning: 'Joy, happiness' },
          { term: 'Gham', meaning: 'Grief, sorrow' }
        ],
        t: null
      },
      {
        id: 'L09-5',
        urdu: 'وہ جو شب کے ہم نشیں تھے، تمہیں یاد ہو کہ نہ یاد ہو',
        hindi: 'वो जो शब के हम-नशीं थे, तुम्हें याद हो कि न याद हो',
        roman: 'wo jo shab ke hum-nasheen the, tumhein yaad ho ke na yaad ho',
        englishText: 'Those who were our companions of the night — you may remember or not',
        transliteration: 'Wo jo shab ke ham-nashīñ the, tumheñ yād ho ke na yād ho',
        translation: 'Those who sat with us through the night — whether you remember or not.',
        simple: 'He recalls the companions who shared their evenings, wondering if she even remembers them.',
        detailed: '"Shab ke ham-nasheen" (companions of the night) could be fellow revolutionaries or fellow lovers — the ambiguity is deliberate in Faiz\'s dual-register poetry.',
        vocabulary: [
          { term: 'Shab', meaning: 'Night' },
          { term: 'Ham-nasheen', meaning: 'Companions, those who sit together' }
        ],
        t: null
      }
    ]
  },
  {
    id: '10',
    title: 'Tujhe Yaad Na Meri Aayi',
    artist: 'Mehdi Hassan',
    poet: 'Mir Taqi Mir',
    form: 'Ghazal',
    audioUrl: '',
    coverUrl: '',
    ytQuery: 'Tujhe Yaad Na Meri Aayi Mehdi Hassan Mir Taqi Mir',
    mood: 'Lament & Reproach',
    lines: [
      {
        id: 'L10-1',
        urdu: 'تجھے یاد نہ میری آئی، کسی سے اب کیا کہیے',
        hindi: 'तुझे याद न मेरी आई, किसी से अब क्या कहिए',
        roman: 'tujhe yaad na meri aayi, kisi se ab kya kahiye',
        englishText: 'You did not remember me — what can I say to anyone now?',
        transliteration: 'Tujhe yād na merī āī, kisī se ab kyā kahiye',
        translation: 'You never thought of me — what is there left to say to anyone?',
        simple: 'She never remembered him, and now he has no words left to express this abandonment to the world.',
        detailed: 'The line carries the weight of Mir\'s signature simplicity: no ornament, just the blunt fact of being forgotten and the speechlessness it produces.',
        vocabulary: [
          { term: 'Yaad na aayi', meaning: 'Did not remember' },
          { term: 'Kya kahiye', meaning: 'What can one say' }
        ],
        t: null
      },
      {
        id: 'L10-2',
        urdu: 'تری محفل میں لیکن ہم نہ ٹھہرے',
        hindi: 'तेरी महफ़िल में लेकिन हम न ठहरे',
        roman: 'teri mehfil mein lekin hum na thehre',
        englishText: 'Yet in your gathering, I could not stay',
        transliteration: 'Terī mehfil meñ lekin ham na ṭhehre',
        translation: 'But I could not remain in your assembly.',
        simple: 'He tried to stay in her company but couldn\'t — whether from shame or heartbreak.',
        detailed: 'The "mehfil" (gathering) suggests a public space where his grief made him an outsider. The understated "na thehre" (did not stay) conceals volumes of pain.',
        vocabulary: [
          { term: 'Mehfil', meaning: 'Assembly, gathering, soirée' },
          { term: 'Na thehre', meaning: 'Could not stay / remain' }
        ],
        t: null
      },
      {
        id: 'L10-3',
        urdu: 'تری دنیا سے ہو کر مایوس، چل دیے',
        hindi: 'तेरी दुनिया से हो कर मायूस, चल दिए',
        roman: 'teri duniya se ho kar mayoos, chal diye',
        englishText: 'Despairing of your world, I departed',
        transliteration: 'Terī duniyā se ho kar māyūs, chal diye',
        translation: 'Having lost all hope in your world, I left.',
        simple: 'He gave up on her world entirely and walked away in despair.',
        detailed: '"Teri duniya" makes the beloved\'s sphere a self-contained universe; to leave it is a kind of cosmic exile. "Chal diye" is quiet, final, without drama.',
        vocabulary: [
          { term: 'Mayoos', meaning: 'Despairing, hopeless' },
          { term: 'Chal diye', meaning: 'Departed, walked away' }
        ],
        t: null
      },
      {
        id: 'L10-4',
        urdu: 'تجھے کیا میری قدر ہوگی، مگر اے سنگدل',
        hindi: 'तुझे क्या मेरी क़द्र होगी, मगर ऐ संगदिल',
        roman: 'tujhe kya meri qadr hogi, magar ae sangdil',
        englishText: 'What would you know of my worth, O stone-hearted one?',
        transliteration: 'Tujhe kyā merī qadr hogī, magar ae sangdil',
        translation: 'How would you ever know my value, O you of the stone heart?',
        simple: 'He reproaches her: she is too hard-hearted to recognize what she had in him.',
        detailed: '"Sangdil" (stone-hearted) is the classic reproach of the ghazal lover. The question is rhetorical — he knows she will never value what she casually discarded.',
        vocabulary: [
          { term: 'Qadr', meaning: 'Value, worth, appreciation' },
          { term: 'Sangdil', meaning: 'Stone-hearted, cruel' }
        ],
        t: null
      },
      {
        id: 'L10-5',
        urdu: 'کسی کو اتنا نہ چاہو کہ پھر کچھ اور نظر نہ آئے',
        hindi: 'किसी को इतना न चाहो कि फिर कुछ और नज़र न आए',
        roman: 'kisi ko itna na chaho ke phir kuchh aur nazar na aaye',
        englishText: 'Do not love someone so much that nothing else remains visible',
        transliteration: 'Kisī ko itnā na chāho ke phir kuchh aur nazar na āye',
        translation: 'Do not love anyone so wholly that the rest of the world disappears.',
        simple: 'A warning from experience: loving too deeply blinds you to everything else and leads to ruin.',
        detailed: 'Mir turns didactic — the lover who has been destroyed by exclusive devotion now counsels moderation. The advice is sincere yet self-contradictory: Mir could never follow it himself.',
        vocabulary: [
          { term: 'Chaho', meaning: 'Love / desire' },
          { term: 'Nazar na aaye', meaning: 'Nothing else be visible' }
        ],
        t: null
      },
      {
        id: 'L10-6',
        urdu: 'میرؔ کی غزل کا کیا کہنا، تمام عمر رلا دیے',
        hindi: 'मीर की ग़ज़ल का क्या कहना, तमाम उम्र रुला दिए',
        roman: 'Mir ki ghazal ka kya kehna, tamaam umr rula diye',
        englishText: 'What can one say of Mir\'s ghazal — it made us weep a whole lifetime',
        transliteration: 'Mīr kī ghazal kā kyā kehnā, tamām umr rulā diye',
        translation: 'What praise for Mir\'s ghazal — it has made us weep our entire lives.',
        simple: 'A self-referential closing: Mir\'s poetry has the power to make listeners weep endlessly.',
        detailed: 'The maqta references Mir himself with characteristic self-aware pathos. His poetry IS sorrow distilled — to read it is to enter a lifelong vigil of tears.',
        vocabulary: [
          { term: 'Tamaam umr', meaning: 'The entire lifetime' },
          { term: 'Rula diye', meaning: 'Made (us) weep' }
        ],
        t: null
      }
    ]
  }
]

export default catalog
