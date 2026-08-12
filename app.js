/* ====== FIREBASE CONFIG ======
   O'zingizning Firebase loyihangizdan olingan configni shu yerga joylang. */
const firebaseConfig = {
  apiKey: "AIzaSyCKeXrtIzpNibTPxQsKBUuwEw1OXk-vo4I",
  authDomain: "kundaliky.firebaseapp.com",
  projectId: "kundaliky",
  storageBucket: "kundaliky.firebasestorage.app",
  messagingSenderId: "397977733249",
  appId: "1:397977733249:web:c22369f58f4c4c35f92580"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const CACHE_VERSION = "kundaliky-v1";

const CATEGORIES = [
  { key: "biznes",   label: "Biznes/ish",       badge: "Moliyaviy",     monthlyBadge: "Qanday moliyaviy maqsadlar bor?",         cls: "b-blue"   },
  { key: "bilim",    label: "Bilim olish",       badge: "Intelektual",   monthlyBadge: "Intelektual o'sishga tayyormisiz?",       cls: "b-green"  },
  { key: "oila",     label: "Oila va do'stlar",  badge: "Munosabatlar",  monthlyBadge: "Munosabatlarda nimani yaxshilaymiz?",     cls: "b-purple" },
  { key: "sport",    label: "Sport",             badge: "Jismoniy",      monthlyBadge: "Jismoniy rivojlanish eng muhimi",         cls: "b-amber"  },
  { key: "qiziqish", label: "Qiziqishlar",       badge: "Erkin vaqt",    monthlyBadge: "Qanday qiziqishlaringiz bor?",            cls: "b-teal"   }
];

const WEEK_DAYS = [
  { key: "dushanba",   label: "Dushanba",   cls: "b-blue"  },
  { key: "seshanba",   label: "Seshanba",   cls: "b-cream" },
  { key: "chorshanba", label: "Chorshanba", cls: "b-green" },
  { key: "payshanba",  label: "Payshanba",  cls: "b-red"   },
  { key: "juma",       label: "Juma",       cls: "b-gray"  },
  { key: "shanba",     label: "Shanba",     cls: "b-purple"},
  { key: "yakshanba",  label: "Yakshanba",  cls: "b-red"   }
];
const WEEK_TOP_COLORS = ["b-blue", "b-cream", "b-amber", "b-red", "b-gray", "b-purple"];

let currentUser = null;
let currentView = "kunlik"; // kunlik | haftalik | oylik | sozlamalar
let currentDate = new Date();
let saveTimer = null;
let periodCache = {}; // { periodKey: dataObject }

/* ---------------- date helpers ---------------- */
function pad(n) { return n < 10 ? "0" + n : "" + n; }

function dailyKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function monthlyKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(weekNo)}`;
}
function weeklyKey(d) { return getISOWeek(d); }

const UZ_DAYS = ["Yakshanba","Dushanba","Seshanba","Chorshanba","Payshanba","Juma","Shanba"];
const UZ_MONTHS = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];

function formatDailyLabel(d) {
  return `${UZ_DAYS[d.getDay()]}, ${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`;
}
function formatWeeklyLabel(d) {
  const key = getISOWeek(d);
  const weekNum = key.split("-W")[1];
  return `${weekNum}-hafta, ${d.getFullYear()}`;
}
function formatMonthlyLabel(d) {
  return `${UZ_MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

/* ---------------- Firestore access ---------------- */
function periodDocRef(kind, key) {
  return db.collection("users").doc(currentUser.uid).collection(kind).doc(key);
}
function emptyPeriodData() {
  const o = {};
  CATEGORIES.forEach(c => (o[c.key] = []));
  return o;
}
function emptyDailyExtra() {
  return { eslatmalar: "", tahlil: "" };
}
function emptyWeeklyData() {
  return { top: ["", "", "", "", "", ""], days: {} };
}

async function loadPeriod(kind, key) {
  const cacheKey = kind + ":" + key;
  if (periodCache[cacheKey]) return periodCache[cacheKey];
  const snap = await periodDocRef(kind, key).get();

  if (kind === "weekly") {
    let data = snap.exists ? snap.data() : emptyWeeklyData();
    if (!data.top || !Array.isArray(data.top)) data.top = ["", "", "", "", "", ""];
    while (data.top.length < 6) data.top.push("");
    if (!data.days) data.days = {};
    WEEK_DAYS.forEach(d => { if (data.days[d.key] === undefined) data.days[d.key] = ""; });
    periodCache[cacheKey] = data;
    return data;
  }

  let data = snap.exists ? snap.data() : emptyPeriodData();
  CATEGORIES.forEach(c => { if (!data[c.key]) data[c.key] = []; });
  if (data.top === undefined) data.top = "";
  if (kind === "daily") {
    const extra = emptyDailyExtra();
    Object.keys(extra).forEach(k => { if (data[k] === undefined) data[k] = extra[k]; });
    if (!data.uchrashuvlar) data.uchrashuvlar = [];
  }
  periodCache[cacheKey] = data;
  return data;
}

function queueSave(kind, key) {
  showSaveStatus(false);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const cacheKey = kind + ":" + key;
    const data = periodCache[cacheKey];
    if (!data) return;
    try {
      await periodDocRef(kind, key).set(data, { merge: true });
      showSaveStatus(true);
    } catch (e) {
      console.error("Saqlashda xato:", e);
    }
  }, 700);
}

