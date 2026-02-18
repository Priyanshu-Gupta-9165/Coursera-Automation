document.addEventListener('DOMContentLoaded', function () {
    const startBtn = document.getElementById('startBtn');
    const readingBtn = document.getElementById('readingBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusSpan = document.getElementById('status');

    // Load saved state
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
            statusSpan.style.color = '#666';
        }
    }

    function sendMessageToContentScript(message) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, message);
            }
        });
    }
});
