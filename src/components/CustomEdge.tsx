import React from 'react';
import { EdgeProps } from 'reactflow';
import { useProjectStore } from '../store/useProjectStore';

export const CustomEdge: React.FC<EdgeProps> = ({
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data
}) => {
    const activeFlow = useProjectStore(state => state.activeFlow);
    const activeStepIndex = useProjectStore(state => state.activeStepIndex);
    const hoveredNodeId = useProjectStore(state => state.hoveredNodeId);

    // Default label/colors if not in data
    const label = data?.label || "";
    const type = data?.type || "request";
    const sourceColor = data?.sourceColor || "hsl(200,80%,58%)";
    const targetColor = data?.targetColor || "hsl(200,80%,58%)";
    const isHighlighted = data?.isHighlighted || false;

    // Determine simulation state classes
    let isActive = false;
    let isPrev = false;
    let isDimmed = false;

    if (activeFlow) {
        const activeEdges: [string, string][] = [];
        const prevEdges: [string, string][] = [];
        for (let i = 0; i < activeStepIndex; i++) {
            prevEdges.push([activeFlow.steps[i].node, activeFlow.steps[i+1].node]);
        }
        if (activeStepIndex > 0) {
            activeEdges.push([activeFlow.steps[activeStepIndex-1].node, activeFlow.steps[activeStepIndex].node]);
        }

        isActive = activeEdges.some(([a, b]) => (source === a && target === b) || (source === b && target === a));
        isPrev = prevEdges.some(([a, b]) => (source === a && target === b) || (source === b && target === a));
        isDimmed = !isActive && !isPrev;
    }

    // Bezier control points calculation matching legacy makeBezier
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    
    const sourcePosStr = sourcePosition as string;
    const targetPosStr = targetPosition as string;

    // Choose horizontal or vertical control point offsets based on handle orientation
    const isHorizontal = 
        sourcePosStr === 'left' || 
        sourcePosStr === 'right' || 
        targetPosStr === 'left-t' || 
        targetPosStr === 'right-t';

    const t = Math.min(Math.abs(dx), Math.abs(dy), 160) * 0.55 + 50;
    
    let c1x = sourceX;
    let c1y = sourceY;
    let c2x = targetX;
    let c2y = targetY;

    if (isHorizontal) {
        c1x = sourceX + (sourcePosStr === 'left' ? -t : t);
        c2x = targetX + (targetPosStr === 'left-t' ? -t : t);
    } else {
        c1y = sourceY + (sourcePosStr === 'top' ? -t : t);
        c2y = targetY + (targetPosStr === 'top-t' ? -t : t);
    }

    const pathD = `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`;

    // Arrow calculations
    const angle = Math.atan2(targetY - c2y, targetX - c2x);
    const aLen = 8;
    const arrowD = `M ${targetX - aLen * Math.cos(angle - 0.4)} ${targetY - aLen * Math.sin(angle - 0.4)} L ${targetX} ${targetY} L ${targetX - aLen * Math.cos(angle + 0.4)} ${targetY - aLen * Math.sin(angle + 0.4)}`;

    // Build class lists
    const isEdgeConnected = hoveredNodeId === source || hoveredNodeId === target;
    const isEdgeHighlighted = isHighlighted || (hoveredNodeId && isEdgeConnected);
    const hoverClass = hoveredNodeId ? (isEdgeConnected ? 'highlighted' : 'hover-dimmed') : '';
    const stateClass = isActive ? 'flow-active' : isPrev ? 'flow-active-prev' : isDimmed ? 'flow-dimmed' : isEdgeHighlighted ? 'highlighted' : hoverClass;
    
    const lineClasses = ['conn-line', stateClass].filter(Boolean).join(' ');
    const arrowClasses = ['conn-arrow', stateClass].filter(Boolean).join(' ');
    const labelClasses = ['conn-label', stateClass].filter(Boolean).join(' ');
    const dotClasses = ['conn-dot', stateClass].filter(Boolean).join(' ');

    const lineStyle: React.CSSProperties = {};
    if (type === "future") {
        lineStyle.opacity = "0.12";
    }
    if (isEdgeHighlighted) {
        lineStyle.filter = `drop-shadow(0 0 5px ${targetColor})`;
    }

    const gradientId = `cg-${id.replace(/[^a-zA-Z0-9-]/g, '_')}`;

    return (
        <>
            <defs>
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
                    <stop offset="0%" stopColor={sourceColor} />
                    <stop offset="100%" stopColor={targetColor} />
                </linearGradient>
            </defs>

            {/* Path */}
            <path
                id={id}
                d={pathD}
                stroke={`url(#${gradientId})`}
                className={lineClasses}
                style={lineStyle}
                strokeDasharray={type === "data" ? "6 4" : type === "future" ? "3 6" : undefined}
            />

            {/* Arrow */}
            <path
                d={arrowD}
                stroke={targetColor}
                fill="none"
                className={arrowClasses}
            />

            {/* Label */}
            {label && (
                <text
                    x={(sourceX + targetX) / 2}
                    y={(sourceY + targetY) / 2 - 7}
                    textAnchor="middle"
                    className={labelClasses}
                    style={isHighlighted ? { fill: '#fff', fontWeight: 'bold' } : undefined}
                >
                    {label}
                </text>
            )}

            {/* Flow dot (Only animate when not in a dimmed state during active flow simulation, or always if default) */}
            <circle
                r={isHighlighted ? 4.5 : 3}
                fill={targetColor}
                className={dotClasses}
                style={isHighlighted ? { filter: `drop-shadow(0 0 3px ${targetColor})`, opacity: 0.9 } : undefined}
            >
                <animateMotion
                    dur={`${(isHighlighted ? 1.5 : 3) + Math.random() * 2.5}s`}
                    repeatCount="indefinite"
                    path={pathD}
                />
            </circle>
        </>
    );
};
