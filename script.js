import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, update, push, onValue, onChildAdded, remove, get, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getFirestore, collection, addDoc, getDocs, orderBy, query, serverTimestamp, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase App Init
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

// Local User Session & Global Stats Increment
if (!sessionStorage.getItem('myUserId')) {
    sessionStorage.setItem('myUserId', 'Guest_' + Math.floor(Math.random() * 10000));
    // New visitor detected
    update(ref(db, 'globalStats'), { visitors: increment(1) }).catch(e => console.log('Stat increment err', e));
}
const myUserId = sessionStorage.getItem('myUserId');

// Global Stats Sync
onValue(ref(db, 'globalStats'), snap => {
    const data = snap.val() || { totalBoards: 42, totalLines: 0, visitors: 0 };
    const statB = document.getElementById('statBoards');
    const statL = document.getElementById('statLines');
    const statV = document.getElementById('statVisitors');
    if(statB) statB.innerText = parseInt(data.totalBoards || 42).toLocaleString();
    if(statL) statL.innerHTML = parseInt(data.totalLines || 0).toLocaleString() + "<span>M</span>";
    if(statV) statV.innerText = parseInt(data.visitors || 0).toLocaleString();
});

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

// --- Visual Board Selector logic ---
let selectedSnapshotData = null;
let selectedSnapshotBoardId = null;

async function openBoardSelector() {
    const grid = document.getElementById('selectorGrid');
    const overlay = document.getElementById('boardSelectorOverlay');
    if(!grid || !overlay) return;
    grid.innerHTML = '<div class="no-posts">LOADING SNAPSHOTS...</div>';

    try {
        // Fetch snapshot data for all boards
        const snap = await get(ref(db, 'whiteboards'));
        const boardsData = snap.val() || {};
        
        grid.innerHTML = '';
        
        // Populate all 42 boards
        for (let i = 1; i <= 42; i++) {
            const boardKey = `Gallery-${i}`;
            const board = boardsData[boardKey] || {};
            
            const item = document.createElement('div');
            item.className = 'selector-item';

            const thumb = document.createElement('div');
            thumb.className = 'selector-thumb';

            if (board.thumbnail) {
                const img = document.createElement('img');
                img.src = board.thumbnail;
                thumb.appendChild(img);
            } else {
                thumb.innerHTML = '<div class="no-img" style="font-size:0.5rem;">NO SNAPSHOT</div>';
            }

            const label = document.createElement('div');
            label.className = 'selector-label';
            label.innerText = boardKey;

            item.appendChild(thumb);
            item.appendChild(label);
            item.onclick = () => selectBoardForPost(boardKey);
            grid.appendChild(item);
        }
    } catch (e) {
        console.error("Error loading selector boards:", e);
        grid.innerHTML = '<div class="no-posts">ERROR LOADING BOARDS</div>';
    }

    overlay.classList.add('active');
}

function selectBoardForPost(boardKey) {
    selectedSnapshotBoardId = boardKey;
    document.getElementById('boardSelectorOverlay').classList.remove('active');

    get(ref(db, `whiteboards/${boardKey}/thumbnail`)).then(snap => {
        selectedSnapshotData = snap.val();

        const titleEl = document.getElementById('selectedBoardTitle');
        if (titleEl) titleEl.innerText = `${boardKey} — SNAPSHOT`;

        const preview = document.getElementById('snapshotPreview');
        if (preview) {
            preview.innerHTML = '';
            if (selectedSnapshotData) {
                const img = document.createElement('img');
                img.src = selectedSnapshotData;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                preview.appendChild(img);
            } else {
                preview.style.display = 'flex';
                preview.style.alignItems = 'center';
                preview.style.justifyContent = 'center';
                preview.style.fontFamily = 'var(--font-mono)';
                preview.style.fontSize = '0.7rem';
                preview.style.color = 'var(--text-muted)';
                preview.innerText = 'NO SNAPSHOT';
            }
        }
        document.getElementById('postFormOverlay').classList.add('active');
    });
}

