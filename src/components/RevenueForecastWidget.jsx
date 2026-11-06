import React from 'react';
import { TrendingUp, IndianRupee, Calendar, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { getDaysRemaining } from './UserTable';

export default function RevenueForecastWidget({ users }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  const currentYearMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  
  const nextMonthObj = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextYearMonth = `${nextMonthObj.getFullYear()}-${pad(nextMonthObj.getMonth() + 1)}`;

  const thirdMonthObj = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const thirdYearMonth = `${thirdMonthObj.getFullYear()}-${pad(thirdMonthObj.getMonth() + 1)}`;

  // Revenue sums
  const currentMonthUsers = users.filter(u => u.expiryDate && u.expiryDate.startsWith(currentYearMonth));
  const currentMonthTotal = currentMonthUsers.reduce((sum, u) => sum + (u.amount || 0), 0);

  const nextMonthUsers = users.filter(u => u.expiryDate && u.expiryDate.startsWith(nextYearMonth));
  const nextMonthTotal = nextMonthUsers.reduce((sum, u) => sum + (u.amount || 0), 0);

  const thirdMonthUsers = users.filter(u => u.expiryDate && u.expiryDate.startsWith(thirdYearMonth));
  const thirdMonthTotal = thirdMonthUsers.reduce((sum, u) => sum + (u.amount || 0), 0);

  // Revenue at risk (10-15 days window)
  const expiring15Users = users.filter(u => {
    const d = getDaysRemaining(u.expiryDate);
    return d >= 0 && d <= 15;
  });
  const atRiskTotal = expiring15Users.reduce((sum, u) => sum + (u.amount || 0), 0);

  return (
    <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid rgba(59, 109, 177, 0.4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} color="#38bdf8" />
            Software House Financial Forecast & Cash Flow Analysis
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Projected renewal revenue collections for current and upcoming billing cycles
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(245, 158, 11, 0.15)', padding: '0.4rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
          <AlertTriangle size={16} color="#fbbf24" />
          <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#fbbf24' }}>
            ₹{atRiskTotal.toLocaleString()} At Risk (10–15d Expiries)
          </span>
        </div>
      </div>

      {/* 3 Months Forecast Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {/* Month 1: Current Month */}
        <div style={{ background: 'rgba(9, 14, 26, 0.8)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-highlight)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#93c5fd' }}>
              <Calendar size={14} style={{ display: 'inline', marginRight: '4px' }} />
              August 2026 (Current)
            </span>
            <span className="badge badge-drive">{currentMonthUsers.length} Clients</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
            ₹{currentMonthTotal.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Expected renewal collection this month
          </div>
        </div>

        {/* Month 2: Next Month */}
        <div style={{ background: 'rgba(9, 14, 26, 0.8)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#cbd5e1' }}>
              <Clock size={14} style={{ display: 'inline', marginRight: '4px' }} />
              September 2026
            </span>
            <span className="badge badge-drive">{nextMonthUsers.length} Clients</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#a5b4fc', fontFamily: 'var(--font-mono)' }}>
            ₹{nextMonthTotal.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Upcoming billing cycle forecast
          </div>
        </div>

        {/* Month 3: Third Month */}
        <div style={{ background: 'rgba(9, 14, 26, 0.8)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#cbd5e1' }}>
              <Clock size={14} style={{ display: 'inline', marginRight: '4px' }} />
              October 2026
            </span>
            <span className="badge badge-drive">{thirdMonthUsers.length} Clients</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
            ₹{thirdMonthTotal.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Q4 early renewal Pipeline
          </div>
        </div>
      </div>
    </div>
  );
}
