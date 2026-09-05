"""
Tests for the Rekhta scraper's text handling.

Run:  python test_scraper.py

Covers the two defects that made the scraped corpus unusable:
  * Rekhta prints every ghazal twice in Roman (with and without diacritics),
    which was stored as two separate couplets each;
  * the Devanagari and Urdu variants were never fetched at all, leaving 99% of
    the corpus Roman-only — and alignment matches in the lyric's own script.
"""

import sys

from scraper.rekhta_scraper import _drop_transliteration_echo, _fold, _with_lang

FAILURES: list[str] = []


def check(name, cond, detail=""):
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {detail}")
        FAILURES.append(name)


print("\n-- Folding ---------------------------------------------------------")
check("diacritics are stripped", _fold("bāteñ") == "baten", f"({_fold('bāteñ')})")
check("punctuation and spaces go", _fold("dil-e-nadāñ, tujhe!") == "dilenadantujhe",
      f"({_fold('dil-e-nadāñ, tujhe!')})")
check("devanagari folds to empty", _fold("आज जाने की") == "")
check("urdu folds to empty", _fold("آج جانے کی") == "")


print("\n-- Dropping Rekhta's second transliteration -------------------------")

# The real shape of a Roman ghazal page: diacritic copy, then plain copy.
roman = [
    "tum apne shikve kī bāteñ na khod khod ke pūchho",
    "hazar karo mire dil se ki is meñ aag dabī hai",
    "dilā ye dard-o-alam bhī to muġhtanim hai ki āḳhir",
    "na girya-e-saharī hai na āh-e-nīm-shabī hai",
    "tum apne shikwe ki baaten na khod khod ke puchho",
    "hazar karo mere dil se ki is mein aag dabi hai",
    "dila ye dard-o-alam bhi to mughtanim hai ki aaKHir",
    "na girya-e-sahari hai na aah-e-nim-shabi hai",
]
kept = _drop_transliteration_echo(roman)
check("the echoed half is dropped", len(kept) == 4, f"(kept {len(kept)})")
check("the diacritic copy is the one kept", "bāteñ" in kept[0], f"({kept[0][:40]})")

# Devanagari pages are NOT echoed. Folding them yields empty skeletons, and
# comparing "" with "" scores a perfect match — which would halve every page.
hindi = [
    "तुम अपने शिकवे की बातें न खोद खोद के पूछो",
    "हज़र करो मिरे दिल से कि इस में आग दबी है",
    "दिला ये दर्द-ओ-अलम भी तो मुग़्तनिम है कि आख़िर",
    "न गिर्या-ए-सहरी है न आह-ए-नीम-शबी है",
]
check("devanagari page is left intact", _drop_transliteration_echo(hindi) == hindi,
      f"(got {len(_drop_transliteration_echo(hindi))} of {len(hindi)})")

urdu = ["تم اپنے شکوے کی باتیں", "حذر کرو مرے دل سے", "دلا یہ درد و الم", "نہ گریہ سحری ہے"]
check("urdu page is left intact", _drop_transliteration_echo(urdu) == urdu)

# A genuine ghazal whose halves merely rhyme must not be halved.
distinct = [
    "koi umid bar nahin aati",
    "koi surat nazar nahin aati",
    "maut ka ek din muayyan hai",
    "nind kyun raat bhar nahin aati",
]
check("a real ghazal is not mistaken for an echo",
      _drop_transliteration_echo(distinct) == distinct)
check("odd line counts are left alone", _drop_transliteration_echo(roman[:5]) == roman[:5])
check("short inputs are left alone", _drop_transliteration_echo(roman[:2]) == roman[:2])


print("\n-- Script variant URLs ----------------------------------------------")

# These URLs already carry ?sort=year-asc; appending "?lang=hi" produced a
# malformed query that silently returned the Roman page.
base = "https://www.rekhta.org/ghazals/x-mirza-ghalib-ghazals?sort=year-asc"
hi = _with_lang(base, "hi")
check("lang is merged, not appended with a second '?'", hi.count("?") == 1, f"({hi})")
check("the existing query survives", "sort=year-asc" in hi, f"({hi})")
check("lang is set", "lang=hi" in hi, f"({hi})")
check("switching script replaces rather than duplicates",
      _with_lang(hi, "ur").count("lang=") == 1, f"({_with_lang(hi, 'ur')})")
check("a url with no query still works", "lang=ur" in _with_lang("https://x.org/g", "ur"))

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {FAILURES}")
    sys.exit(1)
print("All scraper tests passed.")
