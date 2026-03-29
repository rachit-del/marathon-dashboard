// ============================================================
// Marathon Dashboard - Google Apps Script Backend
// ============================================================
// Paste this code into Extensions > Apps Script in your Google Sheet.
// Deploy as: Web App > Execute as Me > Anyone can access.
// ============================================================

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// Simple auth tokens - share one with each runner privately
const TOKENS = {
  'Rachit': 'CHANGE_ME_rachit_token_2026',
  'PJ': 'CHANGE_ME_pj_token_2026'
};

// ---- HTTP Handlers ----

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const result = {};
    const tabs = ['Config', 'TrainingPlan', 'RunLog', 'Milestones'];

    tabs.forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (!sheet) return;
      const data = sheet.getDataRange().getValues();
      if (data.length < 1) { result[name] = []; return; }
      const headers = data[0];
      result[name] = data.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = row[i];
        });
        return obj;
      });
    });

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    // Handle both JSON body and form-submitted payload
    let data;
    if (e.parameter && e.parameter.payload) {
      data = JSON.parse(e.parameter.payload);
    } else {
      data = JSON.parse(e.postData.contents);
    }
    const runner = data.runner;
    const token = data.token;

    if (!TOKENS[runner] || TOKENS[runner] !== token) {
      return jsonResponse({ error: 'Unauthorized' });
    }

    switch (data.action) {
      case 'logRun':
        return logRun(data, runner);
      case 'markComplete':
        return markComplete(data, runner);
      case 'deleteRun':
        return deleteRun(data, runner);
      default:
        return jsonResponse({ error: 'Unknown action: ' + data.action });
    }
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ---- Actions ----

function logRun(data, runner) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('RunLog');
  const id = data.id || Utilities.getUuid();

  sheet.appendRow([
    id,
    runner,
    data.date,
    data.week || '',
    data.runType || '',
    data.distance || 0,
    data.duration || 0,
    data.pace || '',
    data.heartRate || '',
    data.effort || '',
    data.notes || '',
    true,
    new Date().toISOString()
  ]);

  // Auto-detect milestones
  checkMilestones(runner, data.distance, data.date);

  return jsonResponse({ success: true, id: id });
}

function markComplete(data, runner) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('RunLog');

  sheet.appendRow([
    Utilities.getUuid(),
    runner,
    data.date,
    data.week || '',
    data.runType || '',
    data.distance || 0,
    data.duration || 0,
    data.pace || '',
    '',
    '',
    data.notes || 'Marked complete',
    data.completed !== false,
    new Date().toISOString()
  ]);

  if (data.distance) {
    checkMilestones(runner, data.distance, data.date);
  }

  return jsonResponse({ success: true });
}

function deleteRun(data, runner) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('RunLog');
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id && rows[i][1] === runner) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ success: true });
    }
  }

  return jsonResponse({ error: 'Run not found' });
}

// ---- Milestone Detection ----

function checkMilestones(runner, distance, date) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const milestoneSheet = ss.getSheetByName('Milestones');
  const existing = milestoneSheet.getDataRange().getValues();
  const runnerMilestones = existing
    .filter(r => r[0] === runner)
    .map(r => r[1]);

  const distChecks = [
    { type: 'FIRST_5K', threshold: 5 },
    { type: 'FIRST_10K', threshold: 10 },
    { type: 'FIRST_HALF', threshold: 21.1 },
    { type: 'FIRST_30K', threshold: 30 },
    { type: 'MARATHON', threshold: 42.2 }
  ];

  distChecks.forEach(check => {
    if (distance >= check.threshold && !runnerMilestones.includes(check.type)) {
      milestoneSheet.appendRow([runner, check.type, date, distance, true]);
    }
  });

  // Check total distance milestones
  const runLog = ss.getSheetByName('RunLog').getDataRange().getValues();
  const totalDist = runLog
    .filter(r => r[1] === runner && r[11] === true)
    .reduce((sum, r) => sum + (Number(r[5]) || 0), 0);

  const totalChecks = [
    { type: 'TOTAL_100K', threshold: 100 },
    { type: 'TOTAL_500K', threshold: 500 },
    { type: 'TOTAL_1000K', threshold: 1000 }
  ];

  totalChecks.forEach(check => {
    if (totalDist >= check.threshold && !runnerMilestones.includes(check.type)) {
      milestoneSheet.appendRow([runner, check.type, date, totalDist, true]);
    }
  });

  // Update longest run
  const longestIdx = existing.findIndex(r => r[0] === runner && r[1] === 'LONGEST_RUN');
  if (longestIdx > 0) {
    const currentLongest = existing[longestIdx][3];
    if (distance > currentLongest) {
      milestoneSheet.getRange(longestIdx + 1, 3, 1, 3).setValues([[date, distance, true]]);
    }
  } else if (distance > 0) {
    milestoneSheet.appendRow([runner, 'LONGEST_RUN', date, distance, true]);
  }
}

