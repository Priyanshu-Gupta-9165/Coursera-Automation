// Content script for Coursera Automation — Error-Free Edition

let isRunning = false;
let automationInterval = null;
let _scrapeIntervalId = null;

// --- Extension Context Validity Check ---
// Jab extension reload/update hota hai, purana content script ka chrome context
// invalid ho jata hai. Ye function check karta hai ki context abhi valid hai ya nahi.
function isExtensionValid() {
    try {
        return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
        return false;
    }
}

let _videoStepInterval = null;

// Agar context invalid ho jaye toh saare intervals band kar do — completely silent
function cleanupOnInvalidContext() {
    isRunning = false;
    if (automationInterval) {
        clearInterval(automationInterval);
        automationInterval = null;
    }
    if (window._courseraAutoInterval) {
        clearInterval(window._courseraAutoInterval);
        window._courseraAutoInterval = null;
    }
    if (_scrapeIntervalId) {
        clearInterval(_scrapeIntervalId);
        _scrapeIntervalId = null;
    }
    if (_videoStepInterval) {
        clearInterval(_videoStepInterval);
        _videoStepInterval = null;
    }
}

// Safe wrapper — chrome API call ko safely execute karta hai, error aaye toh silent cleanup
function safeChrome(fn) {
    if (!isExtensionValid()) { cleanupOnInvalidContext(); return; }
    try { fn(); } catch (e) { cleanupOnInvalidContext(); }
}

const CONFIG = {
    scrollSpeed: 50,
    clickDelay: 100,
};

