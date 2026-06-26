import React from 'react';
import { NodeProps } from 'reactflow';
import { useProjectStore } from '../store/useProjectStore';

export const LayerZoneNode: React.FC<NodeProps> = ({ data }) => {
    const { label, height, className, width = '6000px', left = '-2500px' } = data;
    return (
        <div 
            className={`layer-zone ${className || 'services'}`}
            style={{ 
                height: `${height}px`,
                width: typeof width === 'number' ? `${width}px` : width,
                left: typeof left === 'number' ? `${left}px` : left,
                position: 'absolute',
                borderTop: '1px dashed rgba(255,255,255,0.035)',
                pointerEvents: 'none',
                zIndex: -10
            }}
        >
            <span className="layer-label" style={{ pointerEvents: 'none' }}>{label}</span>
        </div>
    );
};

export const TrustBoundaryNode: React.FC<NodeProps> = ({ data }) => {
    const { label, note, width, height } = data;
    const activeFlow = useProjectStore(state => state.activeFlow);
    const activeStepIndex = useProjectStore(state => state.activeStepIndex);

    // Determine if the current simulation step highlights the trust boundary
    let highlight = false;
    if (activeFlow && activeStepIndex >= 0) {
        const step = activeFlow.steps[activeStepIndex];
        highlight = !!step?.trustHighlight;
    }

    return (
        <div
            className={`trust-boundary ${highlight ? 'flow-highlight' : ''}`}
            style={{
                width: `${width}px`,
                height: `${height}px`,
                position: 'absolute',
                pointerEvents: 'none',
                zIndex: -5
            }}
        >
            <span className="trust-boundary-label">{label}</span>
            {note && <span className="trust-boundary-note">{note}</span>}
        </div>
    );
};
