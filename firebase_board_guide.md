# 🤖 로봇소프트웨어과 기술 포트폴리오 게시판 구축 가이드 (A+ 기준)

이 가이드는 평가 항목의 **'기술적 기능성'**과 **'전문성'** 항목에서 만점을 받기 위한 파이어베이스 심화 연동 가이드입니다. 단순히 글을 저장하는 것을 넘어, 로봇 소프트웨어 개발자다운 깔끔한 설계와 안정성을 보여주는 것이 목표입니다.

---

## 1. 프로젝트 아키텍처 (평가 항목 2번: 기술 기능성)

본 게시판은 **NoSQL Cloud Firestore**를 기반으로 하며, 다음과 같은 기술적 특징을 가집니다:
- **실시간 데이터 동기화**: 새로고침 없이도 최신 글을 즉시 반영하도록 설계 가능.
- **서버사이드 타임스탬프**: 클라이언트의 조작된 시간이 아닌 서버 정확한 기록 사용.
- **최적화된 보안 규칙**: 권한 없는 사용자의 데이터 훼손 방지 기초 설정.

## 2. Firebase 프로젝트 고도화 설정

1. **Firestore 생성 시 권장 사항**:
   - 데이터 센터 위치를 **asia-northeast3 (서울)**로 설정하여 지연 시간(Latency)을 최소화하세요 (로딩 속도 평가 항목 점수 반영).
2. **색인(Indexing) 활용**:
   - 나중에 데이터가 많아질 경우 `date` 기준 정렬을 속도 저하 없이 수행하려면 복합 색인을 사용해야 합니다.

## 3. 기술 역량 증명용 게시판 코드 (`board.js`)

아래 코드는 **로봇소프트웨어과**의 전문성을 위해 예외 처리(Error Handling)를 강화한 버전입니다. 평가 시 이 부분을 강조하세요.

```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// [중요] 본인이 발급받은 Config 값을 채우세요
const firebaseConfig = {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    // ... 나머지 정보
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 게시글 작성 기능 (예외 처리 포함)
document.getElementById('saveBtn').addEventListener('click', async () => {
    const title = document.getElementById('title').value;
    const content = document.getElementById('content').value;

    if(!title.trim() || !content.trim()) {
        alert("로봇 알고리즘처럼 정확하게 입력해 주세요!"); 
        return;
    }

    try {
        // 로딩 상태 표시 (사용자 경험 UI/UX 반영)
        const btn = document.getElementById('saveBtn');
        btn.disabled = true;
        btn.textContent = "Updating Database...";

        await addDoc(collection(db, "robot_board"), {
            title: title,
            content: content,
            category: "Robot SW Lab",
            created_at: serverTimestamp() // 보안 및 정확성 확보
        });
        
        alert("성공적으로 데이터가 전송되었습니다.");
        location.reload();
    } catch (error) {
        console.error("Transmission Error:", error);
        alert("시스템 오류가 발생했습니다. 로그를 확인하세요.");
    }
});

// 게시글 렌더링 로직 (비동기 처리 최적화)
async function fetchPosts() {
    const container = document.getElementById('listContainer');
    container.innerHTML = "<p style='color:#555;'>IoT 데이터 동기화 중...</p>";

    try {
        const q = query(collection(db, "robot_board"), orderBy("created_at", "desc"));
        const snapshot = await getDocs(q);
        
        container.innerHTML = ""; // 클리어
        
        snapshot.forEach((doc) => {
            const item = doc.data();
            container.innerHTML += `
                <div class="post-item" style="border-left:4px solid #22c55e; padding-left:20px; margin-bottom:30px;">
                    <h3 style="color:#fff;">${item.title}</h3>
                    <p style="color:#888; font-size:0.9rem; margin-bottom:10px;">Category: ${item.category}</p>
                    <p style="color:#ccc;">${item.content}</p>
                </div>
            `;
        });
    } catch (e) {
        container.innerHTML = "데이터를 불러오는 데 실패했습니다.";
    }
}

fetchPosts();
```

## 4. 최종 평가 대비 팁 (평가 항목 3, 4번)

*   **스토리텔링**: 게시판의 연습용 데이터를 넣을 때 "로봇 제어 알고리즘 문의", "ROS 시뮬레이션 결과" 등 학과 특성에 맞는 내용을 미리 채워두세요.
*   **반응형**: 모바일 기기로 게시판에 접속해 글을 쓰고 목록을 확인하는 모습을 시연하면 가산점을 받을 수 있습니다.
*   **이미지 Alt**: `board.html` 등에 들어가는 모든 이미지에 `alt="로봇 연구소 로고"`와 같은 텍스트를 꼭 포함하세요.

이 가이드를 따라 만든 게시판은 단순한 '연습용'이 아닌, 실제 전문적인 **기술 포트폴리오의 허브**가 될 것입니다!
