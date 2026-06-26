import React, { useState, useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { parseMarkdownToProject, validateProjectData } from '../utils/parser';
import { Repository, ConnectionData, Flow, NodeData, FlowStep } from '../types';

interface WizardModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ConnectedRepo {
    handle: FileSystemDirectoryHandle;
    status: 'ready' | 'needs_init';
    scannedSpec?: Repository;
    needsInit?: boolean;
}

export const WizardModal: React.FC<WizardModalProps> = ({ isOpen, onClose }) => {
    const createProject = useProjectStore(s => s.createRepository);
    const createWorkspace = useProjectStore(s => s.createWorkspace);
    const setProjectHandles = useProjectStore(s => s.setProjectHandles);
    const currentProject = useProjectStore(s => s.currentRepository);

    // Navigation State:
    // 1: Intent Selection (Existing Codebase vs New System Design)
    // 2: Workspace Configuration (Workspace Name, add connected project folders)
    // 'prompt': Copier instructions and active watch status after scaffolding
    const [step, setStep] = useState<1 | 2 | 'prompt'>(1);
    const [intent, setIntent] = useState<'existing' | 'new' | null>(null);

    // Workspace & Repositories Setup States
    const [workspaceName, setWorkspaceName] = useState('');
    const [connectedProjects, setConnectedProjects] = useState<ConnectedRepo[]>([]);
    
    // Prompt State
    const [agentPromptText, setAgentPromptText] = useState('');

    const folderInputRef = useRef<HTMLInputElement>(null);
    const isScaffoldOnly = currentProject?.flows?.some((f: Flow) => f.id === "main_scaffold_flow") ?? true;

    if (!isOpen) return null;

    const showToast = (msg: string) => {
        alert(msg);
    };

    const copyToClipboard = (text: string, successMsg: string) => {
        navigator.clipboard.writeText(text)
            .then(() => showToast(successMsg))
            .catch(err => {
                console.error("Failed to copy text:", err);
                showToast("Failed to copy to clipboard.");
            });
    };

    const generateProjectRulesContent = (projectTitle: string) => {
        return `# ArchBench Project Rules & Prompts for '${projectTitle}'

This workspace uses [Architecture Workbench (ArchBench)](https://archbench.netlify.app/) to visualize the system diagram, simulate flows, and track changes.

## Single Source of Truth
* The file \`.arcbench/architecture.md\` is the single source of truth for the system architecture.
* Any changes to \`.arcbench/architecture.md\` will be automatically picked up and hot-reloaded by the ArchBench visual dashboard.

## LLM System Instructions
When using an LLM agent (like Gemini, OpenAI, Claude, or a workspace copilot) to update the system structure, prompt it with the following:

\`\`\`markdown
You are a senior systems architect. Your task is to analyze the codebase and write/update the \`.arcbench/architecture.md\` specification file.

Format rules:
1. Every component must be defined in the \`## Nodes\` section.
   Use the categories: "Entry Point", "Service", "Infrastructure", or "Boundary".
   Layout guidelines:
   - Entry Points (UI, clients): x = 200 to 500, y = 250
   - Services (APIs, auth, workers): x = 500 to 1800, y = 750
   - Infrastructure (DBs, caches, queues): x = 500 to 1800, y = 1390
   - Boundary/Future: y = 1960

2. Connections MUST be defined in the \`## Connections\` section as a Markdown table:
   | From | To | Interaction | Type |
   |---|---|---|---|
   | [from_node_id] | [to_node_id] | [interaction_label] | [type] |
   
   Where type is "request", "data", or "future".

   Connection Discovery Checklist:
   Before finalizing connections, scan for:
   - API calls
   - Service-to-service communication
   - Database reads and writes
   - Cache reads and writes
   - Message queues and event buses
   - Webhooks and file storage access
   - Authentication providers and third-party integrations

   ⚠️ Note: Missing a connection is worse than creating an extra one. Prefer over-documentation of dependencies.

3. Simulation pathways must be detailed in the \`## Flows\` section as a numbered list:
   ### [flow_id] ([Flow Title])
   *Subtitle / Description*
   - **Color:** [Optional HSL color]

   1. **[node_id]** [[action_label]]: [action_details]
      * Data: [Optional JSON or string data context]
   2. **[node_id]** [[action_label]]: [action_details]

Ensure you update only the \`.arcbench/architecture.md\` file when modifying the layout. Do not change business logic or output other file formats.
\`\`\`
`;
    };

    // Helper: export project spec back to Markdown
    const exportProjectToMarkdown = (proj: Repository): string => {
        let md = `# ${proj.title}\nVersion: ${proj.version || '1.0'}\n`;
        if (proj.description) md += `Description: ${proj.description}\n`;
        md += `\n## Nodes\n`;
        
        proj.nodes.forEach((n: NodeData) => {
            md += `### ${n.id} (${n.category || 'Service'})\n`;
            md += `* **Title:** ${n.title}\n`;
            md += `* **Icon:** ${n.icon}\n`;
            md += `* **x:** ${n.x}\n`;
            md += `* **y:** ${n.y}\n`;
            if (n.desc || n.description) md += `* **Description:** ${n.desc || n.description}\n`;
            if (n.sections && n.sections.length > 0) {
                n.sections.forEach((s: any) => {
                    md += `\n#### ${s.label}\n`;
                    s.items.forEach((it: string) => {
                        md += `* ${it}\n`;
                    });
                });
            }
            if (n.flow && n.flow.length > 0) {
                md += `* **Flow:** ${n.flow.join(' ')}\n`;
            }
            if (n.callout) {
                md += `* **Callout:** [${n.callout.type}] ${n.callout.text}\n`;
            }
            md += `\n`;
        });

        md += `## Connections\n`;
        md += `| From | To | Interaction | Type |\n|---|---|---|---|\n`;
        proj.connections.forEach(([f, t, label, type]: ConnectionData) => {
            md += `| ${f} | ${t} | ${label} | ${type} |\n`;
        });

        if (proj.flows && proj.flows.length > 0) {
            md += `\n## Flows\n\n`;
            proj.flows.forEach((fl: Flow) => {
                md += `### ${fl.id} (${fl.title || fl.id})\n`;
                if (fl.subtitle) md += `*${fl.subtitle}*\n`;
                if (fl.color) md += `- **Color:** ${fl.color}\n`;
                md += `\n`;
                fl.steps.forEach((st: FlowStep, idx: number) => {
                    md += `${idx + 1}. **${st.node}** [${st.label}]: ${st.detail || ""}\n`;
                    if (st.data) md += `   * Data: ${st.data}\n`;
                });
                md += `\n`;
            });
        }

        return md;
    };

    const writeScaffoldFiles = async (dirHandle: FileSystemDirectoryHandle, spec: Repository, linkedRepos?: string[]) => {
        try {
            // Obtain or create .arcbench/ directory
            const arcbenchDir = await dirHandle.getDirectoryHandle(".arcbench", { create: true });

            // 1. Write architecture.md
            const mdContent = exportProjectToMarkdown(spec);
            const specHandle = await arcbenchDir.getFileHandle("architecture.md", { create: true });
            const specWritable = await specHandle.createWritable();
            await specWritable.write(mdContent);
            await specWritable.close();

            // 2. Write PROJECT_RULES.md
            const rulesContent = generateProjectRulesContent(spec.title);
            const rulesHandle = await arcbenchDir.getFileHandle("PROJECT_RULES.md", { create: true });
            const rulesWritable = await rulesHandle.createWritable();
            await rulesWritable.write(rulesContent);
            await rulesWritable.close();

            // 3. Write metadata.json
            const metadataContent = JSON.stringify({
                version: "1.0",
                created: new Date().toISOString(),
                tool: "ArcBench",
                type: linkedRepos ? "multi-repo" : "single-repo"
            }, null, 2);
            const metaHandle = await arcbenchDir.getFileHandle("metadata.json", { create: true });
            const metaWritable = await metaHandle.createWritable();
            await metaWritable.write(metadataContent);
            await metaWritable.close();

            // 4. Write workspace.json if multi-repo
            if (linkedRepos) {
                const workspaceContent = JSON.stringify({
                    repositories: linkedRepos
                }, null, 2);
                const wsHandle = await arcbenchDir.getFileHandle("workspace.json", { create: true });
                const wsWritable = await wsHandle.createWritable();
                await wsWritable.write(workspaceContent);
                await wsWritable.close();
            }
        } catch (err) {
            console.error("Failed to write scaffold files directly:", err);
            showToast(`⚠️ Failed to write architecture files in ${dirHandle.name}. Sandbox permission denied.`);
        }
    };

    const handleAddProjectFolder = async () => {
        if (!('showDirectoryPicker' in window)) {
            showToast("Your browser does not support the File System Access API. Please use a modern desktop browser.");
            return;
        }

        try {
            const pickerWindow = window as unknown as { showDirectoryPicker: (options?: { mode: string }) => Promise<FileSystemDirectoryHandle> };
            const dirHandle = await pickerWindow.showDirectoryPicker({ mode: "readwrite" });
            const name = dirHandle.name;

            // Check if folder is already added
            if (connectedProjects.some(p => p.handle.name === name)) {
                showToast("Folder is already connected to this workspace.");
                return;
            }

            // Auto-fill Workspace Name from first connected folder if empty
            if (connectedProjects.length === 0 && !workspaceName.trim()) {
                const formattedName = name.split(/[_-]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                setWorkspaceName(formattedName);
            }

            // Run discovery scan inside this repository folder
            let status: 'ready' | 'needs_init' = 'needs_init';
            let parsedSpec: Repository | undefined = undefined;

            try {
                let specFileHandle = null;

                // Strictly search in .arcbench/architecture.md (no root fallbacks)
                try {
                    const arcbenchDir = await dirHandle.getDirectoryHandle(".arcbench");
                    specFileHandle = await arcbenchDir.getFileHandle("architecture.md");
                } catch {
                    // Not found in .arcbench
                }

                if (specFileHandle) {
                    const file = await specFileHandle.getFile();
                    const text = await file.text();
                    parsedSpec = parseMarkdownToProject(text);
                    validateProjectData(parsedSpec);
                    status = 'ready';
                }
            } catch (err) {
                console.warn(`Spec discovery skipped or failed for ${name}, will scaffold:`, err);
            }

            const newProject: ConnectedRepo = {
                handle: dirHandle,
                status,
                scannedSpec: parsedSpec
            };

            setConnectedProjects([...connectedProjects, newProject]);
        } catch (err) {
            console.warn("Folder selection cancelled:", err);
        }
    };

    const handleCreateWorkspace = async () => {
        if (connectedProjects.length === 0) return;

        // "Create Workspace" should always create an isolated container first.
        const targetWorkspaceName = workspaceName.trim() || connectedProjects[0].handle.name;
        createWorkspace(targetWorkspaceName);

        // Collect handles and check scaffolding needs
        const projectFolderHandles = connectedProjects.map(p => p.handle);
        let anyScaffoldNeeded = false;

        // If intent is New System Design, everything needs scaffolding.
        // Otherwise, check repository status metrics.
        const projectsToInitialize = connectedProjects.map(p => {
            const needsInit = p.needsInit || p.status === 'needs_init' || intent === 'new';
            if (needsInit) anyScaffoldNeeded = true;
            return {
                ...p,
                needsInit
            };
        });

        // Generate visual layout specifications for the loaded Workspace
        // (V1 loads the first project's spec, or creates a blank fallback)
        const primaryProject = projectsToInitialize[0];
        const specToLoad = primaryProject.scannedSpec ? { ...primaryProject.scannedSpec } : {
            id: "project-" + Date.now(),
            title: targetWorkspaceName,
            version: "1.0",
            nodes: [
                { id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "Default client interface." },
                { id: "api", category: "Service", title: "Core Service", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Default API controller." }
            ],
            connections: [
                ["client", "api", "HTTPS Request", "request"]
            ] as ConnectionData[],
            flows: [
                {
                    id: "main_scaffold_flow",
                    title: "Scaffold Demo Flow",
                    subtitle: "Automatically generated walkthrough simulation",
                    steps: [
                        { node: "client", label: "Process at Web Frontend", detail: "Scaffolded execution step." },
                        { node: "api", label: "Process at Core Service", detail: "Scaffolded execution step." }
                    ]
                }
            ] as Flow[]
        };

        specToLoad.title = targetWorkspaceName;

        // 1. Write scaffolding files to each folder requiring initialization
        const repoNames = projectFolderHandles.map(h => h.name);
        for (const proj of projectsToInitialize) {
            if (proj.needsInit) {
                await writeScaffoldFiles(proj.handle, specToLoad, repoNames.length > 1 ? repoNames : undefined);
            }
        }

        // 2. Register projects list in Zustand Store and enable Live Watch
        createProject(specToLoad);
        setProjectHandles(projectFolderHandles, targetWorkspaceName);
        useProjectStore.getState().setLiveWatchEnabled(true);

        // 3. Direct Exit Check: If no files were scaffolded (spec existed), open immediately
        if (!anyScaffoldNeeded) {
            showToast(`Workspace '${specToLoad.title}' loaded successfully!`);
            onClose();
            return;
        }

        // 4. Scaffold was written: Present AI agent prompts
        if (projectFolderHandles.length === 1) {
            const prompt = `You are a senior system architect. I have initialized an ArchBench workspace in my repository folder. Analyze my codebase files and write the architecture specification directly into .arcbench/architecture.md, following the format rules in .arcbench/PROJECT_RULES.md. Do not output explanations, only write the markdown code.`;
            setAgentPromptText(prompt);
        } else {
            const namesList = repoNames.join(", ");
            const prompt = `You are a senior system architect. I have initialized an ArchBench multi-repository workspace. The connected repositories are: ${namesList}. The connected folders are tracked in .arcbench/workspace.json. Analyze these directories and write the unified architecture specification directly into .arcbench/architecture.md, following the format rules in .arcbench/PROJECT_RULES.md. Do not output explanations, only write the markdown code.`;
            setAgentPromptText(prompt);
        }
        setStep('prompt');
    };

    const handleSelectIntent = (selectedIntent: 'existing' | 'new') => {
        setIntent(selectedIntent);
        setStep(2);
    };

    return (
        <div className="modal-overlay show" style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-card wizard-card" style={{ width: '500px', maxWidth: '90vw' }}>
                <div className="modal-header">
                    <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                        <span style={{ background: 'linear-gradient(135deg, hsl(270,70%,60%), hsl(310,65%,62%))', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: '#fff', fontWeight: 700 }}>Workspace</span>
                        Create Workspace
                    </span>
                    {!(step === 'prompt' && isScaffoldOnly) && (
                        <button type="button" className="modal-close" title="Close" onClick={onClose}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    )}
                </div>

                <div className="modal-body" style={{ padding: '20px' }}>
                    {step === 1 && (
                        <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '20px', textAlign: 'center', lineHeight: '1.4' }}>
                                Connect your local repositories. Prepare guidelines and scaffold files for your coding AI agents.
                            </div>
                            <div className="wizard-options" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <button type="button" className="wizard-opt-btn" style={{ padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%' }} onClick={() => handleSelectIntent('existing')}>
                                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>🔍</div>
                                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>Existing Codebase</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Connect one or more folders containing codebase repositories. We scan for architecture spec folders.</div>
                                </button>
                                <button type="button" className="wizard-opt-btn" style={{ padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%' }} onClick={() => handleSelectIntent('new')}>
                                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>💡</div>
                                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>New System Design</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Start a brand new architecture layout. Creates template folders inside connected directories.</div>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            {/* Connected Project Folders List */}
                            <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', marginBottom: '6px' }}>📁</div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Project Folders</div>
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.4' }}>
                                    {intent === 'existing' ? "Connect the repository folders in this workspace. We will scan them for architecture specs." : "Connect folders where we should scaffold new architecture configs."}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                                    {connectedProjects.length === 0 ? (
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', opacity: 0.6, fontStyle: 'italic', padding: '10px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)' }}>
                                            No repository folders connected yet. Click select below.
                                        </div>
                                    ) : (
                                        connectedProjects.map((proj, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '10.5px' }}>
                                                <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{proj.handle.name}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {intent === 'existing' && (
                                                        <span style={{ 
                                                            fontSize: '9px', 
                                                            padding: '2px 6px', 
                                                            borderRadius: '3px', 
                                                            fontWeight: 600,
                                                            background: proj.status === 'ready' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 152, 0, 0.15)',
                                                            color: proj.status === 'ready' ? 'hsl(150, 75%, 70%)' : 'hsl(38, 95%, 70%)' 
                                                        }}>
                                                            {proj.status === 'ready' ? '✓ Ready' : '⚡ Needs Initialization'}
                                                        </span>
                                                    )}
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setConnectedProjects(connectedProjects.filter((_, idx) => idx !== i))}
                                                        style={{ background: 'none', border: 'none', color: 'hsl(0, 72%, 62%)', cursor: 'pointer', fontSize: '10.5px', fontWeight: 600 }}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <button 
                                    type="button" 
                                    className="btn-primary" 
                                    onClick={handleAddProjectFolder}
                                    style={{ padding: '6px 14px', fontSize: '11px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer', background: 'hsl(270,70%,60%)', border: 'none', color: '#fff' }}
                                >
                                    + Add Project Folder
                                </button>
                            </div>

                            {/* Workspace Name Input after selection */}
                            {connectedProjects.length > 0 && (
                                <div style={{ marginBottom: '12px', textAlign: 'left', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                                    <label className="form-label" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Workspace Name</label>
                                    <input 
                                        className="form-input" 
                                        type="text" 
                                        value={workspaceName} 
                                        onChange={(e) => setWorkspaceName(e.target.value)} 
                                        placeholder="Workspace Name" 
                                        style={{ fontSize: '11px', padding: '6px 10px', width: '100%', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'inherit' }}
                                    />
                                </div>
                            )}



                            <div className="wizard-nav" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setStep(1)} style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'inherit' }}>Back</button>
                                <button 
                                    type="button" 
                                    className="btn-primary" 
                                    disabled={connectedProjects.length === 0} 
                                    onClick={handleCreateWorkspace} 
                                    style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, background: connectedProjects.length > 0 ? 'hsl(270,70%,60%)' : 'rgba(255,255,255,0.05)', border: 'none', color: connectedProjects.length > 0 ? '#fff' : 'rgba(255,255,255,0.3)' }}
                                >
                                    {(connectedProjects.some(p => p.status === 'needs_init') || intent === 'new') ? "Generate Scaffold & Open" : "Open Workspace"}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'prompt' && (
                        <div>
                            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(76,175,80,0.04)', border: '1px solid rgba(76,175,80,0.2)', textAlign: 'left', marginBottom: '14px' }}>
                                <div style={{ fontWeight: 700, fontSize: '11px', color: 'hsl(150, 75%, 70%)', marginBottom: '4px' }}>
                                    ✓ SCAFFOLD INITIALIZED SUCCESSFULLY
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                    We created your workspace `.arcbench/` directory. Copy the prompt below, run your agent, and the visualizer will auto-update in real-time.
                                </div>
                            </div>

                            <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(180, 130, 255, 0.04)', border: '1px solid rgba(180, 130, 255, 0.15)', textAlign: 'left', marginBottom: '14px' }}>
                                <div style={{ fontWeight: 700, fontSize: '10.5px', color: 'hsl(280, 85%, 80%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <span>🤖 AI AGENT PROMPT RULES</span>
                                    <button 
                                        type="button"
                                        id="btn-copy-onboarding-prompt" 
                                        style={{ background: 'rgba(180, 130, 255, 0.2)', border: '1px solid rgba(180, 130, 255, 0.4)', color: 'hsl(280, 85%, 80%)', padding: '3px 8px', fontSize: '9px', cursor: 'pointer', borderRadius: '4px', fontFamily: 'inherit', fontWeight: 600 }}
                                        onClick={() => copyToClipboard(agentPromptText, "🤖 System Prompt copied to clipboard! Paste it into your AI assistant.")}
                                    >
                                        Copy Prompt
                                    </button>
                                </div>
                                <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '8px' }}>
                                    Copy this prompt and run it in Claude Code, Gemini CLI, Cursor, or Aider to write the architecture spec file from your repositories.
                                </div>
                                <div style={{ fontSize: '9.5px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.25)', padding: '10px', borderRadius: '6px', maxHeight: '110px', overflowY: 'auto', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                    {agentPromptText}
                                </div>
                            </div>

                            {/* Live Watch Active indicator */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(80, 220, 180, 0.05)', border: '1px solid rgba(80, 220, 180, 0.15)', borderRadius: '8px', justifyContent: 'center', marginBottom: '20px' }}>
                                <span className="watch-dot-pulse" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'hsl(160, 80%, 60%)' }}></span>
                                <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'hsl(160, 80%, 75%)' }}>
                                    Live Watch active. Waiting for changes to architecture.md...
                                </span>
                            </div>

                            <div className="wizard-nav" style={{ display: 'flex', justifyContent: 'center' }}>
                                <button 
                                    type="button" 
                                    className="btn-primary" 
                                    onClick={onClose} 
                                    disabled={isScaffoldOnly}
                                    style={{ 
                                        padding: '8px 24px', 
                                        fontSize: '11.5px', 
                                        borderRadius: '6px', 
                                        cursor: isScaffoldOnly ? 'not-allowed' : 'pointer', 
                                        fontWeight: 600, 
                                        background: isScaffoldOnly ? 'rgba(255,255,255,0.08)' : 'hsl(270,70%,60%)', 
                                        border: isScaffoldOnly ? '1px solid rgba(255,255,255,0.1)' : 'none', 
                                        color: isScaffoldOnly ? 'rgba(255,255,255,0.3)' : '#fff', 
                                        boxShadow: isScaffoldOnly ? 'none' : '0 4px 12px rgba(180,130,255,0.2)' 
                                    }}
                                >
                                    {isScaffoldOnly ? '⏳ Waiting for agent output...' : '🚀 Open Dashboard Workspace'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <input 
                type="file" 
                ref={folderInputRef} 
                style={{ display: 'none' }} 
            />
        </div>
    );
};
