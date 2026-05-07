document.addEventListener('DOMContentLoaded', () => {
    const wrapper = document.getElementById('agWrapper');
    const items = document.querySelectorAll('.gallery-item');

    let mX = 0, mY = 0;
    let tX = 0, tY = 0;
    let rX = 0, rY = 0;
    let cRX = 0, cRY = 0;

    const cols = 9;
    const rows = 7;
    const arcWidth = 9000; 
    const arcDepth = 2500; 
    const verticalGap = 1100;

    items.forEach((item, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const nX = (col - (cols - 1) / 2) / ((cols - 1) / 2);
        const nY = (row - (rows - 1) / 2) / ((rows - 1) / 2);

        const xPos = nX * (arcWidth / 2);
        const zPos = (Math.abs(nX) - 1) * arcDepth; 
        const yPos = nY * (verticalGap * (rows / 2)); 
        const angleY = nX * -65; 
        const angleX = nY * 20; 

        item.style.setProperty('--bx', `${xPos}px`);
        item.style.setProperty('--by', `${yPos}px`);
        item.style.setProperty('--bz', `${zPos}px`);
        item.style.setProperty('--ax', `${angleX}deg`);
        item.style.setProperty('--ay', `${angleY}deg`);

        item.style.transform = `translate3d(${xPos}px, ${yPos}px, ${zPos}px) rotateX(${angleX}deg) rotateY(${angleY}deg)`;
    });

    window.addEventListener('mousemove', (e) => {
        const x = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
        const y = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
        mX = x * -4000; 
        mY = y * -3000;
        rY = x * 45; 
        rX = y * -25;
    }, { passive: true });

    function frame() {
        tX += (mX - tX) * 0.08;
        tY += (mY - tY) * 0.08;
        cRX += (rX - cRX) * 0.08;
        cRY += (rY - cRY) * 0.08;

        if (wrapper) {
            wrapper.style.transform = `translate3d(calc(-50% + ${tX}px), calc(-50% + ${tY}px), -1800px) rotateX(${cRX}deg) rotateY(${cRY}deg)`;
            
            // [추가] 부모의 회전값을 실시간으로 자식 변수에 전달하여 "시선 보정"에 활용
            document.documentElement.style.setProperty('--p-rx', `${-cRX}deg`);
            document.documentElement.style.setProperty('--p-ry', `${-cRY}deg`);
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
});
