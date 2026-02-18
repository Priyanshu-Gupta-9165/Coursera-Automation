async function checkForUpdates() {
    try {
        // current installed version
        const currentVersion = chrome.runtime.getManifest().version;

        // fetch version from github
        const response = await fetch(
            "https://raw.githubusercontent.com/Priyanshu-Gupta-9165/Coursera-Automation/main/version.json"
        );

        const data = await response.json();
        const latestVersion = data.version;

        // compare
        if (currentVersion !== latestVersion) {
            // Create a custom notification in the popup or use alert
            const updateContainer = document.createElement('div');
            updateContainer.style.cssText = `
                background-color: #d4edda;
                color: #155724;
                padding: 10px;
                margin-bottom: 15px;
                border: 1px solid #c3e6cb;
                border-radius: 5px;
                text-align: center;
                font-size: 13px;
                cursor: pointer;
             `;
            updateContainer.innerHTML = `
                <strong>🚀 Update Available (v${latestVersion})</strong><br>
                Click here to update
             `;

            updateContainer.onclick = () => {
                chrome.tabs.create({ url: data.update_url });
            };

            // Insert before the status box
            const statusBox = document.querySelector('.status-box');
            if (statusBox) {
                statusBox.parentNode.insertBefore(updateContainer, statusBox);
            }
        }

    } catch (error) {
        console.log("Update check failed", error);
    }
}

// run when extension opens
checkForUpdates();
