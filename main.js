// ===== Firebase 初期化 =====
const firebaseConfig = {
  apiKey: "AIzaSyC76r8B4GursnhtJIQX-VciTAGhrmBPZA0",
  authDomain: "target1900-app-150dc.firebaseapp.com",
  projectId: "target1900-app-150dc",
  storageBucket: "target1900-app-150dc.firebasestorage.app",
  messagingSenderId: "176005487288",
  appId: "1:176005487288:web:cde8fda22fc54ca44bb24d",
};

let auth = null;
let db = null;
let currentUser = null;
let syncDebounceTimer = null;

try {
  if (typeof firebase !== "undefined") {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
  }
} catch (e) {
  console.warn("Firebase init skipped:", e);
}

// ===== 状態・定数管理 =====
let selectedCount = 10;
let selectedDifficulty = "basic";
let limitTime = 10;
let currentQuizMode = "choice";
let currentQuizOrder = "random"; // 'random' | 'cover_all' | 'weak_pool' | 'srs' | 'bookmarks' | 'weak' | 'score_attack' | 'single_word'
let activeCoverRangeKey = "";
let statsDisplayMode = "mastery"; // 'mastery' (/100語) | 'accuracy' (累計正答率)
window.quizDirection = "en_ja";
let currentPosFilter = "all"; // 'all' | '動詞' | '名詞' | '形容詞' | '副詞'
let deviceViewMode = "mobile"; // 'mobile' | 'wide'
let isScoreAttackRun = false;
let saRemainingMs = 0;
let saQuestionStartMs = 0;
let currentRankingTab = "all"; // 'all' | 'weekly' | 'score_attack'
let refStatusFilter = "all"; // 'all' | 'weak' | 'unmastered' | 'bookmarked'
let showKatakana = true;

let timerInterval = null;
let autoNextInterval = null;
let currentQuizTimeLeft = 0;
let currentQuizRemainingMs = 0;
let autoNextWaitLeft = 0;
let isPaused = false;
let isMuted = false;

let quizQuestions = [];
let currentIndex = 0;
let scoreCount = 0;
let sessionGainedScore = 0;
let isAnswered = false;
let currentSessionWrong = [];
let currentCombo = 0;
let maxCombo = 0;
let answerHistory = [];

const KEYS = {
  HISTORY: "target1900_mistake_history_v2",
  STATS: "target1900_stats_v1",
  MASTERED: "target1900_mastered_words_v1",
  THEME: "target1900_theme_v1",
  SCORE: "target1900_total_score",
  SEASON_ID: "target1900_season_id_v1",
  WEEKLY_DATA: "target1900_weekly_data_v1",
  SA_BEST: "target1900_score_attack_best_v1",
  KANA_VISIBLE: "target1900_kana_visible_v1",
  COVERED: "target1900_covered_pool_v1",
  SRS_DATA: "target1900_srs_data_v1",
  SRS_INTERVALS: "target1900_srs_intervals_v1",
  BOOKMARKS: "target1900_bookmarks_v1",
  STREAK: "target1900_streak_data_v1",
  DEVICE_MODE: "target1900_device_mode_v1",
  NICKNAME: "target1900_nickname_v1",
};

const DEFAULT_SRS_INTERVALS = [1, 3, 7, 14, 30];

const DIFF_CONFIG = {
  basic: { label: "基礎", sub: "10秒", time: 10, mult: 1.0, activeCls: "bg-indigo-600 text-white border-indigo-600" },
  applied: { label: "応用", sub: "5秒", time: 5, mult: 1.3, activeCls: "bg-amber-500 text-white border-amber-500" },
  hard: { label: "発展", sub: "2秒", time: 2, mult: 1.6, activeCls: "bg-orange-600 text-white border-orange-600" },
  tenfu: { label: "天賦", sub: "2秒･7文字以上優先", time: 2, mult: 2.1, activeCls: "bg-purple-600 text-white border-purple-600" },
  kiwami: { label: "極", sub: "2秒･8文字以上のみ", time: 2, mult: 2.8, activeCls: "bg-rose-600 text-white border-rose-600" },
};

// 新・ランク＆クラス定義（受験対策：2ヶ月シーズン制・階段制）
const RANK_LIST = [
  {
    name: "レジェンド",
    min: 100000,
    desc: "頂点。すべての単語が脳に焼き付いた証。入試本番で英語を武器にする最強の称号。",
    color: "bg-gradient-to-r from-amber-400 via-orange-500 to-yellow-300 text-slate-900 border-amber-300 shadow-xs font-black",
  },
  {
    name: "マスター",
    min: 60000,
    desc: "合格水準の直前関門。No.1〜1500の全範囲をノーミス・3秒以内で叩き出す最終調整エリア。",
    color: "bg-purple-500/10 text-purple-600 border-purple-400 font-extrabold",
  },
  {
    name: "エキスパート",
    min: 35000,
    classStep: 5000,
    desc: "上級者の壁。派生語や抽象語も網羅し、あらゆる入試問題に対応できる反射神経を養う。",
    color: "bg-rose-500/10 text-rose-600 border-rose-400 font-bold",
  },
  {
    name: "エリート",
    min: 17500,
    classStep: 3500,
    desc: "本格的な実力者ゾーン。長文読解でも迷わない語彙力を手に入れ、模試の点数に繋げる。",
    color: "bg-indigo-500/10 text-indigo-600 border-indigo-400 font-bold",
  },
  {
    name: "ハイパー",
    min: 7500,
    classStep: 2000,
    desc: "中堅へのステップ。忘却曲線（SRS）を活用し、記憶の定着率を高めるゾーン。",
    color: "bg-cyan-500/10 text-cyan-600 border-cyan-400 font-bold",
  },
  {
    name: "スーパー",
    min: 2500,
    classStep: 1000,
    desc: "定着の初期段階。意味を見た瞬間に頭に浮かぶ3秒反射スピードを意識し始めよう。",
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-400 font-bold",
  },
  {
    name: "ビギナー",
    min: 0,
    classStep: 500,
    desc: "基礎の土台作り。まずは毎日アプリを開く習慣をつけ、基礎単語を確実に固めよう。",
    color: "bg-slate-100 text-slate-600 border-slate-300 font-bold",
  },
];

// ===== ユーティリティ =====
const $ = (id) => document.getElementById(id);
const getStorageJSON = (key, fallback = {}) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const setStorageJSON = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};
const getAllWords = () => (typeof getAppWordData === "function" ? getAppWordData() : typeof wordsDataSet !== "undefined" ? wordsDataSet : []);

function shuffleArray(arr) {
  const res = [...arr];
  for (let i = res.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [res[i], res[j]] = [res[j], res[i]];
  }
  return res;
}

function escapeHTML(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRelativeTime(timestampVal) {
  if (!timestampVal) return "記録なし";
  let dateObj = null;
  if (typeof timestampVal.toDate === "function") {
    dateObj = timestampVal.toDate();
  } else if (typeof timestampVal === "number") {
    dateObj = new Date(timestampVal);
  }
  if (!dateObj || isNaN(dateObj.getTime())) return "最近";

  const diffSec = Math.floor((Date.now() - dateObj.getTime()) / 1000);
  if (diffSec < 60) return "たった今";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}日前`;
}

// ===== 12/1起点・2ヶ月シーズン自動リセット＆残り日数計算 =====
function getCurrentSeasonInfo(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0=Jan ... 11=Dec

  // 2026年12月1日までは「プレシーズン（2026-12-01開始待機）」として扱い、12月1日に初回リセットを実行
  const firstSeasonStart = new Date(2026, 11, 1, 0, 0, 0, 0);
  if (now < firstSeasonStart) {
    const diffDays = Math.ceil((firstSeasonStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      seasonId: "PRE_2026_12",
      daysLeft: diffDays,
      label: `シーズン1開始まで: あと ${diffDays} 日 (12/1起点)`,
    };
  }

  // 2026年12月1日以降は偶数ヶ月(12-1, 2-3, 4-5, 6-7, 8-9, 10-11)の2ヶ月サイクル
  let startYear = y;
  let startMonth = m;
  if (m === 0) {
    startYear = y - 1;
    startMonth = 11;
  } else if (m % 2 === 0) {
    startMonth = m - 1;
  }

  const nextStartMonth = (startMonth + 2) % 12;
  const nextStartYear = startMonth + 2 >= 12 ? startYear + 1 : startYear;
  const nextSeasonDate = new Date(nextStartYear, nextStartMonth, 1, 0, 0, 0, 0);
  const daysLeft = Math.max(1, Math.ceil((nextSeasonDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const seasonId = `${startYear}-${String(startMonth + 1).padStart(2, "0")}`;

  return {
    seasonId,
    daysLeft,
    label: `シーズン残り: あと ${daysLeft} 日 (12/1起点・2ヶ月更新)`,
  };
}

function checkAndHandleSeasonReset() {
  const info = getCurrentSeasonInfo();
  const savedSeasonId = localStorage.getItem(KEYS.SEASON_ID);

  if (!savedSeasonId) {
    localStorage.setItem(KEYS.SEASON_ID, info.seasonId);
  } else if (savedSeasonId !== info.seasonId) {
    // シーズン切り替わり時にポイント・ランクのみ自動リセット（単語習得履歴・My単語帳・弱点は保持）
    localStorage.setItem(KEYS.SCORE, "0");
    localStorage.setItem(KEYS.SEASON_ID, info.seasonId);
    scheduleCloudPush();
  }

  const seasonLabelEl = $("season-days-left");
  if (seasonLabelEl) {
    seasonLabelEl.innerText = info.label;
  }
}

// ===== 月曜始まりの週間学習記録（weeklyLearned） =====
function getMondayWeekKey(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeeklyData() {
  const weekKey = getMondayWeekKey();
  const saved = getStorageJSON(KEYS.WEEKLY_DATA, { weekKey, wordsCount: 0, points: 0 });
  if (saved.weekKey !== weekKey) {
    const resetData = { weekKey, wordsCount: 0, points: 0 };
    setStorageJSON(KEYS.WEEKLY_DATA, resetData);
    return resetData;
  }
  return saved;
}

function addWeeklyProgress(wordsAdded, pointsAdded) {
  const data = getWeeklyData();
  data.wordsCount = (data.wordsCount || 0) + wordsAdded;
  data.points = (data.points || 0) + pointsAdded;
  setStorageJSON(KEYS.WEEKLY_DATA, data);
  updateWeeklyUI();
}

function updateWeeklyUI() {
  const data = getWeeklyData();
  const el = $("weekly-learned-count");
  if (el) {
    el.innerText = `${(data.wordsCount || 0).toLocaleString()} 語`;
  }
}

// ===== カタカナ読みON/OFF管理 =====
function initKatakanaSetting() {
  const saved = localStorage.getItem(KEYS.KANA_VISIBLE);
  showKatakana = saved === null ? true : saved === "true";
  updateKatakanaUI();
}

function toggleKatakanaVisibility() {
  showKatakana = !showKatakana;
  localStorage.setItem(KEYS.KANA_VISIBLE, String(showKatakana));
  updateKatakanaUI();
}
window.toggleKatakanaVisibility = toggleKatakanaVisibility;

function updateKatakanaUI() {
  const cfgCheckbox = $("katakana-toggle-checkbox");
  if (cfgCheckbox) cfgCheckbox.checked = showKatakana;

  const quizBtn = $("quiz-kana-toggle-btn");
  if (quizBtn) {
    quizBtn.innerHTML = showKatakana ? '<i class="fa-solid fa-eye text-[10px]"></i><span>読みON</span>' : '<i class="fa-solid fa-eye-slash text-[10px]"></i><span>読みOFF</span>';
    quizBtn.className = showKatakana
      ? "px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/70 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
      : "px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition";
  }

  const kanaEl = $("word-kana");
  if (kanaEl && quizQuestions[currentIndex]) {
    const q = quizQuestions[currentIndex];
    const isJaToEn = window.quizDirection === "ja_en";
    if (currentQuizMode === "choice" && !isJaToEn) {
      if (showKatakana) {
        kanaEl.innerText = `[ ${q.kana || ""} ]`;
        kanaEl.classList.remove("kana-hidden-state");
      } else {
        kanaEl.innerText = "[ カタカナ非表示 ]";
        kanaEl.classList.add("kana-hidden-state");
      }
    }
  }
}

// ===== ユーザーランク＆クラス判定ロジック =====
function getUserRankInfo(score) {
  if (score >= 100000) {
    return { name: "レジェンド", classNum: null, color: RANK_LIST[0].color, currentMin: 100000, nextPt: null };
  }
  if (score >= 60000) {
    return { name: "マスター", classNum: null, color: RANK_LIST[1].color, currentMin: 60000, nextPt: 100000 };
  }

  for (let i = 2; i < RANK_LIST.length; i++) {
    const r = RANK_LIST[i];
    const nextRMin = RANK_LIST[i - 1].min;
    if (score >= r.min && score < nextRMin) {
      const diff = score - r.min;
      const step = r.classStep;
      const levelIdx = Math.min(4, Math.floor(diff / step));
      const currentClass = 5 - levelIdx;
      const currentMin = r.min + levelIdx * step;
      const nextTarget = r.min + (levelIdx + 1) * step;
      return { name: r.name, classNum: currentClass, color: r.color, currentMin, nextPt: nextTarget };
    }
  }
  return { name: "ビギナー", classNum: 5, color: RANK_LIST[RANK_LIST.length - 1].color, currentMin: 0, nextPt: 500 };
}

function getRankFullLabel(score) {
  const info = getUserRankInfo(score);
  return info.classNum ? `${info.name} クラス${info.classNum}` : info.name;
}

// ===== ランク初期化機能 =====
async function resetRankScore() {
  const currentScore = parseInt(localStorage.getItem(KEYS.SCORE), 10) || 0;
  if (currentScore === 0) {
    alert("現在のポイントはすでに 0 pt（ビギナー クラス5）です。");
    return;
  }
  if (!confirm(`現在の累計ポイント（${currentScore.toLocaleString()} pt）とランクを初期化し、0 pt（ビギナー クラス5）に戻しますか？\n※単語の習得記録や弱点リストは消えません。`)) {
    return;
  }

  localStorage.setItem(KEYS.SCORE, "0");
  updateRankUI();
  if (currentUser && db) {
    await pushLocalDataToCloud();
  }
  alert("ランクとポイントを初期化しました（0 pt / ビギナー クラス5）。");
}
window.resetRankScore = resetRankScore;

// ===== デバイス最適化（スマホ／PCワイド切替） =====
function toggleDeviceViewMode() {
  deviceViewMode = deviceViewMode === "mobile" ? "wide" : "mobile";
  localStorage.setItem(KEYS.DEVICE_MODE, deviceViewMode);
  applySavedDeviceMode();
}
window.toggleDeviceViewMode = toggleDeviceViewMode;

function applySavedDeviceMode() {
  const saved = localStorage.getItem(KEYS.DEVICE_MODE) || "mobile";
  deviceViewMode = saved;
  const mainEl = $("main-container");
  const iconEl = $("device-icon");
  const labelEl = $("device-label");

  if (!mainEl) return;

  if (deviceViewMode === "wide") {
    mainEl.style.maxWidth = "768px";
    if (iconEl) iconEl.className = "fa-solid fa-desktop text-xs";
    if (labelEl) labelEl.innerText = "ワイド";
  } else {
    mainEl.style.maxWidth = "512px";
    if (iconEl) iconEl.className = "fa-solid fa-mobile-screen text-xs";
    if (labelEl) labelEl.innerText = "スマホ";
  }
}

// ===== 4ステップ階層画面遷移（ダッシュボード ⇔ 設定 ⇔ クイズ ⇔ リザルト） =====
function showStartScreen() {
  $("quiz-screen")?.classList.add("hidden");
  $("result-screen")?.classList.add("hidden");
  $("config-screen")?.classList.add("hidden");
  $("dashboard-screen")?.classList.remove("hidden");
  $("analytics-section")?.classList.remove("hidden");

  checkAndHandleSeasonReset();
  updateWeeklyUI();
  renderReviewButtons();
  renderAdvancedHomeUI();
  renderStatsGraph();
  updateRankUI();
}
window.showStartScreen = showStartScreen;

function openConfigScreen() {
  $("dashboard-screen")?.classList.add("hidden");
  $("analytics-section")?.classList.add("hidden");
  $("quiz-screen")?.classList.add("hidden");
  $("result-screen")?.classList.add("hidden");
  $("config-screen")?.classList.remove("hidden");
  $("config-screen")?.classList.add("screen-animate");

  updateOrderProgressBadge();
  updateKatakanaUI();
}
window.openConfigScreen = openConfigScreen;

// ===== スコアアタック（公式レギュレーション） =====
function openScoreAttackModal() {
  const best = parseInt(localStorage.getItem(KEYS.SA_BEST), 10) || 0;
  if ($("sa-personal-best")) $("sa-personal-best").innerText = `${best.toLocaleString()} pt`;
  $("score-attack-modal")?.classList.remove("hidden");
}
window.openScoreAttackModal = openScoreAttackModal;

function closeScoreAttackModal() {
  $("score-attack-modal")?.classList.add("hidden");
}
window.closeScoreAttackModal = closeScoreAttackModal;

function startScoreAttackMode() {
  unlockAudio();
  cancelAnimationFrame(timerInterval);
  clearInterval(autoNextInterval);

  const allWords = getAllWords();
  const pool = allWords.filter((w) => Number(w.no) >= 1 && Number(w.no) <= 1500);
  if (pool.length === 0) {
    alert("単語データが読み込まれていません。");
    return;
  }
  // ★追加：スコアアタック前のユーザー設定を保存しておく
  if (!isScoreAttackRun) {
    window._preSaConfig = {
      direction: window.quizDirection,
      mode: currentQuizMode,
      order: currentQuizOrder,
      difficulty: selectedDifficulty,
      count: selectedCount,
    };
  }
  isScoreAttackRun = true;
  window.quizDirection = "en_ja";

  currentQuizMode = "choice";
  currentQuizOrder = "score_attack";
  selectedDifficulty = "tenfu"; // ★天賦モード固定（倍率2.1倍・7文字以上優先）
  limitTime = 60;
  selectedCount = 9999;

  saRemainingMs = 60 * 1000; // ★全体60秒カウントダウン
  sessionGainedScore = 0;
  isPaused = false;
  currentQuizTimeLeft = 60;
  autoNextWaitLeft = 0;
  currentCombo = 0;
  maxCombo = 0;
  answerHistory = [];
  scoreCount = 0;
  currentIndex = 0;
  currentSessionWrong = [];
  activeCoverRangeKey = "";

  // 天賦仕様（7文字以上を優先し、残りを後ろに連結）
  const over7 = shuffleArray(pool.filter((w) => String(w.word || "").trim().length >= 7));
  const under7 = shuffleArray(pool.filter((w) => String(w.word || "").trim().length < 7));
  quizQuestions = [...over7, ...under7];

  if ($("pause-overlay")) $("pause-overlay").style.display = "none";
  $("dashboard-screen")?.classList.add("hidden");
  $("config-screen")?.classList.add("hidden");
  $("result-screen")?.classList.add("hidden");
  $("analytics-section")?.classList.add("hidden");
  $("quiz-screen")?.classList.remove("hidden");

  if ($("quiz-mode-badge")) {
    $("quiz-mode-badge").className = "text-[10px] font-black text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-2.5 py-0.5 rounded-full";
    $("quiz-mode-badge").innerHTML = '<i class="fa-solid fa-bolt mr-1"></i>スコアアタック【天賦60秒】';
  }

  showQuestion();
}
window.startScoreAttackMode = startScoreAttackMode;

function restorePreScoreAttackConfig() {
  if (window._preSaConfig) {
    const cfg = window._preSaConfig;
    setQuizDirection(cfg.direction || "en_ja");
    selectQuizMode(cfg.mode || "choice");
    selectQuizOrder(cfg.order || "random");
    setDifficulty(cfg.difficulty || "basic");
    selectedCount = cfg.count || 10;
    window._preSaConfig = null;
  } else {
    // 万が一退避データがない場合でも、現在の選択難易度から制限時間を必ず再計算する
    setDifficulty(selectedDifficulty);
    if (currentQuizOrder === "score_attack") selectQuizOrder("random");
  }
}

// ===== ガイドモーダル（？マーク公式推奨設定） =====
function openGuideModal() {
  $("guide-modal")?.classList.remove("hidden");
}
window.openGuideModal = openGuideModal;

function closeGuideModal() {
  $("guide-modal")?.classList.add("hidden");
}
window.closeGuideModal = closeGuideModal;

function applyRecommendedPlan(planType) {
  if (planType === "royal") {
    selectQuizOrder("cover_all");
    selectQuizMode("choice");
    setQuickQuestionCount(25);
    setDifficulty("applied");
  } else if (planType === "weak") {
    selectQuizOrder("weak_pool");
    selectQuizMode("choice");
    setQuickQuestionCount(20);
    setDifficulty("applied");
  } else if (planType === "mythic") {
    selectQuizOrder("random");
    selectQuizMode("choice");
    setQuickQuestionCount(50);
    setDifficulty("hard");
  }
  closeGuideModal();
}
window.applyRecommendedPlan = applyRecommendedPlan;

// ===== 全単語リファレンス（辞書検索＆個別詳細モーダル） =====
function openReferenceModal() {
  $("reference-modal")?.classList.remove("hidden");
  renderReferenceList();
}
window.openReferenceModal = openReferenceModal;

function closeReferenceModal() {
  $("reference-modal")?.classList.add("hidden");
}
window.closeReferenceModal = closeReferenceModal;

function setRefStatusFilter(filter) {
  refStatusFilter = filter;
  ["all", "weak", "unmastered", "bookmarked"].forEach((key) => {
    const btn = $(`ref-filter-${key}`);
    if (btn) {
      btn.className =
        key === filter
          ? "px-2.5 py-1 rounded-lg bg-indigo-600 text-white shrink-0 cursor-pointer"
          : "px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0 cursor-pointer";
    }
  });
  renderReferenceList();
}
window.setRefStatusFilter = setRefStatusFilter;

function renderReferenceList() {
  const container = $("reference-list-container");
  const countLabel = $("ref-count-label");
  if (!container) return;

  const query = ($("ref-search-input")?.value || "").trim().toLowerCase();
  const allWords = getAllWords();
  const mistakeMap = getMistakeHistoryMap();
  const masteredSet = new Set((getStorageJSON(KEYS.MASTERED, []) || []).map(Number));
  const bookmarkSet = new Set((getBookmarks() || []).map(Number));

  const filtered = allWords.filter((w) => {
    const no = Number(w.no);
    if (refStatusFilter === "weak" && !(mistakeMap[no] && mistakeMap[no].mistakeCount > 0)) return false;
    if (refStatusFilter === "unmastered" && masteredSet.has(no)) return false;
    if (refStatusFilter === "bookmarked" && !bookmarkSet.has(no)) return false;

    if (query) {
      const matchNo = String(no) === query || String(no).includes(query);
      const matchWord = String(w.word || "")
        .toLowerCase()
        .includes(query);
      const matchMean = String(w.meaning || "")
        .toLowerCase()
        .includes(query);
      const matchKana = String(w.kana || "").includes(query);
      if (!matchNo && !matchWord && !matchMean && !matchKana) return false;
    }
    return true;
  });

  if (countLabel) countLabel.innerText = `${filtered.length} / ${allWords.length}語`;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-center text-xs text-slate-400 py-8 font-bold">条件に一致する単語が見つかりませんでした</div>`;
    return;
  }

  // パフォーマンス最適化のため最大150件まで描画（検索すると全1500語から即ヒット）
  const sliceList = filtered.slice(0, 150);
  container.innerHTML =
    sliceList
      .map((w) => {
        const no = Number(w.no);
        const isMastered = masteredSet.has(no);
        const isWeak = mistakeMap[no] && mistakeMap[no].mistakeCount > 0;
        const isStar = bookmarkSet.has(no);

        return `
        <div onclick="openWordDetailModal(${no})" class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-2 cursor-pointer transition text-left">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-100/80 dark:bg-indigo-950 px-1.5 py-0.5 rounded">No.${no}</span>
              <span class="font-black text-xs sm:text-sm text-slate-800 dark:text-slate-100">${escapeHTML(w.word)}</span>
              <span class="text-[10px] text-slate-400 font-bold">${escapeHTML(w.pos || "")}</span>
              ${isWeak ? `<span class="text-[9px] font-black bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 px-1.5 py-0.2 rounded">ミス${mistakeMap[no].mistakeCount}</span>` : ""}
              ${isMastered && !isWeak ? `<span class="text-[9px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.2 rounded">習得済</span>` : ""}
            </div>
            <p class="text-[11px] font-bold text-slate-600 dark:text-slate-300 mt-0.5 truncate">${escapeHTML(w.meaning)}</p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${isStar ? '<i class="fa-solid fa-star text-amber-400 text-xs"></i>' : ""}
            <i class="fa-solid fa-chevron-right text-[10px] text-slate-400"></i>
          </div>
        </div>
      `;
      })
      .join("") + (filtered.length > 150 ? `<div class="text-center text-[10px] text-slate-400 py-2 font-bold">上位150件を表示中（検索ボックスで単語・番号を絞り込めます）</div>` : "");
}
window.renderReferenceList = renderReferenceList;

