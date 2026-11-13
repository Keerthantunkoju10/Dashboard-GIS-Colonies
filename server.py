"""
NeoGeo GHMC Dashboard Backend Server
Serves static dashboard and provides Excel (GHMC_Data.xlsx) push and sync APIs.
"""

import http.server
import socketserver
import json
import os
import re
import datetime
import openpyxl

PORT = 3000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_PATH = os.path.join(BASE_DIR, 'GHMC_Data.xlsx')
JSON_PATH = os.path.join(BASE_DIR, 'dashboard_data.json')
JS_PATH = os.path.join(BASE_DIR, 'data.js')

def parse_num(v):
    if v is None: return 0
    s = str(v).strip()
    if s in ('', '-', 'None'): return 0
    if s == '199343': return 199
    m = re.findall(r'\d+', s)
    if m:
        return sum(int(x) for x in m)
    return 0

def parse_date(date_val):
    if not date_val:
        return datetime.datetime.now()
    if isinstance(date_val, (datetime.datetime, datetime.date)):
        return date_val
    s = str(date_val).split('T')[0].strip()
    formats = ['%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y', '%d-%b-%Y', '%d %b %Y']
    for fmt in formats:
        try:
            return datetime.datetime.strptime(s, fmt)
        except Exception:
            pass
    return s

