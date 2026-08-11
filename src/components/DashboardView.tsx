import { useEffect, useState } from 'react'
import {
  IoTextOutline,
  IoDocumentTextOutline,
  IoCubeOutline,
  IoArrowForwardOutline,
  IoFolderOpenOutline,
  IoAlertCircleOutline
} from 'react-icons/io5'
import { ConfigInfo, EspansoStatus } from '../types'

interface Props {
  configInfo: ConfigInfo | null
  espansoStatus: EspansoStatus
  espansoRunning: boolean
  onNavigate: (view: 'dashboard' | 'snippets' | 'config' | 'packages' | 'terminal') => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

export default function DashboardView({ configInfo, espansoStatus, espansoRunning, onNavigate, showToast }: Props) {
  const [matchFileCount, setMatchFileCount] = useState(0)
  const [totalMatches, setTotalMatches] = useState(0)
  const [packageCount, setPackageCount] = useState(0)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [files, pkgs] = await Promise.all([
          window.espansoAPI.listMatchFiles(),
          window.espansoAPI.listPackages()
        ])

        if (files.success && files.files) {
          setMatchFileCount(files.files.length)
          const contents = await Promise.all(
            files.files.map(file => window.espansoAPI.readMatchFile(file.name))
          )
          const count = contents.reduce((total, content) => {
            if (!content.success || !content.content) return total
            const matches = content.content.match(/^\s*-\s+trigger/gm)
            return total + (matches ? matches.length : 0)
          }, 0)
          setTotalMatches(count)
        }

        if (pkgs.success && pkgs.packages) {
          setPackageCount(pkgs.packages.length)
        }
      } catch (err) {
        showToast('error', `Failed to load stats: ${(err as Error).message}`)
      }
    }
    loadStats()
  }, [showToast])

  const openConfigDir = async () => {
    if (configInfo) {
      await window.espansoAPI.openInExplorer(configInfo.configDir)
    }
  }

  return (
    <div>
      {!espansoStatus.installed && (
        <div className="card mb-6" style={{ borderColor: 'rgba(251, 191, 36, 0.3)', background: 'rgba(251, 191, 36, 0.05)' }}>
          <div className="flex items-center gap-3">
            <IoAlertCircleOutline size={24} color="var(--warning)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Espanso is not installed</div>
              <div className="text-sm text-secondary">
                Install espanso from <a href="https://espanso.org" target="_blank" style={{ color: 'var(--accent)' }}>espanso.org</a> to use this GUI.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalMatches}</div>
          <div className="stat-label">Total Snippets</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{matchFileCount}</div>
          <div className="stat-label">Match Files</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{packageCount}</div>
          <div className="stat-label">Packages</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: espansoRunning ? 'var(--success)' : 'var(--danger)' }}>
            {espansoRunning ? 'Running' : 'Stopped'}
          </div>
          <div className="stat-label">Espanso Status</div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <div className="card-title">Quick Actions</div>
        </div>
        <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => onNavigate('snippets')}>
            <IoTextOutline size={16} /> Manage Snippets
          </button>
          <button className="btn" onClick={() => onNavigate('config')}>
            <IoDocumentTextOutline size={16} /> Edit Configuration
          </button>
          <button className="btn" onClick={() => onNavigate('packages')}>
            <IoCubeOutline size={16} /> Browse Packages
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Configuration Location</div>
          <button className="btn btn-sm" onClick={openConfigDir}>
            <IoFolderOpenOutline size={14} /> Open Folder
          </button>
        </div>
        {configInfo ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted" style={{ minWidth: 100 }}>Config dir:</span>
              <code className="font-mono text-sm" style={{ color: 'var(--accent)' }}>{configInfo.configDir}</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted" style={{ minWidth: 100 }}>Main config:</span>
              <code className="font-mono text-sm" style={{ color: 'var(--accent)' }}>{configInfo.configPath}</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted" style={{ minWidth: 100 }}>Match dir:</span>
              <code className="font-mono text-sm" style={{ color: 'var(--accent)' }}>{configInfo.matchDir}</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted" style={{ minWidth: 100 }}>Packages:</span>
              <code className="font-mono text-sm" style={{ color: 'var(--accent)' }}>{configInfo.packagesDir}</code>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted">Loading configuration info...</div>
        )}
      </div>

      <div className="mt-4">
        <button 
          className="btn" 
          onClick={() => onNavigate('snippets')}
          style={{ width: '100%', justifyContent: 'space-between' }}
        >
          <span className="flex items-center gap-2">
            <IoTextOutline size={16} />
            Go to Snippets Manager
          </span>
          <IoArrowForwardOutline size={16} />
        </button>
      </div>
    </div>
  )
}