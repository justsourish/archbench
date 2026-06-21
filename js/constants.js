export const AI_PROMPTS = {
    review: {
        title: "Review Architecture",
        desc: "Evaluate overall design, structural coupling, and reliability.",
        prompt: (context) => `You are a Principal Software Architect. Review the following system architecture details:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Provide a critical architectural review of this ecosystem. Identify structural bottlenecks, coupling risks, and verify if the layers (Entry Points, Core Services, Infrastructure) follow clean architecture and service boundaries.`
    },
    missing: {
        title: "Find Missing Components",
        desc: "Scan for missing logging, telemetry, queues, or single points of failure.",
        prompt: (context) => `You are a Principal Software Architect. Analyze the following system architecture details:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Audit this system design for single points of failure, missing components (e.g. caching, message brokers, load balancing, background worker queues, alert dispatchers), and suggest infrastructure additions to make it production-ready.`
    },
    redundant: {
        title: "Find Redundant Systems",
        desc: "Check for duplicate responsibilities or unnecessary services.",
        prompt: (context) => `You are a Principal Software Architect. Review the following architecture context:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Analyze the components for design redundancies, duplicate data stores, overlapping roles, or unnecessary intermediate endpoints. Recommend consolidation pathways.`
    },
    security: {
        title: "Find Security Risks",
        desc: "Audit trust boundaries, encryption pathways, and vector entry points.",
        prompt: (context) => `You are an Application Security Architect. Audit the security posture of the system based on this architecture and the flow log:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Review the Trust Boundary, data flow pathways, and any payload encryption flows. Highlight vectors for potential replay attacks, man-in-the-middle attacks, key leakage, and suggest mitigations (e.g. double encryption, rate limiting, device fingerprinting checks).`
    },
    api: {
        title: "Generate API Design",
        desc: "Create REST or gRPC contracts for the communication paths.",
        prompt: (context) => `You are a Lead Backend Engineer. Design the APIs connecting these nodes based on the following context:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Write a clean OpenAPI 3.0 spec (or detailed REST endpoints) in YAML for the interfaces between Entry Points and the Backend Services described in the flows.`
    },
    schema: {
        title: "Generate Database Schema",
        desc: "Create PostgreSQL or schema definitions for the product identity data model.",
        prompt: (context) => `You are a Principal Database Administrator. Design the database schema based on this model:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Generate SQL DDL (PostgreSQL) creating tables, constraints, indexes, and primary/foreign keys for the Database node, capturing the core tables, state log history, and schemas.`
    },
    sequence: {
        title: "Generate Sequence Diagram",
        desc: "Create a Mermaid.js sequence diagram of the active flow.",
        prompt: (context) => `You are a Technical Writer. Convert the following architecture context and recorded execution log into a Mermaid.js sequence diagram:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Generate a valid Mermaid.js sequence diagram syntax showing the interactions between the nodes during the flows.`
    },
    documentation: {
        title: "Generate Technical Documentation",
        desc: "Write detailed system design documentation for engineering teams.",
        prompt: (context) => `You are a Technical Document Engineer. Write system design documentation based on this context:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Produce a structured, comprehensive system design document for the platform including executive summary, system topology, service responsibilities, and request flows.`
    },
    sop: {
        title: "Generate SOPs",
        desc: "Create Standard Operating Procedures for brand manufacturing steps.",
        prompt: (context) => `You are an Operations Manager. Write standard operating procedures based on the architecture context:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Draft a formal SOP detailing:
1. Node setup and registration.
2. Operational checkpoints.
3. Execution verification steps.
Include error-handling guidelines.`
    },
    stories: {
        title: "Generate User Stories",
        desc: "Create Agile user stories for components development.",
        prompt: (context) => `You are a Product Owner. Write Agile User Stories based on this context:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Generate complete User Stories (with 'As a...', 'I want to...', 'So that...' structure) and corresponding Acceptance Criteria for building the core flows.`
    },
    tasks: {
        title: "Generate Engineering Tasks",
        desc: "Create Jira/Github tasks with description and sub-tasks.",
        prompt: (context) => `You are a Scrum Master. Generate engineering subtasks from this architecture:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Provide a list of structured engineering tickets (Jira style) complete with title, description, technical implementation checklist, and test criteria for building the core system interfaces.`
    },
    testcases: {
        title: "Generate Test Cases",
        desc: "Provide QA test specifications for verification logic.",
        prompt: (context) => `You are a Lead QA Engineer. Generate QA test specifications based on this architecture context:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Write detailed test specifications (both happy path and edge/fail cases) for verifying the system components and validating the simulation workflows.`
    }
};
