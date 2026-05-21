import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
// Firestore는 로비 메뉴(방 존재 확인, 권한) 등으로 쓰고, 드로잉 데이터는 RTDB로 나누어 쓰거나, 순수 RTDB로 씁니다.
// 구조 단순화를 위해 전체 시스템을 RTDB로 전환합니다.
import { getDatabase, ref, set, update, push, onValue, onChildAdded, remove } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";

// Firebase App Init
const firebaseConfig = {
    apiKey: "AIzaSyCJAZ-QdPnygAxTt_RKH45Q7k-djU3KP4k",
    authDomain: "my-whiteboard-46af9.firebaseapp.com",
    databaseURL: "https://my-whiteboard-46af9-default-rtdb.firebaseio.com",
    projectId: "my-whiteboard-46af9",
    storageBucket: "my-whiteboard-46af9.firebasestorage.app",
    messagingSenderId: "53282534532",
    appId: "1:53282534532:web:607ee422ca20eb5d053ed1",
    measurementId: "G-DYQWMPDXZM"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Local User Session
if (!sessionStorage.getItem('myUserId')) {
    sessionStorage.setItem('myUserId', 'Guest_' + Math.floor(Math.random() * 10000));
}
const myUserId = sessionStorage.getItem('myUserId');

// DOM Elements
const lobbyView = document.getElementById('lobbyView');
const whiteboardView = document.getElementById('whiteboardView');
const agWrapper = document.getElementById('agWrapper');
const lobbyNotice = document.getElementById('lobbyNotice');

let currentBoardId = null;
let currentBoardOwner = null;
let isOwner = false;
let boardUnsubscribe = null;
let streamUnsubscribe = null;
let permissionUnsubscribe = null;

// --- Board Grid (Lobby) Rendering ---
function renderBoardGrid(boardsObj) {
    agWrapper.innerHTML = '';
    const boards = Object.keys(boardsObj || {}).map(k => ({id: k, ...boardsObj[k]}));
    
    boards.forEach((board) => {
        const el = document.createElement('div');
        el.className = 'gallery-item';
        el.dataset.id = board.id;

        el.innerHTML = `
            <div class="img-box">
                <canvas class="thumb-canvas" id="thumb-${board.id}"></canvas>
            </div>
            <div class="board-badge">
                <span class="badge-id">${board.id}</span>
                <span class="badge-status">Live</span>
            </div>
        `;
        
        agWrapper.appendChild(el);

        // 썸네일 동기화 및 실시간 스트림 연결
        const tCanvas = document.getElementById(`thumb-${board.id}`);
        if(tCanvas) {
            tCanvas.width = 600; tCanvas.height = 400;
            const tCtx = tCanvas.getContext('2d');
            if (board.thumbnail) {
                const img = new Image();
                img.onload = () => tCtx.drawImage(img, 0, 0, 600, 400);
                img.src = board.thumbnail;
            } else {
                tCtx.fillStyle = '#ffffff'; tCtx.fillRect(0,0, 600, 400);
                // 빈 보드 낙서 효과
                tCtx.strokeStyle = '#f3f4f6';
                tCtx.lineWidth = 8; 
                tCtx.lineCap = 'round'; tCtx.lineJoin = 'round';
                tCtx.beginPath();
                const sx = 100 + Math.random() * 100;
                const sy = 100 + Math.random() * 100;
                tCtx.moveTo(sx, sy);
                for(let i=0; i<3; i++) {
                    tCtx.bezierCurveTo(sx + 100, sy + 50, sx - 50, sy + 150, sx + 200, sy + 100);
                }
                tCtx.stroke();
            }

            // 실시간 스트림 연결
            onChildAdded(ref(db, `streams/${board.id}`), (snapshot) => {
                const data = snapshot.val();
                if (data.action === 'clear') { tCtx.fillStyle = '#ffffff'; tCtx.fillRect(0,0,600,400); return; }
                const pts = data.points;
                if(!pts || pts.length < 2) return;
                
                const scaleX = 600 / (data.canvasW || 1920);
                const scaleY = 400 / (data.canvasH || 1080);
                
                tCtx.beginPath();
                tCtx.lineWidth = data.width * ((scaleX + scaleY) / 2);
                tCtx.lineCap = 'round'; tCtx.lineJoin = 'round';
                tCtx.strokeStyle = data.tool === 'eraser' ? '#ffffff' : data.color;
                tCtx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
                for(let i=1; i<pts.length; i++) tCtx.lineTo(pts[i].x * scaleX, pts[i].y * scaleY);
                tCtx.stroke();
                tCtx.beginPath();
            });
        }
        el.addEventListener('click', () => handleBoardClick(board));
    });
}

// 3D Camera Rotation Logic (Removed for cleaner grid experience)
// animate3D() removed

// RTDB 로비 감지 (하드코딩 40개 유지 및 2시간 리셋)
onValue(ref(db, 'whiteboards'), (snapshot) => {
    const data = snapshot.val() || {};
    let updates = {};
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const now = Date.now();
    let didReset = false;
    
    // 항상 Gallery-1부터 Gallery-40까지 무조건 채워넣기 보장
    for(let i=1; i<=40; i++) {
        const key = `Gallery-${i}`;
        if (!data[key]) {
            updates[key] = { createdAt: now, thumbnail: "" };
            didReset = true;
        } else if (now - data[key].createdAt > TWO_HOURS_MS) {
            updates[key] = { createdAt: now, thumbnail: "" };
            remove(ref(db, `streams/${key}`));
            didReset = true;
        }
    }
    
    if(didReset) {
        update(ref(db, 'whiteboards'), updates);
        return; // 업데이트 시 onValue가 새로 트리거되므로 렌더링 스킵
    }

    // 예전에 만들어둔 잡다한 보드 찌꺼기 무시하고 딱 40개만 렌더링
    const finalData = {};
    for(let i=1; i<=40; i++) {
        finalData[`Gallery-${i}`] = data[`Gallery-${i}`];
    }
    renderBoardGrid(finalData); // 방 목록 및 썸네일 새로고침
});


// --- Click & Permission Logic (자유 입장 전환) ---
function handleBoardClick(board) {
    enterWhiteboard(board.id);
}


// --- 3. Whiteboard Sync & Throttled Drawing ---
const canvasContainer = document.getElementById('canvasContainer');
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function enterWhiteboard(boardId) {
    currentBoardId = boardId;
    document.getElementById('currentBoardName').textContent = boardId;
    // 색 변경 처리 (기본 화이트 캔버스 설정)
    document.getElementById('toolPen').click();
    
    lobbyView.classList.remove('active');
    setTimeout(() => {
        whiteboardView.classList.add('active');
        resizeCanvas();
        // 캔버스 초기화 (화이트 테마)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0, canvas.width, canvas.height);

        startBoardSync();
    }, 300);
}

document.getElementById('closeBoardBtn').addEventListener('click', async () => {
    // 닫을 때 썸네일 업데이트 (RTDB)
    const dataURL = canvas.toDataURL("image/png", 0.3); // 저해상도 썸네일
    await update(ref(db, `whiteboards/${currentBoardId}`), { thumbnail: dataURL });

    if (streamUnsubscribe) streamUnsubscribe();

    whiteboardView.classList.remove('active');
    setTimeout(() => {
        lobbyView.classList.add('active');
        currentBoardId = null;
    }, 300);
});

function resizeCanvas() {
    const rect = canvasContainer.getBoundingClientRect();
    canvas.width = rect.width; canvas.height = rect.height;
    ctx.fillStyle = '#ffffff'; // White Canvas
    ctx.fillRect(0,0, rect.width, rect.height);
}
window.addEventListener('resize', () => { if(whiteboardView.classList.contains('active')) resizeCanvas(); });




// --- 🔥 "진짜 실시간" 드로잉 스로틀링(Throttling) 로직 🔥 ---
let isDrawing = false;
let currentTool = 'pen';
let currentColor = '#000000'; // 블랙 기본
let currentLineWidth = 5;

// Throttle Buffer Configuration
let throttleBuffer = [];
let throttleInterval = null; 
const THROTTLE_MS = 100; // 100ms 마다 묶어서 전송 (트래픽 최적화)

['toolPen', 'toolEraser'].forEach(t => document.getElementById(t).addEventListener('click', (e) => {
    currentTool = t === 'toolPen' ? 'pen' : 'eraser';
    document.getElementById('toolPen').classList.toggle('active', currentTool === 'pen');
    document.getElementById('toolEraser').classList.toggle('active', currentTool === 'eraser');
    
    // 기본색 리셋 (펜을 들면 검은색)
    if(currentTool==='pen') {
        const activeColorBtn = document.querySelector('.color-btn.active');
        if(activeColorBtn) currentColor = activeColorBtn.dataset.color;
        else currentColor = '#000000';
    }
}));

// 색상 버튼들을 검은색 테마에 맞게 000000 요소 추가
const colorContainer = document.querySelector('.colors');
colorContainer.innerHTML = `
    <button class="color-btn active" data-color="#000000" style="background: #000000; border-color:#3b82f6;"></button>
    <button class="color-btn" data-color="#ef4444" style="background: #ef4444;"></button>
    <button class="color-btn" data-color="#10b981" style="background: #10b981;"></button>
    <button class="color-btn" data-color="#3b82f6" style="background: #3b82f6;"></button>
    <button class="color-btn" data-color="#f59e0b" style="background: #f59e0b;"></button>
`;
document.querySelectorAll('.color-btn').forEach(b => b.addEventListener('click', (e) => {
    document.querySelectorAll('.color-btn').forEach(x => { x.classList.remove('active'); x.style.borderColor = 'transparent'; });
    b.classList.add('active');
    b.style.borderColor = '#3b82f6';
    currentColor = b.dataset.color;
    if(currentTool === 'eraser') document.getElementById('toolPen').click();
}));

document.getElementById('lineWidth').addEventListener('input', e => currentLineWidth = parseInt(e.target.value));

document.getElementById('toolClear').addEventListener('click', () => {
    if(confirm('보드를 완전히 지우시겠습니까?')) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0, canvas.width, canvas.height);
        // 전체 지우기 이벤트 발행
        push(ref(db, `streams/${currentBoardId}`), { action: 'clear' });
    }
});

