import { currentProject, NODES, CONNECTIONS, FLOWS, unifiedBatchLog, localHistoryCache, switchTab } from "../graph.js";
import { generateArchitectureHealthReport } from "./reports/health-engine.js";
import { calculateArchitectureQualityScore } from "./metrics.js";

let termInstance = null;
let termInputBuffer = "";
let termHistory = [];
let termHistoryIndex = -1;

const terminalContainer = document.getElementById("terminal-container");

export function initTerminalOnce() {
    if (termInstance) {
        setTimeout(() => termInstance.focus(), 50);
        return;
    }
    if (!terminalContainer) return;
    if (!window.Terminal) {
        terminalContainer.innerHTML = `<span style="color: hsl(0, 72%, 62%); font-size: 11px;">Error: xterm.js library could not be loaded from CDN.</span>`;
        return;
    }

    termInstance = new window.Terminal({
        cursorBlink: true,
        theme: {
            background: '#07080d',
            foreground: '#e2e4e9',
            cursor: '#b482ff',
            selection: 'rgba(180, 130, 255, 0.3)'
        },
        fontSize: 10,
        fontFamily: 'monospace',
        rows: 11,
        convertEol: true
    });

    termInstance.open(terminalContainer);
    termInstance.writeln("\x1b[1;35mArchBench Project Agent Terminal v0.1\x1b[0m");
    termInstance.writeln("Type \x1b[32m'help'\x1b[0m to list available workspace commands.\n");
    
    writePrompt();

    termInstance.onKey(e => {
        const char = e.key;
        const code = e.domEvent.keyCode;

        if (code === 13) { 
            termInstance.write("\r\n");
            const cmd = termInputBuffer.trim();
            if (cmd) {
                termHistory.push(termInputBuffer);
                termHistoryIndex = termHistory.length;
                processTerminalCommand(cmd);
            } else {
                writePrompt();
            }
            termInputBuffer = "";
        } else if (code === 8) { 
            if (termInputBuffer.length > 0) {
                termInputBuffer = termInputBuffer.slice(0, -1);
                termInstance.write("\b \b");
            }
        } else if (code === 38) { 
            if (termHistory.length > 0 && termHistoryIndex > 0) {
                termHistoryIndex--;
                clearCurrentTermLine();
                termInputBuffer = termHistory[termHistoryIndex];
                termInstance.write(termInputBuffer);
            }
        } else if (code === 40) { 
            if (termHistory.length > 0 && termHistoryIndex < termHistory.length - 1) {
                termHistoryIndex++;
                clearCurrentTermLine();
                termInputBuffer = termHistory[termHistoryIndex];
                termInstance.write(termInputBuffer);
            } else if (termHistoryIndex === termHistory.length - 1) {
                termHistoryIndex = termHistory.length;
                clearCurrentTermLine();
                termInputBuffer = "";
            }
        } else if (code >= 37 && code <= 40) {
            // Ignore cursor arrow navigations
        } else {
            termInputBuffer += char;
            termInstance.write(char);
        }
    });

    setTimeout(() => termInstance.focus(), 50);
}

export function writePrompt() {
    const projName = currentProject ? currentProject.title.toLowerCase().replace(/[^a-z0-9]/g, "-") : "untitled";
    termInstance.write(`\x1b[1;36marchbench:${projName}$ \x1b[0m`);
}

export function clearCurrentTermLine() {
    const projName = currentProject ? currentProject.title.toLowerCase().replace(/[^a-z0-9]/g, "-") : "untitled";
    const promptLen = `archbench:${projName}$ `.length;
    termInstance.write("\r" + " ".repeat(promptLen + termInputBuffer.length + 10) + "\r");
    writePrompt();
}