// ---- Training Plan Generator ----
// Run this function ONCE from the Apps Script editor to populate the TrainingPlan tab.

function generateTrainingPlan() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('TrainingPlan');
  if (!sheet) {
    sheet = ss.insertSheet('TrainingPlan');
  }

  // Clear and set headers
  sheet.clear();
  sheet.appendRow(['Week', 'StartDate', 'Phase', 'Runner', 'Day', 'RunType', 'TargetDistance_km', 'TargetPace', 'Description', 'BiWeeklyGoal']);

  const startDate = new Date('2026-04-06'); // Monday of week 1
  const rows = [];

  // ---- PHASE 1: Individual Ramp-Up (Weeks 1-8) ----

  // Rachit: Couch to 5K
  const rachitPhase1 = [
    { week: 1, runs: [
      { day: 'Mon', type: 'Easy', dist: 3.2, pace: '8:00', desc: 'Run 1min / Walk 2min x 8' },
      { day: 'Wed', type: 'Easy', dist: 3.2, pace: '8:00', desc: 'Run 1min / Walk 2min x 8' },
      { day: 'Sat', type: 'Easy', dist: 3.2, pace: '8:00', desc: 'Run 1min / Walk 2min x 8' }
    ], goal: 'Complete all 3 walk/run sessions' },
    { week: 2, runs: [
      { day: 'Mon', type: 'Easy', dist: 3.5, pace: '7:45', desc: 'Run 1.5min / Walk 2min x 7' },
      { day: 'Wed', type: 'Easy', dist: 3.5, pace: '7:45', desc: 'Run 1.5min / Walk 2min x 7' },
      { day: 'Sat', type: 'Easy', dist: 3.5, pace: '7:45', desc: 'Run 1.5min / Walk 2min x 7' }
    ], goal: 'Complete all 3 walk/run sessions' },
    { week: 3, runs: [
      { day: 'Mon', type: 'Easy', dist: 4.0, pace: '7:30', desc: 'Run 2min / Walk 1.5min x 7' },
      { day: 'Wed', type: 'Easy', dist: 4.0, pace: '7:30', desc: 'Run 2min / Walk 1.5min x 7' },
      { day: 'Sat', type: 'Easy', dist: 4.0, pace: '7:30', desc: 'Run 2min / Walk 1.5min x 7' }
    ], goal: 'Run 2 minutes continuously' },
    { week: 4, runs: [
      { day: 'Mon', type: 'Easy', dist: 4.0, pace: '7:15', desc: 'Run 3min / Walk 1min x 6' },
      { day: 'Wed', type: 'Easy', dist: 4.0, pace: '7:15', desc: 'Run 3min / Walk 1min x 6' },
      { day: 'Sat', type: 'Easy', dist: 4.0, pace: '7:15', desc: 'Run 3min / Walk 1min x 6' }
    ], goal: 'Run 3 minutes continuously' },
    { week: 5, runs: [
      { day: 'Mon', type: 'Easy', dist: 4.5, pace: '7:00', desc: 'Run 5min / Walk 1min x 4' },
      { day: 'Wed', type: 'Easy', dist: 4.5, pace: '7:00', desc: 'Run 5min / Walk 1min x 4' },
      { day: 'Sat', type: 'Easy', dist: 4.5, pace: '7:00', desc: 'Run 5min / Walk 1min x 4' }
    ], goal: 'Run 5 minutes continuously' },
    { week: 6, runs: [
      { day: 'Mon', type: 'Easy', dist: 5.0, pace: '6:45', desc: 'Run 8min / Walk 1min x 3' },
      { day: 'Wed', type: 'Easy', dist: 5.0, pace: '6:45', desc: 'Run 8min / Walk 1min x 3' },
      { day: 'Sat', type: 'Easy', dist: 5.0, pace: '6:45', desc: 'Run 8min / Walk 1min x 3' }
    ], goal: 'Run 8 minutes continuously' },
    { week: 7, runs: [
      { day: 'Mon', type: 'Easy', dist: 5.0, pace: '6:30', desc: 'Run 10min / Walk 1min x 2, then run 5min' },
      { day: 'Wed', type: 'Easy', dist: 4.0, pace: '6:45', desc: 'Easy run 4km' },
      { day: 'Sat', type: 'LongRun', dist: 5.5, pace: '6:45', desc: 'Long run 5.5km with short walk breaks if needed' }
    ], goal: 'Run 10 minutes continuously' },
    { week: 8, runs: [
      { day: 'Mon', type: 'Easy', dist: 4.5, pace: '6:30', desc: 'Run 25 minutes continuous' },
      { day: 'Wed', type: 'Easy', dist: 4.0, pace: '6:45', desc: 'Easy run 4km' },
      { day: 'Sat', type: 'LongRun', dist: 5.0, pace: '6:30', desc: 'GOAL: First 5K without stopping!' }
    ], goal: 'Run 5K without stopping' }
  ];

  // PJ: Base building from 10K
  const pjPhase1 = [
    { week: 1, runs: [
      { day: 'Tue', type: 'Easy', dist: 6, pace: '5:45', desc: 'Easy run' },
      { day: 'Thu', type: 'Easy', dist: 5, pace: '5:45', desc: 'Easy run' },
      { day: 'Sat', type: 'LongRun', dist: 10, pace: '6:00', desc: 'Long run' }
    ], goal: 'Consistent 3-4x per week' },
    { week: 2, runs: [
      { day: 'Tue', type: 'Easy', dist: 6, pace: '5:45', desc: 'Easy run' },
      { day: 'Thu', type: 'Tempo', dist: 5, pace: '5:15', desc: 'Tempo run' },
      { day: 'Sat', type: 'LongRun', dist: 11, pace: '6:00', desc: 'Long run' },
      { day: 'Sun', type: 'Easy', dist: 5, pace: '6:00', desc: 'Recovery run' }
    ], goal: 'Consistent 3-4x per week' },
    { week: 3, runs: [
      { day: 'Tue', type: 'Easy', dist: 7, pace: '5:45', desc: 'Easy run' },
      { day: 'Thu', type: 'Tempo', dist: 6, pace: '5:15', desc: 'Tempo run' },
      { day: 'Sat', type: 'LongRun', dist: 12, pace: '6:00', desc: 'Long run' },
      { day: 'Sun', type: 'Easy', dist: 5, pace: '6:00', desc: 'Recovery run' }
    ], goal: 'First 30km week' },
    { week: 4, runs: [
      { day: 'Tue', type: 'Easy', dist: 7, pace: '5:45', desc: 'Easy run' },
      { day: 'Thu', type: 'Intervals', dist: 5, pace: '4:45', desc: '6x800m intervals with 400m jog recovery' },
      { day: 'Sat', type: 'LongRun', dist: 13, pace: '6:00', desc: 'Long run' },
      { day: 'Sun', type: 'Easy', dist: 5, pace: '6:00', desc: 'Recovery run' }
    ], goal: 'First 30km week' },
    { week: 5, runs: [
      { day: 'Tue', type: 'Easy', dist: 7, pace: '5:45', desc: 'Easy run' },
      { day: 'Thu', type: 'Tempo', dist: 6, pace: '5:10', desc: 'Tempo run' },
      { day: 'Sat', type: 'LongRun', dist: 14, pace: '6:00', desc: 'Long run' },
      { day: 'Sun', type: 'Easy', dist: 6, pace: '6:00', desc: 'Recovery run' }
    ], goal: 'Build to 15km long run' },
    { week: 6, runs: [
      { day: 'Tue', type: 'Easy', dist: 8, pace: '5:45', desc: 'Easy run' },
      { day: 'Thu', type: 'Intervals', dist: 6, pace: '4:45', desc: '8x800m intervals' },
      { day: 'Sat', type: 'LongRun', dist: 15, pace: '6:00', desc: 'Long run - first 15K!' },
      { day: 'Sun', type: 'Easy', dist: 6, pace: '6:00', desc: 'Recovery run' }
    ], goal: 'Build to 15km long run' },
    { week: 7, runs: [
      { day: 'Tue', type: 'Easy', dist: 8, pace: '5:45', desc: 'Easy run' },
      { day: 'Thu', type: 'Tempo', dist: 7, pace: '5:10', desc: 'Tempo run' },
      { day: 'Sat', type: 'LongRun', dist: 16, pace: '6:00', desc: 'Long run' },
      { day: 'Sun', type: 'Easy', dist: 6, pace: '6:00', desc: 'Recovery run' }
    ], goal: 'Long run reaches 18km' },
    { week: 8, runs: [
      { day: 'Tue', type: 'Easy', dist: 8, pace: '5:45', desc: 'Easy run' },
      { day: 'Thu', type: 'Intervals', dist: 6, pace: '4:45', desc: '8x800m intervals' },
      { day: 'Sat', type: 'LongRun', dist: 18, pace: '6:00', desc: 'Long run - first 18K!' },
      { day: 'Sun', type: 'Easy', dist: 6, pace: '6:00', desc: 'Recovery run' }
    ], goal: 'Long run reaches 18km' }
  ];

  // Generate Phase 1 rows
  rachitPhase1.forEach(w => {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + (w.week - 1) * 7);
    w.runs.forEach(r => {
      rows.push([w.week, formatDate(weekStart), 'RAMP_RACHIT', 'Rachit', r.day, r.type, r.dist, r.pace, r.desc, w.goal]);
    });
  });

  pjPhase1.forEach(w => {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + (w.week - 1) * 7);
    w.runs.forEach(r => {
      rows.push([w.week, formatDate(weekStart), 'RAMP_PJ', 'PJ', r.day, r.type, r.dist, r.pace, r.desc, w.goal]);
    });
  });

  // ---- PHASE 2: Convergence & Base (Weeks 9-20) ----
  const phase2 = [
    { weeks: [9, 10], goal: 'Run 3x this week, one run 7km+', phase: 'BASE',
      rachit: [
        { day: 'Mon', type: 'Easy', dist: 5, pace: '6:30', desc: 'Easy run' },
        { day: 'Wed', type: 'Easy', dist: 5, pace: '6:30', desc: 'Easy run' },
        { day: 'Sat', type: 'LongRun', dist: 7, pace: '6:45', desc: 'Long run 7km' }
      ],
      pj: [
        { day: 'Tue', type: 'Easy', dist: 8, pace: '5:45', desc: 'Easy run' },
        { day: 'Thu', type: 'Tempo', dist: 7, pace: '5:10', desc: 'Tempo run' },
        { day: 'Sat', type: 'LongRun', dist: 16, pace: '6:00', desc: 'Long run' },
        { day: 'Sun', type: 'Easy', dist: 6, pace: '6:00', desc: 'Recovery run' }
      ]
    },
    { weeks: [11, 12], goal: 'Complete a 10K distance run', phase: 'BASE',
      rachit: [
        { day: 'Mon', type: 'Easy', dist: 5, pace: '6:30', desc: 'Easy run' },
        { day: 'Wed', type: 'Easy', dist: 6, pace: '6:30', desc: 'Easy run' },
        { day: 'Fri', type: 'Easy', dist: 4, pace: '6:30', desc: 'Easy short run' },
        { day: 'Sat', type: 'LongRun', dist: 10, pace: '6:45', desc: 'GOAL: First 10K!' }
      ],
      pj: [
        { day: 'Tue', type: 'Easy', dist: 8, pace: '5:45', desc: 'Easy run' },
        { day: 'Thu', type: 'Intervals', dist: 7, pace: '4:45', desc: 'Interval session' },
        { day: 'Sat', type: 'LongRun', dist: 18, pace: '6:00', desc: 'Long run' },
        { day: 'Sun', type: 'Easy', dist: 6, pace: '6:00', desc: 'Recovery run' }
      ]
    },
    { weeks: [13, 14], goal: 'Run 4 times in one week', phase: 'BASE',
      rachit: [
        { day: 'Mon', type: 'Easy', dist: 6, pace: '6:30', desc: 'Easy run' },
        { day: 'Wed', type: 'Tempo', dist: 5, pace: '6:00', desc: 'Tempo run' },
        { day: 'Fri', type: 'Easy', dist: 5, pace: '6:30', desc: 'Easy run' },
        { day: 'Sat', type: 'LongRun', dist: 11, pace: '6:45', desc: 'Long run' }
      ],
      pj: [
        { day: 'Tue', type: 'Easy', dist: 9, pace: '5:45', desc: 'Easy run' },
        { day: 'Thu', type: 'Tempo', dist: 8, pace: '5:10', desc: 'Tempo run' },
        { day: 'Sat', type: 'LongRun', dist: 19, pace: '6:00', desc: 'Long run' },
        { day: 'Sun', type: 'Easy', dist: 6, pace: '6:00', desc: 'Recovery run' }
      ]
    },
    { weeks: [15, 16], goal: 'Hit 30km+ in a week', phase: 'BASE',
      rachit: [
        { day: 'Mon', type: 'Easy', dist: 6, pace: '6:15', desc: 'Easy run' },
        { day: 'Wed', type: 'Tempo', dist: 6, pace: '5:50', desc: 'Tempo run' },
        { day: 'Fri', type: 'Easy', dist: 5, pace: '6:30', desc: 'Easy run' },
        { day: 'Sat', type: 'LongRun', dist: 13, pace: '6:30', desc: 'Long run' }
      ],
      pj: [
        { day: 'Tue', type: 'Easy', dist: 9, pace: '5:40', desc: 'Easy run' },
        { day: 'Thu', type: 'Intervals', dist: 8, pace: '4:40', desc: 'Interval session' },
        { day: 'Sat', type: 'LongRun', dist: 20, pace: '5:55', desc: 'Long run 20K' },
        { day: 'Sun', type: 'Easy', dist: 7, pace: '6:00', desc: 'Recovery run' }
      ]
    },
    { weeks: [17, 18], goal: 'Complete a 15K run', phase: 'BASE',
      rachit: [
        { day: 'Mon', type: 'Easy', dist: 7, pace: '6:15', desc: 'Easy run' },
        { day: 'Wed', type: 'Tempo', dist: 6, pace: '5:45', desc: 'Tempo run' },
        { day: 'Fri', type: 'Easy', dist: 6, pace: '6:30', desc: 'Easy run' },
        { day: 'Sat', type: 'LongRun', dist: 15, pace: '6:30', desc: 'GOAL: First 15K!' }
      ],
      pj: [
        { day: 'Tue', type: 'Easy', dist: 10, pace: '5:40', desc: 'Easy run' },
        { day: 'Thu', type: 'Tempo', dist: 8, pace: '5:05', desc: 'Tempo run' },
        { day: 'Sat', type: 'LongRun', dist: 22, pace: '5:55', desc: 'Long run 22K' },
        { day: 'Sun', type: 'Easy', dist: 7, pace: '6:00', desc: 'Recovery run' }
      ]
    },
    { weeks: [19, 20], goal: 'Tempo session under 5:30/km for 3km', phase: 'BASE',
      rachit: [
        { day: 'Mon', type: 'Easy', dist: 7, pace: '6:15', desc: 'Easy run' },
        { day: 'Wed', type: 'Tempo', dist: 7, pace: '5:30', desc: 'Tempo: 3km at sub-5:30 pace' },
        { day: 'Fri', type: 'Easy', dist: 6, pace: '6:30', desc: 'Easy run' },
        { day: 'Sat', type: 'LongRun', dist: 16, pace: '6:30', desc: 'Long run 16K' }
      ],
      pj: [
        { day: 'Tue', type: 'Easy', dist: 10, pace: '5:40', desc: 'Easy run' },
        { day: 'Thu', type: 'Tempo', dist: 9, pace: '5:00', desc: 'Tempo run' },
        { day: 'Sat', type: 'LongRun', dist: 24, pace: '5:55', desc: 'Long run 24K' },
        { day: 'Sun', type: 'Easy', dist: 7, pace: '6:00', desc: 'Recovery run' }
      ]
    }
  ];

  phase2.forEach(block => {
    block.weeks.forEach(weekNum => {
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7);
      block.rachit.forEach(r => {
        rows.push([weekNum, formatDate(weekStart), block.phase, 'Rachit', r.day, r.type, r.dist, r.pace, r.desc, block.goal]);
      });
      block.pj.forEach(r => {
        rows.push([weekNum, formatDate(weekStart), block.phase, 'PJ', r.day, r.type, r.dist, r.pace, r.desc, block.goal]);
      });
    });
  });

  // ---- PHASE 3: Build (Weeks 21-36) ----
  const phase3 = [
    { weeks: [21, 22], goal: 'Complete half marathon distance (21.1km)', phase: 'BUILD', longRun: 21, weeklyBase: 45 },
    { weeks: [23, 24], goal: 'Run 50km in one week', phase: 'BUILD', longRun: 24, weeklyBase: 50 },
    { weeks: [25, 26], goal: 'Marathon pace tempo for 8km', phase: 'BUILD', longRun: 26, weeklyBase: 52 },
    { weeks: [27, 28], goal: 'Long run 26km+', phase: 'BUILD', longRun: 28, weeklyBase: 55 },
    { weeks: [29, 30], goal: 'Run 55km in one week', phase: 'BUILD', longRun: 29, weeklyBase: 57 },
    { weeks: [31, 32], goal: 'Complete 30km long run', phase: 'BUILD', longRun: 30, weeklyBase: 60 },
    { weeks: [33, 34], goal: 'Peak: 65km week with MP long run', phase: 'BUILD', longRun: 32, weeklyBase: 63 },
    { weeks: [35, 36], goal: 'Second 30km+ run with race-day fueling', phase: 'BUILD', longRun: 32, weeklyBase: 60 }
  ];

  phase3.forEach(block => {
    block.weeks.forEach(weekNum => {
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7);
      const base = block.weeklyBase;
      const easyDist = Math.round((base - block.longRun) / 3 * 10) / 10;
      const tempoDist = Math.round(easyDist * 0.8 * 10) / 10;

      const runs = [
        { day: 'Tue', type: 'Easy', dist: easyDist, pace: '5:45', desc: 'Easy run' },
        { day: 'Wed', type: 'Tempo', dist: tempoDist, pace: '5:10', desc: 'Tempo / marathon pace work' },
        { day: 'Fri', type: 'Easy', dist: easyDist, pace: '5:45', desc: 'Easy run' },
        { day: 'Sat', type: 'LongRun', dist: block.longRun, pace: '6:00', desc: 'Long run ' + block.longRun + 'km' }
      ];

      ['Rachit', 'PJ'].forEach(runner => {
        runs.forEach(r => {
          rows.push([weekNum, formatDate(weekStart), block.phase, runner, r.day, r.type, r.dist, r.pace, r.desc, block.goal]);
        });
      });
    });
  });

  // ---- PHASE 4: Peak & Taper (Weeks 37-52) ----
  const phase4 = [
    { weeks: [37, 38], goal: 'Peak mileage: 70km week', phase: 'PEAK', longRun: 34, weeklyBase: 68 },
    { weeks: [39, 40], goal: '15km at marathon pace in long run', phase: 'PEAK', longRun: 30, weeklyBase: 63 },
    { weeks: [41, 42], goal: 'Final 30km+ long run, nail nutrition', phase: 'PEAK', longRun: 32, weeklyBase: 62 },
    { weeks: [43, 44], goal: 'Taper begins: 50km week', phase: 'TAPER', longRun: 25, weeklyBase: 52 },
    { weeks: [45, 46], goal: 'Taper: 40km week, feel fresh', phase: 'TAPER', longRun: 20, weeklyBase: 42 },
    { weeks: [47, 48], goal: 'Light taper: 30km week, all easy', phase: 'TAPER', longRun: 16, weeklyBase: 32 },
    { weeks: [49, 50], goal: 'Race week prep: shakeout runs only', phase: 'TAPER', longRun: 10, weeklyBase: 22 },
    { weeks: [51, 52], goal: 'RACE WEEK - London Marathon!', phase: 'RACE', longRun: 42.2, weeklyBase: 15 }
  ];

  phase4.forEach(block => {
    block.weeks.forEach(weekNum => {
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + (weekNum - 1) * 7);
      const base = block.weeklyBase;

      let runs;
      if (block.phase === 'RACE' && weekNum === 52) {
        runs = [
          { day: 'Mon', type: 'Rest', dist: 0, pace: '', desc: 'Rest' },
          { day: 'Wed', type: 'Easy', dist: 3, pace: '6:00', desc: 'Shakeout run' },
          { day: 'Sun', type: 'LongRun', dist: 42.2, pace: '5:40', desc: 'LONDON MARATHON - RACE DAY!' }
        ];
      } else {
        const easyDist = Math.round((base - block.longRun) / 3 * 10) / 10;
        const tempoDist = block.phase === 'TAPER' ? easyDist : Math.round(easyDist * 0.8 * 10) / 10;
        const tempoType = block.phase === 'TAPER' ? 'Easy' : 'Tempo';
        runs = [
          { day: 'Tue', type: 'Easy', dist: easyDist, pace: '5:45', desc: 'Easy run' },
          { day: 'Wed', type: tempoType, dist: tempoDist, pace: '5:15', desc: block.phase === 'TAPER' ? 'Easy run' : 'Tempo work' },
          { day: 'Fri', type: 'Easy', dist: easyDist, pace: '5:45', desc: 'Easy run' },
          { day: 'Sat', type: 'LongRun', dist: block.longRun, pace: '6:00', desc: 'Long run ' + block.longRun + 'km' }
        ];
      }

      ['Rachit', 'PJ'].forEach(runner => {
        runs.forEach(r => {
          rows.push([weekNum, formatDate(weekStart), block.phase, runner, r.day, r.type, r.dist, r.pace, r.desc, block.goal]);
        });
      });
    });
  });

  // Write all rows at once
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 10).setValues(rows);
  }

  // Format the sheet
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 10);

  Logger.log('Training plan generated: ' + rows.length + ' rows');
  return rows.length;
}