function showSaveStatus(saved) {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  el.classList.add("show");
  el.textContent = saved ? "Saqlandi" : "Saqlanmoqda...";
  if (saved) setTimeout(() => el.classList.remove("show"), 1500);
}

/* ---------------- rendering ---------------- */
function periodInfoForView(view) {
  if (view === "kunlik") return { kind: "daily", key: dailyKey(currentDate), label: formatDailyLabel(currentDate) };
  if (view === "haftalik") return { kind: "weekly", key: weeklyKey(currentDate), label: formatWeeklyLabel(currentDate) };
  return { kind: "monthly", key: monthlyKey(currentDate), label: formatMonthlyLabel(currentDate) };
}

function shiftDate(dir) {
  const d = new Date(currentDate);
  if (currentView === "kunlik") d.setDate(d.getDate() + dir);
  else if (currentView === "haftalik") d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  currentDate = d;
  renderMain();
}

async function renderMain() {
  const content = document.getElementById("content");
  const { kind, key, label } = periodInfoForView(currentView);
  document.getElementById("dateLabelText").innerHTML = `<b>${label}</b>`;
  document.getElementById("viewTitle").textContent =
    currentView === "kunlik" ? "Kunlik" : currentView === "haftalik" ? "Haftalik" : "Oylik";

  content.innerHTML = `<div class="loader" style="min-height:200px;">Yuklanmoqda...</div>`;
  const data = await loadPeriod(kind, key);
  content.innerHTML = "";

  if (kind === "weekly") {
    renderWeeklyView(content, kind, key, data);
  } else {
    if (kind === "monthly") content.appendChild(buildProgressBlock(data));

    content.appendChild(buildTopField(kind, key, data,
      kind === "monthly" ? "Bu oy uchun umumiy maqsad..." : "Bugungi asosiy fikr..."));

    CATEGORIES.forEach(cat => {
      content.appendChild(buildCategoryBlock(kind, key, data, cat));
    });

    if (kind === "daily") {
      content.appendChild(buildTextField(kind, key, data, "eslatmalar", "Eslatmalar", "Shoshilinch narsalarni yozib qo'ying..."));
      content.appendChild(buildListBlock(kind, key, data, "uchrashuvlar", "Uchrashuvlar", null, "Uchrashuv qo'shish..."));
      content.appendChild(buildTextField(kind, key, data, "tahlil", "Kun tahlili", "Kun qanday o'tdi, nima o'rgandingiz..."));
    }
  }

  const statusRow = document.createElement("div");
  statusRow.className = "save-status";
  statusRow.id = "saveStatus";
  statusRow.innerHTML = `Saqlandi`;
  content.appendChild(statusRow);
}

function buildTopField(kind, key, data, placeholder) {
  const wrap = document.createElement("div");
  wrap.className = "field-block top-field";
  const ta = document.createElement("textarea");
  ta.rows = 2;
  ta.placeholder = placeholder;
  ta.value = data.top || "";
  ta.oninput = () => {
    data.top = ta.value;
    queueSave(kind, key);
  };
  wrap.appendChild(ta);
  return wrap;
}

