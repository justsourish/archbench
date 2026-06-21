import { Project, NodeData, ConnectionData, Flow, LayerZone, TrustBoundaryGeometry } from '../types';

export function parseMarkdownToProject(md: string): Project {
    const lines = md.split(/\r?\n/);
    const projectData: Project = {
        id: "",
        title: "Untitled Project",
        version: "1.0",
        description: "",
        nodes: [],
        connections: [],
        flows: [],
        layers: undefined,
        trustBoundary: undefined
    };

    let currentSection = ""; // "metadata", "description", "layers", "trust_boundary", "nodes", "connections", "flows"
    let currentNode: NodeData | null = null;
    let currentFlow: Flow | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === "") continue;

        // Project title header
        if (line.startsWith("# ") && currentSection === "") {
            projectData.title = line.substring(2).trim();
            currentSection = "metadata";
            continue;
        }

        // Subsections headers
        if (line.startsWith("## ")) {
            const secName = line.substring(3).trim().toLowerCase();
            if (secName.includes("description")) {
                currentSection = "description";
            } else if (secName.includes("layer")) {
                currentSection = "layers";
                projectData.layers = [];
            } else if (secName.includes("boundary")) {
                currentSection = "trust_boundary";
                projectData.trustBoundary = { x: 1000, y: 670, w: 1120, h: 950, label: "Trust Boundary", note: "" };
            } else if (secName.includes("node") || secName.includes("system")) {
                currentSection = "nodes";
            } else if (secName.includes("connection")) {
                currentSection = "connections";
            } else if (secName.includes("flow")) {
                currentSection = "flows";
            } else {
                currentSection = "";
            }
            continue;
        }

        // Parser logic per section
        if (currentSection === "description") {
            if (projectData.description) {
                projectData.description += "\n" + line;
            } else {
                projectData.description = line;
            }
            continue;
        }

        if (currentSection === "metadata") {
            if (line.toLowerCase().startsWith("version:")) {
                projectData.version = line.split(":")[1].trim();
            }
            continue;
        }

        if (currentSection === "layers") {
            // - **id**: label (y: 150, h: 420)
            const match = line.match(/^-\s*\*\*([^*]+)\*\*:\s*([^(]+)(?:\(\s*y:\s*(\d+),\s*h:\s*(\d+)\))?/);
            if (match && projectData.layers) {
                const id = match[1].trim();
                const label = match[2].trim();
                const y = match[3] ? parseInt(match[3]) : 150;
                const h = match[4] ? parseInt(match[4]) : 400;
                projectData.layers.push({ id, label, y, h, cls: id });
            }
            continue;
        }

        if (currentSection === "trust_boundary" && projectData.trustBoundary) {
            const match = line.match(/^-\s*\*\*([^*]+)\*\*:\s*(.*)/);
            if (match) {
                const key = match[1].trim().toLowerCase();
                const val = match[2].trim();
                if (key === "title") {
                    projectData.trustBoundary.label = val;
                } else if (key === "note") {
                    projectData.trustBoundary.note = val;
                } else if (key === "geometry") {
                    const geo: Record<string, number> = {};
                    val.split(",").forEach(part => {
                        const kv = part.split(":");
                        if (kv.length === 2) {
                            geo[kv[0].trim().toLowerCase()] = parseInt(kv[1].trim());
                        }
                    });
                    projectData.trustBoundary.x = geo.x || 1000;
                    projectData.trustBoundary.y = geo.y || 670;
                    projectData.trustBoundary.w = geo.w || 1120;
                    projectData.trustBoundary.h = geo.h || 950;
                }
            }
            continue;
        }

        if (currentSection === "nodes") {
            if (line.startsWith("### ")) {
                const match = line.substring(4).match(/^([^(]+)(?:\(([^)]+)\))?/);
                if (match) {
                    const id = match[1].trim();
                    const category = match[2] ? match[2].trim() : "Service";
                    currentNode = {
                        id,
                        category,
                        title: id,
                        icon: "⚙️",
                        color: "hsl(200,80%,58%)",
                        x: 100,
                        y: 100,
                        desc: "",
                        sections: []
                    };
                    projectData.nodes.push(currentNode);
                }
                continue;
            }

            if (currentNode) {
                const match = line.match(/^\*\s*\*\*([^*:]+):\*\*\s*(.*)/);
                if (match) {
                    const key = match[1].trim().toLowerCase();
                    const val = match[2].trim();
                    if (key === "title") {
                        currentNode.title = val;
                    } else if (key === "icon") {
                        currentNode.icon = val;
                    } else if (key === "color") {
                        currentNode.color = val;
                    } else if (key === "x") {
                        currentNode.x = parseInt(val);
                    } else if (key === "y") {
                        currentNode.y = parseInt(val);
                    } else if (key === "description") {
                        currentNode.desc = val;
                    } else if (key === "flow") {
                        currentNode.flow = val.split("→").map(s => s.trim());
                    } else {
                        if (!currentNode.sections) currentNode.sections = [];
                        currentNode.sections.push({
                            label: match[1].trim(),
                            items: val.split(",").map(s => s.trim())
                        });
                    }
                } else if (line.startsWith("> **[")) {
                    const calloutMatch = line.match(/^>\s*\*\*\[([^\]]+)\]\*\*\s*(.*)/);
                    if (calloutMatch) {
                        currentNode.callout = {
                            type: calloutMatch[1].trim(),
                            text: calloutMatch[2].trim()
                        };
                    }
                }
            }
            continue;
        }

        if (currentSection === "connections") {
            if (line.startsWith("|") && !line.includes("---|")) {
                const parts = line.split("|").map(s => s.trim()).filter(s => s !== "");
                if (parts[0].toLowerCase() === "from" || parts[0] === "---") continue;
                if (parts.length >= 2) {
                    const from = parts[0];
                    const to = parts[1];
                    const label = parts[2] || "";
                    const type = parts[3] || "request";
                    projectData.connections.push([from, to, label, type]);
                }
            }
            continue;
        }

        if (currentSection === "flows") {
            if (line.startsWith("### ")) {
                const match = line.substring(4).match(/^([^(]+)(?:\(([^)]+)\))?/);
                if (match) {
                    const id = match[1].trim();
                    const title = match[2] ? match[2].trim() : id;
                    currentFlow = {
                        id,
                        title,
                        subtitle: "",
                        color: "hsl(210,85%,62%)",
                        steps: []
                    };
                    projectData.flows.push(currentFlow);
                }
                continue;
            }

            if (currentFlow) {
                if (line.startsWith("*") && !line.startsWith("* **")) {
                    currentFlow.subtitle = line.replace(/^\*\s*/, "").replace(/\*$/, "").trim();
                } else if (line.startsWith("- **Color:**")) {
                    currentFlow.color = line.split(":")[1].replace(/\*/g, "").trim();
                } else {
                    const stepMatch = line.match(/^\d+\.\s*\*\*([^*]+)\*\*\s*\[([^\]]+)\]:\s*(.*)/);
                    if (stepMatch) {
                        const node = stepMatch[1].trim();
                        const label = stepMatch[2].trim();
                        const detail = stepMatch[3].trim();
                        currentFlow.steps.push({
                            node,
                            label,
                            detail,
                            data: ""
                        });
                    } else if (line.startsWith("* Data:") || line.startsWith("  * Data:")) {
                        const dataVal = line.split("Data:")[1].trim();
                        if (currentFlow.steps.length > 0) {
                            currentFlow.steps[currentFlow.steps.length - 1].data = dataVal;
                        }
                    }
                }
            }
            continue;
        }
    }

    return projectData;
}

