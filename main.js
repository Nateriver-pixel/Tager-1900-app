// ============================================================================
// 英単語ターゲット1900 Ultimate v9.0 - main.js
// ============================================================================

const firebaseConfig = {
  apiKey: "AIzaSyC76r8B4GursnhtJIQX-VciTAGhrmBPZA0",
  authDomain: "target1900-app-150dc.firebaseapp.com",
  projectId: "target1900-app-150dc",
  storageBucket: "target1900-app-150dc.firebasestorage.app",
};

let auth = null;
let db = null;
let currentUser = null;

try {
  if (typeof firebase !== "undefined") {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
  }
} catch (e) {
  console.warn("Firebase初期化スキップ:", e);
}

const STORAGE_KEY = "target1900_ultimate_v9_state";
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_MISTAKE_WINDOW_MS = 7 * DAY_MS;

const RANK_TIERS = [
  {
    id: "beginner",
    name: "ビギナー",
    min: 0,
    max: 3000,
    classes: 5,
    stepLabel: "600pt刻み",
    rangeText: "0 〜 2,999 pt",
    pillCls: "bg-white text-slate-900",
    desc: "基礎の土台作り。まずは毎日アプリを開く習慣をつけ、基礎単語を確実に固めよう。",
  },
  {
    id: "super",
    name: "スーパー",
    min: 3000,
    max: 10000,
    classes: 5,
    stepLabel: "1,400pt刻み",
    rangeText: "3,000 〜 9,999 pt",
    pillCls: "bg-emerald-950/90 border border-emerald-500/50 text-emerald-400",
    desc: "定着の初期段階。意味を見た瞬間に頭に浮かぶ3秒反射スピードを意識し始めよう。",
  },
  {
    id: "hyper",
    name: "ハイパー",
    min: 10000,
    max: 25000,
    classes: 5,
    stepLabel: "3,000pt刻み",
    rangeText: "10,000 〜 24,999 pt",
    pillCls: "bg-sky-950/90 border border-sky-500/50 text-sky-400",
    desc: "中堅へのステップ。忘却曲線（SRS）を活用し、記憶の定着率を高めるゾーン。",
  },
  {
    id: "elite",
    name: "エリート",
    min: 25000,
    max: 50000,
    classes: 5,
    stepLabel: "5,000pt刻み",
    rangeText: "25,000 〜 49,999 pt",
    pillCls: "bg-indigo-950/90 border border-indigo-500/50 text-indigo-400",
    desc: "本格的な実力者ゾーン。長文読解でも迷わない語彙力を手に入れ、模試の点数に繋げる。",
  },
  {
    id: "expert",
    name: "エキスパート",
    min: 50000,
    max: 100000,
    classes: 5,
    stepLabel: "10,000pt刻み",
    rangeText: "50,000 〜 99,999 pt",
    pillCls: "bg-rose-950/90 border border-rose-500/50 text-rose-400",
    desc: "上級者の壁。派生語や抽象語も網羅し、あらゆる入試問題に対応できる反射神経を養う。",
  },
  {
    id: "master",
    name: "マスター",
    min: 100000,
    max: 220000,
    classes: 5,
    stepLabel: "24,000pt刻み",
    rangeText: "100,000 〜 219,999 pt",
    pillCls: "bg-purple-950/90 border border-purple-500/50 text-purple-300",
    desc: "難関大合格水準の関門。No.1〜1500の全範囲をノーミス・3秒以内で叩き出す最終調整エリア。",
  },
  {
    id: "legend",
    name: "レジェンド",
    min: 220000,
    max: 400000,
    classes: 5,
    stepLabel: "36,000pt刻み",
    rangeText: "220,000 〜 399,999 pt",
    pillCls: "bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950",
    desc: "頂点目前の領域。すべての単語が脳に焼き付いた証。入試本番で英語を武器にする最強の称号。",
  },
  {
    id: "mythic",
    name: "ミシック",
    min: 400000,
    max: Infinity,
    classes: 1,
    stepLabel: "最高位到達",
    rangeText: "400,000 pt 以上",
    pillCls: "bg-gradient-to-r from-rose-500 via-fuchsia-500 to-amber-400 text-white",
    desc: "伝説を超えた最高到達点。圧倒的演習量と神速の反射神経を極めた者のみが辿り着く頂。",
  },
];

const DIFFICULTIES = {
  basic: { id: "basic", label: "基礎", time: 10, mult: 1.0, desc: "制限時間10秒・ポイント1.0倍（標準出題）" },
  applied: { id: "applied", label: "応用", time: 5, mult: 1.5, desc: "制限時間5秒・ポイント1.5倍（標準出題）" },
  advanced: { id: "advanced", label: "発展", time: 2, mult: 1.8, desc: "制限時間2秒・ポイント1.8倍（標準出題）" },
  tenfu: { id: "tenfu", label: "天賦", time: 2, mult: 2.4, desc: "制限時間2秒・ポイント2.4倍（7文字以上の長単語を優先出題）" },
  kiwami: { id: "kiwami", label: "極", time: 2, mult: 3.2, desc: "制限時間2秒・ポイント3.2倍（8文字以上の長単語のみ限定出題）" },
};

let appState = {
  totalScore: 0,
  carriedCombo: 0,
  seasonKey: "",
  weeklyKey: "",
  weeklyScore: 0,
  weeklyLearnedCount: 0,
  totalLearnedCount: 0,
  dailyKey: "",
  dailyCount: 0,
  dailyQuota: 30,
  streakDays: 1,
  lastStudyDate: "",
  saPersonalBest: 0,
  nickname: "",
  darkMode: true,
  soundEnabled: true,
  showKana: false,
  deviceViewMode: "auto",
  statsDisplayMode: "mastery",
  srsIntervals: [1, 3, 7, 14, 30],
  wordStats: {},
  coveredMap: {},
};

let quizConfig = {
  direction: "en_ja",
  order: "random",
  mode: "choice",
  posFilter: "all",
  rangeStart: 1,
  rangeEnd: 1500,
  count: 10,
  difficulty: "basic",
};

let reviewConfig = {
  filter: "all_weak",
  order: "priority",
  mode: "choice",
  rangeStart: 1,
  rangeEnd: 1500,
  count: 20,
  difficulty: "basic",
};

let session = {
  active: false,
  type: "normal",
  activeDirection: "en_ja",
  activeMode: "choice",
  activeDifficulty: "basic",
  questions: [],
  currentIndex: 0,
  score: 0,
  correctCount: 0,
  combo: 0,
  maxCombo: 0,
  sessionMistakes: [],
  answeredMap: {},
  isPaused: false,
  questionStartTime: 0,
  questionTimeLimit: 10,
  questionRemainingSec: 10,
  autoNextRemainingMs: 0,
  autoNextTargetTime: 0,
  saRemainingSec: 60,
  currentRankingTab: "all",
  refFilter: "all",
};

let timers = {
  questionInterval: null,
  saInterval: null,
  autoNextTimeout: null,
  autoNextCountdownInterval: null,
};

let sharedAudioCtx = null;

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  checkPeriodicResets();
  applyTheme();
  applySoundUI();
  applyKanaToggleUI();
  applyDeviceViewUI();
  renderDifficultyButtons();
  updateDashboardUI();
  updateOrderUI();
  updateReviewTargetPreview();
  initFirebaseAuthListener();
  setupKeyboardShortcuts();
});

function getAllWords() {
  if (typeof wordsDataSet !== "undefined" && Array.isArray(wordsDataSet)) {
    return wordsDataSet;
  }
  if (typeof words !== "undefined" && Array.isArray(words)) {
    return words;
  }
  return [];
}

function getWordStat(no) {
  if (!appState.wordStats[no]) {
    appState.wordStats[no] = {
      correct: 0,
      wrong: 0,
      streak: 0,
      mastered: false,
      lastMistakeAt: 0,
      nextReviewAt: 0,
      bookmarked: false,
    };
  }
  return appState.wordStats[no];
}

function computeTotalAnswersFromStats(wordStatsObj) {
  if (!wordStatsObj) return 0;
  let sum = 0;
  for (const st of Object.values(wordStatsObj)) {
    sum += (st.correct || 0) + (st.wrong || 0);
  }
  return sum;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      appState = { ...appState, ...parsed };
      if (!appState.wordStats) appState.wordStats = {};
      if (!appState.coveredMap) appState.coveredMap = {};
      if (!Array.isArray(appState.srsIntervals)) appState.srsIntervals = [1, 3, 7];
      const statsSum = computeTotalAnswersFromStats(appState.wordStats);
      appState.totalLearnedCount = Math.max(appState.totalLearnedCount || 0, statsSum);
    }
  } catch (e) {
    console.warn("読み込みエラー:", e);
  }
}

let cloudSyncTimer = null;

function saveState(syncCloud = true) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.warn("保存エラー:", e);
  }
  if (syncCloud && currentUser && db) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => {
      syncToFirestore().catch(() => {});
    }, 1500);
  }
}

// ページを閉じる・別アプリへ切り替える直前に未送信分を即同期
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && cloudSyncTimer && currentUser && db) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
    syncToFirestore().catch(() => {});
  }
});

// 別タブでの更新を即座にメモリへ反映
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY && e.newValue) {
    loadState();
    updateDashboardUI();
  }
});

function getTodayDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getSeasonInfo(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  let startYear = year;
  let startMonth = month % 2 === 0 ? month : month - 1;
  if (startMonth === 0) {
    startMonth = 12;
    startYear = year - 1;
  }
  let endYear = startYear;
  let endMonth = startMonth + 2;
  if (endMonth > 12) {
    endMonth -= 12;
    endYear += 1;
  }
  const seasonEnd = new Date(endYear, endMonth - 1, 1, 0, 0, 0, 0);
  const daysLeft = Math.ceil(Math.max(0, seasonEnd.getTime() - now.getTime()) / DAY_MS);
  return { seasonKey: `${startYear}-${String(startMonth).padStart(2, "0")}`, daysLeft };
}

function getMondayWeekKey(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return getTodayDateKey(d);
}

function checkPeriodicResets() {
  const { seasonKey } = getSeasonInfo();
  const weekKey = getMondayWeekKey();
  const todayKey = getTodayDateKey();
  let changed = false;

  if (appState.seasonKey !== seasonKey) {
    if (appState.seasonKey !== "") {
      appState.totalScore = 0;
      appState.carriedCombo = 0;
    }
    appState.seasonKey = seasonKey;
    changed = true;
  }

  if (appState.weeklyKey !== weekKey) {
    appState.weeklyKey = weekKey;
    appState.weeklyScore = 0;
    appState.weeklyLearnedCount = 0;
    changed = true;
  }

  if (appState.dailyKey !== todayKey) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getTodayDateKey(yesterday);
    if (appState.lastStudyDate !== yesterdayKey && appState.lastStudyDate !== todayKey && appState.lastStudyDate !== "") {
      appState.streakDays = 1;
    }
    appState.dailyKey = todayKey;
    appState.dailyCount = 0;
    changed = true;
  }

  if (changed) saveState(false);
}

function recordDailyProgress() {
  const todayKey = getTodayDateKey();
  if (appState.lastStudyDate !== todayKey) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getTodayDateKey(yesterday);
    if (appState.lastStudyDate === yesterdayKey) {
      appState.streakDays = (appState.streakDays || 1) + 1;
    } else {
      appState.streakDays = 1;
    }
    appState.lastStudyDate = todayKey;
  }
  appState.dailyCount = (appState.dailyCount || 0) + 1;
}

// ランク＆ポイント計算
function getRankDetails(score) {
  const safeScore = Math.max(0, Math.floor(score || 0));
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (safeScore >= t.min && safeScore < t.max) {
      tier = t;
      break;
    }
  }
  if (tier.id === "mythic") {
    return {
      tierId: tier.id,
      classNum: null,
      fullName: "ミシック",
      nextPtText: "最高ランク到達！",
      progressPct: 100,
    };
  }
  const span = tier.max - tier.min;
  const classStep = span / tier.classes;
  const offset = safeScore - tier.min;
  const classIndex = Math.min(tier.classes - 1, Math.floor(offset / classStep));
  const classNum = tier.classes - classIndex;
  const currentClassMin = tier.min + classIndex * classStep;
  const nextClassTarget = Math.round(currentClassMin + classStep);
  const remain = Math.max(0, nextClassTarget - safeScore);
  const pct = Math.min(100, Math.max(0, ((safeScore - currentClassMin) / classStep) * 100));
  return {
    tierId: tier.id,
    classNum,
    fullName: `${tier.name} クラス${classNum}`,
    nextPtText: `あと ${remain.toLocaleString()} pt`,
    progressPct: pct,
  };
}

function getComboMultiplier(combo) {
  if (combo >= 50) return 5.0;
  if (combo >= 41) return 3.5;
  if (combo >= 31) return 3.0;
  if (combo >= 26) return 2.5;
  if (combo >= 21) return 2.0;
  if (combo >= 11) return 1.5;
  if (combo >= 6) return 1.2;
  if (combo >= 3) return 1.1;
  return 1.0;
}