// --- Toast Notification System ---
function showToast(message, type = 'info') {
    try {
        const existing = document.getElementById('coursera-auto-toast');
        if (existing) existing.remove();

        const colors = {
            success: { bg: '#28a745', icon: '✅' },
            info:    { bg: '#0056D2', icon: '⚡' },
            stop:    { bg: '#dc3545', icon: '◼' },
            warn:    { bg: '#e67e22', icon: '⚠️' }
        };
        const c = colors[type] || colors.info;

        const toast = document.createElement('div');
        toast.id = 'coursera-auto-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            background: ${c.bg};
            color: white;
            padding: 12px 18px;
            border-radius: 10px;
            font-family: 'Segoe UI', sans-serif;
            font-size: 13px;
            font-weight: 600;
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            max-width: 280px;
            line-height: 1.4;
            opacity: 0;
            transform: translateY(20px);
            transition: opacity 0.3s ease, transform 0.3s ease;
        `;
        toast.textContent = `${c.icon} ${message}`;

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        }, 3000);

        toast.onclick = () => toast.remove();
    } catch (e) {
        // DOM error — silently ignore
    }
}

// --- Session Stats & Progress Helper ---
function incrementStat(key) {
    safeChrome(() => {
        chrome.storage.local.get([key], function (result) {
            if (!isExtensionValid()) return;
            try {
                const current = result[key] || 0;
                chrome.storage.local.set({ [key]: current + 1 });
            } catch (e) { /* silent */ }
        });
    });
}

// Scrape course progress from the left sidebar
function scrapeProgress() {
    if (!isExtensionValid()) { cleanupOnInvalidContext(); return; }

    try {
        const progressBars = document.querySelectorAll('[aria-valuenow]');
        for (const bar of progressBars) {
            const val = parseInt(bar.getAttribute('aria-valuenow'), 10);
            if (!isNaN(val) && val >= 0 && val <= 100) {
                safeChrome(() => chrome.storage.local.set({ courseProgress: val }));
                return;
            }
        }

        const textNodes = Array.from(document.querySelectorAll('span, p, div')).filter(el => {
            const text = el.innerText || '';
            return text.includes('% completed') || text.includes('% complete');
        });

        for (const node of textNodes) {
            const match = node.innerText.match(/(\d+)%/);
            if (match && match[1]) {
                safeChrome(() => chrome.storage.local.set({ courseProgress: parseInt(match[1], 10) }));
                return;
            }
        }
    } catch (e) {
        cleanupOnInvalidContext();
    }
}

// Run progress scraper occasionally
_scrapeIntervalId = setInterval(scrapeProgress, 5000);
setTimeout(scrapeProgress, 1500);

let currentMode = 'video';

// Guard against duplicate intervals on SPA navigation
if (window._courseraAutoInterval) {
    clearInterval(window._courseraAutoInterval);
    window._courseraAutoInterval = null;
}

// Initialize state from storage
safeChrome(() => {
    chrome.storage.local.get(['isRunning', 'mode'], function (result) {
        if (!isExtensionValid()) return;
        try {
            if (result.isRunning) {
                currentMode = result.mode || 'video';
                startAutomation();
            }
        } catch (e) { /* silent */ }
    });
});

// Listen for messages from popup
safeChrome(() => {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (!isExtensionValid()) return;
        try {
            if (request.action === "start") {
                currentMode = request.mode || 'video';
                stopAutomation();
                startAutomation();
                sendResponse({ status: "started" });
            } else if (request.action === "stop") {
                stopAutomation();
                sendResponse({ status: "stopped" });
            }
        } catch (e) { /* silent */ }
        return true;
    });
});

function startAutomation() {
    if (isRunning) return;
    isRunning = true;
    _idleLoopCount = 0;
    showToast(`Automation started (${currentMode} mode)`, 'info');

    automationInterval = setInterval(runAutomationLoop, 1500);
    window._courseraAutoInterval = automationInterval;
    runAutomationLoop();
}

function stopAutomation() {
    const wasRunning = isRunning;
    isRunning = false;
    if (automationInterval) {
        clearInterval(automationInterval);
        automationInterval = null;
    }
    if (window._courseraAutoInterval) {
        clearInterval(window._courseraAutoInterval);
        window._courseraAutoInterval = null;
    }
    if (_videoStepInterval) {
        clearInterval(_videoStepInterval);
        _videoStepInterval = null;
    }
    // Reset video tracking so next start gets fresh listeners
    _watchedVideo = null;
    _videoSkipForced = false;

    // FIX: Clear the video stepping interval
    if (window._courseraVideoStep) {
        clearInterval(window._courseraVideoStep);
        window._courseraVideoStep = null;
    }

    if (wasRunning) showToast('Automation stopped', 'stop');
    console.log("%c[Coursera Auto] Stopped ◼", "color: red; font-size: 16px; font-weight: bold;");
}

function runAutomationLoop() {
    if (!isRunning) return;
    if (!isExtensionValid()) { cleanupOnInvalidContext(); return; }

    try {
        if (currentMode === 'video') {
            runVideoLogic();
        } else if (currentMode === 'reading') {
            runReadingLogic();
        }
    } catch (e) {
        // Silently catch any unexpected errors in the loop
    }
}

// Track if we already attached listeners to this video element
let _watchedVideo = null;
let _videoSkipForced = false;

// --- Auto-Stop: Track consecutive idle loops ---
let _idleLoopCount = 0;
const IDLE_THRESHOLD = 5;

// Helper: Video complete hone par Coursera ke server sync hone ka wait karo aur Next click karo
function handleVideoFinished(video) {
    if (_videoSkipForced) return;
    _videoSkipForced = true;
    if (_videoStepInterval) { clearInterval(_videoStepInterval); _videoStepInterval = null; }
    if (!isExtensionValid()) { cleanupOnInvalidContext(); return; }

    try {
        // 1. Synthetic events fire karo taaki Coursera ka React/Redux state pakka update ho
        video.dispatchEvent(new Event('timeupdate', { bubbles: true }));
        video.dispatchEvent(new Event('ended', { bubbles: true }));
        video.dispatchEvent(new Event('pause', { bubbles: true }));

        // 2. Video page par agar koi 'Mark as complete' button hai toh click karo
        handleMarkAsComplete();

        showToast('Video completed! 🎉', 'success');
        incrementStat('videosCompleted');

        // 3. Coursera server ko request complete karne ke liye 1.2s ka sync time do
        setTimeout(() => {
            if (!isExtensionValid()) { cleanupOnInvalidContext(); return; }
            clickNext();
        }, 1200);
    } catch (e) {
        setTimeout(clickNext, 600);
    }
}

// ── LOOPHOLE: Rapid Micro-Stepping Engine ──
// Jump karne se anti-cheat trigger hota hai, aur 1x/16x par lamba time lagta hai.
// Ye engine 25 micro-steps mein video ko 1.8 second ke andar 0% -> 100% smoothly advance karta hai.
// Har 70ms par 'timeupdate' event bhejta hai taaki Coursera ka tracker continuous progression register kare!
function startMicroStepSkip(video) {
    if (_videoStepInterval) return; // already running

    const totalSteps = 25;
    const stepIntervalMs = 70; // 25 * 70ms = ~1.75 seconds total
    const stepDuration = video.duration / totalSteps;
    let currentStep = 0;

    _videoStepInterval = setInterval(() => {
        if (!isRunning || !isExtensionValid()) {
            clearInterval(_videoStepInterval);
            _videoStepInterval = null;
            return;
        }

        currentStep++;

        try {
            // Mute video
            video.muted = true;

            // Advance time smoothly
            const nextTime = Math.min(video.duration, currentStep * stepDuration);
            video.currentTime = nextTime;

            // Dispatch timeupdate event so Coursera tracks progress at every single milestone
            video.dispatchEvent(new Event('timeupdate', { bubbles: true }));

            // When reached 100%
            if (currentStep >= totalSteps || video.currentTime >= video.duration - 0.2) {
                clearInterval(_videoStepInterval);
                _videoStepInterval = null;
                video.currentTime = video.duration;
                handleVideoFinished(video);
            }
        } catch (e) {
            clearInterval(_videoStepInterval);
            _videoStepInterval = null;
            handleVideoFinished(video);
        }
    }, stepIntervalMs);
}

function runVideoLogic() {
    if (!isExtensionValid()) { cleanupOnInvalidContext(); return; }

    const video = document.querySelector('video');

    if (video) {
        // Video page par agar koi dialogue ya prompt hai toh handle karo
        handleDialogues();

        // ── Attach event listeners only once per video element ──
        if (_watchedVideo !== video) {
            _watchedVideo = video;
            _videoSkipForced = false;
            if (_videoStepInterval) { clearInterval(_videoStepInterval); _videoStepInterval = null; }

            // Primary: fire clickNext when the video actually ends
            video.addEventListener('ended', function onVideoEnded() {
                video.removeEventListener('ended', onVideoEnded);
                if (!isRunning) return;
                console.log("[Coursera Auto] ✅ Video 'ended' event fired — clicking Next...");
                showToast('Video completed!', 'success');
                incrementStat('videosCompleted');

                // FIX: Clear stepping interval before clicking next
                if (window._courseraVideoStep) {
                    clearInterval(window._courseraVideoStep);
                    window._courseraVideoStep = null;
                }

                setTimeout(clickNext, 600);
            });

            // Safety net: if playback is near the end (last 1.2s), fire next
            video.addEventListener('timeupdate', function onTimeUpdate() {
                if (!isRunning || _videoSkipForced) return;
                if (video.duration > 0 && video.currentTime >= video.duration - 1.2) {
                    _videoSkipForced = true;
                    video.removeEventListener('timeupdate', onTimeUpdate);
                    console.log("[Coursera Auto] ✅ Video near end — clicking Next...");
                    showToast('Video completed!', 'success');
                    incrementStat('videosCompleted');

                    // FIX: Clear stepping interval
                    if (window._courseraVideoStep) {
                        clearInterval(window._courseraVideoStep);
                        window._courseraVideoStep = null;
                    }

                    setTimeout(clickNext, 800);
                }
            });

            _idleLoopCount = 0;
        }

        // Agar video already ended state mein hai
        if (video.ended) {
            handleVideoFinished(video);
            return;
        }

        // Wait until duration is known / video loaded
        if (!video.duration || isNaN(video.duration) || video.duration === 0) {
            // Coursera overlay play button click karo agar video start nahi hui
            const playOverlay = document.querySelector('.vjs-big-play-button, button[aria-label*="Play" i], button[data-track-component="play_button"]');
            if (playOverlay && !playOverlay.disabled) {
                playOverlay.click();
            }
            return;
        }

        // ─── FIX: Bypass Coursera's watch-time tracking ───
        // Seek karne se backend detect kar leta hai ki video skip hua hai.
        // Isliye hum video ko 16x pe play karenge aur setInterval se thoda-thoda 
        // aage badhayenge taaki native 'timeupdate' events fire ho aur completion tick lag jaye.
        try {
            // Max out speed — this is the most compatible approach
            if (video.playbackRate !== 16) {
                video.playbackRate = 16;
            }
            video.muted = true;

            if (!window._courseraVideoStep) {
                window._courseraVideoStep = setInterval(() => {
                    if (!isRunning || !video || video.ended || video.paused) {
                        clearInterval(window._courseraVideoStep);
                        window._courseraVideoStep = null;
                        return;
                    }
                    if (video.currentTime < video.duration - 2) {
                        video.currentTime += 5; // Smooth step forward to fire native timeupdate
                    } else {
                        clearInterval(window._courseraVideoStep);
                        window._courseraVideoStep = null;
                    }
                }, 500); // Adds 10 seconds of video time every 1 second real-time
            }

            // Ensure it's playing
            if (video.paused) {
                video.play().catch(e => {
                    console.warn("[Coursera Auto] play() blocked:", e.message);
                });
            }
        } catch (e) {
            console.error("[Coursera Auto] Error controlling video:", e);
        }

    } else {
        _watchedVideo = null;
        _videoSkipForced = false;
        if (_videoStepInterval) { clearInterval(_videoStepInterval); _videoStepInterval = null; }
        if (!handleMarkAsComplete()) {
            clickNext();
        }
    }
}

function runReadingLogic() {
    if (!isExtensionValid()) { cleanupOnInvalidContext(); return; }
    if (handleMarkAsComplete()) return;
    if (handleDialogues()) return;
    clickNext();
}

function handleMarkAsComplete() {
    if (!isExtensionValid()) { cleanupOnInvalidContext(); return false; }

    try {
        const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));

        const markCompleteBtns = [
            ...document.querySelectorAll("button[data-testid='mark-as-complete']"),
            ...document.querySelectorAll("button[data-testid='complete-button']"),
            ...document.querySelectorAll("button[data-testid='cds-button-mark-as-complete']"),
            ...document.querySelectorAll("button[aria-label='Mark as complete']"),
            ...document.querySelectorAll("button[aria-label='Mark as Complete']"),
            ...document.querySelectorAll("button[aria-label='Mark as done']"),
            ...allButtons.filter(b => {
                const lower = (b.innerText || b.textContent || '').trim().toLowerCase();
                return lower === "mark as complete" ||
                       lower === "mark as done" ||
                       lower.includes("mark as complete") ||
                       lower.includes("mark as done") ||
                       lower.includes("i'm done") ||
                       lower.includes("complete item");
            }),
            ...Array.from(document.querySelectorAll('span')).filter(s => {
                const lower = (s.innerText || '').trim().toLowerCase();
                return lower.includes("mark as complete") || lower.includes("mark as done");
            }).map(s => s.closest('button')).filter(b => b)
        ];

        const uniqueBtns = [...new Set(markCompleteBtns)];

        if (uniqueBtns.length > 0) {
            _idleLoopCount = 0;
            window.scrollTo(0, document.body.scrollHeight);
            setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 150);

            setTimeout(() => {
                if (!isExtensionValid()) { cleanupOnInvalidContext(); return; }
                let clicked = false;
                uniqueBtns.forEach(btn => {
                    if (btn && !btn.disabled && btn.offsetParent !== null) {
                        btn.click();
                        clicked = true;
                        showToast('Reading completed!', 'success');
                        incrementStat('readingsCompleted');
                    }
                });
                setTimeout(clickNext, clicked ? 300 : 600);
            }, 400);
            return true;
        }
    } catch (e) {
        // Silent — DOM query error
    }
    return false;
}

function handleDialogues() {
    try {
        const dialogueBtns = Array.from(document.querySelectorAll('button, [role="button"]')).filter(b => {
            const text = (b.innerText || b.textContent || '').trim().toLowerCase();
            return (
                text === "continue" ||
                text === "i agree" ||
                text === "resume" ||
                text === "get started" ||
                text === "close" ||
                text === "dismiss"
            );
        });

        if (dialogueBtns.length > 0) {
            const btn = dialogueBtns.find(b => !b.disabled && b.offsetParent !== null);
            if (btn) {
                btn.click();
                return true;
            }
        }
    } catch (e) {
        // Silent
    }
    return false;
}

function clickNext() {
    if (!isExtensionValid()) { cleanupOnInvalidContext(); return; }

    try {
        const nextSelectors = [
            "button[data-testid='next-button']",
            "a[data-testid='next-button']",
            "button[data-testid='cds-button-next']",
            "[data-testid='sidebar-next-button']",
            "button[aria-label='Next']",
            "button[aria-label='Go to next item']",
            "button[aria-label='Next item']",
            ".rc-NextButton",
            "a[aria-label='Next']"
        ];

        for (const selector of nextSelectors) {
            const btn = document.querySelector(selector);
            if (btn && !btn.disabled && btn.offsetParent !== null) {
                if (isSensitiveItem(btn)) return;
                _idleLoopCount = 0;
                btn.click();
                return;
            }
        }

        const allBtns = document.querySelectorAll('button, a[role="button"]');
        for (const btn of allBtns) {
            const text = (btn.innerText || btn.textContent || '').trim();
            if (text === "Next" && !btn.disabled && btn.offsetParent !== null) {
                if (isSensitiveItem(btn)) return;
                _idleLoopCount = 0;
                btn.click();
                return;
            }
        }

        _idleLoopCount++;
        if (_idleLoopCount >= IDLE_THRESHOLD) {
            autoCompleteStop();
        }
    } catch (e) {
        // Silent
    }
}

// --- Auto-Stop: Module/Course completed ---
function autoCompleteStop() {
    stopAutomation();
    safeChrome(() => chrome.storage.local.set({ isRunning: false }));
    showToast('All tasks completed! 🎉', 'success');
    showCompletionBanner();
}

function showCompletionBanner() {
    try {
        const existing = document.getElementById('coursera-auto-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'coursera-auto-banner';
        banner.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            padding: 16px 22px;
            border-radius: 12px;
            font-family: 'Segoe UI', sans-serif;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 6px 25px rgba(40, 167, 69, 0.4);
            max-width: 320px;
            line-height: 1.5;
            opacity: 0;
            transform: translateY(-20px);
            transition: opacity 0.4s ease, transform 0.4s ease;
        `;
        banner.innerHTML = `🎉 Module Completed!<br><span style="font-weight:normal;font-size:13px;">All available items have been processed. Automation has stopped automatically.</span>`;

        document.body.appendChild(banner);
        requestAnimationFrame(() => {
            banner.style.opacity = '1';
            banner.style.transform = 'translateY(0)';
        });

        banner.onclick = () => banner.remove();
        setTimeout(() => {
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(-20px)';
            setTimeout(() => { if (banner.parentNode) banner.remove(); }, 400);
        }, 10000);
    } catch (e) {
        // Silent — DOM error
    }
}

