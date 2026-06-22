import React, { useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { generateExecutionLogJSON, generateExecutionLogMarkdown } from '../utils/generators';

export const TerminalConsole: React.FC = () => {
    const {
        nodes,
        activeFlow,
        activeStepIndex,
        unifiedBatchLog,
        currentProject
    } = useProjectStore();

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [viewMode, setViewMode] = useState<'terminal' | 'json'>('terminal');

    // Clipboard copy actions
    const handleCopyLogJSON = () => {
        if (!activeFlow && !unifiedBatchLog) {
            alert("No logs to copy. Run a simulation flow or batch audit checklist first.");
            return;
        }

        const log = activeFlow 
            ? generateExecutionLogJSON(activeFlow, activeStepIndex, nodes)
            : unifiedBatchLog;
        
        navigator.clipboard.writeText(JSON.stringify(log, null, 2)).then(() => {
            alert("Execution log JSON copied to clipboard!");
        });
    };

    const handleCopyLogMD = () => {
        if (!activeFlow && !unifiedBatchLog) {
            alert("No logs to copy. Run a simulation flow or batch audit checklist first.");
            return;
        }

        const md = activeFlow 
            ? generateExecutionLogMarkdown(activeFlow, activeStepIndex, nodes, currentProject?.version)
            : `# Batch Audit Run Summary\n\nTimestamp: ${new Date(unifiedBatchLog?.timestamp || '').toLocaleString()}`;
        
        navigator.clipboard.writeText(md).then(() => {
            alert("Execution log markdown copied to clipboard!");
        });
    };

    // Formatter for interactive terminal output
    const renderTerminalLogs = () => {
        if (activeFlow) {
            const lines: React.ReactNode[] = [];
            lines.push(
                <div key="sys-init" style={{ color: '#4a9eff', fontWeight: 600 }}>
                    [sys] INITIALIZING SIMULATION: {activeFlow.title}
                </div>
            );
            lines.push(
                <div key="sys-ts" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '8px', marginBottom: '6px' }}>
                    [sys] TIMESTAMP: {new Date().toLocaleTimeString()} | ECOSYSTEM VERSION: {currentProject?.version || "1.0"}
                </div>
            );
            lines.push(
                <div key="sys-border-1" style={{ color: 'rgba(255,255,255,0.1)', marginBottom: '8px' }}>
                    ----------------------------------------------------------------------------------------------------
                </div>
            );

            activeFlow.steps.forEach((s, idx) => {
                const nodeTitle = nodes.find(n => n.id === s.node)?.title || s.node;
                if (idx < activeStepIndex) {
                    lines.push(
                        <div key={`step-${idx}`} style={{ marginBottom: '8px' }}>
                            <span style={{ color: '#52ff88', fontWeight: 700 }}>[OK]   </span>
                            <span style={{ color: '#ffffff', fontWeight: 600 }}>Step {idx + 1}: {nodeTitle}</span>
                            <div style={{ color: 'rgba(255,255,255,0.5)', paddingLeft: '42px' }}>
                                Action: <span style={{ color: 'hsl(200,80%,65%)' }}>{s.label}</span>
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.35)', paddingLeft: '42px', fontStyle: 'italic', fontSize: '8px', marginTop: '2px' }}>
                                ↳ Result: SUCCESS | payload_size={JSON.stringify(s.data || '').length}b
                            </div>
                        </div>
                    );
                } else if (idx === activeStepIndex) {
                    lines.push(
                        <div key={`step-${idx}`} style={{ 
                            background: 'rgba(100, 180, 255, 0.04)', 
                            borderLeft: '2px solid hsl(200,85%,62%)', 
                            padding: '6px 8px', 
                            borderRadius: '0 4px 4px 0',
                            marginBottom: '8px',
                            boxShadow: 'inset 0 0 10px rgba(100, 180, 255, 0.05)'
                        }}>
                            <span style={{ color: 'hsl(200,85%,62%)', fontWeight: 700 }} className="term-pulse">[EXEC] </span>
                            <span style={{ color: '#ffffff', fontWeight: 700 }}>Step {idx + 1}: {nodeTitle}</span>
                            <div style={{ color: 'rgba(255,255,255,0.8)', paddingLeft: '8px', marginTop: '4px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Action:</span> {s.label}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.8)', paddingLeft: '8px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Detail:</span> {s.detail}
                            </div>
                            {s.data && (
                                <div style={{ color: 'rgba(255,255,255,0.7)', paddingLeft: '8px', fontSize: '8px', fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '4px 6px', borderRadius: '4px', marginTop: '4px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.03)', maxWidth: 'fit-content' }}>
                                    <span style={{ color: 'hsl(40, 95%, 70%)' }}>Payload:</span> {typeof s.data === 'object' ? JSON.stringify(s.data) : String(s.data)}
                                </div>
                            )}
                        </div>
                    );
                } else {
                    lines.push(
                        <div key={`step-${idx}`} style={{ marginBottom: '8px', opacity: 0.35 }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)' }}>[WAIT] </span>
                            <span>Step {idx + 1}: {nodeTitle}</span>
                            <div style={{ paddingLeft: '42px', fontSize: '8px', marginTop: '2px' }}>
                                Action: {s.label}
                            </div>
                        </div>
                    );
                }
            });

            if (activeStepIndex === activeFlow.steps.length - 1) {
                lines.push(
                    <div key="sys-border-2" style={{ color: 'rgba(255,255,255,0.1)', marginBottom: '8px', marginTop: '8px' }}>
                        ----------------------------------------------------------------------------------------------------
                    </div>
                );
                lines.push(
                    <div key="sys-done" style={{ color: '#52ff88', fontWeight: 600 }}>
                        [sys] SIMULATION TRACE COMPLETED SUCCESSFULLY.
                    </div>
                );
            }

            return lines;
        }

        if (unifiedBatchLog) {
            return (
                <div style={{ color: 'rgba(255,255,255,0.85)' }}>
                    <span style={{ color: '#4a9eff', fontWeight: 600 }}>[sys] BATCH AUDIT RUN SUMMARY</span>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '8px', marginBottom: '8px' }}>
                        Timestamp: {new Date(unifiedBatchLog.timestamp).toLocaleString()} | Version: {unifiedBatchLog.version || "1.0"}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.1)', marginBottom: '8px' }}>----------------------------------------------------------------------------------------------------</div>
                    
                    <div style={{ marginBottom: '12px' }}>
                        <span style={{ color: 'hsl(200,85%,62%)', fontWeight: 700 }}>Flows Simulated:</span>
                        <ul style={{ margin: '4px 0 0 12px', padding: 0, listStyle: 'none' }}>
                            {unifiedBatchLog.flowsSimulated.map((flowTitle, idx) => (
                                <li key={idx} style={{ color: '#ffffff' }}>
                                    • {flowTitle} <span style={{ color: '#52ff88', fontSize: '8px', fontWeight: 600 }}>[OK]</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <span style={{ color: 'hsl(200,85%,62%)', fontWeight: 700 }}>Execution Steps Logs:</span>
                        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {unifiedBatchLog.steps.map((step, idx) => (
                                <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                                        <span style={{ color: '#ffffff' }}>{step.flow}</span>
                                        <span style={{ color: '#52ff88' }}>[OK]</span>
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
                                        Node: <strong style={{ color: 'hsl(40, 95%, 70%)' }}>{nodes.find(n => n.id === step.node)?.title || step.node}</strong> | Action: {step.action}
                                    </div>
                                    {step.details && (
                                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '8px', marginTop: '2px', fontStyle: 'italic' }}>
                                            ↳ {step.details}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div style={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '18px' }}>💻</span>
                <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                    NOISY-ARCHITECTS:~$ archbench --audit --live <span style={{ color: 'rgba(255,255,255,0.15)' }}># Waiting for simulation execution trace logs...</span>
                </span>
            </div>
        );
    };

    return (
        <div className="terminal-panel" style={{
            height: isCollapsed ? '32px' : '220px',
            background: 'rgba(5, 6, 11, 0.95)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'height 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 40,
            boxSizing: 'border-box',
            fontFamily: 'monospace'
        }}>
            {/* Terminal Header Bar */}
            <div className="terminal-header" style={{
                height: '32px',
                minHeight: '32px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                userSelect: 'none',
                cursor: 'pointer'
            }} onClick={() => setIsCollapsed(!isCollapsed)}>
                
                {/* Left controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div className="terminal-dots" style={{ display: 'flex', gap: '5px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff5f56' }} onClick={(e) => { e.stopPropagation(); setIsCollapsed(true); }}></span>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffbd2e' }} onClick={(e) => { e.stopPropagation(); setIsCollapsed(true); }}></span>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27c93f' }} onClick={(e) => { e.stopPropagation(); setIsCollapsed(false); }}></span>
                    </div>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.5px' }}>
                        archbench-stdout-trace.log
                    </span>
                </div>

                {/* Right controls */}
                {!isCollapsed && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} onClick={(e) => e.stopPropagation()}>
                        
                        {/* View switcher */}
                        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden', padding: '1px' }}>
                            <button 
                                style={{ border: 'none', background: viewMode === 'terminal' ? 'rgba(255,255,255,0.08)' : 'transparent', color: viewMode === 'terminal' ? '#fff' : 'rgba(255,255,255,0.4)', padding: '2px 8px', fontSize: '9px', cursor: 'pointer', fontFamily: 'inherit' }}
                                onClick={() => setViewMode('terminal')}
                            >
                                Terminal
                            </button>
                            <button 
                                style={{ border: 'none', background: viewMode === 'json' ? 'rgba(255,255,255,0.08)' : 'transparent', color: viewMode === 'json' ? '#fff' : 'rgba(255,255,255,0.4)', padding: '2px 8px', fontSize: '9px', cursor: 'pointer', fontFamily: 'inherit' }}
                                onClick={() => setViewMode('json')}
                            >
                                JSON
                            </button>
                        </div>

                        {/* Copy utilities */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button 
                                style={{ background: 'rgba(100, 180, 255, 0.08)', border: '1px solid rgba(100,180,255,0.15)', color: '#4a9eff', padding: '2px 8px', borderRadius: '4px', fontSize: '9px', cursor: 'pointer', fontFamily: 'inherit' }}
                                onClick={handleCopyLogJSON}
                            >
                                Copy JSON
                            </button>
                            <button 
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: '4px', fontSize: '9px', cursor: 'pointer', fontFamily: 'inherit' }}
                                onClick={handleCopyLogMD}
                            >
                                Copy MD
                            </button>
                        </div>
                    </div>
                )}

                {/* Collapsed layout indicator */}
                {isCollapsed && (
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                        Click to expand trace console (stdout)
                    </span>
                )}
            </div>

            {/* Terminal Body */}
            {!isCollapsed && (
                <div className="terminal-body" style={{
                    flex: 1,
                    overflow: 'auto',
                    padding: '16px',
                    fontSize: '9.5px',
                    lineHeight: '1.45',
                    textAlign: 'left'
                }}>
                    {viewMode === 'terminal' ? (
                        renderTerminalLogs()
                    ) : (
                        <pre style={{ margin: 0, padding: 0, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                            {activeFlow 
                                ? JSON.stringify(generateExecutionLogJSON(activeFlow, activeStepIndex, nodes), null, 2)
                                : unifiedBatchLog 
                                    ? JSON.stringify(unifiedBatchLog, null, 2)
                                    : "Select and run a simulation scenario to record system execution logs."
                            }
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
};
