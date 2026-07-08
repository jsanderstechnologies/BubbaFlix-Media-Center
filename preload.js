// preload.js
const { contextBridge, ipcRenderer } = require('electron');

/**
 * PHASE 2: IPC SECURITY BRIDGE
 * 
 * This file acts as a secure bridge between the Node.js backend (main.js) 
 * and the React frontend. It exposes specific, safe functions to the 
 * frontend without exposing the entire Node.js API or Electron's ipcRenderer.
 */

contextBridge.exposeInMainWorld(
  'mediaAPI', {
    // Send a stream URL from React to the Node.js backend for playback via child_process
    playStream: (streamUrl) => {
      console.log(`[Preload Bridge] Forwarding stream URL to backend: ${streamUrl}`);
      ipcRenderer.send('media:play', streamUrl);
    },
    
    // Listen for player status updates from the backend (e.g., buffering, playing, error)
    onPlayerStatus: (callback) => {
      ipcRenderer.on('media:status', (_event, value) => callback(value));
    },

    // Clean up listeners when component unmounts
    removePlayerStatusListeners: () => {
      ipcRenderer.removeAllListeners('media:status');
    }
  }
);
