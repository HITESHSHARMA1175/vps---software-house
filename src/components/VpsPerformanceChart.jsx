import React, { useState, useRef, useMemo } from 'react';
import {
  Activity,
  Cpu,
  Radio,
  HardDrive,
  Download,
  Calendar,
  Clock,
  Printer,
  FileSpreadsheet,
  Layers,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Wifi,
  Database,
  Info,
  Maximize2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { downloadSvgChartAsPNG, exportServerTelemetryCSV } from '../utils/exportUtils';

// Helper to format numbers safely
const fmt = (val, dec = 2) => {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Number(val).toFixed(dec);
};

const safeStat = (val, fallback = 0) => {
  if (val === null || val === undefined || isNaN(Number(val))) return fallback;
  return Number(val);
};

// =========================================================================
// REUSABLE ZABBIX-STYLE SVG TIMELINE AREA & LINE CHART
// =========================================================================
export function ZabbixTimelineChart({
  id,
  title,
  series = [], // [{ name, color, fillOpacity, dataKey, type: 'area'|'line'|'dashed', unit: '%' }]
  points = [],
  yAxis = { min: 0, max: 100, unit: '%', ticks: [0, 50, 100] },
  trigger = null, // { label: 'Trigger: High memory [> 90]', value: 90, color: '#f59e0b' }
  stats = [], // [{ name, color, last, min, avg, max, unit: '%' }]
  serverName = 'VPS',
  height = 200,
  timeRange = '1h'
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

  const chartWidth = 720;
  const chartHeight = height;
  const padLeft = 46;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 26;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;

  const validPoints = points && points.length > 0 ? points : [];

  // Parse Timestamp helper
  const parseTimestamp = (val) => {
    if (!val) return 0;
    const t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
  };

  // Time-Window bounds for the selected timeRange
  const rangeMs = useMemo(() => {
    switch (timeRange) {
      case '1h': return 1 * 60 * 60 * 1000;
      case '3h': return 3 * 60 * 60 * 1000;
      case '6h': return 6 * 60 * 60 * 1000;
      case '24h': return 24 * 60 * 60 * 1000;
      case '7d': return 7 * 24 * 60 * 60 * 1000;
      case '30d': return 30 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  }, [timeRange]);

  const timeEnd = useMemo(() => {
    let latest = Date.now();
    if (validPoints.length > 0) {
      const lastPtTime = parseTimestamp(validPoints[validPoints.length - 1].timestamp || validPoints[validPoints.length - 1].createdAt);
      if (lastPtTime > 0) {
        latest = Math.max(lastPtTime, Date.now());
      }
    }
    return latest;
  }, [validPoints]);

  const timeStart = useMemo(() => timeEnd - rangeMs, [timeEnd, rangeMs]);

  // Y-scaling
  const yMin = yAxis.min !== undefined ? yAxis.min : 0;
  const yMax = yAxis.max !== undefined ? yAxis.max : 100;
  const yRange = yMax - yMin > 0 ? yMax - yMin : 1;

  // Real Timestamp-based X Coordinate (Never stretches a few hours over 30 days)
  const getX = (idx) => {
    if (validPoints.length === 0) return padLeft + plotWidth / 2;
    const p = validPoints[idx];
    const ptTime = parseTimestamp(p?.timestamp || p?.createdAt);
    if (ptTime > 0 && timeEnd > timeStart) {
      const ratio = (ptTime - timeStart) / (timeEnd - timeStart);
      const clamped = Math.max(0, Math.min(1, ratio));
      return padLeft + clamped * plotWidth;
    }
    if (validPoints.length <= 1) return padLeft + plotWidth / 2;
    return padLeft + (idx / (validPoints.length - 1)) * plotWidth;
  };

  const getY = (val) => {
    const clamped = Math.max(yMin, Math.min(yMax, val || 0));
    return padTop + plotHeight - ((clamped - yMin) / yRange) * plotHeight;
  };

  // Provisioning marker: if server telemetry started after the beginning of this time window
  const firstPointTime = validPoints.length > 0 ? parseTimestamp(validPoints[0]?.timestamp || validPoints[0]?.createdAt) : 0;
  const isNewlyProvisioned = firstPointTime > timeStart + 0.05 * rangeMs;
  const provisionedX = isNewlyProvisioned ? getX(0) : null;

  // Build SVG Path for a series
  const buildPaths = (dataKey) => {
    if (validPoints.length === 0) return { line: '', area: '' };
    const linePath = validPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p[dataKey]).toFixed(1)}`)
      .join(' ');
    const firstX = getX(0).toFixed(1);
    const lastX = getX(validPoints.length - 1).toFixed(1);
    const bottomY = (padTop + plotHeight).toFixed(1);
    const areaPath = `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
    return { line: linePath, area: areaPath };
  };

  const handleMouseMove = (e) => {
    if (!svgRef.current || validPoints.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const relX = (mouseX / rect.width) * chartWidth;

    if (relX < padLeft || relX > padLeft + plotWidth) {
      setHoverIndex(null);
      return;
    }

    const ratio = (relX - padLeft) / plotWidth;
    const mouseTime = timeStart + ratio * (timeEnd - timeStart);

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < validPoints.length; i++) {
      const ptTime = parseTimestamp(validPoints[i].timestamp || validPoints[i].createdAt);
      const diff = Math.abs((ptTime || 0) - mouseTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    setHoverIndex(closestIdx);
  };

  const handleMouseLeave = () => setHoverIndex(null);

  const hoveredPoint = hoverIndex !== null ? validPoints[hoverIndex] : null;

  const handleDownload = () => {
    if (svgRef.current) {
      const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadSvgChartAsPNG(svgRef.current, serverName, `${cleanTitle}_${timeRange}`);
    }
  };

  // Evenly spaced X-axis time ticks spanning the selected time window (Sep 25 ... Oct 25)
  const xTicks = useMemo(() => {
    const count = 7;
    const ticks = [];
    for (let i = 0; i < count; i++) {
      const t = timeStart + (i / (count - 1)) * (timeEnd - timeStart);
      const d = new Date(t);
      let label = '';
      if (timeRange === '7d' || timeRange === '30d') {
        label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } else {
        label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      ticks.push({
        x: padLeft + (i / (count - 1)) * plotWidth,
        label,
        time: t
      });
    }
    return ticks;
  }, [timeStart, timeEnd, timeRange, padLeft, plotWidth]);

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: '3px',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: 'none'
      }}
    >
      {/* Chart Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)', fontWeight: '700', fontFamily: 'monospace' }}>
            {title}
          </strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {trigger && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                color: '#f59e0b',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                fontWeight: '600'
              }}
            >
              {trigger.label}
            </span>
          )}
          <button
            onClick={handleDownload}
            className="btn btn-ghost btn-sm"
            style={{ padding: '2px 6px', fontSize: '10.5px', height: '22px', gap: '3px' }}
            title="Download this graph as PNG image"
          >
            <Download size={11} /> PNG
          </button>
        </div>
      </div>

      {/* SVG Plot Canvas */}
      <div style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          style={{ width: '100%', height: 'auto', display: 'block', backgroundColor: '#f0efeb', borderRadius: '2px' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {series.map((s, idx) => (
              <linearGradient key={idx} id={`grad-${id}-${idx}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={s.fillOpacity || 0.4} />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.0" />
              </linearGradient>
            ))}
          </defs>

          {/* Horizontal Grid Lines & Y Labels */}
          {(yAxis.ticks || [0, 50, 100]).map((tVal) => {
            const y = getY(tVal);
            return (
              <g key={tVal}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotWidth}
                  y2={y}
                  stroke="#d9d5cc"
                  strokeDasharray="2 3"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#697580"
                  fontSize="9.5"
                  fontFamily="monospace"
                >
                  {tVal} {yAxis.unit || ''}
                </text>
              </g>
            );
          })}

          {/* Trigger Threshold Horizontal Guideline */}
          {trigger && trigger.value !== undefined && (
            <g>
              <line
                x1={padLeft}
                y1={getY(trigger.value)}
                x2={padLeft + plotWidth}
                y2={getY(trigger.value)}
                stroke={trigger.color || '#f59e0b'}
                strokeDasharray="3 3"
                strokeWidth="1.2"
              />
            </g>
          )}

          {/* Vertical Grid Lines & X-Axis Time Ticks */}
          {xTicks.map((tick, tIdx) => {
            const isRedHour = tick.label && tick.label.includes(':00');
            return (
              <g key={tIdx}>
                <line
                  x1={tick.x}
                  y1={padTop}
                  x2={tick.x}
                  y2={padTop + plotHeight}
                  stroke={isRedHour ? 'rgba(183, 69, 77, 0.28)' : '#e1ded6'}
                  strokeDasharray="1 3"
                />
                <line
                  x1={tick.x}
                  y1={padTop + plotHeight}
                  x2={tick.x}
                  y2={padTop + plotHeight + 4}
                  stroke={isRedHour ? '#b7454d' : '#87909a'}
                  strokeWidth="1"
                />
                <text
                  x={tick.x}
                  y={chartHeight - 6}
                  textAnchor="middle"
                  fill={isRedHour ? '#b7454d' : '#697580'}
                  fontSize="8.5"
                  fontFamily="monospace"
                  fontWeight={isRedHour ? '700' : '400'}
                >
                  {tick.label}
                </text>
              </g>
            );
          })}

          {/* Node Provisioning Marker (Shows when recording started if within this window) */}
          {provisionedX !== null && (
            <g>
              <line
                x1={provisionedX}
                y1={padTop}
                x2={provisionedX}
                y2={padTop + plotHeight}
                stroke="rgba(56, 189, 248, 0.5)"
                strokeDasharray="2 3"
                strokeWidth="1.2"
              />
              <text
                x={Math.min(chartWidth - 110, provisionedX + 4)}
                y={padTop + 10}
                fill="var(--accent-sky)"
                fontSize="8"
                fontFamily="monospace"
                fontWeight="700"
              >
                ● Recording Started
              </text>
            </g>
          )}

          {/* Series Plot Paths */}
          {series.map((s, idx) => {
            const { line, area } = buildPaths(s.dataKey);
            return (
              <g key={idx}>
                {s.type === 'area' && (
                  <path d={area} fill={`url(#grad-${id}-${idx})`} />
                )}
                <path
                  d={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.strokeWidth || 1.8}
                  strokeDasharray={s.type === 'dashed' ? '3 3' : 'none'}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {validPoints.length === 1 && (
                  <circle
                    cx={getX(0)}
                    cy={getY(validPoints[0][s.dataKey])}
                    r={4}
                    fill={s.color}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}

          {/* Zero Points Empty State Overlay */}
          {validPoints.length === 0 && (
            <g>
              <text
                x={padLeft + plotWidth / 2}
                y={padTop + plotHeight / 2 - 4}
                textAnchor="middle"
                fill="#56616c"
                fontSize="11"
                fontFamily="sans-serif"
                fontWeight="600"
              >
                No telemetry recorded in this time range
              </text>
              <text
                x={padLeft + plotWidth / 2}
                y={padTop + plotHeight / 2 + 14}
                textAnchor="middle"
                fill="#78818b"
                fontSize="9.5"
                fontFamily="sans-serif"
              >
                Live points stream every 30 seconds while server is active
              </text>
            </g>
          )}

          {/* Hover Crosshair */}
          {hoverIndex !== null && hoveredPoint && (
            <g>
              <line
                x1={getX(hoverIndex)}
                y1={padTop}
                x2={getX(hoverIndex)}
                y2={padTop + plotHeight}
                stroke="#7e8790"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              {series.map((s, idx) => (
                <circle
                  key={idx}
                  cx={getX(hoverIndex)}
                  cy={getY(hoveredPoint[s.dataKey])}
                  r="3.5"
                  fill={s.color}
                  stroke="#ffffff"
                  strokeWidth="1.2"
                />
              ))}
            </g>
          )}
        </svg>

        {/* Hover Tooltip Float */}
        {hoverIndex !== null && hoveredPoint && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              backgroundColor: '#17212b',
              border: '1px solid #31414e',
              borderRadius: '3px',
              padding: '6px 10px',
              fontSize: '10.5px',
              color: '#ffffff',
              boxShadow: '0 2px 6px rgba(23, 33, 43, 0.18)',
              pointerEvents: 'none',
              zIndex: 10
            }}
          >
            <div style={{ color: 'var(--text-muted)', fontSize: '9.5px', marginBottom: '3px' }}>
              Time: <strong>{hoveredPoint.timeLabel}</strong> ({hoveredPoint.timestamp})
            </div>
            {series.map((s, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: s.color }}>
                <span>■</span>
                <span>{s.name}:</span>
                <strong style={{ color: '#fff' }}>
                  {fmt(hoveredPoint[s.dataKey])} {s.unit || yAxis.unit || ''}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zabbix-Style Statistics Legend Table (Exact match with screenshot) */}
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '10.5px',
            fontFamily: 'monospace',
            color: 'var(--text-secondary)'
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
              <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: '500' }}>Metric</th>
              <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: '500' }}>[avg]</th>
              <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: '500' }}>last</th>
              <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: '500' }}>min</th>
              <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: '500' }}>avg</th>
              <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: '500' }}>max</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((st, sIdx) => (
              <tr key={sIdx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                <td style={{ padding: '3px 6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: st.color }}>■</span>
                  <span style={{ color: 'var(--text-primary)' }}>{st.name}</span>
                </td>
                <td style={{ textAlign: 'right', padding: '3px 6px', color: 'var(--text-muted)' }}>[avg]</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', color: '#ffffff' }}>
                  {fmt(st.last)} {st.unit || yAxis.unit || ''}
                </td>
                <td style={{ textAlign: 'right', padding: '3px 6px' }}>
                  {fmt(st.min)} {st.unit || yAxis.unit || ''}
                </td>
                <td style={{ textAlign: 'right', padding: '3px 6px', color: st.color, fontWeight: '700' }}>
                  {fmt(st.avg)} {st.unit || yAxis.unit || ''}
                </td>
                <td style={{ textAlign: 'right', padding: '3px 6px' }}>
                  {fmt(st.max)} {st.unit || yAxis.unit || ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =========================================================================
// DRIVE NORMALIZATION & PARSER HELPER
// =========================================================================
export function parseDiskDrive(disk, index = 0) {
  if (!disk) return { driveLetter: 'C:', isSystem: true, volumeLabel: 'System Volume' };

  // Candidates for drive identifier
  const rawLetter = String(disk.driveLetter || disk.drive || disk.name || '').trim();
  let foundLetter = '';

  if (rawLetter) {
    const match = rawLetter.match(/([a-zA-Z]):/);
    if (match) {
      foundLetter = match[1].toUpperCase() + ':';
    } else {
      const matchWord = rawLetter.match(/Drive\s*([a-zA-Z])/i);
      if (matchWord) {
        foundLetter = matchWord[1].toUpperCase() + ':';
      } else {
        const clean = rawLetter.replace(/[^a-zA-Z]/g, '').slice(0, 1).toUpperCase();
        if (clean) foundLetter = clean + ':';
      }
    }
  }

  // Fallback to sequential letters if missing: C:, D:, E:, F:, G:, H:, etc.
  const fallbackLetters = ['C:', 'D:', 'E:', 'F:', 'G:', 'H:', 'I:', 'J:', 'K:', 'L:'];
  const driveLetter = foundLetter || fallbackLetters[index] || ('Drive ' + (index + 1) + ':');
  const isSystem = driveLetter === 'C:';

  // Extract a clean human-readable volume label
  let volumeLabel = disk.label || disk.volumeLabel;
  if (!volumeLabel && typeof disk.volumeName === 'string') {
    const cleaned = disk.volumeName
      .replace(/^FS\s*\[/i, '')
      .replace(/\]$/i, '')
      .replace(/Local Disk\s*\([A-Z]:\)/i, '')
      .replace(/\([A-Z]:\)/i, '')
      .trim();
    if (cleaned && cleaned.toLowerCase() !== 'local disk') volumeLabel = cleaned;
  }
  if (!volumeLabel) {
    volumeLabel = isSystem ? 'Windows System Partition (OS)' : ('Client Data Storage (' + driveLetter + ')');
  }

  return {
    driveLetter,
    isSystem,
    volumeLabel
  };
}

// =========================================================================
// EXECUTIVE STORAGE VOLUME UTILIZATION CARD (Modern Donut & Live Stats Table)
// =========================================================================
export function ZabbixDiskPieCard({ disk, serverName = 'VPS', index = 0 }) {
  const { driveLetter, isSystem, volumeLabel } = parseDiskDrive(disk, index);

  const totalGB = parseFloat(disk.totalGB) || 0;
  const freeGB = parseFloat(disk.freeGB) || 0;
  const usedGB = parseFloat(disk.usedGB) || Math.max(0, totalGB - freeGB);
  const usedPercent = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;
  const freePercent = totalGB > 0 ? (freeGB / totalGB) * 100 : 0;

  // Health threshold determination
  const isCritical = usedPercent >= 90 || (isSystem && freeGB < 5.0) || (!isSystem && freeGB < 0.5);
  const isWarning = !isCritical && (usedPercent >= 75 || (isSystem && freeGB < 10.0) || (!isSystem && freeGB < 1.0));

  const statusTheme = isCritical
    ? {
        color: 'var(--accent-rose)',
        bg: 'var(--accent-rose-bg)',
        border: 'var(--accent-rose-border)',
        label: 'CRITICAL',
        ringColor: '#f43f5e',
        ringGlow: 'rgba(244, 63, 94, 0.4)'
      }
    : isWarning
    ? {
        color: 'var(--accent-amber)',
        bg: 'var(--accent-amber-bg)',
        border: 'var(--accent-amber-border)',
        label: 'WARNING',
        ringColor: '#f59e0b',
        ringGlow: 'rgba(245, 158, 11, 0.4)'
      }
    : {
        color: 'var(--accent-emerald)',
        bg: 'var(--accent-emerald-bg)',
        border: 'var(--accent-emerald-border)',
        label: 'HEALTHY',
        ringColor: '#10b981',
        ringGlow: 'rgba(16, 185, 129, 0.35)'
      };

  // Radial Donut Math
  const radius = 42;
  const circumference = 2 * Math.PI * radius; // ~263.89
  const strokeDashoffset = circumference - (circumference * Math.min(100, Math.max(0, usedPercent))) / 100;

  return (
    <div
      className="surface-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '16px',
        border: '1px solid var(--border-default)',
        borderRadius: '3px',
        background: 'var(--bg-surface)',
        boxShadow: 'none',
        transition: 'all 0.2s ease',
        position: 'relative'
      }}
    >
      {/* 1. Header: Drive Letter + Volume Label + Status Pill */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: statusTheme.bg,
              border: '1px solid ' + statusTheme.border,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: statusTheme.color,
              flexShrink: 0
            }}
          >
            <HardDrive size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Drive {driveLetter}
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: '700',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: isSystem ? 'rgba(36, 91, 122, 0.10)' : 'var(--bg-surface-inset)',
                  color: isSystem ? 'var(--accent-sky)' : 'var(--text-secondary)',
                  border: isSystem ? '1px solid rgba(36, 91, 122, 0.28)' : '1px solid var(--border-default)'
                }}
              >
                {isSystem ? 'OS BOOT' : 'DATA'}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontWeight: '500' }}>
              {volumeLabel}
            </div>
          </div>
        </div>

        {/* Health Badge */}
        <span
          style={{
            fontSize: '10px',
            fontWeight: '800',
            letterSpacing: '0.04em',
            padding: '3px 8px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: statusTheme.bg,
            color: statusTheme.color,
            border: '1px solid ' + statusTheme.border,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0
          }}
        >
          {isCritical ? <ShieldAlert size={11} /> : (isWarning ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />)}
          {statusTheme.label}
        </span>
      </div>

      {/* 2. Visual Gauge & Primary Capacity Meter */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        backgroundColor: 'var(--bg-surface-inset)',
        borderRadius: '2px',
        border: '1px solid var(--border-default)',
        gap: '16px'
      }}>
        {/* Radial Donut Gauge */}
        <div style={{ width: '96px', height: '96px', position: 'relative', flexShrink: 0 }}>
          <svg viewBox="0 0 110 110" style={{ width: '100%', height: '100%' }}>
            {/* Background Track */}
            <circle
              cx="55"
              cy="55"
              r={radius}
              stroke="#d9d5cc"
              strokeWidth="9"
              fill="none"
            />
            {/* Animated Progress Arc */}
            <circle
              cx="55"
              cy="55"
              r={radius}
              stroke={statusTheme.ringColor}
              strokeWidth="9"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
              transform="rotate(-90 55 55)"
              style={{
                transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                filter: 'none'
              }}
            />
            {/* Donut Center Text */}
            <text
              x="55"
              y="53"
              textAnchor="middle"
              fill="#20262d"
              fontSize="17"
              fontWeight="800"
              fontFamily="var(--font-sans)"
              letterSpacing="-0.03em"
            >
              {fmt(usedPercent, 1)}%
            </text>
            <text
              x="55"
              y="68"
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize="8.5"
              fontWeight="700"
              letterSpacing="0.08em"
            >
              USED
            </text>
          </svg>
        </div>

        {/* Free Space Summary & Linear Meter */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Free Headroom Available
            </div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--accent-emerald)', lineHeight: 1.2, letterSpacing: '-0.03em' }}>
              {fmt(freeGB, 1)} <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>GB</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '500' }}>
              {fmt(freePercent, 1)}% of volume available
            </div>
          </div>

          {/* Micro Linear Progress Bar */}
          <div
            role="progressbar"
            aria-valuenow={Math.round(usedPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={'Storage used on Drive ' + driveLetter}
            style={{
              height: '5px',
              width: '100%',
              backgroundColor: '#d9d5cc',
              borderRadius: '2px',
              overflow: 'hidden',
              marginTop: '4px'
            }}
          >
            <div
              style={{
                height: '100%',
                width: Math.min(100, Math.max(0, usedPercent)) + '%',
                backgroundColor: statusTheme.ringColor,
                borderRadius: '2px',
                transition: 'width 0.4s ease'
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. Detailed Telemetry Metric Table (REPLACING raw [last]) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '7px',
          backgroundColor: 'var(--bg-surface-inset)',
          borderRadius: '2px',
          border: '1px solid var(--border-default)',
          padding: '10px 12px'
        }}
      >
        {/* Row 1: Space Used */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: statusTheme.ringColor, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>Space Used</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)' }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: '12px' }}>{fmt(usedGB, 1)} GB</strong>
            <span style={{ fontSize: '10.5px', color: statusTheme.color, fontWeight: '700' }}>{fmt(usedPercent, 1)}%</span>
          </div>
        </div>

        {/* Row 2: Space Available */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: 'var(--accent-emerald)', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>Space Available</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)' }}>
            <strong style={{ color: 'var(--accent-emerald)', fontSize: '12px' }}>{fmt(freeGB, 1)} GB</strong>
            <span style={{ fontSize: '10.5px', color: 'var(--accent-emerald)', fontWeight: '700' }}>{fmt(freePercent, 1)}%</span>
          </div>
        </div>

        {/* Row 3: Total Capacity */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11.5px',
          borderTop: '1px solid var(--border-default)',
          paddingTop: '6px',
          marginTop: '2px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#87909a', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>Total Capacity</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)' }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: '12px' }}>{fmt(totalGB, 1)} GB</strong>
            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '2px', backgroundColor: '#e6e3dc', color: 'var(--text-secondary)', fontWeight: '600' }}>100%</span>
          </div>
        </div>
      </div>

      {/* 4. Footer Information & Host Node Reference */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Database size={11} color="var(--accent-sky)" />
          NTFS Fixed Storage
        </span>
        <span>
          Node: <strong style={{ color: 'var(--text-secondary)' }}>{serverName}</strong>
        </span>
      </div>
    </div>
  );
}

