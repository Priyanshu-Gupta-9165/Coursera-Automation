// Content script for Coursera Automation

let isRunning = false;
let automationInterval = null;

const CONFIG = {
    scrollSpeed: 50, // ms
    clickDelay: 100, // ms
};

// --- Toast Notification System ---
function showToast(message, type = 'info') {
    // Remove existing toast if any
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

    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }, 3000);

    toast.onclick = () => toast.remove();
}

// --- Session Stats & Progress Helper ---
function incrementStat(key) {
    chrome.storage.local.get([key], function (result) {
        const current = result[key] || 0;
        chrome.storage.local.set({ [key]: current + 1 });
    });
}

// Scrape course progress from the left sidebar
function scrapeProgress() {
    // Look for progress indicators. Coursera often uses aria-valuenow or specific text
    const progressBars = document.querySelectorAll('[aria-valuenow]');
    for (const bar of progressBars) {
        const val = parseInt(bar.getAttribute('aria-valuenow'), 10);
        if (!isNaN(val) && val >= 0 && val <= 100) {
            chrome.storage.local.set({ courseProgress: val });
            return;
        }
    }
    
    // Fallback: look for text like "X% completed"
    const textNodes = Array.from(document.querySelectorAll('span, p, div')).filter(el => {
        const text = el.innerText || '';
        return text.includes('% completed') || text.includes('% complete');
    });
    
    for (const node of textNodes) {
        const match = node.innerText.match(/(\d+)%/);
        if (match && match[1]) {
            chrome.storage.local.set({ courseProgress: parseInt(match[1], 10) });
            return;
        }
    }
}
// Run progress scraper occasionally
setInterval(scrapeProgress, 5000);
setTimeout(scrapeProgress, 1500);

let currentMode = 'video'; // 'video' or 'reading'

// --- FIX #4: Guard against duplicate intervals on SPA navigation ---
// Clear any previous interval before starting fresh
if (window._courseraAutoInterval) {
    clearInterval(window._courseraAutoInterval);
    window._courseraAutoInterval = null;
}

// Initialize state from storage
chrome.storage.local.get(['isRunning', 'mode'], function (result) {
    if (result.isRunning) {
        currentMode = result.mode || 'video';
        startAutomation();
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === "start") {
        currentMode = request.mode || 'video';
        // Allow restart even if already running (mode may have changed)
        stopAutomation();
        startAutomation();
        sendResponse({ status: "started" });
    } else if (request.action === "stop") {
        stopAutomation();
        sendResponse({ status: "stopped" });
    }
    return true; // Keep message channel open for async sendResponse
});

function startAutomation() {
    if (isRunning) return;
    isRunning = true;
    _idleLoopCount = 0; // Reset idle counter on fresh start
    console.log(`%c[Coursera Auto] Started (${currentMode}) ⚡`, "color: green; font-size: 16px; font-weight: bold;");
    showToast(`Automation started (${currentMode} mode)`, 'info');

    // Check repeatedly for content
    automationInterval = setInterval(runAutomationLoop, 1500);
    window._courseraAutoInterval = automationInterval; // Store globally to prevent duplicates
    runAutomationLoop(); // Run immediately once
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
    // Reset video tracking so next start gets fresh listeners
    _watchedVideo = null;
    _videoSkipForced = false;
    if (wasRunning) showToast('Automation stopped', 'stop');
    console.log("%c[Coursera Auto] Stopped ◼", "color: red; font-size: 16px; font-weight: bold;");
}

function runAutomationLoop() {
    if (!isRunning) return;

    if (currentMode === 'video') {
        runVideoLogic();
    } else if (currentMode === 'reading') {
        runReadingLogic();
    }
}

// Track if we already attached listeners to this video element
let _watchedVideo = null;
let _videoSkipForced = false;

// --- Auto-Stop: Track consecutive idle loops ---
let _idleLoopCount = 0;
const IDLE_THRESHOLD = 5; // Stop after 5 idle checks (~7.5 seconds of no action)

