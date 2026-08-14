import { useEffect, useState, useCallback } from 'react'
import {
  IoGridOutline,
  IoTextOutline,
  IoSettingsOutline,
  IoCubeOutline,
  IoTerminalOutline,
  IoPlay,
  IoStop,
  IoSyncOutline
} from 'react-icons/io5'
import SnippetsView from './components/SnippetsView'
import ConfigView from './components/ConfigView'
import PackagesView from './components/PackagesView'
import TerminalView from './components/TerminalView'
import DashboardView from './components/DashboardView'
import Titlebar from './components/Titlebar'
import Logo from './components/Logo'
import WelcomeScreen from './components/WelcomeScreen'
import { ConfigInfo, EspansoStatus } from './types'
import { THEMES, Theme, getTheme, setTheme, applyTheme, hasCompletedWelcome } from './utils/prefs'

type View = 'dashboard' | 'snippets' | 'config' | 'packages' | 'terminal'

interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

declare global {
  interface Window {
    espansoAPI: {
      getConfigInfo: () => Promise<ConfigInfo>
      readConfig: () => Promise<{ success: boolean; content?: string; error?: string }>
      writeConfig: (content: string) => Promise<{ success: boolean; error?: string }>
      listMatchFiles: () => Promise<{ success: boolean; files?: any[]; error?: string }>
      readMatchFile: (filename: string) => Promise<{ success: boolean; content?: string; error?: string }>
      writeMatchFile: (filename: string, content: string) => Promise<{ success: boolean; error?: string }>
      deleteMatchFile: (filename: string) => Promise<{ success: boolean; error?: string }>
      createMatchFile: (filename: string) => Promise<{ success: boolean; error?: string }>
      listPackages: () => Promise<{ success: boolean; packages?: any[]; error?: string }>
      getBackupInfo: () => Promise<{ configDir: string; configPath: string; matchDir: string; exists: boolean }>
      backupConfig: () => Promise<{ success: boolean; empty?: boolean; backedUp?: string[]; skipped?: string[]; error?: string }>
      runEspansoCommand: (args: string[]) => Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }>
      checkEspanso: () => Promise<EspansoStatus>
      openInEditor: (filePath: string) => Promise<{ success: boolean; error?: string }>
      openInExplorer: (dirPath: string) => Promise<{ success: boolean; error?: string }>
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
    }
    windowControls: {
      minimize: () => void
      maximizeToggle: () => void
      close: () => void
      isMaximized: () => Promise<boolean>
      onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void
    }
  }
}

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [configInfo, setConfigInfo] = useState<ConfigInfo | null>(null)
  const [espansoStatus, setEspansoStatus] = useState<EspansoStatus>({ installed: false, version: null, error: null })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [espansoRunning, setEspansoRunning] = useState(false)
  const [headerActions, setHeaderActions] = useState<React.ReactNode>(null)
  // Set when the dashboard's "Add Snippet" shortcut is clicked - handed to
  // SnippetsView, which opens the new-snippet editor once its file loads.
  const [snippetCreateRequest, setSnippetCreateRequest] = useState(false)
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const [showWelcome, setShowWelcome] = useState(() => !hasCompletedWelcome())

  useEffect(() => {
    if (!hasCompletedWelcome()) setShowWelcome(true)
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const showToast = useCallback((type: Toast['type'], message: string) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const loadConfigInfo = useCallback(async () => {
    try {
      const info = await window.espansoAPI.getConfigInfo()
      setConfigInfo(info)
    } catch (err) {
      showToast('error', `Failed to load config info: ${(err as Error).message}`)
    }
  }, [showToast])

  const checkEspanso = useCallback(async () => {
    try {
      const status = await window.espansoAPI.checkEspanso()
      setEspansoStatus(status)
      if (status.installed) {
        // Check if espanso is running
        const result = await window.espansoAPI.runEspansoCommand(['status'])
        setEspansoRunning(result.success && !result.stdout?.includes('not running'))
      }
    } catch (err) {
      setEspansoStatus({ installed: false, version: null, error: (err as Error).message })
    }
  }, [])

  useEffect(() => {
    loadConfigInfo()
    checkEspanso()
  }, [loadConfigInfo, checkEspanso])

  const startEspanso = async () => {
    const result = await window.espansoAPI.runEspansoCommand(['start'])
    if (result.success) {
      setEspansoRunning(true)
      showToast('success', 'Espanso started')
    } else {
      showToast('error', `Failed to start espanso: ${result.error}`)
    }
  }

  const stopEspanso = async () => {
    const result = await window.espansoAPI.runEspansoCommand(['stop'])
    if (result.success) {
      setEspansoRunning(false)
      showToast('success', 'Espanso stopped')
    } else {
      showToast('error', `Failed to stop espanso: ${result.error}`)
    }
  }

  const restartEspanso = async () => {
    const result = await window.espansoAPI.runEspansoCommand(['restart'])
    if (result.success) {
      setEspansoRunning(true)
      showToast('success', 'Espanso restarted')
    } else {
      showToast('error', `Failed to restart espanso: ${result.error}`)
    }
  }

  const handleAddSnippet = () => {
    setSnippetCreateRequest(true)
    setView('snippets')
  }

  const handleCreateRequestHandled = useCallback(() => {
    setSnippetCreateRequest(false)
  }, [])

  const navItems: { id: View; label: string; icon: React.ReactNode; section: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <IoGridOutline size={16} />, section: 'Overview' },
    { id: 'snippets', label: 'Snippets', icon: <IoTextOutline size={16} />, section: 'Overview' },
    { id: 'config', label: 'Configuration', icon: <IoSettingsOutline size={16} />, section: 'Overview' },
    { id: 'packages', label: 'Packages', icon: <IoCubeOutline size={16} />, section: 'Overview' },
    { id: 'terminal', label: 'Terminal', icon: <IoTerminalOutline size={16} />, section: 'Tools' }
  ]

  const viewTitles: Record<View, string> = {
    dashboard: 'Dashboard',
    snippets: 'Snippets',
    config: 'Configuration',
    packages: 'Packages',
    terminal: 'Terminal'
  }

  return (
    <div className="app-shell">
      <Titlebar />
      <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Logo size={28} />
          <div>
            <div className="sidebar-title">Espanso GUI</div>
            <div className="sidebar-subtitle">Text Expander Manager</div>
          </div>
        </div>

        <nav>
          {navItems.map((item, i) => {
            const showSection = i === 0 || navItems[i - 1].section !== item.section
            return (
              <div key={item.id}>
                {showSection && <div className="nav-section">{item.section}</div>}
                <button
                  className={`nav-item ${view === item.id ? 'active' : ''}`}
                  onClick={() => setView(item.id)}
                >
                  {item.icon}
                  {item.label}
                </button>
              </div>
            )
          })}
        </nav>

        <div className="theme-picker">
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`theme-swatch ${theme === t.id ? 'active' : ''}`}
              style={{ background: t.color }}
              title={t.label}
              onClick={() => { setThemeState(t.id); setTheme(t.id) }}
            />
          ))}
        </div>

        <div className="sidebar-footer">
          {espansoStatus.installed && espansoStatus.version && (
            <div className="text-xs text-muted font-mono" style={{ padding: '0 8px 8px' }}>
              v{espansoStatus.version}
            </div>
          )}
          <div className="espanso-status">
            <span className={`status-dot ${espansoRunning ? 'running' : espansoStatus.installed ? 'stopped' : 'unknown'}`} />
            <span>
              {espansoRunning ? 'Espanso running' : espansoStatus.installed ? 'Espanso stopped' : 'Espanso not found'}
            </span>
          </div>
          {espansoStatus.installed && (
            <div className="flex gap-2" style={{ padding: '4px 8px' }}>
              {!espansoRunning ? (
                <button className="btn btn-sm" onClick={startEspanso}>
                  <IoPlay size={12} /> Start
                </button>
              ) : (
                <button className="btn btn-sm" onClick={stopEspanso}>
                  <IoStop size={12} /> Stop
                </button>
              )}
              <button className="btn btn-sm" onClick={restartEspanso}>
                <IoSyncOutline size={12} /> Restart
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="topbar-title">{viewTitles[view]}</div>
          <div className="topbar-actions">
            {headerActions}
          </div>
        </div>

        <div className="content">
          {view === 'dashboard' && (
            <DashboardView 
              configInfo={configInfo} 
              espansoStatus={espansoStatus}
              espansoRunning={espansoRunning}
              onNavigate={setView}
              showToast={showToast}
              onStartEspanso={startEspanso}
              onStopEspanso={stopEspanso}
              onRestartEspanso={restartEspanso}
              onAddSnippet={handleAddSnippet}
            />
          )}
          {view === 'snippets' && (
            <SnippetsView
              configInfo={configInfo}
              showToast={showToast}
              createRequested={snippetCreateRequest}
              onCreateRequestHandled={handleCreateRequestHandled}
            />
          )}
          {view === 'config' && (
            <ConfigView
              configInfo={configInfo}
              showToast={showToast}
              onHeaderActionsChange={setHeaderActions}
            />
          )}
          {view === 'packages' && (
            <PackagesView 
              configInfo={configInfo} 
              showToast={showToast}
            />
          )}
          {view === 'terminal' && (
            <TerminalView 
              showToast={showToast}
            />
          )}
        </div>
      </div>

      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
      {showWelcome && (
        <WelcomeScreen
          onFinished={(message) => {
            setShowWelcome(false)
            if (message) showToast(message.type, message.text)
          }}
        />
      )}
      </div>
    </div>
  )
}