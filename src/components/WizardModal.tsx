import React, { useState, useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { parseMarkdownToProject, validateProjectData } from '../utils/parser';
import { Project, NodeData, ConnectionData, Flow } from '../types';

interface WizardModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WizardModal: React.FC<WizardModalProps> = ({ isOpen, onClose }) => {
    const createProject = useProjectStore(s => s.createProject);

    // Navigation State:
    // 1: Intent Selection (Existing Codebase vs New System Design)
    // 2: Workspace Type Selection (Single vs Multi Repo)
    // 'single': Single Repo Configuration
    // 'multi': Multi Repo Configuration
    // 'prompt': Copier prompt after scaffolding with Live Watch status
    const [step, setStep] = useState<1 | 2 | 'single' | 'multi' | 'prompt'>(1);
    const [intent, setIntent] = useState<'existing' | 'new' | null>(null);

    // Shared Form States
    const [workspaceName, setWorkspaceName] = useState('');
    const [workspaceRootHandle, setWorkspaceRootHandle] = useState<any | null>(null);
    const [scannedSpec, setScannedSpec] = useState<Project | null>(null);
    const [scaffoldNeeded, setScaffoldNeeded] = useState(false);
    const [scanStatus, setScanStatus] = useState<{
        type: 'loading' | 'success' | 'skeleton' | 'error';
        message?: string;
        details?: React.ReactNode;
    } | null>(null);

    // Multi-Repo States
    const [reposList, setReposList] = useState<string[]>([]);
    
    // Prompt State
    const [agentPromptText, setAgentPromptText] = useState('');

    const folderInputRef = useRef<HTMLInputElement>(null);

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
2. Connections must be defined in the \`## Connections\` section as:
   * [from_node_id, to_node_id, interaction_label, type]
   Where type is "request", "data", or "future".
3. Simulation pathways must be detailed in the \`## Flows\` section.

Ensure you update only the \`.arcbench/architecture.md\` file when modifying the layout. Do not change business logic or output other file formats.
\`\`\`
`;
    };

    // Helper: export project spec back to Markdown
    const exportProjectToMarkdown = (proj: Project): string => {
        let md = `# ${proj.title}\nVersion: ${proj.version || '1.0'}\n`;
        if (proj.description) md += `Description: ${proj.description}\n`;
        md += `\n## Nodes\n`;
        
        proj.nodes.forEach(n => {
            md += `### ${n.id} (${n.category || 'Service'})\n`;
            md += `* **Title:** ${n.title}\n`;
            md += `* **Icon:** ${n.icon}\n`;
            md += `* **x:** ${n.x}\n`;
            md += `* **y:** ${n.y}\n`;
            if (n.desc || n.description) md += `* **Description:** ${n.desc || n.description}\n`;
            if (n.sections && n.sections.length > 0) {
                n.sections.forEach(s => {
                    md += `\n#### ${s.label}\n`;
                    s.items.forEach(it => {
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
        proj.connections.forEach(([f, t, label, type]) => {
            md += `| ${f} | ${t} | ${label} | ${type} |\n`;
        });

        if (proj.flows && proj.flows.length > 0) {
            md += `\n## Flows\n`;
            proj.flows.forEach(fl => {
                md += `### ${fl.id}\n`;
                if (fl.subtitle) md += `Subtitle: ${fl.subtitle}\n`;
                md += `\n| Node | Action | Detail | Data |\n|---|---|---|---|\n`;
                fl.steps.forEach(st => {
                    md += `| ${st.node} | ${st.label} | ${st.detail} | ${st.data || ''} |\n`;
                });
                md += `\n`;
            });
        }

        return md;
    };

    const writeScaffoldFiles = async (dirHandle: any, spec: Project, linkedRepos?: string[]) => {
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

            showToast("📥 Created scaffolding files in .arcbench/ folder!");
        } catch (err) {
            console.error("Failed to write scaffold files directly:", err);
            showToast("⚠️ Failed to write architecture files directly. Sandbox permission denied.");
        }
    };

    const processDirectoryOnboarding = async (dirHandle: any, _mode: 'single' | 'multi') => {
        setScanStatus({ type: 'loading', message: 'Scanning project files...' });
        setWorkspaceRootHandle(dirHandle);
        setScannedSpec(null);
        setScaffoldNeeded(false);

        // Autofill Workspace Name from folder handle name
        const rawName = dirHandle.name;
        const formattedName = rawName.split(/[_-]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "My Workspace";
        setWorkspaceName(formattedName);

        try {
            let specFileHandle = null;

            // 1. Try to search in .arcbench/architecture.md first
            try {
                const arcbenchDir = await dirHandle.getDirectoryHandle(".arcbench");
                specFileHandle = await arcbenchDir.getFileHandle("architecture.md");

                // If multi-repo and existing workspace: load workspace.json too
                try {
                    const wsHandle = await arcbenchDir.getFileHandle("workspace.json");
                    const wsFile = await wsHandle.getFile();
                    const wsText = await wsFile.text();
                    const wsConfig = JSON.parse(wsText);
                    if (wsConfig && wsConfig.repositories) {
                        setReposList(wsConfig.repositories);
                    }
                } catch (e) {
                    // Not found or single-repo
                }
            } catch (e) {
                // Not found in .arcbench/ directory, fallback to root folder
            }

            // 2. Fallback to root directory flat search
            if (!specFileHandle) {
                for await (const entry of dirHandle.values()) {
                    if (entry.kind === "file" && entry.name.toLowerCase() === "architecture.md") {
                        specFileHandle = entry;
                        break;
                    }
                }
            }

            if (specFileHandle) {
                const file = await specFileHandle.getFile();
                const text = await file.text();
                const parsed = parseMarkdownToProject(text);
                validateProjectData(parsed);

                setScannedSpec(parsed);
                setWorkspaceName(parsed.title);
                setScanStatus({
                    type: 'success',
                    details: (
                        <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(76, 175, 80, 0.05)', border: '1px solid rgba(76, 175, 80, 0.2)', textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, fontSize: '11px', color: 'hsl(150, 75%, 70%)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>✅</span> EXISTING SPECIFICATION FOUND
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                Found <code>architecture.md</code> in your workspace! We parsed it successfully:<br />
                                • <strong>Title:</strong> {parsed.title}<br />
                                • <strong>Components:</strong> {parsed.nodes.length} nodes, {parsed.connections.length} connections.<br />
                                • <strong>Status:</strong> Live Watch is ready to sync edits automatically.
                            </div>
                        </div>
                    )
                });
            } else {
                // No architecture.md exists, heuristic scan to compile baseline template nodes
                let hasClient = false, hasApi = false, hasDb = false, hasAuth = false, hasWorker = false;
                const detectedFolders: string[] = [];
                const IGNORE_DIRS = new Set(["node_modules", ".git", ".github", "dist", "build", "target", "out", ".next", "cache", "tmp", "vendor"]);

                const traverse = async (handle: any, currentDepth = 1) => {
                    if (currentDepth > 3) return;
                    try {
                        for await (const entry of handle.values()) {
                            if (entry.kind === "directory") {
                                const name = entry.name.toLowerCase();
                                if (IGNORE_DIRS.has(name)) continue;

                                let matched = false;
                                if (name.includes("auth")) { hasAuth = true; matched = true; }
                                if (name.includes("worker") || name.includes("queue") || name.includes("job")) { hasWorker = true; matched = true; }
                                if (name.includes("db") || name.includes("database") || name.includes("postgres") || name.includes("mysql") || name.includes("redis") || name.includes("mongo")) { hasDb = true; matched = true; }
                                if (name.includes("client") || name.includes("frontend") || name.includes("web") || name.includes("app") || name.includes("ui") || name.includes("pages")) { hasClient = true; matched = true; }
                                if (name.includes("api") || name.includes("backend") || name.includes("server") || name.includes("controller") || name.includes("routes")) { hasApi = true; matched = true; }

                                if (matched || currentDepth === 1) {
                                    if (detectedFolders.length < 10) {
                                        detectedFolders.push(entry.name);
                                    }
                                }
                                await traverse(entry, currentDepth + 1);
                            } else if (entry.kind === "file") {
                                const name = entry.name.toLowerCase();
                                if (name === "docker-compose.yml" || name === "docker-compose.yaml") {
                                    hasDb = true;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Traverse access restricted or failed:", e);
                    }
                };

                await traverse(dirHandle, 1);

                const nodesList: NodeData[] = [];
                const connectionsList: ConnectionData[] = [];

                if (hasClient || (!hasApi && !hasDb)) {
                    nodesList.push({
                        id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250,
                        desc: "Web client user portal interface."
                    });
                }
                if (hasAuth) {
                    nodesList.push({
                        id: "auth", category: "Service", title: "Auth Service", icon: "🔒", color: "hsl(280,85%,75%)", x: 550, y: 550,
                        desc: "Authentication and session control gateway."
                    });
                }
                if (hasApi || hasWorker || hasDb) {
                    nodesList.push({
                        id: "api", category: "Service", title: "Backend API", icon: "⚙️", color: "hsl(200,80%,58%)", x: 550, y: 250,
                        desc: "Core application controller API."
                    });
                }
                if (hasWorker) {
                    nodesList.push({
                        id: "worker", category: "Service", title: "Job Processor", icon: "📨", color: "hsl(28,85%,58%)", x: 800, y: 550,
                        desc: "Task worker and queue executor."
                    });
                }
                if (hasDb) {
                    nodesList.push({
                        id: "db", category: "Infrastructure", title: "Database Store", icon: "🗄️", color: "hsl(170,70%,50%)", x: 800, y: 250,
                        desc: "Primary database database storage."
                    });
                }

                if (nodesList.length === 0) {
                    nodesList.push(
                        { id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "Default client interface." },
                        { id: "api", category: "Service", title: "Core Service", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Default API controller." }
                    );
                }

                const nodeIds = nodesList.map(n => n.id);
                if (nodeIds.includes("client") && nodeIds.includes("api")) {
                    connectionsList.push(["client", "api", "HTTPS Request", "request"]);
                }
                if (nodeIds.includes("api") && nodeIds.includes("auth")) {
                    connectionsList.push(["api", "auth", "Verify Tokens", "request"]);
                }
                if (nodeIds.includes("api") && nodeIds.includes("worker")) {
                    connectionsList.push(["api", "worker", "Queue Task", "data"]);
                }
                if (nodeIds.includes("api") && nodeIds.includes("db")) {
                    connectionsList.push(["api", "db", "Read/Write SQL", "data"]);
                }
                if (nodeIds.includes("worker") && nodeIds.includes("db")) {
                    connectionsList.push(["worker", "db", "Update Job Status", "data"]);
                }

                const flowSteps = nodesList.map(n => ({
                    node: n.id,
                    label: `Process at ${n.title}`,
                    detail: `Scaffolded execution step at ${n.title}.`,
                    data: `{"scaffold": true}`
                }));

                const flowsList: Flow[] = [{
                    id: "main_scaffold_flow",
                    title: "Scaffold Demo Flow",
                    subtitle: "Automatically generated walk-through simulation",
                    steps: flowSteps
                }];

                const spec: Project = {
                    id: "project-" + Date.now(),
                    title: formattedName,
                    version: "1.0",
                    nodes: nodesList,
                    connections: connectionsList,
                    flows: flowsList
                };

                setScannedSpec(spec);
                setScaffoldNeeded(true);

                setScanStatus({
                    type: 'skeleton',
                    details: (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
                            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255, 152, 0, 0.05)', border: '1px solid rgba(255, 152, 0, 0.25)' }}>
                                <div style={{ fontWeight: 700, fontSize: '11px', color: 'hsl(38, 95%, 70%)', marginBottom: '4px' }}>
                                    ⚡ SKELETON SPEC REQUIRED
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                    We did not find <code>architecture.md</code> in this directory. We will write initial specs directly into your folder:<br />
                                    • 📄 <code>.arcbench/architecture.md</code> (blank layout)<br />
                                    • 📄 <code>.arcbench/PROJECT_RULES.md</code> (AI agent prompts)<br />
                                    • 📄 <code>.arcbench/metadata.json</code> (workspace context)
                                </div>
                            </div>
                        </div>
                    )
                });
            }
        } catch (err: any) {
            console.error("Folder resolution error:", err);
            setScanStatus({
                type: 'error',
                message: `Directory scan failed: ${err.message}`
            });
        }
    };

    const handleBrowseWorkspaceRootClick = async (mode: 'single' | 'multi') => {
        if ((window as any).showDirectoryPicker) {
            try {
                const dirHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
                await processDirectoryOnboarding(dirHandle, mode);
            } catch (err) {
                console.warn("Directory selection cancelled or failed:", err);
            }
        } else {
            showToast("Your browser does not support the File System Access API. Please use a modern desktop browser.");
        }
    };

    const handleAddRepoFolderClick = async () => {
        if ((window as any).showDirectoryPicker) {
            try {
                const dirHandle = await (window as any).showDirectoryPicker({ mode: "read" });
                const name = dirHandle.name;
                if (!reposList.includes(name)) {
                    setReposList([...reposList, name]);
                }
            } catch (err) {
                console.warn("Folder picker cancelled:", err);
            }
        } else {
            showToast("Folder Picker API is not available on this browser.");
        }
    };

    const handleCreateWorkspace = async () => {
        if (!workspaceRootHandle) return;

        const specToLoad = scannedSpec ? { ...scannedSpec } : {
            id: "project-" + Date.now(),
            title: workspaceName.trim() || "My Workspace",
            version: "1.0",
            nodes: [],
            connections: [],
            flows: []
        };

        if (workspaceName.trim()) {
            specToLoad.title = workspaceName.trim();
        }

        const linkedRepos = step === 'multi' ? reposList : undefined;

        // Perform scaffolding if missing or if intent is new project configuration
        const reallyScaffold = scaffoldNeeded || intent === 'new' || !scannedSpec;

        if (reallyScaffold) {
            await writeScaffoldFiles(workspaceRootHandle, specToLoad, linkedRepos);
        }

        // Save active workspace root to store
        createProject(specToLoad);
        useProjectStore.getState().setWatchDirectoryHandle(workspaceRootHandle);
        useProjectStore.getState().setLiveWatchEnabled(true);

        // If no scaffold was needed (existing spec found), directly open and close modal
        if (!reallyScaffold) {
            showToast(`Workspace '${specToLoad.title}' loaded successfully!`);
            onClose();
            return;
        }

        // Otherwise (scaffold was written), present agent system prompts & active watch indicator
        if (step === 'single') {
            const prompt = `You are a senior system architect. I have initialized an ArchBench workspace in my repository folder. Analyze my codebase files and write the architecture specification directly into .arcbench/architecture.md, following the format rules in .arcbench/PROJECT_RULES.md. Do not output explanations, only write the markdown code.`;
            setAgentPromptText(prompt);
            setStep('prompt');
        } else {
            // Multi-repo instructions
            const repoNamesList = linkedRepos && linkedRepos.length > 0 ? linkedRepos.join(", ") : "repositories";
            const prompt = `You are a senior system architect. I have initialized an ArchBench multi-repository workspace. The connected repositories are: ${repoNamesList}. The linked folders are tracked in .arcbench/workspace.json. Analyze these directories and write the unified architecture specification directly into .arcbench/architecture.md, following the format rules in .arcbench/PROJECT_RULES.md. Do not output explanations, only write the markdown code.`;
            setAgentPromptText(prompt);
            setStep('prompt');
        }
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
                    <button type="button" className="modal-close" title="Close" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                <div className="modal-body" style={{ padding: '20px' }}>
                    {step === 1 && (
                        <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '20px', textAlign: 'center', lineHeight: '1.4' }}>
                                Connect your local project. Prepare guidelines and scaffold files for your coding AI agents.
                            </div>
                            <div className="wizard-options" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <button type="button" className="wizard-opt-btn" style={{ padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%' }} onClick={() => handleSelectIntent('existing')}>
                                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>🔍</div>
                                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>Existing Codebase</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Connect an existing codebase repository folder. We scan folders and load or create spec files.</div>
                                </button>
                                <button type="button" className="wizard-opt-btn" style={{ padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%' }} onClick={() => handleSelectIntent('new')}>
                                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>💡</div>
                                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>New System Design</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Start a brand new architecture layout. Creates boilerplate templates in a clean directory folder.</div>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '20px', textAlign: 'center', lineHeight: '1.4' }}>
                                {intent === 'existing' ? "How is your existing codebase structured?" : "How would you like to structure this new design?"}
                            </div>
                            <div className="wizard-options" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <button type="button" className="wizard-opt-btn" style={{ padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%' }} onClick={() => setStep('single')}>
                                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>📦</div>
                                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>Single Repository</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Connect a single folder containing your repository code and `.arcbench/` layout files.</div>
                                </button>
                                <button type="button" className="wizard-opt-btn" style={{ padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%' }} onClick={() => setStep('multi')}>
                                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>🗃️</div>
                                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>Multi Repository</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Create a Workspace Root Folder to group multiple connected codebase sub-directories.</div>
                                </button>
                                <button type="button" className="wizard-opt-btn" style={{ padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', background: 'rgba(255,255,255,0.01)', textAlign: 'left', cursor: 'default', display: 'block', width: '100%', opacity: 0.4 }}>
                                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>🐙</div>
                                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>GitHub Repositories <span style={{ fontSize: '8px', padding: '1px 4px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', marginLeft: '4px' }}>Coming Soon</span></div>
                                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', lineHeight: '1.4' }}>Review structural diffs in pull requests.</div>
                                </button>
                            </div>
                            <div className="wizard-nav" style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '16px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setStep(1)} style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'inherit' }}>Back</button>
                            </div>
                        </div>
                    )}

                    {step === 'single' && (
                        <div>
                            {/* Folder Selection First */}
                            <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', marginBottom: '6px' }}>📁</div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Select Repository Folder</div>
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.4' }}>
                                    Choose the local directory containing your repository.
                                </div>
                                <button 
                                    type="button" 
                                    className="btn-primary" 
                                    onClick={() => handleBrowseWorkspaceRootClick('single')}
                                    style={{ padding: '6px 14px', fontSize: '11px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer', background: 'hsl(270,70%,60%)', border: 'none', color: '#fff' }}
                                >
                                    {workspaceRootHandle ? "✓ Connected Folder" : "Select Folder..."}
                                </button>
                                {workspaceRootHandle && (
                                    <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: '6px', wordBreak: 'break-all' }}>
                                        Selected: <code>{workspaceRootHandle.name}</code>
                                    </div>
                                )}
                            </div>

                            {/* Workspace Name Input after selection */}
                            {workspaceRootHandle && (
                                <div style={{ marginBottom: '12px', textAlign: 'left' }}>
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

                            {scanStatus && (
                                <div className="wizard-scan-status" style={{ display: 'block', marginTop: '12px', padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', fontSize: '11px', border: '1px solid rgba(255,255,255,0.06)', maxHeight: '280px', overflowY: 'auto', textAlign: 'left' }}>
                                    {scanStatus.type === 'loading' && <span style={{ color: 'hsl(200, 85%, 75%)' }}>{scanStatus.message}</span>}
                                    {scanStatus.type === 'error' && <span style={{ color: 'hsl(0, 72%, 62%)', fontWeight: 600 }}>❌ {scanStatus.message}</span>}
                                    {scanStatus.details}
                                </div>
                            )}

                            <div className="wizard-nav" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setStep(2)} style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'inherit' }}>Back</button>
                                <button 
                                    type="button" 
                                    className="btn-primary" 
                                    disabled={!workspaceRootHandle} 
                                    onClick={handleCreateWorkspace} 
                                    style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, background: workspaceRootHandle ? 'hsl(270,70%,60%)' : 'rgba(255,255,255,0.05)', border: 'none', color: workspaceRootHandle ? '#fff' : 'rgba(255,255,255,0.3)' }}
                                >
                                    {(scaffoldNeeded || intent === 'new') ? "Generate Scaffold & Open" : "Open Workspace"}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'multi' && (
                        <div>
                            {/* 1. Select Workspace Root Folder */}
                            <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', marginBottom: '6px' }}>📁</div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Select Workspace Root Folder</div>
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.4' }}>
                                    Choose the root folder where ArcBench workspace config metadata and <code>.arcbench/architecture.md</code> will live.
                                </div>
                                <button 
                                    type="button" 
                                    className="btn-primary" 
                                    onClick={() => handleBrowseWorkspaceRootClick('multi')}
                                    style={{ padding: '6px 14px', fontSize: '11px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer', background: 'hsl(270,70%,60%)', border: 'none', color: '#fff' }}
                                >
                                    {workspaceRootHandle ? "✓ Root Folder Connected" : "Select Root Folder..."}
                                </button>
                                {workspaceRootHandle && (
                                    <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: '6px', wordBreak: 'break-all' }}>
                                        Selected: <code>{workspaceRootHandle.name}</code>
                                    </div>
                                )}
                            </div>

                            {workspaceRootHandle && (
                                <>
                                    {/* Workspace Name Input */}
                                    <div style={{ marginBottom: '16px', textAlign: 'left' }}>
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

                                    {/* 2. Add Repository Folders */}
                                    <div style={{ marginBottom: '12px', textAlign: 'left', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                                        <label className="form-label" style={{ fontSize: '11px', display: 'block', fontWeight: 600, marginBottom: '6px' }}>Repository Folders</label>
                                        <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.4' }}>
                                            Add directory references for repositories in this workspace (saved to <code>workspace.json</code>).
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                                            {reposList.length === 0 ? (
                                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', opacity: 0.6, fontStyle: 'italic', padding: '8px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)' }}>
                                                    No repositories connected. Click Add below.
                                                </div>
                                            ) : (
                                                reposList.map((repo, i) => (
                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '10px' }}>
                                                        <span style={{ fontFamily: 'monospace' }}>✓ {repo}</span>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setReposList(reposList.filter((_, idx) => idx !== i))}
                                                            style={{ background: 'none', border: 'none', color: 'hsl(0, 72%, 62%)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        <button 
                                            type="button" 
                                            className="btn-secondary" 
                                            onClick={handleAddRepoFolderClick}
                                            style={{ padding: '4px 10px', fontSize: '10px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'inherit' }}
                                        >
                                            + Add Repository Folder
                                        </button>
                                    </div>
                                </>
                            )}

                            {scanStatus && (
                                <div className="wizard-scan-status" style={{ display: 'block', marginTop: '12px', padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', fontSize: '11px', border: '1px solid rgba(255,255,255,0.06)', maxHeight: '280px', overflowY: 'auto', textAlign: 'left' }}>
                                    {scanStatus.type === 'loading' && <span style={{ color: 'hsl(200, 85%, 75%)' }}>{scanStatus.message}</span>}
                                    {scanStatus.type === 'error' && <span style={{ color: 'hsl(0, 72%, 62%)', fontWeight: 600 }}>❌ {scanStatus.message}</span>}
                                    {scanStatus.details}
                                </div>
                            )}

                            <div className="wizard-nav" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setStep(2)} style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'inherit' }}>Back</button>
                                <button 
                                    type="button" 
                                    className="btn-primary" 
                                    disabled={!workspaceRootHandle || reposList.length === 0} 
                                    onClick={handleCreateWorkspace} 
                                    style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, background: (workspaceRootHandle && reposList.length > 0) ? 'hsl(270,70%,60%)' : 'rgba(255,255,255,0.05)', border: 'none', color: (workspaceRootHandle && reposList.length > 0) ? '#fff' : 'rgba(255,255,255,0.3)' }}
                                >
                                    {(scaffoldNeeded || intent === 'new') ? "Generate Scaffold & Open" : "Open Workspace"}
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
                                    style={{ padding: '8px 24px', fontSize: '11.5px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, background: 'hsl(270,70%,60%)', border: 'none', color: '#fff', boxShadow: '0 4px 12px rgba(180,130,255,0.2)' }}
                                >
                                    Open Dashboard Workspace
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