function openWordDetailModal(wordNo) {
  const wordObj = getAllWords().find((w) => Number(w.no) === Number(wordNo));
  if (!wordObj) return;

  const no = Number(wordObj.no);
  const mistakeInfo = getMistakeHistoryMap()[no];
  const srsInfo = getStorageJSON(KEYS.SRS_DATA, {})[String(no)];
  const isBookmarked = getBookmarks().map(Number).includes(no);
  const safeWord = String(wordObj.word || "").replace(/'/g, "\\'");

  const synonymsHtml =
    wordObj.synonyms && wordObj.synonyms.length > 0
      ? `<div class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-left">
          <div class="text-[10px] font-extrabold text-slate-400 mb-1">類義語・関連語</div>
          <div class="flex flex-wrap gap-1">${wordObj.synonyms.map((s) => `<span class="bg-indigo-100 dark:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded text-[10px] font-bold">${escapeHTML(s)}</span>`).join("")}</div>
         </div>`
      : "";

  const contentEl = $("word-detail-content");
  if (contentEl) {
    contentEl.innerHTML = `
      <div class="flex items-center justify-center gap-2 mb-2">
        <span class="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-black px-3 py-1 rounded-full text-xs">No. ${no}</span>
        <span class="bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold px-2.5 py-0.5 rounded-full text-xs">${escapeHTML(wordObj.pos || "")}</span>
      </div>
      <div class="flex items-center justify-center gap-2 my-2">
        <h3 class="text-2xl sm:text-3xl font-black">${escapeHTML(wordObj.word)}</h3>
        <button type="button" onclick="speakWordText('${safeWord}')" class="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center cursor-pointer hover:bg-indigo-200 transition">
          <i class="fa-solid fa-volume-high text-sm"></i>
        </button>
      </div>
      <p class="text-xs font-extrabold text-slate-500 dark:text-slate-400 mb-2">[ ${escapeHTML(wordObj.kana || "")} ]</p>
      <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 font-black text-sm text-slate-800 dark:text-slate-100 mb-3">
        ${escapeHTML(wordObj.meaning)}
      </div>
      <div class="grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-3">
        <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">ミス累計: <strong class="text-rose-500">${mistakeInfo?.mistakeCount || 0} 回</strong></div>
        <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">記憶ステージ: <strong class="text-emerald-500">Lv.${srsInfo?.stage || 0}</strong></div>
      </div>
      ${synonymsHtml}
      <div class="grid grid-cols-2 gap-2 mt-4">
        <button type="button" onclick="toggleBookmark(${no}); openWordDetailModal(${no});" class="py-2.5 px-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-black text-xs flex items-center justify-center gap-1 cursor-pointer">
          <i class="fa-${isBookmarked ? "solid" : "regular"} fa-star"></i><span>${isBookmarked ? "登録済" : "My単語帳"}</span>
        </button>
        <button type="button" onclick="startSingleWordPractice(${no})" class="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-1 cursor-pointer">
          <i class="fa-solid fa-play"></i><span>この単語をテスト</span>
        </button>
      </div>
    `;
  }
  $("word-detail-modal")?.classList.remove("hidden");
}
window.openWordDetailModal = openWordDetailModal;

function closeWordDetailModal() {
  $("word-detail-modal")?.classList.add("hidden");
}
window.closeWordDetailModal = closeWordDetailModal;

function startSingleWordPractice(wordNo) {
  const target = getAllWords().find((w) => Number(w.no) === Number(wordNo));
  if (!target) return;
  closeWordDetailModal();
  closeReferenceModal();
  unlockAudio();
  isScoreAttackRun = false;
  currentQuizOrder = "single_word";
  quizQuestions = [target];
  setupQuizEnvironment();
}
window.startSingleWordPractice = startSingleWordPractice;

// ===== ランク概要説明ポップアップ ＆ 追加UIの動的インジェクション =====
function injectAdvancedUI() {
  applySavedDeviceMode();

  const rankBadge = $("user-rank-badge");
  if (rankBadge && !$("rank-info-btn")) {
    const btn = document.createElement("button");
    btn.id = "rank-info-btn";
    btn.type = "button";
    btn.onclick = openRankModal;
    btn.className =
      "w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center hover:bg-indigo-600 hover:text-white transition cursor-pointer";
    btn.innerHTML = '<i class="fa-solid fa-question"></i>';
    rankBadge.insertAdjacentElement("afterend", btn);

    const scoreDisplay = $("total-score-display");
    if (scoreDisplay && !$("score-info-btn")) {
      const scoreBtn = document.createElement("button");
      scoreBtn.id = "score-info-btn";
      scoreBtn.type = "button";
      scoreBtn.onclick = openScoreModal;
      scoreBtn.title = "ポイントの計算ルールを見る";
      scoreBtn.className =
        "w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center hover:bg-indigo-600 hover:text-white transition cursor-pointer";
      scoreBtn.innerHTML = '<i class="fa-solid fa-question"></i>';
      scoreDisplay.insertAdjacentElement("afterend", scoreBtn);
    }
  }

  // 出題設定画面に「カタカナ読みON/OFF」スイッチを統合挿入
  const autoSpeechToggle = $("auto-speech-toggle");
  const speechCard = autoSpeechToggle?.closest(".config-card");
  if (speechCard && !$("katakana-toggle-checkbox")) {
    const kanaRow = document.createElement("div");
    kanaRow.className = "flex items-center justify-between pt-1.5 mt-1.5 border-t border-slate-200/60 dark:border-slate-700/60";
    kanaRow.innerHTML = `
      <span class="text-[10px] text-slate-500 dark:text-slate-400 font-bold">カタカナ読み表示</span>
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" id="katakana-toggle-checkbox" checked onchange="toggleKatakanaVisibility()" class="sr-only peer" />
        <div class="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
      </label>
    `;
    speechCard.appendChild(kanaRow);
  }

  // クイズ画面のカタカナ表示横にワンタップ切替ボタンを配置
  const wordKanaEl = $("word-kana");
  if (wordKanaEl && !$("quiz-kana-toggle-btn")) {
    const wrapper = document.createElement("div");
    wrapper.className = "flex items-center justify-center gap-2 my-1";
    wordKanaEl.parentNode.insertBefore(wrapper, wordKanaEl);
    wrapper.appendChild(wordKanaEl);

    const toggleBtn = document.createElement("button");
    toggleBtn.id = "quiz-kana-toggle-btn";
    toggleBtn.type = "button";
    toggleBtn.onclick = toggleKatakanaVisibility;
    toggleBtn.title = "カタカナ読みの表示/非表示を切り替え";
    wrapper.appendChild(toggleBtn);
  }

  const reviewContainer = $("home-review-btn-container");
  if (reviewContainer && !$("advanced-modes-grid")) {
    const wrapper = document.createElement("div");
    wrapper.id = "advanced-modes-grid";
    wrapper.className = "space-y-2 mb-3";
    reviewContainer.insertAdjacentElement("beforebegin", wrapper);
  }
  renderAdvancedHomeUI();

  if (!$("global-modals-container")) {
    const modContainer = document.createElement("div");
    modContainer.id = "global-modals-container";
    modContainer.innerHTML = `
      <!-- RANK INFO MODAL -->
      <div id="rank-info-modal" onclick="if(event.target===this) closeRankModal()" class="hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-5 shadow-2xl relative max-h-[85vh] flex flex-col">
          <button type="button" onclick="closeRankModal()" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center cursor-pointer">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <div class="text-center mb-3 shrink-0">
            <div class="w-11 h-11 bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-1 text-lg">
              <i class="fa-solid fa-crown"></i>
            </div>
            <h3 class="text-base font-black">新・ランク＆クラス仕様（2ヶ月シーズン制）</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">12/1起点で2ヶ月ごとにリセット！クラス5→1を駆け上がろう</p>
          </div>
          <div id="rank-modal-list" class="space-y-2 overflow-y-auto pr-1 flex-1 mb-3"></div>
          <button type="button" onclick="closeRankModal()" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-sm transition cursor-pointer shrink-0">閉じる</button>
        </div>
      </div>
<!-- SITE ABOUT MODAL（このサイト・アプリの説明） -->
      <div id="site-about-modal" onclick="if(event.target===this) closeSiteAboutModal()" class="hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-5 shadow-2xl relative max-h-[85vh] flex flex-col">
          <button type="button" onclick="closeSiteAboutModal()" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center cursor-pointer">
            <i class="fa-solid fa-xmark"></i>
          </button>

          <div class="text-center mb-3 shrink-0">
            <div class="w-11 h-11 bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-1 text-lg">
              <i class="fa-solid fa-graduation-cap"></i>
            </div>
            <h3 class="text-base font-black">このアプリについて</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">入試長文で迷わない「3秒以内の反射語彙力」を鍛える学習ツール</p>
          </div>

          <div class="space-y-2.5 overflow-y-auto pr-1 flex-1 mb-3 text-left text-xs">
            <div class="p-3 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900">
              <div class="font-black text-indigo-700 dark:text-indigo-300 mb-1"><i class="fa-solid fa-bolt mr-1"></i>コンセプト：3秒以内の即答トレーニング</div>
              <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">
                受験英語で最も重要なのは「単語を見て意味が浮かぶまでのスピード」です。2秒・3秒以内の反射解答にボーナスを与える設計で、実戦的な処理速度を身につけます。
              </p>
            </div>

            <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-1.5">
              <div class="font-black text-slate-700 dark:text-slate-200"><i class="fa-solid fa-layer-group text-indigo-500 mr-1"></i>主な学習モード</div>
              <ul class="space-y-1 text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
                <li>・<strong>カスタム演習</strong>：範囲・品詞・4択／スペル入力・出題順（ランダム／1周網羅／弱点プール）を自由に設定</li>
                <li>・<strong>忘却曲線（SRS）復習</strong>：記憶の定着度に合わせて最適なタイミングで自動出題</li>
                <li>・<strong>スコアアタック</strong>：60秒間・問題数無制限・天賦モード（2.1倍）で限界に挑む公式戦</li>
                <li>・<strong>全単語リファレンス</strong>：全単語の検索・音声再生・My単語帳登録・個別テスト</li>
              </ul>
            </div>

            <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
              <div class="font-black text-slate-700 dark:text-slate-200 mb-1"><i class="fa-solid fa-cloud-arrow-up text-emerald-500 mr-1"></i>データ保存とマルチデバイス同期</div>
              <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">
                ログインなしでもブラウザに自動保存されます。アカウントログインすると、PC・iPad・スマホ間でのデータ同期やメンバーランキングへの参加が可能です。
              </p>
            </div>
          </div>

          <button type="button" onclick="closeSiteAboutModal()" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-sm transition cursor-pointer shrink-0">閉じる</button>
        </div>
      </div>
      <!-- SRS SETTINGS MODAL -->
      <div id="srs-settings-modal" onclick="if(event.target===this) closeSrsSettingsModal()" class="hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-5 shadow-2xl relative">
          <button type="button" onclick="closeSrsSettingsModal()" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center cursor-pointer">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <div class="text-center mb-4">
            <div class="w-11 h-11 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-1.5 text-lg">
              <i class="fa-solid fa-calendar-check"></i>
            </div>
            <h3 class="text-base font-black">忘却曲線（SRS）間隔設定</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">連続正解したときの次回復習までの日数を設定します</p>
          </div>
          <div class="mb-3">
            <label class="block text-[11px] font-bold text-slate-500 mb-1.5">おすすめプリセット</label>
            <div class="grid grid-cols-3 gap-1.5">
              <button type="button" onclick="applySrsPreset('1, 3, 7, 14, 30')" class="py-1.5 px-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-[11px] font-bold transition cursor-pointer">標準<br><span class="text-[9px] text-slate-400">1→3→7→14→30</span></button>
              <button type="button" onclick="applySrsPreset('1, 2, 4, 7, 14')" class="py-1.5 px-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-[11px] font-bold transition cursor-pointer">短期<br><span class="text-[9px] text-slate-400">1→2→4→7→14</span></button>
              <button type="button" onclick="applySrsPreset('1, 4, 10, 25, 60')" class="py-1.5 px-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-[11px] font-bold transition cursor-pointer">長期<br><span class="text-[9px] text-slate-400">1→4→10→25→60</span></button>
            </div>
          </div>
          <div class="mb-4">
            <label for="srs-intervals-input" class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">カスタム日数（半角カンマ区切り）</label>
            <input id="srs-intervals-input" type="text" placeholder="例: 1, 3, 7, 14, 30" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold focus:outline-none focus:border-emerald-500" />
            <p class="text-[10px] text-slate-400 mt-1">※間違えた単語はステージ0（当日中に再復習）に戻ります。</p>
          </div>
          <button type="button" onclick="saveSrsSettings()" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-sm transition cursor-pointer">この間隔で保存する</button>
        </div>
      </div>

      <!-- SCORE INFO MODAL（ポイント計算方式の解説） -->
      <div id="score-info-modal" onclick="if(event.target===this) closeScoreModal()" class="hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-5 shadow-2xl relative max-h-[85vh] flex flex-col">
          <button type="button" onclick="closeScoreModal()" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center cursor-pointer">
            <i class="fa-solid fa-xmark"></i>
          </button>

          <div class="text-center mb-3 shrink-0">
            <div class="w-11 h-11 bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-1 text-lg">
              <i class="fa-solid fa-calculator"></i>
            </div>
            <h3 class="text-base font-black">ポイント計算の仕組み</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">反射スピード × 難易度 × 連続コンボで高得点！</p>
          </div>

          <div class="space-y-2.5 overflow-y-auto pr-1 flex-1 mb-3 text-left text-xs">
            <div class="p-3 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900 text-center">
              <div class="text-[10px] font-bold text-indigo-500 mb-0.5">1問あたりの獲得ポイント計算式</div>
              <div class="font-black text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm">
                (基礎10pt ＋ 反射ボーナス) × 難易度倍率 × コンボ倍率
              </div>
            </div>

            <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
              <div class="font-black text-slate-700 dark:text-slate-200 mb-1"><i class="fa-solid fa-bolt text-purple-500 mr-1"></i>① 解答スピードボーナス</div>
              <ul class="space-y-1 text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
                <li class="flex justify-between"><span>・2.0秒以下（赤線より手前）</span><span class="font-black text-purple-600 dark:text-purple-400">+10 pt（計20pt）</span></li>
                <li class="flex justify-between"><span>・2.1〜3.0秒（黄線より手前）</span><span class="font-black text-violet-600 dark:text-violet-400">+5 pt（計15pt）</span></li>
                <li class="flex justify-between"><span>・3.0秒より遅い正解</span><span class="text-slate-500">+0〜3 pt（残り時間比例）</span></li>
              </ul>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <div class="font-black text-[11px] text-slate-700 dark:text-slate-200 mb-1">② 難易度倍率</div>
                <div class="text-[10px] text-slate-600 dark:text-slate-300 space-y-0.5 font-semibold">
                  <div>基礎 (10秒)：<strong>1.0倍</strong></div>
                  <div>応用 (5秒)：<strong>1.3倍</strong></div>
                  <div>発展 (2秒)：<strong>1.6倍</strong></div>
                  <div>天賦 (2秒)：<strong>2.1倍</strong></div>
                  <div>極 (2秒)：<strong class="text-rose-500">2.8倍</strong></div>
                </div>
              </div>
              <div class="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <div class="font-black text-[11px] text-slate-700 dark:text-slate-200 mb-1">③ コンボ倍率</div>
                <div class="text-[10px] text-slate-600 dark:text-slate-300 space-y-0.5 font-semibold">
                  <div>1〜4連続：<strong>1.0倍</strong></div>
                  <div>5連続〜：<strong>1.3倍</strong></div>
                  <div>10連続〜：<strong>1.6倍</strong></div>
                  <div>20連続〜：<strong>2.2倍</strong></div>
                  <div>30連続〜：<strong class="text-amber-500">3.0倍</strong></div>
                </div>
              </div>
            </div>

            <div class="p-3 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <div class="font-black text-emerald-700 dark:text-emerald-300 text-[11px] mb-1"><i class="fa-solid fa-lightbulb mr-1"></i>獲得ポイントの具体例</div>
              <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">
                難易度<strong>「応用（1.3倍）」</strong>で<strong>10コンボ中（1.6倍）</strong>に、<strong>2秒以下（+10pt）</strong>で即答した場合：<br>
                <span class="inline-block mt-1 font-black text-emerald-700 dark:text-emerald-300 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-lg">
                  (10 + 10) × 1.3 × 1.6 ＝ 42 pt（1問で獲得！）
                </span>
              </p>
            </div>
          </div>

          <button type="button" onclick="closeScoreModal()" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-sm transition cursor-pointer shrink-0">閉じる</button>
        </div>
      </div>
    `;
    document.body.appendChild(modContainer);
  }

  // バックアップ保存・復元バーをダッシュボード下部に配置
  const dashboardCard = $("dashboard-screen");
  if (dashboardCard && !$("backup-tools-bar")) {
    const toolBar = document.createElement("div");
    toolBar.id = "backup-tools-bar";
    toolBar.className = "flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800";
    toolBar.innerHTML = `
      <div class="flex items-center gap-1.5">
        <button type="button" onclick="exportUserDataJSON()" class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold transition cursor-pointer flex items-center gap-1" title="学習データをファイルに保存">
          <i class="fa-solid fa-download text-indigo-500"></i><span>データ保存</span>
        </button>
        <label class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold transition cursor-pointer flex items-center gap-1" title="ファイルから学習データを復元">
          <i class="fa-solid fa-upload text-emerald-500"></i><span>復元</span>
          <input type="file" accept=".json" onchange="importUserDataJSON(event)" class="hidden" />
        </label>
      </div>
      <button type="button" onclick="openSiteAboutModal()" class="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-600 dark:text-indigo-300 text-[11px] font-black transition cursor-pointer flex items-center gap-1">
        <i class="fa-solid fa-circle-info"></i><span>このアプリについて</span>
      </button>
    `;
    dashboardCard.appendChild(toolBar);
  }

  // 出題設定画面（#config-screen）の出題範囲カード内に品詞絞り込みを配置
  const rangeCard = $("range-start")?.closest(".config-card");
  if (rangeCard && !$("pos-filter-container")) {
    const posDiv = document.createElement("div");
    posDiv.id = "pos-filter-container";
    posDiv.className = "mt-2 pt-2 border-t border-slate-100 dark:border-slate-800";
    posDiv.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <label class="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1"><i class="fa-solid fa-filter text-indigo-500"></i>品詞絞り込み</label>
        <span id="pos-filter-label" class="text-[10px] font-black text-indigo-600 dark:text-indigo-400">すべて</span>
      </div>
      <div class="grid grid-cols-5 gap-1">
        <button type="button" onclick="setPosFilter('all')" id="pos-btn-all" class="py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold transition cursor-pointer">全品詞</button>
        <button type="button" onclick="setPosFilter('動詞')" id="pos-btn-動詞" class="py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold transition cursor-pointer">動詞</button>
        <button type="button" onclick="setPosFilter('名詞')" id="pos-btn-名詞" class="py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold transition cursor-pointer">名詞</button>
        <button type="button" onclick="setPosFilter('形容詞')" id="pos-btn-形容詞" class="py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold transition cursor-pointer">形容詞</button>
        <button type="button" onclick="setPosFilter('副詞')" id="pos-btn-副詞" class="py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold transition cursor-pointer">副詞</button>
      </div>
    `;
    rangeCard.appendChild(posDiv);
  }
}

function openRankModal() {
  const totalScore = parseInt(localStorage.getItem(KEYS.SCORE), 10) || 0;
  const listEl = $("rank-modal-list");
  if (listEl) {
    listEl.innerHTML = RANK_LIST.map((r, idx) => {
      const isLegend = r.name === "レジェンド";
      const isMaster = r.name === "マスター";
      const rangeStr = isLegend
        ? `${r.min.toLocaleString()} pt 以上`
        : isMaster
          ? `${r.min.toLocaleString()} 〜 99,999 pt`
          : `${r.min.toLocaleString()} 〜 ${(RANK_LIST[idx - 1].min - 1).toLocaleString()} pt（${r.classStep.toLocaleString()}pt刻み）`;
      const currentInfo = getUserRankInfo(totalScore);
      const isCurrent = currentInfo.name === r.name;
      return `
        <div class="p-3 rounded-2xl border ${isCurrent ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40" : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50"} text-left">
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-1.5">
              <span class="px-2.5 py-0.5 rounded-full text-xs border ${r.color}"><i class="fa-solid fa-crown text-[10px] mr-1"></i>${r.name}</span>
              ${isCurrent ? `<span class="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full">現在 ${currentInfo.classNum ? `クラス${currentInfo.classNum}` : ""}</span>` : ""}
            </div>
            <span class="text-[11px] font-black text-slate-600 dark:text-slate-300">${rangeStr}</span>
          </div>
          <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">${r.desc}</p>
        </div>`;
    }).join("");
  }
  $("rank-info-modal")?.classList.remove("hidden");
}

function closeRankModal() {
  $("rank-info-modal")?.classList.add("hidden");
}

function openScoreModal() {
  $("score-info-modal")?.classList.remove("hidden");
}

function closeScoreModal() {
  $("score-info-modal")?.classList.add("hidden");
}
function openSiteAboutModal() {
  $("site-about-modal")?.classList.remove("hidden");
}
window.openSiteAboutModal = openSiteAboutModal;

function closeSiteAboutModal() {
  $("site-about-modal")?.classList.add("hidden");
}
window.closeSiteAboutModal = closeSiteAboutModal;

function setPosFilter(pos) {
  currentPosFilter = pos;
  ["all", "動詞", "名詞", "形容詞", "副詞"].forEach((p) => {
    const btn = $(`pos-btn-${p}`);
    if (btn) {
      if (p === pos) {
        btn.className = "py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold transition cursor-pointer";
      } else {
        btn.className = "py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold transition cursor-pointer";
      }
    }
  });
  if ($("pos-filter-label")) $("pos-filter-label").innerText = pos === "all" ? "すべて" : pos;
  updateOrderProgressBadge();
}

// ===== 3部門対応メンバーランキング（総合 / 週間 / スコアアタック） =====
function getResolvedNickname(user) {
  const savedNick = localStorage.getItem(KEYS.NICKNAME)?.trim();
  if (savedNick) return savedNick;
  if (user?.displayName) return user.displayName.slice(0, 12);
  if (user?.email) return user.email.split("@")[0].slice(0, 12);
  return "学習メンバー";
}

function switchRankingTab(tab) {
  currentRankingTab = tab;
  ["all", "weekly", "score_attack"].forEach((t) => {
    const btn = $(`rank-tab-${t}`);
    if (btn) {
      btn.className =
        t === tab
          ? "py-1.5 rounded-lg bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs transition cursor-pointer"
          : "py-1.5 rounded-lg text-slate-500 dark:text-slate-400 transition cursor-pointer";
    }
  });
  loadLeaderboard();
}
window.switchRankingTab = switchRankingTab;

function openRankingModal() {
  const modal = $("ranking-modal");
  if (!modal) return;
  modal.classList.remove("hidden");

  const guestNotice = $("ranking-guest-notice");
  const memberArea = $("ranking-member-area");

  if (!currentUser) {
    guestNotice?.classList.remove("hidden");
    memberArea?.classList.add("hidden");
    return;
  }

  guestNotice?.classList.add("hidden");
  memberArea?.classList.remove("hidden");

  const nickInput = $("ranking-nickname-input");
  if (nickInput) {
    nickInput.value = getResolvedNickname(currentUser);
  }
  loadLeaderboard();
}
window.openRankingModal = openRankingModal;

function closeRankingModal() {
  $("ranking-modal")?.classList.add("hidden");
}
window.closeRankingModal = closeRankingModal;

async function saveRankingNickname(e) {
  e.preventDefault();
  if (!currentUser || !db) return;
  const input = $("ranking-nickname-input");
  const newNick = input?.value.trim().slice(0, 12);
  if (!newNick) return;

  localStorage.setItem(KEYS.NICKNAME, newNick);
  updateAuthUI(currentUser);
  await pushLocalDataToCloud();
  await loadLeaderboard();
}
window.saveRankingNickname = saveRankingNickname;

async function loadLeaderboard() {
  const listEl = $("leaderboard-list");
  const countLabel = $("ranking-count-label");
  if (!listEl || !db || !currentUser) return;

  listEl.innerHTML = `<div class="text-center text-xs text-slate-400 py-8 font-bold"><i class="fa-solid fa-spinner fa-spin mr-1.5"></i>ランキングを読み込み中...</div>`;

  try {
    const snap = await db.collection("leaderboard").limit(50).get();
    let members = [];
    snap.forEach((doc) => {
      members.push({ uid: doc.id, ...doc.data() });
    });

    const currentWeekKey = getMondayWeekKey();

    if (currentRankingTab === "weekly") {
      members = members
        .map((m) => ({
          ...m,
          displayMetric: m.weekKey === currentWeekKey ? Number(m.weeklyWords) || 0 : 0,
        }))
        .sort((a, b) => b.displayMetric - a.displayMetric);
    } else if (currentRankingTab === "score_attack") {
      members = members
        .map((m) => ({
          ...m,
          displayMetric: Number(m.scoreAttackBest) || 0,
        }))
        .filter((m) => m.displayMetric > 0 || m.uid === currentUser.uid)
        .sort((a, b) => b.displayMetric - a.displayMetric);
    } else {
      members = members
        .map((m) => ({
          ...m,
          displayMetric: Number(m.score) || 0,
        }))
        .sort((a, b) => b.displayMetric - a.displayMetric);
    }

    if (countLabel) countLabel.innerText = `参加メンバー: ${members.length} 名`;

    if (members.length === 0) {
      listEl.innerHTML = `<div class="text-center text-xs text-slate-400 py-8 font-bold">まだデータがありません。クイズを解いてランキングに参加しよう！</div>`;
      return;
    }

    listEl.innerHTML = members
      .slice(0, 30)
      .map((m, idx) => {
        const rankNum = idx + 1;
        const isMe = m.uid === currentUser.uid;
        const scoreVal = Number(m.score) || 0;
        const rankInfo = getUserRankInfo(scoreVal);
        const rankLabel = m.rankLabel || getRankFullLabel(scoreVal);
        const masteredCount = Number(m.masteredCount) || 0;
        const streakCount = Number(m.streakCount) || 0;
        const safeName = escapeHTML(m.nickname || "メンバー");
        const timeStr = formatRelativeTime(m.updatedAt);

        let rightMainHtml = `${m.displayMetric.toLocaleString()} <span class="text-[10px]">pt</span>`;
        if (currentRankingTab === "weekly") {
          rightMainHtml = `${m.displayMetric.toLocaleString()} <span class="text-[10px]">語</span>`;
        } else if (currentRankingTab === "score_attack") {
          rightMainHtml = `${m.displayMetric.toLocaleString()} <span class="text-[10px]">pt</span>`;
        }

        let medalHtml = `<span class="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black text-xs flex items-center justify-center shrink-0">${rankNum}</span>`;
        if (rankNum === 1) {
          medalHtml = `<span class="w-7 h-7 rounded-full bg-amber-400 text-slate-900 font-black text-xs flex items-center justify-center shrink-0 shadow-xs"><i class="fa-solid fa-crown"></i></span>`;
        } else if (rankNum === 2) {
          medalHtml = `<span class="w-7 h-7 rounded-full bg-slate-300 text-slate-800 font-black text-xs flex items-center justify-center shrink-0 shadow-xs">2</span>`;
        } else if (rankNum === 3) {
          medalHtml = `<span class="w-7 h-7 rounded-full bg-amber-600/80 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">3</span>`;
        }

        return `
          <div class="p-3 rounded-2xl border ${isMe ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40" : "border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50"} flex items-center justify-between gap-2 text-left">
            <div class="flex items-center gap-2.5 min-w-0">
              ${medalHtml}
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-black text-xs sm:text-sm truncate">${safeName}</span>
                  ${isMe ? `<span class="text-[9px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">あなた</span>` : ""}
                </div>
                <div class="flex items-center gap-1.5 flex-wrap mt-1">
                  <span class="px-2 py-0.2 rounded-full text-[10px] border ${rankInfo.color}">${escapeHTML(rankLabel)}</span>
                  <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400">習得 ${masteredCount}語</span>
                  <span class="text-[10px] font-bold text-amber-600 dark:text-amber-400"><i class="fa-solid fa-fire text-[9px]"></i>${streakCount}日</span>
                </div>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400">${rightMainHtml}</div>
              <div class="text-[9px] font-bold text-slate-400 mt-0.5">${timeStr}</div>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    console.warn("Leaderboard fetch error:", err);
    listEl.innerHTML = `<div class="text-center text-xs text-rose-500 py-6 font-bold">ランキングの取得に失敗しました。Firestoreのルール設定を確認してください。</div>`;
  }
}
window.loadLeaderboard = loadLeaderboard;

