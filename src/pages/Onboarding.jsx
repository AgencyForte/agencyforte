import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Onboarding() {
  const [inputValue, setInputValue] = useState('')
  const [targets, setTargets] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const maxTargets = 5

  const handleAddTarget = (e) => {
    e.preventDefault()
    const name = inputValue.trim()
    if (!name || targets.length >= maxTargets) return

    const newTarget = { id: Date.now(), name, status: 'scanning' }
    setTargets([...targets, newTarget])
    setInputValue('')

    // Simulate cross-referencing delay
    setTimeout(() => {
      setTargets(prev => prev.map(t => 
        t.id === newTarget.id ? { ...t, status: 'verified' } : t
      ))
    }, 1500)
  }

  const handleRemove = (id) => {
    setTargets(targets.filter(t => t.id !== id))
  }

  const handleContinue = () => {
    setIsLoading(true)
    setTimeout(() => {
      navigate('/dashboard')
    }, 1500)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', overflow: 'hidden' }}>
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>
      <div className="noise-overlay"></div>

      <div className="onboarding-container fade-in-up" style={{ width: '100%', maxWidth: '600px', zIndex: 10 }}>
        <div className="glass-card">
          <div className="onboarding-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div className="logo" style={{ justifyContent: 'center', marginBottom: '1rem', fontSize: '1.2rem', opacity: 0.8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              AGENCY<span>FORTE</span>
            </div>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Initialize Watchlist</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
              Enter up to 5 competitors. You will receive immediate alerts the exact hour they suffer a <strong>Producer Exit</strong> or a <strong>Carrier De-Appointment</strong>.
            </p>
          </div>

          <form onSubmit={handleAddTarget} className="input-group" style={{ display: 'flex', gap: '10px', marginBottom: '2rem' }}>
            <input 
              type="text" 
              className="agency-input" 
              placeholder={targets.length >= maxTargets ? "Maximum targets reached." : "e.g., Smith & Co Insurance"} 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={targets.length >= maxTargets}
              style={{
                flexGrow: 1, background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-highlight)',
                color: 'var(--text-main)', padding: '1rem 1.5rem', borderRadius: '6px', fontSize: '1.1rem',
                outline: 'none', transition: 'all 0.3s'
              }}
            />
            <button 
              type="submit" 
              className="btn-ghost" 
              disabled={targets.length >= maxTargets || !inputValue.trim()}
            >
              Add Competitor
            </button>
          </form>

          <div className="target-list" style={{ marginBottom: '2rem', minHeight: '100px' }}>
            {targets.map(target => (
              <div key={target.id} className="target-item" style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
                padding: '1rem', borderRadius: '6px', marginBottom: '0.5rem', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-mono)',
                fontSize: '0.9rem', animation: 'slideIn 0.3s ease forwards'
              }}>
                <span className="target-name" style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{'>'} {target.name}</span>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {target.status === 'scanning' ? (
                    <span className="target-status" style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="loading-dot" style={{ width: '6px', height: '6px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div> 
                      Cross-referencing database...
                    </span>
                  ) : (
                    <span className="target-status" style={{ color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      [ VERIFIED & ADDED ]
                    </span>
                  )}
                  {target.status === 'verified' && (
                    <button 
                      onClick={() => handleRemove(target.id)} 
                      style={{
                        color: 'var(--accent-red)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem', background: 'none', border: 'none', padding: 0,
                        marginLeft: '15px', opacity: 0.6, transition: 'opacity 0.2s'
                      }}
                    >
                      [ REMOVE ]
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button 
            onClick={handleContinue}
            className="btn-primary-full"
            disabled={targets.length === 0 || isLoading}
            style={{
              width: '100%', opacity: targets.length > 0 ? 1 : 0.5,
              pointerEvents: targets.length > 0 ? 'auto' : 'none', transition: 'all 0.3s'
            }}
          >
            {isLoading ? (
              <><div className="loading-dot" style={{ display: 'inline-block', marginRight: '10px', width: '6px', height: '6px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div> Initializing Dashboard...</>
            ) : (
              'Complete Setup & Launch Dashboard'
            )}
          </button>
          
          <div className="progress-text" style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem' }}>
            {targets.length} / {maxTargets} Competitors Added
          </div>
        </div>
      </div>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
