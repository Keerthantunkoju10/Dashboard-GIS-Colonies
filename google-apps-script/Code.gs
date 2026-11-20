/**
 * NeoGeo GHMC Colony Performance Management Dashboard
 * Two-Way Google Sheets Sync Web App (Google Apps Script)
 *
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1IrHCi97oTceUR7Bi_k-IPVrrNOUaW6npVDreGI1slfE/edit
 * Sheet Tab:   COLONIES
 *
 * SETUP (60 Seconds):
 * 1. Open your Google Sheet -> Extensions -> Apps Script.
 * 2. Delete any code in Code.gs and paste this entire script.
 * 3. Click Save (Ctrl+S).
 * 4. Click Deploy -> New deployment -> Select type: Web app.
 * 5. Execute as: "Me" | Who has access: "Anyone".
 * 6. Click Deploy -> Authorize access -> Copy the Web App URL (ends with /exec).
 * 7. Paste that URL into the Admin Dashboard -> "Excel 2-Way Sync" (or set GOOGLE_APPS_SCRIPT_URL in Netlify).
 */

var SPREADSHEET_ID = '1IrHCi97oTceUR7Bi_k-IPVrrNOUaW6npVDreGI1slfE';
var SHEET_NAME = 'COLONIES';

function getColoniesSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet "' + SHEET_NAME + '" not found.');
  }
  return sheet;
}

function formatDateCell(val) {
  if (!val) return '';
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd');
  }
  var str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd');
  }
  return str;
}

function parseDateInput(dateStr) {
  if (!dateStr) return '';
  var str = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    var parts = str.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  return str;
}

function parseNumeric(val) {
  if (val === null || val === undefined) return 0;
  var s = String(val).trim();
  if (s === '' || s === '-' || s === 'None' || s === 'N/A') return 0;
  if (s === '199343' || s === '199343.0') return 199;
  if (s.indexOf('(') !== -1) {
    var m1 = s.split('(')[0].match(/\d+/);
    return m1 ? parseInt(m1[0], 10) : 0;
  }
  if (s.indexOf(',') !== -1) {
    if (/^\d{1,3}(,\d{2,3})+$/.test(s)) {
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
  var m2 = cleaned.match(/\d+/);
  return m2 ? parseInt(m2[0], 10) : 0;
}

function readAllColonies() {
  var sheet = getColoniesSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var records = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var hasData = false;
    for (var c = 1; c < 9; c++) {
      if (row[c] !== null && row[c] !== undefined && String(row[c]).trim() !== '') {
        hasData = true;
        break;
      }
    }
    if (!hasData) continue;

    var statusRaw = row[5] !== null && row[5] !== undefined ? String(row[5]).trim().toUpperCase() : 'HOLD';
    records.push({
      row: i + 2,
      sno: row[0] !== null && row[0] !== undefined ? String(row[0]).trim() : '',
      circle: row[1] !== null && row[1] !== undefined ? String(row[1]).trim() : '',
      ward: row[2] !== null && row[2] !== undefined ? String(row[2]).trim() : '',
      colony: row[3] !== null && row[3] !== undefined ? String(row[3]).trim() : '',
      date: formatDateCell(row[4]),
      status: statusRaw || 'HOLD',
      dashboardRaw: row[6] !== null && row[6] !== undefined ? String(row[6]).trim() : '',
      finalRaw: row[7] !== null && row[7] !== undefined ? String(row[7]).trim() : '',
      dashboardCount: parseNumeric(row[6]),
      finalCount: parseNumeric(row[7]),
      reason: row[8] !== null && row[8] !== undefined ? String(row[8]).trim() : ''
    });
  }

  return records;
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'read';
    if (action === 'ping') {
      return jsonOutput({
        ok: true,
        connected: true,
        sheetId: SPREADSHEET_ID,
        sheetName: SHEET_NAME,
        timestamp: new Date().toISOString()
      });
    }
    var colonies = readAllColonies();
    return jsonOutput({
      ok: true,
      source: 'apps-script',
      sheetId: SPREADSHEET_ID,
      sheetName: SHEET_NAME,
      count: colonies.length,
      updatedAt: new Date().toISOString(),
      colonies: colonies
    });
  } catch (err) {
    return jsonOutput({ ok: false, error: err.message });
  }
}

function normalizeCellValue(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).trim();
  if (s === '') return '';
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

function findNextEmptyDataRow(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { row: 2, sno: 1 };
  var values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var maxSno = 0;
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var hasData = false;
    for (var c = 1; c < 9; c++) {
      if (row[c] !== null && row[c] !== undefined && String(row[c]).trim() !== '') {
        hasData = true;
        break;
      }
    }
    if (hasData) {
      var n = parseInt(String(row[0] || ''), 10);
      if (!isNaN(n) && n > maxSno) maxSno = n;
    } else {
      // Found first pre-numbered blank row (e.g. row 168 with SNO 164)
      var existingSno = row[0] !== null && String(row[0]).trim() !== '' ? row[0] : (maxSno + 1);
      return { row: i + 2, sno: existingSno };
    }
  }
  return { row: lastRow + 1, sno: maxSno + 1 };
}

