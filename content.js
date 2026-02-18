// Content script for Coursera Automation

let isRunning = false;
let automationInterval = null;

const CONFIG = {
    scrollSpeed: 50, // ms
    clickDelay: 100, // ms
};

let currentMode = 'video'; // 'video' or 'reading'

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
        startAutomation();
    } else if (request.action === "stop") {
        stopAutomation();
    }
});

function startAutomation() {
    if (isRunning) {
        // Just update mode if already running
        return;
    }
    isRunning = true;
    console.log(`%c[Coursera Auto] Started (${currentMode}) ⚡`, "color: green; font-size: 16px; font-weight: bold;");

    // Check repeatedly for content
    automationInterval = setInterval(runAutomationLoop, 1000);
    runAutomationLoop(); // Run immediately once
}

function stopAutomation() {
    isRunning = false;
    if (automationInterval) clearInterval(automationInterval);
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

function runVideoLogic() {
    // 1. Check for Video
    const video = document.querySelector('video');
    if (video) {
        if (!video.ended && video.duration > 0) {
            console.log("[Coursera Auto] Video detected. Seeking to end...");
            try {
                video.playbackRate = 16;
                video.muted = true;
                video.currentTime = video.duration - 0.5;
                video.play();
            } catch (e) {
                console.error("Error manipulating video:", e);
            }
        } else if (video.ended) {
            console.log("[Coursera Auto] Video finished.");
            clickNext();
        }
    } else {
        // Fallback to text completion if no video found
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
    // 1. More robust selectors for "Mark as Complete"
    const markCompleteBtns = [
        ...document.querySelectorAll("button[data-testid='mark-as-complete']"),
        ...document.querySelectorAll("button[aria-label='Mark as complete']"),
        ...document.querySelectorAll("button[aria-label='Mark as done']"),
        ...Array.from(document.querySelectorAll('button')).filter(b => {
            const lower = b.innerText.trim().toLowerCase();
            return lower.includes("mark as complete") || lower.includes("mark as done");
        }),
        // Sometimes it's a span inside a button
        ...Array.from(document.querySelectorAll('span')).filter(s => {
            const lower = s.innerText.trim().toLowerCase();
            return (lower.includes("mark as complete") || lower.includes("mark as done"));
        }).map(s => s.closest('button')).filter(b => b)
    ];

    if (markCompleteBtns.length > 0) {
        console.log("[Coursera Auto] Reading detected. Fast scrolling...");

        // Scroll to bottom vigorously
        window.scrollTo(0, document.body.scrollHeight);

        // Sometimes needed to trigger visibility
        setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100);

        setTimeout(() => {
            let clicked = false;
            markCompleteBtns.forEach(btn => {
                if (!btn.disabled && btn.offsetParent !== null) { // Check visibility
                    btn.click();
                    clicked = true;
                    console.log("[Coursera Auto] Clicked 'Mark as Complete'");
                } else {
                    console.log("[Coursera Auto] Found 'Mark as Complete' but it's disabled or hidden.");
                    // Should we wait? Maybe it enables after scroll.
                }
            });

            // Only move to next if we actually clicked or if button wasn't found/enabled after wait
            setTimeout(clickNext, clicked ? 200 : 500); // Wait longer if we didn't click
        }, 300); // Wait 300ms for button to enable
        return true;
    }
    return false;
}

function handleDialogues() {
    const dialogueBtns = Array.from(document.querySelectorAll('button')).filter(b => {
        const text = b.innerText.trim().toLowerCase();
        return (text === "continue" || text === "i agree" || text === "submit" || text === "resume" || text === "start");
    });

    if (dialogueBtns.length > 0) {
        const btn = dialogueBtns.find(b => !b.disabled && b.offsetParent !== null); // Visible and enabled
        if (btn) {
            console.log("[Coursera Auto] Dialogue detected.");
            btn.click();
            return true;
        }
    }
    return false;
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
            // Check if it's a graded assessment
            const btnText = btn.innerText.toLowerCase();
            const btnLabel = (btn.getAttribute('aria-label') || "").toLowerCase();
            const nextItemTitle = (btn.getAttribute('title') || "").toLowerCase(); // Sometimes title has info

            // Keywords to avoid
            const sensitiveKeywords = [
                "graded assessment",
                "graded assignment",
                "graded quiz",
                "programming assignment",
                "peer-graded",
                "exam",
                "final project",
                "assessment",
                "quiz"
            ];

            // Should verify if these keywords are present in the *next item* name often found in these buttons
            const combinedText = btnText + " " + btnLabel + " " + nextItemTitle;

            // Check if ANY sensitive keyword is in the next button text
            const foundKeyword = sensitiveKeywords.find(kw => combinedText.includes(kw));

            if (foundKeyword) {
                console.log(`[Coursera Auto] STOPPING: Next item detected as '${foundKeyword}'.`);
                // Stop automation
                stopAutomation();
                alert(`Coursera Auto: Stopped at '${foundKeyword}'. Please complete this manually.`);
                return;
            }

            console.log("[Coursera Auto] clicking Next button...");
            btn.click();
            return;
        }
    }

    // Fallback: Text content
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
        if (btn.innerText.trim() === "Next") {
            // Check parents or nearby text for "Graded" to be safe? 
            // Start simple
            console.log("[Coursera Auto] Clicking Next (by text)...");
            btn.click();
            return;
        }
    }
}