function calculateQuestionPoints(word, elapsedSec, comboAfterAnswer, diffId, mode) {
  const typingBonus = mode === "typing" ? (word.word ? word.word.length * 0.4 : 0) : 0;
  const effectiveElapsed = Math.max(0, elapsedSec - typingBonus);

  let basePt = 8;
  if (effectiveElapsed <= 2.0) basePt = 25;
  else if (effectiveElapsed <= 3.0) basePt = 15;
  else if (effectiveElapsed <= 5.0) basePt = 10;

  const comboMult = getComboMultiplier(comboAfterAnswer);
  const diffMult = (DIFFICULTIES[diffId] || DIFFICULTIES.basic).mult;
  const styleMult = mode === "typing" ? 1.4 : 1.0;

  return {
    earnedPt: Math.round(basePt * comboMult * diffMult * styleMult),
    isGodSpeed: effectiveElapsed <= 2.0,
  };
}

function resetRankScore() {
  if (!confirm("シーズンポイントとランクを 0 pt に初期化しますか？")) return;
  appState.totalScore = 0;
  appState.carriedCombo = 0;
  saveState(true);
  updateDashboardUI();
}

// ダッシュボード描画
function getSrsDueWords() {
  const now = Date.now();
  return getAllWords().filter((w) => {
    const st = appState.wordStats[w.no];
    return st && st.nextReviewAt > 0 && st.nextReviewAt <= now;
  });
}

function getBookmarkedWords() {
  return getAllWords().filter((w) => appState.wordStats[w.no]?.bookmarked);
}

function getFilteredReviewWords(filterType, rangeStart = 1, rangeEnd = 1500) {
  const all = getAllWords().filter((w) => w.no >= rangeStart && w.no <= rangeEnd);
  const now = Date.now();
  return all.filter((w) => {
    const st = appState.wordStats[w.no];
    if (!st) return false;
    const total = (st.correct || 0) + (st.wrong || 0);
    if (total === 0) return false;
    if (filterType === "recent_miss") {
      return (st.wrong || 0) > 0 && !st.mastered && st.lastMistakeAt > 0 && now - st.lastMistakeAt <= RECENT_MISTAKE_WINDOW_MS;
    }
    if (filterType === "low_accuracy") {
      return st.correct / total <= 0.5 && (st.wrong || 0) > 0;
    }
    return (st.wrong || 0) > 0 && !st.mastered;
  });
}

function getTierInfoByScore(score) {
  const safeScore = Math.max(0, Math.floor(score || 0));
  for (const t of RANK_TIERS) {
    if (safeScore >= t.min && safeScore < t.max) return t;
  }
  return RANK_TIERS[0];
}

function getTierPillClassByRankName(rankName = "") {
  for (const t of RANK_TIERS) {
    if (rankName.startsWith(t.name)) return t.pillCls;
  }
  return RANK_TIERS[0].pillCls;
}

function updateDashboardUI() {
  checkPeriodicResets();
  const rank = getRankDetails(appState.totalScore);
  const tier = getTierInfoByScore(appState.totalScore);
  const { daysLeft } = getSeasonInfo();

  const rankBadgeEl = document.getElementById("user-rank-badge");
  if (rankBadgeEl) {
    rankBadgeEl.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black whitespace-nowrap shrink-0 shadow-sm hover:brightness-110 transition cursor-pointer ${tier.pillCls}`;
  }

  const rankNameEl = document.getElementById("rank-name-text");
  if (rankNameEl) rankNameEl.textContent = rank.fullName;

  const scoreEl = document.getElementById("total-score-display");
  if (scoreEl) {
    scoreEl.innerHTML = `${appState.totalScore.toLocaleString()} <span class="text-xs font-extrabold text-indigo-500 dark:text-indigo-400">pt</span>`;
  }

  const seasonEl = document.getElementById("season-days-left");
  if (seasonEl) seasonEl.textContent = `シーズン残り: ${daysLeft}日 (12/1起点)`;

  const pctTextEl = document.getElementById("rank-progress-pct-text");
  if (pctTextEl) {
    pctTextEl.textContent = rank.tierId === "mythic" ? "最高ランク到達" : `次のクラスまで ${Math.floor(rank.progressPct)}%`;
  }

  const nextPtEl = document.getElementById("next-rank-pt");
  if (nextPtEl) nextPtEl.textContent = rank.nextPtText;

  const barEl = document.getElementById("rank-progress-bar");
  if (barEl) barEl.style.width = `${rank.progressPct}%`;

  const weeklyCountEl = document.getElementById("weekly-learned-count");
  if (weeklyCountEl) weeklyCountEl.textContent = `${(appState.weeklyLearnedCount || 0).toLocaleString()} 語`;

  const totalLearnedEl = document.getElementById("total-learned-count");
  if (totalLearnedEl) {
    const totalWords = Math.max(appState.totalLearnedCount || 0, computeTotalAnswersFromStats(appState.wordStats));
    totalLearnedEl.textContent = `${totalWords.toLocaleString()} 語`;
  }

  const weeklyScoreEl = document.getElementById("weekly-score-display");
  if (weeklyScoreEl) weeklyScoreEl.textContent = `${(appState.weeklyScore || 0).toLocaleString()} pt`;

  const streakEl = document.getElementById("streak-days-text");
  if (streakEl) streakEl.textContent = `${appState.streakDays || 1}日 連続学習`;

  const quotaEl = document.getElementById("daily-quota-text");
  const quotaBar = document.getElementById("daily-quota-bar");
  const dCount = appState.dailyCount || 0;
  const dQuota = appState.dailyQuota || 30;
  if (quotaEl) quotaEl.textContent = dCount;
  if (quotaBar) quotaBar.style.width = `${Math.min(100, (dCount / dQuota) * 100)}%`;

  const srsDue = getSrsDueWords().length;
  const bmCount = getBookmarkedWords().length;
  const weakCount = getFilteredReviewWords("all_weak", 1, 1500).length;

  const srsBadge = document.getElementById("srs-due-badge");
  if (srsBadge) srsBadge.textContent = `${srsDue}語 期限`;

  const bmBadge = document.getElementById("bookmark-count-badge");
  if (bmBadge) bmBadge.textContent = `${bmCount}語 登録`;

  const weakBadge = document.getElementById("weak-candidate-badge");
  if (weakBadge) weakBadge.textContent = `${weakCount}語 候補`;

  const weakBarLabel = document.getElementById("weak-bar-label");
  if (weakBarLabel) weakBarLabel.textContent = `弱点即復習 (${weakCount}問)`;

  setStatsDisplayMode(appState.statsDisplayMode || "mastery", false);
}

function toggleWeeklyDetail() {
  const box = document.getElementById("weekly-detail-box");
  const icon = document.getElementById("weekly-chevron");
  if (box) box.classList.toggle("hidden");
  if (icon) icon.classList.toggle("rotate-180");
}

function toggleAnalyticsAccordion() {
  const body = document.getElementById("analytics-body");
  const icon = document.getElementById("analytics-chevron");
  if (body) body.classList.toggle("hidden");
  if (icon) icon.classList.toggle("rotate-180");
}

function setStatsDisplayMode(mode, shouldSave = true) {
  appState.statsDisplayMode = mode;
  if (shouldSave) saveState(false);

  const tabM = document.getElementById("stats-tab-mastery");
  const tabA = document.getElementById("stats-tab-accuracy");
  if (tabM && tabA) {
    if (mode === "mastery") {
      tabM.className = "px-2.5 py-1 rounded-md bg-indigo-600 text-white cursor-pointer";
      tabA.className = "px-2.5 py-1 rounded-md text-slate-400 cursor-pointer";
    } else {
      tabA.className = "px-2.5 py-1 rounded-md bg-indigo-600 text-white cursor-pointer";
      tabM.className = "px-2.5 py-1 rounded-md text-slate-400 cursor-pointer";
    }
  }
  renderAnalyticsGraph();
}

function renderAnalyticsGraph() {
  const container = document.getElementById("stats-graph-container");
  if (!container) return;
  const all = getAllWords();
  const maxNo = all.length > 0 ? Math.max(1500, all[all.length - 1].no) : 1500;
  const blocks = Math.ceil(maxNo / 100);
  let html = "";

  for (let b = 0; b < blocks; b++) {
    const start = b * 100 + 1;
    const end = Math.min(maxNo, (b + 1) * 100);
    const blockWords = all.filter((w) => w.no >= start && w.no <= end);
    const denom = blockWords.length || 100;
    let pct = 0;
    let labelRight = "";

    if (appState.statsDisplayMode === "mastery") {
      let masteredCount = 0;
      for (const w of blockWords) {
        const st = appState.wordStats[w.no];
        if (st && st.mastered) masteredCount++;
      }
      pct = Math.round((masteredCount / denom) * 100);
      labelRight = `${masteredCount}/${denom}語 (${pct}%)`;
    } else {
      let tc = 0;
      let ta = 0;
      for (const w of blockWords) {
        const st = appState.wordStats[w.no];
        if (st) {
          tc += st.correct || 0;
          ta += (st.correct || 0) + (st.wrong || 0);
        }
      }
      pct = ta > 0 ? Math.round((tc / ta) * 100) : 0;
      labelRight = ta > 0 ? `${pct}% (${tc}/${ta})` : "未挑戦";
    }

    html += `
      <div class="text-[10px]">
        <div class="flex justify-between font-bold text-slate-400 mb-0.5">
          <span>No.${start}〜${end}</span>
          <span class="text-indigo-400 font-black">${labelRight}</span>
        </div>
        <div class="w-full bg-[#10131e] rounded-full h-1.5 overflow-hidden">
          <div class="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function resetWeakWordsOnly() {
  if (!confirm("弱点リストのミス記録だけをリセットしますか？")) return;
  for (const st of Object.values(appState.wordStats)) {
    st.wrong = 0;
    st.mastered = true;
  }
  saveState(true);
  updateDashboardUI();
}

async function resetStatsData() {
  if (!confirm("すべての単語習得履歴・SRS予定・網羅進捗をリセットしますか？")) return;
  appState.wordStats = {};
  appState.coveredMap = {};
  appState.coveredLapMap = {};
  saveState(false);
  updateDashboardUI();
  updateOrderUI();
  updateReviewTargetPreview();

  if (currentUser && db) {
    await db
      .collection("users")
      .doc(currentUser.uid)
      .update({
        wordStats: {},
        coveredMap: {},
        coveredLapMap: {},
      })
      .catch(() => {});
  }
}

// 画面遷移・テーマ・表示切替
function hideAllScreens() {
  ["dashboard-screen", "review-config-screen", "config-screen", "quiz-screen", "result-screen"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
}

function hideAllOverlays() {
  const pauseOverlay = document.getElementById("pause-overlay");
  if (pauseOverlay) pauseOverlay.style.display = "none";
  const quitModal = document.getElementById("quit-modal");
  if (quitModal) quitModal.style.display = "none";
}

function clearAutoNextTimers() {
  if (timers.autoNextTimeout) {
    clearTimeout(timers.autoNextTimeout);
    timers.autoNextTimeout = null;
  }
  if (timers.autoNextCountdownInterval) {
    clearInterval(timers.autoNextCountdownInterval);
    timers.autoNextCountdownInterval = null;
  }
}

function clearAllQuizTimers() {
  if (timers.questionInterval) {
    clearInterval(timers.questionInterval);
    timers.questionInterval = null;
  }
  if (timers.saInterval) {
    clearInterval(timers.saInterval);
    timers.saInterval = null;
  }
  clearAutoNextTimers();
  session.autoNextRemainingMs = 0;
}

function showStartScreen() {
  session.active = false;
  session.isPaused = false;
  clearAllQuizTimers();
  hideAllOverlays();
  hideAllScreens();
  applyDeviceViewUI();
  document.getElementById("dashboard-screen")?.classList.remove("hidden");
  updateDashboardUI();
}

function openConfigScreen() {
  session.active = false;
  session.isPaused = false;
  clearAllQuizTimers();
  hideAllOverlays();
  hideAllScreens();
  applyDeviceViewUI();
  document.getElementById("config-screen")?.classList.remove("hidden");
  updateOrderUI();
}

function openReviewConfigScreen() {
  session.active = false;
  session.isPaused = false;
  clearAllQuizTimers();
  hideAllOverlays();
  hideAllScreens();
  applyDeviceViewUI();
  document.getElementById("review-config-screen")?.classList.remove("hidden");
  updateReviewTargetPreview();
}

function toggleDarkMode() {
  appState.darkMode = !appState.darkMode;
  saveState(false);
  applyTheme();
}

function applyTheme() {
  const htmlEl = document.documentElement;
  const iconEl = document.getElementById("theme-icon");
  if (appState.darkMode) {
    htmlEl.classList.remove("light");
    htmlEl.classList.add("dark");
    if (iconEl) iconEl.className = "fa-solid fa-sun text-xs";
  } else {
    htmlEl.classList.remove("dark");
    htmlEl.classList.add("light");
    if (iconEl) iconEl.className = "fa-solid fa-moon text-xs";
  }
}

function toggleSound() {
  appState.soundEnabled = !appState.soundEnabled;
  saveState(false);
  applySoundUI();
}

function applySoundUI() {
  const icon = document.getElementById("sound-icon");
  const label = document.getElementById("sound-label");
  if (appState.soundEnabled) {
    if (icon) icon.className = "fa-solid fa-volume-high text-[11px]";
    if (label) label.textContent = "ON";
  } else {
    if (icon) icon.className = "fa-solid fa-volume-xmark text-[11px] text-slate-500";
    if (label) label.textContent = "OFF";
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }
}

function toggleKanaSetting(checked) {
  appState.showKana = checked;
  saveState(false);
}

function applyKanaToggleUI() {
  const toggle = document.getElementById("kana-display-toggle");
  if (toggle) toggle.checked = !!appState.showKana;
}

function toggleKanaInQuiz() {
  appState.showKana = !appState.showKana;
  applyKanaToggleUI();
  saveState(false);
  const word = session.questions[session.currentIndex];
  if (word) updateQuizKanaDisplay(word);
}

function updateQuizKanaDisplay(word) {
  const kanaEl = document.getElementById("word-kana");
  const btnEl = document.getElementById("quiz-kana-toggle-btn");
  const isEnToJa = session.activeDirection === "en_ja";

  if (!kanaEl || !btnEl) return;
  if (!isEnToJa) {
    kanaEl.classList.add("hidden");
    btnEl.classList.add("hidden");
    return;
  }

  kanaEl.classList.remove("hidden");
  btnEl.classList.remove("hidden");
  if (appState.showKana) {
    kanaEl.textContent = word.kana ? `[ ${word.kana} ]` : "[ 読みなし ]";
    btnEl.innerHTML = `<i class="fa-solid fa-eye mr-0.5"></i>読みON`;
  } else {
    kanaEl.textContent = "[ カタカナ非表示 ]";
    btnEl.innerHTML = `<i class="fa-solid fa-eye-slash mr-0.5"></i>読みOFF`;
  }
}

function toggleDeviceViewMode() {
  const order = ["auto", "desktop", "mobile"];
  const nextIdx = (order.indexOf(appState.deviceViewMode) + 1) % order.length;
  appState.deviceViewMode = order[nextIdx];
  saveState(false);
  applyDeviceViewUI();
}

function isDesktopWideActive() {
  if (appState.deviceViewMode === "desktop") return true;
  if (appState.deviceViewMode === "mobile") return false;
  return window.innerWidth >= 768;
}

function applyDeviceViewUI() {
  const mainEl = document.getElementById("main-container");
  const iconEl = document.getElementById("device-icon");
  const labelEl = document.getElementById("device-label");
  const sidePanel = document.getElementById("synonyms-side-panel");
  const mobileSyn = document.getElementById("synonyms-container");

  const isWide = isDesktopWideActive();
  const isAnswered = session.active && !!session.answeredMap[session.currentIndex];

  if (iconEl && labelEl) {
    if (appState.deviceViewMode === "desktop") {
      iconEl.className = "fa-solid fa-desktop text-[11px]";
      labelEl.textContent = "PC幅";
    } else if (appState.deviceViewMode === "mobile") {
      iconEl.className = "fa-solid fa-mobile-screen text-[11px]";
      labelEl.textContent = "スマホ";
    } else {
      iconEl.className = isWide ? "fa-solid fa-desktop text-[11px]" : "fa-solid fa-mobile-screen text-[11px]";
      labelEl.textContent = "自動";
    }
  }

  if (mainEl) {
    if (isWide) {
      mainEl.classList.remove("max-w-md");
      mainEl.classList.add("max-w-4xl");
    } else {
      mainEl.classList.remove("max-w-4xl");
      mainEl.classList.add("max-w-md");
    }
  }

  if (sidePanel) {
    if (isWide && isAnswered) {
      sidePanel.classList.remove("hidden");
      sidePanel.classList.add("flex");
    } else {
      sidePanel.classList.add("hidden");
      sidePanel.classList.remove("flex");
    }
  }

  if (mobileSyn) {
    if (!isWide && isAnswered) {
      mobileSyn.classList.remove("hidden");
    } else {
      mobileSyn.classList.add("hidden");
    }
  }
}

window.addEventListener("resize", () => {
  if (appState.deviceViewMode === "auto") applyDeviceViewUI();
});

// 設定コントロール
function renderDifficultyButtons() {
  const containers = [
    { id: "home-diff-container", context: "normal" },
    { id: "review-diff-container", context: "review" },
    { id: "result-diff-container", context: "result" },
  ];

  containers.forEach(({ id, context }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const selectedDiff = context === "review" ? reviewConfig.difficulty : quizConfig.difficulty;
    const activeCls = context === "review" ? "bg-rose-600 text-white" : "bg-indigo-600 text-white";

    el.innerHTML = Object.values(DIFFICULTIES)
      .map((d) => {
        const isSel = d.id === selectedDiff;
        const cls = isSel ? activeCls : "bg-white dark:bg-[#22283a] text-slate-600 dark:text-slate-300";
        return `
          <button type="button" onclick="selectDifficulty('${d.id}', '${context}')" class="rounded-xl py-2 px-1 text-center transition cursor-pointer ${cls}">
            <div class="font-black text-xs leading-tight">${d.label}</div>
            <div class="text-[9px] opacity-85 font-bold mt-0.5">${d.time}秒</div>
          </button>
        `;
      })
      .join("");

    const descEl = document.getElementById(context === "review" ? "review-diff-desc" : "home-diff-desc");
    if (descEl && DIFFICULTIES[selectedDiff]) {
      descEl.textContent = DIFFICULTIES[selectedDiff].desc;
    }
  });
}

function selectDifficulty(diffId, context) {
  if (context === "review") reviewConfig.difficulty = diffId;
  else quizConfig.difficulty = diffId;
  renderDifficultyButtons();
}

function setQuizDirection(dir) {
  quizConfig.direction = dir;
  ["direction-select-home", "review-direction-select", "direction-select-result"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = dir;
  });
  if (dir === "en_ja") {
    if (quizConfig.mode === "typing") selectQuizMode("choice");
    if (reviewConfig.mode === "typing") selectReviewQuizMode("choice");
  }
}

function selectQuizOrder(order) {
  quizConfig.order = order;
  const descs = {
    random: "毎回範囲内からランダムに抽出します",
    cover_all: "指定範囲の未出題単語を優先し、抜け漏れなく1周網羅します",
    weak_pool: "指定範囲内のミス履歴・未定着単語だけを集中出題します",
  };
  ["random", "cover_all", "weak_pool"].forEach((o) => {
    const btn = document.getElementById(`order-btn-${o}`);
    if (!btn) return;
    btn.className =
      o === order
        ? "py-2 px-1.5 rounded-xl bg-indigo-600 text-white font-black text-[11px] flex items-center justify-center gap-1 cursor-pointer"
        : "py-2 px-1.5 rounded-xl bg-white dark:bg-[#22283a] text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer";
  });
  const descEl = document.getElementById("order-desc-text");
  if (descEl) descEl.textContent = descs[order] || "";
  updateOrderUI();
}

function updateOrderUI() {
  const badge = document.getElementById("order-progress-badge");
  const resetBtn = document.getElementById("reset-coverage-btn");
  if (!badge) return;
  const { start, end } = getNormalizedRange("range-start", "range-end");
  const rangeKey = `${start}-${end}`;
  const rangeWords = getAllWords().filter((w) => w.no >= start && w.no <= end);

  if (quizConfig.order === "cover_all") {
    const covered = new Set(appState.coveredMap[rangeKey] || []);
    const validCovered = rangeWords.filter((w) => covered.has(w.no)).length;
    badge.textContent = `網羅済: ${validCovered}/${rangeWords.length}語`;
    badge.classList.remove("hidden");
    if (resetBtn) resetBtn.classList.remove("hidden");
  } else if (quizConfig.order === "weak_pool") {
    const weakCount = getFilteredReviewWords("all_weak", start, end).length;
    badge.textContent = `弱点: ${weakCount}語`;
    badge.classList.remove("hidden");
    if (resetBtn) resetBtn.classList.add("hidden");
  } else {
    badge.classList.add("hidden");
    if (resetBtn) resetBtn.classList.add("hidden");
  }
}

// ▼▼▼ ここから挿入 ▼▼▼
function resetCurrentRangeCoverage() {
  const { start, end } = getNormalizedRange("range-start", "range-end");
  const rangeKey = `${start}-${end}`;
  if (!confirm(`No.${start}〜${end} の網羅進捗をリセットしますか？`)) return;
  appState.coveredMap[rangeKey] = [];
  saveState(true);
  updateOrderUI();
}

function selectQuizMode(mode) {
  quizConfig.mode = mode;
  if (mode === "typing" && quizConfig.direction !== "ja_en") {
    quizConfig.direction = "ja_en";
    ["direction-select-home", "review-direction-select", "direction-select-result"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "ja_en";
    });
  }
  ["choice", "typing"].forEach((m) => {
    const btn = document.getElementById(`mode-btn-${m}`);
    if (!btn) return;
    btn.className =
      m === mode
        ? "py-2.5 px-2 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
        : "py-2.5 px-2 rounded-xl bg-white dark:bg-[#22283a] text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer";
  });
}

