import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { WaifuAgent } from './agent.js';

let currentVrm = null;
let isSpeaking = false;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isAutoConversationActive = false;

let audioContext = null;
let cachedVoice = null;

// View Mode presets: Default to Upper Body view on start
let isFullBody = false;
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
// Default to Upper Body view
camera.position.set(0.0, UPPER_BODY_CAM.y, UPPER_BODY_CAM.z);
camera.lookAt(0.0, UPPER_BODY_CAM.y, 0.0);

const light = new THREE.DirectionalLight(0xffffff, 1.6);
light.position.set(1.0, 1.5, 1.0).normalize();
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.9));

// Pre-load and cache female voice immediately on startup to prevent male voice default on 1st talk
function initVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
        cachedVoice = voices.find(v => 
            v.name.includes('Zira') || 
            v.name.includes('Jenny') || 
            v.name.includes('Aria') || 
            v.name.includes('Nanami') || 
            v.name.includes('Haruka') || 
            v.name.includes('Ayumi') || 
            v.name.includes('Natural') || 
            v.name.includes('Hazel') || 
            v.name.includes('Samantha') ||
            (v.lang.includes('en') && v.name.toLowerCase().includes('female'))
        ) || voices.find(v => v.lang.includes('en-US')) || voices[0];
    }
}

initVoices();
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = initVoices;
}

