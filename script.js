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

// --- 3D Gallery (Lobby) Dynamic Generation (RTDB) ---
const cols = 8, rows = 5, arcWidth = 6000, arcDepth = 2500, verticalGap = 800;

function generate3DGrid(boardsObj) {
    agWrapper.innerHTML = '';
    const boards = Object.keys(boardsObj || {}).map(k => ({id: k, ...boardsObj[k]}));
    
    boards.forEach((board, index) => {
        const col = index % cols, row = Math.floor(index / cols);
        const nX = (col - (cols - 1) / 2) / ((cols - 1) / 2 || 1);
        const nY = (row - (rows - 1) / 2) / ((rows - 1) / 2 || 1);

        const xPos = nX * (arcWidth / 2), zPos = (Math.abs(nX) - 1) * arcDepth, yPos = nY * (verticalGap * (rows / 2)); 
        const angleY = nX * -45, angleX = nY * 15; 

        const el = document.createElement('div');
        el.className = 'gallery-item';
        el.dataset.id = board.id;
        let statusText = board.owner === myUserId ? '내 보드' : '참여 요청하기';

        el.innerHTML = `<div class="img-box"><canvas class="thumb-canvas" id="thumb-${board.id}"></canvas><div class="item-overlay">${board.id}<div class="status">${statusText}</div></div></div>`;
        el.style.setProperty('--bx', `${xPos}px`); el.style.setProperty('--by', `${yPos}px`); el.style.setProperty('--bz', `${zPos}px`); el.style.setProperty('--ax', `${angleX}deg`); el.style.setProperty('--ay', `${angleY}deg`);
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, ${zPos}px) rotateX(${angleX}deg) rotateY(${angleY}deg)`;
        
        agWrapper.appendChild(el);

        // 썸네일 동기화 및 더미 패턴 그리기
        const tCanvas = document.getElementById(`thumb-${board.id}`);
        if(tCanvas) {
            tCanvas.width = 600; tCanvas.height = 400;
            const tCtx = tCanvas.getContext('2d');
            if (board.thumbnail) {
                const img = new Image();
                img.onload = () => tCtx.drawImage(img, 0, 0, 600, 400);
                img.src = board.thumbnail;
            } else {
                // 그림이 없는 보드는 컬러풀한 추상화 더미 패턴 그리기
                tCtx.fillStyle = '#ffffff';
                tCtx.fillRect(0,0, 600, 400);
                tCtx.lineWidth = 15;
                tCtx.lineCap = 'round';
                tCtx.strokeStyle = `hsl(${Math.random()*360}, 80%, 70%)`;
                tCtx.beginPath();
                tCtx.moveTo(Math.random()*600, Math.random()*400);
                for(let k=0; k<3; k++) {
                    tCtx.quadraticCurveTo(Math.random()*600, Math.random()*400, Math.random()*600, Math.random()*400);
                }
                tCtx.stroke();
            }
        }
        el.addEventListener('click', () => handleBoardClick(board));
    });
}

// 3D Camera Rotation Logic
let mX = 0, mY = 0, tX = 0, tY = 0, rX = 0, rY = 0, cRX = 0, cRY = 0;
window.addEventListener('mousemove', (e) => {
    if(!lobbyView.classList.contains('active')) return;
    const x = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
    const y = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    mX = x * -2000; mY = y * -1500; rY = x * 30; rX = y * -15;
});
function animate3D() {
    if(lobbyView.classList.contains('active') && agWrapper) {
        tX += (mX - tX) * 0.05; tY += (mY - tY) * 0.05; cRX += (rX - cRX) * 0.05; cRY += (rY - cRY) * 0.05;
        agWrapper.style.transform = `translate3d(calc(-50% + ${tX}px), calc(-50% + ${tY}px), -1000px) rotateX(${cRX}deg) rotateY(${cRY}deg)`;
    }
    requestAnimationFrame(animate3D);
}
animate3D();

// RTDB 로비 감지 (빈 DB일 경우 자동 생성)
onValue(ref(db, 'whiteboards'), (snapshot) => {
    const data = snapshot.val();
    if (!data) {
        // 비어있으면 40개의 의미없는(더미) 보드 자동 생성
        let updates = {};
        for(let i=1; i<=40; i++) {
            updates[`Gallery-${i}`] = {
                owner: 'System', createdAt: Date.now(), thumbnail: ""
            };
        }
        update(ref(db, 'whiteboards'), updates);
        return; 
    }
    generate3DGrid(data); // 방 목록 및 썸네일 새로고침
});

// 새 캔버스 만들기
document.getElementById('createNewBoardBtn').addEventListener('click', async () => {
    const boardName = prompt("새 캔버스 이름을 입력하세요:", "Board-" + Math.floor(Math.random()*1000));
    if(!boardName) return;
    try {
        await set(ref(db, `whiteboards/${boardName}`), {
            owner: myUserId,
            createdAt: Date.now(),
            thumbnail: ""
        });
        lobbyNotice.style.color = "#10b981"; lobbyNotice.textContent = "캔버스가 생성되었습니다!";
        setTimeout(() => { lobbyNotice.textContent = ""; }, 3000);
    } catch (e) {
        lobbyNotice.style.color = "#ef4444"; lobbyNotice.textContent = "생성 오류: " + e.message;
    }
});


// --- Click & Permission Logic (RTDB 방식 전환) ---
async function handleBoardClick(board) {
    if (board.owner === myUserId) {
        enterWhiteboard(board.id, true);
    } else {
        // 이미 승인되었는지 체크
        if(board.requests && board.requests[myUserId] === 'approved') {
            enterWhiteboard(board.id, false);
            return;
        }
        // 권한 요청
        lobbyNotice.style.color = "#3b82f6";
        lobbyNotice.textContent = `'${board.id}' 보드 참여 허가를 방장님께 요청했습니다...`;
        
        const reqRef = ref(db, `whiteboards/${board.id}/requests/${myUserId}`);
        await set(reqRef, 'pending');

        // 승인 감지
        const unsubReq = onValue(reqRef, (s) => {
            if (s.val() === 'approved') {
                lobbyNotice.style.color = "#10b981"; lobbyNotice.textContent = "주인이 허가했습니다! 입장합니다.";
                unsubReq(); // 구독 취소
                setTimeout(() => { lobbyNotice.textContent = ""; enterWhiteboard(board.id, false); }, 1000);
            } else if (s.val() === 'rejected') {
                lobbyNotice.style.color = "#ef4444"; lobbyNotice.textContent = "참여가 거절되었습니다.";
                unsubReq();
                setTimeout(() => { lobbyNotice.textContent = ""; }, 3000);
            }
        });
    }
}


// --- 3. Whiteboard Sync & Throttled Drawing ---
const canvasContainer = document.getElementById('canvasContainer');
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const permissionPanel = document.getElementById('permissionRequestsPanel');
const requestsList = document.getElementById('requestsList');

function enterWhiteboard(boardId, iAmOwner) {
    currentBoardId = boardId;
    isOwner = iAmOwner;
    document.getElementById('currentBoardName').textContent = boardId + (isOwner ? ' (방장)' : '');
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
        if (isOwner) listenForRequests();
    }, 300);
}

document.getElementById('closeBoardBtn').addEventListener('click', async () => {
    // 닫을 때 썸네일 업데이트 (RTDB)
    const dataURL = canvas.toDataURL("image/png", 0.3); // 저해상도 썸네일
    await update(ref(db, `whiteboards/${currentBoardId}`), { thumbnail: dataURL });

    if (streamUnsubscribe) streamUnsubscribe();
    if (permissionUnsubscribe) permissionUnsubscribe();
    permissionPanel.style.display = 'none';

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

// Permission System for Owner
function listenForRequests() {
    permissionPanel.style.display = 'block';
    const reqsRef = ref(db, `whiteboards/${currentBoardId}/requests`);
    permissionUnsubscribe = onValue(reqsRef, (snap) => {
        requestsList.innerHTML = '';
        const requests = snap.val() || {};
        let pendingCount = 0;
        
        Object.keys(requests).forEach(uid => {
            if (requests[uid] === 'pending') {
                pendingCount++;
                const div = document.createElement('div');
                div.className = 'req-item';
                div.innerHTML = `<span>${uid}</span> 
                    <div class="req-btns">
                        <button class="req-btn accept" onclick="window.acceptReq('${uid}')">수락</button>
                        <button class="req-btn reject" onclick="window.rejectReq('${uid}')">거절</button>
                    </div>`;
                requestsList.appendChild(div);
            }
        });
        if(pendingCount === 0) { requestsList.innerHTML = '<span style="color:#666; font-size:0.8rem;">대기열이 없습니다.</span>'; }
    });
}

window.acceptReq = (uid) => set(ref(db, `whiteboards/${currentBoardId}/requests/${uid}`), 'approved');
window.rejectReq = (uid) => set(ref(db, `whiteboards/${currentBoardId}/requests/${uid}`), 'rejected');


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
        push(ref(db, `whiteboards/${currentBoardId}/stream`), { action: 'clear' });
    }
});

const mySessionId = myUserId + '_' + Date.now();

function startDraw(e) { 
    isDrawing = true; 
    
    // 스로틀 타이머 시작
    throttleInterval = setInterval(() => {
        if(throttleBuffer.length > 1) { // 이어질 궤적이 있어야 하므로 1 초과 확인
            push(ref(db, `whiteboards/${currentBoardId}/stream`), {
                session: mySessionId,
                tool: currentTool,
                color: currentColor,
                width: currentLineWidth,
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
        push(ref(db, `whiteboards/${currentBoardId}/stream`), {
            session: mySessionId, tool: currentTool, color: currentColor, width: currentLineWidth, points: throttleBuffer
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
    const streamRef = ref(db, `whiteboards/${currentBoardId}/stream`);
    
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