// Only stop on truly graded items to avoid false positives
function isSensitiveItem(btn) {
    try {
        const btnText = (btn.innerText || '').toLowerCase();
        const btnLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const btnTitle = (btn.getAttribute('title') || '').toLowerCase();
        const combinedText = btnText + " " + btnLabel + " " + btnTitle;

        const sensitiveKeywords = [
            "graded assessment",
            "graded assignment",
            "graded quiz",
            "programming assignment",
            "peer-graded",
            "peer graded",
            "final exam",
            "final project"
        ];

        const foundKeyword = sensitiveKeywords.find(kw => combinedText.includes(kw));
        if (foundKeyword) {
            stopAutomation();
            safeChrome(() => chrome.storage.local.set({ isRunning: false }));
            showStopBanner(foundKeyword);
            return true;
        }
    } catch (e) {
        // Silent
    }
    return false;
}

function showStopBanner(reason) {
    try {
        const existing = document.getElementById('coursera-auto-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'coursera-auto-banner';
        banner.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            background: #dc3545;
            color: white;
            padding: 14px 20px;
            border-radius: 10px;
            font-family: 'Segoe UI', sans-serif;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            max-width: 300px;
            line-height: 1.5;
        `;
        banner.innerHTML = `⛔ Coursera Auto Stopped<br><span style="font-weight:normal;font-size:13px;">Detected: <b>${reason}</b>. Please complete this manually.</span>`;

        banner.onclick = () => banner.remove();
        document.body.appendChild(banner);
        setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
    } catch (e) {
        // Silent — DOM error
    }
}