function runVideoLogic() {
    const video = document.querySelector('video');

    if (video) {
        // ── Attach event listeners only once per video element ──
        if (_watchedVideo !== video) {
            _watchedVideo = video;
            _videoSkipForced = false;

            // Primary: fire clickNext when the video actually ends
            video.addEventListener('ended', function onVideoEnded() {
                video.removeEventListener('ended', onVideoEnded);
                if (!isRunning) return;
                console.log("[Coursera Auto] ✅ Video 'ended' event fired — clicking Next...");
                showToast('Video completed!', 'success');
                incrementStat('videosCompleted');
                setTimeout(clickNext, 600);
            });

            // Safety net: if playback is near the end (last 1s), fire next
            video.addEventListener('timeupdate', function onTimeUpdate() {
                if (!isRunning || _videoSkipForced) return;
                if (video.duration > 0 && video.currentTime >= video.duration - 1.2) {
                    _videoSkipForced = true;
                    video.removeEventListener('timeupdate', onTimeUpdate);
                    console.log("[Coursera Auto] ✅ Video near end — clicking Next...");
                    showToast('Video completed!', 'success');
                    incrementStat('videosCompleted');
                    setTimeout(clickNext, 800);
                }
            });

            console.log("[Coursera Auto] 🎬 Video found — attaching listeners.");
            _idleLoopCount = 0; // Active work — reset idle
        }

        // ── Control the video playback ──
        if (video.ended) {
            // Already ended but 'ended' event may have fired before listener attached
            if (!_videoSkipForced) {
                _videoSkipForced = true;
                console.log("[Coursera Auto] Video already ended — clicking Next...");
                showToast('Video completed!', 'success');
                incrementStat('videosCompleted');
                setTimeout(clickNext, 600);
            }
            return;
        }

        // Wait until duration is known
        if (!video.duration || isNaN(video.duration) || video.duration === 0) {
            console.log("[Coursera Auto] Waiting for video metadata...");
            return;
        }

        try {
            // Max out speed — this is the most compatible approach
            if (video.playbackRate !== 16) {
                video.playbackRate = 16;
            }
            video.muted = true;

            // Only seek if we're not near the end already
            const remainingTime = video.duration - video.currentTime;
            if (remainingTime > 2) {
                console.log(`[Coursera Auto] Seeking to end... (${Math.round(remainingTime)}s remaining)`);
                video.currentTime = video.duration - 1.5;
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
        // No video on page — fallback
        _watchedVideo = null;
        _videoSkipForced = false;
        if (!handleMarkAsComplete()) {
            clickNext();
        }
    }
}

function runReadingLogic() {
    // Prioritize Reading & Dialogues
    if (handleMarkAsComplete()) return;
    if (handleDialogues()) return;

    // Always try next if nothing else
    clickNext();
}

function handleMarkAsComplete() {
    // --- FIX #1: Updated & expanded selectors for Coursera's current DOM ---
    const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));

    const markCompleteBtns = [
        // data-testid variants (old and new)
        ...document.querySelectorAll("button[data-testid='mark-as-complete']"),
        ...document.querySelectorAll("button[data-testid='complete-button']"),
        ...document.querySelectorAll("button[data-testid='cds-button-mark-as-complete']"),

        // aria-label variants
        ...document.querySelectorAll("button[aria-label='Mark as complete']"),
        ...document.querySelectorAll("button[aria-label='Mark as Complete']"),
        ...document.querySelectorAll("button[aria-label='Mark as done']"),

        // Text-based fallback (most reliable against DOM changes)
        ...allButtons.filter(b => {
            const lower = (b.innerText || b.textContent || '').trim().toLowerCase();
            return lower === "mark as complete" ||
                   lower === "mark as done" ||
                   lower.includes("mark as complete") ||
                   lower.includes("mark as done") ||
                   lower.includes("i'm done") ||
                   lower.includes("complete item");
        }),

        // Span inside button fallback
        ...Array.from(document.querySelectorAll('span')).filter(s => {
            const lower = (s.innerText || '').trim().toLowerCase();
            return lower.includes("mark as complete") || lower.includes("mark as done");
        }).map(s => s.closest('button')).filter(b => b)
    ];

    // Deduplicate
    const uniqueBtns = [...new Set(markCompleteBtns)];

    if (uniqueBtns.length > 0) {
        console.log("[Coursera Auto] Reading detected. Fast scrolling...");
        _idleLoopCount = 0; // Active work — reset idle

        // Scroll to bottom to trigger visibility
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 150);

        setTimeout(() => {
            let clicked = false;
            uniqueBtns.forEach(btn => {
                if (btn && !btn.disabled && btn.offsetParent !== null) {
                    btn.click();
                    clicked = true;
                    console.log("[Coursera Auto] Clicked 'Mark as Complete'");
                    showToast('Reading completed!', 'success');
                    incrementStat('readingsCompleted');
                } else {
                    console.log("[Coursera Auto] Found 'Mark as Complete' but it's disabled or hidden.");
                }
            });

            setTimeout(clickNext, clicked ? 300 : 600);
        }, 400); // Wait for button to become enabled after scroll
        return true;
    }
    return false;
}

