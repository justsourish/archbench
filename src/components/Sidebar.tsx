import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { AI_PROMPTS } from '../constants';
import { reloadHistoryCache, saveAuditRun, deleteAuditRun } from '../db';
import { 
    generateKnowledgePackJSON, 
    generateKnowledgePackMarkdown 
} from '../utils/generators';
import { calculateArchitectureQualityScore, calculateDatabaseDependencyScore } from '../utils/metrics';
import { renderMarkdownToHtml } from '../utils/projectHelpers';
import { generateArchitectureHealthReport } from '../utils/health-engine';
import { BatchLog } from '../types';

interface Message {
    role: 'system' | 'user' | 'ai' | 'error';
    content: string;
}

export const Sidebar: React.FC = () => {
    const {
        nodes,
        connections,
        flows,
        activeFlow,
        activeStepIndex,
        sidebarTab,
        setSidebarTab,
        startFlow,
        exitFlow,
        stepFlow,
        unifiedBatchLog,
        setUnifiedBatchLog,
            currentRepository,
        isSidebarCollapsed,
        isSidebarDockedRight,
        setSidebarCollapsed,
        setSidebarDockedRight,
        workspace,
        workspaces,
        deleteWorkspace,
        updateWorkspaceName
    } = useProjectStore();

    const handleTabClick = (tabId: string) => {
        if (sidebarTab === tabId && !isSidebarCollapsed) {
            setSidebarCollapsed(true);
        } else {
            setSidebarTab(tabId);
            setSidebarCollapsed(false);
        }
    };

    // Automatically expand sidebar and set tab when a flow is activated
    useEffect(() => {
        if (activeFlow) {
            setSidebarTab('simulator');
            setSidebarCollapsed(false);
        }
    }, [activeFlow, setSidebarTab, setSidebarCollapsed]);

    // AI Tab state
    const [chatHistory, setChatHistory] = useState<Message[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptCloudOpen, setPromptCloudOpen] = useState(false);
    const [composerHeight, setComposerHeight] = useState('54px');

    // LLM Config state (hydrates from localStorage)
    const [aiProvider, setAiProvider] = useState(() => localStorage.getItem("archbench_ai_provider") || "gemini");
    const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("archbench_gemini_key") || "");
    const [geminiModel, setGeminiModel] = useState(() => localStorage.getItem("archbench_gemini_model") || "gemini-2.5-flash");
    const [geminiUrl, setGeminiUrl] = useState(() => localStorage.getItem("archbench_gemini_url") || "https://generativelanguage.googleapis.com");
    
    const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem("archbench_openai_key") || "");
    const [openaiModel, setOpenaiModel] = useState(() => localStorage.getItem("archbench_openai_model") || "gpt-4o");
    const [openaiUrl, setOpenaiUrl] = useState(() => localStorage.getItem("archbench_openai_url") || "https://api.openai.com/v1");

    const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem("archbench_ollama_model") || "qwen2.5:coder");
    const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem("archbench_ollama_url") || "http://localhost:11434");

    const [injectContext, setInjectContext] = useState(() => (localStorage.getItem("archbench_ai_inject_context") || "true") === "true");

    // History and IndexedDB states
    const [historyCache, setHistoryCache] = useState<{ auditRuns: any[]; architectureSnapshots: any[]; healthHistory: any[] }>({
        auditRuns: [],
        architectureSnapshots: [],
        healthHistory: []
    });

    // Batch Audit checklist states
    const [selectedFlows, setSelectedFlows] = useState<string[]>([]);
    const [batchRunning, setBatchRunning] = useState(false);
    const [batchStatusMsg, setBatchStatusMsg] = useState("No batch audit active.");
    const batchTimerRef = useRef<any | null>(null);

    const [workspaceNameInput, setWorkspaceNameInput] = useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteConfirmNameInput, setDeleteConfirmNameInput] = useState('');
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    useEffect(() => {
        if (workspace) {
            setWorkspaceNameInput(workspace.name);
        }
    }, [workspace?.id, workspace?.name]);



    // Initialize list of checked flows for Batch checklist
    useEffect(() => {
        if (flows && flows.length > 0) {
            setSelectedFlows(flows.map(f => f.id));
        }
    }, [flows]);

    // Hydrate history list on mount or when a batch finishes
    const fetchHistory = async () => {
        try {
            const cache = await reloadHistoryCache();
            setHistoryCache(cache);
        } catch (e) {
            console.error("Failed to load IndexedDB history", e);
        }
    };
    useEffect(() => {
        fetchHistory();
    }, [unifiedBatchLog]);

    // Autoplay logic for flow simulation
    const [autoPlayActive, setAutoPlayActive] = useState(false);
    const autoPlayTimerRef = useRef<any | null>(null);

    useEffect(() => {
        if (autoPlayActive && activeFlow) {
            autoPlayTimerRef.current = setTimeout(() => {
                if (activeStepIndex < activeFlow.steps.length - 1) {
                    stepFlow('next');
                } else {
                    setAutoPlayActive(false);
                }
            }, 2800);
        } else {
            if (autoPlayTimerRef.current) {
                clearTimeout(autoPlayTimerRef.current);
                autoPlayTimerRef.current = null;
            }
        }
        return () => {
            if (autoPlayTimerRef.current) {
                clearTimeout(autoPlayTimerRef.current);
            }
        };
    }, [autoPlayActive, activeStepIndex, activeFlow]);

    // Auto scroll chat list
    const chatEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory, aiLoading]);

    // Sync welcome/system message in AI tab
    const hasKeys = useMemo(() => {
        if (aiProvider === 'gemini') return !!geminiKey.trim();
        if (aiProvider === 'openai') return !!openaiKey.trim();
        return true; // Ollama has no key
    }, [aiProvider, geminiKey, openaiKey]);

    useEffect(() => {
        setChatHistory([]);
        if (!hasKeys) {
            // Setup card is displayed instead
        } else {
            const providerLabel = aiProvider === 'gemini' ? `Gemini • ${geminiModel}` : aiProvider === 'openai' ? `OpenAI • ${openaiModel}` : `Ollama • ${ollamaModel}`;
            setChatHistory([{
                role: 'system',
                content: `Ready with ${providerLabel}. Ask a question or use a quick prompt.`
            }]);
        }
    }, [hasKeys, aiProvider, geminiModel, openaiModel, ollamaModel]);

    // Save AI Settings
    const handleSaveAISettings = () => {
        localStorage.setItem("archbench_ai_provider", aiProvider);
        localStorage.setItem("archbench_gemini_key", geminiKey.trim());
        localStorage.setItem("archbench_gemini_model", geminiModel.trim());
        localStorage.setItem("archbench_gemini_url", geminiUrl.trim());
        
        localStorage.setItem("archbench_openai_key", openaiKey.trim());
        localStorage.setItem("archbench_openai_model", openaiModel.trim());
        localStorage.setItem("archbench_openai_url", openaiUrl.trim());

        localStorage.setItem("archbench_ollama_model", ollamaModel.trim());
        localStorage.setItem("archbench_ollama_url", ollamaUrl.trim());
        localStorage.setItem("archbench_ai_inject_context", String(injectContext));

        setSettingsOpen(false);
        alert("AI configuration saved successfully!");
    };

    // Compile Markdown Context Pack
    const getContextMarkdown = () => {
        return generateKnowledgePackMarkdown(
                currentRepository?.title || "Untitled Project",
                currentRepository?.version || "1.0",
            nodes,
            connections,
            flows,
            activeFlow,
            activeStepIndex,
            unifiedBatchLog,
            historyCache
        );
    };

    // Chat invocation handler
    const sendChatMessage = async (promptText: string, displayQuery: string | null = null) => {
        const queryToDisplay = displayQuery || (promptText.length > 80 ? promptText.substring(0, 80) + "..." : promptText);
        
        // Append user question
        setChatHistory(prev => [...prev, { role: 'user', content: queryToDisplay }]);
        setAiLoading(true);

        try {
            let finalPrompt = promptText;
            if (injectContext) {
                const context = getContextMarkdown();
                finalPrompt = `User question: ${promptText}\n\n=== CURRENT ARCHITECTURE SPECIFICATION ===\n${context}`;
            }

            let responseText = "";
            
            if (aiProvider === 'gemini') {
                if (!geminiKey) throw new Error("Gemini API Key is missing. Click settings to configure.");
                let url = geminiUrl.trim();
                if (url.endsWith("/")) url = url.slice(0, -1);
                const endpoint = `${url}/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;
                
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: finalPrompt }] }]
                    })
                });

                if (!response.ok) {
                    const errJson = await response.json().catch(() => ({}));
                    throw new Error(errJson.error?.message || `HTTP ${response.status}: ${response.statusText}`);
                }
                const resData = await response.json();
                responseText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (!responseText) throw new Error("Empty response received from Gemini.");

            } else if (aiProvider === 'openai') {
                if (!openaiKey) throw new Error("OpenAI API Key is missing. Click settings to configure.");
                let url = openaiUrl.trim();
                if (url.endsWith("/")) url = url.slice(0, -1);
                const endpoint = `${url}/chat/completions`;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiKey}`
                    },
                    body: JSON.stringify({
                        model: openaiModel,
                        messages: [{ role: 'user', content: finalPrompt }],
                        temperature: 0.2
                    })
                });

                if (!response.ok) {
                    const errJson = await response.json().catch(() => ({}));
                    throw new Error(errJson.error?.message || `HTTP ${response.status}: ${response.statusText}`);
                }
                const resData = await response.json();
                responseText = resData.choices?.[0]?.message?.content || "";
                if (!responseText) throw new Error("Empty response received from OpenAI.");

            } else if (aiProvider === 'ollama') {
                let url = ollamaUrl.trim();
                if (url.endsWith("/")) url = url.slice(0, -1);
                const endpoint = `${url}/api/chat`;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: ollamaModel,
                        messages: [{ role: 'user', content: finalPrompt }],
                        stream: false
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}. Ensure local Ollama is running.`);
                }
                const resData = await response.json();
                responseText = resData.message?.content || "";
                if (!responseText) throw new Error("Empty response received from Ollama.");
            }

            setChatHistory(prev => [...prev, { role: 'ai', content: responseText }]);

        } catch (err: any) {
            console.error("AI invocation failed", err);
            setChatHistory(prev => [...prev, { role: 'error', content: `⚠️ Error: ${err.message}` }]);
        } finally {
            setAiLoading(false);
        }
    };

    // Sequential Audit Loop (Batch simulator)
    const stopBatchRun = () => {
        setBatchRunning(false);
        if (batchTimerRef.current) {
            clearTimeout(batchTimerRef.current);
            batchTimerRef.current = null;
        }
        setBatchStatusMsg("Batch audit stopped.");
        setUnifiedBatchLog(null);
        exitFlow();
    };

    const startBatchRun = () => {
        if (selectedFlows.length === 0) {
            alert("Please select at least one simulation scenario flow!");
            return;
        }

        exitFlow();
        setBatchRunning(true);
        setUnifiedBatchLog(null);
        setSidebarTab('simulator');

        // Scaffolding base log structure
        const baseLog: BatchLog = {
            timestamp: new Date().toISOString(),
            flowsSimulated: selectedFlows.map(fid => {
                const f = flows.find(x => x.id === fid);
                return f ? f.title : fid;
            }),
            steps: []
        };

        let queueIndex = 0;
        let stepIndex = 0;

        const runBatchStep = () => {
            if (queueIndex >= selectedFlows.length) {
                // Completed sequence!
                setBatchRunning(false);
                setBatchStatusMsg("Batch simulation complete! Log compiled.");
                exitFlow();

                // Compute report and save
                const activeProjId = currentRepository?.id || 'demo-sample';
                const health = generateArchitectureHealthReport(baseLog, nodes, connections);
                const pack = generateKnowledgePackJSON(
                    currentRepository?.title || "Untitled Project",
                    currentRepository?.version || "1.0",
                    nodes,
                    connections,
                    flows,
                    null,
                    -1,
                    baseLog,
                    historyCache
                );

                if (health) {
                    const dbScore = calculateDatabaseDependencyScore(health);
                    saveAuditRun(
                        baseLog, 
                        activeProjId, 
                        nodes, 
                        connections, 
                        flows, 
                        health, 
                        pack, 
                        dbScore
                    ).then(() => {
                        setUnifiedBatchLog(baseLog);
                        setSidebarTab('health');
                        alert("Batch audit complete! Health Report generated & saved to local history.");
                    }).catch(err => {
                        console.error("DB Save failed", err);
                        setUnifiedBatchLog(baseLog);
                        setSidebarTab('health');
                        alert("Batch audit complete! Health Report generated.");
                    });
                }
                return;
            }

            const currentFlowId = selectedFlows[queueIndex];
            const flow = flows.find(f => f.id === currentFlowId);
            if (!flow) {
                queueIndex++;
                stepIndex = 0;
                runBatchStep();
                return;
            }

            // Start flow simulation
            if (stepIndex === 0) {
                startFlow(flow.id);
                setBatchStatusMsg(`Simulating: ${flow.title}...`);
            }

            // Record Step log details
            const s = flow.steps[stepIndex];
            const nodeObj = nodes.find(n => n.id === s.node);
            baseLog.steps.push({
                node: nodeObj ? nodeObj.title : s.node,
                flow: flow.title,
                action: s.label,
                details: s.detail
            });

            // Trigger next step
            batchTimerRef.current = setTimeout(() => {
                if (stepIndex < flow.steps.length - 1) {
                    stepIndex++;
                    stepFlow('next');
                    runBatchStep();
                } else {
                    // Completed this flow, move to next flow in queue
                    queueIndex++;
                    stepIndex = 0;
                    runBatchStep();
                }
            }, 1000);
        };

        runBatchStep();
    };

    // Sync textarea sizing
    const handleComposerInput = (val: string) => {
        setChatInput(val);
        const newHeight = Math.min(140, Math.max(54, val.split('\n').length * 20 + 24));
        setComposerHeight(`${newHeight}px`);
    };

    // Markdown context pack copy
    const handleCopyPack = () => {
        const md = getContextMarkdown();
        navigator.clipboard.writeText(md).then(() => {
            alert("Markdown Knowledge Pack copied to clipboard!");
        });
    };



    // Health report computations
    const activeHealthReport = useMemo(() => {
        if (!unifiedBatchLog) return null;
        return generateArchitectureHealthReport(unifiedBatchLog, nodes, connections);
    }, [unifiedBatchLog, nodes, connections]);

    const activeQualityScore = useMemo(() => {
        return activeHealthReport ? calculateArchitectureQualityScore(activeHealthReport) : 100;
    }, [activeHealthReport]);

    const activeDbScore = useMemo(() => {
        return activeHealthReport ? calculateDatabaseDependencyScore(activeHealthReport) : 0;
    }, [activeHealthReport]);

    // History run selector handler
    const handleLoadHistoryRun = (run: any) => {
        setUnifiedBatchLog(run.unifiedAuditLog);
        setSidebarTab('health');
        alert(`Loaded historic health report from audit run: ${run.id}`);
    };

    const handleDeleteHistoryRun = async (e: React.MouseEvent, runId: string) => {
        e.stopPropagation();
        if (confirm("Delete this historic audit run record?")) {
            await deleteAuditRun(runId);
            fetchHistory();
        }
    };

    // Logs formatter (moved to bottom TerminalConsole)

    return (
        <div 
            className={`flow-playback ${isSidebarDockedRight ? 'dock-right' : 'dock-left'} ${isSidebarCollapsed ? 'collapsed' : ''}`} 
            id="flow-playback"
            style={{
                position: 'fixed',
                top: 0,
                bottom: 0,
                [isSidebarDockedRight ? 'right' : 'left']: 0,
                height: '100vh',
                zIndex: 250,
                width: isSidebarCollapsed ? '48px' : '400px',
                minWidth: isSidebarCollapsed ? '48px' : '400px',
                transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.2s cubic-bezier(0.16, 1, 0.3, 1), left 0.2s cubic-bezier(0.16, 1, 0.3, 1), right 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
        >
            <div className="fp-header" id="fp-header" style={{ userSelect: 'none' }}>
                <div className="fp-title-area">
                    <span className="fp-title" id="fp-title">
                        {sidebarTab === 'ai' && 'AI System Architect'}
                        {sidebarTab === 'simulator' && 'Trace Flow Simulator'}
                        {sidebarTab === 'batch' && 'Batch Audit Checklist'}
                        {sidebarTab === 'log' && 'Simulation Execution Log'}
                        {sidebarTab === 'health' && 'Architecture Health Report'}
                        {sidebarTab === 'history' && 'Audit History Index'}
                        {sidebarTab === 'pack' && 'Knowledge Context Pack'}
                    </span>
                    <span className="fp-subtitle" id="fp-subtitle">
                        {sidebarTab === 'ai' && 'Interactive BYO-LLM diagram audits'}
                        {sidebarTab === 'simulator' && activeFlow?.title}
                        {sidebarTab === 'batch' && 'Run checklists sequentially'}
                        {sidebarTab === 'log' && 'Compiled system trace logs'}
                        {sidebarTab === 'health' && 'Quality indicators and recommendations'}
                        {sidebarTab === 'history' && 'Local IndexedDB audit snapshots'}
                        {sidebarTab === 'pack' && 'Compile spec documents for LLMs'}
                    </span>
                </div>
                <div className="fp-header-actions">
                    <button className="fp-action-btn btn-dock" id="fp-dock" title="Cycle Dock Position" onClick={() => setSidebarDockedRight(!isSidebarDockedRight)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                    </button>
                </div>
            </div>

            {/* Tab buttons activity bar */}
            <div className="fp-tabs" id="fp-tabs">
                <button className={`fp-tab ${sidebarTab === 'simulator' ? 'active' : ''}`} onClick={() => handleTabClick('simulator')} title="Trace Flow Simulator">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </button>
                <button className={`fp-tab ${sidebarTab === 'batch' ? 'active' : ''}`} onClick={() => handleTabClick('batch')} title="Flow Checklist & Audit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                </button>
                <button className={`fp-tab ${sidebarTab === 'health' ? 'active' : ''}`} onClick={() => handleTabClick('health')} title="Architecture Health Report">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                </button>
                <button className={`fp-tab ${sidebarTab === 'history' ? 'active' : ''}`} onClick={() => handleTabClick('history')} title="Simulation History Index">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </button>
                <button className={`fp-tab ${sidebarTab === 'pack' ? 'active' : ''}`} onClick={() => handleTabClick('pack')} title="Markdown Knowledge Pack">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"/><polygon points="12 22.08 12 12 21 6.92 21 17.08 12 22.08"/><polygon points="12 12 3 6.92 12 1.84 21 6.92 12 12"/></svg>
                </button>
                <button className={`fp-tab ${sidebarTab === 'ai' ? 'active' : ''}`} onClick={() => handleTabClick('ai')} title="AI System Architect (Beta)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 9h6v6H9z"/><path d="M9 1v2"/><path d="M15 1v2"/><path d="M9 21v2"/><path d="M15 21v2"/><path d="M1 9h2"/><path d="M1 15h2"/><path d="M21 9h2"/><path d="M21 15h2"/></svg>
                </button>


                <button 
                    className={`fp-tab ${sidebarTab === 'settings' ? 'active' : ''}`} 
                    onClick={() => handleTabClick('settings')} 
                    title="Workspace Settings"
                    style={{ marginTop: 'auto' }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                </button>

                <button 
                    className="fp-tab fp-tab-toggle" 
                    style={{ 
                        background: 'rgba(180, 130, 255, 0.12)',
                        color: 'hsl(280, 95%, 75%)',
                        boxShadow: '0 -2px 10px rgba(0,0,0,0.3)',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                    }} 
                    onClick={() => setSidebarCollapsed(!isSidebarCollapsed)} 
                    title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(180, 130, 255, 0.22)';
                        e.currentTarget.style.color = '#ffffff';
                        e.currentTarget.style.boxShadow = '0 0 12px rgba(180, 130, 255, 0.25)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(180, 130, 255, 0.12)';
                        e.currentTarget.style.color = 'hsl(280, 95%, 75%)';
                        e.currentTarget.style.boxShadow = '0 -2px 10px rgba(0,0,0,0.3)';
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: (isSidebarCollapsed !== isSidebarDockedRight) ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <polyline points="15 18 9 12 15 6"/>
                    </svg>
                </button>
            </div>

            {/* Panel containers */}
            {!isSidebarCollapsed && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    
                    {/* ── AI SYSTEM ARCHITECT ───────────────────────────────── */}
                    {sidebarTab === 'ai' && (
                        <div className="fp-tab-panel active" id="panel-ai" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                            {/* Beta Warning Banner */}
                            <div style={{
                                background: 'rgba(255, 170, 0, 0.08)',
                                borderBottom: '1px solid rgba(255, 170, 0, 0.15)',
                                padding: '8px 12px',
                                fontSize: '10px',
                                color: 'hsl(40, 95%, 70%)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                flexShrink: 0
                            }}>
                                <span style={{ fontSize: '12px' }}>⚠️</span>
                                <span style={{ textAlign: 'left', lineHeight: '1.4' }}>
                                    <strong>Beta Feature:</strong> This AI feature is under active development. You can pair your own LLM API key, but please note that this is experimental and connections/responses might be unstable.
                                </span>
                            </div>
                            <div className="ai-chat-header" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="ai-model-badge" id="ai-model-badge">
                                    {!hasKeys ? "No provider configured" : (aiProvider === 'gemini' ? `Gemini • ${geminiModel}` : aiProvider === 'openai' ? `OpenAI • ${openaiModel}` : `Ollama • ${ollamaModel}`)}
                                </span>
                                <div className="ai-chat-header-actions" style={{ display: 'flex', gap: '6px' }}>
                                    <button className="ai-header-btn" id="btn-ai-settings" onClick={() => setSettingsOpen(true)}>⚙️ Settings</button>
                                    <button className="ai-header-btn" id="btn-clear-chat" onClick={() => { if(confirm("Clear chat?")) setChatHistory([]); }}>🗑️ Clear</button>
                                </div>
                            </div>

                            <div className="ai-chat-history" id="ai-chat-history" style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {!hasKeys ? (
                                    <div className="ai-setup-card" style={{ padding: '24px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔑</div>
                                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff', marginBottom: '6px' }}>Configure Your Assistant</div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.4 }}>Choose Gemini, an OpenAI-compatible provider, or local Ollama. API settings stay secure inside your local browser.</div>
                                        <button className="tb-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setSettingsOpen(true)}>⚙️ Configure LLM Settings</button>
                                    </div>
                                ) : (
                                    chatHistory.map((msg, i) => (
                                        <div key={i} className={`ai-msg ${msg.role}`} dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(msg.content) }} />
                                    ))
                                )}
                                {aiLoading && (
                                    <div className="ai-msg ai typing">
                                        <div className="ai-typing-indicator">
                                            <span className="ai-typing-dot"></span>
                                            <span className="ai-typing-dot"></span>
                                            <span className="ai-typing-dot"></span>
                                        </div>
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Prompt template pills */}
                            <div className="ai-tools-panel" id="ai-tools-panel" style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                <div className="ai-tools-row" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <div className="ai-tools-primary" id="ai-quick-templates" style={{ display: 'flex', gap: '4px', overflowX: 'auto', flex: 1 }}>
                                        {Object.entries(AI_PROMPTS).slice(0, 4).map(([key, info]: [string, any]) => (
                                            <button 
                                                key={key} 
                                                className="ai-chip"
                                                onClick={() => {
                                                    const mdContext = getContextMarkdown();
                                                    const compiledPrompt = info.prompt(mdContext);
                                                    sendChatMessage(compiledPrompt, info.shortQuery || info.title);
                                                }}
                                            >
                                                {info.title}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="ai-tools-anchor" style={{ position: 'relative' }}>
                                        <button 
                                            className={`ai-tools-toggle ${promptCloudOpen ? 'open' : ''}`} 
                                            id="ai-tools-toggle"
                                            onClick={() => setPromptCloudOpen(!promptCloudOpen)}
                                        >
                                            <span className="ai-tools-toggle-glyph">+</span>
                                        </button>
                                        
                                        {promptCloudOpen && (
                                            <div className="ai-tools-popover open" id="ai-tools-popover" style={{ display: 'block', position: 'absolute', bottom: '34px', right: 0, zIndex: 100 }}>
                                                <div className="ai-tools-popover-grid" id="ai-overflow-templates">
                                                    {Object.entries(AI_PROMPTS).slice(4).map(([key, info]: [string, any], idx) => (
                                                        <button 
                                                            key={key} 
                                                            className="ai-chip ai-chip-overflow"
                                                            style={{ '--fan-delay': idx } as React.CSSProperties}
                                                            onClick={() => {
                                                                const mdContext = getContextMarkdown();
                                                                const compiledPrompt = info.prompt(mdContext);
                                                                setPromptCloudOpen(false);
                                                                sendChatMessage(compiledPrompt, info.shortQuery || info.title);
                                                            }}
                                                        >
                                                            {info.title}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Composer box */}
                            <div className="ai-input-container" style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                                <div className="ai-composer" style={{ flex: 1 }}>
                                    <textarea 
                                        className="ai-chat-input" 
                                        id="ai-chat-input" 
                                        style={{ height: composerHeight }}
                                        value={chatInput}
                                        placeholder="Ask about this architecture. Shift+Enter for a new line."
                                        onChange={(e) => handleComposerInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                sendChatMessage(chatInput);
                                                setChatInput('');
                                                setComposerHeight('54px');
                                            }
                                        }}
                                    />
                                </div>
                                <button 
                                    type="button" 
                                    className="ai-send-btn" 
                                    id="btn-ai-send" 
                                    disabled={aiLoading || !chatInput.trim()}
                                    onClick={() => {
                                        sendChatMessage(chatInput);
                                        setChatInput('');
                                        setComposerHeight('54px');
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                </button>
                            </div>

                            {/* Settings Drawer */}
                            <div className={`ai-settings-drawer ${settingsOpen ? 'open' : ''}`} id="ai-settings-drawer" style={{ display: settingsOpen ? 'block' : 'none' }}>
                                <div className="drawer-header">
                                    <span className="drawer-title">Bring Your Own LLM</span>
                                    <button className="drawer-close-btn" id="btn-close-settings" onClick={() => setSettingsOpen(false)}>✕</button>
                                </div>
                                <div className="drawer-body" style={{ overflowY: 'auto', maxHeight: 'calc(100% - 40px)', padding: '12px' }}>
                                    <div className="form-group" style={{ marginBottom: '10px' }}>
                                        <label className="form-label">API Provider</label>
                                        <select 
                                            className="form-input" 
                                            value={aiProvider} 
                                            onChange={(e) => setAiProvider(e.target.value)}
                                            style={{ width: '100%', padding: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', color: '#fff' }}
                                        >
                                            <option value="gemini">Google Gemini</option>
                                            <option value="openai">OpenAI (or Compatible)</option>
                                            <option value="ollama">Ollama (Local LLM)</option>
                                        </select>
                                    </div>

                                    {/* Gemini Options */}
                                    {aiProvider === 'gemini' && (
                                        <div className="provider-config-section" id="section-gemini">
                                            <div className="form-group">
                                                <label className="form-label">Gemini API Key</label>
                                                <input className="form-input" type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIzaSy..." />
                                                <span className="form-note">Get key from Google AI Studio. Stored locally in your browser.</span>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Gemini Model</label>
                                                <input className="form-input" type="text" value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Endpoint Base URL (Optional)</label>
                                                <input className="form-input" type="text" value={geminiUrl} onChange={(e) => setGeminiUrl(e.target.value)} />
                                            </div>
                                        </div>
                                    )}

                                    {/* OpenAI Options */}
                                    {aiProvider === 'openai' && (
                                        <div className="provider-config-section" id="section-openai">
                                            <div className="form-group">
                                                <label className="form-label">OpenAI API Key</label>
                                                <input className="form-input" type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-proj-..." />
                                                <span className="form-note">Your API key is stored in this browser and sent directly from the client.</span>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Model Name</label>
                                                <input className="form-input" type="text" value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Endpoint Base URL (Optional)</label>
                                                <input className="form-input" type="text" value={openaiUrl} onChange={(e) => setOpenaiUrl(e.target.value)} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Ollama Options */}
                                    {aiProvider === 'ollama' && (
                                        <div className="provider-config-section" id="section-ollama">
                                            <div className="form-group">
                                                <label className="form-label">Ollama Base URL</label>
                                                <input className="form-input" type="text" value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Model Name</label>
                                                <input className="form-input" type="text" value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} />
                                                <span className="form-note">Run <code>ollama pull &lt;model&gt;</code> before using.</span>
                                            </div>
                                            <div style={{ background: 'rgba(255, 175, 0, 0.08)', border: '1px solid rgba(255, 175, 0, 0.15)', padding: '8px', borderRadius: '6px', fontSize: '10px', lineHeight: 1.4, color: 'hsl(40, 95%, 70%)', marginTop: '10px' }}>
                                                <strong>⚠️ CORS Notice:</strong> Browser calls to local Ollama require setting origins. Start Ollama from your terminal with:
                                                <pre style={{ margin: '4px 0 0 0', padding: '4px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '9px', overflowX: 'auto' }}>OLLAMA_ORIGINS="*" ollama serve</pre>
                                            </div>
                                        </div>
                                    )}

                                    {/* Context Injection Preference */}
                                    <div className="form-group" style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
                                            <input type="checkbox" checked={injectContext} onChange={(e) => setInjectContext(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
                                            Auto-inject system context
                                        </label>
                                        <span className="form-note">Automatically includes your complete architecture specification context on prompt template queries.</span>
                                    </div>

                                    <button className="btn-primary" onClick={handleSaveAISettings} style={{ width: '100%', marginTop: '12px', fontWeight: 600 }}>Save Settings</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── TRACE FLOW SIMULATOR ───────────────────────────────── */}
                    {sidebarTab === 'simulator' && (
                        <div className="fp-tab-panel active" id="panel-simulator" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {activeFlow ? (
                                <>
                                    <div className="fp-progress-track">
                                        <div className="fp-progress-fill" style={{ width: `${((activeStepIndex + 1) / activeFlow.steps.length) * 100}%` }} id="fp-progress-fill"></div>
                                    </div>
                                    <div className="fp-body" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                                        <div className="fp-step-badge" style={{ background: `linear-gradient(135deg, ${activeFlow.color || 'hsl(210,85%,62%)'}, color-mix(in srgb, ${activeFlow.color || 'hsl(210,85%,62%)'} 70%, white))` }} id="fp-step-badge">
                                            {activeStepIndex + 1}
                                        </div>
                                        <div className="fp-step-content" style={{ marginTop: '12px' }}>
                                            <div className="fp-step-label" style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }} id="fp-step-label">
                                                {activeFlow.steps[activeStepIndex]?.label}
                                            </div>
                                            <div className="fp-step-detail" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.4 }} id="fp-step-detail">
                                                {activeFlow.steps[activeStepIndex]?.detail}
                                            </div>
                                            {activeFlow.steps[activeStepIndex]?.data && (
                                                <div className="fp-step-data visible" style={{ marginTop: '12px', fontSize: '9px', background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '4px', overflowX: 'auto', fontFamily: 'monospace' }} id="fp-step-data">
                                                    {activeFlow.steps[activeStepIndex]?.data}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="fp-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px', padding: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                        <button className="fp-ctrl-btn" disabled={activeStepIndex <= 0} onClick={() => stepFlow('prev')} title="Previous Step">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                                        </button>
                                        <button className={`fp-ctrl-btn fp-play-btn ${autoPlayActive ? 'playing' : ''}`} onClick={() => setAutoPlayActive(!autoPlayActive)} title="Auto Play">
                                            {!autoPlayActive ? (
                                                <svg className="play-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21"/></svg>
                                            ) : (
                                                <svg className="pause-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="5" height="18"/><rect x="14" y="3" width="5" height="18"/></svg>
                                            )}
                                        </button>
                                        <button className="fp-ctrl-btn" disabled={activeStepIndex >= activeFlow.steps.length - 1} onClick={() => stepFlow('next')} title="Next Step">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                                        </button>
                                        <button className="fp-action-btn fp-close-btn" onClick={exitFlow} title="Exit Simulation (✖)" style={{ marginLeft: 'auto', background: 'rgba(255, 70, 70, 0.08)', borderColor: 'rgba(255, 70, 70, 0.2)', color: 'hsl(0, 90%, 75%)', width: '26px', height: '26px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                        </button>
                                        <span className="fp-step-counter" id="fp-step-counter" style={{ marginLeft: '6px', fontSize: '10px' }}>{activeStepIndex + 1} / {activeFlow.steps.length}</span>
                                    </div>
                                </>
                            ) : (
                                <div style={{ padding: '16px', overflowY: 'auto', height: '100%' }}>
                                    <h3 style={{ margin: '0 0 12px 0', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Start Simulation Flow</h3>
                                    {flows.length === 0 ? (
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px', textAlign: 'center' }}>
                                            No simulation flows defined in this spec.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {flows.map(flow => (
                                                <button
                                                    key={flow.id}
                                                    onClick={() => startFlow(flow.id)}
                                                    style={{
                                                        background: 'rgba(255,255,255,0.02)',
                                                        border: '1px solid rgba(255,255,255,0.08)',
                                                        borderRadius: '8px',
                                                        padding: '12px',
                                                        textAlign: 'left',
                                                        cursor: 'pointer',
                                                        color: '#fff',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '4px',
                                                        width: '100%',
                                                        transition: 'border-color 0.2s, background 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.borderColor = flow.color || 'hsl(210,85%,62%)';
                                                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                                                        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                                                    }}
                                                >
                                                    <span style={{ fontSize: '11px', fontWeight: 600, color: flow.color || 'hsl(210,85%,62%)' }}>⚡ {flow.title}</span>
                                                    <span style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.3 }}>{flow.subtitle || 'Run simulation sequence'}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── BATCH CHECKLIST & AUDIT RUNNER ───────────────────── */}
                    {sidebarTab === 'batch' && (
                        <div className="fp-tab-panel active" id="panel-batch" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
                                Select multiple simulation flows to run them sequentially. The simulator will compile a unified execution trace and write quality scores to Local IndexedDB history.
                            </p>
                            
                            <div className="batch-checklist" id="batch-checklist" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                                {flows.map(flow => (
                                    <label key={flow.id} className="batch-checkbox-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                                        <input 
                                            type="checkbox" 
                                            value={flow.id} 
                                            disabled={batchRunning}
                                            checked={selectedFlows.includes(flow.id)} 
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedFlows([...selectedFlows, flow.id]);
                                                } else {
                                                    setSelectedFlows(selectedFlows.filter(id => id !== flow.id));
                                                }
                                            }}
                                        />
                                        <span className="flow-btn-dot" style={{ background: flow.color || 'hsl(210,85%,62%)', width: '8px', height: '8px', borderRadius: '50%' }}></span>
                                        <span style={{ fontSize: '11px', color: '#fff' }}>{flow.title}</span>
                                    </label>
                                ))}
                            </div>

                            <div className="action-row" style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                                {!batchRunning ? (
                                    <button className="btn-primary" onClick={startBatchRun} style={{ flex: 1 }}>
                                        ⚡ Run Sequential Audit
                                    </button>
                                ) : (
                                    <button className="btn-secondary" onClick={stopBatchRun} style={{ flex: 1, background: "rgba(255, 70, 70, 0.1)", borderColor: "rgba(255, 70, 70, 0.2)", color: "hsl(0, 90%, 75%)" }}>
                                        ⏹ Stop Audit
                                    </button>
                                )}
                            </div>
                            <div id="batch-status-msg" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic', textAlign: 'center' }}>
                                {batchStatusMsg}
                            </div>
                        </div>
                    )}

                    {/* ── ARCHITECTURE HEALTH REPORT ────────────────────────── */}
                    {sidebarTab === 'health' && (
                        <div className="fp-tab-panel active" id="panel-health" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                            {activeHealthReport ? (
                                <div className="health-report-content" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    
                                    {/* Metrics gauges */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quality Score</div>
                                            <div style={{ fontSize: '20px', fontWeight: 700, color: activeQualityScore > 75 ? 'hsl(140, 75%, 65%)' : 'hsl(40, 95%, 70%)', margin: '4px 0' }}>{activeQualityScore}/100</div>
                                        </div>
                                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>DB dependency</div>
                                            <div style={{ fontSize: '20px', fontWeight: 700, color: activeDbScore < 30 ? 'hsl(140, 75%, 65%)' : 'hsl(0, 90%, 75%)', margin: '4px 0' }}>{activeDbScore}%</div>
                                        </div>
                                    </div>

                                    {/* Summary counts */}
                                    <div style={{ fontSize: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                                        <div>Flows Run: <strong>{activeHealthReport.summary.flowsExecuted}</strong></div>
                                        <div>Total Trace Steps: <strong>{activeHealthReport.summary.totalSteps}</strong></div>
                                        <div>Nodes Traversed: <strong>{activeHealthReport.summary.uniqueNodesActivated}</strong></div>
                                        <div>Edges Crossed: <strong>{activeHealthReport.summary.connectionsTraversed}</strong></div>
                                    </div>

                                    {/* Observations list */}
                                    {activeHealthReport.observations.length > 0 && (
                                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>🔍 Observations</div>
                                            <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '14px', margin: 0, fontSize: '10px', color: 'var(--text-secondary)' }}>
                                                {activeHealthReport.observations.map((obs, i) => (
                                                    <li key={i}>{obs}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Risks list */}
                                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>⚠️ Risks Indicators</div>
                                        {activeHealthReport.risks.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {activeHealthReport.risks.map((risk, i) => (
                                                    <div key={i} style={{ fontSize: '10px', padding: '6px 8px', borderRadius: '4px', background: risk.severity === 'critical' ? 'rgba(255,70,70,0.06)' : 'rgba(255,175,0,0.06)', borderLeft: `3px solid ${risk.severity === 'critical' ? 'hsl(0,90%,65%)' : 'hsl(40,90%,60%)'}` }}>
                                                        <strong style={{ color: '#fff' }}>[{risk.severity.toUpperCase()}] {risk.title}</strong>
                                                        <div style={{ marginTop: '2px', color: 'var(--text-secondary)' }}>{risk.desc}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No architectural risks detected! Clean architecture.</div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                                    Run Sequential Audit from the Batch Checklist tab to generate Quality and SPOF reports.
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── HISTORY INDEX PANEL ──────────────────────────────── */}
                    {sidebarTab === 'history' && (
                        <div className="fp-tab-panel active" id="panel-history" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                            <div className="history-report-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {historyCache.auditRuns.length > 0 ? (
                                    historyCache.auditRuns.map(run => {
                                        const dateStr = new Date(run.timestamp).toLocaleString();
                                        const score = run.architectureHealthReport ? calculateArchitectureQualityScore(run.architectureHealthReport) : 0;
                                        return (
                                            <div 
                                                key={run.id} 
                                                onClick={() => handleLoadHistoryRun(run)}
                                                className="history-run-item" 
                                                style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#fff' }}>Audit Run {run.id.split('_')[1]}</div>
                                                    <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{dateStr} • v{run.architectureVersion}</div>
                                                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{run.flowsExecuted.length} scenarios, {run.architectureHealthReport?.summary?.totalSteps || 0} steps</div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '12px', fontWeight: 700, color: score > 75 ? 'hsl(140, 75%, 65%)' : 'hsl(40, 95%, 70%)' }}>{score}</span>
                                                    <button 
                                                        className="fp-action-btn" 
                                                        onClick={(e) => handleDeleteHistoryRun(e, run.id)} 
                                                        style={{ color: 'hsl(0,90%,75%)', padding: '4px', background: 'rgba(255,0,0,0.08)', borderRadius: '4px' }}
                                                        title="Delete this audit record"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                                        No historic audit runs stored in this browser database yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── KNOWLEDGE CONTEXT PACK ────────────────────────────── */}
                    {sidebarTab === 'pack' && (
                        <div className="fp-tab-panel active" id="panel-pack" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                            <p style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '12px' }}>
                                Compile the complete system topology details, node responsibilities, workflows, simulation audit paths, and historical health records into a structured document. Copy and paste directly into Google Gemini, OpenAI, or Claude.
                            </p>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
                                <button className="btn-primary" onClick={handleCopyPack} style={{ padding: '10px', fontSize: '11px' }}>
                                    📋 Copy Markdown Context Pack
                                </button>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button 
                                        className="btn-secondary" 
                                        style={{ flex: 1, fontSize: '10px' }}
                                        onClick={() => {
                                            const json = generateKnowledgePackJSON(
                                                    currentRepository?.title || "Untitled Project",
                                                    currentRepository?.version || "1.0",
                                                nodes,
                                                connections,
                                                flows,
                                                activeFlow,
                                                activeStepIndex,
                                                unifiedBatchLog,
                                                historyCache
                                            );
                                            const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = 'architecture-knowledge-pack.json';
                                            a.click();
                                            URL.revokeObjectURL(url);
                                        }}
                                    >
                                        Download JSON
                                    </button>
                                    <button 
                                        className="btn-secondary" 
                                        style={{ flex: 1, fontSize: '10px' }}
                                        onClick={() => {
                                            const md = getContextMarkdown();
                                            const blob = new Blob([md], { type: 'text/markdown' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = 'architecture-knowledge-pack.md';
                                            a.click();
                                            URL.revokeObjectURL(url);
                                        }}
                                    >
                                        Download MD
                                    </button>
                            </div>
                        </div>
                        </div>
                    )}

                    {/* ── WORKSPACE SETTINGS ────────────────────────────── */}
                    {sidebarTab === 'settings' && (
                        <div className="fp-tab-panel active" id="panel-settings" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#fff', margin: '0 0 4px 0' }}>Workspace Settings</h3>
                                <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                                    Manage your active workspace parameters and connected repository context configurations.
                                </p>
                            </div>

                            {/* Workspace Name Input Card */}
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.02)',
                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                borderRadius: '8px',
                                padding: '12px',
                                marginBottom: '16px'
                            }}>
                                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                    Workspace Name
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        type="text" 
                                        value={workspaceNameInput} 
                                        onChange={(e) => setWorkspaceNameInput(e.target.value)}
                                        style={{
                                            flex: 1,
                                            background: 'rgba(0, 0, 0, 0.3)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: '4px',
                                            padding: '6px 10px',
                                            color: '#fff',
                                            fontSize: '11px',
                                            outline: 'none',
                                            transition: 'border-color 0.2s'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'hsl(280, 95%, 75%)'}
                                        onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                                    />
                                    <button 
                                        className="btn-primary" 
                                        disabled={!workspaceNameInput.trim() || workspaceNameInput.trim() === (workspace?.name || '')}
                                        onClick={() => {
                                            if (workspaceNameInput.trim() && workspace) {
                                                updateWorkspaceName(workspace.id, workspaceNameInput.trim());
                                                alert("Workspace name updated successfully!");
                                            }
                                        }}
                                        style={{
                                            padding: '6px 12px',
                                            fontSize: '11px',
                                            borderRadius: '4px',
                                            background: (workspaceNameInput.trim() && workspaceNameInput.trim() !== (workspace?.name || '')) ? 'hsl(280, 85%, 60%)' : 'rgba(255,255,255,0.05)',
                                            color: (workspaceNameInput.trim() && workspaceNameInput.trim() !== (workspace?.name || '')) ? '#fff' : 'rgba(255,255,255,0.3)',
                                            cursor: (workspaceNameInput.trim() && workspaceNameInput.trim() !== (workspace?.name || '')) ? 'pointer' : 'default'
                                        }}
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>

                            {/* Danger Zone Card */}
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.02)',
                                border: '1px solid rgba(239, 68, 68, 0.15)',
                                borderRadius: '8px',
                                padding: '12px',
                                marginTop: 'auto'
                            }}>
                                <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'rgb(239, 68, 68)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                    ⚠️ Danger Zone
                                </span>
                                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                                    Deleting this workspace will remove all registered repositories, active view state mapping, and purge all spec files and audit logs from your local browser database. Physical folders and files on your computer will remain completely untouched.
                                </p>
                                <button 
                                    onClick={() => {
                                        if (workspaces.length <= 1) {
                                            alert("You must keep at least one workspace. Create another workspace first before deleting this one.");
                                            return;
                                        }
                                        setIsDeleteModalOpen(true);
                                        setDeleteConfirmNameInput('');
                                        setDeleteConfirmText('');
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        background: 'transparent',
                                        border: '1px solid rgb(239, 68, 68)',
                                        borderRadius: '4px',
                                        color: 'rgb(239, 68, 68)',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgb(239, 68, 68)';
                                        e.currentTarget.style.color = '#fff';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = 'rgb(239, 68, 68)';
                                    }}
                                >
                                    Delete Workspace...
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            )}

            {/* Delete Confirmation Modal Overlay */}
            {isDeleteModalOpen && workspace && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(5, 6, 10, 0.85)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: 'rgba(15, 17, 28, 0.95)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '12px',
                        maxWidth: '420px',
                        width: '100%',
                        padding: '24px',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <div>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: 'rgb(239, 68, 68)' }}>⚠️</span> Delete Workspace?
                            </h3>
                            <p style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', margin: 0, lineHeight: 1.5 }}>
                                This action is permanent and cannot be undone. To proceed, please confirm you want to delete <strong style={{ color: '#fff' }}>{workspace.name}</strong>.
                            </p>
                        </div>

                        {/* Instruction and Validation Form */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                    Type the workspace name to confirm: <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>({workspace.name})</span>
                                </label>
                                <input 
                                    type="text" 
                                    value={deleteConfirmNameInput}
                                    onChange={(e) => setDeleteConfirmNameInput(e.target.value)}
                                    placeholder={workspace.name}
                                    style={{
                                        width: '100%',
                                        background: 'rgba(0, 0, 0, 0.4)',
                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                        borderRadius: '6px',
                                        padding: '8px 12px',
                                        color: '#fff',
                                        fontSize: '12px',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                    Type <span style={{ color: 'rgb(239, 68, 68)', fontWeight: 800 }}>DELETE</span> to finalize:
                                </label>
                                <input 
                                    type="text" 
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                    placeholder="DELETE"
                                    style={{
                                        width: '100%',
                                        background: 'rgba(0, 0, 0, 0.4)',
                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                        borderRadius: '6px',
                                        padding: '8px 12px',
                                        color: '#fff',
                                        fontSize: '12px',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                            <button 
                                className="btn-secondary" 
                                onClick={() => setIsDeleteModalOpen(false)}
                                style={{
                                    flex: 1,
                                    padding: '8px 16px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={async () => {
                                    if (deleteConfirmNameInput === workspace.name && deleteConfirmText === 'DELETE') {
                                        setIsDeleteModalOpen(false);
                                        await deleteWorkspace(workspace.id);
                                        setSidebarTab('simulator'); // Switch back to a safe default tab
                                        alert("Workspace deleted successfully.");
                                    }
                                }}
                                disabled={deleteConfirmNameInput !== workspace.name || deleteConfirmText !== 'DELETE'}
                                style={{
                                    flex: 1,
                                    padding: '8px 16px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    background: (deleteConfirmNameInput === workspace.name && deleteConfirmText === 'DELETE') ? 'rgb(239, 68, 68)' : 'rgba(239, 68, 68, 0.1)',
                                    color: (deleteConfirmNameInput === workspace.name && deleteConfirmText === 'DELETE') ? '#fff' : 'rgba(239, 68, 68, 0.4)',
                                    border: 'none',
                                    cursor: (deleteConfirmNameInput === workspace.name && deleteConfirmText === 'DELETE') ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Delete Workspace
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