const mySessionId = myUserId + '_' + Date.now();

function startDraw(e) { 
    isDrawing = true; 
    
    // 스로틀 타이머 시작
    throttleInterval = setInterval(() => {
        if(throttleBuffer.length > 1) { // 이어질 궤적이 있어야 하므로 1 초과 확인
            push(ref(db, `streams/${currentBoardId}`), {
                session: mySessionId,
                tool: currentTool, color: currentColor, width: currentLineWidth,
                canvasW: canvas.width, canvasH: canvas.height,
                points: throttleBuffer
            });
            // 점이 뚝뚝 끊기는 현상을 방지하기 위해 버퍼의 [마지막 점]을 다음 버퍼의 [시작점]으로 이관함!
            throttleBuffer = [throttleBuffer[throttleBuffer.length - 1]]; 
        }
    }, THROTTLE_MS);
    
    draw(e, true); 
}

function endDraw() { 
    if(!isDrawing) return;
    isDrawing = false; 
    ctx.beginPath(); 
    
    // 남은 버퍼 전송 후 타이머 해제
    clearInterval(throttleInterval);
    if(throttleBuffer.length > 1) {
        push(ref(db, `streams/${currentBoardId}`), {
            session: mySessionId, tool: currentTool, color: currentColor, width: currentLineWidth,
            canvasW: canvas.width, canvasH: canvas.height,
            points: throttleBuffer
        });
        throttleBuffer = [];
    }
}

