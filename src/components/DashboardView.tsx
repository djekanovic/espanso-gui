import { useEffect, useState } from 'react'
import {
  IoTextOutline,
  IoDocumentTextOutline,
  IoCubeOutline,
  IoFolderOpenOutline,
  IoAlertCircleOutline,
  IoAddOutline,
  IoPlay,
  IoStop,
  IoSyncOutline,
  IoBookOutline,
  IoFlashOutline,
  IoListOutline,
  IoOpenOutline,
  IoBulbOutline,
  IoRefreshOutline
} from 'react-icons/io5'
import { ConfigInfo, EspansoStatus } from '../types'
import { extractMatches, extractGlobalVars } from '../utils/yaml'

interface Props {
  configInfo: ConfigInfo | null
  espansoStatus: EspansoStatus
  espansoRunning: boolean
  onNavigate: (view: 'dashboard' | 'snippets' | 'config' | 'packages' | 'terminal') => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
  onStartEspanso: () => void
  onStopEspanso: () => void
  onRestartEspanso: () => void
  onAddSnippet: () => void
}

const TIP_KEY = 'espanso-gui:dashboard-tip-index'

// One rotating index advanced on every dashboard visit, so each load shows
// a different tip.
function nextTipIndex() {
  const stored = parseInt(localStorage.getItem(TIP_KEY) || '0', 10)
  const next = ((Number.isFinite(stored) ? stored : 0) + 1) % TIPS.length
  try {
    localStorage.setItem(TIP_KEY, String(next))
  } catch { /* ignore */ }
  return next
}

const TIPS = [
  'Type ":date" to insert the current date - configure its format in the Extensions tab.',
  'Create a form to fill in templates: espanso asks for the missing pieces before inserting.',
  'Install packages like "all-emojis" or "math" from the Packages tab for instant symbols and calculations.',
  'Prefer ";hello" over ":hello"? Change the trigger symbol in Configuration - it applies to all snippets.',
  'Keep related snippets in their own match files (e.g. work.yml, personal.yml) for easier organizing.',
  'Use a shell extension to insert live output, like your current git branch or IP address.',
  'A choice extension pops up a picker when it expands - great for signature variants or canned replies.',
  'A random extension picks from your list automatically - handy for rotating responses or examples.',
  'The clipboard extension inserts whatever you last copied without breaking your flow.',
  'Reference {{name}} in any replacement text - define the variable once in Extensions and reuse it everywhere.',
  'After big config edits, hit Restart on the dashboard to make sure espanso picks everything up.',
  'Use line breaks in Replacement Text to build multi-line signatures or code blocks.',
  'The trigger symbol can be changed from ":" to something else - choose the one you type fastest.',
  'Combined triggers match a longer phrase before a shorter one - put your specific triggers first.',
  'Fields inside forms become {{form.field_name}} after submission - reuse them in the same replacement.'
]

const DOC_LINKS = [
  { title: 'Documentation', desc: 'The complete espanso manual', url: 'https://espanso.org/docs/', icon: <IoBookOutline size={15} /> },
  { title: 'Matches', desc: 'Triggers and replacements', url: 'https://espanso.org/docs/matches/basics/', icon: <IoTextOutline size={15} /> },
  { title: 'Extensions', desc: 'Dates, shell, choices, and more', url: 'https://espanso.org/docs/matches/extensions/', icon: <IoFlashOutline size={15} /> },
  { title: 'Forms', desc: 'Fill-in-the-blank templates', url: 'https://espanso.org/docs/matches/forms/', icon: <IoListOutline size={15} /> }
]

// Survive Dashboard unmount (App only renders the active view) so clicking
// back doesn't flash the initial 0 while files are re-read.
let cachedStats: {
  matchFileCount: number
  totalMatches: number
  varCount: number
  packageCount: number
} | null = null

