export interface AIPromptTemplate {
    shortQuery: string;
    title: string;
    prompt: (context: string) => string;
}

export const AI_PROMPTS: Record<string, AIPromptTemplate> = {
    review: {
        shortQuery: "Review architecture",
        title: "Review Architecture",
        prompt: (context: string) => `You are a Principal Software Architect. Review the following system architecture details:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Provide a critical architectural review of this ecosystem. Identify structural bottlenecks, coupling risks, and verify if the layers (Entry Points, Core Services, Infrastructure) follow clean architecture and service boundaries.`
    },
    missing: {
        shortQuery: "Find missing components",
        title: "Find Missing Components",
        prompt: (context: string) => `You are a Principal Software Architect. Analyze the following system architecture details:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Audit this system design for single points of failure, missing components (e.g. caching, message brokers, load balancing, background worker queues, alert dispatchers), and suggest infrastructure additions to make it production-ready.`
    },
    redundant: {
        shortQuery: "Find redundant systems",
        title: "Find Redundant Systems",
        prompt: (context: string) => `You are a Principal Software Architect. Review the following architecture context:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Analyze the components for design redundancies, duplicate data stores, overlapping roles, or unnecessary intermediate endpoints. Recommend consolidation pathways.`
    },
    security: {
        shortQuery: "Find security risks",
        title: "Find Security Risks",
        prompt: (context: string) => `You are an Application Security Architect. Audit the security posture of the system based on this architecture and the flow log:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Review the Trust Boundary, data flow pathways, and any payload encryption flows. Highlight vectors for potential replay attacks, man-in-the-middle attacks, key leakage, and suggest mitigations (e.g. double encryption, rate limiting, device fingerprinting checks).`
    },
    api: {
        shortQuery: "Generate API design",
        title: "Generate API Design",
        prompt: (context: string) => `You are a Lead Backend Engineer. Design the APIs connecting these nodes based on the following context:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Write a clean OpenAPI 3.0 spec (or detailed REST endpoints) in YAML for the interfaces between Entry Points and the Backend Services described in the flows.`
    },
    schema: {
        shortQuery: "Generate database schema",
        title: "Generate Database Schema",
        prompt: (context: string) => `You are a Principal Database Administrator. Design the database schema based on this model:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Generate SQL DDL (PostgreSQL) creating tables, constraints, indexes, and primary/foreign keys for the Database node, capturing the core tables, state log history, and schemas.`
    },
    sequence: {
        shortQuery: "Generate sequence diagram",
        title: "Generate Sequence Diagram",
        prompt: (context: string) => `You are a Technical Writer. Convert the following architecture context and recorded execution log into a Mermaid.js sequence diagram:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Generate a valid Mermaid.js sequence diagram syntax showing the interactions between the nodes during the flows.`
    },
    documentation: {
        shortQuery: "Generate technical documentation",
        title: "Generate Technical Documentation",
        prompt: (context: string) => `You are a Technical Document Engineer. Write system design documentation based on this context:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Produce a structured, comprehensive system design document for the platform including executive summary, system topology, service responsibilities, and request flows.`
    },
    sop: {
        shortQuery: "Generate SOPs",
        title: "Generate SOPs",
        prompt: (context: string) => `You are an Operations Manager. Write standard operating procedures based on the architecture context:

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
        shortQuery: "Generate user stories",
        title: "Generate User Stories",
        prompt: (context: string) => `You are a Product Owner. Write Agile User Stories based on this context:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Generate complete User Stories (with 'As a...', 'I want to...', 'So that...' structure) and corresponding Acceptance Criteria for building the core flows.`
    },
    tasks: {
        shortQuery: "Generate engineering tasks",
        title: "Generate Engineering Tasks",
        prompt: (context: string) => `You are a Scrum Master. Generate engineering subtasks from this architecture:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Provide a list of structured engineering tickets (Jira style) complete with title, description, technical implementation checklist, and test criteria for building the core system interfaces.`
    },
    testcases: {
        shortQuery: "Generate test cases",
        title: "Generate Test Cases",
        prompt: (context: string) => `You are a Lead QA Engineer. Generate QA test specifications based on this architecture context:

=== ARCHITECTURE CONTEXT ===
${context}

=== TASK ===
Write detailed test specifications (both happy path and edge/fail cases) for verifying the system components and validating the simulation workflows.`
    }
};
