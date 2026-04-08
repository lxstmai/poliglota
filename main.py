from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from deep_translator import GoogleTranslator
from pydantic import BaseModel
import nltk
from nltk.tokenize import sent_tokenize
import os
import uuid
import hashlib
import asyncio
import time

from tts_engine import tts_engine

# ---------------------------------------------------------
# Artificial Intelligence Language Learning Open-Source API
# ---------------------------------------------------------

try:
    import pypdf
    HAS_PDF = True
except ImportError:
    HAS_PDF = False

try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

app = FastAPI(title="Poliglota Open-Source")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static", exist_ok=True)
os.makedirs("static/cache", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Map of language codes to NLTK string format for accurate tokenization
NLTK_LANG_MAP = {
    "en": "english",
    "es": "spanish",
    "fr": "french",
    "de": "german",
    "it": "italian",
    "pt": "portuguese",
    "pl": "polish",
    "ru": "russian"
}

# --- Background cleanup loop ---
async def cleanup_cache_loop():
    while True:
        try:
            cache_dir = "static/cache"
            if os.path.exists(cache_dir):
                now = time.time()
                for filename in os.listdir(cache_dir):
                    if filename.endswith(".mp3"):
                        filepath = os.path.join(cache_dir, filename)
                        file_age = now - os.path.getmtime(filepath)
                        # Delete files older than 10 hours to save space
                        if file_age > 36000:
                            try:
                                os.remove(filepath)
                            except:
                                pass
        except Exception as e:
            pass
        await asyncio.sleep(600)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_cache_loop())


class SentencePayload(BaseModel):
    text: str
    source_lang: str
    target_lang: str
    gender: str = "female"

class FullAudioPayload(BaseModel):
    sentences: list[str]
    source_lang: str
    target_lang: str
    gender: str = "female"
    mode: str = "source_target" # source_target, target_source, target_only


@app.get("/", response_class=HTMLResponse)
async def read_root():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(None), 
    text: str = Form(None),
    source_lang: str = Form("en")
):
    if not file and not text:
        raise HTTPException(status_code=400, detail="No file or text provided")

    content = ""
    if file:
        if file.filename.endswith(".pdf"):
            if not HAS_PDF:
                raise HTTPException(status_code=400, detail="pypdf is not installed. Run 'pip install pypdf'")
            
            # Save temporarily
            temp_path = f"temp_{uuid.uuid4()}.pdf"
            with open(temp_path, "wb") as f:
                f.write(await file.read())
            
            # Extract content
            reader = pypdf.PdfReader(temp_path)
            for page in reader.pages:
                content += page.extract_text() + "\n"
                
            os.remove(temp_path)

        elif file.filename.endswith(".txt"):
            content = (await file.read()).decode("utf-8", errors="ignore")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")
    else:
        content = text

    content = " ".join(content.split())
    
    # NLP Tokenization based on language
    nltk_lang = NLTK_LANG_MAP.get(source_lang, "english")
    try:
        sentences = sent_tokenize(content, language=nltk_lang)
    except LookupError:
        nltk.download('punkt')
        sentences = sent_tokenize(content, language=nltk_lang)
    
    return {"sentences": sentences}

@app.post("/process_sentence")
async def process_sentence(payload: SentencePayload):
    source_lang = payload.source_lang
    target_lang = payload.target_lang
    
    translator = GoogleTranslator(source=source_lang, target=target_lang)
    
    try:
        translated_text = translator.translate(payload.text)
    except Exception as e:
        print(f"Translation error: {e}")
        translated_text = "[Translation Failed]"

    # Cache hashing mechanism guarantees identical responses load instantly
    original_hash = hashlib.md5(f"{payload.text}_{source_lang}_{payload.gender}".encode()).hexdigest()
    translated_hash = hashlib.md5(f"{translated_text}_{target_lang}_{payload.gender}".encode()).hexdigest()

    original_audio = await tts_engine.generate_audio(payload.text, source_lang, f"{original_hash}.mp3", payload.gender)
    translated_audio = await tts_engine.generate_audio(translated_text, target_lang, f"{translated_hash}.mp3", payload.gender)

    return {
        "original_text": payload.text,
        "translated_text": translated_text,
        "original_audio_url": f"/{original_audio}",
        "translated_audio_url": f"/{translated_audio}"
    }

@app.post("/generate_full_audio")
async def generate_full_audio(payload: FullAudioPayload):
    source_lang = payload.source_lang
    target_lang = payload.target_lang
    translator = GoogleTranslator(source=source_lang, target=target_lang)
    
    file_list = []
    
    for text in payload.sentences:
        try:
            translated_text = translator.translate(text)
        except Exception:
            translated_text = "[Translation Failed]"
            
        original_hash = hashlib.md5(f"{text}_{source_lang}_{payload.gender}".encode()).hexdigest()
        translated_hash = hashlib.md5(f"{translated_text}_{target_lang}_{payload.gender}".encode()).hexdigest()
        
        orig_file = await tts_engine.generate_audio(text, source_lang, f"{original_hash}.mp3", payload.gender)
        trans_file = await tts_engine.generate_audio(translated_text, target_lang, f"{translated_hash}.mp3", payload.gender)
        
        # Determine concatenation order based on mode
        if payload.mode == "source_target":
            file_list.extend([orig_file, trans_file])
        elif payload.mode == "target_source":
            file_list.extend([trans_file, orig_file])
        elif payload.mode == "target_only":
            file_list.append(trans_file)
            
    final_filename = f"static/cache/full_{uuid.uuid4().hex}.mp3"
    
    # Pure binary concatenation works effectively for identical codec streams (e.g. edge-tts mp3s)
    with open(final_filename, "wb") as outfile:
        for f in file_list:
            if os.path.exists(f):
                with open(f, "rb") as infile:
                    outfile.write(infile.read())
                    
    return {"download_url": f"/{final_filename}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
