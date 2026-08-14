document.addEventListener('DOMContentLoaded', function () {
    const startBtn = document.getElementById('startBtn');
    const readingBtn = document.getElementById('readingBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusSpan = document.getElementById('status');
    const themeToggle = document.getElementById('themeToggle');
    const videoCountEl = document.getElementById('videoCount');
    const readingCountEl = document.getElementById('readingCount');

    // --- Dark Mode (Fancy Toggle — checkbox) ---
    chrome.storage.local.get(['darkMode'], function (result) {
        if (result.darkMode) {
            document.body.classList.add('dark-mode');
            themeToggle.checked = true;
        }
    });

    themeToggle.addEventListener('change', function () {
        const isDark = themeToggle.checked;
        document.body.classList.toggle('dark-mode', isDark);
        chrome.storage.local.set({ darkMode: isDark });
    });

    // --- Session Stats ---
    function updateStats() {
        chrome.storage.local.get(['videosCompleted', 'readingsCompleted'], function (result) {
            videoCountEl.textContent = result.videosCompleted || 0;
            readingCountEl.textContent = result.readingsCompleted || 0;
        });
    }
    updateStats();

    // Refresh stats when popup regains focus (in case content script updated counts)
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) updateStats();
    });

    // --- Load saved state ---
    chrome.storage.local.get(['isRunning', 'mode'], function (result) {
        if (result.isRunning) {
            setRunningState(true, result.mode || 'video');
        } else {
            setRunningState(false);
        }
    });

    startBtn.addEventListener('click', function () {
        chrome.storage.local.set({ isRunning: true, mode: 'video' });
        setRunningState(true, 'video');
        sendMessageToContentScript({ action: "start", mode: "video" });
    });

    readingBtn.addEventListener('click', function () {
        chrome.storage.local.set({ isRunning: true, mode: 'reading' });
        setRunningState(true, 'reading');
        sendMessageToContentScript({ action: "start", mode: "reading" });
    });

    stopBtn.addEventListener('click', function () {
        chrome.storage.local.set({ isRunning: false });
        setRunningState(false);
        sendMessageToContentScript({ action: "stop" });
    });

    document.getElementById('aboutBtn').addEventListener('click', function () {
        window.location.href = 'about.html';
    });

    function setRunningState(isRunning, mode) {
        if (isRunning) {
            startBtn.style.display = 'none';
            readingBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            if (mode === 'reading') {
                statusSpan.textContent = 'Reading Mode 📖';
                statusSpan.style.color = '#0056D2';
            } else {
                statusSpan.textContent = 'Running... ⚡';
                statusSpan.style.color = '#28a745';
            }
        } else {
            startBtn.style.display = 'block';
            readingBtn.style.display = 'block';
            stopBtn.style.display = 'none';
            statusSpan.textContent = 'Idle ☾';
            statusSpan.style.color = '';
        }
    }

    // --- FIX #3: Proper error handling for sendMessage ---
    function sendMessageToContentScript(message) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs || tabs.length === 0) {
                console.warn("[Coursera Auto Popup] No active tab found.");
                return;
            }

            const tab = tabs[0];

            // Only send to Coursera pages
            if (!tab.url || !tab.url.includes("coursera.org")) {
                console.warn("[Coursera Auto Popup] Not on a Coursera page. Open a Coursera course first.");
                statusSpan.textContent = "⚠️ Open Coursera first!";
                statusSpan.style.color = "#e67e22";
                return;
            }

            chrome.tabs.sendMessage(tab.id, message, function (response) {
                // Handle case where content script isn't injected yet
                if (chrome.runtime.lastError) {
                    console.warn("[Coursera Auto Popup] Content script not ready:", chrome.runtime.lastError.message);
                    // Try injecting the content script programmatically
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ["content.js"]
                    }, function () {
                        if (chrome.runtime.lastError) {
                            console.error("[Coursera Auto Popup] Script injection failed:", chrome.runtime.lastError.message);
                            return;
                        }
                        // Retry message after injection
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tab.id, message);
                        }, 500);
                    });
                }
            });
        });
    }
});
