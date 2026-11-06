import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';

const clean = (value) => String(value ?? '').trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const serverIp = (value) => clean(value).split(':')[0];
const dateValue = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}` : fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString().slice(0, 10);
};

function findHeaderRow(rows) {
  return rows.findIndex(row => row.some(cell => key(cell) === 'clientcompany'));
}

function mapRow(headers, row) {
  const values = {};
  headers.forEach((header, index) => { values[key(header)] = clean(row[index]); });
  return values;
}

function getSheetSetting(rows, label) {
  const expected = key(label);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const columnIndex = rows[rowIndex].findIndex(cell => key(cell) === expected);
    if (columnIndex === -1) continue;
    for (let nextRow = rowIndex + 1; nextRow < Math.min(rows.length, rowIndex + 4); nextRow += 1) {
      const value = clean(rows[nextRow][columnIndex]);
      if (value) return value;
    }
  }
  return '';
}

function parseSimpleSubscriptionWorkbook(workbook) {
  const rows = [];
  const serverBlocks = [];
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    const headerIndex = sheetRows.findIndex(row => {
      const fields = row.map(key);
      return fields.some(field => ['vpsipaddress', 'vpsip', 'ipaddress'].includes(field))
        && fields.some(field => ['username', 'user'].includes(field))
        && fields.some(field => ['validtill', 'expirydate', 'subscriptionexpiry'].includes(field));
    });
    if (headerIndex < 0) return;
    const headers = sheetRows[headerIndex];
    const records = sheetRows.slice(headerIndex + 1)
      .map((row, index) => ({ ...mapRow(headers, row), _sourceSheet: sheetName, _sourceRow: headerIndex + index + 2 }))
      .filter(record => clean(record.vpsipaddress || record.vpsip || record.ipaddress) && clean(record.username || record.user));
    records.forEach(record => {
      record._vpsTarget = record.vpsipaddress || record.vpsip || record.ipaddress;
      record.username = record.username || record.user;
      record.validtill = record.validtill || record.expirydate || record.subscriptionexpiry;
      serverBlocks.push(record._vpsTarget);
    });
    rows.push(...records);
  });
  return { rows, serverBlocks: [...new Set(serverBlocks)] };
}

function parseCloudServerWorkbook(workbook) {
  const rows = [];
  const serverBlocks = [];
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    const headerIndexes = sheetRows.reduce((matches, row, index) => (
      row.some(cell => key(cell) === 'clientcompany') ? [...matches, index] : matches
    ), []);

    headerIndexes.forEach((headerIndex, blockIndex) => {
      const headers = sheetRows[headerIndex];
      const blockEnd = headerIndexes[blockIndex + 1] ?? sheetRows.length;
      let detailsRowIndex = -1;
      let ipColumn = -1;
      for (let index = headerIndex - 1; index >= Math.max(0, headerIndex - 8); index -= 1) {
        const column = sheetRows[index].findIndex(cell => key(cell) === 'ipaddress');
        if (column >= 0) { detailsRowIndex = index; ipColumn = column; break; }
      }
      if (detailsRowIndex < 0) return;
      const ipAddress = clean(sheetRows[detailsRowIndex + 1]?.[ipColumn]);
      const portColumn = sheetRows[detailsRowIndex].findIndex(cell => key(cell) === 'port');
      const port = portColumn >= 0 ? clean(sheetRows[detailsRowIndex + 1]?.[portColumn]) : '';
      // Keep the blank “Template (copy me)” block in the workbook, but never import it.
      if (!ipAddress || /^ip yahan/i.test(ipAddress)) return;
      const serverTarget = port ? `${ipAddress}:${port}` : ipAddress;
      const sheetRowsToImport = sheetRows.slice(headerIndex + 1, blockEnd)
        .map((row, index) => ({
          ...mapRow(headers, row),
          _vpsTarget: serverTarget,
          _sourceSheet: sheetName,
          _sourceRow: headerIndex + index + 2
        }))
        // Cloud Server Sheets reserve formatted rows for drives. Only company rows are subscriptions.
        .filter(record => clean(record.clientcompany || record.company));
      if (sheetRowsToImport.length) {
        serverBlocks.push(serverTarget);
        rows.push(...sheetRowsToImport);
      }
    });
  });
  return { rows, serverBlocks };
}

export default function BulkSharedVpsImportModal({ isOpen, onClose, servers = [], users = [], onImport }) {
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [serverBlocks, setServerBlocks] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const preview = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const defaultExpiry = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const result = [];
    const skipped = [];
    rows.forEach((record, rowIndex) => {
      const target = record._vpsTarget || record.vpsservernodeip || record.vpsserver || record.ipaddress || '';
      const server = servers.find(item => [item.id, item.name, item.ipPort].some(value => key(value) === key(target)) || serverIp(item.ipPort) === serverIp(target));
      const usernames = Object.entries(record)
        .filter(([column, value]) => /^user\d+$/.test(column) && clean(value))
        .sort(([left], [right]) => Number(left.replace('user', '')) - Number(right.replace('user', '')))
        .map(([, value]) => clean(value));
      if (record.username && !usernames.includes(clean(record.username))) usernames.unshift(clean(record.username));
      if (!target || usernames.length === 0 || !server) {
        const location = record._sourceSheet ? `${record._sourceSheet} / row ${record._sourceRow}` : `Row ${rowIndex + 1}`;
        skipped.push(`${location}: ${!server ? 'no matching VPS node is registered for this IP' : 'VPS IP and username are required'}`);
        return;
      }
      usernames.forEach(username => {
        const existing = users.find(user => user.serverId === server.id && key(user.username) === key(username));
        const company = clean(record.clientcompany || record.company) || existing?.company || username;
        const drive = clean(record.drive).replace(/^drive\s*/i, '') || clean(existing?.drive).replace(/^drive\s*/i, '');
        if (!drive) {
          const location = record._sourceSheet ? `${record._sourceSheet} / row ${record._sourceRow}` : `Row ${rowIndex + 1}`;
          skipped.push(`${location}: Drive is required only when creating a new username.`);
          return;
        }
        result.push({
          id: existing?.id,
          serverId: server.id,
          clientType: 'Shared',
          username,
          company,
          drive: `Drive ${drive.toUpperCase()}`,
          customerEmail: record.emailid || record.email || '',
          customerPhone: record.phone || '',
          salesAgent: record.salesperson || record.salesmen || record.salesagent || '',
          billDate: dateValue(record.subscriptionstart, today),
          expiryDate: dateValue(record.validtill || record.subscriptionexpiry || record.expirydate, defaultExpiry),
          notes: record.notes || '',
          allocatedSpaceGB: record.allocatedspacegb || record.space || '',
          status: existing?.status || 'ACTIVE',
          action: existing ? 'UPDATE' : 'CREATE'
        });
      });
    });
    return { records: result, skipped };
  }, [rows, servers, users]);

  if (!isOpen) return null;

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const simpleSheet = parseSimpleSubscriptionWorkbook(workbook);
      const importSheet = simpleSheet.rows.length ? simpleSheet : parseCloudServerWorkbook(workbook);
      if (!importSheet.rows.length) throw new Error('Could not find the import columns: VPS IP Address, Username and Valid Till.');
      setRows(importSheet.rows);
      setServerBlocks(importSheet.serverBlocks);
      setFileName(file.name);
      return;
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      const headerIndex = findHeaderRow(sheetRows);
      if (headerIndex < 0) throw new Error('Could not find the “Client / Company” header row. Use the Shared VPS template.');
      const headers = sheetRows[headerIndex];
      // Your original cloud-server sheet stores server IP and port above the client table.
      // Apply that server identity to every client row in that sheet.
      const ipAddress = getSheetSetting(sheetRows.slice(0, headerIndex), 'IP ADDRESS');
      const port = getSheetSetting(sheetRows.slice(0, headerIndex), 'PORT');
      const sheetServerTarget = ipAddress && port ? `${ipAddress}:${port}` : ipAddress;
      const data = sheetRows.slice(headerIndex + 1)
        .filter(row => row.some(cell => clean(cell)))
        .map(row => ({ ...mapRow(headers, row), _vpsTarget: sheetServerTarget }));
      setRows(data);
      setFileName(file.name);
    } catch (err) {
      setRows([]);
      setServerBlocks([]);
      setError(err.message || 'Could not read this file. Upload an .xlsx or .csv file.');
    }
  };

  const handleImport = async () => {
    if (!preview.records.length || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      await onImport(preview.records);
      onClose();
    } catch (err) {
      setError(err.message || 'Import failed. No changes were confirmed.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bulk-import-modal" onClick={event => event.stopPropagation()}>
        <header className="bulk-import-header">
          <div><span>CLIENT SUBSCRIPTIONS</span><h2>Import VPS subscriptions</h2><p>Use the clean IP, username and validity-date format. Existing subscriptions update safely before anything is saved.</p></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close import"><X size={17} /></button>
        </header>
        <div className="bulk-import-body">
          <label className="bulk-import-dropzone">
            <FileSpreadsheet size={26} />
            <strong>{fileName || 'Choose Excel or CSV file'}</strong>
            <small>Accepted columns: VPS Server Node / IP, Client / Company, User 1–6, Drive, Email ID, Salesperson and subscription dates.</small>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
            <small className="bulk-import-simple-hint">Required columns: VPS IP Address, Username, Valid Till. For a new username, add Drive.</small>
          </label>
          {error && <div className="bulk-import-error"><AlertTriangle size={16} />{error}</div>}
          {!!rows.length && <>
            <div className="bulk-import-summary"><span><strong>{serverBlocks.length}</strong> VPS block{serverBlocks.length === 1 ? '' : 's'} recognised</span><span><strong>{preview.records.length}</strong> subscriptions ready</span><span><strong>{preview.records.filter(item => item.action === 'CREATE').length}</strong> new</span><span><strong>{preview.records.filter(item => item.action === 'UPDATE').length}</strong> updates</span></div>
            {preview.skipped.length > 0 && <div className="bulk-import-error"><AlertTriangle size={16} /><span>{preview.skipped.slice(0, 4).join(' · ')}{preview.skipped.length > 4 ? ` · ${preview.skipped.length - 4} more rows skipped` : ''}</span></div>}
            <div className="bulk-import-preview"><table><thead><tr><th>Action</th><th>Company</th><th>User</th><th>VPS node</th><th>Drive</th><th>Expiry</th></tr></thead><tbody>{preview.records.slice(0, 8).map((record, index) => <tr key={`${record.username}-${index}`}><td><span className={record.action === 'UPDATE' ? 'bulk-tag update' : 'bulk-tag'}>{record.action}</span></td><td>{record.company}</td><td>{record.username}</td><td>{servers.find(server => server.id === record.serverId)?.name}</td><td>{record.drive}</td><td>{record.expiryDate}</td></tr>)}</tbody></table>{preview.records.length > 8 && <small>Showing first 8 of {preview.records.length} subscriptions.</small>}</div>
          </>}
        </div>
        <footer className="bulk-import-footer"><span>{rows.length ? 'Review the preview before saving.' : 'Passwords are never read from or stored in this upload.'}</span><div><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!preview.records.length || isSaving} onClick={handleImport}>{isSaving ? 'Saving subscriptions…' : <><Upload size={15} /> Import subscriptions</>}</button></div></footer>
      </div>
    </div>
  );
}
