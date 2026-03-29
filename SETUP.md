# Marathon Dashboard - Setup Guide

## Quick Start (Demo Mode)

1. Open `marathon-dashboard.html` in your browser
2. Leave all config fields blank
3. Click your name (Rachit or PJ)
4. The dashboard loads with demo data - explore all 7 pages!

---

## Full Setup (with Google Sheets sync)

### Step 1: Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it **"Marathon Dashboard 2026-27"**
3. Note the **Sheet ID** from the URL: `https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit`

### Step 2: Set Up Apps Script

1. In your Google Sheet, go to **Extensions > Apps Script**
2. Delete any existing code in `Code.gs`
3. Copy-paste the entire contents of `apps-script.js` from this folder
4. **Important:** Update the tokens in the `TOKENS` object:
   ```javascript
   const TOKENS = {
     'Rachit': 'your_secret_token_for_rachit',
     'PJ': 'your_secret_token_for_pj'
   };
   ```
   Generate random tokens (e.g., use a password generator) and share each runner's token with them privately.

5. **Run the setup functions** (in this order):
   - Click the function dropdown (top toolbar), select `setupSheet`, click Run
   - Grant permissions when prompted (the script needs access to edit the spreadsheet)
   - Then select `generateTrainingPlan` and click Run
   - This creates all tabs and populates the 56-week training plan (~400 rows)

6. **Deploy as Web App:**
   - Click **Deploy > New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click Deploy
   - Copy the **Web app URL** (looks like `https://script.google.com/macros/s/.../exec`)

### Step 3: Share with Your Partner

Send your running partner:
- The `marathon-dashboard.html` file (via email, shared drive, etc.)
- The **Google Sheet ID**
- The **Apps Script Web App URL**
- Their **personal auth token**

### Step 4: First Launch

1. Open `marathon-dashboard.html` in your browser
2. Paste the **Sheet ID**, **Web App URL**, and your **token**
3. Click your name
4. The dashboard syncs and you're ready to go!

---

## Daily Usage

### Logging a Run
- Click **"Log Today's Run"** on the Home page
- Or click any day card in the Training Plan to pre-fill the run type and distance
- Or click a day in the Calendar view
- Fill in your actual distance, duration, and optional heart rate / effort / notes
- Click Save - the run is saved locally and synced to Google Sheets

### Marking Rest Days
- Click **"Mark Rest Day"** on the Home page

### Viewing Partner's Progress
- **Home page:** Sparkline charts show both runners' recent mileage
- **Training Plan:** Toggle "Compare Both" to see side-by-side plans
- **Run Log:** Click "Partner's Runs" to see their logged runs
- **Calendar:** Both runners' dots appear on each day
- **Mileage Chart:** Both lines always visible

### Refreshing Data
- Click the 🔄 button in the top bar to pull latest data from Google Sheets
- The green dot indicates connection status (red = last sync failed)

---

## How Sync Works

```
┌─────────────┐     GET (read)      ┌──────────────┐
│  Dashboard   │ ◄─────────────────► │  Apps Script  │
│  (HTML file) │ ────────────────►   │  (Web App)    │
│  in browser  │     POST (write)    │               │
└─────────────┘                      └───────┬───────┘
                                             │
                                     ┌───────▼───────┐
                                     │ Google Sheet   │
                                     │ (shared data)  │
                                     └────────────────┘
```

- **Reads:** Dashboard fetches all data from the Apps Script web app (GET request)
- **Writes:** When you log a run, it POSTs to the Apps Script, which appends a row to the RunLog tab
- **Auth:** Each runner has a unique token. You can only write your own data.
- **Offline:** Runs are saved to localStorage immediately. If the sync fails, data persists locally.
- **No conflicts:** Each runner only writes their own rows. Append-only design means no overwrites.

---

## Updating Without a Hosted Site

Since the dashboard is a single HTML file:

1. **Just open it locally** - double-click the file or drag it into your browser
2. **Bookmark it** for quick access: `file:///path/to/marathon-dashboard.html`
3. **Share updates** by sending the updated HTML file (or keep it in a shared Google Drive / Dropbox folder)
4. **All data lives in Google Sheets** - the HTML file has no data in it, just the UI
5. If you ever want to host it: push to a GitHub repo and enable GitHub Pages (free, takes 2 minutes)

---

## Troubleshooting

**Dashboard shows "stale" (red dot)**
- Check your internet connection
- Verify the Apps Script Web App URL is correct
- Make sure the Apps Script is deployed and accessible

**"Unauthorized" error when logging a run**
- Check your token matches what's in the Apps Script `TOKENS` object
- Make sure your runner name matches exactly ("Rachit" or "PJ")

**Training plan is empty**
- Run the `generateTrainingPlan()` function in Apps Script
- Then refresh the dashboard

**Want to adjust the training plan?**
- Edit the TrainingPlan tab directly in Google Sheets
- Or modify the `generateTrainingPlan()` function and re-run it

**Changing runner name or token**
- Open browser developer console (F12)
- Run: `localStorage.clear()`
- Refresh the page - the setup screen will appear again

---

## Training Plan Overview

| Phase | Weeks | Focus |
|-------|-------|-------|
| Ramp-Up | 1-8 | Rachit: Couch to 5K / PJ: Base building from 10K |
| Base | 9-20 | Same bi-weekly goals, building to 15K long runs |
| Build | 21-36 | Half marathon, then building to 30K+ long runs |
| Peak | 37-42 | Peak mileage (65-70km weeks) |
| Taper | 43-50 | Gradual reduction, stay sharp |
| Race | 51-52 | London Marathon - April 27, 2027! |
