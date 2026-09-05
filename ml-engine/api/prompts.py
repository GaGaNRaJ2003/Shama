"""
System prompts and few-shot examples for the Shama meaning engine.
"""

import json

SYSTEM_PROMPT = """You are a distinguished scholar of Indo-Persian poetry (Urdu ghazal, qawwali, and classical traditions). You explain poetry with the warmth and patience of a beloved Urdu literature professor — someone who makes students fall in love with the depth of every word.

Your task: Given a couplet (sher), provide a rich, layered interpretation.

Guidelines:
- Explain literary devices using their proper Urdu/Arabic terminology (tashbih, isti'ara, takhallus, radif, qafia, husn-e-ta'lil, iham, muravvat-ul-nazir, tajnis, etc.)
- Provide vocabulary with Romanized Urdu/Persian terms and their English meanings
- Respect the emotional and spiritual weight of the verse
- If a poet's takhallus appears, note its significance
- Identify the mood/emotion (hijr, visal, ishq, fana, sukoon, dard, etc.)
- Be culturally sensitive and contextually aware of Sufi, romantic, and philosophical traditions

You MUST respond in valid JSON matching this exact schema:
{
  "translation": "A faithful English translation of the couplet",
  "simple": "A 2-3 sentence simple explanation accessible to someone unfamiliar with the tradition",
  "detailed": "A rich 4-8 sentence interpretation covering symbolism, context, emotional layers, and poetic craft",
  "vocabulary": [
    {"term": "romanized_word", "meaning": "English meaning", "script": "original_script (Urdu/Persian)"}
  ],
  "literary_devices": [
    {"device": "device_name_in_urdu", "english_name": "English equivalent", "explanation": "How it is used in this couplet"}
  ],
  "mood": "Primary emotional register of the couplet (e.g., hijr/separation, ishq/love, fana/annihilation, sukoon/peace)"
}

IMPORTANT: Output ONLY valid JSON. No markdown, no code fences, no preamble."""


LANGUAGE_INSTRUCTIONS = {
    "roman": "Respond with all Urdu/Hindi terms in Roman transliteration. Keep the explanation in English but use Romanized Urdu words naturally.",
    "urdu": "Respond entirely in Urdu script. All explanations, vocabulary meanings, and descriptions should be in Urdu.",
    "hindi": "Respond in Hindi (Devanagari script). Translate all explanations to Hindi while preserving original Urdu/Persian poetic terms.",
    "english": "Respond entirely in English. Minimize use of non-English terms except in the vocabulary section where originals are needed.",
}


DEPTH_INSTRUCTIONS = {
    "simple": "Keep explanations brief and accessible. The 'simple' field should be 1-2 sentences, 'detailed' should be 2-3 sentences. Focus on core meaning over literary analysis.",
    "detailed": "Provide exhaustive interpretation. The 'simple' field should be 2-3 sentences, 'detailed' should be 6-10 sentences covering historical context, Sufi interpretation, romantic interpretation, philosophical layers, and poetic craft. List at least 4-5 vocabulary items and all identifiable literary devices.",
}

# One response serves every reading depth in the UI, so we always ask for both
# registers in a single call. Asking twice cost two LLM round-trips and two
# cache rows for a payload the first response already contained in full.
FULL_DEPTH_INSTRUCTION = (
    "Write BOTH registers well, because the reader chooses between them: "
    "'simple' must be 2-3 plain sentences that assume no familiarity with the tradition, "
    "and 'detailed' must be 6-10 sentences covering historical context, Sufi and romantic "
    "readings, philosophical layers and poetic craft. "
    "List 3-5 vocabulary items (only genuinely difficult Urdu/Persian words) and every "
    "literary device you can actually identify — do not invent devices to fill the list."
)


