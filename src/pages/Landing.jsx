import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <>
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>
      <div className="noise-overlay"></div>

      <header className="glass-header">
        <div className="logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          AGENCY<span>FORTE</span>
        </div>
        <nav>
          <a href="#the-diff">Intelligence</a>
          <a href="#features">Arsenal</a>
          <a href="#pricing">Pricing</a>
          <Link to="/login" className="btn-ghost">Client Login</Link>
          <Link to="/onboarding" className="btn-primary-small">Arm Watchlist</Link>
        </nav>
      </header>

      <main>
        <section className="hero fade-in-up">
          <div className="compliance-badge">
            <span className="indicator pulse"></span>
            <span>100% Legally Compliant</span>
            <span className="badge-divider">|</span>
            <span className="badge-muted">Texas Public Information Act Protection</span>
          </div>
          
          <h1 className="text-gradient">The Vulnerability<br/>Tripwire Engine</h1>
          <p className="subtitle">Stop waiting for industry gossip. Deploy automated intelligence to detect your competitors' operational failures and execute surgical market raids within hours.</p>
          
          <div className="hero-actions">
            <Link to="/onboarding" className="btn-primary">
              Start 14-Day Free Trial
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
          </div>

          <div className="mockup-container">
            <div className="mockup-glass">
              <div className="mockup-header">
                <div className="window-controls">
                  <span className="dot red"></span>
                  <span className="dot yellow"></span>
                  <span className="dot green"></span>
                </div>
                <span className="mockup-title">sys_alert_log.sh — Live Stream</span>
                <div className="status-indicator">Connected</div>
              </div>
              <div className="mockup-body">
                <div className="scanline"></div>
                <p><span className="time">[08:42:01]</span> <span className="muted">INITIATING DEEP SCAN: HOUSTON MSA...</span></p>
                <p><span className="time">[08:42:03]</span> <span className="muted">ANALYZING 14,203 ACTIVE APPOINTMENTS...</span></p>
                <p><span className="time">[08:42:05]</span> <span className="alert-red typing-anim">{'>'} SYSTEM ALERT: Roster Breach Detected.</span></p>
                <div className="alert-box">
                  <div className="alert-row"><span>TARGET:</span> <span className="white">Sarah Jenkins (NPN: 17451092)</span></div>
                  <div className="alert-row"><span>EVENT:</span> <span className="white">Corporate Link Terminated</span></div>
                  <div className="alert-row"><span>IMPACT:</span> <span className="white">Exited: Smith & Co (Tenure: 6 Yrs)</span></div>
                </div>
                <p><span className="time">[08:42:08]</span> <span className="alert-green pulse-text">{'>'} ACTION: 90-Day Distraction Window Open. Execute BOR Attack.</span></p>
              </div>
            </div>
            <div className="mockup-glow"></div>
          </div>
        </section>

        <section id="the-diff" className="advantage-section">
          <h2 className="section-title">The Intelligence Advantage</h2>
          <div className="grid-2">
            <div className="feature-card glass-card">
              <div className="card-icon red-glow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h3>The 24-Hour Roster Breach</h3>
              <p>When a producer is terminated or walks out, carriers yank their binding authority instantly to protect corporate assets. Our engine catches these deletions overnight.</p>
            </div>
            <div className="feature-card glass-card">
              <div className="card-icon blue-glow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#3388FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 7V12L15 15" stroke="#3388FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h3>The JIT Asymmetry Engine</h3>
              <p>While new hires are masked by 30-day legal grace periods, competitor exits leave an immediate, visible void. We map these daily database updates to open your attack window.</p>
            </div>
          </div>
        </section>

        <section id="features" className="arsenal-section">
          <h2 className="section-title">The Arsenal</h2>
          <div className="grid-3">
            <div className="feature-card glass-card hover-lift">
              <h3>01. Roster Watchlist</h3>
              <p>Lock onto rival agencies. Get instant alerts the exact hour a top producer terminates their corporate appointment and exits the firm.</p>
              <div className="card-line"></div>
            </div>
            <div className="feature-card glass-card hover-lift">
              <h3>02. Target Parameters</h3>
              <p>Eliminate noise. Set tripwires to only alert you when high-value veterans (3+ years tenure) holding elite commercial paper move.</p>
              <div className="card-line"></div>
            </div>
            <div className="feature-card glass-card hover-lift">
              <h3>03. Market Mobility Feed</h3>
              <p>Scan the entire MSA. Discover high-producing targets who just dropped a link anywhere in the market, regardless of agency.</p>
              <div className="card-line"></div>
            </div>
          </div>
        </section>

        <section id="pricing" className="pricing-section">
          <h2 className="section-title text-center">Secure Your Advantage</h2>
          <p className="text-center subtitle-small">Deploy the Tripwire Engine across your territory today.</p>
          
          <div className="grid-2 pricing-grid">
            <div className="price-card glass-card">
              <div className="tier-name">Standard Recon</div>
              <div className="price">$199<span className="period">/mo</span></div>
              <p className="price-desc">Perfect for individual producers targeting specific roofs.</p>
              <ul className="feature-list">
                <li>Track up to 10 Rival Agencies</li>
                <li>Daily Polars Diff Alerts</li>
                <li>Monday Target Briefs</li>
                <li>Email & SMS Notifications</li>
              </ul>
              <Link to="/onboarding" className="btn-ghost-full">Start 14-Day Trial</Link>
            </div>
            
            <div className="price-card glass-card premium-card">
              <div className="premium-badge">Most Lethal</div>
              <div className="tier-name highlight-text">Command Center</div>
              <div className="price">$499<span className="period">/mo</span></div>
              <p className="price-desc">For agency principals dominating the Houston MSA.</p>
              <ul className="feature-list">
                <li>Unlimited Roster Tracking</li>
                <li>Custom Tripwire Parameters (Tenure/Lines)</li>
                <li>Market Mobility Feed Access</li>
                <li>Tactical Producer Dossiers</li>
              </ul>
              <Link to="/onboarding" className="btn-primary-full">Start 14-Day Trial</Link>
            </div>
          </div>
        </section>

        <section className="cta-section text-center">
          <div className="cta-glass-box">
            <h2>Houston's commercial market is shifting today.</h2>
            <p>Are you tracking the fallout?</p>
            <Link to="/onboarding" className="btn-primary">Arm Your Watchlist Now</Link>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-content">
          <div className="logo">AGENCY<span>FORTE</span></div>
          <p>© 2026 AgencyForte. All rights reserved. Sourced from public Texas Department of Insurance data.</p>
        </div>
      </footer>
    </>
  )
}
