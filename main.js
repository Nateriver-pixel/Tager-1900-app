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
let currentQuizOrder = "random"; // 'random' | 'cover_all' | 'srs' | 'bookmarks' | 'weak'
let statsDisplayMode = "mastery"; // 'mastery' (/100語) | 'accuracy' (累計正答率)
window.quizDirection = "en_ja";
let currentPosFilter = "all"; // 'all' | '動詞' | '名詞' | '形容詞' | '副詞'

let timerInterval = null;
let autoNextInterval = null;
let currentQuizTimeLeft = 0;
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
  COVERED: "target1900_covered_pool_v1",
  SRS_DATA: "target1900_srs_data_v1",
  SRS_INTERVALS: "target1900_srs_intervals_v1",
  BOOKMARKS: "target1900_bookmarks_v1",
  STREAK: "target1900_streak_data_v1",
};

const DEFAULT_SRS_INTERVALS = [1, 3, 7, 14, 30];

const DIFF_CONFIG = {
  basic: { label: "基礎", sub: "10秒", time: 10, mult: 1.0, activeCls: "bg-indigo-600 text-white border-indigo-600" },
  applied: { label: "応用", sub: "5秒", time: 5, mult: 1.2, activeCls: "bg-amber-500 text-white border-amber-500" },
  hard: { label: "発展", sub: "2秒", time: 2, mult: 1.5, activeCls: "bg-orange-600 text-white border-orange-600" },
  tenfu: { label: "天賦", sub: "2秒･7文字以上優先", time: 2, mult: 2.0, activeCls: "bg-purple-600 text-white border-purple-600" },
  kiwami: { label: "極", sub: "2秒･8文字以上のみ", time: 2, mult: 3.0, activeCls: "bg-rose-600 text-white border-rose-600" },
};

