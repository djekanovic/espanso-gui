import { useState, useRef, useEffect } from 'react'
import {
  IoTerminalOutline,
  IoPlay,
  IoTrashOutline,
  IoSyncOutline
} from 'react-icons/io5'

interface Props {
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

interface CommandResult {
  command: string
  stdout: string
  stderr: string
  success: boolean
  timestamp: Date
}

const QUICK_COMMANDS = [
  { label: 'Status', args: ['status'] },
  { label: 'Start', args: ['start'] },
  { label: 'Stop', args: ['stop'] },
  { label: 'Restart', args: ['restart'] },
  { label: 'Logs', args: ['log'] },
  { label: 'Version', args: ['--version'] },
  { label: 'Path', args: ['path'] },
  { label: 'Edit Config', args: ['edit', 'config/default.yml'] }
]

export default function TerminalView({ showToast }: Props) {
  const [history, setHistory] = useState<CommandResult[]>([])
  const [command, setCommand] = useState('')
  const [running, setRunning] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [history])

  const runCommand = async (args: string[]) => {
    setRunning(true)
    try {
      const result = await window.espansoAPI.runEspansoCommand(args)
      setHistory(prev => [...prev, {
        command: `espanso ${args.join(' ')}`,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        success: result.success,
        timestamp: new Date()
      }])
    } catch (err) {
      setHistory(prev => [...prev, {
        command: `espanso ${args.join(' ')}`,
        stdout: '',
        stderr: (err as Error).message,
        success: false,
        timestamp: new Date()
      }])
    } finally {
      setRunning(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = command.trim()
    if (!trimmed) return
    const args = trimmed.split(/\s+/)
    setCommand('')
    runCommand(args)
  }

  const clearHistory = () => {
    setHistory([])
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-secondary">
          Run espanso commands directly
        </div>
        <button className="btn" onClick={clearHistory}>
          <IoTrashOutline size={16} /> Clear
        </button>
      </div>

      {/* Quick commands */}
      <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
        {QUICK_COMMANDS.map(cmd => (
          <button
            key={cmd.label}
            className="btn btn-sm"
            onClick={() => runCommand(cmd.args)}
            disabled={running}
          >
            {cmd.label}
          </button>
        ))}
      </div>

      {/* Terminal output */}
      <div 
        className="card" 
        style={{ 
          background: '#0d0d0f', 
          fontFamily: 'var(--font-mono)', 
          fontSize: 12,
          padding: 0,
          overflow: 'hidden'
        }}
      >
        <div 
          ref={outputRef}
          style={{ 
            height: 400, 
            overflowY: 'auto', 
            padding: 16,
            lineHeight: 1.7
          }}
        >
          {history.length === 0 ? (
            <div className="text-muted">
              <span style={{ color: 'var(--accent)' }}>$</span> Type a command or use the quick buttons above.
            </div>
          ) : (
            history.map((item, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ color: 'var(--accent)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{item.timestamp.toLocaleTimeString()}</span> $ {item.command}
                </div>
                {item.stdout && (
                  <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{item.stdout}</div>
                )}
                {item.stderr && (
                  <div style={{ color: 'var(--danger)', whiteSpace: 'pre-wrap' }}>{item.stderr}</div>
                )}
                {!item.stdout && !item.stderr && (
                  <div style={{ color: item.success ? 'var(--success)' : 'var(--danger)' }}>
                    {item.success ? '✓ Command executed successfully' : '✗ Command failed'}
                  </div>
                )}
              </div>
            ))
          )}
          {running && (
            <div style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--accent)' }}>$</span> Running...
            </div>
          )}
        </div>

        {/* Command input */}
        <form 
          onSubmit={handleSubmit}
          style={{ 
            borderTop: '1px solid var(--border)', 
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <IoTerminalOutline size={16} color="var(--accent)" />
          <span style={{ color: 'var(--accent)' }}>$</span>
          <input
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12
            }}
            placeholder="espanso command..."
            value={command}
            onChange={e => setCommand(e.target.value)}
            disabled={running}
            autoFocus
          />
          <button type="submit" className="btn btn-sm btn-primary" disabled={running || !command.trim()}>
            <IoPlay size={12} /> Run
          </button>
        </form>
      </div>

      <div className="text-xs text-muted mt-4">
        <IoSyncOutline size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        Tip: Use <code className="font-mono">espanso restart</code> after making config changes to apply them.
      </div>
    </div>
  )
}