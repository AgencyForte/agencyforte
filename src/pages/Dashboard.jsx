import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './dashboard.css'

const MOCK_ALERTS = [
  // Dallas-Fort Worth
  { agency_name: 'Goosehead Insurance', event_type: 'defection', agent_name: 'Marcus Vance', agent_npn: '8839210', carrier_name: 'Travelers', new_agency: 'Willis Towers Watson', agent_tenure_years: 12, top_carriers: 'Travelers, Hartford, Chubb', is_read: false, region: 'Dallas-Fort Worth', zip_code: '75039' },
  { agency_name: 'Goosehead Insurance', event_type: 'carrier_loss', carrier_name: 'NATIONWIDE', is_read: false, region: 'Dallas-Fort Worth', zip_code: '75039' },
  { agency_name: 'BKS Partners', event_type: 'hire', agent_name: 'David Ortiz', agent_npn: '992122', carrier_name: 'Liberty Mutual', previous_agency: 'USI Insurance', agent_tenure_years: 8, top_carriers: 'Liberty Mutual, AIG', is_read: false, region: 'Dallas-Fort Worth', zip_code: '76102' },
  
  // Greater Houston
  { agency_name: 'Higginbotham', event_type: 'hire', agent_name: 'Sarah Jenkins', agent_npn: '445123', carrier_name: 'Liberty Mutual', previous_agency: 'Gallagher', agent_tenure_years: 8, top_carriers: 'Liberty Mutual, Hiscox', is_read: false, region: 'Greater Houston', zip_code: '77002' },
  { agency_name: 'Higginbotham', event_type: 'new_appt', carrier_name: 'CHUBB', is_read: false, region: 'Greater Houston', zip_code: '77002' },
  { agency_name: 'Dean & Draper', event_type: 'defection', agent_name: 'Michael Bates', agent_npn: '1234567', carrier_name: 'Chubb', new_agency: 'Unknown', agent_tenure_years: 14, top_carriers: 'Chubb, AIG', is_read: false, region: 'Greater Houston', zip_code: '77042' },
  { agency_name: 'Dean & Draper', event_type: 'agency_termination', carrier_name: 'NATIONWIDE', is_read: false, region: 'Greater Houston', zip_code: '77042' },

  // Austin / Central Texas
  { agency_name: 'Watkins Insurance Group', event_type: 'hire', agent_name: 'Jessica Wong', agent_npn: '112344', carrier_name: 'Chubb', previous_agency: 'Marsh', agent_tenure_years: 5, top_carriers: 'Chubb, Travelers', is_read: false, region: 'Austin / Central Texas', zip_code: '78731' },
  { agency_name: 'Watkins Insurance Group', event_type: 'new_appt', carrier_name: 'HARTFORD', is_read: false, region: 'Austin / Central Texas', zip_code: '78731' },
  
  // San Antonio
  { agency_name: 'Wortham Insurance', event_type: 'defection', agent_name: 'Robert Davis', agent_npn: '556123', carrier_name: 'Travelers', new_agency: 'Higginbotham', agent_tenure_years: 9, top_carriers: 'Travelers, Nationwide', is_read: false, region: 'San Antonio', zip_code: '78205' },
  
  // West Texas
  { agency_name: 'First Basin Insurance', event_type: 'carrier_loss', carrier_name: 'ZURICH', is_read: false, region: 'West Texas', zip_code: '79701' },
  { agency_name: 'First Basin Insurance', event_type: 'new_appt', carrier_name: 'AIG', is_read: false, region: 'West Texas', zip_code: '79701' }
];

