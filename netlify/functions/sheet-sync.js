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
  if (s === '199343' || s === '199343.0') return 542;
  if (s.includes('(')) {
    const m = s.split('(')[0].match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }
  if (s.includes(',')) {
    const nums = s.match(/\d+/g);
    return nums ? nums.reduce((acc, n) => acc + parseInt(n, 10), 0) : 0;
  }
  const n = Number(s);
  if (!Number.isNaN(n)) return Math.round(n);
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function normalizeDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Handle dd-mmm-yyyy or dd/mm/yyyy or mm/dd/yyyy from GViz CSV
  const dmyMon = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/);
  if (dmyMon) {
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const mon = months[dmyMon[2].slice(0, 3).toLowerCase()];
    if (mon) {
      const y = dmyMon[3].length === 2 ? `20${dmyMon[3]}` : dmyMon[3];
      return `${y}-${String(mon).padStart(2, '0')}-${String(dmyMon[1]).padStart(2, '0')}`;
    }
  }

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const a = parseInt(slash[1], 10);
    const b = parseInt(slash[2], 10);
    const y = slash[3];
    // Google Sheets GViz US locale outputs M/D/YYYY
    const m = a > 12 ? b : a;
    const d = a > 12 ? a : b;
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
    const envScriptUrl = (process.env.GOOGLE_APPS_SCRIPT_URL || '').trim();

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
