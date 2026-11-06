import React from 'react';
import { Server, Users, Layers, AlertTriangle, AlertCircle, ShieldCheck, TrendingUp, CheckCircle2 } from 'lucide-react';

export default function DashboardStats({
  totalServers,
  totalUsers,
  sharedCount,
  dedicatedCount,
  expiringIn15DaysCount,
  expiredCount
}) {
  return (
    <div className="stats-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '1rem',
      marginBottom: '1.5rem'
    }}>
      {/* 1. Total VPS Nodes */}
      <div className="stat-card" style={{
        background: 'var(--bg-surface)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '1.25rem 1.35rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.3)',
        transition: 'transform 0.2s ease, border-color 0.2s ease'
      }}>
        <div style={{
          width: '46px',
          height: '46px',
          borderRadius: '12px',
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          color: '#38bdf8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Server size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.65rem', fontWeight: '800', color: '#ffffff', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            {totalServers}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '600', marginTop: '2px' }}>
            Active VPS Nodes
          </div>
        </div>
      </div>

      {/* 2. Total Clients */}
      <div className="stat-card" style={{
        background: 'var(--bg-surface)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '1.25rem 1.35rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.3)',
        transition: 'transform 0.2s ease, border-color 0.2s ease'
      }}>
        <div style={{
          width: '46px',
          height: '46px',
          borderRadius: '12px',
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          color: '#34d399',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Users size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.65rem', fontWeight: '800', color: '#ffffff', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            {totalUsers}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '600', marginTop: '2px' }}>
            Client Subscriptions
          </div>
        </div>
      </div>

      {/* 3. Shared vs Dedicated Distribution */}
      <div className="stat-card" style={{
        background: 'var(--bg-surface)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '1.25rem 1.35rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.3)',
        transition: 'transform 0.2s ease, border-color 0.2s ease'
      }}>
        <div style={{
          width: '46px',
          height: '46px',
          borderRadius: '12px',
          background: 'rgba(168, 85, 247, 0.12)',
          border: '1px solid rgba(168, 85, 247, 0.25)',
          color: '#c084fc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Layers size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1.05rem', fontWeight: '700', lineHeight: 1.1 }}>
            <span style={{ color: '#93c5fd' }}>{sharedCount} Shared</span>
            <span style={{ color: '#64748b' }}>•</span>
            <span style={{ color: '#f472b6' }}>{dedicatedCount} Dedi</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '600', marginTop: '4px' }}>
            Node Distribution
          </div>
        </div>
      </div>

      {/* 4. Expiring Soon (10-15 Days) */}
      <div className="stat-card" style={{
        background: expiringIn15DaysCount > 0 ? 'rgba(245, 158, 11, 0.06)' : 'var(--bg-surface)',
        border: expiringIn15DaysCount > 0 ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '1.25rem 1.35rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.3)',
        transition: 'transform 0.2s ease, border-color 0.2s ease'
      }}>
        <div style={{
          width: '46px',
          height: '46px',
          borderRadius: '12px',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          color: '#fbbf24',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <AlertTriangle size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.65rem', fontWeight: '800', color: expiringIn15DaysCount > 0 ? '#fbbf24' : '#ffffff', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            {expiringIn15DaysCount}
          </div>
          <div style={{ fontSize: '0.8rem', color: expiringIn15DaysCount > 0 ? '#fcd34d' : '#94a3b8', fontWeight: '600', marginTop: '2px' }}>
            Expiring Soon (10–15d)
          </div>
        </div>
      </div>

      {/* 5. Expired Subscriptions */}
      <div className="stat-card" style={{
        background: expiredCount > 0 ? 'rgba(244, 63, 94, 0.06)' : 'var(--bg-surface)',
        border: expiredCount > 0 ? '1px solid rgba(244, 63, 94, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '1.25rem 1.35rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.3)',
        transition: 'transform 0.2s ease, border-color 0.2s ease'
      }}>
        <div style={{
          width: '46px',
          height: '46px',
          borderRadius: '12px',
          background: 'rgba(244, 63, 94, 0.12)',
          border: '1px solid rgba(244, 63, 94, 0.25)',
          color: '#f87171',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <AlertCircle size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.65rem', fontWeight: '800', color: expiredCount > 0 ? '#f87171' : '#ffffff', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            {expiredCount}
          </div>
          <div style={{ fontSize: '0.8rem', color: expiredCount > 0 ? '#fda4af' : '#94a3b8', fontWeight: '600', marginTop: '2px' }}>
            Expired Subscriptions
          </div>
        </div>
      </div>
    </div>
  );
}
