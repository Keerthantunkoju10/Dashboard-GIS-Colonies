/**
 * Netlify Serverless Function: /api/sheet-sync
 * Two-way proxy between the NeoGeo GHMC Dashboard and Google Sheets.
 *
 * - GET  /api/sheet-sync               -> Reads live COLONIES rows from Google Sheets (Apps Script or GViz CSV)
 * - POST /api/sheet-sync               -> Writes row updates / new colonies back to Google Sheets via Apps Script
 *
 * Zero external npm dependencies (uses Node 18+ built-in fetch).
 */

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1IrHCi97oTceUR7Bi_k-IPVrrNOUaW6npVDreGI1slfE';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'COLONIES';

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
};

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseNumeric(val) {
  if (val === null || val === undefined) return 0;
  const s = String(val).trim();
  if (!s || s === '-' || s === 'None' || s === 'N/A') return 0;
  if (s === '199343' || s === '199343.0') return 199;
  if (s.includes('(')) {
    const m = s.split('(')[0].match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }
  if (s.includes(',')) {
    if (/^\d{1,3}(,\d{2,3})+$/.test(s)) {
      return parseInt(s.replace(/,/g, ''), 10) || 0;
    }
    const parts = s.split(',').map((p) => parseInt(p.trim(), 10)).filter((n) => !Number.isNaN(n));
    if (parts.length > 1) {
      return parts.reduce((acc, n) => acc + n, 0);
    }
  }
  const cleaned = s.replace(/,/g, '');
  const n = Number(cleaned);
  if (!Number.isNaN(n)) return Math.round(n);
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function normalizeDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Handle dd-mmm-yyyy (e.g. 23-Jun-2026, 13-Nov-2026, 13-Nov-26)
  const dmyMon = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/);
  if (dmyMon) {
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const mon = months[dmyMon[2].slice(0, 3).toLowerCase()];
    if (mon) {
      const y = dmyMon[3].length === 2 ? `20${dmyMon[3]}` : dmyMon[3];
      return `${y}-${String(mon).padStart(2, '0')}-${String(dmyMon[1]).padStart(2, '0')}`;
    }
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY (Indian format: day is first, month is second)
  const dmyNum = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyNum) {
    const p1 = parseInt(dmyNum[1], 10);
    const p2 = parseInt(dmyNum[2], 10);
    const y = dmyNum[3];
    let d = p1;
    let m = p2;
    if (p2 > 12 && p1 <= 12) {
      m = p1;
      d = p2;
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return s;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzgVRGk1lEoxv_A7c1X4bdivQwUxIFEmoLt9LKwPVBv_h4Ti9AWbMXr_smUlm0NDlI6/exec';
    const envScriptUrl = (process.env.GOOGLE_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL).trim();

    if (event.httpMethod === 'GET') {
      const queryScriptUrl = (event.queryStringParameters && event.queryStringParameters.scriptUrl || '').trim();
      const scriptUrl = queryScriptUrl || envScriptUrl;

      // Prefer Apps Script Web App if configured (exact dates + write-capable confirmation)
      if (scriptUrl && scriptUrl.startsWith('https://script.google.com/')) {
        try {
          const res = await fetch(`${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}action=read`, {
            method: 'GET',
            redirect: 'follow'
          });
          const text = await res.text();
          const json = JSON.parse(text);
          if (json && json.ok && Array.isArray(json.colonies)) {
            return {
              statusCode: 200,
              headers: CORS_HEADERS,
              body: JSON.stringify({
                ...json,
                writeEnabled: true,
                envConfigured: Boolean(envScriptUrl)
              })
            };
          }
        } catch (scriptErr) {
          // Fall through to live GViz CSV read so dashboard still stays live
        }
      }

      // Live direct read from public Google Sheet GViz CSV
      const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
      const csvRes = await fetch(csvUrl, { redirect: 'follow' });
      if (!csvRes.ok) {
        throw new Error(`Google Sheet fetch returned HTTP ${csvRes.status}`);
      }
      const csvText = await csvRes.text();
      const parsedRows = parseCSV(csvText);
      const colonies = [];

      for (let i = 1; i < parsedRows.length; i++) {
        const cols = parsedRows[i];
        const hasData = cols.slice(1, 9).some((v) => v !== undefined && String(v).trim() !== '');
        if (!hasData) continue;

        colonies.push({
          row: i + 1,
          sno: String(cols[0] || '').trim(),
          circle: String(cols[1] || '').trim(),
          ward: String(cols[2] || '').trim(),
          colony: String(cols[3] || '').trim(),
          date: normalizeDate(cols[4]),
          status: (String(cols[5] || 'HOLD').trim().toUpperCase()) || 'HOLD',
          dashboardRaw: String(cols[6] || '').trim(),
          finalRaw: String(cols[7] || '').trim(),
          dashboardCount: parseNumeric(cols[6]),
          finalCount: parseNumeric(cols[7]),
          reason: String(cols[8] || '').trim()
        });
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ok: true,
          source: 'gviz-csv',
          sheetId: SHEET_ID,
          sheetName: SHEET_NAME,
          count: colonies.length,
          writeEnabled: Boolean(scriptUrl),
          envConfigured: Boolean(envScriptUrl),
          updatedAt: new Date().toISOString(),
          colonies
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const scriptUrl = (payload.scriptUrl || envScriptUrl || '').trim();

      if (!scriptUrl || !scriptUrl.startsWith('https://script.google.com/')) {
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            ok: false,
            needsSetup: true,
            message: 'Google Apps Script Web App URL is not connected yet. Paste your deployed Web App URL in Admin -> Excel 2-Way Sync or set GOOGLE_APPS_SCRIPT_URL in Netlify.'
          })
        };
      }

      const forwardBody = {
        action: payload.action || 'updateRow',
        row: payload.row,
        data: payload.data,
        items: payload.items
      };

      const res = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(forwardBody),
        redirect: 'follow'
      });

      const text = await res.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (parseErr) {
        throw new Error('Apps Script did not return valid JSON. Verify deployment is set to "Anyone" access.');
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(result)
      };
    }

    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Method Not Allowed' })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