function handleDialogues() {
    const dialogueBtns = Array.from(document.querySelectorAll('button, [role="button"]')).filter(b => {
        const text = (b.innerText || b.textContent || '').trim().toLowerCase();
        return (
            text === "continue" ||
            text === "i agree" ||
            text === "resume" ||
            text === "get started" ||
            text === "close" ||
            // Do NOT auto-click "submit" or "start" — too risky on quizzes
            text === "dismiss"
        );
    });

    if (dialogueBtns.length > 0) {
        const btn = dialogueBtns.find(b => !b.disabled && b.offsetParent !== null);
        if (btn) {
            console.log("[Coursera Auto] Dialogue detected:", btn.innerText.trim());
            btn.click();
            return true;
        }
    }
    return false;
}

function clickNext() {
    // --- FIX #1: Updated selectors for Coursera's current 2025 DOM ---
    const nextSelectors = [
        // Current Coursera selectors
        "button[data-testid='next-button']",
        "a[data-testid='next-button']",
        "button[data-testid='cds-button-next']",
        "[data-testid='sidebar-next-button']",
        // aria-label variants
        "button[aria-label='Next']",
        "button[aria-label='Go to next item']",
        "button[aria-label='Next item']",
        // Legacy class
        ".rc-NextButton",
        // Common navigation pattern
        "a[aria-label='Next']"
    ];

    for (const selector of nextSelectors) {
        const btn = document.querySelector(selector);
        if (btn && !btn.disabled && btn.offsetParent !== null) {
            if (isSensitiveItem(btn)) return;
            console.log("[Coursera Auto] Clicking Next button...", selector);
            _idleLoopCount = 0; // Reset — we found something to do
            btn.click();
            return;
        }
    }

    // Fallback: Find by text content "Next" in visible, enabled buttons
    const allBtns = document.querySelectorAll('button, a[role="button"]');
    for (const btn of allBtns) {
        const text = (btn.innerText || btn.textContent || '').trim();
        if (text === "Next" && !btn.disabled && btn.offsetParent !== null) {
            if (isSensitiveItem(btn)) return;
            console.log("[Coursera Auto] Clicking Next (by text)...");
            _idleLoopCount = 0; // Reset
            btn.click();
            return;
        }
    }

    // Nothing found — increment idle counter
    _idleLoopCount++;
    console.log(`[Coursera Auto] No Next button found. Idle count: ${_idleLoopCount}/${IDLE_THRESHOLD}`);

    if (_idleLoopCount >= IDLE_THRESHOLD) {
        autoCompleteStop();
    }
}

// --- Auto-Stop: Module/Course completed ---
function autoCompleteStop() {
    console.log("%c[Coursera Auto] ✅ All tasks completed! Auto-stopping.", "color: #28a745; font-size: 16px; font-weight: bold;");
    stopAutomation();
    chrome.storage.local.set({ isRunning: false });
    showToast('All tasks completed! 🎉', 'success');
    showCompletionBanner();
}

function showCompletionBanner() {
    // Remove existing banner if any
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
}

// --- FIX #2: Removed overly broad keywords like "assessment" and "quiz" ---
// Only stop on truly graded items to avoid false positives
function isSensitiveItem(btn) {
    const btnText = (btn.innerText || '').toLowerCase();
    const btnLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    const btnTitle = (btn.getAttribute('title') || '').toLowerCase();
    const combinedText = btnText + " " + btnLabel + " " + btnTitle;

    // Only stop on explicitly GRADED items
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
        console.log(`[Coursera Auto] STOPPING: Next item appears to be '${foundKeyword}'. Please complete manually.`);
        stopAutomation();
        chrome.storage.local.set({ isRunning: false });
        // Use a non-blocking notification instead of alert()
        showStopBanner(foundKeyword);
        return true;
    }
    return false;
}

function showStopBanner(reason) {
    // Remove existing banner if any
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

    // Auto-dismiss after 8 seconds
    banner.onclick = () => banner.remove();
    document.body.appendChild(banner);
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
}
