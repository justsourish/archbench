import { useEffect, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { useProjectStore } from './store/useProjectStore';
import { ReactFlowCanvas } from './components/ReactFlowCanvas';
import { TerminalConsole } from './components/TerminalConsole';
import { Topbar } from './components/Topbar';
import { FlowBar } from './components/FlowBar';
import { Sidebar } from './components/Sidebar';
import { WizardModal } from './components/WizardModal';
import { EditProjectModal } from './components/EditProjectModal';
import { parseMarkdownToProject, validateProjectData } from './utils/parser';

function App() {
    const initializeStore = useProjectStore(s => s.initializeStore);
    const liveWatchEnabled = useProjectStore(s => s.liveWatchEnabled);
    const watchDirectoryHandle = useProjectStore(s => s.watchDirectoryHandle);
    const currentProject = useProjectStore(s => s.currentProject);
    const loadProject = useProjectStore(s => s.loadProject);
    const updateProject = useProjectStore(s => s.updateProject);
    const isTerminalVisible = useProjectStore(s => s.isTerminalVisible);
    const isSidebarDockedRight = useProjectStore(s => s.isSidebarDockedRight);

    const [zoomLabel, setZoomLabel] = useState('50%');
    const [wizardOpen, setWizardOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);

    useEffect(() => {
        initializeStore();
    }, [initializeStore]);

    // Live Watch Polling Loop
    useEffect(() => {
        if (!liveWatchEnabled) return;

        let lastText = '';
        const intervalId = setInterval(async () => {
            try {
                let currentText = '';
                if (watchDirectoryHandle) {
                    try {
                        const fileHandle = await watchDirectoryHandle.getFileHandle("architecture.md");
                        const file = await fileHandle.getFile();
                        currentText = await file.text();
                    } catch (e) {
                        currentText = ''; // File might not exist yet or be busy
                    }
                } else {
                    let fetchUrl = "architecture.md";
                    if (currentProject && currentProject.id === "demo-sample") {
                        fetchUrl = "samples/demo.md";
                    }
                    const resp = await fetch(fetchUrl, { cache: "no-store" });
                    if (resp.ok) {
                        currentText = await resp.text();
                    }
                }

                if (currentText && currentText !== lastText) {
                    lastText = currentText;
                    
                    try {
                        const parsed = parseMarkdownToProject(currentText);
                        validateProjectData(parsed);

                        if (currentProject) {
                            parsed.id = currentProject.id;
                            updateProject(currentProject.id, parsed.title, parsed.version, parsed);
                        } else {
                            loadProject(parsed);
                        }
                    } catch (err) {
                        console.error("Failed to auto-reload project from watch:", err);
                    }
                }
            } catch (err) {
                console.error("Live watch polling error:", err);
            }
        }, 1200);

        return () => clearInterval(intervalId);
    }, [liveWatchEnabled, watchDirectoryHandle, currentProject, loadProject, updateProject]);

    return (
        <ReactFlowProvider>
            <div id="app-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
                <Topbar
                    zoomLabel={zoomLabel}
                    onOpenEditModal={() => setEditModalOpen(true)}
                    onOpenWizardModal={() => setWizardOpen(true)}
                />
                <FlowBar />
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isSidebarDockedRight ? 'row' : 'row-reverse' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <ReactFlowCanvas setZoomLabel={setZoomLabel} />
                            
                            {/* Footer Attribution (placed here so it doesn't overlap the console bottom dock) */}
                            <footer style={{ 
                                position: 'absolute',
                                bottom: '12px',
                                left: '16px',
                                zIndex: 10,
                                fontSize: '9px',
                                fontWeight: 500,
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase',
                                color: 'rgba(255, 255, 255, 0.35)',
                                background: 'rgba(10,12,22,0.6)',
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                padding: '4px 12px',
                                borderRadius: '100px',
                                border: '1px solid rgba(255,255,255,0.05)',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                pointerEvents: 'auto'
                            }}>
                                <span style={{ color: 'rgba(255, 255, 255, 0.45)' }}>
                                    Crafted with 🤍 by{' '}
                                    <a 
                                        href="https://github.com/NoisyArchitects" 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        style={{ 
                                            color: 'rgba(255, 255, 255, 0.55)', 
                                            textDecoration: 'none',
                                            fontWeight: 600,
                                            transition: 'color 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)'; }}
                                    >
                                        Noisy Architects
                                    </a>
                                </span>
                                <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
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
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        background: '#00C7B7',
                                        boxShadow: '0 0 8px #00C7B7'
                                    }} />
                                    Powered by Netlify
                                </a>
                            </footer>
                        </div>
                        {isTerminalVisible && <TerminalConsole />}
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