FEW_SHOT_EXAMPLES = [
    {
        "couplet": "Hazaaron khwahishein aisi ke har khwahish pe dam nikle\nBahut nikle mere armaan lekin phir bhi kam nikle",
        "poet": "Mirza Ghalib",
        "response": {
            "translation": "I have thousands of desires, each so intense that it could take my life. Many of my longings were fulfilled, yet they still felt too few.",
            "simple": "Ghalib expresses the insatiable nature of human desire — no matter how much is fulfilled, the heart always yearns for more. It is a meditation on the endless hunger of the soul.",
            "detailed": "This opening sher from Ghalib's famous ghazal is a masterclass in expressing the paradox of desire. The poet establishes that his desires are not ordinary wishes — each one carries the weight of life itself ('dam nikle' meaning both 'breath escapes' and 'life departs'). The second line creates a beautiful tension: many desires WERE fulfilled ('bahut nikle mere armaan') yet they remained insufficient ('phir bhi kam nikle'). This is Ghalib's commentary on the human condition — desire is infinite, fulfillment is finite. The repetition of 'nikle' as radif creates a musical cohesion while carrying different shades of meaning in each usage. The sher works on both the romantic plane (unfulfilled love) and the existential plane (the nature of human longing itself).",
            "vocabulary": [
                {"term": "khwahish", "meaning": "desire, wish", "script": "خواہش"},
                {"term": "dam nikle", "meaning": "to breathe one's last / life departs", "script": "دم نکلے"},
                {"term": "armaan", "meaning": "deep longing, unfulfilled desire", "script": "ارمان"},
                {"term": "kam", "meaning": "less, insufficient", "script": "کم"},
            ],
            "literary_devices": [
                {
                    "device": "radif",
                    "english_name": "refrain",
                    "explanation": "'nikle' repeats at the end of each line, serving as radif while carrying different semantic weight each time",
                },
                {
                    "device": "mubalagha",
                    "english_name": "hyperbole",
                    "explanation": "'Hazaaron khwahishein' — thousands of desires — amplifies the intensity of longing",
                },
                {
                    "device": "iham",
                    "english_name": "ambiguity/double meaning",
                    "explanation": "'dam nikle' simultaneously means 'breath escapes' (sighing) and 'life departs' (dying of desire)",
                },
            ],
            "mood": "hijr / unfulfilled longing (hasrat)",
        },
    }
]


def _few_shot_block() -> str:
    """One worked example. Anchors tone, vocabulary depth and device naming."""
    ex = FEW_SHOT_EXAMPLES[0]
    return (
        "--- Example of the quality and shape expected ---\n"
        f'Couplet: "{ex["couplet"]}"\n'
        f'Poet: {ex["poet"]}\n'
        f"Response: {json.dumps(ex['response'], ensure_ascii=False)}\n"
        "--- End example ---\n"
    )


def build_prompt(
    couplet: str,
    poet: str | None,
    language: str,
    depth: str | None = None,
    rag_context: list[str] | None = None,
) -> str:
    """Build the user prompt with RAG context and instructions.

    `depth` is retained for callers that still pass it, but the default (None)
    asks for both registers at once — see FULL_DEPTH_INSTRUCTION.
    """

    parts = []

    # Language and depth instructions
    parts.append(f"Language instruction: {LANGUAGE_INSTRUCTIONS.get(language, LANGUAGE_INSTRUCTIONS['roman'])}")
    parts.append(
        f"Depth instruction: {DEPTH_INSTRUCTIONS[depth] if depth in DEPTH_INSTRUCTIONS else FULL_DEPTH_INSTRUCTION}"
    )

    parts.append("\n" + _few_shot_block())

    # RAG context if available
    if rag_context:
        parts.append("\n--- Related couplets for context ---")
        for i, ctx in enumerate(rag_context, 1):
            parts.append(f"{i}. {ctx}")
        parts.append("--- End context ---\n")

    # The target couplet
    parts.append(f"Now interpret this couplet:")
    parts.append(f'"{couplet}"')
    if poet:
        parts.append(f"Poet: {poet}")

    parts.append("\nRespond with valid JSON only.")

    return "\n".join(parts)
