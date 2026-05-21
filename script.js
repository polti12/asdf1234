// Canvas Explorer - Final Professional Version (Full Workflow Complete)
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

// Global State
const myUserId = sessionStorage.getItem('myUserId') || ('Guest_' + Math.floor(Math.random() * 10000));
sessionStorage.setItem('myUserId', myUserId);
const mySessionId = myUserId + '_' + Date.now();
let currentBoardId = null;
let selectedSnapshotBoardId = null;
let streamUnsubscribe = null;
let isDrawing = false;
let currentTool = 'pen';
let currentColor = '#000000';
let currentLineWidth = 5;

// [1] Initialization & Stats
function init() {
    setupStats();
    setupTimer();
    setupLobby();
    setupCanvas();
    setupArchives();
}

function setupStats() {
    onValue(ref(db, 'globalStats'), snap => {
        const d = snap.val() || { totalBoards: 42, totalLines: 0, visitors: 0 };
        document.getElementById('statBoards').innerText = (d.totalBoards || 42).toLocaleString();
        document.getElementById('statLines').innerHTML = (d.totalLines || 0).toLocaleString() + "<span>M</span>";
        document.getElementById('statVisitors').innerText = (d.visitors || 0).toLocaleString();
    });
    // Record visit
    if(!sessionStorage.getItem('visited')) {
        update(ref(db, 'globalStats'), { visitors: increment(1) });
        sessionStorage.setItem('visited', 't');
    }
}

// [2] Timer
let resetInterval = null;
function setupTimer() {
    onValue(ref(db, 'timerBase'), snap => {
        const base = Number(snap.val() || Date.now());
        if (resetInterval) clearInterval(resetInterval);
        const timerEl = document.getElementById('resetTimer');
        resetInterval = setInterval(() => {
            const diff = (base + 7200000) - Date.now();
            if (diff <= 0) { timerEl.innerText = "0:00:00"; return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            timerEl.innerText = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }, 1000);
    });
}

// [3] Lobby Grid
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
        renderLobby(final);
    });
}

function renderLobby(boards) {
    const agWrapper = document.getElementById('agWrapper');
    if(!agWrapper) return;
    agWrapper.innerHTML = '';
    const boardList = Object.keys(boards).map(k => ({id:k, ...boards[k]}));
    maxPage = Math.ceil(boardList.length / boardsPerPage) - 1;

    for (let p = 0; p <= maxPage; p++) {
        const page = document.createElement('div');
        page.className = 'gallery-page';
        boardList.slice(p * boardsPerPage, (p + 1) * boardsPerPage).forEach(b => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.innerHTML = `
                <div class="img-box"><canvas id="thumb-${b.id}"></canvas></div>
                <div class="board-badge"><span class="badge-id">${b.id}</span></div>
            `;
            item.onclick = () => enterBoard(b.id);
            page.appendChild(item);
            
            setTimeout(() => {
                const canvas = document.getElementById(`thumb-${b.id}`);
                if(canvas) {
                    const ctx = canvas.getContext('2d');
                    canvas.width = 300; canvas.height = 200;
                    if(b.thumbnail) {
                        const img = new Image();
                        img.onload = () => ctx.drawImage(img, 0,0, 300, 200);
                        img.src = b.thumbnail;
                    } else {
                        ctx.fillStyle = '#f8fafc'; ctx.fillRect(0,0,300,200);
                    }
                }
            }, 50);
        });
        agWrapper.appendChild(page);
    }
    updateSlider();
}

function updateSlider() {
    document.getElementById('agWrapper').style.transform = `translateX(-${currentPage * 100}%)`;
    document.getElementById('prevBtn').disabled = (currentPage === 0);
    document.getElementById('nextBtn').disabled = (currentPage === maxPage);
}
document.getElementById('prevBtn').onclick = () => { if(currentPage > 0) {currentPage--; updateSlider();} };
document.getElementById('nextBtn').onclick = () => { if(currentPage < maxPage) {currentPage++; updateSlider();} };

// [4] Drawing & Canvas
const whiteboardView = document.getElementById('whiteboardView');
const drawingCanvas = document.getElementById('drawingCanvas');
const drawingCtx = drawingCanvas?.getContext('2d', { willReadFrequently: true });

function setupCanvas() {
    if(!drawingCanvas) return;
    drawingCanvas.onmousedown = drawingCanvas.ontouchstart = (e) => startDrawing(e);
    drawingCanvas.onmousemove = drawingCanvas.ontouchmove = (e) => doDrawing(e);
    drawingCanvas.onmouseup = drawingCanvas.ontouchend = drawingCanvas.onmouseleave = () => stopDrawing();
}

function enterBoard(id) {
    currentBoardId = id;
    document.getElementById('currentBoardName').innerText = id;
    whiteboardView.classList.add('active');
    
    const r = drawingCanvas.parentElement.getBoundingClientRect();
    drawingCanvas.width = r.width; drawingCanvas.height = r.height;
    drawingCtx.fillStyle = '#ffffff'; drawingCtx.fillRect(0,0, drawingCanvas.width, drawingCanvas.height);

    if (streamUnsubscribe) streamUnsubscribe();
    streamUnsubscribe = onChildAdded(ref(db, `streams/${id}`), snap => {
        const d = snap.val();
        if(d.session === mySessionId) return;
        if(d.action === 'clear') { drawingCtx.fillRect(0,0, drawingCanvas.width, drawingCanvas.height); return; }
        renderRemoteStroke(d);
    });
}

