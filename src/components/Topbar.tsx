import React, { useState } from 'react';
import { useReactFlow } from 'reactflow';
import { useProjectStore } from '../store/useProjectStore';
import { exportProjectToMarkdown } from '../utils/parser';
import { DEFAULT_PROJECT_ID } from '../utils/projectHelpers';

interface TopbarProps {
    zoomLabel: string;
    onOpenEditModal: () => void;
    onOpenWizardModal: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
    zoomLabel,
    onOpenEditModal,
    onOpenWizardModal
}) => {
    const {
        workspace,
        workspaces,
        switchWorkspace,
        nodes,
        liveWatchEnabled,
        setLiveWatchEnabled,
        isTerminalVisible,
        setTerminalVisible,
        setTerminalActiveTab,
        addWorkspaceMember,
        isSidebarCollapsed,
        isSidebarDockedRight
    } = useProjectStore();
    const activeRepository = workspace.repositories.find(r => r.id === workspace.activeRepositoryId) || null;

    // activeViewTitle removed (viewport dropdown switcher is used instead)

    const { zoomIn, zoomOut, fitView } = useReactFlow();
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const handleConnectRepository = async () => {
        const pickerWindow = window as unknown as { showDirectoryPicker?: (options?: { mode: string }) => Promise<FileSystemDirectoryHandle> };
        if (!pickerWindow.showDirectoryPicker) {
            alert("Directory picker is not supported in this browser.");
            return;
        }
        try {
            const handle = await pickerWindow.showDirectoryPicker({ mode: 'readwrite' });
            if (handle) {
                await addWorkspaceMember(handle);
            }
        } catch (e) {
            console.warn("Cancelled directory selection", e);
        }
    };

    // Export active project as Markdown
    const handleExport = () => {
        if (!activeRepository) return;
        try {
            const md = exportProjectToMarkdown(activeRepository);
            const blob = new Blob([md], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const sanitizedTitle = activeRepository.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
            a.href = url;
            a.download = `architecture-${sanitizedTitle}.md`;
            a.click();
            URL.revokeObjectURL(url);
            setDropdownOpen(false);
        } catch (e) {
            console.error('Failed to export project', e);
            alert('Export failed.');
        }
    };


    return (
        <header className="topbar" id="topbar" style={{
            left: !isSidebarDockedRight ? `${isSidebarCollapsed ? 48 : 400}px` : 0,
            right: isSidebarDockedRight ? `${isSidebarCollapsed ? 48 : 400}px` : 0,
            transition: 'left 0.2s cubic-bezier(0.16, 1, 0.3, 1), right 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
            <div className="topbar-left">
                <span className="logo-mark" style={{ background: "linear-gradient(135deg, hsl(270,70%,60%), hsl(310,65%,62%))" }}>A</span>
                <span className="logo-label">ArchBench <span className="logo-sub">Workbench</span></span>
                <span className="tb-divider"></span>
                <div className="project-toolbar">
                    <div className="workspace-selector-container">
                        <button 
                            className="tb-btn btn-workspace-selector" 
                            id="btn-workspace-selector" 
                            title="Switch Workspace Suite"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                        >
                            <span className="workspace-selector-label">Active Workspace</span>
                            <span id="current-workspace-title">{workspace.name}</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </button>
                        
                        {dropdownOpen && (
                            <div className="project-dropdown open" id="project-dropdown" style={{ display: 'block', width: '260px' }}>
                                <div className="dropdown-section">
                                    <div className="dropdown-header">Switch Workspace</div>
                                    <div className="project-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {workspaces.map(ws => {
                                            const isActive = ws.id === workspace.id;
                                            const repositoryCount = (ws.repositories || []).length;
                                            const summary = `📁 ${repositoryCount}`;
                                            return (
                                                <div 
                                                    key={ws.id} 
                                                    className={`project-item ${isActive ? 'active' : ''}`}
                                                    onClick={() => {
                                                        switchWorkspace(ws.id);
                                                        setDropdownOpen(false);
                                                    }}
                                                >
                                                    <div className="project-item-title">🏢 {ws.name}</div>
                                                    <div className="project-item-meta">{summary}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="dropdown-divider"></div>


                                
                                <button 
                                    className="dropdown-item btn-action" 
                                    onClick={() => {
                                        onOpenWizardModal();
                                        setDropdownOpen(false);
                                    }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    <span>Create Workspace</span>
                                </button>

                                <div className="dropdown-divider"></div>

                                <button 
                                    className="dropdown-item btn-action" 
                                    id="dropdown-btn-edit"
                                    onClick={() => {
                                        onOpenEditModal();
                                        setDropdownOpen(false);
                                    }}
                                    disabled={!activeRepository || activeRepository.id === DEFAULT_PROJECT_ID}
                                    title={activeRepository?.id === DEFAULT_PROJECT_ID ? "Cannot edit the read-only built-in demo project" : ""}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
                                    <span>Edit Active Repository Spec</span>
                                </button>
                                <button className="dropdown-item btn-action" id="dropdown-btn-export" onClick={handleExport}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                    <span>Export Active Diagram</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <button className="tb-btn project-action-btn" id="btn-project-new" title="Connect Repository Folder" onClick={handleConnectRepository}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>Connect Repository</span>
                    </button>
                </div>
            </div>
            
            <div className="topbar-center">
                <button className="tb-btn" id="btn-zoom-in" title="Zoom In" onClick={() => zoomIn()}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </button>
                <span className="zoom-label" id="zoom-label">{zoomLabel}</span>
                <button className="tb-btn" id="btn-zoom-out" title="Zoom Out" onClick={() => zoomOut()}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </button>
                <span className="tb-divider"></span>
                <button 
                    className="tb-btn" 
                    id="btn-fit" 
                    title="Fit to View" 
                    onClick={() => {
                        if (nodes && nodes.length > 0) {
                            fitView({
                                nodes: nodes.map(n => ({ id: n.id })),
                                padding: 0.25,
                                duration: 800,
                                maxZoom: 0.6
                            });
                        } else {
                            fitView({ padding: 0.25, duration: 800 });
                        }
                    }}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    <span>Fit</span>
                </button>
                <span className="tb-divider"></span>
                <button 
                    className={`tb-btn ${liveWatchEnabled ? 'active' : ''}`} 
                    id="btn-live-watch" 
                    title="Toggle Live Watch for local changes"
                    onClick={() => {
                        const nextVal = !liveWatchEnabled;
                        setLiveWatchEnabled(nextVal);
                        alert(nextVal ? "Live Watch Enabled (Simulated local file hot-reload)" : "Live Watch Disabled");
                    }}
                    style={{
                        borderColor: liveWatchEnabled ? 'rgba(80, 220, 180, 0.4)' : undefined,
                        color: liveWatchEnabled ? 'hsl(170, 70%, 75%)' : undefined
                    }}
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <span id="live-watch-text">{liveWatchEnabled ? 'Watching...' : 'Live Watch'}</span>
                </button>
            </div>
            
            <div className="topbar-right">
                <button 
                    className={`tb-btn ${isTerminalVisible ? 'active' : ''}`} 
                    id="btn-term-toggle" 
                    style={{ 
                        background: isTerminalVisible ? "rgba(180, 130, 255, 0.2)" : "rgba(180, 130, 255, 0.1)", 
                        borderColor: isTerminalVisible ? "hsl(280, 85%, 65%)" : "rgba(180, 130, 255, 0.2)", 
                        color: isTerminalVisible ? "#ffffff" : "hsl(280, 85%, 75%)" 
                    }} 
                    title="Open Workspace Terminal Console"
                    onClick={() => {
                        const nextVisible = !isTerminalVisible;
                        setTerminalVisible(nextVisible);
                        if (nextVisible) {
                            setTerminalActiveTab('shell');
                        }
                    }}
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    <span>Terminal</span>
                </button>
            </div>
        </header>
    );
};
