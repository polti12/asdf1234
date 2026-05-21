// Canvas Explorer - Ultra Stability Patch
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, update, push, onValue, onChildAdded, remove, get, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getFirestore, collection, addDoc, getDocs, orderBy, query, serverTimestamp, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCJAZ-QdPnygAxTt_RKH45Q7k-djU3KP4k",
    authDomain: "my-whiteboard-46af9.firebaseapp.com",
    databaseURL: "https://my-whiteboard-46af9-default-rtdb.firebaseio.com/",
    projectId: "my-whiteboard-46af9",
    storageBucket: "my-whiteboard-46af9.firebasestorage.app",
    messagingSenderId: "53282534532",
    appId: "1:53282534532:web:607ee422ca20eb5d053ed1"
};

// Global variables
let app, db, firestore;
let currentBoardId = null;
let streamUnsubscribe = null;
let isDrawing = false;
let myUserId, mySessionId;

// Initialize when everything is ready
function initApp() {
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        firestore = getFirestore(app);
        
        myUserId = sessionStorage.getItem('myUserId') || ('Guest_' + Math.floor(Math.random() * 10000));
        sessionStorage.setItem('myUserId', myUserId);
        mySessionId = myUserId + '_' + Date.now();
        
        setupStats();
        setupTimer();
        setupLobby();
        setupDrawing();
        setupArchives();
    } catch (e) {
        console.error("Initialization failed", e);
    }
}

// [1] Stats
function setupStats() {
    onValue(ref(db, 'globalStats'), snap => {
        const data = snap.val() || { totalBoards: 42, totalLines: 0, visitors: 0 };
        const b = document.getElementById('statBoards'), l = document.getElementById('statLines'), v = document.getElementById('statVisitors');
        if(b) b.innerText = (data.totalBoards || 42).toLocaleString();
        if(l) l.innerHTML = (data.totalLines || 0).toLocaleString() + "<span>M</span>";
        if(v) v.innerText = (data.visitors || 0).toLocaleString();
    });
}

// [2] Timer
let resetInterval = null;
function setupTimer() {
    const timerEl = document.getElementById('resetTimer');
    if(timerEl) timerEl.innerText = "LOADING...";

    onValue(ref(db, 'timerBase'), snap => {
        const base = snap.val();
        const now = Date.now();
        if (!base || (now - Number(base) > 7200000)) {
            const newBase = now;
            set(ref(db, 'timerBase'), newBase);
            runCountdown(newBase);
        } else {
            runCountdown(Number(base));
        }
    });
}