// ---- Sheet Setup ----
// Run this function ONCE to create all tabs with headers.

function setupSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // Config tab
  let config = ss.getSheetByName('Config');
  if (!config) config = ss.insertSheet('Config');
  config.clear();
  config.appendRow(['Key', 'Value']);
  config.appendRow(['race_name', 'London Marathon']);
  config.appendRow(['race_date', '2027-04-25']);
  config.appendRow(['runner_1_name', 'Rachit']);
  config.appendRow(['runner_2_name', 'PJ']);
  config.appendRow(['plan_start_date', '2026-04-06']);

  // RunLog tab
  let runLog = ss.getSheetByName('RunLog');
  if (!runLog) runLog = ss.insertSheet('RunLog');
  runLog.clear();
  runLog.appendRow(['ID', 'Runner', 'Date', 'Week', 'PlannedRunType', 'ActualDistance_km', 'ActualDuration_min', 'AvgPace', 'HeartRateAvg', 'Effort', 'Notes', 'Completed', 'Timestamp']);

  // Milestones tab
  let milestones = ss.getSheetByName('Milestones');
  if (!milestones) milestones = ss.insertSheet('Milestones');
  milestones.clear();
  milestones.appendRow(['Runner', 'MilestoneType', 'DateAchieved', 'Value', 'AutoDetected']);

  Logger.log('Sheet setup complete. Now run generateTrainingPlan().');
}

// ---- Utility ----

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
