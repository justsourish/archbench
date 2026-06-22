import React, { useMemo } from 'react';
import ReactFlow, { 
    Node, 
    Edge, 
    NodeChange,
    useViewport,
    useNodes,
    Background,
    BackgroundVariant,
    ReactFlowProvider,
    useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useProjectStore } from '../store/useProjectStore';
import { CustomNode } from './CustomNode';
import { CustomEdge } from './CustomEdge';
import { LayerZoneNode, TrustBoundaryNode } from './SpecialNodes';

// Define node and edge types map outside component
const nodeTypes = {
    customNode: CustomNode,
    layerZone: LayerZoneNode,
    trustBoundary: TrustBoundaryNode
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

// Inner canvas component that consumes ReactFlow context
const CanvasInner: React.FC<{
    setZoomLabel: (label: string) => void;
}> = ({ setZoomLabel }) => {
    const { 
        nodes, 
        connections, 
        currentProject, 
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

        // 1. Add background layer lanes
        if (currentProject?.layers) {
            currentProject.layers.forEach(l => {
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
        if (currentProject?.trustBoundary) {
            const tb = currentProject.trustBoundary;
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
                dragHandle: '.node-header', // drag by node header only to allow scrolling body
            });
        });

        return list;
    }, [currentProject?.layers, currentProject?.trustBoundary, nodes]);

    // Build connections list
    const rfEdges = useMemo(() => {
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
    }, [connections, nodes, selectedNodeIds]);

    const onNodesChange = (changes: NodeChange[]) => {
        changes.forEach(change => {
            if (change.type === 'position' && change.position && change.id) {
                // update position in Zustand store
                updateNodePosition(change.id, change.position.x, change.position.y);
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
                minZoom={0.1}
                maxZoom={2}
                defaultViewport={{ x: window.innerWidth / 2 - 400, y: 50, zoom: 0.5 }}
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

// Canvas wrapper supporting ReactFlow context providers
export const ReactFlowCanvas: React.FC<{
    setZoomLabel: (label: string) => void;
}> = ({ setZoomLabel }) => {
    return (
        <ReactFlowProvider>
            <CanvasInner setZoomLabel={setZoomLabel} />
        </ReactFlowProvider>
    );
};

