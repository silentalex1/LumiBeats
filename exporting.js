const fill = document.querySelector('.fill');
let progress = 0;

const interval = setInterval(() => {
    progress += Math.random() * 2;
    if(progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => {
            window.location.href = 'project-option.html';
        }, 500);
    }
    fill.style.width = progress + '%';
}, 50);
