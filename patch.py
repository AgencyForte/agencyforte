import re

with open('b:/agencyforte_app/src/pages/Dashboard.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. State
code = code.replace("const [activeTab, setActiveTab] = useState('watchlist')", "const [activeTab, setActiveTab] = useState('inbox')")

# 2. Logic filter
code = code.replace("} else if (activeTab === 'watchlist') {", "} else if (activeTab === 'inbox' || activeTab === 'directory') {")

filter_code = """      if (!activeVectors.includes('ACQUISITION')) agencyData.hire = [];
      if (!activeVectors.includes('NEW MARKET')) agencyData.new_appt = [];

      if (activeTab === 'directory') {
        renderData[agencyName] = agencyData;
      } else {
        if (agencyData.defection.length > 0 || agencyData.hire.length > 0 || agencyData.carrier_loss.length > 0 || agencyData.agency_termination.length > 0 || agencyData.new_appt.length > 0) {
          renderData[agencyName] = agencyData;
        }
      }
    })"""
old_filter_code = """      if (!activeVectors.includes('ACQUISITION')) agencyData.hire = [];
      if (!activeVectors.includes('NEW MARKET')) agencyData.new_appt = [];

      renderData[agencyName] = agencyData
    })"""
code = code.replace(old_filter_code, filter_code)

# 3. Sidebar tabs
old_tabs = """            <button
              className={`stealth-toggle ${activeTab === 'watchlist' ? 'active' : ''}`}
              onClick={() => setActiveTab('watchlist')}
              style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}
            >
              <span className="toggle-indicator"></span>
              WATCHLIST
            </button>"""
new_tabs = """            <button
              className={`stealth-toggle ${activeTab === 'inbox' ? 'active' : ''}`}
              onClick={() => setActiveTab('inbox')}
              style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}
            >
              <span className="toggle-indicator"></span>
              THREAT INBOX
            </button>
            <button
              className={`stealth-toggle ${activeTab === 'directory' ? 'active' : ''}`}
              onClick={() => setActiveTab('directory')}
              style={{ width: '90%', justifyContent: 'flex-start', margin: '0.3rem 0', padding: '0.4rem 0.8rem' }}
            >
              <span className="toggle-indicator"></span>
              ALL COMPETITORS
            </button>"""
code = code.replace(old_tabs, new_tabs)

# 4. Filter bar UI (keep same for inbox)
code = code.replace("activeTab === 'watchlist' && (", "activeTab === 'inbox' && (")

# 5. Render activeTab === inbox vs directory
inbox_render = """            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <div className="loading-dot" style={{ display: 'inline-block', marginRight: '10px', width: '6px', height: '6px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
                SYNCING INTELLIGENCE FEED...
              </div>
            ) : (
              (activeTab === 'inbox') && (
                <div className="competitors-grid" style={{ display: 'flex', flexDirection: 'column' }}>
                  {Object.entries(renderData).length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Inbox Zero. No immediate threats detected in your network.</div>
                  ) : Object.entries(renderData)"""

code = code.replace("""            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <div className="loading-dot" style={{ display: 'inline-block', marginRight: '10px', width: '6px', height: '6px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
                SYNCING INTELLIGENCE FEED...
              </div>
            ) : (
              activeTab === 'watchlist' && (
                <div className="competitors-grid" style={{ display: 'flex', flexDirection: 'column' }}>
                  {Object.entries(renderData).length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No agencies match the current filters.</div>
                  ) : Object.entries(renderData)""", inbox_render)

directory_render = """                  }
                </div>
              )
            )}
            
            {!loading && activeTab === 'directory' && (
              <div className="directory-container" style={{ marginTop: '1.5rem', paddingBottom: '3rem' }}>
                <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>TRACKING {Object.keys(renderData).length} ICP AGENCIES</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem 0' }}>AGENCY NAME</th>
                      <th style={{ padding: '0.5rem 0' }}>LOCATION</th>
                      <th style={{ padding: '0.5rem 0' }}>PRODUCERS</th>
                      <th style={{ padding: '0.5rem 0' }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(renderData).map(([name, data]) => (
                      <tr key={name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '0.8rem 0', color: '#FFF' }}>{name}</td>
                        <td style={{ padding: '0.8rem 0', color: 'var(--text-muted)' }}>{data.msa || 'Unknown'}</td>
                        <td style={{ padding: '0.8rem 0', color: 'var(--accent-steel)' }}>{data.total_producers_count || 0} ACTIVE</td>
                        <td style={{ padding: '0.8rem 0', color: 'var(--accent-green)' }}>SYNCED</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
"""

code = code.replace("""                  }
                </div>
              )
            )}""", directory_render)

with open('b:/agencyforte_app/src/pages/Dashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(code)

print('Dashboard updated successfully!')
