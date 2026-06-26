import { Project } from '../types';
import { parseMarkdownToProject } from './parser';
import { DEFAULT_PROJECT_MD } from '../constants/demoSpec';

export const DEFAULT_PROJECT_ID = "demo-sample";

export function getBuiltInDemoProject(): Project | null {
    try {
        const builtIn = parseMarkdownToProject(DEFAULT_PROJECT_MD);
        builtIn.id = DEFAULT_PROJECT_ID;
        builtIn.title = 'ArcBench Home Demo';
        builtIn.version = builtIn.version || '1.0';
        return builtIn;
    } catch (e) {
        console.error("Failed to parse built-in demo project:", e);
        return null;
    }
}

export function getCustomProjects(): Project[] {
    try {
        const data = localStorage.getItem("archbench_projects");
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error("Failed to load projects from localStorage", e);
        return [];
    }
}

export function saveCustomProjects(projects: Project[]): void {
    try {
        localStorage.setItem("archbench_projects", JSON.stringify(projects));
    } catch (e) {
        console.error("Failed to save projects to localStorage", e);
    }
}

export function getAvailableProjects(): Project[] {
    const custom = getCustomProjects();
    const list: Project[] = [];

    // Always include the built-in public demo project as default
    const builtIn = getBuiltInDemoProject();
    if (builtIn) {
        list.push(builtIn);
    }

    custom.forEach(p => {
        if (p.id !== DEFAULT_PROJECT_ID) {
            list.push(p);
        }
    });

    return list;
}

export function renderMarkdownToHtml(markdown: string | undefined): string {
    if (!markdown) return "";
    let html = markdown;

    // Escape raw HTML tags to prevent HTML injection/XSS issues
    html = html
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Code blocks
    html = html.replace(/```([a-zA-Z0-9-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Headers
    html = html.replace(/^### (.*?)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.*?)$/gm, "<h4>$1</h4>");
    html = html.replace(/^# (.*?)$/gm, "<h5>$1</h5>");

    // Bold
    html = html.replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>");

    // Unordered lists
    html = html.replace(/^\s*[-*]\s+(.*?)$/gm, "<li>$1</li>");
    // Wrap consecutive list items in <ul>
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
    html = html.replace(/<\/ul>\s*<ul>/g, "");

    // Paragraphs
    const blocks = html.split(/\n{2,}/);
    html = blocks.map(block => {
        if (block.startsWith("<pre>") || block.startsWith("<h3>") || block.startsWith("<h4>") || block.startsWith("<h5>") || block.startsWith("<ul>") || block.startsWith("<li>")) {
            return block;
        }
        return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    }).join("");

    return html;
}