def regenerate_datasets():
    """Regenerates dashboard_data.json and data.js from GHMC_Data.xlsx"""
    if not os.path.exists(EXCEL_PATH):
        return

    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    ws1 = wb['COLONIES']
    colonies_raw = []

    for r in range(2, ws1.max_row + 1):
        sno = ws1.cell(r, 1).value
        circle = ws1.cell(r, 2).value
        ward = ws1.cell(r, 3).value
        colony = ws1.cell(r, 4).value
        date_val = ws1.cell(r, 5).value
        status = ws1.cell(r, 6).value
        dash_count = ws1.cell(r, 7).value
        final_count = ws1.cell(r, 8).value
        reason = ws1.cell(r, 9).value

        if all(v is None or str(v).strip() in ('', 'None', '-') for v in [circle, ward, colony]):
            continue

        date_str = ''
        if hasattr(date_val, 'strftime'):
            date_str = date_val.strftime('%Y-%m-%d')
        elif date_val is not None:
            date_str = str(date_val).strip()

        colonies_raw.append({
            'id': len(colonies_raw) + 1,
            'sno': str(sno).strip() if sno is not None else str(len(colonies_raw) + 1),
            'circle': str(circle).strip() if circle else '-',
            'ward': str(ward).strip() if ward else '-',
            'colony': str(colony).strip() if colony else '-',
            'alloted_date': date_str,
            'status': str(status).strip() if status else 'COMPLETED',
            'dashboard_count': str(dash_count).strip() if dash_count is not None else '-',
            'final_count': str(final_count).strip() if final_count is not None else '-',
            'reason': str(reason).strip() if reason else '-'
        })

    # Deduplicate
    groups = {}
    for item in colonies_raw:
        c = item['circle'].strip().upper()
        w = item['ward'].strip().upper()
        col = item['colony'].strip().upper()
        if col in ('-', '', 'NONE') and w in ('-', '', 'NONE'):
            key = f'_ANON_{item["id"]}'
        else:
            key = f'{c}___{w}___{col}'
        groups.setdefault(key, []).append(item)

    duplicate_groups = []
    deduped_colonies = []

    for key, items in groups.items():
        if len(items) > 1 and not key.startswith('_ANON_'):
            duplicate_groups.append({
                'group_key': key,
                'colony_name': items[0]['colony'],
                'circle': items[0]['circle'],
                'ward': items[0]['ward'],
                'occurrence_count': len(items),
                'items': items
            })
            sorted_items = sorted(items, key=lambda x: (x['alloted_date'], 1 if x['status'] == 'COMPLETED' else 0), reverse=True)
            best = dict(sorted_items[0])
            best['is_deduplicated'] = True
            best['duplicates_merged'] = len(items)
            best['all_dates'] = [it['alloted_date'] for it in sorted_items]
            deduped_colonies.append(best)
        else:
            rec = dict(items[0])
            rec['is_deduplicated'] = False
            rec['duplicates_merged'] = 1
            rec['all_dates'] = [rec['alloted_date']]
            deduped_colonies.append(rec)

    # Circle metrics
    circle_dict = {}
    for c in deduped_colonies:
        c_name = c['circle']
        if c_name in ('-', ''): continue
        if c_name not in circle_dict:
            circle_dict[c_name] = {
                'circle': c_name,
                'total_colonies': 0,
                'completed': 0,
                'hold': 0,
                'progress': 0,
                'dash_props': 0,
                'final_props': 0
            }
        cd = circle_dict[c_name]
        cd['total_colonies'] += 1
        cd['dash_props'] += parse_num(c['dashboard_count'])
        cd['final_props'] += parse_num(c['final_count'])
        st = c['status'].upper()
        if 'COMPLETED' in st: cd['completed'] += 1
        elif 'HOLD' in st: cd['hold'] += 1
        else: cd['progress'] += 1

    circles_list = []
    for c_name, d in circle_dict.items():
        pct = round((d['completed'] / d['total_colonies']) * 100, 1) if d['total_colonies'] > 0 else 0
        circles_list.append({
            'circle': c_name,
            'total_colonies': d['total_colonies'],
            'completed': d['completed'],
            'hold': d['hold'],
            'progress': d['progress'],
            'dash_props': d['dash_props'],
            'final_props': d['final_props'],
            'completion_pct': pct
        })
    circles_list.sort(key=lambda x: (x['completion_pct'], x['total_colonies']), reverse=True)

    # Timeline by date
    date_agg = {}
    for c in deduped_colonies:
        dt = c['alloted_date'] or '2026-06-23'
        if dt not in date_agg:
            date_agg[dt] = {'date': dt, 'dash_props': 0, 'final_props': 0, 'colonies': 0}
        da = date_agg[dt]
        da['colonies'] += 1
        da['dash_props'] += parse_num(c['dashboard_count'])
        da['final_props'] += parse_num(c['final_count'])
    daily_timeline = sorted(list(date_agg.values()), key=lambda x: x['date'])

    # Wards, Commissioners, DCs
    wards_list = []
    if 'ZONE,CIRCLE,WARD' in wb.sheetnames:
        ws2 = wb['ZONE,CIRCLE,WARD']
        for r in range(2, ws2.max_row + 1):
            s = ws2.cell(r, 1).value
            z = ws2.cell(r, 2).value
            cir = ws2.cell(r, 3).value
            w = ws2.cell(r, 4).value
            if z or cir or w:
                wards_list.append({'sno': s, 'zone': str(z or '').strip(), 'circle': str(cir or '').strip(), 'ward': str(w or '').strip()})

    commissioners = []
    if 'Sheet3' in wb.sheetnames:
        ws3 = wb['Sheet3']
        for r in range(2, ws3.max_row + 1):
            s = ws3.cell(r, 1).value
            z = ws3.cell(r, 2).value
            comm = ws3.cell(r, 3).value
            if z or comm:
                commissioners.append({'sno': s, 'zone': str(z or '').strip(), 'commissioner': str(comm or '').strip()})

    dcs = []
    if 'Sheet4' in wb.sheetnames:
        ws4 = wb['Sheet4']
        for r in range(2, ws4.max_row + 1):
            s = ws4.cell(r, 1).value
            z = ws4.cell(r, 2).value
            cn = ws4.cell(r, 3).value
            cname = ws4.cell(r, 4).value
            dc = ws4.cell(r, 5).value
            ph = ws4.cell(r, 6).value
            if z or cname or dc:
                phone_str = str(int(ph)) if isinstance(ph, float) else str(ph or '')
                dcs.append({'sno': s, 'zone': str(z or '').strip(), 'circle_num': cn, 'circle_name': str(cname or '').strip(), 'dc_name': str(dc or '').strip(), 'phone': phone_str.strip()})

    comp_total = sum(1 for c in deduped_colonies if 'COMPLETED' in c['status'])
    hold_total = sum(1 for c in deduped_colonies if 'HOLD' in c['status'])
    prog_total = sum(1 for c in deduped_colonies if 'PROGRESS' in c['status'])
    dash_total = sum(parse_num(c['dashboard_count']) for c in deduped_colonies)
    final_total = sum(parse_num(c['final_count']) for c in deduped_colonies)

    output_data = {
        'summary': {
            'total_properties': '19,81,000',
            'submitted_properties': '11,72,901',
            'last_submitted_date': '13-Nov-2026',
            'ready_to_submit': '26,083',
            'raw_colonies_count': len(colonies_raw),
            'deduped_colonies_count': len(deduped_colonies),
            'duplicate_groups_count': len(duplicate_groups),
            'redundant_rows_count': len(colonies_raw) - len(deduped_colonies),
            'completed_colonies': comp_total,
            'hold_colonies': hold_total,
            'progress_colonies': prog_total,
            'total_dashboard_props': dash_total,
            'total_final_props': final_total,
            'overall_completion_pct': round((comp_total / len(deduped_colonies)) * 100, 1) if deduped_colonies else 0,
            'active_circles_count': len(circles_list)
        },
        'colonies_raw': colonies_raw,
        'colonies_deduped': deduped_colonies,
        'duplicate_groups': duplicate_groups,
        'circles': circles_list,
        'daily_timeline': daily_timeline,
        'wards': wards_list,
        'commissioners': commissioners,
        'dcs': dcs,
        'google_sheet_url': 'https://docs.google.com/spreadsheets/d/1IrHCi97oTceUR7Bi_k-IPVrrNOUaW6npVDreGI1slfE/edit?usp=sharing'
    }

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    with open(JS_PATH, 'w', encoding='utf-8') as f:
        f.write('window.GHMC_DATA = ' + json.dumps(output_data, indent=2, ensure_ascii=False) + ';')