export function exportProjectToMarkdown(proj: Project): string {
    let md = `# ${proj.title || "Untitled Project"}\n`;
    md += `Version: ${proj.version || "1.0"}\n\n`;
    if (proj.description) {
        md += `## Description\n${proj.description}\n\n`;
    }

    if (proj.layers && proj.layers.length > 0) {
        md += `## Layers\n`;
        proj.layers.forEach(l => {
            md += `- **${l.id}**: ${l.label} (y: ${l.y}, h: ${l.h})\n`;
        });
        md += `\n`;
    }

    if (proj.trustBoundary) {
        md += `## Trust Boundary\n`;
        md += `- **Title**: ${proj.trustBoundary.label || "Trust Boundary"}\n`;
        if (proj.trustBoundary.note) md += `- **Note**: ${proj.trustBoundary.note}\n`;
        md += `- **Geometry**: x: ${proj.trustBoundary.x}, y: ${proj.trustBoundary.y}, w: ${proj.trustBoundary.w}, h: ${proj.trustBoundary.h}\n\n`;
    }

    md += `## Nodes\n\n`;
    (proj.nodes || []).forEach(n => {
        md += `### ${n.id} (${n.category || "Service"})\n`;
        md += `* **Title:** ${n.title}\n`;
        md += `* **Icon:** ${n.icon || "⚙️"}\n`;
        md += `* **Color:** ${n.color || "hsl(200,80%,58%)"}\n`;
        md += `* **x:** ${n.x}\n`;
        md += `* **y:** ${n.y}\n`;
        if (n.desc) md += `* **Description:** ${n.desc}\n`;
        if (n.flow && n.flow.length > 0) {
            md += `* **Flow:** ${n.flow.join(" → ")}\n`;
        }
        (n.sections || []).forEach(s => {
            md += `* **${s.label}:** ${(s.items || []).join(", ")}\n`;
        });
        if (n.callout) {
            md += `> **[${n.callout.type}]** ${n.callout.text}\n`;
        }
        md += `\n`;
    });

    if (proj.connections && proj.connections.length > 0) {
        md += `## Connections\n`;
        md += `| From | To | Interaction | Type |\n`;
        md += `|---|---|---|---|\n`;
        proj.connections.forEach(c => {
            md += `| ${c[0]} | ${c[1]} | ${c[2] || ""} | ${c[3] || "request"} |\n`;
        });
        md += `\n`;
    }

    if (proj.flows && proj.flows.length > 0) {
        md += `## Flows\n\n`;
        proj.flows.forEach(f => {
            md += `### ${f.id} (${f.title})\n`;
            if (f.subtitle) md += `*${f.subtitle}*\n`;
            if (f.color) md += `- **Color:** ${f.color}\n`;
            md += `\n`;
            (f.steps || []).forEach((s, idx) => {
                md += `${idx + 1}. **${s.node}** [${s.label}]: ${s.detail || ""}\n`;
                if (s.data) md += `   * Data: ${s.data}\n`;
            });
            md += `\n`;
        });
    }

    return md;
}

