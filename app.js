document.addEventListener('DOMContentLoaded', () => {

    // =========================================
    // 1. 네비게이션 로직
    // =========================================
    const navLinks = document.querySelectorAll('.nav-link');
    const sections  = document.querySelectorAll('.page-section');

    function switchSection(targetId) {
        sections.forEach(sec => sec.classList.remove('active'));
        navLinks.forEach(link => link.classList.remove('active'));

        const targetSec  = document.getElementById(targetId);
        if (targetSec) targetSec.classList.add('active');

        const activeLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
        if (activeLink) activeLink.classList.add('active');

        window.scrollTo(0, 0);
    }

    navLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            switchSection(link.dataset.target);
        });
    });

    // =========================================
    // 2. 인증 상태 관리 (localStorage 기반)
    // =========================================
    let currentUser = JSON.parse(sessionStorage.getItem('bootcamp_session')) || null;

    function updateAuthUI() {
        const loggedOutDiv  = document.getElementById('auth-logged-out');
        const loggedInDiv   = document.getElementById('auth-logged-in');
        const greetingText  = document.getElementById('user-greeting-text');
        const dashName      = document.getElementById('dash-user-name');
        const dashStudentId = document.getElementById('dash-student-id');

        if (currentUser) {
            loggedOutDiv.hidden = true;
            loggedInDiv.hidden  = false;
            greetingText.textContent = `${currentUser.name} 님`;

            if (dashName)      dashName.textContent      = currentUser.name;
            if (dashStudentId) dashStudentId.textContent = currentUser.id;
        } else {
            loggedOutDiv.hidden = false;
            loggedInDiv.hidden  = true;

            if (dashName)      dashName.textContent      = '—';
            if (dashStudentId) dashStudentId.textContent = '—';
        }
    }

    function loginUser(id, name) {
        currentUser = { id, name };
        sessionStorage.setItem('bootcamp_session', JSON.stringify(currentUser));
        updateAuthUI();
    }

    function logoutUser() {
        currentUser = null;
        sessionStorage.removeItem('bootcamp_session');
        updateAuthUI();
        switchSection('home');
        showToast('로그아웃 되었습니다.');
    }

    // 초기 UI 반영
    updateAuthUI();

    // 로그아웃 버튼
    document.getElementById('btn-logout').addEventListener('click', logoutUser);

    // 마이 대시보드 버튼 (로그인 여부 확인)
    document.getElementById('btn-dashboard-nav').addEventListener('click', () => {
        if (currentUser) {
            switchSection('dashboard');
        } else {
            openModal('login', document.getElementById('btn-dashboard-nav'));
        }
    });

    // =========================================
    // 3. 모달 열기/닫기
    // =========================================
    const modal        = document.getElementById('signup-modal');
    const modalCloseBtn = document.getElementById('modal-close');
    let triggerElement = null;
    let pendingSection = null; // 로그인 후 이동할 섹션

    function openModal(tab = 'login', triggerBtn = null, afterLoginGoTo = 'dashboard') {
        triggerElement = triggerBtn;
        pendingSection = afterLoginGoTo;
        modal.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
        switchTab(tab);

        // 첫 번째 포커스 가능 요소에 포커스
        setTimeout(() => {
            const focusable = getVisibleFocusable();
            if (focusable.length) focusable[0].focus();
        }, 50);
    }

    function closeModal() {
        modal.setAttribute('hidden', 'true');
        document.body.style.overflow = '';
        clearAllErrors();
        if (triggerElement) triggerElement.focus();
    }

    modalCloseBtn.addEventListener('click', closeModal);

    // Esc 키 / 오버레이 클릭 닫기
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !modal.hasAttribute('hidden')) closeModal();
    });
    modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
    });

    // =========================================
    // 4. 탭 전환 (로그인 ↔ 회원가입)
    // =========================================
    function switchTab(tab) {
        const tabLogin    = document.getElementById('tab-login');
        const tabSignup   = document.getElementById('tab-signup');
        const panelLogin  = document.getElementById('panel-login');
        const panelSignup = document.getElementById('panel-signup');

        if (tab === 'login') {
            tabLogin.classList.add('active');   tabLogin.setAttribute('aria-selected', 'true');
            tabSignup.classList.remove('active'); tabSignup.setAttribute('aria-selected', 'false');
            panelLogin.hidden  = false;
            panelSignup.hidden = true;
            document.getElementById('modal-panel-title').textContent = '로그인';
        } else {
            tabSignup.classList.add('active');  tabSignup.setAttribute('aria-selected', 'true');
            tabLogin.classList.remove('active'); tabLogin.setAttribute('aria-selected', 'false');
            panelSignup.hidden = false;
            panelLogin.hidden  = true;
        }
        clearAllErrors();
    }

    document.getElementById('tab-login').addEventListener('click',  () => switchTab('login'));
    document.getElementById('tab-signup').addEventListener('click', () => switchTab('signup'));
    document.getElementById('go-signup').addEventListener('click',  () => switchTab('signup'));
    document.getElementById('go-login').addEventListener('click',   () => switchTab('login'));

    // =========================================
    // 5. 모달 트리거 버튼 (로그인 / 회원가입 / 수강신청)
    // =========================================
    document.querySelectorAll('.btn-auth-trigger').forEach(btn => {
        btn.addEventListener('click', function () {
            openModal(this.dataset.tab || 'login', this);
        });
    });

    document.querySelectorAll('.btn-apply-course').forEach(btn => {
        btn.addEventListener('click', function () {
            if (currentUser) {
                switchSection('dashboard');
            } else {
                openModal('login', this, 'dashboard');
            }
        });
    });

    // 수강신청 바로가기 버튼 (네비바)
    document.querySelectorAll('[onclick]').forEach(el => {
        // onclick 방식은 그대로 유지 (수강신청 하기 버튼)
    });

    // =========================================
    // 6. 포커스 트랩
    // =========================================
    function getVisibleFocusable() {
        const all = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        return Array.from(all).filter(el => !el.closest('[hidden]') && !el.disabled);
    }

    modal.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const focusable = getVisibleFocusable();
        if (!focusable.length) return;

        const first = focusable[0];
        const last  = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === first) { last.focus(); e.preventDefault(); }
        } else {
            if (document.activeElement === last)  { first.focus(); e.preventDefault(); }
        }
    });

    // =========================================
    // 7. 에러 초기화
    // =========================================
    function clearAllErrors() {
        modal.querySelectorAll('.error-msg').forEach(el => { el.textContent = ''; });
    }

    // =========================================
    // 8. 로그인 폼 처리
    // =========================================
    document.getElementById('login-form').addEventListener('submit', e => {
        e.preventDefault();
        let valid = true;

        const idVal     = document.getElementById('login-id').value.trim();
        const pwVal     = document.getElementById('login-pw').value;
        const idErr     = document.getElementById('login-id-error');
        const pwErr     = document.getElementById('login-pw-error');
        const genErr    = document.getElementById('login-general-error');

        idErr.textContent  = '';
        pwErr.textContent  = '';
        genErr.textContent = '';

        if (!idVal) { idErr.textContent = '학번을 입력해주세요.'; valid = false; }
        if (!pwVal) { pwErr.textContent = '비밀번호를 입력해주세요.'; valid = false; }
        if (!valid) return;

        // localStorage에서 계정 확인
        const users = JSON.parse(localStorage.getItem('bootcamp_users') || '[]');
        const found = users.find(u => u.id === idVal && u.password === pwVal);

        if (!found) {
            genErr.textContent = '학번 또는 비밀번호가 올바르지 않습니다.';
            return;
        }

        const dest = pendingSection || 'dashboard';
        loginUser(found.id, found.name);
        closeModal();
        showToast(`${found.name} 님, 환영합니다! 🎉`);
        switchSection(dest);
    });

    // =========================================
    // 9. 회원가입 폼 처리
    // =========================================
    document.getElementById('signup-form').addEventListener('submit', e => {
        e.preventDefault();
        let valid = true;

        const idVal   = document.getElementById('student-id').value.trim();
        const nameVal = document.getElementById('user-name').value.trim();
        const pwVal   = document.getElementById('password').value;
        const idErr   = document.getElementById('id-error');
        const nameErr = document.getElementById('name-error');
        const pwErr   = document.getElementById('pw-error');

        idErr.textContent   = '';
        nameErr.textContent = '';
        pwErr.textContent   = '';

        if (!idVal)               { idErr.textContent   = '학번을 입력해주세요.'; valid = false; }
        if (!nameVal)             { nameErr.textContent = '성명을 입력해주세요.'; valid = false; }
        if (pwVal.length < 8) { pwErr.textContent   = '비밀번호를 8자 이상 입력해주세요.'; valid = false; }
        if (!valid) return;

        const users = JSON.parse(localStorage.getItem('bootcamp_users') || '[]');
        if (users.find(u => u.id === idVal)) {
            idErr.textContent = '이미 등록된 학번입니다.';
            return;
        }

        users.push({ id: idVal, name: nameVal, password: pwVal });
        localStorage.setItem('bootcamp_users', JSON.stringify(users));

        loginUser(idVal, nameVal);
        closeModal();
        showToast(`${nameVal} 님, 가입을 환영합니다! 🎉`);
        switchSection('dashboard');
    });

    // =========================================
    // 10. 토스트 알림
    // =========================================
    function showToast(message) {
        let toast = document.getElementById('toast-notification');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast-notification';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // =========================================
    // 11. 확장 카드 (과정 카드 호버/포커스)
    // =========================================
    document.querySelectorAll('.expand-card').forEach(card => {
        card.addEventListener('mouseenter', () => card.setAttribute('aria-expanded', 'true'));
        card.addEventListener('mouseleave', () => card.setAttribute('aria-expanded', 'false'));
        card.addEventListener('focusin',  () => {
            card.classList.add('focus-expanded');
            card.setAttribute('aria-expanded', 'true');
        });
        card.addEventListener('focusout', e => {
            if (!card.contains(e.relatedTarget)) {
                card.classList.remove('focus-expanded');
                card.setAttribute('aria-expanded', 'false');
            }
        });
    });

});
