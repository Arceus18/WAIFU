import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { WaifuAgent } from './agent.js';

let currentVrm = null;
let isSpeaking = false;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

let audioContext = null;
let analyser = null;
let currentAudio = null;

// View Mode presets: Full Body vs Upper Body
let isFullBody = true;
const FULL_BODY_CAM = { y: 0.75, z: 2.3 };
const UPPER_BODY_CAM = { y: 1.28, z: 1.35 };

// 1. Scene Setup with Alpha Transparency
const canvas = document.getElementById('avatar-canvas');
const bubble = document.getElementById('dialogue-bubble');
const micBtn = document.getElementById('mic-btn');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');

const viewModeBtn = document.getElementById('view-mode-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20.0);
camera.position.set(0.0, FULL_BODY_CAM.y, FULL_BODY_CAM.z);
camera.lookAt(0.0, FULL_BODY_CAM.y, 0.0);

const light = new THREE.DirectionalLight(0xffffff, 1.6);
light.position.set(1.0, 1.5, 1.0).normalize();
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.9));

// 2. Load VRM Model & Natural Posture
function applyNaturalStandingPose(vrm) {
    if (!vrm || !vrm.humanoid) return;
    const humanoid = vrm.humanoid;
    
    const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
    const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
    const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm');
    const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm');

    if (leftUpperArm) leftUpperArm.rotation.z = 1.25;
    if (rightUpperArm) rightUpperArm.rotation.z = -1.25;
    if (leftLowerArm) leftLowerArm.rotation.z = 0.25;
    if (rightLowerArm) rightLowerArm.rotation.z = -0.25;
}

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

loader.load(
    './model.vrm',
    (gltf) => {
        const vrm = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        vrm.scene.rotation.y = Math.PI;
        
        applyNaturalStandingPose(vrm);
        scene.add(vrm.scene);
        currentVrm = vrm;
    },
    (progress) => console.log(`Loading VRM: ${(progress.loaded / (progress.total || 1)) * 100}%`),
    (error) => console.error('Error loading VRM:', error)
);

// 3. Audio Context & Warm, Sweet, Sensual Female Voice Processing
function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

function fallbackSpeechSynthesis(text) {
    return new Promise((resolve) => {
        if (!('speechSynthesis' in window)) {
            setTimeout(() => { bubble.classList.add('hidden'); resolve(); }, 3500);
            return;
        }

        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.92;  // Intimate, relaxed pace
        utterance.pitch = 1.12; // Warm, sweet female tone

        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find(v => 
            v.name.includes('Zira') || 
            v.name.includes('Hazel') || 
            v.name.includes('Natural') || 
            v.name.includes('Aria') || 
            v.name.includes('Jenny') || 
            v.name.includes('Samantha') ||
            v.lang.includes('en')
        );
        if (femaleVoice) utterance.voice = femaleVoice;

        let mouthInterval = setInterval(() => {
            if (currentVrm?.expressionManager) {
                const randomMouth = Math.random() * 0.7;
                currentVrm.expressionManager.setValue('aa', randomMouth);
                currentVrm.expressionManager.setValue('oh', randomMouth * 0.35);
                currentVrm.expressionManager.update();
            }
        }, 90);

        const cleanup = () => {
            isSpeaking = false;
            clearInterval(mouthInterval);
            if (currentVrm?.expressionManager) {
                currentVrm.expressionManager.setValue('aa', 0);
                currentVrm.expressionManager.setValue('oh', 0);
                currentVrm.expressionManager.update();
            }
            setTimeout(() => bubble.classList.add('hidden'), 3500);
            resolve();
        };

        utterance.onend = cleanup;
        utterance.onerror = cleanup;
        window.speechSynthesis.speak(utterance);

        let resumeTimer = setInterval(() => {
            if (!window.speechSynthesis.speaking) {
                clearInterval(resumeTimer);
            } else {
                window.speechSynthesis.resume();
            }
        }, 400);
    });
}

