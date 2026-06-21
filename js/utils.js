export function showToast(message) {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        toast.className = "toast-msg";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove("show");
    // Force reflow
    void toast.offsetWidth;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

export function copyToClipboard(text, successMessage) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMessage || "Copied to clipboard!");
    }).catch(err => {
        // Fallback copy method
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
            showToast(successMessage || "Copied to clipboard!");
        } catch (e) {
            showToast("Failed to copy context.");
        }
        document.body.removeChild(textarea);
    });
}

export function downloadFile(content, fileName, contentType) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
}

export function renderMarkdownToHtml(markdown) {
    if (!markdown) return "";
    let html = markdown;

    // Escape raw HTML tags to prevent HTML injection/XSS issues
    html = html
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Code blocks
    html = html.replace(/```([a-zA-Z0-9-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
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
