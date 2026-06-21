const fs = require('fs');

let content = fs.readFileSync('src/pages/Dashboard.jsx', 'utf8');

// 1. Tab renaming
content = content.replace(/const \[activeTab, setActiveTab\] = useState\('producers'\)/g, "const [activeTab, setActiveTab] = useState('acquisition')");
content = content.replace(/TALENT RADAR/g, 'ACQUISITION RADAR');
content = content.replace(/activeTab === 'producers'/g, "activeTab === 'acquisition'");
content = content.replace(/setActiveTab\('producers'\)/g, "setActiveTab('acquisition')");

// 2. Remove legacy producer fetch hook
const hookStart = content.indexOf("  useEffect(() => {\n    if (activeTab !== 'acquisition') return;");
if (hookStart !== -1) {
  const hookEnd = content.indexOf("  }, [producerSearchQuery, activeTab, producerFilter, trackedProducerIds, filterName, filterNpn, filterSpecialty, filterAgency]);", hookStart);
  if (hookEnd !== -1) {
    const fullEnd = hookEnd + "  }, [producerSearchQuery, activeTab, producerFilter, trackedProducerIds, filterName, filterNpn, filterSpecialty, filterAgency]);".length;
    content = content.substring(0, hookStart) + content.substring(fullEnd);
  }
}

// 3. Replace massive UI block
const uiStart = content.indexOf("            {!loading && activeTab === 'acquisition' && (() => {");
if (uiStart !== -1) {
  const uiEnd = content.indexOf("            })()}", uiStart);
  if (uiEnd !== -1) {
    const fullUiEnd = uiEnd + "            })()}".length;
    
    const newUiBlock = `            {!loading && activeTab === 'acquisition' && (() => {
              // 1. Convert renderData to an array of agencies
              let agencies = Object.values(renderData);

              // 2. Calculate Distress Scores & Revenue
              agencies = agencies.map(ag => {
                let score = 0;
                let triggers = [];

                const defectionCount = (ag.defection || []).length;
                const hireCount = (ag.hire || []).length;
                const netHeadcount = hireCount - defectionCount;

                if (netHeadcount < 0) {
                  score += Math.abs(netHeadcount) * 20;
                  triggers.push(\`Lost \${Math.abs(netHeadcount)} Producers\`);
                }

                const carrierLossCount = (ag.carrier_loss || []).length;
                if (carrierLossCount > 0) {
                  score += carrierLossCount * 30;
                  triggers.push(\`Lost \${carrierLossCount} Markets\`);
                }

                const terminationCount = (ag.agency_termination || []).length;
                if (terminationCount > 0) {
                  score += terminationCount * 50;
                  triggers.push('Carrier Squeeze');
                }

                let distressLevel = 'Low';
                let distressColor = 'var(--accent-green)';
                if (score > 60) { distressLevel = 'Critical'; distressColor = 'var(--accent-red)'; }
                else if (score > 20) { distressLevel = 'Elevated'; distressColor = '#F59E0B'; }

                const estRevenue = (ag.total_producers_count || 1) * 200000;

                return {
                  ...ag,
                  distressScore: score,
                  distressLevel,
                  distressColor,
                  triggers,
                  estRevenue,
                  netHeadcount
                };
              });

              // 3. Sort by Distress Score descending
              agencies.sort((a, b) => b.distressScore - a.distressScore);

              return (
                <div className="directory-container" style={{ marginTop: '1.5rem', paddingBottom: '3rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#FFF', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>M&A INTELLIGENCE ENGINE</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mathematically ranking {agencies.length} agencies by vulnerability</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {agencies.map((ag, index) => {
                      const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
                      
                      return (
                        <div key={ag.id + '-' + index} style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255, 255, 255, 0.02)', border: \`1px solid \${ag.distressScore > 20 ? ag.distressColor : 'rgba(255, 255, 255, 0.05)'}\`, borderRadius: '8px', overflow: 'hidden', transition: 'all 0.2s' }}>
                          <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            
                            <div style={{ flex: '0 0 35%', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#FFF' }}>{ag.name}</h3>
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)' }}>{ag.city || 'Texas'}</div>
                              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.2rem' }}>
                                <span style={{ fontSize: '0.7rem', color: '#FFF' }}>{ag.total_producers_count} Producers</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>|</span>
                                <span style={{ fontSize: '0.7rem', color: '#FFF' }}>{(ag.category || '').replace(/_/g, ' ')}</span>
                              </div>
                            </div>

                            <div style={{ flex: '0 0 35%', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.1)', padding: '0 1.5rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>VULNERABILITY SIGNALS</span>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {ag.triggers.length > 0 ? ag.triggers.map((t, i) => (
                                  <span key={i} style={{ background: 'rgba(255,42,85,0.1)', border: \`1px solid \${ag.distressColor}\`, padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.65rem', color: ag.distressColor, fontFamily: 'var(--font-mono)' }}>
                                    ⚠ {t}
                                  </span>
                                )) : (
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Stable / No recent attrition</span>
                                )}
                              </div>
                            </div>

                            <div style={{ flex: '0 0 30%', display: 'flex', flexDirection: 'column', gap: '0.8rem', alignItems: 'flex-end' }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.5px', marginBottom: '0.2rem' }}>EST. BOOK REVENUE</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>{formatter.format(ag.estRevenue)}</span>
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>DISTRESS LEVEL</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: ag.distressColor }}>{ag.distressLevel.toUpperCase()}</span>
                              </div>
                            </div>

                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              );
            })()}`;
    
    content = content.substring(0, uiStart) + newUiBlock + content.substring(fullUiEnd);
  } else {
      console.log("Could not find uiEnd");
  }
} else {
    console.log("Could not find uiStart");
}

fs.writeFileSync('src/pages/Dashboard.jsx', content);
console.log('Refactoring complete!');