function applyRowUpdate(sheet, payload) {
  var rowNum = parseInt(payload.row, 10);
  if (isNaN(rowNum) || rowNum < 2) {
    throw new Error('Invalid row number: ' + payload.row);
  }

  var existing = sheet.getRange(rowNum, 1, 1, 9).getValues()[0];
  var updated = [
    payload.sno !== undefined && payload.sno !== '' ? normalizeCellValue(payload.sno) : existing[0],
    payload.circle !== undefined ? String(payload.circle).trim() : existing[1],
    payload.ward !== undefined ? String(payload.ward).trim() : existing[2],
    payload.colony !== undefined ? String(payload.colony).trim() : existing[3],
    payload.date !== undefined && payload.date !== '' ? parseDateInput(payload.date) : existing[4],
    payload.status !== undefined ? String(payload.status).trim().toUpperCase() : existing[5],
    payload.dashboardCount !== undefined ? normalizeCellValue(payload.dashboardCount) : existing[6],
    payload.finalCount !== undefined ? normalizeCellValue(payload.finalCount) : existing[7],
    payload.reason !== undefined ? String(payload.reason).trim() : existing[8]
  ];

  var range = sheet.getRange(rowNum, 1, 1, 9);
  range.setValues([updated]);
  if (updated[4] instanceof Date) {
    sheet.getRange(rowNum, 5).setNumberFormat('dd-mmm-yyyy');
  }
  return rowNum;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : '{}');
    var action = body.action || 'updateRow';
    var sheet = getColoniesSheet();

    if (action === 'ping') {
      return jsonOutput({ ok: true, connected: true, sheetName: SHEET_NAME, timestamp: new Date().toISOString() });
    }

    if (action === 'updateRow') {
      var data = body.data || body;
      var updatedRow = applyRowUpdate(sheet, data);
      SpreadsheetApp.flush();
      return jsonOutput({
        ok: true,
        action: 'updateRow',
        row: updatedRow,
        message: 'Row #' + updatedRow + ' updated in Google Sheet (' + SHEET_NAME + ').',
        updatedAt: new Date().toISOString()
      });
    }

    if (action === 'addRow') {
      var newData = body.data || body;
      var slot = findNextEmptyDataRow(sheet);
      var snoVal = (newData.sno !== undefined && String(newData.sno).trim() !== '') ? normalizeCellValue(newData.sno) : slot.sno;
      var rowValues = [
        snoVal,
        String(newData.circle || '').trim(),
        String(newData.ward || '').trim(),
        String(newData.colony || '').trim(),
        parseDateInput(newData.date || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd')),
        String(newData.status || 'PROGRESS').trim().toUpperCase(),
        normalizeCellValue(newData.dashboardCount !== undefined ? newData.dashboardCount : ''),
        normalizeCellValue(newData.finalCount !== undefined ? newData.finalCount : ''),
        String(newData.reason || '').trim()
      ];
      sheet.getRange(slot.row, 1, 1, 9).setValues([rowValues]);
      if (rowValues[4] instanceof Date) {
        sheet.getRange(slot.row, 5).setNumberFormat('dd-mmm-yyyy');
      }
      SpreadsheetApp.flush();
      return jsonOutput({
        ok: true,
        action: 'addRow',
        row: slot.row,
        sno: String(snoVal),
        message: 'New colony added at Row #' + slot.row + ' in Google Sheet (' + SHEET_NAME + ').',
        updatedAt: new Date().toISOString()
      });
    }

    if (action === 'bulkUpdate') {
      var items = Array.isArray(body.items) ? body.items : [];
      var updatedRows = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.row && parseInt(item.row, 10) >= 2) {
          updatedRows.push(applyRowUpdate(sheet, item));
        }
      }
      SpreadsheetApp.flush();
      return jsonOutput({
        ok: true,
        action: 'bulkUpdate',
        count: updatedRows.length,
        rows: updatedRows,
        message: updatedRows.length + ' rows updated in Google Sheet.',
        updatedAt: new Date().toISOString()
      });
    }

    if (action === 'deleteRow') {
      var rowNum = parseInt(body.row || (body.data && body.data.row), 10);
      if (!isNaN(rowNum) && rowNum >= 2 && rowNum <= sheet.getLastRow()) {
        sheet.deleteRow(rowNum);
        SpreadsheetApp.flush();
        return jsonOutput({
          ok: true,
          action: 'deleteRow',
          row: rowNum,
          message: 'Row #' + rowNum + ' deleted from Google Sheet (' + SHEET_NAME + ').',
          updatedAt: new Date().toISOString()
        });
      }
      return jsonOutput({ ok: false, error: 'Invalid row to delete: ' + body.row });
    }

    return jsonOutput({ ok: false, error: 'Unsupported action: ' + action });
  } catch (err) {
    return jsonOutput({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}
