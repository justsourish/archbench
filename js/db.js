import { currentProject, NODES, CONNECTIONS, FLOWS } from "../graph.js";
import { generateArchitectureHealthReport } from "./reports/health-engine.js";
import { generateKnowledgePackJSON } from "./reports/generators.js";
import { calculateDatabaseDependencyScore } from "./metrics.js";

let db = null;
export let localHistoryCache = { auditRuns: [], architectureSnapshots: [], healthHistory: [] };

export function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }
        const request = indexedDB.open("ArchitectureWorkbench", 1);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains("auditRuns")) {
                const store = database.createObjectStore("auditRuns", { keyPath: "id" });
                store.createIndex("timestamp", "timestamp", { unique: false });
                store.createIndex("architectureVersion", "architectureVersion", { unique: false });
            }
            if (!database.objectStoreNames.contains("architectureSnapshots")) {
                database.createObjectStore("architectureSnapshots", { keyPath: "id" });
            }
            if (!database.objectStoreNames.contains("healthHistory")) {
                database.createObjectStore("healthHistory", { keyPath: "id" });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => {
            console.error("IndexedDB error:", e);
            reject(e);
        };
    });
}

export function reloadHistoryCache() {
    return initDB().then(database => {
        return new Promise((resolve, reject) => {
            const tx = database.transaction(["auditRuns", "architectureSnapshots", "healthHistory"], "readonly");
            const runsStore = tx.objectStore("auditRuns");
            const snapsStore = tx.objectStore("architectureSnapshots");
            const healthStore = tx.objectStore("healthHistory");

            const runsReq = runsStore.getAll();
            const snapsReq = snapsStore.getAll();
            const healthReq = healthStore.getAll();

            tx.oncomplete = () => {
                localHistoryCache.auditRuns = runsReq.result || [];
                localHistoryCache.auditRuns.sort((a, b) => a.timestamp - b.timestamp);

                localHistoryCache.architectureSnapshots = snapsReq.result || [];
                localHistoryCache.architectureSnapshots.sort((a, b) => a.timestamp - b.timestamp);

                localHistoryCache.healthHistory = healthReq.result || [];
                localHistoryCache.healthHistory.sort((a, b) => a.timestamp - b.timestamp);

                resolve(localHistoryCache);
            };
            tx.onerror = (err) => {
                console.error("Error reloading history cache:", err);
                reject(err);
            };
        });
    });
}

export function saveAuditRun(batchLog) {
    if (!batchLog) return Promise.resolve();

    return initDB().then(database => {
        const timestamp = Date.now();
        const runId = "run_" + timestamp;
        const report = generateArchitectureHealthReport(batchLog);
        const pack = generateKnowledgePackJSON();
        const version = batchLog.version || "1.0";

        const projId = currentProject ? currentProject.id : "demo-sample";

        const auditRun = {
            id: runId,
            projectId: projId,
            timestamp: timestamp,
            architectureVersion: version,
            flowsExecuted: batchLog.flowsSimulated,
            unifiedAuditLog: batchLog,
            architectureHealthReport: report,
            knowledgePack: pack
        };

        const snapshot = {
            id: "snap_" + timestamp,
            projectId: projId,
            timestamp: timestamp,
            architectureVersion: version,
            nodeCount: NODES.length,
            connectionCount: CONNECTIONS.length,
            flowCount: FLOWS.length,
            snapshotMetadata: {
                flowsSimulated: batchLog.flowsSimulated
            }
        };

        const healthHist = {
            id: "health_" + timestamp,
            projectId: projId,
            timestamp: timestamp,
            architectureVersion: version,
            totalFlows: report.summary.flowsExecuted,
            totalSteps: report.summary.totalSteps,
            mostActiveNode: report.mostActiveNode,
            leastActiveNode: report.leastActiveNodes[0] || { title: "N/A", count: 0 },
            criticalDependencies: report.criticalDeps,
            unusedComponents: report.leastActiveNodes.filter(n => n.count === 0),
            unusedConnections: report.risks.filter(r => r.title === "Unused Connection"),
            highCouplingCount: report.risks.filter(r => r.title === "High Coupling").length,
            spofCount: report.risks.filter(r => r.title === "Single Point of Failure").length,
            databaseDependencyScore: calculateDatabaseDependencyScore(report)
        };

        return new Promise((resolve, reject) => {
            const tx = database.transaction(["auditRuns", "architectureSnapshots", "healthHistory"], "readwrite");
            tx.objectStore("auditRuns").put(auditRun);
            tx.objectStore("architectureSnapshots").put(snapshot);
            tx.objectStore("healthHistory").put(healthHist);

            tx.oncomplete = () => {
                console.log("Successfully saved audit run history.");
                reloadHistoryCache().then(() => resolve(runId));
            };
            tx.onerror = (err) => {
                console.error("Failed to save history transaction:", err);
                reject(err);
            };
        });
    });
}

export function deleteAuditRun(runId) {
    return initDB().then(database => {
        return new Promise((resolve, reject) => {
            const tx = database.transaction(["auditRuns", "architectureSnapshots", "healthHistory"], "readwrite");
            const timestampSuffix = runId.split("_")[1];

            tx.objectStore("auditRuns").delete(runId);
            tx.objectStore("architectureSnapshots").delete("snap_" + timestampSuffix);
            tx.objectStore("healthHistory").delete("health_" + timestampSuffix);

            tx.oncomplete = () => {
                console.log(`Deleted run ${runId} from history DB.`);
                reloadHistoryCache().then(resolve);
            };
            tx.onerror = (err) => {
                console.error("Failed to delete history run:", err);
                reject(err);
            };
        });
    });
}

export function clearProjectHistoryFromDB(projectId) {
    return initDB().then(database => {
        return new Promise((resolve, reject) => {
            const tx = database.transaction(["auditRuns", "architectureSnapshots", "healthHistory"], "readwrite");
            const stores = ["auditRuns", "architectureSnapshots", "healthHistory"];
            
            stores.forEach(storeName => {
                const store = tx.objectStore(storeName);
                const req = store.openCursor();
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        if (cursor.value.projectId === projectId) {
                            cursor.delete();
                        }
                        cursor.continue();
                    }
                };
            });
            
            tx.oncomplete = () => {
                console.log(`Cleaned up history for project: ${projectId}`);
                reloadHistoryCache().then(resolve);
            };
            tx.onerror = (err) => {
                console.error("Failed to cleanup project history:", err);
                reject(err);
            };
        });
    });
}
