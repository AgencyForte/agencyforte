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
  const [searchLog, setSearchLog] = useState('')

  // Verification/Auth States
  const [showVerification, setShowVerification] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authConfirmPassword, setAuthConfirmPassword] = useState('')
  const [authError, setAuthError] = useState(null)

  const getPasswordStrength = (pass) => {
    if (pass.length === 0) return 0;

    const hasLower = /[a-z]/.test(pass);
    const hasUpper = /[A-Z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = /[^A-Za-z0-9]/.test(pass);
    const isLong = pass.length >= 8;

    let variety = 0;
    if (hasLower) variety++;
    if (hasUpper) variety++;
    if (hasNumber) variety++;
    if (hasSpecial) variety++;

    if (isLong && variety >= 3 && hasSpecial) return 4; // Strong
    if (isLong && variety >= 3) return 3; // Fair
    if (variety >= 2 && pass.length >= 6) return 2; // Weak-ish
    return 1; // Weak
  }

  const strengthScore = getPasswordStrength(authPassword);
  let strengthColor = 'transparent';
  let strengthWidth = '0%';
  if (authPassword.length > 0) {
    if (strengthScore <= 1) { strengthColor = 'var(--accent-red)'; strengthWidth = '33%'; }
    else if (strengthScore === 2 || strengthScore === 3) { strengthColor = 'var(--accent-steel)'; strengthWidth = '66%'; }
    else if (strengthScore === 4) { strengthColor = '#10B981'; strengthWidth = '100%'; }
  }

  const getEmailError = (email) => {
    if (email.length === 0) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email is invalid';
    const domain = email.split('@')[1]?.toLowerCase();
    const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'protonmail.com'];
    if (personalDomains.includes(domain)) return 'Business email required (no personal domains)';
    return null;
  }
  const emailErrorText = getEmailError(authEmail);

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
    if (step !== 1 || agencySearch.trim().length < 5) {
      setAgencyResults([])
      setSearchLog('')
      return
    }

    let isCancelled = false
    const searchAgencies = async () => {
      setIsSearchingAgencies(true)

      if (!isCancelled) setSearchLog('> Connecting to NIPR endpoint...')

      // Simulate slight delay for effect
      await new Promise(r => setTimeout(r, 600))
      if (!isCancelled) setSearchLog('> Triangulating State DOI licenses...')

      const { data, error } = await supabase
        .from('agencies')
        .select('*, location:locations(*)')
        .eq('tdi_license_number', agencySearch.trim())
        .limit(1)

      if (!error && data && data.length > 0) {
        if (!isCancelled) setSearchLog('> Match acquired. Decrypting payload...')
        await new Promise(r => setTimeout(r, 400))

        const { count } = await supabase.from('agency_carrier_appointments')
          .select('*', { count: 'exact', head: true })
          .eq('agency_id', data[0].id)
          .eq('status', 'ACTIVE')

        data[0].carriers_count = count || 0
        if (!isCancelled) setAgencyResults(data)
      } else {
        if (!isCancelled) setSearchLog('> No matching entities found.')
        await new Promise(r => setTimeout(r, 600))
        if (!isCancelled) setAgencyResults([])
      }
      if (!isCancelled) setIsSearchingAgencies(false)
    }

    const timeoutId = setTimeout(searchAgencies, 500)
    return () => {
      isCancelled = true
      clearTimeout(timeoutId)
    }
  }, [agencySearch, step])

  // Step 2 Fetch Recommendations Effect
  useEffect(() => {
    if (step === 2 && homeAgency) {
      const fetchRecommendations = async () => {
        const { data, error } = await supabase
          .from('competitor_relationships')
          .select('*, competitor_agency:agencies!competitor_agency_id(id, agency_name, total_producers_count)')
          .eq('base_agency_id', homeAgency.id)
          .order('competition_score', { ascending: false })
          .limit(5)

        if (!error && data) {
          // Format them to match our target shape
          const recs = data.map(d => {
            let carrierText = `${d.overlap_carriers_count || 0} shared carriers`
            // if we add shared_carrier_names later
            if (d.shared_carrier_names && d.shared_carrier_names.length > 0) {
              const names = d.shared_carrier_names.slice(0, 2).join(' & ')
              carrierText = `Competes directly for your ${names}${d.shared_carrier_names.length > 2 ? ' and others' : ''} premium.`
            }
            return {
              id: d.competitor_agency?.id || d.competitor_agency_id,
              name: d.competitor_agency?.agency_name || 'Unknown Competitor',
              producers: d.competitor_agency?.total_producers_count || 'N/A',
              sharedCarriers: d.overlap_carriers_count || 0,
              reason: `${Math.round(d.distance_miles || 0)} miles away`
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
        .select('id, agency_name, total_producers_count')
        .ilike('agency_name', `%${targetSearch}%`)
        .eq('is_enterprise', false)
        .eq('is_captive_or_micro', false)
        .gte('total_producers_count', 3)
        .lte('total_producers_count', 19)
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

  const claimAgency = (agency) => {
    setHomeAgency(agency)
    setStep(2)
  }

  const finalizeClaim = async (e) => {
    if (e) e.preventDefault()
    setAuthError(null)

    const isDevBypass = authEmail === '' && authPassword === '' && authConfirmPassword === '';

    if (!isDevBypass) {
      // Professional Validation
      const emailErr = getEmailError(authEmail);
      if (emailErr) {
        setAuthError(emailErr)
        return
      }

      if (authPassword.length < 8 || !/[A-Z]/.test(authPassword) || !/[0-9]/.test(authPassword)) {
        setAuthError('Password requires 8+ chars, 1 uppercase, 1 number.')
        return
      }

      if (authPassword !== authConfirmPassword) {
        setAuthError('Passwords do not match.')
        return
      }
    }

    setIsLoading(true)

    const registeredEmail = isDevBypass ? `dev_${Date.now()}@example.com` : authEmail;

    // Insert new user to mock Auth
    const { data: newUser, error: authErr } = await supabase.from('users').insert({
      email: registeredEmail,
      password_hash: isDevBypass ? 'mockpass' : authPassword,
      home_agency_id: homeAgency.id
    }).select('id').single()

    if (newUser && targets.length > 0) {
      // Insert new watchlists
      const inserts = targets.map(t => ({
        user_id: newUser.id,
        agency_id: t.id,
        alert_min_tenure_years: 0
      }))
      await supabase.from('user_watchlists').insert(inserts)

      setTimeout(() => {
        navigate('/dashboard', { state: { email: registeredEmail } })
      }, 1000)
    } else {
      console.error(authErr)
      setIsLoading(false)
    }
  }

  const handleAddTarget = (agency, reason = 'Manual selection', producers = 'N/A', sharedCarriers = 0) => {
    if (targets.length >= maxTargets) return
    if (targets.some(t => t.id === agency.id)) return // already added

    const newTarget = { id: agency.id, name: agency.name || agency.agency_name, reason, producers, sharedCarriers }
    setTargets([...targets, newTarget])
    setTargetSearch('')

    if (!recommendedTargets.some(r => r.id === agency.id)) {
      setRecommendedTargets([newTarget, ...recommendedTargets])
    }
  }

  const handleRemove = (id) => {
    setTargets(targets.filter(t => t.id !== id))
  }

  const triggerAuthModal = () => {
    setShowVerification(true)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', overflow: 'hidden' }}>
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>
      <div className="noise-overlay"></div>

      <div className="onboarding-container fade-in-up" style={{ width: '100%', maxWidth: '600px', zIndex: 10 }}>
        <div className="glass-card">
          <div className="onboarding-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--accent-steel)', marginBottom: '2rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8 }}>
              <span>OMEGA PROTOCOL</span>
              <span style={{ opacity: 0.5 }}>.</span>
              <span style={{ color: 'var(--accent-green)' }}>SECURE UPLINK ESTABLISHED</span>
              <span style={{ opacity: 0.5 }}>.</span>
              <span>SYS.VER: 4.1.9</span>
            </div>

            {step === 1 ? (
              <>
                <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>AUTHENTICATE ORIGIN AGENCY</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  Input NPN or State License UID to initialize your geographic footprint.
                </p>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>ESTABLISH TARGET WATCHLIST</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                  Designate up to 5 hostile entities to deploy to your Intelligence Dashboard.
                </p>
              </>
            )}
          </div>

          {step === 1 && (
            <div className="step-1-content">
              <input
                type="text"
                placeholder="Input NPN or State License UID..."
                value={agencySearch}
                onChange={(e) => setAgencySearch(e.target.value)}
                style={{
                  width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-highlight)',
                  color: 'var(--text-main)', padding: '1rem 1.5rem', borderRadius: '6px', fontSize: '0.8rem',
                  outline: 'none', transition: 'all 0.3s', marginBottom: '1rem', fontFamily: 'var(--font-mono)'
                }}
              />

              {isSearchingAgencies ? (
                <div style={{ textAlign: 'left', color: 'var(--accent-green)', padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                  {searchLog}
                  <span className="cursor-blink" style={{ display: 'inline-block', width: '8px', height: '15px', background: 'var(--accent-green)', marginLeft: '4px', verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }}></span>
                </div>
              ) : agencyResults.length > 0 ? (
                <div className="results-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto', paddingRight: '5px' }}>
                  {agencyResults.map(ag => (
                    <div
                      key={ag.id}
                      onClick={() => claimAgency(ag)}
                      className="dossier-card fade-in-up"
                      style={{
                        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                        borderRadius: '8px', padding: '1.5rem', textAlign: 'left',
                        cursor: 'pointer', transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-steel)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'translateY(0)' }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '0.4rem' }}>
                          <span style={{ color: 'var(--text-main)', fontSize: '1rem', fontWeight: 'bold' }}>{ag.agency_name}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>TDI: {ag.tdi_license_number || 'N/A'}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>• {ag.location?.city ? `${ag.location.city}, ${ag.location.state}` : 'Unknown Location'}</span>
                        </div>

                        <div style={{ display: 'flex', gap: '20px', color: 'var(--text-main)', fontSize: '0.85rem' }}>
                          <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>TYPE </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{ag.category?.replace('_', ' ') || 'UNCLASSIFIED'}</strong></span>
                          <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>PRODUCERS </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{ag.total_producers_count}</strong></span>
                          {ag.carriers_count !== undefined && (
                            <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>CARRIERS </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{ag.carriers_count}</strong></span>
                          )}
                          <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>KEY-PERSON RISK </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{ag.bus_factor_pct}%</strong></span>
                        </div>

                        <div style={{ marginTop: '1rem', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.5rem', fontSize: '0.65rem', color: 'var(--accent-steel)', fontFamily: 'var(--font-mono)', letterSpacing: '1px' }}>
                          DATA STREAM VERIFIED: NIPR / STATE DOI
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                agencySearch.length >= 2 && <div style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>No matching entities found.</div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="step-2-content">
              <div style={{ position: 'relative', marginBottom: '2rem' }}>
                <input
                  type="text"
                  placeholder={targets.length >= maxTargets ? "Maximum targets reached." : "Search additional competitors by name..."}
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

              {recommendedTargets.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--accent-steel)', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    TARGET DOSSIERS
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {recommendedTargets.map(rec => {
                      const isSelected = targets.some(t => t.id === rec.id);
                      return (
                        <div
                          key={rec.id}
                          onClick={() => isSelected ? handleRemove(rec.id) : handleAddTarget({ id: rec.id, name: rec.name }, rec.reason, rec.producers, rec.sharedCarriers)}
                          style={{
                            background: isSelected ? 'rgba(71, 85, 105, 0.15)' : 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            padding: '1.5rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', cursor: 'pointer', transition: 'background-color 0.2s'
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ color: 'var(--text-main)', fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '0.4rem' }}>{rec.name}</div>
                            <div style={{ display: 'flex', gap: '20px', color: 'var(--text-main)', fontSize: '0.85rem' }}>
                              <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>PRODUCERS </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{rec.producers}</strong></span>
                              <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>SHARED CARRIERS </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{rec.sharedCarriers}</strong></span>
                              <span><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>PROXIMITY </span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{rec.reason}</strong></span>
                            </div>
                          </div>
                          <div style={{
                            width: '24px', height: '24px', borderRadius: '50%',
                            border: isSelected ? 'none' : '2px solid var(--border-subtle)',
                            background: isSelected ? 'var(--accent-steel)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginLeft: '1rem', transition: 'all 0.2s'
                          }}>
                            {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <button
                onClick={triggerAuthModal}
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
                  `Deploy Watchlist (${targets.length}/${maxTargets} Selected)`
                )}
              </button>
            </div>
          )}

          {showVerification && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
            }}>
              <div className="glass-card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '2rem', animation: 'slideIn 0.3s ease forwards', border: '1px solid var(--border-highlight)' }}>
                <h3 style={{ fontSize: '1.3rem', marginBottom: '1rem', color: 'var(--accent-red)', textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'var(--font-mono)' }}>[ SECURITY CLEARANCE REQUIRED ]</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5, fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
                  Authorize clearance to deploy the watchlist and initialize the Intelligence Dashboard.
                </p>
                <form onSubmit={finalizeClaim} style={{ textAlign: 'left' }}>

                  {authError && (
                    <div style={{ background: 'rgba(225, 29, 72, 0.1)', border: '1px solid var(--accent-red)', color: 'white', padding: '0.8rem', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                      [!] {authError}
                    </div>
                  )}

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Principal Credentials (Email)</label>
                    <input
                      type="email"
                      value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)', color: 'white', padding: '0.8rem', borderRadius: '4px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                    />
                    {emailErrorText && (
                      <div style={{ color: 'var(--accent-red)', fontSize: '0.75rem', marginTop: '0.3rem', fontFamily: 'var(--font-mono)' }}>{emailErrorText}</div>
                    )}
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Encryption Passphrase</label>
                    <input
                      type="password"
                      value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)', color: 'white', padding: '0.8rem', borderRadius: '4px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.65rem', color: strengthColor, fontFamily: 'var(--font-mono)' }}>ENCRYPTION LEVEL: {strengthScore <= 1 ? 'WEAK' : strengthScore === 4 ? 'MIL-SPEC' : 'MODERATE'}</span>
                      <div style={{ width: '60%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: strengthWidth, background: strengthColor, transition: 'all 0.3s ease' }}></div>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Verify Passphrase</label>
                    <input
                      type="password"
                      value={authConfirmPassword} onChange={e => setAuthConfirmPassword(e.target.value)}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)', color: 'white', padding: '0.8rem', borderRadius: '4px', outline: 'none', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button type="button" onClick={() => setShowVerification(false)} className="btn-ghost" disabled={isLoading} style={{ flex: 1 }}>
                      [ ABORT ]
                    </button>
                    <button type="submit" className="btn-primary-small" disabled={isLoading} style={{ flex: 2, fontFamily: 'var(--font-mono)' }}>
                      {isLoading ? 'AUTHORIZING...' : 'AUTHORIZE CLEARANCE'}
                    </button>
                  </div>
                </form>
              </div>
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
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
