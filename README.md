# NeoGeo — GHMC Project Colony Performance Management Dashboard

Live executive colony analytics dashboard & Excel-linked Admin Suite built for **NeoGeoinfo Technologies Limited (GHMC Project)**, directly integrated with the Google Sheet:

- **Linked Google Sheet**: `************`
- **Active Sheet Tab**: `COLONIES`
- **Employee-free Analytics**: Focuses exclusively on **Colonies, Circles, Wards, Property Counts, and Statuses** (`COMPLETED`, `PROGRESS`, `HOLD`, `REJECTED`).

---

## Features

1. **Public Executive Dashboard**
   - Corporate NeoGeo header, **1. Fresh Data / 2. Resubmit Data / 3. 3Layers Data** tabs, 4 executive KPI cards, 7 mini KPI cards, Task Completion gauge, **Top 3 & Least 3 Performing Circles**, and interactive **Daily Target vs Finalized** & **Circle Achievement %** charts.
   - Drill-down views: **Overview**, **Month Wise**, **Week Wise**, **Date Wise**, and **Circle Wise** (with expandable Colony list).
   - Export to **CSV**, **Excel (`.xlsx`)**, and **Print / PDF**.
   - **Auto-Sync (every 30s)** + manual **Refresh Data** pulls live edits made directly in Google Sheets.

2. **Admin / QC Work Dashboard & Security Suite**
   - **Theme Change Option (Light / Dark Mode)**:
     - 1-click theme switcher in the top corporate header banner and on the portal login screen.
     - Dedicated **Theme & Visual Appearance** preferences card inside the Admin suite.
     - Smooth instant transition between crisp Corporate Day (Light) and High-Contrast GIS Night (Dark) mode, with full Chart.js and data table theme adaptation. Persisted across sessions via `localStorage`.
   - **Admin Username & Password Update**:
     - Fast modal access via **Update Admin Credentials** button in the Admin top bar to update both the master Admin username and password (with current password verification).
     - Dedicated **Admin Security & Theme** tab in the Admin suite for credentials management, credential reset to defaults, and active security oversight.
   - **Default credentials**: `************` / `************123` (or User viewer: `user` / `user123`), fully customizable.
   - Public dashboard remains protected behind secure authentication gate until sign-in.
   - **6 pastel summary cards** (`Total Records`, `Finalized Count`, `Completed`, `In Progress`, `Hold`, `Rejected / No Final`).
   - **Full inline-editable table** of every row in Google Sheets (`COLONIES`): update **Status**, **Dashboard Count**, **Finalized Count**, **Alloted Date**, or **Reason** and click **Save** to update BOTH the Google Sheet and the Dashboard immediately.
   - **+ Add Colony** modal appends new colonies directly into the next open row of the `COLONIES` sheet.

---

## 1. Deploy to GitHub & Netlify

### Option A — Deploy via GitHub + Netlify (Recommended)
1. Unzip `ghmc-colony-dashboard-netlify.zip` (or use the `ghmc-colony-dashboard` folder).
2. Create a new repository on GitHub (e.g., `ghmc-colony-dashboard`) and push the files:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: NeoGeo GHMC Colony Dashboard + Admin 2-Way Excel Sync"
   git branch -M main
   git remote add origin https://github.com/<your-username>/ghmc-colony-dashboard.git
   git push -u origin main
   ```
3. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub** → select your repository.
4. Keep the detected defaults from `netlify.toml`:
   - **Build command**: *(leave empty)*
   - **Publish directory**: `.`
   - **Functions directory**: `netlify/functions`
5. Click **Deploy site**.

### Option B — Quick Drag-and-Drop to Netlify
- Go to **Netlify → Sites → Add new site → Deploy manually**, and drag the unzipped `ghmc-colony-dashboard` folder (note: for Netlify Functions `/api/sheet-sync` to be deployed cleanly, **Option A via GitHub** or `netlify deploy --prod` is recommended; even without functions, the dashboard automatically falls back to direct Google Sheets live fetch & direct Apps Script sync!).

---

## 2. Enable Live Two-Way Write-Back (Admin Dashboard → Google Sheet)

Reading from your Google Sheet works **automatically out-of-the-box** (any edit made in Google Sheets appears automatically in the Dashboard & Admin Dashboard).

To also push **Admin Dashboard status/count edits BACK into Google Sheets** (60-second one-time setup):

1. Open your Google Sheet:  
   `https://docs.google.com/spreadsheets/d/1IrHCi97oTceUR7Bi_k-IPVrrNOUaW6npVDreGI1slfE/edit`
