import React, { useMemo, useState } from 'react';
import ReactFlow, { 
    Node, 
    Edge, 
    NodeChange,
    useViewport,
    useNodes,
    Background,
    BackgroundVariant,
    useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useProjectStore } from '../store/useProjectStore';
import { CustomNode } from './CustomNode';
import { CustomEdge } from './CustomEdge';
import { LayerZoneNode, TrustBoundaryNode } from './SpecialNodes';
import { Repository, WorkspaceMember, NodeData } from '../types';
import { DEFAULT_PROJECT_ID } from '../utils/projectHelpers';

const RepositoryNode: React.FC<{ data: { member: any } }> = ({ data }) => {
    const { member } = data;
    const { reconnectWorkspaceMember, setActiveView } = useProjectStore();

    const handleScaffold = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const specToLoad = {
            id: "project-" + Date.now(),
            title: member.name,
            version: "1.0",
            nodes: [
                { id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "Default client interface." },
                { id: "api", category: "Service", title: "Core Service", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Default API controller." }
            ],
            connections: [
                ["client", "api", "HTTPS Request", "request"]
            ] as any[],
            flows: [
                {
                    id: "main_scaffold_flow",
                    title: "Scaffold Demo Flow",
                    subtitle: "Automatically generated walkthrough simulation",
                    steps: [
                        { node: "client", label: "Process at Web Frontend", detail: "Scaffolded execution step." },
                        { node: "api", label: "Process at Core Service", detail: "Scaffolded execution step." }
                    ]
                }
            ] as any[]
        };

        if (member.handle) {
            try {
                const arcbenchDir = await member.handle.getDirectoryHandle(".arcbench", { create: true });
                const md = `# ${specToLoad.title}\nVersion: 1.0\n\n## Nodes\n### client (Entry Point)\n* **Title:** Web Frontend\n* **Icon:** 💻\n* **x:** 300\n* **y:** 250\n* **Description:** Default client interface.\n\n### api (Service)\n* **Title:** Core Service\n* **Icon:** ⚙️\n* **x:** 750\n* **y:** 250\n* **Description:** Default API controller.\n\n## Connections\n| From | To | Interaction | Type |\n|---|---|---|---|\n| client | api | HTTPS Request | request |\n\n## Flows\n### main_scaffold_flow (Scaffold Demo Flow)\n*Automatically generated walkthrough simulation*\n- **Color:** hsl(210,85%,62%)\n\n1. **client** [Process at Web Frontend]: Scaffolded execution step.\n2. **api** [Process at Core Service]: Scaffolded execution step.\n`;
                
                const specHandle = await arcbenchDir.getFileHandle("architecture.md", { create: true });
                const specWritable = await specHandle.createWritable();
                await specWritable.write(md);
                await specWritable.close();

                const rulesContent = `# PROJECT RULES\n* Single source of truth is .arcbench/architecture.md\n`;
                const rulesHandle = await arcbenchDir.getFileHandle("PROJECT_RULES.md", { create: true });
                const rulesWritable = await rulesHandle.createWritable();
                await rulesWritable.write(rulesContent);
                await rulesWritable.close();

                await reconnectWorkspaceMember(member.id, member.handle);
                alert(`Successfully scaffolded ${member.name}!`);
            } catch (err) {
                console.error("Scaffold failed:", err);
                alert("Failed to write spec. Permission denied.");
            }
        }
    };

    const handleReconnect = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const pickerWindow = window as unknown as { showDirectoryPicker?: (options?: { mode: string }) => Promise<FileSystemDirectoryHandle> };
        if (!pickerWindow.showDirectoryPicker) {
            alert("Directory picker is not supported in this browser.");
            return;
        }
        try {
            const handle = await pickerWindow.showDirectoryPicker({ mode: 'readwrite' });
            if (handle) {
                await reconnectWorkspaceMember(member.id, handle);
                alert(`Successfully reconnected ${member.name}!`);
            }
        } catch (err) {
            console.warn("Cancelled reconnect", err);
        }
    };

    const handleOpen = () => {
        if (member.status === 'ready') {
            setActiveView({ type: 'member', targetId: member.id });
        }
    };

    const statusConfig = {
        ready: { label: 'CONNECTED', color: 'hsl(160, 80%, 55%)', bg: 'rgba(80, 220, 180, 0.1)' },
        needs_init: { label: 'NEEDS INIT', color: 'hsl(35, 95%, 55%)', bg: 'rgba(255, 170, 80, 0.1)' },
        disconnected: { label: 'DISCONNECTED', color: 'hsl(0, 95%, 65%)', bg: 'rgba(255, 100, 100, 0.1)' }
    }[member.status as 'ready' | 'needs_init' | 'disconnected'] || { label: 'UNKNOWN', color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.05)' };

    return (
        <div 
            onClick={handleOpen}
            className={`repo-card-node ${member.status}`}
            style={{
                background: 'rgba(10, 12, 22, 0.9)',
                border: `1px solid ${member.status === 'ready' ? 'rgba(180, 130, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: '16px',
                padding: '20px',
                minWidth: '280px',
                color: '#fff',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                cursor: member.status === 'ready' ? 'pointer' : 'default',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>📁</span>
                <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    color: statusConfig.color,
                    background: statusConfig.bg,
                    border: `1px solid ${statusConfig.color}20`
                }}>
                    {statusConfig.label}
                </span>
            </div>

            <div style={{ marginTop: '4px' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600 }}>
                    {member.name}
                </h4>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={member.relativeWorkspacePath}>
                    Path: {member.relativeWorkspacePath}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                {member.status === 'disconnected' && (
                    <button
                        onClick={handleReconnect}
                        style={{
                            flex: 1,
                            background: 'rgba(255, 69, 58, 0.15)',
                            border: '1px solid rgba(255, 69, 58, 0.3)',
                            borderRadius: '8px',
                            color: '#ff453a',
                            padding: '6px 12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                    >
                        🔌 Reconnect Folder
                    </button>
                )}
                {member.status === 'needs_init' && (
                    <button
                        onClick={handleScaffold}
                        style={{
                            flex: 1,
                            background: 'rgba(255, 170, 80, 0.15)',
                            border: '1px solid rgba(255, 170, 80, 0.3)',
                            borderRadius: '8px',
                            color: 'hsl(35, 95%, 70%)',
                            padding: '6px 12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                    >
                        ⚡ Initialize Spec
                    </button>
                )}
                {member.status === 'ready' && (
                    <button
                        style={{
                            flex: 1,
                            background: 'rgba(180, 130, 255, 0.15)',
                            border: '1px solid rgba(180, 130, 255, 0.35)',
                            borderRadius: '8px',
                            color: 'hsl(280, 95%, 85%)',
                            padding: '6px 12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                    >
                        👁️ Open Viewport
                    </button>
                )}
            </div>
        </div>
    );
};

// Define node and edge types map outside component
const nodeTypes = {
    customNode: CustomNode,
    layerZone: LayerZoneNode,
    trustBoundary: TrustBoundaryNode,
    repositoryNode: RepositoryNode
};

const edgeTypes = {
    customConnection: CustomEdge
};

// Nearest-port edge handle calculator
function getEdgeHandles(
    source: { x: number; y: number; w: number; h: number },
    target: { x: number; y: number; w: number; h: number }
) {
    const sw = source.w || 280;
    const sh = source.h || 300;
    const tw = target.w || 280;
    const th = target.h || 300;

    const dx = (target.x + tw / 2) - (source.x + sw / 2);
    const dy = (target.y + th / 2) - (source.y + sh / 2);

    if (Math.abs(dx) * 0.65 > Math.abs(dy)) {
        if (dx > 0) {
            return { sourceHandle: 'right', targetHandle: 'left-t' };
        } else {
            return { sourceHandle: 'left', targetHandle: 'right-t' };
        }
    } else {
        if (dy > 0) {
            return { sourceHandle: 'bottom', targetHandle: 'top-t' };
        } else {
            return { sourceHandle: 'top', targetHandle: 'bottom-t' };
        }
    }
}

const resolveNodeId = (rawId: string, currentRepoId: string, members: WorkspaceMember[], _repositories: Repository[]) => {
    const colonIdx = rawId.indexOf(':');
    if (colonIdx !== -1) {
        const repoPrefix = rawId.substring(0, colonIdx).trim().toLowerCase();
        const nodeId = rawId.substring(colonIdx + 1).trim();
        
        // Find target member matching repoPrefix by name or folderName
        const targetMember = members.find(m => 
            m.name.toLowerCase() === repoPrefix || 
            m.folderName.toLowerCase() === repoPrefix ||
            (m.specId && m.specId.toLowerCase() === repoPrefix)
        );
        if (targetMember && targetMember.specId) {
            return `${targetMember.specId}_${nodeId}`;
        }
    }
    return `${currentRepoId}_${rawId}`;
};

// Inner canvas component that consumes ReactFlow context
const CanvasInner: React.FC<{
    setZoomLabel: (label: string) => void;
}> = ({ setZoomLabel }) => {
    const { 
        workspace,
        activeView,
        nodes, 
        connections, 
        currentRepository, 
        updateNodePosition,
        activeFlow,
        activeStepIndex,
        setHoveredNodeId
    } = useProjectStore();
    const { zoom } = useViewport();
    const { fitView } = useReactFlow();

    // Sync zoom label to header
    React.useEffect(() => {
        setZoomLabel(`${Math.round(zoom * 100)}%`);
    }, [zoom, setZoomLabel]);

    const isSidebarCollapsed = useProjectStore(s => s.isSidebarCollapsed);
    const isSidebarDockedRight = useProjectStore(s => s.isSidebarDockedRight);
    const readyMembers = useMemo(() => {
        return workspace.members.filter(m => m.status === 'ready' && m.specId);
    }, [workspace.members]);    // Auto-center the graph layout whenever the active spec or viewport mode changes
    React.useEffect(() => {
        if (activeView.type === 'workspace_overview') {
            const timer = setTimeout(() => {
                fitView({
                    padding: 0.15,
                    duration: 450
                });
            }, 300);
            return () => clearTimeout(timer);
        } else if (nodes && nodes.length > 0) {
            const timer = setTimeout(() => {
                fitView({
                    nodes: nodes.map(n => ({ id: n.id })),
                    padding: 0.25,
                    duration: 450,
                    maxZoom: 0.6
                });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [currentRepository, isSidebarCollapsed, isSidebarDockedRight, fitView, activeView.type]);

    // Viewport auto-centering/focusing tracking when active step changes
    React.useEffect(() => {
        if (activeFlow && activeStepIndex >= 0) {
            const step = activeFlow.steps[activeStepIndex];
            if (step && step.node) {
                fitView({
                    nodes: [{ id: step.node }],
                    duration: 350,
                    maxZoom: 0.8
                });
            }
        }
    }, [activeFlow, activeStepIndex, fitView]);

    // Retrieve active selection from ReactFlow's state using useNodes()
    const rfNodesList = useNodes();
    const selectedNodes = useMemo(() => rfNodesList.filter((node: Node) => node.selected), [rfNodesList]);
    const selectedNodeIds = useMemo(() => new Set(selectedNodes.map((n: Node) => n.id)), [selectedNodes]);

    // Build virtual background layers + actual node elements
    const rfNodes = useMemo(() => {
        const list: Node[] = [];

        if (activeView.type === 'workspace_overview') {
            readyMembers.forEach((member, repoIdx) => {
                const spec = workspace.repositories.find(r => r.id === member.specId);
                if (!spec) return;

                const xOffset = repoIdx * 1600;

                // 1. Add background layer lanes for this repo
                if (spec.layers) {
                    spec.layers.forEach(l => {
                        list.push({
                            id: `layer-${spec.id}-${l.id}`,
                            type: 'layerZone',
                            position: { x: xOffset, y: l.y },
                            data: { label: l.label, height: l.h, className: l.cls, width: 1600, left: 0 },
                            draggable: false,
                            selectable: false,
                            deletable: false,
                        });
                    });
                }

                // 2. Add security trust boundaries for this repo
                if (spec.trustBoundary) {
                    const tb = spec.trustBoundary;
                    list.push({
                        id: `trust-boundary-${spec.id}`,
                        type: 'trustBoundary',
                        position: { x: xOffset + tb.x, y: tb.y },
                        data: { label: tb.label, note: tb.note, width: tb.w, height: tb.h },
                        draggable: false,
                        selectable: false,
                        deletable: false,
                    });
                }

                // 3. Add actual interactive diagram nodes for this repo
                if (spec.nodes) {
                    spec.nodes.forEach(n => {
                        list.push({
                            id: `${spec.id}_${n.id}`,
                            type: 'customNode',
                            position: { x: xOffset + n.x, y: n.y },
                            data: n,
                            dragHandle: '.node-header',
                        });
                    });
                }
            });
        } else {
            // 1. Add background layer lanes
            if (currentRepository?.layers) {
                currentRepository.layers.forEach(l => {
                    list.push({
                        id: `layer-${l.id}`,
                        type: 'layerZone',
                        position: { x: -2500, y: l.y },
                        data: { label: l.label, height: l.h, className: l.cls },
                        draggable: false,
                        selectable: false,
                        deletable: false,
                    });
                });
            }

            // 2. Add security trust boundaries
            if (currentRepository?.trustBoundary) {
                const tb = currentRepository.trustBoundary;
                list.push({
                    id: 'trust-boundary',
                    type: 'trustBoundary',
                    position: { x: tb.x, y: tb.y },
                    data: { label: tb.label, note: tb.note, width: tb.w, height: tb.h },
                    draggable: false,
                    selectable: false,
                    deletable: false,
                });
            }

            // 3. Add actual interactive diagram nodes
            nodes.forEach(n => {
                list.push({
                    id: n.id,
                    type: 'customNode',
                    position: { x: n.x, y: n.y },
                    data: n,
                    dragHandle: '.node-header',
                });
            });
        }

        return list;
    }, [activeView.type, readyMembers, workspace.repositories, currentRepository?.layers, currentRepository?.trustBoundary, nodes]);

    // Build connections list
    const rfEdges = useMemo(() => {
        if (activeView.type === 'workspace_overview') {
            const list: Edge[] = [];
            readyMembers.forEach((member, repoIdx) => {
                const spec = workspace.repositories.find(r => r.id === member.specId);
                if (!spec || !spec.connections) return;

                spec.connections.forEach(([from, to, label, type], idx) => {
                    const globalFrom = resolveNodeId(from, spec.id, workspace.members, workspace.repositories);
                    const globalTo = resolveNodeId(to, spec.id, workspace.members, workspace.repositories);

                    // Find source and target node locations
                    let sourceNode: NodeData | undefined;
                    let sourceRepoIdx = -1;

                    let targetNode: NodeData | undefined;
                    let targetRepoIdx = -1;

                    readyMembers.forEach((m, rIdx) => {
                        const s = workspace.repositories.find(r => r.id === m.specId);
                        if (!s) return;
                        
                        const expectedFromId = globalFrom.startsWith(`${s.id}_`) ? globalFrom.substring(s.id.length + 1) : null;
                        if (expectedFromId) {
                            const found = s.nodes?.find(n => n.id === expectedFromId);
                            if (found) {
                                sourceNode = found;
                                sourceRepoIdx = rIdx;
                            }
                        }

                        const expectedToId = globalTo.startsWith(`${s.id}_`) ? globalTo.substring(s.id.length + 1) : null;
                        if (expectedToId) {
                            const found = s.nodes?.find(n => n.id === expectedToId);
                            if (found) {
                                targetNode = found;
                                targetRepoIdx = rIdx;
                            }
                        }
                    });

                    // Fallbacks
                    if (!sourceNode) {
                        sourceNode = spec.nodes?.find(n => n.id === from);
                        sourceRepoIdx = repoIdx;
                    }
                    if (!targetNode) {
                        targetNode = spec.nodes?.find(n => n.id === to);
                        targetRepoIdx = repoIdx;
                    }

                    if (!sourceNode || !targetNode) return;

                    const sourceColor = sourceNode.color || 'hsl(200,80%,58%)';
                    const targetColor = targetNode.color || 'hsl(200,80%,58%)';

                    const sNodeGeo = {
                        x: sourceRepoIdx * 1600 + sourceNode.x,
                        y: sourceNode.y,
                        w: 280,
                        h: 300
                    };
                    const tNodeGeo = {
                        x: targetRepoIdx * 1600 + targetNode.x,
                        y: targetNode.y,
                        w: 280,
                        h: 300
                    };

                    const handles = getEdgeHandles(sNodeGeo, tNodeGeo);
                    const isHighlighted = selectedNodeIds.has(globalFrom) || selectedNodeIds.has(globalTo);

                    list.push({
                        id: `edge-overview-${spec.id}-${from}-${to}-${idx}`,
                        source: globalFrom,
                        target: globalTo,
                        sourceHandle: handles.sourceHandle,
                        targetHandle: handles.targetHandle,
                        type: 'customConnection',
                        data: {
                            label,
                            type,
                            sourceColor,
                            targetColor,
                            isHighlighted
                        }
                    } as Edge);
                });
            });
            return list;
        } else {
            return connections.map(([from, to, label, type], idx) => {
                const sourceNode = nodes.find(n => n.id === from);
                const targetNode = nodes.find(n => n.id === to);

                const sourceColor = sourceNode?.color || 'hsl(200,80%,58%)';
                const targetColor = targetNode?.color || 'hsl(200,80%,58%)';

                const defaultNode = { x: 0, y: 0, w: 280, h: 300 };
                const sNodeGeo = sourceNode ? { x: sourceNode.x, y: sourceNode.y, w: 280, h: 300 } : defaultNode;
                const tNodeGeo = targetNode ? { x: targetNode.x, y: targetNode.y, w: 280, h: 300 } : defaultNode;

                const handles = getEdgeHandles(sNodeGeo, tNodeGeo);
                const isHighlighted = selectedNodeIds.has(from) || selectedNodeIds.has(to);

                return {
                    id: `edge-${from}-${to}-${idx}`,
                    source: from,
                    target: to,
                    sourceHandle: handles.sourceHandle,
                    targetHandle: handles.targetHandle,
                    type: 'customConnection',
                    data: {
                        label,
                        type,
                        sourceColor,
                        targetColor,
                        isHighlighted
                    }
                } as Edge;
            });
        }
    }, [activeView.type, readyMembers, workspace.repositories, workspace.members, connections, nodes, selectedNodeIds]);

    const onNodesChange = (changes: NodeChange[]) => {
        changes.forEach(change => {
            if (change.type === 'position' && change.position && change.id) {
                let targetX = change.position.x;
                let targetY = change.position.y;
                
                if (activeView.type === 'workspace_overview') {
                    // Find which repo this node belongs to and subtract offset
                    const matchingRepoIdx = readyMembers.findIndex(m => change.id.startsWith(`${m.specId}_`));
                    if (matchingRepoIdx !== -1) {
                        const xOffset = matchingRepoIdx * 1600;
                        targetX = targetX - xOffset;
                    }
                }
                
                // update position in Zustand store
                updateNodePosition(change.id, targetX, targetY);
            }
        });
    };

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                onNodesChange={onNodesChange}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                minZoom={0.05}
                maxZoom={2}
                defaultViewport={{ x: window.innerWidth / 2 - 400, y: 150, zoom: 0.35 }}
                panOnScroll={false}
                zoomOnScroll={true}
                preventScrolling={true}
                nodesDraggable={true}
                nodesConnectable={false}
                elementsSelectable={true}
                onNodeMouseEnter={(_, node) => {
                    if (node.type === 'customNode') {
                        setHoveredNodeId(node.id);
                    }
                }}
                onNodeMouseLeave={() => setHoveredNodeId(null)}
                proOptions={{ hideAttribution: true }}
            >
                <Background 
                    variant={BackgroundVariant.Lines} 
                    color="rgba(255, 255, 255, 0.025)" 
                    gap={20} 
                    size={1} 
                />
            </ReactFlow>
        </div>
    );
};


const MemberOnboarding: React.FC<{ member: any }> = ({ member }) => {
    const { reconnectWorkspaceMember } = useProjectStore();

    const handleScaffold = async () => {
        const specToLoad = {
            id: "project-" + Date.now(),
            title: member.name,
            version: "1.0",
            nodes: [
                { id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "Default client interface." },
                { id: "api", category: "Service", title: "Core Service", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Default API controller." }
            ],
            connections: [
                ["client", "api", "HTTPS Request", "request"]
            ] as any[],
            flows: [
                {
                    id: "main_scaffold_flow",
                    title: "Scaffold Demo Flow",
                    subtitle: "Automatically generated walkthrough simulation",
                    steps: [
                        { node: "client", label: "Process at Web Frontend", detail: "Scaffolded execution step." },
                        { node: "api", label: "Process at Core Service", detail: "Scaffolded execution step." }
                    ]
                }
            ] as any[]
        };

        if (member.handle) {
            try {
                const arcbenchDir = await member.handle.getDirectoryHandle(".arcbench", { create: true });
                const md = `# ${specToLoad.title}\nVersion: 1.0\n\n## Nodes\n### client (Entry Point)\n* **Title:** Web Frontend\n* **Icon:** 💻\n* **x:** 300\n* **y:** 250\n* **Description:** Default client interface.\n\n### api (Service)\n* **Title:** Core Service\n* **Icon:** ⚙️\n* **x:** 750\n* **y:** 250\n* **Description:** Default API controller.\n\n## Connections\n| From | To | Interaction | Type |\n|---|---|---|---|\n| client | api | HTTPS Request | request |\n\n## Flows\n### main_scaffold_flow (Scaffold Demo Flow)\n*Automatically generated walkthrough simulation*\n- **Color:** hsl(210,85%,62%)\n\n1. **client** [Process at Web Frontend]: Scaffolded execution step.\n2. **api** [Process at Core Service]: Scaffolded execution step.\n`;
                
                const specHandle = await arcbenchDir.getFileHandle("architecture.md", { create: true });
                const specWritable = await specHandle.createWritable();
                await specWritable.write(md);
                await specWritable.close();

                const rulesContent = `# PROJECT RULES\n* Single source of truth is .arcbench/architecture.md\n`;
                const rulesHandle = await arcbenchDir.getFileHandle("PROJECT_RULES.md", { create: true });
                const rulesWritable = await rulesHandle.createWritable();
                await rulesWritable.write(rulesContent);
                await rulesWritable.close();

                await reconnectWorkspaceMember(member.id, member.handle);
            } catch (err) {
                console.error("Scaffold failed:", err);
                alert("Failed to write spec. Permission denied.");
            }
        }
    };

    const handleCopyPrompt = () => {
        const prompt = `You are a senior system architect. I have initialized an ArchBench workspace in my repository folder. Analyze my codebase files and write the architecture specification directly into .arcbench/architecture.md, following the format rules in .arcbench/PROJECT_RULES.md. Do not output explanations, only write the markdown code.`;
        navigator.clipboard.writeText(prompt).then(() => {
            alert("🤖 Onboarding prompt copied to clipboard! Paste it into your coding assistant.");
        });
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '40px',
            color: '#fff',
            background: 'radial-gradient(circle at center, rgba(30, 20, 50, 0.4), rgba(5, 5, 10, 0.98))',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            <div style={{
                maxWidth: '500px',
                width: '100%',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '16px',
                padding: '32px',
                textAlign: 'center',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}>
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>📁</div>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>Connected: {member.name}</h2>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', lineHeight: 1.5, margin: '0 0 24px 0' }}>
                    There is no architecture specification file <code>.arcbench/architecture.md</code> inside this repository yet.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                    <button 
                        onClick={handleScaffold}
                        style={{
                            background: 'linear-gradient(135deg, hsl(270,70%,60%), hsl(310,65%,62%))',
                            border: 'none',
                            color: '#fff',
                            padding: '12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(180, 130, 255, 0.2)'
                        }}
                    >
                        ⚡ Generate Scaffold Spec
                    </button>
                    <button 
                        onClick={handleCopyPrompt}
                        style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#fff',
                            padding: '12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        🤖 Copy Onboarding prompt
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'rgba(80, 220, 180, 0.05)', border: '1px solid rgba(80, 220, 180, 0.15)', borderRadius: '8px', justifyContent: 'center' }}>
                    <span className="watch-dot-pulse" style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'hsl(160, 80%, 60%)' }}></span>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'hsl(160, 80%, 75%)' }}>
                        Live watch active. Waiting for spec file creation...
                    </span>
                </div>
            </div>
        </div>
    );
};

