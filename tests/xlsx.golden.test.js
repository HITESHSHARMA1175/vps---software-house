// Golden-file test for the SheetJS API surface used by BulkSharedVpsImportModal.jsx:
// XLSX.read(..., { type: 'array', cellDates: true }), utils.sheet_to_json(header:1, defval:''), SSF.parse_date_code.
// Validates: Requirements 15.2
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const expected = JSON.parse(
  readFileSync(new URL('./fixtures/xlsx.golden.expected.json', import.meta.url), 'utf8')
);

// Deterministic fixture: a numeric date serial (45000 = 2023-03-15), an empty row cell and a text date.
const aoa = [
  ['VPS IP Address', 'Username', 'Valid Till', 'Drive'],
  ['10.0.0.1', 'alice', 45000, 'D'],
  ['10.0.0.2', 'bob'],
  ['10.0.0.3', 'carol', '15/03/2023', 'E'],
];

const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

function parse(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

describe('spreadsheet parsing golden output', () => {
  it('parses a generated .xlsx to the stored rows (type: array, cellDates: true)', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const workbook = XLSX.read(toArrayBuffer(buf), { type: 'array', cellDates: true });
    expect(workbook.SheetNames).toEqual(['Sheet1']);
    const rows = parse(workbook);
    expect(rows).toHaveLength(expected.rows.length);
    expect(rows[0]).toEqual(expected.rows[0]);
    expect(rows).toEqual(expected.rows);
  });

  it('parses a .csv to the stored rows', () => {
    const csv = aoa.map((r) => r.join(',')).join('\n');
    const workbook = XLSX.read(new TextEncoder().encode(csv).buffer, { type: 'array', cellDates: true });
    const rows = parse(workbook);
    expect(rows).toHaveLength(expected.csvRows.length);
    expect(rows.map((r) => r.map(String))).toEqual(expected.csvRows);
  });

  it('SSF.parse_date_code converts a serial to the stored y/m/d', () => {
    const p = XLSX.SSF.parse_date_code(45000);
    expect({ y: p.y, m: p.m, d: p.d }).toEqual(expected.dateCode);
  });

  it('returns Date objects for true date cells when cellDates is set', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['d'], [new Date(Date.UTC(2023, 2, 15, 12))]], { cellDates: true });
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const rows = parse(XLSX.read(toArrayBuffer(buf), { type: 'array', cellDates: true }));
    expect(rows[1][0]).toBeInstanceOf(Date);
  });
});
