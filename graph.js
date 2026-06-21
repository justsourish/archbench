// ============================================================
// Architecture Workbench (ArchBench)
//
// Not just "what exists" — shows "how it works."
// Layered architecture + interactive flow playback.
// ============================================================

import { AI_PROMPTS } from "./js/constants.js";
import { showToast, copyToClipboard, downloadFile, renderMarkdownToHtml } from "./js/utils.js";
import { parseMarkdownToProject, exportProjectToMarkdown, validateProjectData } from "./js/parser.js";
import { calculateArchitectureQualityScore, calculateDatabaseDependencyScore } from "./js/metrics.js";
import { generateArchitectureHealthReport } from "./js/reports/health-engine.js";
import { generateExecutionLogJSON, generateExecutionLogMarkdown, generateKnowledgePackJSON, generateKnowledgePackMarkdown } from "./js/reports/generators.js";
import { toggleLiveWatch, startLiveWatch } from "./js/live-watch.js";
import { initTerminalOnce } from "./js/terminal.js";
import { localHistoryCache, initDB, reloadHistoryCache, saveAuditRun, deleteAuditRun, clearProjectHistoryFromDB } from "./js/db.js";
import { initAIEngine, populateAIGrid } from "./js/ai-engine.js";
import { updateArchitectureHistoryUI } from "./js/history-ui.js";
import { initBatchRunner, populateBatchChecklist, stopBatchRun, generateBatchLogMarkdown } from "./js/batch-runner.js";
import { initFlowEngine, startFlow, exitFlow, stopAutoPlay, renderFlowStep, activeFlow, activeStep, setActiveFlow, setActiveStep } from "./js/flow-engine.js";
import { initCanvasRenderer, buildNode, measureNodes, drawConnections, panToNode, updateMinimap, fitToView, clearNodeState, nodeEls } from "./js/canvas-renderer.js";
import { APP_ENV, IS_HOSTED } from "./js/env.js";

