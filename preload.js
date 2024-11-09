const { contextBridge, ipcRenderer } = require('electron');

console.log("preload.js loaded");

contextBridge.exposeInMainWorld('storageAPI', {
    setItem: (key, value) => ipcRenderer.send('localStorage-set', key, value),
    clear: () => ipcRenderer.send('localStorage-clear')
});

// Listener dla zdarzeń `localStorage-set` i `localStorage-clear`
ipcRenderer.on('localStorage-set', (event, key, value) => {
    console.log(`Ustawiam localStorage ${key}: ${value}`);
    localStorage.setItem(key, value);
});

ipcRenderer.on('localStorage-clear', () => {
    console.log("Czyszczenie localStorage");
    localStorage.clear();
});
