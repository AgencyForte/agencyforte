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
      <footer>
        <div className="footer-content">
          <div className="logo">AGENCY<span>FORTE</span></div>
          <p>© 2026 AgencyForte. All rights reserved. Sourced from public Texas Department of Insurance data.</p>
        </div>
      </footer>
    </>
  )
}
