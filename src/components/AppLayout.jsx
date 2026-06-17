import { Outlet, Link } from 'react-router-dom'

export default function AppLayout() {
  return (
    <>
      {/* Persistent Atmospheric Effects */}
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>
      <div className="noise-overlay"></div>



      {/* Main Page Content */}
      <Outlet />

      {/* Global Footer */}
      <footer style={{ background: 'transparent', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
        <div className="footer-content" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.5, flexDirection: 'column', padding: '1rem 2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
            <span>RESTRICTED UPLINK</span>
          </div>
          <p style={{ marginTop: '0.5rem' }}>DATA STREAM: PUBLIC TDI / NIPR // UNAUTHORIZED DISTRIBUTION PROHIBITED.</p>
        </div>
      </footer>
    </>
  )
}
