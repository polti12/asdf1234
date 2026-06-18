document.addEventListener('DOMContentLoaded', () => {
    // 1. Navigation Logic
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.page-section');

    function switchSection(targetId) {
        sections.forEach(sec => sec.classList.remove('active'));
        navLinks.forEach(link => link.classList.remove('active'));

        const targetSec = document.getElementById(targetId);
        if (targetSec) targetSec.classList.add('active');

        const activeLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
        if (activeLink) activeLink.classList.add('active');
        
        window.scrollTo(0,0);
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection(link.dataset.target);
        });
    });

    // 2. Expandable Card Focus Sync (A11y)
    const expandCards = document.querySelectorAll('.expand-card');
    expandCards.forEach(card => {
        card.addEventListener('mouseenter', () => { card.setAttribute('aria-expanded', 'true'); });
        card.addEventListener('mouseleave', () => { card.setAttribute('aria-expanded', 'false'); });

        card.addEventListener('focusin', () => {
            card.classList.add('focus-expanded');
            card.setAttribute('aria-expanded', 'true');
        });
        card.addEventListener('focusout', (e) => {
            if (!card.contains(e.relatedTarget)) {
                card.classList.remove('focus-expanded');
                card.setAttribute('aria-expanded', 'false');
            }
        });
    });

    // 3. Modal & Focus Trap Logic (Registration / Dashboard Flow)
    const modal = document.getElementById('signup-modal');
    const modalCloseBtn = document.getElementById('modal-close');
    const authForm = document.getElementById('auth-form');
    const applyBtns = document.querySelectorAll('.btn-apply-course');
    let triggerElement = null;

    function openModal(triggerBtn) {
        triggerElement = triggerBtn;
        modal.removeAttribute('hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        
        // Focus trap initialization
        const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    }

    function closeModal() {
        modal.setAttribute('hidden', 'true');
        document.body.style.overflow = '';
        if (triggerElement) {
            triggerElement.focus(); // Return focus (A11y rule)
        }
    }

    // Attach click event to all relevant buttons
    const triggerButtons = document.querySelectorAll('.btn-apply-course, .btn-auth-trigger');
    triggerButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            openModal(this);
        });
    });

    modalCloseBtn.addEventListener('click', closeModal);

    // Close on Escape or outside click
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
            closeModal();
        }
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Modal Focus Trap
    modal.addEventListener('keydown', (e) => {
        const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.key === 'Tab') {
            if (e.shiftKey) { // Shift + Tab
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    e.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    e.preventDefault();
                }
            }
        }
    });

    // Form Validation Error reporting with aria-live
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        let isValid = true;
        
        const idInput = document.getElementById('student-id');
        const idError = document.getElementById('id-error');
        if (!idInput.value.trim()) {
            idError.textContent = "학번을 입력해주세요.";
            isValid = false;
        } else {
            idError.textContent = "";
        }

        const nameInput = document.getElementById('user-name');
        const nameError = document.getElementById('name-error');
        if (!nameInput.value.trim()) {
            nameError.textContent = "성명을 입력해주세요.";
            isValid = false;
        } else {
            nameError.textContent = "";
        }

        const pwInput = document.getElementById('password');
        const pwError = document.getElementById('pw-error');
        if (!pwInput.value.trim()) {
            pwError.textContent = "비밀번호를 입력해주세요.";
            isValid = false;
        } else {
            pwError.textContent = "";
        }

        // If form valid, route to dashboard
        if (isValid) {
            closeModal();
            authForm.reset();
            alert("회원가입/로그인이 완료되었습니다. 대시보드로 이동합니다.");
            switchSection('dashboard');
        }
    });
});