function selectPosFilter(pos) {
  quizConfig.posFilter = pos;
  const label = document.getElementById("pos-filter-label");
  if (label) label.textContent = pos === "all" ? "すべて" : pos;

  ["all", "動詞", "名詞", "形容詞", "副詞"].forEach((p) => {
    const btn = document.getElementById(`pos-btn-${p}`);
    if (!btn) return;
    btn.className =
      p === pos
        ? "py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black cursor-pointer"
        : "py-1.5 rounded-lg bg-white dark:bg-[#22283a] text-slate-600 dark:text-slate-300 text-[10px] font-bold cursor-pointer";
  });
}

function getNormalizedRange(startId, endId) {
  let start = parseInt(document.getElementById(startId)?.value, 10) || 1;
  let end = parseInt(document.getElementById(endId)?.value, 10) || 1500;
  start = Math.max(1, Math.min(1500, start));
  end = Math.max(1, Math.min(1500, end));
  if (start > end) [start, end] = [end, start];
  return { start, end };
}

function onRangeInputChange() {
  const { start, end } = getNormalizedRange("range-start", "range-end");
  quizConfig.rangeStart = start;
  quizConfig.rangeEnd = end;
  updateOrderUI();
}

function setAllQuestionCountDisplays(n) {
  const safeN = Math.max(1, Math.min(1500, parseInt(n, 10) || 10));
  quizConfig.count = safeN;
  const input = document.getElementById("question-count-input");
  if (input) input.value = safeN;
  const slider = document.getElementById("question-count-slider");
  if (slider) slider.value = Math.min(200, Math.max(10, safeN));
  const resSlider = document.getElementById("result-count-slider");
  if (resSlider) resSlider.value = Math.min(200, safeN);
  const resDisp = document.getElementById("result-count-display");
  if (resDisp) resDisp.textContent = `${safeN}問`;

  document.querySelectorAll(".quick-count-btn").forEach((btn) => {
    const num = parseInt(btn.textContent, 10);
    btn.className =
      num === safeN
        ? "quick-count-btn py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black cursor-pointer"
        : "quick-count-btn py-1.5 rounded-lg bg-white dark:bg-[#22283a] text-slate-500 dark:text-slate-300 text-[10px] font-bold cursor-pointer";
  });
}

function syncCountFromInput(val) {
  setAllQuestionCountDisplays(val);
}
function syncCountFromSlider(val) {
  setAllQuestionCountDisplays(val);
}
function setQuickQuestionCount(count) {
  setAllQuestionCountDisplays(count);
}

// 復習設定
function selectReviewFilter(filter) {
  reviewConfig.filter = filter;
  const descs = {
    all_weak: "ミス履歴がある未定着単語をすべて対象にします",
    recent_miss: "直近7日以内に間違えた単語に絞り、新しく間違えた順に出題します",
    low_accuracy: "累計正答率が50%以下の特に苦手な単語に絞ります",
  };
  ["all_weak", "recent_miss", "low_accuracy"].forEach((f) => {
    const btn = document.getElementById(`rev-filter-btn-${f}`);
    if (!btn) return;
    btn.className =
      f === filter
        ? "py-2 px-1 rounded-xl bg-rose-600 text-white font-black text-[11px] cursor-pointer"
        : "py-2 px-1 rounded-xl bg-white dark:bg-[#22283a] text-slate-300 font-bold text-[11px] cursor-pointer";
  });
  const descEl = document.getElementById("rev-filter-desc");
  if (descEl) descEl.textContent = descs[filter] || "";
  updateReviewTargetPreview();
}

function selectReviewOrder(order) {
  reviewConfig.order = order;
  const descs = {
    priority: "ミス回数が多い単語から優先して出題します",
    loop_unmastered: "間違えた単語を末尾に再追加し、全問正解するまで周回します",
    random: "抽出された復習単語をランダムな順番で出題します",
  };
  ["priority", "loop_unmastered", "random"].forEach((o) => {
    const btn = document.getElementById(`rev-order-btn-${o}`);
    if (!btn) return;
    btn.className =
      o === order
        ? "py-2 px-1 rounded-xl bg-rose-600 text-white font-black text-[11px] cursor-pointer"
        : "py-2 px-1 rounded-xl bg-white dark:bg-[#22283a] text-slate-300 font-bold text-[11px] cursor-pointer";
  });
  const descEl = document.getElementById("rev-order-desc");
  if (descEl) descEl.textContent = descs[order] || "";
}

