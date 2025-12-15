document.getElementById('new-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
});

document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
});