function speakText(text) {
    return new Promise((resolve) => {
        bubble.textContent = text;
        bubble.classList.remove('hidden');
        isSpeaking = true;

        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.src = ttsUrl;
        audio.playbackRate = 0.95; // Soft, relaxed intimate tempo
        currentAudio = audio;

        try {
            const ctx = getAudioContext();
            const source = ctx.createMediaElementSource(audio);
            
            // Warm bass EQ to give silky depth & intimacy
            const bassFilter = ctx.createBiquadFilter();
            bassFilter.type = 'lowshelf';
            bassFilter.frequency.setValueAtTime(400, ctx.currentTime);
            bassFilter.gain.setValueAtTime(3.5, ctx.currentTime);

            // Soft highpass filter to smooth harsh frequencies
            const softFilter = ctx.createBiquadFilter();
            softFilter.type = 'lowpass';
            softFilter.frequency.setValueAtTime(3600, ctx.currentTime);

            analyser = ctx.createAnalyser();
            analyser.fftSize = 256;

            source.connect(bassFilter);
            bassFilter.connect(softFilter);
            softFilter.connect(analyser);
            analyser.connect(ctx.destination);
        } catch (e) {
            console.warn('AudioAnalyser connect note:', e);
        }

        audio.onended = () => {
            isSpeaking = false;
            if (currentVrm?.expressionManager) {
                currentVrm.expressionManager.setValue('aa', 0);
                currentVrm.expressionManager.setValue('oh', 0);
                currentVrm.expressionManager.update();
            }
            setTimeout(() => bubble.classList.add('hidden'), 3500);
            resolve();
        };

        audio.onerror = () => {
            fallbackSpeechSynthesis(text).then(resolve);
        };

        audio.play().catch(err => {
            console.warn('Online TTS play issue, using browser TTS fallback:', err);
            fallbackSpeechSynthesis(text).then(resolve);
        });
    });
}

function updateLipSync() {
    if (!analyser || !currentVrm || !isSpeaking) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < 32; i++) {
        sum += dataArray[i];
    }
    const averageVolume = sum / 32;
    const mouthOpenValue = Math.min(1.0, Math.max(0, (averageVolume - 10) / 60));

    if (currentVrm.expressionManager) {
        currentVrm.expressionManager.setValue('aa', mouthOpenValue);
        currentVrm.expressionManager.setValue('oh', mouthOpenValue * 0.4);
        currentVrm.expressionManager.update();
    }
}

// 4. Initialize Waifu Agent
const env = window.electronAPI.getEnv();
const agent = new WaifuAgent(env.GROQ_API_KEY || env.ANTHROPIC_API_KEY);

async function handleUserMessage(text) {
    if (!text || !text.trim()) return;
    const userMsg = text.trim();
    if (textInput) textInput.value = '';
    micBtn.textContent = '⏳ Thinking...';
    if (sendBtn) sendBtn.disabled = true;

    try {
        const reply = await agent.chat(userMsg, window.electronAPI.executeCommand);
        micBtn.textContent = '🎤';
        if (sendBtn) sendBtn.disabled = false;
        await speakText(reply);
    } catch (err) {
        console.error('Error handling message:', err);
        micBtn.textContent = '🎤';
        if (sendBtn) sendBtn.disabled = false;
    }
}

// 5. Microphone Voice Input via MediaRecorder + Groq Whisper API
async function toggleMicrophone() {
    getAudioContext();

    if (isRecording) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        micBtn.classList.remove('recording');
        micBtn.textContent = '⏳ Processing...';
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            micBtn.textContent = '⏳ Transcribing...';
            const transcribedText = await agent.transcribeAudio(audioBlob);
            
            if (transcribedText) {
                await handleUserMessage(transcribedText);
            } else {
                micBtn.textContent = '🎤';
                if (textInput) textInput.focus();
            }
        };

        mediaRecorder.start();
        isRecording = true;
        micBtn.classList.add('recording');
        micBtn.textContent = '🔴 Listening...';

    } catch (err) {
        console.error('Microphone access error:', err);
        micBtn.classList.remove('recording');
        micBtn.textContent = '🎤';
        if (textInput) textInput.focus();
    }
}

