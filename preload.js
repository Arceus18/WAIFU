const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    executeCommand: (command) => ipcRenderer.invoke('execute-command', command),
    getEnv: () => ({
        GROQ_API_KEY: process.env.GROQ_API_KEY || '',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || ''
    })
});