2. Click **Extensions → Apps Script**.
3. Delete any existing code in `Code.gs` and paste the contents of `google-apps-script/Code.gs`.
4. Click **Save** (`Ctrl+S`).
5. Click **Deploy → New deployment → Select type: Web app**:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
6. Click **Deploy**, authorize permissions, and copy the **Web app URL** (ends with `/exec`).
7. Connect the URL using **either** method:
   - **Global (All Admins on Netlify)**: In Netlify → **Site configuration → Environment variables**, add:
     - Key: `GOOGLE_APPS_SCRIPT_URL`
     - Value: `https://script.google.com/macros/s/.../exec`
     - Trigger a quick redeploy.
   - **Instant (In Browser)**: Sign into **Admin / QC Work** (`************` / `************123`) → open **Excel 2-Way Sync Setup** → paste the Web App URL → click **Test & Connect**.

Now:
- **Edit a status in Google Sheets** → Dashboard & Admin Dashboard reflect it automatically (on Refresh or within 30 seconds).
- **Edit a status / finalized count in Admin Dashboard & click Save** → Google Sheet & Dashboard both update immediately!

---

## 3. Netlify Environment Variables & Admin Login (.env)

The project includes serverless authentication powered by Netlify Environment Variables (`netlify/functions/auth-login.js`).

### Configuring Environment Variables

#### For Local Development
The project includes a `.env` file (and `.env.example` template):
```env
# Administrator Login Credentials (Used for secure Netlify Admin login)
ADMIN_USERNAME=************
ADMIN_PASSWORD=************123

# Standard User Login Credentials
USER_USERNAME=user
USER_PASSWORD=user123

# Google Sheets Configuration
GOOGLE_SHEET_ID=1IrHCi97oTceUR7Bi_k-IPVrrNOUaW6npVDreGI1slfE
GOOGLE_SHEET_NAME=COLONIES

# Google Apps Script Web App URL (optional, for live 2-way write-back)
GOOGLE_APPS_SCRIPT_URL=
```

Run locally with Netlify CLI:
```bash
npx netlify dev
```

#### For Netlify Production Deployment
1. Go to your site in [Netlify Dashboard](https://app.netlify.com).
2. Navigate to **Site configuration → Environment variables**.
3. Add the following variables:
   - `ADMIN_USERNAME`: Your custom Admin username (e.g. `admin` or your company username)
   - `ADMIN_PASSWORD`: Your secure Admin password
   - `USER_USERNAME`: Standard user viewer username (e.g. `user`)
   - `USER_PASSWORD`: Standard user password (e.g. `user123`)
   - `GOOGLE_SHEET_ID`: `1IrHCi97oTceUR7Bi_k-IPVrrNOUaW6npVDreGI1slfE`
   - `GOOGLE_SHEET_NAME`: `COLONIES`
   - `GOOGLE_APPS_SCRIPT_URL`: *(Your deployed Google Apps Script `/exec` URL)*
4. Trigger a new deploy. Any login attempt on the Netlify site will authenticate against these secure environment variables!

---

## Project Structure

```text
ghmc-colony-dashboard/
├── index.html                      # Complete Dashboard & Admin UI
├── styles.css                      # NeoGeo corporate theme matching reference designs
├── app.js                          # Analytics engine, live sync, inline Admin editor & auth
├── .env                            # Netlify environment variables (Admin credentials & config)
├── .env.example                    # Template for version control
├── netlify/
│   └── functions/
│       ├── auth-login.js           # Netlify serverless auth function using .env credentials
│       └── sheet-sync.js           # Zero-dependency Netlify Function (GET/POST Google Sheets)
├── google-apps-script/
│   └── Code.gs                     # Paste into Google Sheet Apps Script for 2-way write-back
├── netlify.toml                    # Netlify publish, functions & /api redirects
├── package.json                    # Project metadata & dev scripts
├── .gitignore
└── README.md
```
