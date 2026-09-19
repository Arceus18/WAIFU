const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

let mainWindow;

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    mainWindow = new BrowserWindow({
        width: 480,
        height: 640,
        x: width - 500,
        y: height - 660,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        resizable: true,
        minWidth: 320,
        minHeight: 420,
        hasShadow: false,
        skipTaskbar: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false // Keeps 3D animation fluid when app is unfocused
        }
    });

    mainWindow.loadFile('index.html');
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

const fs = require('fs');
const MEMORY_FILE = path.join(__dirname, 'memory.json');

// IPC Handler: Native Windows command execution
ipcMain.handle('execute-command', async (event, command) => {
    return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, error: stderr || error.message });
            } else {
                resolve({ success: true, output: stdout });
            }
        });
    });
});

// IPC Handler: Load memory history
ipcMain.handle('get-memory', async () => {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            const data = fs.readFileSync(MEMORY_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error loading memory:', e);
    }
    return [];
});

// IPC Handler: Save memory history
ipcMain.handle('save-memory', async (event, history) => {
    try {
        const trimmed = (history || []).slice(-40);
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
        return { success: true };
    } catch (e) {
        console.error('Error saving memory:', e);
        return { success: false, error: e.message };
    }
});