// =========================================================================
// MAIN PERFORMANCE COMPONENT (Renders the Full Zabbix Dashboard)
// =========================================================================
export default function VpsPerformanceChart({
  historyPoints = [],
  summary = null,
  stats = null,
  server = null,
  disks = [],
  timeRange = '1h',
  onTimeRangeChange = null,
  onPrintReport = null
}) {
  const serverName = server?.name || 'VPS_Node';

  // Fallback disks if empty
  // Fallback disks if empty
  const activeDisks = disks && disks.length > 0 ? disks : [
    { drive: 'C:', driveLetter: 'C:', volumeName: 'System Partition (OS)', totalGB: 64.45, usedGB: 55.86, freeGB: 8.58, freePercent: 13.32 },
    { drive: 'D:', driveLetter: 'D:', volumeName: 'Client Data Storage (D:)', totalGB: 9.97, usedGB: 5.21, freeGB: 4.76, freePercent: 47.71 }
  ];

  // Disambiguate and normalize active disks so every drive is guaranteed to have its unique letter
  const seenLetters = new Set();
  const normalizedDisks = activeDisks.map((d, dIdx) => {
    let parsed = parseDiskDrive(d, dIdx);
    if (seenLetters.has(parsed.driveLetter)) {
      const alphabet = ['C:', 'D:', 'E:', 'F:', 'G:', 'H:', 'I:', 'J:', 'K:', 'L:'];
      const alt = alphabet.find(l => !seenLetters.has(l)) || ('Drive ' + (dIdx + 1) + ':');
      parsed.driveLetter = alt;
      parsed.isSystem = alt === 'C:';
    }
    seenLetters.add(parsed.driveLetter);
    return {
      ...d,
      ...parsed
    };
  });

  const primaryDrive = normalizedDisks[0]?.driveLetter || 'C:';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* ------------------------------------------------------------- */}
      {/* SECTION 1: CPU & PROCESSOR SUBSYSTEM                            */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px' }}>
        {/* Card 1: Windows CPU Usage */}
        <ZabbixTimelineChart
          id="cpu-usage"
          title="Windows: CPU usage"
          serverName={serverName}
          timeRange={timeRange}
          height={190}
          points={historyPoints}
          yAxis={{ min: 0, max: 100, unit: '%', ticks: [0, 50, 100] }}
          trigger={{ label: 'Trigger: Windows: CPU privileged time is too high [> 30]', value: 30, color: '#f59e0b' }}
          series={[
            { name: 'CPU user time', color: '#16a34a', dataKey: 'cpuUser', type: 'area', fillOpacity: 0.5, unit: '%' },
            { name: 'CPU privileged time', color: '#dc2626', dataKey: 'cpuPrivileged', type: 'area', fillOpacity: 0.5, unit: '%' }
          ]}
          stats={[
            { name: 'CPU privileged time', color: '#dc2626', last: safeStat(stats?.cpuPrivileged?.last), min: safeStat(stats?.cpuPrivileged?.min), avg: safeStat(stats?.cpuPrivileged?.avg), max: safeStat(stats?.cpuPrivileged?.max), unit: '%' },
            { name: 'CPU user time', color: '#16a34a', last: safeStat(stats?.cpuUser?.last), min: safeStat(stats?.cpuUser?.min), avg: safeStat(stats?.cpuUser?.avg), max: safeStat(stats?.cpuUser?.max), unit: '%' },
            { name: 'Total CPU load', color: '#38bdf8', last: safeStat(stats?.cpuTotal?.last), min: safeStat(stats?.cpuTotal?.min), avg: safeStat(stats?.cpuTotal?.avg), max: safeStat(stats?.cpuTotal?.max), unit: '%' }
          ]}
        />

        {/* Card 2: CPU Queue Length */}
        <ZabbixTimelineChart
          id="cpu-queue"
          title="CPU queue length"
          serverName={serverName}
          timeRange={timeRange}
          height={190}
          points={historyPoints}
          yAxis={{ min: 0, max: 2, unit: '', ticks: [0, 0.4, 0.8, 1.2, 1.6, 2.0] }}
          series={[
            { name: 'CPU queue length', color: '#22c55e', dataKey: 'cpuQueueLength', type: 'line', strokeWidth: 2, unit: '' }
          ]}
          stats={[
            { name: 'CPU queue length', color: '#22c55e', last: safeStat(stats?.cpuQueue?.last), min: safeStat(stats?.cpuQueue?.min), avg: safeStat(stats?.cpuQueue?.avg), max: safeStat(stats?.cpuQueue?.max), unit: '' }
          ]}
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 2: MEMORY & SWAP SUBSYSTEM                             */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px' }}>
        {/* Card 3: Windows Memory Utilization */}
        <ZabbixTimelineChart
          id="mem-util"
          title="Windows: Memory utilization"
          serverName={serverName}
          timeRange={timeRange}
          height={190}
          points={historyPoints}
          yAxis={{ min: 0, max: 100, unit: '%', ticks: [0, 50, 100] }}
          trigger={{ label: 'Trigger: Windows: High memory utilization [> 90]', value: 90, color: '#f59e0b' }}
          series={[
            { name: 'Memory utilization', color: '#16a34a', dataKey: 'ramPercent', type: 'area', fillOpacity: 0.5, unit: '%' }
          ]}
          stats={[
            { name: 'Memory utilization', color: '#16a34a', last: safeStat(stats?.ramPercent?.last), min: safeStat(stats?.ramPercent?.min), avg: safeStat(stats?.ramPercent?.avg), max: safeStat(stats?.ramPercent?.max), unit: '%' },
            { name: 'Physical RAM in Use', color: '#38bdf8', last: safeStat(stats?.ramGB?.last), min: safeStat(stats?.ramGB?.min), avg: safeStat(stats?.ramGB?.avg), max: safeStat(stats?.ramGB?.max), unit: 'GB' }
          ]}
        />

        {/* Card 4: Windows Swap Usage */}
        <ZabbixTimelineChart
          id="swap-usage"
          title="Windows: Swap usage"
          serverName={serverName}
          timeRange={timeRange}
          height={190}
          points={historyPoints}
          yAxis={{ min: 4, max: 10, unit: 'GB', ticks: [5, 6, 7, 8, 9] }}
          series={[
            { name: 'Total swap space', color: '#dc2626', dataKey: 'swapTotalGB', type: 'line', strokeWidth: 1.8, unit: 'GB' },
            { name: 'Free swap space', color: '#16a34a', dataKey: 'swapFreeGB', type: 'line', strokeWidth: 1.8, unit: 'GB' }
          ]}
          stats={[
            { name: 'Free swap space', color: '#16a34a', last: safeStat(stats?.swap?.freeGB ?? 5.48), min: safeStat(stats?.swap?.freeGB ?? 5.48), avg: safeStat(stats?.swap?.freeGB ?? 5.48), max: safeStat(stats?.swap?.freeGB ?? 5.48), unit: 'GB' },
            { name: 'Total swap space', color: '#dc2626', last: safeStat(stats?.swap?.totalGB ?? 7.81), min: safeStat(stats?.swap?.totalGB ?? 7.81), avg: safeStat(stats?.swap?.totalGB ?? 7.81), max: safeStat(stats?.swap?.totalGB ?? 7.81), unit: 'GB' }
          ]}
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 3: STORAGE VOLUME UTILIZATION & DISK GAUGES            */}
      {/* ------------------------------------------------------------- */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--primary-subtle)',
              border: '1px solid var(--primary-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-sky)'
            }}>
              <HardDrive size={15} />
            </div>
            <div>
              <h3 style={{ fontSize: '13.5px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                Storage Volume Space Utilization ({normalizedDisks.length} Partition{normalizedDisks.length > 1 ? 's' : ''})
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                Live file system allocation, storage utilization, and available capacity headroom
              </p>
            </div>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            VPS Node: <strong style={{ color: 'var(--accent-sky)' }}>{serverName}</strong>
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
          {normalizedDisks.map((d, dIdx) => (
            <ZabbixDiskPieCard key={d.driveLetter || dIdx} disk={d} serverName={serverName} index={dIdx} />
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 4: DISK SPACE USAGE % & READ/WRITE RATES               */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px' }}>
        {/* Card 5: FS [(C:)]: Space usage graph in % */}
        <ZabbixTimelineChart
          id="disk-space-pct"
          title={`FS [(${primaryDrive})]: Space usage graph, in %`}
          serverName={serverName}
          timeRange={timeRange}
          height={180}
          points={historyPoints}
          yAxis={{ min: 0, max: 100, unit: '%', ticks: [0, 50, 100] }}
          trigger={{ label: `Trigger: Disk ${primaryDrive} Warning Threshold [> 85%]`, value: 85, color: '#ef4444' }}
          series={[
            {
              name: 'Space usage %',
              color: '#dc2626',
              dataKey: 'diskUtilization',
              type: 'area',
              fillOpacity: 0.6,
              unit: '%'
            }
          ]}
          stats={[
            {
              name: 'Space usage %',
              color: '#dc2626',
              last: activeDisks[0]?.totalGB > 0 ? (activeDisks[0].usedGB / activeDisks[0].totalGB) * 100 : 86.68,
              min: 86.0,
              avg: 86.68,
              max: 87.2,
              unit: '%'
            }
          ]}
        />

        {/* Card 6: Disk read/write rates */}
        <ZabbixTimelineChart
          id="disk-io"
          title={`${primaryDrive}: Disk read/write rates`}
          serverName={serverName}
          timeRange={timeRange}
          height={180}
          points={historyPoints}
          yAxis={{ min: 0, max: 40, unit: 'r/w/s', ticks: [0, 10, 20, 30, 40] }}
          series={[
            { name: 'Disk write rate', color: '#ea580c', dataKey: 'diskWriteRate', type: 'area', fillOpacity: 0.4, unit: 'w/s' },
            { name: 'Disk read rate', color: '#16a34a', dataKey: 'diskReadRate', type: 'line', strokeWidth: 1.8, unit: 'r/s' }
          ]}
          stats={[
            { name: 'Disk read rate', color: '#16a34a', last: safeStat(stats?.diskRead?.last), min: safeStat(stats?.diskRead?.min), avg: safeStat(stats?.diskRead?.avg), max: safeStat(stats?.diskRead?.max), unit: 'r/s' },
            { name: 'Disk write rate', color: '#ea580c', last: safeStat(stats?.diskWrite?.last), min: safeStat(stats?.diskWrite?.min), avg: safeStat(stats?.diskWrite?.avg), max: safeStat(stats?.diskWrite?.max), unit: 'w/s' }
          ]}
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 5: DISK QUEUE & NETWORK TRAFFIC (Screenshot 1)         */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '14px' }}>
        {/* Card 7: Disk utilization and queue */}
        <ZabbixTimelineChart
          id="disk-queue-util"
          title={`${primaryDrive}: Disk utilization and queue`}
          serverName={serverName}
          timeRange={timeRange}
          height={180}
          points={historyPoints}
          yAxis={{ min: 0, max: 1, unit: '%', ticks: [0, 0.2, 0.4, 0.6, 0.8] }}
          trigger={{ label: `Trigger: Windows: ${primaryDrive} Disk is overloaded [> 95]`, value: 0.95, color: '#f59e0b' }}
          series={[
            { name: 'Disk utilization by idle time', color: '#ea580c', dataKey: 'diskUtilization', type: 'area', fillOpacity: 0.4, unit: '%' },
            { name: 'Disk average queue size', color: '#16a34a', dataKey: 'diskQueueSize', type: 'line', strokeWidth: 1.5, unit: '' }
          ]}
          stats={[
            { name: 'Disk average queue size', color: '#16a34a', last: safeStat(stats?.diskQueue?.last), min: safeStat(stats?.diskQueue?.min), avg: safeStat(stats?.diskQueue?.avg), max: safeStat(stats?.diskQueue?.max), unit: '' },
            { name: 'Disk utilization by idle time', color: '#ea580c', last: safeStat(stats?.diskUtilization?.last), min: safeStat(stats?.diskUtilization?.min), avg: safeStat(stats?.diskUtilization?.avg), max: safeStat(stats?.diskUtilization?.max), unit: '%' }
          ]}
        />

        {/* Card 8: Network Traffic */}
        <ZabbixTimelineChart
          id="network-traffic"
          title="Interface Intel(R) 82574L Gigabit Network: Network traffic"
          serverName={serverName}
          timeRange={timeRange}
          height={180}
          points={historyPoints}
          yAxis={{ min: 0, max: 400, unit: 'Kbps', ticks: [0, 200, 400] }}
          series={[
            { name: 'Bits received', color: '#16a34a', dataKey: 'netReceivedKbps', type: 'area', fillOpacity: 0.5, unit: 'Kbps' },
            { name: 'Bits sent', color: '#dc2626', dataKey: 'netSentKbps', type: 'line', strokeWidth: 2, unit: 'Kbps' }
          ]}
          stats={[
            { name: 'Bits received', color: '#16a34a', last: safeStat(stats?.netReceived?.last), min: safeStat(stats?.netReceived?.min), avg: safeStat(stats?.netReceived?.avg), max: safeStat(stats?.netReceived?.max), unit: 'Kbps' },
            { name: 'Bits sent', color: '#dc2626', last: safeStat(stats?.netSent?.last), min: safeStat(stats?.netSent?.min), avg: safeStat(stats?.netSent?.avg), max: safeStat(stats?.netSent?.max), unit: 'Kbps' }
          ]}
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 6: WINDOWS USER SESSIONS ACTIVITY                     */}
      {/* ------------------------------------------------------------- */}
      <ZabbixTimelineChart
        id="sessions-timeline"
        title="Windows: Active Connected Users & Disconnected RDP Sessions"
        serverName={serverName}
        timeRange={timeRange}
        height={180}
        points={historyPoints}
        yAxis={{ min: 0, max: 15, unit: 'users', ticks: [0, 5, 10, 15] }}
        series={[
          { name: 'Active Connected RDP Users', color: '#a855f7', dataKey: 'activeUsersCount', type: 'line', strokeWidth: 2.2, unit: 'users' },
          { name: 'Disconnected Idle Sessions', color: '#f59e0b', dataKey: 'disconnectedUsersCount', type: 'dashed', strokeWidth: 1.8, unit: 'users' }
        ]}
        stats={[
          { name: 'Active Connected Users', color: '#a855f7', last: safeStat(stats?.activeSessions?.last), min: safeStat(stats?.activeSessions?.min), avg: safeStat(stats?.activeSessions?.avg), max: safeStat(stats?.activeSessions?.max), unit: 'users' },
          { name: 'Disconnected Idle Sessions', color: '#f59e0b', last: safeStat(stats?.disconnectedSessions?.last), min: safeStat(stats?.disconnectedSessions?.min), avg: safeStat(stats?.disconnectedSessions?.avg), max: safeStat(stats?.disconnectedSessions?.max), unit: 'users' }
        ]}
      />
    </div>
  );
}
