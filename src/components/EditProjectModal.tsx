import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { exportProjectToMarkdown, parseMarkdownToProject, validateProjectData } from '../utils/parser';
import { Project } from '../types';

interface EditProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SKELETON_TEMPLATE = {
    nodes: [
        {
            id: "node1",
            category: "Entry Point",
            title: "My Web Client",
            icon: "💻",
            color: "hsl(210,85%,62%)",
            x: 300, y: 250,
            desc: "User-facing dashboard application.",
            sections: [
                { label: "Tech Stack", items: ["HTML", "Vanilla JS"] }
            ]
        },
        {
            id: "node2",
            category: "Service",
            title: "My Backend API",
            icon: "⚙️",
            color: "hsl(200,80%,58%)",
            x: 750, y: 250,
            desc: "Processes user requests.",
            sections: [
                { label: "Features", items: ["Query database", "Format output"] }
            ]
        }
    ],
    connections: [
        ["node1", "node2", "JSON over HTTPS", "request"]
    ] as any[],
    flows: [
        {
            id: "query_flow",
            title: "Fetch Data Flow",
            subtitle: "Retrieve data from backend service",
            steps: [
                {
                    node: "node1",
                    label: "Send Request",
                    detail: "Browser triggers AJAX query to API.",
                    data: '{"query": "products"}'
                },
                {
                    node: "node2",
                    label: "Fetch Database",
                    detail: "API queries relational store and formats response.",
                    data: '{"status": 200, "count": 12}'
                }
            ]
        }
    ]
};

