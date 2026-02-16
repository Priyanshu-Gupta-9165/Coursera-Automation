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
    }
    // 2. Check for Readings & Dialogues
    else {
        handleReadingsAndDialogues();
    }
}

function handleReadingsAndDialogues() {
    // A. Reading "Mark as Complete" Buttons
    const markCompleteBtns = document.querySelectorAll("button[data-testid='mark-as-complete'], button[aria-label='Mark as complete']");
    if (markCompleteBtns.length > 0) {
        console.log("[Coursera Auto] Reading detected. Auto-scrolling...");
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(() => {
            markCompleteBtns.forEach(btn => {
                if (!btn.disabled) {
                    btn.click();
                    console.log("[Coursera Auto] Clicked 'Mark as Complete'");
                }
            });
            setTimeout(clickNext, 1000);
        }, 500);
        return;
    }

    // B. Dialogue / Interactive Text "Continue" Buttons
    // specific to Coursera's text interactions
    const continueButtons = Array.from(document.querySelectorAll('button')).filter(btn =>
        (btn.innerText.trim() === 'Continue' || btn.innerText.trim() === 'Next') && !btn.disabled
    );

    if (continueButtons.length > 0) {
        console.log("[Coursera Auto] Dialogue 'Continue' button detected.");
        continueButtons[0].click();
        return;
    }

    // C. Handle Popups (Rate Course, Honor Code)
    // "Maybe Later" or "Agree"
    const popupButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
        const text = btn.innerText.trim().toLowerCase();
        return text === 'maybe later' || text === 'submit' || text === 'agree';
    });

    if (popupButtons.length > 0) {
        // Check if it's inside a modal
        const modal = popupButtons[0].closest('[role="dialog"], .modal');
        if (modal) {
            console.log("[Coursera Auto] Dismissing Popup...");
            popupButtons[0].click();
            return;
        }
    }

    // D. If nothing specific found, verify if we are at the end of a reading via text search
    // sometimes buttons don't have standard attributes
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
        if (btn.innerText.includes("Mark as complete") && !btn.disabled) {
            console.log("[Coursera Auto] Found 'Mark as complete' by text.");
            btn.click();
            setTimeout(clickNext, 1000);
            return;
        }
    }

    // Finally, try Next if we seem idle
    clickNext();
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

    // Fallback: Text content "Next" (strict match)
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
        if (btn.innerText.trim() === "Next") {
            // Avoid clicking "Next" in pagination or other non-navigation contexts if possible
            // But for now, this is a reasonable fallback
            console.log("[Coursera Auto] Clicking Next (by text)...");
            btn.click();
            return;
        }
    }
}
