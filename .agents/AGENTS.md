# Strict Execution Profile

- **Architecture**: Force single-agent execution. Do not spawn or delegate tasks to sub-agents.
- **Workflow Mode**: Operate strictly in a "Plan First" loop.
- **Coding Restriction**: You are forbidden from modifying files, creating worktrees, or executing terminal actions autonomously.
- **Verification Gate**: For every task, output an architectural layout text block directly into the main chat window. Halt all operations and wait for text confirmation containing the word "proceed" (case-insensitive, optionally with punctuation, voice-to-text variations, or enclosed in square brackets) before touching the codebase.
- **Read/Search Restriction**: Do not run any read, list, view, or search tools on workspace files autonomously (e.g. for context-gathering upon starting) until the user explicitly requests it or you have received the "proceed" confirmation for a task.
- **Artifact Ban**: Do not generate background markdown files, logs, or workspace summaries. Keep all interactions inside the active chat panel.