// ===== Firebase 認証＆クラウド同期 =====
function openAuthModal() {
  $("auth-error-msg")?.classList.add("hidden");
  $("auth-modal")?.classList.remove("hidden");
}

function closeAuthModal() {
  $("auth-modal")?.classList.add("hidden");
}

function updateAuthUI(user) {
  currentUser = user;
  const label = $("auth-header-label");
  const icon = $("auth-header-icon");
  const syncBadge = $("sync-status-badge");

  if (user) {
    const shortName = getResolvedNickname(user);
    if (label) label.innerText = shortName;
    if (icon) icon.className = "fa-solid fa-cloud-check text-emerald-300 text-xs";
    if (syncBadge) {
      syncBadge.className = "text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1";
      syncBadge.innerHTML = '<i class="fa-solid fa-cloud"></i> クラウド同期中';
    }
    $("auth-guest-view")?.classList.add("hidden");
    $("auth-user-view")?.classList.remove("hidden");
    if ($("auth-user-email")) $("auth-user-email").innerText = user.email || user.displayName || "ログイン中";
  } else {
    if (label) label.innerText = "ログイン";
    if (icon) icon.className = "fa-solid fa-user text-[11px]";
    if (syncBadge) {
      syncBadge.className = "text-[10px] font-bold text-slate-400 flex items-center gap-1";
      syncBadge.innerHTML = '<i class="fa-solid fa-hard-drive"></i> ローカル保存';
    }
    $("auth-guest-view")?.classList.remove("hidden");
    $("auth-user-view")?.classList.add("hidden");
  }
}

