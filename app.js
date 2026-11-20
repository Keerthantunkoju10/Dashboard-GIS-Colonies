/**
 * NeoGeo — GHMC Project Colony Performance Management Dashboard
 * Live Two-Way Google Sheets Integration (Dashboard + Admin Suite)
 *
 * Linked Sheet: https://docs.google.com/spreadsheets/d/1IrHCi97oTceUR7Bi_k-IPVrrNOUaW6npVDreGI1slfE/edit?usp=sharing
 */

(function () {
  'use strict';

  const CONFIG = {
    sheetId: '1IrHCi97oTceUR7Bi_k-IPVrrNOUaW6npVDreGI1slfE',
    sheetName: 'COLONIES',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1IrHCi97oTceUR7Bi_k-IPVrrNOUaW6npVDreGI1slfE/edit?usp=sharing',
    apiEndpoint: '/api/sheet-sync',
    autoSyncMs: 30000,
    storageKeys: {
      scriptUrl: 'GHMC_APPS_SCRIPT_URL_V2',
      adminCreds: 'GHMC_ADMIN_CREDS_V2',
      userCreds: 'GHMC_USER_CREDS_V2',
      adminSession: 'GHMC_ADMIN_SESSION_V2',
      pendingEdits: 'GHMC_PENDING_EDITS_V2',
      workspaceData: 'GHMC_WORKSPACE_COLONIES_V2',
      deletedRows: 'GHMC_DELETED_ROWS_V2',
      theme: 'GHMC_THEME_V2'
    }
  };

  const state = {
    allColonies: [],
    activeSource: 'fresh', // fresh | resubmit | layers
    activeView: 'overview', // overview | month | week | date | circle | admin
    activeAdminSubTab: 'colonies', // colonies | sync | auth
    isAuthenticated: false,
    adminUser: 'Admin',
    theme: localStorage.getItem('GHMC_THEME_V2') || 'light',
    scriptUrl: localStorage.getItem(CONFIG.storageKeys.scriptUrl) || '',
    envWriteConfigured: false,
    syncMode: 'snapshot', // apps-script | gviz-csv | snapshot
    lastSyncedAt: null,
    autoSyncTimer: null,
    adminSort: { key: 'row', dir: 'desc' },
    adminFilters: { search: '', status: 'ALL', circle: 'ALL' },
    coloniesDirSort: { key: 'row', dir: 'desc' },
    coloniesDirFilters: { search: '', status: 'ALL', circle: 'ALL' },
    dateWiseSelected: 'LATEST',
    circleSearch: '',
    circleFilter: 'ALL',
    selectedDrilldownCircle: null,
    pendingEdits: loadPendingEdits(),
    charts: {
      daily: null,
      circle: null,
      month: null,
      week: null
    }
  };

  const APPS_SCRIPT_SNIPPET = `var SPREADSHEET_ID = '${CONFIG.sheetId}';
var SHEET_NAME = '${CONFIG.sheetName}';

function getColoniesSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
}

function formatDateCell(val) {
  if (!val) return '';
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd');
  }
  return String(val).trim();
}

function parseDateInput(str) {
  if (!str) return '';
  var s = String(str).trim();
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) {
    var p = s.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  return s;
}

function parseNumeric(val) {
  if (val === null || val === undefined) return 0;
  var s = String(val).trim();
  if (!s || s === '-' || s === 'None' || s === 'N/A') return 0;
  if (s === '199343' || s === '199343.0') return 199;
  if (s.indexOf('(') !== -1) {
    var m1 = s.split('(')[0].match(/\\d+/);
    return m1 ? parseInt(m1[0], 10) : 0;
  }
  if (s.indexOf(',') !== -1) {
    if (/^\\d{1,3}(,\\d{2,3})+$/.test(s)) {
      return parseInt(s.replace(/,/g, ''), 10) || 0;
    }
    var parts = s.split(',');
    var sum = 0;
    var count = 0;
    for (var i = 0; i < parts.length; i++) {
      var n = parseInt(parts[i].trim(), 10);
      if (!isNaN(n)) { sum += n; count++; }
    }
    if (count > 1) return sum;
  }
  var cleaned = s.replace(/,/g, '');
  var num = Number(cleaned);
  if (!isNaN(num)) return Math.round(num);
  var m2 = cleaned.match(/\\d+/);
  return m2 ? parseInt(m2[0], 10) : 0;
}

function normalizeCell(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).trim();
  if (s === '') return '';
  return /^\\d+$/.test(s) ? Number(s) : s;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === 'ping') {
      return jsonOut({ ok: true, connected: true, sheetName: SHEET_NAME });
    }
    var sheet = getColoniesSheet();
    var lastRow = sheet.getLastRow();
    var values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 9).getValues() : [];
    var colonies = [];
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      var hasData = false;
      for (var c = 1; c < 9; c++) {
        if (r[c] !== null && r[c] !== undefined && String(r[c]).trim() !== '') { hasData = true; break; }
      }
      if (!hasData) continue;
      colonies.push({
        row: i + 2,
        sno: r[0] != null ? String(r[0]).trim() : '',
        circle: r[1] != null ? String(r[1]).trim() : '',
        ward: r[2] != null ? String(r[2]).trim() : '',
        colony: r[3] != null ? String(r[3]).trim() : '',
        date: formatDateCell(r[4]),
        status: (r[5] != null ? String(r[5]).trim().toUpperCase() : '') || 'HOLD',
        dashboardRaw: r[6] != null ? String(r[6]).trim() : '',
        finalRaw: r[7] != null ? String(r[7]).trim() : '',
        dashboardCount: parseNumeric(r[6]),
        finalCount: parseNumeric(r[7]),
        reason: r[8] != null ? String(r[8]).trim() : ''
      });
    }
    return jsonOut({ ok: true, source: 'apps-script', count: colonies.length, updatedAt: new Date().toISOString(), colonies: colonies });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function findNextEmptyRow(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { row: 2, sno: 1 };
  var values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var maxSno = 0;
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var hasData = false;
    for (var c = 1; c < 9; c++) {
      if (r[c] !== null && r[c] !== undefined && String(r[c]).trim() !== '') { hasData = true; break; }
    }
    if (hasData) {
      var n = parseInt(String(r[0] || ''), 10);
      if (!isNaN(n) && n > maxSno) maxSno = n;
    } else {
      return { row: i + 2, sno: r[0] ? r[0] : maxSno + 1 };
    }
  }
  return { row: lastRow + 1, sno: maxSno + 1 };
}

function applyUpdate(sheet, d) {
  var rowNum = parseInt(d.row, 10);
  var ex = sheet.getRange(rowNum, 1, 1, 9).getValues()[0];
  var upd = [
    d.sno !== undefined && d.sno !== '' ? normalizeCell(d.sno) : ex[0],
    d.circle !== undefined ? String(d.circle).trim() : ex[1],
    d.ward !== undefined ? String(d.ward).trim() : ex[2],
    d.colony !== undefined ? String(d.colony).trim() : ex[3],
    d.date !== undefined && d.date !== '' ? parseDateInput(d.date) : ex[4],
    d.status !== undefined ? String(d.status).trim().toUpperCase() : ex[5],
    d.dashboardCount !== undefined ? normalizeCell(d.dashboardCount) : ex[6],
    d.finalCount !== undefined ? normalizeCell(d.finalCount) : ex[7],
    d.reason !== undefined ? String(d.reason).trim() : ex[8]
  ];
  sheet.getRange(rowNum, 1, 1, 9).setValues([upd]);
  if (upd[4] instanceof Date) sheet.getRange(rowNum, 5).setNumberFormat('dd-mmm-yyyy');
  return rowNum;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : '{}');
    var sheet = getColoniesSheet();
    if (body.action === 'ping') return jsonOut({ ok: true, connected: true, sheetName: SHEET_NAME });
    if (body.action === 'updateRow') {
      var r = applyUpdate(sheet, body.data || body);
      SpreadsheetApp.flush();
      return jsonOut({ ok: true, row: r, message: 'Row #' + r + ' updated in Google Sheet.' });
    }
    if (body.action === 'addRow') {
      var d = body.data || body;
      var slot = findNextEmptyRow(sheet);
      var vals = [slot.sno, String(d.circle || '').trim(), String(d.ward || '').trim(), String(d.colony || '').trim(), parseDateInput(d.date), String(d.status || 'PROGRESS').trim().toUpperCase(), normalizeCell(d.dashboardCount), normalizeCell(d.finalCount), String(d.reason || '').trim()];
      sheet.getRange(slot.row, 1, 1, 9).setValues([vals]);
      if (vals[4] instanceof Date) sheet.getRange(slot.row, 5).setNumberFormat('dd-mmm-yyyy');
      SpreadsheetApp.flush();
      return jsonOut({ ok: true, row: slot.row, sno: String(slot.sno), message: 'Added at Row #' + slot.row });
    }
    if (body.action === 'bulkUpdate') {
      var items = body.items || [];
      for (var i = 0; i < items.length; i++) applyUpdate(sheet, items[i]);
      SpreadsheetApp.flush();
      return jsonOut({ ok: true, count: items.length, message: items.length + ' rows synced to Google Sheet.' });
    }
    if (body.action === 'deleteRow') {
      var rNum = parseInt(body.row || (body.data && body.data.row), 10);
      if (!isNaN(rNum) && rNum >= 2 && rNum <= sheet.getLastRow()) {
        sheet.deleteRow(rNum);
        SpreadsheetApp.flush();
        return jsonOut({ ok: true, row: rNum, message: 'Deleted Row #' + rNum });
      }
      return jsonOut({ ok: false, error: 'Invalid row to delete' });
    }
    return jsonOut({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}`;

  /* ==========================================================================
     Utility Helpers
     ========================================================================== */

  function loadPendingEdits() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKeys.pendingEdits);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function savePendingEdits() {
    localStorage.setItem(CONFIG.storageKeys.pendingEdits, JSON.stringify(state.pendingEdits));
  }

  function loadWorkspaceData() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKeys.workspaceData);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveWorkspaceData() {
    try {
      if (Array.isArray(state.allColonies) && state.allColonies.length > 0) {
        localStorage.setItem(CONFIG.storageKeys.workspaceData, JSON.stringify(state.allColonies));
      }
    } catch (e) {
      console.warn('Failed to save workspace data to localStorage:', e);
    }
  }

  function loadDeletedRows() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKeys.deletedRows);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveDeletedRows(rows) {
    try {
      localStorage.setItem(CONFIG.storageKeys.deletedRows, JSON.stringify(rows));
    } catch {}
  }

  function formatIndianNumber(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('en-IN');
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
    // Handle comma numbers (e.g. "1,099" or "206, 188")
    if (s.includes(',')) {
      // Standard formatted thousand / lakh number e.g. "1,099", "26,520", "19,81,000"
      if (/^\d{1,3}(,\d{2,3})+$/.test(s)) {
        return parseInt(s.replace(/,/g, ''), 10) || 0;
      }
      // Multiple separate counts e.g. "206, 188" or "82, 142"
      const parts = s.split(',').map((p) => parseInt(p.trim(), 10)).filter((n) => !Number.isNaN(n));
      if (parts.length > 1) {
        return parts.reduce((a, b) => a + b, 0);
      }
    }
    const cleaned = s.replace(/,/g, '');
    const n = Number(cleaned);
    if (!Number.isNaN(n)) return Math.round(n);
    const m = cleaned.match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }

  function normalizeCircleKey(circle) {
    const raw = String(circle || '').trim().toUpperCase();
    if (!raw || raw === '-') return 'UNASSIGNED';
    return raw
      .replace(/\s+/g, ' ')
      .replace('21-CHANDA NAGAR', '21-CHANDANAGAR')
      .replace('3-HAYAT NAGAR', '3-HAYATNAGAR');
  }

  function formatDisplayDate(isoDate) {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '—';
    const [y, m, d] = isoDate.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(d).padStart(2, '0')}-${months[m - 1]}-${y}`;
  }

  function formatShortDate(isoDate) {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
    const [, m, d] = isoDate.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(d).padStart(2, '0')} ${months[m - 1]}`;
  }

  function formatMonthLabel(ym) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || 'Unknown';
    const [y, m] = ym.split('-').map(Number);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[m - 1]} ${y}`;
  }

  function getWeekStart(isoDate) {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const day = dt.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday start
    dt.setDate(dt.getDate() + diff);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function addDays(isoDate, days) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

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
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\r' && next === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
        else if (ch === '\n' || ch === '\r') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += ch;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function normalizeCsvDate(raw) {
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
      // If p2 > 12 and p1 <= 12, it is definitely MM/DD/YYYY
      if (p2 > 12 && p1 <= 12) {
        m = p1;
        d = p2;
      }
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) {
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
    return s;
  }

  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : type === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-info';
    el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHtml(msg)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(14px)';
      el.style.transition = 'all 0.25s ease';
      setTimeout(() => el.remove(), 260);
    }, 4200);
  }

  /* ==========================================================================
     Data Filtering by Primary Stream (Fresh / Resubmit / 3Layers)
     ========================================================================== */

  function filterBySource(records, source) {
    if (source === 'resubmit') {
      return records.filter((r) => {
        const st = (r.status || '').toUpperCase();
        const rs = (r.reason || '').toLowerCase();
        return st === 'HOLD' || st === 'PROGRESS' || st === 'REJECTED' ||
          rs.includes('reject') || rs.includes('resurvey') || rs.includes('field') || rs.includes('qa');
      });
    }
    if (source === 'layers') {
      return records.filter((r) => {
        const rs = (r.reason || '').toLowerCase();
        return rs.includes('layer') || rs.includes('road network') || rs.includes('utilities') || rs.includes('gis');
      });
    }
    return records; // 'fresh' = complete active GHMC tracker
  }

  function getActiveRecords() {
    return filterBySource(state.allColonies, state.activeSource);
  }

  function mergePendingEdits(records) {
    const map = new Map();
    records.forEach((r) => map.set(String(r.row), { ...r }));

    Object.entries(state.pendingEdits).forEach(([key, edit]) => {
      if (edit._isNew) {
        if (!map.has(key)) map.set(key, { ...edit });
      } else if (map.has(key)) {
        map.set(key, { ...map.get(key), ...edit, _pendingSync: true });
      }
    });

    return Array.from(map.values()).sort((a, b) => (Number(a.row) || 0) - (Number(b.row) || 0));
  }

  function reconcileColoniesWithRemote(localRecords, remoteRecords) {
    if (!remoteRecords || !remoteRecords.length) return localRecords || [];
    const baseLocal = (localRecords && localRecords.length) ? localRecords : [];
    const deleted = new Set(loadDeletedRows().map(String));

    const remoteMap = new Map();
    remoteRecords.forEach((r) => {
      const key = String(r.row);
      remoteMap.set(key, r);
    });

    const merged = [];
    const localSeenKeys = new Set();

    baseLocal.forEach((loc) => {
      const key = String(loc.row);
      if (deleted.has(key)) return;
      localSeenKeys.add(key);

      // If this row has a pending edit, keep the user's local edit
      if (state.pendingEdits && state.pendingEdits[key]) {
        merged.push({ ...loc, ...state.pendingEdits[key] });
      } else if (remoteMap.has(key)) {
        // Reconcile with remote updates while retaining any local fields if remote is empty
        const rem = remoteMap.get(key);
        merged.push({
          ...loc,
          ...rem,
          colony: (rem.colony && rem.colony !== '-') ? rem.colony : loc.colony,
          circle: (rem.circle && rem.circle !== '-') ? rem.circle : loc.circle,
          ward: (rem.ward && rem.ward !== '-') ? rem.ward : loc.ward,
          date: rem.date || loc.date
        });
      } else {
        // Exists in local snapshot/workspace (e.g. rows 161-167) -> PRESERVE IT!
        merged.push(loc);
      }
    });

    // Also include any new rows from remote that local doesn't have yet
    remoteRecords.forEach((rem) => {
      const key = String(rem.row);
      if (!localSeenKeys.has(key) && !deleted.has(key)) {
        merged.push(rem);
      }
    });

    return merged.sort((a, b) => (Number(a.row) || 0) - (Number(b.row) || 0));
  }

  /* ==========================================================================
     Live Google Sheets Sync (Read & Write)
     ========================================================================== */

  function isWriteConnected() {
    return Boolean(state.envWriteConfigured || (state.scriptUrl && state.scriptUrl.startsWith('https://script.google.com/')));
  }

  async function fetchLiveSheetData(silent = false) {
    const refreshIcon = document.getElementById('refreshIcon');
    if (refreshIcon) refreshIcon.classList.add('fa-spin');

    let fetched = null;
    let sourceLabel = 'snapshot';

    // 1. Try Netlify Serverless Function (/api/sheet-sync) first
    try {
      const qs = state.scriptUrl ? `?scriptUrl=${encodeURIComponent(state.scriptUrl)}` : '';
      const res = await fetch(`${CONFIG.apiEndpoint}${qs}`, { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.colonies) && data.colonies.length > 0) {
          fetched = data.colonies;
          sourceLabel = data.source || 'gviz-csv';
          state.envWriteConfigured = Boolean(data.envConfigured);
        }
      }
    } catch {
      // Running outside Netlify (e.g., local static server) — continue to direct fallback
    }

    // 2. Direct Apps Script GET fallback (if user configured script URL locally)
    if (!fetched && state.scriptUrl && state.scriptUrl.startsWith('https://script.google.com/')) {
      try {
        const res = await fetch(`${state.scriptUrl}${state.scriptUrl.includes('?') ? '&' : '?'}action=read`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok && Array.isArray(data.colonies)) {
            fetched = data.colonies;
            sourceLabel = 'apps-script';
          }
        }
      } catch {
        // Continue to GViz CSV
      }
    }

    // 3. Direct Google Sheets GViz CSV fallback (public read-only CORS endpoint)
    if (!fetched) {
      try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CONFIG.sheetName)}&_=${Date.now()}`;
        const res = await fetch(csvUrl, { cache: 'no-store' });
        if (res.ok) {
          const text = await res.text();
          const parsed = parseCSV(text);
          const rows = [];
          for (let i = 1; i < parsed.length; i++) {
            const cols = parsed[i];
            const hasData = cols.slice(1, 9).some((v) => v !== undefined && String(v).trim() !== '');
            if (!hasData) continue;
            rows.push({
              row: i + 1,
              sno: String(cols[0] || '').trim(),
              circle: String(cols[1] || '').trim(),
              ward: String(cols[2] || '').trim(),
              colony: String(cols[3] || '').trim(),
              date: normalizeCsvDate(cols[4]),
              status: (String(cols[5] || 'HOLD').trim().toUpperCase()) || 'HOLD',
              dashboardRaw: String(cols[6] || '').trim(),
              finalRaw: String(cols[7] || '').trim(),
              dashboardCount: parseNumeric(cols[6]),
              finalCount: parseNumeric(cols[7]),
              reason: String(cols[8] || '').trim()
            });
          }
          if (rows.length > 0) {
            fetched = rows;
            sourceLabel = 'gviz-csv';
          }
        }
      } catch {
        // Offline fallback handled below
      }
    }

    if (fetched && fetched.length > 0) {
      state.allColonies = reconcileColoniesWithRemote(state.allColonies, fetched);
      state.allColonies = mergePendingEdits(state.allColonies);
      saveWorkspaceData();
      state.syncMode = sourceLabel;
      state.lastSyncedAt = new Date();
      if (!silent) {
        showToast(`Synced ${state.allColonies.length} verified records with Google Sheet (${CONFIG.sheetName})`, 'success');
      }
    } else if (state.allColonies.length === 0) {
      state.syncMode = 'unlinked';
      if (!silent) {
        showToast('No records retrieved from linked Excel / Google Sheet.', 'warn');
      }
    }

    if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    updateSyncStatusUI();
    renderAll();
  }

  async function writeToGoogleSheet(action, payload) {
    // 1. Try Netlify serverless proxy first (cleanest CORS + env var support)
    try {
      const res = await fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          scriptUrl: state.scriptUrl || undefined,
          data: payload.data,
          items: payload.items
        })
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {
      // Fallback to direct Apps Script POST when running locally
    }

    // 2. Direct Apps Script POST (when opened locally without Netlify Functions)
    if (state.scriptUrl && state.scriptUrl.startsWith('https://script.google.com/')) {
      try {
        const res = await fetch(state.scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, data: payload.data, items: payload.items }),
          redirect: 'follow'
        });
        const text = await res.text();
        return JSON.parse(text);
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    return {
      ok: false,
      needsSetup: true,
      message: 'Connect your Google Apps Script Web App URL in Excel 2-Way Sync Setup to push updates directly to Google Sheets.'
    };
  }

  function updateSyncStatusUI() {
    const count = state.allColonies.length;
    const writeReady = isWriteConnected();
    const pendingCount = Object.keys(state.pendingEdits).length;

    const headerDot = document.getElementById('headerSyncDot');
    const headerText = document.getElementById('headerSyncText');
    const syncPillText = document.getElementById('syncPillText');
    const syncPillDot = document.getElementById('syncPillDot');
    const lastSyncTimeText = document.getElementById('lastSyncTimeText');

    if (headerText) {
      headerText.textContent = writeReady
        ? '2-Way Excel Sync Active'
        : (count === 0 ? 'Google Sheet Linked (0 Rows)' : 'Google Sheet Live Read');
    }
    if (headerDot) {
      headerDot.classList.toggle('amber', count === 0);
    }
    if (syncPillText) {
      syncPillText.textContent = `Live Sheet: ${count} Rows`;
    }
    if (syncPillDot) {
      syncPillDot.classList.toggle('amber', count === 0);
    }
    if (lastSyncTimeText && state.lastSyncedAt) {
      lastSyncTimeText.textContent = `Updated ${state.lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    // Admin banner
    const banner = document.getElementById('adminSyncStatusBanner');
    const msg = document.getElementById('adminSyncStatusMsg');
    const pushBtn = document.getElementById('btnPushPendingAll');
    const pushText = document.getElementById('btnPushPendingText');
    const syncBtnLabel = document.getElementById('adminSyncBtnLabel');

    if (banner && msg) {
      if (writeReady) {
        banner.className = 'sync-banner connected';
        msg.innerHTML = `<i class="fa-solid fa-circle-check"></i> <strong>Two-Way Google Sheets Sync Active!</strong> Saving any row below immediately updates Google Sheet <strong>${CONFIG.sheetName}</strong> and the public dashboard.`;
      } else {
        banner.className = 'sync-banner setup-needed';
        msg.innerHTML = `<i class="fa-solid fa-circle-info"></i> <strong>Live Read Active${pendingCount ? ` (${pendingCount} local change${pendingCount > 1 ? 's' : ''} queued)` : ''}:</strong> To push Admin status edits back into Google Sheets automatically, paste your deployed Apps Script URL in <em>Excel 2-Way Sync Setup</em>.`;
      }
    }

    if (pushBtn && pushText) {
      if (pendingCount > 0) {
        pushBtn.style.display = 'inline-flex';
        pushText.textContent = `Push ${pendingCount} Pending to Excel`;
      } else {
        pushBtn.style.display = 'none';
      }
    }

    if (syncBtnLabel) {
      syncBtnLabel.textContent = writeReady ? '2-Way Sync: ON' : 'Excel 2-Way Sync';
    }
  }

  /* ==========================================================================
     Rendering All Dashboard Sections
     ========================================================================== */

  function renderAll() {
    renderPrimaryTabCounts();
    renderExecutiveKPIs();
    renderOverview();
    renderMonthWise();
    renderWeekWise();
    renderDateWise();
    renderCircleWise();
    renderColoniesDirectory();
    if (state.isAuthenticated) {
      renderAdminTable();
    }
  }

  function renderPrimaryTabCounts() {
    document.getElementById('countFresh').textContent = filterBySource(state.allColonies, 'fresh').length;
    document.getElementById('countResubmit').textContent = filterBySource(state.allColonies, 'resubmit').length;
    document.getElementById('countLayers').textContent = filterBySource(state.allColonies, 'layers').length;
  }

  function renderExecutiveKPIs() {
    const records = getActiveRecords();
    const totalDash = records.reduce((s, r) => s + (Number(r.dashboardCount) || 0), 0);
    const totalFinal = records.reduce((s, r) => s + (Number(r.finalCount) || 0), 0);
    const completedRows = records.filter((r) => (r.status || '').toUpperCase() === 'COMPLETED');
    const completedFinalProps = completedRows.reduce((s, r) => s + (Number(r.finalCount) || 0), 0);

    const validDates = records.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const lastDate = validDates.length ? validDates[validDates.length - 1] : '';

    document.getElementById('kpiTotalProps').textContent = formatIndianNumber(totalDash);
    document.getElementById('kpiTotalPropsSub').textContent = `Across ${formatIndianNumber(records.length)} colony records`;
    document.getElementById('kpiFinalProps').textContent = formatIndianNumber(totalFinal);
    const pct = totalDash > 0 ? ((totalFinal / totalDash) * 100).toFixed(1) : '0.0';
    document.getElementById('kpiFinalPropsSub').textContent = `${pct}% of dashboard target verified`;
    document.getElementById('kpiLastDate').textContent = formatDisplayDate(lastDate);
    document.getElementById('kpiCompletedColonies').textContent = formatIndianNumber(completedRows.length);
    document.getElementById('kpiCompletedSub').textContent = `${formatIndianNumber(completedFinalProps)} finalized properties verified`;
  }

  function computeCircleAggregates(records) {
    const map = new Map();
    records.forEach((r) => {
      const key = normalizeCircleKey(r.circle);
      if (key === 'UNASSIGNED') return;
      if (!map.has(key)) {
        map.set(key, {
          circle: key,
          total: 0,
          completed: 0,
          hold: 0,
          progress: 0,
          target: 0,
          finalized: 0,
          rows: []
        });
      }
      const agg = map.get(key);
      agg.total += 1;
      const st = (r.status || '').toUpperCase();
      if (st === 'COMPLETED') agg.completed += 1;
      else if (st === 'PROGRESS') agg.progress += 1;
      else agg.hold += 1;
      agg.target += Number(r.dashboardCount) || 0;
      agg.finalized += Number(r.finalCount) || 0;
      agg.rows.push(r);
    });

    return Array.from(map.values()).map((c) => {
      const achievement = c.target > 0
        ? (c.finalized / c.target) * 100
        : (c.total > 0 ? (c.completed / c.total) * 100 : 0);
      return { ...c, achievement };
    });
  }

  function renderOverview() {
    const records = getActiveRecords();
    const totalDash = records.reduce((s, r) => s + (Number(r.dashboardCount) || 0), 0);
    const totalFinal = records.reduce((s, r) => s + (Number(r.finalCount) || 0), 0);
    const completedCount = records.filter((r) => (r.status || '').toUpperCase() === 'COMPLETED').length;
    const holdCount = records.filter((r) => (r.status || '').toUpperCase() === 'HOLD').length;
    const progressCount = records.filter((r) => (r.status || '').toUpperCase() === 'PROGRESS').length;
    const rejectedCount = records.filter((r) => (r.status || '').toUpperCase() === 'REJECTED').length;

    const circles = new Set(records.map((r) => normalizeCircleKey(r.circle)).filter((c) => c !== 'UNASSIGNED'));
    const dates = records.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const uniqueDays = new Set(dates).size;
    const minDate = dates[0] || '';
    const maxDate = dates[dates.length - 1] || '';

    const overallAch = totalDash > 0 ? Math.round((totalFinal / totalDash) * 100) : 0;
    const taskComp = records.length > 0 ? ((completedCount / records.length) * 100).toFixed(1) : '0.0';

    const streamLabels = {
      fresh: 'OVERALL PERFORMANCE — FRESH DATA',
      resubmit: 'RESUBMIT & HOLD PERFORMANCE',
      layers: '3LAYERS & GIS DELIVERY PERFORMANCE'
    };

    document.getElementById('overviewStreamBadge').textContent = streamLabels[state.activeSource];
    document.getElementById('overviewHeading').textContent = minDate
      ? `Output Performance After ${formatDisplayDate(minDate)}`
      : 'Overall Colony Performance';
    document.getElementById('overviewSubtext').textContent = minDate
      ? `Overall colony performance calculated live from Google Sheet COLONIES records (${formatDisplayDate(minDate)} to ${formatDisplayDate(maxDate)})`
      : 'Overall colony performance calculated live from Google Sheet records';

    document.getElementById('overviewStatusChips').innerHTML = `
      <span class="summary-chip green"><i class="fa-solid fa-check"></i> Completed: ${completedCount}</span>
      <span class="summary-chip blue"><i class="fa-solid fa-spinner"></i> Progress: ${progressCount}</span>
      <span class="summary-chip amber"><i class="fa-solid fa-pause"></i> Hold: ${holdCount + rejectedCount}</span>
    `;

    document.getElementById('mkTarget').textContent = formatIndianNumber(totalDash);
    document.getElementById('mkFinalized').textContent = formatIndianNumber(totalFinal);
    document.getElementById('mkCircles').textContent = formatIndianNumber(circles.size);
    document.getElementById('mkDays').textContent = formatIndianNumber(uniqueDays);
    document.getElementById('mkCompleted').textContent = formatIndianNumber(completedCount);
    document.getElementById('mkAchievement').textContent = `${overallAch}%`;
    document.getElementById('mkPending').textContent = formatIndianNumber(holdCount + progressCount + rejectedCount);
    document.getElementById('mkTaskCompletion').textContent = `${taskComp}%`;
    document.getElementById('mkTaskProgressBar').style.width = `${Math.min(100, Number(taskComp))}%`;

    // Top 3 & Least 3 Performers (Circles with target > 0 first, fallback all)
    const circleAggs = computeCircleAggregates(records);
    const rankedPool = circleAggs.filter((c) => c.target > 0);
    const pool = rankedPool.length >= 3 ? rankedPool : circleAggs;

    const top3 = [...pool].sort((a, b) => b.achievement - a.achievement || b.finalized - a.finalized).slice(0, 3);
    const least3 = [...pool].sort((a, b) => a.achievement - b.achievement || a.finalized - b.finalized).slice(0, 3);

    const renderPerfRows = (list) => {
      if (!list.length) {
        return `<tr><td colspan="4" style="color: var(--text-muted); padding: 14px;">No circle records in this view</td></tr>`;
      }
      return list.map((c) => `
        <tr>
          <td><span class="perf-link" data-drill-circle="${escapeHtml(c.circle)}">${escapeHtml(c.circle)}</span></td>
          <td>${formatIndianNumber(c.target)}</td>
          <td>${formatIndianNumber(c.finalized)}</td>
          <td><strong>${c.achievement.toFixed(1)}%</strong></td>
        </tr>
      `).join('');
    };

    document.getElementById('topPerformersBody').innerHTML = renderPerfRows(top3);
    document.getElementById('leastPerformersBody').innerHTML = renderPerfRows(least3);

    // Wire clickable circle links to open Circle Wise drilldown
    document.querySelectorAll('.perf-link[data-drill-circle]').forEach((el) => {
      el.addEventListener('click', () => {
        const circleName = el.getAttribute('data-drill-circle');
        state.selectedDrilldownCircle = circleName;
        switchView('circle');
      });
    });

    renderOverviewCharts(records, circleAggs);
  }

  function renderOverviewCharts(records, circleAggs) {
    // Chart 1: Daily Target vs Finalized (recent 35 active dates for crisp readability like Image 1)
    const byDate = new Map();
    records.forEach((r) => {
      if (!r.date) return;
      if (!byDate.has(r.date)) byDate.set(r.date, { target: 0, finalized: 0 });
      const entry = byDate.get(r.date);
      entry.target += Number(r.dashboardCount) || 0;
      entry.finalized += Number(r.finalCount) || 0;
    });

    const sortedDates = Array.from(byDate.keys()).sort();
    const displayDates = sortedDates.slice(-36);
    const labelsDaily = displayDates.map(formatShortDate);
    const targetData = displayDates.map((d) => byDate.get(d).target);
    const finalData = displayDates.map((d) => byDate.get(d).finalized);

    const ctxDaily = document.getElementById('dailyTargetChart').getContext('2d');
    if (state.charts.daily) state.charts.daily.destroy();
    state.charts.daily = new Chart(ctxDaily, {
      type: 'bar',
      data: {
        labels: labelsDaily,
        datasets: [
          {
            label: 'Dashboard Target',
            data: targetData,
            backgroundColor: '#3b6fd4',
            borderRadius: 3,
            barPercentage: 0.78,
            categoryPercentage: 0.72
          },
          {
            label: 'Finalized',
            data: finalData,
            backgroundColor: '#0e9f6e',
            borderRadius: 3,
            barPercentage: 0.78,
            categoryPercentage: 0.72
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, weight: '600' } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 } },
          y: { beginAtZero: true, grid: { color: '#e9eff6' }, ticks: { font: { size: 10.5 } } }
        }
      }
    });

    // Chart 2: Overall Circle Achievement % (Color-ramped bars matching Image 1!)
    const sortedCircles = [...circleAggs]
      .sort((a, b) => b.achievement - a.achievement)
      .slice(0, 18);

    const circleLabels = sortedCircles.map((c) => c.circle.replace(/^\d+-/, ''));
    const circleVals = sortedCircles.map((c) => Number(c.achievement.toFixed(1)));
    const circleColors = circleVals.map((v) => {
      if (v >= 90) return '#059669';
      if (v >= 65) return '#f59e0b';
      if (v >= 35) return '#f97316';
      return '#ef4444';
    });

    const ctxCircle = document.getElementById('circleAchievementChart').getContext('2d');
    if (state.charts.circle) state.charts.circle.destroy();
    state.charts.circle = new Chart(ctxCircle, {
      type: 'bar',
      data: {
        labels: circleLabels,
        datasets: [
          {
            label: 'Achievement %',
            data: circleVals,
            backgroundColor: circleColors,
            borderRadius: 5,
            maxBarThickness: 28
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const c = sortedCircles[ctx.dataIndex];
                return ` ${ctx.parsed.y}% (${formatIndianNumber(c.finalized)} / ${formatIndianNumber(c.target)})`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9.5 }, maxRotation: 48, minRotation: 30 } },
          y: {
            beginAtZero: true,
            grid: { color: '#e9eff6' },
            ticks: { callback: (v) => `${v}%`, font: { size: 10.5 } }
          }
        }
      }
    });
  }

  /* ==========================================================================
     Month Wise View
     ========================================================================== */

  function renderMonthWise() {
    const records = getActiveRecords();
    const map = new Map();

    records.forEach((r) => {
      const ym = r.date && r.date.length >= 7 ? r.date.slice(0, 7) : 'Unknown';
      if (!map.has(ym)) {
        map.set(ym, { ym, total: 0, completed: 0, progress: 0, hold: 0, target: 0, finalized: 0 });
      }
      const m = map.get(ym);
      m.total++;
      const st = (r.status || '').toUpperCase();
      if (st === 'COMPLETED') m.completed++;
      else if (st === 'PROGRESS') m.progress++;
      else m.hold++;
      m.target += Number(r.dashboardCount) || 0;
      m.finalized += Number(r.finalCount) || 0;
    });

    const months = Array.from(map.values()).sort((a, b) => a.ym.localeCompare(b.ym));
    document.getElementById('monthCountBadge').textContent = `${months.length} Months`;

    document.getElementById('monthTableBody').innerHTML = months.map((m) => {
      const ach = m.target > 0 ? ((m.finalized / m.target) * 100).toFixed(1) : '0.0';
      return `
        <tr>
          <td><strong>${escapeHtml(formatMonthLabel(m.ym))}</strong></td>
          <td class="center">${m.total}</td>
          <td class="center"><span class="status-badge completed">${m.completed}</span></td>
          <td class="center"><span class="status-badge progress">${m.progress}</span></td>
          <td class="center"><span class="status-badge hold">${m.hold}</span></td>
          <td class="num">${formatIndianNumber(m.target)}</td>
          <td class="num"><strong>${formatIndianNumber(m.finalized)}</strong></td>
          <td class="center"><strong>${ach}%</strong></td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="8" class="center">No monthly records available</td></tr>`;

    const ctx = document.getElementById('monthWiseChart').getContext('2d');
    if (state.charts.month) state.charts.month.destroy();
    state.charts.month = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months.map((m) => formatMonthLabel(m.ym)),
        datasets: [
          { label: 'Dashboard Target', data: months.map((m) => m.target), backgroundColor: '#3b6fd4', borderRadius: 5 },
          { label: 'Finalized Properties', data: months.map((m) => m.finalized), backgroundColor: '#0e9f6e', borderRadius: 5 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: '#e9eff6' } }
        }
      }
    });
  }

  /* ==========================================================================
     Week Wise View
     ========================================================================== */

  function renderWeekWise() {
    const records = getActiveRecords();
    const map = new Map();

    records.forEach((r) => {
      const ws = getWeekStart(r.date) || 'Unknown';
      if (!map.has(ws)) {
        map.set(ws, { ws, total: 0, completed: 0, pending: 0, target: 0, finalized: 0 });
      }
      const w = map.get(ws);
      w.total++;
      if ((r.status || '').toUpperCase() === 'COMPLETED') w.completed++;
      else w.pending++;
      w.target += Number(r.dashboardCount) || 0;
      w.finalized += Number(r.finalCount) || 0;
    });

    const weeks = Array.from(map.values()).sort((a, b) => a.ws.localeCompare(b.ws));
    document.getElementById('weekCountBadge').textContent = `${weeks.length} Weeks`;

    document.getElementById('weekTableBody').innerHTML = [...weeks].reverse().map((w) => {
      const end = w.ws !== 'Unknown' ? addDays(w.ws, 6) : '';
      const label = w.ws !== 'Unknown' ? `${formatDisplayDate(w.ws)} to ${formatDisplayDate(end)}` : 'Unknown';
      const ach = w.target > 0 ? ((w.finalized / w.target) * 100).toFixed(1) : '0.0';
      return `
        <tr>
          <td><strong>${escapeHtml(label)}</strong></td>
          <td class="center">${w.total}</td>
          <td class="center"><span class="status-badge completed">${w.completed}</span></td>
          <td class="center"><span class="status-badge hold">${w.pending}</span></td>
          <td class="num">${formatIndianNumber(w.target)}</td>
          <td class="num"><strong>${formatIndianNumber(w.finalized)}</strong></td>
          <td class="center"><strong>${ach}%</strong></td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="7" class="center">No weekly records available</td></tr>`;

    const ctx = document.getElementById('weekWiseChart').getContext('2d');
    if (state.charts.week) state.charts.week.destroy();
    state.charts.week = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: weeks.map((w) => (w.ws !== 'Unknown' ? formatShortDate(w.ws) : 'Unknown')),
        datasets: [
          { label: 'Target', data: weeks.map((w) => w.target), backgroundColor: '#4f46e5', borderRadius: 4 },
          { label: 'Finalized', data: weeks.map((w) => w.finalized), backgroundColor: '#10b981', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 45 } },
          y: { beginAtZero: true, grid: { color: '#e9eff6' } }
        }
      }
    });
  }

  /* ==========================================================================
     Date Wise View
     ========================================================================== */

  function renderDateWise() {
    const records = getActiveRecords();
    const uniqueDates = Array.from(new Set(records.map((r) => r.date).filter(Boolean))).sort().reverse();
    const sel = document.getElementById('dateWiseSelect');

    if (state.dateWiseSelected === 'LATEST' || (state.dateWiseSelected !== 'ALL' && !uniqueDates.includes(state.dateWiseSelected))) {
      state.dateWiseSelected = uniqueDates[0] || 'ALL';
    }

    sel.innerHTML = `<option value="ALL">All Dates (${uniqueDates.length})</option>` +
      uniqueDates.map((d) => `<option value="${d}">${formatDisplayDate(d)}</option>`).join('');
    sel.value = state.dateWiseSelected;

    const filtered = state.dateWiseSelected === 'ALL'
      ? [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      : records.filter((r) => r.date === state.dateWiseSelected);

    const totalDash = filtered.reduce((s, r) => s + (Number(r.dashboardCount) || 0), 0);
    const totalFinal = filtered.reduce((s, r) => s + (Number(r.finalCount) || 0), 0);
    const completed = filtered.filter((r) => (r.status || '').toUpperCase() === 'COMPLETED').length;

    document.getElementById('dateWiseStats').innerHTML = `
      <div class="admin-stat-box blue"><div class="as-label">Records</div><div class="as-val">${filtered.length}</div></div>
      <div class="admin-stat-box green"><div class="as-label">Completed</div><div class="as-val">${completed}</div></div>
      <div class="admin-stat-box lavender"><div class="as-label">Dashboard Target</div><div class="as-val">${formatIndianNumber(totalDash)}</div></div>
      <div class="admin-stat-box mint"><div class="as-label">Finalized Count</div><div class="as-val">${formatIndianNumber(totalFinal)}</div></div>
    `;

    document.getElementById('dateTableBody').innerHTML = filtered.map((r) => `
      <tr data-row="${escapeHtml(r.row)}">
        <td>${escapeHtml(r.sno)}</td>
        <td>${escapeHtml(formatDisplayDate(r.date))}</td>
        <td><strong>${escapeHtml(r.circle)}</strong></td>
        <td>${escapeHtml(r.ward)}</td>
        <td>${escapeHtml(r.colony)}</td>
        <td class="center"><span class="status-badge ${(r.status || 'hold').toLowerCase()}">${escapeHtml(r.status)}</span></td>
        <td class="num">${formatIndianNumber(r.dashboardCount)}</td>
        <td class="num"><strong>${formatIndianNumber(r.finalCount)}</strong></td>
        <td>${escapeHtml(r.reason || '—')}</td>
        <td class="center">
          <button type="button" class="action-btn-pill edit-btn js-open-edit" data-row="${escapeHtml(r.row)}" title="Edit Colony Details">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="10" class="center">No colony records for selected date</td></tr>`;
  }

  /* ==========================================================================
     Circle Wise View
     ========================================================================== */

  function renderCircleWise() {
    const records = getActiveRecords();
    const aggs = computeCircleAggregates(records).sort((a, b) => b.total - a.total);

    const filterSel = document.getElementById('circleFilterSelect');
    const prevVal = state.circleFilter;
    filterSel.innerHTML = `<option value="ALL">All Circles (${aggs.length})</option>` +
      aggs.map((c) => `<option value="${escapeHtml(c.circle)}">${escapeHtml(c.circle)}</option>`).join('');
    filterSel.value = aggs.some((c) => c.circle === prevVal) ? prevVal : 'ALL';

    const q = state.circleSearch.toLowerCase();
    const visible = aggs.filter((c) => {
      if (state.circleFilter !== 'ALL' && c.circle !== state.circleFilter) return false;
      if (!q) return true;
      return c.circle.toLowerCase().includes(q) ||
        c.rows.some((r) => (r.colony || '').toLowerCase().includes(q) || (r.ward || '').toLowerCase().includes(q));
    });

    document.getElementById('circleSummaryBody').innerHTML = visible.map((c) => `
      <tr>
        <td><strong>${escapeHtml(c.circle)}</strong></td>
        <td class="center">${c.total}</td>
        <td class="center"><span class="status-badge completed">${c.completed}</span></td>
        <td class="center"><span class="status-badge progress">${c.progress}</span></td>
        <td class="center"><span class="status-badge hold">${c.hold}</span></td>
        <td class="num">${formatIndianNumber(c.target)}</td>
        <td class="num"><strong>${formatIndianNumber(c.finalized)}</strong></td>
        <td class="center"><strong>${c.achievement.toFixed(1)}%</strong></td>
        <td class="center">
          <button class="row-save-btn" data-view-circle="${escapeHtml(c.circle)}">View Colonies</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="9" class="center">No circles match your search</td></tr>`;

    document.querySelectorAll('[data-view-circle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedDrilldownCircle = btn.getAttribute('data-view-circle');
        renderCircleDrilldown(aggs);
      });
    });

    renderCircleDrilldown(aggs);
  }

  function renderCircleDrilldown(aggs) {
    const panel = document.getElementById('circleDrilldownPanel');
    if (!state.selectedDrilldownCircle) {
      panel.style.display = 'none';
      return;
    }
    const found = aggs.find((c) => c.circle === state.selectedDrilldownCircle);
    if (!found) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';
    document.getElementById('circleDrilldownTitle').textContent = `${found.circle} — ${found.rows.length} Colony Records`;
    document.getElementById('circleDrilldownBody').innerHTML = found.rows.map((r) => `
      <tr data-row="${escapeHtml(r.row)}">
        <td>${escapeHtml(r.sno)}</td>
        <td>${escapeHtml(r.ward)}</td>
        <td><strong>${escapeHtml(r.colony)}</strong></td>
        <td>${escapeHtml(formatDisplayDate(r.date))}</td>
        <td class="center"><span class="status-badge ${(r.status || 'hold').toLowerCase()}">${escapeHtml(r.status)}</span></td>
        <td class="num">${formatIndianNumber(r.dashboardCount)}</td>
        <td class="num"><strong>${formatIndianNumber(r.finalCount)}</strong></td>
        <td>${escapeHtml(r.reason || '—')}</td>
        <td class="center">
          <button type="button" class="action-btn-pill edit-btn js-open-edit" data-row="${escapeHtml(r.row)}" title="Edit Colony Details">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="9" class="center">No colonies for this circle</td></tr>`;
  }

  /* ==========================================================================
     Full Colony Details Directory View
     ========================================================================== */

  function renderColoniesDirectory() {
    const all = state.allColonies;
    const tableBody = document.getElementById('coloniesDirectoryBody');
    if (!tableBody) return;

    // Populate Circle Filter options
    const uniqueCircles = Array.from(new Set(all.map((r) => r.circle).filter((c) => c && c !== '-'))).sort();
    const circleFilterEl = document.getElementById('coloniesDirCircleFilter');
    if (circleFilterEl) {
      const currentCircle = state.coloniesDirFilters.circle;
      circleFilterEl.innerHTML = `<option value="ALL">All Circles (${uniqueCircles.length})</option>` +
        uniqueCircles.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      circleFilterEl.value = uniqueCircles.includes(currentCircle) ? currentCircle : 'ALL';
    }

    // Filter rows
    const q = (state.coloniesDirFilters.search || '').toLowerCase();
    const stFilter = state.coloniesDirFilters.status;
    const cFilter = state.coloniesDirFilters.circle;

    let filtered = all.filter((r) => {
      if (stFilter !== 'ALL' && (r.status || '').toUpperCase() !== stFilter) return false;
      if (cFilter !== 'ALL' && r.circle !== cFilter) return false;
      if (!q) return true;
      return `${r.sno} ${r.circle} ${r.ward} ${r.colony} ${r.status} ${r.reason} ${r.date}`.toLowerCase().includes(q);
    });

    // Sort rows
    const { key, dir } = state.coloniesDirSort;
    const mult = dir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (key === 'sno' || key === 'row' || key === 'dashboardCount' || key === 'finalCount') {
        const na = Number(a[key]) || 0;
        const nb = Number(b[key]) || 0;
        return (na - nb) * mult;
      }
      return String(a[key] || '').localeCompare(String(b[key] || '')) * mult;
    });

    const countBadge = document.getElementById('coloniesDirCountBadge');
    if (countBadge) {
      countBadge.textContent = `Showing ${filtered.length} of ${all.length} colonies`;
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">No colonies found matching your search / filter criteria.</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered.map((r) => {
      const st = (r.status || 'HOLD').toUpperCase();
      const validSt = ['COMPLETED', 'PROGRESS', 'HOLD', 'REJECTED'].includes(st) ? st : 'HOLD';
      const pendingTag = r._pendingSync ? ' <span title="Pending push to Google Sheet" style="color:#d97706;font-size:11px;">●</span>' : '';
      return `
        <tr data-row="${escapeHtml(r.row)}">
          <td><strong>${escapeHtml(r.sno || r.row)}</strong>${pendingTag}</td>
          <td><strong>${escapeHtml(r.circle || '-')}</strong></td>
          <td>${escapeHtml(r.ward || '-')}</td>
          <td>
            <a href="javascript:void(0)" class="js-open-edit" data-row="${escapeHtml(r.row)}" style="font-weight:700; color:var(--text-dark); text-decoration:none;" title="Click to edit full colony details">
              ${escapeHtml(r.colony || '-')}
              <i class="fa-solid fa-pen" style="font-size:10px; color:#3b82f6; opacity:0.8; margin-left:4px;"></i>
            </a>
          </td>
          <td>${escapeHtml(formatDisplayDate(r.date) || '-')}</td>
          <td class="center">
            <span class="status-badge ${validSt.toLowerCase()}">${validSt}</span>
          </td>
          <td class="num">${formatIndianNumber(r.dashboardCount || 0)}</td>
          <td class="num font-bold" style="color:var(--teal-primary);">${formatIndianNumber(r.finalCount || 0)}</td>
          <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(r.reason || '')}">
            ${escapeHtml(r.reason || '—')}
          </td>
          <td class="center">
            <button type="button" class="action-btn-pill edit-btn js-open-edit" data-row="${escapeHtml(r.row)}" title="Edit full colony details (Name, Circle, Ward, Status, Counts)">
              <i class="fa-solid fa-pen-to-square"></i> Edit
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  /* ==========================================================================
     Admin Authentication, Credentials Management & Google Identity Integration
     ========================================================================== */

  const DEFAULT_ADMIN_CREDS = { username: 'admin', password: 'admin123' };
  const DEFAULT_USER_CREDS = { username: 'user', password: 'user123' };

  function getStoredAdminCreds() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.storageKeys.adminCreds) || 'null');
      if (saved && saved.username && saved.password) return saved;
    } catch { /* default */ }
    return DEFAULT_ADMIN_CREDS;
  }

  function getStoredUserCreds() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.storageKeys.userCreds) || 'null');
      if (saved && saved.username && saved.password) return saved;
    } catch { /* default */ }
    return DEFAULT_USER_CREDS;
  }

  function updateCredsDisplay() {
    const creds = getStoredAdminCreds();
    const currentDisp = document.getElementById('currentAdminUsernameDisplay');
    if (currentDisp) {
      currentDisp.textContent = creds.username;
    }

    const inlineNewUser = document.getElementById('inlineNewUsername');
    if (inlineNewUser && !inlineNewUser.value) {
      inlineNewUser.value = creds.username;
    }
    const newAdminUserInput = document.getElementById('newAdminUsername');
    if (newAdminUserInput && !newAdminUserInput.value) {
      newAdminUserInput.value = creds.username;
    }
  }

  function saveAdminCredentials(newUsername, newPassword) {
    const u = (newUsername || '').trim();
    const p = (newPassword || '').trim();

    if (!u || u.length < 3) {
      showToast('Admin username must be at least 3 characters.', 'error');
      return false;
    }
    if (p && p.length < 4) {
      showToast('New password must be at least 4 characters.', 'error');
      return false;
    }

    const current = getStoredAdminCreds();
    const targetPassword = p || current.password;
    const updatedCreds = {
      username: u,
      password: targetPassword,
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(CONFIG.storageKeys.adminCreds, JSON.stringify(updatedCreds));
    state.adminUser = u;

    if (state.currentUser && state.currentUser.role === 'admin') {
      state.currentUser.username = u;
      sessionStorage.setItem(CONFIG.storageKeys.adminSession, JSON.stringify(state.currentUser));
    }

    updateCredsDisplay();
    updateHeaderAuthUI();
    updateAdminAuthUI();
    return true;
  }

  async function authenticateCredentials(userRaw, passRaw) {
    const u = (userRaw || '').trim();
    const p = passRaw || '';

    // 1. Try Netlify Serverless Function authentication (/api/auth-login)
    //    Validates securely against Netlify environment variables: ADMIN_USERNAME & ADMIN_PASSWORD
    try {
      const res = await fetch('/api/auth-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.authenticated && json.user) {
          return json.user;
        }
      }
    } catch {
      // Backend unavailable / offline / local preview without Netlify dev
    }

    // 2. Local fallback / offline authentication (localStorage and defaults)
    const adminCreds = getStoredAdminCreds();
    const userCreds = getStoredUserCreds();

    if (u.toLowerCase() === adminCreds.username.toLowerCase() && p === adminCreds.password) {
      return { username: adminCreds.username === 'admin' ? 'Admin' : adminCreds.username, role: 'admin', authMethod: 'local' };
    }
    if ((u.toLowerCase() === userCreds.username.toLowerCase() || u.toLowerCase() === 'officer' || u.toLowerCase() === 'viewer') && p === userCreds.password) {
      return { username: userCreds.username === 'user' ? 'User' : userCreds.username, role: 'user', authMethod: 'local' };
    }
    return null;
  }

  /* ==========================================================================
     Theme Management System (Light / Dark Mode)
     ========================================================================== */

  function applyTheme(themeName, save = true) {
    const validTheme = themeName === 'dark' ? 'dark' : 'light';
    state.theme = validTheme;
    document.documentElement.setAttribute('data-theme', validTheme);

    // Update Header theme toggle
    const hIcon = document.getElementById('headerThemeToggleIcon');
    const hText = document.getElementById('headerThemeToggleText');
    if (hIcon) {
      hIcon.className = validTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
    if (hText) {
      hText.textContent = validTheme === 'dark' ? 'Light' : 'Dark';
    }

    // Update Portal gate theme toggle
    const pIcon = document.getElementById('portalThemeToggleIcon');
    if (pIcon) {
      pIcon.className = validTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }

    // Update Admin Settings theme cards
    const cardLight = document.getElementById('themeChoiceLight');
    const cardDark = document.getElementById('themeChoiceDark');
    if (cardLight) cardLight.classList.toggle('active', validTheme === 'light');
    if (cardDark) cardDark.classList.toggle('active', validTheme === 'dark');

    const themeBadge = document.getElementById('themeActiveBadge');
    if (themeBadge) {
      if (validTheme === 'dark') {
        themeBadge.textContent = 'DARK THEME';
        themeBadge.style.background = '#312e81';
        themeBadge.style.color = '#c7d2fe';
      } else {
        themeBadge.textContent = 'LIGHT THEME';
        themeBadge.style.background = '#e0e7ff';
        themeBadge.style.color = '#4338ca';
      }
    }

    // Adapt Chart.js theme colors
    if (typeof Chart !== 'undefined') {
      const isDark = validTheme === 'dark';
      Chart.defaults.color = isDark ? '#cbd5e1' : '#475569';
      Chart.defaults.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
      if (state.charts.daily) {
        try {
          renderOverview();
        } catch { /* ignore if not loaded yet */ }
      }
    }

    if (save) {
      localStorage.setItem(CONFIG.storageKeys.theme, validTheme);
    }
  }

  function toggleTheme() {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, true);
    showToast(`Switched to ${nextTheme === 'dark' ? 'Dark' : 'Light'} theme!`, 'info');
  }

  function updateAuthTabSettingsUI() {
    updateCredsDisplay();
    const inlineNewUser = document.getElementById('inlineNewUsername');
    if (inlineNewUser) inlineNewUser.value = getStoredAdminCreds().username;

    const cardLight = document.getElementById('themeChoiceLight');
    const cardDark = document.getElementById('themeChoiceDark');
    if (cardLight) cardLight.classList.toggle('active', state.theme === 'light');
    if (cardDark) cardDark.classList.toggle('active', state.theme === 'dark');
  }

  function handleLoginSuccess(sessionData) {
    state.isAuthenticated = true;
    state.currentUser = sessionData;
    state.adminUser = sessionData.username;
    sessionStorage.setItem(CONFIG.storageKeys.adminSession, JSON.stringify(sessionData));

    const gate = document.getElementById('globalAuthGate');
    const app = document.getElementById('dashboardApp');
    if (gate) gate.style.display = 'none';
    if (app) app.style.display = 'block';

    updateHeaderAuthUI();
    updateAdminAuthUI();

    showToast(`Access granted: Welcome ${sessionData.username} (${sessionData.role.toUpperCase()})!`, 'success');

    // Show the data after login with username and password
    fetchLiveSheetData(false);
    startAutoSync();
    renderAll();
  }

  function handleGlobalLogout() {
    state.isAuthenticated = false;
    state.currentUser = null;
    sessionStorage.removeItem(CONFIG.storageKeys.adminSession);

    if (state.autoSyncTimer) {
      clearInterval(state.autoSyncTimer);
      state.autoSyncTimer = null;
    }

    // Clear colonies data from memory and display
    state.allColonies = [];

    const gate = document.getElementById('globalAuthGate');
    const app = document.getElementById('dashboardApp');
    if (gate) {
      gate.style.display = 'flex';
      const uInput = document.getElementById('portalUsername');
      const pInput = document.getElementById('portalPassword');
      const errBox = document.getElementById('portalLoginErrorMsg');
      if (uInput) uInput.value = '';
      if (pInput) pInput.value = '';
      if (errBox) errBox.style.display = 'none';
    }
    if (app) app.style.display = 'none';

    updateCredsDisplay();
    updateHeaderAuthUI();
    updateAdminAuthUI();
    renderAll();

    showToast('Logged out of dashboard. Website locked.', 'info');
  }

  function restoreAdminSession() {
    const sess = sessionStorage.getItem(CONFIG.storageKeys.adminSession);
    const gate = document.getElementById('globalAuthGate');
    const app = document.getElementById('dashboardApp');

    if (sess) {
      try {
        const parsed = JSON.parse(sess);
        if (parsed && parsed.username && (parsed.role === 'admin' || parsed.role === 'user')) {
          state.isAuthenticated = true;
          state.currentUser = parsed;
          state.adminUser = parsed.username || 'Admin';
          if (gate) gate.style.display = 'none';
          if (app) app.style.display = 'block';
          updateHeaderAuthUI();
          updateAdminAuthUI();
          return true;
        }
      } catch { /* parse fail */ }
    }

    // Default: Website is CLEAR / LOCKED until login!
    state.isAuthenticated = false;
    state.currentUser = null;
    if (gate) gate.style.display = 'flex';
    if (app) app.style.display = 'none';
    updateCredsDisplay();
    updateHeaderAuthUI();
    updateAdminAuthUI();
    return false;
  }

  function updateHeaderAuthUI() {
    const badge = document.getElementById('headerUserBadge');
    const icon = document.getElementById('headerUserIcon');
    const label = document.getElementById('headerUserRoleName');
    if (!badge) return;

    if (state.isAuthenticated && state.currentUser) {
      badge.style.display = 'inline-flex';
      const isAdmin = state.currentUser.role === 'admin';
      if (isAdmin) {
        badge.className = 'header-user-badge admin-badge';
        if (icon) icon.className = 'fa-solid fa-shield-halved';
        if (label) label.textContent = `${state.currentUser.username} (Admin)`;
      } else {
        badge.className = 'header-user-badge user-badge';
        if (icon) icon.className = 'fa-solid fa-user-check';
        if (label) label.textContent = `${state.currentUser.username} (Viewer)`;
      }
    } else {
      badge.style.display = 'none';
    }
  }

  function updateAdminAuthUI() {
    const loginView = document.getElementById('adminLoginView');
    const loggedInView = document.getElementById('adminLoggedInView');
    if (!loginView || !loggedInView) return;

    const isAdmin = state.isAuthenticated && state.currentUser && state.currentUser.role === 'admin';

    if (isAdmin) {
      loginView.style.display = 'none';
      loggedInView.style.display = 'block';
      const nameEl = document.getElementById('adminDisplayName');
      if (nameEl) nameEl.textContent = state.adminUser || state.currentUser.username || 'Admin';

      const subEl = document.getElementById('adminDisplayRoleSub');
      if (subEl) {
        subEl.textContent = 'ADMINISTRATOR • EXCEL LIVE LINKED';
      }

      const scriptInput = document.getElementById('appsScriptUrlInput');
      if (scriptInput) scriptInput.value = state.scriptUrl;

      updateSyncStatusUI();
      updateCredsDisplay();
      updateAuthTabSettingsUI();
      renderAdminTable();
    } else {
      loginView.style.display = 'flex';
      loggedInView.style.display = 'none';
      updateCredsDisplay();
    }
  }

  function renderAdminTable() {
    const all = state.allColonies;

    // Populate Circle filter + Add Colony datalist
    const uniqueCircles = Array.from(new Set(all.map((r) => r.circle).filter((c) => c && c !== '-'))).sort();
    const circleFilterEl = document.getElementById('adminCircleFilter');
    const currentCircle = state.adminFilters.circle;
    circleFilterEl.innerHTML = `<option value="ALL">All Circles (${uniqueCircles.length})</option>` +
      uniqueCircles.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    circleFilterEl.value = uniqueCircles.includes(currentCircle) ? currentCircle : 'ALL';

    const datalist = document.getElementById('circlesDatalist');
    if (datalist) {
      datalist.innerHTML = uniqueCircles.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
    }

    // Filter rows
    const q = state.adminFilters.search.toLowerCase();
    const stFilter = state.adminFilters.status;
    const cFilter = state.adminFilters.circle;

    let filtered = all.filter((r) => {
      if (stFilter !== 'ALL' && (r.status || '').toUpperCase() !== stFilter) return false;
      if (cFilter !== 'ALL' && r.circle !== cFilter) return false;
      if (!q) return true;
      return `${r.sno} ${r.circle} ${r.ward} ${r.colony} ${r.status} ${r.reason}`.toLowerCase().includes(q);
    });

    // Sort rows
    const { key, dir } = state.adminSort;
    const mult = dir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (key === 'sno' || key === 'row' || key === 'dashboardCount' || key === 'finalCount') {
        const na = Number(a[key]) || 0;
        const nb = Number(b[key]) || 0;
        return (na - nb) * mult;
      }
      return String(a[key] || '').localeCompare(String(b[key] || '')) * mult;
    });

    // Update 6 Pastel Summary Boxes (Matching Image 2!)
    const totalFinal = filtered.reduce((s, r) => s + (Number(r.finalCount) || 0), 0);
    const completedCount = filtered.filter((r) => (r.status || '').toUpperCase() === 'COMPLETED').length;
    const progressCount = filtered.filter((r) => (r.status || '').toUpperCase() === 'PROGRESS').length;
    const holdCount = filtered.filter((r) => (r.status || '').toUpperCase() === 'HOLD').length;
    const noFinalCount = filtered.filter((r) => (r.status || '').toUpperCase() === 'REJECTED' || !(Number(r.finalCount) > 0)).length;

    document.getElementById('adminStatTotal').textContent = formatIndianNumber(filtered.length);
    document.getElementById('adminStatFinalized').textContent = formatIndianNumber(totalFinal);
    document.getElementById('adminStatCompleted').textContent = formatIndianNumber(completedCount);
    document.getElementById('adminStatProgress').textContent = formatIndianNumber(progressCount);
    document.getElementById('adminStatHold').textContent = formatIndianNumber(holdCount);
    document.getElementById('adminStatNoFinal').textContent = formatIndianNumber(noFinalCount);

    document.getElementById('adminTableCountInfo').textContent = `Showing ${filtered.length} of ${all.length} Google Sheet records (COLONIES)`;

    const tbody = document.getElementById('adminTableBody');
    tbody.innerHTML = filtered.map((r) => {
      const st = (r.status || 'HOLD').toUpperCase();
      const validSt = ['COMPLETED', 'PROGRESS', 'HOLD', 'REJECTED'].includes(st) ? st : 'HOLD';
      const pendingTag = r._pendingSync ? ' <span title="Pending push to Google Sheet" style="color:#d97706;font-size:10px;">●</span>' : '';
      return `
        <tr data-row="${escapeHtml(r.row)}">
          <td><strong>${escapeHtml(r.sno || r.row)}</strong>${pendingTag}</td>
          <td>${escapeHtml(r.circle)}</td>
          <td>${escapeHtml(r.ward)}</td>
          <td><strong><a href="javascript:void(0)" class="js-open-edit" data-row="${escapeHtml(r.row)}" style="color:var(--text-dark);text-decoration:underline;text-underline-offset:2px;" title="Click to edit full colony details">${escapeHtml(r.colony)} <i class="fa-solid fa-pen" style="font-size:10px;color:#3b82f6;opacity:0.8;margin-left:2px;"></i></a></strong></td>
          <td class="num">
            <input type="number" class="inline-num-input js-dash" value="${Number(r.dashboardCount) || 0}" min="0" aria-label="Dashboard Count" />
          </td>
          <td>
            <input type="date" class="inline-date-input js-date" value="${escapeHtml(r.date || '')}" aria-label="Alloted Date" />
          </td>
          <td class="center">
            <select class="inline-status-select status-${validSt} js-status" aria-label="Status">
              <option value="COMPLETED" ${validSt === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option>
              <option value="PROGRESS" ${validSt === 'PROGRESS' ? 'selected' : ''}>PROGRESS</option>
              <option value="HOLD" ${validSt === 'HOLD' ? 'selected' : ''}>HOLD</option>
              <option value="REJECTED" ${validSt === 'REJECTED' ? 'selected' : ''}>REJECTED</option>
            </select>
          </td>
          <td>
            <input type="number" class="inline-num-input js-final" value="${Number(r.finalCount) || 0}" min="0" aria-label="Finalized Count" />
          </td>
          <td>
            <input type="text" class="inline-text-input js-reason" value="${escapeHtml(r.reason || '')}" placeholder="Reason / remarks" aria-label="Reason" />
          </td>
          <td class="center">
            <div class="action-btn-group">
              <button type="button" class="row-save-btn js-save-row" title="Quick Save Row Changes">Save</button>
              <button type="button" class="action-btn-pill edit-btn js-open-edit" data-row="${escapeHtml(r.row)}" title="Edit Full Colony Details">
                <i class="fa-solid fa-pen-to-square"></i> Edit
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="10" class="center" style="padding:20px;">No matching colony records found</td></tr>`;
  }

  async function handleAdminRowSave(tr, btn) {
    const rowId = tr.getAttribute('data-row');
    const record = state.allColonies.find((r) => String(r.row) === String(rowId));
    if (!record) return;

    const newDash = parseNumeric(tr.querySelector('.js-dash').value);
    const newDate = tr.querySelector('.js-date').value;
    const newStatus = tr.querySelector('.js-status').value.toUpperCase();
    const newFinal = parseNumeric(tr.querySelector('.js-final').value);
    const newReason = tr.querySelector('.js-reason').value.trim();

    const updatedFields = {
      row: record.row,
      sno: record.sno,
      circle: record.circle,
      ward: record.ward,
      colony: record.colony,
      date: newDate,
      status: newStatus,
      dashboardCount: newDash,
      finalCount: newFinal,
      dashboardRaw: String(newDash),
      finalRaw: String(newFinal),
      reason: newReason
    };

    btn.disabled = true;
    btn.textContent = 'Saving...';

    // Update in-memory state immediately so Dashboard & Admin refresh right away
    Object.assign(record, updatedFields);

    const result = await writeToGoogleSheet('updateRow', { data: updatedFields });

    if (result && result.ok) {
      delete record._pendingSync;
      delete state.pendingEdits[String(record.row)];
      savePendingEdits();
      showToast(`Row #${record.row} (${record.colony}) saved to Google Sheet & Dashboard!`, 'success');
    } else if (result && result.needsSetup) {
      record._pendingSync = true;
      state.pendingEdits[String(record.row)] = updatedFields;
      savePendingEdits();
      showToast(`Updated in Dashboard! Connect Apps Script URL in "Excel 2-Way Sync Setup" to push to Google Sheet.`, 'warn');
    } else {
      record._pendingSync = true;
      state.pendingEdits[String(record.row)] = updatedFields;
      savePendingEdits();
      showToast(`Saved locally; Google Sheet write error: ${(result && result.error) || 'Network issue'}`, 'error');
    }

    tr.classList.remove('row-dirty');
    btn.classList.remove('dirty');
    btn.disabled = false;
    btn.textContent = 'Save';

    saveWorkspaceData();
    updateSyncStatusUI();
    renderAll();
  }

  function openEditColonyModal(rowId) {
    if (!state.isAuthenticated) {
      showToast('Please sign in to edit colony details.', 'warn');
      const gate = document.getElementById('globalAuthGate');
      if (gate) gate.style.display = 'flex';
      return;
    }

    const record = state.allColonies.find((r) => String(r.row) === String(rowId));
    if (!record) {
      showToast('Colony record not found.', 'error');
      return;
    }

    document.getElementById('editRowId').value = record.row;
    document.getElementById('editSno').value = record.sno || '';
    document.getElementById('editDate').value = record.date || '';
    document.getElementById('editCircle').value = record.circle || '';
    document.getElementById('editWard').value = record.ward || '';
    document.getElementById('editColonyName').value = record.colony || '';
    document.getElementById('editStatus').value = ['COMPLETED', 'PROGRESS', 'HOLD', 'REJECTED'].includes((record.status || '').toUpperCase()) ? record.status.toUpperCase() : 'HOLD';
    document.getElementById('editDashboardCount').value = record.dashboardCount || 0;
    document.getElementById('editFinalCount').value = record.finalCount || 0;
    document.getElementById('editReason').value = record.reason || '';

    const subTitle = document.getElementById('editColonySubTitle');
    if (subTitle) {
      subTitle.textContent = `Google Sheet Row #${record.row} • SNO: ${record.sno || '-'} • COLONIES`;
    }

    const modal = document.getElementById('editColonyModal');
    if (modal) modal.classList.add('open');
  }

  async function handleSaveEditedColony(e) {
    e.preventDefault();
    const rowId = document.getElementById('editRowId').value;
    const record = state.allColonies.find((r) => String(r.row) === String(rowId));
    if (!record) {
      showToast('Colony record not found.', 'error');
      return;
    }

    const saveBtn = document.getElementById('btnSaveEditedColony');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    const newDash = parseNumeric(document.getElementById('editDashboardCount').value);
    const newFinal = parseNumeric(document.getElementById('editFinalCount').value);
    const newSno = document.getElementById('editSno').value.trim() || record.sno;
    const newDate = document.getElementById('editDate').value;
    const newCircle = document.getElementById('editCircle').value.trim().toUpperCase();
    const newWard = document.getElementById('editWard').value.trim().toUpperCase();
    const newColony = document.getElementById('editColonyName').value.trim().toUpperCase();
    const newStatus = document.getElementById('editStatus').value.toUpperCase();
    const newReason = document.getElementById('editReason').value.trim();

    const updatedFields = {
      row: record.row,
      sno: newSno,
      circle: newCircle,
      ward: newWard,
      colony: newColony,
      date: newDate,
      status: newStatus,
      dashboardCount: newDash,
      finalCount: newFinal,
      dashboardRaw: String(newDash),
      finalRaw: String(newFinal),
      reason: newReason
    };

    Object.assign(record, updatedFields);

    const result = await writeToGoogleSheet('updateRow', { data: updatedFields });

    if (result && result.ok) {
      delete record._pendingSync;
      delete state.pendingEdits[String(record.row)];
      savePendingEdits();
      showToast(`Colony "${record.colony}" updated in Google Sheet & Dashboard!`, 'success');
    } else {
      record._pendingSync = true;
      state.pendingEdits[String(record.row)] = updatedFields;
      savePendingEdits();
      showToast(`Colony "${record.colony}" updated in Dashboard! Connect Apps Script to push to Google Sheet.`, 'warn');
    }

    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Save Colony Details';

    const modal = document.getElementById('editColonyModal');
    if (modal) modal.classList.remove('open');

    saveWorkspaceData();
    updateSyncStatusUI();
    renderAll();
  }

  async function handleDeleteColony(rowId) {
    if (!state.isAuthenticated) {
      showToast('Please sign in to delete colonies.', 'warn');
      return;
    }

    const record = state.allColonies.find((r) => String(r.row) === String(rowId));
    if (!record) return;

    if (!confirm(`Are you sure you want to delete colony "${record.colony}" (Row #${record.row})?`)) {
      return;
    }

    state.allColonies = state.allColonies.filter((r) => String(r.row) !== String(rowId));
    delete state.pendingEdits[String(rowId)];
    savePendingEdits();

    const deleted = loadDeletedRows();
    if (!deleted.includes(String(rowId))) {
      deleted.push(String(rowId));
      saveDeletedRows(deleted);
    }
    saveWorkspaceData();

    await writeToGoogleSheet('deleteRow', { row: record.row });

    const modal = document.getElementById('editColonyModal');
    if (modal) modal.classList.remove('open');

    showToast(`Colony "${record.colony}" removed from Dashboard.`, 'info');
    updateSyncStatusUI();
    renderAll();
  }

  async function handlePushPendingAll() {
    const entries = Object.values(state.pendingEdits);
    if (!entries.length) return;

    if (!isWriteConnected()) {
      switchAdminSubTab('sync');
      showToast('Paste and connect your Google Apps Script URL first to push pending edits.', 'warn');
      return;
    }

    const pushBtn = document.getElementById('btnPushPendingAll');
    pushBtn.disabled = true;

    let okCount = 0;
    const updates = entries.filter((e) => !e._isNew);
    const additions = entries.filter((e) => e._isNew);

    if (updates.length) {
      const res = await writeToGoogleSheet('bulkUpdate', { items: updates });
      if (res && res.ok) okCount += updates.length;
    }

    for (const addItem of additions) {
      const res = await writeToGoogleSheet('addRow', { data: addItem });
      if (res && res.ok) okCount += 1;
    }

    pushBtn.disabled = false;

    if (okCount === entries.length) {
      state.pendingEdits = {};
      savePendingEdits();
      showToast(`Successfully pushed ${okCount} pending changes to Google Sheet!`, 'success');
      await fetchLiveSheetData(true);
    } else {
      showToast(`Pushed ${okCount}/${entries.length} changes. Check your Apps Script deployment.`, 'warn');
    }
  }

  /* ==========================================================================
     Navigation & Exports
     ========================================================================== */

  function switchView(viewName) {
    state.activeView = viewName;
    document.querySelectorAll('.view-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });
    document.querySelectorAll('.view-section').forEach((sec) => {
      sec.classList.toggle('active', sec.id === `view-${viewName}`);
    });
    if (viewName === 'colonies') renderColoniesDirectory();
    if (viewName === 'circle') renderCircleWise();
    if (viewName === 'admin') updateAdminAuthUI();
  }

  function switchAdminSubTab(tabName) {
    state.activeAdminSubTab = tabName;
    document.querySelectorAll('.admin-subtab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-admintab') === tabName);
    });
    const subColonies = document.getElementById('adminSubColonies');
    const subSync = document.getElementById('adminSubSync');
    const subAuth = document.getElementById('adminSubAuth');
    if (subColonies) subColonies.style.display = tabName === 'colonies' ? 'block' : 'none';
    if (subSync) subSync.style.display = tabName === 'sync' ? 'block' : 'none';
    if (subAuth) subAuth.style.display = tabName === 'auth' ? 'block' : 'none';
    if (tabName === 'auth') updateAuthTabSettingsUI();
  }

  function exportCSV() {
    const rows = getActiveRecords();
    const headers = ['SNO', 'CIRCLE', 'WARD', 'COLONY', 'ALLOTED DATE', 'COLONY STATUS', 'PROPERTIES COUNT (DASHBOARD)', 'PROPERTIES COUNT (FINAL)', 'REASON'];
    const lines = [headers.join(',')];
    rows.forEach((r) => {
      const vals = [r.sno, r.circle, r.ward, r.colony, r.date, r.status, r.dashboardCount, r.finalCount, r.reason];
      lines.push(vals.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GHMC_Colonies_${state.activeSource}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${rows.length} records to CSV`, 'success');
  }

  function exportExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library is still loading. Try CSV export or retry.', 'warn');
      return;
    }
    const rows = getActiveRecords().map((r) => ({
      SNO: r.sno,
      CIRCLE: r.circle,
      WARD: r.ward,
      COLONY: r.colony,
      'ALLOTED DATE': r.date,
      'COLONY STATUS': r.status,
      'PROPERTIES COUNT (DASHBOARD)': r.dashboardCount,
      'PROPERTIES COUNT (FINAL)': r.finalCount,
      REASON: r.reason
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'COLONIES');
    XLSX.writeFile(wb, `GHMC_Colonies_${state.activeSource}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`Exported ${rows.length} records to Excel (.xlsx)`, 'success');
  }

  /* ==========================================================================
     Event Wiring & Boot
     ========================================================================== */

  function startAutoSync() {
    if (state.autoSyncTimer) clearInterval(state.autoSyncTimer);
    state.autoSyncTimer = setInterval(() => {
      const toggle = document.getElementById('autoSyncToggle');
      if (!toggle || !toggle.checked) return;
      // Don't interrupt admin while actively editing an input cell
      const activeTag = document.activeElement && document.activeElement.tagName;
      if (state.activeView === 'admin' && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeTag)) return;
      if (document.querySelector('#adminTableBody tr.row-dirty')) return;
      fetchLiveSheetData(true);
    }, CONFIG.autoSyncMs);
  }

  function setupEvents() {
    // Primary Source Tabs
    document.querySelectorAll('.primary-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeSource = btn.getAttribute('data-source');
        document.querySelectorAll('.primary-tab').forEach((b) => b.classList.toggle('active', b === btn));
        renderAll();
      });
    });

    // Secondary View Tabs
    document.querySelectorAll('.view-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
    });

    document.getElementById('btnQuickGoAdmin').addEventListener('click', () => switchView('admin'));

    // Management Tools
    document.getElementById('btnRefreshData').addEventListener('click', () => fetchLiveSheetData(false));
    const btnResetWs = document.getElementById('btnResetWorkspace');
    if (btnResetWs) {
      btnResetWs.addEventListener('click', () => {
        if (!confirm('Reset dashboard workspace back to original Google Sheet dataset? All local edits will be reset.')) return;
        localStorage.removeItem(CONFIG.storageKeys.workspaceData);
        localStorage.removeItem(CONFIG.storageKeys.pendingEdits);
        localStorage.removeItem(CONFIG.storageKeys.deletedRows);
        state.pendingEdits = {};
        state.allColonies = [];
        showToast('Resetting workspace and re-fetching live sheet data...', 'info');
        updateSyncStatusUI();
        renderAll();
        fetchLiveSheetData(false);
      });
    }
    document.getElementById('btnExportCsv').addEventListener('click', exportCSV);
    document.getElementById('btnExportXlsx').addEventListener('click', exportExcel);
    document.getElementById('btnPrintPdf').addEventListener('click', () => window.print());

    // Date Wise controls
    document.getElementById('dateWiseSelect').addEventListener('change', (e) => {
      state.dateWiseSelected = e.target.value;
      renderDateWise();
    });
    document.getElementById('btnShowAllDates').addEventListener('click', () => {
      state.dateWiseSelected = 'ALL';
      renderDateWise();
    });

    // Circle Wise controls
    document.getElementById('circleSearchInput').addEventListener('input', (e) => {
      state.circleSearch = e.target.value.trim();
      renderCircleWise();
    });
    document.getElementById('circleFilterSelect').addEventListener('change', (e) => {
      state.circleFilter = e.target.value;
      renderCircleWise();
    });
    document.getElementById('btnCloseDrilldown').addEventListener('click', () => {
      state.selectedDrilldownCircle = null;
      document.getElementById('circleDrilldownPanel').style.display = 'none';
    });

    // Full Colony Details Directory Controls
    const colSearch = document.getElementById('coloniesDirSearch');
    if (colSearch) {
      colSearch.addEventListener('input', (e) => {
        state.coloniesDirFilters.search = e.target.value.trim();
        renderColoniesDirectory();
      });
    }

    const colCircleFilter = document.getElementById('coloniesDirCircleFilter');
    if (colCircleFilter) {
      colCircleFilter.addEventListener('change', (e) => {
        state.coloniesDirFilters.circle = e.target.value;
        renderColoniesDirectory();
      });
    }

    const colStatusFilter = document.getElementById('coloniesDirStatusFilter');
    if (colStatusFilter) {
      colStatusFilter.addEventListener('change', (e) => {
        state.coloniesDirFilters.status = e.target.value;
        renderColoniesDirectory();
      });
    }

    const btnRefreshDir = document.getElementById('btnRefreshColoniesDirectory');
    if (btnRefreshDir) {
      btnRefreshDir.addEventListener('click', () => fetchLiveSheetData(false));
    }

    const btnAddFromDir = document.getElementById('btnAddNewColonyFromDirectory');
    if (btnAddFromDir) {
      btnAddFromDir.addEventListener('click', () => {
        if (!state.isAuthenticated) {
          showToast('Please sign in to add new colonies.', 'warn');
          const gate = document.getElementById('globalAuthGate');
          if (gate) gate.style.display = 'flex';
          return;
        }
        document.getElementById('newDate').value = new Date().toISOString().slice(0, 10);
        document.getElementById('addColonyModal').classList.add('open');
      });
    }

    document.querySelectorAll('#coloniesDirectoryTable thead th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort-dir') || th.getAttribute('data-sort');
        if (!key) return;
        if (state.coloniesDirSort.key === key) {
          state.coloniesDirSort.dir = state.coloniesDirSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.coloniesDirSort.key = key;
          state.coloniesDirSort.dir = 'asc';
        }
        renderColoniesDirectory();
      });
    });

    // Global Portal Login Form
    const portalForm = document.getElementById('portalLoginForm');
    if (portalForm) {
      portalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('portalUsername').value;
        const p = document.getElementById('portalPassword').value;
        const errBox = document.getElementById('portalLoginErrorMsg');
        const submitBtn = document.getElementById('portalSubmitBtn');

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Verifying &amp; Loading...</span> <i class="fa-solid fa-spinner fa-spin"></i>';

        const auth = await authenticateCredentials(u, p);
        if (auth) {
          if (errBox) errBox.style.display = 'none';
          handleLoginSuccess(auth);
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Sign In to Dashboard</span> <i class="fa-solid fa-arrow-right"></i>';
        } else {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Sign In to Dashboard</span> <i class="fa-solid fa-arrow-right"></i>';
          if (errBox) {
            errBox.textContent = 'Invalid username or password. Please check your credentials and try again.';
            errBox.style.display = 'block';
          }
        }
      });
    }

    // Portal Password Toggle
    const togglePwd = document.getElementById('portalTogglePwd');
    if (togglePwd) {
      togglePwd.addEventListener('click', () => {
        const pwdInput = document.getElementById('portalPassword');
        const icon = document.getElementById('portalTogglePwdIcon');
        if (pwdInput.type === 'password') {
          pwdInput.type = 'text';
          if (icon) icon.className = 'fa-solid fa-eye-slash';
        } else {
          pwdInput.type = 'password';
          if (icon) icon.className = 'fa-solid fa-eye';
        }
      });
    }

    // Portal Role Tabs
    const tabAdmin = document.getElementById('tabRoleAdmin');
    const tabUser = document.getElementById('tabRoleUser');
    const roleBadge = document.getElementById('portalRoleBadge');
    const roleBadgeText = document.getElementById('portalRoleBadgeText');
    const portalUserField = document.getElementById('portalUsername');
    const portalPassField = document.getElementById('portalPassword');

    if (tabAdmin && tabUser) {
      tabAdmin.addEventListener('click', () => {
        tabAdmin.classList.add('active');
        tabUser.classList.remove('active');
        if (roleBadge) {
          roleBadge.className = 'portal-badge-pill';
          roleBadgeText.textContent = 'ADMINISTRATOR ACCESS • FULL MANAGEMENT & EXCEL SYNC';
        }
        if (portalUserField) portalUserField.value = '';
        if (portalPassField) {
          portalPassField.value = '';
          portalPassField.focus();
        }
      });

      tabUser.addEventListener('click', () => {
        tabUser.classList.add('active');
        tabAdmin.classList.remove('active');
        if (roleBadge) {
          roleBadge.className = 'portal-badge-pill user-mode';
          roleBadgeText.textContent = 'USER ACCESS • ANALYTICS & COLONY VIEWER';
        }
        if (portalUserField) portalUserField.value = '';
        if (portalPassField) {
          portalPassField.value = '';
          portalPassField.focus();
        }
      });
    }

    // Header Logout
    const headerLogout = document.getElementById('headerLogoutBtn');
    if (headerLogout) {
      headerLogout.addEventListener('click', handleGlobalLogout);
    }

    // Admin Login Form (Image 3 in View-Admin)
    document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = document.getElementById('loginUsername').value.trim();
      const pass = document.getElementById('loginPassword').value;
      const errBox = document.getElementById('loginErrorMsg');
      const submitBtn = document.getElementById('loginSubmitBtn');

      submitBtn.textContent = 'Signing in...';
      submitBtn.disabled = true;

      const auth = await authenticateCredentials(user, pass);

      if (auth && auth.role === 'admin') {
        errBox.style.display = 'none';
        handleLoginSuccess(auth);
        submitBtn.textContent = 'Sign In';
        submitBtn.disabled = false;
        document.getElementById('loginPassword').value = '';
      } else {
        submitBtn.textContent = 'Sign In';
        submitBtn.disabled = false;
        errBox.textContent = 'Invalid Admin credentials. Please check your credentials and try again.';
        errBox.style.display = 'block';
      }
    });

    // Admin Top Bar actions
    document.getElementById('btnAdminLogout').addEventListener('click', handleGlobalLogout);

    document.getElementById('btnAdminRefresh').addEventListener('click', () => fetchLiveSheetData(false));
    document.getElementById('btnAdminSyncTab').addEventListener('click', () => switchAdminSubTab('sync'));
    document.getElementById('btnGoSyncSetup').addEventListener('click', () => switchAdminSubTab('sync'));
    document.getElementById('btnPushPendingAll').addEventListener('click', handlePushPendingAll);

    // Admin Sub-tabs
    document.querySelectorAll('.admin-subtab').forEach((btn) => {
      btn.addEventListener('click', () => switchAdminSubTab(btn.getAttribute('data-admintab')));
    });

    // Admin Filters
    document.getElementById('adminSearchInput').addEventListener('input', (e) => {
      state.adminFilters.search = e.target.value.trim();
      renderAdminTable();
    });
    document.getElementById('adminStatusFilter').addEventListener('change', (e) => {
      state.adminFilters.status = e.target.value;
      renderAdminTable();
    });
    document.getElementById('adminCircleFilter').addEventListener('change', (e) => {
      state.adminFilters.circle = e.target.value;
      renderAdminTable();
    });

    // Admin Table Sorting
    document.querySelectorAll('#adminColoniesTable thead th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (state.adminSort.key === key) {
          state.adminSort.dir = state.adminSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.adminSort.key = key;
          state.adminSort.dir = 'asc';
        }
        renderAdminTable();
      });
    });

    // Admin Inline Table Delegation (Status pill live styling + Row Save)
    const adminTbody = document.getElementById('adminTableBody');
    adminTbody.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      if (!tr) return;
      if (e.target.classList.contains('js-status')) {
        const val = e.target.value;
        e.target.className = `inline-status-select status-${val} js-status`;
      }
      tr.classList.add('row-dirty');
      const saveBtn = tr.querySelector('.js-save-row');
      if (saveBtn) saveBtn.classList.add('dirty');
    });

    adminTbody.addEventListener('input', (e) => {
      const tr = e.target.closest('tr');
      if (!tr) return;
      tr.classList.add('row-dirty');
      const saveBtn = tr.querySelector('.js-save-row');
      if (saveBtn) saveBtn.classList.add('dirty');
    });

    adminTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-save-row');
      if (!btn) return;
      const tr = btn.closest('tr');
      handleAdminRowSave(tr, btn);
    });

    // Sync Settings Save / Test / Clear
    document.getElementById('btnTestSaveScriptUrl').addEventListener('click', async () => {
      const url = document.getElementById('appsScriptUrlInput').value.trim();
      if (!url || !url.startsWith('https://script.google.com/')) {
        showToast('Please enter a valid Google Apps Script Web App URL (https://script.google.com/macros/s/.../exec)', 'error');
        return;
      }
      state.scriptUrl = url;
      localStorage.setItem(CONFIG.storageKeys.scriptUrl, url);
      showToast('Testing connection to Google Apps Script...', 'info');
      const res = await writeToGoogleSheet('ping', {});
      if (res && res.ok) {
        showToast('Connected! Two-way sync with Google Sheet is now LIVE!', 'success');
        updateSyncStatusUI();
        await fetchLiveSheetData(true);
      } else {
        showToast(`Could not verify Apps Script URL: ${(res && res.error) || 'Ensure deployment access is set to Anyone.'}`, 'error');
        updateSyncStatusUI();
      }
    });

    document.getElementById('btnClearScriptUrl').addEventListener('click', () => {
      state.scriptUrl = '';
      localStorage.removeItem(CONFIG.storageKeys.scriptUrl);
      document.getElementById('appsScriptUrlInput').value = '';
      updateSyncStatusUI();
      showToast('Disconnected local Apps Script URL', 'info');
    });

    document.getElementById('btnCopyAppsScript').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(APPS_SCRIPT_SNIPPET);
        showToast('Copied Code.gs script to clipboard!', 'success');
      } catch {
        showToast('Select and copy the script from the code box below.', 'info');
      }
    });

    // Modals (Add Colony & Change Password)
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById(btn.getAttribute('data-close-modal')).classList.remove('open');
      });
    });

    document.getElementById('btnOpenAddColony').addEventListener('click', () => {
      document.getElementById('newDate').value = new Date().toISOString().slice(0, 10);
      document.getElementById('addColonyModal').classList.add('open');
    });

    document.getElementById('addColonyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btnSubmitNewColony');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      const maxRow = state.allColonies.reduce((m, r) => Math.max(m, Number(r.row) || 0), 1);
      const maxSno = state.allColonies.reduce((m, r) => Math.max(m, parseInt(r.sno, 10) || 0), 0);

      const newColony = {
        row: maxRow + 1,
        sno: String(maxSno + 1),
        circle: document.getElementById('newCircle').value.trim().toUpperCase(),
        ward: document.getElementById('newWard').value.trim().toUpperCase(),
        colony: document.getElementById('newColony').value.trim().toUpperCase(),
        date: document.getElementById('newDate').value,
        status: document.getElementById('newStatus').value.toUpperCase(),
        dashboardCount: parseNumeric(document.getElementById('newDashboardCount').value),
        finalCount: parseNumeric(document.getElementById('newFinalCount').value),
        reason: document.getElementById('newReason').value.trim()
      };

      const res = await writeToGoogleSheet('addRow', { data: newColony });

      if (res && res.ok) {
        if (res.row) newColony.row = res.row;
        if (res.sno) newColony.sno = String(res.sno);
        state.allColonies.push(newColony);
        showToast(`Colony "${newColony.colony}" added to Google Sheet (Row #${newColony.row}) & Dashboard!`, 'success');
      } else {
        newColony._pendingSync = true;
        newColony._isNew = true;
        state.allColonies.push(newColony);
        state.pendingEdits[String(newColony.row)] = newColony;
        savePendingEdits();
        showToast(`Added "${newColony.colony}" to Dashboard! Connect Apps Script URL to push to Google Sheet.`, 'warn');
      }

      submitBtn.disabled = false;
      submitBtn.textContent = 'Save to Excel & Dashboard';
      document.getElementById('addColonyForm').reset();
      document.getElementById('addColonyModal').classList.remove('open');
      saveWorkspaceData();
      updateSyncStatusUI();
      renderAll();
    });

    // Update Admin Credentials Modal
    const btnOpenChangePwd = document.getElementById('btnOpenChangePwd');
    if (btnOpenChangePwd) {
      btnOpenChangePwd.addEventListener('click', () => {
        const creds = getStoredAdminCreds();
        const uInput = document.getElementById('newAdminUsername');
        if (uInput) uInput.value = creds.username;
        const curPwd = document.getElementById('curPwd');
        if (curPwd) curPwd.value = '';
        const newPwd = document.getElementById('newPwd');
        if (newPwd) newPwd.value = '';
        const confirmPwd = document.getElementById('confirmPwd');
        if (confirmPwd) confirmPwd.value = '';
        updateCredsDisplay();
        document.getElementById('changePwdModal').classList.add('open');
      });
    }

    const changePwdForm = document.getElementById('changePwdForm');
    if (changePwdForm) {
      changePwdForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const cur = document.getElementById('curPwd').value;
        const nu = document.getElementById('newAdminUsername').value.trim();
        const np = document.getElementById('newPwd').value;
        const cp = document.getElementById('confirmPwd').value;
        const creds = getStoredAdminCreds();

        if (cur !== creds.password) {
          showToast('Current password is incorrect.', 'error');
          return;
        }
        if (!nu || nu.length < 3) {
          showToast('Admin username must be at least 3 characters.', 'error');
          return;
        }
        if (np) {
          if (np.length < 4) {
            showToast('New password must be at least 4 characters.', 'error');
            return;
          }
          if (np !== cp) {
            showToast('New passwords do not match.', 'error');
            return;
          }
        }

        const ok = saveAdminCredentials(nu, np);
        if (ok) {
          document.getElementById('changePwdForm').reset();
          document.getElementById('changePwdModal').classList.remove('open');
          showToast(`Admin account updated: Username is now '${nu}'!`, 'success');
        }
      });
    }

    // Inline Admin Credentials Form (Admin & Auth Sub-Tab)
    const inlineAdminForm = document.getElementById('inlineAdminCredsForm');
    if (inlineAdminForm) {
      inlineAdminForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const cur = document.getElementById('inlineCurPwd').value;
        const nu = document.getElementById('inlineNewUsername').value.trim();
        const np = document.getElementById('inlineNewPwd').value;
        const cp = document.getElementById('inlineConfirmPwd').value;
        const creds = getStoredAdminCreds();

        if (cur !== creds.password) {
          showToast('Current password verification failed.', 'error');
          return;
        }
        if (!nu || nu.length < 3) {
          showToast('Admin username must be at least 3 characters.', 'error');
          return;
        }
        if (np) {
          if (np.length < 4) {
            showToast('New password must be at least 4 characters.', 'error');
            return;
          }
          if (np !== cp) {
            showToast('New passwords do not match.', 'error');
            return;
          }
        }

        const ok = saveAdminCredentials(nu, np);
        if (ok) {
          document.getElementById('inlineCurPwd').value = '';
          document.getElementById('inlineNewPwd').value = '';
          document.getElementById('inlineConfirmPwd').value = '';
          showToast(`Admin account updated successfully (Username: '${nu}')!`, 'success');
        }
      });
    }

    const btnResetDefaultCreds = document.getElementById('btnResetDefaultCreds');
    if (btnResetDefaultCreds) {
      btnResetDefaultCreds.addEventListener('click', () => {
        if (confirm('Reset Administrator credentials back to default (admin / admin123)?')) {
          saveAdminCredentials('admin', 'admin123');
          showToast('Admin credentials reset to defaults (admin / admin123).', 'info');
        }
      });
    }

    // Theme Switcher Event Listeners
    const headerThemeBtn = document.getElementById('headerThemeToggleBtn');
    if (headerThemeBtn) {
      headerThemeBtn.addEventListener('click', toggleTheme);
    }

    const portalThemeBtn = document.getElementById('portalThemeToggleBtn');
    if (portalThemeBtn) {
      portalThemeBtn.addEventListener('click', toggleTheme);
    }

    const btnApplyThemeToggle = document.getElementById('btnApplyThemeToggle');
    if (btnApplyThemeToggle) {
      btnApplyThemeToggle.addEventListener('click', toggleTheme);
    }

    const themeChoiceLight = document.getElementById('themeChoiceLight');
    if (themeChoiceLight) {
      themeChoiceLight.addEventListener('click', () => {
        applyTheme('light', true);
        showToast('Switched to Light Theme (Corporate Day)', 'info');
      });
    }

    const themeChoiceDark = document.getElementById('themeChoiceDark');
    if (themeChoiceDark) {
      themeChoiceDark.addEventListener('click', () => {
        applyTheme('dark', true);
        showToast('Switched to Dark Theme (Executive GIS Night)', 'info');
      });
    }

    // Global Event Delegation for Edit Colony buttons (Date Wise, Circle Drilldown, Admin Table)
    document.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.js-open-edit');
      if (editBtn) {
        e.preventDefault();
        const rowId = editBtn.getAttribute('data-row');
        if (rowId) openEditColonyModal(rowId);
      }
    });

    // Edit Colony Form Submit
    const editColonyForm = document.getElementById('editColonyForm');
    if (editColonyForm) {
      editColonyForm.addEventListener('submit', handleSaveEditedColony);
    }

    // Delete Colony Button in Modal
    const btnDelColony = document.getElementById('btnDeleteColony');
    if (btnDelColony) {
      btnDelColony.addEventListener('click', () => {
        const rowId = document.getElementById('editRowId').value;
        if (rowId) handleDeleteColony(rowId);
      });
    }
  }

  function init() {
    document.getElementById('appsScriptPreview').textContent = APPS_SCRIPT_SNIPPET;

    const hasSession = restoreAdminSession();
    setupEvents();
    updateCredsDisplay();
    applyTheme(state.theme, false);

    if (hasSession && state.isAuthenticated) {
      // User is already logged in (active session in sessionStorage)
      const saved = loadWorkspaceData();
      if (saved && Array.isArray(saved) && saved.length > 0) {
        state.allColonies = mergePendingEdits(saved);
        state.lastSyncedAt = new Date();
      }
      updateSyncStatusUI();
      renderAll();
      fetchLiveSheetData(true);
      startAutoSync();
    } else {
      // Unauthenticated: Website is locked behind login gate; no pre-data loaded, no sync running
      state.allColonies = [];
      updateSyncStatusUI();
      renderAll();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
