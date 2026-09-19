# 🌸 Desktop AI Companion (Windows 11)

A lightweight, production-ready, standalone AI Waifu desktop companion for Windows 11. Built with **Electron**, **Three.js**, and **`@pixiv/three-vrm`**, powered by **Groq's ultra-low-latency, free-tier API** (`llama-3.3-70b-versatile`).

No external virtual audio cables, OBS plugins, or separate VTuber programs required.

---

## ✨ Features

- **Frameless Transparent Overlay:** The avatar floats directly above your wallpaper and apps with no background borders.
- **Draggable UI:** Move the character anywhere across your monitor with the top handle bar.
- **Natural Voice Lip-Sync:** Driven dynamically using Web Audio API reactivity directly synced to speech frequency data.
- **Desktop Automation:** Tell her to open Windows programs (e.g., *"Stella, open notepad"*, *"Stella, launch calculator"*), and she executes the commands via Windows child processes.
- **100% Free LLM Engine:** Powered by Groq API's free tier with near-instant sub-second responses.

---

## 📁 Project Structure

```text
desktop-waifu/
├── package.json
├── main.js             # Electron window setup & child_process execution
├── preload.js          # Secure bridge between Node and renderer
├── agent.js            # Groq API tool-calling agent
├── index.html          # HTML canvas and subtitle overlay
├── renderer.js         # Three.js + VRM render loop & audio lip-sync
├── styles.css          # Transparency styling & animations
├── .env                # API keys
└── model.vrm           # Your anime 3D character model
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js (v18 or higher):** [Download from nodejs.org](https://nodejs.org/)
- **Git for Windows:** [Download Git](https://git-scm.com/)

### 2. Installation
1. Clone or open your project folder in your terminal:
   ```bash
   cd desktop-waifu
   ```
2. Install the necessary packages:
   ```bash
   npm install
   ```

### 3. Get Your Free Groq API Key
1. Go to [Groq Console](https://console.groq.com/).
2. Sign up or log in (completely free).
3. Navigate to **API Keys** → click **Create API Key**.
4. Create a `.env` file in the root of the project:
   ```env
   GROQ_API_KEY=gsk_your_groq_api_key_here
   ```

### 4. Update `preload.js` to Read Groq Key
Ensure your `preload.js` exposes your Groq key:
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  executeCommand: (command) => ipcRenderer.invoke('execute-command', command),
  getEnv: () => ({
    GROQ_API_KEY: process.env.GROQ_API_KEY || ''
  })
});
```

And in `renderer.js`, pass it to the agent:
```javascript
const env = window.electronAPI.getEnv();
const agent = new WaifuAgent(env.GROQ_API_KEY);
```

### 5. Add Your 3D Anime Model (`.vrm`)
You need a `.vrm` character file:
1. **Download a free model:**
   - Visit [VRoid Hub](https://hub.vroid.com/en) or [Booth.pm (VRM tag)](https://booth.pm/en/items?tags%5B%5D=VRM).
   - Filter by free download options.
2. **Or create your own:**
   - Download the free [VRoid Studio](https://vroid.com/en/studio) app.
   - Design hair, face, and clothes with intuitive sliders, then click **Export as VRM**.
3. Place your file in the project folder and name it **`model.vrm`**.

---

## 🎮 How to Run

Launch the companion on your desktop:
```bash
npm start
```

### Controls:
- **Click & Drag:** Use the small **❖ Stella** tag at the top to move her around the screen.
- **Talk:** Click the **🎤 Talk** button at the bottom and speak aloud (e.g., *"Hello Stella, open Spotify"* or *"What's the weather like?"*).

---

## ⚙️ Customization

- **Change Persona:** Edit the `systemPrompt` variable in `agent.js` to customize tone, personality, or catchphrases.
- **Change Avatar Size & Framing:** Adjust `camera.position.set(0.0, 1.35, 1.4);` in `renderer.js` to zoom in or show a full-body view.