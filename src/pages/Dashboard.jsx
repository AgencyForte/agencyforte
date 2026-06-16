import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './dashboard.css'

export default function Dashboard() {
  const location = useLocation()
  const USER_EMAIL = location.state?.email || 'principal@agencyforte.com'

  const [activeTab, setActiveTab] = useState('watchlist')
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [configTitle, setConfigTitle] = useState('')
  const [openTrays, setOpenTrays] = useState({})
  const [timeFilter, setTimeFilter] = useState('30 DAYS')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [expandedEvent, setExpandedEvent] = useState({})
  const [expandedNested, setExpandedNested] = useState({})
  const [expandedContext, setExpandedContext] = useState({})

  const [selectedRegion, setSelectedRegion] = useState(localStorage.getItem('market_region') || 'All Texas')
  const [selectedLOB, setSelectedLOB] = useState(localStorage.getItem('market_lob') || 'All LOBs')
  const [selectedEvent, setSelectedEvent] = useState(localStorage.getItem('market_event') || 'All Events')
  const [selectedCarrier, setSelectedCarrier] = useState(localStorage.getItem('market_carrier') || 'All Carriers')
  const [hideJuniorAttrition, setHideJuniorAttrition] = useState(localStorage.getItem('hide_junior') !== 'false')

  const [searchTerm, setSearchTerm] = useState(localStorage.getItem('watch_search') || '')
  const [whaleFilter, setWhaleFilter] = useState(localStorage.getItem('watch_whale') || 'All Producers')
  const [focusEvent, setFocusEvent] = useState(localStorage.getItem('watch_focus') || 'Show All Events')

  const [watchlistData, setWatchlistData] = useState({})
  const [marketData, setMarketData] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    localStorage.setItem('market_region', selectedRegion)
    localStorage.setItem('market_lob', selectedLOB)
    localStorage.setItem('market_event', selectedEvent)
    localStorage.setItem('market_carrier', selectedCarrier)
    localStorage.setItem('hide_junior', hideJuniorAttrition)
  }, [selectedRegion, selectedLOB, selectedEvent, selectedCarrier, hideJuniorAttrition])

  useEffect(() => {
    localStorage.setItem('watch_search', searchTerm)
    localStorage.setItem('watch_whale', whaleFilter)
    localStorage.setItem('watch_focus', focusEvent)
  }, [searchTerm, whaleFilter, focusEvent])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        // 1. Authenticate / Identify User
        const { data: userData, error: userErr } = await supabase
          .from('users')
          .select('id, home_agency_id, home_agency:agencies!home_agency_id(category, location:locations(msa))')
          .eq('email', USER_EMAIL)
          .single()

        if (userErr || !userData) throw new Error("Mock user not found. Did you run the seed script?")
        const userId = userData.id

        if (!localStorage.getItem('market_region') && userData.home_agency?.location?.msa) {
          setSelectedRegion(userData.home_agency.location.msa)
        }
        if (!localStorage.getItem('market_lob') && userData.home_agency?.category) {
          const cat = userData.home_agency.category
          if (cat === 'COMMERCIAL_ONLY') setSelectedLOB('Commercial')
          else if (cat === 'PERSONAL_ONLY') setSelectedLOB('Personal')
          else if (cat === 'BENEFITS_ONLY') setSelectedLOB('Benefits')
        }

        // 2. Fetch User Watchlists + Agency Context
        const { data: watchlists, error: wlError } = await supabase
          .from('user_watchlists')
          .select(`
            agency_id,
            agency:agencies(
              id,
              agency_name,
              total_producers_count,
              location:locations(msa)
            )
          `)
          .eq('user_id', userId)

        if (wlError) throw wlError

        const watchlistAgencyIds = watchlists.map(w => w.agency_id)

        if (watchlistAgencyIds.length === 0) {
          setWatchlistData({})
          setLoading(false)
          return
        }

        // 3. Fetch Producer Movements affecting these agencies
        const { data: movements, error: movErr } = await supabase
          .from('producer_movements')
          .select(`
            id, movement_date, movement_type, lines_affected,
            from_agency_id, to_agency_id,
            producer:producers(npn, first_name, last_name, original_license_date, active_appointments_count),
            from_agency:agencies!from_agency_id(agency_name),
            to_agency:agencies!to_agency_id(agency_name)
          `)
          .or(`from_agency_id.in.(${watchlistAgencyIds.join(',')}),to_agency_id.in.(${watchlistAgencyIds.join(',')})`)
          .order('movement_date', { ascending: false })

        // 4. Fetch Carrier Events for these agencies
        const { data: events, error: evErr } = await supabase
          .from('carrier_events')
          .select(`
            id, event_date, event_type, producers_affected_count, notes,
            agency_id,
            carrier:carriers(carrier_name)
          `)
          .in('agency_id', watchlistAgencyIds)
          .order('event_date', { ascending: false })

        // 5. Aggregate Watchlist Data with Threat Context
        const { data: threatData } = await supabase
          .from('dynamic_competitor_discovery')
          .select('competitor_agency_id, shared_carrier_names')
          .eq('base_agency_id', userData.home_agency_id)
          .in('competitor_agency_id', watchlistAgencyIds)

        const groupedData = {}
        watchlists.forEach(wl => {
          const aId = wl.agency.id
          const aName = wl.agency.agency_name
          const threat = threatData?.find(t => t.competitor_agency_id === aId)

          groupedData[aName] = {
            id: aId,
            total_producers_count: wl.agency.total_producers_count,
            msa: wl.agency.location?.msa,
            threat_context: threat?.shared_carrier_names || [],
            defection: [],
            hire: [],
            carrier_loss: [],
            agency_termination: [],
            new_appt: []
          }
        })

        // Distribute Movements (One movement is an exit for 'from' and a hire for 'to')
        movements?.forEach(m => {
          // If the watchlist agency lost the producer
          if (m.from_agency_id && watchlists.some(w => w.agency_id === m.from_agency_id)) {
            const aName = m.from_agency.agency_name
            groupedData[aName].defection.push(m)
          }
          // If the watchlist agency gained the producer
          if (m.to_agency_id && watchlists.some(w => w.agency_id === m.to_agency_id)) {
            const aName = m.to_agency.agency_name
            groupedData[aName].hire.push(m)
          }
        })

        // Distribute Carrier Events
        events?.forEach(e => {
          const aId = e.agency_id
          const aName = watchlists.find(w => w.agency_id === aId)?.agency.agency_name
          if (aName) {
            if (e.event_type === 'APPOINTMENT_LOST') {
              groupedData[aName].carrier_loss.push(e)
            } else if (e.event_type === 'MASS_TERMINATION') {
              groupedData[aName].agency_termination.push(e)
            } else if (e.event_type === 'APPOINTMENT_GAINED') {
              groupedData[aName].new_appt.push(e)
            }
          }
        })

        setWatchlistData(groupedData)

        // 6. Fetch Global Market Movements (For 'Market Movements' Tab)
        const { data: globalAgencies } = await supabase.from('agencies').select('id, agency_name, total_producers_count, location:locations(msa)').limit(20)

        const globalAgencyIds = globalAgencies?.map(a => a.id) || []

        const { data: globalMovements } = await supabase
          .from('producer_movements')
          .select(`
            id, movement_date, movement_type, lines_affected,
            from_agency_id, to_agency_id,
            producer:producers(npn, first_name, last_name, original_license_date, active_appointments_count),
            from_agency:agencies!from_agency_id(agency_name),
            to_agency:agencies!to_agency_id(agency_name)
          `)
          .or(`from_agency_id.in.(${globalAgencyIds.join(',')}),to_agency_id.in.(${globalAgencyIds.join(',')})`)
          .order('movement_date', { ascending: false })

        const { data: globalEvents } = await supabase
          .from('carrier_events')
          .select(`
            id, event_date, event_type, producers_affected_count, notes,
            agency_id,
            carrier:carriers(carrier_name)
          `)
          .in('agency_id', globalAgencyIds)
          .order('event_date', { ascending: false })

        const globalGrouped = {}
        globalAgencies?.forEach(ag => {
          globalGrouped[ag.agency_name] = {
            id: ag.id,
            total_producers_count: ag.total_producers_count,
            msa: ag.location?.msa,
            defection: [], hire: [], carrier_loss: [], agency_termination: [], new_appt: []
          }
        })

        globalMovements?.forEach(m => {
          if (m.from_agency_id && globalAgencies.some(a => a.id === m.from_agency_id)) {
            const aName = m.from_agency?.agency_name
            if (aName && globalGrouped[aName]) globalGrouped[aName].defection.push(m)
          }
          if (m.to_agency_id && globalAgencies.some(a => a.id === m.to_agency_id)) {
            const aName = m.to_agency?.agency_name
            if (aName && globalGrouped[aName]) globalGrouped[aName].hire.push(m)
          }
        })

        globalEvents?.forEach(e => {
          const aName = globalAgencies.find(a => a.id === e.agency_id)?.agency_name
          if (aName && globalGrouped[aName]) {
            if (e.event_type === 'APPOINTMENT_LOST') globalGrouped[aName].carrier_loss.push(e)
            else if (e.event_type === 'MASS_TERMINATION') globalGrouped[aName].agency_termination.push(e)
            else if (e.event_type === 'APPOINTMENT_GAINED') globalGrouped[aName].new_appt.push(e)
          }
        })

        setMarketData(globalGrouped)

      } catch (err) {
        console.error("Dashboard Fetch Error:", err)
      }
      setLoading(false)
    }

    fetchData()
  }, [])

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

  const formatTenure = (licDate) => {
    if (!licDate) return '?'
    const years = ((new Date() - new Date(licDate)) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1)
    return `${years} Yrs`
  }

  const getTenureYears = (licDate) => {
    if (!licDate) return 0;
    return ((new Date() - new Date(licDate)) / (1000 * 60 * 60 * 24 * 365.25));
  }

  // Choose the dataset based on active tab
  const macroTrends = useMemo(() => {
    if (Object.keys(marketData).length === 0) return null;

    let agenciesArr = Object.entries(marketData).map(([name, data]) => ({ name, ...data }));

    if (selectedRegion !== 'All Texas') {
      agenciesArr = agenciesArr.filter(a => a.msa === selectedRegion);
    }

    // Process agenciesArr for Hide Junior Attrition (Stress Test)
    let processedAgencies = agenciesArr.map(ag => {
      let hire = ag.hire;
      let defection = ag.defection;

      if (hideJuniorAttrition) {
        hire = hire.filter(e => getTenureYears(e.producer?.original_lic_date) >= 3);
        defection = defection.filter(e => getTenureYears(e.producer?.original_lic_date) >= 3);
      }

      return { ...ag, hire, defection };
    });

    // Top Expanders (Actionable Hires)
    const topExpanders = [...processedAgencies].sort((a, b) => b.hire.length - a.hire.length).slice(0, 10).filter(a => a.hire.length > 0);

    // Mass Exodus (Actionable Exits)
    const topUnstable = [...processedAgencies].sort((a, b) => b.defection.length - a.defection.length).slice(0, 10).filter(a => a.defection.length > 0);

    // Whale Migrations (Always >= 5 years, regardless of toggle)
    let whaleAgencies = agenciesArr.map(ag => {
      let defection = ag.defection.filter(e => getTenureYears(e.producer?.original_lic_date) >= 5);
      return { ...ag, defection };
    });
    const topWhales = [...whaleAgencies].sort((a, b) => b.defection.length - a.defection.length).slice(0, 10).filter(a => a.defection.length > 0);

    // Carrier Pullouts
    const carrierLossCounts = {};
    agenciesArr.forEach(ag => {
      const losses = [...ag.carrier_loss, ...ag.agency_termination];
      losses.forEach(e => {
        const cName = e.carrier?.carrier_name || 'Unknown Carrier';
        carrierLossCounts[cName] = (carrierLossCounts[cName] || 0) + 1;
      });
    });
    const topCarriers = Object.entries(carrierLossCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);

    // Carrier Appointments
    const carrierApptCounts = {};
    agenciesArr.forEach(ag => {
      ag.new_appt.forEach(e => {
        const cName = e.carrier?.carrier_name || 'Unknown Carrier';
        carrierApptCounts[cName] = (carrierApptCounts[cName] || 0) + 1;
      });
    });
    const topApptCarriers = Object.entries(carrierApptCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);

    return { topExpanders, topUnstable, topWhales, topCarriers, topApptCarriers };
  }, [marketData, selectedRegion, hideJuniorAttrition]);

  const baseData = activeTab === 'watchlist' ? watchlistData : marketData
  let renderData = {}

  if (activeTab === 'movements') {
    Object.entries(marketData).forEach(([agencyName, data]) => {
      const agencyData = {
        ...data,
        defection: [...data.defection],
        hire: [...data.hire],
        carrier_loss: [...data.carrier_loss],
        agency_termination: [...data.agency_termination],
        new_appt: [...data.new_appt]
      }

      // Region Filter
      if (selectedRegion !== 'All Texas' && agencyData.msa !== selectedRegion) return

      // Junior Filter
      if (hideJuniorAttrition) {
        const twoYearsAgo = new Date()
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
        agencyData.defection = agencyData.defection.filter(m => m.producer?.original_license_date && new Date(m.producer.original_license_date) <= twoYearsAgo)
        agencyData.hire = agencyData.hire.filter(m => m.producer?.original_license_date && new Date(m.producer.original_license_date) <= twoYearsAgo)
      }

      // LOB Filter
      if (selectedLOB !== 'All LOBs') {
        agencyData.defection = agencyData.defection.filter(m => m.lines_affected?.includes(selectedLOB))
        agencyData.hire = agencyData.hire.filter(m => m.lines_affected?.includes(selectedLOB))
      }

      // Carrier Filter
      if (selectedCarrier !== 'All Carriers') {
        agencyData.defection = []
        agencyData.hire = []
        agencyData.carrier_loss = agencyData.carrier_loss.filter(e => e.carrier?.carrier_name?.toUpperCase() === selectedCarrier.toUpperCase())
        agencyData.agency_termination = agencyData.agency_termination.filter(e => e.carrier?.carrier_name?.toUpperCase() === selectedCarrier.toUpperCase())
        agencyData.new_appt = agencyData.new_appt.filter(e => e.carrier?.carrier_name?.toUpperCase() === selectedCarrier.toUpperCase())
      }

      // Event Filter
      if (selectedEvent === 'Mass Terminations Only') {
        agencyData.defection = []
        agencyData.hire = []
        agencyData.carrier_loss = []
        agencyData.new_appt = []
      } else if (selectedEvent === 'Rainmaker Defections Only') {
        agencyData.hire = []
        agencyData.carrier_loss = []
        agencyData.agency_termination = []
        agencyData.new_appt = []
      }

      if (agencyData.defection.length || agencyData.hire.length || agencyData.carrier_loss.length || agencyData.agency_termination.length || agencyData.new_appt.length) {
        renderData[agencyName] = agencyData
      }
    })
  } else if (activeTab === 'watchlist') {
    Object.entries(baseData).forEach(([agencyName, data]) => {
      const agencyData = {
        ...data,
        defection: [...data.defection],
        hire: [...data.hire],
        carrier_loss: [...data.carrier_loss],
        agency_termination: [...data.agency_termination],
        new_appt: [...data.new_appt]
      }

      // 1. Whale Filter
      if (whaleFilter === 'Veterans (5+ Yrs)') {
        const fiveYearsAgo = new Date()
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)
        agencyData.defection = agencyData.defection.filter(m => m.producer?.original_license_date && new Date(m.producer.original_license_date) <= fiveYearsAgo)
        agencyData.hire = agencyData.hire.filter(m => m.producer?.original_license_date && new Date(m.producer.original_license_date) <= fiveYearsAgo)
      } else if (whaleFilter === 'Heavyweights (10+ Appts)') {
        agencyData.defection = agencyData.defection.filter(m => m.producer?.active_appointments_count >= 10)
        agencyData.hire = agencyData.hire.filter(m => m.producer?.active_appointments_count >= 10)
      }

      // 2. Search Term Filter
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase()
        agencyData.defection = agencyData.defection.filter(m => `${m.producer?.first_name} ${m.producer?.last_name}`.toLowerCase().includes(term) || m.producer?.npn?.includes(term))
        agencyData.hire = agencyData.hire.filter(m => `${m.producer?.first_name} ${m.producer?.last_name}`.toLowerCase().includes(term) || m.producer?.npn?.includes(term))

        agencyData.carrier_loss = agencyData.carrier_loss.filter(e => e.carrier?.carrier_name?.toLowerCase().includes(term))
        agencyData.agency_termination = agencyData.agency_termination.filter(e => e.carrier?.carrier_name?.toLowerCase().includes(term))
        agencyData.new_appt = agencyData.new_appt.filter(e => e.carrier?.carrier_name?.toLowerCase().includes(term))
      }

      // 3. Focus Event Filter
      if (focusEvent === 'Defections Only') {
        agencyData.hire = []
        agencyData.carrier_loss = []
        agencyData.agency_termination = []
        agencyData.new_appt = []
      } else if (focusEvent === 'Carrier Losses Only') {
        agencyData.defection = []
        agencyData.hire = []
        agencyData.agency_termination = []
        agencyData.new_appt = []
      }

      renderData[agencyName] = agencyData
    })
  } else {
    renderData = baseData
  }

  return (
    <div className="dashboard-layout">
      {/* LEFT SIDEBAR - CARD NAV */}
      <aside className="sidebar">
        <div className="nav-group">
          <nav className="sidebar-nav">
            <div
              className={`nav-item ${activeTab === 'watchlist' ? 'active' : ''}`}
              onClick={() => setActiveTab('watchlist')}
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
              </span>
              <span className="nav-text">Competitor Watchlist</span>
            </div>

            <div
              className={`nav-item ${activeTab === 'movements' ? 'active' : ''}`}
              onClick={() => setActiveTab('movements')}
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              </span>
              <span className="nav-text">Macro Trends</span>
            </div>
          </nav>
        </div>

        <div className="nav-group" style={{ marginTop: 'auto' }}>
          <nav className="sidebar-nav">
            <div className="nav-item">
              <span className="nav-icon">
                <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
              </span>
              <span className="nav-text">Data Feed</span>
            </div>

            <div className="nav-item">
              <span className="nav-icon">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </span>
              <span className="nav-text">Settings</span>
            </div>
          </nav>
        </div>
      </aside>
      <main className="main-content" style={{ paddingTop: '2rem' }}>
        <div className="unified-container">
          <section style={{ padding: 0, marginBottom: '4rem' }}>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', width: '100%', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              {activeTab === 'movements' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontFamily: 'var(--font-heading)', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)', letterSpacing: '1px', fontSize: '0.85rem' }}>TRACKING</span>

                  <div style={{ position: 'relative' }}>
                    <select
                      value={selectedEvent}
                      onChange={e => setSelectedEvent(e.target.value)}
                      style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent-blue)', color: '#FFF', outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '15px', fontWeight: 'bold', fontSize: '1rem', fontFamily: 'var(--font-heading)' }}
                    >
                      <option style={{ background: 'var(--bg-base)' }} value="All Events">ALL EVENTS</option>
                      <option style={{ background: 'var(--bg-base)' }} value="Producer Hires">PRODUCER HIRES</option>
                      <option style={{ background: 'var(--bg-base)' }} value="Producer Exits">PRODUCER EXITS</option>
                      <option style={{ background: 'var(--bg-base)' }} value="Whale Migrations">WHALE MIGRATIONS</option>
                      <option style={{ background: 'var(--bg-base)' }} value="Carrier Terminations">CARRIER TERMINATIONS</option>
                      <option style={{ background: 'var(--bg-base)' }} value="Carrier Appointments">CARRIER APPOINTMENTS</option>
                    </select>
                    <span style={{ fontSize: '0.6rem', color: 'var(--accent-blue)', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</span>
                  </div>

                  <span style={{ color: 'var(--text-muted)', letterSpacing: '1px', fontSize: '0.85rem', marginLeft: '10px' }}>IN</span>

                  <div style={{ position: 'relative' }}>
                    <select
                      value={selectedRegion}
                      onChange={e => setSelectedRegion(e.target.value)}
                      style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent-green)', color: '#FFF', outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '15px', fontWeight: 'bold', fontSize: '1rem', fontFamily: 'var(--font-heading)' }}
                    >
                      <option style={{ background: 'var(--bg-base)' }} value="All Texas">ALL TEXAS</option>
                      <option style={{ background: 'var(--bg-base)' }} value="Houston">HOUSTON</option>
                      <option style={{ background: 'var(--bg-base)' }} value="Dallas-Fort Worth">DALLAS-FORT WORTH</option>
                      <option style={{ background: 'var(--bg-base)' }} value="Austin">AUSTIN</option>
                      <option style={{ background: 'var(--bg-base)' }} value="San Antonio">SAN ANTONIO</option>
                    </select>
                    <span style={{ fontSize: '0.6rem', color: 'var(--accent-green)', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</span>
                  </div>

                  <span style={{ color: 'var(--text-muted)', letterSpacing: '1px', fontSize: '0.85rem', marginLeft: '10px' }}>OVER THE LAST</span>

                  <div style={{ position: 'relative' }}>
                    <select
                      value={timeFilter}
                      onChange={e => setTimeFilter(e.target.value)}
                      style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--text-main)', color: '#FFF', outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '15px', fontWeight: 'bold', fontSize: '1rem', fontFamily: 'var(--font-heading)' }}
                    >
                      <option style={{ background: 'var(--bg-base)' }} value="30 DAYS">30 DAYS</option>
                      <option style={{ background: 'var(--bg-base)' }} value="60 DAYS">60 DAYS</option>
                      <option style={{ background: 'var(--bg-base)' }} value="12 MONTHS">12 MONTHS</option>
                    </select>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-main)', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</span>
                  </div>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
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
              )}


              {activeTab === 'watchlist' && (
                <div className="filter-bar" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: '8px', fontSize: '0.75rem', textTransform: 'uppercase' }}>Search</span>
                    <input
                      type="text"
                      placeholder="Producer or NPN..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: '#FFF', outline: 'none', width: '130px', fontWeight: 'bold' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: '8px', fontSize: '0.75rem', textTransform: 'uppercase' }}>Producer</span>
                    <select value={whaleFilter} onChange={e => setWhaleFilter(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#FFF', outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '15px', fontWeight: 'bold' }}>
                      <option style={{ background: 'var(--bg-surface)' }} value="All Producers">All Producers</option>
                      <option style={{ background: 'var(--bg-surface)' }} value="Veterans (5+ Yrs)">Veterans (5+ Yrs)</option>
                      <option style={{ background: 'var(--bg-surface)' }} value="Heavyweights (10+ Appts)">Heavyweights (10+ Appts)</option>
                    </select>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>▼</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: '8px', fontSize: '0.75rem', textTransform: 'uppercase' }}>Focus</span>
                    <select value={focusEvent} onChange={e => setFocusEvent(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#FFF', outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '15px', fontWeight: 'bold' }}>
                      <option style={{ background: 'var(--bg-surface)' }} value="Show All Events">Show All Events</option>
                      <option style={{ background: 'var(--bg-surface)' }} value="Defections Only">Defections Only</option>
                      <option style={{ background: 'var(--bg-surface)' }} value="Carrier Losses Only">Carrier Losses Only</option>
                    </select>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>▼</span>
                  </div>
                </div>
              )}
            </div>

            {activeTab === 'movements' && macroTrends && (
              <div className="macro-trends-container" style={{ display: 'grid', gridTemplateColumns: selectedEvent === 'All Events' ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr', gap: '1.5rem', marginBottom: '2rem', marginTop: '1.5rem' }}>

                {(selectedEvent === 'All Events' || selectedEvent === 'Producer Hires') && (
                  <div className="macro-column glass-card" style={{ padding: '1.5rem', borderTop: '2px solid #2ed573' }}>
                    <div style={{ marginBottom: '1rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '1px' }}>APEX PREDATORS</span>
                      <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1rem' }}>Top Expanding Agencies</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      {macroTrends.topExpanders.slice(0, selectedEvent === 'All Events' ? 3 : 10).map((ag, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
                          <span style={{ fontSize: '0.8rem', color: '#FFF' }}>{i + 1}. {ag.name} {selectedEvent !== 'All Events' && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '10px' }}>{ag.msa}</span>}</span>
                          <span style={{ fontSize: '0.8rem', color: '#2ed573', fontFamily: 'var(--font-mono)' }}>+{ag.hire.length} Hires</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedEvent === 'All Events' || selectedEvent === 'Producer Exits') && (
                  <div className="macro-column glass-card" style={{ padding: '1.5rem', borderTop: '2px solid #ff6b81' }}>
                    <div style={{ marginBottom: '1rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '1px' }}>AGENCY EXODUS</span>
                      <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1rem' }}>Most Unstable Agencies</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      {macroTrends.topUnstable.slice(0, selectedEvent === 'All Events' ? 3 : 10).map((ag, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
                          <span style={{ fontSize: '0.8rem', color: '#FFF' }}>{i + 1}. {ag.name} {selectedEvent !== 'All Events' && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '10px' }}>{ag.msa}</span>}</span>
                          <span style={{ fontSize: '0.8rem', color: '#ff6b81', fontFamily: 'var(--font-mono)' }}>-{ag.defection.length} Exits</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedEvent === 'All Events' || selectedEvent === 'Whale Migrations') && (
                  <div className="macro-column glass-card" style={{ padding: '1.5rem', borderTop: '2px solid #a29bfe' }}>
                    <div style={{ marginBottom: '1rem' }}>
                      <span style={{ color: '#a29bfe', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '1px' }}>WHALE MIGRATIONS</span>
                      <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1rem' }}>Veteran Defections</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      {macroTrends.topWhales.slice(0, selectedEvent === 'All Events' ? 3 : 10).map((ag, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
                          <span style={{ fontSize: '0.8rem', color: '#FFF' }}>{i + 1}. {ag.name} {selectedEvent !== 'All Events' && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '10px' }}>{ag.msa}</span>}</span>
                          <span style={{ fontSize: '0.8rem', color: '#a29bfe', fontFamily: 'var(--font-mono)' }}>-{ag.defection.length} Veterans</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedEvent === 'All Events' || selectedEvent === 'Carrier Terminations') && (
                  <div className="macro-column glass-card" style={{ padding: '1.5rem', borderTop: '2px solid #ffa502' }}>
                    <div style={{ marginBottom: '1rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '1px' }}>CARRIER PULLOUTS</span>
                      <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1rem' }}>Carrier Contagion</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      {macroTrends.topCarriers.slice(0, selectedEvent === 'All Events' ? 3 : 10).map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
                          <span style={{ fontSize: '0.8rem', color: '#FFF' }}>{i + 1}. {c.name}</span>
                          <span style={{ fontSize: '0.8rem', color: '#ffa502', fontFamily: 'var(--font-mono)' }}>{c.count} Drops</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedEvent === 'All Events' || selectedEvent === 'Carrier Appointments') && (
                  <div className="macro-column glass-card" style={{ padding: '1.5rem', borderTop: '2px solid #0abde3' }}>
                    <div style={{ marginBottom: '1rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '1px' }}>NEW ALLIANCES</span>
                      <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1rem' }}>Carrier Expansion</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      {macroTrends.topApptCarriers.slice(0, selectedEvent === 'All Events' ? 3 : 10).map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
                          <span style={{ fontSize: '0.8rem', color: '#FFF' }}>{i + 1}. {c.name}</span>
                          <span style={{ fontSize: '0.8rem', color: '#0abde3', fontFamily: 'var(--font-mono)' }}>+{c.count} Appts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <div className="loading-dot" style={{ display: 'inline-block', marginRight: '10px', width: '6px', height: '6px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
                SYNCING INTELLIGENCE FEED...
              </div>
            ) : (
              activeTab === 'watchlist' && (
                <div className="competitors-grid" style={{ display: 'flex', flexDirection: 'column' }}>
                  {Object.entries(renderData).length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No agencies match the current filters.</div>
                  ) : Object.entries(renderData)
                    .sort((a, b) => {
                      const totalA = a[1].hire.length + a[1].defection.length + a[1].carrier_loss.length + a[1].agency_termination.length + a[1].new_appt.length;
                      const totalB = b[1].hire.length + b[1].defection.length + b[1].carrier_loss.length + b[1].agency_termination.length + b[1].new_appt.length;
                      return totalB - totalA;
                    })
                    .map(([agencyName, data], index) => {
                      const { total_producers_count, defection, hire, carrier_loss, agency_termination, new_appt } = data;

                      // Aggregate feed
                      let feed = [
                        ...defection.map(m => ({
                          type: 'exit', badge: 'DEFECTION', date: m.movement_date, subject: `${m.producer?.first_name} ${m.producer?.last_name}`, role: `${m.producer?.original_license_date && (new Date() - new Date(m.producer.original_license_date)) / 31536000000 >= 5 ? 'Senior' : 'Junior'} Producer`,
                          details: activeTab === 'watchlist'
                            ? {
                              NPN: m.producer?.npn || `${Math.floor(10000000 + Math.random() * 90000000)}`,
                              'Total Tenure': formatTenure(m.producer?.original_license_date),
                              'Agency Tenure': `${(Math.random() * 8 + 1).toFixed(1)} Yrs`,
                              'Product Lines': m.lines_affected?.join(', ') || 'P&C, Life',
                              'Carrier Appts': 'Progressive, Safeco'
                            }
                            : { Tenure: formatTenure(m.producer?.original_license_date), 'Region': data.msa || 'Unknown', 'Product Lines': 'P&C, Life', 'Dest.': 'Unknown' }
                        })),
                        ...hire.map(m => ({
                          type: 'hire', badge: 'ACQUISITION', date: m.movement_date, subject: `${m.producer?.first_name} ${m.producer?.last_name}`, role: `${m.producer?.original_license_date && (new Date() - new Date(m.producer.original_license_date)) / 31536000000 >= 5 ? 'Senior' : 'Junior'} Producer`,
                          details: activeTab === 'watchlist'
                            ? {
                              NPN: m.producer?.npn || `${Math.floor(10000000 + Math.random() * 90000000)}`,
                              'Total Tenure': formatTenure(m.producer?.original_license_date),
                              'Prev. Agency Tenure': `${(Math.random() * 8 + 1).toFixed(1)} Yrs`,
                              'Product Lines': m.lines_affected?.join(', ') || 'P&C',
                              'Carrier Appts': 'State Farm'
                            }
                            : { Tenure: formatTenure(m.producer?.original_license_date), 'Region': data.msa || 'Unknown', 'Product Lines': 'P&C', 'Prev.': 'State Farm' }
                        })),
                        ...[...carrier_loss, ...agency_termination].map(e => {
                          const count = Math.floor(Math.random() * 8) + 2;
                          const mockProducers = Array.from({ length: count }).map((_, i) => ({ name: `Producer ${i + 1}`, npn: `${Math.floor(10000000 + Math.random() * 90000000)}` }))

                          return {
                            type: 'loss', badge: 'TERMINATION', date: e.event_date, subject: e.carrier?.carrier_name,
                            details: activeTab === 'watchlist'
                              ? {
                                'Carrier Lines': 'Commercial Auto, Property',
                                'Producers Orphaned': { type: 'nested_list', label: `${count} Producers`, items: mockProducers },
                                'Agency Impact': '1 of 4 Commercial Markets Lost'
                              }
                              : {
                                'Carrier Lines': 'Commercial Auto, Property',
                                'Producers Orphaned': { type: 'nested_list', label: `${count} Producers`, items: mockProducers },
                                'Agency Impact': '1 of 4 Commercial Markets Lost'
                              }
                          }
                        }),
                        ...new_appt.map(e => {
                          const count = Math.floor(Math.random() * 8) + 2;
                          const mockProducers = Array.from({ length: count }).map((_, i) => ({ name: `Producer ${i + 1}`, npn: `${Math.floor(10000000 + Math.random() * 90000000)}` }))

                          return {
                            type: 'appt', badge: 'NEW MARKET', date: e.event_date, subject: e.carrier?.carrier_name,
                            details: activeTab === 'watchlist'
                              ? {
                                'Carrier Lines': 'Commercial Property',
                                'Producers Appointed': { type: 'nested_list', label: `${count} Producers`, items: mockProducers },
                                'Agency Impact': 'New Commercial Market Gained'
                              }
                              : {
                                'Carrier Lines': 'Commercial Property',
                                'Producers Appointed': { type: 'nested_list', label: `${count} Producers`, items: mockProducers },
                                'Agency Impact': 'New Commercial Market Gained'
                              }
                          }
                        })
                      ].sort((a, b) => new Date(b.date) - new Date(a.date));

                      let statHires = hire.length;
                      let statExits = defection.length;
                      let statNewAppts = new_appt.length;
                      let statLostAppts = carrier_loss.length + agency_termination.length;

                      // DEMO FALLBACK (Forced for UI Review)
                      statHires += 1;
                      statExits += 1;
                      statNewAppts += 1;
                      statLostAppts += 1;

                      feed.push(
                        {
                          type: 'exit', badge: 'DEFECTION', date: new Date(Date.now() - 2 * 86400000).toISOString(), subject: `Michael Sterling`, role: `Senior Producer`,
                          details: activeTab === 'watchlist' ? { NPN: `${Math.floor(10000000 + Math.random() * 90000000)}`, 'Total Tenure': '12.5 Yrs', 'Agency Tenure': '4.2 Yrs', 'Product Lines': 'Commercial P&C', 'Carrier Appts': 'Progressive, Safeco' } : { Tenure: '12.5 Yrs', 'Region': data.msa || 'Unknown', 'Product Lines': 'P&C, Life', 'Dest.': 'Unknown' }
                        },
                        {
                          type: 'loss', badge: 'TERMINATION', date: new Date(Date.now() - 5 * 86400000).toISOString(), subject: `Safeco Insurance`,
                          details: activeTab === 'watchlist' ? { 'Carrier Lines': 'Personal Auto, Home', 'Producers Orphaned': { type: 'nested_list', label: `4 Producers`, items: Array.from({ length: 4 }).map((_, i) => ({ name: `Producer ${i + 1}`, npn: `${Math.floor(10000000 + Math.random() * 90000000)}` })) }, 'Agency Impact': 'Loss of preferred tier status' } : { 'Carrier Lines': 'Personal Auto, Home', 'Producers Orphaned': { type: 'nested_list', label: `4 Producers`, items: Array.from({ length: 4 }).map((_, i) => ({ name: `Producer ${i + 1}`, npn: `${Math.floor(10000000 + Math.random() * 90000000)}` })) }, 'Agency Impact': 'Loss of preferred tier status' }
                        },
                        {
                          type: 'hire', badge: 'ACQUISITION', date: new Date(Date.now() - 12 * 86400000).toISOString(), subject: `Sarah Jenkins`, role: `Junior Producer`,
                          details: activeTab === 'watchlist' ? { NPN: `${Math.floor(10000000 + Math.random() * 90000000)}`, 'Total Tenure': '8.0 Yrs', 'Prev. Agency Tenure': '3.1 Yrs', 'Product Lines': 'Commercial Auto, Workers Comp', 'Carrier Appts': 'Travelers, Hartford' } : { Tenure: '8.0 Yrs', 'Region': data.msa || 'Unknown', 'Product Lines': 'Commercial Auto, Workers Comp', 'Prev.': 'State Farm' }
                        },
                        {
                          type: 'appt', badge: 'NEW MARKET', date: new Date(Date.now() - 18 * 86400000).toISOString(), subject: `Travelers Property Casualty`,
                          details: activeTab === 'watchlist' ? { 'Carrier Lines': 'Commercial Property, BOP', 'Producers Appointed': { type: 'nested_list', label: `2 Producers`, items: Array.from({ length: 2 }).map((_, i) => ({ name: `Producer ${i + 1}`, npn: `${Math.floor(10000000 + Math.random() * 90000000)}` })) }, 'Agency Impact': 'New Commercial Market Gained' } : { 'Carrier Lines': 'Commercial Property, BOP', 'Producers Appointed': { type: 'nested_list', label: `2 Producers`, items: Array.from({ length: 2 }).map((_, i) => ({ name: `Producer ${i + 1}`, npn: `${Math.floor(10000000 + Math.random() * 90000000)}` })) }, 'Agency Impact': 'New Commercial Market Gained' }
                        }
                      );
                      
                      // Sort again just in case real events were older than the mocks
                      feed.sort((a, b) => new Date(b.date) - new Date(a.date));

                      return (
                        <div className="intelligence-card" key={`watch-${index}`}>
                          
                          {/* 1. Header (Top-Span) */}
                          <div className="card-top-bar">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#FFF' }}>{agencyName}</h3>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                HQ: {data.msa ? data.msa.split('-')[0].split(',')[0] : 'Texas'}, TX &nbsp;•&nbsp; Producers: {total_producers_count || '?'}
                              </span>
                            </div>
                            <div>
                              {activeTab === 'watchlist' ? (
                                <button className="btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: '0.7rem' }} onClick={() => openConfig(agencyName)}>CONFIG</button>
                              ) : (
                                <button className="btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: '0.7rem', color: 'var(--accent-steel)', borderColor: 'var(--accent-steel)' }}>+ WATCHLIST</button>
                              )}
                            </div>
                          </div>

                          {/* 2. Operations (Split Middle) */}
                          <div className="card-middle-split">
                            <div className="strip-analytics">
                              <div className="stat-row">
                                <span className="stat-label">Hires</span>
                                <span className="stat-value" style={{ color: statHires > 0 ? 'var(--text-muted)' : 'inherit' }}>{statHires}</span>
                              </div>
                              <div className="stat-row">
                                <span className="stat-label">Exits</span>
                                <span className="stat-value" style={{ color: statExits > 0 ? '#D97706' : 'inherit' }}>{statExits}</span>
                              </div>
                              <div className="stat-row">
                                <span className="stat-label">New Appts</span>
                                <span className="stat-value" style={{ color: statNewAppts > 0 ? 'var(--text-muted)' : 'inherit' }}>{statNewAppts}</span>
                              </div>
                              <div className="stat-row">
                                <span className="stat-label">Lost Appts</span>
                                <span className="stat-value" style={{ color: statLostAppts > 0 ? 'var(--accent-red)' : 'inherit' }}>{statLostAppts}</span>
                              </div>
                            </div>

                            <div className="strip-content" style={{ paddingLeft: '1.5rem', flex: 1 }}>
                              <div className="intelligence-strip-ticker" style={{ padding: 0 }}>
                                {feed.length === 0 ? (
                                  <span style={{ color: 'var(--text-muted)' }}>No recent activity detected in the last 30 days.</span>
                                ) : (
                                  feed.map((item, idx) => (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                      <div
                                        className={`ticker-event ${expandedEvent[agencyName] === idx ? 'active' : ''}`}
                                        onClick={() => setExpandedEvent(prev => ({ ...prev, [agencyName]: prev[agencyName] === idx ? null : idx }))}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                          <span className={`badge badge-${item.type}`}>{item.badge.toUpperCase()}</span>
                                          <span className="ticker-subject">{item.subject}</span>
                                        </div>
                                        {item.role && (
                                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.5px' }}>
                                            {item.role.toUpperCase()}
                                          </span>
                                        )}
                                      </div>
                                      {expandedEvent[agencyName] === idx && (
                                        <div className="ticker-inline-drawer">
                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>EVENT DETAILS</span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                          </div>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            {Object.entries(item.details).map(([key, val]) => {
                                              if (val && val.type === 'nested_list') {
                                                const nestedKey = `${agencyName}-${idx}-${key}`
                                                return (
                                                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.4rem', marginTop: '0.2rem' }}>
                                                    <div
                                                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                                      onClick={() => setExpandedNested(prev => ({ ...prev, [nestedKey]: !prev[nestedKey] }))}
                                                    >
                                                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)' }}>{key} <span style={{ fontSize: '0.55rem' }}>{expandedNested[nestedKey] ? '▲' : '▼'}</span></span>
                                                      <span style={{ fontSize: '0.75rem', color: '#FFF', fontWeight: 500 }}>{val.label}</span>
                                                    </div>
                                                    {expandedNested[nestedKey] && (
                                                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px', maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                        {val.items.map((prod, i) => (
                                                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                                                            <span style={{ color: '#FFF' }}>{prod.name}</span>
                                                            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{prod.npn}</span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                )
                                              }
                                              return (
                                                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{key}</span>
                                                  <span style={{ fontSize: '0.75rem', color: '#FFF', fontWeight: 500 }}>{val}</span>
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 3. Footnote (Bottom-Span) */}
                          {data.threat_context?.length > 0 && (
                            <div style={{ borderTop: '1px solid rgba(255, 42, 85, 0.2)', display: 'flex', flexDirection: 'column' }}>
                              <div 
                                style={{ 
                                  padding: '0.6rem 1.5rem', 
                                  cursor: 'pointer', 
                                  background: expandedContext[agencyName] ? 'rgba(255, 42, 85, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                                  display: 'flex',
                                  justifyContent: 'flex-start',
                                  gap: '2rem',
                                  alignItems: 'center',
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '0.7rem',
                                  color: 'var(--text-muted)',
                                  transition: 'background 0.2s'
                                }}
                                onClick={() => setExpandedContext(prev => ({ ...prev, [agencyName]: !prev[agencyName] }))}
                              >
                                <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                  <span>⚠ THREAT CONTEXT</span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', fontWeight: 'normal', border: '1px solid rgba(255,255,255,0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px', letterSpacing: '0.5px' }}>
                                    OVERLAP SCORE: {Math.min(99, 45 + (data.threat_context.length * 8))}%
                                  </span>
                                </span>
                                <span style={{ color: 'var(--accent-steel)', opacity: 0.8 }}>{expandedContext[agencyName] ? '▲ HIDE OVERLAP' : '▼ VIEW CARRIERS'}</span>
                              </div>
                              <div className={`card-footnote-drawer ${expandedContext[agencyName] ? 'open' : ''}`}>
                                <div className="card-footnote" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                                  <span style={{ marginRight: '0.3rem', color: 'var(--text-muted)' }}>Direct competitor for:</span>
                                  {data.threat_context.map((carrier, cIdx) => (
                                    <span key={cIdx} className="carrier-pill">{carrier}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                        </div>
                      )
                    })}
                </div>
              )

            )}
          </section>
        </div>
      </main>


      {/* CONFIG MODAL */}
      <div className={`modal-overlay ${configModalOpen ? 'active' : ''}`} onClick={() => setConfigModalOpen(false)}>
        <div className="modal-content glass-card" style={{ padding: '1.5rem', maxWidth: '400px', width: '90%', margin: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button className="btn-ghost" style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', padding: '0.3rem 0.8rem', fontSize: '0.75rem' }} onClick={() => setConfigModalOpen(false)}>[X] CLOSE</button>
          <div style={{ marginBottom: '1.5rem' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '1px' }}>ALERT CONFIGURATION</span>
            <h2 style={{ fontSize: '1.25rem', margin: '0.3rem 0 0 0' }}>{configTitle}</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginBottom: '1.5rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 0', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>CARRIER TERMINATION</span>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked={true} />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 0', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                PRODUCER EXIT <span style={{ opacity: 0.5 }}>(TENURE &gt;</span> <input type="number" defaultValue="10" style={{ width: '22px', background: 'transparent', borderBottom: '1px solid var(--accent-blue)', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: '#FFF', textAlign: 'center', margin: '0 0.1rem', padding: 0, fontSize: '0.7rem' }} /> <span style={{ opacity: 0.5 }}>YRS)</span>
              </span>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked={true} />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 0', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>PRODUCER HIRE</span>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked={true} />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          <button className="btn-primary-full" onClick={() => setConfigModalOpen(false)} style={{ padding: '0.6rem', fontSize: '0.75rem' }}>SAVE</button>
        </div>
      </div>
    </div>
  )
}
