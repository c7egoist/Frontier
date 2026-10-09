// 📦 Entry point — starts the landscape editor once the document is ready and reports startup failures in the viewport.

import { StartEditor } from "./Editor.js";

/// out   None   [-]  starts the editor; on failure shows the message in the viewport banner
function Start() {
    try {
        StartEditor();
    } catch (Failure) {
        const Banner = document.getElementById("error-banner");
        if (Banner) {
            Banner.textContent = `The landscape editor failed to start.\n${Failure?.message ?? Failure}`;
            Banner.hidden = false;
        }
        console.error(Failure);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", Start);
} else {
    Start();
}