function runCountdown(base) {
    if(resetInterval) clearInterval(resetInterval);
    const timerEl = document.getElementById('resetTimer');
    resetInterval = setInterval(() => {
        if(!timerEl) return;
        const diff = (base + 7200000) - Date.now();
        if(diff <= 0) { timerEl.innerText = "RESETTING..."; return; }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        timerEl.innerText = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

// [3] Lobby
const boardsPerPage = 6;
let currentPage = 0, maxPage = 0;

function setupLobby() {
    onValue(ref(db, 'whiteboards'), snap => {
        const data = snap.val() || {};
        const final = {};
        for(let i=1; i<=42; i++) {
            const k = `Gallery-${i}`;
            final[k] = data[k] || { thumbnail: "" };
        }
        renderGrid(final);
    });
}

function renderGrid(boardsObj) {
    const agWrapper = document.getElementById('agWrapper');
    if(!agWrapper) return;
    agWrapper.innerHTML = '';
    const boards = Object.keys(boardsObj).map(k => ({id:k, ...boardsObj[k]}));
    maxPage = Math.ceil(boards.length / boardsPerPage) - 1;

    for (let p = 0; p <= maxPage; p++) {
        const page = document.createElement('div');
        page.className = 'gallery-page';
        boards.slice(p * boardsPerPage, (p + 1) * boardsPerPage).forEach(b => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.innerHTML = `<div class="img-box"><canvas id="thumb-${b.id}"></canvas></div><div class="board-badge"><span class="badge-id">${b.id}</span></div>`;
            item.onclick = () => enterBoard(b.id);
            page.appendChild(item);
            
            setTimeout(() => {
                const tv = document.getElementById(`thumb-${b.id}`);
                if(tv) {
                    const tc = tv.getContext('2d');
                    tv.width = 300; tv.height = 200;
                    if(b.thumbnail) {
                        const img = new Image();
                        img.onload = () => tc.drawImage(img, 0,0, 300, 200);
                        img.src = b.thumbnail;
                    } else {
                        tc.fillStyle = '#f8fafc'; tc.fillRect(0,0, 300, 200);
                    }
                }
            }, 60);
        });
        agWrapper.appendChild(page);
    }
    updateSlider();
}

function updateSlider() {
    const w = document.getElementById('agWrapper');
    if(w) w.style.transform = `translateX(-${currentPage * 100}%)`;
    const p = document.getElementById('prevBtn'), n = document.getElementById('nextBtn');
    if(p) p.disabled = (currentPage === 0);
    if(n) n.disabled = (currentPage === maxPage);
}
document.getElementById('prevBtn').onclick = () => { if(currentPage > 0) {currentPage--; updateSlider();} };
document.getElementById('nextBtn').onclick = () => { if(currentPage < maxPage) {currentPage++; updateSlider();} };

// [4] Drawing
let ctx, canvas;
function setupDrawing() {
    canvas = document.getElementById('drawingCanvas');
    if(!canvas) return;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    canvas.onmousedown = canvas.ontouchstart = (e) => { startDraw(e); };
    canvas.onmousemove = canvas.ontouchmove = (e) => { doDraw(e); };
    canvas.onmouseup = canvas.ontouchend = canvas.onmouseleave = () => { stopDraw(); };
}

let buffer = [];
function enterBoard(id) {
    currentBoardId = id;
    const nameEl = document.getElementById('currentBoardName');
    if(nameEl) nameEl.innerText = id;
    const view = document.getElementById('whiteboardView');
    if(view) {
        view.classList.add('active');
        const r = canvas.parentElement.getBoundingClientRect();
        canvas.width = r.width; canvas.height = r.height;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0, canvas.width, canvas.height);
    }
    if(streamUnsubscribe) streamUnsubscribe();
    streamUnsubscribe = onChildAdded(ref(db, `streams/${id}`), snap => {
        const d = snap.val();
        if(d.session === mySessionId) return;
        if(d.action === 'clear') { ctx.fillRect(0,0, canvas.width, canvas.height); return; }
        renderStroke(d);
    });
}

function renderStroke(d) {
    if(!d.pts) return;
    ctx.beginPath();
    ctx.lineWidth = d.w; ctx.strokeStyle = (d.t === 'eraser' ? '#ffffff' : d.c);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.moveTo(d.pts[0].x, d.pts[0].y);
    d.pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
}

function startDraw(e) { 
    isDrawing = true; 
    const r = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    buffer = [{x, y}];
    if(e.type === 'touchstart') e.preventDefault();
}

function doDraw(e) {
    if(!isDrawing) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    const last = buffer[buffer.length-1];
    ctx.beginPath();
    ctx.lineWidth = 5; ctx.strokeStyle = '#000000';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    buffer.push({x, y});
    if(e.type === 'touchmove') e.preventDefault();
}

function stopDraw() {
    if(!isDrawing) return;
    isDrawing = false;
    if(buffer.length > 1) {
        push(ref(db, `streams/${currentBoardId}`), {
            session: mySessionId, pts: buffer, c: '#000000', w: 5, t: 'pen'
        });
    }
    buffer = [];
}

document.getElementById('closeBoardBtn').onclick = () => {
    const thumb = canvas.toDataURL('image/jpeg', 0.4); // Compressing more for speed
    update(ref(db, `whiteboards/${currentBoardId}`), { thumbnail: thumb });
    document.getElementById('whiteboardView').classList.remove('active');
};

// [5] Archives
function setupArchives() {
    onValue(ref(db, 'posts'), snap => {
        const container = document.getElementById('postCardContainer');
        if(!container) return;
        const data = snap.val() || {};
        const items = Object.keys(data).map(k => ({id:k, ...data[k]})).reverse();
        const ce = document.getElementById('count');
        if(ce) ce.innerText = items.length;
        container.innerHTML = items.map(p => `
            <div class="post-card">
                <div class="post-header-simple"><span class="post-tag-badge">${p.boardId}</span></div>
                <div class="post-title-text">${p.title}</div>
                <p class="post-desc">${p.content}</p>
                <div class="post-footer-simple">BY ${p.author}</div>
            </div>
        `).join('');
    });

    const sw = document.getElementById('savePost');
    if(sw) sw.onclick = async () => {
        const t = document.getElementById('postTitle').value;
        const c = document.getElementById('postContent').value;
        if(t && c) {
            await push(ref(db, 'posts'), {
                title: t, content: c, author: document.getElementById('postAuthor').value || "익명",
                created_at: Date.now(), boardId: currentBoardId || "Unknown"
            });
            document.getElementById('postFormOverlay').classList.remove('active');
        }
    };
    
    const tw = document.getElementById('toggleWrite');
    if(tw) tw.onclick = () => {
        alert("먼저 보드에 접속한 뒤 닫기 버튼을 눌러 스냅샷을 생성하세요. 그 후 '기록 남기기' 기능이 활성화됩니다.");
    };
}

// Start
if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
