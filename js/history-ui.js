import { currentProject, updateArchitectureHealthUI, updateExecutionLogUI, switchTab, setUnifiedBatchLog } from "../graph.js";
import { localHistoryCache, reloadHistoryCache, deleteAuditRun } from "./db.js";
import { calculateArchitectureQualityScore } from "./metrics.js";
import { showToast, downloadFile } from "./utils.js";

let selectedRunsForComparison = [];

export function updateArchitectureHistoryUI() {
    const historyReportContent = document.getElementById("history-report-content");
    if (!historyReportContent) return;

    reloadHistoryCache().then(() => {
        const currentProjId = currentProject ? currentProject.id : "demo-sample";
        const runs = localHistoryCache.auditRuns.filter(r => !r.projectId || r.projectId === currentProjId);
        const healths = localHistoryCache.healthHistory.filter(h => !h.projectId || h.projectId === currentProjId);
        const snaps = localHistoryCache.architectureSnapshots.filter(s => !s.projectId || s.projectId === currentProjId);

        if (runs.length === 0) {
            historyReportContent.innerHTML = `
                <p style="font-size:11px; color:var(--text-secondary); line-height:1.5; font-style: italic;">
                    No audit history recorded yet. Run a sequential simulation audit in the Flow Checklist tab to automatically save your first run.
                </p>
            `;
            return;
        }

        const sortedRuns = [...runs].reverse();

        let html = `
        <style>
            .history-container {
                display: flex;
                flex-direction: column;
                gap: 16px;
                color: var(--text-primary);
                font-size: 11px;
                line-height: 1.4;
            }
            .history-header {
                font-size: 12px;
                font-weight: 700;
                color: #fff;
                border-left: 3px solid hsl(270, 70%, 60%);
                padding-left: 8px;
                margin-top: 8px;
                margin-bottom: 4px;
            }
            .history-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 10px;
            }
            .history-table th, .history-table td {
                padding: 6px;
                text-align: left;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }
            .history-table th {
                color: var(--text-secondary);
                font-weight: 600;
            }
            .action-btn-small {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                padding: 2px 6px;
                color: #fff;
                font-size: 9px;
                cursor: pointer;
                margin-right: 4px;
            }
            .action-btn-small:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            .delete-btn-small {
                background: rgba(231, 76, 60, 0.1);
                border: 1px solid rgba(231, 76, 60, 0.2);
                color: #e74c3c;
            }
            .delete-btn-small:hover {
                background: rgba(231, 76, 60, 0.25);
            }
            .compare-box {
                background: rgba(180, 130, 255, 0.05);
                border: 1px solid rgba(180, 130, 255, 0.15);
                border-radius: 8px;
                padding: 10px;
            }
            .compare-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
                margin-top: 6px;
            }
            .compare-card {
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 6px;
                padding: 6px;
                text-align: center;
            }
            .compare-val {
                font-size: 14px;
                font-weight: 800;
            }
            .compare-lbl {
                font-size: 9px;
                color: var(--text-secondary);
            }
            .compare-pct {
                font-size: 9px;
                font-weight: 700;
                margin-top: 2px;
            }
            .timeline-flow {
                position: relative;
                padding-left: 16px;
                margin-left: 8px;
                border-left: 1px dashed rgba(255, 255, 255, 0.15);
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .timeline-node {
                position: relative;
            }
            .timeline-node::before {
                content: '';
                position: absolute;
                left: -21px;
                top: 4px;
                width: 9px;
                height: 9px;
                border-radius: 50%;
                background: hsl(270, 70%, 60%);
                border: 2px solid var(--bg-void);
            }
        </style>
        <div class="history-container">
            <!-- Runs List -->
            <div>
                <div class="history-header">1. Architecture History Records</div>
                <table class="history-table">
                    <thead>
                        <tr>
                            <th style="width: 25px;">Select</th>
                            <th>Audit Run</th>
                            <th>Timestamp</th>
                            <th style="text-align: center;">Flows</th>
                            <th style="text-align: center;">Steps</th>
                            <th style="text-align: center;">Score</th>
                            <th style="text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        sortedRuns.forEach((run, index) => {
            const dateStr = new Date(run.timestamp).toLocaleString();
            const runScore = calculateArchitectureQualityScore(run.architectureHealthReport);
            const isChecked = selectedRunsForComparison.includes(run.id) ? "checked" : "";
            
            let badgeStyle = "background: rgba(231,76,60,0.15); color: #e74c3c; border: 1px solid rgba(231,76,60,0.3);";
            if (runScore >= 80) {
                badgeStyle = "background: rgba(46,204,113,0.15); color: #2ecc71; border: 1px solid rgba(46,204,113,0.3);";
            } else if (runScore >= 50) {
                badgeStyle = "background: rgba(241,196,15,0.15); color: #f1c40f; border: 1px solid rgba(241,196,15,0.3);";
            }

            html += `
                <tr data-run-id="${run.id}">
                    <td style="text-align: center;">
                        <input type="checkbox" class="compare-checkbox" value="${run.id}" ${isChecked}>
                    </td>
                    <td style="font-weight: 600; color: #fff;">Audit #${runs.length - index} (v${run.architectureVersion})</td>
                    <td>${dateStr}</td>
                    <td style="text-align: center; font-family: monospace;">${run.flowsExecuted.length}</td>
                    <td style="text-align: center; font-family: monospace;">${run.architectureHealthReport.summary.totalSteps}</td>
                    <td style="text-align: center;">
                        <span class="health-badge" style="${badgeStyle}">${runScore}</span>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                        <button class="action-btn-small btn-view-run" data-id="${run.id}" title="Load this simulation data to view full report">👁️ View</button>
                        <button class="action-btn-small btn-export-run" data-id="${run.id}">📤 Export</button>
                        <button class="action-btn-small delete-btn-small btn-delete-run" data-id="${run.id}">🗑️ Delete</button>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
                <div style="font-size: 9px; color: var(--text-secondary); margin-top: 4px; font-style: italic;">
                    * Select exactly 2 checkboxes to trigger Audit Comparison Mode.
                </div>
            </div>
        `;

        // Comparison mode
        if (selectedRunsForComparison.length === 2) {
            const runA = runs.find(r => r.id === selectedRunsForComparison[0]);
            const runB = runs.find(r => r.id === selectedRunsForComparison[1]);

            if (runA && runB) {
                const [olderRun, newerRun] = runA.timestamp < runB.timestamp ? [runA, runB] : [runB, runA];
                
                const scoreA = calculateArchitectureQualityScore(olderRun.architectureHealthReport);
                const scoreB = calculateArchitectureQualityScore(newerRun.architectureHealthReport);
                const spofA = olderRun.architectureHealthReport.risks.filter(r => r.title === "Single Point of Failure").length;
                const spofB = newerRun.architectureHealthReport.risks.filter(r => r.title === "Single Point of Failure").length;
                const couplingA = olderRun.architectureHealthReport.risks.filter(r => r.title === "High Coupling").length;
                const couplingB = newerRun.architectureHealthReport.risks.filter(r => r.title === "High Coupling").length;
                const unusedA = olderRun.architectureHealthReport.leastActiveNodes.filter(n => n.count === 0).length;
                const unusedB = newerRun.architectureHealthReport.leastActiveNodes.filter(n => n.count === 0).length;
                const dbA = olderRun.architectureHealthReport.databaseImpact.dbTouchCount;
                const dbB = newerRun.architectureHealthReport.databaseImpact.dbTouchCount;

                const compSPOF = formatComparisonMetric(spofA, spofB, true);
                const compCoupling = formatComparisonMetric(couplingA, couplingB, true);
                const compUnused = formatComparisonMetric(unusedA, unusedB, true);
                const compScore = formatComparisonMetric(scoreA, scoreB, false);
                const compDb = formatComparisonMetric(dbA, dbB, true);

                html += `
                    <div class="compare-box">
                        <div style="font-weight: 700; color: hsl(280, 85%, 75%); display: flex; align-items:center; gap: 4px;">
                            <span>⚖️ Audit Comparison Mode</span>
                            <span style="font-size: 9px; font-weight: normal; color: var(--text-secondary);">
                                (${new Date(olderRun.timestamp).toLocaleDateString()} vs ${new Date(newerRun.timestamp).toLocaleDateString()})
                            </span>
                        </div>
                        <div class="compare-grid">
                            <div class="compare-card">
                                <div class="compare-lbl">Architecture Score</div>
                                <div class="compare-val" style="color: ${scoreB >= scoreA ? '#2ecc71' : '#e74c3c'};">${scoreA} → ${scoreB}</div>
                                <div class="compare-pct" style="color: ${scoreB >= scoreA ? '#2ecc71' : '#e74c3c'};">${compScore}</div>
                            </div>
                            <div class="compare-card">
                                <div class="compare-lbl">SPOF Count</div>
                                <div class="compare-val" style="color: ${spofB <= spofA ? '#2ecc71' : '#e74c3c'};">${spofA} → ${spofB}</div>
                                <div class="compare-pct" style="color: ${spofB <= spofA ? '#2ecc71' : '#e74c3c'};">${compSPOF}</div>
                            </div>
                            <div class="compare-card">
                                <div class="compare-lbl">High Coupling</div>
                                <div class="compare-val" style="color: ${couplingB <= couplingA ? '#2ecc71' : '#e74c3c'};">${couplingA} → ${couplingB}</div>
                                <div class="compare-pct" style="color: ${couplingB <= couplingA ? '#2ecc71' : '#e74c3c'};">${compCoupling}</div>
                            </div>
                            <div class="compare-card">
                                <div class="compare-lbl">Unused Components</div>
                                <div class="compare-val" style="color: ${unusedB <= unusedA ? '#2ecc71' : '#e74c3c'};">${unusedA} → ${unusedB}</div>
                                <div class="compare-pct" style="color: ${unusedB <= unusedA ? '#2ecc71' : '#e74c3c'};">${compUnused}</div>
                            </div>
                            <div class="compare-card" style="grid-column: span 2;">
                                <div class="compare-lbl">Database Operations</div>
                                <div class="compare-val" style="color: ${dbB <= dbA ? '#2ecc71' : '#e74c3c'};">${dbA} → ${dbB} touches</div>
                                <div class="compare-pct" style="color: ${dbB <= dbA ? '#2ecc71' : '#e74c3c'};">${compDb}</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // Timeline
        html += `
            <div>
                <div class="history-header">2. Architecture Evolution Timeline</div>
                <div class="timeline-flow" style="margin-top: 10px;">
        `;

        snaps.forEach((snap, idx) => {
            const dateStr = new Date(snap.timestamp).toLocaleDateString();
            const healthRec = healths.find(h => h.id === "health_" + snap.id.split("_")[1]);
            const matchingRun = runs.find(r => r.id === "run_" + snap.id.split("_")[1]);
            const scoreVal = matchingRun ? calculateArchitectureQualityScore(matchingRun.architectureHealthReport) : "N/A";

            html += `
                <div class="timeline-node">
                    <div style="font-weight: 700; color: #fff;">Audit #${idx + 1} (${dateStr})</div>
                    <div style="color: var(--text-secondary); margin-top: 2px;">
                        Nodes: <b style="color: #fff;">${snap.nodeCount}</b> | 
                        Connections: <b style="color: #fff;">${snap.connectionCount}</b> | 
                        SPOFs: <b style="color: #fff;">${healthRec ? healthRec.spofCount : "N/A"}</b> | 
                        Score: <b style="color: hsl(220, 95%, 70%);">${scoreVal}/100</b>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        </div>
        `;

        historyReportContent.innerHTML = html;

        // Wire up event listeners
        historyReportContent.querySelectorAll(".compare-checkbox").forEach(cb => {
            cb.addEventListener("change", (e) => {
                const val = e.target.value;
                if (e.target.checked) {
                    selectedRunsForComparison.push(val);
                    if (selectedRunsForComparison.length > 2) {
                        selectedRunsForComparison.shift();
                    }
                } else {
                    selectedRunsForComparison = selectedRunsForComparison.filter(id => id !== val);
                }
                updateArchitectureHistoryUI();
            });
        });

        historyReportContent.querySelectorAll(".btn-view-run").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.target.getAttribute("data-id");
                const run = runs.find(r => r.id === id);
                if (run) {
                    setUnifiedBatchLog(run.unifiedAuditLog);
                    updateArchitectureHealthUI();
                    updateExecutionLogUI();
                    switchTab("health");
                    showToast(`Loaded Audit run (${new Date(run.timestamp).toLocaleDateString()}) into memory!`);
                }
            });
        });

        historyReportContent.querySelectorAll(".btn-export-run").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.target.getAttribute("data-id");
                const run = runs.find(r => r.id === id);
                if (run) {
                    const json = JSON.stringify(run, null, 2);
                    downloadFile(json, `archbench_audit_run_${id}_${Date.now()}.json`, "application/json");
                    showToast("JSON audit file exported successfully.");
                }
            });
        });

        historyReportContent.querySelectorAll(".btn-delete-run").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.target.getAttribute("data-id");
                if (confirm("Are you sure you want to permanently delete this audit run from local storage?")) {
                    deleteAuditRun(id).then(() => {
                        selectedRunsForComparison = selectedRunsForComparison.filter(val => val !== id);
                        updateArchitectureHistoryUI();
                        showToast("Audit run deleted successfully.");
                    });
                }
            });
        });
    }).catch(err => {
        console.error("UI history update failed:", err);
        historyReportContent.innerHTML = `<p style="color: #e74c3c;">Failed to load architecture history: ${err.message}</p>`;
    });
}

function formatComparisonMetric(valA, valB, lowerIsBetter) {
    if (valA === valB) return "No Change";
    if (lowerIsBetter) {
        if (valB === 0 && valA > 0) return "Resolved";
        const diff = valB - valA;
        const pct = Math.round((diff / valA) * 100);
        if (diff < 0) return `Improvement: ${pct}%`;
        return `Regression: +${pct}%`;
    } else {
        const diff = valB - valA;
        const pct = Math.round((diff / valA) * 100);
        if (diff > 0) return `Improvement: +${pct}%`;
        return `Regression: ${pct}%`;
    }
}