// --- Firestore Community Logic ---
async function savePost() {
    const title = document.getElementById('postTitle').value;
    const author = document.getElementById('postAuthor').value;
    const content = document.getElementById('postContent').value;

    if(!title || !content) return alert("제목과 내용을 입력해주세요.");

    const saveBtn = document.getElementById('savePost');
    const originalText = saveBtn.innerHTML;
    
    try {
        saveBtn.disabled = true;
        saveBtn.innerText = "데이터 전송 중...";

        const postsRef = ref(db, 'posts');
        await push(postsRef, {
            title: title.trim(),
            author: author.trim() || "익명",
            category: "Robot SW Lab",
            content: content.trim(),
            boardId: selectedSnapshotBoardId || "Unknown",
            created_at: Date.now()
        });
        
        alert("기록이 성공적으로 저장되었습니다!");
        document.getElementById('postFormOverlay').classList.remove('active');
        document.getElementById('postTitle').value = '';
        document.getElementById('postAuthor').value = '';
        document.getElementById('postContent').value = '';
        
    } catch (e) {
        console.error("DEBUG - RTDB Save Error:", e);
        // 사용자에게 구체적인 에러 상황을 알림
        let errorMsg = "저장에 실패했습니다.\n";
        if (e.code === 'PERMISSION_DENIED') {
            errorMsg += "이유: 권한 거부 (RTDB의 Rules 탭에서 .read, .write를 true로 설정했는지 확인하세요.)";
        } else if (e.message.includes('network')) {
            errorMsg += "이유: 네트워크 연결 원활하지 않음";
        } else {
            errorMsg += "이유: " + e.message;
        }
        alert(errorMsg);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}





async function loadPosts() {
    const container = document.getElementById('postCardContainer');
    if (!container) return;
    container.innerHTML = '<div class="no-posts">LOADING ARCHIVES...</div>';

    try {
        onValue(ref(db, 'posts'), (snapshot) => {
            const data = snapshot.val();
            container.innerHTML = '';
            
            if (!data) {
                const countEl = document.getElementById('count');
                if (countEl) countEl.innerText = '0';
                container.innerHTML = '<div class="no-posts">첫 기록을 남겨보세요</div>';
                return;
            }

            const postsArray = Object.keys(data).map(key => ({ id: key, ...data[key] }));
            postsArray.sort((a, b) => b.created_at - a.created_at);
            
            const countEl = document.getElementById('count');
            if (countEl) countEl.innerText = postsArray.length;

            postsArray.forEach((post) => {
                const postId = post.id;
                const date = post.created_at ? new Date(post.created_at).toLocaleDateString('ko-KR') : '—';
                const card = document.createElement('div');
                card.className = 'post-card';
                const imgId = "img-" + Math.random().toString(36).substr(2, 9);
                
                card.innerHTML = `
                    <div class="post-img" id="${imgId}"><div class="no-img">LOADING...</div></div>
                    <div class="post-info">
                        <div class="post-header">
                            <span class="post-tag">${post.boardId || '?'}</span>
                            <span class="post-date">${date}</span>
                        </div>
                        <div class="post-title-text">${post.title}</div>
                        <div class="post-desc">${post.content}</div>
                        <div class="post-footer">
                            BY ${post.author}
                            <div class="post-actions">
                                <button class="post-action-btn edit-btn" data-id="${postId}" data-title="${post.title}" data-content="${post.content}">수정</button>
                                <button class="post-action-btn del-btn" data-id="${postId}">삭제</button>
                            </div>
                        </div>
                    </div>
                `;
                container.appendChild(card);
                
                if (post.boardId && post.boardId !== "Unknown") {
                    get(ref(db, `whiteboards/${post.boardId}/thumbnail`)).then(snap => {
                        const imgContainer = document.getElementById(imgId);
                        if (imgContainer) {
                            if (snap.val()) imgContainer.innerHTML = `<img src="${snap.val()}" alt="Snapshot" loading="lazy">`;
                            else imgContainer.innerHTML = '<div class="no-img">NO SNAPSHOT</div>';
                        }
                    });
                } else {
                    const imgContainer = document.getElementById(imgId);
                    if (imgContainer) imgContainer.innerHTML = '<div class="no-img">NO SNAPSHOT</div>';
                }
            });

            container.querySelectorAll('.del-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    if(confirm("삭제하시겠습니까?")) await remove(ref(db, `posts/${e.target.dataset.id}`));
                };
            });
            container.querySelectorAll('.edit-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    const id = e.target.dataset.id;
                    const nT = prompt("제목:", e.target.dataset.title);
                    const nC = prompt("내용:", e.target.dataset.content);
                    if (nT && nC) await update(ref(db, `posts/${id}`), { title: nT, content: nC });
                };
            });
        }); 
    } catch (e) {
        console.error('Error:', e);
        container.innerHTML = '<div class="no-posts">Error loading archives.</div>';
    }
}



