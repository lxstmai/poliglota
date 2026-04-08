import edge_tts
import asyncio
import os

class TTSEngine:
    def __init__(self, cache_dir="static/cache"):
        self.cache_dir = cache_dir
        # Comprehensive voice mapping for 8 supported languages
        self.voices = {
            "en": {
                "female": "en-US-JennyNeural",
                "male": "en-US-GuyNeural"
            },
            "es": {
                "female": "es-ES-ElviraNeural",
                "male": "es-ES-AlvaroNeural"
            },
            "fr": {
                "female": "fr-FR-DeniseNeural",
                "male": "fr-FR-HenriNeural"
            },
            "de": {
                "female": "de-DE-KatjaNeural",
                "male": "de-DE-ConradNeural"
            },
            "it": {
                "female": "it-IT-ElsaNeural",
                "male": "it-IT-DiegoNeural"
            },
            "pt": {
                "female": "pt-PT-RaquelNeural",
                "male": "pt-PT-DuarteNeural"
            },
            "pl": {
                "female": "pl-PL-ZofiaNeural",
                "male": "pl-PL-MarekNeural"
            },
            "ru": {
                "female": "ru-RU-SvetlanaNeural",
                "male": "ru-RU-DmitryNeural"
            }
        }
        os.makedirs(self.cache_dir, exist_ok=True)

    async def generate_audio(self, text, lang, filename, gender="female"):
        voice = self.voices.get(lang, {}).get(gender)
        if not voice:
            # Fallback to English female if unsupported language is forced
            print(f"Warning: Unsupported language '{lang}', falling back to English (US).")
            voice = "en-US-JennyNeural"
        
        filepath = os.path.join(self.cache_dir, filename)
        if os.path.exists(filepath):
            return filepath
            
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(filepath)
        return filepath

tts_engine = TTSEngine()