export function validateProjectData(spec: any): boolean {
    if (!spec.nodes || !Array.isArray(spec.nodes)) {
        throw new Error("Missing 'nodes' array.");
    }
    if (!spec.connections || !Array.isArray(spec.connections)) {
        throw new Error("Missing 'connections' array.");
    }
    if (!spec.flows || !Array.isArray(spec.flows)) {
        throw new Error("Missing 'flows' array.");
    }

    const nodeIds = new Set<string>(spec.nodes.map((n: any) => n.id));

    spec.nodes.forEach((n: any, idx: number) => {
        if (!n.id) throw new Error(`Node at index ${idx} is missing an 'id'.`);
        if (!n.category) throw new Error(`Node '${n.id}' is missing a 'category'.`);
        if (n.x === undefined || isNaN(n.x)) n.x = 100 + idx * 100;
        if (n.y === undefined || isNaN(n.y)) n.y = 100;
    });

    spec.connections.forEach((c: any, idx: number) => {
        if (!Array.isArray(c) || c.length < 2) {
            throw new Error(`Connection at index ${idx} is invalid. Format: [from, to, label, type]`);
        }
        if (!nodeIds.has(c[0])) {
            throw new Error(`Connection at index ${idx} references non-existent node '${c[0]}'.`);
        }
        if (!nodeIds.has(c[1])) {
            throw new Error(`Connection at index ${idx} references non-existent node '${c[1]}'.`);
        }
    });

    spec.flows.forEach((f: any, idx: number) => {
        if (!f.id) throw new Error(`Flow at index ${idx} is missing an 'id'.`);
        if (!f.steps || !Array.isArray(f.steps)) {
            throw new Error(`Flow '${f.id}' is missing a 'steps' array.`);
        }
        f.steps.forEach((s: any, sIdx: number) => {
            if (!s.node) throw new Error(`Step ${sIdx + 1} in flow '${f.id}' is missing a target 'node'.`);
            if (!nodeIds.has(s.node)) {
                throw new Error(`Step ${sIdx + 1} in flow '${f.id}' references non-existent node '${s.node}'.`);
            }
        });
    });

    return true;
}