function selectReviewQuizMode(mode) {
  reviewConfig.mode = mode;
  if (mode === "typing" && quizConfig.direction !== "ja_en") {
    quizConfig.direction = "ja_en";
    ["direction-select-home", "review-direction-select", "direction-select-result"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "ja_en";
    });
  }
  ["choice", "typing"].forEach((m) => {
    const btn = document.getElementById(`rev-mode-btn-${m}`);
    if (!btn) return;
    btn.className =
      m === mode
        ? "py-1.5 rounded-lg bg-rose-600 text-white font-black text-[11px] cursor-pointer"
        : "py-1.5 rounded-lg bg-white dark:bg-[#22283a] text-slate-300 font-bold text-[11px] cursor-pointer";
  });
}

function updateReviewTargetPreview() {
  const { start, end } = getNormalizedRange("review-range-start", "review-range-end");
  reviewConfig.rangeStart = start;
  reviewConfig.rangeEnd = end;
  const targets = getFilteredReviewWords(reviewConfig.filter, start, end);
  const badge = document.getElementById("review-target-count-badge");
  if (badge) badge.textContent = `対象: ${targets.length}語`;
}

function syncReviewCount(val) {
  reviewConfig.count = Math.max(1, Math.min(1500, parseInt(val, 10) || 20));
}

function setReviewQuickCount(val) {
  const { start, end } = getNormalizedRange("review-range-start", "review-range-end");
  const targets = getFilteredReviewWords(reviewConfig.filter, start, end);
  const count = val === "all" ? Math.max(1, targets.length) : val;
  reviewConfig.count = count;
  const input = document.getElementById("review-count-input");
  if (input) input.value = count;
}

function applyRecommendedPlan(plan) {
  if (plan === "royal") {
    selectQuizOrder("cover_all");
    setQuickQuestionCount(25);
    selectDifficulty("applied", "normal");
  } else {
    selectQuizOrder("weak_pool");
    setQuickQuestionCount(20);
    selectDifficulty("basic", "normal");
  }
  closeGuideModal();
}

// クイズ出題・進行
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function applyDifficultyWordFilter(pool, diffId) {
  if (diffId === "kiwami") {
    return pool.filter((w) => (w.word || "").replace(/[^a-zA-Z]/g, "").length >= 8);
  }
  if (diffId === "tenfu") {
    const longW = shuffleArray(pool.filter((w) => (w.word || "").replace(/[^a-zA-Z]/g, "").length >= 7));
    const shortW = shuffleArray(pool.filter((w) => (w.word || "").replace(/[^a-zA-Z]/g, "").length < 7));
    return [...longW, ...shortW];
  }
  return pool;
}

function buildNormalQuestions() {
  const { start, end } = getNormalizedRange("range-start", "range-end");
  quizConfig.rangeStart = start;
  quizConfig.rangeEnd = end;
  const count = Math.max(1, quizConfig.count || 10);

  let basePool = getAllWords().filter((w) => w.no >= start && w.no <= end);
  if (quizConfig.posFilter !== "all") {
    basePool = basePool.filter((w) => (w.pos || "").includes(quizConfig.posFilter));
  }
  if (basePool.length === 0) {
    alert("指定された範囲・品詞に一致する単語がありません。");
    return [];
  }

  if (quizConfig.difficulty === "kiwami") {
    basePool = applyDifficultyWordFilter(basePool, "kiwami");
    if (basePool.length === 0) {
      alert("この条件には「極（8文字以上限定）」対象の単語がありません。");
      return [];
    }
  }

  if (quizConfig.order === "weak_pool") {
    let weakPool = getFilteredReviewWords("all_weak", start, end);
    if (quizConfig.posFilter !== "all") {
      weakPool = weakPool.filter((w) => (w.pos || "").includes(quizConfig.posFilter));
    }
    if (weakPool.length === 0) {
      alert("この範囲に該当する弱点単語がありません！");
      return [];
    }
    const ordered = quizConfig.difficulty === "tenfu" ? applyDifficultyWordFilter(weakPool, "tenfu") : shuffleArray(weakPool);
    return ordered.slice(0, Math.min(count, ordered.length));
  }

  if (quizConfig.order === "cover_all") {
    const rangeKey = `${start}-${end}`;
    const coveredSet = new Set(appState.coveredMap[rangeKey] || []);
    let uncovered = basePool.filter((w) => !coveredSet.has(w.no));
    if (uncovered.length === 0) {
      appState.coveredMap[rangeKey] = [];
      saveState(false);
      uncovered = [...basePool];
    }
    const ordered = quizConfig.difficulty === "tenfu" ? applyDifficultyWordFilter(uncovered, "tenfu") : shuffleArray(uncovered);
    return ordered.slice(0, Math.min(count, ordered.length));
  }

  const ordered = quizConfig.difficulty === "tenfu" ? applyDifficultyWordFilter(basePool, "tenfu") : shuffleArray(basePool);
  if (ordered.length >= count) return ordered.slice(0, count);
  const res = [];
  while (res.length < count) res.push(...shuffleArray(ordered));
  return res.slice(0, count);
}

function startQuiz(type = "normal") {
  clearAllQuizTimers();
  let questions = [];
  const activeMode = quizConfig.mode;
  const activeDiff = quizConfig.difficulty;
  const activeDir = activeMode === "typing" ? "ja_en" : quizConfig.direction;
  let badgeLabel = "通常モード";

  if (type === "session_review") {
    if (!session.sessionMistakes || session.sessionMistakes.length === 0) {
      alert("直前のクイズで間違えた単語はありません！");
      return;
    }
    questions = shuffleArray([...session.sessionMistakes]);
    badgeLabel = "直前ミス復習";
  } else {
    questions = buildNormalQuestions();
    if (questions.length === 0) return;
    if (quizConfig.order === "cover_all") badgeLabel = "網羅モード(1周)";
    else if (quizConfig.order === "weak_pool") badgeLabel = "弱点プール";
  }

  initQuizSession({ type, questions, direction: activeDir, mode: activeMode, difficulty: activeDiff, badgeLabel, carryCombo: true });
}

function startSrsReviewQuiz() {
  const due = getSrsDueWords();
  if (due.length === 0) {
    alert("現在、復習期限が来ている単語はありません！");
    return;
  }
  initQuizSession({
    type: "srs_review",
    questions: shuffleArray(due).slice(0, 30),
    direction: quizConfig.direction === "ja_en" && quizConfig.mode === "typing" ? "ja_en" : "en_ja",
    mode: "choice",
    difficulty: "basic",
    badgeLabel: "本日のSRS復習",
    carryCombo: true,
  });
}

function startBookmarkQuiz() {
  const bms = getBookmarkedWords();
  if (bms.length === 0) {
    alert("My単語帳（★）に登録された単語がまだありません。\nクイズ中や辞書で★をタップして登録できます！");
    return;
  }
  initQuizSession({
    type: "bookmark_review",
    questions: shuffleArray(bms),
    direction: "en_ja",
    mode: "choice",
    difficulty: "basic",
    badgeLabel: "My単語帳",
    carryCombo: true,
  });
}

function startQuickWeakReview() {
  const weak = getFilteredReviewWords("all_weak", 1, 1500);
  if (weak.length === 0) {
    alert("現在、弱点候補の単語はありません！");
    return;
  }
  initQuizSession({
    type: "custom_review",
    questions: shuffleArray(weak).slice(0, 20),
    direction: "en_ja",
    mode: "choice",
    difficulty: "basic",
    badgeLabel: "弱点集中復習",
    carryCombo: true,
  });
}

function startCustomReviewQuiz() {
  clearAllQuizTimers();
  const { start, end } = getNormalizedRange("review-range-start", "review-range-end");
  const count = Math.max(1, parseInt(document.getElementById("review-count-input")?.value, 10) || reviewConfig.count);

  let targets = getFilteredReviewWords(reviewConfig.filter, start, end);
  if (reviewConfig.difficulty === "kiwami") targets = applyDifficultyWordFilter(targets, "kiwami");
  if (targets.length === 0) {
    alert("条件に一致する復習対象単語がありません！");
    return;
  }

  if (reviewConfig.filter === "recent_miss") {
    targets.sort((a, b) => (getWordStat(b.no).lastMistakeAt || 0) - (getWordStat(a.no).lastMistakeAt || 0));
  } else if (reviewConfig.order === "priority") {
    targets.sort((a, b) => (getWordStat(b.no).wrong || 0) - (getWordStat(a.no).wrong || 0));
  } else {
    targets = shuffleArray(targets);
  }

  const questions = targets.slice(0, Math.min(count, targets.length));
  const activeDir = reviewConfig.mode === "typing" ? "ja_en" : quizConfig.direction;

  initQuizSession({
    type: "custom_review",
    questions,
    direction: activeDir,
    mode: reviewConfig.mode,
    difficulty: reviewConfig.difficulty,
    badgeLabel: reviewConfig.order === "loop_unmastered" ? "苦手特訓・完璧周回" : "苦手特訓",
    carryCombo: true,
  });
}

function startScoreAttackMode() {
  clearAllQuizTimers();
  const all = getAllWords();
  if (all.length === 0) return;
  const pool = applyDifficultyWordFilter(all, "tenfu");

  initQuizSession({
    type: "score_attack",
    questions: pool,
    direction: "en_ja",
    mode: "choice",
    difficulty: "tenfu",
    badgeLabel: "スコアアタック (60秒)",
    carryCombo: false,
  });

  session.saRemainingSec = 60;
  updateScoreAttackTimerDisplay();
  timers.saInterval = setInterval(() => {
    if (!session.active || session.isPaused) return;
    session.saRemainingSec = Math.max(0, +(session.saRemainingSec - 0.1).toFixed(1));
    updateScoreAttackTimerDisplay();
    if (session.saRemainingSec <= 0) {
      clearAllQuizTimers();
      finishQuiz();
    }
  }, 100);
}