export default function DashboardView({ configInfo, espansoStatus, espansoRunning, onNavigate, showToast, onStartEspanso, onStopEspanso, onRestartEspanso, onAddSnippet }: Props) {
  const [matchFileCount, setMatchFileCount] = useState<number | null>(cachedStats?.matchFileCount ?? null)
  const [totalMatches, setTotalMatches] = useState<number | null>(cachedStats?.totalMatches ?? null)
  const [varCount, setVarCount] = useState<number | null>(cachedStats?.varCount ?? null)
  const [packageCount, setPackageCount] = useState<number | null>(cachedStats?.packageCount ?? null)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [files, pkgs] = await Promise.all([
          window.espansoAPI.listMatchFiles(),
          window.espansoAPI.listPackages()
        ])

        const next = {
          matchFileCount: cachedStats?.matchFileCount ?? 0,
          totalMatches: cachedStats?.totalMatches ?? 0,
          varCount: cachedStats?.varCount ?? 0,
          packageCount: cachedStats?.packageCount ?? 0
        }

        if (files.success && files.files) {
          next.matchFileCount = files.files.length
          const contents = await Promise.all(
            files.files.map(file => window.espansoAPI.readMatchFile(file.name))
          )
          next.totalMatches = contents.reduce((total, content) => {
            if (!content.success || !content.content) return total
            return total + extractMatches(content.content).length
          }, 0)
          next.varCount = contents.reduce((total, content) => {
            if (!content.success || !content.content) return total
            return total + Object.keys(extractGlobalVars(content.content)).length
          }, 0)
        }

        if (pkgs.success && pkgs.packages) {
          next.packageCount = pkgs.packages.length
        }

        cachedStats = next
        setMatchFileCount(next.matchFileCount)
        setTotalMatches(next.totalMatches)
        setVarCount(next.varCount)
        setPackageCount(next.packageCount)
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

  const openDoc = async (url: string) => {
    const result = await window.espansoAPI.openExternal(url)
    if (!result.success) showToast('error', result.error || 'Failed to open link')
  }

  const [tipIndex, setTipIndex] = useState(nextTipIndex)
  const advanceTip = () => setTipIndex(nextTipIndex())

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

      {/* Top row - add-snippet shortcut on the left, espanso status on the right */}
      <div className="dashboard-top-grid">
        <button className="card add-snippet-card" onClick={onAddSnippet}>
          <span className="add-snippet-icon"><IoAddOutline size={22} /></span>
          <span>
            <span className="quick-action-title">Add Snippet</span>
            <span className="quick-action-desc">Create a new text expansion</span>
          </span>
        </button>

        {espansoStatus.installed && (
          <div className="card">
            <div className="flex items-center justify-between" style={{ gap: 16, flexWrap: 'wrap' }}>
              <div className="flex items-center gap-3">
                <span
                  className={`status-dot ${espansoRunning ? 'running' : 'stopped'}`}
                  style={{ width: 10, height: 10 }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    Espanso {espansoRunning ? 'running' : 'stopped'}
                  </div>
                  {espansoStatus.version && (
                    <div className="text-sm text-secondary">v{espansoStatus.version}</div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {!espansoRunning ? (
                  <button className="btn btn-primary" onClick={onStartEspanso}>
                    <IoPlay size={14} /> Start
                  </button>
                ) : (
                  <button className="btn" onClick={onStopEspanso}>
                    <IoStop size={14} /> Stop
                  </button>
                )}
                <button className="btn" onClick={onRestartEspanso}>
                  <IoSyncOutline size={14} /> Restart
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalMatches ?? '—'}</div>
          <div className="stat-label">Total Snippets</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{matchFileCount ?? '—'}</div>
          <div className="stat-label">Match Files</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{varCount ?? '—'}</div>
          <div className="stat-label">Extensions & Forms</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{packageCount ?? '—'}</div>
          <div className="stat-label">Packages</div>
        </div>
      </div>

      {/* Two-column layout - quick actions on the left, config on the right */}
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Quick Actions</div>
          </div>
          <div className="quick-actions-grid">
            <button className="quick-action-tile" onClick={() => onNavigate('snippets')}>
              <IoTextOutline size={18} className="quick-action-icon" />
              <div>
                <div className="quick-action-title">Manage Snippets</div>
                <div className="quick-action-desc">Create, edit, and organize your text expansions</div>
              </div>
            </button>
            <button className="quick-action-tile" onClick={() => onNavigate('config')}>
              <IoDocumentTextOutline size={18} className="quick-action-icon" />
              <div>
                <div className="quick-action-title">Edit Configuration</div>
                <div className="quick-action-desc">Tune the main espanso config file</div>
              </div>
            </button>
            <button className="quick-action-tile" onClick={() => onNavigate('packages')}>
              <IoCubeOutline size={18} className="quick-action-icon" />
              <div>
                <div className="quick-action-title">Browse Packages</div>
                <div className="quick-action-desc">Explore installed espanso packages</div>
              </div>
            </button>
            <button className="quick-action-tile" onClick={openConfigDir}>
              <IoFolderOpenOutline size={18} className="quick-action-icon" />
              <div>
                <div className="quick-action-title">Open Config Folder</div>
                <div className="quick-action-desc">Reveal the espanso config directory in Finder</div>
              </div>
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Configuration</div>
            <button className="btn btn-sm" onClick={openConfigDir}>
              <IoFolderOpenOutline size={14} /> Open Folder
            </button>
          </div>
          {configInfo ? (
            <div className="flex flex-col gap-2">
              <div className="config-path-row">
                <span className="text-sm text-muted">Config dir:</span>
                <code className="config-path font-mono text-sm" style={{ color: 'var(--accent)' }}>{configInfo.configDir}</code>
              </div>
              <div className="config-path-row">
                <span className="text-sm text-muted">Main config:</span>
                <code className="config-path font-mono text-sm" style={{ color: 'var(--accent)' }}>{configInfo.configPath}</code>
              </div>
              <div className="config-path-row">
                <span className="text-sm text-muted">Match dir:</span>
                <code className="config-path font-mono text-sm" style={{ color: 'var(--accent)' }}>{configInfo.matchDir}</code>
              </div>
              <div className="config-path-row">
                <span className="text-sm text-muted">Packages:</span>
                <code className="config-path font-mono text-sm" style={{ color: 'var(--accent)' }}>{configInfo.packagesDir}</code>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted">Loading configuration info...</div>
          )}
        </div>
      </div>

      {/* Docs + rotating tip - one more two-column row at the bottom */}
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Learn Espanso</div>
          </div>
          <div className="docs-grid">
            {DOC_LINKS.map(doc => (
              <button key={doc.title} className="doc-card" onClick={() => openDoc(doc.url)}>
                <span className="doc-card-icon">{doc.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="doc-card-title">{doc.title}</span>
                  <span className="doc-card-desc">{doc.desc}</span>
                </span>
                <IoOpenOutline size={14} className="doc-card-open" />
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Tip</div>
            <button className="btn btn-sm" onClick={advanceTip} title="Show another tip">
              <IoRefreshOutline size={12} /> Next tip
            </button>
          </div>
          <div className="flex items-start gap-3">
            <span className="tip-icon"><IoBulbOutline size={18} /></span>
            <div className="text-sm" style={{ color: 'var(--text-primary)', lineHeight: 1.55 }}>
              {TIPS[tipIndex]}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
