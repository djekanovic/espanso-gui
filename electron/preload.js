const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('espansoAPI', {
  // Config info
  getConfigInfo: () => ipcRenderer.invoke('get-config-info'),
  
  // Main config file
  readConfig: () => ipcRenderer.invoke('read-config'),
  writeConfig: (content) => ipcRenderer.invoke('write-config', content),
  
  // Match files
  listMatchFiles: () => ipcRenderer.invoke('list-match-files'),
  readMatchFile: (filename) => ipcRenderer.invoke('read-match-file', filename),
  writeMatchFile: (filename, content) => ipcRenderer.invoke('write-match-file', filename, content),
  deleteMatchFile: (filename) => ipcRenderer.invoke('delete-match-file', filename),
  createMatchFile: (filename) => ipcRenderer.invoke('create-match-file', filename),
  
  // Packages
  listPackages: () => ipcRenderer.invoke('list-packages'),

  // First-launch folder backup (config_backup / match_backup beside working dirs)
  getBackupInfo: () => ipcRenderer.invoke('get-backup-info'),
  backupConfig: () => ipcRenderer.invoke('backup-config'),
  
  // Espanso control
  runEspansoCommand: (args) => ipcRenderer.invoke('run-espanso-command', args),
  checkEspanso: () => ipcRenderer.invoke('check-espanso'),
  
  // System
  openInEditor: (filePath) => ipcRenderer.invoke('open-in-editor', filePath),
  openInExplorer: (dirPath) => ipcRenderer.invoke('open-in-explorer', dirPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximizeToggle: () => ipcRenderer.send('window-maximize-toggle'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximized-change', listener);
    return () => ipcRenderer.removeListener('window-maximized-change', listener);
  }
});