function updateScoreAttackTimerDisplay() {
  const secEl = document.getElementById("timer-sec");
  const barEl = document.getElementById("timer-bar");
  if (secEl) secEl.textContent = Math.ceil(session.saRemainingSec);
  if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, (session.saRemainingSec / 60) * 100))}%`;
}

function initQuizSession({ type, questions, direction, mode, difficulty, badgeLabel, carryCombo }) {
  hideAllOverlays();
  hideAllScreens();
  document.getElementById("quiz-screen")?.classList.remove("hidden");

  session.active = true;
  session.type = type;
  session.activeDirection = mode === "typing" ? "ja_en" : direction || "en_ja";
  session.activeMode = mode;
  session.activeDifficulty = difficulty;
  session.questions = questions.map((w) => ({ ...w, _cachedChoices: null, _cachedDir: null }));
  session.currentIndex = 0;
  session.score = 0;
  session.correctCount = 0;
  session.combo = carryCombo ? appState.carriedCombo || 0 : 0;
  session.maxCombo = session.combo;
  session.sessionMistakes = [];
  session.answeredMap = {};
  session.isPaused = false;
  session.autoNextRemainingMs = 0;

  const modeBadge = document.getElementById("quiz-mode-badge");
  if (modeBadge) modeBadge.textContent = badgeLabel;

  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  if (!session.active) return;

  if (timers.questionInterval) {
    clearInterval(timers.questionInterval);
    timers.questionInterval = null;
  }
  clearAutoNextTimers();
  session.autoNextRemainingMs = 0;

  if (session.type === "score_attack" && session.currentIndex >= session.questions.length - 2) {
    const more = applyDifficultyWordFilter(getAllWords(), "tenfu").map((w) => ({ ...w, _cachedChoices: null, _cachedDir: null }));
    session.questions.push(...more);
  }

  if (session.currentIndex >= session.questions.length) {
    finishQuiz();
    return;
  }

  const word = session.questions[session.currentIndex];
  const totalQ = session.questions.length;
  const answeredRecord = session.answeredMap[session.currentIndex];
  const isAnswered = !!answeredRecord;
  const isScoreAttack = session.type === "score_attack";

  applyDeviceViewUI();

  const progressText = document.getElementById("progress-text");
  if (progressText) {
    progressText.textContent = isScoreAttack ? `SOLVED: ${session.correctCount}` : `Q ${session.currentIndex + 1} / ${totalQ}`;
  }

  updateComboBadge();
  const scoreText = document.getElementById("score-text");
  if (scoreText) scoreText.textContent = `SCORE: ${session.score.toLocaleString()}`;

  const noEl = document.getElementById("word-no");
  const posEl = document.getElementById("word-pos");
  const wordTextEl = document.getElementById("word-text");
  const hintEl = document.getElementById("typing-hint");

  if (noEl) noEl.textContent = `No. ${word.no}`;
  if (posEl) posEl.textContent = word.pos || "語句";
  updateQuizBookmarkIcon(word.no);

  const isEnToJa = session.activeDirection === "en_ja";
  if (wordTextEl) wordTextEl.textContent = isEnToJa ? word.word : word.meaning;
  updateQuizKanaDisplay(word);

  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  if (prevBtn) prevBtn.disabled = isScoreAttack || session.currentIndex === 0;
  if (nextBtn) nextBtn.disabled = isScoreAttack;

  const feedbackBox = document.getElementById("feedback-box");
  const autoNextBadge = document.getElementById("auto-next-countdown");
  if (isAnswered) {
    showFeedbackAndSynonyms(word, answeredRecord.isCorrect, answeredRecord.correctDisplay, answeredRecord.earnedPt, answeredRecord.ptDetail);
    if (autoNextBadge) autoNextBadge.classList.add("hidden");
  } else {
    if (feedbackBox) feedbackBox.classList.add("hidden");
  }

  const optionsContainer = document.getElementById("options-container");
  const typingContainer = document.getElementById("typing-container");
  const typingInput = document.getElementById("typing-input");

  if (session.activeMode === "typing") {
    if (optionsContainer) optionsContainer.classList.add("hidden");
    if (typingContainer) typingContainer.classList.remove("hidden");
    if (hintEl) {
      const firstChar = (word.word || "")[0] || "";
      const len = (word.word || "").length;
      hintEl.textContent = `ヒント: ${firstChar}${" _".repeat(Math.max(0, len - 1))} (${len}文字)`;
      hintEl.classList.remove("hidden");
    }
    if (typingInput) {
      typingInput.value = isAnswered ? answeredRecord.userAnswer || "" : "";
      typingInput.disabled = isAnswered;
      if (!isAnswered) setTimeout(() => typingInput.focus(), 30);
    }
  } else {
    if (typingContainer) typingContainer.classList.add("hidden");
    if (hintEl) hintEl.classList.add("hidden");
    if (optionsContainer) {
      optionsContainer.classList.remove("hidden");
      renderChoiceOptions(word, isAnswered);
    }
  }

  const autoSpeech = document.getElementById("auto-speech-toggle")?.checked ?? true;
  if (!isAnswered && isEnToJa && autoSpeech) {
    playSpeech(word.word);
  }

  setupQuestionTimer(word, isAnswered);
}

function renderChoiceOptions(word, isAnswered) {
  const container = document.getElementById("options-container");
  if (!container) return;

  const isEnToJa = session.activeDirection === "en_ja";
  const correctValue = isEnToJa ? word.meaning : word.word;

  if (!word._cachedChoices || word._cachedDir !== session.activeDirection) {
    const all = getAllWords();
    const samePos = all.filter((w) => w.no !== word.no && w.pos === word.pos);
    const others = samePos.length >= 10 ? samePos : all.filter((w) => w.no !== word.no);
    const distractors = shuffleArray(others)
      .slice(0, 3)
      .map((w) => (isEnToJa ? w.meaning : w.word));
    word._cachedChoices = shuffleArray([correctValue, ...distractors]);
    word._cachedDir = session.activeDirection;
  }

  const prevRecord = session.answeredMap[session.currentIndex];
  const shouldAnimate = isAnswered && prevRecord && !prevRecord.animated;
  if (shouldAnimate) prevRecord.animated = true;

  container.innerHTML = word._cachedChoices
    .map((choice) => {
      let cardCls = "bg-slate-50 dark:bg-[#181d2c] hover:bg-indigo-50 dark:hover:bg-[#1f263b] active:scale-[0.98] border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100";
      let iconHtml = `<span class="w-4 h-4 rounded-full border-2 border-slate-400 dark:border-slate-600 shrink-0"></span>`;

      if (isAnswered) {
        if (choice === correctValue) {
          const popAnim = shouldAnimate ? "animate-correct-pop ring-2 ring-emerald-300" : "ring-1 ring-emerald-400/60";
          cardCls = `bg-gradient-to-r from-emerald-600 to-teal-500 border-emerald-400 text-white ${popAnim}`;
          iconHtml = `<span class="w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center shrink-0 text-[11px] font-black"><i class="fa-solid fa-check"></i></span>`;
        } else if (prevRecord && choice === prevRecord.userAnswer) {
          const shakeAnim = shouldAnimate ? "animate-wrong-shake" : "";
          cardCls = `bg-rose-600 border-rose-400 text-white ${shakeAnim}`;
          iconHtml = `<span class="w-5 h-5 rounded-full bg-white text-rose-600 flex items-center justify-center shrink-0 text-[11px] font-black"><i class="fa-solid fa-xmark"></i></span>`;
        } else {
          cardCls = "bg-slate-100 dark:bg-[#141824] border-slate-200 dark:border-slate-800/60 text-slate-400 opacity-45";
        }
      }

      const safeChoice = choice.replace(/"/g, "&quot;");
      return `
        <button type="button" ${isAnswered ? "disabled" : ""} data-choice="${safeChoice}" onclick="handleChoiceAnswer(this.getAttribute('data-choice'))"
          class="option-choice-btn w-full text-left px-4 py-3.5 rounded-2xl border font-bold text-sm transition-all duration-200 flex items-center justify-between gap-3 cursor-pointer ${cardCls}">
          <span class="flex-1 break-words">${choice}</span>
          ${iconHtml}
        </button>
      `;
    })
    .join("");
}

function setupQuestionTimer(word, isAnswered) {
  const baseLimit = (DIFFICULTIES[session.activeDifficulty] || DIFFICULTIES.basic).time;
  const typingBonus = session.activeMode === "typing" ? (word.word ? word.word.length * 0.4 : 0) : 0;
  const totalLimit = +(baseLimit + typingBonus).toFixed(1);

  session.questionTimeLimit = totalLimit;
  session.questionRemainingSec = isAnswered ? 0 : totalLimit;
  session.questionStartTime = performance.now();

  // 赤線＝2.0秒経過（神速ライン）、黄線＝3.0秒経過（準神速ライン）
  const pct2s = ((totalLimit - (2.0 + typingBonus)) / totalLimit) * 100;
  const pct3s = ((totalLimit - (3.0 + typingBonus)) / totalLimit) * 100;
  const redLine = document.getElementById("timer-marker-3s"); // 赤線 (bg-rose-500)
  const yellowLine = document.getElementById("timer-marker-5s"); // 黄線 (bg-amber-400)

  if (session.type === "score_attack") {
    if (redLine) redLine.style.display = "none";
    if (yellowLine) yellowLine.style.display = "none";
    return;
  }

  if (redLine) {
    if (pct2s > 0 && pct2s < 100) {
      redLine.style.display = "block";
      redLine.style.left = `${pct2s}%`;
    } else {
      redLine.style.display = "none";
    }
  }

  if (yellowLine) {
    if (pct3s > 0 && pct3s < 100) {
      yellowLine.style.display = "block";
      yellowLine.style.left = `${pct3s}%`;
    } else {
      yellowLine.style.display = "none";
    }
  }

  const secEl = document.getElementById("timer-sec");
  const barEl = document.getElementById("timer-bar");
  if (secEl) secEl.textContent = Math.ceil(isAnswered ? 0 : totalLimit);
  if (barEl) barEl.style.width = isAnswered ? "0%" : "100%";

  if (isAnswered) return;

  timers.questionInterval = setInterval(() => {
    if (!session.active || session.isPaused) return;
    const elapsed = (performance.now() - session.questionStartTime) / 1000;
    const remain = Math.max(0, totalLimit - elapsed);
    session.questionRemainingSec = remain;
    if (secEl) secEl.textContent = Math.ceil(remain);
    if (barEl) barEl.style.width = `${(remain / totalLimit) * 100}%`;

    if (remain <= 0) {
      clearInterval(timers.questionInterval);
      timers.questionInterval = null;
      evaluateAnswer(false, "(時間切れ)", totalLimit);
    }
  }, 50);
}

function handleChoiceAnswer(selectedChoice) {
  if (!session.active || session.isPaused || session.answeredMap[session.currentIndex]) return;
  const elapsed = (performance.now() - session.questionStartTime) / 1000;
  const word = session.questions[session.currentIndex];
  const isEnToJa = session.activeDirection === "en_ja";
  const correctValue = isEnToJa ? word.meaning : word.word;
  evaluateAnswer(selectedChoice === correctValue, selectedChoice, elapsed);
}

function submitTypingAnswer(event) {
  if (event) event.preventDefault();
  if (!session.active || session.isPaused || session.answeredMap[session.currentIndex]) return;
  const inputEl = document.getElementById("typing-input");
  const userVal = (inputEl?.value || "").trim();
  if (!userVal) return;

  const elapsed = (performance.now() - session.questionStartTime) / 1000;
  const word = session.questions[session.currentIndex];
  const isCorrect = userVal.toLowerCase() === (word.word || "").trim().toLowerCase();
  evaluateAnswer(isCorrect, userVal, elapsed);
}

function evaluateAnswer(isCorrect, userAnswer, elapsedSec) {
  if (timers.questionInterval) {
    clearInterval(timers.questionInterval);
    timers.questionInterval = null;
  }

  const word = session.questions[session.currentIndex];
  const st = getWordStat(word.no);
  const isEnToJa = session.activeDirection === "en_ja";
  const correctDisplay = isEnToJa ? word.meaning : word.word;

  recordDailyProgress();
  appState.weeklyLearnedCount = (appState.weeklyLearnedCount || 0) + 1;
  appState.totalLearnedCount = (appState.totalLearnedCount || 0) + 1;

  if (quizConfig.order === "cover_all" && session.type === "normal") {
    const rangeKey = `${quizConfig.rangeStart}-${quizConfig.rangeEnd}`;
    if (!appState.coveredMap[rangeKey]) appState.coveredMap[rangeKey] = [];
    if (!appState.coveredMap[rangeKey].includes(word.no)) appState.coveredMap[rangeKey].push(word.no);
  }

  let earnedPt = 0;
  let ptDetail = null;

  if (isCorrect) {
    session.correctCount++;
    session.combo++;
    if (session.combo > session.maxCombo) session.maxCombo = session.combo;

    ptDetail = calculateQuestionPoints(word, elapsedSec, session.combo, session.activeDifficulty, session.activeMode);
    earnedPt = ptDetail.earnedPt;
    session.score += earnedPt;

    appState.totalScore += earnedPt;
    appState.weeklyScore = (appState.weeklyScore || 0) + earnedPt;

    st.correct = (st.correct || 0) + 1;
    st.streak = (st.streak || 0) + 1;
    if (st.streak >= 2) st.mastered = true;

    const intervals = appState.srsIntervals || [1, 3, 7];
    const stepDays = intervals[Math.min(intervals.length - 1, Math.max(0, st.streak - 1))] || 1;
    st.nextReviewAt = Date.now() + stepDays * DAY_MS;

    playTone(true, ptDetail?.isGodSpeed);
  } else {
    session.combo = 0;
    st.wrong = (st.wrong || 0) + 1;
    st.streak = 0;
    st.mastered = false;
    st.lastMistakeAt = Date.now();
    st.nextReviewAt = Date.now();

    if (!session.sessionMistakes.some((m) => m.no === word.no)) {
      session.sessionMistakes.push(word);
    }

    if (session.type === "custom_review" && reviewConfig.order === "loop_unmastered") {
      session.questions.push({ ...word, _cachedChoices: null, _cachedDir: null });
    }

    if (session.activeMode === "typing") {
      const typingInput = document.getElementById("typing-input");
      if (typingInput) {
        typingInput.classList.remove("animate-wrong-shake", "border-rose-500");
        void typingInput.offsetWidth;
        typingInput.classList.add("animate-wrong-shake", "border-rose-500");
      }
    }

    playTone(false, false);
  }

  if (session.type !== "score_attack") {
    appState.carriedCombo = session.combo;
  }

  session.answeredMap[session.currentIndex] = { isCorrect, userAnswer, earnedPt, ptDetail, correctDisplay };

  // 1. まず見た目・スコア・選択肢の色だけを即座に更新（体感ラグ0ms）
  updateComboBadge();
  const scoreText = document.getElementById("score-text");
  if (scoreText) scoreText.textContent = `SCORE: ${session.score.toLocaleString()}`;

  if (session.activeMode === "choice") {
    renderChoiceOptions(word, true);
  } else {
    const typingInput = document.getElementById("typing-input");
    if (typingInput) typingInput.disabled = true;
  }

  applyDeviceViewUI();
  showFeedbackAndSynonyms(word, isCorrect, correctDisplay, earnedPt, ptDetail);

  const delayMs = session.type === "score_attack" ? 400 : isCorrect ? 2000 : 3000;
  startAutoNextCountdown(delayMs);

  // 2. 画面が描画された直後に、データ保存・クラウド同期・音声読み上げを裏で実行
  setTimeout(() => {
    saveState(true);
    const autoSpeech = document.getElementById("auto-speech-toggle")?.checked ?? true;
    if (!isEnToJa && autoSpeech) playSpeech(word.word);
  }, 30);
}

function updateComboBadge() {
  const badge = document.getElementById("combo-badge");
  const countEl = document.getElementById("combo-count");
  if (!badge || !countEl) return;
  if (session.combo >= 2) {
    countEl.textContent = session.combo;
    badge.classList.remove("hidden", "animate-combo");
    void badge.offsetWidth;
    badge.classList.add("animate-combo");
  } else {
    badge.classList.add("hidden");
  }
}

function showFeedbackAndSynonyms(word, isCorrect, correctDisplay, earnedPt, ptDetail) {
  const box = document.getElementById("feedback-box");
  const textEl = document.getElementById("feedback-text");
  if (box && textEl) {
    box.classList.remove("hidden");
    if (isCorrect) {
      box.className = "p-3 rounded-2xl text-xs font-black flex items-center justify-between gap-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300";
      const godTag = ptDetail?.isGodSpeed ? " ⚡神速!" : "";
      textEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i>正解！ +${earnedPt} pt${godTag}`;
    } else {
      box.className = "p-3 rounded-2xl text-xs font-black flex items-center justify-between gap-2 bg-rose-500/20 border border-rose-500/40 text-rose-300";
      textEl.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1"></i>不正解… 正解: <span class="underline">${correctDisplay}</span>`;
    }
  }
  renderSynonymsPanels(word);
}