function draw(e, isStart = false) {
    if(!isDrawing) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    let cx = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    let cy = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    const x = Math.round(cx - rect.left); 
    const y = Math.round(cy - rect.top);

    ctx.lineWidth = currentLineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round'; // 이 속성이 있어야 꺾이는 부분이 매끄럽게 연결됨!
    ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;

    if(!isStart) {
        ctx.lineTo(x, y);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    // 로컬 좌표 배열에 저장 (데이터 최적화를 위해 소수점 반올림)
    throttleBuffer.push({x, y});
}

canvas.addEventListener('mousedown', startDraw); canvas.addEventListener('mouseup', endDraw);
canvas.addEventListener('mouseleave', endDraw); canvas.addEventListener('mousemove', draw);
canvas.addEventListener('touchstart', startDraw, { passive: false });
canvas.addEventListener('touchend', endDraw); canvas.addEventListener('touchcancel', endDraw);
canvas.addEventListener('touchmove', draw, { passive: false });

// 타인이 그리는 선 실시간 수신 렌더링
function startBoardSync() {
    const streamRef = ref(db, `streams/${currentBoardId}`);
    
    streamUnsubscribe = onChildAdded(streamRef, (snapshot) => {
        const data = snapshot.val();
        
        if (data.action === 'clear') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0,0, canvas.width, canvas.height);
            return;
        }

        // 내가 막 그린 선 데이터가 돌아오는 반향(Echo) 무시 - 끊김/스퍼터링 완벽 방지
        if (data.session === mySessionId) return;

        const pts = data.points;
        if(!pts || pts.length < 2) return; // 선분이 안되는 건 무시

        ctx.beginPath();
        ctx.lineWidth = data.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round'; // 원격에서도 매끄럽게 연결
        ctx.strokeStyle = data.tool === 'eraser' ? '#ffffff' : data.color;
        
        // 부드럽게 복원
        ctx.moveTo(pts[0].x, pts[0].y);
        for(let i=1; i<pts.length; i++){
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
        ctx.beginPath();
    });
}
