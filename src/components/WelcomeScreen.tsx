import { useEffect, useState } from 'react'
import { IoShieldCheckmarkOutline } from 'react-icons/io5'
import Logo from './Logo'
import { setWelcomeCompleted } from '../utils/prefs'

interface Props {
  onFinished: (message?: { type: 'success' | 'info'; text: string }) => void
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function ExpandDemo({ ready }: { ready: boolean }) {
  const [typed, setTyped] = useState(ready ? ':hello' : '')
  const [expanded, setExpanded] = useState(ready)

  useEffect(() => {
    if (ready) return
    const target = ':hello'
    let i = 0
    let expandTimer = 0
    const id = window.setInterval(() => {
      i += 1
      setTyped(target.slice(0, i))
      if (i >= target.length) {
        window.clearInterval(id)
        expandTimer = window.setTimeout(() => setExpanded(true), 380)
      }
    }, 85)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(expandTimer)
    }
  }, [ready])

  return (
    <div className="welcome-demo" aria-hidden="true">
      <div className={`welcome-demo-line ${expanded ? 'is-expanded' : ''}`}>
        <span className="welcome-demo-trigger">
          {typed}
          {!expanded && <span className="welcome-caret" />}
        </span>
        <span className="welcome-demo-arrow">→</span>
        <span className="welcome-demo-replace">{expanded ? 'hello, world' : ''}</span>
      </div>
    </div>
  )
}

export default function WelcomeScreen({ onFinished }: Props) {
  const reduceMotion = prefersReducedMotion()
  const [backingUp, setBackingUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasConfig, setHasConfig] = useState(true)

  useEffect(() => {
    window.espansoAPI.getBackupInfo().then(info => {
      setHasConfig(info.exists)
    }).catch(() => {})
  }, [])

  const finish = (message?: { type: 'success' | 'info'; text: string }) => {
    setWelcomeCompleted()
    onFinished(message)
  }

  const skip = () => {
    finish({ type: 'info', text: 'Skipped backup. You can still copy the config and match folders later.' })
  }

  const backup = async () => {
    setBackingUp(true)
    setError(null)
    try {
      const result = await window.espansoAPI.backupConfig()
      if (!result.success) {
        setError(result.error || 'Backup failed')
        setBackingUp(false)
        return
      }
      if (result.empty) {
        finish({ type: 'info', text: 'No config or match folders yet, so there was nothing to back up.' })
        return
      }
      const count = result.backedUp?.length || 0
      const skipped = result.skipped?.length || 0
      if (count === 0 && skipped > 0) {
        finish({ type: 'info', text: 'Backup folders already exist. Left config_backup and match_backup as they are.' })
        return
      }
      finish({
        type: 'success',
        text: skipped
          ? `Saved ${count} backup folder${count === 1 ? '' : 's'} (${skipped} already existed).`
          : `Saved ${count} backup folder${count === 1 ? '' : 's'} next to your working copies.`
      })
    } catch (err) {
      setError((err as Error).message)
      setBackingUp(false)
    }
  }

  return (
    <div className="welcome-overlay">
      <div className="welcome-glow" />
      <div className="welcome-card">
        <div className="welcome-mark">
          <Logo size={40} />
        </div>
        <h1 className="welcome-title">Before you start</h1>
        <ExpandDemo ready={reduceMotion} />
        <p className="welcome-copy">
          Espanso GUI suggests backing up your current config so you have it safe.
        </p>
        <p className="welcome-path">
          {hasConfig
            ? 'Renames the config and match folders to config_backup and match_backup, then copies them back as your working folders. Espanso only loads config and match, so nested files stay intact and the backups are ignored.'
            : 'No espanso config or match folders found yet. Backup will be skipped if you continue.'}
        </p>
        {error && <div className="welcome-error">{error}</div>}
        <div className="welcome-actions">
          <button
            className="btn btn-primary btn-lg"
            onClick={backup}
            disabled={backingUp}
          >
            <IoShieldCheckmarkOutline size={16} />
            {backingUp ? 'Backing up...' : 'Backup & Continue'}
          </button>
          <button className="btn btn-lg welcome-risk" onClick={skip} disabled={backingUp}>
            I'll risk it.
          </button>
        </div>
      </div>
    </div>
  )
}