// Canvas wrapper supporting ReactFlow context providers
const ViewportSelectorDropdown: React.FC = () => {
    const { 
        workspace, 
        activeView, 
        setActiveView, 
        addWorkspaceMember,
        reconnectWorkspaceMember, 
        syncWorkspaceMember,
        removeWorkspaceMember, 
        deleteRepository 
    } = useProjectStore();
    const [isOpen, setIsOpen] = useState(false);
    const [deleteRepoTarget, setDeleteRepoTarget] = useState<{ kind: 'member'; member: WorkspaceMember } | { kind: 'standalone'; repo: Repository } | null>(null);
    const [statusModal, setStatusModal] = useState<{ title: string; message: string; tone: 'info' | 'warning' | 'danger' | 'success' } | null>(null);

    const memberSpecIds = useMemo(
        () => new Set(workspace.members.map(m => m.specId).filter((id): id is string => Boolean(id))),
        [workspace.members]
    );

    const standaloneSpecs = useMemo(
        () => workspace.repositories.filter(r => {
            if (memberSpecIds.has(r.id)) return false;
            return r.sourceKind !== 'member-bound';
        }),
        [workspace.repositories, memberSpecIds]
    );

    const isArcBenchHome = workspace.id === 'workspace_arcbench_home';

    const activeRepoId = useMemo(() => {
        if (activeView.type === 'member') {
            const member = workspace.members.find(m => m.id === activeView.targetId);
            return member?.specId || null;
        }
        if (activeView.type === 'standalone') {
            return activeView.targetId;
        }
        return workspace.activeRepositoryId || null;
    }, [activeView, workspace.members, workspace.activeRepositoryId]);

    const diagramSourceLabel = useMemo(() => {
        if (!activeRepoId) return 'No active repository selected';

        if (activeRepoId === DEFAULT_PROJECT_ID) {
            return 'Source: Built-in ArcBench demo';
        }

        const owner = workspace.members.find(m => m.specId === activeRepoId);
        if (!owner) {
            return 'Source: Saved workspace snapshot';
        }

        if (owner.syncState === 'synced' && owner.status === 'ready' && owner.handle) {
            return 'Source: Connected local folder';
        }

        if (owner.syncState === 'reconnect_required' || owner.status === 'disconnected') {
            return 'Source: Saved snapshot (folder disconnected)';
        }

        return 'Source: Saved snapshot (folder not synced yet)';
    }, [activeRepoId, workspace.members]);

    const showResultModal = (result: { ok: boolean; code: string; message: string }, memberName?: string) => {
        if (result.ok) {
            setStatusModal({
                title: 'Sync Complete',
                message: memberName ? `${memberName} synced from local files.` : result.message,
                tone: 'success'
            });
            return;
        }

        if (result.code === 'permission_denied') {
            setStatusModal({
                title: 'Permission Required',
                message: 'ArchBench still knows your repository location, but browser permission is missing. Grant permission and click Sync again.',
                tone: 'warning'
            });
            return;
        }

        if (result.code === 'missing_arcbench' || result.code === 'missing_handle') {
            setStatusModal({
                title: 'Reconnect Required',
                message: 'The saved repository location is no longer valid or .arcbench is missing there. Please connect this repository again.',
                tone: 'danger'
            });
            return;
        }

        if (result.code === 'duplicate') {
            setStatusModal({
                title: 'Already Connected',
                message: result.message,
                tone: 'info'
            });
            return;
        }

        if (result.code === 'missing_architecture') {
            setStatusModal({
                title: 'No Architecture Spec Yet',
                message: 'The folder is connected, but .arcbench/architecture.md is missing. Initialize or create the architecture spec first.',
                tone: 'warning'
            });
            return;
        }

        if (result.code === 'picker_unsupported') {
            setStatusModal({
                title: 'Browser Not Supported',
                message: 'Directory picker is not supported in this browser.',
                tone: 'danger'
            });
            return;
        }

        setStatusModal({
            title: 'Action Failed',
            message: result.message,
            tone: 'danger'
        });
    };

    const handleConnectRepository = async () => {
        const pickerWindow = window as unknown as { showDirectoryPicker?: (options?: { mode: string }) => Promise<FileSystemDirectoryHandle> };
        if (!pickerWindow.showDirectoryPicker) {
            showResultModal({ ok: false, code: 'picker_unsupported', message: 'Directory picker is not supported.' });
            return;
        }
        try {
            const handle = await pickerWindow.showDirectoryPicker({ mode: 'readwrite' });
            if (handle) {
                const result = await addWorkspaceMember(handle);
                showResultModal(result, handle.name);
            }
        } catch (err) {
            console.warn("Cancelled directory selection", err);
        }
    };

    const activeLabel = (() => {
        if (activeView.type === 'workspace_overview') return 'Workspace Overview';
        if (activeView.type === 'member') {
            const member = workspace.members.find(m => m.id === activeView.targetId);
            return member ? `Repository: ${member.name}` : 'Repository Spec';
        }
        if (activeView.type === 'standalone') {
            const proj = workspace.repositories.find(p => p.id === activeView.targetId);
            return proj ? `Repository: ${proj.title}` : 'Standalone Spec';
        }
        return 'Select View';
    })();

    return (
        <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            zIndex: 1000,
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: 'rgba(10, 12, 22, 0.85)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backdropFilter: 'blur(12px)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)';
                    e.currentTarget.style.background = 'rgba(15, 17, 30, 0.9)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.background = 'rgba(10, 12, 22, 0.85)';
                }}
            >
                <span>👁️ View: {activeLabel}</span>
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path d="M1 1L5 5L9 1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '38px',
                    right: '0',
                    background: 'rgba(10, 12, 22, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    width: '240px',
                    padding: '6px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(16px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                }}>

                    
                    <button
                        onClick={() => {
                            setActiveView({ type: 'workspace_overview', targetId: null });
                            setIsOpen(false);
                        }}
                        style={{
                            background: activeView.type === 'workspace_overview' ? 'rgba(255,255,255,0.06)' : 'transparent',
                            border: 'none',
                            color: activeView.type === 'workspace_overview' ? '#fff' : 'rgba(255,255,255,0.6)',
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontSize: '11px',
                            fontWeight: 500,
                            borderRadius: '5px',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                            e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = activeView.type === 'workspace_overview' ? 'rgba(255,255,255,0.06)' : 'transparent';
                            e.currentTarget.style.color = activeView.type === 'workspace_overview' ? '#fff' : 'rgba(255,255,255,0.6)';
                        }}
                    >
                        🏠 Workspace Overview
                    </button>

                    <div style={{
                        margin: '4px 10px 2px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.03)',
                        fontSize: '9px',
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.72)',
                        letterSpacing: '0.2px'
                    }}>
                        {diagramSourceLabel}
                    </div>

                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

                    <span style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', padding: '4px 12px' }}>
                        Connected Repositories ({workspace.members.length})
                    </span>

                    <div style={{ display: 'flex', gap: '6px', padding: '4px 10px 8px' }}>
                        <button
                            onClick={handleConnectRepository}
                            style={{
                                width: '100%',
                                background: 'rgba(180, 130, 255, 0.12)',
                                border: '1px solid rgba(180, 130, 255, 0.3)',
                                borderRadius: '5px',
                                color: 'hsl(280, 95%, 85%)',
                                fontSize: '9px',
                                fontWeight: 700,
                                letterSpacing: '0.3px',
                                padding: '5px 6px',
                                cursor: 'pointer'
                            }}
                            title="Connect a repository folder to this workspace"
                        >
                            + Connect
                        </button>
                    </div>

                    {workspace.members.map(member => {
                        const isActive = activeView.type === 'member' && activeView.targetId === member.id;
                        const syncState = member.syncState || (member.status === 'disconnected' ? 'reconnect_required' : (member.status === 'ready' ? 'synced' : 'stale'));

                        const handleConnect = async (e: React.MouseEvent) => {
                            e.stopPropagation();
                            const pickerWindow = window as unknown as { showDirectoryPicker?: (options?: { mode: string }) => Promise<FileSystemDirectoryHandle> };
                            if (!pickerWindow.showDirectoryPicker) {
                                showResultModal({ ok: false, code: 'picker_unsupported', message: 'Directory picker is not supported.' });
                                return;
                            }
                            try {
                                const handle = await pickerWindow.showDirectoryPicker({ mode: 'readwrite' });
                                if (handle) {
                                    const result = await reconnectWorkspaceMember(member.id, handle);
                                    showResultModal(result, member.name);
                                }
                            } catch (err) {
                                console.warn("Cancelled reconnect", err);
                            }
                        };

                        const handleSync = async (e: React.MouseEvent) => {
                            e.stopPropagation();
                            const result = await syncWorkspaceMember(member.id);
                            showResultModal(result, member.name);
                        };

                        return (
                            <div
                                key={member.id}
                                onClick={() => {
                                    if (member.status === 'disconnected') {
                                        return;
                                    }
                                    setActiveView({ type: 'member', targetId: member.id });
                                    setIsOpen(false);
                                }}
                                style={{
                                    background: isActive ? 'rgba(180, 130, 255, 0.12)' : 'transparent',
                                    color: isActive ? 'hsl(280, 95%, 85%)' : 'rgba(255,255,255,0.6)',
                                    padding: '8px 12px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    borderRadius: '5px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '8px'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = isActive ? 'rgba(180, 130, 255, 0.15)' : 'rgba(255,255,255,0.04)';
                                    e.currentTarget.style.color = '#fff';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = isActive ? 'rgba(180, 130, 255, 0.12)' : 'transparent';
                                    e.currentTarget.style.color = isActive ? 'hsl(280, 95%, 85%)' : 'rgba(255,255,255,0.6)';
                                }}
                            >
                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>📁 {member.name}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                    {(syncState === 'reconnect_required' || member.status === 'disconnected') ? (
                                        <button
                                            onClick={handleConnect}
                                            title="Connect Repository Folder"
                                            style={{
                                                background: 'rgba(180, 130, 255, 0.12)',
                                                border: '1px solid rgba(180, 130, 255, 0.3)',
                                                borderRadius: '4px',
                                                padding: '2px 6px',
                                                fontSize: '9px',
                                                color: 'hsl(280, 95%, 85%)',
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                                transition: 'all 0.15s'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(180, 130, 255, 0.22)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'rgba(180, 130, 255, 0.12)';
                                            }}
                                        >
                                            🔌 Connect
                                        </button>
                                    ) : (
                                        <>
                                            {syncState === 'synced' ? (
                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'hsl(205, 95%, 62%)' }} title="Synced" />
                                            ) : (
                                                <button
                                                    onClick={handleSync}
                                                    title="Sync repository from saved location"
                                                    style={{
                                                        background: 'rgba(255, 184, 77, 0.14)',
                                                        border: '1px solid rgba(255, 184, 77, 0.35)',
                                                        borderRadius: '4px',
                                                        padding: '2px 6px',
                                                        fontSize: '9px',
                                                        color: 'hsl(42, 96%, 72%)',
                                                        cursor: 'pointer',
                                                        fontWeight: 700,
                                                        transition: 'all 0.15s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'rgba(255, 184, 77, 0.24)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'rgba(255, 184, 77, 0.14)';
                                                    }}
                                                >
                                                    Sync
                                                </button>
                                            )}
                                        </>
                                    )}

                                    {/* Delete Button */}
                                    <button
                                        onClick={() => setDeleteRepoTarget({ kind: 'member', member })}
                                        title="Delete Repository"
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            padding: '2px 4px',
                                            fontSize: '11px',
                                            cursor: 'pointer',
                                            opacity: 0.6,
                                            transition: 'all 0.15s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.opacity = '1';
                                            e.currentTarget.style.transform = 'scale(1.1)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.opacity = '0.6';
                                            e.currentTarget.style.transform = 'scale(1)';
                                        }}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {isArcBenchHome && (
                        <>
                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '6px 0 4px' }} />

                            <span style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', padding: '4px 12px' }}>
                                {`Home Architecture (${standaloneSpecs.length})`}
                            </span>

                            {standaloneSpecs.map(repo => {
                        const isActive = activeView.type === 'standalone' && activeView.targetId === repo.id;
                        const isProtectedHomeSpec = workspace.id === 'workspace_arcbench_home' && repo.id === DEFAULT_PROJECT_ID;

                        return (
                            <div
                                key={`standalone-${repo.id}`}
                                onClick={() => {
                                    setActiveView({ type: 'standalone', targetId: repo.id });
                                    setIsOpen(false);
                                }}
                                style={{
                                    background: isActive ? 'rgba(120, 180, 255, 0.14)' : 'transparent',
                                    color: isActive ? 'hsl(210, 95%, 85%)' : 'rgba(255,255,255,0.6)',
                                    padding: '8px 12px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    borderRadius: '5px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '8px'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = isActive ? 'rgba(120, 180, 255, 0.18)' : 'rgba(255,255,255,0.04)';
                                    e.currentTarget.style.color = '#fff';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = isActive ? 'rgba(120, 180, 255, 0.14)' : 'transparent';
                                    e.currentTarget.style.color = isActive ? 'hsl(210, 95%, 85%)' : 'rgba(255,255,255,0.6)';
                                }}
                            >
                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    {isArcBenchHome && repo.id === DEFAULT_PROJECT_ID ? '🧩 ArcBench Home Demo' : `📄 ${repo.title}`}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isProtectedHomeSpec) return;
                                        setDeleteRepoTarget({ kind: 'standalone', repo });
                                    }}
                                    title={isProtectedHomeSpec ? 'Protected Home Spec' : 'Remove Spec'}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        padding: '2px 4px',
                                        fontSize: '11px',
                                        cursor: isProtectedHomeSpec ? 'not-allowed' : 'pointer',
                                        opacity: isProtectedHomeSpec ? 0.25 : 0.6,
                                        transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (isProtectedHomeSpec) return;
                                        e.currentTarget.style.opacity = '1';
                                        e.currentTarget.style.transform = 'scale(1.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.opacity = isProtectedHomeSpec ? '0.25' : '0.6';
                                        e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                >
                                    🗑️
                                </button>
                            </div>
                        );
                            })}
                        </>
                    )}
                </div>
            )}

            {statusModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(5, 7, 16, 0.72)',
                    backdropFilter: 'blur(14px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2100,
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                    <div style={{
                        width: '420px',
                        background: 'rgba(15, 18, 32, 0.96)',
                        border: `1px solid ${statusModal.tone === 'success' ? 'rgba(66, 133, 244, 0.35)' : statusModal.tone === 'warning' ? 'rgba(255, 184, 77, 0.35)' : statusModal.tone === 'danger' ? 'rgba(255, 92, 92, 0.35)' : 'rgba(180, 130, 255, 0.3)'}`,
                        borderRadius: '16px',
                        padding: '22px',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.65)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px'
                    }}>
                        <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: 700 }}>{statusModal.title}</h3>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.75)', fontSize: '12px', lineHeight: 1.55 }}>{statusModal.message}</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                            <button
                                onClick={() => setStatusModal(null)}
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid rgba(255,255,255,0.16)',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    padding: '8px 16px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom confirmation modal with backdrop filter blur */}
            {deleteRepoTarget && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(5, 7, 16, 0.75)',
                    backdropFilter: 'blur(16px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2000,
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                    <div style={{
                        width: '400px',
                        background: 'rgba(15, 18, 32, 0.95)',
                        border: '1px solid rgba(255, 69, 58, 0.25)',
                        borderRadius: '16px',
                        padding: '24px',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '24px' }}>🗑️</span>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#fff' }}>
                                {deleteRepoTarget.kind === 'member' ? 'Disconnect Repository?' : 'Remove Standalone Spec?'}
                            </h3>
                        </div>
                        
                        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: 'rgba(255,255,255,0.6)' }}>
                            {deleteRepoTarget.kind === 'member' ? (
                                <>
                                    Are you sure you want to disconnect <strong>{deleteRepoTarget.member.name}</strong> from the workspace?
                                    This will release the directory handle and remove the linked repository configuration from ArchBench.
                                </>
                            ) : (
                                <>
                                    Are you sure you want to remove <strong>{deleteRepoTarget.repo.title}</strong> from this workspace?
                                    This removes the spec from ArchBench data only and does not delete files from disk.
                                </>
                            )}
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                            <button
                                onClick={() => setDeleteRepoTarget(null)}
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    padding: '8px 16px',
                                    color: '#fff',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    const target = deleteRepoTarget;
                                    setDeleteRepoTarget(null);
                                    setIsOpen(false);
                                    if (target.kind === 'member') {
                                        if (activeView.type === 'member' && activeView.targetId === target.member.id) {
                                            setActiveView({ type: 'workspace_overview', targetId: null });
                                        }
                                        const targetSpecId = target.member.specId;
                                        await removeWorkspaceMember(target.member.id);

                                        if (targetSpecId) {
                                            const stillExists = useProjectStore.getState().workspace.repositories.some(r => r.id === targetSpecId);
                                            if (stillExists) {
                                                await deleteRepository(targetSpecId);
                                            }
                                        }
                                    } else {
                                        if (activeView.type === 'standalone' && activeView.targetId === target.repo.id) {
                                            setActiveView({ type: 'workspace_overview', targetId: null });
                                        }
                                        await deleteRepository(target.repo.id);
                                    }
                                }}
                                style={{
                                    background: 'rgba(255, 69, 58, 0.2)',
                                    border: '1px solid rgba(255, 69, 58, 0.5)',
                                    borderRadius: '8px',
                                    padding: '8px 16px',
                                    color: '#ff453a',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 69, 58, 0.35)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 69, 58, 0.2)'}
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Canvas wrapper supporting ReactFlow context providers
export const ReactFlowCanvas: React.FC<{
    setZoomLabel: (label: string) => void;
}> = ({ setZoomLabel }) => {
    const activeView = useProjectStore(s => s.activeView);
    const workspace = useProjectStore(s => s.workspace);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {activeView.type === 'workspace_overview' && <CanvasInner setZoomLabel={setZoomLabel} />}
                {activeView.type === 'member' && (() => {
                    const member = workspace.members.find(m => m.id === activeView.targetId);
                    if (member && member.status === 'needs_init') {
                        return <MemberOnboarding member={member} />;
                    }
                    return <CanvasInner setZoomLabel={setZoomLabel} />;
                })()}
                {activeView.type === 'standalone' && <CanvasInner setZoomLabel={setZoomLabel} />}
                
                {/* Empty Workspace Placeholder Overlay */}
                {activeView.type === 'workspace_overview' && workspace.members.length === 0 && workspace.repositories.length === 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 999,
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: '13px',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        textAlign: 'center',
                        maxWidth: '300px',
                        pointerEvents: 'none'
                    }}>
                        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏢</div>
                        <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Empty Workspace</div>
                        <div>Connect a repository folder from the top menu bar to begin visualizing.</div>
                    </div>
                )}

                {/* Floating Viewport Mode Selector Dropdown */}
                <ViewportSelectorDropdown />
            </div>
        </div>
    );
};