export { localHistoryCache, initDB, reloadHistoryCache, saveAuditRun, deleteAuditRun, clearProjectHistoryFromDB, updateArchitectureHistoryUI };
export { initBatchRunner, populateBatchChecklist, stopBatchRun, generateBatchLogMarkdown };
export { initFlowEngine, startFlow, exitFlow, stopAutoPlay, renderFlowStep, activeFlow, activeStep, setActiveFlow, setActiveStep };
export { drawConnections, panToNode, nodeEls };

    // ─── Layer Zones & Boundaries (Project-specific layout state) ────────────────

    let LAYERS = [];
    let TRUST_BOUNDARY = null;
    export let trustEl = null;

    const DEFAULT_LAYERS = [
        { id: "entry",    label: "Entry Points — User-Facing Applications",  y: 150,  h: 420,  cls: "entry" },
        { id: "services", label: "Core Services — Processing & Verification", y: 640,  h: 480,  cls: "services" },
        { id: "infra",    label: "Infrastructure — Data, Analytics & Identity", y: 1190, h: 450,  cls: "infra" },
        { id: "future",   label: "Roadmap — Future Vision",                    y: 1710, h: 380,  cls: "future" },
    ];

    const DEFAULT_TRUST_BOUNDARY = {
        x: 1000, y: 670,
        w: 1120, h: 950,
        label: "TRUST BOUNDARY (SECURE BACKEND)",
        note: "Decryption, persistence & intelligence execute inside this zone"
    };

    // ─── Project Loading (Dynamic configuration from window.ARCHBENCH_PROJECT_MD or window.ARCHBENCH_PROJECT) ───
    export let project = { title: "Untitled Project", version: "1.0", nodes: [], connections: [], flows: [] };
    if (window.ARCHBENCH_PROJECT_MD) {
        try {
            project = parseMarkdownToProject(window.ARCHBENCH_PROJECT_MD);
            project.id = "demo-sample";
        } catch (e) {
            console.error("Failed to parse window.ARCHBENCH_PROJECT_MD:", e);
        }
    } else if (window.ARCHBENCH_PROJECT) {
        project = window.ARCHBENCH_PROJECT;
    }
    export let currentProject = null;
    export let NODES = [];
    export let CONNECTIONS = [];
    export let FLOWS = [];

    // ─── DOM References ─────────────────────────────────────────

    const viewport    = document.getElementById("viewport");
    const canvas      = document.getElementById("canvas");
    const svgLayer    = document.getElementById("connections-svg");
    const zoomLabel   = document.getElementById("zoom-label");
    const helpHint    = document.getElementById("help-hint");
    const flowBarBtns = document.getElementById("flow-bar-buttons");
    const flowPanel   = document.getElementById("flow-playback");
    const fpHeader    = document.getElementById("fp-header");
    const fpTitle     = document.getElementById("fp-title");
    const fpSubtitle  = document.getElementById("fp-subtitle");
    const fpProgress  = document.getElementById("fp-progress-fill");
    const fpBadge     = document.getElementById("fp-step-badge");
    const fpLabel     = document.getElementById("fp-step-label");
    const fpDetail    = document.getElementById("fp-step-detail");
    const fpData      = document.getElementById("fp-step-data");
    const fpCounter   = document.getElementById("fp-step-counter");
    const fpPrev      = document.getElementById("fp-prev");
    const fpNext      = document.getElementById("fp-next");
    const fpPlay      = document.getElementById("fp-play");
    const fpClose     = document.getElementById("fp-close");
    const fpMinimize  = document.getElementById("fp-minimize");
    const fpDock      = document.getElementById("fp-dock");

    // Project System DOM Bindings
    const btnProjectSelector = document.getElementById("btn-project-selector");
    const btnProjectNew      = document.getElementById("btn-project-new");
    const btnProjectImport   = document.getElementById("btn-project-import");
    const projectDropdown    = document.getElementById("project-dropdown");
    const projectList        = document.getElementById("project-list");
    const currentProjectTitle = document.getElementById("current-project-title");
    
    const dropdownBtnEdit    = document.getElementById("dropdown-btn-edit");
    const dropdownBtnExport  = document.getElementById("dropdown-btn-export");
    
    const projectFileInput   = document.getElementById("project-file-input");
    
    const projectModal       = document.getElementById("project-modal");
    const projectModalTitle  = document.getElementById("project-modal-title");
    const projectModalClose  = document.getElementById("project-modal-close");
    const projectTitleInput  = document.getElementById("project-title-input");
    const projectVersionInput = document.getElementById("project-version-input");
    const projectJsonInput   = document.getElementById("project-json-input");
    const projectModalCancel = document.getElementById("project-modal-cancel");
    const projectModalSave   = document.getElementById("project-modal-save");

    // ─── State ──────────────────────────────────────────────────

    // scale, pan, nodeEls, and nodeData state moved to js/canvas-renderer.js

    // Flow state is now managed inside js/flow-engine.js

    export let unifiedBatchLog = null;
    export function setUnifiedBatchLog(val) {
        unifiedBatchLog = val;
    }

    // Panel Float/Drag/Dock State
    let panelPosition = null; // { x, y }
    let isPanelDragging = false;
    let dragStartX, dragStartY, dragStartLeft, dragStartTop;
    let currentDockState = "right"; // float, left, right
    let isMinimized = false;



    // ─── Canvas Renderer ─────────────────────────────────────────
    // Canvas rendering, viewport interactions, zoom/pan transforms, and minimap logic moved to js/canvas-renderer.js


    // ─────────────────────────────────────────────────────────────
    // Flow Simulator playback engine moved to js/flow-engine.js

    // Flow control event listeners


    // Draggable header logic
    fpHeader.addEventListener("mousedown", startDragPanel);
    fpHeader.addEventListener("touchstart", startDragPanel, { passive: false });

    function startDragPanel(e) {
        // Ignore if clicking on interactive control buttons
        if (e.target.closest(".fp-header-actions") || e.target.closest("button")) return;
        if (currentDockState !== "float") return; // cannot drag if docked

        e.preventDefault();
        isPanelDragging = true;
        flowPanel.classList.add("is-dragging");

        const clientX = e.type.startsWith("touch") ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.startsWith("touch") ? e.touches[0].clientY : e.clientY;

        dragStartX = clientX;
        dragStartY = clientY;

        const rect = flowPanel.getBoundingClientRect();
        dragStartLeft = rect.left;
        dragStartTop = rect.top;

        const onDragMove = ev => {
            if (!isPanelDragging) return;
            const currentX = ev.type.startsWith("touch") ? ev.touches[0].clientX : ev.clientX;
            const currentY = ev.type.startsWith("touch") ? ev.touches[0].clientY : ev.clientY;

            const dx = currentX - dragStartX;
            const dy = currentY - dragStartY;

            const targetX = dragStartLeft + dx;
            const targetY = dragStartTop + dy;

            const w = flowPanel.offsetWidth;
            const h = flowPanel.offsetHeight;

            // Restrict panel coordinates completely within the visible viewport bounds
            panelPosition = {
                x: Math.max(0, Math.min(window.innerWidth - w, targetX)),
                y: Math.max(0, Math.min(window.innerHeight - h, targetY))
            };

            flowPanel.style.left = panelPosition.x + "px";
            flowPanel.style.top = panelPosition.y + "px";
        };

        const onDragEnd = () => {
            isPanelDragging = false;
            flowPanel.classList.remove("is-dragging");
            document.removeEventListener("mousemove", onDragMove);
            document.removeEventListener("mouseup", onDragEnd);
            document.removeEventListener("touchmove", onDragMove);
            document.removeEventListener("touchend", onDragEnd);
        };

        document.addEventListener("mousemove", onDragMove);
        document.addEventListener("mouseup", onDragEnd);
        document.addEventListener("touchmove", onDragMove, { passive: false });
        document.addEventListener("touchend", onDragEnd);
    }

    // Minimize Control panel
    fpMinimize.addEventListener("click", () => {
        isMinimized = !isMinimized;
        flowPanel.classList.toggle("collapsed", isMinimized);

        const minIcon = fpMinimize.querySelector(".minimize-icon");
        const restoreIcon = fpMinimize.querySelector(".restore-icon");

        if (isMinimized) {
            if (minIcon) minIcon.style.display = "none";
            if (restoreIcon) restoreIcon.style.display = "block";
            fpMinimize.setAttribute("title", "Expand Sidebar");
        } else {
            if (minIcon) minIcon.style.display = "block";
            if (restoreIcon) restoreIcon.style.display = "none";
            fpMinimize.setAttribute("title", "Collapse Sidebar");
        }

        setTimeout(() => { updateMinimap(); }, 350);
    });

    // Cycle Sidebar Dock position: Right -> Left
    fpDock.addEventListener("click", () => {
        if (currentDockState === "right") {
            currentDockState = "left";
            flowPanel.classList.add("dock-left");
            flowPanel.classList.remove("dock-right");
        } else {
            currentDockState = "right";
            flowPanel.classList.add("dock-right");
            flowPanel.classList.remove("dock-left");
        }
        setTimeout(() => { updateMinimap(); }, 350);
    });

    // Adjust floating panel position when browser scales or resizes
    window.addEventListener("resize", () => {
        if (activeFlow && currentDockState === "float" && panelPosition) {
            const w = flowPanel.offsetWidth;
            const h = flowPanel.offsetHeight;
            panelPosition.x = Math.max(0, Math.min(window.innerWidth - w, panelPosition.x));
            panelPosition.y = Math.max(0, Math.min(window.innerHeight - h, panelPosition.y));
            flowPanel.style.left = panelPosition.x + "px";
            flowPanel.style.top = panelPosition.y + "px";
        }
    });

    // ─── ARCHITECTURE IDE LOGS & AI EXPORTS ──────────────────────

    const btnIde = document.getElementById("btn-ide");
    const btnLiveWatch = document.getElementById("btn-live-watch");
    const btnTermToggle = document.getElementById("btn-term-toggle");
    const tabBtnSimulator = document.getElementById("tab-btn-simulator");
    const tabBtnLog = document.getElementById("tab-btn-log");
    const tabBtnAi = document.getElementById("tab-btn-ai");
    const tabBtnPack = document.getElementById("tab-btn-pack");
    const tabBtnBatch = document.getElementById("tab-btn-batch");
    const tabBtnHealth = document.getElementById("tab-btn-health");
    const tabBtnHistory = document.getElementById("tab-btn-history");
    const tabBtnTerminal = document.getElementById("tab-btn-terminal");

    const panelSimulator = document.getElementById("panel-simulator");
    const panelLog = document.getElementById("panel-log");
    const panelAi = document.getElementById("panel-ai");
    const panelPack = document.getElementById("panel-pack");
    const panelBatch = document.getElementById("panel-batch");
    const panelHealth = document.getElementById("panel-health");
    const panelHistory = document.getElementById("panel-history");
    const panelTerminal = document.getElementById("panel-terminal");
    const terminalContainer = document.getElementById("terminal-container");

    const batchChecklist = document.getElementById("batch-checklist");
    const btnStartBatch = document.getElementById("btn-start-batch");
    const btnStopBatch = document.getElementById("btn-stop-batch");
    const healthReportContent = document.getElementById("health-report-content");
    const historyReportContent = document.getElementById("history-report-content");

    const logCodePreview = document.getElementById("log-code-preview");
    
    // AI Chat Panel selectors
    const btnAiSettings = document.getElementById("btn-ai-settings");
    const btnClearChat = document.getElementById("btn-clear-chat");
    const aiChatHistory = document.getElementById("ai-chat-history");
    const aiQuickTemplates = document.getElementById("ai-quick-templates");
    const aiChatInput = document.getElementById("ai-chat-input");
    const btnAiSend = document.getElementById("btn-ai-send");
    const aiSettingsDrawer = document.getElementById("ai-settings-drawer");
    const btnCloseSettings = document.getElementById("btn-close-settings");
    const aiProviderSelect = document.getElementById("ai-provider-select");
    const btnSaveSettings = document.getElementById("btn-save-settings");
    const aiInjectContext = document.getElementById("ai-inject-context");

    // Provider config divs
    const sectionGemini = document.getElementById("section-gemini");
    const sectionOpenai = document.getElementById("section-openai");
    const sectionOllama = document.getElementById("section-ollama");

    // Config inputs
    const inputGeminiKey = document.getElementById("ai-gemini-key");
    const inputGeminiModel = document.getElementById("ai-gemini-model");
    const inputGeminiUrl = document.getElementById("ai-gemini-url");
    const inputOpenaiKey = document.getElementById("ai-openai-key");
    const inputOpenaiModel = document.getElementById("ai-openai-model");
    const inputOpenaiUrl = document.getElementById("ai-openai-url");
    const inputOllamaUrl = document.getElementById("ai-ollama-url");
    const inputOllamaModel = document.getElementById("ai-ollama-model");
    const liveWatchLabel = document.getElementById("live-watch-text");

    const btnCopyLogJson = document.getElementById("btn-copy-log-json");
    const btnCopyLogMd = document.getElementById("btn-copy-log-md");
    const btnDownloadLog = document.getElementById("btn-download-log");
    const btnCopyPack = document.getElementById("btn-copy-pack");
    const btnDownloadPackJson = document.getElementById("btn-download-pack-json");
    const btnDownloadPackMd = document.getElementById("btn-download-pack-md");

    // AI_PROMPTS moved to js/constants.js

    let selectedAiKey = "review";

    if (IS_HOSTED) {
        if (btnLiveWatch) btnLiveWatch.style.display = "none";
        if (btnTermToggle) btnTermToggle.style.display = "none";
        if (tabBtnTerminal) tabBtnTerminal.style.display = "none";
        if (panelTerminal) panelTerminal.style.display = "none";
    }

    // generateExecutionLogJSON, generateExecutionLogMarkdown, generateKnowledgePackJSON, and generateKnowledgePackMarkdown moved to js/reports/generators.js

    // Utility functions showToast, copyToClipboard, and downloadFile moved to js/utils.js

    export function updateExecutionLogUI() {
        if (unifiedBatchLog) {
            logCodePreview.textContent = JSON.stringify(unifiedBatchLog, null, 4);
            return;
        }
        if (!activeFlow) {
            logCodePreview.textContent = "Select and run a simulation scenario to record system execution logs.";
            return;
        }
        const log = generateExecutionLogJSON(activeFlow, activeStep);
        logCodePreview.textContent = JSON.stringify(log, null, 4);
    }

    // AI Chat & Settings logic moved to js/ai-engine.js

    const tabBtns = [tabBtnSimulator, tabBtnLog, tabBtnAi, tabBtnPack, tabBtnBatch, tabBtnHealth, tabBtnHistory, tabBtnTerminal];
    const panels = [panelSimulator, panelLog, panelAi, panelPack, panelBatch, panelHealth, panelHistory, panelTerminal];

    let activeTabId = ""; // track active tab

    export function switchTab(targetId) {
        if (!flowPanel) return;
        if (targetId === "terminal" && IS_HOSTED) {
            showToast("Terminal is available in local mode only.");
            return;
        }

        if (targetId === activeTabId && !flowPanel.classList.contains("collapsed")) {
            // Clicking already active tab collapses the sidebar panel
            flowPanel.classList.add("collapsed");
            setTimeout(() => { updateMinimap(); }, 350);
            return;
        }

        // Expand the sidebar panel
        flowPanel.classList.remove("collapsed", "hidden");
        activeTabId = targetId;

        tabBtns.forEach(btn => {
            if (btn) btn.classList.toggle("active", btn.id === `tab-btn-${targetId}`);
        });
        panels.forEach(panel => {
            if (panel) panel.classList.toggle("active", panel.id === `panel-${targetId}`);
        });

        // Trigger updates when specific tabs load
        if (targetId === "log") {
            updateExecutionLogUI();
        } else if (targetId === "ai") {
            populateAIGrid();
        } else if (targetId === "health") {
            updateArchitectureHealthUI();
        } else if (targetId === "history") {
            updateArchitectureHistoryUI();
        } else if (targetId === "terminal") {
            initTerminalOnce();
        }

        // Adjust title and subtitle text dynamically to match active tab
        if (fpTitle && fpSubtitle) {
            if (targetId === "ai") {
                fpTitle.textContent = "AI System Architect";
                fpSubtitle.textContent = "";
            } else if (targetId === "simulator") {
                fpTitle.textContent = activeFlow ? activeFlow.title : "Trace Flow Simulator";
                fpSubtitle.textContent = activeFlow ? activeFlow.subtitle : "Step-by-step trace playback";
            } else if (targetId === "batch") {
                fpTitle.textContent = "Flow Checklist";
                fpSubtitle.textContent = "Batch audits & health compilations";
            } else if (targetId === "log") {
                fpTitle.textContent = "Execution Log";
                fpSubtitle.textContent = "Audit results & dynamic outputs";
            } else if (targetId === "health") {
                fpTitle.textContent = "Architecture Health";
                fpSubtitle.textContent = "Structural analysis & telemetry indices";
            } else if (targetId === "history") {
                fpTitle.textContent = "Audit History";
                fpSubtitle.textContent = "IndexedDB historical snapshots";
            } else if (targetId === "pack") {
                fpTitle.textContent = "Knowledge Pack";
                fpSubtitle.textContent = "Markdown system description exports";
            } else if (targetId === "terminal") {
                fpTitle.textContent = "Project Shell Terminal";
                fpSubtitle.textContent = "Workspace command line tool";
            }
        }
        
        setTimeout(() => { updateMinimap(); }, 350);
    }

    if (tabBtnSimulator) tabBtnSimulator.addEventListener("click", () => switchTab("simulator"));
    if (tabBtnLog) tabBtnLog.addEventListener("click", () => switchTab("log"));
    if (tabBtnAi) tabBtnAi.addEventListener("click", () => switchTab("ai"));
    if (tabBtnPack) tabBtnPack.addEventListener("click", () => switchTab("pack"));
    if (tabBtnBatch) tabBtnBatch.addEventListener("click", () => switchTab("batch"));
    if (tabBtnHealth) tabBtnHealth.addEventListener("click", () => switchTab("health"));
    if (tabBtnHistory) tabBtnHistory.addEventListener("click", () => switchTab("history"));
    if (tabBtnTerminal) tabBtnTerminal.addEventListener("click", () => switchTab("terminal"));
    if (btnLiveWatch) {
        btnLiveWatch.addEventListener("click", () => {
            if (IS_HOSTED) {
                showToast("Live Watch is available in local mode only.");
                return;
            }
            toggleLiveWatch();
        });
    }

    if (btnTermToggle) {
        btnTermToggle.addEventListener("click", () => {
            if (IS_HOSTED) {
                showToast("Terminal is available in local mode only.");
                return;
            }
            stopAutoPlay();
            flowPanel.classList.remove("collapsed", "hidden");
            // Switch to terminal tab (expand if collapsed)
            if (activeTabId === "terminal" && flowPanel.classList.contains("collapsed")) {
                flowPanel.classList.remove("collapsed");
            } else {
                switchTab("terminal");
            }
        });
    }

    // Topbar IDE action launcher (AI Architect tab trigger)
    if (btnIde) {
        btnIde.addEventListener("click", () => {
            stopAutoPlay();
            flowPanel.classList.remove("collapsed", "hidden");
            // Switch to AI tab (expand if collapsed)
            if (activeTabId === "ai" && flowPanel.classList.contains("collapsed")) {
                flowPanel.classList.remove("collapsed");
            } else {
                switchTab("ai");
            }
        });
    }

    // Wire up exports actions
    btnCopyLogJson.addEventListener("click", () => {
        if (unifiedBatchLog) {
            const combined = {
                unifiedAuditLog: unifiedBatchLog,
                architectureHealthReport: generateArchitectureHealthReport(unifiedBatchLog)
            };
            const json = JSON.stringify(combined, null, 2);
            copyToClipboard(json, "Unified batch execution log and Architecture Health Report copied!");
            return;
        }
        if (!activeFlow) {
            showToast("No active simulation to copy!");
            return;
        }
        const json = JSON.stringify(generateExecutionLogJSON(activeFlow, activeStep), null, 2);
        copyToClipboard(json, "JSON execution log copied!");
    });

    btnCopyLogMd.addEventListener("click", () => {
        if (unifiedBatchLog) {
            const md = generateBatchLogMarkdown(unifiedBatchLog);
            copyToClipboard(md, "Unified batch Markdown execution log and Health Report copied!");
            return;
        }
        if (!activeFlow) {
            showToast("No active simulation to copy!");
            return;
        }
        const md = generateExecutionLogMarkdown(activeFlow, activeStep);
        copyToClipboard(md, "Markdown execution log copied!");
    });

    btnDownloadLog.addEventListener("click", () => {
        if (unifiedBatchLog) {
            const combined = {
                unifiedAuditLog: unifiedBatchLog,
                architectureHealthReport: generateArchitectureHealthReport(unifiedBatchLog)
            };
            const json = JSON.stringify(combined, null, 2);
            const filename = `archbench_unified_batch_simulation_log_${Date.now()}.json`;
            downloadFile(json, filename, "application/json");
            return;
        }
        if (!activeFlow) {
            showToast("No active simulation to download!");
            return;
        }
        const json = JSON.stringify(generateExecutionLogJSON(activeFlow, activeStep), null, 2);
        const filename = `archbench_simulation_log_${activeFlow.id}_${Date.now()}.json`;
        downloadFile(json, filename, "application/json");
    });



    btnCopyPack.addEventListener("click", () => {
        const pack = JSON.stringify(generateKnowledgePackJSON(), null, 2);
        copyToClipboard(pack, "Ecosystem Knowledge Pack (JSON) copied!");
    });

    btnDownloadPackJson.addEventListener("click", () => {
        const pack = JSON.stringify(generateKnowledgePackJSON(), null, 2);
        downloadFile(pack, `archbench_knowledge_pack_${Date.now()}.json`, "application/json");
    });

    btnDownloadPackMd.addEventListener("click", () => {
        const md = generateKnowledgePackMarkdown();
        downloadFile(md, `archbench_architecture_context_${Date.now()}.md`, "text/markdown");
    });

    // Flow Checklist & Batch Run System logic moved to js/batch-runner.js

    // generateArchitectureHealthReport moved to js/reports/health-engine.js

    export function updateArchitectureHealthUI() {
        if (!healthReportContent) return;

        if (!unifiedBatchLog) {
            healthReportContent.innerHTML = `
                <p style="font-size:11px; color:var(--text-secondary); line-height:1.5; font-style: italic;">
                    Run a sequential simulation audit through the Flow Checklist tab to compile and view the Architecture Health Report.
                </p>
            `;
            return;
        }

        const report = generateArchitectureHealthReport(unifiedBatchLog);
        if (!report) return;

        let html = `
        <style>
            .health-report-container {
                display: flex;
                flex-direction: column;
                gap: 16px;
                color: var(--text-primary);
                font-size: 11px;
                line-height: 1.4;
            }
            .health-section-title {
                font-size: 12px;
                font-weight: 700;
                color: #fff;
                border-left: 3px solid hsl(220, 85%, 60%);
                padding-left: 8px;
                margin-top: 8px;
                margin-bottom: 8px;
            }
            .health-grid-2x3 {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
            }
            .health-metric-card {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 8px;
                padding: 10px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
            }
            .health-metric-val {
                font-size: 18px;
                font-weight: 800;
                color: hsl(220, 95%, 70%);
                line-height: 1.2;
            }
            .health-metric-label {
                font-size: 9px;
                color: var(--text-secondary);
                margin-top: 2px;
            }
            .health-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
                padding: 0;
                margin: 0;
            }
            .health-list-item {
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.04);
                border-radius: 6px;
                padding: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .health-badge {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 9px;
                font-weight: 700;
                text-transform: uppercase;
            }
            .badge-simple {
                background: rgba(46, 204, 113, 0.15);
                color: #2ecc71;
                border: 1px solid rgba(46, 204, 113, 0.3);
            }
            .badge-moderate {
                background: rgba(52, 152, 219, 0.15);
                color: #3498db;
                border: 1px solid rgba(52, 152, 219, 0.3);
            }
            .badge-complex {
                background: rgba(155, 89, 182, 0.15);
                color: #9b59b6;
                border: 1px solid rgba(155, 89, 182, 0.3);
            }
            .badge-critical {
                background: rgba(231, 76, 60, 0.15);
                color: #e74c3c;
                border: 1px solid rgba(231, 76, 60, 0.3);
            }
            .badge-warning {
                background: rgba(241, 196, 15, 0.15);
                color: #f1c40f;
                border: 1px solid rgba(241, 196, 15, 0.3);
            }
            .badge-info {
                background: rgba(52, 152, 219, 0.15);
                color: #3498db;
                border: 1px solid rgba(52, 152, 219, 0.3);
            }
            .health-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 4px;
                font-size: 11px;
            }
            .health-table th, .health-table td {
                padding: 6px;
                text-align: left;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }
            .health-table th {
                font-weight: 600;
                color: var(--text-secondary);
            }
            .health-observation-item {
                display: flex;
                gap: 8px;
                align-items: flex-start;
                background: rgba(255, 255, 255, 0.02);
                border-radius: 6px;
                padding: 8px;
                border-left: 3px solid hsl(145, 65%, 52%);
            }
            .health-risk-item {
                display: flex;
                flex-direction: column;
                gap: 4px;
                background: rgba(255, 255, 255, 0.02);
                border-radius: 6px;
                padding: 8px;
                border: 1px solid rgba(255, 255, 255, 0.04);
            }
            .health-risk-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .health-risk-title {
                font-weight: 700;
                color: #fff;
            }
            .health-risk-desc {
                font-size: 10px;
                color: var(--text-secondary);
                line-height: 1.3;
            }
        </style>
        <div class="health-report-container">
            <!-- 1. Ecosystem Summary -->
            <div>
                <div class="health-section-title">1. Ecosystem Summary</div>
                <div class="health-grid-2x3">
                    <div class="health-metric-card">
                        <div class="health-metric-val">${report.summary.flowsExecuted}</div>
                        <div class="health-metric-label">Flows Executed</div>
                    </div>
                    <div class="health-metric-card">
                        <div class="health-metric-val">${report.summary.totalSteps}</div>
                        <div class="health-metric-label">Total Steps</div>
                    </div>
                    <div class="health-metric-card">
                        <div class="health-metric-val">${report.summary.uniqueNodesActivated}</div>
                        <div class="health-metric-label">Unique Nodes</div>
                    </div>
                    <div class="health-metric-card">
                        <div class="health-metric-val">${report.summary.connectionsTraversed}</div>
                        <div class="health-metric-label">Connections</div>
                    </div>
                    <div class="health-metric-card" style="grid-column: span 2;">
                        <div class="health-metric-val" style="font-size: 11px; font-family: monospace; color: var(--text-primary);">
                            ${new Date(report.summary.timestamp).toLocaleString()}
                        </div>
                        <div class="health-metric-label">Execution Timestamp</div>
                    </div>
                </div>
            </div>

            <!-- 2. Most Active Nodes -->
            <div>
                <div class="health-section-title">2. Most Active Nodes</div>
                <div class="health-metric-card" style="margin-bottom: 8px; border-color: rgba(180, 130, 255, 0.3); background: rgba(180, 130, 255, 0.03);">
                    <div class="health-metric-label" style="text-transform: uppercase; font-weight: 700; color: hsl(280, 85%, 75%);">⭐ Most Used Node</div>
                    <div class="health-metric-val" style="color: #fff; font-size: 14px; margin-top: 2px;">${report.mostActiveNode.title}</div>
                    <div class="health-metric-label">${report.mostActiveNode.count} activations</div>
                </div>
                <div class="health-list">
        `;

        report.ranking.forEach((n, idx) => {
            const pct = Math.round((n.count / report.summary.totalSteps) * 100);
            html += `
                <div class="health-list-item" style="flex-direction: column; align-items: stretch; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; font-weight: 500;">
                        <span>#${idx + 1} ${n.title}</span>
                        <span style="color: hsl(220, 95%, 70%);">${n.count} acts (${pct}%)</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); height: 4px; border-radius: 2px; overflow: hidden;">
                        <div style="background: hsl(220, 85%, 60%); width: ${pct}%; height: 100%;"></div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>

            <!-- 3. Least Active Nodes -->
            <div>
                <div class="health-section-title">3. Least Active Nodes</div>
                <div class="health-list">
        `;

        if (report.leastActiveNodes.length === 0) {
            html += `<p style="font-style:italic; color:var(--text-muted);">All nodes were actively used.</p>`;
        } else {
            report.leastActiveNodes.forEach(n => {
                const label = n.count === 0 ? "Dead / Unused" : "Rarely Used";
                const badgeClass = n.count === 0 ? "badge-critical" : "badge-warning";
                html += `
                    <div class="health-list-item">
                        <span>${n.title}</span>
                        <div style="display:flex; gap: 8px; align-items:center;">
                            <span class="health-badge ${badgeClass}">${label}</span>
                            <span style="font-family: monospace; color: var(--text-secondary);">${n.count} acts</span>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>

            <!-- 4. Critical Dependencies -->
            <div>
                <div class="health-section-title">4. Critical Dependencies</div>
                <div class="health-list">
        `;

        if (report.criticalDeps.length === 0) {
            html += `<p style="font-style:italic; color:var(--text-muted);">No critical dependencies found.</p>`;
        } else {
            report.criticalDeps.forEach(dep => {
                html += `
                    <div class="health-list-item">
                        <span style="font-weight: 600;">🔑 ${dep.title}</span>
                        <div style="display:flex; gap: 8px; align-items:center;">
                            <span class="health-badge badge-info">Critical Platform Dependency</span>
                            <span style="color: hsl(220, 95%, 70%); font-weight:700;">${dep.percentage}% of flows</span>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>

            <!-- 5. Flow Complexity Analysis -->
            <div>
                <div class="health-section-title">5. Flow Complexity Analysis</div>
                <table class="health-table">
                    <thead>
                        <tr>
                            <th>Flow Scenario</th>
                            <th style="text-align: center;">Steps</th>
                            <th style="text-align: center;">Nodes</th>
                            <th style="text-align: center;">Deps</th>
                            <th style="text-align: right;">Rating</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        report.flowComplexity.forEach(fc => {
            const badgeClass = fc.complexity === "Simple" ? "badge-simple" : (fc.complexity === "Moderate" ? "badge-moderate" : "badge-complex");
            html += `
                <tr>
                    <td style="font-weight: 500;">${fc.flow}</td>
                    <td style="text-align: center; font-family: monospace;">${fc.stepCount}</td>
                    <td style="text-align: center; font-family: monospace;">${fc.nodeCount}</td>
                    <td style="text-align: center; font-family: monospace;">${fc.dependencyCount}</td>
                    <td style="text-align: right;">
                        <span class="health-badge ${badgeClass}">${fc.complexity}</span>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>

            <!-- 6. Trust Boundary Analysis -->
            <div>
                <div class="health-section-title">6. Trust Boundary Analysis</div>
                <div class="health-metric-card" style="margin-bottom: 8px; border-color: rgba(46, 204, 113, 0.3); background: rgba(46, 204, 113, 0.03);">
                    <div class="health-metric-label" style="text-transform: uppercase; font-weight: 700; color: #2ecc71;">🛡️ Trust zone consistent</div>
                    <div class="health-metric-val" style="color: #fff; font-size: 14px; margin-top: 2px;">
                        ${report.trustBoundary.flowsCrossingBoundary} / ${report.summary.flowsExecuted} Flows
                    </div>
                    <div class="health-metric-label">entered secure zone</div>
                </div>
                <div class="health-list">
                    <div class="health-list-item">
                        <span>Zone Boundaries Crossed</span>
                        <div style="display: flex; gap: 12px; font-weight: 600;">
                            <span style="color:#2ecc71;">📥 ${report.trustBoundary.boundaryEntries} Entries</span>
                            <span style="color:hsl(32,85%,58%);">📤 ${report.trustBoundary.boundaryExits} Exits</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 7. Database Impact Analysis -->
            <div>
                <div class="health-section-title">7. Database Impact Analysis</div>
                <div class="health-metric-card" style="margin-bottom: 8px; border-color: rgba(80, 220, 180, 0.3); background: rgba(80, 220, 180, 0.03);">
                    <div class="health-metric-label" style="text-transform: uppercase; font-weight: 700; color: #50dcb4;">🗄️ Database Operations</div>
                    <div class="health-metric-val" style="color: #fff; font-size: 14px; margin-top: 2px;">
                        ${report.databaseImpact.dbTouchCount} Total Operations
                    </div>
                    <div class="health-metric-label" style="color: var(--text-secondary);">
                        Reads: <b style="color:#fff;">${report.databaseImpact.dbReads}</b> | Writes: <b style="color:#fff;">${report.databaseImpact.dbWrites}</b>
                    </div>
                </div>
                <div class="health-list">
        `;

        report.databaseImpact.dbFlowActivity.forEach(act => {
            if (act.count > 0) {
                html += `
                    <div class="health-list-item">
                        <span>${act.flow}</span>
                        <span style="font-family: monospace; font-weight: 600; color:#50dcb4;">${act.count} DB ops</span>
                    </div>
                `;
            }
        });

        html += `
                </div>
            </div>

            <!-- 8. Analytics Coverage -->
            <div>
                <div class="health-section-title">8. Analytics Coverage</div>
                <div class="health-metric-card" style="margin-bottom: 8px; border-color: rgba(241, 196, 15, 0.3); background: rgba(241, 196, 15, 0.03);">
                    <div class="health-metric-label" style="text-transform: uppercase; font-weight: 700; color: #f1c40f;">📊 Telemetry Feeds</div>
                    <div class="health-metric-val" style="color: #fff; font-size: 14px; margin-top: 2px;">
                        ${report.analyticsCoverage.flowsFeedingAnalytics} / ${report.summary.flowsExecuted} Flows
                    </div>
                    <div class="health-metric-label">generate event telemetry</div>
                </div>
        `;

        if (report.analyticsCoverage.bypassingFlows.length > 0) {
            html += `
                <div style="background: rgba(231, 76, 60, 0.05); border: 1px solid rgba(231, 76, 60, 0.15); border-radius: 6px; padding: 8px; font-size: 10px; color: #e74c3c;">
                    <b style="display:block; margin-bottom: 4px;">⚠️ Flows Bypassing Telemetry:</b>
                    <ul style="padding-left: 14px; margin: 0;">
            `;
            report.analyticsCoverage.bypassingFlows.forEach(bf => {
                html += `<li>${bf}</li>`;
            });
            html += `
                    </ul>
                </div>
            `;
        } else {
            html += `
                <div style="background: rgba(46, 204, 113, 0.05); border: 1px solid rgba(46, 204, 113, 0.15); border-radius: 6px; padding: 8px; font-size: 10px; color: #2ecc71; font-weight:600; text-align:center;">
                    ✅ 100% telemetry coverage achieved.
                </div>
            `;
        }

        html += `
            </div>

            <!-- 9. Architecture Observations -->
            <div>
                <div class="health-section-title">9. Architecture Observations</div>
                <div class="health-list" style="gap: 8px;">
        `;

        report.observations.forEach(obs => {
            html += `
                <div class="health-observation-item">
                    <span style="font-size: 12px;">💡</span>
                    <span>${obs}</span>
                </div>
            `;
        });

        html += `
                </div>
            </div>

            <!-- 10. Architecture Risk Indicators -->
            <div>
                <div class="health-section-title">10. Architecture Risk Indicators</div>
                <div class="health-list" style="gap: 8px;">
        `;

        if (report.risks.length === 0) {
            html += `
                <div style="background: rgba(46, 204, 113, 0.05); border: 1px solid rgba(46, 204, 113, 0.15); border-radius: 6px; padding: 10px; font-size: 10px; color: #2ecc71; font-weight:600; text-align:center;">
                    🎉 No risk indicators triggered for the current batch run.
                </div>
            `;
        } else {
            report.risks.forEach(risk => {
                const badgeClass = risk.severity === "critical" ? "badge-critical" : "badge-warning";
                html += `
                    <div class="health-risk-item">
                        <div class="health-risk-header">
                            <span class="health-risk-title">${risk.title}</span>
                            <span class="health-badge ${badgeClass}">${risk.severity}</span>
                        </div>
                        <div class="health-risk-desc">${risk.desc}</div>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>
        </div>
        `;

    }

    // ─── Architecture History & IndexedDB ───────────────────────
    // updateArchitectureHistoryUI and formatComparisonMetric moved to js/history-ui.js

    // ─── PROJECT SYSTEM ──────────────────────────────────────────
    export const DEFAULT_PROJECT_ID = "demo-sample";

    const SKELETON_TEMPLATE = {
        nodes: [
            {
                id: "node1",
                category: "Entry Point",
                title: "My Web Client",
                icon: "💻",
                color: "hsl(210,85%,62%)",
                x: 300, y: 250,
                desc: "User-facing dashboard application.",
                sections: [
                    { label: "Tech Stack", items: ["HTML", "Vanilla JS"] }
                ]
            },
            {
                id: "node2",
                category: "Service",
                title: "My Backend API",
                icon: "⚙️",
                color: "hsl(200,80%,58%)",
                x: 750, y: 250,
                desc: "Processes user requests.",
                sections: [
                    { label: "Features", items: ["Query database", "Format output"] }
                ]
            }
        ],
        connections: [
            ["node1", "node2", "JSON over HTTPS", "request"]
        ],
        flows: [
            {
                id: "query_flow",
                title: "Fetch Data Flow",
                subtitle: "Retrieve data from backend service",
                steps: [
                    {
                        node: "node1",
                        label: "Send Request",
                        detail: "Browser triggers AJAX query to API.",
                        data: '{"query": "products"}'
                    },
                    {
                        node: "node2",
                        label: "Fetch Database",
                        detail: "API queries relational store and formats response.",
                        data: '{"status": 200, "count": 12}'
                    }
                ]
            }
        ]
    };

    export function getCustomProjects() {
        try {
            const data = localStorage.getItem("archbench_projects");
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Failed to load projects from localStorage", e);
            return [];
        }
    }

    export function saveCustomProjects(projects) {
        try {
            localStorage.setItem("archbench_projects", JSON.stringify(projects));
        } catch (e) {
            console.error("Failed to save projects to localStorage", e);
            showToast("Failed to save project locally. Storage may be full.");
        }
    }

    // ─── Markdown Parser & Generator (Sprint 2) ──────────────────

    // parseMarkdownToProject, exportProjectToMarkdown, and validateProjectData moved to js/parser.js

    function getAvailableProjects() {
        const custom = getCustomProjects();
        const list = [];
        
        // Always include the built-in public demo project as default
        const builtIn = { ...project };
        if (!builtIn.id) builtIn.id = DEFAULT_PROJECT_ID;
        list.push(builtIn);
        
        custom.forEach(p => {
            if (p.id !== DEFAULT_PROJECT_ID) {
                list.push(p);
            }
        });
        
        return list;
    }

    export function loadProject(projectToLoad) {
        // Stop any active simulations
        stopAutoPlay();
        exitFlow();
        unifiedBatchLog = null;
        
        if (currentProjectTitle) {
            currentProjectTitle.textContent = projectToLoad.title || "Untitled Project";
        }
        
        // Save active project ID to localStorage
        localStorage.setItem("archbench_active_project_id", projectToLoad.id);
        currentProject = projectToLoad;
        
        // Re-assign NODES, CONNECTIONS, FLOWS
        NODES = projectToLoad.nodes || [];
        CONNECTIONS = projectToLoad.connections || [];
        FLOWS = projectToLoad.flows || [];
        
        // Re-resolve layers and boundaries
        LAYERS = projectToLoad.layers || DEFAULT_LAYERS;
        TRUST_BOUNDARY = projectToLoad.hasOwnProperty('trustBoundary') ? projectToLoad.trustBoundary : DEFAULT_TRUST_BOUNDARY;
        
        // Clear canvas dynamic layers and nodes
        canvas.querySelectorAll(".layer-zone").forEach(el => el.remove());
        canvas.querySelectorAll(".trust-boundary").forEach(el => el.remove());
        canvas.querySelectorAll(".graph-node").forEach(el => el.remove());
        
        // Render layers
        LAYERS.forEach(l => {
            const z = document.createElement("div");
            z.className = `layer-zone ${l.cls || 'services'}`;
            z.style.top = l.y + "px"; z.style.height = l.h + "px";
            z.innerHTML = `<span class="layer-label">${l.label}</span>`;
            canvas.appendChild(z);
        });
        
        // Render trust boundary
        if (TRUST_BOUNDARY) {
            trustEl = document.createElement("div");
            trustEl.className = "trust-boundary";
            trustEl.id = "trust-boundary";
            trustEl.style.left   = TRUST_BOUNDARY.x + "px";
            trustEl.style.top    = TRUST_BOUNDARY.y + "px";
            trustEl.style.width  = TRUST_BOUNDARY.w + "px";
            trustEl.style.height = TRUST_BOUNDARY.h + "px";
            trustEl.innerHTML = `
                <span class="trust-boundary-label">${TRUST_BOUNDARY.label}</span>
                <span class="trust-boundary-note">${TRUST_BOUNDARY.note || ""}</span>
            `;
            canvas.appendChild(trustEl);
        } else {
            trustEl = null;
        }
        
        // Re-render nodes
        clearNodeState();
        NODES.forEach(buildNode);
        
        // Re-render flow simulator bar buttons
        if (flowBarBtns) {
            flowBarBtns.innerHTML = "";
            FLOWS.forEach(flow => {
                const btn = document.createElement("button");
                btn.className = "flow-btn";
                btn.dataset.flow = flow.id;
                btn.innerHTML = `<span class="flow-btn-dot" style="background:${flow.color || 'hsl(210,85%,62%)'}"></span>${flow.title}`;
                btn.addEventListener("click", () => startFlow(flow.id));
                flowBarBtns.appendChild(btn);
            });
        }
        
        // Re-render other dynamic UI panels
        populateBatchChecklist();
        populateAIGrid();
        populateLegend();
        
        // Clear health content preview
        const healthContent = document.getElementById("health-report-content");
        if (healthContent) {
            healthContent.innerHTML = `<p style="font-size:11px; color:var(--text-secondary); line-height:1.5; font-style: italic;">Run a sequential simulation audit through the Flow Checklist tab to compile and view the Architecture Health Report.</p>`;
        }
        
        // Reset execution log
        const logContent = document.getElementById("log-code-preview");
        if (logContent) {
            logContent.textContent = "Select and run a simulation scenario to record system execution logs.";
        }
        
        // Recompute layout sizes and render
        setTimeout(() => {
            measureNodes();
            drawConnections();
            updateMinimap();
            fitToView(false);
        }, 150);
    }

    function populateLegend() {
        const legendEl = document.getElementById("legend");
        if (!legendEl) return;
        
        let html = `<div class="legend-title">Node Types</div>`;
        const categories = {};
        NODES.forEach(n => {
            if (n.category && !categories[n.category]) {
                categories[n.category] = n.color || "hsl(210,85%,62%)";
            }
        });
        
        Object.keys(categories).forEach(cat => {
            html += `<div class="legend-item"><span class="legend-dot" style="background: ${categories[cat]}"></span>${cat}</div>`;
        });
        
        html += `<div class="legend-title" style="margin-top: 6px;">Connections</div>`;
        html += `<div class="legend-item"><span class="legend-line solid"></span>Request Flow</div>`;
        html += `<div class="legend-item"><span class="legend-line dashed"></span>Data Flow</div>`;
        
        legendEl.innerHTML = html;
    }

    function populateProjectDropdownList() {
        if (!projectList) return;
        projectList.innerHTML = "";
        const list = getAvailableProjects();
        
        list.forEach(p => {
            const item = document.createElement("div");
            item.className = "project-item";
            if (currentProject && p.id === currentProject.id) {
                item.classList.add("active");
            }
            
            item.addEventListener("click", () => {
                projectDropdown.classList.remove("show");
                loadProject(p);
            });
            
            const titleWrapper = document.createElement("div");
            titleWrapper.className = "project-item-title-wrapper";
            
            const titleSpan = document.createElement("span");
            titleSpan.textContent = p.title;
            titleWrapper.appendChild(titleSpan);
            
            const verSpan = document.createElement("span");
            verSpan.className = "project-item-version";
            verSpan.textContent = `v${p.version || "1.0"}`;
            titleWrapper.appendChild(verSpan);
            
            item.appendChild(titleWrapper);
            
            // Delete button for custom projects
            if (p.id !== DEFAULT_PROJECT_ID) {
                const delBtn = document.createElement("button");
                delBtn.className = "project-item-delete";
                delBtn.title = "Delete Project";
                delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
                
                delBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to permanently delete project '${p.title}' and all of its simulation history?`)) {
                        let custom = getCustomProjects();
                        custom = custom.filter(cp => cp.id !== p.id);
                        saveCustomProjects(custom);
                        
                        clearProjectHistoryFromDB(p.id).then(() => {
                            if (currentProject && currentProject.id === p.id) {
                                const available = getAvailableProjects();
                                if (available.length > 0) {
                                    loadProject(available[0]);
                                }
                            }
                            populateProjectDropdownList();
                            showToast(`Project '${p.title}' and its history deleted.`);
                        }).catch(err => {
                            console.error("Error clearing project history on delete:", err);
                            if (currentProject && currentProject.id === p.id) {
                                const available = getAvailableProjects();
                                if (available.length > 0) {
                                    loadProject(available[0]);
                                }
                            }
                            populateProjectDropdownList();
                            showToast(`Project '${p.title}' deleted.`);
                        });
                    }
                });
                
                item.appendChild(delBtn);
            }
            
            projectList.appendChild(item);
        });
    }

    // ─── Onboarding Wizard (Sprint 5) ───────────────────────────
    const wizardModal = document.getElementById("wizard-modal");
    const wizardModalClose = document.getElementById("wizard-modal-close");
    const wizardOptAnalyze = document.getElementById("wizard-opt-analyze");
    const wizardOptDesign = document.getElementById("wizard-opt-design");
    const wizardStep1 = document.getElementById("wizard-step-1");
    const wizardStepAnalyze = document.getElementById("wizard-step-analyze");
    const wizardStepDesign = document.getElementById("wizard-step-design");
    const wizardAnalyzeTitle = document.getElementById("wizard-analyze-title");
    const wizardDesignTitle = document.getElementById("wizard-design-title");
    const wizardDesignDesc = document.getElementById("wizard-design-desc");
    const wizardFolderInput = document.getElementById("wizard-folder-input");
    const wizardFileInput = document.getElementById("wizard-file-input");
    const wizardBtnBrowseFolder = document.getElementById("wizard-btn-browse-folder");
    const wizardBtnBrowseFile = document.getElementById("wizard-btn-browse-file");
    const wizardScanStatus = document.getElementById("wizard-scan-status");
    const wizardBtnLoadAnalyzed = document.getElementById("wizard-btn-load-analyzed");
    const wizardBtnGenerateDesigned = document.getElementById("wizard-btn-generate-designed");
    const wizardDropzone = document.getElementById("wizard-dropzone");

    let wizardScannedProjectSpec = null;
    let scannedDirectoryHandle = null;
    let scaffoldNeeded = false;

    function openWizardModal() {
        if (wizardAnalyzeTitle) wizardAnalyzeTitle.value = "";
        if (wizardDesignTitle) wizardDesignTitle.value = "";
        if (wizardDesignDesc) wizardDesignDesc.value = "";
        if (wizardScanStatus) {
            wizardScanStatus.style.display = "none";
            wizardScanStatus.innerHTML = "";
        }
        if (wizardBtnLoadAnalyzed) wizardBtnLoadAnalyzed.disabled = true;
        wizardScannedProjectSpec = null;
        showWizardStep(1);
        if (wizardModal) wizardModal.classList.add("show");
    }

    function closeWizardModal() {
        if (wizardModal) wizardModal.classList.remove("show");
    }

    function showWizardStep(step) {
        if (wizardStep1) wizardStep1.classList.remove("active");
        if (wizardStepAnalyze) wizardStepAnalyze.classList.remove("active");
        if (wizardStepDesign) wizardStepDesign.classList.remove("active");

        if (step === 1) {
            if (wizardStep1) wizardStep1.classList.add("active");
        } else if (step === "analyze") {
            if (wizardStepAnalyze) wizardStepAnalyze.classList.add("active");
        } else if (step === "design") {
            if (wizardStepDesign) wizardStepDesign.classList.add("active");
        }
    }

    if (wizardModalClose) {
        wizardModalClose.addEventListener("click", closeWizardModal);
    }
    if (wizardOptAnalyze) {
        wizardOptAnalyze.addEventListener("click", () => showWizardStep("analyze"));
    }
    if (wizardOptDesign) {
        wizardOptDesign.addEventListener("click", () => showWizardStep("design"));
    }
    document.querySelectorAll(".wizard-back-btn").forEach(btn => {
        btn.addEventListener("click", () => showWizardStep(1));
    });

    if (wizardBtnBrowseFolder) {
        wizardBtnBrowseFolder.addEventListener("click", async () => {
            if (window.showDirectoryPicker) {
                try {
                    const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
                    await processDirectoryOnboarding(dirHandle);
                } catch (err) {
                    console.warn("Directory selection cancelled or failed, falling back to legacy input:", err);
                    if (wizardFolderInput) wizardFolderInput.click();
                }
            } else {
                if (wizardFolderInput) wizardFolderInput.click();
            }
        });
    }
    if (wizardBtnBrowseFile && wizardFileInput) {
        wizardBtnBrowseFile.addEventListener("click", () => wizardFileInput.click());
    }

    // Delegated click handler for dynamically created elements inside the onboarding wizard status container
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        
        if (btn.id === "btn-copy-onboarding-prompt") {
            const promptText = `You are a senior system architect. I have initialized an ArchBench workspace. Analyze my codebase files and write the architecture specification directly into architecture.md in my root folder, following the format rules in PROJECT_RULES.md. Do not output explanations, only write the markdown code.`;
            copyToClipboard(promptText, "🤖 LLM System Prompt copied to clipboard! Paste it into your AI workspace.");
        } else if (btn.id === "btn-download-scaffold-arch") {
            if (wizardScannedProjectSpec) {
                const mdContent = exportProjectToMarkdown(wizardScannedProjectSpec);
                downloadFile(mdContent, "architecture.md", "text/markdown");
                showToast("📥 Saved architecture.md starter template!");
            }
        } else if (btn.id === "btn-download-scaffold-rules") {
            if (wizardScannedProjectSpec) {
                const rulesContent = generateProjectRulesContent(wizardScannedProjectSpec.title);
                downloadFile(rulesContent, "PROJECT_RULES.md", "text/markdown");
                showToast("📥 Saved PROJECT_RULES.md prompt rules!");
            }
        }
    });

    function generateProjectRulesContent(projectTitle) {
        return `# ArchBench Project Rules & Prompts for '${projectTitle}'

This workspace uses [Architecture Workbench (ArchBench)](https://archbench.netlify.app/) to visualize the system diagram, simulate flows, and track changes.

## Single Source of Truth
* The file \`architecture.md\` is the single source of truth for the system architecture.
* Any changes to \`architecture.md\` will be automatically picked up and hot-reloaded by the ArchBench visual dashboard.

## LLM System Instructions
When using an LLM agent (like Gemini, OpenAI, Claude, or a workspace copilot) to update the system structure, prompt it with the following:

\`\`\`markdown
You are a senior systems architect. Your task is to analyze the codebase and write/update the \`architecture.md\` specification file.

Format rules:
1. Every component must be defined in the \`## Nodes\` section.
   Use the categories: "Entry Point", "Service", "Infrastructure", or "Boundary".
2. Connections must be defined in the \`## Connections\` section as:
   * [from_node_id, to_node_id, interaction_label, type]
   Where type is "request", "data", or "future".
3. Simulation pathways must be detailed in the \`## Flows\` section.

Ensure you update only the \`architecture.md\` file when modifying the layout. Do not change business logic or output other file formats.
\`\`\`
`;
    }

    async function writeScaffoldFiles(dirHandle, spec) {
        try {
            const mdContent = exportProjectToMarkdown(spec);
            const specHandle = await dirHandle.getFileHandle("architecture.md", { create: true });
            const specWritable = await specHandle.createWritable();
            await specWritable.write(mdContent);
            await specWritable.close();

            const rulesContent = generateProjectRulesContent(spec.title);
            const rulesHandle = await dirHandle.getFileHandle("PROJECT_RULES.md", { create: true });
            const rulesWritable = await rulesHandle.createWritable();
            await rulesWritable.write(rulesContent);
            await rulesWritable.close();
        } catch (err) {
            console.error("Failed to write scaffold files to local directory:", err);
            showToast("⚠️ Failed to write architecture files directly. Sandbox permission denied.");
        }
    }

    async function processDirectoryOnboarding(dirHandle) {
        if (wizardScanStatus) {
            wizardScanStatus.style.display = "block";
            wizardScanStatus.innerHTML = "<span style='color: hsl(200, 85%, 75%);'>Scanning project files...</span>";
        }
        
        scannedDirectoryHandle = dirHandle;
        scaffoldNeeded = false;
        wizardScannedProjectSpec = null;
        
        try {
            let specFileHandle = null;
            // Scan top level for architecture.md
            for await (const entry of dirHandle.values()) {
                if (entry.kind === "file" && entry.name.toLowerCase() === "architecture.md") {
                    specFileHandle = entry;
                    break;
                }
            }
            
            if (specFileHandle) {
                const file = await specFileHandle.getFile();
                const text = await file.text();
                const parsed = parseMarkdownToProject(text);
                validateProjectData(parsed);
                
                wizardScannedProjectSpec = parsed;
                if (wizardAnalyzeTitle) wizardAnalyzeTitle.value = parsed.title;
                
                if (wizardScanStatus) {
                    wizardScanStatus.innerHTML = `<span style="color: hsl(150, 75%, 70%); font-weight:600;">✅ Found architecture.md!</span><br>` +
                        `<strong>Title:</strong> ${parsed.title}<br>` +
                        `<strong>Version:</strong> ${parsed.version}<br>` +
                        `<strong>Components:</strong> ${parsed.nodes.length} nodes, ${parsed.connections.length} connections.<br>` +
                        `<span style="color: hsl(200, 85%, 75%); font-size:10px;">Live Watch will auto-enable on load.</span>`;
                }
                if (wizardBtnLoadAnalyzed) wizardBtnLoadAnalyzed.disabled = false;
            } else {
                // Heuristic scan directory folders recursively
                let hasClient = false, hasApi = false, hasDb = false, hasAuth = false, hasWorker = false;
                let detectedFolders = [];
                const IGNORE_DIRS = new Set(["node_modules", ".git", ".github", "dist", "build", "target", "out", ".next", "cache", "tmp", "vendor"]);

                async function traverse(handle, currentDepth = 1) {
                    if (currentDepth > 3) return;
                    try {
                        for await (const entry of handle.values()) {
                            if (entry.kind === "directory") {
                                const name = entry.name.toLowerCase();
                                if (IGNORE_DIRS.has(name)) continue;

                                let matched = false;
                                if (name.includes("auth")) { hasAuth = true; matched = true; }
                                if (name.includes("worker") || name.includes("queue") || name.includes("job")) { hasWorker = true; matched = true; }
                                if (name.includes("db") || name.includes("database") || name.includes("postgres") || name.includes("mysql") || name.includes("redis") || name.includes("mongo")) { hasDb = true; matched = true; }
                                if (name.includes("client") || name.includes("frontend") || name.includes("web") || name.includes("app") || name.includes("ui") || name.includes("pages")) { hasClient = true; matched = true; }
                                if (name.includes("api") || name.includes("backend") || name.includes("server") || name.includes("controller") || name.includes("routes")) { hasApi = true; matched = true; }

                                if (matched || currentDepth === 1) {
                                    if (detectedFolders.length < 10) {
                                        detectedFolders.push(entry.name);
                                    }
                                }
                                await traverse(entry, currentDepth + 1);
                            } else if (entry.kind === "file") {
                                const name = entry.name.toLowerCase();
                                if (name === "docker-compose.yml" || name === "docker-compose.yaml") {
                                    hasDb = true;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Traverse permission or access error on sub-handle:", e);
                    }
                }
                
                await traverse(dirHandle, 1);
                
                if (wizardAnalyzeTitle) {
                    wizardAnalyzeTitle.value = dirHandle.name.split(/[_-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                } else if (wizardAnalyzeTitle && !wizardAnalyzeTitle.value) {
                    wizardAnalyzeTitle.value = "Workspace Scaffold";
                }
                
                const nodesList = [];
                const connectionsList = [];
                const flowsList = [];
                
                if (hasClient || (!hasApi && !hasDb)) {
                    nodesList.push({
                        id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250,
                        desc: "Discovered client application folder."
                    });
                }
                if (hasAuth) {
                    nodesList.push({
                        id: "auth", category: "Service", title: "Auth Service", icon: "🔒", color: "hsl(280,85%,75%)", x: 550, y: 550,
                        desc: "Discovered authentication service folder."
                    });
                }
                if (hasApi || hasWorker || hasDb) {
                    nodesList.push({
                        id: "api", category: "Service", title: "Backend API", icon: "⚙️", color: "hsl(200,80%,58%)", x: 550, y: 250,
                        desc: "Discovered core api controllers."
                    });
                }
                if (hasWorker) {
                    nodesList.push({
                        id: "worker", category: "Service", title: "Job Processor", icon: "📨", color: "hsl(28,85%,58%)", x: 800, y: 550,
                        desc: "Discovered worker task queues."
                    });
                }
                if (hasDb) {
                    nodesList.push({
                        id: "db", category: "Infrastructure", title: "Database Store", icon: "🗄️", color: "hsl(170,70%,50%)", x: 800, y: 250,
                        desc: "Discovered database storage config."
                    });
                }
                
                if (nodesList.length === 0) {
                    nodesList.push(
                        { id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "Default client interface." },
                        { id: "api", category: "Service", title: "Core Service", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Default backend API service." }
                    );
                }
                
                const nodeIds = nodesList.map(n => n.id);
                if (nodeIds.includes("client") && nodeIds.includes("api")) {
                    connectionsList.push(["client", "api", "HTTPS Request", "request"]);
                }
                if (nodeIds.includes("api") && nodeIds.includes("auth")) {
                    connectionsList.push(["api", "auth", "Verify Tokens", "request"]);
                }
                if (nodeIds.includes("api") && nodeIds.includes("worker")) {
                    connectionsList.push(["api", "worker", "Queue Task", "data"]);
                }
                if (nodeIds.includes("api") && nodeIds.includes("db")) {
                    connectionsList.push(["api", "db", "Read/Write SQL", "data"]);
                }
                if (nodeIds.includes("worker") && nodeIds.includes("db")) {
                    connectionsList.push(["worker", "db", "Update Job Status", "data"]);
                }
                
                if (connectionsList.length === 0 && nodeIds.length >= 2) {
                    connectionsList.push([nodeIds[0], nodeIds[1], "Connects To", "request"]);
                }
                
                const flowSteps = nodesList.map(n => ({
                    node: n.id,
                    label: `Process at ${n.title}`,
                    detail: `Scaffolded execution step at ${n.title}.`,
                    data: `{"scaffold": true}`
                }));
                
                flowsList.push({
                    id: "main_scaffold_flow",
                    title: "Scaffold Demo Flow",
                    subtitle: "Automatically generated walk-through simulation",
                    steps: flowSteps
                });
                
                const spec = {
                    title: wizardAnalyzeTitle.value.trim() || dirHandle.name,
                    version: "1.0",
                    nodes: nodesList,
                    connections: connectionsList,
                    flows: flowsList
                };
                
                wizardScannedProjectSpec = spec;
                scaffoldNeeded = true;
                
                if (wizardScanStatus) {
                    let detectedText = [];
                    if (hasClient) detectedText.push("Frontend UI");
                    if (hasApi) detectedText.push("API Backend");
                    if (hasDb) detectedText.push("Database");
                    if (hasAuth) detectedText.push("Auth");
                    if (hasWorker) detectedText.push("Worker Thread");
                    
                    if (detectedText.length === 0) detectedText.push("Generic project folder");
                    
                    let foldersHtml = "";
                    if (detectedFolders.length > 0) {
                        foldersHtml = `<div style="margin-top: 4px; opacity: 0.8; font-size: 10px;">Scanned directories: <code>${detectedFolders.join(", ")}</code></div>`;
                    }
                    
                    wizardScanStatus.innerHTML = 
                        `<div style="display:flex; flex-direction:column; gap:8px;">` +
                            `<div>` +
                                `<span style="color: hsl(32, 85%, 58%); font-weight:600;">⚠️ architecture.md not found in directory.</span><br>` +
                                `Detected components: <strong>${detectedText.join(", ")}</strong>.<br>` +
                                `${foldersHtml}` +
                            `</div>` +
                            `<div style="padding: 10px; border-radius: 8px; background: rgba(180, 130, 255, 0.05); border: 1px solid rgba(180, 130, 255, 0.15); margin-top: 4px;">` +
                                `<div style="font-weight: 700; font-size: 10px; color: hsl(280, 85%, 75%); margin-bottom: 4px;">📂 DIRECT SYNC ONBOARDING</div>` +
                                `<div style="font-size: 10px; color: var(--text-secondary); line-height: 1.4;">` +
                                    `Clicking <strong>Load Project</strong> will write <code>architecture.md</code> and <code>PROJECT_RULES.md</code> directly into your project root and start <strong>Live Watch</strong>.` +
                                `</div>` +
                            `</div>` +
                            `<div style="padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);">` +
                                `<div style="font-weight: 700; font-size: 10px; color: hsl(280, 85%, 75%); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">` +
                                    `<span>🤖 LLM PROMPT FOR ARCHITECTURE SPEC</span>` +
                                    `<button id="btn-copy-onboarding-prompt" style="background: rgba(180, 130, 255, 0.2); border: 1px solid rgba(180, 130, 255, 0.4); color: hsl(280, 85%, 80%); padding: 2px 6px; font-size: 9px; cursor: pointer; border-radius: 4px; font-family: inherit; font-weight: 600;">Copy Prompt</button>` +
                                `</div>` +
                                `<div style="font-size: 10px; color: var(--text-secondary); line-height: 1.4; font-family: monospace; white-space: pre-wrap; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; overflow-y: auto; max-height: 80px;">` +
                                    `You are a senior system architect. I have initialized an ArchBench workspace. Analyze my codebase files and write the architecture specification directly into architecture.md in my root folder, following the format rules in PROJECT_RULES.md. Do not output explanations, only write the markdown code.` +
                                `</div>` +
                            `</div>` +
                        `</div>`;
                }
                if (wizardBtnLoadAnalyzed) wizardBtnLoadAnalyzed.disabled = false;
            }
        } catch (err) {
            console.error("Directory scan error:", err);
            if (wizardScanStatus) {
                wizardScanStatus.innerHTML = `<span style="color: hsl(0, 72%, 62%); font-weight:600;">❌ Directory onboarding failed:</span><br>` +
                    `<span style="font-size:10px; font-family:monospace; opacity:0.8;">${err.message}</span>`;
            }
        }
    }

    function handleScannedFiles(files, isFolder) {
        if (!files || files.length === 0) return;
        
        let archFile = null;
        let filesList = Array.from(files);
        
        for (let file of filesList) {
            const name = file.name.toLowerCase();
            const relPath = file.webkitRelativePath ? file.webkitRelativePath.toLowerCase() : "";
            if (name === "architecture.md" || relPath.endsWith("architecture.md")) {
                archFile = file;
                break;
            }
        }

        if (wizardScanStatus) {
            wizardScanStatus.style.display = "block";
            wizardScanStatus.innerHTML = "<span style='color: hsl(200, 85%, 75%);'>Scanning project files...</span>";
        }

        if (archFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const parsed = parseMarkdownToProject(text);
                    validateProjectData(parsed);
                    
                    wizardScannedProjectSpec = parsed;
                    if (wizardAnalyzeTitle) wizardAnalyzeTitle.value = parsed.title;
                    
                    if (wizardScanStatus) {
                        wizardScanStatus.innerHTML = `<span style="color: hsl(150, 75%, 70%); font-weight:600;">✅ Found architecture.md!</span><br>` +
                            `<strong>Title:</strong> ${parsed.title}<br>` +
                            `<strong>Version:</strong> ${parsed.version}<br>` +
                            `<strong>Components:</strong> ${parsed.nodes.length} nodes, ${parsed.connections.length} connections.`;
                    }
                    if (wizardBtnLoadAnalyzed) wizardBtnLoadAnalyzed.disabled = false;
                } catch (err) {
                    if (wizardScanStatus) {
                        wizardScanStatus.innerHTML = `<span style="color: hsl(0, 72%, 62%); font-weight:600;">❌ Found architecture.md but failed parsing:</span><br>` +
                            `<span style="font-size:10px; font-family:monospace; opacity:0.8;">${err.message}</span>`;
                    }
                }
            };
            reader.readAsText(archFile);
        } else {
            let hasClient = false, hasApi = false, hasDb = false, hasAuth = false, hasWorker = false;
            let folderName = "";

            filesList.forEach(file => {
                const path = file.webkitRelativePath ? file.webkitRelativePath.toLowerCase() : file.name.toLowerCase();
                if (!folderName && file.webkitRelativePath) {
                    folderName = file.webkitRelativePath.split('/')[0];
                }
                if (path.includes("/client") || path.includes("/frontend") || path.includes("/web") || path.includes("index.html") || path.includes("app.js") || path.includes("app.tsx")) {
                    hasClient = true;
                }
                if (path.includes("/api") || path.includes("/backend") || path.includes("/server") || path.includes("server.js") || path.includes("app.py")) {
                    hasApi = true;
                }
                if (path.includes("/db") || path.includes("/database") || path.includes("/postgres") || path.includes("/mysql") || path.includes("/mongo") || path.includes("schema.sql")) {
                    hasDb = true;
                }
                if (path.includes("/auth") || path.includes("login") || path.includes("session")) {
                    hasAuth = true;
                }
                if (path.includes("/worker") || path.includes("/queue") || path.includes("rabbitmq") || path.includes("kafka") || path.includes("redis")) {
                    hasWorker = true;
                }
            });

            if (folderName && wizardAnalyzeTitle) {
                wizardAnalyzeTitle.value = folderName.split(/[_-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            } else if (wizardAnalyzeTitle && !wizardAnalyzeTitle.value) {
                wizardAnalyzeTitle.value = "Workspace Scaffold";
            }

            const nodesList = [];
            const connectionsList = [];
            const flowsList = [];

            if (hasClient || (!hasApi && !hasDb)) {
                nodesList.push({
                    id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250,
                    desc: "Scaffolded client interface detected in project directory."
                });
            }
            if (hasAuth) {
                nodesList.push({
                    id: "auth", category: "Service", title: "Authentication API", icon: "🔒", color: "hsl(280,85%,75%)", x: 550, y: 550,
                    desc: "Scaffolded authentication system detected."
                });
            }
            if (hasApi || hasWorker || hasDb) {
                nodesList.push({
                    id: "api", category: "Service", title: "Backend API Gateway", icon: "⚙️", color: "hsl(200,80%,58%)", x: 550, y: 250,
                    desc: "Scaffolded core api controller."
                });
            }
            if (hasWorker) {
                nodesList.push({
                    id: "worker", category: "Service", title: "Background Job Processor", icon: "📨", color: "hsl(28,85%,58%)", x: 800, y: 550,
                    desc: "Scaffolded message queue worker."
                });
            }
            if (hasDb) {
                nodesList.push({
                    id: "db", category: "Infrastructure", title: "Relational Database", icon: "🗄️", color: "hsl(170,70%,50%)", x: 800, y: 250,
                    desc: "Scaffolded storage container."
                });
            }

            if (nodesList.length === 0) {
                nodesList.push(
                    { id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "Default client interface." },
                    { id: "api", category: "Service", title: "Core Service", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Default backend API service." }
                );
            }

            const nodeIds = nodesList.map(n => n.id);
            if (nodeIds.includes("client") && nodeIds.includes("api")) {
                connectionsList.push(["client", "api", "HTTPS Request", "request"]);
            }
            if (nodeIds.includes("api") && nodeIds.includes("auth")) {
                connectionsList.push(["api", "auth", "Authorize User", "request"]);
            }
            if (nodeIds.includes("api") && nodeIds.includes("worker")) {
                connectionsList.push(["api", "worker", "Publish Job", "data"]);
            }
            if (nodeIds.includes("api") && nodeIds.includes("db")) {
                connectionsList.push(["api", "db", "Read/Write SQL", "data"]);
            }
            if (nodeIds.includes("worker") && nodeIds.includes("db")) {
                connectionsList.push(["worker", "db", "Update State", "data"]);
            }
            
            if (connectionsList.length === 0 && nodeIds.length >= 2) {
                connectionsList.push([nodeIds[0], nodeIds[1], "Connects To", "request"]);
            }

            const flowSteps = [];
            nodesList.forEach(n => {
                flowSteps.push({
                    node: n.id,
                    label: `Process at ${n.title}`,
                    detail: `Scaffolded pipeline execution step at ${n.title}.`,
                    data: `{"scaffold": true}`
                });
            });

            flowsList.push({
                id: "main_scaffold_flow",
                title: "Default Execution Scenario",
                subtitle: "Automatically generated scenario walkthrough",
                steps: flowSteps
            });

            const spec = {
                title: wizardAnalyzeTitle.value.trim() || "Workspace Scaffold",
                version: "1.0",
                nodes: nodesList,
                connections: connectionsList,
                flows: flowsList
            };

            wizardScannedProjectSpec = spec;
            if (wizardScanStatus) {
                let detectedText = [];
                if (hasClient) detectedText.push("Frontend (Client)");
                if (hasApi) detectedText.push("Backend (API)");
                if (hasDb) detectedText.push("Database");
                if (hasAuth) detectedText.push("Auth Module");
                if (hasWorker) detectedText.push("Worker Queue");
                
                if (detectedText.length === 0) detectedText.push("Generic project directory");

                let foldersHtml = "";
                if (folderName) {
                    foldersHtml = `<div style="margin-top:4px; opacity:0.8; font-size:10px;">Scanned root: <code>${folderName}</code></div>`;
                }

                wizardScanStatus.innerHTML = 
                    `<div style="display:flex; flex-direction:column; gap:8px;">` +
                        `<div>` +
                            `<span style="color: hsl(32, 85%, 58%); font-weight:600;">⚠️ architecture.md not found in directory.</span><br>` +
                            `Detected components: <strong>${detectedText.join(", ")}</strong>.<br>` +
                            `${foldersHtml}` +
                        `</div>` +
                        `<div style="padding: 10px; border-radius: 8px; background: rgba(255,160,0,0.05); border: 1px solid rgba(255,160,0,0.15); margin-top: 4px;">` +
                            `<div style="font-weight: 700; font-size: 10px; color: hsl(38, 95%, 65%); margin-bottom: 6px;">📥 DOWNLOAD STARTER FILES</div>` +
                            `<div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.4;">` +
                                `Since this browser environment doesn't allow writing directly to local folders, click below to download your starter files. Place them in your project root!` +
                            `</div>` +
                            `<div style="display: flex; gap: 8px;">` +
                                `<button id="btn-download-scaffold-arch" style="background: rgba(255,160,0,0.15); border: 1px solid rgba(255,160,0,0.3); color: hsl(38, 95%, 75%); padding: 4px 8px; font-size: 10px; cursor: pointer; border-radius: 4px; font-family: inherit; font-weight: 600;">Download architecture.md</button>` +
                                `<button id="btn-download-scaffold-rules" style="background: rgba(255,160,0,0.15); border: 1px solid rgba(255,160,0,0.3); color: hsl(38, 95%, 75%); padding: 4px 8px; font-size: 10px; cursor: pointer; border-radius: 4px; font-family: inherit; font-weight: 600;">Download PROJECT_RULES.md</button>` +
                            `</div>` +
                        `</div>` +
                        `<div style="padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);">` +
                            `<div style="font-weight: 700; font-size: 10px; color: hsl(280, 85%, 75%); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">` +
                                `<span>🤖 LLM PROMPT FOR ARCHITECTURE SPEC</span>` +
                                `<button id="btn-copy-onboarding-prompt" style="background: rgba(180, 130, 255, 0.2); border: 1px solid rgba(180, 130, 255, 0.4); color: hsl(280, 85%, 80%); padding: 2px 6px; font-size: 9px; cursor: pointer; border-radius: 4px; font-family: inherit; font-weight: 600;">Copy Prompt</button>` +
                            `</div>` +
                            `<div style="font-size: 10px; color: var(--text-secondary); line-height: 1.4; font-family: monospace; white-space: pre-wrap; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; overflow-y: auto; max-height: 80px;">` +
                                `You are a senior system architect. I have initialized an ArchBench workspace. Analyze my codebase files and write the architecture specification directly into architecture.md in my root folder, following the format rules in PROJECT_RULES.md. Do not output explanations, only write the markdown code.` +
                            `</div>` +
                        `</div>` +
                    `</div>`;
            }
            if (wizardBtnLoadAnalyzed) wizardBtnLoadAnalyzed.disabled = false;
        }
    }

    if (wizardFolderInput) {
        wizardFolderInput.addEventListener("change", (e) => {
            handleScannedFiles(e.target.files, true);
        });
    }

    if (wizardFileInput) {
        wizardFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const isJson = file.name.toLowerCase().endsWith(".json");
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    let spec;
                    if (isJson) {
                        spec = JSON.parse(event.target.result);
                    } else {
                        spec = parseMarkdownToProject(event.target.result);
                    }
                    validateProjectData(spec);
                    wizardScannedProjectSpec = spec;
                    if (wizardAnalyzeTitle) wizardAnalyzeTitle.value = spec.title;
                    if (wizardScanStatus) {
                        wizardScanStatus.style.display = "block";
                        wizardScanStatus.innerHTML = `<span style="color: hsl(150, 75%, 70%); font-weight:600;">✅ Loaded Specification File!</span><br>` +
                            `<strong>Title:</strong> ${spec.title}<br>` +
                            `<strong>Nodes:</strong> ${spec.nodes.length}, <strong>Connections:</strong> ${spec.connections.length}`;
                    }
                    if (wizardBtnLoadAnalyzed) wizardBtnLoadAnalyzed.disabled = false;
                } catch(err) {
                    if (wizardScanStatus) {
                        wizardScanStatus.style.display = "block";
                        wizardScanStatus.innerHTML = `<span style="color: hsl(0, 72%, 62%); font-weight:600;">❌ File loading failed:</span><br>` +
                            `<span style="font-size:10px; font-family:monospace; opacity:0.8;">${err.message}</span>`;
                    }
                }
            };
            reader.readAsText(file);
        });
    }

    if (wizardBtnLoadAnalyzed) {
        wizardBtnLoadAnalyzed.addEventListener("click", async () => {
            if (!wizardScannedProjectSpec) return;
            
            const titleVal = wizardAnalyzeTitle.value.trim();
            if (titleVal) {
                wizardScannedProjectSpec.title = titleVal;
            }

            const custom = getCustomProjects();
            const newId = "project-" + Date.now();
            wizardScannedProjectSpec.id = newId;
            custom.push(wizardScannedProjectSpec);
            saveCustomProjects(custom);

            if (scaffoldNeeded && scannedDirectoryHandle) {
                await writeScaffoldFiles(scannedDirectoryHandle, wizardScannedProjectSpec);
            }
            
            loadProject(wizardScannedProjectSpec);
            closeWizardModal();
            showToast(`Project '${wizardScannedProjectSpec.title}' loaded and initialized!`);
            
            if (scannedDirectoryHandle) {
                startLiveWatch(scannedDirectoryHandle);
            }
        });
    }

    if (wizardDropzone) {
        wizardDropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            wizardDropzone.classList.add("dragover");
        });
        wizardDropzone.addEventListener("dragleave", () => {
            wizardDropzone.classList.remove("dragover");
        });
        wizardDropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            wizardDropzone.classList.remove("dragover");
            if (e.dataTransfer.files) {
                handleScannedFiles(e.dataTransfer.files, false);
            }
        });
    }

    if (wizardModal) {
        wizardModal.addEventListener("click", (e) => {
            if (e.target === wizardModal) {
                closeWizardModal();
            }
        });
    }

    if (wizardBtnGenerateDesigned) {
        wizardBtnGenerateDesigned.addEventListener("click", () => {
            const titleVal = wizardDesignTitle.value.trim() || "My New System Architecture";
            const descVal = wizardDesignDesc.value.trim().toLowerCase();
            
            const nodesList = [];
            const connectionsList = [];
            const flowsList = [];

            const hasClient = descVal.includes("client") || descVal.includes("frontend") || descVal.includes("web") || descVal.includes("ui") || descVal.includes("react") || descVal.includes("next") || descVal.includes("vue") || descVal.includes("app");
            const hasGateway = descVal.includes("gateway") || descVal.includes("proxy") || descVal.includes("nginx") || descVal.includes("load balancer");
            const hasAuth = descVal.includes("auth") || descVal.includes("oauth") || descVal.includes("jwt") || descVal.includes("login") || descVal.includes("identity") || descVal.includes("cognito");
            const hasWorker = descVal.includes("worker") || descVal.includes("queue") || descVal.includes("rabbitmq") || descVal.includes("kafka") || descVal.includes("celery") || descVal.includes("redis") || descVal.includes("broker");
            const hasDb = descVal.includes("database") || descVal.includes("db") || descVal.includes("postgres") || descVal.includes("postgresql") || descVal.includes("mysql") || descVal.includes("sqlite") || descVal.includes("mongodb") || descVal.includes("dynamo");
            const hasApi = descVal.includes("api") || descVal.includes("backend") || descVal.includes("service") || descVal.includes("python") || descVal.includes("node") || descVal.includes("django") || descVal.includes("flask") || descVal.includes("express") || descVal.includes("spring");

            if (hasClient || (!hasGateway && !hasAuth && !hasWorker && !hasDb && !hasApi)) {
                nodesList.push({
                    id: "client", category: "Entry Point", title: "Web Client Portal", icon: "💻", color: "hsl(210,85%,62%)", x: 200, y: 150,
                    desc: "User-facing dashboard and interactive portal interface.",
                    sections: [{ label: "Capabilities", items: ["Render Views", "Form Inputs", "Event Handling"] }]
                });
            }
            if (hasGateway) {
                nodesList.push({
                    id: "gateway", category: "Service", title: "Edge API Gateway", icon: "🛡️", color: "hsl(270,70%,65%)", x: 500, y: 150,
                    desc: "Ingress security router and authentication proxy gateway.",
                    sections: [{ label: "Middlewares", items: ["Rate Limiter", "Router"] }]
                });
            }
            if (hasAuth) {
                nodesList.push({
                    id: "auth", category: "Service", title: "Authentication API", icon: "🔒", color: "hsl(280,85%,75%)", x: 500, y: 450,
                    desc: "Authenticates users, signs JSON Web Tokens, and manages sessions.",
                    sections: [{ label: "Tech Stack", items: ["JWT", "BCrypt"] }]
                });
            }
            if (hasApi || (!hasClient && nodesList.length === 0)) {
                nodesList.push({
                    id: "api", category: "Service", title: "Core Business Service", icon: "⚙️", color: "hsl(220,80%,62%)", x: 800, y: 150,
                    desc: "Handles transactional requests and processes core workflows.",
                    sections: [{ label: "Controller Endpoints", items: ["POST /orders", "GET /data"] }]
                });
            }
            if (hasWorker) {
                nodesList.push({
                    id: "worker", category: "Service", title: "Task Event Worker", icon: "📨", color: "hsl(28,85%,58%)", x: 800, y: 450,
                    desc: "Asynchronous task queue workers running background jobs.",
                    sections: [{ label: "Workers", items: ["Email Processing", "Image Scaling"] }]
                });
            }
            if (hasDb) {
                let dbTitle = "Database Store";
                let dbIcon = "🗄️";
                if (descVal.includes("postgres")) dbTitle = "PostgreSQL DB";
                else if (descVal.includes("mysql")) dbTitle = "MySQL DB";
                else if (descVal.includes("mongo")) { dbTitle = "MongoDB Store"; dbIcon = "🍃"; }
                else if (descVal.includes("redis")) { dbTitle = "Redis Cache"; dbIcon = "⚡"; }

                nodesList.push({
                    id: "db", category: "Infrastructure", title: dbTitle, icon: dbIcon, color: "hsl(170,70%,50%)", x: 1100, y: 150,
                    desc: "Persistent relational and transactional storage node.",
                    sections: [{ label: "Tables/Schemas", items: ["Users Registry", "Audit Logs"] }]
                });
            }

            if (nodesList.length === 0) {
                nodesList.push(
                    { id: "client", category: "Entry Point", title: "Client Web App", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "User client view." },
                    { id: "api", category: "Service", title: "Backend Controller", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Processes logical APIs." }
                );
            }

            const nodeIds = nodesList.map(n => n.id);
            if (nodeIds.includes("client") && nodeIds.includes("gateway")) {
                connectionsList.push(["client", "gateway", "HTTPS Api Request", "request"]);
            } else if (nodeIds.includes("client") && nodeIds.includes("api")) {
                connectionsList.push(["client", "api", "HTTPS Request", "request"]);
            }

            if (nodeIds.includes("gateway") && nodeIds.includes("auth")) {
                connectionsList.push(["gateway", "auth", "Authorize Key", "request"]);
            }
            if (nodeIds.includes("gateway") && nodeIds.includes("api")) {
                connectionsList.push(["gateway", "api", "Forward Route", "request"]);
            }
            if (nodeIds.includes("api") && nodeIds.includes("worker")) {
                connectionsList.push(["api", "worker", "Publish Event Task", "data"]);
            }
            if (nodeIds.includes("api") && nodeIds.includes("db")) {
                connectionsList.push(["api", "db", "Read/Write Queries", "data"]);
            }
            if (nodeIds.includes("worker") && nodeIds.includes("db")) {
                connectionsList.push(["worker", "db", "Save Task Result", "data"]);
            }

            if (connectionsList.length === 0 && nodeIds.length >= 2) {
                connectionsList.push([nodeIds[0], nodeIds[1], "HTTP Request", "request"]);
            }

            const flowSteps = [];
            nodesList.forEach(n => {
                flowSteps.push({
                    node: n.id,
                    label: `Activate ${n.title}`,
                    detail: `Workflow processes payload at ${n.title}.`,
                    data: `{"activated": "${n.id}"}`
                });
            });

            flowsList.push({
                id: "generated_flow",
                title: "Simulated Data Flow Scenario",
                subtitle: "Automatically generated playback timeline for design concept",
                steps: flowSteps
            });

            const spec = {
                id: "project-" + Date.now(),
                title: titleVal,
                version: "1.0",
                nodes: nodesList,
                connections: connectionsList,
                flows: flowsList
            };

            const custom = getCustomProjects();
            custom.push(spec);
            saveCustomProjects(custom);
            loadProject(spec);
            closeWizardModal();
            showToast(`Successfully designed and generated '${titleVal}'!`);
        });
    }

    let editingProjectId = null;

    function openProjectModal(projId = null) {
        editingProjectId = projId;
        if (projId) {
            const projects = getAvailableProjects();
            const proj = projects.find(p => p.id === projId);
            if (!proj) return;
            
            projectModalTitle.textContent = "Edit Project Settings";
            projectTitleInput.value = proj.title || "";
            projectVersionInput.value = proj.version || "1.0";
            
            const spec = {
                title: proj.title,
                version: proj.version,
                description: proj.description || undefined,
                nodes: proj.nodes || [],
                connections: proj.connections || [],
                flows: proj.flows || [],
                layers: proj.layers || undefined,
                trustBoundary: proj.hasOwnProperty('trustBoundary') ? proj.trustBoundary : undefined
            };
            projectJsonInput.value = exportProjectToMarkdown(spec);
        } else {
            projectModalTitle.textContent = "Create New Project";
            projectTitleInput.value = "";
            projectVersionInput.value = "1.0";
            
            const defaultSpec = {
                title: "Untitled Project",
                version: "1.0",
                nodes: SKELETON_TEMPLATE.nodes || [],
                connections: SKELETON_TEMPLATE.connections || [],
                flows: SKELETON_TEMPLATE.flows || []
            };
            projectJsonInput.value = exportProjectToMarkdown(defaultSpec);
        }
        projectModal.classList.add("show");
    }

    function closeProjectModal() {
        projectModal.classList.remove("show");
        editingProjectId = null;
    }

    function saveProjectFromModal() {
        let title = projectTitleInput.value.trim();
        let version = projectVersionInput.value.trim() || "1.0";
        const jsonStr = projectJsonInput.value.trim();
        
        let spec;
        const isMarkdown = !jsonStr.startsWith("{");
        
        if (isMarkdown) {
            try {
                spec = parseMarkdownToProject(jsonStr);
            } catch (e) {
                alert("Invalid Markdown format in Architecture Specification: " + e.message);
                return;
            }
        } else {
            try {
                spec = JSON.parse(jsonStr);
            } catch (e) {
                alert("Invalid JSON format in Architecture Specification: " + e.message);
                return;
            }
        }
        
        // Validate parsed project data
        try {
            validateProjectData(spec);
        } catch (e) {
            alert("Specification validation failed: " + e.message);
            return;
        }
        
        if (isMarkdown) {
            if (spec.title) title = spec.title;
            if (spec.version) version = spec.version;
        }
        
        if (!title) {
            alert("Project Title is required.");
            return;
        }
        
        const custom = getCustomProjects();
        
        if (editingProjectId) {
            const idx = custom.findIndex(p => p.id === editingProjectId);
            if (idx === -1) {
                // If editing built-in project, save as a new custom project clone
                const newProj = {
                    id: "project_" + Date.now(),
                    ...spec,
                    title,
                    version
                };
                custom.push(newProj);
                saveCustomProjects(custom);
                loadProject(newProj);
                showToast(`Built-in project cloned as '${title}'`);
            } else {
                custom[idx] = {
                    id: editingProjectId,
                    ...spec,
                    title,
                    version
                };
                saveCustomProjects(custom);
                if (currentProject && currentProject.id === editingProjectId) {
                    loadProject(custom[idx]);
                }
                showToast(`Project '${title}' updated.`);
            }
        } else {
            const newProj = {
                id: "project_" + Date.now(),
                ...spec,
                title,
                version
            };
            custom.push(newProj);
            saveCustomProjects(custom);
            loadProject(newProj);
            showToast(`Project '${title}' created successfully.`);
        }
        
        closeProjectModal();
    }

    function startupProjectSystem() {
        const list = getAvailableProjects();
        const activeId = localStorage.getItem("archbench_active_project_id");
        let activeProj = list.find(p => p.id === activeId);
        
        if (!activeProj && list.length > 0) {
            activeProj = list[0];
        }
        
        if (activeProj) {
            loadProject(activeProj);
        }
        
        // Initialize default sidebar tab and active headers on launch
        switchTab("ai");

        if (IS_HOSTED && liveWatchLabel) {
            liveWatchLabel.textContent = "Local Only";
        }
    }

    // ─── Attach Listeners ────────────────────────────────────────



    // Project Dropdown Events
    if (btnProjectSelector) {
        btnProjectSelector.addEventListener("click", (e) => {
            e.stopPropagation();
            projectDropdown.classList.toggle("show");
            if (projectDropdown.classList.contains("show")) {
                populateProjectDropdownList();
            }
        });
    }

    document.addEventListener("click", () => {
        if (projectDropdown) projectDropdown.classList.remove("show");
    });

    if (projectDropdown) {
        projectDropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });
    }

    if (btnProjectNew) {
        btnProjectNew.addEventListener("click", () => {
            if (projectDropdown) projectDropdown.classList.remove("show");
            openWizardModal();
        });
    }

    if (dropdownBtnEdit) {
        dropdownBtnEdit.addEventListener("click", () => {
            if (projectDropdown) projectDropdown.classList.remove("show");
            if (currentProject) {
                openProjectModal(currentProject.id);
            }
        });
    }

    if (btnProjectImport) {
        btnProjectImport.addEventListener("click", () => {
            if (projectDropdown) projectDropdown.classList.remove("show");
            if (projectFileInput) projectFileInput.click();
        });
    }

    if (projectFileInput) {
        projectFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const isMd = file.name.toLowerCase().endsWith(".md");
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const text = event.target.result;
                    let parsed;
                    if (isMd) {
                        parsed = parseMarkdownToProject(text);
                    } else {
                        parsed = JSON.parse(text);
                    }
                    
                    if (!parsed.title || !parsed.nodes || !parsed.connections || !parsed.flows) {
                        throw new Error("Invalid project structure. Requires 'title', 'nodes', 'connections', and 'flows'.");
                    }
                    
                    validateProjectData(parsed);
                    
                    parsed.id = "project_" + Date.now();
                    
                    const custom = getCustomProjects();
                    custom.push(parsed);
                    saveCustomProjects(custom);
                    
                    loadProject(parsed);
                    showToast(`Project '${parsed.title}' imported successfully!`);
                } catch (err) {
                    alert("Failed to import project: " + err.message);
                }
                projectFileInput.value = "";
            };
            reader.readAsText(file);
        });
    }

    if (dropdownBtnExport) {
        dropdownBtnExport.addEventListener("click", () => {
            if (projectDropdown) projectDropdown.classList.remove("show");
            if (!currentProject) {
                showToast("No active project to export!");
                return;
            }
            
            const exportData = {
                id: currentProject.id,
                title: currentProject.title,
                version: currentProject.version,
                nodes: NODES,
                connections: CONNECTIONS,
                flows: FLOWS,
                layers: currentProject.layers || null,
                trustBoundary: currentProject.hasOwnProperty('trustBoundary') ? currentProject.trustBoundary : undefined
            };
            
            const md = exportProjectToMarkdown(exportData);
            const safeTitle = currentProject.title.toLowerCase().replace(/[^a-z0-9]/g, "_");
            downloadFile(md, `archbench_project_${safeTitle}_${Date.now()}.md`, "text/markdown");
            showToast("Project configuration exported successfully as Markdown.");
        });
    }

    // Modal Control Events
    if (projectModalClose) projectModalClose.addEventListener("click", closeProjectModal);
    if (projectModalCancel) projectModalCancel.addEventListener("click", closeProjectModal);
    if (projectModalSave) projectModalSave.addEventListener("click", saveProjectFromModal);

    // ─── Architecture Spec Kit Helpers ──────────────────────────
    const linkSpecTemplate = document.getElementById("link-spec-template");
    const linkSpecPrompt = document.getElementById("link-spec-prompt");

    if (linkSpecTemplate) {
        linkSpecTemplate.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                const resp = await fetch("docs/architecture.template.md");
                if (!resp.ok) throw new Error("Failed to load template: " + resp.status);
                const templateText = await resp.text();
                if (projectJsonInput) {
                    projectJsonInput.value = templateText;
                    projectJsonInput.focus();
                }
                showToast("📋 Architecture template loaded into editor.");
            } catch (err) {
                console.error("Load template error:", err);
                showToast("⚠️ Could not load template file.");
            }
        });
    }

    if (linkSpecPrompt) {
        linkSpecPrompt.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                const resp = await fetch("docs/agent_prompt.md");
                if (!resp.ok) throw new Error("Failed to load agent prompt: " + resp.status);
                const promptText = await resp.text();
                await navigator.clipboard.writeText(promptText);
                showToast("🤖 Agent prompt copied to clipboard! Paste into your LLM client.");
            } catch (err) {
                console.error("Copy agent prompt error:", err);
                // Fallback: open in new tab if clipboard fails
                try {
                    const resp2 = await fetch("docs/agent_prompt.md");
                    const text2 = await resp2.text();
                    const blob = new Blob([text2], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                    showToast("📄 Agent prompt opened in new tab (clipboard unavailable).");
                } catch (e2) {
                    showToast("⚠️ Could not load agent prompt file.");
                }
            }
        });
    }


    // Live watch detection and Terminal command shell logic moved to js/live-watch.js and js/terminal.js


    // ─── Init ───────────────────────────────────────────────────

    // Replaces default startup static drawings by loading project dynamically
    document.body.dataset.appEnv = APP_ENV;
    startupProjectSystem();
    initCanvasRenderer();
    initAIEngine();
    initBatchRunner();
    initFlowEngine();

    setTimeout(() => {
        reloadHistoryCache().catch(err => console.error("Could not load history on startup:", err));
    }, 250);

    // Help auto-fade
    setTimeout(() => {
        if (helpHint) { 
            helpHint.style.opacity = "0"; 
            setTimeout(() => { if(helpHint) helpHint.style.display = "none"; }, 600); 
        }
    }, 6000);
