const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

let mainWindow = null;

// Determine espanso config directory based on OS
function getEspansoConfigDir() {
  const platform = process.platform;
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'espanso');
  } else if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'espanso');
  } else {
    return path.join(os.homedir(), '.config', 'espanso');
  }
}

function getEspansoConfigPath() {
  return path.join(getEspansoConfigDir(), 'config', 'default.yml');
}

function getMatchDir() {
  return path.join(getEspansoConfigDir(), 'match');
}

function getPackagesDir() {
  return path.join(getEspansoConfigDir(), 'packages');
}

// Find an executable by bare name through the PATH. fs.existsSync does NOT
// resolve PATH - it only checks relative to the cwd - so a bare 'espanso'
// would never match a Homebrew/usr-local install.
function findInPath(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Find espanso executable on the system
function findEspansoExecutable() {
  const platform = process.platform;
  const candidates = [];

  if (platform === 'win32') {
    // Try standard locations
    candidates.push(
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Espanso', 'espansod.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Espanso', 'espansod.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Espanso', 'espansod.exe'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Espanso', 'espansod.exe')
    );
  } else if (platform === 'darwin') {
    // A packaged app is launched with a minimal PATH
    // (/usr/bin:/bin:/usr/sbin:/sbin), so Homebrew's bin dirs aren't on it
    // and bare-name lookup below would miss them - list them explicitly.
    candidates.push(
      path.join(os.homedir(), 'Applications', 'Espanso.app', 'Contents', 'MacOS', 'espansod'),
      '/Applications/Espanso.app/Contents/MacOS/espanso',
      '/usr/local/bin/espanso',
      '/usr/local/bin/espansod',
      '/opt/homebrew/bin/espanso',
      '/opt/homebrew/bin/espansod'
    );
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Bare names as a last resort, resolved through the (possibly extended)
  // PATH.
  if (platform === 'win32') {
    return findInPath('espanso.exe') || findInPath('espansod.exe') || findInPath('espanso');
  }
  return findInPath('espanso') || findInPath('espansod');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Espanso GUI',
    backgroundColor: '#0a0a0b',
    frame: false,
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Wait for first paint before showing the window - avoids a blank/white
  // frame flash while the renderer boots, especially on a cold first launch
  // (unsigned exe extraction + Defender's first-run scan add real delay
  // there that this can't eliminate, but it stops it from looking worse
  // than it is).
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the Vite dev server in dev, or the built files in production
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-change', false);
  });
}

// --- IPC Handlers ---

// Get espanso config directory info
ipcMain.handle('get-config-info', async () => {
  const configDir = getEspansoConfigDir();
  const configPath = getEspansoConfigPath();
  const matchDir = getMatchDir();
  const packagesDir = getPackagesDir();

  return {
    configDir,
    configPath,
    matchDir,
    packagesDir,
    exists: fs.existsSync(configPath)
  };
});

// Read the main config file
ipcMain.handle('read-config', async () => {
  const configPath = getEspansoConfigPath();
  try {
    if (!fs.existsSync(configPath)) {
      return { success: false, error: 'Config file not found. Is espanso installed?' };
    }
    const content = fs.readFileSync(configPath, 'utf8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Write the main config file
ipcMain.handle('write-config', async (event, content) => {
  const configPath = getEspansoConfigPath();
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// List all match files
ipcMain.handle('list-match-files', async () => {
  const matchDir = getMatchDir();
  try {
    if (!fs.existsSync(matchDir)) {
      return { success: true, files: [] };
    }
    const files = fs.readdirSync(matchDir)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map(f => {
        const fullPath = path.join(matchDir, f);
        const stat = fs.statSync(fullPath);
        return {
          name: f,
          path: fullPath,
          size: stat.size,
          modified: stat.mtime
        };
      });
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Read a match file
ipcMain.handle('read-match-file', async (event, filename) => {
  const matchDir = getMatchDir();
  const filePath = path.join(matchDir, filename);
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Write a match file
ipcMain.handle('write-match-file', async (event, filename, content) => {
  const matchDir = getMatchDir();
  const filePath = path.join(matchDir, filename);
  try {
    if (!fs.existsSync(matchDir)) {
      fs.mkdirSync(matchDir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Delete a match file
ipcMain.handle('delete-match-file', async (event, filename) => {
  const matchDir = getMatchDir();
  const filePath = path.join(matchDir, filename);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Create a new match file
ipcMain.handle('create-match-file', async (event, filename) => {
  const matchDir = getMatchDir();
  const filePath = path.join(matchDir, filename);
  try {
    if (!fs.existsSync(matchDir)) {
      fs.mkdirSync(matchDir, { recursive: true });
    }
    if (fs.existsSync(filePath)) {
      return { success: false, error: 'File already exists' };
    }
    const defaultContent = `# ${filename.replace(/\.(yml|yaml)$/, '')}\n# Created with Espanso GUI\n\nmatches:\n`;
    fs.writeFileSync(filePath, defaultContent, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// List installed packages
ipcMain.handle('list-packages', async () => {
  const packagesDir = getPackagesDir();
  try {
    if (!fs.existsSync(packagesDir)) {
      return { success: true, packages: [] };
    }
    const packages = fs.readdirSync(packagesDir)
      .filter(f => fs.statSync(path.join(packagesDir, f)).isDirectory())
      .map(f => {
        const pkgPath = path.join(packagesDir, f);
        const manifestPath = path.join(pkgPath, 'package.yml');
        let manifest = null;
        if (fs.existsSync(manifestPath)) {
          try {
            manifest = fs.readFileSync(manifestPath, 'utf8');
          } catch (e) {}
        }
        return { name: f, path: pkgPath, manifest };
      });
    return { success: true, packages };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Run espanso command
ipcMain.handle('run-espanso-command', async (event, args) => {
  return new Promise((resolve) => {
    const espansoPath = findEspansoExecutable();
    if (!espansoPath) {
      resolve({ success: false, error: 'Espanso not found on this system', stdout: '', stderr: '' });
      return;
    }
    execFile(espansoPath, args, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr || error.message, stdout });
      } else {
        resolve({ success: true, stdout, stderr });
      }
    });
  });
});

// Check if espanso is installed
ipcMain.handle('check-espanso', async () => {
  return new Promise((resolve) => {
    const espansoPath = findEspansoExecutable();
    if (!espansoPath) {
      resolve({ installed: false, version: null, error: 'Espanso not found on this system' });
      return;
    }
    execFile(espansoPath, ['--version'], { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ installed: true, version: null, error: stderr || error.message });
      } else {
        resolve({ installed: true, version: stdout.trim(), error: null });
      }
    });
  });
});

// Open a file in the system's default editor
ipcMain.handle('open-in-editor', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Open a directory in file explorer
ipcMain.handle('open-in-explorer', async (event, dirPath) => {
  try {
    await shell.openPath(dirPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Open a URL in the system's default browser
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Custom titlebar window controls (frameless window - no native menu/chrome)
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize-toggle', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow && mainWindow.close());
ipcMain.handle('window-is-maximized', () => (mainWindow ? mainWindow.isMaximized() : false));

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});