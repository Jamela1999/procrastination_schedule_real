import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import { getAuth, signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';
import firebaseConfig from './schedule-firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ═══════════════════════════════════════
   CONSTANTS & UTILITIES
   ═══════════════════════════════════════ */
const HOUR_START = 5, HOUR_COUNT = 20, SNAP = 1 / 6;
const HOURS = []; for (let i = 0; i < HOUR_COUNT; i++)HOURS.push((HOUR_START + i) % 24);
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function hourToOffset(h) { let m = h < HOUR_START ? h + 24 : h; return m - HOUR_START; }
function fT(t) { const h = ((Math.floor(t) % 24) + 24) % 24, m = Math.round((t - Math.floor(t)) * 60); return `${h}:${m.toString().padStart(2, '0')}`; }
function fTM(m) { const h = m % 24, mm = Math.round((m - Math.floor(m)) * 60); return `${Math.floor(h)}:${mm.toString().padStart(2, '0')}`; }
function fDS(d) { return `${MN[d.getMonth()]} ${d.getDate()}`; }
function toDS(d) { return d.toISOString().slice(0, 10); }
function pD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function monOf(d) { const dt = new Date(d); const day = dt.getDay(); dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1)); return dt; }
function addD(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function uid() { return crypto.randomUUID(); }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 16); }

/* ═══════════════════════════════════════
   DEFAULT DATA
   ═══════════════════════════════════════ */
const DEF_CATS = [
    { key: 'intern', label: 'Internship', bg: '#dce9f3', tags: ['work'], goals: {} },
    { key: 'course', label: 'Course', bg: '#ddeade', tags: ['study'], goals: {} },
    { key: 'french', label: 'French Class', bg: '#f5e6d3', tags: ['study'], goals: {} },
    { key: 'gym', label: 'Gym', bg: '#f3dce1', tags: ['health'], goals: {} },
    { key: 'dentist', label: 'Dentist', bg: '#f3d5d5', tags: ['health'], goals: {} },
    { key: 'writing', label: 'Writing / Prep', bg: '#e5ddf0', tags: ['study'], goals: {} },
    { key: 'tutor', label: 'Tutoring', bg: '#f2eacc', tags: ['work'], goals: {} },
    { key: 'cram', label: 'Cram School', bg: '#d3ece2', tags: ['work'], goals: {} },
    { key: 'buffer', label: 'Commute / Buffer', bg: '#eaeaea', tags: ['other'], goals: {} },
];
const DEF_TAGS = ['work', 'study', 'health', 'other'];

/* ═══════════════════════════════════════
   DATA & SYNC
   ═══════════════════════════════════════ */
const SK = 'schedule_app_v6';
let D = { startDate: '', endDate: '', categories: [], tags: [], weekEvents: [] };

function cWeeks() {
    const s = monOf(pD(D.startDate)), e = pD(D.endDate), w = [];
    let c = new Date(s);
    while (c <= e) { const we = addD(c, 6); w.push({ start: new Date(c), end: we > e ? new Date(e) : we }); c = addD(c, 7); }
    return w;
}

// ---- Storage Helpers ----
async function save() {
    localStorage.setItem(SK, JSON.stringify(D));
    await syncToCloud();
}

function loadLocal() {
    const r = localStorage.getItem(SK);
    if (r) {
        try {
            D = JSON.parse(r);
            if (!D.tags) D.tags = DEF_TAGS;
            D.categories.forEach(c => { if (!c.goals) c.goals = {}; });
            return true;
        } catch (e) { }
    }
    return false;
}

function initDefData() {
    const today = new Date(), s = monOf(today);
    D.startDate = toDS(s); D.endDate = toDS(addD(s, 27));
    D.categories = JSON.parse(JSON.stringify(DEF_CATS)); D.tags = [...DEF_TAGS];
    D.weekEvents = cWeeks().map((_, i) => defEv(i));
    save();
}