function renderRemoteStroke(d) {
    if(!d.pts) return;
    drawingCtx.beginPath();
    drawingCtx.lineWidth = d.w; 
    drawingCtx.strokeStyle = d.t === 'eraser' ? '#ffffff' : d.c;
    drawingCtx.lineCap = drawingCtx.lineJoin = 'round';
    drawingCtx.moveTo(d.pts[0].x, d.pts[0].y);
    d.pts.forEach(p => drawingCtx.lineTo(p.x, p.y));
    drawingCtx.stroke();
}

let drawingBuffer = [];
function startDrawing(e) {
    isDrawing = true;
    const r = drawingCanvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    drawingBuffer = [{x, y}];
    if(e.type === 'touchstart') e.preventDefault();
}

function doDrawing(e) {
    if(!isDrawing) return;
    const r = drawingCanvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    const last = drawingBuffer[drawingBuffer.length-1];
    
    drawingCtx.beginPath();
    drawingCtx.lineWidth = currentLineWidth;
    drawingCtx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
    drawingCtx.lineCap = drawingCtx.lineJoin = 'round';
    drawingCtx.moveTo(last.x, last.y);
    drawingCtx.lineTo(x, y);
    drawingCtx.stroke();
    drawingBuffer.push({x, y});
}

function stopDrawing() {
    if(!isDrawing) return;
    isDrawing = false;
    if(drawingBuffer.length > 1) {
        push(ref(db, `streams/${currentBoardId}`), {
            session: mySessionId, pts: drawingBuffer, c: currentColor, w: currentLineWidth, t: currentTool
        });
        update(ref(db, 'globalStats'), { totalLines: increment(drawingBuffer.length) });
    }
    drawingBuffer = [];
}

document.getElementById('closeBoardBtn').onclick = async () => {
    const thumb = drawingCanvas.toDataURL('image/jpeg', 0.5);
    update(ref(db, `whiteboards/${currentBoardId}`), { thumbnail: thumb });
    whiteboardView.classList.remove('active');
};

// Toolbar
document.getElementById('toolPen').onclick = () => { currentTool = 'pen'; currentColor = '#000000'; };
document.getElementById('toolEraser').onclick = () => { currentTool = 'eraser'; };
document.getElementById('toolClear').onclick = () => { 
    if(confirm('Clear all?')){ 
        drawingCtx.fillRect(0,0,drawingCanvas.width,drawingCanvas.height); 
        push(ref(db, `streams/${currentBoardId}`), {action:'clear'});
    }
};
document.getElementById('lineWidth').oninput = (e) => { currentLineWidth = Number(e.target.value); };

// [5] Archives & Post Management
async function openBoardSelector() {
    const grid = document.getElementById('selectorGrid');
    const overlay = document.getElementById('boardSelectorOverlay');
    grid.innerHTML = '<div class="no-posts">LOADING...</div>';
    overlay.classList.add('active');

    const snap = await get(ref(db, 'whiteboards'));
    const data = snap.val() || {};
    grid.innerHTML = '';

    for(let i=1; i<=42; i++) {
        const id = `Gallery-${i}`;
        const item = document.createElement('div');
        item.className = 'selector-item';
        item.innerHTML = `<div class="selector-thumb">${data[id]?.thumbnail ? `<img src="${data[id].thumbnail}">` : 'NO SNAP'}</div>
                          <div class="selector-label">${id}</div>`;
        item.onclick = () => selectForPost(id, data[id]?.thumbnail);
        grid.appendChild(item);
    }
}

function selectForPost(id, thumb) {
    selectedSnapshotBoardId = id;
    document.getElementById('boardSelectorOverlay').classList.remove('active');
    document.getElementById('selectedBoardTitle').innerText = id;
    const preview = document.getElementById('snapshotPreview');
    preview.innerHTML = thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;">` : 'NO SNAPSHOT';
    document.getElementById('postFormOverlay').classList.add('active');
}

function setupArchives() {
    document.getElementById('toggleWrite').onclick = openBoardSelector;
    document.getElementById('closeSelectorBtn').onclick = () => document.getElementById('boardSelectorOverlay').classList.remove('active');
    document.getElementById('cancelPostBtn').onclick = () => document.getElementById('postFormOverlay').classList.remove('active');
    
    onValue(ref(db, 'posts'), snap => {
        const container = document.getElementById('postCardContainer');
        const list = Object.keys(snap.val() || {}).map(k => ({id:k, ...snap.val()[k]})).reverse();
        document.getElementById('count').innerText = list.length;
        container.innerHTML = list.map(p => `
            <div class="post-card">
                <div class="post-tag-badge">${p.boardId}</div>
                <div class="post-title-text">${p.title}</div>
                <p class="post-desc">${p.content}</p>
                <div class="post-footer-simple">BY ${p.author} • ${new Date(p.created_at).toLocaleDateString()}</div>
            </div>
        `).join('');
    });

    document.getElementById('savePost').onclick = async () => {
        const title = document.getElementById('postTitle').value;
        const content = document.getElementById('postContent').value;
        if(title && content) {
            await push(ref(db, 'posts'), {
                title, content, author: document.getElementById('postAuthor').value || "익명",
                created_at: Date.now(), boardId: selectedSnapshotBoardId || "Unknown"
            });
            document.getElementById('postFormOverlay').classList.remove('active');
            document.getElementById('postTitle').value = '';
            document.getElementById('postContent').value = '';
        } else {
            alert('제목과 내용을 입력해주세요.');
        }
    };
}

// Start App
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
