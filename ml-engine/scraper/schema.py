"""
Shama ML Engine — Training Data Schema
=======================================
Pydantic models defining the structure for fine-tuning/RAG training data.
Each TrainingExample pairs a couplet (input) with its meaning layers (output).
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class VocabularyEntry(BaseModel):
    """A single vocabulary term and its meaning."""

    term: str = Field(..., description="The Urdu/Hindi/Persian word or phrase")
    meaning: str = Field(..., description="Plain-English explanation of the term")


class LiteraryDevice(BaseModel):
    """A literary device identified in the couplet."""

    device: str = Field(..., description="Name of the device (e.g. metaphor, tashbih, irsaal-e-masal)")
    explanation: str = Field(..., description="How the device manifests in this couplet")


class CoupletInput(BaseModel):
    """The raw couplet information fed into the meaning engine."""

    couplet_roman: str = Field(..., description="Couplet in Roman/Latin script transliteration")
    couplet_urdu: str = Field(default="", description="Couplet in Urdu script")
    couplet_hindi: str = Field(default="", description="Couplet in Devanagari script")
    poet: str = Field(..., description="Pen-name (takhallus) or full name of the poet")
    ghazal_title: str = Field(..., description="Title or opening line identifying the ghazal")
    position_in_ghazal: int = Field(
        ..., ge=1, description="1-indexed position of this couplet within the ghazal"
    )


class CoupletOutput(BaseModel):
    """The AI-generated meaning layers for a couplet."""

    translation: str = Field(..., description="Faithful English translation of the couplet")
    simple: str = Field(
        ..., description="One-line simple explanation suitable for beginners"
    )
    detailed: str = Field(
        ...,
        description="Deeper literary/cultural explanation for advanced learners",
    )
    vocabulary: list[VocabularyEntry] = Field(
        default_factory=list,
        description="Key terms from the couplet with their meanings",
    )
    literary_devices: list[LiteraryDevice] = Field(
        default_factory=list,
        description="Literary/rhetorical devices used in the couplet",
    )
    mood: str = Field(
        default="",
        description="Emotional register of the couplet (e.g. longing, defiance, irony)",
    )


class TrainingExample(BaseModel):
    """A complete training example pairing input couplet with expected output."""

    input: CoupletInput
    output: CoupletOutput

    class Config:
        json_schema_extra = {
            "example": {
                "input": {
                    "couplet_roman": "dil-e-nadaan tujhe hua kya hai",
                    "couplet_urdu": "دلِ ناداں تجھے ہوا کیا ہے",
                    "couplet_hindi": "दिल-ए-नादाँ तुझे हुआ क्या है",
                    "poet": "Mirza Ghalib",
                    "ghazal_title": "Dil-e-Nadaan Tujhe Hua Kya Hai",
                    "position_in_ghazal": 1,
                },
                "output": {
                    "translation": "O naive heart, what is it that has come over you?",
                    "simple": "Ghalib turns inward and questions his own foolish heart — what is this sudden restlessness?",
                    "detailed": "The address to 'dil-e-nadaan' sets up the whole ghazal as a dialogue between reason and a heart that will not listen.",
                    "vocabulary": [
                        {"term": "Dil-e-nadaan", "meaning": "Innocent / naive heart"},
                        {"term": "Hua kya hai", "meaning": "What has happened"},
                    ],
                    "literary_devices": [
                        {
                            "device": "Personification",
                            "explanation": "The heart is addressed as a separate, naive entity.",
                        }
                    ],
                    "mood": "Wonder & Restlessness",
                },
            }
        }