// ---- Cloud Sync ----
async function syncToCloud() {
    if (!auth.currentUser) return;
    try {
        const userDoc = doc(db, 'schedule_users', auth.currentUser.uid);
        await setDoc(userDoc, {
            data: D,
            lastUpdated: new Date().toISOString()
        });
        console.log('☁️ Synced to cloud');
    } catch (e) {
        console.error('Cloud sync error:', e);
    }
}

async function syncFromCloud() {
    if (!auth.currentUser) return;
    try {
        const userDoc = doc(db, 'schedule_users', auth.currentUser.uid);
        const snap = await getDoc(userDoc);
        if (snap.exists()) {
            const cloudData = snap.data().data;
            if (cloudData) {
                D = cloudData;
                localStorage.setItem(SK, JSON.stringify(D));
                renderAll();
                console.log('☁️ Synced from cloud');
            }
        } else {
            // First time user with cloud — push local data
            await syncToCloud();
        }
    } catch (e) {
        console.error('Cloud load error:', e);
    }
}

// ---- Auth UI ----
function renderAuthSection() {
    const container = document.getElementById('auth-section');
    if (!container) return;
    const user = auth.currentUser;

    if (user) {
        container.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${user.photoURL}" style="width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--border);">
                <span style="font-size: 0.75rem; font-weight: 500; color: var(--text-mid);">${user.displayName.split(' ')[0]}</span>
                <button id="btn-logout" class="btn-cancel" style="padding: 4px 8px; font-size: 0.7rem;">Logout</button>
            </div>
        `;
        document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
    } else {
        container.innerHTML = `
            <button id="btn-login" class="btn-primary" style="padding: 6px 12px; font-size: 0.75rem; border-radius: 8px; display: flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                Sign in with Google
            </button>
        `;
        document.getElementById('btn-login').addEventListener('click', () => {
            const provider = new GoogleAuthProvider();
            signInWithPopup(auth, provider);
        });
    }
}

onAuthStateChanged(auth, async (user) => {
    renderAuthSection();
    if (user) {
        await syncFromCloud();
    }
});

/* ═══════════════════════════════════════
   INITIAL CONTENT GENERATION
   ═══════════════════════════════════════ */
function defEv(wi) {
    const ev = [], p = (d, s, e, c, l) => ev.push({ day: d, start: s, end: e, cls: c, label: l, id: uid() });
    p(1, 9, 10, 'buffer', 'Commute'); p(1, 10, 19, 'intern', 'Internship'); p(1, 19, 20, 'buffer', 'Dinner'); p(1, 21, 23, 'writing', 'Writing / Prep');
    p(2, 9, 10, 'buffer', 'Commute'); p(2, 10, 19, 'intern', 'Internship'); p(2, 19, 20, 'buffer', 'Dinner'); p(2, 21, 23, 'writing', 'Writing / Prep');
    if (wi % 2 === 0) { p(3, 14, 15, 'buffer', 'Commute'); p(3, 15, 16, 'dentist', 'Dentist'); p(3, 16, 17, 'buffer', 'Buffer'); }
    p(3, 17, 18, 'gym', 'Gym'); p(3, 18, 19, 'buffer', 'Dinner'); p(3, 19, 22, 'french', 'French Class');
    p(4, 9, 10, 'buffer', 'Commute'); p(4, 10, 19, 'intern', 'Internship'); p(4, 19, 20, 'buffer', 'Dinner'); p(4, 20, 21, 'tutor', 'Tutoring'); p(4, 21, 23, 'writing', 'Writing / Prep');
    p(5, 8, 9, 'buffer', 'Commute'); p(5, 9, 16, 'course', 'Course'); p(5, 16, 18, 'writing', 'Writing / Prep');
    p(6, 10, 12, 'writing', 'Writing / Prep'); p(6, 14, 18, 'writing', 'Writing / Prep'); p(6, 20, 21, 'tutor', 'Tutoring');
    p(7, 11.5, 12.5, 'buffer', 'Commute'); p(7, 12.5, 15, 'cram', 'Cram School'); p(7, 15, 16, 'buffer', 'Buffer'); p(7, 16, 18, 'writing', 'Writing / Prep'); p(7, 20, 21, 'tutor', 'Tutoring');
    return ev;
}

/* ═══════════════════════════════════════
   CORE LOGIC
   ═══════════════════════════════════════ */
function calcH(ev) { let s = ev.start, e = ev.end; if (e <= s) e += 24; return e - s; }
function calcCatHours(weekIdx) {
    const catH = {}; D.categories.forEach(c => { catH[c.key] = 0; });
    const src = weekIdx === -1 ? D.weekEvents : (D.weekEvents[weekIdx] ? [D.weekEvents[weekIdx]] : []);
    src.forEach(wk => { (wk || []).forEach(ev => { if (catH[ev.cls] !== undefined) catH[ev.cls] += calcH(ev); }); });
    return catH;
}

// Global UI state
let curW = 0, chartWeek = 0, mDay = 1, selTag = '', selCat = '', dragRow = null, cfCb = null;
let tpSH = 8, tpSM = 0, tpEH = 9, tpEM = 0;

// Elements
const legendEl = document.getElementById('legend');
const wSel = document.getElementById('weekSelect');
const ganttEl = document.getElementById('gantt'), headerEl = document.getElementById('weekCardHeader'), drLabel = document.getElementById('dateRangeLabel');
const dI = document.getElementById('dragIndicator');
const mOv = document.getElementById('modalOverlay'), mNm = document.getElementById('modalName');
const mTT = document.getElementById('modalTagToggles'), mCT = document.getElementById('modalCatToggles');
const cfOv = document.getElementById('confirmOverlay'), cfMsg = document.getElementById('confirmMsg');
const iSD = document.getElementById('inputStartDate'), iED = document.getElementById('inputEndDate'), dInfo = document.getElementById('dateInfo');
const newTagIn = document.getElementById('newTagInput'), existTagsEl = document.getElementById('existingTags');
const tTB = document.getElementById('tagTableBody');
const cWS = document.getElementById('chartWeekSelect');
const cCatEl = document.getElementById('chartCategory'), cTagEl = document.getElementById('chartTag');
const shV = document.getElementById('shVal'), smV = document.getElementById('smVal'), ehV = document.getElementById('ehVal'), emV = document.getElementById('emVal');

/* ═══════════════════════════════════════
   RENDERING
   ═══════════════════════════════════════ */
function renderLegend() {
    legendEl.innerHTML = '';
    const catH = calcCatHours(curW);
    D.categories.forEach(c => {
        const it = document.createElement('div');
        it.className = 'legend-item';
        const cur = Math.round((catH[c.key] || 0) * 10) / 10;
        const goal = c.goals && c.goals[curW] ? c.goals[curW] : null;
        let progressTxt = `${cur}h`;
        if (goal !== null && goal > 0) progressTxt = `${cur} / ${goal}h`;
        it.innerHTML = `<div class="legend-top"><span class="legend-dot" style="background:${c.bg}"></span>${c.label}</div><div class="legend-progress">${progressTxt}</div>`;
        legendEl.appendChild(it);
    });
}

function rebuildWSel() {
    const w = cWeeks(); wSel.innerHTML = '';
    w.forEach((_, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `Week ${i + 1}`; wSel.appendChild(o); });
    if (curW >= w.length) curW = Math.max(0, w.length - 1); wSel.value = curW;
}

function renderSched() {
    const weeks = cWeeks(); if (!weeks.length) return;
    const wi = curW, wk = weeks[wi]; if (!wk) return;
    while (D.weekEvents.length < weeks.length) D.weekEvents.push([]);
    drLabel.textContent = `${fDS(pD(D.startDate))} — ${fDS(pD(D.endDate))}`;
    headerEl.innerHTML = `Week ${wi + 1} <span>${fDS(wk.start)} — ${fDS(wk.end)}</span>`;
    ganttEl.innerHTML = ''; ganttEl.style.gridTemplateColumns = `48px repeat(${HOUR_COUNT}, 1fr)`;
    const corner = document.createElement('div'); corner.className = 'day-label'; corner.innerHTML = '<span style="font-size:8px;color:var(--text-lt)">DAY</span>'; ganttEl.appendChild(corner);
    HOURS.forEach(h => { const th = document.createElement('div'); th.className = 'time-header'; th.textContent = `${h}:00`; ganttEl.appendChild(th); });
    for (let d = 1; d <= 7; d++) {
        const dt = addD(wk.start, d - 1);
        const dl = document.createElement('div'); dl.className = 'day-label'; dl.innerHTML = `<span>${DAY_LABELS[d - 1]}</span><span class="date-num">${dt.getMonth() + 1}/${dt.getDate()}</span>`; ganttEl.appendChild(dl);
        const row = document.createElement('div'); row.className = 'day-row'; row.dataset.day = d;
        for (let i = 0; i < HOUR_COUNT; i++) { const c = document.createElement('div'); c.className = 'hour-cell'; c.onclick = () => openModal(d, i); row.appendChild(c); }
        (D.weekEvents[wi] || []).filter(e => e.day === d).forEach(ev => {
            const oS = hourToOffset(ev.start), oE = hourToOffset(ev.end);
            if (oS < 0 || oE <= oS || oS >= HOUR_COUNT) return;
            const el = document.createElement('div'); el.className = `event ev-${ev.cls}`;
            el.style.left = `${(oS / HOUR_COUNT) * 100}%`; el.style.width = `${((oE - oS) / HOUR_COUNT) * 100}%`;
            const cat = D.categories.find(c => c.key === ev.cls); if (cat) el.style.backgroundColor = cat.bg;
            el.innerHTML = `<span class="resize-left"></span><span class="truncate">${ev.label}</span><div class="tooltip">${ev.label} | ${fT(ev.start)}–${fT(ev.end)}</div><button class="delete-btn">✕</button><span class="resize-right"></span>`;
            el.querySelector('.delete-btn').onclick = e => { e.stopPropagation(); D.weekEvents[wi] = D.weekEvents[wi].filter(x => x.id !== ev.id); save(); renderSched(); renderLegend(); };
            setupDrag(el, ev, row); setupResize(el.querySelector('.resize-left'), ev, 'left', row); setupResize(el.querySelector('.resize-right'), ev, 'right', row);
            row.appendChild(el);
        });
        ganttEl.appendChild(row);
    }
}

function setupDrag(el, ev, row) {
    let sx, os, oe, rw;
    el.onmousedown = e => {
        if (e.target.classList.contains('resize-left') || e.target.classList.contains('resize-right') || e.target.classList.contains('delete-btn')) return;
        e.preventDefault(); e.stopPropagation(); sx = e.clientX; os = hourToOffset(ev.start); oe = hourToOffset(ev.end); rw = row.offsetWidth; el.classList.add('dragging');
        document.onmousemove = mv; document.onmouseup = up;
    };
    function mv(e) {
        const dx = e.clientX - sx, dO = (dx / rw) * HOUR_COUNT, dur = oe - os;
        let ns = Math.round((os + dO) / SNAP) * SNAP; ns = Math.max(0, Math.min(HOUR_COUNT - dur, ns)); const ne = ns + dur;
        el.style.left = `${(ns / HOUR_COUNT) * 100}%`; el.querySelector('.tooltip').textContent = `${ev.label} | ${fTM(HOUR_START + ns)}–${fTM(HOUR_START + ne)}`;
        el._pS = ns; el._pE = ne;
        dI.style.display = 'block'; dI.style.left = `${e.clientX + 12}px`; dI.style.top = `${e.clientY - 28}px`; dI.textContent = `${fTM(HOUR_START + ns)} – ${fTM(HOUR_START + ne)}`;
    }
    function up() {
        document.onmousemove = document.onmouseup = null; el.classList.remove('dragging'); dI.style.display = 'none';
        if (el._pS !== undefined) { const ms = HOUR_START + el._pS, me = HOUR_START + el._pE; ev.start = ms >= 24 ? ms - 24 : ms; ev.end = me >= 24 ? me - 24 : me; delete el._pS; delete el._pE; save(); renderSched(); renderLegend(); }
    }
}

function setupResize(h, ev, side, row) {
    let sx, oo, rw, pEl;
    h.onmousedown = e => {
        e.preventDefault(); e.stopPropagation(); sx = e.clientX; rw = row.offsetWidth; pEl = h.parentElement; pEl.classList.add('dragging');
        oo = side === 'left' ? hourToOffset(ev.start) : hourToOffset(ev.end);
        document.onmousemove = mv; document.onmouseup = up;
    };
    function mv(e) {
        const dx = e.clientX - sx, dO = (dx / rw) * HOUR_COUNT;
        let nO = Math.round((oo + dO) / SNAP) * SNAP; nO = Math.max(0, Math.min(HOUR_COUNT, nO));
        if (side === 'left') {
            const eO = hourToOffset(ev.end); if (nO >= eO - SNAP) nO = eO - SNAP;
            pEl.style.left = `${(nO / HOUR_COUNT) * 100}%`; pEl.style.width = `${((eO - nO) / HOUR_COUNT) * 100}%`;
            pEl.querySelector('.tooltip').textContent = `${ev.label} | ${fTM(HOUR_START + nO)}–${fTM(HOUR_START + eO)}`; dI.textContent = `${fTM(HOUR_START + nO)} – ${fTM(HOUR_START + eO)}`;
        } else {
            const sO = hourToOffset(ev.start); if (nO <= sO + SNAP) nO = sO + SNAP;
            pEl.style.width = `${((nO - sO) / HOUR_COUNT) * 100}%`;
            pEl.querySelector('.tooltip').textContent = `${ev.label} | ${fTM(HOUR_START + sO)}–${fTM(HOUR_START + nO)}`; dI.textContent = `${fTM(HOUR_START + sO)} – ${fTM(HOUR_START + nO)}`;
        }
        pEl._pO = nO; dI.style.display = 'block'; dI.style.left = `${e.clientX + 12}px`; dI.style.top = `${e.clientY - 28}px`;
    }
    function up() {
        document.onmousemove = document.onmouseup = null; pEl.classList.remove('dragging'); dI.style.display = 'none';
        if (pEl._pO !== undefined) { const mp = HOUR_START + pEl._pO, rH = mp >= 24 ? mp - 24 : mp; if (side === 'left') ev.start = rH; else ev.end = rH; delete pEl._pO; save(); renderSched(); renderLegend(); }
    }
}

function wrapH(h) { if (h > 24) return 5; if (h < 5) return 24; return h; }
function wrapM(m) { if (m >= 60) return 0; if (m < 0) return 55; return m; }
function renderTP() {
    shV.textContent = tpSH % 24; smV.textContent = tpSM.toString().padStart(2, '0');
    ehV.textContent = tpEH % 24; emV.textContent = tpEM.toString().padStart(2, '0');
}

function buildModalToggles() {
    mTT.innerHTML = '';
    const allP = document.createElement('div'); allP.className = 'toggle-pill' + (selTag === '' ? ' active' : ''); allP.textContent = 'ALL'; allP.onclick = () => { selTag = ''; buildModalToggles(); }; mTT.appendChild(allP);
    D.tags.forEach(tag => { const p = document.createElement('div'); p.className = 'toggle-pill' + (selTag === tag ? ' active' : ''); p.textContent = tag.toUpperCase(); p.onclick = () => { selTag = tag; buildModalToggles(); }; mTT.appendChild(p); });
    mCT.innerHTML = '';
    const filtered = selTag ? D.categories.filter(c => (c.tags || []).includes(selTag)) : D.categories;
    filtered.forEach(c => {
        const p = document.createElement('div'); p.className = 'toggle-pill' + (selCat === c.key ? ' active' : ''); p.innerHTML = `<span class="pill-dot" style="background:${c.bg}"></span>${c.label}`;
        p.onclick = () => { selCat = c.key; if (!mNm.value) mNm.value = c.label; buildModalToggles(); };
        mCT.appendChild(p);
    });
}

function openModal(day, hi) {
    mDay = day; tpSH = HOUR_START + hi; tpSM = 0; tpEH = Math.min(tpSH + 1, 25); tpEM = 0; renderTP();
    mNm.value = ''; selTag = ''; selCat = D.categories[0]?.key || ''; buildModalToggles();
    mOv.classList.add('open'); setTimeout(() => mNm.focus(), 80);
}
function closeModal() { mOv.classList.remove('open'); }

function showConfirm(msg, cb) { cfMsg.textContent = msg; cfCb = cb; cfOv.classList.add('open'); }
function closeConfirm() { cfOv.classList.remove('open'); cfCb = null; }

function onDateChange() {
    const s = iSD.value, e = iED.value; if (!s || !e) return;
    if (e < s) { dInfo.textContent = '⚠ End date must be after start date.'; return; }
    D.startDate = s; D.endDate = e;
    const nw = cWeeks(); while (D.weekEvents.length < nw.length) D.weekEvents.push([]);
    if (D.weekEvents.length > nw.length) D.weekEvents.length = nw.length;
    save(); rebuildWSel(); rebuildChartWSel(); dInfo.textContent = `${nw.length} week${nw.length !== 1 ? 's' : ''} total`;
    renderSched(); renderLegend(); renderCharts();
}

function renderExistingTags() {
    existTagsEl.innerHTML = '';
    D.tags.forEach(tag => {
        const el = document.createElement('div'); el.className = 'tag-pill';
        el.innerHTML = `<span>${tag.toUpperCase()}</span><button>×</button>`;
        el.querySelector('button').onclick = () => {
            showConfirm(`Delete tag "${tag}"? It will be removed from all categories.`, () => {
                D.tags = D.tags.filter(t => t !== tag); D.categories.forEach(c => { c.tags = (c.tags || []).filter(t => t !== tag); });
                save(); renderExistingTags(); renderTagTable(); renderCharts();
            });
        };
        existTagsEl.appendChild(el);
    });
}

function rebuildChartWSel() {
    const w = cWeeks(); cWS.innerHTML = '';
    w.forEach((_, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `Week ${i + 1}`; cWS.appendChild(o); });
    if (chartWeek >= w.length) chartWeek = Math.max(0, w.length - 1); cWS.value = chartWeek;
}

function renderTagTable() {
    tTB.innerHTML = '';
    D.categories.forEach((cat, idx) => {
        const tr = document.createElement('tr'); tr.draggable = true; tr.dataset.idx = idx;
        const tdH = document.createElement('td'); tdH.innerHTML = '<span class="drag-handle">⠿</span>';
        const tdC = document.createElement('td'); tdC.innerHTML = `<div class="cat-cell"><span class="cat-dot" style="background:${cat.bg}"></span>${cat.label}</div>`;
        const tdT = document.createElement('td');
        const chips = document.createElement('div'); chips.className = 'tag-chips';
        (cat.tags || []).forEach(tag => {
            const ch = document.createElement('div'); ch.className = 'tag-chip'; ch.innerHTML = `<span>${tag.toUpperCase()}</span><button>×</button>`;
            ch.querySelector('button').onclick = () => { showConfirm(`Remove tag "${tag}" from "${cat.label}"?`, () => { cat.tags = cat.tags.filter(t => t !== tag); save(); renderTagTable(); renderCharts(); }); };
            chips.appendChild(ch);
        });
        const inp = document.createElement('input'); inp.className = 'add-tag-inline'; inp.placeholder = '+tag';
        inp.onkeydown = e => { if (e.key === 'Enter') { const v = inp.value.trim().toLowerCase(); if (v && !(cat.tags || []).includes(v)) { if (!cat.tags) cat.tags = []; cat.tags.push(v); if (!D.tags.includes(v)) D.tags.push(v); save(); renderTagTable(); renderExistingTags(); renderCharts(); } inp.value = ''; } };
        chips.appendChild(inp); tdT.appendChild(chips);

        const tdG = document.createElement('td');
        const gi = document.createElement('input'); gi.className = 'goal-input'; gi.type = 'number'; gi.min = '0'; gi.step = '0.5'; gi.value = cat.goals && cat.goals[chartWeek] ? cat.goals[chartWeek] : '';
        gi.onchange = () => { if (!cat.goals) cat.goals = {}; const val = parseFloat(gi.value); if (isNaN(val) || val <= 0) delete cat.goals[chartWeek]; else cat.goals[chartWeek] = val; save(); };
        tdG.appendChild(gi);

        const tdD = document.createElement('td'); const db = document.createElement('button'); db.className = 'del-cat-btn'; db.textContent = '✕';
        db.onclick = () => { showConfirm(`Delete category "${cat.label}"?`, () => { D.categories.splice(idx, 1); save(); renderTagTable(); renderLegend(); renderCharts(); }); };
        tdD.appendChild(db);

        tr.append(tdH, tdC, tdT, tdG, tdD);
        tr.ondragstart = () => { dragRow = idx; tr.style.opacity = '0.4'; }; tr.ondragend = () => { dragRow = null; tr.style.opacity = '1'; };
        tr.ondragover = e => e.preventDefault(); tr.ondrop = () => { if (dragRow === null || dragRow === idx) return; const moved = D.categories.splice(dragRow, 1)[0]; D.categories.splice(idx, 0, moved); save(); renderTagTable(); renderLegend(); renderCharts(); };
        tTB.appendChild(tr);
    });
}

function renderCharts() {
    const catH = calcCatHours(chartWeek); const maxC = Math.max(...Object.values(catH), 1);
    cCatEl.innerHTML = '';
    D.categories.forEach(c => {
        const h = catH[c.key] || 0, goal = c.goals && c.goals[chartWeek] ? c.goals[chartWeek] : null;
        const row = document.createElement('div'); row.className = 'chart-row';
        const pct = (h / maxC) * 100;
        let goalLine = '', valTxt = `${Math.round(h * 10) / 10}h`;
        if (goal !== null && goal > 0) { const goalPct = Math.min((goal / maxC) * 100, 100); goalLine = `<div class="chart-goal-line" style="left:${goalPct}%"></div>`; valTxt = `${Math.round(h * 10) / 10} / ${goal}h`; }
        row.innerHTML = `<div class="chart-label">${c.label}</div><div class="chart-bar-bg">${goalLine}<div class="chart-bar-fill" style="width:${pct}%;background:${c.bg}"></div></div><div class="chart-value">${valTxt}</div>`;
        cCatEl.appendChild(row);
    });
    const tagH = {}; D.categories.forEach(c => { (c.tags || []).forEach(t => { if (!tagH[t]) tagH[t] = 0; tagH[t] += catH[c.key] || 0; }); });
    const tags = Object.keys(tagH).sort(), maxT = Math.max(...Object.values(tagH), 1);
    cTagEl.innerHTML = '';
    if (!tags.length) { cTagEl.innerHTML = '<div style="font-size:.7rem;color:var(--text-lt);padding:20px 0;text-align:center">No tags defined yet.</div>'; return; }
    const tClr = { work: '#dce9f3', study: '#e5ddf0', health: '#f3dce1', other: '#eaeaea' }; let ci = 0; const oc = ['#f5e6d3', '#f2eacc', '#d3ece2', '#ddeade'];
    tags.forEach(t => {
        const h = tagH[t] || 0, bg = tClr[t] || (oc[ci++ % oc.length]);
        const row = document.createElement('div'); row.className = 'chart-row';
        row.innerHTML = `<div class="chart-label" style="text-transform:uppercase;letter-spacing:.05em">${t}</div><div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${(h / maxT) * 100}%;background:${bg}"></div></div><div class="chart-value">${Math.round(h * 10) / 10}h</div>`;
        cTagEl.appendChild(row);
    });
}

