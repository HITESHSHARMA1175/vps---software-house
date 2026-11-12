import { getDaysRemaining } from '../components/UserTable';
import { API_BASE } from '../contexts/AuthContext';

export function downloadVpsSubscriptionTemplate() {
  const rows = [
    ['VPS SUBSCRIPTION IMPORT'],
    ['One row represents one Windows or Tally username. Do not add passwords.'],
    ['Required: VPS IP Address, Username, Valid Till. Drive is required only for a new username.'],
    [],
    ['VPS IP Address', 'Username', 'Valid Till', 'Company', 'Drive', 'Email', 'Sales Rep', 'Notes'],
    ['103.255.65.73', 'tallyuser1', '2027-10-28', 'Example Trading Pvt Ltd', 'E', 'accounts@example.com', 'Sales Team', 'Replace this example row before upload'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    [],
    ['Dates must use YYYY-MM-DD, for example 2027-10-28.'],
    ['VPS IP Address + Username matches an existing record and updates Valid Till.'],
    ['For a new username, Drive is required. Company defaults to the username if blank.']
  ];
  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'VPS_Subscription_Import_Template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Shared VPS onboarding template. One row represents one company workspace;
 * User 1–6 are Windows/Tally usernames that share its allocated drive.
 * Passwords are intentionally excluded from spreadsheet uploads.
 */
export function downloadSharedVpsUserTemplate() {
  const rows = [
    ['CLOUD SERVER – CLIENT & USER DETAILS'],
    ['One row = one shared client drive. User 1–6 are users of that same client / drive.'],
    ['Do not add Windows or VPS passwords to this file.'],
    [],
    ['IP ADDRESS', '', 'PORT', '', 'TOTAL SPACE (GB)', '', 'USED SPACE (GB)', '', 'FREE SPACE (GB)'],
    ['103.255.65.73', '', '18526', '', '', '', '', '', ''],
    [],
    ['Sr.', 'Client / Company', 'Email ID', 'User 1', 'User 2', 'User 3', 'User 4', 'User 5', 'User 6', 'Total Users', 'Drive', 'Space', 'Salesmen', 'Subscription Start', 'Subscription Expiry', 'Phone', 'Notes'],
    ['1', 'Example Trading Pvt Ltd', 'accounts@example.com', 'tallyuser1', 'tallyuser2', '', '', '', '', '2', 'E', '20', 'Sales Team', '2026-10-29', '2027-10-28', '9876543210', 'Replace this example row before upload'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    [],
    ['Required: IP ADDRESS and PORT at the top, then Client / Company, User 1 and Drive in every client row. Dates must use YYYY-MM-DD.'],
    ['For a shared VPS, every username on the same row belongs to the same company and drive. Use one row per drive/client.']
  ];

  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Shared_VPS_Client_User_Upload_Template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportExpiringUsersCSV(users, servers) {
  const expiringOrExpired = users.filter(u => {
    const days = getDaysRemaining(u.expiryDate);
    return days <= 15;
  });

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM

  csvContent += "SOFTWARE HOUSE - EXPIRING CLIENTS BULK STATUS REPORT\n";
  csvContent += "INSTRUCTIONS: Change the 'Update Status' column value to 'RENEWED' or 'ACTIVE' or 'EXPIRED', then upload this CSV file back to auto-update database.\n\n";

  csvContent += "Client ID,Username,Company Name,VPS Server,Drive Onboard,Expiry Date,Days Left,Current Status,Update Status (RENEWED / ACTIVE / EXPIRED),Sales Agent\n";

  expiringOrExpired.forEach(u => {
    const srv = servers.find(s => s.id === u.serverId);
    const days = getDaysRemaining(u.expiryDate);
    const currentStatus = days < 0 ? 'EXPIRED' : (days <= 15 ? 'EXPIRING_SOON' : 'ACTIVE');

    const row = [
      `"${u.id}"`,
      `"${(u.username || '').replace(/"/g, '""')}"`,
      `"${(u.company || '').replace(/"/g, '""')}"`,
      `"${srv ? srv.name : u.serverId}"`,
      `"${u.drive || ''}"`,
      `"${u.expiryDate}"`,
      `"${days}"`,
      `"${currentStatus}"`,
      `"${currentStatus}"`,
      `"${(u.salesAgent || '').replace(/"/g, '""')}"`
    ].join(",");

    csvContent += row + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Expiring_Clients_Update_Report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportServerUserExcel(servers, users, targetServerId = 'ALL') {
  const filteredServers = targetServerId === 'ALL' ? servers : servers.filter(s => s.id === targetServerId);

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // \uFEFF UTF-8 BOM for Excel

  csvContent += "SOFTWARE HOUSE - VPS SERVER & CLIENT SUBSCRIPTION REPORT\n";
  csvContent += `Generated Date: ${new Date().toISOString().split('T')[0]}\n\n`;

  if (filteredServers.length === 0) {
    csvContent += "No servers found in system.\n";
  }

  filteredServers.forEach(server => {
    const serverUsers = users.filter(u => u.serverId === server.id);

    csvContent += `====================================================================================================\n`;
    csvContent += `SERVER NODE: "${server.name}" | TYPE: ${server.serverType || 'Shared VPS'} | IP: ${server.ipPort}\n`;
    csvContent += `SPECS: "${server.specs || 'N/A'}" | SUPERCLIENT: ${server.superClientUser || 'N/A'} | TOTAL DRIVES: ${(server.availableDrives || []).length} | ASSIGNED USERS: ${serverUsers.length}\n`;
    csvContent += `====================================================================================================\n`;

    csvContent += "Username,Company Name,User Status,Drive Onboard,Registration Date,Renewal Expiry,Sales Agent,Phone,Email,Notes\n";

    if (serverUsers.length === 0) {
      csvContent += "(No clients assigned to this server node yet)\n\n";
    } else {
      serverUsers.forEach(u => {
        const daysLeft = getDaysRemaining(u.expiryDate);
        const expiryFormatted = `${u.expiryDate} (${daysLeft < 0 ? 'EXPIRED' : daysLeft + 'd left'})`;

        const row = [
          `"${(u.username || '').replace(/"/g, '""')}"`,
          `"${(u.company || '').replace(/"/g, '""')}"`,
          `"${u.clientType || 'Shared'}"`,
          `"${u.drive || ''}"`,
          `"${u.billDate || ''}"`,
          `"${expiryFormatted}"`,
          `"${(u.salesAgent || '').replace(/"/g, '""')}"`,
          `"${(u.customerPhone || '').replace(/"/g, '""')}"`,
          `"${(u.customerEmail || '').replace(/"/g, '""')}"`,
          `"${(u.notes || '').replace(/"/g, '""')}"`
        ].join(",");
        csvContent += row + "\n";
      });
      csvContent += "\n";
    }
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `SoftwareHouse_Server_Client_Report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * SUPER_ADMIN-only export that includes client passwords. Calls the server route
 * (POST /api/clients/export) with confirm: true; the server enforces the role,
 * decrypts, and writes the audit entry. The caller must ask the user to confirm first.
 * The existing exportServerUserExcel stays client-side and password-free.
 */
export async function exportServerUserWithPasswords(serverId) {
  const body = { includePasswords: true, confirm: true };
  if (serverId && serverId !== 'ALL') body.serverId = serverId;

  const res = await fetch(`${API_BASE}/clients/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Export failed (HTTP ${res.status})`);
  }

  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Username', 'Password', 'Company Name', 'Server ID', 'Drive Onboard', 'Registration Date', 'Renewal Expiry', 'Sales Agent', 'Phone', 'Email', 'Notes'];
  const lines = [
    'SOFTWARE HOUSE - CLIENT EXPORT WITH PASSWORDS (CONFIDENTIAL)',
    `Generated Date: ${new Date().toISOString().split('T')[0]}`,
    '',
    header.map(esc).join(',')
  ];
  (data.clients || []).forEach(u => {
    lines.push([
      u.username, u.password, u.company, u.serverId, u.drive, u.billDate,
      u.expiryDate, u.salesAgent, u.customerPhone, u.customerEmail, u.notes
    ].map(esc).join(','));
  });

  const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `SoftwareHouse_Clients_With_Passwords_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return data.count ?? (data.clients || []).length;
}

export function exportDailyUserActivityExcel(records, targetDate, serverFilterName = 'All VPS Servers') {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM for Microsoft Excel compatibility

  csvContent += "SOFTWARE HOUSE - DAILY USER RDP ACTIVITY & LOGON REPORT\n";
  csvContent += `Target Date: ${targetDate} | Server Scope: ${serverFilterName} | Generated At: ${new Date().toLocaleString()}\n\n`;

  csvContent += "User / Client Name,Company Name,VPS Server Node,VPS IP Address,Activity Status,Logon Timestamp,Session Active Duration,Account Type\n";

  if (!records || records.length === 0) {
    csvContent += "(No user activity records found for selected filter criteria)\n";
  } else {
    records.forEach(rec => {
      let statusLabel = 'NOT LOGGED IN';
      if (rec.isCurrentlyOnline) statusLabel = 'LIVE RDP ONLINE';
      else if (rec.loggedInToday) statusLabel = 'LOGGED IN TODAY';
      else if (rec.isInactive7Days) statusLabel = 'INACTIVE 7+ DAYS';

      const row = [
        `"${(rec.username || '').replace(/"/g, '""')}"`,
        `"${(rec.company || '').replace(/"/g, '""')}"`,
        `"${(rec.serverName || '').replace(/"/g, '""')}"`,
        `"${(rec.serverIp || '').replace(/"/g, '""')}"`,
        `"${statusLabel}"`,
        `"${(rec.exactLogonTimestamp || '').replace(/"/g, '""')}"`,
        `"${(rec.sessionDurationStr || '').replace(/"/g, '""')}"`,
        `"${rec.isRegistered ? 'Client Subscription' : 'Server Local User'}"`
      ].join(",");

      csvContent += row + "\n";
    });
  }

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Daily_User_Activity_Report_${targetDate}_${serverFilterName.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export Historical Telemetry Metrics to CSV
export function exportServerTelemetryCSV(server, historyPoints = [], timeRange = '24h') {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM

  csvContent += `INNOVATION WEB WORKS - VPS TELEMETRY PERFORMANCE REPORT\n`;
  csvContent += `Server Node: "${server?.name || 'VPS'}" | IP: "${server?.ipPort || 'N/A'}" | Time Range: ${timeRange} | Generated: ${new Date().toLocaleString()}\n\n`;

  csvContent += "Timestamp,Server Name,IP Address,CPU Usage (%),RAM Used (GB),RAM Total (GB),RAM (%),Active RDP Users,Disconnected Sessions,Server Status\n";

  if (!historyPoints || historyPoints.length === 0) {
    csvContent += "(No telemetry data points available for selected range)\n";
  } else {
    historyPoints.forEach(pt => {
      const row = [
        `"${pt.timestamp || pt.timeLabel || ''}"`,
        `"${(server?.name || 'VPS').replace(/"/g, '""')}"`,
        `"${(server?.ipPort || '').replace(/"/g, '""')}"`,
        `"${pt.cpuUsage ?? 0}"`,
        `"${(parseFloat(pt.ramUsedGB) || 0).toFixed(1)}"`,
        `"${(parseFloat(pt.ramTotalGB) || 0).toFixed(1)}"`,
        `"${pt.ramPercent ?? 0}"`,
        `"${pt.activeUsersCount ?? 0}"`,
        `"${pt.disconnectedUsersCount ?? 0}"`,
        `"${pt.status || 'ONLINE'}"`
      ].join(",");
      csvContent += row + "\n";
    });
  }

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  const sName = (server?.name || 'vps').replace(/[^a-zA-Z0-9_-]/g, '_');
  link.setAttribute("download", `VPS_Telemetry_${sName}_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Download SVG Chart as PNG Image
export function downloadSvgChartAsPNG(svgElement, serverName = 'VPS', metricTitle = 'Performance') {
  if (!svgElement) return;

  try {
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2; // High-DPI 2x scale
      const width = svgElement.clientWidth || 800;
      const height = svgElement.clientHeight || 320;
      canvas.width = width * scale;
      canvas.height = (height + 70) * scale; // Extra height for title banner

      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // Dark background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height + 70);

      // Header Banner
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${serverName} — ${metricTitle} Chart`, 18, 28);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px monospace, system-ui';
      ctx.fillText(`Generated: ${new Date().toLocaleString()} • Innovation Web Works VPS Monitor`, 18, 48);

      // Separator Line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(18, 60);
      ctx.lineTo(width - 18, 60);
      ctx.stroke();

      // Draw SVG chart
      ctx.drawImage(image, 0, 65, width, height);

      // Trigger download
      const pngURL = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      const safeName = serverName.replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadLink.download = `${safeName}_${metricTitle.replace(/\s+/g, '_')}_Graph_${new Date().toISOString().split('T')[0]}.png`;
      downloadLink.href = pngURL;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(blobURL);
    };
    image.src = blobURL;
  } catch (err) {
    console.error('Error exporting chart to PNG:', err);
  }
}

// Print / PDF Executive Server Performance & Health Report
export function printServerDiagnosticReport({ server, telemetry, summary, assignedUsers = [], timeRange = '24h' }) {
  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (!printWindow) return;

  const disks = telemetry && Array.isArray(telemetry.disks) ? telemetry.disks : [];
  const srvName = server?.name || 'VPS Server Node';
  const srvIp = server?.ipPort || 'N/A';
  const reportDate = new Date().toLocaleString();

  const disksHtml = disks.map(d => {
    const total = parseFloat(d.totalGB) || 0;
    const free = parseFloat(d.freeGB) || 0;
    const used = Math.max(0, total - free);
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
    return `
      <tr>
        <td style="font-weight: bold;">${d.drive || d.driveLetter || 'Drive'}</td>
        <td>${total.toFixed(1)} GB</td>
        <td>${used.toFixed(1)} GB</td>
        <td style="color: ${free < 2 ? '#dc2626' : '#16a34a'}; font-weight: bold;">${free.toFixed(1)} GB free</td>
        <td>${pct}% used</td>
      </tr>
    `;
  }).join('');

  const usersHtml = assignedUsers.map(u => `
    <tr>
      <td style="font-weight: bold;">${u.username}</td>
      <td>${u.company || '-'}</td>
      <td>${u.drive || '-'}</td>
      <td>${u.expiryDate || '-'}</td>
      <td><span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; background: #e0f2fe; color: #0369a1; font-weight: bold;">${u.status || 'Active'}</span></td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${srvName} — VPS Diagnostic & Performance Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 30px; color: #0f172a; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
        .logo { font-size: 20px; font-weight: 800; color: #2563eb; letter-spacing: -0.5px; }
        .meta { text-align: right; font-size: 12px; color: #64748b; }
        h1 { font-size: 22px; margin: 0 0 6px 0; color: #0f172a; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
        .card-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; }
        .card-val { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
        th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-weight: 700; color: #475569; border-bottom: 1px solid #cbd5e1; }
        td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
        .section-title { font-size: 15px; font-weight: 700; margin: 24px 0 8px 0; color: #1e293b; border-left: 4px solid #2563eb; padding-left: 8px; }
        .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
        @media print {
          body { margin: 15mm; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="logo">INNOVATION WEB WORKS</div>
          <h1>VPS Diagnostic &amp; Performance Report</h1>
          <div style="font-size: 13px; color: #475569;">Node: <strong>${srvName}</strong> (${srvIp}) • Scope: <strong>${timeRange}</strong></div>
        </div>
        <div class="meta">
          <div>Report Generated: <strong>${reportDate}</strong></div>
          <div>Server Type: <strong>${server?.serverType || 'Shared VPS'}</strong></div>
          <div>Operational Status: <strong style="color: #16a34a;">● ${telemetry?.status || 'ONLINE'}</strong></div>
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <div class="card-label">CPU Average (Peak)</div>
          <div class="card-val">${summary?.avgCpu ?? telemetry?.cpuUsage ?? 0}% <span style="font-size: 12px; color: #dc2626;">(${summary?.peakCpu ?? telemetry?.cpuUsage ?? 0}% max)</span></div>
        </div>
        <div class="card">
          <div class="card-label">RAM Usage</div>
          <div class="card-val">${telemetry?.ramPercent ?? 0}% <span style="font-size: 12px; color: #64748b;">(${(parseFloat(telemetry?.ramUsedGB) || 0).toFixed(1)} / ${(parseFloat(telemetry?.ramTotalGB) || 0).toFixed(1)} GB)</span></div>
        </div>
        <div class="card">
          <div class="card-label">RDP Sessions (Peak)</div>
          <div class="card-val">${telemetry?.activeUsersCount ?? 0} Online <span style="font-size: 12px; color: #d97706;">(${telemetry?.disconnectedUsersCount ?? 0} Disc)</span></div>
        </div>
        <div class="card">
          <div class="card-label">Reliability / Uptime</div>
          <div class="card-val" style="color: #16a34a;">${summary?.uptimePercent ?? 99.9}%</div>
        </div>
      </div>

      <div class="section-title">Storage &amp; Drive Partitions Health</div>
      <table>
        <thead>
          <tr>
            <th>Drive Letter</th>
            <th>Total Capacity</th>
            <th>Space Used</th>
            <th>Free Space</th>
            <th>Utilization</th>
          </tr>
        </thead>
        <tbody>
          ${disksHtml || '<tr><td colspan="5" style="text-align: center; color: #94a3b8;">No storage drive telemetry recorded</td></tr>'}
        </tbody>
      </table>

      <div class="section-title">Assigned Windows Client Subscriptions (${assignedUsers.length})</div>
      <table>
        <thead>
          <tr>
            <th>Windows Username</th>
            <th>Company / Account</th>
            <th>Drive</th>
            <th>Subscription Expiry</th>
            <th>Account Status</th>
          </tr>
        </thead>
        <tbody>
          ${usersHtml || '<tr><td colspan="5" style="text-align: center; color: #94a3b8;">No client subscriptions currently assigned</td></tr>'}
        </tbody>
      </table>

      <div class="footer">
        <div>Innovation Web Works Automated Cloud Diagnostic System • Confidential</div>
        <div>Page 1 of 1</div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 400);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

// Export VPS Hardware & Specs Drift History to Microsoft Excel CSV
export function exportHardwareHistoryExcel(historyList = [], serverFilterName = 'All VPS Nodes') {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // \uFEFF UTF-8 BOM for Microsoft Excel

  csvContent += "INNOVATION WEB WORKS - VPS HARDWARE & SPECIFICATIONS AUDIT TRAIL REPORT\n";
  csvContent += `Server Scope: ${serverFilterName} | Total History Events: ${historyList.length} | Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST\n\n`;

  csvContent += "Date & Time (IST),Server Node,Server IP / Address,Hardware Metric,Change Type,Direction,Change Delta,Previous Spec (Before),New Spec (After),Event Description,Verified Full Specs Profile\n";

  if (!historyList || historyList.length === 0) {
    csvContent += "(No hardware modification or configuration drift events recorded for this selection)\n";
  } else {
    historyList.forEach(item => {
      let formattedDate = item.detectedAt || '';
      try {
        formattedDate = new Date(item.detectedAt).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }) + ' IST';
      } catch (e) {}

      let metric = item.metric;
      if (!metric) {
        if (item.changeType === 'RAM_RESIZED') metric = 'RAM Memory';
        else if (item.changeType === 'CPU_RECONFIGURED') metric = 'CPU Cores';
        else if (item.changeType === 'DISK_RESIZED' || item.changeType === 'DRIVE_RESIZED') metric = 'Storage Space';
        else metric = 'Baseline Profile';
      }

      let delta = item.delta || '';
      let direction = item.direction || 'INFO';
      if (!delta && item.oldValue && item.newValue) {
        const oldNum = parseFloat(item.oldValue);
        const newNum = parseFloat(item.newValue);
        if (!isNaN(oldNum) && !isNaN(newNum)) {
          const diff = newNum - oldNum;
          delta = `${diff > 0 ? '+' : ''}${diff} GB`;
          direction = diff > 0 ? 'INCREASE' : 'DECREASE';
        }
      }

      const row = [
        `"${formattedDate}"`,
        `"${(item.serverName || item.serverId || '').replace(/"/g, '""')}"`,
        `"${(item.serverIp || '').replace(/"/g, '""')}"`,
        `"${metric}"`,
        `"${(item.changeType || '').replace(/_/g, ' ')}"`,
        `"${direction}"`,
        `"${delta}"`,
        `"${(item.oldValue || 'N/A').replace(/"/g, '""')}"`,
        `"${(item.newValue || 'N/A').replace(/"/g, '""')}"`,
        `"${(item.description || '').replace(/"/g, '""')}"`,
        `"${(item.fullSpecs || '').replace(/"/g, '""')}"`
      ].join(",");

      csvContent += row + "\n";
    });
  }

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  const safeScope = serverFilterName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute("download", `VPS_Hardware_Change_History_${safeScope}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