def push_colony_to_excel(colony_data):
    """Writes a new or updated colony into GHMC_Data.xlsx"""
    wb = openpyxl.load_workbook(EXCEL_PATH)
    ws = wb['COLONIES']

    target_row = None
    sno_str = str(colony_data.get('sno', '')).strip()
    colony_name = str(colony_data.get('colony', '')).strip()
    circle_name = str(colony_data.get('circle', '')).strip()

    # 1. Look for existing row by SNO (check rows 2 to 300)
    if sno_str and sno_str.isdigit():
        target_sno = int(sno_str)
        for r in range(2, 300):
            val = ws.cell(r, 1).value
            has_data = any(ws.cell(r, c).value is not None and str(ws.cell(r, c).value).strip() != '' for c in range(2, 10))
            if has_data and val is not None and (val == target_sno or str(val).strip() == sno_str):
                target_row = r
                break

    # 2. If not found by SNO, check if colony name matches an existing populated row
    if not target_row and colony_name and colony_name not in ('-', 'None'):
        for r in range(2, 300):
            c_val = str(ws.cell(r, 4).value or '').strip()
            cir_val = str(ws.cell(r, 2).value or '').strip()
            if c_val.upper() == colony_name.upper():
                if not circle_name or cir_val.upper() == circle_name.upper():
                    target_row = r
                    break

    # 3. If still not found, find the first available row where columns 2-9 are ALL empty
    if not target_row:
        max_sno = 0
        for r in range(2, 500):
            val_sno = ws.cell(r, 1).value
            if isinstance(val_sno, int):
                max_sno = max(max_sno, val_sno)
            elif str(val_sno).isdigit():
                max_sno = max(max_sno, int(val_sno))

            cols2to9 = [ws.cell(r, c).value for c in range(2, 10)]
            if all(v is None or str(v).strip() == '' for v in cols2to9):
                target_row = r
                break

        if not target_row:
            target_row = ws.max_row + 1

        if not sno_str or not sno_str.isdigit():
            sno_str = str(max_sno + 1)

    # Date parsing
    date_val = colony_data.get('alloted_date', '')
    date_obj = parse_date(date_val)

    # Write cells
    ws.cell(target_row, 1, int(sno_str) if sno_str.isdigit() else sno_str)
    ws.cell(target_row, 2, str(colony_data.get('circle', '-')).strip())
    ws.cell(target_row, 3, str(colony_data.get('ward', '-')).strip())
    ws.cell(target_row, 4, str(colony_data.get('colony', '-')).strip())
    ws.cell(target_row, 5, date_obj)
    ws.cell(target_row, 6, str(colony_data.get('status', 'COMPLETED')).strip().upper())
    
    # Dashboard props count
    d_props = str(colony_data.get('dashboard_count', '-')).strip()
    ws.cell(target_row, 7, float(d_props) if d_props.replace('.', '', 1).isdigit() else d_props)
    
    # Final props count
    f_props = str(colony_data.get('final_count', '-')).strip()
    ws.cell(target_row, 8, float(f_props) if f_props.replace('.', '', 1).isdigit() else f_props)
    
    ws.cell(target_row, 9, str(colony_data.get('reason', '-')).strip())

    wb.save(EXCEL_PATH)
    regenerate_datasets()
    return target_row


