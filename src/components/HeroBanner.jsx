import React from 'react';
import { Server, ShieldCheck, Sparkles, HardDrive } from 'lucide-react';

export default function HeroBanner({ onOpenAddServer, onOpenQuickOnboard }) {
  return (
    <div className="hero-banner-card glass">
      <img
        src="/images/vps_datacenter_hero.jpg"
        alt="Innovation Web Works VPS Cloud Infrastructure"
        className="hero-banner-img"
      />
      <div className="hero-banner-overlay">
        <div>
          <h2 className="hero-title">Innovation Web Works Cloud Infrastructure</h2>
          <p className="hero-desc">
            High Performance VPS & Dedicated Server Management • Real-time Drive Allocation & Automatic Subscription Tracking
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn btn-primary"
            style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', border: 'none' }}
            onClick={onOpenQuickOnboard}
          >
            <Sparkles size={16} /> Quick Drive Finder
          </button>
          <button className="btn btn-primary" onClick={onOpenAddServer}>
            <Server size={16} /> Add VPS Server Node
          </button>
        </div>
      </div>
    </div>
  );
}