function renderWeeklyView(content, kind, key, data) {
  const topWrap = document.createElement("div");
  topWrap.className = "field-block week-top";
  WEEK_TOP_COLORS.forEach((cls, i) => {
    const row = document.createElement("div");
    row.className = "week-top-row";
    const dot = document.createElement("span");
    dot.className = "week-dot " + cls;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Yozing...";
    input.value = data.top[i] || "";
    input.oninput = () => {
      data.top[i] = input.value;
      queueSave(kind, key);
    };
    row.appendChild(dot);
    row.appendChild(input);
    topWrap.appendChild(row);
  });
  content.appendChild(topWrap);

  const grid = document.createElement("div");
  grid.className = "week-grid";
  WEEK_DAYS.forEach(day => {
    const card = document.createElement("div");
    card.className = "week-day-card";

    const head = document.createElement("div");
    head.className = "week-day-head";
    head.innerHTML = `<span class="week-day-label">${day.label}</span>`;
    const pill = document.createElement("span");
    pill.className = "day-pill " + day.cls;
    head.appendChild(pill);
    card.appendChild(head);

    const ta = document.createElement("textarea");
    ta.rows = 3;
    ta.placeholder = "Rejalar...";
    ta.value = data.days[day.key] || "";
    ta.oninput = () => {
      data.days[day.key] = ta.value;
      queueSave(kind, key);
    };
    card.appendChild(ta);

    grid.appendChild(card);
  });
  content.appendChild(grid);
}

function buildProgressBlock(data) {
  const wrap = document.createElement("div");
  wrap.className = "progress-wrap";
  let total = 0, done = 0;
  CATEGORIES.forEach(c => {
    (data[c.key] || []).forEach(item => { total++; if (item.done) done++; });
  });
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  wrap.innerHTML = `
    <div class="progress-bar"><div style="width:${pct}%"></div></div>
    <div class="progress-text">${done}/${total} vazifa bajarildi \u2014 ${pct}%</div>
  `;
  return wrap;
}

const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;
const ICON_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

function buildCategoryBlock(kind, key, data, cat) {
  const badgeText = kind === "monthly" ? cat.monthlyBadge : cat.badge;
  const cls = kind === "monthly" ? cat.cls + " badge-wide" : cat.cls;
  return buildListBlock(kind, key, data, cat.key, cat.label, { badge: badgeText, cls }, "Vazifa qo'shish...");
}

function buildListBlock(kind, key, data, fieldKey, label, badgeInfo, placeholder) {
  const wrap = document.createElement("div");
  wrap.className = "category";
  const head = document.createElement("div");
  head.className = "category-head" + (badgeInfo && badgeInfo.cls.includes("badge-wide") ? " stacked" : "");
  head.innerHTML = `<span class="label">${label}</span>` +
    (badgeInfo ? `<span class="badge ${badgeInfo.cls}">${badgeInfo.badge}</span>` : "");
  wrap.appendChild(head);

  const list = document.createElement("div");
  list.className = "item-list";

  (data[fieldKey] || []).forEach(item => {
    list.appendChild(buildDisplayRow(kind, key, data, fieldKey, item));
  });

  const addTrigger = document.createElement("div");
  addTrigger.className = "add-item";
  addTrigger.innerHTML = `+ Qo'shish`;
  addTrigger.onclick = () => {
    addTrigger.classList.add("hidden");
    const row = buildAddRow(kind, key, data, fieldKey, placeholder, () => {
      row.remove();
      addTrigger.classList.remove("hidden");
    });
    list.insertBefore(row, addTrigger);
    row.querySelector("input[type=text]").focus();
  };
  list.appendChild(addTrigger);

  wrap.appendChild(list);
  return wrap;
}

