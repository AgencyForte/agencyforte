import { useState, useEffect, useMemo, Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './dashboard.css'

export default function Dashboard() {
  const location = useLocation()
  const USER_EMAIL = location.state?.email || 'principal@agencyforte.com'

  const [activeTab, setActiveTab] = useState('acquisition')
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [configTitle, setConfigTitle] = useState('')
  const [openTrays, setOpenTrays] = useState({})
  const [timeFilter, setTimeFilter] = useState('30 Days')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [expandedEvent, setExpandedEvent] = useState({})
  const [expandedNested, setExpandedNested] = useState({})
  const [expandedContext, setExpandedContext] = useState({})
  const [acquiredTarget, setAcquiredTarget] = useState(null)

  const [filterName, setFilterName] = useState('')
  const [filterNpn, setFilterNpn] = useState('')
  const [filterSpecialty, setFilterSpecialty] = useState('')
  const [filterAgency, setFilterAgency] = useState('')
  const [filterVector, setFilterVector] = useState('')
  const [filterFitScore, setFilterFitScore] = useState('')
  const [filterMinRevenue, setFilterMinRevenue] = useState('')
  const [filterMinTenure, setFilterMinTenure] = useState('')
  const [poachingVulnerableOnly, setPoachingVulnerableOnly] = useState(true)
  const [principalCarriers, setPrincipalCarriers] = useState([])
  const [showTerminateModal, setShowTerminateModal] = useState(false)
  const [valuationFilter, setValuationFilter] = useState('All Sizes')
  const [distressFilter, setDistressFilter] = useState('All Levels')
  const [sniperCarrierFilter, setSniperCarrierFilter] = useState('All Carriers')
  const [sniperBookmarks, setSniperBookmarks] = useState([])
  const [showSniperBookmarks, setShowSniperBookmarks] = useState(false)

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
  const [fetchError, setFetchError] = useState(null)
  const [registryProducers, setRegistryProducers] = useState([])
  const [trackedProducerIds, setTrackedProducerIds] = useState([])
  const [watchlistedAgencyIds, setWatchlistedAgencyIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [matrixCompetitorIds, setMatrixCompetitorIds] = useState([])

  const [currentUserId, setCurrentUserId] = useState(null)
  const [producerSearchQuery, setProducerSearchQuery] = useState('')
  const [isSearchingProducers, setIsSearchingProducers] = useState(false)
  const [producerFilter, setProducerFilter] = useState('ALL')
  const [competitorFilter, setCompetitorFilter] = useState('ENTIRE MSA')

  // Feed Pagination State
  const [feedPage, setFeedPage] = useState(0)
  const [hasMoreFeed, setHasMoreFeed] = useState(true)
  const [isFetchingFeed, setIsFetchingFeed] = useState(false)
  const [matrixDataCache, setMatrixDataCache] = useState([])
  const [expandedProducer, setExpandedProducer] = useState(null)

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


  const fetchFeedPage = async (pageToFetch, matrixCacheRef, regionRef) => {
    if (isFetchingFeed || !hasMoreFeed) return;
    setIsFetchingFeed(true);
    try {
      const PAGE_SIZE = 100;
      const fromOffset = pageToFetch * PAGE_SIZE;
      const toOffset = fromOffset + PAGE_SIZE - 1;

      const { data: globalMovements } = await supabase
        .from('producer_movements')
        .select(`
          id, movement_date, movement_type, lines_affected,
          from_agency_id, to_agency_id,
          producer:producers(npn, first_name, last_name, original_license_date, active_appointments_count),
          from_agency:agencies!from_agency_id!inner(id, agency_name, category, total_producers_count, owner_name, location:locations!inner(msa, city)),
          to_agency:agencies!to_agency_id(id, agency_name, category, total_producers_count, owner_name, location:locations(msa, city))
        `)
        .eq('from_agency.location.msa', regionRef)
        .order('movement_date', { ascending: false })
        .range(fromOffset, toOffset);

      const { data: globalEvents } = await supabase
        .from('carrier_events')
        .select(`
          id, event_date, event_type, producers_affected_count, notes,
          agency_id,
          carrier:carriers(carrier_name),
          agency:agencies!inner(id, agency_name, category, total_producers_count, owner_name, location:locations!inner(msa, city))
        `)
        .eq('agency.location.msa', regionRef)
        .order('event_date', { ascending: false })
        .range(fromOffset, toOffset);

      if ((!globalMovements || globalMovements.length < PAGE_SIZE) && (!globalEvents || globalEvents.length < PAGE_SIZE)) {
        setHasMoreFeed(false);
      }

      setMarketData(prev => {
        const nextGrouped = { ...prev };

        const ensureGlobalAgency = (ag) => {
          if (!ag || !ag.agency_name) return;
          if (!nextGrouped[ag.agency_name]) {
            const matrixMatch = matrixCacheRef?.find(m => m.competitor_agency_id === ag.id);
            const commercialCarriers = ['Travelers', 'Liberty Mutual', 'Chubb', 'CNA', 'The Hartford', 'Zurich'];
            let threatContext = [];
            let overlapScore = 0;

            if (matrixMatch) {
              const overlapCount = matrixMatch.overlap_carriers_count || 0;
              for (let i = 0; i < overlapCount; i++) {
                threatContext.push(commercialCarriers[i % commercialCarriers.length]);
              }
              overlapScore = Math.min(99, Math.max(65, Math.floor(matrixMatch.competition_score / 30)));
            }

            nextGrouped[ag.agency_name] = {
              id: ag.id,
              name: ag.agency_name,
              agency_name: ag.agency_name,
              total_producers_count: ag.total_producers_count,
              msa: ag.location?.msa,
              city: ag.location?.city,
              owner_name: ag.owner_name,
              threat_context: threatContext,
              overlap_score: overlapScore,
              defection: [], hire: [], carrier_loss: [], agency_termination: [], new_appt: [], jit: []
            }
          }
        }

        // Pre-seed direct competitors if this is page 0
        if (pageToFetch === 0) {
          matrixCacheRef?.forEach(m => {
            if (m.competitor_agency) ensureGlobalAgency(m.competitor_agency);
          });
        }

        globalMovements?.forEach(m => {
          const tenureYears = m.producer?.original_license_date ? (new Date() - new Date(m.producer.original_license_date)) / 31536000000 : 0;
          if (tenureYears < 3) return;

          if (m.from_agency) {
            ensureGlobalAgency(m.from_agency);
            if (!nextGrouped[m.from_agency.agency_name].defection.some(x => x.id === m.id)) {
                nextGrouped[m.from_agency.agency_name].defection.push(m);
            }
          }
          if (m.to_agency) {
            ensureGlobalAgency(m.to_agency);
            if (!nextGrouped[m.to_agency.agency_name].hire.some(x => x.id === m.id)) {
                nextGrouped[m.to_agency.agency_name].hire.push(m);
            }
          }
        });

        globalEvents?.forEach(e => {
          if (e.agency) {
            ensureGlobalAgency(e.agency);
            if (e.event_type === 'APPOINTMENT_LOST' && !nextGrouped[e.agency.agency_name].carrier_loss.some(x => x.id === e.id)) {
                nextGrouped[e.agency.agency_name].carrier_loss.push(e)
            } else if (e.event_type === 'MASS_TERMINATION' && !nextGrouped[e.agency.agency_name].agency_termination.some(x => x.id === e.id)) {
                nextGrouped[e.agency.agency_name].agency_termination.push(e)
            } else if (e.event_type === 'APPOINTMENT_GAINED' && !nextGrouped[e.agency.agency_name].new_appt.some(x => x.id === e.id)) {
                nextGrouped[e.agency.agency_name].new_appt.push(e)
            }
          }
        });

        return nextGrouped;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingFeed(false);
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        let { data: userData, error: userErr } = await supabase
          .from('users')
          .select('id, home_agency_id, home_agency:agencies!home_agency_id(agency_name, total_producers_count, category, location:locations(msa, city), agency_carrier_appointments(carrier:carriers(carrier_name)))')
          .eq('email', USER_EMAIL)
          .single()

        if (userErr || !userData) {
          console.warn(`User fetch failed for ${USER_EMAIL}. Falling back to first available user...`)
          const fallback = await supabase
            .from('users')
            .select('id, home_agency_id, home_agency:agencies!home_agency_id(agency_name, total_producers_count, category, location:locations(msa, city), agency_carrier_appointments(carrier:carriers(carrier_name)))')
            .limit(1)
            .single()

          userData = fallback.data
          userErr = fallback.error

          if (userErr || !userData) {
            throw new Error(`Critical Auth Failure. Fallback failed. Error: ${userErr?.message || JSON.stringify(userErr)}`)
          }
        }
        const userId = userData.id
        setCurrentUserId(userId)

        if (userData.home_agency?.agency_carrier_appointments) {
          const pCarriers = userData.home_agency.agency_carrier_appointments.map(a => a.carrier?.carrier_name).filter(Boolean);
          setPrincipalCarriers(pCarriers);
        }

        // Fetch tracked producers
        const { data: tpData } = await supabase
          .from('tracked_producers')
          .select('producer_id')
          .eq('user_id', userId)
        if (tpData) setTrackedProducerIds(tpData.map(r => r.producer_id))

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
              location:locations(msa, city)
            )
          `)
          .eq('user_id', userId)

        if (wlError) throw wlError

        const watchlistAgencyIds = watchlists.map(w => w.agency_id)

        if (userData.home_agency_id && !watchlistAgencyIds.includes(userData.home_agency_id)) {
          watchlistAgencyIds.push(userData.home_agency_id)
          watchlists.unshift({
            agency_id: userData.home_agency_id,
            agency: {
              id: userData.home_agency_id,
              agency_name: userData.home_agency.agency_name,
              total_producers_count: userData.home_agency.total_producers_count,
              location: userData.home_agency.location
            }
          })
        }

        setWatchlistedAgencyIds(watchlistAgencyIds)

        if (watchlistAgencyIds.length === 0) {
          setWatchlistData({})
        } else {
          const quotedWatchlistIds = watchlistAgencyIds.map(id => `"${id}"`).join(',')

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
            .or(`from_agency_id.in.(${quotedWatchlistIds}),to_agency_id.in.(${quotedWatchlistIds})`)
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
            .from('competitor_relationships')
            .select('competitor_agency_id, competition_score, overlap_carriers_count')
            .eq('base_agency_id', userData.home_agency_id)
            .in('competitor_agency_id', watchlistAgencyIds)

          const groupedData = {}
          watchlists.forEach(wl => {
            const aId = wl.agency.id
            const aName = wl.agency.agency_name
            const threat = threatData?.find(t => t.competitor_agency_id === aId)
            const threatContext = threat ? Array(threat.overlap_carriers_count).fill(true).map((_, i) => principalCarriers[i] || 'Top Carrier') : [];

            groupedData[aName] = {
              id: aId,
              total_producers_count: wl.agency.total_producers_count,
              msa: wl.agency.location?.msa,
              city: wl.agency.location?.city,
              threat_context: threatContext,
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

        // 6. Fetch Competitor Matrix Data


        const { data: matrixData } = await supabase


          .from('competitor_relationships')


          .select(`


             competitor_agency_id, competition_score, overlap_carriers_count,


             competitor_agency:agencies!competitor_agency_id(id, agency_name, category, total_producers_count, owner_name, location:locations(msa, city))


          `)


          .eq('base_agency_id', userData.home_agency_id)


          .order('competition_score', { ascending: false })


          .limit(150);


        


        setMatrixDataCache(matrixData || []);


        


        // Kick off initial feed fetch


        await fetchFeedPage(0, matrixData || [], selectedRegion);

      } catch (err) {
        console.error("Dashboard Fetch Error:", err)
        setFetchError(err.message || JSON.stringify(err))
      }
      setLoading(false)
    }

    fetchData()
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMoreFeed && !isFetchingFeed) {
        setFeedPage(prev => prev + 1);
      }
    }, { threshold: 0.1 });

    const anchor = document.getElementById('scroll-anchor');
    if (anchor) observer.observe(anchor);

    return () => {
      if (anchor) observer.unobserve(anchor);
    }
  }, [hasMoreFeed, isFetchingFeed]);

  useEffect(() => {
    if (feedPage > 0) {
      fetchFeedPage(feedPage, matrixDataCache, selectedRegion);
    }
  }, [feedPage]);

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

  const baseData = activeTab === 'inbox'
    ? (competitorFilter === 'WATCHLIST' ? watchlistData : marketData)
    : marketData;
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

      // Time Filter
      if (timeFilter) {
        const days = parseInt(timeFilter.split(' ')[0], 10);
        if (!isNaN(days)) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          agencyData.defection = agencyData.defection.filter(m => new Date(m.movement_date) >= cutoff);
          agencyData.hire = agencyData.hire.filter(m => new Date(m.movement_date) >= cutoff);
          agencyData.carrier_loss = agencyData.carrier_loss.filter(e => new Date(e.event_date) >= cutoff);
          agencyData.agency_termination = agencyData.agency_termination.filter(e => new Date(e.event_date) >= cutoff);
          agencyData.new_appt = agencyData.new_appt.filter(e => new Date(e.event_date) >= cutoff);
        }
      }

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
  } else if (activeTab === 'inbox') {
    Object.entries(baseData).forEach(([agencyName, data]) => {
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

      // Time Filter
      if (timeFilter) {
        const days = parseInt(timeFilter.split(' ')[0], 10);
        if (!isNaN(days)) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          agencyData.defection = agencyData.defection.filter(m => new Date(m.movement_date) >= cutoff);
          agencyData.hire = agencyData.hire.filter(m => new Date(m.movement_date) >= cutoff);
          agencyData.carrier_loss = agencyData.carrier_loss.filter(e => new Date(e.event_date) >= cutoff);
          agencyData.agency_termination = agencyData.agency_termination.filter(e => new Date(e.event_date) >= cutoff);
          agencyData.new_appt = agencyData.new_appt.filter(e => new Date(e.event_date) >= cutoff);
        }
      }

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

      // 1. Search Term Filter
      let matchesSearch = true;
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase()
        const agencyMatch = agencyName.toLowerCase().includes(term)

        if (!agencyMatch) {
          agencyData.defection = agencyData.defection.filter(m => `${m.producer?.first_name} ${m.producer?.last_name}`.toLowerCase().includes(term) || m.producer?.npn?.includes(term))
          agencyData.hire = agencyData.hire.filter(m => `${m.producer?.first_name} ${m.producer?.last_name}`.toLowerCase().includes(term) || m.producer?.npn?.includes(term))

          agencyData.carrier_loss = agencyData.carrier_loss.filter(e => e.carrier?.carrier_name?.toLowerCase().includes(term))
          agencyData.agency_termination = agencyData.agency_termination.filter(e => e.carrier?.carrier_name?.toLowerCase().includes(term))
          agencyData.new_appt = agencyData.new_appt.filter(e => e.carrier?.carrier_name?.toLowerCase().includes(term))

          if (!agencyData.defection.length && !agencyData.hire.length && !agencyData.carrier_loss.length && !agencyData.agency_termination.length && !agencyData.new_appt.length) {
            matchesSearch = false;
          }
        }
      }

      // 4. Threat Vector Filter
      if (!activeVectors.includes('DEFECTION')) agencyData.defection = [];
      if (!activeVectors.includes('TERMINATION')) {
        agencyData.carrier_loss = [];
        agencyData.agency_termination = [];
      }
      if (!activeVectors.includes('ACQUISITION')) agencyData.hire = [];
      if (!activeVectors.includes('NEW MARKET')) agencyData.new_appt = [];

      if (matchesSearch) {
        renderData[agencyName] = agencyData;
      }
    })
  } else {
    renderData = baseData
  }

  useEffect(() => {
    if (activeTab !== 'producers') return;

    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingProducers(true);
      try {
        const fiveYearsAgo = new Date();
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
        const cutoffDate = fiveYearsAgo.toISOString();

        if (producerFilter === 'DEFECTIONS') {
          let q = supabase.from('producer_movements')
            .select(`
              movement_date,
              producer:producers!inner(id, first_name, last_name, npn, original_license_date),
              from_agency:agencies!from_agency_id(agency_name),
              to_agency:agencies!to_agency_id(agency_name)
            `)
            .eq('movement_type', 'EXITED')
            .lte('producer.original_license_date', cutoffDate)
            .order('movement_date', { ascending: false })
            .limit(100);

          if (matrixCompetitorIds.length > 0) {
            const quotedCompetitorIds = matrixCompetitorIds.map(id => `"${id}"`).join(',');
            q = q.or(`from_agency_id.in.(${quotedCompetitorIds}),to_agency_id.in.(${quotedCompetitorIds})`);
          }

          const { data, error } = await q;

          if (error) throw error;

          let mapped = (data || []).map(m => ({
            id: m.producer.id,
            first_name: m.producer.first_name,
            last_name: m.producer.last_name,
            npn: m.producer.npn,
            original_license_date: m.producer.original_license_date,
            current_agency: { agency_name: m.to_agency?.agency_name || 'Independent' },
            previous_agency: m.from_agency?.agency_name || 'Unknown',
            movement_date: m.movement_date,
            is_defection: true
          }));

          if (producerSearchQuery) {
            const sq = producerSearchQuery.toLowerCase();
            mapped = mapped.filter(m => (m.first_name || '').toLowerCase().includes(sq) || (m.last_name || '').toLowerCase().includes(sq));
          }
          if (filterName) {
            const f = filterName.toLowerCase();
            mapped = mapped.filter(m => (m.first_name || '').toLowerCase().includes(f) || (m.last_name || '').toLowerCase().includes(f));
          }
          if (filterNpn) {
            mapped = mapped.filter(m => (m.npn || '').includes(filterNpn));
          }
          if (filterSpecialty) {
            const f = filterSpecialty.toLowerCase();
            mapped = mapped.filter(m => (m.specialty || '').toLowerCase().includes(f) || (m.lob || '').toLowerCase().includes(f));
          }
          if (filterAgency) {
            const f = filterAgency.toLowerCase();
            mapped = mapped.filter(m => (m.current_agency?.agency_name || '').toLowerCase().includes(f));
          }

          setRegistryProducers(mapped);

        } else {
          const selectString = filterAgency
            ? 'id, first_name, last_name, npn, current_agency:agencies!inner(agency_name), original_license_date, lob, specialty, estimated_premium, producer_carrier_appointments(carrier:carriers(carrier_name))'
            : 'id, first_name, last_name, npn, current_agency:agencies(agency_name), original_license_date, lob, specialty, estimated_premium, producer_carrier_appointments(carrier:carriers(carrier_name))';

          let query = supabase.from('producers')
            .select(selectString)
            .lte('original_license_date', cutoffDate)
            .limit(100);

          if (producerFilter === 'TRACKED') {
            if (trackedProducerIds.length === 0) {
              setRegistryProducers([]);
              setIsSearchingProducers(false);
              return;
            }
            query = query.in('id', trackedProducerIds);
          } else if (matrixCompetitorIds.length > 0) {
            query = query.in('current_agency_id', matrixCompetitorIds);
          }

          if (producerSearchQuery) {
            query = query.or(`first_name.ilike.%${producerSearchQuery}%,last_name.ilike.%${producerSearchQuery}%`);
          }

          if (filterName) {
            query = query.or(`first_name.ilike.%${filterName}%,last_name.ilike.%${filterName}%`);
          }
          if (filterNpn) {
            query = query.ilike('npn', `%${filterNpn}%`);
          }
          if (filterSpecialty) {
            query = query.or(`lob.ilike.%${filterSpecialty}%,specialty.ilike.%${filterSpecialty}%`);
          }
          if (filterAgency) {
            query = query.ilike('agencies.agency_name', `%${filterAgency}%`);
          }

          const { data, error } = await query;
          if (error) throw error;
          setRegistryProducers(data || []);
        }
      } catch (err) {
        console.error("Producer search error:", err);
      } finally {
        setIsSearchingProducers(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [producerSearchQuery, activeTab, producerFilter, trackedProducerIds, filterName, filterNpn, filterSpecialty, filterAgency]);

  const handleTrackProducer = async (producer) => {
    if (!currentUserId) return;

    const isCurrentlyTracked = trackedProducerIds.includes(producer.id);
    const previous = [...trackedProducerIds];

    if (isCurrentlyTracked) {
      setTrackedProducerIds(previous.filter(id => id !== producer.id));
      const { error } = await supabase
        .from('tracked_producers')
        .delete()
        .match({ user_id: currentUserId, producer_id: producer.id });

      if (error) {
        console.error("Failed to untrack producer:", error);
        setTrackedProducerIds(previous);
      }
    } else {
      setTrackedProducerIds([...previous, producer.id]);
      const { error } = await supabase
        .from('tracked_producers')
        .insert([{ user_id: currentUserId, producer_id: producer.id }]);

      if (error) {
        console.error("Failed to track producer:", error);
        setTrackedProducerIds(previous);
      } else {
        setAcquiredTarget(`${producer.first_name || ''} ${producer.last_name || ''}`.trim() || 'Unknown Target');
        setTimeout(() => setAcquiredTarget(null), 4000);
      }
    }
  };

  const handleTrackAgency = async (agencyId, agencyName) => {
    if (!currentUserId || !agencyId) return;

    const isCurrentlyTracked = watchlistedAgencyIds.includes(agencyId);
    const previous = [...watchlistedAgencyIds];
    const previousData = { ...watchlistData };

    if (isCurrentlyTracked) {
      setWatchlistedAgencyIds(previous.filter(id => id !== agencyId));
      const newData = { ...watchlistData };
      delete newData[agencyName];
      setWatchlistData(newData);

      const { error } = await supabase
        .from('user_watchlists')
        .delete()
        .match({ user_id: currentUserId, agency_id: agencyId });

      if (error) {
        console.error("Failed to untrack agency:", error);
        setWatchlistedAgencyIds(previous);
        setWatchlistData(previousData);
      }
    } else {
      setWatchlistedAgencyIds([...previous, agencyId]);
      if (marketData[agencyName]) {
        setWatchlistData({ ...watchlistData, [agencyName]: marketData[agencyName] });
      }

      const { error } = await supabase
        .from('user_watchlists')
        .insert([{ user_id: currentUserId, agency_id: agencyId }]);

      if (error) {
        console.error("Failed to track agency:", error);
        setWatchlistedAgencyIds(previous);
        setWatchlistData(previousData);
      }
    }
  };

  const executiveInsights = useMemo(() => {
    let velocity = 0;
    let alerts = [];
    let growingAgencies = [];
    let bleedingAgencies = [];

    Object.entries(marketData).forEach(([agencyName, data]) => {
      const hires = data.hire?.length || 0;
      const exits = data.defection?.length || 0;
      const terms = data.agency_termination?.length || 0;
      const lost = data.carrier_loss?.length || 0;
      const new_appt = data.new_appt?.length || 0;

      velocity += (hires + exits + terms + lost + new_appt);

      const netGrowth = hires - exits;
      if (netGrowth > 0) growingAgencies.push({ name: agencyName, net: netGrowth, city: data.city || 'Texas' });
      if (netGrowth < 0) bleedingAgencies.push({ name: agencyName, net: netGrowth, city: data.city || 'Texas' });

      if (hires >= 2) {
        alerts.push({ type: 'CRITICAL', title: 'MASS ACQUISITION DETECTED', target: agencyName, detail: `Hired ${hires} producers in quick succession.` });
      }
      if (exits >= 2) {
        alerts.push({ type: 'WARNING', title: 'MASS EXODUS', target: agencyName, detail: `Lost ${exits} producers recently.` });
      }
      if ((terms + lost) >= 2) {
        alerts.push({ type: 'WARNING', title: 'CARRIER EXODUS', target: agencyName, detail: `Lost ${terms + lost} carrier appointments.` });
      }

      // Check for tracked talent movements
      [...(data.hire || []), ...(data.defection || [])].forEach(movement => {
        if (movement.producer && trackedProducerIds.includes(movement.producer.id)) {
          alerts.push({
            type: 'INFO',
            title: 'TRACKED TALENT MOVEMENT',
            target: `${movement.producer.first_name} ${movement.producer.last_name}`,
            detail: `Movement detected at ${agencyName}.`
          });
        }
      });
    });

    growingAgencies.sort((a, b) => b.net - a.net);
    bleedingAgencies.sort((a, b) => a.net - b.net); // Most negative first

    const uniqueAlerts = Array.from(new Set(alerts.map(a => JSON.stringify(a)))).map(a => JSON.parse(a));

    return { velocity, alerts: uniqueAlerts, growingAgencies: growingAgencies.slice(0, 3), bleedingAgencies: bleedingAgencies.slice(0, 3) };
  }, [marketData, trackedProducerIds]);

  return (
    <div className="dashboard-layout">
      {/* LEFT SIDEBAR - CARD NAV */}
      <aside className="sidebar">
        <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent-steel)', margin: '0 0 2rem 0', padding: '0 0.5rem', opacity: 0.8, letterSpacing: '1px', lineHeight: '1.4' }}>
          <div style={{ opacity: 0.6, marginTop: '4px' }}>SYS.VER: 4.1.9</div>
        </div>

        <div className="nav-group">
          <nav className="sidebar-nav">

            <button
              className={`stealth-toggle ${activeTab === 'inbox' ? 'active' : ''}`}
              onClick={() => setActiveTab('inbox')}
              style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}
            >
              <span className="toggle-indicator"></span>
              VULNERABILITY RADAR
            </button>
            <button
              className={`stealth-toggle ${activeTab === 'acquisition' ? 'active' : ''}`}
              onClick={() => setActiveTab('acquisition')}
              style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}
            >
              <span className="toggle-indicator"></span>
              ACQUISITION RADAR
            </button>
            <button
              className={`stealth-toggle ${activeTab === 'sniper' ? 'active' : ''}`}
              onClick={() => setActiveTab('sniper')}
              style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}
            >
              <span className="toggle-indicator"></span>
              MARKET SNIPER
            </button>
          </nav>
        </div>

        <div className="nav-group" style={{ marginTop: 'auto' }}>
          <nav className="sidebar-nav">


            <button
              className={`stealth-toggle ${activeTab === 'provenance' ? 'active' : ''}`}
              onClick={() => setActiveTab('provenance')}
              style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}
            >
              <span className="toggle-indicator"></span>
              DATA PROVENANCE
            </button>

            <div style={{ position: 'absolute', bottom: '1rem', width: '100%', display: 'flex', justifyContent: 'center' }}>
              <button className="stealth-toggle" onClick={() => setShowTerminateModal(true)} style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}>
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
            <div className="command-console">


              <div className="console-body" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', width: '100%', flexWrap: 'nowrap', gap: '1.5rem', overflow: 'visible', paddingBottom: '0.5rem' }}>

                {activeTab === 'movements' && (
                  <>
                    {/* Event Filter */}
                    <div className="console-section" style={{ position: 'relative' }}>
                      <span className="section-label">TRACKING</span>
                      <div style={{ position: 'relative', marginTop: '5px' }}>
                        <select
                          value={selectedEvent}
                          onChange={e => setSelectedEvent(e.target.value)}
                          style={{ background: 'transparent', border: 'none', borderBottom: 'none', color: '#f1f1f1ff', outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '20px', fontWeight: 'bold', fontSize: '0.8rem', fontFamily: 'var(--font-heading)' }}
                        >
                          <option style={{ background: 'var(--bg-base)' }} value="All Events">ALL EVENTS</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Producer Hires">PRODUCER HIRES</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Producer Exits">PRODUCER EXITS</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Whale Migrations">WHALE MIGRATIONS</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Carrier Terminations">CARRIER TERMINATIONS</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Carrier Appointments">CARRIER APPOINTMENTS</option>
                        </select>
                        <span style={{ fontSize: '0.6rem', color: '#f1f1f1ff', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</span>
                      </div>
                    </div>

                    {/* Region Filter */}
                    <div className="console-section" style={{ position: 'relative' }}>
                      <span className="section-label">IN</span>
                      <div style={{ position: 'relative', marginTop: '5px' }}>
                        <select
                          value={selectedRegion}
                          onChange={e => setSelectedRegion(e.target.value)}
                          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent-green)', color: '#FFF', outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '20px', fontWeight: 'bold', fontSize: '0.8rem', fontFamily: 'var(--font-heading)' }}
                        >
                          <option style={{ background: 'var(--bg-base)' }} value="All Texas">ALL TEXAS</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Greater Houston">HOUSTON</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Dallas-Fort Worth">DALLAS-FORT WORTH</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Austin">AUSTIN</option>
                          <option style={{ background: 'var(--bg-base)' }} value="San Antonio">SAN ANTONIO</option>
                        </select>
                        <span style={{ fontSize: '0.6rem', color: 'var(--accent-green)', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</span>
                      </div>
                    </div>

                    {/* Time Filter */}
                    <div className="console-section" style={{ position: 'relative' }}>
                      <span className="section-label">OVER THE LAST</span>
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
                  </>
                )}

                {activeTab === 'inbox' && (
                  <>
                    {/* Time Filter */}
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
                          {['7 Days', '30 Days', '60 Days'].map(t => (
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
                        {['DEFECTION', 'TERMINATION'].map(vec => (
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
                    <div className="console-section">
                      <span className="section-label">VIEW PORTFOLIO</span>
                      <div className="filter-pills" style={{ display: 'flex', gap: '0.5rem', marginTop: '5px' }}>
                        {['ENTIRE MSA', 'DIRECT COMPETITORS'].map(f => (
                          <button
                            key={f}
                            onClick={() => setCompetitorFilter(f)}
                            style={{
                              background: competitorFilter === f ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                              color: competitorFilter === f ? '#FFF' : 'var(--text-muted)',
                              border: 'none',
                              padding: '0.4rem 0.8rem',
                              borderRadius: '4px',
                              fontSize: '0.65rem',
                              fontFamily: 'var(--font-mono)',
                              cursor: 'pointer'
                            }}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Search Bar */}
                    <div className="console-section" style={{ marginLeft: 'auto' }}>
                      <span className="section-label" style={{ textAlign: 'right', display: 'block' }}>SEARCH PROTOCOL</span>
                      <div style={{ position: 'relative', marginTop: '5px' }}>
                        <input
                          type="text"
                          placeholder="Agency Name..."
                          value={searchTerm}
                          onChange={e => setSearchTerm(e.target.value)}
                          style={{ width: '200px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.2)', color: '#FFF', outline: 'none', padding: '0.4rem 0', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'acquisition' && (
                  <>
                    <div className="console-section" style={{ position: 'relative' }}>
                      <span className="section-label">TARGET VALUATION</span>
                      <div style={{ position: 'relative', marginTop: '5px' }}>
                        <select
                          value={valuationFilter}
                          onChange={e => setValuationFilter(e.target.value)}
                          style={{ background: 'transparent', border: 'none', borderBottom: 'none', color: '#f1f1f1ff', outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '20px', fontWeight: 'bold', fontSize: '0.8rem', fontFamily: 'var(--font-heading)' }}
                        >
                          <option style={{ background: 'var(--bg-base)' }} value="All Sizes">ALL VALUATIONS</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Under $500k">UNDER $500k</option>
                          <option style={{ background: 'var(--bg-base)' }} value="$500k - $2M">$500k - $2M</option>
                          <option style={{ background: 'var(--bg-base)' }} value="$2M - $5M">$2M - $5M</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Over $5M">OVER $5M</option>
                        </select>
                        <span style={{ fontSize: '0.6rem', color: '#f1f1f1ff', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</span>
                      </div>
                    </div>

                    <div className="console-section" style={{ position: 'relative' }}>
                      <span className="section-label">DISTRESS LEVEL</span>
                      <div style={{ position: 'relative', marginTop: '5px' }}>
                        <select
                          value={distressFilter}
                          onChange={e => setDistressFilter(e.target.value)}
                          style={{ background: 'transparent', border: 'none', borderBottom: 'none', color: '#f1f1f1ff', outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '20px', fontWeight: 'bold', fontSize: '0.8rem', fontFamily: 'var(--font-heading)' }}
                        >
                          <option style={{ background: 'var(--bg-base)' }} value="All Levels">ALL LEVELS</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Critical">CRITICAL THREAT</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Elevated">ELEVATED</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Low">STABLE</option>
                        </select>
                        <span style={{ fontSize: '0.6rem', color: '#f1f1f1ff', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</span>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'sniper' && (
                  <>
                    <div className="console-section" style={{ position: 'relative' }}>
                      <span className="section-label">TARGET CARRIER</span>
                      <div style={{ position: 'relative', marginTop: '5px' }}>
                        <select
                          value={sniperCarrierFilter}
                          onChange={e => setSniperCarrierFilter(e.target.value)}
                          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent-red)', color: '#FFF', outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '20px', fontWeight: 'bold', fontSize: '0.8rem', fontFamily: 'var(--font-heading)' }}
                        >
                          <option style={{ background: 'var(--bg-base)' }} value="All Carriers">ALL CARRIERS</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Travelers">TRAVELERS</option>
                          <option style={{ background: 'var(--bg-base)' }} value="State Farm">STATE FARM</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Allstate">ALLSTATE</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Progressive">PROGRESSIVE</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Chubb">CHUBB</option>
                          <option style={{ background: 'var(--bg-base)' }} value="Liberty Mutual">LIBERTY MUTUAL</option>
                        </select>
                        <span style={{ fontSize: '0.6rem', color: 'var(--accent-red)', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>▼</span>
                      </div>
                    </div>

                    <div className="console-section" style={{ position: 'relative' }}>
                      <span className="section-label">OVER THE LAST</span>
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
                          {['7 Days', '30 Days', '60 Days'].map(t => (
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

                    <div className="console-section" style={{ display: 'flex', alignItems: 'center', paddingLeft: '1rem', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: showSniperBookmarks ? '#FFF' : 'var(--text-muted)' }}>
                        <input
                          type="checkbox"
                          checked={showSniperBookmarks}
                          onChange={(e) => setShowSniperBookmarks(e.target.checked)}
                          style={{ accentColor: 'var(--accent-blue)', cursor: 'pointer', width: '14px', height: '14px' }}
                        />
                        SHOW SAVED TARGETS ({sniperBookmarks.length})
                      </label>
                    </div>
                  </>
                )}
              </div>
            </div>


            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <div className="loading-dot" style={{ display: 'inline-block', marginRight: '10px', width: '6px', height: '6px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
                SYNCING INTELLIGENCE FEED...
              </div>
            ) : (
              <>


                {(activeTab === 'inbox') && (
                  <div className="competitors-container" style={{ marginTop: '0', paddingBottom: '3rem' }}>
                    <div className="competitors-grid" style={{ display: 'flex', flexDirection: 'column' }}>
                      {Object.entries(renderData).length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No agencies match the current filters.</div>
                      ) : Object.entries(renderData)
                        .filter(([_, data]) => {
                           if (competitorFilter === 'DIRECT COMPETITORS') {
                             return data.overlap_score > 0 && data.threat_context && data.threat_context.length > 0;
                           }
                           return true;
                        })
                        .sort((a, b) => {
                          const totalA = a[1].defection.length + a[1].carrier_loss.length + a[1].agency_termination.length;
                          const totalB = b[1].defection.length + b[1].carrier_loss.length + b[1].agency_termination.length;
                          if (totalA !== totalB) return totalB - totalA;

                          let mostRecentA = 0;
                          [...a[1].defection, ...a[1].carrier_loss, ...a[1].agency_termination].forEach(evt => {
                             const t = new Date(evt.movement_date || evt.event_date).getTime();
                             if (t > mostRecentA) mostRecentA = t;
                          });
                          let mostRecentB = 0;
                          [...b[1].defection, ...b[1].carrier_loss, ...b[1].agency_termination].forEach(evt => {
                             const t = new Date(evt.movement_date || evt.event_date).getTime();
                             if (t > mostRecentB) mostRecentB = t;
                          });
                          return mostRecentB - mostRecentA;
                        })
                        .map(([agencyName, data], index) => {
                          const { total_producers_count, defection, carrier_loss, agency_termination } = data;

                          // Trust Void Calculation
                          let mostRecentDisruption = null;
                          [...defection, ...carrier_loss, ...agency_termination].forEach(evt => {
                            const evtDate = new Date(evt.movement_date || evt.event_date);
                            if (!mostRecentDisruption || evtDate > mostRecentDisruption) {
                              mostRecentDisruption = evtDate;
                            }
                          });

                          let activeTrustVoid = false;
                          let detectedDaysAgo = 0;
                          let trustVoidIntel = "";

                          if (mostRecentDisruption) {
                            const now = new Date();
                            const diffTime = now - mostRecentDisruption;
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                            if (diffDays >= -30) {
                              activeTrustVoid = true;
                              detectedDaysAgo = diffDays < 0 ? 0 : diffDays;
                              trustVoidIntel = defection.length > 0
                                ? `Lost ${defection.length} Producer(s). Clients are currently being reassigned and are highly susceptible to defection.`
                                : `Market access terminated. Agency is forced to rewrite the affected book of business, creating severe administrative friction and a high-risk window for client disruption.`;
                            }
                          }

                          // If filtering by Vulnerabilities Only
                          if (poachingVulnerableOnly && !activeTrustVoid) {
                            return null;
                          }

                          // Aggregate feed
                          let feed = [
                            ...defection.map(m => ({
                              type: 'exit', badge: 'DEFECTION', date: m.movement_date, subject: `${m.producer?.first_name || ''} ${m.producer?.last_name || ''}`.trim() || `NPN: ${m.producer?.npn}`, role: 'Producer',
                              details: activeTab === 'watchlist'
                                ? {
                                  NPN: m.producer?.npn || 'Pending',
                                  'Total Tenure': formatTenure(m.producer?.original_license_date),
                                  'Lines Affected': m.lines_affected?.join(', ') || 'Pending'
                                }
                                : { Tenure: formatTenure(m.producer?.original_license_date), 'Region': data.msa || 'Unknown', 'Product Lines': 'Pending', 'Dest.': 'Unknown' }
                            })),
                            ...[...carrier_loss, ...agency_termination].map(e => ({
                              type: 'loss', badge: 'TERMINATION', date: e.event_date, subject: e.carrier?.carrier_name || 'Unknown Carrier',
                              details: activeTab === 'watchlist'
                                ? {
                                  'Carrier Name': e.carrier?.carrier_name || 'Unknown',
                                  'Event Date': new Date(e.event_date).toLocaleDateString(),
                                  'Producers Affected': e.producers_affected_count || 0
                                }
                                : {
                                  'Carrier Name': e.carrier?.carrier_name || 'Unknown',
                                  'Event Date': new Date(e.event_date).toLocaleDateString(),
                                  'Producers Affected': e.producers_affected_count || 0
                                }
                            }))
                          ].sort((a, b) => new Date(b.date) - new Date(a.date));

                          let statExits = defection.length;
                          let statLostAppts = carrier_loss.length + agency_termination.length;



                          // Sort again just in case real events were older than the mocks
                          feed.sort((a, b) => new Date(b.date) - new Date(a.date));

                          return (
                            <div className="intelligence-card" key={`watch-${index}`} style={{ borderLeft: activeTrustVoid ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent', opacity: activeTrustVoid ? 1 : 0.6 }}>

                              {activeTrustVoid && (
                                <div style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)', padding: '0.4rem 1rem', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', letterSpacing: '1px', display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-blue)' }}></span>
                                    VULNERABILITY DETECTED
                                  </span>
                                  <span style={{ color: '#FFF' }}>{detectedDaysAgo === 0 ? 'DETECTED: TODAY' : `DETECTED: ${detectedDaysAgo} DAYS AGO`}</span>
                                </div>
                              )}

                              {/* 1. Header (Top-Span) */}
                              <div className="card-top-bar" style={{ paddingTop: activeTrustVoid ? '0.8rem' : '1.2rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#FFF' }}>{agencyName}</h3>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                    HQ: {(data.city || (data.msa ? data.msa.split('-')[0].split(',')[0] : 'Texas')).toLowerCase()}, TX &nbsp;•&nbsp; <span style={{ textTransform: 'none' }}>Producers: {total_producers_count || '?'}</span>
                                  </span>
                                </div>
                                <div>
                                  <button
                                    className="btn-ghost"
                                    onClick={(e) => { e.stopPropagation(); handleTrackAgency(data.id, agencyName); }}
                                    style={{
                                      padding: '0.3rem 0.8rem',
                                      fontSize: '0.7rem',
                                      color: watchlistedAgencyIds.includes(data.id) ? 'var(--text-muted)' : 'var(--accent-red)',
                                      borderColor: watchlistedAgencyIds.includes(data.id) ? 'transparent' : 'var(--accent-red)',
                                      background: watchlistedAgencyIds.includes(data.id) ? 'rgba(255,255,255,0.05)' : 'transparent',
                                      cursor: 'pointer',
                                      fontFamily: 'var(--font-mono)'
                                    }}
                                    onMouseOver={(e) => {
                                      if (watchlistedAgencyIds.includes(data.id)) {
                                        e.currentTarget.style.color = '#FFF';
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                                      }
                                    }}
                                    onMouseOut={(e) => {
                                      if (watchlistedAgencyIds.includes(data.id)) {
                                        e.currentTarget.style.color = 'var(--text-muted)';
                                        e.currentTarget.style.borderColor = 'transparent';
                                      }
                                    }}
                                  >
                                    {watchlistedAgencyIds.includes(data.id) ? '- UNTRACK' : '+ TRACK'}
                                  </button>
                                </div>
                              </div>

                              {/* 2. Operations (Split Middle) */}
                              <div className="card-middle-split">
                                <div className="strip-analytics" style={{ justifyContent: 'center', gap: '2rem' }}>
                                  <div className="stat-row">
                                    <span className="stat-label" style={{ fontSize: '0.65rem' }}>Producer Exits</span>
                                    <span className="stat-value" style={{ color: statExits > 0 ? '#D97706' : 'inherit' }}>{statExits}</span>
                                  </div>
                                  <div className="stat-row">
                                    <span className="stat-label" style={{ fontSize: '0.65rem' }}>Terminated Appts</span>
                                    <span className="stat-value" style={{ color: statLostAppts > 0 ? 'var(--accent-red)' : 'inherit' }}>{statLostAppts}</span>
                                  </div>
                                </div>

                                <div className="strip-content" style={{ paddingLeft: '1.5rem', flex: 1 }}>
                                  <div className="intelligence-strip-ticker" style={{ padding: 0 }}>
                                    {feed.length === 0 ? (
                                      <span style={{ color: 'var(--text-muted)' }}>No recent activity detected in the last 30 days.</span>
                                    ) : (
                                      <>
                                        {feed.slice(0, 8).map((item, idx) => (
                                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                            <div
                                              className={`ticker-event ${expandedEvent[agencyName] === idx ? 'active' : ''}`}
                                              onClick={() => setExpandedEvent(prev => ({ ...prev, [agencyName]: prev[agencyName] === idx ? null : idx }))}
                                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            >
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{
                                                  background: 'rgba(255,255,255,0.03)',
                                                  border: '1px solid rgba(255,255,255,0.08)',
                                                  padding: '0.15rem 0.4rem',
                                                  borderRadius: '3px',
                                                  fontSize: '0.65rem',
                                                  color: '#FFF',
                                                  fontFamily: 'var(--font-mono)',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: '0.4rem'
                                                }}>
                                                  <span style={{
                                                    color: item.type === 'loss' ? 'var(--accent-red)' :
                                                      item.type === 'appt' ? 'var(--accent-blue)' :
                                                        item.type === 'hire' ? 'var(--accent-green)' :
                                                          item.type === 'exit' ? '#F59E0B' : 'var(--text-muted)'
                                                  }}>[{item.badge.toUpperCase()}]</span>
                                                  <span>{item.subject}</span>
                                                </span>
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
                                        ))}
                                        {feed.length > 8 && (
                                          <div style={{ textAlign: 'center', padding: '0.6rem', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontStyle: 'italic', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', marginTop: '0.5rem', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                            + {feed.length - 8} additional events hidden to conserve space
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {activeTrustVoid && (
                                <div style={{ padding: '1rem 1.5rem', background: 'rgba(255, 255, 255, 0.02)', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1 }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '1px', fontFamily: 'var(--font-mono)' }}>INTELLIGENCE BRIEF</span>
                                    <span style={{ fontSize: '0.75rem', color: '#FFF', lineHeight: '1.4' }}>{trustVoidIntel}</span>
                                  </div>
                                </div>
                              )}

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
                                        OVERLAP SCORE: {data.overlap_score || 75}%
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
                    {hasMoreFeed && (
                      <div id="scroll-anchor" style={{ height: '20px', margin: '1rem 0' }}></div>
                    )}
                    {isFetchingFeed && feedPage > 0 && (
                      <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                        <div className="loading-dot" style={{ display: 'inline-block', marginRight: '10px', width: '6px', height: '6px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
                        LOADING MORE VULNERABILITIES...
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {!loading && activeTab === 'acquisition' && (() => {
              // 1. Convert renderData to an array of agencies
              let agencies = Object.values(renderData);

              // 2. Calculate Distress Scores & Revenue
              agencies = agencies.map(ag => {
                let score = 0;
                let triggers = [];

                // --- Insolvency & Noise Filter ---
                const noiseBlocklist = [
                  'Weston Property & Casualty Insurance Company',
                  'United Property & Casualty',
                  'FedNat',
                  'Humana Insurance Company',
                  'Aetna',
                  'UnitedHealthcare'
                ];
                const isNoise = (name) => !name || noiseBlocklist.some(b => name.includes(b));

                const defectionCount = (ag.defection || []).length;
                const hireCount = (ag.hire || []).length;
                const netHeadcount = hireCount - defectionCount;
                const totalProducers = ag.total_producers_count || 1;

                if (netHeadcount < 0) {
                  score += Math.abs(netHeadcount) * 20;
                  if (defectionCount >= 2 && defectionCount >= totalProducers / 2) {
                    triggers.push(`Mass Exodus (${defectionCount} exits)`);
                    score += 40;
                  } else {
                    triggers.push(`Lost ${Math.abs(netHeadcount)} Producers`);
                  }
                } else if (totalProducers === 1 && hireCount === 0) {
                  triggers.push('Ideal Book-of-Business Roll-up');
                } else if (totalProducers <= 2 && hireCount === 0) {
                  triggers.push('Stagnant / Aging Agency');
                  score += 15;
                }

                const wholesaleBlocklist = [
                  'Home State County Mutual',
                  'Gainsco',
                  'Elephant',
                  'Mendota',
                  'Consumers County',
                  'Old American County',
                  'Bristol West',
                  'Dairyland'
                ];
                const isWholesale = (name) => name && wholesaleBlocklist.some(w => name.includes(w));

                const cleanCarrierLosses = (ag.carrier_loss || [])
                  .map(e => e.carrier?.carrier_name)
                  .filter(name => !isNoise(name));
                const uniqueLostNames = Array.from(new Set(cleanCarrierLosses));

                const standardLost = uniqueLostNames.filter(n => !isWholesale(n));
                const wholesaleLost = uniqueLostNames.filter(n => isWholesale(n));

                if (standardLost.length > 0) {
                  score += standardLost.length * 30;
                  triggers.push(`Lost Direct Contract: ${standardLost.slice(0, 2).join(', ')}${standardLost.length > 2 ? '...' : ''}`);
                }
                const noDirectMarkets = (ag.agency_carrier_appointments || []).length === 0;

                if (wholesaleLost.length > 0) {
                  score += wholesaleLost.length * 5; // Minor penalty for losing a wholesale sub-code
                  if (noDirectMarkets) {
                    triggers.push(`Wholesaler Dependent: No direct standard markets remaining; non-standard auto shifted to ${wholesaleLost[0]}${wholesaleLost.length > 1 ? '...' : ''}`);
                  } else {
                    triggers.push(`Shifted non-standard book to ${wholesaleLost[0]}${wholesaleLost.length > 1 ? '...' : ''}`);
                  }
                } else if (noDirectMarkets) {
                  triggers.push('Wholesaler Dependent (No Direct Markets)');
                }

                if (noDirectMarkets) {
                  score += 25;
                }

                const cleanTerminations = (ag.agency_termination || [])
                  .map(e => e.carrier?.carrier_name)
                  .filter(name => !isNoise(name));
                const uniqueTermNames = Array.from(new Set(cleanTerminations));

                const standardTerms = uniqueTermNames.filter(n => !isWholesale(n));

                if (standardTerms.length > 0) {
                  score += standardTerms.length * 50;
                  triggers.push(`Direct Carrier Squeeze: ${standardTerms.slice(0, 2).join(', ')}${standardTerms.length > 2 ? '...' : ''}`);
                }

                let distressLevel = 'Low';
                let distressColor = 'var(--accent-green)';
                if (score > 60) { distressLevel = 'Critical'; distressColor = 'var(--accent-red)'; }
                else if (score >= 20) { distressLevel = 'Elevated'; distressColor = '#F59E0B'; }

                const baseRevenue = totalProducers * 200000;
                const baseMultiple = baseRevenue < 300000 ? 1.8 : 2.5;

                let discountTotal = 0;
                if (standardLost.length > 0) discountTotal += 0.25;
                if (noDirectMarkets) discountTotal += 0.20;
                if (totalProducers <= 2 && hireCount === 0 && totalProducers !== 1) discountTotal += 0.15;
                if (totalProducers === 1) discountTotal += 0.20;

                const adjustedMultiple = Math.max(0.5, baseMultiple - discountTotal);
                const probableValLow = baseRevenue * adjustedMultiple;
                const probableValHigh = baseRevenue * (adjustedMultiple + 0.35);
                const strategicValue = baseRevenue * baseMultiple;

                return {
                  ...ag,
                  distressScore: score,
                  distressLevel,
                  distressColor,
                  triggers,
                  baseRevenue,
                  adjustedMultiple,
                  probableValLow,
                  probableValHigh,
                  strategicValue,
                  netHeadcount
                };
              });

              // Apply Local Filters
              if (distressFilter !== 'All Levels') {
                agencies = agencies.filter(ag => ag.distressLevel === distressFilter);
              }
              if (valuationFilter !== 'All Sizes') {
                agencies = agencies.filter(ag => {
                  const val = ag.probableValHigh;
                  if (valuationFilter === 'Under $500k') return val < 500000;
                  if (valuationFilter === '$500k - $2M') return val >= 500000 && val <= 2000000;
                  if (valuationFilter === '$2M - $5M') return val >= 2000000 && val <= 5000000;
                  if (valuationFilter === 'Over $5M') return val > 5000000;
                  return true;
                });
              }

              // 3. Sort by Distress Score descending
              agencies.sort((a, b) => b.distressScore - a.distressScore);

              return (
                <div className="directory-container" style={{ marginTop: '1.5rem', paddingBottom: '3rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {agencies.map((ag, index) => {
                      const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

                      return (
                        <div key={ag.id + '-' + index} style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderLeft: `3px solid ${ag.distressScore > 20 ? ag.distressColor : 'transparent'}`, borderRadius: '6px', overflow: 'hidden', transition: 'all 0.2s' }}>
                          <div style={{ padding: '0.8rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                            <div style={{ flex: '0 0 25%', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', color: '#FFF' }}>{ag.name}</h3>
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--accent-blue)' }}>{ag.city || 'Texas'}</div>
                              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.1rem' }}>
                                <span style={{ fontSize: '0.65rem', color: '#FFF' }}>{ag.total_producers_count} Producers</span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>|</span>
                                <span style={{ fontSize: '0.65rem', color: '#FFF' }}>{(ag.category || '').replace(/_/g, ' ')}</span>
                              </div>
                              {ag.owner_name && (
                                <div style={{ marginTop: '0.8rem', padding: '0.4rem', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', borderLeft: '2px solid var(--accent-blue)' }}>
                                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>PRINCIPAL / OWNER</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#FFF', fontWeight: 'bold' }}>{ag.owner_name}</span>
                                    <a
                                      href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(ag.owner_name + ' ' + ag.name + ' Insurance')}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.2rem',
                                        background: '#0a66c2',
                                        color: '#FFF',
                                        padding: '0.15rem 0.4rem',
                                        borderRadius: '3px',
                                        textDecoration: 'none',
                                        fontSize: '0.55rem',
                                        fontWeight: 'bold',
                                        transition: 'background 0.2s'
                                      }}
                                      onMouseOver={(e) => e.currentTarget.style.background = '#004182'}
                                      onMouseOut={(e) => e.currentTarget.style.background = '#0a66c2'}
                                    >
                                      <span>in</span> SEARCH
                                    </a>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', gap: '0.3rem', borderLeft: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '0 1rem' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                                {ag.triggers.length > 0 ? ag.triggers.map((t, i) => (
                                  <span key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.15rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                    <span style={{ color: ag.distressColor, marginRight: '4px', fontSize: '0.7rem' }}>•</span>{t}
                                  </span>
                                )) : (
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Stable / No recent attrition</span>
                                )}
                              </div>
                            </div>

                            <div style={{ flex: '0 0 35%', display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingLeft: '1.5rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>DISTRESS</span>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: ag.distressColor }}>{ag.distressLevel.toUpperCase()}</span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.5px', marginBottom: '0.1rem' }}>EST. BOOK VALUE</div>
                                  <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                                    {formatter.format(ag.probableValLow)} — {formatter.format(ag.probableValHigh)}
                                  </span>
                                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    Based on {ag.adjustedMultiple.toFixed(2)}x - {(ag.adjustedMultiple + 0.35).toFixed(2)}x multiple
                                  </div>
                                </div>
                              </div>
                              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.4rem', borderRadius: '4px', borderLeft: '2px solid var(--accent-blue)', marginTop: '0.2rem' }}>
                                <span style={{ fontSize: '0.65rem', color: '#FFF', display: 'block', lineHeight: '1.4' }}>
                                  ⚡ <strong style={{ color: 'var(--accent-blue)' }}>Buyer Value Premium:</strong> Intrinsic value is <strong style={{ color: 'var(--accent-green)' }}>{formatter.format(ag.strategicValue)}+</strong> if integrated with standard markets.
                                </span>
                              </div>
                            </div>

                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              );
            })()}

            {activeTab === 'sniper' && (() => {
              // 1. Gather all carrier terminations and losses from marketData
              let sniperEvents = [];
              Object.entries(marketData).forEach(([agencyName, data]) => {
                // Apply Region Filter
                if (selectedRegion !== 'All Texas' && data.msa !== selectedRegion) return;

                const parseTimeFilter = (filterStr) => {
                  const days = parseInt(filterStr.split(' ')[0], 10);
                  if (isNaN(days)) return null;
                  const cutoff = new Date();
                  cutoff.setDate(cutoff.getDate() - days);
                  return cutoff;
                };
                const cutoffDate = parseTimeFilter(timeFilter);

                const processEvents = (events, eventType) => {
                  (events || []).forEach(e => {
                    const cName = e.carrier?.carrier_name || 'Unknown Carrier';
                    if (sniperCarrierFilter !== 'All Carriers' && cName.toUpperCase() !== sniperCarrierFilter.toUpperCase()) return;
                    if (cutoffDate && new Date(e.event_date) < cutoffDate) return;

                    const eventId = e.id || `${agencyName}-${cName}-${e.event_date}`;
                    if (showSniperBookmarks && !sniperBookmarks.includes(eventId)) return;

                    // Distress Context
                    let otherTerminations = (data.carrier_loss?.length || 0) + (data.agency_termination?.length || 0) - 1;

                    // Threat Context (Producer Exits)
                    const recentDefections = data.defection?.length || 0;

                    // Vacuum Size (Total Producers)
                    const totalProducers = data.total_producers_count || 1;
                    let vacuumLabel = "Small / Independent";
                    let vacuumColor = "var(--text-muted)";
                    if (totalProducers >= 15) { vacuumLabel = "Massive Premium Vacuum"; vacuumColor = "var(--text-main)"; }
                    else if (totalProducers >= 5) { vacuumLabel = "Significant Premium Vacuum"; vacuumColor = "var(--text-muted)"; }

                    let intelBrief = "";
                    if (recentDefections > 0) {
                      intelBrief += `Bleeding Staff: Lost ${recentDefections} producer(s). `;
                    }
                    if (otherTerminations > 0) {
                      intelBrief += `Market Collapse: Lost ${otherTerminations} other standard market(s). `;
                    }
                    if (!intelBrief) {
                      intelBrief = `Isolated carrier termination. Territory gap identified.`;
                    }

                    sniperEvents.push({
                      id: eventId,
                      agencyName,
                      city: data.city || 'Texas',
                      totalProducers,
                      carrierName: cName,
                      eventDate: new Date(e.event_date).toLocaleDateString(),
                      eventType,
                      vacuumLabel,
                      vacuumColor,
                      intelBrief,
                      distressColor: (otherTerminations > 0 || recentDefections > 0) ? 'rgba(255,255,255,0.4)' : 'transparent'
                    });
                  });
                };

                processEvents(data.carrier_loss, 'Carrier Loss');
                processEvents(data.agency_termination, 'Agency Termination');
              });

              // Sort by date descending (most recent first)
              sniperEvents.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));

              return (
                <div className="directory-container" style={{ marginTop: '1.5rem', paddingBottom: '3rem' }}>
                  {sniperEvents.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No carrier terminations match the current filters.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {sniperEvents.map((evt, index) => (
                        <div key={evt.id + '-' + index} style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderLeft: `3px solid ${evt.distressColor}`, borderRadius: '6px', overflow: 'hidden', transition: 'all 0.2s' }}>
                          <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>TARGET AGENCY</span>
                              <h3 style={{ margin: 0, fontSize: '1rem', color: '#FFF' }}>{evt.agencyName}</h3>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{evt.city}</span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{evt.totalProducers} Producers</span>
                              </div>
                            </div>

                            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: '1rem' }}>
                              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>TERMINATED CARRIER</span>
                              <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#FFF', fontFamily: 'var(--font-heading)' }}>{evt.carrierName.toUpperCase()}</span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Effective: {evt.eventDate}</span>
                            </div>

                            <div style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'rgba(255,255,255,0.03)', padding: '0.6rem', borderRadius: '4px' }}>
                              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>INTELLIGENCE BRIEF</span>
                              <span style={{ fontSize: '0.7rem', color: evt.vacuumColor, fontWeight: 'bold', marginBottom: '0.1rem' }}>{evt.vacuumLabel}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>{evt.intelBrief}</span>
                            </div>

                            <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                              <button
                                onClick={() => {
                                  if (sniperBookmarks.includes(evt.id)) {
                                    setSniperBookmarks(prev => prev.filter(id => id !== evt.id));
                                  } else {
                                    setSniperBookmarks(prev => [...prev, evt.id]);
                                  }
                                }}
                                style={{ background: 'transparent', color: sniperBookmarks.includes(evt.id) ? 'var(--accent-blue)' : 'var(--text-muted)', border: `1px solid ${sniperBookmarks.includes(evt.id) ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)'}`, padding: '0.6rem 0.8rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 0.2s' }}
                              >
                                {sniperBookmarks.includes(evt.id) ? '★ SAVED' : '☆ SAVE'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}



            {activeTab === 'provenance' && (
              <div className="provenance-container" style={{ animation: 'fade-in 0.3s ease-out' }}>
                {/* 1. Global Uplink Status (Header) */}
                <div className="command-console" style={{ marginBottom: '2rem' }}>
                  <div className="console-header" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', padding: '0.8rem 1.5rem', background: 'rgba(10, 14, 23, 0.95)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '2px' }}>SYSTEM UPLINK</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-green)', fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-green)', boxShadow: '0 0 10px var(--accent-green)' }}></span>
                        ACTIVE
                      </span>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '3rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-end' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '2px' }}>TOTAL RECORDS MONITORED</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#FFF', fontFamily: 'var(--font-mono)' }}>14,204,819</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-end' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '2px' }}>LAST GLOBAL SYNC</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>T-MINUS 14 MINUTES</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Ingestion Pipelines (Data Sources) */}
                <div style={{ marginBottom: '2rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '2px', marginBottom: '1rem', display: 'block' }}>INGESTION PIPELINES</span>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>

                    {/* Node 1: NIPR */}
                    <div style={{ flex: 1, minWidth: '280px', border: '1px solid var(--border-subtle)', background: 'rgba(10, 14, 23, 0.5)', padding: '1.2rem', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: 'var(--accent-green)', boxShadow: '0 0 8px var(--accent-green)' }}></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1rem', color: '#FFF', fontFamily: 'var(--font-heading)' }}>NIPR ENDPOINT</h4>
                        <span style={{ color: 'var(--accent-green)', fontSize: '0.6rem', fontFamily: 'var(--font-mono)', letterSpacing: '1px', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.2rem 0.5rem', borderRadius: '2px' }}>[ SYNCED ]</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>SOURCE:</span>
                          <span style={{ color: '#FFF' }}>National Insurance Producer Registry</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>PAYLOAD:</span>
                          <span style={{ color: '#FFF', textAlign: 'right' }}>Producer Licenses, NPNs, LOA</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>LATENCY:</span>
                          <span style={{ color: '#FFF' }}>24 HOURS</span>
                        </div>
                      </div>
                    </div>

                    {/* Node 2: State DOI */}
                    <div style={{ flex: 1, minWidth: '280px', border: '1px solid var(--border-subtle)', background: 'rgba(10, 14, 23, 0.5)', padding: '1.2rem', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: 'var(--accent-green)', boxShadow: '0 0 8px var(--accent-green)' }}></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1rem', color: '#FFF', fontFamily: 'var(--font-heading)' }}>STATE DOI FEED</h4>
                        <span style={{ color: 'var(--accent-green)', fontSize: '0.6rem', fontFamily: 'var(--font-mono)', letterSpacing: '1px', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.2rem 0.5rem', borderRadius: '2px' }}>[ SYNCED ]</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>SOURCE:</span>
                          <span style={{ color: '#FFF' }}>Department of Insurance (TDI)</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>PAYLOAD:</span>
                          <span style={{ color: '#FFF', textAlign: 'right' }}>Appointments, Terminations</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>LATENCY:</span>
                          <span style={{ color: '#FFF' }}>48 HOURS</span>
                        </div>
                      </div>
                    </div>

                    {/* Node 3: Carrier APIs */}
                    <div style={{ flex: 1, minWidth: '280px', border: '1px solid var(--border-subtle)', background: 'rgba(10, 14, 23, 0.5)', padding: '1.2rem', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: '#F59E0B', boxShadow: '0 0 8px #F59E0B' }}></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1rem', color: '#FFF', fontFamily: 'var(--font-heading)' }}>CARRIER ENDPOINTS</h4>
                        <span style={{ color: '#F59E0B', fontSize: '0.6rem', fontFamily: 'var(--font-mono)', letterSpacing: '1px', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.2rem 0.5rem', borderRadius: '2px' }}>[ PARTIAL DEGRADATION ]</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>SOURCE:</span>
                          <span style={{ color: '#FFF' }}>Public Carrier Networks</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>PAYLOAD:</span>
                          <span style={{ color: '#FFF', textAlign: 'right' }}>M&A Footprints, Regional Capacity</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>STATUS:</span>
                          <span style={{ color: '#F59E0B' }}>RE-ROUTING...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Inference Engine (Confidence Matrix) */}
                <div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '2px', marginBottom: '1rem', display: 'block' }}>INFERENCE ENGINE LOGIC</span>
                  <div style={{ border: '1px solid var(--border-subtle)', background: 'rgba(10, 14, 23, 0.5)', borderRadius: '4px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: '1px solid rgba(255, 42, 85, 0.3)', borderRadius: '2px' }}>EVENT: DEFECTION</span>
                        <span style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>CONFIDENCE: HIGH</span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                        Identified when a producer drops &ge; 3 carrier appointments at an Origin Agency and registers identical appointments at a Destination Agency within a 14-day window. If the producer's tenure is &lt; 3 years, the event is classified as low-impact and filtered from the Macro Trends feed.
                      </p>
                    </div>

                    <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '2px' }}>EVENT: CARRIER SQUEEZE</span>
                        <span style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>CONFIDENCE: VERY HIGH</span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                        Triggered when a single carrier (e.g., Travelers, Safeco) terminates appointments for &ge; 25% of an agency's total producer roster simultaneously. Correlated against regional loss-ratio data to determine if the termination was due to unprofitability or lack of production.
                      </p>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '2px' }}>EVENT: M&A ACQUISITION</span>
                        <span style={{ color: '#F59E0B', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>CONFIDENCE: MODERATE</span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                        Inferred when an independent agency transfers 100% of its active producer licenses to a national top-100 aggregator (e.g., Acrisure, Hub International) within a 48-hour window. Awaiting confirmation via carrier network endpoints to upgrade confidence level.
                      </p>
                    </div>

                  </div>
                </div>

              </div>
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
      {/* SESSION TERMINATION PROTOCOL MODAL */}
      {showTerminateModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: '#0a0e17', border: '1px solid rgba(255,255,255,0.1)', padding: '2rem', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--accent-red)', margin: '0 0 1rem 0' }}>TERMINATE SESSION?</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>Are you sure you want to disconnect from the intelligence terminal?</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button className="btn-ghost" onClick={() => setShowTerminateModal(false)}>CANCEL</button>
              <button className="btn-primary" style={{ background: 'var(--accent-red)', color: 'white', border: 'none' }} onClick={() => window.location.href = '/'}>CONFIRM</button>
            </div>
          </div>
        </div>
      )}

      {acquiredTarget && (
        <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 10000, animation: 'slide-up 0.3s ease-out' }}>
          <div style={{ background: 'rgba(10,14,23,0.95)', borderLeft: '3px solid var(--accent-blue)', padding: '1.2rem', borderRadius: '4px', maxWidth: '350px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', borderRight: '1px solid rgba(255,255,255,0.05)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <h3 style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', margin: 0, letterSpacing: '1px' }}>TRACKING INITIATED</h3>
              <button onClick={() => setAcquiredTarget(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>×</button>
            </div>
            <p style={{ color: '#FFF', fontSize: '1rem', margin: '0 0 0.4rem 0', fontFamily: 'var(--font-heading)' }}>{acquiredTarget}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: '1.4', margin: 0 }}>
              Live alerts configured. You will be notified immediately of any carrier or agency movement.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
