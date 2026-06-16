import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isSignUp, setIsSignUp] = useState(false)
  const navigate = useNavigate()

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (isSignUp) {
        const { error } = await supabase.from('users').insert({
          email,
          password_hash: password // Insecure for prod, fine for demo MVP
        })
        if (error) throw error
        navigate('/onboarding', { state: { email } })
      } else {
        const { data, error } = await supabase.from('users').select('*').eq('email', email).single()
        if (error || !data) throw new Error("Invalid access credentials.")
        
        if (data.home_agency_id) {
          navigate('/dashboard')
        } else {
          navigate('/onboarding', { state: { email } })
        }
      }
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', overflow: 'hidden' }}>
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>
      <div className="noise-overlay"></div>

      <div className="onboarding-container fade-in-up" style={{ width: '100%', maxWidth: '400px', zIndex: 10 }}>
        <div className="glass-card" style={{ padding: '3rem 2rem' }}>
          <div className="onboarding-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div className="logo" style={{ justifyContent: 'center', marginBottom: '1rem', fontSize: '1.2rem', opacity: 0.8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              AGENCY<span>FORTE</span>
            </div>
            <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{isSignUp ? 'Create Account' : 'Client Terminal'}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {isSignUp ? 'Initialize your intelligence workspace.' : 'Access your active market watchlists.'}
            </p>
          </div>

          {error && (
            <div style={{ background: 'rgba(255, 42, 85, 0.1)', border: '1px solid var(--accent-red)', color: 'white', padding: '0.8rem', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
              {'>'} {error}
            </div>
          )}

          <form onSubmit={handleAuth}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Email Designation</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)', color: 'white', padding: '0.8rem', borderRadius: '4px', fontFamily: 'var(--font-body)', outline: 'none' }}
                required
              />
            </div>
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Access Code</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)', color: 'white', padding: '0.8rem', borderRadius: '4px', fontFamily: 'var(--font-body)', outline: 'none' }}
                required
              />
            </div>

            <button 
              type="submit" 
              className="btn-primary-full"
              disabled={loading}
              style={{ width: '100%', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'AUTHENTICATING...' : (isSignUp ? 'INITIALIZE ACCOUNT' : 'SECURE LOGIN')}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button 
              className="btn-ghost" 
              style={{ padding: 0, border: 'none', fontSize: '0.8rem', color: 'var(--text-muted)' }}
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Already authorized? Access Terminal.' : 'No access? Request Clearance.'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
