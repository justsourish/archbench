# Strict Execution Profile

- **Architecture**: Force single-agent execution. Do not spawn or delegate tasks to sub-agents.
- **Workflow Mode**: Operate strictly in a "Plan First" loop.
- **Coding Restriction**: You are forbidden from modifying files, creating worktrees, or executing terminal actions autonomously.
- **Verification Gate**: For every task, output an architectural layout text block directly into the main chat window. Halt all operations and wait for explicit text confirmation containing "[Proceed]" before touching the codebase.
- **Artifact Ban**: Do not generate background markdown files, logs, or workspace summaries. Keep all interactions inside the active chat panel.