function renderAll() {
    renderSched(); renderLegend(); rebuildWSel(); rebuildChartWSel(); renderExistingTags(); renderTagTable(); renderCharts();
    iSD.value = D.startDate; iED.value = D.endDate;
}

// Events
document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active')); document.getElementById('panel-' + b.dataset.tab).classList.add('active');
    if (b.dataset.tab === 'dashboard') { iSD.value = D.startDate; iED.value = D.endDate; dInfo.textContent = `${cWeeks().length} weeks total`; renderExistingTags(); renderTagTable(); rebuildChartWSel(); renderCharts(); }
});
document.getElementById('shUp').onclick = () => { tpSH = wrapH(tpSH + 1); renderTP(); }; document.getElementById('shDn').onclick = () => { tpSH = wrapH(tpSH - 1); renderTP(); };
document.getElementById('smUp').onclick = () => { tpSM += 5; if (tpSM >= 60) { tpSM = 0; tpSH = wrapH(tpSH + 1); } renderTP(); }; document.getElementById('smDn').onclick = () => { tpSM -= 5; if (tpSM < 0) { tpSM = 55; tpSH = wrapH(tpSH - 1); } renderTP(); };
document.getElementById('ehUp').onclick = () => { tpEH = wrapH(tpEH + 1); renderTP(); }; document.getElementById('ehDn').onclick = () => { tpEH = wrapH(tpEH - 1); renderTP(); };
document.getElementById('emUp').onclick = () => { tpEM += 5; if (tpEM >= 60) { tpEM = 0; tpEH = wrapH(tpEH + 1); } renderTP(); }; document.getElementById('emDn').onclick = () => { tpEM -= 5; if (tpEM < 0) { tpEM = 55; tpEH = wrapH(tpEH - 1); } renderTP(); };
document.getElementById('btnCancel').onclick = closeModal;
document.getElementById('btnAdd').onclick = () => {
    const sv = tpSH + tpSM / 60, ev = tpEH + tpEM / 60; if (ev <= sv) { alert('End time must be after start time.'); return; }
    const nm = mNm.value.trim() || D.categories.find(c => c.key === selCat)?.label || 'Event';
    D.weekEvents[curW].push({ day: mDay, start: sv >= 24 ? sv - 24 : sv, end: ev >= 24 ? ev - 24 : ev, cls: selCat, label: nm, id: uid() });
    save(); closeModal(); renderSched(); renderLegend();
};
document.getElementById('confirmNo').onclick = closeConfirm; document.getElementById('confirmYes').onclick = () => { if (cfCb) cfCb(); closeConfirm(); };
iSD.onchange = iED.onchange = onDateChange;
document.getElementById('addTagBtn').onclick = () => { const v = newTagIn.value.trim().toLowerCase(); if (!v || D.tags.includes(v)) { newTagIn.value = ''; return; } D.tags.push(v); newTagIn.value = ''; save(); renderTagTable(); renderExistingTags(); renderCharts(); };
cWS.onchange = () => { chartWeek = parseInt(cWS.value); renderTagTable(); renderCharts(); };
document.getElementById('addCatBtn').onclick = () => { const n = document.getElementById('newCatName').value.trim(), c = document.getElementById('newCatColor').value; if (!n) return; const k = slugify(n) || 'cat_' + Date.now(); D.categories.push({ key: k, label: n, bg: c, tags: [], goals: {} }); document.getElementById('newCatName').value = ''; save(); renderTagTable(); renderLegend(); renderCharts(); };
document.getElementById('refreshBtn').onclick = () => { renderSched(); renderLegend(); renderCharts(); renderTagTable(); };
wSel.onchange = () => { curW = parseInt(wSel.value); renderSched(); renderLegend(); };

// Init
if (!loadLocal()) initDefData();
renderAll();
renderAuthSection();
