const setupForm = document.getElementById('setup-form');
const fileInput = document.getElementById('file');
const textInput = document.getElementById('text');
const dropzone = document.getElementById('dropzone');
const setupSection = document.getElementById('setup-section');
const playbackSection = document.getElementById('playback-section');
const errorBanner = document.getElementById('error-banner');

const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const backBtn = document.getElementById('back-btn');
const startBtn = document.getElementById('start-btn');
const downloadFullBtn = document.getElementById('download-full-btn');
const loadingOverlay = document.getElementById('loading-overlay');

const sourceLangSelect = document.getElementById('source-lang');
const targetLangSelect = document.getElementById('target-lang');
const genderSelect = document.getElementById('gender');
const modeSelect = document.getElementById('mode');

const sourceCard = document.getElementById('source-card');
const targetCard = document.getElementById('target-card');
const sourceTextEl = document.getElementById('source-text');
const targetTextEl = document.getElementById('target-text');
const sourceBadge = document.getElementById('source-badge');
const targetBadge = document.getElementById('target-badge');

const sentenceLoader = document.getElementById('sentence-loader');

const currentIndexEl = document.getElementById('current-index');
const totalSentencesEl = document.getElementById('total-sentences');
const progressFill = document.getElementById('progress-fill');

const audioPlayer = document.getElementById('audio-player');

let sentences = [];
let currentIndex = 0;
let isPlaying = false;
let isPaused = false;
let currentSequence = [];
let sequenceIndex = 0;

function showError(msg) {
    errorBanner.innerText = msg;
    errorBanner.style.display = 'block';
    setTimeout(() => { errorBanner.style.display = 'none'; }, 5000);
}

// Handle File Dropzone logic
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        dropzone.querySelector('.file-name').innerText = fileInput.files[0].name;
    }
});
fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
        dropzone.querySelector('.file-name').innerText = fileInput.files[0].name;
    }
});
dropzone.addEventListener('click', () => {
    fileInput.click();
});

// Form Submission
setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    if (fileInput.files.length) formData.append('file', fileInput.files[0]);
    if (textInput.value.trim()) formData.append('text', textInput.value);

    formData.append('source_lang', sourceLangSelect.value);

    startBtn.disabled = true;
    loadingOverlay.classList.remove('hidden');

    try {
        const res = await fetch('/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error("Server response was not ok");
        const data = await res.json();
        
        if (data.sentences && data.sentences.length > 0) {
            sentences = data.sentences;
            totalSentencesEl.innerText = sentences.length;
            
            // Setup dynamic badges based on selected languages
            sourceBadge.innerText = sourceLangSelect.options[sourceLangSelect.selectedIndex].text.toUpperCase();
            targetBadge.innerText = targetLangSelect.options[targetLangSelect.selectedIndex].text.toUpperCase();
            
            setupSection.classList.add('hidden');
            playbackSection.classList.remove('hidden');
            
            currentIndex = 0;
            isPlaying = true;
            isPaused = false;
            updatePlayPauseUI();
            
            prepareSentence();
        } else {
            showError("No recognizable text found.");
        }
    } catch (err) {
        console.error(err);
        showError("Failed to connect to the server.");
    } finally {
        startBtn.disabled = false;
        loadingOverlay.classList.add('hidden');
    }
});

async function prepareSentence() {
    if (currentIndex >= sentences.length) {
        isPlaying = false;
        isPaused = false;
        updatePlayPauseUI();
        progressFill.style.width = '100%';
        return;
    }

    currentIndexEl.innerText = currentIndex + 1;
    progressFill.style.width = `${(currentIndex / sentences.length) * 100}%`;

    const textToProcess = sentences[currentIndex];
    
    // UI Loading state
    sourceCard.classList.add('hidden');
    targetCard.classList.add('hidden');
    sourceCard.classList.remove('active');
    targetCard.classList.remove('active');
    sentenceLoader.classList.remove('hidden');

    try {
        const res = await fetch('/process_sentence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: textToProcess,
                source_lang: sourceLangSelect.value,
                target_lang: targetLangSelect.value,
                gender: genderSelect.value
            })
        });
        if (!res.ok) throw new Error("Processing failed");
        const data = await res.json();
        
        sourceTextEl.innerText = data.original_text;
        targetTextEl.innerText = data.translated_text;

        buildSequence(data);
        
        sentenceLoader.classList.add('hidden');
        
        const mode = modeSelect.value;
        if (mode === 'source_target' || mode === 'target_source') {
            sourceCard.classList.remove('hidden');
            targetCard.classList.remove('hidden');
        } else if (mode === 'target_only') {
            targetCard.classList.remove('hidden');
        }
        
        if (isPlaying && !isPaused) {
            playNextInSequence();
        }
    } catch (err) {
        console.error("Failed to process sentence", err);
        isPlaying = false;
        updatePlayPauseUI();
        sentenceLoader.classList.add('hidden');
        showError("Failed to process sentence audio.");
    }
}

