import { useEffect, useState, useRef } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { useProjectStore } from './store/useProjectStore';
import { ReactFlowCanvas } from './components/ReactFlowCanvas';
import { TerminalConsole } from './components/TerminalConsole';
import { Topbar } from './components/Topbar';
import { Sidebar } from './components/Sidebar';
import { WizardModal } from './components/WizardModal';
import { EditProjectModal } from './components/EditProjectModal';
import { parseMarkdownToProject, validateProjectData } from './utils/parser';

function App() {
    const initializeStore = useProjectStore(s => s.initializeStore);
    const liveWatchEnabled = useProjectStore(s => s.liveWatchEnabled);
    const isTerminalVisible = useProjectStore(s => s.isTerminalVisible);
    const isSidebarDockedRight = useProjectStore(s => s.isSidebarDockedRight);
    const isSidebarCollapsed = useProjectStore(s => s.isSidebarCollapsed);
    const workspace = useProjectStore(s => s.workspace);
    const reconnectWorkspaceMember = useProjectStore(s => s.reconnectWorkspaceMember);
    const isInitialized = useProjectStore(s => s.isInitialized);

    const [zoomLabel, setZoomLabel] = useState('50%');
    const [wizardOpen, setWizardOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);

    useEffect(() => {
        initializeStore();
    }, [initializeStore]);

    const lastTextsRef = useRef<Record<string, string>>({});

    // Live Watch Polling Loop for all connected members + built-in fallback
    useEffect(() => {
        if (!liveWatchEnabled) return;

        const intervalId = setInterval(async () => {
            const state = useProjectStore.getState();
            const members = state.workspace.members;
            const activeRepo = (state.workspace.repositories || []).find(p => p.id === state.workspace.activeRepositoryId) ?? null;

            // 1. Poll each connected member folder that has a valid handle
            for (const member of members) {
                if (member.handle && member.status === 'ready') {
                    try {
                        const arcbenchDir = await member.handle.getDirectoryHandle(".arcbench");
                        const fileHandle = await arcbenchDir.getFileHandle("architecture.md");
                        const file = await fileHandle.getFile();
                        const text = await file.text();

                        const cacheKey = member.id;
                        if (text && text !== lastTextsRef.current[cacheKey]) {
                            lastTextsRef.current[cacheKey] = text;
                            try {
                                const parsed = parseMarkdownToProject(text);
                                validateProjectData(parsed);

                                if (member.specId) {
                                    parsed.id = member.specId;
                                    state.updateRepository(member.specId, parsed.title, parsed.version, parsed);
                                } else {
                                    state.createRepository(parsed);
                                }
                            } catch (err) {
                                console.error(`Failed to auto-reload spec for member ${member.name}:`, err);
                            }
                        }
                    } catch (err) {
                        // File might not exist yet or be busy
                    }
                }
            }

            // 2. Poll built-in fallback for "demo-sample" if it is the active repository
            if (activeRepo && activeRepo.id === "demo-sample") {
                try {
                    const resp = await fetch("samples/demo.md", { cache: "no-store" });
                    if (resp.ok) {
                        const text = await resp.text();
                        const cacheKey = "demo-sample";
                        if (text && text !== lastTextsRef.current[cacheKey]) {
                            lastTextsRef.current[cacheKey] = text;
                            try {
                                const parsed = parseMarkdownToProject(text);
                                validateProjectData(parsed);
                                parsed.id = "demo-sample";
                                state.updateRepository("demo-sample", parsed.title, parsed.version, parsed);
                            } catch (err) {
                                console.error("Failed to parse demo sample:", err);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch demo sample:", err);
                }
            }
        }, 1200);

        return () => clearInterval(intervalId);
    }, [liveWatchEnabled]);

    const disconnectedMembers = workspace.members.filter(m => m.status === 'disconnected');

    const handleRestorePermissions = async () => {
        const pickerWindow = window as unknown as { showDirectoryPicker?: (options?: { mode: string }) => Promise<FileSystemDirectoryHandle> };
        if (!pickerWindow.showDirectoryPicker) {
            alert("Directory picker is not supported in this browser.");
            return;
        }

        for (const member of disconnectedMembers) {
            try {
                alert(`Please select the directory folder for repository '${member.name}' to restore the workspace connection.`);
                const handle = await pickerWindow.showDirectoryPicker({ mode: 'readwrite' });
                if (handle) {
                    await reconnectWorkspaceMember(member.id, handle);
                }
            } catch (e) {
                console.warn(`Cancelled restoring permissions for ${member.name}`, e);
                break; // Stop sequential prompts if user cancels one
            }
        }
    };

    if (!isInitialized) {
        return (
            <ReactFlowProvider>
                <div style={{
                    height: '100vh',
                    width: '100vw',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'radial-gradient(circle at 20% 20%, rgba(120, 80, 180, 0.2), rgba(4, 6, 12, 0.98))',
                    color: 'rgba(255,255,255,0.85)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontSize: '12px',
                    letterSpacing: '0.4px'
                }}>
                    Loading workspace state...
                </div>
            </ReactFlowProvider>
        );
    }

    return (
        <ReactFlowProvider>
            <div id="app-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
                {disconnectedMembers.length > 0 && (
                    <div className="restore-permissions-banner" style={{
                        background: 'linear-gradient(90deg, hsl(340, 70%, 45%), hsl(355, 75%, 50%))',
                        color: '#ffffff',
                        padding: '8px 16px',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                        zIndex: 100
                    }}>
                        <span>🔌 Workspace repository folders are disconnected due to browser sandbox security.</span>
                        <button 
                            type="button" 
                            onClick={handleRestorePermissions}
                            style={{
                                background: '#ffffff',
                                border: 'none',
                                color: 'hsl(340, 70%, 45%)',
                                padding: '3px 10px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'transform 0.15s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            Restore Connections ({disconnectedMembers.length})
                        </button>
                    </div>
                )}
                <Topbar
                    zoomLabel={zoomLabel}
                    onOpenEditModal={() => setEditModalOpen(true)}
                    onOpenWizardModal={() => setWizardOpen(true)}
                />
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isSidebarDockedRight ? 'row' : 'row-reverse', paddingTop: 'var(--topbar-h)' }}>
                    <div style={{ 
                        flex: 1, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        overflow: 'hidden', 
                        position: 'relative',
                        marginRight: isSidebarDockedRight ? `${isSidebarCollapsed ? 48 : 400}px` : 0,
                        marginLeft: !isSidebarDockedRight ? `${isSidebarCollapsed ? 48 : 400}px` : 0,
                        transition: 'margin-right 0.2s cubic-bezier(0.16, 1, 0.3, 1), margin-left 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <ReactFlowCanvas setZoomLabel={setZoomLabel} />
                        </div>
                        {isTerminalVisible ? (
                            <TerminalConsole />
                        ) : (
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
                    <Sidebar />
                </div>


            </div>

            <WizardModal isOpen={wizardOpen} onClose={() => setWizardOpen(false)} />
            <EditProjectModal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} />
        </ReactFlowProvider>
    );
}

export default App;