// 類義語・関連語パネル
function extractRelatedWords(word) {
  const items = [];
  if (Array.isArray(word.synonyms) && word.synonyms.length > 0) {
    word.synonyms.forEach((s) => {
      if (typeof s === "string" && s.trim()) items.push({ word: s.trim(), meaning: "類義語", tag: "類義" });
      else if (s && s.word) items.push({ word: s.word, meaning: s.meaning || "類義語", tag: "類義" });
    });
  }
  if (items.length < 3) {
    const clean = (word.meaning || "").replace(/[（(][^）)]*[）)]/g, "");
    const kws = clean
      .split(/[、，,・\s]/)
      .map((k) => k.trim())
      .filter((k) => k.length >= 2);
    for (const c of getAllWords()) {
      if (c.no === word.no || items.some((i) => i.word === c.word)) continue;
      if (kws.some((kw) => (c.meaning || "").includes(kw))) {
        items.push({ word: c.word, meaning: c.meaning, tag: `No.${c.no}` });
        if (items.length >= 4) break;
      }
    }
  }
  return items;
}

function renderSynonymsPanels(word) {
  const related = extractRelatedWords(word);
  const sideList = document.getElementById("synonyms-side-list");
  const mobileList = document.getElementById("synonyms-list");
  const encoded = encodeURIComponent(word.word || "");
  const weblioUrl = "https:" + "/" + "/ejje.weblio.jp/content/" + encoded;

  const weblioLink = `
    <div class="pt-2 mt-2 border-t border-slate-800 flex gap-1.5" onclick="event.stopPropagation()">
      <button type="button"
              data-url="${weblioUrl}"
              onclick="event.stopPropagation(); if (typeof togglePause === 'function') togglePause(); window.open(this.dataset.url, '_blank', 'noopener,noreferrer')"
              class="inline-flex items-center px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 text-[10px] font-bold cursor-pointer">
        <i class="fa-solid fa-arrow-up-right-from-square mr-1"></i>Weblioで詳細
      </button>
    </div>
  `;

  if (sideList) {
    let html = `
      <div class="p-2.5 rounded-xl bg-[#121622] border border-slate-800">
        <div class="text-[10px] font-black text-indigo-400">No.${word.no} ・ ${word.pos || ""}</div>
        <div class="text-sm font-black text-white mt-0.5">${word.word}</div>
        <div class="text-xs font-bold text-slate-300 mt-0.5">${word.meaning}</div>
      </div>
    `;
    html += related
      .map(
        (r) => `
        <div class="p-2 rounded-xl bg-[#121622] border border-slate-800/80">
          <div class="flex justify-between">
            <span class="font-black text-xs text-white">${r.word}</span>
            <span class="text-[9px] font-bold text-indigo-400">${r.tag}</span>
          </div>
          <div class="text-[11px] text-slate-400">${r.meaning}</div>
        </div>
      `,
      )
      .join("");
    sideList.innerHTML = html + weblioLink;
  }

  if (mobileList) {
    mobileList.innerHTML =
      (related.length > 0
        ? related
            .map(
              (r) =>
                `<span class="px-2 py-1 rounded-lg bg-[#121622] border border-slate-800 text-[11px] font-bold text-slate-200"><strong class="text-indigo-400">${r.word}</strong> (${r.meaning})</span>`,
            )
            .join("")
        : `<span class="text-[11px] text-slate-400">関連語なし</span>`) + weblioLink;
  }
}

function updateQuizBookmarkIcon(no) {
  const icon = document.getElementById("quiz-bookmark-icon");
  if (!icon) return;
  const isBm = !!getWordStat(no).bookmarked;
  icon.className = isBm ? "fa-solid fa-star text-sm text-amber-400" : "fa-regular fa-star text-sm";
}

function toggleCurrentWordBookmark() {
  const word = session.questions[session.currentIndex];
  if (!word) return;
  const st = getWordStat(word.no);
  st.bookmarked = !st.bookmarked;
  saveState(true);
  updateQuizBookmarkIcon(word.no);
}

// 自動進行・中断（一時停止）・終了モーダル
function startAutoNextCountdown(delayMs) {
  clearAutoNextTimers();
  const safeDelay = Math.max(50, delayMs);
  session.autoNextRemainingMs = safeDelay;
  session.autoNextTargetTime = performance.now() + safeDelay;

  const badge = document.getElementById("auto-next-countdown");
  const secEl = document.getElementById("auto-next-sec");
  if (badge && secEl) {
    if (session.type === "score_attack") badge.classList.add("hidden");
    else {
      badge.classList.remove("hidden");
      secEl.textContent = Math.max(1, Math.ceil(safeDelay / 1000));
    }
  }

  timers.autoNextCountdownInterval = setInterval(() => {
    if (!session.active || session.isPaused) return;
    const rem = Math.max(0, session.autoNextTargetTime - performance.now());
    session.autoNextRemainingMs = rem;
    if (secEl) secEl.textContent = Math.max(1, Math.ceil(rem / 1000));
  }, 200);

  timers.autoNextTimeout = setTimeout(() => {
    if (!session.active || session.isPaused) return;
    session.autoNextRemainingMs = 0;
    nextQuestion();
  }, safeDelay);
}

function prevQuestion() {
  if (!session.active || session.type === "score_attack" || session.currentIndex <= 0) return;
  session.currentIndex--;
  renderCurrentQuestion();
}

function nextQuestion() {
  if (!session.active) return;
  session.currentIndex++;
  renderCurrentQuestion();
}

function pauseSessionTimers() {
  session.isPaused = true;
  if (timers.autoNextTimeout) {
    session.autoNextRemainingMs = Math.max(0, session.autoNextTargetTime - performance.now());
    clearAutoNextTimers();
  }
}

function resumeSessionTimers() {
  session.isPaused = false;
  if (!session.answeredMap[session.currentIndex]) {
    const elapsedAlready = session.questionTimeLimit - session.questionRemainingSec;
    session.questionStartTime = performance.now() - elapsedAlready * 1000;
  } else if (session.autoNextRemainingMs > 0) {
    startAutoNextCountdown(session.autoNextRemainingMs);
  }
}

function togglePause() {
  if (!session.active) return;
  const overlay = document.getElementById("pause-overlay");
  if (!session.isPaused) {
    pauseSessionTimers();
    if (overlay) overlay.style.display = "flex";
  } else {
    if (overlay) overlay.style.display = "none";
    resumeSessionTimers();
  }
}

function openQuitModal() {
  pauseSessionTimers();
  const modal = document.getElementById("quit-modal");
  if (modal) modal.style.display = "flex";
}

function closeQuitModal() {
  const modal = document.getElementById("quit-modal");
  if (modal) modal.style.display = "none";
  const pauseOverlay = document.getElementById("pause-overlay");
  if (!pauseOverlay || pauseOverlay.style.display === "none") resumeSessionTimers();
}

function forceQuit(dest) {
  session.active = false;
  session.isPaused = false;
  clearAllQuizTimers();
  hideAllOverlays();
  if (dest === "config") openConfigScreen();
  else showStartScreen();
}

function finishQuiz() {
  const finishedType = session.type;
  session.active = false;
  session.isPaused = false;
  clearAllQuizTimers();
  hideAllOverlays();

  let isNewSaRecord = false;
  if (finishedType === "score_attack" && session.score > (appState.saPersonalBest || 0)) {
    appState.saPersonalBest = session.score;
    isNewSaRecord = true;
  }

  saveState(true);
  hideAllScreens();
  document.getElementById("result-screen")?.classList.remove("hidden");

  const finalScoreEl = document.getElementById("final-score");
  const rangeInfoEl = document.getElementById("result-range-info");
  const maxComboEl = document.getElementById("max-combo-num");
  const commentEl = document.getElementById("result-comment");
  if (maxComboEl) maxComboEl.textContent = session.maxCombo;

  if (finishedType === "score_attack") {
    if (finalScoreEl) finalScoreEl.textContent = `${session.score.toLocaleString()} pt`;
    if (rangeInfoEl) rangeInfoEl.textContent = `スコアアタック公式戦（正解数: ${session.correctCount}問）`;
    if (commentEl) {
      commentEl.textContent = isNewSaRecord
        ? `🎉 自己ベスト新記録達成！（${session.score.toLocaleString()} pt）`
        : `獲得スコア ${session.score.toLocaleString()} pt（自己ベスト: ${appState.saPersonalBest.toLocaleString()} pt）`;
    }
  } else {
    const totalAnswered = Object.keys(session.answeredMap).length || session.questions.length;
    const rate = totalAnswered > 0 ? Math.round((session.correctCount / totalAnswered) * 100) : 0;
    if (finalScoreEl) finalScoreEl.textContent = `${session.correctCount} / ${totalAnswered}`;
    if (rangeInfoEl) rangeInfoEl.textContent = `獲得ポイント: +${session.score.toLocaleString()} pt（正答率 ${rate}%）`;
    if (commentEl) {
      commentEl.textContent = rate === 100 ? "パーフェクト達成！圧倒的な語彙力です！" : "ナイスファイト！間違えた単語を復習して定着させましょう。";
    }
  }
}

function toggleResultQuickConfig() {
  document.getElementById("result-quick-config")?.classList.toggle("hidden");
}
function syncResultCount(val) {
  setAllQuestionCountDisplays(val);
}

