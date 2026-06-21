export interface NodeData {
    id: string;
    category?: string;
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

export interface Project {
    id: string;
    title: string;
    version: string;
    description?: string;
    nodes: NodeData[];
    connections: ConnectionData[];
    flows: Flow[];
    layers?: LayerZone[];
    trustBoundary?: TrustBoundaryGeometry;
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