async function loginWithGoogle() {
  if (!auth) return alert("Firebaseが読み込まれていません。");
  const errEl = $("auth-error-msg");
  errEl?.classList.add("hidden");
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
    closeAuthModal();
  } catch (err) {
    if (errEl) {
      errEl.innerText = `Googleログインエラー: ${err.message}`;
      errEl.classList.remove("hidden");
    }
  }
}

async function submitEmailAuth(e) {
  e.preventDefault();
  if (!auth) return;
  const email = $("auth-email")?.value.trim();
  const pass = $("auth-password")?.value;
  const errEl = $("auth-error-msg");
  errEl?.classList.add("hidden");

  try {
    if (window._authAction === "signup") {
      await auth.createUserWithEmailAndPassword(email, pass);
    } else {
      await auth.signInWithEmailAndPassword(email, pass);
    }
    closeAuthModal();
  } catch (err) {
    if (errEl) {
      errEl.innerText = `認証エラー: ${err.message}`;
      errEl.classList.remove("hidden");
    }
  }
}

async function logoutFirebase() {
  if (!auth) return;
  await auth.signOut();
  closeAuthModal();
}

function scheduleCloudPush() {
  if (!currentUser || !db) return;
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    pushLocalDataToCloud();
  }, 1500);
}

async function pushLocalDataToCloud() {
  if (!currentUser || !db) return;
  clearTimeout(syncDebounceTimer);
  try {
    const currentScore = parseInt(localStorage.getItem(KEYS.SCORE), 10) || 0;
    const saBest = parseInt(localStorage.getItem(KEYS.SA_BEST), 10) || 0;
    const weeklyObj = getWeeklyData();
    const masteredList = getStorageJSON(KEYS.MASTERED, []);
    const streakObj = getStorageJSON(KEYS.STREAK, { count: 0, lastDate: "", todayCount: 0 });
    const nickname = getResolvedNickname(currentUser);

    const payload = {
      nickname,
      score: currentScore,
      seasonId: localStorage.getItem(KEYS.SEASON_ID) || getCurrentSeasonInfo().seasonId,
      scoreAttackBest: saBest,
      weeklyData: weeklyObj,
      mastered: masteredList,
      stats: getStorageJSON(KEYS.STATS, {}),
      history: getStorageJSON(KEYS.HISTORY, {}),
      covered: getStorageJSON(KEYS.COVERED, {}),
      srsData: getStorageJSON(KEYS.SRS_DATA, {}),
      srsIntervals: localStorage.getItem(KEYS.SRS_INTERVALS) || "",
      bookmarks: getStorageJSON(KEYS.BOOKMARKS, []),
      streak: streakObj,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection("users").doc(currentUser.uid).set(payload, { merge: true });

    // メンバーランキング（leaderboard）に3部門分サマリーを自動反映
    const leaderboardPayload = {
      nickname,
      score: currentScore,
      scoreAttackBest: saBest,
      weekKey: weeklyObj.weekKey,
      weeklyWords: weeklyObj.wordsCount || 0,
      rankLabel: getRankFullLabel(currentScore),
      masteredCount: Array.isArray(masteredList) ? masteredList.length : 0,
      streakCount: Number(streakObj.count) || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection("leaderboard").doc(currentUser.uid).set(leaderboardPayload, { merge: true });

    if ($("auth-last-sync")) {
      const now = new Date();
      $("auth-last-sync").innerText = `最終同期: ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    }
  } catch (e) {
    console.warn("Cloud push failed:", e);
  }
}

async function syncWithCloudOnLogin(user) {
  if (!user || !db) return;
  try {
    const docRef = db.collection("users").doc(user.uid);
    const snap = await docRef.get();

    const localScore = parseInt(localStorage.getItem(KEYS.SCORE), 10) || 0;
    const localSaBest = parseInt(localStorage.getItem(KEYS.SA_BEST), 10) || 0;
    const localWeekly = getWeeklyData();
    const localMastered = getStorageJSON(KEYS.MASTERED, []);
    const localStats = getStorageJSON(KEYS.STATS, {});
    const localHistory = getStorageJSON(KEYS.HISTORY, {});
    const localCovered = getStorageJSON(KEYS.COVERED, {});
    const localSrs = getStorageJSON(KEYS.SRS_DATA, {});
    const localBookmarks = getStorageJSON(KEYS.BOOKMARKS, []);
    const localStreak = getStorageJSON(KEYS.STREAK, { count: 0, lastDate: "", todayCount: 0 });

    if (snap.exists) {
      const cloud = snap.data();

      if (cloud.nickname && !localStorage.getItem(KEYS.NICKNAME)) {
        localStorage.setItem(KEYS.NICKNAME, cloud.nickname);
      }

      // ▼ 修正後：現在のシーズンと一致する場合のみクラウドのポイントを採用
      const currentSeasonId = getCurrentSeasonInfo().seasonId;
      const cloudScore = cloud.seasonId === currentSeasonId ? Number(cloud.score) || 0 : 0;
      const mergedScore = Math.max(localScore, cloudScore);
      localStorage.setItem(KEYS.SCORE, mergedScore);

      const mergedSaBest = Math.max(localSaBest, Number(cloud.scoreAttackBest) || 0);
      localStorage.setItem(KEYS.SA_BEST, mergedSaBest);

      if (cloud.weeklyData && cloud.weeklyData.weekKey === localWeekly.weekKey) {
        const mergedWeekly = {
          weekKey: localWeekly.weekKey,
          wordsCount: Math.max(localWeekly.wordsCount || 0, cloud.weeklyData.wordsCount || 0),
          points: Math.max(localWeekly.points || 0, cloud.weeklyData.points || 0),
        };
        setStorageJSON(KEYS.WEEKLY_DATA, mergedWeekly);
      }

      const mergedMastered = Array.from(new Set([...(Array.isArray(localMastered) ? localMastered : []), ...(Array.isArray(cloud.mastered) ? cloud.mastered : [])]));
      setStorageJSON(KEYS.MASTERED, mergedMastered);

      const cloudStats = cloud.stats || {};
      const mergedStats = { ...cloudStats };
      Object.keys(localStats).forEach((k) => {
        if (!mergedStats[k]) {
          mergedStats[k] = localStats[k];
        } else {
          mergedStats[k] = {
            total: Math.max(mergedStats[k].total || 0, localStats[k].total || 0),
            correct: Math.max(mergedStats[k].correct || 0, localStats[k].correct || 0),
          };
        }
      });
      setStorageJSON(KEYS.STATS, mergedStats);

      const mergedHistory = { ...(cloud.history || {}), ...localHistory };
      setStorageJSON(KEYS.HISTORY, mergedHistory);

      const cloudCovered = cloud.covered || {};
      const mergedCovered = { ...cloudCovered };
      Object.keys(localCovered).forEach((rk) => {
        mergedCovered[rk] = Array.from(new Set([...(mergedCovered[rk] || []), ...(localCovered[rk] || [])]));
      });
      setStorageJSON(KEYS.COVERED, mergedCovered);

      const mergedSrs = { ...(cloud.srsData || {}), ...localSrs };
      setStorageJSON(KEYS.SRS_DATA, mergedSrs);

      if (cloud.srsIntervals && !localStorage.getItem(KEYS.SRS_INTERVALS)) {
        localStorage.setItem(KEYS.SRS_INTERVALS, cloud.srsIntervals);
      }

      const mergedBookmarks = Array.from(new Set([...(Array.isArray(localBookmarks) ? localBookmarks : []), ...(Array.isArray(cloud.bookmarks) ? cloud.bookmarks : [])]));
      setStorageJSON(KEYS.BOOKMARKS, mergedBookmarks);

      const cloudStreak = cloud.streak || { count: 0, lastDate: "", todayCount: 0 };
      const chosenStreak = (cloudStreak.count || 0) >= (localStreak.count || 0) ? cloudStreak : localStreak;
      setStorageJSON(KEYS.STREAK, chosenStreak);
    }

    updateAuthUI(user);
    await pushLocalDataToCloud();
    updateRankUI();
    updateWeeklyUI();
    renderAdvancedHomeUI();
    renderStatsGraph();
    updateOrderProgressBadge();
  } catch (e) {
    console.warn("Cloud sync error:", e);
  }
}

async function manualSyncNow() {
  if (!currentUser) return;
  await syncWithCloudOnLogin(currentUser);
  alert("クラウドとのデータ同期が完了しました！");
}

if (auth) {
  auth.onAuthStateChanged((user) => {
    updateAuthUI(user);
    if (user) syncWithCloudOnLogin(user);
  });
}

// ===== 範囲取得＆フィルタリング＆品詞フィルタ =====
function getNormalizedRange() {
  const maxAvailable = getAllWords().length > 0 ? Math.max(...getAllWords().map((w) => Number(w.no) || 0)) : 1500;
  let start = parseInt($("range-start")?.value, 10);
  let end = parseInt($("range-end")?.value, 10);
  if (isNaN(start) || start < 1) start = 1;
  if (isNaN(end) || end > maxAvailable) end = maxAvailable;
  if (start > end) [start, end] = [end, start];
  return { start, end };
}

function onRangeInputChange() {
  const maxNo = getAllWords().length > 0 ? Math.max(...getAllWords().map((w) => Number(w.no) || 0)) : 1500;
  const sEl = $("range-start");
  const eEl = $("range-end");
  if (sEl && Number(sEl.value) > maxNo) sEl.value = maxNo;
  if (eEl && Number(eEl.value) > maxNo) eEl.value = maxNo;
  const { start, end } = getNormalizedRange();
  const badge = $("header-range-badge");
  if (badge) badge.innerText = `No.${start}〜${end}`;
  updateOrderProgressBadge();
}

function filterWordsByRange(words, start, end) {
  return words.filter((w, idx) => {
    const no = w.no !== undefined ? Number(w.no) : idx + 1;
    if (no < start || no > end) return false;
    if (currentPosFilter !== "all") {
      const pos = String(w.pos || "");
      if (!pos.includes(currentPosFilter)) return false;
    }
    return true;
  });
}

// ===== 範囲内網羅モード（cover_all）＆最適化弱点プール（weak_pool） =====
function updateOrderProgressBadge() {
  const badge = $("order-progress-badge");
  if (!badge) return;

  let resetBtn = $("order-reset-btn");
  if (!resetBtn && badge.parentElement) {
    resetBtn = document.createElement("button");
    resetBtn.id = "order-reset-btn";
    resetBtn.type = "button";
    resetBtn.onclick = resetCoveredProgress;
    resetBtn.className = "hidden text-[10px] font-bold text-slate-400 hover:text-rose-500 ml-1.5 transition cursor-pointer";
    resetBtn.innerHTML = '<i class="fa-solid fa-rotate-right mr-0.5"></i>リセット';
    badge.insertAdjacentElement("afterend", resetBtn);
  }

  if (currentQuizOrder === "weak_pool") {
    const { start, end } = getNormalizedRange();
    const map = getMistakeHistoryMap();
    const weakInRange = Object.values(map).filter((item) => {
      const no = Number(item.wordObj?.no);
      return no >= start && no <= end && (item.mistakeCount || 0) > 0;
    });
    badge.innerText = `範囲内弱点: ${weakInRange.length}語`;
    badge.classList.remove("hidden");
    if (resetBtn) resetBtn.classList.add("hidden");
    return;
  }

  if (currentQuizOrder !== "cover_all") {
    badge.classList.add("hidden");
    if (resetBtn) resetBtn.classList.add("hidden");
    return;
  }

  const { start, end } = getNormalizedRange();
  const rangeWords = filterWordsByRange(getAllWords(), start, end);
  const coveredMap = getStorageJSON(KEYS.COVERED, {});
  const rangeKey = `${start}-${end}-${currentPosFilter}`;
  const usedSet = new Set((coveredMap[rangeKey] || []).map(Number));
  const doneCount = rangeWords.filter((w) => usedSet.has(Number(w.no))).length;

  badge.innerText = `進捗: ${doneCount} / ${rangeWords.length}語`;
  badge.classList.remove("hidden");
  if (resetBtn) resetBtn.classList.remove("hidden");
}

function resetCoveredProgress() {
  const { start, end } = getNormalizedRange();
  if (!confirm(`No.${start}〜${end} (${currentPosFilter}) の「範囲内を網羅(1周)」の進捗をリセットして最初から出題しますか？`)) return;

  const coveredMap = getStorageJSON(KEYS.COVERED, {});
  const rangeKey = `${start}-${end}-${currentPosFilter}`;
  delete coveredMap[rangeKey];
  delete coveredMap[`${rangeKey}-kiwami`];
  delete coveredMap[`${rangeKey}-tenfu7`];
  delete coveredMap[`${rangeKey}-tenfuUnder`];

  setStorageJSON(KEYS.COVERED, coveredMap);
  updateOrderProgressBadge();
  scheduleCloudPush();
}

function pickQuestionsCoverAll(pool, count, rangeKey) {
  if (pool.length === 0) return [];
  const coveredMap = getStorageJSON(KEYS.COVERED, {});
  let tempUsedSet = new Set((coveredMap[rangeKey] || []).map(Number));
  const picked = [];

  while (picked.length < count) {
    let remaining = pool.filter((w) => !tempUsedSet.has(Number(w.no)));
    if (remaining.length === 0) {
      tempUsedSet.clear();
      remaining = [...pool];
    }
    const shuffled = shuffleArray(remaining);
    const takeCount = Math.min(count - picked.length, shuffled.length);
    const batch = shuffled.slice(0, takeCount);
    batch.forEach((w) => {
      picked.push(w);
      tempUsedSet.add(Number(w.no));
    });
  }
  return picked;
}

// 最適化弱点プール抽出（ミス回数 × 経過時間重み付き優先度スコア）
function getOptimizedWeakPool(start, end, count) {
  const map = getMistakeHistoryMap();
  const srsMap = getStorageJSON(KEYS.SRS_DATA, {});
  const now = Date.now();

  const entries = Object.values(map).filter((item) => {
    const w = item.wordObj;
    if (!w) return false;
    const no = Number(w.no);
    if (no < start || no > end) return false;
    if (currentPosFilter !== "all" && !String(w.pos || "").includes(currentPosFilter)) return false;
    return (item.mistakeCount || 0) > 0;
  });

  if (entries.length === 0) return [];

  const scored = entries.map((item) => {
    const no = String(item.wordObj.no);
    const updatedAt = srsMap[no]?.updatedAt || 0;
    const hoursElapsed = updatedAt > 0 ? Math.min(72, (now - updatedAt) / (1000 * 60 * 60)) : 24;
    const priorityScore = (item.mistakeCount || 1) * 10 + hoursElapsed * 0.5 + Math.random() * 4;
    return { wordObj: item.wordObj, priorityScore };
  });

  scored.sort((a, b) => b.priorityScore - a.priorityScore);
  return shuffleArray(scored.slice(0, count).map((s) => s.wordObj));
}

function markWordAsCovered(wordNo, poolSize) {
  if (currentQuizOrder !== "cover_all" || !activeCoverRangeKey) return;
  const no = Number(wordNo);
  if (!no) return;

  const coveredMap = getStorageJSON(KEYS.COVERED, {});
  const currentList = (coveredMap[activeCoverRangeKey] || []).map(Number);
  const usedSet = new Set(currentList);

  if (poolSize > 0 && usedSet.size >= poolSize) {
    usedSet.clear();
  }
  usedSet.add(no);

  coveredMap[activeCoverRangeKey] = Array.from(usedSet);
  setStorageJSON(KEYS.COVERED, coveredMap);
  updateOrderProgressBadge();
}

// ===== 分散学習 (SRS) ロジック =====
function getSrsIntervals() {
  const saved = localStorage.getItem(KEYS.SRS_INTERVALS);
  if (!saved) return DEFAULT_SRS_INTERVALS;
  const parsed = saved
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n >= 1);
  return parsed.length > 0 ? parsed : DEFAULT_SRS_INTERVALS;
}

function updateWordSrs(wordNo, isCorrect) {
  const srsMap = getStorageJSON(KEYS.SRS_DATA, {});
  const key = String(wordNo);
  const current = srsMap[key] || { stage: 0, nextReview: 0 };
  const intervals = getSrsIntervals();
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  if (isCorrect) {
    const nextStage = Math.min(current.stage + 1, intervals.length);
    const daysToAdd = intervals[nextStage - 1];
    srsMap[key] = {
      stage: nextStage,
      nextReview: now + daysToAdd * DAY_MS,
      updatedAt: now,
    };
  } else {
    srsMap[key] = {
      stage: 0,
      nextReview: now,
      updatedAt: now,
    };
  }
  setStorageJSON(KEYS.SRS_DATA, srsMap);
  scheduleCloudPush();
}

function getDueSrsWords() {
  const srsMap = getStorageJSON(KEYS.SRS_DATA, {});
  const now = Date.now();
  const dueNos = new Set(
    Object.entries(srsMap)
      .filter(([, info]) => info && info.nextReview <= now)
      .map(([no]) => Number(no)),
  );
  return getAllWords().filter((w) => dueNos.has(Number(w.no)));
}

function openSrsSettingsModal() {
  const input = $("srs-intervals-input");
  if (input) input.value = getSrsIntervals().join(", ");
  $("srs-settings-modal")?.classList.remove("hidden");
}

function closeSrsSettingsModal() {
  $("srs-settings-modal")?.classList.add("hidden");
}

function applySrsPreset(presetStr) {
  const input = $("srs-intervals-input");
  if (input) input.value = presetStr;
}

function saveSrsSettings() {
  const input = $("srs-intervals-input");
  if (!input) return;
  const parsed = input.value
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n >= 1);
  if (parsed.length === 0) {
    alert("1以上の半角数字をカンマ区切りで入力してください（例: 1, 3, 7, 14, 30）");
    return;
  }
  localStorage.setItem(KEYS.SRS_INTERVALS, parsed.join(", "));
  closeSrsSettingsModal();
  renderAdvancedHomeUI();
}

// ===== ストリーク＆My単語帳 ＆ 苦手抽出 =====
function checkAndUpdateStreak() {
  const streakData = getStorageJSON(KEYS.STREAK, { count: 0, lastDate: "", todayCount: 0 });
  const todayStr = new Date().toISOString().split("T")[0];

  if (streakData.lastDate !== todayStr) {
    const lastD = new Date(streakData.lastDate);
    const currD = new Date(todayStr);
    const diffDays = Math.round((currD - lastD) / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
      streakData.count = 0;
    }
    streakData.todayCount = 0;
  }
}

function addStreakProgress(solvedCount) {
  const streakData = getStorageJSON(KEYS.STREAK, { count: 0, lastDate: "", todayCount: 0 });
  const todayStr = new Date().toISOString().split("T")[0];

  if (streakData.lastDate !== todayStr) {
    const lastD = streakData.lastDate ? new Date(streakData.lastDate) : null;
    const currD = new Date(todayStr);
    if (!lastD || Math.round((currD - lastD) / (1000 * 60 * 60 * 24)) === 1) {
      streakData.count = (streakData.count || 0) + 1;
    } else if (Math.round((currD - lastD) / (1000 * 60 * 60 * 24)) > 1) {
      streakData.count = 1;
    } else if (!streakData.lastDate) {
      streakData.count = 1;
    }
    streakData.todayCount = 0;
    streakData.lastDate = todayStr;
  }

  const prevToday = streakData.todayCount || 0;
  streakData.todayCount = prevToday + solvedCount;
  setStorageJSON(KEYS.STREAK, streakData);
  scheduleCloudPush();
  renderAdvancedHomeUI();
}

function getBookmarks() {
  return getStorageJSON(KEYS.BOOKMARKS, []);
}

function toggleBookmark(wordNo) {
  const list = getBookmarks();
  const set = new Set(list.map(Number));
  const no = Number(wordNo);
  if (set.has(no)) {
    set.delete(no);
  } else {
    set.add(no);
  }
  setStorageJSON(KEYS.BOOKMARKS, Array.from(set));
  scheduleCloudPush();
  const btn = document.querySelector(`button[data-bookmark-no="${no}"]`);
  if (btn) {
    const isSaved = set.has(no);
    btn.className = `w-7 h-7 rounded-xl flex items-center justify-center transition cursor-pointer shrink-0 ${isSaved ? "bg-amber-100 dark:bg-amber-950/80 text-amber-500" : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-amber-500"}`;
    btn.innerHTML = `<i class="fa-${isSaved ? "solid" : "regular"} fa-star text-xs"></i>`;
  }
}

function getWeakWordsTop() {
  const map = getStorageJSON(KEYS.HISTORY, {});
  const list = Object.values(map)
    .sort((a, b) => (b.mistakeCount || 0) - (a.mistakeCount || 0))
    .map((item) => item.wordObj)
    .filter(Boolean);
  return list;
}

// ===== 学習データの JSON バックアップ =====
function exportUserDataJSON() {
  const backup = {
    version: "9.0",
    exportedAt: new Date().toISOString(),
    nickname: localStorage.getItem(KEYS.NICKNAME) || "",
    score: localStorage.getItem(KEYS.SCORE) || "0",
    seasonId: localStorage.getItem(KEYS.SEASON_ID) || "",
    scoreAttackBest: localStorage.getItem(KEYS.SA_BEST) || "0",
    weeklyData: getWeeklyData(),
    stats: getStorageJSON(KEYS.STATS, {}),
    mastered: getStorageJSON(KEYS.MASTERED, []),
    history: getStorageJSON(KEYS.HISTORY, {}),
    covered: getStorageJSON(KEYS.COVERED, {}),
    srsData: getStorageJSON(KEYS.SRS_DATA, {}),
    srsIntervals: localStorage.getItem(KEYS.SRS_INTERVALS) || "",
    bookmarks: getStorageJSON(KEYS.BOOKMARKS, []),
    streak: getStorageJSON(KEYS.STREAK, {}),
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `target1900_backup_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importUserDataJSON(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (!data.version) throw new Error("無効なフォーマットです");
      if (data.nickname) localStorage.setItem(KEYS.NICKNAME, data.nickname);
      if (data.score) localStorage.setItem(KEYS.SCORE, data.score);
      if (data.seasonId) localStorage.setItem(KEYS.SEASON_ID, data.seasonId);
      if (data.scoreAttackBest) localStorage.setItem(KEYS.SA_BEST, data.scoreAttackBest);
      if (data.weeklyData) setStorageJSON(KEYS.WEEKLY_DATA, data.weeklyData);
      if (data.stats) setStorageJSON(KEYS.STATS, data.stats);
      if (data.mastered) setStorageJSON(KEYS.MASTERED, data.mastered);
      if (data.history) setStorageJSON(KEYS.HISTORY, data.history);
      if (data.covered) setStorageJSON(KEYS.COVERED, data.covered);
      if (data.srsData) setStorageJSON(KEYS.SRS_DATA, data.srsData);
      if (data.srsIntervals) localStorage.setItem(KEYS.SRS_INTERVALS, data.srsIntervals);
      if (data.bookmarks) setStorageJSON(KEYS.BOOKMARKS, data.bookmarks);
      if (data.streak) setStorageJSON(KEYS.STREAK, data.streak);

      alert("学習データの復元が完了しました！");
      if (currentUser) updateAuthUI(currentUser);
      updateRankUI();
      updateWeeklyUI();
      renderAdvancedHomeUI();
      renderStatsGraph();
      updateOrderProgressBadge();
      scheduleCloudPush();
    } catch (err) {
      alert(`復元に失敗しました: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

// ===== ホーム画面拡張UIの描画 =====
function renderAdvancedHomeUI() {
  const grid = $("advanced-modes-grid");
  if (!grid) return;

  const dueCount = getDueSrsWords().length;
  const streakData = getStorageJSON(KEYS.STREAK, { count: 0, todayCount: 0 });
  const streakCount = streakData.count || 0;
  const todayProgress = streakData.todayCount || 0;
  const bookmarkCount = getBookmarks().length;
  const weakCount = getWeakWordsTop().length;

  grid.innerHTML = `
    <div class="bg-white/90 dark:bg-slate-800/90 p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-xs flex items-center justify-between text-xs font-bold">
      <div class="flex items-center gap-2">
        <span class="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center gap-1 font-black">
          <i class="fa-solid fa-fire text-amber-500"></i> ${streakCount}日 連続学習
        </span>
        <span class="text-[11px] text-slate-500 dark:text-slate-400">本日のノルマ: <strong class="${todayProgress >= 30 ? "text-emerald-500" : "text-indigo-600 dark:text-indigo-400"}">${todayProgress}</strong> / 30問</span>
      </div>
      <div class="w-20 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
        <div class="bg-emerald-500 h-full transition-all duration-500" style="width: ${Math.min(100, (todayProgress / 30) * 100)}%"></div>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-1.5">
      <button type="button" onclick="startSpecialQuiz('srs')" class="py-2 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex flex-col items-center justify-center gap-0.5 shadow-xs transition cursor-pointer">
        <div class="flex items-center gap-1"><i class="fa-solid fa-brain"></i><span>本日の復習</span></div>
        <span class="text-[9px] bg-white/20 px-2 py-0.2 rounded-full">${dueCount}語 期限</span>
      </button>

      <button type="button" onclick="startSpecialQuiz('bookmarks')" class="py-2 px-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs flex flex-col items-center justify-center gap-0.5 shadow-xs transition cursor-pointer">
        <div class="flex items-center gap-1"><i class="fa-solid fa-star"></i><span>My単語帳</span></div>
        <span class="text-[9px] bg-white/20 px-2 py-0.2 rounded-full">${bookmarkCount}語 登録</span>
      </button>

      <button type="button" onclick="startSpecialQuiz('weak')" class="py-2 px-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex flex-col items-center justify-center gap-0.5 shadow-xs transition cursor-pointer">
        <div class="flex items-center gap-1"><i class="fa-solid fa-fire-flame-curved"></i><span>苦手特訓</span></div>
        <span class="text-[9px] bg-white/20 px-2 py-0.2 rounded-full">${weakCount}語 候補</span>
      </button>
    </div>

    <div class="flex justify-end">
      <button type="button" onclick="openSrsSettingsModal()" class="text-[10px] font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition cursor-pointer">
        <i class="fa-solid fa-sliders"></i> SRS復習間隔をカスタム
      </button>
    </div>
  `;
}

function startSpecialQuiz(type) {
  unlockAudio();
  isScoreAttackRun = false;
  activeCoverRangeKey = "";
  if (type === "srs") {
    const dueWords = getDueSrsWords();
    if (dueWords.length === 0) {
      alert("現在、復習期限が来ている単語はありません！");
      return;
    }
    quizQuestions = shuffleArray(dueWords).slice(0, selectedCount);
    currentQuizOrder = "srs";
  } else if (type === "bookmarks") {
    const bookNos = new Set(getBookmarks().map(Number));
    const words = getAllWords().filter((w) => bookNos.has(Number(w.no)));
    if (words.length === 0) {
      alert("My単語帳に登録されている単語がありません。クイズ中に星マークを押して登録してください。");
      return;
    }
    quizQuestions = shuffleArray(words).slice(0, selectedCount);
    currentQuizOrder = "bookmarks";
  } else if (type === "weak") {
    const maxNo = getAllWords().length > 0 ? Math.max(...getAllWords().map((w) => Number(w.no) || 0)) : 1500;
    const weak = getOptimizedWeakPool(1, maxNo, selectedCount);
    if (weak.length === 0) {
      alert("現在、苦手な単語の記録はありません。");
      return;
    }
    quizQuestions = weak;
    currentQuizOrder = "weak";
  }

  setupQuizEnvironment();
}

function setupQuizEnvironment() {
  cancelAnimationFrame(timerInterval);
  clearInterval(autoNextInterval);
  sessionGainedScore = 0;
  isPaused = false;
  currentQuizTimeLeft = 0;
  autoNextWaitLeft = 0;
  currentCombo = 0;
  maxCombo = 0;
  answerHistory = [];
  scoreCount = 0;
  currentIndex = 0;
  currentSessionWrong = [];
  if ($("pause-overlay")) $("pause-overlay").style.display = "none";

  if ($("quiz-mode-badge")) {
    $("quiz-mode-badge").className = "text-[10px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full";
    $("quiz-mode-badge").innerText = currentQuizOrder === "single_word" ? "ピンポイントテスト" : "通常モード";
  }

  $("dashboard-screen")?.classList.add("hidden");
  $("config-screen")?.classList.add("hidden");
  $("result-screen")?.classList.add("hidden");
  $("analytics-section")?.classList.add("hidden");
  $("quiz-screen")?.classList.remove("hidden");

  showQuestion();
}

// ===== UI設定・切り替え =====
function setQuizDirection(direction) {
  window.quizDirection = direction;
  if ($("direction-select-home")) $("direction-select-home").value = direction;
  if ($("direction-select-result")) $("direction-select-result").value = direction;
}
window.setQuizDirection = setQuizDirection;

function selectQuizOrder(order) {
  currentQuizOrder = order;
  const activeCls = "bg-indigo-600 text-white font-bold py-2 px-1.5 rounded-xl text-[11px] border border-indigo-600 shadow-xs flex items-center justify-center gap-1 transition cursor-pointer";
  const activeWeakCls = "bg-rose-600 text-white font-bold py-2 px-1.5 rounded-xl text-[11px] border border-rose-600 shadow-xs flex items-center justify-center gap-1 transition cursor-pointer";
  const inactiveCls =
    "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2 px-1.5 rounded-xl text-[11px] hover:border-indigo-300 transition flex items-center justify-center gap-1 cursor-pointer";

  if ($("order-btn-random")) $("order-btn-random").className = order === "random" ? activeCls : inactiveCls;
  if ($("order-btn-cover_all")) $("order-btn-cover_all").className = order === "cover_all" ? activeCls : inactiveCls;
  if ($("order-btn-weak_pool")) $("order-btn-weak_pool").className = order === "weak_pool" ? activeWeakCls : inactiveCls;

  if ($("order-desc-text")) {
    if (order === "cover_all") {
      $("order-desc-text").innerText = "範囲内の全単語を重複なく1回ずつ優先出題（解答分のみ記録）";
    } else if (order === "weak_pool") {
      $("order-desc-text").innerText = "範囲内の苦手単語から、ミス回数×経過時間で優先度が高い順に抽出";
    } else {
      $("order-desc-text").innerText = "毎回範囲内からランダムに抽出します";
    }
  }
  updateOrderProgressBadge();
}

function selectQuizMode(mode) {
  currentQuizMode = mode;
  const activeCls = "mode-btn bg-indigo-600 text-white font-bold py-2 px-2.5 rounded-xl text-xs border border-indigo-600 shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer";
  const inactiveCls =
    "mode-btn bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2 px-2.5 rounded-xl text-xs hover:border-indigo-300 transition flex items-center justify-center gap-1.5 cursor-pointer";
  if ($("mode-btn-choice")) $("mode-btn-choice").className = mode === "choice" ? activeCls : inactiveCls;
  if ($("mode-btn-typing")) $("mode-btn-typing").className = mode === "typing" ? activeCls : inactiveCls;
}

function setDifficulty(diff) {
  if (!DIFF_CONFIG[diff]) diff = "basic";
  selectedDifficulty = diff;
  limitTime = DIFF_CONFIG[diff].time;

  Object.keys(DIFF_CONFIG).forEach((key) => {
    const isSelected = key === diff;
    const cfg = DIFF_CONFIG[key];
    const homeBtn = $(`diff-btn-${key}`);
    const resBtn = $(`result-diff-${key}`);

    if (homeBtn) {
      homeBtn.className = isSelected
        ? `diff-btn ${cfg.activeCls} font-bold text-xs py-2 rounded-xl border shadow-xs flex flex-col items-center cursor-pointer`
        : "diff-btn bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-xs py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:border-indigo-300 transition flex flex-col items-center cursor-pointer";
    }
    if (resBtn) {
      resBtn.className = isSelected
        ? `result-diff-btn ${cfg.activeCls} font-bold text-[10px] py-1.5 rounded-lg border text-center cursor-pointer`
        : "result-diff-btn bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-center cursor-pointer";
    }
  });
}

function syncCountFromSlider(val) {
  selectedCount = parseInt(val, 10) || 10;
  if ($("question-count-input")) $("question-count-input").value = selectedCount;
  if ($("result-count-slider")) $("result-count-slider").value = selectedCount;
  if ($("result-count-display")) $("result-count-display").innerText = `${selectedCount}問`;
}

function syncCountFromInput(val) {
  const num = parseInt(val, 10);
  if (!isNaN(num) && num >= 1) {
    selectedCount = num;
    const s = $("question-count-slider");
    if (s) s.value = Math.min(Math.max(num, s.min), s.max);
    if ($("result-count-display")) $("result-count-display").innerText = `${num}問`;
  }
}

function syncResultCount(val) {
  syncCountFromSlider(val);
}

function toggleResultQuickConfig() {
  $("result-quick-config")?.classList.toggle("hidden");
}

function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle("dark");
  const icon = $("theme-icon");
  if (icon) icon.className = isDark ? "fa-solid fa-sun text-amber-400 text-xs" : "fa-solid fa-moon text-xs";
  localStorage.setItem(KEYS.THEME, isDark ? "dark" : "light");
}

function initTheme() {
  const saved = localStorage.getItem(KEYS.THEME);
  const isDark = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
  const icon = $("theme-icon");
  if (icon) icon.className = isDark ? "fa-solid fa-sun text-amber-400 text-xs" : "fa-solid fa-moon text-xs";
}

function toggleSound() {
  isMuted = !isMuted;
  if ($("sound-icon")) $("sound-icon").className = isMuted ? "fa-solid fa-volume-xmark text-rose-400 text-xs" : "fa-solid fa-volume-high text-indigo-300 text-xs";
  if ($("sound-label")) $("sound-label").innerText = isMuted ? "OFF" : "ON";
}

function speakWordText(wordText) {
  if (isMuted || !("speechSynthesis" in window) || !wordText) return;
  window.speechSynthesis.cancel();
  setTimeout(() => {
    const u = new SpeechSynthesisUtterance(wordText);
    u.lang = "en-US";
    u.rate = 0.85;
    const enVoice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("en"));
    if (enVoice) u.voice = enVoice;
    window.speechSynthesis.speak(u);
  }, 50);
}

function playSpeech() {
  const q = quizQuestions[currentIndex];
  if (q) speakWordText(q.word);
}

function unlockAudio() {
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }
}

// ===== 弱点履歴・アナリティクス管理 =====
const getMistakeHistoryMap = () => getStorageJSON(KEYS.HISTORY, {});
function saveMistakeHistoryMap(map) {
  setStorageJSON(KEYS.HISTORY, map);
  renderReviewButtons();
  scheduleCloudPush();
}

function recordMistakeMultiLevel(wordObj, isCorrect) {
  const map = getMistakeHistoryMap();
  const key = wordObj.no !== undefined ? wordObj.no : wordObj.id;
  if (!key) return;

  if (!map[key]) map[key] = { wordObj, mistakeCount: 0, streak: 0 };

  if (isCorrect) {
    map[key].streak = (map[key].streak || 0) + 1;
    map[key].mistakeCount = Math.max(0, (map[key].mistakeCount || 1) - 1);
    if (map[key].streak >= 2 || map[key].mistakeCount <= 0) delete map[key];
  } else {
    map[key].mistakeCount = (map[key].mistakeCount || 0) + 1;
    map[key].streak = 0;
  }
  saveMistakeHistoryMap(map);
}

function getMistakeList() {
  return Object.values(getMistakeHistoryMap())
    .map((item) => item.wordObj)
    .filter(Boolean);
}

window.resetMistakeData = function () {
  if (!confirm("弱点単語の記録をリセットしてもよろしいですか？")) return;
  localStorage.removeItem(KEYS.HISTORY);
  renderReviewButtons();
  scheduleCloudPush();
};

function renderReviewButtons() {
  const homeContainer = $("home-review-btn-container");
  const count = getMistakeList().length;
  const html = `
    <div class="flex items-center gap-1.5 w-full">
      ${
        count > 0
          ? `<button type="button" onclick="startQuiz('review')" class="flex-1 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-bold py-2.5 px-3 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-fire text-rose-500"></i><span>弱点集中復習 (${count}問)</span>
             </button>`
          : `<div class="flex-1 text-center text-[11px] font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 py-2.5 rounded-xl">
              <i class="fa-solid fa-check-circle text-emerald-400 mr-1"></i> 弱点単語はありません
             </div>`
      }
      <button type="button" onclick="resetMistakeData()" class="px-2.5 py-2.5 text-[11px] font-bold text-slate-400 hover:text-rose-500 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 hover:border-rose-300 rounded-xl transition flex items-center shrink-0 cursor-pointer" title="弱点リストをリセット">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>`;
  if (homeContainer) homeContainer.innerHTML = html;
}

function setStatsDisplayMode(mode) {
  statsDisplayMode = mode;
  const activeTabCls = "px-2.5 py-1 rounded-md bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs transition cursor-pointer";
  const inactiveTabCls = "px-2.5 py-1 rounded-md text-slate-500 dark:text-slate-400 transition cursor-pointer";

  if ($("stats-tab-mastery")) $("stats-tab-mastery").className = mode === "mastery" ? activeTabCls : inactiveTabCls;
  if ($("stats-tab-accuracy")) $("stats-tab-accuracy").className = mode === "accuracy" ? activeTabCls : inactiveTabCls;
  renderStatsGraph();
}

function recordAnswerStat(wordNo, isCorrect) {
  const no = Number(wordNo);
  if (!no || no < 1) return;

  const list = getStorageJSON(KEYS.MASTERED, []);
  const masteredSet = new Set(Array.isArray(list) ? list : []);
  if (isCorrect) {
    masteredSet.add(no);
  } else {
    masteredSet.delete(no);
  }
  setStorageJSON(KEYS.MASTERED, Array.from(masteredSet));

  const blockIndex = Math.floor((no - 1) / 100);
  const start = blockIndex * 100 + 1;
  const end = (blockIndex + 1) * 100;
  const blockKey = `${start}-${end}`;
  const stats = getStorageJSON(KEYS.STATS, {});
  if (!stats[blockKey]) stats[blockKey] = { total: 0, correct: 0 };
  stats[blockKey].total += 1;
  if (isCorrect) stats[blockKey].correct += 1;
  setStorageJSON(KEYS.STATS, stats);

  renderStatsGraph();
  scheduleCloudPush();
}

function resetStatsData() {
  if (confirm("これまでの範囲別アナリティクスデータをリセットしますか？")) {
    localStorage.removeItem(KEYS.MASTERED);
    localStorage.removeItem(KEYS.STATS);
    renderStatsGraph();
    scheduleCloudPush();
  }
}

// ===== 習得率・正答率の範囲表示順（数値昇順ソート） =====
function renderStatsGraph() {
  const container = $("stats-graph-container");
  if (!container) return;

  const allWords = getAllWords();
  const maxNo = allWords.length > 0 ? Math.max(...allWords.map((w) => Number(w.no) || 0)) : 1500;
  const blockCount = Math.ceil(maxNo / 100);

  if (statsDisplayMode === "mastery") {
    const list = getStorageJSON(KEYS.MASTERED, []);
    const masteredSet = new Set(Array.isArray(list) ? list : []);
    let hasAny = false;
    const htmlList = [];

    const blocks = [];
    for (let i = 0; i < blockCount; i++) {
      const start = i * 100 + 1;
      const end = (i + 1) * 100;
      const displayEnd = Math.min(end, maxNo);
      blocks.push({ start, end: displayEnd });
    }
    blocks.sort((a, b) => a.start - b.start);

    blocks.forEach(({ start, end: displayEnd }) => {
      const denominator = displayEnd - start + 1;
      let masteredCount = 0;
      for (let n = start; n <= displayEnd; n++) {
        if (masteredSet.has(n)) masteredCount++;
      }
      if (masteredCount > 0) hasAny = true;

      const rate = denominator > 0 ? Math.round((masteredCount / denominator) * 100) : 0;
      const barColor = masteredCount === 0 ? "bg-slate-300 dark:bg-slate-700" : rate >= 80 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-500" : "bg-indigo-500";

      htmlList.push(`
        <div class="text-[11px] font-bold">
          <div class="flex justify-between text-slate-600 dark:text-slate-400 mb-0.5">
            <span>No.${start}〜${displayEnd}</span>
            <span>${masteredCount > 0 ? `${rate}% (${masteredCount}/${denominator}語)` : `未習得 (0/${denominator}語)`}</span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
            <div class="${barColor} h-full transition-all duration-500" style="width: ${rate}%"></div>
          </div>
        </div>`);
    });

    container.innerHTML = hasAny ? htmlList.join("") : `<div class="text-center text-xs text-slate-400 py-2 font-bold">クイズに正解すると100語ごとの習得率がここに表示されます</div>`;
  } else {
    const stats = getStorageJSON(KEYS.STATS, {});

    const keys = Object.keys(stats).sort((a, b) => {
      const cleanA = a.replace(/[^0-9-]/g, "");
      const cleanB = b.replace(/[^0-9-]/g, "");
      const numA = parseInt(cleanA.split("-")[0], 10) || 0;
      const numB = parseInt(cleanB.split("-")[0], 10) || 0;
      return numA - numB;
    });

    if (keys.length === 0) {
      container.innerHTML = `<div class="text-center text-xs text-slate-400 py-2 font-bold">クイズを解くと範囲ごとの累計正答率がここに表示されます</div>`;
      return;
    }

    container.innerHTML = keys
      .map((k) => {
        const s = stats[k];
        const rate = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
        const barColor = rate >= 80 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-500" : "bg-rose-500";
        const cleanK = k.replace(/[^0-9-]/g, "");
        const displayLabel = `No.${cleanK.replace("-", "〜")}`;

        return `
          <div class="text-[11px] font-bold">
            <div class="flex justify-between text-slate-600 dark:text-slate-400 mb-0.5">
              <span>${displayLabel}</span>
              <span>${rate}% (${s.correct}/${s.total}回)</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div class="${barColor} h-full transition-all duration-500" style="width: ${rate}%"></div>
            </div>
          </div>`;
      })
      .join("");
  }
}

// ===== コンボ倍率＆ランクUI更新 =====
function getComboMultiplier(combo) {
  if (combo >= 30) return 3.0;
  if (combo >= 20) return 2.2;
  if (combo >= 10) return 1.6;
  if (combo >= 5) return 1.3;
  return 1.0;
}

function updateRankUI() {
  const totalScore = parseInt(localStorage.getItem(KEYS.SCORE), 10) || 0;
  const rankInfo = getUserRankInfo(totalScore);

  if ($("total-score-display")) $("total-score-display").innerHTML = `${totalScore.toLocaleString()} <span class="text-[10px]">pt</span>`;
  if ($("user-rank-badge") && $("rank-name-text")) {
    $("user-rank-badge").className = `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs ${rankInfo.color}`;
    const displayText = rankInfo.classNum ? `${rankInfo.name} クラス${rankInfo.classNum}` : rankInfo.name;
    $("rank-name-text").textContent = displayText;
  }

  if (rankInfo.nextPt) {
    const span = rankInfo.nextPt - rankInfo.currentMin;
    const progress = span > 0 ? Math.min(100, Math.max(0, ((totalScore - rankInfo.currentMin) / span) * 100)) : 0;
    if ($("rank-progress-bar")) $("rank-progress-bar").style.width = `${progress}%`;
    if ($("next-rank-pt")) $("next-rank-pt").textContent = `あと ${(rankInfo.nextPt - totalScore).toLocaleString()} pt`;
  } else {
    if ($("rank-progress-bar")) $("rank-progress-bar").style.width = "100%";
    if ($("next-rank-pt")) $("next-rank-pt").textContent = "LEGEND MAX";
  }
}

// ===== クイズ開始・出題ロジック =====
function startQuiz(mode) {
  unlockAudio();
  cancelAnimationFrame(timerInterval);
  clearInterval(autoNextInterval);

  if (mode === "score_attack") {
    startScoreAttackMode();
    return;
  }

  isScoreAttackRun = false;
  restorePreScoreAttackConfig(); // ★追加：スコアアタック後の設定汚染を解除
  const allWords = getAllWords();
  if (allWords.length === 0) {
    alert("単語データが空です。words.js を確認してください。");
    return;
  }

  selectedCount = parseInt($("question-count-input")?.value || $("question-count-slider")?.value, 10) || 10;
  sessionGainedScore = 0;
  isPaused = false;
  currentQuizTimeLeft = 0;
  autoNextWaitLeft = 0;
  currentCombo = 0;
  maxCombo = 0;
  answerHistory = [];
  scoreCount = 0;
  currentIndex = 0;
  activeCoverRangeKey = "";
  if ($("pause-overlay")) $("pause-overlay").style.display = "none";

  const { start, end } = getNormalizedRange();
  const rangeKey = `${start}-${end}-${currentPosFilter}`;

  if (mode === "session_review") {
    if (currentSessionWrong.length === 0) {
      alert("この回で間違えた単語はありません！全問正解です！🎉");
      return;
    }
    quizQuestions = shuffleArray(currentSessionWrong);
    currentSessionWrong = [];
  } else if (mode === "review") {
    const mistakes = getMistakeList();
    if (mistakes.length === 0) {
      alert("現在、復習対象の弱点単語はありません。");
      return;
    }
    quizQuestions = shuffleArray(mistakes).slice(0, selectedCount);
  } else {
    currentSessionWrong = [];
    if (currentQuizOrder === "weak_pool") {
      const weakPool = getOptimizedWeakPool(start, end, selectedCount);
      if (weakPool.length === 0) {
        alert(`選択範囲(No.${start}〜${end})内に苦手記録のある単語がありません。通常ランダムまたは網羅モードをお試しください！`);
        return;
      }
      quizQuestions = weakPool;
    } else {
      let filtered = filterWordsByRange(allWords, start, end);
      const getWordStr = (w) => String(w.word || "").trim();

      if (selectedDifficulty === "tenfu") {
        const over7 = filtered.filter((w) => getWordStr(w).length >= 7);
        const under7 = filtered.filter((w) => getWordStr(w).length < 7);
        if (currentQuizOrder === "cover_all") {
          activeCoverRangeKey = rangeKey;
          const pickedOver = pickQuestionsCoverAll(over7, Math.min(selectedCount, over7.length), rangeKey);
          const need = selectedCount - pickedOver.length;
          const pickedUnder = need > 0 ? pickQuestionsCoverAll(under7, need, rangeKey) : [];
          quizQuestions = shuffleArray([...pickedOver, ...pickedUnder]);
        } else {
          const picked = shuffleArray(over7).slice(0, selectedCount);
          if (picked.length < selectedCount) {
            picked.push(...shuffleArray(under7).slice(0, selectedCount - picked.length));
          }
          quizQuestions = shuffleArray(picked);
        }
      } else if (selectedDifficulty === "kiwami") {
        const kiwamiPool = filtered.filter((w) => getWordStr(w).length >= 8);
        if (kiwamiPool.length === 0) {
          alert(`選択範囲(No.${start}〜${end})に8文字以上の単語がありません。範囲を広げるか品詞設定を確認してください。`);
          return;
        }
        if (currentQuizOrder === "cover_all") {
          activeCoverRangeKey = `${rangeKey}-kiwami`;
          quizQuestions = pickQuestionsCoverAll(kiwamiPool, selectedCount, activeCoverRangeKey);
        } else {
          quizQuestions = shuffleArray(kiwamiPool).slice(0, Math.min(selectedCount, kiwamiPool.length));
        }
      } else {
        if (filtered.length === 0) {
          alert(`選択範囲(No.${start}〜${end})に条件に一致する単語がありません。`);
          return;
        }
        if (currentQuizOrder === "cover_all") {
          activeCoverRangeKey = rangeKey;
          quizQuestions = pickQuestionsCoverAll(filtered, selectedCount, activeCoverRangeKey);
        } else {
          quizQuestions = shuffleArray(filtered).slice(0, Math.min(selectedCount, filtered.length));
        }
      }
    }
  }

  if ($("quiz-mode-badge")) {
    $("quiz-mode-badge").className = "text-[10px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full";
    $("quiz-mode-badge").innerText = mode === "session_review" ? "セッション復習" : mode === "review" ? "弱点集中復習" : currentQuizOrder === "weak_pool" ? "弱点プール" : "通常モード";
  }

  $("dashboard-screen")?.classList.add("hidden");
  $("config-screen")?.classList.add("hidden");
  $("result-screen")?.classList.add("hidden");
  $("analytics-section")?.classList.add("hidden");
  $("quiz-screen")?.classList.remove("hidden");

  showQuestion();
}

function showQuestion() {
  // ★① スコアアタック時：残り問題が5問以下になったら天賦プールを無限補充
  if (isScoreAttackRun && currentIndex >= quizQuestions.length - 5) {
    const pool = getAllWords().filter((w) => Number(w.no) >= 1 && Number(w.no) <= 1500);
    const over7 = shuffleArray(pool.filter((w) => String(w.word || "").trim().length >= 7));
    const under7 = shuffleArray(pool.filter((w) => String(w.word || "").trim().length < 7));
    quizQuestions.push(...over7, ...under7);
  }

  const q = quizQuestions[currentIndex];
  if (!q) return;

  // ★② 1問ごとの反射スピード計測開始時刻を記録
  saQuestionStartMs = performance.now();

  const savedHistory = answerHistory[currentIndex];
  isAnswered = Boolean(savedHistory);

  const wordNoVal = q.no !== undefined ? q.no : q.id || "";
  // ★③ スコアアタック中は「前へ戻る」ボタンを無効化
  if ($("prev-btn")) $("prev-btn").disabled = isScoreAttackRun || currentIndex === 0;
  // ★④ 問題数表記を「Q 1 / ∞」に変更
  if ($("progress-text")) {
    $("progress-text").innerText = isScoreAttackRun ? `Q ${currentIndex + 1} / ∞` : `Q ${currentIndex + 1} / ${quizQuestions.length}`;
  }
  if ($("score-text")) $("score-text").innerText = `SCORE: ${scoreCount}`;
  // ★⑤ 上部の問題進捗バーは満タン固定（60秒タイマーバーで残り時間を把握するため）
  if ($("progress-bar")) {
    $("progress-bar").style.width = isScoreAttackRun ? "100%" : `${(currentIndex / quizQuestions.length) * 100}%`;
  }
  if ($("word-no")) $("word-no").innerText = `No. ${wordNoVal}`;
  if ($("word-pos")) $("word-pos").innerText = q.pos || "";

  let starBtn = $("word-bookmark-btn");
  const wordNoNum = Number(wordNoVal);
  const isBookmarked = getBookmarks().map(Number).includes(wordNoNum);
  if (!starBtn && $("word-no")?.parentElement) {
    starBtn = document.createElement("button");
    starBtn.id = "word-bookmark-btn";
    starBtn.type = "button";
    $("word-no").insertAdjacentElement("afterend", starBtn);
  }
  if (starBtn) {
    starBtn.onclick = () => toggleBookmark(wordNoNum);
    starBtn.setAttribute("data-bookmark-no", wordNoNum);
    starBtn.className = `w-7 h-7 rounded-xl flex items-center justify-center transition cursor-pointer shrink-0 ${isBookmarked ? "bg-amber-100 dark:bg-amber-950/80 text-amber-500" : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-amber-500"}`;
    starBtn.innerHTML = `<i class="fa-${isBookmarked ? "solid" : "regular"} fa-star text-xs"></i>`;
  }

  const mistakeInfo = getMistakeHistoryMap()[wordNoVal];
  const badgeEl = $("word-level-badge");
  if (badgeEl) {
    if (mistakeInfo && mistakeInfo.mistakeCount > 0) {
      if ($("word-mistake-count")) $("word-mistake-count").innerText = mistakeInfo.mistakeCount;
      badgeEl.classList.remove("hidden");
    } else {
      badgeEl.classList.add("hidden");
    }
  }

  const isJaToEn = window.quizDirection === "ja_en";
  const optionsContainer = $("options-container");
  const typingContainer = $("typing-container");
  const kanaToggleBtn = $("quiz-kana-toggle-btn");

  if (currentQuizMode === "choice") {
    if ($("word-text")) $("word-text").innerText = isJaToEn ? q.meaning : q.word;
    if ($("word-kana")) {
      if (isJaToEn) {
        $("word-kana").innerText = "[ 意味から英単語を選択 ]";
        $("word-kana").classList.remove("kana-hidden-state");
        kanaToggleBtn?.classList.add("hidden");
      } else {
        kanaToggleBtn?.classList.remove("hidden");
        if (showKatakana) {
          $("word-kana").innerText = `[ ${q.kana || ""} ]`;
          $("word-kana").classList.remove("kana-hidden-state");
        } else {
          $("word-kana").innerText = "[ カタカナ非表示 ]";
          $("word-kana").classList.add("kana-hidden-state");
        }
      }
    }
    $("typing-hint")?.classList.add("hidden");
    optionsContainer?.classList.remove("hidden");
    typingContainer?.classList.add("hidden");

    const correctAnswer = isJaToEn ? q.word : q.meaning;
    let options = savedHistory?.options;
    if (!options) {
      const allWords = getAllWords();
      const dummyPool = allWords
        .filter((w) => (w.no !== undefined ? w.no : w.id) !== wordNoVal)
        .map((w) => (isJaToEn ? w.word : w.meaning))
        .filter((val) => val && val !== correctAnswer);
      options = shuffleArray([correctAnswer, ...shuffleArray(dummyPool).slice(0, 3)]);
    }

    if (optionsContainer) {
      optionsContainer.innerHTML = "";
      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className =
          "w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-700 dark:text-slate-200 font-bold py-3 px-4 rounded-xl text-left transition-all duration-150 active:scale-98 shadow-xs text-sm sm:text-base flex items-center justify-between group option-btn cursor-pointer";
        btn.innerHTML = `<span class="pr-2 leading-snug">${opt}</span><div class="w-5 h-5 shrink-0 rounded-full border-2 border-slate-200 dark:border-slate-600 flex items-center justify-center group-hover:border-indigo-400 transition-colors"><i class="fa-solid fa-check opacity-0 text-[10px]"></i></div>`;

        if (savedHistory) {
          btn.onclick = null;
          btn.classList.add("opacity-60", "cursor-not-allowed");
          if (opt === correctAnswer) {
            btn.classList.remove("opacity-60", "border-slate-200", "dark:border-slate-700");
            btn.classList.add("bg-emerald-50", "dark:bg-emerald-950/50", "border-emerald-500", "text-emerald-700", "dark:text-emerald-300");
            const iconBox = btn.querySelector("div");
            if (iconBox) {
              iconBox.classList.replace("border-slate-200", "border-emerald-500");
              iconBox.classList.add("bg-emerald-500");
            }
            const icon = btn.querySelector("i");
            if (icon) icon.className = "fa-solid fa-check text-white opacity-100 text-[10px]";
          } else if (!savedHistory.isCorrect && opt === savedHistory.selectedOption) {
            btn.classList.remove("opacity-60");
            btn.classList.add("bg-rose-50", "dark:bg-rose-950/50", "border-rose-400", "text-rose-700", "dark:text-rose-300");
            const errBox = btn.querySelector("div");
            if (errBox) {
              errBox.classList.replace("border-slate-200", "border-rose-400");
              errBox.classList.add("bg-rose-400");
            }
            const errIcon = btn.querySelector("i");
            if (errIcon) errIcon.className = "fa-solid fa-xmark text-white opacity-100 text-[10px]";
          }
        } else {
          btn.onclick = () => handleAnswer(opt === correctAnswer, btn, q, false, options, opt);
        }
        optionsContainer.appendChild(btn);
      });
    }
  } else {
    kanaToggleBtn?.classList.add("hidden");
    if ($("word-text")) $("word-text").innerText = q.meaning || "";
    if ($("word-kana")) {
      $("word-kana").innerText = `[ ${q.pos || ""} ]`;
      $("word-kana").classList.remove("kana-hidden-state");
    }
    if ($("typing-hint")) {
      $("typing-hint").innerText = `ヒント: ${q.word ? q.word.length : 0}文字 (${q.word ? q.word.charAt(0) : ""}...)`;
      $("typing-hint").classList.remove("hidden");
    }
    optionsContainer?.classList.add("hidden");
    typingContainer?.classList.remove("hidden");

    const input = $("typing-input");
    const submitBtn = $("typing-submit-btn");
    if (input) {
      if (savedHistory) {
        input.value = savedHistory.typedText || "";
        input.disabled = true;
        input.className = `w-full border-2 rounded-xl px-4 py-3 text-base font-bold text-center focus:outline-none transition shadow-xs ${
          savedHistory.isCorrect
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
            : "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300"
        }`;
        if (submitBtn) submitBtn.classList.add("hidden");
      } else {
        input.value = "";
        input.disabled = false;
        input.className =
          "w-full bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 focus:border-indigo-500 text-slate-800 dark:text-slate-100 rounded-xl px-4 py-3 text-base font-bold text-center focus:outline-none transition shadow-xs";
        if (submitBtn) submitBtn.classList.remove("hidden");
        setTimeout(() => input.focus(), 100);
      }
    }
  }

  updateComboUI();
  updateKatakanaUI();

  if (savedHistory) {
    cancelAnimationFrame(timerInterval);
    clearInterval(autoNextInterval);
    if ($("timer-sec")) $("timer-sec").innerText = "-";
    if ($("timer-bar")) $("timer-bar").style.width = "0%";
    $("auto-next-countdown")?.classList.add("hidden");
    showFeedback(savedHistory.isCorrect, `【解答済み】${savedHistory.feedbackText}`, q, false);
    $("timer-zone-2s")?.classList.add("hidden");
    $("timer-zone-3s")?.classList.add("hidden");
    $("timer-marker-2s")?.classList.add("hidden");
    $("timer-marker-3s")?.classList.add("hidden");
  } else {
    $("feedback-box")?.classList.add("hidden");
    $("auto-next-countdown")?.classList.remove("hidden");
    startTimer(false);

    if ($("auto-speech-toggle")?.checked && !isJaToEn) {
      setTimeout(playSpeech, 300);
    }
  }
}

function updateComboUI() {
  const badge = $("combo-badge");
  if (!badge) return;
  if (currentCombo >= 2) {
    if ($("combo-count")) $("combo-count").innerText = currentCombo;
    badge.classList.remove("hidden", "animate-combo");
    void badge.offsetWidth;
    badge.classList.add("animate-combo");
  } else {
    badge.classList.add("hidden");
  }
}

function startTimer(resume = false) {
  // ▼▼▼ ここから追加 ▼▼▼
  if (isScoreAttackRun) {
    // ★スコアアタック専用：全体60秒カウントダウン（問題が変わってもリセットしない）
    $("timer-zone-2s")?.classList.add("hidden");
    $("timer-zone-3s")?.classList.add("hidden");
    $("timer-marker-2s")?.classList.add("hidden");
    $("timer-marker-3s")?.classList.add("hidden");

    let lastFrameTime = performance.now();
    cancelAnimationFrame(timerInterval);

    const tickSa = (now) => {
      if (isPaused) return;
      const deltaMs = now - lastFrameTime;
      lastFrameTime = now;
      saRemainingMs = Math.max(0, saRemainingMs - deltaMs);
      currentQuizTimeLeft = Math.ceil(saRemainingMs / 1000);

      const widthPct = (saRemainingMs / 60000) * 100;
      if ($("timer-sec")) $("timer-sec").innerText = currentQuizTimeLeft;
      if ($("timer-bar")) {
        $("timer-bar").style.width = `${widthPct}%`;
        $("timer-bar").className = `relative z-10 ${saRemainingMs <= 10000 ? "bg-rose-500" : "bg-purple-500 dark:bg-purple-400"} h-full rounded-full`;
      }
      if ($("timer-text")) {
        $("timer-text").className = `${saRemainingMs <= 10000 ? "text-rose-600 dark:text-rose-400" : "text-purple-600 dark:text-purple-300"} font-black flex items-center gap-1`;
      }

      if (saRemainingMs <= 0) {
        clearInterval(autoNextInterval);
        showResult(); // ★60秒経過で即終了・リザルトへ
        return;
      }
      timerInterval = requestAnimationFrame(tickSa);
    };

    timerInterval = requestAnimationFrame(tickSa);
    return;
  }
  // ▲▲▲ ここまで追加（最後の return; でここで終了するため下の通常処理とは混ざりません） ▲▲▲

  if (!resume) {
    currentQuizTimeLeft = limitTime;
    currentQuizRemainingMs = limitTime * 1000;
  }

  const zone2s = $("timer-zone-2s");
  const zone3s = $("timer-zone-3s");
  const marker2s = $("timer-marker-2s");
  const marker3s = $("timer-marker-3s");

  if (zone2s && zone3s && marker2s && marker3s) {
    if (limitTime > 3) {
      const pct2s = ((limitTime - 2) / limitTime) * 100;
      const pct3s = ((limitTime - 3) / limitTime) * 100;
      zone2s.style.width = `${100 - pct2s}%`;
      zone3s.style.width = `${100 - pct3s}%`;
      marker2s.style.left = `calc(${pct2s}% - 1.5px)`;
      marker3s.style.left = `calc(${pct3s}% - 1.25px)`;
      zone2s.classList.remove("hidden");
      zone3s.classList.remove("hidden");
      marker2s.classList.remove("hidden");
      marker3s.classList.remove("hidden");
    } else {
      zone2s.style.width = "100%";
      zone2s.classList.remove("hidden");
      zone3s.classList.add("hidden");
      marker2s.classList.add("hidden");
      marker3s.classList.add("hidden");
    }
  }

  let lastFrameTime = performance.now();
  cancelAnimationFrame(timerInterval);

  const tick = (now) => {
    if (isPaused) return;

    const deltaMs = now - lastFrameTime;
    lastFrameTime = now;
    currentQuizRemainingMs = Math.max(0, currentQuizRemainingMs - deltaMs);
    currentQuizTimeLeft = Math.ceil(currentQuizRemainingMs / 1000);

    const elapsedMs = limitTime * 1000 - currentQuizRemainingMs;
    const isUnder2s = limitTime <= 2 || elapsedMs <= 2000;
    const isUnder3s = limitTime <= 3 || elapsedMs <= 3000;
    const widthPct = limitTime > 0 ? (currentQuizRemainingMs / (limitTime * 1000)) * 100 : 0;

    if ($("timer-sec")) $("timer-sec").innerText = currentQuizTimeLeft;
    if ($("timer-bar")) {
      $("timer-bar").style.width = `${widthPct}%`;
      let barColor = "bg-purple-300 dark:bg-purple-600/80";
      if (isUnder2s) {
        barColor = "bg-purple-500 dark:bg-purple-400";
      } else if (isUnder3s) {
        barColor = "bg-violet-400 dark:bg-violet-400";
      } else if (currentQuizRemainingMs <= 3000) {
        barColor = "bg-rose-500";
      }
      $("timer-bar").className = `relative z-10 ${barColor} h-full rounded-full`;
    }
    if ($("timer-text")) {
      let textColor = "text-purple-500 dark:text-purple-300";
      if (isUnder2s) {
        textColor = "text-purple-600 dark:text-purple-300";
      } else if (isUnder3s) {
        textColor = "text-violet-600 dark:text-violet-300";
      } else if (currentQuizRemainingMs <= 3000) {
        textColor = "text-rose-600 dark:text-rose-400";
      }
      $("timer-text").className = `${textColor} font-black flex items-center gap-1`;
    }

    if (currentQuizRemainingMs <= 0) {
      const currentOpts = Array.from(document.querySelectorAll(".option-btn span")).map((el) => el.innerText);
      handleAnswer(false, null, quizQuestions[currentIndex], true, currentOpts, null);
      return;
    }

    timerInterval = requestAnimationFrame(tick);
  };

  timerInterval = requestAnimationFrame(tick);
}

function startAutoNext(resume = false) {
  if (!resume) autoNextWaitLeft = 3;
  $("auto-next-countdown")?.classList.remove("hidden");
  if ($("auto-next-sec")) $("auto-next-sec").innerText = autoNextWaitLeft;
  clearInterval(autoNextInterval);
  autoNextInterval = setInterval(() => {
    if (isPaused) return;
    autoNextWaitLeft--;
    if (autoNextWaitLeft > 0 && $("auto-next-sec")) $("auto-next-sec").innerText = autoNextWaitLeft;
    if (autoNextWaitLeft <= 0) {
      clearInterval(autoNextInterval);
      nextQuestion();
    }
  }, 1000);
}

function submitTypingAnswer(e) {
  e.preventDefault();
  if (isAnswered) return;
  const input = $("typing-input");
  const q = quizQuestions[currentIndex];
  const typedText = input.value.trim();
  const isCorrect = typedText.toLowerCase() === q.word.toLowerCase();

  input.disabled = true;
  input.classList.add(
    ...(isCorrect
      ? ["border-emerald-500", "bg-emerald-50", "dark:bg-emerald-950/40", "text-emerald-700", "dark:text-emerald-300"]
      : ["border-rose-500", "bg-rose-50", "dark:bg-rose-950/40", "text-rose-700", "dark:text-rose-300"]),
  );
  handleAnswer(isCorrect, null, q, false, null, null, typedText);
}

function handleAnswer(isCorrect, selectedBtn, wordObj, isTimeUp = false, options = null, selectedOption = null, typedText = "") {
  if (isAnswered) return;
  isAnswered = true;
  // handleAnswer() 内の cancelAnimationFrame(timerInterval); を以下に修正
  if (!isScoreAttackRun) {
    cancelAnimationFrame(timerInterval); // ★スコアアタック中は60秒タイマーを止めない
  }

  const correctLabel = window.quizDirection === "ja_en" ? wordObj.word : wordObj.meaning;

  if (currentQuizMode === "choice") {
    document.querySelectorAll(".option-btn").forEach((btn) => {
      btn.onclick = null;
      btn.classList.add("opacity-60", "cursor-not-allowed");
      if (btn.querySelector("span")?.innerText === correctLabel) {
        btn.classList.remove("opacity-60", "border-slate-200", "dark:border-slate-700");
        btn.classList.add("bg-emerald-50", "dark:bg-emerald-950/50", "border-emerald-500", "text-emerald-700", "dark:text-emerald-300");
        const iconBox = btn.querySelector("div");
        if (iconBox) {
          iconBox.classList.replace("border-slate-200", "border-emerald-500");
          iconBox.classList.add("bg-emerald-500");
        }
        const icon = btn.querySelector("i");
        if (icon) icon.className = "fa-solid fa-check text-white opacity-100 text-[10px]";
      }
    });
  }

  const { start, end } = getNormalizedRange();
  const rangePoolSize = filterWordsByRange(getAllWords(), start, end).length;
  markWordAsCovered(wordObj.no, rangePoolSize);

  recordAnswerStat(wordObj.no, isCorrect);
  recordMistakeMultiLevel(wordObj, isCorrect);
  updateWordSrs(wordObj.no, isCorrect);
  addStreakProgress(1);

  let feedbackText = "";
  let gained = 0;

  if (isCorrect) {
    scoreCount++;
    currentCombo++;
    if (currentCombo > maxCombo) maxCombo = currentCombo;

    // handleAnswer() 内の elapsedMs 計算部分を以下に差し替え
    const elapsedMs = isScoreAttackRun ? Math.max(0, performance.now() - saQuestionStartMs) : Math.max(0, (limitTime || 10) * 1000 - currentQuizRemainingMs);
    const isUnder2s = (!isScoreAttackRun && limitTime <= 2) || elapsedMs <= 2000;
    const isUnder3s = (!isScoreAttackRun && limitTime <= 3) || elapsedMs <= 3000;

    let speedBonus = Math.max(0, Math.round((currentQuizTimeLeft / (limitTime || 10)) * 3));
    if (isUnder2s) {
      speedBonus = 10;
    } else if (isUnder3s) {
      speedBonus = 5;
    }

    const basePt = 10 + speedBonus;
    const diffMult = DIFF_CONFIG[selectedDifficulty]?.mult || 1.0;
    const typingMult = currentQuizMode === "typing" ? 1.3 : 1.0;
    gained = Math.round(basePt * getComboMultiplier(currentCombo) * diffMult * typingMult) || 0;

    sessionGainedScore += gained;
    const newTotal = (parseInt(localStorage.getItem(KEYS.SCORE), 10) || 0) + gained;
    localStorage.setItem(KEYS.SCORE, newTotal);
    scheduleCloudPush();

    if (isUnder2s) {
      feedbackText = `⚡2秒神速正解! +${gained}pt`;
    } else if (isUnder3s) {
      feedbackText = `⚡3秒反射正解! +${gained}pt`;
    } else {
      feedbackText = `正解! +${gained}pt`;
    }
    updateComboUI();
    showFeedback(true, feedbackText, wordObj, true);
  } else {
    currentCombo = 0;
    updateComboUI();
    if (selectedBtn) {
      selectedBtn.classList.remove("opacity-60");
      selectedBtn.classList.add("bg-rose-50", "dark:bg-rose-950/50", "border-rose-400", "text-rose-700", "dark:text-rose-300");
      const errBox = selectedBtn.querySelector("div");
      if (errBox) {
        errBox.classList.replace("border-slate-200", "border-rose-400");
        errBox.classList.add("bg-rose-400");
      }
      const errIcon = selectedBtn.querySelector("i");
      if (errIcon) errIcon.className = "fa-solid fa-xmark text-white opacity-100 text-[10px]";
    }
    const prefix = isTimeUp ? "時間切れ..." : "不正解...";
    if (!currentSessionWrong.some((w) => w.no === wordObj.no)) {
      currentSessionWrong.push(wordObj);
    }
    feedbackText = `${prefix} 正解: ${wordObj.word} (${wordObj.meaning})`;
    showFeedback(false, feedbackText, wordObj, true);
  }

  // 月曜始まりの今週の学習数に加算
  addWeeklyProgress(1, gained);

  answerHistory[currentIndex] = {
    isCorrect,
    wordObj,
    options,
    selectedOption,
    typedText,
    feedbackText,
  };

  if (window.quizDirection === "ja_en" && $("auto-speech-toggle")?.checked) {
    playSpeech();
  }
  if ($("score-text")) $("score-text").innerText = `SCORE: ${scoreCount}`;
  if (isScoreAttackRun) {
    setTimeout(() => {
      if (!isPaused && isScoreAttackRun && saRemainingMs > 0) {
        nextQuestion();
      }
    }, 600); // ★スコアアタックは0.6秒後にテンポ良く次の問題へ
  } else {
    startAutoNext(false);
  }
}

function showFeedback(isSuccess, text, wordObj, animate = true) {
  const box = $("feedback-box");
  if (!box) return;
  box.className = `p-3 rounded-2xl transition-all duration-300 shadow-xs ${
    isSuccess
      ? "bg-emerald-100/50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
      : "bg-rose-100/50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
  }`;
  const icon = isSuccess ? '<i class="fa-solid fa-circle-check mr-1.5"></i>' : '<i class="fa-solid fa-circle-xmark mr-1.5"></i>';
  if ($("feedback-text")) $("feedback-text").innerHTML = `${icon} ${text}`;

  const synContainer = $("synonyms-container");
  if (synContainer && $("synonyms-list")) {
    if (wordObj.synonyms?.length > 0) {
      synContainer.classList.remove("hidden");
      $("synonyms-list").innerHTML = wordObj.synonyms
        .map((s) => `<span class="bg-indigo-100 dark:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide">${s}</span>`)
        .join("");
    } else {
      synContainer.classList.add("hidden");
    }
  }
  box.classList.remove("hidden");
  if (animate) {
    box.classList.add("pulse-once");
    setTimeout(() => box.classList.remove("pulse-once"), 300);
  }
}

// ===== キーボードショートカット =====
window.addEventListener("keydown", (e) => {
  const quizScreen = $("quiz-screen");
  if (!quizScreen || quizScreen.classList.contains("hidden") || isPaused) return;

  if (currentQuizMode === "choice" && !isAnswered) {
    const key = e.key;
    if (["1", "2", "3", "4"].includes(key)) {
      const optionBtns = document.querySelectorAll(".option-btn");
      const idx = parseInt(key, 10) - 1;
      if (optionBtns[idx]) {
        optionBtns[idx].click();
        e.preventDefault();
      }
    }
  }

  if (e.key === "Enter" && isAnswered) {
    const nextBtn = $("next-btn");
    if (nextBtn && !nextBtn.disabled) {
      nextQuestion();
      e.preventDefault();
    }
  }
});

// ===== ナビゲーション =====
function prevQuestion() {
  if (currentIndex <= 0) return;
  cancelAnimationFrame(timerInterval);
  clearInterval(autoNextInterval);
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  currentIndex--;
  showQuestion();
}

function nextQuestion() {
  cancelAnimationFrame(timerInterval);
  clearInterval(autoNextInterval);
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  currentIndex++;
  currentIndex < quizQuestions.length ? showQuestion() : showResult();
}

function togglePause() {
  isPaused = !isPaused;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  const overlay = $("pause-overlay");
  if (isPaused) {
    if (overlay) overlay.style.display = "flex";
    cancelAnimationFrame(timerInterval);
    clearInterval(autoNextInterval);
  } else {
    if (overlay) overlay.style.display = "none";
    if (!answerHistory[currentIndex]) {
      isAnswered ? autoNextWaitLeft > 0 && startAutoNext(true) : currentQuizTimeLeft > 0 && startTimer(true);
    }
  }
}

function openQuitModal() {
  isPaused = true;
  cancelAnimationFrame(timerInterval);
  clearInterval(autoNextInterval);
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  $("quit-modal")?.classList.remove("hidden");
}

function closeQuitModal() {
  $("quit-modal")?.classList.add("hidden");
  isPaused = false;
  if (!answerHistory[currentIndex]) {
    isAnswered ? autoNextWaitLeft > 0 && startAutoNext(true) : currentQuizTimeLeft > 0 && startTimer(true);
  }
}

function forceQuit(destination = "config") {
  isPaused = false;
  isScoreAttackRun = false;
  restorePreScoreAttackConfig();
  activeCoverRangeKey = "";
  cancelAnimationFrame(timerInterval);
  clearInterval(autoNextInterval);
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if ($("pause-overlay")) $("pause-overlay").style.display = "none";
  $("quit-modal")?.classList.add("hidden");
  scheduleCloudPush();

  if (destination === "home") {
    showStartScreen();
  } else {
    openConfigScreen();
  }
}

function renderResultWrongList() {
  const resultScreen = $("result-screen");
  if (!resultScreen) return;

  let container = $("result-wrong-list-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "result-wrong-list-container";
    const reviewBtn = resultScreen.querySelector("button[onclick=\"startQuiz('session_review')\"]");
    if (reviewBtn) {
      reviewBtn.insertAdjacentElement("beforebegin", container);
    } else {
      resultScreen.appendChild(container);
    }
  }

  if (!currentSessionWrong || currentSessionWrong.length === 0) {
    container.className = "hidden";
    container.innerHTML = "";
    return;
  }

  const itemsHtml = currentSessionWrong
    .map((w) => {
      const safeWord = String(w.word || "").replace(/'/g, "\\'");
      return `
        <div class="flex items-center justify-between py-2 px-2.5 bg-white dark:bg-slate-800 rounded-xl border border-rose-100 dark:border-slate-700 text-left gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10px] font-black text-rose-600 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-950 px-1.5 py-0.5 rounded">No.${w.no || "-"}</span>
              <span class="font-black text-xs sm:text-sm text-slate-800 dark:text-slate-100">${w.word || ""}</span>
              <span class="text-[10px] font-bold text-slate-400">${w.pos || ""}</span>
            </div>
            <p class="text-[11px] font-bold text-slate-600 dark:text-slate-300 mt-0.5 truncate">${w.meaning || ""}</p>
          </div>
          <button type="button" onclick="speakWordText('${safeWord}')" title="発音を聞く" class="w-7 h-7 shrink-0 bg-indigo-50 dark:bg-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-800 text-indigo-600 dark:text-indigo-300 rounded-lg flex items-center justify-center transition active:scale-95 cursor-pointer">
            <i class="fa-solid fa-volume-high text-[11px]"></i>
          </button>
        </div>`;
    })
    .join("");

  container.className = "bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/50 rounded-2xl p-3 mb-3.5 text-left";
  container.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-extrabold text-rose-600 dark:text-rose-400 flex items-center gap-1">
        <i class="fa-solid fa-circle-exclamation"></i> 今回間違えた単語 (${currentSessionWrong.length}語)
      </span>
      <span class="text-[10px] font-bold text-slate-400">再テスト対象済</span>
    </div>
    <div class="space-y-1.5 max-h-44 overflow-y-auto pr-1">${itemsHtml}</div>
  `;
}

function renderResultGrowthAndMvp() {
  const resultScreen = $("result-screen");
  if (!resultScreen) return;

  let container = $("result-growth-mvp-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "result-growth-mvp-container";
    const commentEl = $("result-comment");
    if (commentEl) {
      commentEl.insertAdjacentElement("afterend", container);
    } else {
      resultScreen.appendChild(container);
    }
  }

  const totalScore = parseInt(localStorage.getItem(KEYS.SCORE), 10) || 0;
  const rankInfo = getUserRankInfo(totalScore);

  let saRecordHtml = "";
  if (isScoreAttackRun) {
    const prevBest = parseInt(localStorage.getItem(KEYS.SA_BEST), 10) || 0;
    const isNewRecord = sessionGainedScore > prevBest;
    if (isNewRecord) {
      localStorage.setItem(KEYS.SA_BEST, String(sessionGainedScore));
    }
    const displayBest = Math.max(prevBest, sessionGainedScore);
    saRecordHtml = `
      <div class="bg-amber-50/90 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-2xl p-3 mb-2 text-center">
        <div class="text-xs font-black text-amber-600 dark:text-amber-400">
          ${isNewRecord ? "🎉 スコアアタック自己ベスト更新！" : "⚡ スコアアタック公式記録"}
        </div>
        <div class="text-sm font-black mt-0.5">今回スコア: ${sessionGainedScore.toLocaleString()} pt（自己ベスト: ${displayBest.toLocaleString()} pt）</div>
      </div>`;
  }

  let nextInfoHtml = "";
  if (rankInfo.nextPt) {
    const diffPt = rankInfo.nextPt - totalScore;
    const estSets = Math.max(1, Math.ceil(diffPt / 150));
    nextInfoHtml = `
      <div class="bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900 rounded-2xl p-3 mb-2 text-left">
        <div class="flex justify-between text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1">
          <span><i class="fa-solid fa-arrow-trend-up mr-1"></i> 次の昇格まで（現在: ${rankInfo.name}${rankInfo.classNum ? ` クラス${rankInfo.classNum}` : ""}）</span>
          <span>あと ${diffPt.toLocaleString()} pt</span>
        </div>
        <p class="text-[10px] text-slate-500 dark:text-slate-400">3秒反射ペースであと約 ${estSets} セット（10問単位）のクリア！</p>
      </div>`;
  } else {
    nextInfoHtml = `
      <div class="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-2xl p-3 mb-2 text-center text-xs font-bold text-amber-600 dark:text-amber-400">
        <i class="fa-solid fa-crown mr-1"></i> 最高ランク（レジェンド）到達中！
      </div>`;
  }

  let mvpHtml = "";
  const correctHistory = answerHistory.filter((h) => h && h.isCorrect);
  if (correctHistory.length > 0) {
    const sortedMvp = [...correctHistory].sort((a, b) => {
      const map = getMistakeHistoryMap();
      const countA = map[a.wordObj.no]?.mistakeCount || 0;
      const countB = map[b.wordObj.no]?.mistakeCount || 0;
      return countB - countA;
    });
    const mvpWord = sortedMvp[0]?.wordObj;
    if (mvpWord) {
      mvpHtml = `
        <div class="bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-2xl p-3 text-left">
          <div class="flex items-center gap-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-300 mb-1">
            <i class="fa-solid fa-award"></i> 今回のMVP克服単語
          </div>
          <div class="flex items-center justify-between">
            <div>
              <span class="text-xs font-black text-slate-800 dark:text-slate-100">${mvpWord.word}</span>
              <span class="text-[10px] text-slate-500 ml-1">(${mvpWord.meaning})</span>
            </div>
            <span class="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">ナイス克服！</span>
          </div>
        </div>`;
    }
  }

  container.innerHTML = saRecordHtml + nextInfoHtml + mvpHtml;
}

function showResult() {
  $("quiz-screen")?.classList.add("hidden");
  $("result-screen")?.classList.remove("hidden");
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  const total = quizQuestions.length || 1;
  const { start, end } = getNormalizedRange();
  if ($("result-range-info")) {
    $("result-range-info").innerText = isScoreAttackRun
      ? `スコアアタック公式戦 (No.1〜1500 / 60秒無制限 / 天賦2.1倍)`
      : `出題範囲: No.${start}〜${end} (${DIFF_CONFIG[selectedDifficulty]?.label || "基礎"})`;
  }
  if ($("final-score")) $("final-score").innerText = `${scoreCount} / ${total}`;
  if ($("max-combo-num")) $("max-combo-num").innerText = maxCombo;

  const rate = scoreCount / total;
  const tiers = [
    { min: 1.0, msg: "完璧です！この調子で語彙力を極めましょう！", icon: "fa-crown text-amber-300", bg: "from-amber-300 to-yellow-500" },
    { min: 0.8, msg: "素晴らしい成績です！あともう少しで完璧！", icon: "fa-medal text-emerald-300", bg: "from-emerald-400 to-teal-500" },
    { min: 0.5, msg: "合格点です。間違えた単語はしっかり復習しましょう。", icon: "fa-thumbs-up text-indigo-300", bg: "from-blue-400 to-indigo-500" },
    { min: 0.0, msg: "伸びしろがたっぷりあります！反復練習あるのみです！", icon: "fa-fire-flame-curved text-rose-300", bg: "from-rose-400 to-red-500" },
  ];
  const tier = tiers.find((t) => rate >= t.min);

  if ($("result-icon")) $("result-icon").className = `fa-solid ${tier.icon}`;
  if ($("result-icon-bg"))
    $("result-icon-bg").className = `w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mx-auto mb-3 text-3xl shadow-lg bg-gradient-to-tr ${tier.bg} text-white`;
  if ($("result-comment")) {
    $("result-comment").innerHTML = `${tier.msg}<div class="mt-1 text-xs text-indigo-500 font-extrabold">今回獲得: +${sessionGainedScore.toLocaleString()} pt</div>`;
  }

  renderResultWrongList();
  renderResultGrowthAndMvp();
  renderReviewButtons();
  renderAdvancedHomeUI();
  renderStatsGraph();
  updateRankUI();
  pushLocalDataToCloud();
}

function initDifficultyButtons() {
  const keys = Object.keys(DIFF_CONFIG);
  if ($("home-diff-container")) {
    $("home-diff-container").innerHTML = keys
      .map(
        (k) =>
          `<button type="button" onclick="setDifficulty('${k}')" id="diff-btn-${k}"><span>${DIFF_CONFIG[k].label}</span><span class="text-[9px] font-normal opacity-80">${DIFF_CONFIG[k].sub}</span></button>`,
      )
      .join("");
  }
  if ($("result-diff-container")) {
    $("result-diff-container").innerHTML = keys.map((k) => `<button type="button" onclick="setDifficulty('${k}')" id="result-diff-${k}">${DIFF_CONFIG[k].label}</button>`).join("");
  }
  setDifficulty(selectedDifficulty);
}

function setQuickQuestionCount(count) {
  selectedCount = count;
  const inputEl = $("question-count-input");
  const sliderEl = $("question-count-slider");
  if (inputEl) inputEl.value = count;
  if (sliderEl) sliderEl.value = Math.min(Math.max(count, sliderEl.min), sliderEl.max);

  const resSlider = $("result-count-slider");
  if (resSlider) resSlider.value = count;
  if ($("result-count-display")) $("result-count-display").innerText = `${count}問`;

  document.querySelectorAll(".quick-count-btn").forEach((btn) => {
    const btnText = btn.innerText.trim();
    const isTarget = btnText === `${count}問`;
    if (isTarget) {
      btn.className = "quick-count-btn py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-black transition cursor-pointer border border-indigo-600 shadow-xs";
    } else {
      btn.className =
        "quick-count-btn py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-[10px] font-black transition cursor-pointer border border-slate-200/60 dark:border-slate-700";
    }
  });
}

window.onload = () => {
  initTheme();
  initKatakanaSetting();
  initDifficultyButtons();
  injectAdvancedUI();
  checkAndHandleSeasonReset();
  checkAndUpdateStreak();
  onRangeInputChange();
  updateWeeklyUI();
  renderReviewButtons();
  renderAdvancedHomeUI();
  renderStatsGraph();
  updateRankUI();
  setQuickQuestionCount(10);
};