// バックアップ保存・復元 ＆ SRS設定
function exportBackupJson() {
  const blob = new Blob([JSON.stringify(appState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `target1900_backup_${getTodayDateKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function triggerImportBackup() {
  document.getElementById("backup-file-input")?.click();
}

function importBackupJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && typeof imported === "object") {
        appState = { ...appState, ...imported };
        saveState(true);
        updateDashboardUI();
        alert("バックアップデータを復元しました！");
      }
    } catch {
      alert("ファイルの読み込みに失敗しました。正しいJSONファイルを選択してください。");
    }
  };
  reader.readAsText(file);
}

function openSrsConfigModal() {
  const intervals = Array.isArray(appState.srsIntervals) && appState.srsIntervals.length > 0 ? appState.srsIntervals : [1, 3, 7, 14, 30];
  const input = document.getElementById("srs-custom-input");
  if (input) input.value = intervals.join(", ");
  document.getElementById("srs-config-modal")?.classList.remove("hidden");
}

function closeSrsConfigModal() {
  document.getElementById("srs-config-modal")?.classList.add("hidden");
}

function applySrsPreset(type) {
  const presets = {
    standard: [1, 3, 7, 14, 30],
    short: [1, 2, 4, 7, 14],
    long: [1, 4, 10, 25, 60],
  };
  const selected = presets[type] || presets.standard;
  const input = document.getElementById("srs-custom-input");
  if (input) input.value = selected.join(", ");
}

function saveSrsConfig() {
  const raw = document.getElementById("srs-custom-input")?.value || "";
  const parsed = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 365);

  if (parsed.length === 0) {
    alert("1以上の半角数字をカンマ区切りで入力してください（例: 1, 3, 7, 14, 30）");
    return;
  }
  appState.srsIntervals = parsed;
  saveState(false);
  closeSrsConfigModal();
}

function openAboutModal() {
  document.getElementById("about-modal")?.classList.remove("hidden");
}

function closeAboutModal() {
  document.getElementById("about-modal")?.classList.add("hidden");
}

// 全単語辞書
function openReferenceModal() {
  document.getElementById("reference-modal")?.classList.remove("hidden");
  renderReferenceList();
}
function closeReferenceModal() {
  document.getElementById("reference-modal")?.classList.add("hidden");
}

function setRefStatusFilter(filter) {
  session.refFilter = filter;
  ["all", "weak", "unmastered", "bookmarked"].forEach((f) => {
    const btn = document.getElementById(`ref-filter-${f}`);
    if (!btn) return;
    btn.className = f === filter ? "px-2.5 py-1 rounded-lg bg-indigo-600 text-white cursor-pointer" : "px-2.5 py-1 rounded-lg bg-[#181d2c] text-slate-400 cursor-pointer";
  });
  renderReferenceList();
}

function renderReferenceList() {
  const container = document.getElementById("reference-list-container");
  const countLabel = document.getElementById("ref-count-label");
  const query = (document.getElementById("ref-search-input")?.value || "").trim().toLowerCase();
  if (!container) return;

  let list = getAllWords();
  if (session.refFilter === "weak") list = list.filter((w) => (getWordStat(w.no).wrong || 0) > 0 && !getWordStat(w.no).mastered);
  else if (session.refFilter === "unmastered") list = list.filter((w) => !getWordStat(w.no).mastered);
  else if (session.refFilter === "bookmarked") list = list.filter((w) => !!getWordStat(w.no).bookmarked);

  if (query) {
    list = list.filter((w) => String(w.no) === query || (w.word || "").toLowerCase().includes(query) || (w.meaning || "").includes(query));
  }

  if (countLabel) countLabel.textContent = `${list.length}語`;
  const slice = list.slice(0, 150);
  if (slice.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 text-center py-8 font-bold">該当する単語が見つかりませんでした</p>`;
    return;
  }

  container.innerHTML = slice
    .map((w) => {
      const st = getWordStat(w.no);
      const star = st.bookmarked ? `<i class="fa-solid fa-star text-amber-400 text-[10px]"></i>` : "";
      return `
        <div onclick="openWordDetailModal(${w.no})" class="p-2.5 rounded-xl bg-[#181d2c] hover:bg-[#1f263b] border border-slate-800 flex items-center justify-between gap-2 cursor-pointer">
          <div class="min-w-0 text-left">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-black text-indigo-400">No.${w.no}</span>
              <span class="font-black text-xs text-white">${w.word}</span>
              ${star}
            </div>
            <div class="text-[11px] text-slate-400 truncate">${w.meaning}</div>
          </div>
          <button type="button" onclick="event.stopPropagation(); playSpeech('${(w.word || "").replace(/'/g, "\\'")}')" class="w-7 h-7 rounded-lg bg-[#121622] text-indigo-400 flex items-center justify-center shrink-0 cursor-pointer">
            <i class="fa-solid fa-volume-high text-[10px]"></i>
          </button>
        </div>
      `;
    })
    .join("");
}

function openWordDetailModal(no) {
  const word = getAllWords().find((w) => w.no === no);
  if (!word) return;
  const st = getWordStat(no);
  const content = document.getElementById("word-detail-content");
  if (!content) return;

  content.innerHTML = `
    <span class="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 text-xs font-black">No.${word.no} ・ ${word.pos || ""}</span>
    <h3 class="text-2xl font-black text-white mt-2">${word.word}</h3>
    <p class="text-xs text-slate-400 mb-3">${word.kana ? `[ ${word.kana} ]` : ""}</p>
    <div class="p-3 rounded-2xl bg-[#181d2c] font-black text-sm text-white mb-3">${word.meaning}</div>
    <p class="text-xs font-bold text-slate-400 mb-3">正解 ${st.correct || 0}回 / ミス ${st.wrong || 0}回</p>
    <div class="grid grid-cols-2 gap-2">
      <button type="button" onclick="playSpeech('${(word.word || "").replace(/'/g, "\\'")}')" class="py-2 rounded-xl bg-indigo-600 text-white font-black text-xs cursor-pointer">発音</button>
      <button type="button" onclick="toggleBookmarkInModal(${word.no})" class="py-2 rounded-xl bg-[#181d2c] text-amber-400 font-black text-xs cursor-pointer">${st.bookmarked ? "★解除" : "☆My単語帳"}</button>
    </div>
  `;
  document.getElementById("word-detail-modal")?.classList.remove("hidden");
}

function closeWordDetailModal() {
  document.getElementById("word-detail-modal")?.classList.add("hidden");
}

function toggleBookmarkInModal(no) {
  const st = getWordStat(no);
  st.bookmarked = !st.bookmarked;
  saveState(true);
  openWordDetailModal(no);
  renderReferenceList();
}

// ★ 新・ランク＆クラス仕様モーダル
function renderRankRulesModal() {
  const listEl = document.getElementById("rank-rules-list");
  if (!listEl) return;
  const curRank = getRankDetails(appState.totalScore);

  const orderedTiers = [...RANK_TIERS].reverse();
  listEl.innerHTML = orderedTiers
    .map((tier) => {
      const isCurrentTier = tier.id === curRank.tierId;
      const cardBorder = isCurrentTier ? "border-indigo-500 bg-gradient-to-br from-indigo-950/60 via-[#171c2e] to-[#131726] shadow-lg shadow-indigo-500/15" : "border-slate-800/90 bg-[#161b29]";
      const currentBadge = isCurrentTier
        ? `<span class="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-black whitespace-nowrap shrink-0 shadow-sm">${curRank.classNum ? `現在 クラス${curRank.classNum}` : "現在到達中"}</span>`
        : "";
      const stepNote = tier.id === "mythic" ? "最高位" : tier.stepLabel;

      return `
        <div class="p-3.5 rounded-2xl border ${cardBorder} space-y-2 text-left transition">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black whitespace-nowrap shrink-0 shadow-sm ${tier.pillCls}">
                <i class="fa-solid fa-crown text-[10px]"></i>
                <span>${tier.name}</span>
              </span>
              ${currentBadge}
            </div>
            <div class="text-right shrink-0">
              <div class="text-xs font-black text-white whitespace-nowrap tabular-nums">${tier.rangeText}</div>
              <div class="text-[10px] font-bold text-indigo-400 whitespace-nowrap">${stepNote}</div>
            </div>
          </div>
          <p class="text-[11px] font-bold text-slate-400 leading-relaxed">${tier.desc}</p>
        </div>
      `;
    })
    .join("");
}

function openScoreAttackModal() {
  const el = document.getElementById("sa-personal-best");
  if (el) el.textContent = `${(appState.saPersonalBest || 0).toLocaleString()} pt`;
  document.getElementById("score-attack-modal")?.classList.remove("hidden");
}
function closeScoreAttackModal() {
  document.getElementById("score-attack-modal")?.classList.add("hidden");
}
function openGuideModal() {
  document.getElementById("guide-modal")?.classList.remove("hidden");
}
function closeGuideModal() {
  document.getElementById("guide-modal")?.classList.add("hidden");
}
function openRankRulesModal() {
  renderRankRulesModal();
  document.getElementById("rank-rules-modal")?.classList.remove("hidden");
}
function closeRankRulesModal() {
  document.getElementById("rank-rules-modal")?.classList.add("hidden");
}

// 音声＆効果音
function playSpeech(customWord) {
  if (!appState.soundEnabled || typeof speechSynthesis === "undefined") return;
  const wordObj = session.questions[session.currentIndex];
  const text = customWord || (wordObj ? wordObj.word : "");
  if (!text) return;
  try {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 0.95;
    speechSynthesis.speak(utter);
  } catch {}
}

function playTone(isSuccess, isGodSpeed = false) {
  if (!appState.soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume().catch(() => {});

    const now = sharedAudioCtx.currentTime;

    const triggerNote = (freq, startOffset, duration, type = "triangle", peakGain = 0.14) => {
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(peakGain, now + startOffset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    if (isSuccess) {
      const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5, 1174.66, 1318.51, 1396.91, 1567.98, 1760.0, 1975.53, 2093.0];
      const stepIdx = Math.min(scale.length - 1, Math.max(0, session.combo - 1));
      const baseFreq = scale[stepIdx];
      const milestones = [3, 6, 11, 16, 21, 26, 31, 41, 50];
      const isMilestone = milestones.includes(session.combo) || (session.combo > 50 && session.combo % 10 === 0);

      if (isMilestone) {
        triggerNote(523.25, 0.0, 0.22, "triangle", 0.14);
        triggerNote(659.25, 0.045, 0.22, "triangle", 0.14);
        triggerNote(783.99, 0.09, 0.24, "triangle", 0.15);
        triggerNote(1046.5, 0.135, 0.36, "sine", 0.17);
        triggerNote(1318.51, 0.135, 0.36, "triangle", 0.1);
      } else {
        triggerNote(baseFreq, 0.0, 0.16, "triangle", 0.14);
        triggerNote(baseFreq * 1.25, 0.045, 0.22, "sine", 0.13);
      }

      if (isGodSpeed) {
        triggerNote(2093.0, 0.05, 0.28, "sine", 0.08);
      }
    } else {
      triggerNote(210, 0.0, 0.16, "sawtooth", 0.09);
      triggerNote(148, 0.09, 0.26, "sawtooth", 0.1);
      triggerNote(110, 0.09, 0.26, "triangle", 0.12);
    }
  } catch {}
}

// キーボードショートカット
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (!session.active || session.isPaused) return;

    // 解答済みの状態で Enter キーを押したら次の問題へ（日本語変換中のEnterは除外）
    if (e.key === "Enter" && !e.isComposing && session.answeredMap[session.currentIndex]) {
      if (session.type !== "score_attack") {
        e.preventDefault();
        nextQuestion();
      }
      return;
    }

    if (document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;

    if (session.activeMode === "choice" && !session.answeredMap[session.currentIndex]) {
      const keyMap = { 1: 0, 2: 1, 3: 2, 4: 3 };
      if (e.key in keyMap) {
        const btns = document.querySelectorAll(".option-choice-btn");
        if (btns[keyMap[e.key]] && !btns[keyMap[e.key]].disabled) btns[keyMap[e.key]].click();
      }
    }
    if (e.code === "Space") {
      e.preventDefault();
      playSpeech();
    }
  });
}

// Firebase同期＆ランキング
function initFirebaseAuthListener() {
  if (!auth) return;
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    updateAuthHeaderUI();
    if (user) {
      await pullFromFirestore();
      await syncToFirestore();
    }
  });
}

function updateAuthHeaderUI() {
  const label = document.getElementById("auth-header-label");
  const syncBadge = document.getElementById("sync-status-badge");
  const guestView = document.getElementById("auth-guest-view");
  const userView = document.getElementById("auth-user-view");
  const emailEl = document.getElementById("auth-user-email");

  if (currentUser) {
    const disp = appState.nickname || currentUser.displayName || (currentUser.email ? currentUser.email.split("@")[0] : "ログイン中");
    if (label) label.textContent = disp;
    if (syncBadge) syncBadge.innerHTML = `<i class="fa-solid fa-cloud"></i> クラウド同期中`;
    guestView?.classList.add("hidden");
    userView?.classList.remove("hidden");
    if (emailEl) emailEl.textContent = currentUser.email || "Google連携済み";
  } else {
    if (label) label.textContent = "ログイン";
    if (syncBadge) syncBadge.innerHTML = `<i class="fa-solid fa-hard-drive"></i> ローカル保存`;
    guestView?.classList.remove("hidden");
    userView?.classList.add("hidden");
  }
}

function openAuthModal() {
  updateAuthHeaderUI();
  document.getElementById("auth-error-msg")?.classList.add("hidden");
  document.getElementById("auth-modal")?.classList.remove("hidden");
}
function closeAuthModal() {
  document.getElementById("auth-modal")?.classList.add("hidden");
}

async function loginWithGoogle() {
  if (!auth) return;
  try {
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    closeAuthModal();
  } catch (e) {
    const errEl = document.getElementById("auth-error-msg");
    if (errEl) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  }
}

async function submitEmailAuth(event) {
  event.preventDefault();
  if (!auth) return;
  const email = document.getElementById("auth-email")?.value.trim();
  const pw = document.getElementById("auth-password")?.value;
  try {
    if (window._authAction === "signup") await auth.createUserWithEmailAndPassword(email, pw);
    else await auth.signInWithEmailAndPassword(email, pw);
    closeAuthModal();
  } catch (e) {
    const errEl = document.getElementById("auth-error-msg");
    if (errEl) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  }
}

async function logoutFirebase() {
  clearTimeout(cloudSyncTimer);
  if (auth) await auth.signOut();
  localStorage.removeItem(STORAGE_KEY);
  appState.ownerUid = "";
  appState.totalScore = 0;
  appState.carriedCombo = 0;
  appState.weeklyScore = 0;
  appState.weeklyLearnedCount = 0;
  appState.totalLearnedCount = 0;
  appState.dailyCount = 0;
  appState.streakDays = 1;
  appState.saPersonalBest = 0;
  appState.nickname = "";
  appState.wordStats = {};
  appState.coveredMap = {};
  appState.coveredLapMap = {};
  updateAuthHeaderUI();
  showStartScreen();
  closeAuthModal();
}

async function manualSyncNow() {
  if (!currentUser || !db) return;
  await pullFromFirestore();
  await syncToFirestore();
  const el = document.getElementById("auth-last-sync");
  if (el) el.textContent = `最終同期: ${new Date().toLocaleTimeString()}`;
}