export function processTerminalCommand(line) {
    const args = line.split(/\s+/);
    const cmd = args[0].toLowerCase();

    if (cmd === 'help') {
        termInstance.writeln("\x1b[1mAvailable Workspace Commands:\x1b[0m");
        termInstance.writeln("  \x1b[32mhelp\x1b[0m                  List available commands.");
        termInstance.writeln("  \x1b[32march parse\x1b[0m            Validate and parse the active project spec.");
        termInstance.writeln("  \x1b[32march simulate [flow]\x1b[0m  Simulate a sequence flow by ID.");
        termInstance.writeln("  \x1b[32march audit\x1b[0m             Run structural rules and health audits.");
        termInstance.writeln("  \x1b[32march compare\x1b[0m           Compare current project against local snapshots.");
        termInstance.writeln("  \x1b[32march export\x1b[0m            Download active specification as Markdown.");
        termInstance.writeln("  \x1b[32mclear\x1b[0m                 Clear the console.");
        termInstance.writeln("");
        writePrompt();
        return;
    }

    if (cmd === 'clear') {
        termInstance.clear();
        writePrompt();
        return;
    }

    if (cmd === 'arch') {
        const sub = args[1] ? args[1].toLowerCase() : "";
        
        if (sub === 'parse') {
            termInstance.writeln(`\x1b[35m[Parsing Workspace Project: ${currentProject ? currentProject.title : "Untitled"}]\x1b[0m`);
            termInstance.writeln(`- Specification Version: ${currentProject ? currentProject.version : "1.0"}`);
            termInstance.writeln(`- Components (Nodes): ${NODES.length} loaded`);
            termInstance.writeln(`- Dependencies (Connections): ${CONNECTIONS.length} loaded`);
            termInstance.writeln(`- Workflows (Flows): ${FLOWS.length} loaded`);
            
            termInstance.writeln("\n\x1b[1mActive Nodes list:\x1b[0m");
            NODES.forEach(n => {
                termInstance.writeln(`  * \x1b[36m${n.id}\x1b[0m [${n.category}]: ${n.title} (x:${n.x}, y:${n.y})`);
            });
            termInstance.writeln("");
            writePrompt();
            return;
        }

        if (sub === 'simulate') {
            const targetFlowId = args[2];
            if (!targetFlowId) {
                termInstance.writeln("Error: Missing target flow ID parameter.");
                termInstance.writeln("Available Flows:");
                FLOWS.forEach(f => {
                    termInstance.writeln(`  - \x1b[32m${f.id}\x1b[0m: ${f.title}`);
                });
                termInstance.writeln("");
                writePrompt();
                return;
            }

            const flow = FLOWS.find(f => f.id === targetFlowId || f.id.toLowerCase() === targetFlowId.toLowerCase());
            if (!flow) {
                termInstance.writeln(`\x1b[31mError: Flow ID '${targetFlowId}' not found.\x1b[0m`);
                writePrompt();
                return;
            }

            termInstance.writeln(`\x1b[35mStarting Simulation playback for flow: ${flow.title} (${flow.id})\x1b[0m`);
            
            switchTab("simulator");
            
            const flowButton = document.querySelector(`.flow-btn[data-flow-id="${flow.id}"]`);
            if (flowButton) {
                flowButton.click();
                termInstance.writeln("🚀 Playback window triggered successfully.");
            } else {
                termInstance.writeln("⚠️ Warning: Visual controller button not found, but simulation model loaded.");
            }
            
            writePrompt();
            return;
        }

        if (sub === 'audit') {
            termInstance.writeln("\x1b[35m[Running Workspace Audit...]\x1b[0m");
            
            let couplingAnomalies = 0;
            CONNECTIONS.forEach(conn => {
                const fromNode = NODES.find(n => n.id === conn[0]);
                const toNode = NODES.find(n => n.id === conn[1]);
                if (fromNode && toNode) {
                    if (fromNode.category === 'Entry Point' && toNode.category === 'Infrastructure') {
                        termInstance.writeln(`  \x1b[33m⚠️ WARNING: Direct coupling found from Entry Point '${fromNode.id}' to Infrastructure Store '${toNode.id}'!\x1b[0m`);
                        couplingAnomalies++;
                    }
                }
            });

            if (unifiedBatchLog) {
                const health = generateArchitectureHealthReport(unifiedBatchLog);
                if (health) {
                    termInstance.writeln(`- Quality Health Score: \x1b[32m${calculateArchitectureQualityScore(health)}/100\x1b[0m`);
                    termInstance.writeln(`- SPOF (Single Point of Failure) Count: ${health.risks.filter(r => r.title === "Single Point of Failure").length}`);
                    termInstance.writeln(`- Boundary Entries Count: ${health.trustBoundary.boundaryEntries}`);
                }
            } else {
                termInstance.writeln(`- Coupling anomalies detected: ${couplingAnomalies}`);
                termInstance.writeln("\x1b[90m(Run flow batch checklists for complete health and SPOF analytics)\x1b[0m");
            }
            termInstance.writeln("");
            writePrompt();
            return;
        }

        if (sub === 'compare') {
            termInstance.writeln("\x1b[35m[Querying Local IndexedDB Snapshots History...]\x1b[0m");
            
            const snaps = localHistoryCache.architectureSnapshots;
            if (!snaps || snaps.length === 0) {
                termInstance.writeln("No snapshots found in local history database.");
            } else {
                termInstance.writeln(`Found ${snaps.length} local snapshots:`);
                snaps.forEach((snap, idx) => {
                    const dateStr = new Date(snap.timestamp).toLocaleString();
                    termInstance.writeln(`  [#${idx + 1}] Version: ${snap.architectureVersion} - Nodes: ${snap.nodeCount}, Links: ${snap.connectionCount} (${dateStr})`);
                });
            }
            termInstance.writeln("");
            writePrompt();
            return;
        }

        if (sub === 'export') {
            termInstance.writeln("Generating Markdown specification file download...");
            
            const exportBtn = document.getElementById("dropdown-btn-export");
            if (exportBtn) {
                exportBtn.click();
                termInstance.writeln("✅ Specification file download triggered.");
            } else {
                termInstance.writeln("❌ Error: Export controller button not found.");
            }
            termInstance.writeln("");
            writePrompt();
            return;
        }
    }

    termInstance.writeln(`\x1b[31mCommand not recognized: '${line}'. Type 'help' for options.\x1b[0m`);
    termInstance.writeln("");
    writePrompt();
}