function buildSequence(data) {
    const mode = modeSelect.value;
    currentSequence = [];
    sequenceIndex = 0;

    const sourceItem = { type: 'source', audio: data.original_audio_url };
    const targetItem = { type: 'target', audio: data.translated_audio_url };

    if (mode === 'source_target') {
        currentSequence = [sourceItem, targetItem];
    } else if (mode === 'target_source') {
        currentSequence = [targetItem, sourceItem];
    } else if (mode === 'target_only') {
        currentSequence = [targetItem];
    }
}

function playNextInSequence() {
    if (isPaused) return;

    if (sequenceIndex < currentSequence.length) {
        const item = currentSequence[sequenceIndex];
        
        sourceCard.classList.remove('active');
        targetCard.classList.remove('active');

        if (item.type === 'source') {
            sourceCard.classList.add('active');
        } else {
            targetCard.classList.add('active');
        }

        audioPlayer.src = item.audio;
        audioPlayer.play().catch(e => {
            console.error("Playback failed", e);
            sequenceIndex++;
            setTimeout(playNextInSequence, 1000);
        });
        
        sequenceIndex++;
    } else {
        sourceCard.classList.remove('active');
        targetCard.classList.remove('active');
        currentIndex++;
        prepareSentence();
    }
}

audioPlayer.addEventListener('ended', () => {
    if (isPlaying && !isPaused) {
        playNextInSequence();
    }
});

playBtn.addEventListener('click', () => {
    if (currentIndex >= sentences.length) {
        currentIndex = 0;
        prepareSentence();
    }
    
    isPlaying = true;
    isPaused = false;
    updatePlayPauseUI();
    
    if (currentSequence.length > 0 && currentSequence[sequenceIndex-1]) {
        audioPlayer.play();
    } else {
        prepareSentence();
    }
});

pauseBtn.addEventListener('click', () => {
    isPaused = true;
    audioPlayer.pause();
    updatePlayPauseUI();
});

backBtn.addEventListener('click', () => {
    isPaused = true;
    isPlaying = false;
    audioPlayer.pause();
    updatePlayPauseUI();
    
    playbackSection.classList.add('hidden');
    setupSection.classList.remove('hidden');
});

function updatePlayPauseUI() {
    if (isPlaying && !isPaused) {
        playBtn.disabled = true;
        pauseBtn.disabled = false;
    } else {
        playBtn.disabled = false;
        pauseBtn.disabled = true;
    }
}

downloadFullBtn.addEventListener('click', async () => {
    downloadFullBtn.disabled = true;
    const originalContent = downloadFullBtn.innerHTML;
    downloadFullBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto;"></div>';

    try {
        const res = await fetch('/generate_full_audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sentences: sentences,
                source_lang: sourceLangSelect.value,
                target_lang: targetLangSelect.value,
                gender: genderSelect.value,
                mode: modeSelect.value
            })
        });
        if (!res.ok) throw new Error("Failed to generate combined audio");
        const data = await res.json();
        
        const a = document.createElement('a');
        a.href = data.download_url;
        a.download = `poliglota_${sourceLangSelect.value}_to_${targetLangSelect.value}_${modeSelect.value}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (err) {
        console.error(err);
        showError("Failed to generate or download full audio. Check server console.");
    } finally {
        downloadFullBtn.innerHTML = originalContent;
        downloadFullBtn.disabled = false;
    }
});