function buildAddRow(kind, key, data, fieldKey, placeholder, onDone) {
  const row = document.createElement("div");
  row.className = "add-row";
  const txt = document.createElement("input");
  txt.type = "text";
  txt.placeholder = placeholder || "Yozing...";

  const commit = () => {
    const val = txt.value.trim();
    if (!val) { onDone(); return; }
    const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: val, done: false };
    data[fieldKey].push(item);
    const displayRow = buildDisplayRow(kind, key, data, fieldKey, item);
    row.replaceWith(displayRow);
    queueSave(kind, key);
    onDone();
  };

  txt.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { row.remove(); onDone(); }
  };

  const saveBtn = document.createElement("button");
  saveBtn.className = "icon-btn edit";
  saveBtn.innerHTML = ICON_CHECK;
  saveBtn.onclick = commit;

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "icon-btn danger";
  cancelBtn.innerHTML = ICON_X;
  cancelBtn.onclick = () => { row.remove(); onDone(); };

  row.appendChild(txt);
  row.appendChild(saveBtn);
  row.appendChild(cancelBtn);
  return row;
}

function buildDisplayRow(kind, key, data, fieldKey, item) {
  const row = document.createElement("div");
  row.className = "item-row" + (item.done ? " done" : "");

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!item.done;
  cb.onchange = () => {
    item.done = cb.checked;
    row.classList.toggle("done", item.done);
    queueSave(kind, key);
    if (kind === "monthly") {
      const total = CATEGORIES.reduce((s, c) => s + (data[c.key] || []).length, 0);
      if (total > 0) {
        const doneCount = CATEGORIES.reduce((s, c) => s + (data[c.key] || []).filter(i => i.done).length, 0);
        if (doneCount === total) celebrate();
      }
      renderMain();
    }
  };

  const txt = document.createElement("span");
  txt.className = "item-text";
  txt.textContent = item.text || "";

  const editBtn = document.createElement("button");
  editBtn.className = "icon-btn edit";
  editBtn.innerHTML = ICON_EDIT;
  editBtn.onclick = () => {
    const editRow = buildEditRow(kind, key, data, fieldKey, item, row);
    row.replaceWith(editRow);
  };

  const delBtn = document.createElement("button");
  delBtn.className = "icon-btn danger";
  delBtn.innerHTML = ICON_TRASH;
  delBtn.onclick = () => {
    data[fieldKey] = data[fieldKey].filter(i => i.id !== item.id);
    row.remove();
    queueSave(kind, key);
  };

  row.appendChild(cb);
  row.appendChild(txt);
  row.appendChild(editBtn);
  row.appendChild(delBtn);
  return row;
}

function buildEditRow(kind, key, data, fieldKey, item, oldRow) {
  const row = document.createElement("div");
  row.className = "add-row";
  const txt = document.createElement("input");
  txt.type = "text";
  txt.value = item.text || "";

  const commit = () => {
    const val = txt.value.trim();
    if (val) item.text = val;
    queueSave(kind, key);
    const displayRow = buildDisplayRow(kind, key, data, fieldKey, item);
    row.replaceWith(displayRow);
  };

  txt.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { row.replaceWith(buildDisplayRow(kind, key, data, fieldKey, item)); }
  };

  const saveBtn = document.createElement("button");
  saveBtn.className = "icon-btn edit";
  saveBtn.innerHTML = ICON_CHECK;
  saveBtn.onclick = commit;

  row.appendChild(txt);
  row.appendChild(saveBtn);
  setTimeout(() => txt.focus(), 0);
  return row;
}

function buildTextField(kind, key, data, field, label, placeholder) {
  const wrap = document.createElement("div");
  wrap.className = "field-block";
  wrap.innerHTML = `<label>${label}</label>`;
  const ta = document.createElement("textarea");
  ta.placeholder = placeholder;
  ta.value = data[field] || "";
  ta.oninput = () => {
    data[field] = ta.value;
    queueSave(kind, key);
  };
  wrap.appendChild(ta);
  return wrap;
}