// --- Event Listeners ---
document.getElementById('toggleWrite')?.addEventListener('click', openBoardSelector);
document.getElementById('closeSelectorBtn')?.addEventListener('click', () => {
    document.getElementById('boardSelectorOverlay').classList.remove('active');
});
document.getElementById('cancelPostBtn')?.addEventListener('click', () => {
    document.getElementById('postFormOverlay').classList.remove('active');
});
document.getElementById('savePost')?.addEventListener('click', savePost);

// Load posts on page load
loadPosts();

// --- Board Grid (Lobby) Rendering & Pagination ---
let currentPage = 0;
const boardsPerPage = 6;
let maxPage = 0;

function renderBoardGrid(boardsObj) {
    agWrapper.innerHTML = '';
    const boards = Object.keys(boardsObj || {}).map(k => ({id: k, ...boardsObj[k]}));
    maxPage = Math.max(0, Math.ceil(boards.length / boardsPerPage) - 1);
    
    for (let p = 0; p <= maxPage; p++) {
        const pageEl = document.createElement('div');
        pageEl.className = 'gallery-page';
        
        const pageBoards = boards.slice(p * boardsPerPage, (p + 1) * boardsPerPage);
        pageBoards.forEach((board) => {
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
            
            pageEl.appendChild(el);

            // 썸네일 동기화 및 실시간 스트림 연결
            setTimeout(() => { // 캔버스가 DOM에 붙은 후 실행 보장
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
                        tCtx.strokeStyle = '#f1f5f9';
                        tCtx.lineWidth = 10; tCtx.lineCap = 'round'; tCtx.beginPath();
                        tCtx.moveTo(100+Math.random()*100, 100+Math.random()*100);
                        tCtx.bezierCurveTo(300, 100, 100, 300, 400, 200);
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
                    });
                }
            }, 0);

            el.addEventListener('click', () => handleBoardClick(board));
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

document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentPage > 0) { currentPage--; updateSlider(); }
});
document.getElementById('nextBtn').addEventListener('click', () => {
    if (currentPage < maxPage) { currentPage++; updateSlider(); }
});

// 타이머 초기 깜빡임 방지용 로컬 캐시 적용
const cachedTimerBase = localStorage.getItem('lastTimerBase');
if (cachedTimerBase) {
    startTimer(parseInt(cachedTimerBase));
}

// 전역 타이머 관리 (새로고침 시에도 유지되도록 RTDB 전용 노드 사용)
onValue(ref(db, 'timerBase'), (snap) => {
    const base = snap.val();
    const now = Date.now();
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    if (!base || (now - base > TWO_HOURS_MS)) {
        // 타이머가 없거나 2시간이 지났으면 새로 생성
        const newBase = Date.now();
        set(ref(db, 'timerBase'), newBase);
        localStorage.setItem('lastTimerBase', newBase);
        startTimer(newBase);
    } else {
        // 기존 타이머 유지
        localStorage.setItem('lastTimerBase', base);
        startTimer(base);
    }
});