// Helper: Strip emojis and markdown formatting
function stripEmojisAndFormatting(text) {
    if (!text) return '';
    return text
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/[*_~`#@$]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

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

// 3. Guaranteed Female Speech Synthesis (TTS)
function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

function speakText(rawText) {
    return new Promise((resolve) => {
        const cleanText = stripEmojisAndFormatting(rawText);
        bubble.textContent = cleanText;
        bubble.classList.remove('hidden');

        if (!('speechSynthesis' in window)) {
            setTimeout(() => { bubble.classList.add('hidden'); resolve(); }, 3500);
            return;
        }

        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
        getAudioContext();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 0.92;  // Gentle, modest pace
        utterance.pitch = 1.22; // Soft, sweet anime female pitch

        if (!cachedVoice) initVoices();
        if (cachedVoice) {
            utterance.voice = cachedVoice;
        }

        isSpeaking = true;

        let mouthInterval = setInterval(() => {
            if (currentVrm?.expressionManager) {
                const randomMouth = Math.random() * 0.75;
                currentVrm.expressionManager.setValue('aa', randomMouth);
                currentVrm.expressionManager.setValue('oh', randomMouth * 0.35);
                currentVrm.expressionManager.setValue('ih', randomMouth * 0.25);
                currentVrm.expressionManager.update();
            }
        }, 85);

        const cleanup = () => {
            isSpeaking = false;
            clearInterval(mouthInterval);
            if (currentVrm?.expressionManager) {
                currentVrm.expressionManager.setValue('aa', 0);
                currentVrm.expressionManager.setValue('oh', 0);
                currentVrm.expressionManager.setValue('ih', 0);
                currentVrm.expressionManager.update();
            }
            setTimeout(() => bubble.classList.add('hidden'), 4000);
            resolve();
        };

        utterance.onend = cleanup;
        utterance.onerror = (e) => {
            console.warn('SpeechSynthesis error:', e);
            cleanup();
        };

        window.speechSynthesis.speak(utterance);

        let resumeTimer = setInterval(() => {
            if (!window.speechSynthesis.speaking) {
                clearInterval(resumeTimer);
            } else {
                window.speechSynthesis.resume();
            }
        }, 300);
    });
}

// 4. Initialize Waifu Agent
const env = window.electronAPI.getEnv();
const agent = new WaifuAgent(env.GROQ_API_KEY || env.ANTHROPIC_API_KEY);

async function handleUserMessage(text) {
    if (!text || !text.trim()) return;
    const userMsg = text.trim();
    if (textInput) textInput.value = '';
    micBtn.textContent = 'Thinking...';
    if (sendBtn) sendBtn.disabled = true;

    try {
        let reply = await agent.chat(userMsg, window.electronAPI.executeCommand);
        reply = stripEmojisAndFormatting(reply);
        micBtn.textContent = '🎤';
        if (sendBtn) sendBtn.disabled = false;
        await speakText(reply);

        // Hands-Free Auto-Conversation Mode: Automatically resume listening on speech end!
        if (isAutoConversationActive) {
            setTimeout(() => {
                if (isAutoConversationActive && !isSpeaking && !isRecording) {
                    startMicrophoneRecording();
                }
            }, 500);
        }

    } catch (err) {
        console.error('Error handling message:', err);
        micBtn.textContent = '🎤';
        if (sendBtn) sendBtn.disabled = false;
    }
}

// 5. Microphone Voice Input & Hands-Free Auto Conversation
async function startMicrophoneRecording() {
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
            
            micBtn.textContent = 'Transcribing...';
            const transcribedText = await agent.transcribeAudio(audioBlob);
            
            if (transcribedText) {
                await handleUserMessage(transcribedText);
            } else {
                micBtn.textContent = isAutoConversationActive ? '🔴 Auto Mode' : '🎤';
                if (isAutoConversationActive) {
                    setTimeout(() => {
                        if (isAutoConversationActive && !isSpeaking && !isRecording) {
                            startMicrophoneRecording();
                        }
                    }, 800);
                }
            }
        };

        mediaRecorder.start();
        isRecording = true;
        micBtn.classList.add('recording');
        micBtn.textContent = '🔴 Listening...';

    } catch (err) {
        console.error('Microphone access error:', err);
        isRecording = false;
        isAutoConversationActive = false;
        micBtn.classList.remove('recording');
        micBtn.textContent = '🎤';
    }
}

function stopMicrophoneRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    micBtn.classList.remove('recording');
    micBtn.textContent = 'Processing...';
}

function toggleMicrophone() {
    getAudioContext();

    if (isRecording) {
        isAutoConversationActive = false; // Turn off auto hands-free mode on user click
        stopMicrophoneRecording();
    } else {
        isAutoConversationActive = true;  // Activate auto hands-free mode
        startMicrophoneRecording();
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

// 7. Render Loop with Natural Conversational Animations & Facial Expressions
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

            const s = Math.sin(time * 1.4);
            const c = Math.cos(time * 1.0);

            currentVrm.scene.position.y = s * 0.006;

            if (spine) spine.rotation.z = s * 0.012;
            if (chest) chest.rotation.y = c * 0.02;

            if (isSpeaking) {
                if (head) {
                    head.rotation.x = Math.sin(time * 5.0) * 0.035;
                    head.rotation.y = Math.cos(time * 2.8) * 0.055;
                    head.rotation.z = Math.sin(time * 3.5) * 0.025;
                }
                if (leftUpperArm) leftUpperArm.rotation.z = 1.15 + Math.sin(time * 4.5) * 0.1;
                if (rightUpperArm) rightUpperArm.rotation.z = -1.15 - Math.cos(time * 4.5) * 0.1;
                if (leftLowerArm) leftLowerArm.rotation.z = 0.3 + Math.sin(time * 3.5) * 0.06;
                if (rightLowerArm) rightLowerArm.rotation.z = -0.3 - Math.cos(time * 3.5) * 0.06;
                
                currentVrm.expressionManager?.setValue('happy', 0.45);
                currentVrm.expressionManager?.setValue('relaxed', 0.25);
            } else {
                if (head) {
                    head.rotation.y = Math.sin(time * 0.55) * 0.035;
                    head.rotation.z = Math.cos(time * 0.45) * 0.02;
                    head.rotation.x = 0;
                }
                if (leftUpperArm) leftUpperArm.rotation.z = 1.25;
                if (rightUpperArm) rightUpperArm.rotation.z = -1.25;
                if (leftLowerArm) leftLowerArm.rotation.z = 0.25;
                if (rightLowerArm) rightLowerArm.rotation.z = -0.25;
                
                currentVrm.expressionManager?.setValue('happy', 0.2);
                currentVrm.expressionManager?.setValue('relaxed', 0.15);
            }
        }

        const blinkVal = (Math.sin(time * 0.7) > 0.985 || Math.sin(time * 3.1) > 0.992) ? 1.0 : 0.0;
        currentVrm.expressionManager?.setValue('blink', blinkVal);
    }

    renderer.render(scene, camera);
}

animate();