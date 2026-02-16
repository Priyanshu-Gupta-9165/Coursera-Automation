// Content script for Coursera Automation

let isRunning = false;
let automationInterval = null;

// Initialize state from storage
chrome.storage.local.get(['isRunning'], function (result) {
    if (result.isRunning) {
        startAutomation();
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === "start") {
        startAutomation();
    } else if (request.action === "stop") {
        stopAutomation();
    }
});

function startAutomation() {
    if (isRunning) return;
    isRunning = true;
    console.log("%c[Coursera Auto] Started via Extension ⚡", "color: green; font-size: 16px; font-weight: bold;");

    // Check repeatedly for content
    automationInterval = setInterval(runAutomationLoop, 2000);
    runAutomationLoop(); // Run immediately once
}

function stopAutomation() {
    isRunning = false;
    if (automationInterval) clearInterval(automationInterval);
    console.log("%c[Coursera Auto] Stopped ◼", "color: red; font-size: 16px; font-weight: bold;");
}

function runAutomationLoop() {
    if (!isRunning) return;

    // 1. Check for Video
    const video = document.querySelector('video');
    if (video) {
        if (!video.ended && video.duration > 0) {
            console.log("[Coursera Auto] Video detected. Seeking to end...");
            try {
                video.playbackRate = 16; // Just in case
                video.muted = true;
                video.currentTime = video.duration - 0.5; // Seek to almost end
                video.play();
            } catch (e) {
                console.error("Error manipulating video:", e);
            }
        } else if (video.ended) {
            console.log("[Coursera Auto] Video finished.");
            // Try to find next button
            clickNext();
        }
    }
    // 2. Check for "Mark as Complete" (Readings)
    else {
        const markCompleteBtns = document.querySelectorAll("button[data-testid='mark-as-complete'], button[aria-label='Mark as complete']");
        if (markCompleteBtns.length > 0) {
            console.log("[Coursera Auto] Reading detected. Auto-scrolling...");
            // Fake scroll
            window.scrollTo(0, document.body.scrollHeight);

            setTimeout(() => {
                markCompleteBtns.forEach(btn => {
                    if (!btn.disabled) {
                        btn.click();
                        console.log("[Coursera Auto] Clicked 'Mark as Complete'");
                    }
                });
                // After marking complete, try next
                setTimeout(clickNext, 1000);
            }, 500);
        } else {
            // Just try next if nothing else matches (could be quiz cover page or already completed)
            clickNext();
        }
    }
}

function clickNext() {
    const nextSelectors = [
        "button[data-testid='next-button']",
        "a[data-testid='next-button']",
        "button[aria-label='Next']",
        "button[aria-label='Go to next item']",
        ".rc-NextButton"
    ];

    for (const selector of nextSelectors) {
        const btn = document.querySelector(selector);
        if (btn && !btn.disabled) {
            console.log("[Coursera Auto] clicking Next button...");
            btn.click();
            return;
        }
    }

    // Fallback: Text content
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
        if (btn.innerText.trim() === "Next") {
            console.log("[Coursera Auto] Clicking Next (by text)...");
            btn.click();
            return;
        }
    }
}
