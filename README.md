# NeoGeo GHMC Project Colony Survey & GIS Delivery Management Dashboard

An executive, high-fidelity corporate analytics dashboard engineered for the **GHMC Project (Greater Hyderabad Municipal Corporation)** by **NeoGeoinfo Technologies Limited**.

This platform matches the production interface from your reference images and is integrated with the official Google Sheet database, with automated colony de-duplication, circle delivery analytics, Admin Suite authentication, and **Real-Time Push to Excel** (**completely focused on Colonies, Circles, Wards, and GIS delivery without employee metrics**).

---

## 🌟 Key Features

### 1. Executive Colony Survey Dashboard (Matches Reference Images)
* **NeoGeo Corporate Header**: Official branding, live clock updater, active sync indicator, and user profile badge.
* **Primary Navigation Tabs**:
  * `1. Fresh Data (Current GHMC dashboard & surveyed colonies)`
  * `2. Resubmit Data (Hold & re-surveyed colonies)`
  * `3. 3Layers Data (Colony delivery & GIS layers)`
* **High-Level Metric Cards**:
  * **Total GHMC Properties**: `19,81,000` (All 300 GHMC Wards)
  * **Submitted to GHMC**: `11,72,901` (59.2%)
  * **Last Submitted Date**: `13-Nov-2026`
  * **Ready to Submit**: `26,083` (Highlighted emerald badge)
* **Overall Survey Performance Banner & 7 KPI Cards**:
  * Raw Colonies: `158`
  * Clean Deduplicated Colonies: `93`
  * Completed Colonies: `70`
  * Colonies on Hold: `22`
  * Dashboard Properties Target: `26,420`
  * Final Verified Properties: `18,867`
  * Overall Completion Rate: `75.3%`
* **Task Completion Gauge**: `75.3%` with animated dual-gradient progress bar.
* **Performance Comparison Tables**:
  * **★ Top 3 Performing Circles**: Circle 21-CHANDA NAGAR (100%), Circle 13-KARWAN (100%), Circle 23-MOOSAPET (100%)
  * **▼ Least 3 / Lagging Circles**: Circle 7-SANTOSH NAGAR (0.0%), Circle 18-JUBLEEHILLS (0.0%), Circle 28-MALKAJGIRI (0.0%)
* **Interactive Responsive Charts**:
  * **Daily Properties Target (Dashboard) vs Finalized**: Dual bar timeline chart across all active survey dates from Google Sheets.
  * **Circle-Wise Colony Delivery & Completion %**: Color-scaled bar chart across all active GHMC circles matching the screenshot palette.

---

### 2. Real-Time Excel Push Engine ("Whenever I upload a colony it should push in Excel also")
* **Automatic Excel Workbook Integration**:
  * Whenever a new colony is uploaded or added via the dashboard modal, it is **immediately pushed and appended directly into `GHMC_Data.xlsx`** on disk via the dedicated backend API (`POST /api/save-colony`).
  * If a colony already exists (matching SNO or Circle + Colony Name), the record is updated in place in `GHMC_Data.xlsx`.
  * If an Excel file (`.xlsx` or `.csv`) is uploaded via the drag-and-drop zone, the bulk push endpoint (`POST /api/save-colonies-bulk`) writes all colonies to `GHMC_Data.xlsx` in a single batch.
  * After every Excel update, `dashboard_data.json` and `data.js` are regenerated automatically.
* **Instant Toast Notification**:
  * Visual confirmation toasts appear instantly: `"✓ Colony '<Colony Name>' successfully pushed to GHMC_Data.xlsx (Row <Row Number>)!"`.
* **One-Click Clean Excel Export**:
  * Direct download of the cleaned, deduplicated dataset as an Excel workbook (`.xlsx`) at any time.

---

### 3. Colony De-duplication Engine ("Remove the Duplicate")
* **Raw Dataset**: 158 field survey records from the `COLONIES` sheet.
* **Duplicate Detection**: Automatically identifies 43 duplicate colony groups involving 108 records where colonies were re-visited or logged across multiple dates (e.g., *Vanasthali Hills* with 5 records, *Balaji Nagar* with 4 records, *Erragadda Main Road* with 4 records).
* **Consolidation**:
  * Produces **93 clean unique master colony records**.
  * Retains the latest survey date record with verified final property count.
  * Preserves historical field notes and reasons.
* **De-duplication Center View**:
  * Visual side-by-side inspector showing all 43 duplicate groups.
  * Green badge highlights the retained master record while redundant rows are flagged.
  * One-click download of **Clean Deduplicated Excel (.xlsx)** and **Clean Deduplicated CSV**.

---

### 4. Admin Authentication Modal (Matches Reference Image)
* **Pixel-Perfect QC Work Modal**:
  * Exact replica of the reference screenshot (`QC WORK LOGIN` / `Employee / Admin Login`).
  * Features the animated rainbow gradient accent bar, floating pill badge, clear instructional text, and styled blue action button.
* **Refresh-Based Session Security**:
  * The main public dashboard (KPIs, overview charts, Circle Wise, Ward Wise, Date Wise, and Deduplication views) remains open to all viewers.
  * The Admin Management Suite and Colony modification capabilities require authentication.
  * **Session reset on page reload**: Re-authentication is required every time the page is refreshed (no persistent session storage across reloads).

---

### 5. Two-Way Google Sheets Sync
* **Connected Google Sheet**:
  * `https://docs.google.com/spreadsheets/d/1IrHCi97oTceUR7Bi_k-IPVrrNOUaW6npVDreGI1slfE/edit?usp=sharing`
* **Sync Live from Google Sheets**:
  * Pulls live data from the Google Sheet link with 1 click.
* **Google Apps Script Webhook Snippet**:
  * Provides ready-to-use Google Apps Script code for 2-way sync between Google Drive and the dashboard.

---

## 🚀 How to Run the Dashboard

### Method 1: One-Click Batch File (Recommended)
Double-click:
* `c:\Users\Nikhil\Desktop\Keerthan\Courses\Launch_Dashboard.bat`, OR
* `c:\Users\Nikhil\Desktop\Keerthan\Courses\Dashboard GIS Colonies\run_dashboard.bat`.

This launches the local Excel integration server on port 3000 and opens `http://localhost:3000` in your default browser.

### Method 2: Direct File Opening
Double-click `index.html` in `Dashboard GIS Colonies` to open directly in Google Chrome or Microsoft Edge.

---

## 📁 File Structure
```
Dashboard GIS Colonies/
├── index.html              # Core application layout, charts, and QC Work modal
├── styles.css              # Custom NeoGeo corporate styling & animations
├── app.js                  # Application logic, deduplication engine, and Excel push
├── server.py               # Dedicated Python backend with openpyxl Excel push engine
├── data.js                 # Embedded datasets from Excel sheets
├── dashboard_data.json     # Clean JSON export of all sheets
├── GHMC_Data.xlsx          # Live Excel workbook pushed to on colony uploads
├── run_dashboard.bat       # Local server launcher
└── README.md               # Documentation
```
