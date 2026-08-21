/**
 * Coursera Auto — Popup Controller v6.1
 * Preserves all chrome.storage keys:
 *   isRunning, mode, sessionStartTime, modeSelected, videosCompleted, courseProgress
 */
document.addEventListener('DOMContentLoaded', function () {

    /* ── DOM refs ── */
    const startBtn       = document.getElementById('startBtn');
    const modeButtons    = document.getElementById('modeButtons');
    const videoBtn       = document.getElementById('videoBtn');
    const readingBtn     = document.getElementById('readingBtn');
    const stopBtn        = document.getElementById('stopBtn');

    const statusDot      = document.getElementById('statusDot');
    const statusLabel    = document.getElementById('statusLabelText');
    const workerDot      = document.getElementById('workerDot');
    const workerLabel    = document.getElementById('workerLabelText');

    const videosCompletedVal = document.getElementById('videosCompletedVal');
    const videoStatusLabel   = document.getElementById('videoStatusLabel');

    const timerVal       = document.getElementById('timerVal');
    const sessionInd     = document.getElementById('sessionIndicator');
    const aboutBtn       = document.getElementById('aboutBtn');

    let timerInterval = null;

    /* ── Video Completed Count & Stats ── */
    function setVideoCount(count) {
        if (videosCompletedVal) {
            videosCompletedVal.textContent = typeof count === 'number' ? count : 0;
        }
    }

    function refreshStats() {
        chrome.storage.local.get(['videosCompleted'], function (r) {
            const count = typeof r.videosCompleted === 'number' ? r.videosCompleted : 0;
            setVideoCount(count);
        });
    }
    refreshStats();

    /* ── Timer (HH:MM:SS, drift-free) ── */
    function fmt(ms) {
        if (!ms || ms < 0) return '00:00:00';
        const t = Math.floor(ms / 1000);
        const h = Math.floor(t / 3600);
        const m = Math.floor((t % 3600) / 60);
        const s = t % 60;
        return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
    }

    function startTimer(t0) {
        if (timerInterval) clearInterval(timerInterval);
        const tick = () => { timerVal.textContent = fmt(Date.now() - t0); };
        tick();
        timerInterval = setInterval(tick, 1000);
    }

    function stopTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = null;
        timerVal.textContent = '00:00:00';
    }

    /* ── UI States ── */
    function setIdle() {
        startBtn.style.display = 'flex';
        modeButtons.style.display = 'none';
        stopBtn.style.display = 'none';
        statusDot.className  = 'status-dot dot-idle';
        statusLabel.textContent = 'Idle';
        workerDot.className  = 'status-dot dot-inactive';
        workerLabel.textContent = 'Inactive';
        sessionInd.style.opacity = '.55';
    }

    function setModeSelect() {
        startBtn.style.display = 'none';
        modeButtons.style.display = 'flex';
        stopBtn.style.display = 'none';
        statusDot.className  = 'status-dot dot-idle';
        statusLabel.textContent = 'Idle';
        workerDot.className  = 'status-dot dot-inactive';
        workerLabel.textContent = 'Inactive';
    }

    function setRunning() {
        startBtn.style.display = 'none';
        modeButtons.style.display = 'none';
        stopBtn.style.display = 'flex';
        statusDot.className  = 'status-dot dot-running';
        statusLabel.textContent = 'Running';
        workerDot.className  = 'status-dot dot-active';
        workerLabel.textContent = 'Active';
        sessionInd.style.opacity = '1';
    }

    /* ── Restore state ── */
    chrome.storage.local.get(
        ['isRunning', 'mode', 'sessionStartTime', 'modeSelected', 'videosCompleted'],
        function (r) {
            setVideoCount(typeof r.videosCompleted === 'number' ? r.videosCompleted : 0);

            if (r.isRunning) {
                setRunning();
                startTimer(r.sessionStartTime || Date.now());
                if (!r.sessionStartTime) {
                    chrome.storage.local.set({ sessionStartTime: Date.now() });
                }
            } else if (r.modeSelected) {
                setModeSelect();
                stopTimer();
            } else {
                setIdle();
                stopTimer();
            }
        }
    );

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshStats();
    });

    /* ── Buttons ── */
    startBtn.addEventListener('click', () => {
        chrome.storage.local.set({ modeSelected: true });
        setModeSelect();
    });

    videoBtn.addEventListener('click', () => {
        const now = Date.now();
        chrome.storage.local.set({ isRunning: true, mode: 'video', sessionStartTime: now, modeSelected: false });
        setRunning();
        startTimer(now);
        sendMsg({ action: 'start', mode: 'video' });
    });

    readingBtn.addEventListener('click', () => {
        const now = Date.now();
        chrome.storage.local.set({ isRunning: true, mode: 'reading', sessionStartTime: now, modeSelected: false });
        setRunning();
        startTimer(now);
        sendMsg({ action: 'start', mode: 'reading' });
    });

    stopBtn.addEventListener('click', () => {
        chrome.storage.local.set({ isRunning: false, sessionStartTime: null, modeSelected: false });
        setIdle();
        stopTimer();
        sendMsg({ action: 'stop' });
    });

    aboutBtn.addEventListener('click', () => {
        window.location.href = 'about.html';
    });

    /* ── Content script bridge ── */
    function sendMsg(msg) {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            if (!tabs || !tabs.length) return;
            const tab = tabs[0];
            if (!tab.url || !tab.url.includes('coursera.org')) {
                statusDot.className = 'status-dot dot-inactive';
                statusLabel.textContent = 'Open Coursera!';
                return;
            }
            chrome.tabs.sendMessage(tab.id, msg, resp => {
                if (chrome.runtime.lastError) {
                    chrome.scripting.executeScript(
                        { target: { tabId: tab.id }, files: ['content.js'] },
                        () => {
                            if (!chrome.runtime.lastError) {
                                setTimeout(() => chrome.tabs.sendMessage(tab.id, msg), 400);
                            }
                        }
                    );
                }
            });
        });
    }

    /* ── Poll video stats periodically ── */
    setInterval(() => { if (!document.hidden) refreshStats(); }, 2000);
});
