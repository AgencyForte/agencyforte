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
  const [timeFilter, setTimeFilter] = useState('30 Days')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [expandedEvent, setExpandedEvent] = useState({})
  const [expandedNested, setExpandedNested] = useState({})
  const [expandedContext, setExpandedContext] = useState({})

  const initRegion = localStorage.getItem('market_region');
  const [selectedRegion, setSelectedRegion] = useState((initRegion === 'Houston' ? 'Greater Houston' : initRegion) || 'All Texas')
  const [selectedLOB, setSelectedLOB] = useState(localStorage.getItem('market_lob') || 'All LOBs')
  const [selectedEvent, setSelectedEvent] = useState(localStorage.getItem('market_event') || 'All Events')
  const [selectedCarrier, setSelectedCarrier] = useState(localStorage.getItem('market_carrier') || 'All Carriers')
  const [hideJuniorAttrition, setHideJuniorAttrition] = useState(localStorage.getItem('hide_junior') !== 'false')

  const [searchTerm, setSearchTerm] = useState(localStorage.getItem('watch_search') || '')
  const [activeVectors, setActiveVectors] = useState(JSON.parse(localStorage.getItem('watch_vectors') || '["DEFECTION", "TERMINATION", "ACQUISITION", "NEW MARKET"]'))

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
    localStorage.setItem('watch_vectors', JSON.stringify(activeVectors))
  }, [searchTerm, activeVectors])

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
        } else {
          // 3. Fetch Producer Movements affecting these agencies
          const { data: movements, error: movErr } = await supabase
            .from('producer_movements')
            .select(`
              id, movement_date, movement_type, lines_affected,
              from_agency_id, to_agency_id,
              producer:producers(npn, first_name, last_name, original_license_date, active_appointments_count),
              from_agency:agencies!from_agency_id(agency_name, category),
              to_agency:agencies!to_agency_id(agency_name, category)
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
            // SIGNAL PURITY: Discard junior producers (< 3 years tenure)
            const tenureYears = m.producer?.original_license_date
              ? (new Date() - new Date(m.producer.original_license_date)) / 31536000000
              : 0;
            if (tenureYears < 3) return;

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
        }

        // 6. Fetch Global Market Movements (For 'Market Movements' Tab)
        const { data: globalAgencies } = await supabase.from('agencies').select('id, agency_name, category, total_producers_count, location:locations(msa)').limit(20)

        const globalAgencyIds = globalAgencies?.map(a => a.id) || []

        const quotedIds = globalAgencyIds.map(id => `"${id}"`).join(',')

        const { data: globalMovements } = await supabase
          .from('producer_movements')
          .select(`
            id, movement_date, movement_type, lines_affected,
            from_agency_id, to_agency_id,
            producer:producers(npn, first_name, last_name, original_license_date, active_appointments_count),
            from_agency:agencies!from_agency_id(agency_name, category),
            to_agency:agencies!to_agency_id(agency_name, category)
          `)
          .or(`from_agency_id.in.(${quotedIds}),to_agency_id.in.(${quotedIds})`)
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
            category: ag.category,
            total_producers_count: ag.total_producers_count,
            msa: ag.location?.msa,
            defection: [], hire: [], carrier_loss: [], agency_termination: [], new_appt: [], jit: []
          }
        })

        globalMovements?.forEach(m => {
          // SIGNAL PURITY: Discard junior producers (< 3 years tenure)
          const tenureYears = m.producer?.original_license_date
            ? (new Date() - new Date(m.producer.original_license_date)) / 31536000000
            : 0;
          if (tenureYears < 3) return;

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

        const { data: jitAppointments } = await supabase
          .from('producer_carrier_appointments')
          .select(`
            appointment_date,
            producer:producers(npn, first_name, last_name, current_agency_id),
            carrier:carriers(carrier_name)
          `)
          .order('appointment_date', { ascending: false })
          .limit(50)

        jitAppointments?.forEach(j => {
          if (!j.producer?.current_agency_id) return;
          const aName = globalAgencies?.find(a => a.id === j.producer.current_agency_id)?.agency_name;
          if (aName && globalGrouped[aName]) {
            globalGrouped[aName].jit.push(j)
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

  const formatCurrency = (num) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `$${Math.round(num / 1000)}K`
    return `$${num}`
  }

  const calculateEBV = (tenureYears, activeAppointments, agencyCategory) => {
    if (!tenureYears || tenureYears < 0) return 0;
    const basePremium = 150000 * Math.pow(tenureYears, 1.1);
    const apptMultiplier = 1 + ((activeAppointments || 0) * 0.15);
    const catMultiplier = agencyCategory?.includes('COMMERCIAL') ? 1.8 : 1.0;
    return basePremium * apptMultiplier * catMultiplier;
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
      let jit = ag.jit || [];

      if (hideJuniorAttrition) {
        hire = hire.filter(e => getTenureYears(e.producer?.original_license_date) >= 3);
        defection = defection.filter(e => getTenureYears(e.producer?.original_license_date) >= 3);
      }

      return { ...ag, hire, defection, jit };
    });

    // Top Expanders (Actionable Hires)
    const topExpanders = [...processedAgencies].sort((a, b) => b.hire.length - a.hire.length).slice(0, 10).filter(a => a.hire.length > 0);

    // Mass Exodus (Actionable Exits)
    const topUnstable = [...processedAgencies].sort((a, b) => b.defection.length - a.defection.length).slice(0, 10).filter(a => a.defection.length > 0);

    // Whale Migrations (Always >= 5 years, regardless of toggle)
    let whaleAgencies = agenciesArr.map(ag => {
      let defection = ag.defection.filter(e => getTenureYears(e.producer?.original_license_date) >= 5);
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

    const topFlightRisks = [...processedAgencies].filter(a => a.jit && a.jit.length > 0);

    return { topExpanders, topUnstable, topWhales, topCarriers, topApptCarriers, topFlightRisks };
  }, [marketData, selectedRegion, hideJuniorAttrition]);

  const threatFeed = useMemo(() => {
    if (!macroTrends) return []
    const feed = []
    const seenAgencies = new Set();
    
    // Helper to format ±20% confidence band
    const formatExposure = (val) => {
      const lower = formatCurrency(val * 0.8);
      const upper = formatCurrency(val * 1.2);
      return `${lower} – ${upper}`;
    };
    
    // Helper to format line labels
    const formatLineLabel = (line) => {
      const map = {
        'COMMERCIAL_P_C': 'Commercial P&C',
        'PERSONAL_P_C': 'Personal P&C',
        'LIFE_HEALTH': 'Life & Health',
        'BENEFITS': 'Employee Benefits',
        'SURETY': 'Surety & Bonds'
      };
      return map[line] || line.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    // Helper to get lines
    const getLines = (arr) => {
      const rawLines = [...new Set(arr.flatMap(a => a.lines_affected || []))].filter(Boolean);
      const formattedLines = rawLines.map(formatLineLabel);
      return formattedLines.length > 0 ? formattedLines.join(' & ') : 'Commercial P&C';
    };
    
    // Helper to get MSA
    const getMsa = (ag) => ag.msa ? ag.msa.split('-')[0].split(',')[0] : 'Texas';

    if (selectedEvent === 'All Events' || selectedEvent === 'Producer Hires') {
      macroTrends.topExpanders.forEach(ag => {
        let totalEBV = 0;
        let isLiftOut = false;
        let liftOutSource = '';
        const sourceCounts = {};

        ag.hire.forEach(h => {
          totalEBV += calculateEBV(getTenureYears(h.producer?.original_license_date), h.producer?.active_appointments_count, h.from_agency?.category);
          if (h.from_agency?.agency_name) {
            sourceCounts[h.from_agency.agency_name] = (sourceCounts[h.from_agency.agency_name] || 0) + 1;
            if (sourceCounts[h.from_agency.agency_name] >= 3) {
              isLiftOut = true;
              liftOutSource = h.from_agency.agency_name;
            }
          }
        });
        
        const msa = getMsa(ag);
        const lines = getLines(ag.hire);
        
        if (isLiftOut) {
          feed.push({ 
            type: 'COMPETITIVE OPPORTUNITY', 
            agencyName: ag.name,
            fact: `${ag.name} hired ${sourceCounts[liftOutSource]} producers specializing in ${lines} from ${liftOutSource} in the ${msa} metro.`, 
            why: `Competitor sales capacity may be increasing in a line where account competition is relationship-driven and specialized expertise matters.`,
            exposure: `Estimated enterprise book value added: ${formatExposure(totalEBV)}.`,
            play: `Audit top 20 shared accounts with ${liftOutSource} and deploy immediate BOR defenses in ${msa}.`,
            confidence: `Event verified (High); financial exposure is a modeled estimate (Moderate).`,
            color: '#475569' // Slate
          })
        } else {
          feed.push({ 
            type: 'COMPETITIVE OPPORTUNITY', 
            agencyName: ag.name,
            fact: `${ag.name} added ${ag.hire.length} producer(s) specializing in ${lines} in the ${msa} metro.`, 
            why: `Competitor sales capacity may be increasing in a line where account competition is relationship-driven and specialized expertise matters.`,
            exposure: `Estimated enterprise book value added: ${formatExposure(totalEBV)}.`,
            play: `Review nearby accounts for renewal vulnerability and confirm servicing ownership.`,
            confidence: `Event verified (High); financial exposure is a modeled estimate (Moderate).`,
            color: '#3f6212' // Muted Olive
          })
        }
      })
    }
    if (selectedEvent === 'All Events' || selectedEvent === 'Producer Exits' || selectedEvent === 'Whale Migrations') {
      // Process topUnstable and topWhales together to deduplicate
      const combinedRiskAgencies = [...new Set([...macroTrends.topUnstable, ...macroTrends.topWhales])];
      
      combinedRiskAgencies.forEach(ag => {
        if (seenAgencies.has(ag.name)) return;
        seenAgencies.add(ag.name);
        
        let totalEBV = 0;
        let seniorCount = 0;
        ag.defection.forEach(d => {
          totalEBV += calculateEBV(getTenureYears(d.producer?.original_license_date), d.producer?.active_appointments_count, ag.category);
          if (getTenureYears(d.producer?.original_license_date) >= 5) seniorCount++;
        });
        const arr = totalEBV * 0.12;
        const msa = getMsa(ag);
        const lines = getLines(ag.defection);
        
        let factText = `${ag.name} lost ${ag.defection.length} producer(s) in the ${msa} metro.`;
        if (seniorCount > 0) factText = `${ag.name} lost ${ag.defection.length} producer(s) in the ${msa} metro, including ${seniorCount} specializing in ${lines}.`;

        feed.push({ 
          type: 'RETENTION RISK', 
          agencyName: ag.name,
          fact: factText, 
          why: `Producer-led accounts in ${lines} may be more vulnerable to remarketing or competitor outreach during the transition period.`,
          exposure: `Estimated book exposure: ${formatExposure(totalEBV)}. Estimated annualized revenue exposure: ${formatExposure(arr)}.`,
          play: `Assign ${lines} prospects in ${msa} to your top producer within 48 hours.`,
          confidence: `Event verified (High); financial exposure is a modeled estimate (Moderate).`,
          color: seniorCount > 0 ? '#7f1d1d' : '#991b1b' // Deep Rust Red
        })
      })

      macroTrends.topFlightRisks.forEach(ag => {
        if (!ag.jit || ag.jit.length === 0) return;
        
        const carrierSet = new Set(ag.jit.map(j => j.carrier?.carrier_name).filter(Boolean));
        const carrierNames = [...carrierSet].slice(0, 2).join(' and ');
        const carrierText = carrierSet.size > 2 ? `${carrierNames} and others` : carrierNames;
        
        let factText = `Producers affiliated with ${ag.name} obtained ${ag.jit.length} direct carrier appointments.`;
        if (carrierNames) factText = `Producers affiliated with ${ag.name} obtained ${ag.jit.length} direct appointments, including new relationships with ${carrierText}.`;

        feed.push({ 
          type: 'PRODUCER MOVEMENT', 
          agencyName: ag.name,
          fact: factText, 
          why: `A cluster of new appointments often indicates a platform transition, mass affiliation change, or preparation for a team lift-out.`,
          exposure: `No direct revenue estimate available from public data.`,
          play: `Add the agency to watchlist and review competitor strength in affected commercial lines.`,
          confidence: `High; appointment data is authoritative, but reported changes can trail real-world movement.`,
          color: '#b45309' // Muted Bronze
        })
      })
    }
    if (selectedEvent === 'All Events' || selectedEvent === 'Carrier Terminations') {
      macroTrends.topCarriers.forEach(c => {
        feed.push({ 
          type: 'CARRIER RELATIONSHIP CHANGE', 
          agencyName: c.name,
          fact: `${c.name} terminated ${c.count} appointment(s) affecting the ${selectedRegion === 'All Texas' ? 'Texas' : selectedRegion} market.`, 
          why: `If tied to an agency or line with meaningful volume, quoting capacity and carrier access may narrow.`,
          exposure: `Direct revenue impact not observable from public data; market-access risk elevated.`,
          play: `Review accounts that fit your current carrier panel and flag competitors with concentrated placement in the affected market.`,
          confidence: `High for reported termination; downstream production impact requires monitoring.`,
          color: '#9a3412' // Burnt Orange
        })
      })
    }
    if (selectedEvent === 'All Events' || selectedEvent === 'Carrier Appointments') {
      macroTrends.topApptCarriers.forEach(c => {
        feed.push({ 
          type: 'CARRIER RELATIONSHIP CHANGE', 
          agencyName: c.name,
          fact: `${c.name} issued ${c.count} new appointment(s) affecting the ${selectedRegion === 'All Texas' ? 'Texas' : selectedRegion} market.`, 
          why: `Indicates carrier-panel repositioning or territory expansion for affected agencies.`,
          exposure: `Direct revenue impact not observable from public data.`,
          play: `Review target niche overlap; ${c.name} may be authorizing new commercial quoting capacity.`,
          confidence: `High for reported appointment; downstream production impact requires monitoring.`,
          color: '#1e3a8a' // Deep Navy
        })
      })
    }

    // Shuffle the array to look like a real-time chronological feed
    for (let i = feed.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [feed[i], feed[j]] = [feed[j], feed[i]];
    }
    
    // Add chronological timestamps spanning the last few hours
    const now = new Date()
    feed.forEach((item, index) => {
      const pastTime = new Date(now.getTime() - (index * 420000) - Math.random() * 600000)
      item.time = pastTime.toLocaleTimeString('en-US', { hour12: false })
    })

    return feed
  }, [macroTrends, selectedEvent])

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
      // 1. Search Term Filter
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase()
        agencyData.defection = agencyData.defection.filter(m => `${m.producer?.first_name} ${m.producer?.last_name}`.toLowerCase().includes(term) || m.producer?.npn?.includes(term))
        agencyData.hire = agencyData.hire.filter(m => `${m.producer?.first_name} ${m.producer?.last_name}`.toLowerCase().includes(term) || m.producer?.npn?.includes(term))

        agencyData.carrier_loss = agencyData.carrier_loss.filter(e => e.carrier?.carrier_name?.toLowerCase().includes(term))
        agencyData.agency_termination = agencyData.agency_termination.filter(e => e.carrier?.carrier_name?.toLowerCase().includes(term))
        agencyData.new_appt = agencyData.new_appt.filter(e => e.carrier?.carrier_name?.toLowerCase().includes(term))
      }

      // 4. Threat Vector Filter
      if (!activeVectors.includes('DEFECTION')) agencyData.defection = [];
      if (!activeVectors.includes('TERMINATION')) {
        agencyData.carrier_loss = [];
        agencyData.agency_termination = [];
      }
      if (!activeVectors.includes('ACQUISITION')) agencyData.hire = [];
      if (!activeVectors.includes('NEW MARKET')) agencyData.new_appt = [];

      renderData[agencyName] = agencyData
    })
  } else {
    renderData = baseData
  }

  return (
    <div className="dashboard-layout">
      {/* LEFT SIDEBAR - CARD NAV */}
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 'bold', color: '#FFF', margin: '0 0 2rem 0', padding: '0 0.5rem', opacity: 0.8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 17L12 22L22 17" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 12L12 17L22 12" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          AGENCY<span style={{ color: 'var(--text-main)' }}>FORTE</span>
        </div>

        <div className="nav-group">
          <nav className="sidebar-nav">
            <button
              className={`stealth-toggle ${activeTab === 'watchlist' ? 'active' : ''}`}
              onClick={() => setActiveTab('watchlist')}
              style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}
            >
              <span className="toggle-indicator"></span>
              WATCHLIST
            </button>

            <button
              className={`stealth-toggle ${activeTab === 'movements' ? 'active' : ''}`}
              onClick={() => setActiveTab('movements')}
              style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}
            >
              <span className="toggle-indicator"></span>
              MACRO TRENDS
            </button>
          </nav>
        </div>

        <div className="nav-group" style={{ marginTop: 'auto' }}>
          <nav className="sidebar-nav">
            <button className="stealth-toggle" style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}>
              <span className="toggle-indicator"></span>
              ACCOUNT
            </button>

            <button className="stealth-toggle" style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}>
              <span className="toggle-indicator"></span>
              SETTINGS
            </button>

            <div style={{ position: 'absolute', bottom: '1rem', width: '100%', display: 'flex', justifyContent: 'center' }}>
              <button className="stealth-toggle" style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}>
                <span className="toggle-indicator"></span>
                TERMINATE SESSION
              </button>
            </div>
          </nav>


        </div>
      </aside>
      <main className="main-content" style={{ paddingTop: 0 }}>
        <div className="unified-container">
          <section style={{ padding: 0, marginBottom: '4rem' }}>
            {activeTab === 'movements' && (
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', width: '100%', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
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
                      <option style={{ background: 'var(--bg-base)' }} value="Greater Houston">HOUSTON</option>
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
                      <option style={{ background: 'var(--bg-base)' }} value="30 Days">30 DAYS</option>
                      <option style={{ background: 'var(--bg-base)' }} value="60 Days">60 DAYS</option>
                      <option style={{ background: 'var(--bg-base)' }} value="12 Months">12 MONTHS</option>
                    </select>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-main)', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'watchlist' && (
              <div className="command-console">
                <div className="console-header" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '2px' }}>TRIAL VERSION: <span style={{ color: 'var(--accent-red)' }}>14 DAYS REMAINING</span></span>
                </div>

                <div className="console-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
                  {/* Temporal Filter */}
                  <div className="console-section" style={{ position: 'relative' }}>
                    <span className="section-label">MARKET WATCH</span>
                    <div
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      style={{ marginTop: '5px', display: 'flex', alignItems: 'baseline', gap: '4px', cursor: 'pointer', paddingBottom: '2px', paddingRight: '15px', position: 'relative' }}
                    >
                      <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#FFF', fontFamily: 'var(--font-heading)' }}>{timeFilter.split(' ')[0]}</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{timeFilter.split(' ')[1]}</span>
                      <span style={{ fontSize: '0.5rem', color: 'var(--text-main)', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}>▼</span>
                    </div>

                    {dropdownOpen && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, background: 'rgba(13, 17, 26, 0.95)', border: '1px solid var(--border-highlight)', borderRadius: '4px', padding: '0.5rem 0', zIndex: 100, minWidth: '120px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', marginTop: '5px' }}>
                        {['30 Days', '60 Days', '12 Months'].map(t => (
                          <div
                            key={t}
                            onClick={() => { setTimeFilter(t); setDropdownOpen(false); }}
                            style={{ padding: '0.5rem 1rem', cursor: 'pointer', color: timeFilter === t ? '#FFF' : 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: '0.9rem', display: 'flex', alignItems: 'baseline', gap: '4px' }}
                          >
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: timeFilter === t ? '#FFF' : 'var(--text-muted)' }}>{t.split(' ')[0]}</span>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{t.split(' ')[1]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Threat Vectors */}
                  <div className="console-section">
                    <span className="section-label">THREAT VECTORS</span>
                    <div className="toggle-group">
                      {['DEFECTION', 'TERMINATION', 'ACQUISITION', 'NEW MARKET'].map(vec => (
                        <button
                          key={vec}
                          className={`stealth-toggle toggle-${vec.split(' ')[0].toLowerCase()} ${activeVectors.includes(vec) ? 'active' : ''}`}
                          onClick={() => setActiveVectors(prev => prev.includes(vec) ? prev.filter(v => v !== vec) : [...prev, vec])}
                        >
                          <span className="toggle-indicator"></span>
                          {vec}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="console-section">
                    <span className="section-label" style={{ textAlign: 'right' }}>SEARCH PROTOCOL</span>
                    <input
                      type="text"
                      placeholder="Producer Name or NPN..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      style={{ width: '200px', background: 'transparent', border: 'none', color: '#FFF', outline: 'none', padding: '0.2rem 0', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'movements' && threatFeed && (
              <div className="threat-feed-container" style={{ borderRadius: '4px', height: '65vh', overflowY: 'auto', marginBottom: '2rem', marginTop: '1.5rem', paddingRight: '10px' }}>
                <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px dashed rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)', fontSize: '0.65rem', letterSpacing: '2px', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)' }}>
                  <span>SYSTEM LOG // MACRO TRENDS ANOMALY DETECTOR</span>
                  <span>STATUS: ACTIVE</span>
                </div>
                {threatFeed.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>NO ANOMALIES DETECTED FOR CURRENT PARAMETERS.</div>
                ) : (
                  threatFeed.map((event, i) => (
                    <div className="event-card" key={i} style={{ '--event-color': event.color }}>
                      <div className="event-card-header">
                        <div className="event-card-header-left">
                          <span className="event-type" style={{ color: event.color }}>[{event.type}]</span>
                          <span className="event-agency">{event.agencyName}</span>
                        </div>
                        <span className="event-time">{event.time}</span>
                      </div>
                      <div className="event-card-body">
                        <div className="event-row">
                          <span className="event-label">Fact:</span> 
                          <span className="event-value">{event.fact}</span>
                        </div>
                        <div className="event-row">
                          <span className="event-label">Why it matters:</span> 
                          <span className="event-value">{event.why}</span>
                        </div>
                        <div className="event-row">
                          <span className="event-label">Exposure:</span> 
                          <span className="event-value">{event.exposure}</span>
                        </div>
                        <div className="event-row">
                          <span className="event-label">Recommended play:</span> 
                          <span className="event-value action-value">{event.play}</span>
                        </div>
                        <div className="event-row">
                          <span className="event-label">Confidence:</span> 
                          <span className="event-value" style={{ color: 'var(--text-muted)' }}>{event.confidence}</span>
                        </div>
                      </div>
                    </div>
                  ))
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
