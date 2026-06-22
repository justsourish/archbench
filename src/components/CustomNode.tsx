import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData } from '../types';
import { useProjectStore } from '../store/useProjectStore';

export const CustomNode: React.FC<NodeProps<NodeData>> = ({ id, data, selected }) => {
    const {
        title,
        icon,
        category,
        color,
        desc,
        description,
        sections = [],
        flow = [],
        callout,
        nodeType
    } = data;

    const activeFlow = useProjectStore(state => state.activeFlow);
    const activeStepIndex = useProjectStore(state => state.activeStepIndex);
    const hoveredNodeId = useProjectStore(state => state.hoveredNodeId);
    const connections = useProjectStore(state => state.connections);

    const actualDesc = desc || description;

    // Determine simulation state classes
    let flowClass = "";
    let badgeText = "";
    let badgeVisible = false;
    let badgeCurrent = false;

    if (activeFlow) {
        const flowNodeIds = [...new Set(activeFlow.steps.map(s => s.node))];
        const isInFlow = flowNodeIds.includes(id);

        if (!isInFlow) {
            flowClass = "flow-dimmed";
        } else {
            const nodeSteps: number[] = [];
            activeFlow.steps.forEach((s, i) => {
                if (s.node === id) nodeSteps.push(i);
            });

            const activeNodeStep = nodeSteps.filter(i => i <= activeStepIndex);

            if (activeNodeStep.length > 0) {
                const lastActiveIdx = activeNodeStep[activeNodeStep.length - 1];
                if (lastActiveIdx === activeStepIndex) {
                    flowClass = "flow-current";
                    badgeText = String(lastActiveIdx + 1);
                    badgeVisible = true;
                    badgeCurrent = true;
                } else {
                    flowClass = "flow-active flow-completed";
                    badgeText = String(lastActiveIdx + 1);
                    badgeVisible = true;
                    badgeCurrent = false;
                }
            } else {
                flowClass = "flow-active";
            }
        }
    } else if (selected) {
        flowClass = "highlighted";
    }

    // Determine connected hover state
    const isConnected = React.useMemo(() => {
        if (!hoveredNodeId) return false;
        return connections.some(([from, to]) => 
            (from === hoveredNodeId && to === id) || (to === hoveredNodeId && from === id)
        );
    }, [hoveredNodeId, connections, id]);

    let hoverClass = "";
    if (hoveredNodeId) {
        if (hoveredNodeId === id) {
            hoverClass = "hover-primary";
        } else if (isConnected) {
            hoverClass = "hover-connected";
        } else {
            hoverClass = "hover-dimmed";
        }
    }

    // Determine node wrapper classes
    const wrapperClasses = [
        'graph-node',
        nodeType === 'boundary' ? 'node-boundary' : '',
        nodeType === 'datamodel' ? 'node-datamodel' : '',
        flowClass,
        hoverClass
    ].filter(Boolean).join(' ');

    const style = {
        '--node-color': color,
        position: 'relative' // relative positioning so that handles place correctly relative to the wrapper
    } as React.CSSProperties;

    const badgeStyle = badgeCurrent && color
        ? { background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 60%, white))` }
        : color ? { background: color } : {};

    return (
        <div className={wrapperClasses} style={style}>
            <div className="node-header">
                <span className="node-icon">{icon}</span>
                <span className="node-title">{title}</span>
                <span className="node-cat">{category || 'Service'}</span>
            </div>
            <div className="node-body">
                {actualDesc && <div className="node-desc">{actualDesc}</div>}

                {sections.map((sec, idx) => (
                    <div key={idx}>
                        {sec.label && <div className="node-section">{sec.label}</div>}
                        <div className="node-items">
                            {(sec.items || []).map((item, itemIdx) => {
                                let itemCls = "node-item";
                                let label = item;
                                if (item.startsWith("~")) {
                                    itemCls += " struck";
                                    label = item.slice(1);
                                }
                                if (item.startsWith("*")) {
                                    itemCls += " glow";
                                    label = item.slice(1);
                                }
                                return (
                                    <div key={itemIdx} className={itemCls}>
                                        <span className="item-dot"></span>
                                        {label}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {flow && flow.length > 0 && (
                    <div className="node-flow">
                        {flow.map((s, stepIdx) => {
                            if (s === "→") {
                                return <span key={stepIdx} className="nf-arrow">→</span>;
                            }
                            let stepCls = "nf-step";
                            let lbl = s;
                            if (s.endsWith("*")) {
                                stepCls += " accent";
                                lbl = s.slice(0, -1);
                            }
                            return (
                                <span key={stepIdx} className={stepCls}>{lbl}</span>
                            );
                        })}
                    </div>
                )}

                {callout && (
                    <div className={`node-callout ${callout.type || ''}`}>
                        {callout.text}
                    </div>
                )}
            </div>

            {/* Step badge */}
            <div 
                className={`step-badge ${badgeVisible ? 'visible' : ''} ${badgeCurrent ? 'current' : ''}`}
                style={badgeStyle}
            >
                {badgeText}
            </div>

            {/* Custom handles matching the 4 sides for nearest-port routing */}
            <Handle id="top" type="source" position={Position.Top} style={{ opacity: 0, width: '100%', height: '8px', top: 0, left: 0, transform: 'none', borderRadius: 0, border: 'none' }} />
            <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0, width: '100%', height: '8px', bottom: 0, left: 0, transform: 'none', borderRadius: 0, border: 'none' }} />
            <Handle id="left" type="source" position={Position.Left} style={{ opacity: 0, width: '8px', height: '100%', left: 0, top: 0, transform: 'none', borderRadius: 0, border: 'none' }} />
            <Handle id="right" type="source" position={Position.Right} style={{ opacity: 0, width: '8px', height: '100%', right: 0, top: 0, transform: 'none', borderRadius: 0, border: 'none' }} />

            <Handle id="top-t" type="target" position={Position.Top} style={{ opacity: 0, width: '100%', height: '8px', top: 0, left: 0, transform: 'none', borderRadius: 0, border: 'none' }} />
            <Handle id="bottom-t" type="target" position={Position.Bottom} style={{ opacity: 0, width: '100%', height: '8px', bottom: 0, left: 0, transform: 'none', borderRadius: 0, border: 'none' }} />
            <Handle id="left-t" type="target" position={Position.Left} style={{ opacity: 0, width: '8px', height: '100%', left: 0, top: 0, transform: 'none', borderRadius: 0, border: 'none' }} />
            <Handle id="right-t" type="target" position={Position.Right} style={{ opacity: 0, width: '8px', height: '100%', right: 0, top: 0, transform: 'none', borderRadius: 0, border: 'none' }} />
        </div>
    );
};
