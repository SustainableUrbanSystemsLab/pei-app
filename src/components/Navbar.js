import React from 'react';
import { Link, useLocation } from 'react-router-dom';


const Navbar = () => {
  const location = useLocation();
  const title = location.pathname === '/city-compare' ? 'City Comparison Tool' : 'VIP-SMUR-PEI Subindex Visualizer';

  return (
    <nav className="navbar">
      <div className="navbar-logo">{title}</div>
      <div className="navbar-links">
        <Link to="/" className="navbar-link">Main</Link>
        <Link to="/city-compare" className="navbar-link">City Compare</Link>
      </div>
    </nav>
  );
};

export default Navbar;
