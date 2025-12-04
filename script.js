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
    const settingsContent = document.getElementById('settings-content');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const beatSteps = document.querySelectorAll('.beat-step');
    const tempoSlider = document.getElementById('tempo-slider');
    const tempoValue = document.getElementById('tempo-value');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValue = document.getElementById('volume-value');
    const navButtons = document.querySelectorAll('.nav-btn');
    const contentSections = document.querySelectorAll('.content-section');
    const playBeatBtn = document.getElementById('play-beat-btn');
    const stopBeatBtn = document.getElementById('stop-beat-btn');
    const pitchSlider = document.getElementById('pitch-slider');
    const pitchValue = document.getElementById('pitch-value');
    const reverbSlider = document.getElementById('reverb-slider');
    const reverbValue = document.getElementById('reverb-value');

    const TOTAL_PATH = 283;
    waveFill.style.strokeDashoffset = TOTAL_PATH;

    const APP_LOADED_EVENT = 'appLoaded';

    const startVisualizer = () => {
        visualizerContainer.classList.add('opacity-100');
        line.parentElement.classList.add('animate-line-in');
        
        let visualizerInterval = setInterval(() => {
            const randomScaleY = Math.random() * 8 + 1;
            const randomHue = Math.random() * 360;
            const randomColor = `hsl(${randomHue}, 80%, 60%)`;

            line.style.height = `${randomScaleY}px`;
            line.style.backgroundColor = randomColor;
        }, 50);

        setTimeout(() => {
            clearInterval(visualizerInterval);
            line.classList.add('pulse-fade');
            line.addEventListener('animationend', startLoading, { once: true });
        }, 3000);
    };

    const startLoading = () => {
        visualizerContainer.classList.remove('opacity-100');
        
        loadingStatus.classList.add('visible', 'opacity-100');
        
        const loadingDuration = 3500;
        const startTime = Date.now();

        const updateLoading = () => {
            const elapsed = Date.now() - startTime;
            const progressRatio = Math.min(1, elapsed / loadingDuration);
            
            const currentProgress = Math.floor(progressRatio * 100);
            
            loadingPercent.textContent = `${currentProgress}%`;
            
            const offset = TOTAL_PATH - (progressRatio * TOTAL_PATH);
            waveFill.style.strokeDashoffset = offset;

            if (progressRatio < 1) {
                requestAnimationFrame(updateLoading);
            } else {
                setTimeout(finishLoading, 500);
            }
        };
        
        requestAnimationFrame(updateLoading);
    };

    const finishLoading = () => {
        overlay.classList.add('opacity-0');
        
        appContainer.classList.remove('hidden');
        appContainer.classList.add('opacity-100');
        
        document.dispatchEvent(new CustomEvent(APP_LOADED_EVENT));

        overlay.addEventListener('transitionend', () => {
            overlay.remove();
        }, { once: true });
    };

    const openSettings = () => {
        settingsModal.classList.remove('hidden');
        settingsModal.classList.add('flex', 'active');
        setTimeout(() => {
            settingsContent.classList.add('opacity-100', 'scale-100');
        }, 10);
    };

    const closeSettings = () => {
        settingsContent.classList.remove('opacity-100', 'scale-100');
        setTimeout(() => {
            settingsModal.classList.add('hidden');
            settingsModal.classList.remove('flex', 'active');
        }, 300);
    };

    const switchSection = (sectionId) => {
        contentSections.forEach(section => {
            if (section.id === sectionId) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        });

        navButtons.forEach(btn => {
            if (btn.dataset.section === sectionId.replace('-section', '')) {
                btn.classList.add('text-indigo-400');
                btn.classList.remove('text-gray-400');
            } else {
                btn.classList.add('text-gray-400');
                btn.classList.remove('text-indigo-400');
            }
        });

        document.querySelector('header').textContent = sectionId === 'studio-section' ? 'Studio Mixer' : 'Vocal Editor';
    };

    
    setTimeout(startVisualizer, 500);

    // --- UI Listeners (Connection) ---

    // Settings Modal
    settingsBtn.addEventListener('click', openSettings);
    mobileSettingsBtn.addEventListener('click', openSettings);
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettings();
        }
    });
    saveSettingsBtn.addEventListener('click', () => {
        const apiKey = document.getElementById('gemini-api-key').value;
        localStorage.setItem('geminiApiKey', apiKey);
        console.log("Settings saved. Key length:", apiKey.length);
        closeSettings();
    });

    // Sequencer Interaction
    beatSteps.forEach(step => {
        step.addEventListener('click', () => {
            step.classList.toggle('active');
            const instrument = step.dataset.instrument;
            console.log(`Beat step toggled: ${instrument}`);
            // In a full application, this would trigger an audio request/update
        });
    });

    // Transport Controls
    playBeatBtn.addEventListener('click', () => {
        playBeatBtn.classList.add('hidden');
        stopBeatBtn.classList.remove('hidden');
        console.log("Beat loop started.");
    });
    stopBeatBtn.addEventListener('click', () => {
        stopBeatBtn.classList.add('hidden');
        playBeatBtn.classList.remove('hidden');
        console.log("Beat loop stopped.");
    });

    // Slider Connections
    tempoSlider.addEventListener('input', (e) => {
        tempoValue.textContent = e.target.value;
        console.log(`Tempo set to: ${e.target.value} BPM`);
    });
    volumeSlider.addEventListener('input', (e) => {
        volumeValue.textContent = `${e.target.value}%`;
        console.log(`Master Volume set to: ${e.target.value}%`);
    });
    pitchSlider.addEventListener('input', (e) => {
        pitchValue.textContent = e.target.value;
        console.log(`Pitch set to: ${e.target.value} semitones`);
    });
    reverbSlider.addEventListener('input', (e) => {
        reverbValue.textContent = `${e.target.value}%`;
        console.log(`Reverb Mix set to: ${e.target.value}%`);
    });

    // Navigation Connection
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            switchSection(`${btn.dataset.section}-section`);
        });
    });

    // Gemini Integration Placeholder
    document.getElementById('generate-beat-btn').addEventListener('click', () => {
        const apiKey = localStorage.getItem('geminiApiKey');
        if (!apiKey) {
            alert('Please enter your Gemini API key in the settings first!');
            openSettings();
            return;
        }
        console.log("Request sent to Gemini 2.5 Pro for beat generation.");
    });
});
