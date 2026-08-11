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
    { key: "biznes",   label: "Biznes/ish",       badge: "Moliyaviy",     cls: "b-blue"   },
    { key: "bilim",    label: "Bilim olish",       badge: "Intelektual",   cls: "b-green"  },
    { key: "oila",     label: "Oila va do'stlar",  badge: "Munosabatlar",  cls: "b-purple" },
    { key: "sport",    label: "Sport",             badge: "Jismoniy",      cls: "b-amber"  },
    { key: "qiziqish", label: "Qiziqishlar",       badge: "Erkin vaqt",    cls: "b-teal"   }
  ];
  
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
    return { eslatmalar: "", uchrashuvlar: "", tahlil: "" };
  }
  
  async function loadPeriod(kind, key) {
    const cacheKey = kind + ":" + key;
    if (periodCache[cacheKey]) return periodCache[cacheKey];
    const snap = await periodDocRef(kind, key).get();
    let data = snap.exists ? snap.data() : emptyPeriodData();
    CATEGORIES.forEach(c => { if (!data[c.key]) data[c.key] = []; });
    if (kind === "daily") {
      const extra = emptyDailyExtra();
      Object.keys(extra).forEach(k => { if (data[k] === undefined) data[k] = extra[k]; });
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
  
    if (kind === "monthly") {
      content.appendChild(buildProgressBlock(data));
    }
  
    CATEGORIES.forEach(cat => {
      content.appendChild(buildCategoryBlock(kind, key, data, cat));
    });
  
    if (kind === "daily") {
      content.appendChild(buildTextField(kind, key, data, "eslatmalar", "Eslatmalar", "Shoshilinch narsalarni yozib qo'ying..."));
      content.appendChild(buildTextField(kind, key, data, "uchrashuvlar", "Uchrashuvlar", "Bugungi uchrashuvlar..."));
      content.appendChild(buildTextField(kind, key, data, "tahlil", "Kun tahlili", "Kun qanday o'tdi, nima o'rgandingiz..."));
    }
  
    const statusRow = document.createElement("div");
    statusRow.className = "save-status";
    statusRow.id = "saveStatus";
    statusRow.innerHTML = `Saqlandi`;
    content.appendChild(statusRow);
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
  
  function buildCategoryBlock(kind, key, data, cat) {
    const wrap = document.createElement("div");
    wrap.className = "category";
    const head = document.createElement("div");
    head.className = "category-head";
    head.innerHTML = `<span class="label">${cat.label}</span><span class="badge ${cat.cls}">${cat.badge}</span>`;
    wrap.appendChild(head);
  
    const list = document.createElement("div");
    list.className = "item-list";
  
    (data[cat.key] || []).forEach(item => {
      list.appendChild(buildItemRow(kind, key, data, cat.key, item));
    });
  
    const addBtn = document.createElement("div");
    addBtn.className = "add-item";
    addBtn.innerHTML = `+ Qo'shish`;
    addBtn.onclick = () => {
      const newItem = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: "", done: false };
      data[cat.key].push(newItem);
      const row = buildItemRow(kind, key, data, cat.key, newItem, true);
      list.insertBefore(row, addBtn);
      row.querySelector("input[type=text]").focus();
      queueSave(kind, key);
    };
    list.appendChild(addBtn);
  
    wrap.appendChild(list);
    return wrap;
  }
  
  function buildItemRow(kind, key, data, catKey, item, autoFocus) {
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
  
    const txt = document.createElement("input");
    txt.type = "text";
    txt.placeholder = "Vazifa...";
    txt.value = item.text || "";
    txt.oninput = () => {
      item.text = txt.value;
      queueSave(kind, key);
    };
  
    const del = document.createElement("button");
    del.className = "del";
    del.innerHTML = "&times;";
    del.onclick = () => {
      data[catKey] = data[catKey].filter(i => i.id !== item.id);
      row.remove();
      queueSave(kind, key);
    };
  
    row.appendChild(cb);
    row.appendChild(txt);
    row.appendChild(del);
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
  }
  
  function applyTheme(isDark) {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
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