import { currentProject, DEFAULT_PROJECT_ID, getCustomProjects, saveCustomProjects, loadProject } from "../graph.js";
import { parseMarkdownToProject, validateProjectData } from "./parser.js";
import { showToast } from "./utils.js";

let isLiveWatching = false;
let liveWatchInterval = null;
let lastWatchText = "";
let watchFileHandle = null;

const btnLiveWatch = document.getElementById("btn-live-watch");
const liveWatchText = document.getElementById("live-watch-text");

export async function toggleLiveWatch() {
    if (isLiveWatching) {
        stopLiveWatch();
    } else {
        await startLiveWatch();
    }
}

export async function startLiveWatch() {
    if (window.showOpenFilePicker) {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'ArcBench Markdown Spec (*.md)',
                    accept: { 'text/markdown': ['.md'] }
                }],
                excludeAcceptAllOption: true
            });
            watchFileHandle = handle;
            const file = await handle.getFile();
            lastWatchText = await file.text();
            showToast(`👁️ Watching local file: ${file.name}`);
        } catch (err) {
            console.warn("File picker cancelled or failed, falling back to server polling:", err);
            watchFileHandle = null;
            showToast("👁️ Watching server endpoint: architecture.md");
        }
    } else {
        showToast("👁️ Watching server endpoint: architecture.md");
    }

    isLiveWatching = true;
    if (btnLiveWatch) btnLiveWatch.classList.add("active");
    if (liveWatchText) liveWatchText.textContent = "Watching...";

    liveWatchInterval = setInterval(async () => {
        if (!isLiveWatching) return;
        try {
            let currentText = "";
            if (watchFileHandle) {
                const file = await watchFileHandle.getFile();
                currentText = await file.text();
            } else {
                let fetchUrl = "architecture.md";
                if (currentProject && currentProject.id === DEFAULT_PROJECT_ID) {
                    fetchUrl = "samples/trace.md";
                }
                const resp = await fetch(fetchUrl, { cache: "no-store" });
                if (resp.ok) {
                    currentText = await resp.text();
                } else {
                    throw new Error(`Failed HTTP poll: ${resp.status}`);
                }
            }

            if (currentText && currentText !== lastWatchText) {
                lastWatchText = currentText;
                reloadProjectFromWatch(currentText);
            }
        } catch (err) {
            console.error("Live Watch error:", err);
        }
    }, 1200);
}

export function stopLiveWatch() {
    isLiveWatching = false;
    if (liveWatchInterval) {
        clearInterval(liveWatchInterval);
        liveWatchInterval = null;
    }
    watchFileHandle = null;
    if (btnLiveWatch) btnLiveWatch.classList.remove("active");
    if (liveWatchText) liveWatchText.textContent = "Live Watch";
    showToast("Live Watch disabled.");
}

export function reloadProjectFromWatch(specText) {
    try {
        const parsed = parseMarkdownToProject(specText);
        validateProjectData(parsed);

        if (currentProject) {
            parsed.id = currentProject.id;
            
            if (currentProject.id !== DEFAULT_PROJECT_ID) {
                const custom = getCustomProjects();
                const idx = custom.findIndex(p => p.id === currentProject.id);
                if (idx !== -1) {
                    custom[idx] = parsed;
                    saveCustomProjects(custom);
                }
            }
        }

        loadProject(parsed);
        showToast("⚡ Spec file update detected! Architecture hot-reloaded.");
    } catch (err) {
        console.error("Auto-reload parse error:", err);
        showToast("⚠️ Spec update detected, but validation failed: " + err.message);
    }
}
