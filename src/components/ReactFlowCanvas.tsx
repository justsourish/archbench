import React, { useMemo } from 'react';
import ReactFlow, { 
    Node, 
    Edge, 
    NodeChange,
    useViewport
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
    const { nodes, connections, currentProject, updateNodePosition } = useProjectStore();
    const { zoom } = useViewport();

    // Sync zoom label to header
    React.useEffect(() => {
        setZoomLabel(`${Math.round(zoom * 100)}%`);
    }, [zoom, setZoomLabel]);

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
                    targetColor
                }
            } as Edge;
        });
    }, [connections, nodes]);

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
            />
        </div>
    );
};

// Canvas wrapper supporting ReactFlow context providers
export const ReactFlowCanvas: React.FC<{
    setZoomLabel: (label: string) => void;
}> = ({ setZoomLabel }) => {
    return <CanvasInner setZoomLabel={setZoomLabel} />;
};

