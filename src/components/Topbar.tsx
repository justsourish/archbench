import React, { useState, useRef } from 'react';
import { useReactFlow } from 'reactflow';
import { useProjectStore } from '../store/useProjectStore';
import { exportProjectToMarkdown, parseMarkdownToProject } from '../utils/parser';
import { getCustomProjects, saveCustomProjects, DEFAULT_PROJECT_ID } from '../utils/projectHelpers';
import { Project } from '../types';

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
        availableProjects,
        currentProject,
        loadProject,
        reloadProjectsList,
        liveWatchEnabled,
        setLiveWatchEnabled,
        setSidebarTab,
        deleteProject
    } = useProjectStore();

    const { zoomIn, zoomOut, fitView, setViewport } = useReactFlow();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Export active project as Markdown
    const handleExport = () => {
        if (!currentProject) return;
        try {
            const md = exportProjectToMarkdown(currentProject);
            const blob = new Blob([md], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const sanitizedTitle = currentProject.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
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

    // Trigger file import
    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    // Process imported JSON/MD file
    const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            try {
                let parsedProject: Project;
                if (file.name.endsWith('.json')) {
                    parsedProject = JSON.parse(content);
                } else {
                    parsedProject = parseMarkdownToProject(content);
                }

                // Assign a unique ID
                parsedProject.id = "proj_" + Date.now();

                // Save to local storage
                const custom = getCustomProjects();
                custom.push(parsedProject);
                saveCustomProjects(custom);

                // Reload store and load
                reloadProjectsList();
                loadProject(parsedProject);
                alert(`Successfully imported project: ${parsedProject.title}`);
            } catch (err: any) {
                console.error("Import error:", err);
                alert(`Import failed: ${err.message || 'Check file format correctness'}`);
            }
        };
        reader.readAsText(file);
    };

    // Zoom Controls
    const handleReset = () => {
        setViewport({ x: window.innerWidth / 2 - 400, y: 50, zoom: 0.5 }, { duration: 800 });
    };

    return (
        <header className="topbar" id="topbar">
            <div className="topbar-left">
                <span className="logo-mark" style={{ background: "linear-gradient(135deg, hsl(270,70%,60%), hsl(310,65%,62%))" }}>A</span>
                <span className="logo-label">ArchBench <span className="logo-sub">Workbench</span></span>
                <span className="tb-divider"></span>
                <div className="project-toolbar">
                    <div className="project-selector-container">
                        <button 
                            className="tb-btn btn-project-selector" 
                            id="btn-project-selector" 
                            title="Browse existing architecture projects"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                        >
                            <span className="project-selector-label">Projects</span>
                            <span id="current-project-title">{currentProject ? currentProject.title : "Untitled"}</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </button>
                        
                        {dropdownOpen && (
                            <div className="project-dropdown open" id="project-dropdown" style={{ display: 'block' }}>
                                <div className="dropdown-section">
                                    <div className="dropdown-header">Projects</div>
                                    <div className="project-list" id="project-list">
                                        {availableProjects.map(proj => (
                                            <div 
                                                key={proj.id} 
                                                className={`project-item ${currentProject?.id === proj.id ? 'active' : ''}`}
                                                onClick={() => {
                                                    loadProject(proj);
                                                    setDropdownOpen(false);
                                                }}
                                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            >
                                                <div>
                                                    <div className="project-item-title">{proj.title}</div>
                                                    <div className="project-item-meta">v{proj.version || '1.0'} • {proj.nodes?.length || 0} nodes</div>
                                                </div>
                                                {proj.id !== DEFAULT_PROJECT_ID && (
                                                    <button 
                                                        className="project-item-delete"
                                                        title="Delete Project"
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (window.confirm(`Are you sure you want to permanently delete project '${proj.title}' and all of its simulation history?`)) {
                                                                await deleteProject(proj.id);
                                                            }
                                                        }}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                            <polyline points="3 6 5 6 21 6"/>
                                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                                            <line x1="10" y1="11" x2="10" y2="17"/>
                                                            <line x1="14" y1="11" x2="14" y2="17"/>
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="dropdown-divider"></div>
                                <button 
                                    className="dropdown-item btn-action" 
                                    id="dropdown-btn-edit"
                                    onClick={() => {
                                        onOpenEditModal();
                                        setDropdownOpen(false);
                                    }}
                                    disabled={!currentProject || currentProject.id === DEFAULT_PROJECT_ID}
                                    title={currentProject?.id === DEFAULT_PROJECT_ID ? "Cannot edit the read-only built-in demo project" : ""}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
                                    <span>Edit Active Project</span>
                                </button>
                                <button className="dropdown-item btn-action" id="dropdown-btn-export" onClick={handleExport}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                    <span>Export Active Project</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <button className="tb-btn project-action-btn" id="btn-project-new" title="Create a new project" onClick={onOpenWizardModal}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>New</span>
                    </button>
                    <button className="tb-btn project-action-btn" id="btn-project-import" title="Import a project file" onClick={handleImportClick}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span>Import</span>
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileImport} 
                        accept=".json,.md" 
                        style={{ display: 'none' }} 
                    />
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
                <button className="tb-btn" id="btn-fit" title="Fit to View" onClick={() => fitView({ padding: 0.2, duration: 800 })}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    <span>Fit</span>
                </button>
                <button className="tb-btn" id="btn-reset" title="Reset View" onClick={handleReset}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    <span>Reset</span>
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
                    className="tb-btn" 
                    id="btn-term-toggle" 
                    style={{ background: "rgba(180, 130, 255, 0.1)", borderColor: "rgba(180, 130, 255, 0.2)", color: "hsl(280, 85%, 75%)" }} 
                    title="Open Workspace Terminal Console"
                    onClick={() => setSidebarTab('terminal')}
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    <span>Terminal</span>
                </button>
                <button 
                    className="tb-btn" 
                    id="btn-ide" 
                    style={{ background: "rgba(180, 130, 255, 0.1)", borderColor: "rgba(180, 130, 255, 0.2)", color: "hsl(280, 85%, 75%)" }} 
                    title="Open AI Analysis & Architecture Exports"
                    onClick={() => setSidebarTab('ai')}
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    <span>AI & Export</span>
                </button>
                <span className="badge">React v1.0</span>
            </div>
        </header>
    );
};
