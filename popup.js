document.addEventListener('DOMContentLoaded', function () {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusSpan = document.getElementById('status');

    // Load saved state
    chrome.storage.local.get(['isRunning'], function (result) {
        if (result.isRunning) {
            setRunningState(true);
        } else {
            setRunningState(false);
        }
    });

    startBtn.addEventListener('click', function () {
        chrome.storage.local.set({ isRunning: true });
        setRunningState(true);
        sendMessageToContentScript({ action: "start" });
    });

    stopBtn.addEventListener('click', function () {
        chrome.storage.local.set({ isRunning: false });
        setRunningState(false);
        sendMessageToContentScript({ action: "stop" });
    });

    document.getElementById('aboutBtn').addEventListener('click', function () {
        window.location.href = 'about.html';
    });

    function setRunningState(isRunning) {
        if (isRunning) {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            statusSpan.textContent = 'Running... ⚡';
            statusSpan.style.color = '#28a745';
        } else {
            startBtn.style.display = 'block';
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
