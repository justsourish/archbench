import { useEffect, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { useProjectStore } from './store/useProjectStore';
import { ReactFlowCanvas } from './components/ReactFlowCanvas';
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
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <ReactFlowCanvas setZoomLabel={setZoomLabel} />
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
