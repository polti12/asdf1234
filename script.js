// Canvas Explorer - Final Stability Version
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const firestore = getFirestore(app);

// [1] User & Stats
const myUserId = sessionStorage.getItem('myUserId') || ('Guest_' + Math.floor(Math.random() * 10000));
sessionStorage.setItem('myUserId', myUserId);
const mySessionId = myUserId + '_' + Date.now();

onValue(ref(db, 'globalStats'), snap => {
    const data = snap.val() || { totalBoards: 42, totalLines: 0, visitors: 0 };
    document.getElementById('statBoards').innerText = (data.totalBoards || 42).toLocaleString();
    document.getElementById('statLines').innerHTML = (data.totalLines || 0).toLocaleString() + "<span>M</span>";
    document.getElementById('statVisitors').innerText = (data.visitors || 0).toLocaleString();
});

// [2] Timer Logic
let resetInterval = null;
function startTimer(baseTime) {
    if (resetInterval) clearInterval(resetInterval);
    const timerEl = document.getElementById('resetTimer');
    if (!timerEl) return;
    resetInterval = setInterval(() => {
        const diff = (Number(baseTime) + 7200000) - Date.now();
        if (diff <= 0) {
            timerEl.innerText = "0:00:00";
            return;
        }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        timerEl.innerText = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

onValue(ref(db, 'timerBase'), snap => {
    const base = snap.val();
    if (!base || (Date.now() - Number(base) > 7200000)) {
        const newBase = Date.now();
        set(ref(db, 'timerBase'), newBase);
        startTimer(newBase);
    } else {
        startTimer(base);
    }
});

// [3] Lobby & Pagination
let currentPage = 0;
const boardsPerPage = 6;
let maxPage = 0;
const agWrapper = document.getElementById('agWrapper');

function renderBoardGrid(boardsObj) {
    if (!agWrapper) return;
    agWrapper.innerHTML = '';
    const boards = Object.keys(boardsObj).map(k => ({id: k, ...boardsObj[k]}));
    maxPage = Math.ceil(boards.length / boardsPerPage) - 1;

    for (let p = 0; p <= maxPage; p++) {
        const pageEl = document.createElement('div');
        pageEl.className = 'gallery-page';
        boards.slice(p * boardsPerPage, (p + 1) * boardsPerPage).forEach(b => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.innerHTML = `<div class="img-box"><canvas id="thumb-${b.id}"></canvas></div><div class="board-badge"><span class="badge-id">${b.id}</span></div>`;
            item.onclick = () => enterWhiteboard(b.id);
            pageEl.appendChild(item);
            
            setTimeout(() => {
                const tCanvas = document.getElementById(`thumb-${b.id}`);
                if (tCanvas) {
                    const tCtx = tCanvas.getContext('2d');
                    tCanvas.width = 300; tCanvas.height = 200;
                    if (b.thumbnail) {
                        const img = new Image();
                        img.onload = () => tCtx.drawImage(img, 0,0, 300, 200);
                        img.src = b.thumbnail;
                    }
                }
            }, 50);
        });
        agWrapper.appendChild(pageEl);
    }
    updateSlider();
}

function updateSlider() {
    agWrapper.style.transform = `translateX(-${currentPage * 100}%)`;
    document.getElementById('prevBtn').disabled = (currentPage === 0);
    document.getElementById('nextBtn').disabled = (currentPage === maxPage);
}
document.getElementById('prevBtn').onclick = () => { if(currentPage > 0) {currentPage--; updateSlider();} };
document.getElementById('nextBtn').onclick = () => { if(currentPage < maxPage) {currentPage++; updateSlider();} };

onValue(ref(db, 'whiteboards'), snap => {
    const data = snap.val() || {};
    const final = {};
    for (let i=1; i<=42; i++) {
        const k = `Gallery-${i}`;
        final[k] = data[k] || { thumbnail: "" };
    }
    renderBoardGrid(final);
});

// [4] Whiteboard & Drawing
const whiteboardView = document.getElementById('whiteboardView');
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
let currentBoardId = null;
let streamUnsubscribe = null;
let isDrawing = false;
let currentTool = 'pen';
let currentColor = '#000000';
let currentLineWidth = 5;

function enterWhiteboard(id) {
    currentBoardId = id;
    document.getElementById('currentBoardName').innerText = id;
    whiteboardView.classList.add('active');
    resizeCanvas();
    if (streamUnsubscribe) streamUnsubscribe();
    streamUnsubscribe = onChildAdded(ref(db, `streams/${id}`), snap => {
        const d = snap.val();
        if (d.session === mySessionId) return;
        if (d.action === 'clear') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0, canvas.width, canvas.height); return; }
        ctx.beginPath();
        ctx.lineWidth = d.width;
        ctx.strokeStyle = d.tool === 'eraser' ? '#ffffff' : d.color;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.moveTo(d.points[0].x, d.points[0].y);
        d.points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
    });
}

