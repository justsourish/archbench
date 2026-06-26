import Dexie, { type Table } from 'dexie';
import { BatchLog, ArchitectureHealthReport, NodeData, ConnectionData, Flow } from '../types';

export interface AuditRun {
    id: string;
    projectId: string;
    timestamp: number;
    architectureVersion: string;
    flowsExecuted: string[];
    unifiedAuditLog: BatchLog;
    architectureHealthReport: ArchitectureHealthReport | null;
    knowledgePack: any;
}

export interface ArchitectureSnapshot {
    id: string;
    projectId: string;
    timestamp: number;
    architectureVersion: string;
    nodeCount: number;
    connectionCount: number;
    flowCount: number;
    snapshotMetadata: {
        flowsSimulated: string[];
    };
}

export interface HealthHistoryEntry {
    id: string;
    projectId: string;
    timestamp: number;
    architectureVersion: string;
    totalFlows: number;
    totalSteps: number;
    mostActiveNode: { title: string; count: number };
    leastActiveNode: { title: string; count: number };
    criticalDependencies: { title: string; percentage: number }[];
    unusedComponents: { title: string; count: number }[];
    unusedConnections: any[];
    highCouplingCount: number;
    spofCount: number;
    databaseDependencyScore: number;
}

export interface WorkspaceMemberHandleRecord {
    id: string; // `${workspaceId}:${memberId}`
    workspaceId: string;
    memberId: string;
    handle: FileSystemDirectoryHandle;
    lastSeenAt: number;
}

export class ArchBenchDB extends Dexie {
    auditRuns!: Table<AuditRun>;
    architectureSnapshots!: Table<ArchitectureSnapshot>;
    healthHistory!: Table<HealthHistoryEntry>;
    workspaceMemberHandles!: Table<WorkspaceMemberHandleRecord>;

    constructor() {
        super('ArchitectureWorkbenchDexie');
        this.version(1).stores({
            auditRuns: 'id, projectId, timestamp',
            architectureSnapshots: 'id, projectId, timestamp',
            healthHistory: 'id, projectId, timestamp'
        });

        this.version(2).stores({
            auditRuns: 'id, projectId, timestamp',
            architectureSnapshots: 'id, projectId, timestamp',
            healthHistory: 'id, projectId, timestamp',
            workspaceMemberHandles: 'id, workspaceId, memberId, lastSeenAt'
        });
    }
}

export const db = new ArchBenchDB();

export interface HistoryCache {
    auditRuns: AuditRun[];
    architectureSnapshots: ArchitectureSnapshot[];
    healthHistory: HealthHistoryEntry[];
}

export async function reloadHistoryCache(): Promise<HistoryCache> {
    const runs = await db.auditRuns.toArray();
    const snaps = await db.architectureSnapshots.toArray();
    const health = await db.healthHistory.toArray();

    runs.sort((a, b) => a.timestamp - b.timestamp);
    snaps.sort((a, b) => a.timestamp - b.timestamp);
    health.sort((a, b) => a.timestamp - b.timestamp);

    return {
        auditRuns: runs,
        architectureSnapshots: snaps,
        healthHistory: health
    };
}

export async function saveAuditRun(
    batchLog: BatchLog,
    projectId: string,
    nodes: NodeData[],
    connections: ConnectionData[],
    flows: Flow[],
    healthReport: ArchitectureHealthReport,
    knowledgePack: any,
    databaseDependencyScore: number
): Promise<string> {
    const timestamp = Date.now();
    const runId = "run_" + timestamp;
    const version = batchLog.version || "1.0";

    const auditRun: AuditRun = {
        id: runId,
        projectId: projectId,
        timestamp: timestamp,
        architectureVersion: version,
        flowsExecuted: batchLog.flowsSimulated,
        unifiedAuditLog: batchLog,
        architectureHealthReport: healthReport,
        knowledgePack: knowledgePack
    };

    const snapshot: ArchitectureSnapshot = {
        id: "snap_" + timestamp,
        projectId: projectId,
        timestamp: timestamp,
        architectureVersion: version,
        nodeCount: nodes.length,
        connectionCount: connections.length,
        flowCount: flows.length,
        snapshotMetadata: {
            flowsSimulated: batchLog.flowsSimulated
        }
    };

    const healthHist: HealthHistoryEntry = {
        id: "health_" + timestamp,
        projectId: projectId,
        timestamp: timestamp,
        architectureVersion: version,
        totalFlows: healthReport.summary.flowsExecuted,
        totalSteps: healthReport.summary.totalSteps,
        mostActiveNode: healthReport.mostActiveNode,
        leastActiveNode: healthReport.leastActiveNodes[0] || { title: "N/A", count: 0 },
        criticalDependencies: healthReport.criticalDeps,
        unusedComponents: healthReport.leastActiveNodes.filter(n => n.count === 0),
        unusedConnections: healthReport.risks.filter(r => r.title === "Unused Connection"),
        highCouplingCount: healthReport.risks.filter(r => r.title === "High Coupling").length,
        spofCount: healthReport.risks.filter(r => r.title === "Single Point of Failure").length,
        databaseDependencyScore: databaseDependencyScore
    };

    await db.transaction('rw', [db.auditRuns, db.architectureSnapshots, db.healthHistory], async () => {
        await db.auditRuns.put(auditRun);
        await db.architectureSnapshots.put(snapshot);
        await db.healthHistory.put(healthHist);
    });

    return runId;
}

export async function deleteAuditRun(runId: string): Promise<void> {
    const timestampSuffix = runId.split("_")[1];
    if (!timestampSuffix) return;

    await db.transaction('rw', [db.auditRuns, db.architectureSnapshots, db.healthHistory], async () => {
        await db.auditRuns.delete(runId);
        await db.architectureSnapshots.delete("snap_" + timestampSuffix);
        await db.healthHistory.delete("health_" + timestampSuffix);
    });
}

export async function clearProjectHistoryFromDB(projectId: string): Promise<void> {
    await db.transaction('rw', [db.auditRuns, db.architectureSnapshots, db.healthHistory], async () => {
        await db.auditRuns.where('projectId').equals(projectId).delete();
        await db.architectureSnapshots.where('projectId').equals(projectId).delete();
        await db.healthHistory.where('projectId').equals(projectId).delete();
    });
}

export async function upsertWorkspaceMemberHandle(
    workspaceId: string,
    memberId: string,
    handle: FileSystemDirectoryHandle
): Promise<void> {
    await db.workspaceMemberHandles.put({
        id: `${workspaceId}:${memberId}`,
        workspaceId,
        memberId,
        handle,
        lastSeenAt: Date.now()
    });
}

export async function removeWorkspaceMemberHandle(workspaceId: string, memberId: string): Promise<void> {
    await db.workspaceMemberHandles.delete(`${workspaceId}:${memberId}`);
}

export async function removeWorkspaceMemberHandlesByWorkspace(workspaceId: string): Promise<void> {
    await db.workspaceMemberHandles.where('workspaceId').equals(workspaceId).delete();
}

export async function getWorkspaceMemberHandleMap(workspaceIds: string[]): Promise<Map<string, FileSystemDirectoryHandle>> {
    const map = new Map<string, FileSystemDirectoryHandle>();
    if (workspaceIds.length === 0) return map;

    const records = await db.workspaceMemberHandles.where('workspaceId').anyOf(workspaceIds).toArray();
    records.forEach(record => {
        map.set(`${record.workspaceId}:${record.memberId}`, record.handle);
    });
    return map;
}
