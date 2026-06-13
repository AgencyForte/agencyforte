import { Outlet, Link } from 'react-router-dom'

export default function AppLayout() {
  return (
    <>
      {/* Persistent Atmospheric Effects */}
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>
      <div className="noise-overlay"></div>

      {/* Global Header */}
      <header className="glass-header">
        <Link to="/" className="logo" style={{ textDecoration: 'none' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          AGENCY<span>FORTE</span>
        </Link>
        <nav>
          {/* Note: In a real app we might hide these links if logged in, but we'll preserve them for now */}
          <a href="#the-diff">Intelligence</a>
          <a href="#features">Arsenal</a>
          <a href="#pricing">Pricing</a>
          <Link to="/login" className="btn-ghost">Client Login</Link>
        </nav>
      </header>

      {/* Main Page Content */}
      <Outlet />

      {/* Global Footer */}
      <footer>
        <div className="footer-content">
          <div className="logo">AGENCY<span>FORTE</span></div>
          <p>© 2026 AgencyForte. All rights reserved. Sourced from public Texas Department of Insurance data.</p>
        </div>
      </footer>
    </>
  )
}