function resizeCanvas() {
    const r = canvas.parentElement.getBoundingClientRect();
    canvas.width = r.width; canvas.height = r.height;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0, canvas.width, canvas.height);
}

const getXY = (e) => {
    const r = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: Math.round(cx - r.left), y: Math.round(cy - r.top) };
};

let buffer = [];
canvas.onmousedown = canvas.ontouchstart = (e) => { 
    isDrawing = true; buffer = [getXY(e)]; 
    if(e.type === 'touchstart') e.preventDefault();
};
canvas.onmousemove = canvas.ontouchmove = (e) => {
    if (!isDrawing) return;
    const p = getXY(e);
    ctx.lineWidth = currentLineWidth;
    ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(buffer[buffer.length-1].x, buffer[buffer.length-1].y);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    buffer.push(p);
    if(e.type === 'touchmove') e.preventDefault();
};
canvas.onmouseup = canvas.ontouchend = canvas.onmouseleave = () => {
    if (!isDrawing) return;
    isDrawing = false;
    if (buffer.length > 1) {
        push(ref(db, `streams/${currentBoardId}`), {
            session: mySessionId, points: buffer, tool: currentTool, color: currentColor, width: currentLineWidth
        });
        update(ref(db, 'globalStats'), { totalLines: increment(buffer.length) });
    }
    buffer = [];
};

document.getElementById('closeBoardBtn').onclick = async () => {
    const thumb = canvas.toDataURL('image/jpeg', 0.5);
    update(ref(db, `whiteboards/${currentBoardId}`), { thumbnail: thumb });
    whiteboardView.classList.remove('active');
};

document.getElementById('toolPen').onclick = () => { currentTool = 'pen'; currentColor = '#000000'; };
document.getElementById('toolEraser').onclick = () => { currentTool = 'eraser'; };
document.getElementById('toolClear').onclick = () => { if(confirm('Clear?')) { ctx.fillRect(0,0, canvas.width, canvas.height); push(ref(db, `streams/${currentBoardId}`), {action:'clear'}); }};

// [5] Archives
async function loadPosts() {
    onValue(ref(db, 'posts'), snap => {
        const container = document.getElementById('postCardContainer');
        if (!container) return;
        const data = snap.val() || {};
        const items = Object.keys(data).map(k => ({id:k, ...data[k]})).reverse();
        document.getElementById('count').innerText = items.length;
        container.innerHTML = items.map(p => `
            <div class="post-card">
                <div class="post-header"><span class="post-tag">${p.boardId}</span></div>
                <div class="post-title-text">${p.title}</div>
                <p class="post-desc">${p.content}</p>
                <div class="post-footer">BY ${p.author}</div>
            </div>
        `).join('');
    });
}
loadPosts();

document.getElementById('toggleWrite').onclick = () => { alert('먼저 보드를 선택한 후 닫기 버튼을 눌러 스냅샷을 만드세요. 아카이브 시스템은 곧 업데이트됩니다.'); };
document.getElementById('savePost').onclick = async () => {
    const t = document.getElementById('postTitle').value;
    const c = document.getElementById('postContent').value;
    if (t && c) {
        await push(ref(db, 'posts'), {
            title: t, content: c, author: document.getElementById('postAuthor').value || "익명",
            created_at: Date.now(), boardId: currentBoardId || "Unknown"
        });
        document.getElementById('postFormOverlay').classList.remove('active');
    }
};