export const EditProjectModal: React.FC<EditProjectModalProps> = ({ isOpen, onClose }) => {
    const currentProject = useProjectStore(s => s.currentProject);
    const updateProject = useProjectStore(s => s.updateProject);

    const [title, setTitle] = useState('');
    const [version, setVersion] = useState('1.0');
    const [specContent, setSpecContent] = useState('');

    useEffect(() => {
        if (isOpen && currentProject) {
            setTitle(currentProject.title || '');
            setVersion(currentProject.version || '1.0');
            try {
                const md = exportProjectToMarkdown(currentProject);
                setSpecContent(md);
            } catch (e) {
                console.error("Failed to export current project to Markdown", e);
                setSpecContent('');
            }
        } else if (isOpen) {
            // New project setup
            setTitle('');
            setVersion('1.0');
            const defaultSpec: Project = {
                id: "skeleton-project",
                title: "Untitled Project",
                version: "1.0",
                nodes: SKELETON_TEMPLATE.nodes as any[],
                connections: SKELETON_TEMPLATE.connections as any[],
                flows: SKELETON_TEMPLATE.flows as any[]
            };
            setSpecContent(exportProjectToMarkdown(defaultSpec));
        }
    }, [isOpen, currentProject]);

    if (!isOpen) return null;

    const handleLoadTemplate = () => {
        const defaultSpec: Project = {
            id: "skeleton-project",
            title: title || "Untitled Project",
            version: version || "1.0",
            nodes: SKELETON_TEMPLATE.nodes as any[],
            connections: SKELETON_TEMPLATE.connections as any[],
            flows: SKELETON_TEMPLATE.flows as any[]
        };
        setSpecContent(exportProjectToMarkdown(defaultSpec));
    };

    const handleCopyPrompt = () => {
        const promptText = `Analyze my architecture nodes, flows, and boundaries and produce a structured representation:
        Nodes:
        - id: unique id
          title: node display name
          category: Entry Point | Service | Infrastructure | Boundary
          icon: emoji
          color: hsl color string
          x, y: coordinates
        Connections:
        - tuple: [fromId, toId, label, type]`;

        navigator.clipboard.writeText(promptText)
            .then(() => alert("🤖 Copied spec template instructions to clipboard!"))
            .catch(err => console.error("Failed to copy", err));
    };

    const handleSave = () => {
        let parsedTitle = title.trim();
        let parsedVersion = version.trim() || "1.0";
        const contentStr = specContent.trim();

        if (!contentStr) {
            alert("Specification content is empty.");
            return;
        }

        let spec: any;
        const isMarkdown = !contentStr.startsWith("{");

        if (isMarkdown) {
            try {
                spec = parseMarkdownToProject(contentStr);
            } catch (e: any) {
                alert("Invalid Markdown format in Architecture Specification: " + e.message);
                return;
            }
        } else {
            try {
                spec = JSON.parse(contentStr);
            } catch (e: any) {
                alert("Invalid JSON format in Architecture Specification: " + e.message);
                return;
            }
        }

        // Validate parsed project data
        try {
            validateProjectData(spec);
        } catch (e: any) {
            alert("Specification validation failed: " + e.message);
            return;
        }

        if (isMarkdown) {
            if (spec.title) parsedTitle = spec.title;
            if (spec.version) parsedVersion = spec.version;
        }

        if (!parsedTitle) {
            alert("Project Title is required.");
            return;
        }

        if (currentProject) {
            updateProject(currentProject.id, parsedTitle, parsedVersion, spec);
        } else {
            alert("No active project loaded to update.");
        }

        onClose();
    };

    return (
        <div className="modal-overlay show" style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-card" style={{ width: '640px', maxWidth: '90vw' }}>
                <div className="modal-header">
                    <span className="modal-title" style={{ fontSize: '13px', fontWeight: 600 }}>Advanced Architecture Editor</span>
                    <button type="button" className="modal-close" title="Close" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div className="form-group" style={{ flex: 1, textAlign: 'left' }}>
                            <label className="form-label" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Project Title</label>
                            <input 
                                className="form-input" 
                                type="text" 
                                value={title} 
                                onChange={(e) => setTitle(e.target.value)} 
                                placeholder="e.g. E-Commerce Platform"
                                style={{ fontSize: '11px', padding: '6px 10px', width: '100%', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'inherit' }}
                            />
                        </div>
                        <div className="form-group" style={{ width: '120px', textAlign: 'left' }}>
                            <label className="form-label" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Project Version</label>
                            <input 
                                className="form-input" 
                                type="text" 
                                value={version} 
                                onChange={(e) => setVersion(e.target.value)} 
                                placeholder="e.g. 1.0.0"
                                style={{ fontSize: '11px', padding: '6px 10px', width: '100%', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'inherit' }}
                            />
                        </div>
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', flex: 1, textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label className="form-label" style={{ margin: 0, fontSize: '11px' }}>Architecture Specification (Markdown)</label>
                            <div className="spec-kit-links" style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
                                <button type="button" onClick={handleLoadTemplate} style={{ color: 'hsl(280, 85%, 75%)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }}>📋 Load Template</button>
                                <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
                                <button type="button" onClick={handleCopyPrompt} style={{ color: 'hsl(200, 85%, 75%)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }}>🤖 Copy Agent Prompt</button>
                                <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
                                <a href="docs/architecture.schema.md" target="_blank" rel="noopener noreferrer" style={{ color: 'hsl(150, 75%, 70%)', textDecoration: 'none', fontWeight: 600 }}>📖 Schema Docs</a>
                            </div>
                        </div>
                        <textarea 
                            className="form-input form-textarea" 
                            value={specContent}
                            onChange={(e) => setSpecContent(e.target.value)}
                            style={{ height: '320px', fontSize: '11px', lineHeight: '1.4', width: '100%', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'inherit', resize: 'vertical', fontFamily: 'monospace' }}
                            placeholder="# My Project Title\nVersion: 1.0\n\n## Nodes\n..."
                        />
                        <span className="form-note" style={{ fontSize: '9px', opacity: 0.5, marginTop: '4px' }}>
                            Define nodes, connections, and flows using markdown syntax. You can edit and format as standard Markdown.
                        </span>
                    </div>
                </div>
                <div className="modal-footer" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'inherit' }}>Cancel</button>
                    <button type="button" className="btn-primary" onClick={handleSave} style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, background: 'hsl(270,70%,60%)', border: 'none', color: '#fff' }}>Save Project</button>
                </div>
            </div>
        </div>
    );
};