function celebrate() {
  const overlay = document.createElement("div");
  overlay.className = "celebrate-overlay";
  overlay.innerHTML = `
    <div class="celebrate-card">
      <div class="icon">\u{1F389}</div>
      <h2>Barakalla!</h2>
      <p>Shu oygi barcha maqsadlaringizga erishdingiz. Bu \u2014 yutish odati shakllanayotganining belgisi.</p>
      <button class="btn primary" id="celebrateClose">Davom etamiz</button>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("celebrateClose").onclick = () => overlay.remove();
}

/* ---------------- navigation ---------------- */
function switchView(view) {
  currentView = view;
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.view === view);
  });
  document.getElementById("mainScreen").classList.toggle("hidden", view === "sozlamalar");
  document.getElementById("settingsScreen").classList.toggle("hidden", view !== "sozlamalar");
  if (view !== "sozlamalar") renderMain();
}

/* ---------------- settings ---------------- */
function initSettings() {
  const darkSwitch = document.getElementById("darkSwitch");
  const isDark = localStorage.getItem("theme") === "dark";
  applyTheme(isDark);
  darkSwitch.classList.toggle("on", isDark);
  darkSwitch.onclick = () => {
    const nowDark = !darkSwitch.classList.contains("on");
    darkSwitch.classList.toggle("on", nowDark);
    applyTheme(nowDark);
    localStorage.setItem("theme", nowDark ? "dark" : "light");
  };

  document.getElementById("clearCacheBtn").onclick = async () => {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      regs.forEach(r => r.unregister());
    }
    location.reload(true);
  };

  document.getElementById("signOutBtn").onclick = () => auth.signOut();

  document.getElementById("linkGoogleBtn").onclick = async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.currentUser.linkWithPopup(provider);
      showToast("Hisob bog'landi");
      populateProfile(auth.currentUser);
    } catch (e) {
      console.error("Google link xatosi:", e.code, e.message);
      if (e.code === "auth/credential-already-in-use") {
        showToast("Bu Google hisob boshqa foydalanuvchida band");
      } else if (e.code === "auth/popup-blocked") {
        showToast("Brauzer popup oynani blokladi, ruxsat bering");
      } else if (e.code === "auth/unauthorized-domain") {
        showToast("Bu domen Firebase'da ro'yxatdan o'tmagan");
      } else if (e.code === "auth/popup-closed-by-user") {
        // foydalanuvchi o'zi yopdi, xabar shart emas
      } else {
        showToast("Xato: " + (e.code || e.message));
      }
    }
  };

  const nameInput = document.getElementById("profileNameInput");
  let nameSaveTimer = null;
  nameInput.oninput = () => {
    clearTimeout(nameSaveTimer);
    nameSaveTimer = setTimeout(async () => {
      if (!currentUser) return;
      await db.collection("users").doc(currentUser.uid).collection("meta").doc("settings")
        .set({ displayName: nameInput.value.trim() }, { merge: true });
      showToast("Saqlandi");
    }, 700);
  };

  document.getElementById("cardNumberBox").onclick = () => {
    const num = "5614684705391512";
    navigator.clipboard?.writeText(num).then(() => showToast("Karta raqami nusxalandi"));
  };

  document.getElementById("deleteAccountBtn").onclick = () => {
    showConfirm({
      title: "Hisobni o'chirasizmi?",
      text: "Bu amalni ortga qaytarib bo'lmaydi. Profil ma'lumotlaringiz o'chiriladi.",
      confirmLabel: "Ha, o'chirish",
      danger: true,
      onConfirm: async () => {
        try {
          const uid = currentUser.uid;
          await db.collection("users").doc(uid).collection("meta").doc("settings").delete().catch(() => {});
          await auth.currentUser.delete();
        } catch (e) {
          console.error(e);
          if (e.code === "auth/requires-recent-login") {
            showToast("Xavfsizlik uchun qayta kiring, so'ng qayta urinib ko'ring");
          } else {
            showToast("O'chirishda xatolik yuz berdi");
          }
        }
      }
    });
  };

  initInstallPrompt();
}

function applyTheme(isDark) {
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}

async function populateProfile(user) {
  const nameInput = document.getElementById("profileNameInput");
  const emailInput = document.getElementById("profileEmailInput");
  const linkCard = document.getElementById("linkAccountCard");

  emailInput.value = user.isAnonymous ? "Mehmon hisobi" : (user.email || "");
  linkCard.classList.toggle("hidden", !user.isAnonymous);

  let savedName = user.displayName || "";
  try {
    const snap = await db.collection("users").doc(user.uid).collection("meta").doc("settings").get();
    if (snap.exists && snap.data().displayName) savedName = snap.data().displayName;
  } catch (e) { /* ignore */ }
  nameInput.value = savedName;
}

/* ---------------- PWA install ---------------- */
let deferredInstallPrompt = null;
function initInstallPrompt() {
  const installBtn = document.getElementById("installBtn");
  const banner = document.getElementById("installBanner");
  const bannerBtn = document.getElementById("installBannerBtn");
  const bannerClose = document.getElementById("installBannerClose");
  const dismissed = sessionStorage.getItem("installBannerDismissed");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.classList.remove("hidden");
    if (!dismissed) banner.classList.remove("hidden");
  });

  async function runInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.classList.add("hidden");
    banner.classList.add("hidden");
  }

  installBtn.onclick = runInstall;
  bannerBtn.onclick = runInstall;
  bannerClose.onclick = () => {
    banner.classList.add("hidden");
    sessionStorage.setItem("installBannerDismissed", "1");
  };

  window.addEventListener("appinstalled", () => {
    installBtn.classList.add("hidden");
    banner.classList.add("hidden");
  });
}

/* ---------------- toast & confirm ---------------- */
function showToast(msg) {
  let toast = document.getElementById("toastEl");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toastEl";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("show"), 2000);
}

function showConfirm({ title, text, confirmLabel, danger, onConfirm }) {
  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";
  overlay.innerHTML = `
    <div class="confirm-card">
      <h2>${title}</h2>
      <p>${text}</p>
      <div class="row">
        <button class="btn ghost" id="confirmCancel" style="flex:1;">Bekor qilish</button>
        <button class="btn ${danger ? "" : "primary"}" id="confirmOk" style="flex:1;${danger ? "background:var(--danger);color:#fff;border:none;" : ""}">${confirmLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("confirmCancel").onclick = () => overlay.remove();
  document.getElementById("confirmOk").onclick = async () => {
    overlay.remove();
    await onConfirm();
  };
}

