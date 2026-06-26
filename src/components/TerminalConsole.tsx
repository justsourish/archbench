import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { generateExecutionLogJSON, generateExecutionLogMarkdown } from '../utils/generators';
import { exportProjectToMarkdown } from '../utils/parser';
import { reloadHistoryCache } from '../db';
import { calculateArchitectureQualityScore } from '../utils/metrics';
import { generateArchitectureHealthReport } from '../utils/health-engine';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export const TerminalConsole: React.FC = () => {
    const {
        nodes,
        connections,
        flows,
        activeFlow,
        activeStepIndex,
        unifiedBatchLog,
        currentRepository,
        startFlow,
        terminalActiveTab,
        setTerminalActiveTab
    } = useProjectStore();

    // Layout configuration states
    const [isFloating, setIsFloating] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [floatPosition, setFloatPosition] = useState({ x: 200, y: 150 });
    const [floatSize] = useState({ width: 680, height: 420 });
    const [dockHeight, setDockHeight] = useState(250);
    const [viewMode, setViewMode] = useState<'terminal' | 'json'>('terminal');

    // Dragging & Dock resizing logic states
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isResizingDock, setIsResizingDock] = useState(false);

    // Terminal instance references
    const shellContainerRef = useRef<HTMLDivElement>(null);
    const terminalInstanceRef = useRef<Terminal | null>(null);
    const terminalFitAddonRef = useRef<FitAddon | null>(null);
    const terminalInputBufferRef = useRef("");
    const terminalHistoryRef = useRef<string[]>([]);
    const terminalHistoryIndexRef = useRef(-1);

    // ── GESTURE HANDLERS ──────────────────────────────────────────────────

    // Resizing bottom dock via top border drag
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizingDock) {
                const newHeight = window.innerHeight - e.clientY;
                if (newHeight >= 80 && newHeight <= 600) {
                    setDockHeight(newHeight);
                }
            }
        };

        const handleMouseUp = () => {
            setIsResizingDock(false);
        };

        if (isResizingDock) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingDock]);

    // Dragging floating terminal window via header drag
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                setFloatPosition({
                    x: e.clientX - dragStart.x,
                    y: e.clientY - dragStart.y
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStart]);

    const handleHeaderMouseDown = (e: React.MouseEvent) => {
        if (!isFloating) return;
        // Don't drag if clicking buttons, tabs or selector dropdowns
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) {
            return;
        }
        e.preventDefault();
        setIsDragging(true);
        setDragStart({
            x: e.clientX - floatPosition.x,
            y: e.clientY - floatPosition.y
        });
    };

    // ── XTERM SHELL INITIALIZATION & MANAGEMENT ───────────────────────────
    useEffect(() => {
        if (terminalActiveTab === 'shell' && !isCollapsed && shellContainerRef.current) {
            const timer = setTimeout(() => {
                if (terminalInstanceRef.current) {
                    terminalInstanceRef.current.focus();
                    terminalFitAddonRef.current?.fit();
                    return;
                }

                const term = new Terminal({
                    cursorBlink: true,
                    theme: {
                        background: '#07080d',
                        foreground: '#e2e4e9',
                        cursor: '#b482ff',
                        selectionBackground: 'rgba(180, 130, 255, 0.3)'
                    },
                    fontSize: 10.5,
                    fontFamily: 'monospace',
                    rows: 10,
                    convertEol: true
                });

                const fitAddon = new FitAddon();
                term.loadAddon(fitAddon);
                term.open(shellContainerRef.current!);
                fitAddon.fit();

                term.writeln("\x1b[1;35mArchBench Project Agent Terminal v1.0\x1b[0m");
                term.writeln("Type \x1b[32m'help'\x1b[0m to list available workspace commands.\n");

                const writePrompt = () => {
                    const projName = currentRepository ? currentRepository.title.toLowerCase().replace(/[^a-z0-9]/g, "-") : "untitled";
                    term.write(`\x1b[1;36marchbench:${projName}$ \x1b[0m`);
                };

                const clearCurrentLine = () => {
                    const projName = currentRepository ? currentRepository.title.toLowerCase().replace(/[^a-z0-9]/g, "-") : "untitled";
                    const promptLen = `archbench:${projName}$ `.length;
                    term.write("\r" + " ".repeat(promptLen + terminalInputBufferRef.current.length + 10) + "\r");
                    writePrompt();
                };

                writePrompt();

                term.onKey(e => {
                    const char = e.key;
                    const code = e.domEvent.keyCode;

                    if (code === 13) { // Enter
                        term.write("\r\n");
                        const line = terminalInputBufferRef.current.trim();
                        if (line) {
                            terminalHistoryRef.current.push(terminalInputBufferRef.current);
                            terminalHistoryIndexRef.current = terminalHistoryRef.current.length;
                            
                            // Process command
                            const args = line.split(/\s+/);
                            const cmd = args[0].toLowerCase();

                            if (cmd === 'help') {
                                term.writeln("\x1b[1mAvailable Workspace Commands:\x1b[0m");
                                term.writeln("  \x1b[32mhelp\x1b[0m                  List available commands.");
                                term.writeln("  \x1b[32march parse\x1b[0m            Validate and parse the active project spec.");
                                term.writeln("  \x1b[32march simulate [flow]\x1b[0m  Simulate a sequence flow by ID.");
                                term.writeln("  \x1b[32march audit\x1b[0m             Run structural rules and health audits.");
                                term.writeln("  \x1b[32march compare\x1b[0m           Compare current project against local snapshots.");
                                term.writeln("  \x1b[32march export\x1b[0m            Download active specification as Markdown.");
                                term.writeln("  \x1b[32mclear\x1b[0m                 Clear the console.");
                                term.writeln("");
                            } else if (cmd === 'clear') {
                                term.clear();
                            } else if (cmd === 'arch') {
                                const sub = args[1] ? args[1].toLowerCase() : "";
                                if (sub === 'parse') {
                                    term.writeln(`\x1b[35m[Parsing Workspace Repository: ${currentRepository ? currentRepository.title : "Untitled"}]\x1b[0m`);
                                    term.writeln(`- Specification Version: ${currentRepository ? currentRepository.version : "1.0"}`);
                                    term.writeln(`- Components (Nodes): ${nodes.length} loaded`);
                                    term.writeln(`- Dependencies (Connections): ${connections.length} loaded`);
                                    term.writeln(`- Workflows (Flows): ${flows.length} loaded`);
                                    term.writeln("\n\x1b[1mActive Nodes list:\x1b[0m");
                                    nodes.forEach(n => {
                                        term.writeln(`  * \x1b[36m${n.id}\x1b[0m [${n.category}]: ${n.title} (x:${n.x}, y:${n.y})`);
                                    });
                                    term.writeln("");
                                } else if (sub === 'simulate') {
                                    const fid = args[2];
                                    if (!fid) {
                                        term.writeln("Error: Missing flow ID. Available flows:");
                                        flows.forEach(f => term.writeln(`  - ${f.id}`));
                                    } else {
                                        const f = flows.find(x => x.id === fid || x.id.toLowerCase() === fid.toLowerCase());
                                        if (!f) {
                                            term.writeln(`Error: Flow ID '${fid}' not found.`);
                                        } else {
                                            startFlow(f.id);
                                            term.writeln(`🚀 Simulation playback triggered for: ${f.title}`);
                                        }
                                    }
                                } else if (sub === 'audit') {
                                    term.writeln("\x1b[35m[Running Workspace Audit...]\x1b[0m");
                                    let anomalies = 0;
                                    connections.forEach(conn => {
                                        const fromNode = nodes.find(n => n.id === conn[0]);
                                        const toNode = nodes.find(n => n.id === conn[1]);
                                        if (fromNode?.category === 'Entry Point' && toNode?.category === 'Infrastructure') {
                                            term.writeln(`  \x1b[33m⚠️ WARNING: Direct coupling found from Entry Point '${fromNode.id}' to Infrastructure Store '${toNode.id}'!\x1b[0m`);
                                            anomalies++;
                                        }
                                    });
                                    if (unifiedBatchLog) {
                                        const h = generateArchitectureHealthReport(unifiedBatchLog, nodes, connections);
                                        if (h) {
                                            term.writeln(`- Quality Score: \x1b[32m${calculateArchitectureQualityScore(h)}/100\x1b[0m`);
                                            term.writeln(`- SPOF count: ${h.risks.filter(r => r.title === "Single Point of Failure").length}`);
                                        }
                                    } else {
                                        term.writeln(`- Direct coupling anomalies detected: ${anomalies}`);
                                        term.writeln("(Run batch checklists Sequential Audit for complete health indicators)");
                                    }
                                    term.writeln("");
                                } else if (sub === 'compare') {
                                    term.writeln("\x1b[35m[Querying Local IndexedDB Snapshots...]\x1b[0m");
                                    reloadHistoryCache().then(cache => {
                                        if (!cache || !cache.architectureSnapshots || cache.architectureSnapshots.length === 0) {
                                            term.writeln("No audit snapshots found.");
                                        } else {
                                            cache.architectureSnapshots.forEach((snap, i) => {
                                                term.writeln(`  [#${i+1}] Snap: ${new Date(snap.timestamp).toLocaleString()} - Nodes: ${snap.nodeCount}, Links: ${snap.connectionCount}`);
                                            });
                                        }
                                        term.writeln("");
                                        writePrompt();
                                    }).catch(err => {
                                        term.writeln("Error loading snapshots: " + err.message);
                                        writePrompt();
                                    });
                                    return;
                                } else if (sub === 'export') {
                                    term.writeln("Exporting Markdown specification...");
                                    const md = exportProjectToMarkdown(currentRepository!);
                                    term.writeln(md.substring(0, 150) + "...\n(Download triggered on main browser thread)");
                                } else {
                                    term.writeln("Subcommand not recognized: " + sub);
                                }
                            } else {
                                term.writeln(`\x1b[31mCommand not recognized: '${line}'. Type 'help'.\x1b[0m`);
                            }
                        }
                        
                        terminalInputBufferRef.current = "";
                        writePrompt();
                    } else if (code === 8) { // Backspace
                        if (terminalInputBufferRef.current.length > 0) {
                            terminalInputBufferRef.current = terminalInputBufferRef.current.slice(0, -1);
                            term.write("\b \b");
                        }
                    } else if (code === 38) { // Arrow Up
                        if (terminalHistoryRef.current.length > 0 && terminalHistoryIndexRef.current > 0) {
                            terminalHistoryIndexRef.current--;
                            clearCurrentLine();
                            terminalInputBufferRef.current = terminalHistoryRef.current[terminalHistoryIndexRef.current];
                            term.write(terminalInputBufferRef.current);
                        }
                    } else if (code === 40) { // Arrow Down
                        if (terminalHistoryRef.current.length > 0 && terminalHistoryIndexRef.current < terminalHistoryRef.current.length - 1) {
                            terminalHistoryIndexRef.current++;
                            clearCurrentLine();
                            terminalInputBufferRef.current = terminalHistoryRef.current[terminalHistoryIndexRef.current];
                            term.write(terminalInputBufferRef.current);
                        } else if (terminalHistoryIndexRef.current === terminalHistoryRef.current.length - 1) {
                            terminalHistoryIndexRef.current = terminalHistoryRef.current.length;
                            clearCurrentLine();
                            terminalInputBufferRef.current = "";
                        }
                    } else if (code >= 37 && code <= 40) {
                        // ignore other arrow keys
                    } else {
                        terminalInputBufferRef.current += char;
                        term.write(char);
                    }
                });

                terminalInstanceRef.current = term;
                terminalFitAddonRef.current = fitAddon;
            }, 100);

            return () => clearTimeout(timer);
        }

        return () => {
            if ((terminalActiveTab !== 'shell' || isCollapsed) && terminalInstanceRef.current) {
                terminalInstanceRef.current.dispose();
                terminalInstanceRef.current = null;
            }
        };
    }, [terminalActiveTab, isCollapsed, currentRepository]);

    // ResizeObserver tracks shell container size to call .fit()
    useEffect(() => {
        if (!shellContainerRef.current) return;
        const resizeObserver = new ResizeObserver(() => {
            if (terminalFitAddonRef.current) {
                terminalFitAddonRef.current.fit();
            }
        });
        resizeObserver.observe(shellContainerRef.current);
        return () => resizeObserver.disconnect();
    }, [terminalActiveTab, isCollapsed, isFloating]);

    // ── CLIPBOARD ACTIONS ─────────────────────────────────────────────────
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
            ? generateExecutionLogMarkdown(activeFlow, activeStepIndex, nodes, currentRepository?.version)
            : `# Batch Audit Run Summary\n\nTimestamp: ${new Date(unifiedBatchLog?.timestamp || '').toLocaleString()}`;
        
        navigator.clipboard.writeText(md).then(() => {
            alert("Execution log markdown copied to clipboard!");
        });
    };

    // ── STDOUT LOG RENDERER ───────────────────────────────────────────────
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
                    [sys] TIMESTAMP: {new Date().toLocaleTimeString()} | ECOSYSTEM VERSION: {currentRepository?.version || "1.0"}
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
            <div style={{ color: 'rgba(255,255,255,0.4)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '18px' }}>💻</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>
                        NOISY-ARCHITECTS:~$ archbench --audit --live
                    </span>
                </div>
                <div style={{ paddingLeft: '30px', fontSize: '9.5px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', lineHeight: 1.4 }}>
                    [sys] Capture Engine: Active. Run a workflow simulation (via header play buttons) or sequential audit (via Batch tab checklist) to record execution logs here.
                </div>
            </div>
        );
    };

    // ── STYLES GENERATOR ──────────────────────────────────────────────────
    const getContainerStyles = (): React.CSSProperties => {
        if (isFloating) {
            return {
                position: 'fixed',
                left: `${floatPosition.x}px`,
                top: `${floatPosition.y}px`,
                width: `${floatSize.width}px`,
                height: `${floatSize.height}px`,
                resize: 'both',
                minWidth: '420px',
                minHeight: '220px',
                maxWidth: '90vw',
                maxHeight: '90vh',
                zIndex: 1000,
                background: 'rgba(7, 8, 14, 0.98)',
                boxShadow: '0 24px 72px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                backdropFilter: 'blur(20px)',
                fontFamily: 'monospace'
            };
        }

        return {
            height: isCollapsed ? '34px' : `${dockHeight}px`,
            background: 'rgba(7, 8, 14, 0.96)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: isResizingDock ? 'none' : 'height 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 40,
            boxSizing: 'border-box',
            fontFamily: 'monospace',
            position: 'relative'
        };
    };

    return (
        <div 
            className={`terminal-panel ${isFloating ? 'floating' : 'docked'} ${isCollapsed ? 'collapsed' : ''}`}
            style={getContainerStyles()}
        >
            {/* Dock Resizer Border (Only shown when Docked and expanded) */}
            {!isFloating && !isCollapsed && (
                <div 
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '4px',
                        cursor: 'ns-resize',
                        background: 'transparent',
                        zIndex: 50
                    }}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setIsResizingDock(true);
                    }}
                />
            )}

            {/* Header / Draggable Bar */}
            <div 
                className="terminal-header" 
                style={{
                    height: '34px',
                    minHeight: '34px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    userSelect: 'none',
                    cursor: isFloating ? 'move' : 'pointer'
                }}
                onMouseDown={handleHeaderMouseDown}
                onDoubleClick={() => setIsCollapsed(!isCollapsed)}
            >
                {/* Left Section: Control dots & Active tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {/* Window Controls */}
                    <div className="terminal-dots" style={{ display: 'flex', gap: '5px' }}>
                        <span 
                            style={{ width: '8.5px', height: '8.5px', borderRadius: '50%', background: '#ff5f56', cursor: 'pointer' }} 
                            title="Minimize/Collapse"
                            onClick={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}
                        />
                        <span 
                            style={{ width: '8.5px', height: '8.5px', borderRadius: '50%', background: '#ffbd2e', cursor: 'pointer' }} 
                            title="Minimize"
                            onClick={(e) => { e.stopPropagation(); setIsCollapsed(true); }}
                        />
                        <span 
                            style={{ width: '8.5px', height: '8.5px', borderRadius: '50%', background: '#27c93f', cursor: 'pointer' }} 
                            title="Expand"
                            onClick={(e) => { e.stopPropagation(); setIsCollapsed(false); }}
                        />
                    </div>

                    {/* Tabs (Only when expanded) */}
                    {!isCollapsed && (
                        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '2px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <button
                                style={{
                                    border: 'none',
                                    borderRadius: '4px',
                                    background: terminalActiveTab === 'trace' ? 'rgba(255,255,255,0.06)' : 'transparent',
                                    color: terminalActiveTab === 'trace' ? '#ffffff' : 'rgba(255,255,255,0.45)',
                                    padding: '3px 10px',
                                    fontSize: '9.5px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    transition: 'all 0.15s'
                                }}
                                onClick={(e) => { e.stopPropagation(); setTerminalActiveTab('trace'); }}
                            >
                                🖥 Simulation Trace
                            </button>
                            <button
                                style={{
                                    border: 'none',
                                    borderRadius: '4px',
                                    background: terminalActiveTab === 'shell' ? 'rgba(255,255,255,0.06)' : 'transparent',
                                    color: terminalActiveTab === 'shell' ? '#ffffff' : 'rgba(255,255,255,0.45)',
                                    padding: '3px 10px',
                                    fontSize: '9.5px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    transition: 'all 0.15s'
                                }}
                                onClick={(e) => { e.stopPropagation(); setTerminalActiveTab('shell'); }}
                            >
                                🐚 Agent Shell
                            </button>
                        </div>
                    )}

                    {isCollapsed && (
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.4px', marginLeft: '6px' }}>
                            {terminalActiveTab === 'trace' ? 'Simulation Trace' : 'Agent Shell'} (Collapsed)
                        </span>
                    )}
                </div>

                {/* Right Section: View tools and Window Docks */}
                {!isCollapsed && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} onClick={(e) => e.stopPropagation()}>
                        
                        {/* Trace view-mode logs toggle */}
                        {terminalActiveTab === 'trace' && (
                            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden', padding: '1px' }}>
                                <button 
                                    style={{ border: 'none', background: viewMode === 'terminal' ? 'rgba(255,255,255,0.07)' : 'transparent', color: viewMode === 'terminal' ? '#fff' : 'rgba(255,255,255,0.4)', padding: '2px 8px', fontSize: '9px', cursor: 'pointer', fontFamily: 'inherit' }}
                                    onClick={() => setViewMode('terminal')}
                                >
                                    Console
                                </button>
                                <button 
                                    style={{ border: 'none', background: viewMode === 'json' ? 'rgba(255,255,255,0.07)' : 'transparent', color: viewMode === 'json' ? '#fff' : 'rgba(255,255,255,0.4)', padding: '2px 8px', fontSize: '9px', cursor: 'pointer', fontFamily: 'inherit' }}
                                    onClick={() => setViewMode('json')}
                                >
                                    JSON
                                </button>
                            </div>
                        )}

                        {/* Copy button helpers for Simulation Trace */}
                        {terminalActiveTab === 'trace' && (
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
                        )}

                        {/* Dock modes toggler */}
                        <button
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                color: 'rgba(255,255,255,0.7)',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '9px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontFamily: 'inherit'
                            }}
                            title={isFloating ? "Dock Bottom" : "Detach into Floating Window"}
                            onClick={() => setIsFloating(!isFloating)}
                        >
                            {isFloating ? (
                                <>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="10" rx="2" ry="2"/><path d="M12 2v6M9 5l3-3 3 3"/></svg>
                                    <span>Dock</span>
                                </>
                            ) : (
                                <>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                    <span>Float</span>
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Collapsed label helper */}
                {isCollapsed && (
                    <span style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                        Double-click to expand console
                    </span>
                )}
            </div>

            {/* Panel Body */}
            {!isCollapsed && (
                <div 
                    className="terminal-body" 
                    style={{
                        flex: 1,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative'
                    }}
                >
                    {/* Live Trace logs View */}
                    {terminalActiveTab === 'trace' && (
                        <div style={{ flex: 1, overflow: 'auto', padding: '14px', fontSize: '9.5px', lineHeight: '1.45', textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ 
                                padding: '6px 10px', 
                                background: 'rgba(180, 130, 255, 0.04)', 
                                border: '1px solid rgba(180, 130, 255, 0.1)', 
                                borderRadius: '6px', 
                                marginBottom: '12px', 
                                color: 'rgba(255, 255, 255, 0.65)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '9px'
                            }}>
                                <span>💡</span>
                                <span>Captured message payload logs are compiled and streamed here in real-time during flow playback.</span>
                            </div>
                            <div style={{ flex: 1, overflow: 'auto' }}>
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
                        </div>
                    )}

                    {/* Agent Commands xterm shell container */}
                    <div 
                        ref={shellContainerRef}
                        style={{ 
                            flex: 1, 
                            padding: '6px',
                            background: '#07080d',
                            display: terminalActiveTab === 'shell' ? 'block' : 'none',
                            overflow: 'hidden'
                        }}
                    />
                </div>
            )}

            {/* Terminal Footer (only when not collapsed) */}
            {!isCollapsed && (
                <div style={{
                    padding: '6px 12px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    background: 'rgba(5, 6, 11, 0.4)',
                    fontSize: '9px',
                    color: 'rgba(255, 255, 255, 0.35)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0
                }}>
                    <span>Crafted with 🤍 by Noisy Architects</span>
                    <a 
                        href="https://www.netlify.com" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        style={{ 
                            color: 'rgba(255, 255, 255, 0.45)', 
                            textDecoration: 'none', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '5px',
                            transition: 'color 0.2s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)'; }}
                    >
                        <span style={{ 
                            display: 'inline-block',
                            width: '5px',
                            height: '5px',
                            borderRadius: '50%',
                            background: '#00C7B7',
                            boxShadow: '0 0 6px #00C7B7'
                        }} />
                        Powered by Netlify
                    </a>
                </div>
            )}
        </div>
    );
};
