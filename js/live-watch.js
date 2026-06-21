import { currentProject, DEFAULT_PROJECT_ID, getCustomProjects, saveCustomProjects, loadProject } from "../graph.js";
import { parseMarkdownToProject, validateProjectData } from "./parser.js";
import { showToast } from "./utils.js";
import { IS_HOSTED } from "./env.js";

let isLiveWatching = false;
let liveWatchInterval = null;
let lastWatchText = "";
let watchFileHandle = null;
let watchDirectoryHandle = null;

const btnLiveWatch = document.getElementById("btn-live-watch");
const liveWatchText = document.getElementById("live-watch-text");

export async function toggleLiveWatch() {
    if (IS_HOSTED) {
        showToast("Live Watch is available in local mode only.");
        return;
    }
    if (isLiveWatching) {
        stopLiveWatch();
    } else {
        await startLiveWatch();
    }
}

export async function startLiveWatch(dirHandle = null) {
    if (IS_HOSTED) {
        showToast("Live Watch is available in local mode only.");
        return;
    }

    if (dirHandle) {
        watchDirectoryHandle = dirHandle;
        watchFileHandle = null;
        try {
            const fileHandle = await dirHandle.getFileHandle("architecture.md");
            const file = await fileHandle.getFile();
            lastWatchText = await file.text();
            showToast(`👁️ Watching local directory spec: ${dirHandle.name}/architecture.md`);
        } catch (err) {
            console.warn("Directory architecture.md not found or inaccessible on start:", err);
            watchFileHandle = null;
            lastWatchText = "";
            showToast(`👁️ Watching directory: ${dirHandle.name} (scaffolding...)`);
        }
    } else if (window.showOpenFilePicker) {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'ArcBench Markdown Spec (*.md)',
                    accept: { 'text/markdown': ['.md'] }
                }],
                excludeAcceptAllOption: true
            });
            watchFileHandle = handle;
            watchDirectoryHandle = null;
            const file = await handle.getFile();
            lastWatchText = await file.text();
            showToast(`👁️ Watching local file: ${file.name}`);
        } catch (err) {
            console.warn("File picker cancelled or failed, falling back to server polling:", err);
            watchFileHandle = null;
            watchDirectoryHandle = null;
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
            if (watchDirectoryHandle) {
                try {
                    const fileHandle = await watchDirectoryHandle.getFileHandle("architecture.md");
                    const file = await fileHandle.getFile();
                    currentText = await file.text();
                } catch (e) {
                    currentText = ""; // File may not exist yet or still writing
                }
            } else if (watchFileHandle) {
                const file = await watchFileHandle.getFile();
                currentText = await file.text();
            } else {
                let fetchUrl = "architecture.md";
                if (currentProject && currentProject.id === DEFAULT_PROJECT_ID) {
                    fetchUrl = "samples/demo.md";
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
    watchDirectoryHandle = null;
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
