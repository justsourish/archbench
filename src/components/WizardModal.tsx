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

    const [step, setStep] = useState<1 | 'analyze' | 'design'>(1);
    
    // Analyze State
    const [analyzeTitle, setAnalyzeTitle] = useState('');
    const [scanStatus, setScanStatus] = useState<{
        type: 'loading' | 'success' | 'skeleton' | 'error';
        message?: string;
        details?: React.ReactNode;
    } | null>(null);
    const [scannedSpec, setScannedSpec] = useState<Project | null>(null);
    const [scannedDirHandle, setScannedDirHandle] = useState<any | null>(null);
    const [scaffoldNeeded, setScaffoldNeeded] = useState(false);

    // Design State
    const [designTitle, setDesignTitle] = useState('');
    const [designDesc, setDesignDesc] = useState('');

    const folderInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const showToast = (msg: string) => {
        alert(msg); // Fallback to alert just like legacy utils
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
* The file \`architecture.md\` is the single source of truth for the system architecture.
* Any changes to \`architecture.md\` will be automatically picked up and hot-reloaded by the ArchBench visual dashboard.

## LLM System Instructions
When using an LLM agent (like Gemini, OpenAI, Claude, or a workspace copilot) to update the system structure, prompt it with the following:

\`\`\`markdown
You are a senior systems architect. Your task is to analyze the codebase and write/update the \`architecture.md\` specification file.

Format rules:
1. Every component must be defined in the \`## Nodes\` section.
   Use the categories: "Entry Point", "Service", "Infrastructure", or "Boundary".
2. Connections must be defined in the \`## Connections\` section as:
   * [from_node_id, to_node_id, interaction_label, type]
   Where type is "request", "data", or "future".
3. Simulation pathways must be detailed in the \`## Flows\` section.

Ensure you update only the \`architecture.md\` file when modifying the layout. Do not change business logic or output other file formats.
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
                md += `### ${fl.title}\n`;
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

    const writeScaffoldFiles = async (dirHandle: any, spec: Project) => {
        try {
            const mdContent = exportProjectToMarkdown(spec);
            const specHandle = await dirHandle.getFileHandle("architecture.md", { create: true });
            const specWritable = await specHandle.createWritable();
            await specWritable.write(mdContent);
            await specWritable.close();

            const rulesContent = generateProjectRulesContent(spec.title);
            const rulesHandle = await dirHandle.getFileHandle("PROJECT_RULES.md", { create: true });
            const rulesWritable = await rulesHandle.createWritable();
            await rulesWritable.write(rulesContent);
            await rulesWritable.close();
            showToast("📥 Created scaffolding files in project root!");
        } catch (err) {
            console.error("Failed to write scaffold files directly:", err);
            showToast("⚠️ Failed to write architecture files directly. Sandbox permission denied.");
        }
    };

    const processDirectoryOnboarding = async (dirHandle: any) => {
        setScanStatus({ type: 'loading', message: 'Scanning project files...' });
        setScannedDirHandle(dirHandle);
        setScaffoldNeeded(false);
        setScannedSpec(null);

        try {
            let specFileHandle = null;
            // Iterate directory top level entries
            for await (const entry of dirHandle.values()) {
                if (entry.kind === "file" && entry.name.toLowerCase() === "architecture.md") {
                    specFileHandle = entry;
                    break;
                }
            }

            if (specFileHandle) {
                const file = await specFileHandle.getFile();
                const text = await file.text();
                const parsed = parseMarkdownToProject(text);
                validateProjectData(parsed);

                setScannedSpec(parsed);
                setAnalyzeTitle(parsed.title);
                setScanStatus({
                    type: 'success',
                    details: (
                        <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(76, 175, 80, 0.05)', border: '1px solid rgba(76, 175, 80, 0.2)', textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, fontSize: '11px', color: 'hsl(150, 75%, 70%)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>✅</span> EXISTING SPECIFICATION FOUND
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                Found <code>architecture.md</code> in your project root! We parsed it successfully:<br />
                                • <strong>Title:</strong> {parsed.title}<br />
                                • <strong>Components:</strong> {parsed.nodes.length} nodes, {parsed.connections.length} connections.<br />
                                • <strong>Status:</strong> Live Watch is ready to sync edits automatically.
                            </div>
                        </div>
                    )
                });
            } else {
                // Heuristic scan directory folders
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
                        console.warn("Traverse permission or access error on sub-handle:", e);
                    }
                };

                await traverse(dirHandle, 1);

                const suggestedTitle = dirHandle.name.split(/[_-]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Workspace Scaffold";
                setAnalyzeTitle(suggestedTitle);

                const nodesList: NodeData[] = [];
                const connectionsList: ConnectionData[] = [];

                if (hasClient || (!hasApi && !hasDb)) {
                    nodesList.push({
                        id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250,
                        desc: "Discovered client application folder."
                    });
                }
                if (hasAuth) {
                    nodesList.push({
                        id: "auth", category: "Service", title: "Auth Service", icon: "🔒", color: "hsl(280,85%,75%)", x: 550, y: 550,
                        desc: "Discovered authentication service folder."
                    });
                }
                if (hasApi || hasWorker || hasDb) {
                    nodesList.push({
                        id: "api", category: "Service", title: "Backend API", icon: "⚙️", color: "hsl(200,80%,58%)", x: 550, y: 250,
                        desc: "Discovered core api controllers."
                    });
                }
                if (hasWorker) {
                    nodesList.push({
                        id: "worker", category: "Service", title: "Job Processor", icon: "📨", color: "hsl(28,85%,58%)", x: 800, y: 550,
                        desc: "Discovered worker task queues."
                    });
                }
                if (hasDb) {
                    nodesList.push({
                        id: "db", category: "Infrastructure", title: "Database Store", icon: "🗄️", color: "hsl(170,70%,50%)", x: 800, y: 250,
                        desc: "Discovered database storage config."
                    });
                }

                if (nodesList.length === 0) {
                    nodesList.push(
                        { id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "Default client interface." },
                        { id: "api", category: "Service", title: "Core Service", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Default backend API service." }
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

                if (connectionsList.length === 0 && nodeIds.length >= 2) {
                    connectionsList.push([nodeIds[0], nodeIds[1], "Connects To", "request"]);
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
                    title: suggestedTitle,
                    version: "1.0",
                    nodes: nodesList,
                    connections: connectionsList,
                    flows: flowsList
                };

                setScannedSpec(spec);
                setScaffoldNeeded(true);

                let detectedText = [];
                if (hasClient) detectedText.push("Frontend UI");
                if (hasApi) detectedText.push("API Backend");
                if (hasDb) detectedText.push("Database");
                if (hasAuth) detectedText.push("Auth");
                if (hasWorker) detectedText.push("Worker Thread");
                if (detectedText.length === 0) detectedText.push("Generic project folder");

                setScanStatus({
                    type: 'skeleton',
                    details: (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
                            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255, 152, 0, 0.05)', border: '1px solid rgba(255, 152, 0, 0.25)' }}>
                                <div style={{ fontWeight: 700, fontSize: '11px', color: 'hsl(38, 95%, 70%)', marginBottom: '4px' }}>
                                    ⚡ SKELETON SPEC REQUIRED
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                    We did not find <code>architecture.md</code> in this directory. We scanned your folder structure and will write starter specs directly into your folder:<br />
                                    • 📄 <code>architecture.md</code> (blank visual spec)<br />
                                    • 📄 <code>PROJECT_RULES.md</code> (AI prompt rules)<br />
                                    • <strong>Detected components</strong>: {detectedText.join(", ")}
                                    {detectedFolders.length > 0 && (
                                        <div style={{ marginTop: '4px', opacity: 0.8, fontSize: '10px' }}>
                                            Scanned directories: <code>{detectedFolders.join(", ")}</code>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(180, 130, 255, 0.04)', border: '1px solid rgba(180, 130, 255, 0.15)' }}>
                                <div style={{ fontWeight: 700, fontSize: '10.5px', color: 'hsl(280, 85%, 80%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <span>🤖 AI PROMPT FOR IDE/CLI</span>
                                    <button 
                                        type="button"
                                        id="btn-copy-onboarding-prompt" 
                                        style={{ background: 'rgba(180, 130, 255, 0.2)', border: '1px solid rgba(180, 130, 255, 0.4)', color: 'hsl(280, 85%, 80%)', padding: '3px 8px', fontSize: '9px', cursor: 'pointer', borderRadius: '4px', fontFamily: 'inherit', fontWeight: 600 }}
                                        onClick={() => {
                                            const pText = `You are a senior system architect. I have initialized an ArchBench workspace. Analyze my codebase files and write the architecture specification directly into architecture.md in my root folder, following the format rules in PROJECT_RULES.md. Do not output explanations, only write the markdown code.`;
                                            copyToClipboard(pText, "🤖 LLM System Prompt copied to clipboard! Paste it into your AI workspace.");
                                        }}
                                    >
                                        Copy Prompt
                                    </button>
                                </div>
                                <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '8px' }}>
                                    Copy this prompt and paste it in Cursor, Gemini, Claude, or Copilot to write your spec from your code files.
                                </div>
                                <div style={{ fontSize: '9.5px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.25)', padding: '8px', borderRadius: '4px', maxHeight: '60px', overflowY: 'auto', color: 'var(--text-secondary)' }}>
                                    {`You are a senior system architect. I have initialized an ArchBench workspace. Analyze my codebase files and write the architecture specification directly into architecture.md in my root folder, following the format rules in PROJECT_RULES.md. Do not output explanations, only write the markdown code.`}
                                </div>
                            </div>
                        </div>
                    )
                });
            }
        } catch (err: any) {
            console.error("Directory scan error:", err);
            setScanStatus({
                type: 'error',
                message: `Directory onboarding failed: ${err.message}`
            });
        }
    };

    const handleBrowseFolderClick = async () => {
        if ((window as any).showDirectoryPicker) {
            try {
                const dirHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
                await processDirectoryOnboarding(dirHandle);
            } catch (err) {
                console.warn("Directory selection cancelled or failed, falling back to legacy input:", err);
                folderInputRef.current?.click();
            }
        } else {
            folderInputRef.current?.click();
        }
    };

    const handleFolderInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        await handleScannedFiles(files);
    };

    const handleScannedFiles = async (files: FileList) => {
        setScanStatus({ type: 'loading', message: 'Scanning project files...' });
        setScannedDirHandle(null);
        setScannedSpec(null);

        let archFile: File | null = null;
        const filesList = Array.from(files);

        for (const file of filesList) {
            const name = file.name.toLowerCase();
            const relPath = (file as any).webkitRelativePath ? (file as any).webkitRelativePath.toLowerCase() : "";
            if (name === "architecture.md" || relPath.endsWith("architecture.md")) {
                archFile = file;
                break;
            }
        }

        if (archFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target?.result as string;
                    const parsed = parseMarkdownToProject(text);
                    validateProjectData(parsed);

                    setScannedSpec(parsed);
                    setAnalyzeTitle(parsed.title);
                    setScanStatus({
                        type: 'success',
                        details: (
                            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(76, 175, 80, 0.05)', border: '1px solid rgba(76, 175, 80, 0.2)', textAlign: 'left' }}>
                                <div style={{ fontWeight: 700, fontSize: '11px', color: 'hsl(150, 75%, 70%)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span>✅</span> EXISTING SPECIFICATION FOUND
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                    Found <code>architecture.md</code> in your uploaded folder! We parsed it successfully:<br />
                                    • <strong>Title:</strong> {parsed.title}<br />
                                    • <strong>Components:</strong> {parsed.nodes.length} nodes, {parsed.connections.length} connections.<br />
                                    • <strong>Status:</strong> Ready to load. Live Watch requires modern directory picker support.
                                </div>
                            </div>
                        )
                    });
                } catch (err: any) {
                    setScanStatus({
                        type: 'error',
                        message: `Found architecture.md but failed parsing: ${err.message}`
                    });
                }
            };
            reader.readAsText(archFile);
        } else {
            let hasClient = false, hasApi = false, hasDb = false, hasAuth = false, hasWorker = false;
            let folderName = "";

            filesList.forEach(file => {
                const path = (file as any).webkitRelativePath ? (file as any).webkitRelativePath.toLowerCase() : file.name.toLowerCase();
                if (!folderName && (file as any).webkitRelativePath) {
                    folderName = (file as any).webkitRelativePath.split('/')[0];
                }
                if (path.includes("/client") || path.includes("/frontend") || path.includes("/web") || path.includes("index.html") || path.includes("app.js") || path.includes("app.tsx")) {
                    hasClient = true;
                }
                if (path.includes("/api") || path.includes("/backend") || path.includes("/server") || path.includes("server.js") || path.includes("app.py")) {
                    hasApi = true;
                }
                if (path.includes("/db") || path.includes("/database") || path.includes("/postgres") || path.includes("/mysql") || path.includes("/mongo") || path.includes("schema.sql")) {
                    hasDb = true;
                }
                if (path.includes("/auth") || path.includes("login") || path.includes("session")) {
                    hasAuth = true;
                }
                if (path.includes("/worker") || path.includes("/queue") || path.includes("rabbitmq") || path.includes("kafka") || path.includes("redis")) {
                    hasWorker = true;
                }
            });

            const suggestedTitle = folderName ? folderName.split(/[_-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "Workspace Scaffold";
            setAnalyzeTitle(suggestedTitle);

            const nodesList: NodeData[] = [];
            const connectionsList: ConnectionData[] = [];

            if (hasClient || (!hasApi && !hasDb)) {
                nodesList.push({
                    id: "client", category: "Entry Point", title: "Web Frontend", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250,
                    desc: "Scaffolded client interface detected in project directory."
                });
            }
            if (hasAuth) {
                nodesList.push({
                    id: "auth", category: "Service", title: "Authentication API", icon: "🔒", color: "hsl(280,85%,75%)", x: 550, y: 550,
                    desc: "Scaffolded authentication system detected."
                });
            }
            if (hasApi || hasWorker || hasDb) {
                nodesList.push({
                    id: "api", category: "Service", title: "Backend API Gateway", icon: "⚙️", color: "hsl(200,80%,58%)", x: 550, y: 250,
                    desc: "Scaffolded core api controller."
                });
            }
            if (hasWorker) {
                nodesList.push({
                    id: "worker", category: "Service", title: "Job Processor", icon: "📨", color: "hsl(28,85%,58%)", x: 800, y: 550,
                    desc: "Scaffolded worker task queues."
                });
            }
            if (hasDb) {
                nodesList.push({
                    id: "db", category: "Infrastructure", title: "Database Store", icon: "🗄️", color: "hsl(170,70%,50%)", x: 800, y: 250,
                    desc: "Scaffolded database storage config."
                });
            }

            if (nodesList.length === 0) {
                nodesList.push(
                    { id: "client", category: "Entry Point", title: "Client Web App", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "User client view." },
                    { id: "api", category: "Service", title: "Backend Controller", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Processes logical APIs." }
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
                label: `Activate ${n.title}`,
                detail: `Workflow processes payload at ${n.title}.`,
                data: `{"activated": "${n.id}"}`
            }));

            const flowsList: Flow[] = [{
                id: "main_scaffold_flow",
                title: "Scaffold Demo Flow",
                subtitle: "Automatically generated walk-through simulation",
                steps: flowSteps
            }];

            const spec: Project = {
                id: "project-" + Date.now(),
                title: suggestedTitle,
                version: "1.0",
                nodes: nodesList,
                connections: connectionsList,
                flows: flowsList
            };

            setScannedSpec(spec);
            setScaffoldNeeded(true);

            let detectedText = [];
            if (hasClient) detectedText.push("Frontend UI");
            if (hasApi) detectedText.push("API Backend");
            if (hasDb) detectedText.push("Database");
            if (hasAuth) detectedText.push("Auth");
            if (hasWorker) detectedText.push("Worker Thread");
            if (detectedText.length === 0) detectedText.push("Generic project folder");

            setScanStatus({
                type: 'skeleton',
                details: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
                        <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255, 152, 0, 0.05)', border: '1px solid rgba(255, 152, 0, 0.25)' }}>
                            <div style={{ fontWeight: 700, fontSize: '11px', color: 'hsl(38, 95%, 70%)', marginBottom: '4px' }}>
                                ⚡ SKELETON SPEC REQUIRED
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                We did not find <code>architecture.md</code> in this directory. We scanned your folder structure and will write starter specs directly into your folder:<br />
                                • 📄 <code>architecture.md</code> (blank spec template)<br />
                                • 📄 <code>PROJECT_RULES.md</code> (AI rules spec)<br />
                                • <strong>Detected components</strong>: {detectedText.join(", ")}
                            </div>
                        </div>
                        <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(180, 130, 255, 0.04)', border: '1px solid rgba(180, 130, 255, 0.15)' }}>
                            <div style={{ fontWeight: 700, fontSize: '10.5px', color: 'hsl(280, 85%, 80%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span>🤖 AI PROMPT FOR CO-PILOT</span>
                                <button 
                                    type="button" 
                                    className="btn-action" 
                                    style={{ padding: '2px 6px', fontSize: '9px', background: 'rgba(180,130,255,0.2)', border: 'none', color: 'hsl(280,85%,80%)', cursor: 'pointer', borderRadius: '4px' }}
                                    onClick={() => copyToClipboard(
                                        "You are a senior system architect. I have initialized an ArchBench workspace. Analyze my codebase files and write the architecture specification directly into architecture.md in my root folder, following the format rules in PROJECT_RULES.md. Do not output explanations, only write the markdown code.",
                                        "🤖 Prompt copied to clipboard!"
                                    )}
                                >
                                    Copy Prompt
                                </button>
                            </div>
                            <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)' }}>
                                Copy prompt and run in your editor to populate architecture.md.
                            </div>
                        </div>
                    </div>
                )
            });
        }
    };

    const handleLoadAnalyzed = async () => {
        if (!scannedSpec) return;

        const specToLoad = { ...scannedSpec };
        if (analyzeTitle.trim()) {
            specToLoad.title = analyzeTitle.trim();
        }

        const newId = "project-" + Date.now();
        specToLoad.id = newId;

        // Save to store
        createProject(specToLoad);

        if (scaffoldNeeded && scannedDirHandle) {
            await writeScaffoldFiles(scannedDirHandle, specToLoad);
        }

        showToast(`Project '${specToLoad.title}' loaded and initialized!`);
        
        // Try enabling Live Watch if folder picker was used
        if (scannedDirHandle) {
            useProjectStore.getState().setWatchDirectoryHandle(scannedDirHandle);
            useProjectStore.getState().setLiveWatchEnabled(true);
        }

        onClose();
    };

    const handleGenerateDesigned = () => {
        const titleVal = designTitle.trim() || "My New System Architecture";
        const descVal = designDesc.trim().toLowerCase();

        const nodesList: NodeData[] = [];
        const connectionsList: ConnectionData[] = [];
        const flowsList: Flow[] = [];

        const hasClient = descVal.includes("client") || descVal.includes("frontend") || descVal.includes("web") || descVal.includes("ui") || descVal.includes("react") || descVal.includes("next") || descVal.includes("vue") || descVal.includes("app");
        const hasGateway = descVal.includes("gateway") || descVal.includes("proxy") || descVal.includes("nginx") || descVal.includes("load balancer");
        const hasAuth = descVal.includes("auth") || descVal.includes("oauth") || descVal.includes("jwt") || descVal.includes("login") || descVal.includes("identity") || descVal.includes("cognito");
        const hasWorker = descVal.includes("worker") || descVal.includes("queue") || descVal.includes("rabbitmq") || descVal.includes("kafka") || descVal.includes("celery") || descVal.includes("redis") || descVal.includes("broker");
        const hasDb = descVal.includes("database") || descVal.includes("db") || descVal.includes("postgres") || descVal.includes("postgresql") || descVal.includes("mysql") || descVal.includes("sqlite") || descVal.includes("mongodb") || descVal.includes("dynamo");
        const hasApi = descVal.includes("api") || descVal.includes("backend") || descVal.includes("service") || descVal.includes("python") || descVal.includes("node") || descVal.includes("django") || descVal.includes("flask") || descVal.includes("express") || descVal.includes("spring");

        if (hasClient || (!hasGateway && !hasAuth && !hasWorker && !hasDb && !hasApi)) {
            nodesList.push({
                id: "client", category: "Entry Point", title: "Web Client Portal", icon: "💻", color: "hsl(210,85%,62%)", x: 200, y: 150,
                desc: "User-facing dashboard and interactive portal interface.",
                sections: [{ label: "Capabilities", items: ["Render Views", "Form Inputs", "Event Handling"] }]
            });
        }
        if (hasGateway) {
            nodesList.push({
                id: "gateway", category: "Service", title: "Edge API Gateway", icon: "🛡️", color: "hsl(270,70%,65%)", x: 500, y: 150,
                desc: "Ingress security router and authentication proxy gateway.",
                sections: [{ label: "Middlewares", items: ["Rate Limiter", "Router"] }]
            });
        }
        if (hasAuth) {
            nodesList.push({
                id: "auth", category: "Service", title: "Authentication API", icon: "🔒", color: "hsl(280,85%,75%)", x: 550, y: 450,
                desc: "Authenticates users, signs JSON Web Tokens, and manages sessions.",
                sections: [{ label: "Tech Stack", items: ["JWT", "BCrypt"] }]
            });
        }
        if (hasApi || (!hasClient && nodesList.length === 0)) {
            nodesList.push({
                id: "api", category: "Service", title: "Core Business Service", icon: "⚙️", color: "hsl(220,80%,62%)", x: 800, y: 150,
                desc: "Handles transactional requests and processes core workflows.",
                sections: [{ label: "Controller Endpoints", items: ["POST /orders", "GET /data"] }]
            });
        }
        if (hasWorker) {
            nodesList.push({
                id: "worker", category: "Service", title: "Task Event Worker", icon: "📨", color: "hsl(28,85%,58%)", x: 800, y: 450,
                desc: "Asynchronous task queue workers running background jobs.",
                sections: [{ label: "Workers", items: ["Email Processing", "Image Scaling"] }]
            });
        }
        if (hasDb) {
            let dbTitle = "Database Store";
            let dbIcon = "🗄️";
            if (descVal.includes("postgres")) dbTitle = "PostgreSQL DB";
            else if (descVal.includes("mysql")) dbTitle = "MySQL DB";
            else if (descVal.includes("mongo")) { dbTitle = "MongoDB Store"; dbIcon = "🍃"; }
            else if (descVal.includes("redis")) { dbTitle = "Redis Cache"; dbIcon = "⚡"; }

            nodesList.push({
                id: "db", category: "Infrastructure", title: dbTitle, icon: dbIcon, color: "hsl(170,70%,50%)", x: 1100, y: 150,
                desc: "Persistent relational and transactional storage node.",
                sections: [{ label: "Tables/Schemas", items: ["Users Registry", "Audit Logs"] }]
            });
        }

        if (nodesList.length === 0) {
            nodesList.push(
                { id: "client", category: "Entry Point", title: "Client Web App", icon: "💻", color: "hsl(210,85%,62%)", x: 300, y: 250, desc: "User client view." },
                { id: "api", category: "Service", title: "Backend Controller", icon: "⚙️", color: "hsl(200,80%,58%)", x: 750, y: 250, desc: "Processes logical APIs." }
            );
        }

        const nodeIds = nodesList.map(n => n.id);
        if (nodeIds.includes("client") && nodeIds.includes("gateway")) {
            connectionsList.push(["client", "gateway", "HTTPS Api Request", "request"]);
        } else if (nodeIds.includes("client") && nodeIds.includes("api")) {
            connectionsList.push(["client", "api", "HTTPS Request", "request"]);
        }

        if (nodeIds.includes("gateway") && nodeIds.includes("auth")) {
            connectionsList.push(["gateway", "auth", "Authorize Key", "request"]);
        }
        if (nodeIds.includes("gateway") && nodeIds.includes("api")) {
            connectionsList.push(["gateway", "api", "Forward Route", "request"]);
        }
        if (nodeIds.includes("api") && nodeIds.includes("worker")) {
            connectionsList.push(["api", "worker", "Publish Event Task", "data"]);
        }
        if (nodeIds.includes("api") && nodeIds.includes("db")) {
            connectionsList.push(["api", "db", "Read/Write Queries", "data"]);
        }
        if (nodeIds.includes("worker") && nodeIds.includes("db")) {
            connectionsList.push(["worker", "db", "Save Task Result", "data"]);
        }

        if (connectionsList.length === 0 && nodeIds.length >= 2) {
            connectionsList.push([nodeIds[0], nodeIds[1], "HTTP Request", "request"]);
        }

        const flowSteps = nodesList.map(n => ({
            node: n.id,
            label: `Activate ${n.title}`,
            detail: `Workflow processes payload at ${n.title}.`,
            data: `{"activated": "${n.id}"}`
        }));

        flowsList.push({
            id: "generated_flow",
            title: "Simulated Data Flow Scenario",
            subtitle: "Automatically generated playback timeline for design concept",
            steps: flowSteps
        });

        const spec: Project = {
            id: "project-" + Date.now(),
            title: titleVal,
            version: "1.0",
            nodes: nodesList,
            connections: connectionsList,
            flows: flowsList
        };

        createProject(spec);
        showToast(`Successfully designed and generated '${titleVal}'!`);
        onClose();
    };

    return (
        <div className="modal-overlay show" style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-card wizard-card" style={{ width: '480px', maxWidth: '90vw' }}>
                <div className="modal-header">
                    <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                        <span style={{ background: 'linear-gradient(135deg, hsl(270,70%,60%), hsl(310,65%,62%))', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: '#fff', fontWeight: 700 }}>New</span>
                        Project Onboarding Wizard
                    </span>
                    <button type="button" className="modal-close" title="Close" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                <div className="modal-body" style={{ padding: '20px' }}>
                    {step === 1 && (
                        <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '20px', textAlign: 'center', lineHeight: '1.4' }}>
                                Welcome to Architecture Workbench! Let's get your architecture mapped in the next 2 minutes.
                            </div>
                            <div className="wizard-options" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <button type="button" className="wizard-opt-btn" style={{ padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%' }} onClick={() => setStep('analyze')}>
                                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>🔍</div>
                                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>Analyze Existing Project</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Select a folder or files. If architecture.md is found, we load it. Otherwise, we automatically scaffold one from your folder layout.</div>
                                </button>
                                <button type="button" className="wizard-opt-btn" style={{ padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%' }} onClick={() => setStep('design')}>
                                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>💡</div>
                                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>Design New Project</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Describe your application concept in plain text, and we'll dynamically generate a starting architecture spec.</div>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'analyze' && (
                        <div>
                            <div style={{ marginBottom: '12px', textAlign: 'left' }}>
                                <label className="form-label" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Project Title</label>
                                <input 
                                    className="form-input" 
                                    type="text" 
                                    value={analyzeTitle} 
                                    onChange={(e) => setAnalyzeTitle(e.target.value)} 
                                    placeholder="e.g. My Backend Workspace" 
                                    style={{ fontSize: '11px', padding: '6px 10px', width: '100%', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'inherit' }}
                                />
                            </div>

                            <div className="wizard-dropzone" style={{ border: '2px dashed rgba(255,255,255,0.15)', borderRadius: '10px', padding: '24px 16px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', marginTop: '12px' }}>
                                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📁</div>
                                <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '12px', color: 'var(--text-primary)' }}>Select Project Root Folder</div>
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.4', maxWidth: '85%', marginLeft: 'auto', marginRight: 'auto' }}>
                                    Choose your local codebase directory to scan folders and connect real-time hot-reloads.
                                </div>
                                
                                <input 
                                    type="file" 
                                    ref={folderInputRef} 
                                    onChange={handleFolderInputChange}
                                    {...{ webkitdirectory: "", directory: "", multiple: true } as any}
                                    style={{ display: 'none' }} 
                                />
                                <button 
                                    type="button" 
                                    className="btn-primary" 
                                    onClick={handleBrowseFolderClick}
                                    style={{ padding: '6px 16px', fontSize: '11px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer', background: 'hsl(270,70%,60%)', border: 'none', color: '#fff' }}
                                >
                                    Choose Directory...
                                </button>
                                
                                <div style={{ marginTop: '12px', fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>— OR CHOOSE SINGLE SPEC FILE —</div>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={(e) => {
                                        const files = e.target.files;
                                        if (files && files.length > 0) handleScannedFiles(files);
                                    }}
                                    accept=".md,.json" 
                                    style={{ display: 'none' }} 
                                />
                                <button 
                                    type="button" 
                                    className="btn-secondary" 
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ padding: '4px 8px', fontSize: '10px', marginTop: '6px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'inherit' }}
                                >
                                    Select .md or .json File
                                </button>
                            </div>

                            {scanStatus && (
                                <div className="wizard-scan-status" style={{ display: 'block', marginTop: '12px', padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', fontSize: '11px', border: '1px solid rgba(255,255,255,0.06)', maxHeight: '280px', overflowY: 'auto', textAlign: 'left' }}>
                                    {scanStatus.type === 'loading' && <span style={{ color: 'hsl(200, 85%, 75%)' }}>{scanStatus.message}</span>}
                                    {scanStatus.type === 'error' && <span style={{ color: 'hsl(0, 72%, 62%)', fontWeight: 600 }}>❌ {scanStatus.message}</span>}
                                    {scanStatus.details}
                                </div>
                            )}

                            <div className="wizard-nav" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setStep(1)} style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'inherit' }}>Back</button>
                                <button 
                                    type="button" 
                                    className="btn-primary" 
                                    disabled={!scannedSpec} 
                                    onClick={handleLoadAnalyzed} 
                                    style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, background: scannedSpec ? 'hsl(270,70%,60%)' : 'rgba(255,255,255,0.05)', border: 'none', color: scannedSpec ? '#fff' : 'rgba(255,255,255,0.3)' }}
                                >
                                    Load Project
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'design' && (
                        <div>
                            <div style={{ marginBottom: '12px', textAlign: 'left' }}>
                                <label className="form-label" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Project Title</label>
                                <input 
                                    className="form-input" 
                                    type="text" 
                                    value={designTitle} 
                                    onChange={(e) => setDesignTitle(e.target.value)} 
                                    placeholder="e.g. Serverless Authentication Service" 
                                    style={{ fontSize: '11px', padding: '6px 10px', width: '100%', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'inherit' }}
                                />
                            </div>
                            <div style={{ marginBottom: '12px', textAlign: 'left' }}>
                                <label className="form-label" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Describe your system concept</label>
                                <textarea 
                                    className="form-input form-textarea" 
                                    value={designDesc} 
                                    onChange={(e) => setDesignDesc(e.target.value)} 
                                    style={{ height: '90px', fontSize: '11px', lineHeight: '1.4', width: '100%', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'inherit', resize: 'vertical' }}
                                    placeholder="e.g. A three-tier SaaS platform. User accesses via web client, requests hit an API Gateway doing Auth, payments are queued in RabbitMQ and processed by a worker, and everything is saved to a PostgreSQL database."
                                />
                                <span className="form-note" style={{ fontSize: '9px', opacity: 0.5, marginTop: '4px', display: 'block' }}>
                                    Identify key modules (e.g. web/frontend, api, auth, queue/broker, worker, database, cache) to automatically generate system boundaries.
                                </span>
                            </div>

                            <div className="wizard-nav" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setStep(1)} style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'inherit' }}>Back</button>
                                <button 
                                    type="button" 
                                    className="btn-primary" 
                                    onClick={handleGenerateDesigned} 
                                    style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, background: 'hsl(270,70%,60%)', border: 'none', color: '#fff' }}
                                >
                                    Generate Architecture
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