/* ---------------- onboarding ---------------- */
async function maybeShowOnboarding() {
  const metaRef = db.collection("users").doc(currentUser.uid).collection("meta").doc("settings");
  const snap = await metaRef.get();
  if (snap.exists && snap.data().onboarded) return;
  const overlay = document.createElement("div");
  overlay.className = "onboarding-overlay";
  overlay.innerHTML = `
    <div class="onboarding-card">
      <h2>Xush kelibsiz</h2>
      <p>Bu ilova qanchalik zo'r tuzilmasin, agar siz undan harakat qilib foydalanmasangiz, uning qiymati nolga teng. Bu qiymatni faqat o'zingiz qo'sha olasiz.</p>
      <button class="btn primary" id="onboardingClose">Boshlaymiz</button>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("onboardingClose").onclick = async () => {
    overlay.remove();
    await metaRef.set({ onboarded: true }, { merge: true });
  };
}

/* ---------------- auth ---------------- */
function initAuthButtons() {
  document.getElementById("googleSignInBtn").onclick = async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (e) {
      console.error(e);
      alert("Kirishda xatolik yuz berdi. Qayta urinib ko'ring.");
    }
  };
  document.getElementById("guestSignInBtn").onclick = async () => {
    try {
      await auth.signInAnonymously();
    } catch (e) {
      console.error(e);
      alert("Kirishda xatolik yuz berdi.");
    }
  };
}

auth.onAuthStateChanged(async (user) => {
  document.getElementById("loader").classList.add("hidden");
  if (user) {
    currentUser = user;
    periodCache = {};
    document.getElementById("authScreen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    await maybeShowOnboarding();
    await populateProfile(user);
    switchView("kunlik");
  } else {
    currentUser = null;
    document.getElementById("app").classList.add("hidden");
    document.getElementById("authScreen").classList.remove("hidden");
  }
});

/* ---------------- init ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  initAuthButtons();
  initSettings();
  document.getElementById("prevBtn").onclick = () => shiftDate(-1);
  document.getElementById("nextBtn").onclick = () => shiftDate(1);
  document.querySelectorAll(".nav-item").forEach(el => {
    el.onclick = () => switchView(el.dataset.view);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(err => console.warn("SW register failed", err));
  }
});