const MOCK_DIRECTORY = [
  { agency_name: 'Goosehead Insurance', region: 'Dallas-Fort Worth', total_producers: 142 },
  { agency_name: 'BKS Partners', region: 'Dallas-Fort Worth', total_producers: 87 },
  { agency_name: 'Higginbotham', region: 'Greater Houston', total_producers: 312 },
  { agency_name: 'Dean & Draper', region: 'Greater Houston', total_producers: 95 },
  { agency_name: 'Watkins Insurance Group', region: 'Austin / Central Texas', total_producers: 120 },
  { agency_name: 'Wortham Insurance', region: 'San Antonio', total_producers: 65 },
  { agency_name: 'First Basin Insurance', region: 'West Texas', total_producers: 22 },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('watchlist')
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [configTitle, setConfigTitle] = useState('')
  const [openTrays, setOpenTrays] = useState({})
  const [timeFilter, setTimeFilter] = useState('30 DAYS')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState('All Texas')
  const [selectedZip, setSelectedZip] = useState('')
  
  const [alerts, setAlerts] = useState([])
  const [directories, setDirectories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      // Fetch Alerts
      const { data: alertData, error: alertError } = await supabase
        .from('tripwire_alerts')
        .select('*')
        .order('created_at', { ascending: false })

      if (alertError) {
        console.error("Error fetching alerts:", alertError)
      } else {
        setAlerts(alertData && alertData.length > 0 ? alertData : MOCK_ALERTS)
      }

      // Fetch Directory
      const { data: dirData, error: dirError } = await supabase
        .from('agency_directory')
        .select('*')
        .limit(500)

      if (dirError || !dirData || dirData.length === 0) {
        setDirectories(MOCK_DIRECTORY)
      } else {
        setDirectories(dirData)
      }

      setLoading(false)
    }

    fetchData()
  }, [])

  const filteredAlerts = alerts.filter(alert => {
    if (selectedRegion !== 'All Texas' && alert.region !== selectedRegion) return false;
    if (selectedZip && alert.zip_code && !alert.zip_code.startsWith(selectedZip)) return false;
    return true;
  })

  const groupedAlerts = filteredAlerts.reduce((acc, alert) => {
    if (!acc[alert.agency_name]) {
      acc[alert.agency_name] = { defection: [], carrier_loss: [], agency_termination: [], hire: [], new_appt: [] }
    }
    if (acc[alert.agency_name][alert.event_type]) {
      acc[alert.agency_name][alert.event_type].push(alert)
    }
    return acc
  }, {})

  const renderData = groupedAlerts

  const filteredDirectories = directories.filter(dir => {
    if (selectedRegion !== 'All Texas' && dir.region !== selectedRegion) return false;
    return true;
  })

  const marketMovementsData = filteredDirectories.map(dir => {
    const events = groupedAlerts[dir.agency_name] || { defection: [], carrier_loss: [], agency_termination: [], hire: [], new_appt: [] };
    return {
      agencyName: dir.agency_name,
      totalProducers: dir.total_producers,
      events: events
    }
  });

  const toggleTray = (id) => {
    setOpenTrays(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const openConfig = (name) => {
    setConfigTitle(name)
    setConfigModalOpen(true)
  }

  return (
    <div className="dashboard-layout">
      {/* FIXED TACTICAL SIDEBAR */}
      <aside className="sidebar" id="sidebar">
        <div className="nav-group">
          <div className="nav-header">// ACTIVE OPERATIONS</div>
          <nav className="sidebar-nav">
            <button 
              className={`nav-item ${activeTab === 'watchlist' ? 'active' : ''}`} 
              onClick={() => setActiveTab('watchlist')}
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
              </span>
              <span className="nav-text">My Watchlist</span>
            </button>
            <button 
              className={`nav-item ${activeTab === 'movements' ? 'active' : ''}`} 
              onClick={() => setActiveTab('movements')}
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              </span>
              <span className="nav-text">Market Movements</span>
            </button>
          </nav>
        </div>
        
        <div className="nav-group" style={{ marginTop: 'auto' }}>
          <div className="nav-header">// SYSTEM</div>
          <nav className="sidebar-nav">
            <button className="nav-item" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
              </span>
              <span className="nav-text">Data Feed</span>
            </button>
            <button className="nav-item" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </span>
              <span className="nav-text">Settings</span>
            </button>
          </nav>
        </div>
      </aside>

      <main className="main-content" style={{ paddingTop: '5rem' }}>
        {activeTab === 'watchlist' && (
          <div className="unified-container">
            <section style={{ padding: 0, marginBottom: '4rem' }}>
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: '1.5rem', width: '100%', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                <button 
                  className="section-header btn-ghost" 
                  style={{ border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '10px', background: 'transparent', cursor: 'pointer', marginBottom: 0, justifyContent: 'flex-start', borderBottom: 'none' }} 
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  <span style={{ fontWeight: 'bold' }}>{timeFilter} MARKET WATCH</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>▼</span>
                </button>
                {dropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, background: 'rgba(13, 17, 26, 0.95)', border: '1px solid var(--border-highlight)', borderRadius: '4px', padding: '0.5rem 0', zIndex: 100, minWidth: '250px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', marginTop: '10px' }}>
                    {['30 DAYS', '60 DAYS', '12 MONTHS'].map(t => (
                      <div 
                        key={t}
                        onClick={() => { setTimeFilter(t); setDropdownOpen(false); }}
                        style={{ padding: '0.8rem 1.5rem', cursor: 'pointer', color: timeFilter === t ? '#FFF' : 'var(--text-muted)', fontFamily: 'var(--font-header)', fontSize: '0.9rem', letterSpacing: '1px' }}
                      >
                        {t} MARKET WATCH
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="competitors-grid">
                <div className="competitor-card">
                  <div className="card-header">
                    <div>
                      <h3>Smith & Co Insurance</h3>
                      <div className="tracking-status">Tracking 42 Producers</div>
                    </div>
                    <button className="btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: '0.7rem' }} onClick={() => openConfig('Smith & Co Insurance')}>CONFIGURE ALERTS</button>
                  </div>
                  <div className="card-body">
                    <div>
                      <div className="movement-row exit interactive" onClick={() => toggleTray('smith-1')}>
                        <span className="label">Rainmaker Defections</span>
                        <span className="value">2 <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span></span>
                      </div>
                      <div className={`tray-container ${openTrays['smith-1'] ? 'open' : ''}`}>
                        <div className="tray-content">
                          <div className="tray-row" style={{ display: 'block' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                              <strong style={{ color: '#FFF', fontSize: '0.95rem' }}>John Doe</strong>
                              <span style={{ color: 'var(--accent-red)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>Exited to: Willis Towers Watson</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              <div><span style={{ opacity: 0.5 }}>Lines:</span> P&C, Commercial</div>
                              <div><span style={{ opacity: 0.5 }}>Tenure:</span> 14 Yrs 2 Mos</div>
                              <div><span style={{ opacity: 0.5 }}>Active Appts:</span> 14 Carriers</div>
                              <div><span style={{ opacity: 0.5 }}>Top Carriers:</span> Chubb, Travelers, AIG, Liberty Mutual, CNA</div>
                            </div>
                          </div>
                          <div className="tray-row" style={{ display: 'block' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                              <strong style={{ color: '#FFF', fontSize: '0.95rem' }}>Marcus Vance</strong>
                              <span style={{ color: 'var(--accent-red)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>Exited to: Unknown</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              <div><span style={{ opacity: 0.5 }}>Lines:</span> Commercial</div>
                              <div><span style={{ opacity: 0.5 }}>Tenure:</span> 12.0 Yrs</div>
                              <div><span style={{ opacity: 0.5 }}>Active Appts:</span> 22 Carriers</div>
                              <div><span style={{ opacity: 0.5 }}>Top Carriers:</span> Hartford, Zurich, Sompo, Nationwide, Markel</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="movement-row loss interactive" onClick={() => toggleTray('smith-2')}>
                        <span className="label">Carrier Losses</span>
                        <span className="value">1 <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span></span>
                      </div>
                      <div className={`tray-container ${openTrays['smith-2'] ? 'open' : ''}`}>
                        <div className="tray-content">
                          <div className="tray-row">
                            <div><strong style={{ color: '#FFF', display: 'block', marginBottom: '2px' }}>NATIONWIDE</strong><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Lost 12 Days Ago</span></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="movement-row loss interactive" onClick={() => toggleTray('smith-3')}>
                        <span className="label">Agency Terminations</span>
                        <span className="value">1 <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span></span>
                      </div>
                      <div className={`tray-container ${openTrays['smith-3'] ? 'open' : ''}`}>
                        <div className="tray-content">
                          <div className="tray-row" style={{ display: 'block' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                              <strong style={{ color: '#FFF', fontSize: '0.95rem' }}>NATIONWIDE</strong>
                              <span style={{ color: 'var(--accent-red)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>Mass Termination Detected</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              <span style={{ color: '#FFF' }}>7 Producers</span> simultaneously stripped of appointments. Agency market access terminated.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="movement-row zero interactive" onClick={() => toggleTray('smith-4')}>
                        <span className="label">Rainmaker Hires</span>
                        <span className="value">0 <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span></span>
                      </div>
                      <div className={`tray-container ${openTrays['smith-4'] ? 'open' : ''}`}><div className="tray-content" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No activity in 30 days</div></div>
                    </div>

                    <div>
                      <div className="movement-row zero interactive" onClick={() => toggleTray('smith-5')}>
                        <span className="label">New Appointments</span>
                        <span className="value">0 <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span></span>
                      </div>
                      <div className={`tray-container ${openTrays['smith-5'] ? 'open' : ''}`}><div className="tray-content" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No activity in 30 days</div></div>
                    </div>
                  </div>
                </div>

                {/* CARD 2 */}
                <div className="competitor-card">
                  <div className="card-header">
                    <div>
                      <h3>Apex Commercial Group</h3>
                      <div className="tracking-status">Tracking 18 Producers</div>
                    </div>
                    <button className="btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: '0.7rem' }} onClick={() => openConfig('Apex Commercial Group')}>CONFIGURE ALERTS</button>
                  </div>
                  <div className="card-body">
                    <div>
                      <div className="movement-row zero interactive" onClick={() => toggleTray('apex-1')}>
                        <span className="label">Rainmaker Defections</span>
                        <span className="value">0 <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span></span>
                      </div>
                      <div className={`tray-container ${openTrays['apex-1'] ? 'open' : ''}`}><div className="tray-content" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No activity in 30 days</div></div>
                    </div>

                    <div>
                      <div className="movement-row zero interactive" onClick={() => toggleTray('apex-2')}>
                        <span className="label">Carrier Losses</span>
                        <span className="value">0 <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span></span>
                      </div>
                      <div className={`tray-container ${openTrays['apex-2'] ? 'open' : ''}`}><div className="tray-content" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No activity in 30 days</div></div>
                    </div>

                    <div>
                      <div className="movement-row zero interactive" onClick={() => toggleTray('apex-3')}>
                        <span className="label">Agency Terminations</span>
                        <span className="value">0 <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span></span>
                      </div>
                      <div className={`tray-container ${openTrays['apex-3'] ? 'open' : ''}`}><div className="tray-content" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No activity in 30 days</div></div>
                    </div>

                    <div>
                      <div className="movement-row hire interactive" onClick={() => toggleTray('apex-4')}>
                        <span className="label">Producer Hires</span>
                        <span className="value">3 <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span></span>
                      </div>
                      <div className={`tray-container ${openTrays['apex-4'] ? 'open' : ''}`}>
                        <div className="tray-content">
                          <div className="tray-row" style={{ display: 'block' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                              <strong style={{ color: '#FFF', fontSize: '0.95rem' }}>Sarah Jenkins</strong>
                              <span style={{ color: 'var(--accent-green)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>Hired from: USI Insurance</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              <div><span style={{ opacity: 0.5 }}>Lines:</span> Commercial</div>
                              <div><span style={{ opacity: 0.5 }}>Tenure:</span> 8 Yrs 6 Mos</div>
                              <div><span style={{ opacity: 0.5 }}>Active Appts:</span> 18 Carriers</div>
                              <div><span style={{ opacity: 0.5 }}>Top Carriers:</span> Liberty Mutual, AIG, Hiscox, QBE, Berkshire</div>
                            </div>
                          </div>
                          <div className="tray-row" style={{ display: 'block' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                              <strong style={{ color: '#FFF', fontSize: '0.95rem' }}>Michael Bates</strong>
                              <span style={{ color: 'var(--accent-green)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>Hired from: Gallagher</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              <div><span style={{ opacity: 0.5 }}>Lines:</span> Benefits</div>
                              <div><span style={{ opacity: 0.5 }}>Tenure:</span> 3 Yrs 1 Mo</div>
                              <div><span style={{ opacity: 0.5 }}>Active Appts:</span> 6 Carriers</div>
                              <div><span style={{ opacity: 0.5 }}>Top Carriers:</span> BCBS, UnitedHealthcare, Humana, Cigna, Aetna</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="movement-row appt interactive" onClick={() => toggleTray('apex-5')}>
                        <span className="label">New Appointments</span>
                        <span className="value">2 <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span></span>
                      </div>
                      <div className={`tray-container ${openTrays['apex-5'] ? 'open' : ''}`}>
                        <div className="tray-content">
                          <div className="tray-row">
                            <div><strong style={{ color: '#FFF', display: 'block', marginBottom: '2px' }}>CHUBB</strong><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Gained 18 Days Ago</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'movements' && (
          <div className="unified-container">
            <section style={{ padding: 0, marginBottom: '4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button 
                    className="section-header btn-ghost" 
                    style={{ border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '10px', background: 'transparent', cursor: 'pointer', marginBottom: 0, justifyContent: 'flex-start', borderBottom: 'none' }} 
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                  >
                    <span style={{ fontWeight: 'bold' }}>{timeFilter} MARKET WATCH</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>▼</span>
                  </button>
                  {dropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, background: 'rgba(13, 17, 26, 0.95)', border: '1px solid var(--border-highlight)', borderRadius: '4px', padding: '0.5rem 0', zIndex: 100, minWidth: '250px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', marginTop: '10px' }}>
                      {['30 DAYS', '60 DAYS', '12 MONTHS'].map(t => (
                        <div 
                          key={t}
                          onClick={() => { setTimeFilter(t); setDropdownOpen(false); }}
                          style={{ padding: '0.8rem 1.5rem', cursor: 'pointer', color: timeFilter === t ? '#FFF' : 'var(--text-muted)', fontFamily: 'var(--font-header)', fontSize: '0.9rem', letterSpacing: '1px' }}
                        >
                          {t} MARKET WATCH
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="competitors-grid">
              {Object.entries(renderData).map(([agencyName, events], index) => {
                const totalProducers = Math.floor(Math.random() * 30) + 10 // Mock total since it's not in the alerts table
                return (
                  <div className="competitor-card" key={`watch-${index}`}>
                    <div className="card-header">
                      <div>
                        <h3>{agencyName}</h3>
                        <div className="tracking-status">Tracking {totalProducers} Producers</div>
                      </div>
                      <button className="btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: '0.7rem' }} onClick={() => openConfig(agencyName)}>CONFIGURE ALERTS</button>
                    </div>
                    <div className="card-body">
                      {/* Defections */}
                      <div>
                        <div className={`movement-row ${events.defection.length > 0 ? 'exit interactive' : 'zero'}`} onClick={() => events.defection.length > 0 && toggleTray(`def-${index}`)}>
                          <span className="label">Rainmaker Defections</span>
                          <span className="value">{events.defection.length} {events.defection.length > 0 && <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span>}</span>
                        </div>
                        <div className={`tray-container ${openTrays[`def-${index}`] ? 'open' : ''}`}>
                          <div className="tray-content" style={events.defection.length === 0 ? { textAlign: 'center', color: 'var(--text-muted)' } : {}}>
                            {events.defection.length === 0 ? 'No activity in 30 days' : events.defection.map((event, i) => (
                              <div className="tray-row" style={{ display: 'block' }} key={i}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                                  <strong style={{ color: '#FFF', fontSize: '0.95rem' }}>{event.agent_name}</strong>
                                  <span style={{ color: 'var(--accent-red)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>Exited to: {event.new_agency || 'Unknown'}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  <div><span style={{ opacity: 0.5 }}>NPN:</span> {event.agent_npn}</div>
                                  <div><span style={{ opacity: 0.5 }}>Tenure:</span> {event.agent_tenure_years || '?'} Yrs</div>
                                  <div style={{ gridColumn: '1 / -1' }}><span style={{ opacity: 0.5 }}>Top Carriers:</span> {event.top_carriers || 'Unknown'}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Carrier Losses */}
                      <div>
                        <div className={`movement-row ${events.carrier_loss.length > 0 ? 'loss interactive' : 'zero'}`} onClick={() => events.carrier_loss.length > 0 && toggleTray(`loss-${index}`)}>
                          <span className="label">Carrier Losses</span>
                          <span className="value">{events.carrier_loss.length} {events.carrier_loss.length > 0 && <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span>}</span>
                        </div>
                        <div className={`tray-container ${openTrays[`loss-${index}`] ? 'open' : ''}`}>
                          <div className="tray-content" style={events.carrier_loss.length === 0 ? { textAlign: 'center', color: 'var(--text-muted)' } : {}}>
                            {events.carrier_loss.length === 0 ? 'No activity in 30 days' : events.carrier_loss.map((event, i) => (
                              <div className="tray-row" key={i}>
                                <div><strong style={{ color: '#FFF', display: 'block', marginBottom: '2px' }}>{event.carrier_name}</strong><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Lost recently</span></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Agency Terminations */}
                      <div>
                        <div className={`movement-row ${events.agency_termination.length > 0 ? 'loss interactive' : 'zero'}`} onClick={() => events.agency_termination.length > 0 && toggleTray(`term-${index}`)}>
                          <span className="label">Agency Terminations</span>
                          <span className="value">{events.agency_termination.length} {events.agency_termination.length > 0 && <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span>}</span>
                        </div>
                        <div className={`tray-container ${openTrays[`term-${index}`] ? 'open' : ''}`}>
                          <div className="tray-content" style={events.agency_termination.length === 0 ? { textAlign: 'center', color: 'var(--text-muted)' } : {}}>
                            {events.agency_termination.length === 0 ? 'No activity in 30 days' : events.agency_termination.map((event, i) => (
                              <div className="tray-row" style={{ display: 'block' }} key={i}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                                  <strong style={{ color: '#FFF', fontSize: '0.95rem' }}>{event.carrier_name}</strong>
                                  <span style={{ color: 'var(--accent-red)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>Mass Termination Detected</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Hires */}
                      <div>
                        <div className={`movement-row ${events.hire.length > 0 ? 'hire interactive' : 'zero'}`} onClick={() => events.hire.length > 0 && toggleTray(`hire-${index}`)}>
                          <span className="label">Producer Hires</span>
                          <span className="value">{events.hire.length} {events.hire.length > 0 && <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span>}</span>
                        </div>
                        <div className={`tray-container ${openTrays[`hire-${index}`] ? 'open' : ''}`}>
                          <div className="tray-content" style={events.hire.length === 0 ? { textAlign: 'center', color: 'var(--text-muted)' } : {}}>
                            {events.hire.length === 0 ? 'No activity in 30 days' : events.hire.map((event, i) => (
                              <div className="tray-row" style={{ display: 'block' }} key={i}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                                  <strong style={{ color: '#FFF', fontSize: '0.95rem' }}>{event.agent_name}</strong>
                                  <span style={{ color: 'var(--accent-green)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>Hired from: {event.previous_agency || 'Unknown'}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  <div><span style={{ opacity: 0.5 }}>NPN:</span> {event.agent_npn}</div>
                                  <div><span style={{ opacity: 0.5 }}>Tenure:</span> {event.agent_tenure_years || '?'} Yrs</div>
                                  <div style={{ gridColumn: '1 / -1' }}><span style={{ opacity: 0.5 }}>Top Carriers:</span> {event.top_carriers || 'Unknown'}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* New Appts */}
                      <div>
                        <div className={`movement-row ${events.new_appt.length > 0 ? 'appt interactive' : 'zero'}`} onClick={() => events.new_appt.length > 0 && toggleTray(`appt-${index}`)}>
                          <span className="label">New Appointments</span>
                          <span className="value">{events.new_appt.length} {events.new_appt.length > 0 && <span style={{ fontSize: '0.6rem', marginLeft: '8px' }}>▼</span>}</span>
                        </div>
                        <div className={`tray-container ${openTrays[`appt-${index}`] ? 'open' : ''}`}>
                          <div className="tray-content" style={events.new_appt.length === 0 ? { textAlign: 'center', color: 'var(--text-muted)' } : {}}>
                            {events.new_appt.length === 0 ? 'No activity in 30 days' : events.new_appt.map((event, i) => (
                              <div className="tray-row" key={i}>
                                <div><strong style={{ color: '#FFF', display: 'block', marginBottom: '2px' }}>{event.carrier_name}</strong><span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Gained recently</span></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'movements' && (
        <div className="unified-container">
          <section style={{ padding: 0, marginBottom: '4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button 
                  className="section-header btn-ghost" 
                  style={{ border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '10px', background: 'transparent', cursor: 'pointer', marginBottom: 0, justifyContent: 'flex-start', borderBottom: 'none' }} 
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  <span style={{ fontWeight: 'bold' }}>{timeFilter} MARKET WATCH</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>▼</span>
                </button>
                {dropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, background: 'rgba(13, 17, 26, 0.95)', border: '1px solid var(--border-highlight)', borderRadius: '4px', padding: '0.5rem 0', zIndex: 100, minWidth: '250px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', marginTop: '10px' }}>
                    {['30 DAYS', '60 DAYS', '12 MONTHS'].map(t => (
                      <div 
                        key={t}
                        onClick={() => { setTimeFilter(t); setDropdownOpen(false); }}
                        style={{ padding: '0.8rem 1.5rem', cursor: 'pointer', color: timeFilter === t ? '#FFF' : 'var(--text-muted)', fontFamily: 'var(--font-header)', fontSize: '0.9rem', letterSpacing: '1px' }}
                      >
                        {t} MARKET WATCH
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', paddingBottom: '0.2rem' }}>
                <div style={{ color: 'var(--text-muted)' }}>AREA:</div>
                <div style={{ position: 'relative' }}>
                  <select 
                    className="btn-ghost" 
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    style={{ padding: '0.3rem 1.5rem 0.3rem 1rem', borderColor: 'var(--border-subtle)', color: '#FFF', background: 'transparent', cursor: 'pointer', borderRadius: '4px', appearance: 'none', outline: 'none', textAlign: 'left' }}
                  >
                    <option style={{ background: '#0d111a' }} value="All Texas">All Texas</option>
                    <option style={{ background: '#0d111a' }} value="Dallas-Fort Worth">Dallas-Fort Worth</option>
                    <option style={{ background: '#0d111a' }} value="Greater Houston">Greater Houston</option>
                    <option style={{ background: '#0d111a' }} value="Austin / Central Texas">Austin / Central Texas</option>
                    <option style={{ background: '#0d111a' }} value="San Antonio">San Antonio</option>
                    <option style={{ background: '#0d111a' }} value="South Texas">South Texas</option>
                    <option style={{ background: '#0d111a' }} value="West Texas">West Texas</option>
                    <option style={{ background: '#0d111a' }} value="Panhandle">Panhandle</option>
                    <option style={{ background: '#0d111a' }} value="East Texas">East Texas</option>
                    <option style={{ background: '#0d111a' }} value="Other Texas">Other Texas</option>
                  </select>
                  <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: 'var(--text-muted)', pointerEvents: 'none' }}>▼</span>
                </div>
                
                <div style={{ color: 'var(--text-muted)', marginLeft: '10px' }}>ZIP:</div>
                <input 
                  type="text" 
                  className="btn-ghost" 
                  placeholder="All Zips" 
                  value={selectedZip}
                  onChange={(e) => setSelectedZip(e.target.value)}
                  style={{ padding: '0.3rem 1rem', borderColor: 'var(--border-subtle)', color: '#FFF', background: 'transparent', width: '100px', borderRadius: '4px', outline: 'none', textAlign: 'left' }} 
                />
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <div className="loading-dot" style={{ display: 'inline-block', marginRight: '10px', width: '6px', height: '6px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
                SYNCING INTELLIGENCE FEED...
              </div>
            ) : (
              <div className="competitors-grid">
                {marketMovementsData.map((data, index) => {
                  const { agencyName, events, totalProducers } = data;
                  return (
                    <div className="competitor-card" key={`mov-${index}`}>
                      <div className="card-header">
                        <div>
                          <h3>{agencyName}</h3>
                          <div className="tracking-status">Tracking {totalProducers} Producers</div>
                        </div>
                        <button className="btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: '0.7rem' }}>START WATCHING</button>
                      </div>
                      <div className="card-body">
                        <div>
                          <div className={`movement-row ${events.defection.length > 0 ? 'exit' : 'zero'}`}>
                            <span className="label">Rainmaker Defections</span>
                            <span className="value">{events.defection.length}</span>
                          </div>
                        </div>
                        <div>
                          <div className={`movement-row ${events.carrier_loss.length > 0 ? 'loss' : 'zero'}`}>
                            <span className="label">Carrier Losses</span>
                            <span className="value">{events.carrier_loss.length}</span>
                          </div>
                        </div>
                        <div>
                          <div className={`movement-row ${events.agency_termination.length > 0 ? 'loss' : 'zero'}`}>
                            <span className="label">Agency Terminations</span>
                            <span className="value">{events.agency_termination.length}</span>
                          </div>
                        </div>
                        <div>
                          <div className={`movement-row ${events.hire.length > 0 ? 'hire' : 'zero'}`}>
                            <span className="label">Producer Hires</span>
                            <span className="value">{events.hire.length}</span>
                          </div>
                        </div>
                        <div>
                          <div className={`movement-row ${events.new_appt.length > 0 ? 'appt' : 'zero'}`}>
                            <span className="label">New Appointments</span>
                            <span className="value">{events.new_appt.length}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
      </main>

      {/* CONFIG MODAL */}
      <div className={`modal-overlay ${configModalOpen ? 'active' : ''}`} onClick={() => setConfigModalOpen(false)}>
        <div className="modal-content glass-card" style={{ padding: '3rem', maxWidth: '600px', width: '90%', margin: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button className="btn-ghost" style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', padding: '0.3rem 0.8rem', fontSize: '0.75rem' }} onClick={() => setConfigModalOpen(false)}>[X] CLOSE</button>
          <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
            <span style={{ color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '2px' }}>[ ALERT CONFIGURATION ]</span>
            <h2 style={{ fontSize: '2rem', marginBottom: 0 }}>{configTitle}</h2>
          </div>
          <button className="btn-primary-full" onClick={() => setConfigModalOpen(false)}>SAVE ALERTS</button>
        </div>
      </div>
    </div>
  )
}
