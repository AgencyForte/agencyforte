import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Onboarding() {
  const [step, setStep] = useState(1) // 1: Claim Agency, 2: Choose Targets
  const [homeAgency, setHomeAgency] = useState(null)
  
  // Step 1 States
  const [agencySearch, setAgencySearch] = useState('')
  const [agencyResults, setAgencyResults] = useState([])
  const [isSearchingAgencies, setIsSearchingAgencies] = useState(false)
  
  // Step 2 States
  const [recommendedTargets, setRecommendedTargets] = useState([])
  const [targetSearch, setTargetSearch] = useState('')
  const [targetSearchResults, setTargetSearchResults] = useState([])
  const [targets, setTargets] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  
  const navigate = useNavigate()
  const location = useLocation()
  const maxTargets = 5
  // Use email from login/signup, or fallback to the seeded user
  const USER_EMAIL = location.state?.email || 'principal@agencyforte.com'

  // Step 1 Search Effect
  useEffect(() => {
    if (step !== 1 || agencySearch.trim().length < 2) {
      setAgencyResults([])
      return
    }
    
    const searchAgencies = async () => {
      setIsSearchingAgencies(true)
      const { data, error } = await supabase
        .from('agencies')
        .select('*, location:locations(*)')
        .ilike('agency_name', `%${agencySearch}%`)
        .limit(5)
      
      if (!error && data) {
        setAgencyResults(data)
      }
      setIsSearchingAgencies(false)
    }
    
    const timeoutId = setTimeout(searchAgencies, 300)
    return () => clearTimeout(timeoutId)
  }, [agencySearch, step])

  // Step 2 Fetch Recommendations Effect
  useEffect(() => {
    if (step === 2 && homeAgency) {
      const fetchRecommendations = async () => {
        const { data, error } = await supabase
          .from('dynamic_competitor_discovery')
          .select('*')
          .eq('base_agency_id', homeAgency.id)
          .order('competition_score', { ascending: false })
          .limit(3)
        
        if (!error && data) {
          // Format them to match our target shape
          const recs = data.map(d => {
            let carrierText = `${d.shared_carriers_count} shared carriers`
            if (d.shared_carrier_names && d.shared_carrier_names.length > 0) {
              const names = d.shared_carrier_names.slice(0, 2).join(' & ')
              carrierText = `Competes directly for your ${names}${d.shared_carrier_names.length > 2 ? ' and others' : ''} premium.`
            }
            return {
              id: d.competitor_agency_id,
              name: d.competitor_agency_name,
              reason: `${Math.round(d.distance_miles || 0)} miles away • ${carrierText}`
            }
          })
          setRecommendedTargets(recs)
        }
      }
      fetchRecommendations()
    }
  }, [step, homeAgency])
  
  // Step 2 Search Target Effect
  useEffect(() => {
    if (step !== 2 || targetSearch.trim().length < 2) {
      setTargetSearchResults([])
      return
    }
    
    const searchTargets = async () => {
      const { data, error } = await supabase
        .from('agencies')
        .select('*')
        .ilike('agency_name', `%${targetSearch}%`)
        .limit(5)
      
      if (!error && data) {
        // Exclude home agency and already selected targets
        const filtered = data.filter(a => a.id !== homeAgency?.id && !targets.some(t => t.id === a.id))
        setTargetSearchResults(filtered)
      }
    }
    
    const timeoutId = setTimeout(searchTargets, 300)
    return () => clearTimeout(timeoutId)
  }, [targetSearch, step, homeAgency, targets])

  const claimAgency = async (agency) => {
    setHomeAgency(agency)
    // Update user in DB
    const { data: userData } = await supabase.from('users').select('id').eq('email', USER_EMAIL).single()
    if (userData) {
      await supabase.from('users').update({ home_agency_id: agency.id }).eq('id', userData.id)
    }
    setStep(2)
  }

  const handleAddTarget = (agency, reason = 'Manual selection') => {
    if (targets.length >= maxTargets) return
    if (targets.some(t => t.id === agency.id)) return // already added
    
    setTargets([...targets, { id: agency.id, name: agency.name || agency.agency_name, reason }])
    setTargetSearch('')
  }

  const handleRemove = (id) => {
    setTargets(targets.filter(t => t.id !== id))
  }

  const handleComplete = async () => {
    setIsLoading(true)
    
    const { data: userData } = await supabase.from('users').select('id').eq('email', USER_EMAIL).single()
    
    if (userData && targets.length > 0) {
      // Clear existing watchlists
      await supabase.from('user_watchlists').delete().eq('user_id', userData.id)
      
      // Insert new watchlists
      const inserts = targets.map(t => ({
        user_id: userData.id,
        agency_id: t.id,
        alert_min_tenure_years: 0
      }))
      await supabase.from('user_watchlists').insert(inserts)
    }
    
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
            
            {step === 1 ? (
              <>
                <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Claim Your Agency</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                  Search for your agency to initialize your geographic footprint.
                </p>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Initialize Watchlist</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                  Target up to 5 competitors. You will receive immediate alerts the exact hour they suffer a <strong>Producer Exit</strong> or a <strong>Carrier De-Appointment</strong>.
                </p>
              </>
            )}
          </div>

          {step === 1 && (
            <div className="step-1-content">
              <input 
                type="text" 
                placeholder="e.g., Smith & Co Insurance" 
                value={agencySearch}
                onChange={(e) => setAgencySearch(e.target.value)}
                style={{
                  width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-highlight)',
                  color: 'var(--text-main)', padding: '1rem 1.5rem', borderRadius: '6px', fontSize: '1.1rem',
                  outline: 'none', transition: 'all 0.3s', marginBottom: '1rem'
                }}
              />
              
              {isSearchingAgencies ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>
                  <div className="loading-dot" style={{ display: 'inline-block', marginRight: '10px', width: '6px', height: '6px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
                  Searching database...
                </div>
              ) : agencyResults.length > 0 ? (
                <div className="results-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto', paddingRight: '5px' }}>
                  {agencyResults.map(ag => (
                    <div key={ag.id} className="dossier-card fade-in-up" style={{ 
                      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', 
                      borderRadius: '8px', padding: '1rem', textAlign: 'left',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '0.4rem' }}>
                          <span style={{ color: 'var(--text-main)', fontSize: '1rem', fontWeight: 'bold' }}>{ag.agency_name}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>TDI: {ag.tdi_license_number || 'N/A'}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>• {ag.location?.city ? `${ag.location.city}, ${ag.location.state}` : 'Unknown Location'}</span>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '20px', color: 'var(--text-main)', fontSize: '0.85rem' }}>
                          <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>TYPE </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{ag.category?.replace('_', ' ') || 'UNCLASSIFIED'}</strong></span>
                          <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>AGENTS </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{ag.total_producers_count}</strong></span>
                          <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>VOL </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{ag.estimated_premium_volume || 'N/A'}</strong></span>
                          <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>AMS </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{ag.ams_system || 'N/A'}</strong></span>
                          <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>RISK </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{ag.bus_factor_pct}%</strong></span>
                        </div>
                      </div>

                      <button onClick={() => claimAgency(ag)} className="btn-primary-small" style={{ marginLeft: '1rem', whiteSpace: 'nowrap' }}>
                        CLAIM
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                agencySearch.length >= 2 && <div style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>No agencies found.</div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="step-2-content">
              {recommendedTargets.length > 0 && targets.length < maxTargets && (
                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    RECOMMENDED TARGETS
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {recommendedTargets.filter(r => !targets.some(t => t.id === r.id)).map(rec => (
                      <div key={rec.id} style={{
                        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                        padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', 
                        alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ color: 'var(--text-main)', fontWeight: 'bold', fontSize: '0.95rem' }}>{rec.name}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>{rec.reason}</div>
                        </div>
                        <button 
                          onClick={() => handleAddTarget({ id: rec.id, name: rec.name }, rec.reason)}
                          className="btn-ghost"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ position: 'relative', marginBottom: '2rem' }}>
                <input 
                  type="text" 
                  placeholder={targets.length >= maxTargets ? "Maximum targets reached." : "Search additional competitors..."} 
                  value={targetSearch}
                  onChange={(e) => setTargetSearch(e.target.value)}
                  disabled={targets.length >= maxTargets}
                  style={{
                    width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-highlight)',
                    color: 'var(--text-main)', padding: '1rem 1.5rem', borderRadius: '6px', fontSize: '1.1rem',
                    outline: 'none', transition: 'all 0.3s'
                  }}
                />
                
                {targetSearchResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-highlight)', borderRadius: '4px', zIndex: 100, marginTop: '5px', maxHeight: '200px', overflowY: 'auto' }}>
                    {targetSearchResults.map(ag => (
                      <button 
                        key={ag.id} 
                        onClick={() => handleAddTarget(ag)}
                        style={{
                          width: '100%', padding: '1rem', textAlign: 'left', background: 'transparent', border: 'none',
                          borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.9rem'
                        }}
                      >
                        {ag.agency_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="target-list" style={{ marginBottom: '2rem', minHeight: '100px' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  ACTIVE WATCHLIST ({targets.length} / {maxTargets})
                </div>
                {targets.map(target => (
                  <div key={target.id} className="target-item" style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                    padding: '1rem', borderRadius: '8px', marginBottom: '0.5rem', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '0.9rem', animation: 'slideIn 0.3s ease forwards'
                  }}>
                    <div>
                      <div style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{target.name}</div>
                      {target.reason !== 'Manual selection' && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.2rem' }}>Algorithmic Match</div>
                      )}
                    </div>
                      <button 
                      onClick={() => handleRemove(target.id)} 
                      style={{
                        color: 'var(--accent-red)', cursor: 'pointer',
                        fontSize: '0.85rem', background: 'none', border: 'none', padding: 0,
                        marginLeft: '15px', opacity: 0.8, transition: 'opacity 0.2s'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <button 
                onClick={handleComplete}
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
                  'Deploy Watchlist & Launch Dashboard'
                )}
              </button>
            </div>
          )}

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
