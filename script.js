document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('loading-overlay');
    const line = document.getElementById('visualizer-line');
    const visualizerContainer = document.getElementById('visualizer-container');
    const loadingStatus = document.getElementById('loading-status');
    const loadingPercent = document.getElementById('loading-percent');
    const waveFill = document.getElementById('wave-fill');
    const appContainer = document.getElementById('app-container');
    const settingsBtn = document.getElementById('settings-btn');
    const mobileSettingsBtn = document.getElementById('mobile-settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const modalContent = settingsModal.querySelector('div');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const beatSteps = document.querySelectorAll('.beat-step');

    const TOTAL_PATH = 283;
    waveFill.style.strokeDashoffset = TOTAL_PATH;

    setTimeout(() => {
        visualizerContainer.classList.add('opacity-100');
        line.parentElement.classList.add('animate-line-in');
        
        let visualizerInterval = setInterval(() => {
            const randomHeight = Math.random() * 8 + 1;
            const randomColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
            const randomScale = Math.random() * 0.2 + 0.9;

            line.style.height = `${randomHeight}px`;
            line.style.backgroundColor = randomColor;
            line.style.transform = `scaleY(${randomScale})`; 
        }, 50);

        setTimeout(() => {
            clearInterval(visualizerInterval);
            line.classList.add('pulse-fade');
            line.addEventListener('animationend', () => {
                visualizerContainer.classList.remove('opacity-100');
                
                loadingStatus.classList.add('visible', 'opacity-100');
                
                let currentProgress = 0;
                const loadingDuration = 3500;
                const startTime = Date.now();

                const updateLoading = () => {
                    const elapsed = Date.now() - startTime;
                    const progressRatio = Math.min(1, elapsed / loadingDuration);
                    
                    currentProgress = Math.floor(progressRatio * 100);
                    
                    loadingPercent.textContent = `${currentProgress}%`;
                    
                    const offset = TOTAL_PATH - (progressRatio * TOTAL_PATH);
                    waveFill.style.strokeDashoffset = offset;

                    if (progressRatio < 1) {
                        requestAnimationFrame(updateLoading);
                    } else {
                        setTimeout(() => {
                            overlay.classList.add('opacity-0');
                            
                            appContainer.classList.remove('hidden');
                            appContainer.classList.add('opacity-100');
                            
                            overlay.addEventListener('transitionend', () => {
                                overlay.remove();
                            }, { once: true });
                        }, 500);
                    }
                };
                
                requestAnimationFrame(updateLoading);

            }, { once: true });
        }, 3000);
    }, 500);

    const openSettings = () => {
        settingsModal.classList.remove('hidden');
        settingsModal.classList.add('flex', 'active');
        setTimeout(() => {
            modalContent.classList.add('opacity-100', 'scale-100');
        }, 10);
    };

    const closeSettings = () => {
        modalContent.classList.remove('opacity-100', 'scale-100');
        setTimeout(() => {
            settingsModal.classList.add('hidden');
            settingsModal.classList.remove('flex', 'active');
        }, 300);
    };

    settingsBtn.addEventListener('click', openSettings);
    mobileSettingsBtn.addEventListener('click', openSettings);

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettings();
        }
    });

    saveSettingsBtn.addEventListener('click', () => {
        const apiKey = document.getElementById('gemini-api-key').value;
        console.log("Saving API Key:", apiKey.substring(0, 5) + '...[Key Stored]');
        closeSettings();
    });

    beatSteps.forEach(step => {
        step.addEventListener('click', () => {
            step.classList.toggle('active');
        });
    });
});