// RTDB 로비 감지 (하드코딩 42개 유지 및 2시간 리셋)
onValue(ref(db, 'whiteboards'), (snapshot) => {
    const data = snapshot.val() || {};
    let updates = {};
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const now = Date.now();
    let didReset = false;
    
    // 타이머 기준점이 있는지 확인 (timerBase가 있다면 그것을 기준으로 보드 리셋 여부 판단)
    get(ref(db, 'timerBase')).then(timerSnap => {
        const timerBase = timerSnap.val() || now;
        
        // 항상 Gallery-1부터 Gallery-42까지 무조건 채워넣기 보장
        for(let i=1; i<=42; i++) {
            const key = `Gallery-${i}`;
            // 보드가 없거나, 기준 타이머가 갱신되었을 때만 리셋
            if (!data[key] || (now - timerBase > TWO_HOURS_MS)) {
                updates[key] = { createdAt: timerBase, thumbnail: "" };
                remove(ref(db, `streams/${key}`));
                didReset = true;
            }
        }
        
        if(didReset) {
            update(ref(db, 'whiteboards'), updates);
            // 트로피 보드 갯수 증가
            update(ref(db, 'globalStats'), { totalBoards: increment(42) }).catch(()=>{});
        }
    });

    // 예전에 만들어둔 잡다한 보드 찌꺼기 무시하고 딱 42개만 렌더링
    const finalData = {};
    for(let i=1; i<=42; i++) {
        finalData[`Gallery-${i}`] = data[`Gallery-${i}`];
    }
    renderBoardGrid(finalData); // 방 목록 및 썸네일 새로고침
});


let resetInterval = null;
function startTimer(baseTime) {
    if (resetInterval) clearInterval(resetInterval);
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const timerEl = document.getElementById('resetTimer');
    
    resetInterval = setInterval(() => {
        if (!timerEl) return;
        const now = Date.now();
        const diff = (baseTime + TWO_HOURS) - now;
        
        if (diff <= 0) {
            timerEl.innerText = "0:00:00";
            return;
        }
        
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        
        timerEl.innerText = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}


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
    document.getElementById('toolPen').click();

    // Disable lobby scroll while whiteboard is open
    lobbyView.style.overflow = 'hidden';
    lobbyView.style.position = 'fixed';

    setTimeout(() => {
        whiteboardView.classList.add('active');
        resizeCanvas();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        startBoardSync();
    }, 50);
}

document.getElementById('closeBoardBtn').addEventListener('click', async () => {
    // 캔버스 크기를 줄이고 JPEG 압축을 사용하여 Base64 용량 대폭 축소 (1MB 이하 무조건 보장)
    const MAX_WIDTH = 600;
    const scale = Math.min(1, MAX_WIDTH / canvas.width);
    const finalW = canvas.width * scale;
    const finalH = canvas.height * scale;
    
    // 오프스크린 캔버스에 리사이징 축소 복사
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = finalW;
    tempCanvas.height = finalH;
    const tempCtx = tempCanvas.getContext('2d');
    
    // JPEG는 투명도를 검정색으로 만드므로 흰색 배경을 먼저 칠해줌
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, finalW, finalH);
    tempCtx.drawImage(canvas, 0, 0, finalW, finalH);
    
    // WebP 또는 JPEG로 변환 & 60% 화질 (용량 엄청 줄어듦)
    const dataURL = tempCanvas.toDataURL('image/jpeg', 0.6);
    
    await update(ref(db, `whiteboards/${currentBoardId}`), { thumbnail: dataURL });

    if (streamUnsubscribe) streamUnsubscribe();

    whiteboardView.classList.remove('active');
    // Restore lobby scroll
    lobbyView.style.overflow = '';
    lobbyView.style.position = '';
    currentBoardId = null;
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
            // 늘어난 선 길이 트로피 업데이트 추적 (대략적)
            update(ref(db, 'globalStats'), { totalLines: increment(throttleBuffer.length * 2) }).catch(()=>{});

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
