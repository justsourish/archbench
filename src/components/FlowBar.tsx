import React from 'react';
import { useProjectStore } from '../store/useProjectStore';

export const FlowBar: React.FC = () => {
    const { flows, activeFlow, startFlow } = useProjectStore();

    return (
        <div className="flow-bar" id="flow-bar" style={{ display: 'flex', alignItems: 'center' }}>
            <span className="flow-bar-label">SIMULATE</span>
            <div className="flow-bar-buttons" id="flow-bar-buttons" style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
                {flows.map(flow => (
                    <button
                        key={flow.id}
                        className={`tb-btn flow-btn ${activeFlow?.id === flow.id ? 'active' : ''}`}
                        onClick={() => startFlow(flow.id)}
                        style={{
                            borderColor: activeFlow?.id === flow.id ? flow.color || 'hsl(210,85%,62%)' : undefined,
                            background: activeFlow?.id === flow.id ? 'rgba(100, 180, 255, 0.08)' : undefined
                        }}
                    >
                        <span>⚡ {flow.title}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};
