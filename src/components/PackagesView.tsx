import { useEffect, useState, useCallback } from 'react'
import {
  IoCubeOutline,
  IoDownloadOutline,
  IoTrashOutline,
  IoFolderOpenOutline,
  IoSyncOutline
} from 'react-icons/io5'
import { ConfigInfo, PackageInfo } from '../types'

interface Props {
  configInfo: ConfigInfo | null
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

export default function PackagesView({ configInfo, showToast }: Props) {
  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [installName, setInstallName] = useState('')

  const loadPackages = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.espansoAPI.listPackages()
      if (result.success && result.packages) {
        setPackages(result.packages)
      } else if (result.error) {
        showToast('error', result.error)
      }
    } catch (err) {
      showToast('error', `Failed to load packages: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadPackages()
  }, [loadPackages])

  const installPackage = async () => {
    if (!installName.trim()) {
      showToast('error', 'Enter a package name')
      return
    }
    const result = await window.espansoAPI.runEspansoCommand(['install', installName.trim()])
    if (result.success) {
      showToast('success', `Installed ${installName.trim()}`)
      setInstallName('')
      await loadPackages()
    } else {
      showToast('error', `Failed to install: ${result.error}`)
    }
  }

  const uninstallPackage = async (name: string) => {
    if (!confirm(`Uninstall package "${name}"?`)) return
    const result = await window.espansoAPI.runEspansoCommand(['uninstall', name])
    if (result.success) {
      showToast('success', `Uninstalled ${name}`)
      await loadPackages()
    } else {
      showToast('error', `Failed to uninstall: ${result.error}`)
    }
  }

  const openPackageDir = async (pkgPath: string) => {
    await window.espansoAPI.openInExplorer(pkgPath)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-secondary">
          Manage espanso packages
        </div>
        <button className="btn" onClick={loadPackages} disabled={loading}>
          <IoSyncOutline size={16} /> {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Install package */}
      <div className="card mb-6">
        <div className="card-header">
          <div className="card-title">Install Package</div>
        </div>
        <div className="form-input-group" style={{ maxWidth: 400 }}>
          <input
            className="form-input"
            placeholder="Package name (e.g. all-emojis)"
            value={installName}
            onChange={e => setInstallName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') installPackage() }}
          />
          <button className="btn btn-primary" onClick={installPackage}>
            <IoDownloadOutline size={16} /> Install
          </button>
        </div>
        <div className="text-xs text-muted mt-2">
          Browse available packages at <a href="https://hub.espanso.org" target="_blank" style={{ color: 'var(--accent)' }}>hub.espanso.org</a>
        </div>
      </div>

      {/* Installed packages */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Installed Packages ({packages.length})</div>
        </div>

        {packages.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="empty-state-icon">
              <IoCubeOutline size={24} />
            </div>
            <div className="empty-state-title">No packages installed</div>
            <div className="empty-state-desc">
              Install packages to extend espanso with emoji sets, symbols, and more.
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Version</th>
                <th>Location</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {packages.map(pkg => (
                <tr key={pkg.name}>
                  <td>
                    <div className="flex items-center gap-2">
                      <IoCubeOutline size={16} color="var(--accent)" />
                      <div>
                        <div style={{ fontWeight: 500 }}>{pkg.title || pkg.name}</div>
                        {pkg.title && pkg.title !== pkg.name && (
                          <div className="text-xs text-muted font-mono">{pkg.name}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="font-mono text-sm">{pkg.version || '-'}</div>
                  </td>
                  <td>
                    <code className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>{pkg.path}</code>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm" onClick={() => openPackageDir(pkg.path)}>
                        <IoFolderOpenOutline size={14} /> Open
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => uninstallPackage(pkg.name)}>
                        <IoTrashOutline size={14} /> Uninstall
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}