async function pullFromFirestore() {
  if (!currentUser || !db) return;
  // 別アカウントのローカルデータが残っていた場合はリセットしてから読み込む
  if (appState.ownerUid && appState.ownerUid !== currentUser.uid) {
    localStorage.removeItem(STORAGE_KEY);
    appState.totalScore = 0;
    appState.weeklyScore = 0;
    appState.weeklyLearnedCount = 0;
    appState.totalLearnedCount = 0;
    appState.saPersonalBest = 0;
    appState.wordStats = {};
    appState.coveredMap = {};
    appState.coveredLapMap = {};
  }
  appState.ownerUid = currentUser.uid;
  try {
    const doc = await db.collection("users").doc(currentUser.uid).get();
    if (!doc.exists) return;
    const d = doc.data();
    if (d.seasonKey === appState.seasonKey) appState.totalScore = Math.max(appState.totalScore, d.totalScore || 0);
    if (d.weeklyKey === appState.weeklyKey) {
      appState.weeklyScore = Math.max(appState.weeklyScore || 0, d.weeklyScore || 0);
      appState.weeklyLearnedCount = Math.max(appState.weeklyLearnedCount || 0, d.weeklyLearnedCount || 0);
    }
    appState.totalLearnedCount = Math.max(appState.totalLearnedCount || 0, d.totalLearnedCount || 0);
    appState.saPersonalBest = Math.max(appState.saPersonalBest || 0, d.saPersonalBest || 0);
    if (!appState.nickname && d.nickname) appState.nickname = d.nickname;

    if (d.dailyKey === appState.dailyKey) {
      appState.dailyCount = Math.max(appState.dailyCount || 0, d.dailyCount || 0);
    }
    if (typeof d.dailyQuota === "number") appState.dailyQuota = d.dailyQuota;
    if (typeof d.streakDays === "number") appState.streakDays = Math.max(appState.streakDays || 1, d.streakDays);
    if (d.lastStudyDate && d.lastStudyDate > (appState.lastStudyDate || "")) {
      appState.lastStudyDate = d.lastStudyDate;
    }
    if (typeof d.darkMode === "boolean") appState.darkMode = d.darkMode;
    if (typeof d.soundEnabled === "boolean") appState.soundEnabled = d.soundEnabled;
    if (typeof d.showKana === "boolean") appState.showKana = d.showKana;
    if (typeof d.deviceViewMode === "string") appState.deviceViewMode = d.deviceViewMode;
    if (typeof d.statsDisplayMode === "string") appState.statsDisplayMode = d.statsDisplayMode;
    if (Array.isArray(d.srsIntervals) && d.srsIntervals.length > 0) appState.srsIntervals = d.srsIntervals;

    if (d.wordStats) {
      for (const [no, rSt] of Object.entries(d.wordStats)) {
        const lSt = getWordStat(no);
        lSt.correct = Math.max(lSt.correct || 0, rSt.correct || 0);
        lSt.wrong = Math.max(lSt.wrong || 0, rSt.wrong || 0);
        lSt.streak = Math.max(lSt.streak || 0, rSt.streak || 0);
        lSt.mastered = Boolean(lSt.mastered || rSt.mastered);
        lSt.bookmarked = Boolean(lSt.bookmarked || rSt.bookmarked);
        lSt.lastMistakeAt = Math.max(lSt.lastMistakeAt || 0, rSt.lastMistakeAt || 0);
        lSt.nextReviewAt = Math.max(lSt.nextReviewAt || 0, rSt.nextReviewAt || 0);
      }
    }
    appState.totalLearnedCount = Math.max(appState.totalLearnedCount || 0, computeTotalAnswersFromStats(appState.wordStats));
    saveState(false);
    updateDashboardUI();
    updateAuthHeaderUI();
  } catch {}
}

async function syncToFirestore() {
  if (!currentUser || !db) return;
  const nick = appState.nickname || currentUser.displayName || (currentUser.email ? currentUser.email.split("@")[0] : "学習者");
  const rank = getRankDetails(appState.totalScore);
  const totalWords = Math.max(appState.totalLearnedCount || 0, computeTotalAnswersFromStats(appState.wordStats));
  appState.totalLearnedCount = totalWords;
  const isStealthActive = Date.now() < (appState.hideLastLoginUntil || 0);
  const nextLoginTs = isStealthActive ? appState.lastKnownLoginAt || Date.now() : Date.now();
  if (!isStealthActive) appState.lastKnownLoginAt = nextLoginTs;
  const publicRankingData = {
    uid: currentUser.uid,
    nickname: nick,
    rankName: rank.fullName,
    totalScore: appState.totalScore,
    seasonKey: appState.seasonKey,
    weeklyKey: appState.weeklyKey,
    weeklyScore: appState.weeklyScore || 0,
    weeklyLearnedCount: appState.weeklyLearnedCount || 0,
    totalLearnedCount: totalWords,
    saPersonalBest: appState.saPersonalBest || 0,
    lastLoginAt: nextLoginTs,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  await Promise.all([
    db
      .collection("users")
      .doc(currentUser.uid)
      .set(
        {
          ...publicRankingData,
          dailyKey: appState.dailyKey || "",
          dailyCount: appState.dailyCount || 0,
          dailyQuota: appState.dailyQuota || 30,
          streakDays: appState.streakDays || 1,
          lastStudyDate: appState.lastStudyDate || "",
          darkMode: appState.darkMode !== false,
          soundEnabled: appState.soundEnabled !== false,
          showKana: !!appState.showKana,
          deviceViewMode: appState.deviceViewMode || "auto",
          statsDisplayMode: appState.statsDisplayMode || "mastery",
          srsIntervals: Array.isArray(appState.srsIntervals) ? appState.srsIntervals : [1, 3, 7, 14, 30],
          wordStats: appState.wordStats,
          coveredMap: appState.coveredMap || {},
          coveredLapMap: appState.coveredLapMap || {},
          hideLastLoginUntil: appState.hideLastLoginUntil || 0,
        },
        { merge: true },
      ),
    db.collection("leaderboard").doc(currentUser.uid).set(publicRankingData, { merge: true }),
  ]);
}

function formatLastLogin(lastLoginAt, updatedAt) {
  let ts = typeof lastLoginAt === "number" && lastLoginAt > 0 ? lastLoginAt : 0;
  if (!ts && updatedAt) {
    if (typeof updatedAt.toMillis === "function") ts = updatedAt.toMillis();
    else if (typeof updatedAt.seconds === "number") ts = updatedAt.seconds * 1000;
  }
  if (!ts) return { text: "記録なし", isRecent: false };

  const diffMs = Math.max(0, Date.now() - ts);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return { text: "たった今", isRecent: true };
  if (diffMin < 15) return { text: `${diffMin}分前`, isRecent: true };
  if (diffMin < 60) return { text: `${diffMin}分前`, isRecent: false };

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return { text: `${diffHour}時間前`, isRecent: false };

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return { text: `${diffDay}日前`, isRecent: false };

  const d = new Date(ts);
  return {
    text: `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    isRecent: false,
  };
}

function openScoreAttackRanking() {
  openRankingModal();
  switchRankingTab("score_attack");
}

function openRankingModal() {
  document.getElementById("ranking-modal")?.classList.remove("hidden");
  if (!currentUser) {
    document.getElementById("ranking-guest-notice")?.classList.remove("hidden");
    document.getElementById("ranking-member-area")?.classList.add("hidden");
  } else {
    document.getElementById("ranking-guest-notice")?.classList.add("hidden");
    document.getElementById("ranking-member-area")?.classList.remove("hidden");
    const nickInput = document.getElementById("ranking-nickname-input");
    if (nickInput) nickInput.value = appState.nickname || currentUser.displayName || "";
    loadLeaderboard();
  }
}

function closeRankingModal() {
  document.getElementById("ranking-modal")?.classList.add("hidden");
}

function switchRankingTab(tab) {
  session.currentRankingTab = tab;
  ["all", "weekly", "score_attack"].forEach((t) => {
    const btn = document.getElementById(`rank-tab-${t}`);
    if (!btn) return;
    btn.className = t === tab ? "py-1.5 rounded-lg bg-indigo-600 text-white shadow-sm transition cursor-pointer" : "py-1.5 rounded-lg text-slate-400 hover:text-white transition cursor-pointer";
  });
  loadLeaderboard();
}

async function saveRankingNickname(event) {
  event.preventDefault();
  const val = (document.getElementById("ranking-nickname-input")?.value || "").trim().slice(0, 12);
  if (!val) return;
  appState.nickname = val;
  saveState(false);
  updateAuthHeaderUI();
  await syncToFirestore();
  await loadLeaderboard();
}

async function loadLeaderboard() {
  const listEl = document.getElementById("leaderboard-list");
  const countLabel = document.getElementById("ranking-count-label");
  if (!listEl || !db) return;

  listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-8 font-bold"><i class="fa-solid fa-spinner fa-spin mr-1.5"></i>ランキングを読み込み中...</p>`;
  try {
    const snap = await db.collection("leaderboard").limit(100).get();
    const curSeason = getSeasonInfo().seasonKey;
    const curWeek = getMondayWeekKey();
    const rows = [];

    snap.forEach((doc) => {
      const d = doc.data();
      const seasonScore = d.seasonKey === curSeason ? d.totalScore || 0 : 0;
      const weeklyScore = d.weeklyKey === curWeek ? d.weeklyScore || 0 : 0;
      const weeklyWords = d.weeklyKey === curWeek ? d.weeklyLearnedCount || 0 : 0;
      const totalWords = d.totalLearnedCount || 0;
      const dynamicRank = getRankDetails(seasonScore).fullName;
      let metric = 0;
      if (session.currentRankingTab === "all") metric = seasonScore;
      else if (session.currentRankingTab === "weekly") metric = weeklyScore;
      else metric = d.saPersonalBest || 0;

      rows.push({
        uid: doc.id,
        nickname: d.nickname || "名無し",
        rankName: dynamicRank,
        metric,
        seasonScore,
        weeklyWords,
        totalWords,
        lastLogin: formatLastLogin(d.lastLoginAt, d.updatedAt),
      });
    });

    rows.sort((a, b) => b.metric - a.metric);
    if (countLabel) {
      countLabel.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>参加: ${rows.length} 名`;
    }

    listEl.innerHTML = rows
      .map((r, idx) => {
        const isMe = currentUser && r.uid === currentUser.uid;
        const pillCls = getTierPillClassByRankName(r.rankName);

        let cardStyle = "bg-[#161b29] border-slate-800/90";
        let rankBadgeHtml = `<span class="w-7 h-7 rounded-xl bg-[#1f263a] text-slate-300 font-black text-xs flex items-center justify-center shrink-0">${idx + 1}</span>`;

        if (idx === 0) {
          cardStyle = "bg-gradient-to-r from-amber-500/15 via-[#181d2e] to-[#161b29] border-amber-400/60 shadow-md shadow-amber-500/10";
          rankBadgeHtml = `<span class="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 shadow">1</span>`;
        } else if (idx === 1) {
          cardStyle = "bg-gradient-to-r from-slate-300/10 via-[#181d2e] to-[#161b29] border-slate-400/50";
          rankBadgeHtml = `<span class="w-7 h-7 rounded-xl bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900 font-black text-xs flex items-center justify-center shrink-0 shadow">2</span>`;
        } else if (idx === 2) {
          cardStyle = "bg-gradient-to-r from-orange-500/10 via-[#181d2e] to-[#161b29] border-orange-400/50";
          rankBadgeHtml = `<span class="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-300 to-amber-600 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 shadow">3</span>`;
        }

        if (isMe) {
          cardStyle += " ring-2 ring-indigo-500/80";
        }

        const meTag = isMe ? `<span class="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-black whitespace-nowrap shrink-0">YOU</span>` : "";

        const loginDot = r.lastLogin.isRecent
          ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>`
          : `<i class="fa-regular fa-clock text-[9px] text-slate-500 shrink-0"></i>`;

        const subScoreText = session.currentRankingTab !== "all" ? `<div class="text-[10px] font-bold text-slate-400 tabular-nums">累計 ${r.seasonScore.toLocaleString()} pt</div>` : "";

        return `
          <div class="p-3 rounded-2xl border ${cardStyle} space-y-2 transition">
            <!-- 上段：順位 ＋ ニックネーム ＋ ランク ＋ ポイント -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                ${rankBadgeHtml}
                <div class="min-w-0 text-left space-y-1">
                  <div class="flex items-center gap-1.5">
                    <span class="font-black text-sm text-white truncate">${r.nickname}</span>
                    ${meTag}
                  </div>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${pillCls}">
                      <i class="fa-solid fa-crown text-[8px]"></i>
                      <span>${r.rankName}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div class="text-right shrink-0">
                <div class="font-black text-base text-indigo-400 tabular-nums leading-tight">
                  ${r.metric.toLocaleString()} <span class="text-[10px] font-extrabold">pt</span>
                </div>
                ${subScoreText}
              </div>
            </div>

            <!-- 下段：最終ログイン時間 ＆ 総合・週間単語数 -->
            <div class="pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[10px] font-bold text-slate-400">
              <div class="flex items-center gap-1.5">
                ${loginDot}
                <span>最終: <strong class="${r.lastLogin.isRecent ? "text-emerald-400" : "text-slate-300"}">${r.lastLogin.text}</strong></span>
              </div>
              <div class="flex items-center gap-2.5 tabular-nums">
                <span>総合: <strong class="text-slate-200">${r.totalWords.toLocaleString()}語</strong></span>
                <span class="text-slate-600">|</span>
                <span>今週: <strong class="text-sky-400">${r.weeklyWords.toLocaleString()}語</strong></span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.error("ランキング取得エラー:", e);
    listEl.innerHTML = `<p class="text-xs text-rose-400 text-center py-6">ランキング取得失敗<br><span class="text-[10px] opacity-80">${e.code || e.message}</span></p>`;
  }
}
