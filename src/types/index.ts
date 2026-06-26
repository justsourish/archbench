export interface NodeData {
    id: string;
    category?: string;
    nodeType?: string;
    title: string;
    icon: string;
    color: string;
    x: number;
    y: number;
    description?: string;
    desc?: string;
    actions?: string[];
    responsibilities?: string[];
    surfaces?: string[];
    flow?: string[];
    callout?: {
        type: string;
        text: string;
    };
    sections?: {
        label: string;
        items: string[];
    }[];
}

// Connection represented as a tuple: [fromNodeId, toNodeId, label, type]
// e.g., ["client", "api", "HTTPS Request", "request"]
export type ConnectionData = [string, string, string, string];

export interface FlowStep {
    node: string;
    label: string;
    detail: string;
    data?: string; // Optional JSON string
    trustHighlight?: boolean;
}

export interface Flow {
    id: string;
    title: string;
    subtitle: string;
    color?: string;
    steps: FlowStep[];
}

export interface LayerZone {
    id: string;
    label: string;
    y: number;
    h: number;
    cls?: string;
}

export interface TrustBoundaryGeometry {
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    note?: string;
}

export interface Repository {
    id: string;
    workspaceId?: string;
    sourceKind?: 'builtin' | 'member-bound' | 'standalone';
    title: string;
    version: string;
    description?: string;
    nodes: NodeData[];
    connections: ConnectionData[];
    flows: Flow[];
    layers?: LayerZone[];
    trustBoundary?: TrustBoundaryGeometry;
}

export type Project = Repository; // Alias for legacy code

export type WorkspaceMemberStatus = 'ready' | 'needs_init' | 'disconnected';
export type WorkspaceMemberSyncState = 'synced' | 'stale' | 'reconnect_required';

export interface WorkspaceMember {
    id: string;
    name: string;
    folderName: string;
    relativeWorkspacePath: string;
    handle: FileSystemDirectoryHandle | null;
    status: WorkspaceMemberStatus;
    hasArchitecture: boolean;
    specId: string | null;
    createdAt: string;       // ISO timestamp
    lastConnectedAt: string;  // ISO timestamp
    syncState?: WorkspaceMemberSyncState;
    lastSyncAt?: string | null;
    lastSyncError?: string | null;
}

// Workspace is the top-level ArcBench concept.
// A workspace contains N repository folders, each owning its own .arcbench/ directory.
export interface Workspace {
    id: string;
    name: string;
    repositories: Repository[];
    activeRepositoryId: string | null;
    members: WorkspaceMember[];
    
    // For legacy project compatibility
    projects?: Repository[];
    activeProjectId?: string | null;
}

export type ViewType = 'workspace_overview' | 'member' | 'standalone';

export interface ActiveView {
    type: ViewType;
    targetId: string | null; // memberId for 'member', specId for 'standalone', null for 'workspace_overview'
}


export interface BatchLogStep {
    node: string;
    flow: string;
    action: string;
    details: string;
}

export interface BatchLog {
    timestamp: string;
    version?: string;
    flowsSimulated: string[];
    steps: BatchLogStep[];
}

export interface ArchitectureHealthReport {
    summary: {
        flowsExecuted: number;
        totalSteps: number;
        uniqueNodesActivated: number;
        connectionsTraversed: number;
        timestamp: string;
        version: string;
    };
    mostActiveNode: {
        title: string;
        count: number;
    };
    ranking: {
        id: string;
        title: string;
        count: number;
    }[];
    leastActiveNodes: {
        title: string;
        count: number;
    }[];
    criticalDeps: {
        title: string;
        percentage: number;
    }[];
    flowComplexity: {
        flow: string;
        stepCount: number;
        nodeCount: number;
        dependencyCount: number;
        complexity: string;
    }[];
    trustBoundary: {
        boundaryEntries: number;
        boundaryExits: number;
        flowsCrossingBoundary: number;
    };
    databaseImpact: {
        dbTouchCount: number;
        dbReads: number;
        dbWrites: number;
        dbFlowActivity: {
            flow: string;
            count: number;
        }[];
    };
    analyticsCoverage: {
        flowsFeedingAnalytics: number;
        bypassingFlows: string[];
    };
    observations: string[];
    risks: {
        title: string;
        severity: 'critical' | 'warning';
        desc: string;
    }[];
}