const RANK_LIST = [
  { name: "レジェンド", min: 100000, color: "bg-gradient-to-r from-amber-400 via-orange-500 to-yellow-300 text-slate-900 border-amber-300 shadow-xs font-black" },
  { name: "マスター", min: 50000, color: "bg-purple-500/10 text-purple-600 border-purple-400 font-extrabold" },
  { name: "エキスパート", min: 20000, color: "bg-rose-500/10 text-rose-600 border-rose-400 font-bold" },
  { name: "エリート", min: 8000, color: "bg-indigo-500/10 text-indigo-600 border-indigo-400 font-bold" },
  { name: "ハイパー", min: 3000, color: "bg-cyan-500/10 text-cyan-600 border-cyan-400 font-bold" },
  { name: "スーパー", min: 800, color: "bg-emerald-500/10 text-emerald-600 border-emerald-400 font-bold" },
  { name: "ビギナー", min: 0, color: "bg-slate-100 text-slate-600 border-slate-300 font-bold" },
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
const getAllWords = () => (typeof getAppWordData === "function" ? getAppWordData() : window.wordsDataSet || wordsDataSet || []);

function shuffleArray(arr) {
  const res = [...arr];
  for (let i = res.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [res[i], res[j]] = [res[j], res[i]];
  }
  return res;
}

// ===== ① ランク概要説明ポップアップ ＆ 追加UIの動的インジェクション =====
function injectAdvancedUI() {
  // ランクバッジの横に「？」ボタンを注入
  const rankBadge = $("user-rank-badge");
  if (rankBadge && !$("rank-info-btn")) {
    const btn = document.createElement("button");
    btn.id = "rank-info-btn";
    btn.type = "button";
    btn.onclick = openRankModal;
    btn.className =
      "w-5 h-5 ml-1.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center hover:bg-indigo-600 hover:text-white transition cursor-pointer";
    btn.innerHTML = '<i class="fa-solid fa-question"></i>';
    rankBadge.insertAdjacentElement("afterend", btn);
  }

  // ホーム画面に SRS・My単語帳・苦手特訓ボタンエリアを注入
  const reviewContainer = $("home-review-btn-container");
  if (reviewContainer && !$("advanced-modes-grid")) {
    const wrapper = document.createElement("div");
    wrapper.id = "advanced-modes-grid";
    wrapper.className = "space-y-2 mb-3";
    reviewContainer.insertAdjacentElement("beforebegin", wrapper);
  }
  renderAdvancedHomeUI();

  // モーダル群（ランク詳細、SRS間隔設定、JSONバックアップ）のHTMLをbody末尾に注入
  if (!$("global-modals-container")) {
    const modContainer = document.createElement("div");
    modContainer.id = "global-modals-container";
    modContainer.innerHTML = `
      <!-- RANK INFO MODAL (①) -->
      <div id="rank-info-modal" onclick="if(event.target===this) closeRankModal()" class="hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-5 shadow-2xl relative max-h-[85vh] flex flex-col">
          <button type="button" onclick="closeRankModal()" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center cursor-pointer">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <div class="text-center mb-3 shrink-0">
            <div class="w-11 h-11 bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-1 text-lg">
              <i class="fa-solid fa-crown"></i>
            </div>
            <h3 class="text-base font-black">ランク＆ポイント仕様</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">正解スピード・連続コンボ・難易度倍率に応じて獲得ptが変動します</p>
          </div>
          <div id="rank-modal-list" class="space-y-2 overflow-y-auto pr-1 flex-1 mb-3"></div>
          <button type="button" onclick="closeRankModal()" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-sm transition cursor-pointer shrink-0">閉じる</button>
        </div>
      </div>

      <!-- SRS SETTINGS MODAL (②) -->
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
    `;
    document.body.appendChild(modContainer);
  }

  // 設定エリア付近に「JSONバックアップ(⑤)」と「品詞フィルタ(⑥)」を追加
  const startCard = $("start-screen");
  if (startCard && !$("backup-tools-bar")) {
    const toolBar = document.createElement("div");
    toolBar.id = "backup-tools-bar";
    toolBar.className = "flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800";
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
      <div class="text-[10px] font-bold text-slate-400 flex items-center gap-1">
        <i class="fa-solid fa-shield-halved text-indigo-500"></i> 完全ローカル・同期対応
      </div>
    `;
    // クイズ開始ボタンの直前に挿入
    const startBtn = startCard.querySelector("button[onclick*=\"startQuiz('normal')\"]");
    if (startBtn) startBtn.insertAdjacentElement("beforebegin", toolBar);
  }

  // 品詞フィルタ(⑥)をホーム画面の出題範囲付近に挿入
  const rangeCard = $("range-start")?.closest(".config-card");
  if (rangeCard && !$("pos-filter-container")) {
    const posDiv = document.createElement("div");
    posDiv.id = "pos-filter-container";
    posDiv.className = "mt-2 pt-2 border-t border-slate-100 dark:border-slate-800";
    posDiv.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1"><i class="fa-solid fa-filter text-indigo-500"></i>品詞絞り込み</label>
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

// ランク概要モーダル制御
function openRankModal() {
  const totalScore = parseInt(localStorage.getItem(KEYS.SCORE), 10) || 0;
  const listEl = $("rank-modal-list");
  if (listEl) {
    listEl.innerHTML = RANK_LIST.map((r, idx) => {
      const nextR = RANK_LIST[idx - 1];
      const rangeStr = nextR ? `${r.min.toLocaleString()} 〜 ${(nextR.min - 1).toLocaleString()} pt` : `${r.min.toLocaleString()} pt 以上`;
      const isCurrent = totalScore >= r.min && (!nextR || totalScore < nextR.min);
      return `
        <div class="p-3 rounded-2xl border ${isCurrent ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40" : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50"} flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-full text-xs border ${r.color}"><i class="fa-solid fa-crown text-[10px] mr-1"></i>${r.name}</span>
            ${isCurrent ? '<span class="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full">現在のランク</span>' : ""}
          </div>
          <span class="text-xs font-black text-slate-600 dark:text-slate-300">${rangeStr}</span>
        </div>`;
    }).join("");
  }
  $("rank-info-modal")?.classList.remove("hidden");
}

function closeRankModal() {
  $("rank-info-modal")?.classList.add("hidden");
}

// 品詞フィルタ設定 (⑥)
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
}

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
    const shortName = user.displayName || (user.email ? user.email.split("@")[0] : "同期中");
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
  try {
    const payload = {
      score: parseInt(localStorage.getItem(KEYS.SCORE), 10) || 0,
      mastered: getStorageJSON(KEYS.MASTERED, []),
      stats: getStorageJSON(KEYS.STATS, {}),
      history: getStorageJSON(KEYS.HISTORY, {}),
      covered: getStorageJSON(KEYS.COVERED, {}),
      srsData: getStorageJSON(KEYS.SRS_DATA, {}),
      srsIntervals: localStorage.getItem(KEYS.SRS_INTERVALS) || "",
      bookmarks: getStorageJSON(KEYS.BOOKMARKS, []),
      streak: getStorageJSON(KEYS.STREAK, { count: 0, lastDate: "", todayCount: 0 }),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection("users").doc(currentUser.uid).set(payload, { merge: true });
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
    const localMastered = getStorageJSON(KEYS.MASTERED, []);
    const localStats = getStorageJSON(KEYS.STATS, {});
    const localHistory = getStorageJSON(KEYS.HISTORY, {});
    const localCovered = getStorageJSON(KEYS.COVERED, {});
    const localSrs = getStorageJSON(KEYS.SRS_DATA, {});
    const localBookmarks = getStorageJSON(KEYS.BOOKMARKS, []);
    const localStreak = getStorageJSON(KEYS.STREAK, { count: 0, lastDate: "", todayCount: 0 });

    if (snap.exists) {
      const cloud = snap.data();

      const mergedScore = Math.max(localScore, Number(cloud.score) || 0);
      localStorage.setItem(KEYS.SCORE, mergedScore);

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

    await pushLocalDataToCloud();
    updateRankUI();
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
  const sEl = $("range-start");
  const eEl = $("range-end");
  if (sEl && Number(sEl.value) > 1500) sEl.value = 1500;
  if (eEl && Number(eEl.value) > 1500) eEl.value = 1500;
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

// ===== 網羅出題（1周優先）＆ 進捗リセットロジック =====
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

  if (currentQuizOrder !== "cover_all") {
    badge.classList.add("hidden");
    if (resetBtn) resetBtn.classList.add("hidden");
    return;
  }

  const { start, end } = getNormalizedRange();
  const rangeWords = filterWordsByRange(getAllWords(), start, end);
  const coveredMap = getStorageJSON(KEYS.COVERED, {});
  const rangeKey = `${start}-${end}-${currentPosFilter}`;
  const usedSet = new Set(coveredMap[rangeKey] || []);
  const doneCount = rangeWords.filter((w) => usedSet.has(w.no)).length;

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

  setStorageJSON(KEYS.COVERED, coveredMap);
  updateOrderProgressBadge();
  scheduleCloudPush();
}

function pickQuestionsCoverAll(pool, count, rangeKey) {
  if (pool.length === 0) return [];
  const coveredMap = getStorageJSON(KEYS.COVERED, {});
  let usedSet = new Set(coveredMap[rangeKey] || []);
  const picked = [];

  while (picked.length < count) {
    let remaining = pool.filter((w) => !usedSet.has(w.no));
    if (remaining.length === 0) {
      usedSet.clear();
      remaining = [...pool];
    }
    const shuffled = shuffleArray(remaining);
    const takeCount = Math.min(count - picked.length, shuffled.length);
    const batch = shuffled.slice(0, takeCount);
    batch.forEach((w) => {
      picked.push(w);
      usedSet.add(w.no);
    });
  }

  coveredMap[rangeKey] = Array.from(usedSet);
  setStorageJSON(KEYS.COVERED, coveredMap);
  updateOrderProgressBadge();
  scheduleCloudPush();
  return picked;
}

// ===== ② 分散学習 (SRS) ロジック =====
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
      nextReview: now, // 即時復習対象
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

// ===== ④ ストリーク（連続学習日数）＆ My単語帳 ＆ 苦手抽出 =====
function checkAndUpdateStreak() {
  const streakData = getStorageJSON(KEYS.STREAK, { count: 0, lastDate: "", todayCount: 0 });
  const todayStr = new Date().toISOString().split("T")[0];

  if (streakData.lastDate !== todayStr) {
    const lastD = new Date(streakData.lastDate);
    const currD = new Date(todayStr);
    const diffDays = Math.round((currD - lastD) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // 継続
    } else if (diffDays > 1) {
      streakData.count = 0; // 途切れ
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
  // UI上の星アイコン更新
  const btn = document.querySelector(`button[data-bookmark-no="${no}"]`);
  if (btn) {
    const isSaved = set.has(no);
    btn.className = `w-8 h-8 rounded-xl flex items-center justify-center transition cursor-pointer ${isSaved ? "bg-amber-100 dark:bg-amber-950/80 text-amber-500" : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-amber-500"}`;
    btn.innerHTML = `<i class="fa-${isSaved ? "solid" : "regular"} fa-star text-xs"></i>`;
  }
}

// 苦手抽出ロジック
function getWeakWordsTop() {
  const map = getStorageJSON(KEYS.HISTORY, {});
  const list = Object.values(map)
    .sort((a, b) => (b.mistakeCount || 0) - (a.mistakeCount || 0))
    .map((item) => item.wordObj)
    .filter(Boolean);
  return list;
}

// ===== ⑤ 学習データの JSON バックアップ（書き出し・復元） =====
function exportUserDataJSON() {
  const backup = {
    version: "8.0",
    exportedAt: new Date().toISOString(),
    score: localStorage.getItem(KEYS.SCORE) || "0",
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
      if (data.score) localStorage.setItem(KEYS.SCORE, data.score);
      if (data.stats) setStorageJSON(KEYS.STATS, data.stats);
      if (data.mastered) setStorageJSON(KEYS.MASTERED, data.mastered);
      if (data.history) setStorageJSON(KEYS.HISTORY, data.history);
      if (data.covered) setStorageJSON(KEYS.COVERED, data.covered);
      if (data.srsData) setStorageJSON(KEYS.SRS_DATA, data.srsData);
      if (data.srsIntervals) localStorage.setItem(KEYS.SRS_INTERVALS, data.srsIntervals);
      if (data.bookmarks) setStorageJSON(KEYS.BOOKMARKS, data.bookmarks);
      if (data.streak) setStorageJSON(KEYS.STREAK, data.streak);

      alert("学習データの復元が完了しました！");
      updateRankUI();
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
    <!-- ストリーク＆今日のノルマバッジ -->
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

    <!-- 特殊モード＆分散学習ボタン群 -->
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

    <!-- SRS間隔変更ボタン行 -->
    <div class="flex justify-end">
      <button type="button" onclick="openSrsSettingsModal()" class="text-[10px] font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition cursor-pointer">
        <i class="fa-solid fa-sliders"></i> SRS復習間隔をカスタム
      </button>
    </div>
  `;
}

function startSpecialQuiz(type) {
  unlockAudio();
  if (type === "srs") {
    const dueWords = getDueSrsWords();
    if (dueWords.length === 0) {
      alert("現在、復習期限が来ている単語はありません！");
      return;
    }
    quizQuestions = shuffleArray(dueWords).slice(0, selectedCount);
    currentQuizOrder = "srs";
  } else if (type === "bookmarks") {
    const bookNos = new Set(getBookmarks());
    const words = getAllWords().filter((w) => bookNos.has(Number(w.no)));
    if (words.length === 0) {
      alert("My単語帳に登録されている単語がありません。クイズ中に星マークを押して登録してください。");
      return;
    }
    quizQuestions = shuffleArray(words).slice(0, selectedCount);
    currentQuizOrder = "bookmarks";
  } else if (type === "weak") {
    const weak = getWeakWordsTop();
    if (weak.length === 0) {
      alert("現在、苦手な単語の記録はありません。");
      return;
    }
    quizQuestions = shuffleArray(weak).slice(0, selectedCount);
    currentQuizOrder = "weak";
  }

  // クイズ画面へ移行
  setupQuizEnvironment();
}

function setupQuizEnvironment() {
  clearInterval(timerInterval);
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
  if ($("pause-overlay")) $("pause-overlay").style.display = "none";

  $("start-screen")?.classList.add("hidden");
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
  const activeCls = "bg-indigo-600 text-white font-bold py-2 px-2 rounded-xl text-xs border border-indigo-600 shadow-xs flex items-center justify-center gap-1 transition cursor-pointer";
  const inactiveCls =
    "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2 px-2 rounded-xl text-xs hover:border-indigo-300 transition flex items-center justify-center gap-1 cursor-pointer";
  if ($("order-btn-random")) $("order-btn-random").className = order === "random" ? activeCls : inactiveCls;
  if ($("order-btn-cover_all")) $("order-btn-cover_all").className = order === "cover_all" ? activeCls : inactiveCls;
  if ($("order-desc-text")) {
    $("order-desc-text").innerText = order === "cover_all" ? "範囲内の全単語を重複なく1回ずつ優先出題します" : "毎回範囲内からランダムに抽出します";
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

// ===== 弱点履歴・範囲別アナリティクス管理 =====
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

// ===== ③ 累計正答率・習得率の範囲表示順バグ修正 (数値昇順ソート) =====
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

    // ブロック番号の若い順（1〜100, 101〜200...）に数値ソートして描画
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

    // "No." などの余計な文字を完全に排除し、確実に数値（開始番号）で昇順ソートする
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

        // クリーンな番号範囲文字列に整える（重複「No.No.」を絶対に防ぐ）
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

// ===== ランク計算 =====
function getComboMultiplier(combo) {
  if (combo >= 30) return 5.0;
  if (combo >= 20) return 3.0;
  if (combo >= 10) return 2.0;
  if (combo >= 5) return 1.5;
  return 1.0;
}

function updateRankUI() {
  const totalScore = parseInt(localStorage.getItem(KEYS.SCORE), 10) || 0;
  const currentRank = RANK_LIST.find((r) => totalScore >= r.min) || RANK_LIST[RANK_LIST.length - 1];
  if ($("total-score-display")) $("total-score-display").innerHTML = `${totalScore.toLocaleString()} <span class="text-[10px]">pt</span>`;
  if ($("user-rank-badge") && $("rank-name-text")) {
    $("user-rank-badge").className = `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs ${currentRank.color}`;
    $("rank-name-text").textContent = currentRank.name;
  }
  const idx = RANK_LIST.findIndex((r) => r.name === currentRank.name);
  const nextRank = RANK_LIST[idx - 1];
  if (nextRank) {
    const progress = Math.min(100, Math.max(0, ((totalScore - currentRank.min) / (nextRank.min - currentRank.min)) * 100));
    if ($("rank-progress-bar")) $("rank-progress-bar").style.width = `${progress}%`;
    if ($("next-rank-pt")) $("next-rank-pt").textContent = `あと ${(nextRank.min - totalScore).toLocaleString()} pt`;
  } else {
    if ($("rank-progress-bar")) $("rank-progress-bar").style.width = "100%";
    if ($("next-rank-pt")) $("next-rank-pt").textContent = "MAX RANK";
  }
}

// ===== クイズ開始・出題ロジック =====
function startQuiz(mode) {
  unlockAudio();
  clearInterval(timerInterval);
  clearInterval(autoNextInterval);

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
    let filtered = filterWordsByRange(allWords, start, end);
    const getWordStr = (w) => String(w.word || "").trim();

    if (selectedDifficulty === "tenfu") {
      const over7 = filtered.filter((w) => getWordStr(w).length >= 7);
      const under7 = filtered.filter((w) => getWordStr(w).length < 7);
      if (currentQuizOrder === "cover_all") {
        const pickedOver = pickQuestionsCoverAll(over7, Math.min(selectedCount, over7.length), `${rangeKey}-tenfu7`);
        const need = selectedCount - pickedOver.length;
        const pickedUnder = need > 0 ? pickQuestionsCoverAll(under7, need, `${rangeKey}-tenfuUnder`) : [];
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
      quizQuestions =
        currentQuizOrder === "cover_all" ? pickQuestionsCoverAll(kiwamiPool, selectedCount, `${rangeKey}-kiwami`) : shuffleArray(kiwamiPool).slice(0, Math.min(selectedCount, kiwamiPool.length));
    } else {
      if (filtered.length === 0) {
        alert(`選択範囲(No.${start}〜${end})に条件に一致する単語がありません。`);
        return;
      }
      quizQuestions = currentQuizOrder === "cover_all" ? pickQuestionsCoverAll(filtered, selectedCount, rangeKey) : shuffleArray(filtered).slice(0, Math.min(selectedCount, filtered.length));
    }
  }

  $("start-screen")?.classList.add("hidden");
  $("result-screen")?.classList.add("hidden");
  $("analytics-section")?.classList.add("hidden");
  $("quiz-screen")?.classList.remove("hidden");

  showQuestion();
}

function showQuestion() {
  const q = quizQuestions[currentIndex];
  if (!q) return;

  const savedHistory = answerHistory[currentIndex];
  isAnswered = Boolean(savedHistory);

  const wordNoVal = q.no !== undefined ? q.no : q.id || "";
  if ($("prev-btn")) $("prev-btn").disabled = currentIndex === 0;
  if ($("progress-text")) $("progress-text").innerText = `Q ${currentIndex + 1} / ${quizQuestions.length}`;
  if ($("score-text")) $("score-text").innerText = `SCORE: ${scoreCount}`;
  if ($("progress-bar")) $("progress-bar").style.width = `${(currentIndex / quizQuestions.length) * 100}%`;
  if ($("word-no")) $("word-no").innerText = `No. ${wordNoVal}`;
  if ($("word-pos")) $("word-pos").innerText = q.pos || "";

  // My単語帳スターボタンの動的配置・状態更新
  let starBtn = $("word-bookmark-btn");
  const wordNoNum = Number(wordNoVal);
  const isBookmarked = getBookmarks().includes(wordNoNum);
  if (!starBtn && $("word-no")?.parentElement) {
    starBtn = document.createElement("button");
    starBtn.id = "word-bookmark-btn";
    starBtn.type = "button";
    starBtn.onclick = () => toggleBookmark(wordNoNum);
    $("word-no").insertAdjacentElement("afterend", starBtn);
  }
  if (starBtn) {
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

  if (currentQuizMode === "choice") {
    if ($("word-text")) $("word-text").innerText = isJaToEn ? q.meaning : q.word;
    if ($("word-kana")) $("word-kana").innerText = isJaToEn ? "[ 意味から英単語を選択 ]" : `[ ${q.kana || ""} ]`;
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
          "w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-700 dark:text-slate-200 font-bold py-2.5 px-3.5 rounded-xl text-left transition-all duration-150 active:scale-98 shadow-xs text-xs sm:text-sm flex items-center justify-between group option-btn cursor-pointer";
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
    if ($("word-text")) $("word-text").innerText = q.meaning || "";
    if ($("word-kana")) $("word-kana").innerText = `[ ${q.pos || ""} ]`;
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

  if (savedHistory) {
    clearInterval(timerInterval);
    clearInterval(autoNextInterval);
    if ($("timer-sec")) $("timer-sec").innerText = "-";
    if ($("timer-bar")) $("timer-bar").style.width = "0%";
    $("auto-next-countdown")?.classList.add("hidden");
    showFeedback(savedHistory.isCorrect, `【解答済み】${savedHistory.feedbackText}`, q, false);
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
  if (!resume) currentQuizTimeLeft = limitTime;
  const updateUI = () => {
    if ($("timer-sec")) $("timer-sec").innerText = currentQuizTimeLeft;
    if ($("timer-bar")) {
      $("timer-bar").style.width = `${(currentQuizTimeLeft / limitTime) * 100}%`;
      $("timer-bar").className = `${currentQuizTimeLeft <= 3 ? "bg-rose-500" : "bg-amber-500"} h-full rounded-full transition-all duration-1000 linear`;
    }
    if ($("timer-text")) {
      $("timer-text").className = `${currentQuizTimeLeft <= 3 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"} font-black flex items-center gap-1`;
    }
  };

  updateUI();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (isPaused) return;
    currentQuizTimeLeft--;
    updateUI();
    if (currentQuizTimeLeft <= 0) {
      clearInterval(timerInterval);
      const currentOpts = Array.from(document.querySelectorAll(".option-btn span")).map((el) => el.innerText);
      handleAnswer(false, null, quizQuestions[currentIndex], true, currentOpts, null);
    }
  }, 1000);
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
  clearInterval(timerInterval);

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

  recordAnswerStat(wordObj.no, isCorrect);
  recordMistakeMultiLevel(wordObj, isCorrect);
  updateWordSrs(wordObj.no, isCorrect);
  addStreakProgress(1); // ストリーク（ノルマ30問）に加算

  let feedbackText = "";

  if (isCorrect) {
    scoreCount++;
    currentCombo++;
    if (currentCombo > maxCombo) maxCombo = currentCombo;

    const timerRatio = Math.min(100, Math.max(0, (currentQuizTimeLeft / (limitTime || 10)) * 100));
    const basePt = 10 + timerRatio * 0.5;
    const diffMult = DIFF_CONFIG[selectedDifficulty]?.mult || 1.0;
    const gained = Math.round(basePt * getComboMultiplier(currentCombo) * diffMult) || 0;

    sessionGainedScore += gained;
    const newTotal = (parseInt(localStorage.getItem(KEYS.SCORE), 10) || 0) + gained;
    localStorage.setItem(KEYS.SCORE, newTotal);
    scheduleCloudPush();

    feedbackText = `正解! +${gained}pt`;
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
  startAutoNext(false);
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

// ===== ④ PCキーボードショートカット対応 =====
window.addEventListener("keydown", (e) => {
  const quizScreen = $("quiz-screen");
  if (!quizScreen || quizScreen.classList.contains("hidden") || isPaused) return;

  // 4択モードでの 1〜4 キー回答
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

  // Enter キーで次へ進む（解答済みの場合）
  if (e.key === "Enter" && isAnswered) {
    const nextBtn = $("next-btn");
    if (nextBtn && !nextBtn.disabled) {
      nextQuestion();
      e.preventDefault();
    }
  }
});

// ===== ナビゲーション・画面遷移・リザルト演出 (⑦) =====
function prevQuestion() {
  if (currentIndex <= 0) return;
  clearInterval(timerInterval);
  clearInterval(autoNextInterval);
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  currentIndex--;
  showQuestion();
}

function nextQuestion() {
  clearInterval(timerInterval);
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
    clearInterval(timerInterval);
    clearInterval(autoNextInterval);
  } else {
    if (overlay) overlay.style.display = "none";
    if (!answerHistory[currentIndex]) {
      isAnswered ? autoNextWaitLeft > 0 && startAutoNext(true) : currentQuizTimeLeft > 0 && startTimer(true);
    }
  }
}

function forceQuit() {
  isPaused = false;
  clearInterval(timerInterval);
  clearInterval(autoNextInterval);
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if ($("pause-overlay")) $("pause-overlay").style.display = "none";
  showStartScreen();
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

// ⑦ クイズ終了後の「あと○語で次のランク！」＆「今回のMVP単語」演出
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
  const currentRank = RANK_LIST.find((r) => totalScore >= r.min) || RANK_LIST[RANK_LIST.length - 1];
  const idx = RANK_LIST.findIndex((r) => r.name === currentRank.name);
  const nextRank = RANK_LIST[idx - 1];

  let nextInfoHtml = "";
  if (nextRank) {
    const diffPt = nextRank.min - totalScore;
    const estQuestions = Math.ceil(diffPt / 15); // 平均獲得ptの目安
    nextInfoHtml = `
      <div class="bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900 rounded-2xl p-3 mb-2 text-left">
        <div class="flex justify-between text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1">
          <span><i class="fa-solid fa-arrow-trend-up mr-1"></i> 次のランク [${nextRank.name}] まで</span>
          <span>あと ${diffPt.toLocaleString()} pt</span>
        </div>
        <p class="text-[10px] text-slate-500 dark:text-slate-400">目安として全問正解であと約 ${estQuestions} セットのクリア！</p>
      </div>`;
  } else {
    nextInfoHtml = `
      <div class="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-2xl p-3 mb-2 text-center text-xs font-bold text-amber-600 dark:text-amber-400">
        <i class="fa-solid fa-crown mr-1"></i> 最高ランク（レジェンド）到達中！
      </div>`;
  }

  // 今回のMVP単語選出（今回正解した中で過去に一番ミス回数が多かった単語）
  let mvpHtml = "";
  const correctHistory = answerHistory.filter((h) => h && h.isCorrect);
  if (correctHistory.length > 0) {
    // 履歴の中でミスが多かったものをMVPに選ぶ
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

  container.innerHTML = nextInfoHtml + mvpHtml;
}

function showResult() {
  $("quiz-screen")?.classList.add("hidden");
  $("result-screen")?.classList.remove("hidden");
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  const total = quizQuestions.length || 1;
  const { start, end } = getNormalizedRange();
  if ($("result-range-info")) $("result-range-info").innerText = `出題範囲: No.${start}〜${end} (${DIFF_CONFIG[selectedDifficulty]?.label || "基礎"})`;
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

function showStartScreen() {
  $("quiz-screen")?.classList.add("hidden");
  $("result-screen")?.classList.add("hidden");
  $("start-screen")?.classList.remove("hidden");
  $("analytics-section")?.classList.remove("hidden");
  renderReviewButtons();
  renderAdvancedHomeUI();
  renderStatsGraph();
  updateOrderProgressBadge();
}

// ===== 初期化（難易度ボタン動的生成＆拡張UIインジェクション） =====
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
// ===== 出題数クイック選択機能 =====
function setQuickQuestionCount(count) {
  selectedCount = count;

  // 入力欄とスライダーの値を同期
  const inputEl = $("question-count-input");
  const sliderEl = $("question-count-slider");
  if (inputEl) inputEl.value = count;
  if (sliderEl) sliderEl.value = Math.min(Math.max(count, sliderEl.min), sliderEl.max);

  // リザルト画面側のスライダー表示もあれば同期
  const resSlider = $("result-count-slider");
  if (resSlider) resSlider.value = count;
  if ($("result-count-display")) $("result-count-display").innerText = `${count}問`;

  // ボタンの選択状態（見た目）を切り替え
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
  initDifficultyButtons();
  injectAdvancedUI();
  checkAndUpdateStreak();
  onRangeInputChange();
  renderReviewButtons();
  renderAdvancedHomeUI();
  renderStatsGraph();
  updateRankUI();
  setQuickQuestionCount(10);
};