micBtn.addEventListener('click', toggleMicrophone);

if (sendBtn) {
    sendBtn.addEventListener('click', () => {
        getAudioContext();
        if (textInput && textInput.value.trim()) {
            handleUserMessage(textInput.value);
        }
    });
}

if (textInput) {
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && textInput.value.trim()) {
            getAudioContext();
            handleUserMessage(textInput.value);
        }
    });
}

// 6. Interactive Character Zoom & View Mode Controls
if (viewModeBtn) {
    viewModeBtn.addEventListener('click', () => {
        isFullBody = !isFullBody;
        const targetCam = isFullBody ? FULL_BODY_CAM : UPPER_BODY_CAM;
        camera.position.set(0.0, targetCam.y, targetCam.z);
        camera.lookAt(0.0, targetCam.y, 0.0);
        viewModeBtn.textContent = isFullBody ? '👗 Body' : '👤 Upper';
    });
}

if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
        camera.position.z = Math.max(0.8, camera.position.z - 0.25);
    });
}

if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
        camera.position.z = Math.min(3.5, camera.position.z + 0.25);
    });
}

// Mouse Wheel Zoom
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomDelta = e.deltaY * 0.0015;
    camera.position.z = Math.min(3.5, Math.max(0.8, camera.position.z + zoomDelta));
}, { passive: false });

// Window Resize Handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 7. Render Loop with Alluring Animations & Dynamic Lip Sync
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    if (currentVrm) {
        currentVrm.update(delta);

        const humanoid = currentVrm.humanoid;
        if (humanoid) {
            const spine = humanoid.getNormalizedBoneNode('spine');
            const chest = humanoid.getNormalizedBoneNode('chest');
            const head = humanoid.getNormalizedBoneNode('head');
            const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
            const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
            const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm');
            const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm');

            const s = Math.sin(time * 1.3);
            const c = Math.cos(time * 0.95);

            currentVrm.scene.position.y = s * 0.007;

            if (spine) spine.rotation.z = s * 0.015;
            if (chest) chest.rotation.y = c * 0.025;

            if (head) {
                head.rotation.y = Math.sin(time * 0.55) * 0.04;
                head.rotation.z = Math.cos(time * 0.45) * 0.025;
            }

            if (isSpeaking) {
                if (leftUpperArm) leftUpperArm.rotation.z = 1.25 + Math.sin(time * 4.0) * 0.08;
                if (rightUpperArm) rightUpperArm.rotation.z = -1.25 - Math.cos(time * 4.0) * 0.08;
                if (leftLowerArm) leftLowerArm.rotation.z = 0.25 + Math.sin(time * 3.0) * 0.05;
                if (rightLowerArm) rightLowerArm.rotation.z = -0.25 - Math.cos(time * 3.0) * 0.05;
                if (head) head.rotation.x = Math.sin(time * 2.5) * 0.04;
                currentVrm.expressionManager?.setValue('happy', 0.6);
            } else {
                if (leftUpperArm) leftUpperArm.rotation.z = 1.25;
                if (rightUpperArm) rightUpperArm.rotation.z = -1.25;
                if (leftLowerArm) leftLowerArm.rotation.z = 0.25;
                if (rightLowerArm) rightLowerArm.rotation.z = -0.25;
                // Soft bedroom/alluring expression
                currentVrm.expressionManager?.setValue('happy', 0.25);
                currentVrm.expressionManager?.setValue('relaxed', 0.2);
            }
        }

        const blinkVal = (Math.sin(time * 0.7) > 0.985 || Math.sin(time * 3.1) > 0.992) ? 1.0 : 0.0;
        currentVrm.expressionManager?.setValue('blink', blinkVal);
    }

    updateLipSync();
    renderer.render(scene, camera);
}

animate();