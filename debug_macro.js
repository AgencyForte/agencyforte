import fs from 'fs';

// Mock the state logic to see where the data gets destroyed
const globalAgencies = [
  { id: '1', agency_name: 'Apex Brokers', location: { msa: 'Greater Houston' } },
  { id: '2', agency_name: 'Titan Insurance Group', location: { msa: 'Dallas-Fort Worth' } }
];

const globalMovements = [
  {
    id: 'm1',
    movement_type: 'EXITED',
    from_agency_id: '1',
    to_agency_id: null,
    producer: { original_license_date: '2008-08-08' },
    from_agency: { agency_name: 'Apex Brokers' },
    to_agency: null
  },
  {
    id: 'm2',
    movement_type: 'HIRED',
    from_agency_id: '1',
    to_agency_id: '2',
    producer: { original_license_date: '2010-10-10' },
    from_agency: { agency_name: 'Apex Brokers' },
    to_agency: { agency_name: 'Titan Insurance Group' }
  }
];

const globalEvents = [
  {
    event_type: 'MASS_TERMINATION',
    agency_id: '1',
    carrier: { carrier_name: 'Liberty Mutual' }
  }
];

const globalGrouped = {};
globalAgencies.forEach(ag => {
  globalGrouped[ag.agency_name] = {
    id: ag.id,
    msa: ag.location?.msa,
    defection: [], hire: [], carrier_loss: [], agency_termination: [], new_appt: []
  }
});

globalMovements.forEach(m => {
  const tenureYears = m.producer?.original_license_date
    ? (new Date() - new Date(m.producer.original_license_date)) / 31536000000
    : 0;
  if (tenureYears < 3) return;

  if (m.from_agency_id) {
    const aName = m.from_agency?.agency_name
    if (aName && globalGrouped[aName]) globalGrouped[aName].defection.push(m)
  }

  if (m.to_agency_id) {
    const aName = m.to_agency?.agency_name
    if (aName && globalGrouped[aName]) globalGrouped[aName].hire.push(m)
  }
});

globalEvents.forEach(e => {
  const aName = globalAgencies.find(a => a.id === e.agency_id)?.agency_name
  if (aName && globalGrouped[aName]) {
    if (e.event_type === 'MASS_TERMINATION') globalGrouped[aName].agency_termination.push(e)
  }
});

const getTenureYears = (licDate) => {
  if (!licDate) return 0;
  return ((new Date() - new Date(licDate)) / (1000 * 60 * 60 * 24 * 365.25));
}

let agenciesArr = Object.entries(globalGrouped).map(([name, data]) => ({ name, ...data }));
const hideJuniorAttrition = true;

let processedAgencies = agenciesArr.map(ag => {
  let hire = ag.hire;
  let defection = ag.defection;

  if (hideJuniorAttrition) {
    hire = hire.filter(e => getTenureYears(e.producer?.original_license_date) >= 3);
    defection = defection.filter(e => getTenureYears(e.producer?.original_license_date) >= 3);
  }

  return { ...ag, hire, defection };
});

const topExpanders = [...processedAgencies].sort((a, b) => b.hire.length - a.hire.length).slice(0, 10).filter(a => a.hire.length > 0);
const topUnstable = [...processedAgencies].sort((a, b) => b.defection.length - a.defection.length).slice(0, 10).filter(a => a.defection.length > 0);

let whaleAgencies = agenciesArr.map(ag => {
  let defection = ag.defection.filter(e => getTenureYears(e.producer?.original_license_date) >= 5);
  return { ...ag, defection };
});
const topWhales = [...whaleAgencies].sort((a, b) => b.defection.length - a.defection.length).slice(0, 10).filter(a => a.defection.length > 0);

const carrierLossCounts = {};
agenciesArr.forEach(ag => {
  const losses = [...ag.carrier_loss, ...ag.agency_termination];
  losses.forEach(e => {
    const cName = e.carrier?.carrier_name || 'Unknown Carrier';
    carrierLossCounts[cName] = (carrierLossCounts[cName] || 0) + 1;
  });
});
const topCarriers = Object.entries(carrierLossCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);

console.log("Top Expanders:", topExpanders.length);
console.log("Top Unstable:", topUnstable.length);
console.log("Top Whales:", topWhales.length);
console.log("Top Carriers:", topCarriers.length);

const macroTrends = { topExpanders, topUnstable, topWhales, topCarriers, topApptCarriers: [] };
const feed = [];
macroTrends.topWhales.forEach(ag => {
  feed.push({ type: 'HIGH-VALUE TARGET', text: `VETERAN DEFECTION: ${ag.name.toUpperCase()} LOST -${ag.defection.length} SENIOR PRODUCERS.` })
});
console.log("Threat Feed Length:", feed.length);