def push_bulk_colonies_to_excel(colonies_list):
    """Writes multiple colonies into GHMC_Data.xlsx in a single batch"""
    if not colonies_list:
        return {'added': 0, 'updated': 0, 'total': 0}

    wb = openpyxl.load_workbook(EXCEL_PATH)
    ws = wb['COLONIES']

    # Pre-scan existing rows
    sno_map = {}
    colony_map = {}
    first_empty_row = None
    max_sno = 0

    for r in range(2, 500):
        val_sno = ws.cell(r, 1).value
        col_val = str(ws.cell(r, 4).value or '').strip()
        cir_val = str(ws.cell(r, 2).value or '').strip()
        cols2to9 = [ws.cell(r, c).value for c in range(2, 10)]
        is_empty = all(v is None or str(v).strip() == '' for v in cols2to9)

        if isinstance(val_sno, int):
            max_sno = max(max_sno, val_sno)
        elif str(val_sno).isdigit():
            max_sno = max(max_sno, int(val_sno))

        if not is_empty:
            if val_sno is not None:
                sno_map[str(val_sno).strip()] = r
            if col_val and col_val not in ('-', 'None'):
                key = f"{cir_val.upper()}___{col_val.upper()}"
                colony_map[key] = r
        elif first_empty_row is None:
            first_empty_row = r

    if first_empty_row is None:
        first_empty_row = ws.max_row + 1

    added_count = 0
    updated_count = 0

    for c in colonies_list:
        sno_str = str(c.get('sno', '')).strip()
        colony_name = str(c.get('colony', '')).strip()
        circle_name = str(c.get('circle', '')).strip()

        if not colony_name or colony_name in ('-', 'None'):
            continue

        target_row = None
        if sno_str and sno_str in sno_map:
            target_row = sno_map[sno_str]
            updated_count += 1
        else:
            key = f"{circle_name.upper()}___{colony_name.upper()}"
            if key in colony_map:
                target_row = colony_map[key]
                updated_count += 1
            else:
                target_row = first_empty_row
                first_empty_row += 1
                max_sno += 1
                sno_str = str(max_sno)
                sno_map[sno_str] = target_row
                colony_map[key] = target_row
                added_count += 1

        date_val = c.get('alloted_date', '')
        date_obj = parse_date(date_val)

        ws.cell(target_row, 1, int(sno_str) if sno_str.isdigit() else sno_str)
        ws.cell(target_row, 2, str(c.get('circle', '-')).strip())
        ws.cell(target_row, 3, str(c.get('ward', '-')).strip())
        ws.cell(target_row, 4, colony_name)
        ws.cell(target_row, 5, date_obj)
        ws.cell(target_row, 6, str(c.get('status', 'COMPLETED')).strip().upper())

        d_props = str(c.get('dashboard_count', '-')).strip()
        ws.cell(target_row, 7, float(d_props) if d_props.replace('.', '', 1).isdigit() else d_props)

        f_props = str(c.get('final_count', '-')).strip()
        ws.cell(target_row, 8, float(f_props) if f_props.replace('.', '', 1).isdigit() else f_props)

        ws.cell(target_row, 9, str(c.get('reason', '-')).strip())

    wb.save(EXCEL_PATH)
    regenerate_datasets()
    return {'added': added_count, 'updated': updated_count, 'total': added_count + updated_count}


class DashboardRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_POST(self):
        if self.path == '/api/save-colony':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                colony_data = json.loads(post_data.decode('utf-8'))
                target_row = push_colony_to_excel(colony_data)
                
                response = {
                    'success': True,
                    'message': f"Colony '{colony_data.get('colony')}' pushed to Excel (Row {target_row}) successfully!",
                    'row': target_row
                }
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

        elif self.path == '/api/save-colonies-bulk':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                colonies = payload.get('colonies', [])
                stats = push_bulk_colonies_to_excel(colonies)
                
                response = {
                    'success': True,
                    'message': f"Successfully pushed {stats['total']} colonies to Excel ({stats['added']} new, {stats['updated']} updated)!",
                    'count': stats['total'],
                    'stats': stats
                }
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


if __name__ == '__main__':
    print(f"Starting NeoGeo GHMC Excel Integration Server on port {PORT}...")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), DashboardRequestHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        httpd.serve_forever()
