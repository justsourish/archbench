# ArchBench – Real Usage Review & Roadmap Notes

## Context

Today was the first serious production usage of ArchBench for actual architecture work (Comaxy).

This was not a demo session.

This was a real workflow involving:

* Architecture understanding
* Repository analysis
* System mapping
* Agent-assisted exploration
* Continuous usage throughout the workday

The goal of this document is to capture:

* Broken functionality
* UX issues
* Product insights
* Agent/LLM discoveries
* Future roadmap items

---

## Biggest Discovery

ArchBench is not a diagram tool.

It is becoming:

**Architecture Knowledge Workspace**
+
**Agent-Friendly Documentation Layer**
+
**Optional Visual Editor**

The architecture itself is valuable.
The markdown is valuable.
The documentation is valuable.
The visual editor is only one layer.

---

## Major Product Insight

Agents already have terminals.

Initially there was a belief that ArchBench would eventually require:

* Embedded terminal
* Browser terminal
* Built-in agents
* Agent orchestration

Real-world usage suggests this is not immediately necessary.

Developers already have:

* Claude Code
* Codex CLI
* OpenCode
* Aider
* Anti-Gravity
* VS Code
* Local terminals

ArchBench does not need to replace these.

Instead ArchBench should become:

**The place where architecture knowledge lives.**

---

## Major Agent Discovery

Observed behavior:

```
Netlify
  ↓
Noisy Architects
  ↓
GitHub Repository
  ↓
README
  ↓
Architecture Docs
  ↓
Source Code
  ↓
Build Mental Model
```

The agent naturally discovered:

* GitHub repository
* Architecture documentation
* README
* Source code

without being explicitly instructed.

This changes product direction significantly.

---

## LLM Documentation Strategy

Create dedicated documentation for agents.

Suggested structure:
```
docs/
  ├── architecture/
  ├── developer/
  ├── design-system/
  ├── workflows/
  ├── limitations/
  └── llm/
```

Goals:
* Human readable
* Agent readable
* GitHub discoverable
* Public documentation layer

---

## Human Documentation Strategy

Need in-app documentation for users.

Goals:
* Easier onboarding
* Discoverability
* Better workflow understanding
* Reduced confusion

Potential areas:
* Import workflow
* Watch workflow
* Edit mode
* View mode
* Flow testing
* Navigation

---

## P0 – Broken Functionality

### Auto Layout Missing

**Problem:**
When `architecture.md` loads:
* Nodes appear cluttered
* Cards stack together
* Initial layout is poor

**Current:**
* Manual positioning saves correctly

**Missing:**
* Smart initial placement

**Potential solutions:**
* Auto-layout algorithm
* Parser-generated coordinates
* Better import behavior

---

### Flow Testing Broken

Previously worked in:
* Legacy app
* Vanilla JS version

**Currently:**
* Not loading
* Not functioning

Needs restoration.

---

### Flow Loading Issues

Flow-related functionality appears incomplete after migration.

**Investigate:**
Legacy implementation vs Vite implementation.

---

### Import Creates New History

**Current:**
Import creates new document/history.

**Desired:**
Import updates current project history.

---

### Watch Mode Issues

Watch mode behavior unreliable.

**Expected:**
Changes should update architecture history automatically.

---

## P1 – UX Problems

### Chat Drawer Toggle

**Current:**
* Hidden
* Difficult to discover
* Looks like random icon

**Desired:**
* Obvious collapse action
* Obvious expand action
* Clear visual hierarchy

---

### Mobile Drawer Default State

**Current:**
Drawer opens by default.

**Problem:**
Architecture hidden behind interface.

**Desired:**
Drawer starts collapsed.
Architecture remains primary focus.

---

### Import + Watch Workflow

**Current:**
Workflow confusing.
Import and Watch feel disconnected.

Needs redesign.

---

### Live Watch Placement

**Current placement feels incorrect.**

**Suggested:**
Place near Import.
Same conceptual workflow.

---

### Add New Workflow

**Current:**
Confusing.
Requires dedicated UX review.

**Questions:**
* What is being created?
* Where is it stored?
* What happens next?

---

## Missing Legacy Features

### Data Flow Visualization

Previously existed.

**Included:**
* Relationship visibility
* Data flow tracing
* Hover highlighting
* Visual dependency tracking

Missing from current version.
Needs comparison against legacy implementation.

---

### Hover Intelligence

**Legacy behavior:**
Hover card → highlight related items

Needs restoration.

---

## Product Evolution

### View Mode vs Edit Mode

**Current:**
Everything behaves like edit mode.

**Desired:**
* **View Mode:**
  * Explore architecture
  * Follow relationships
  * Read system
* **Edit Mode:**
  * Add nodes
  * Modify cards
  * Create connections
  * Edit architecture

Blender-style separation.

---

### Manual Architecture Editing

**Future capability:**
* Create cards manually
* Edit card content
* Create relationships
* Draw flows
* Build architecture visually

**Hybrid workflow:**
Markdown-driven + Manual editing

---

## Collaboration Vision

**Requirements:**
Must remain:
* Local-first
* Low-cost
* Open-source friendly

**Need:**
* Sharing
* Collaboration
* Team workflows

**Questions:**
* Git-based collaboration?
* Bring-your-own-auth?
* Optional cloud sync?
* Peer-to-peer?

*Undecided.*

---

## Local First Philosophy

**Default:**
* Local-first
* Markdown-first
* GitHub-friendly
* Agent-friendly

**Optional:**
* Share
* Sync
* Collaborate

**Not:**
* SaaS-first
* Cloud-first
* Account-first

---

## Immediate Fixes For Tomorrow

**Highest impact:**
1. Fix flow testing
2. Fix flow loading
3. Improve import/watch workflow
4. Improve mobile drawer behavior
5. Improve chat panel controls
6. Improve initial node layout
7. Restore data flow visualization

These changes alone should dramatically improve next-day usability.

---

## Final Observation

The most important discovery today was not a feature.

It was that agents naturally consume:
* GitHub
* README
* Documentation
* Architecture files
* Source code

ArchBench should intentionally embrace this behavior.

The documentation layer may ultimately become more valuable than the terminal layer.

---

## Developer Feedback

### Transparent Test Execution

**Feedback from developers:**
Current testing feels like a black box.

**Problems:**
* Logs are hidden or difficult to inspect.
* Users cannot easily see what tests are currently running.
* Test execution lacks visibility.

**Desired behavior:**
* Persistent log panel.
* Log area remains visible while tests execute.
* Clear indication of:
  * Current test running
  * Completed tests
  * Failed tests
  * Test status
* Real-time execution feedback.

**Goal:**
Make testing observable rather than mysterious.

---

### Architecture-Aware Automated Testing (Future)

**Long-term idea from developers:**
ArchBench should eventually support architecture-driven testing.

**Potential workflow:**
```
Architecture
     ↓
System Understanding
     ↓
Generated Test Strategy
     ↓
Automated Validation
     ↓
End-to-End Verification
```

**Possible future capabilities:**
* Agent-based testing
* Architecture-aware validation
* Automated workflow verification
* Dependency testing
* Integration testing
* End-to-end testing generated from architecture definitions

**Status:**
*Future vision only.*
*Not an immediate implementation target.*
*Document and revisit after core workflows are stable.*
