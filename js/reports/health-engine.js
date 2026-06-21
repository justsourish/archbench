import { NODES, CONNECTIONS } from "../../graph.js";

export function generateArchitectureHealthReport(batchLog) {
    if (!batchLog || !batchLog.steps) return null;

    const totalSteps = batchLog.steps.length;
    const totalFlowsCount = batchLog.flowsSimulated.length;

    // 1. Unique Nodes and Connections
    const uniqueNodes = new Set();
    batchLog.steps.forEach(s => {
        const nodeObj = NODES.find(n => n.title === s.node || n.id === s.node);
        if (nodeObj) uniqueNodes.add(nodeObj.title);
        else uniqueNodes.add(s.node);
    });
    const uniqueNodesActivated = uniqueNodes.size;

    let connectionsTraversed = 0;
    const stepsByFlow = {};
    batchLog.steps.forEach(s => {
        if (!stepsByFlow[s.flow]) stepsByFlow[s.flow] = [];
        stepsByFlow[s.flow].push(s);
    });
    Object.values(stepsByFlow).forEach(steps => {
        for (let i = 0; i < steps.length - 1; i++) {
            connectionsTraversed++;
        }
    });

    // 2. Node Counts / Rankings
    const nodeCounts = {};
    const nodeFlowPresence = {};
    NODES.forEach(n => {
        nodeCounts[n.id] = 0;
        nodeFlowPresence[n.id] = new Set();
    });

    batchLog.steps.forEach(s => {
        const nodeObj = NODES.find(n => n.title === s.node || n.id === s.node);
        if (nodeObj) {
            nodeCounts[nodeObj.id]++;
            nodeFlowPresence[nodeObj.id].add(s.flow);
        }
    });

    const ranking = NODES.map(n => ({
        id: n.id,
        title: n.title,
        count: nodeCounts[n.id]
    }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count);

    const topNode = ranking[0] || { title: "N/A", count: 0 };
    const topActive = ranking[0];
    const mostActiveNode = {
        title: topNode.title,
        count: topNode.count
    };

    // 3. Least Active Nodes (count <= 2)
    const leastActiveNodes = NODES.map(n => ({
        title: n.title,
        count: nodeCounts[n.id]
    }))
    .filter(item => item.count <= 2)
    .sort((a, b) => a.count - b.count);

    // 4. Critical Dependencies (presence >= 50% of flows)
    const criticalDeps = [];
    NODES.forEach(n => {
        const presence = nodeFlowPresence[n.id].size;
        const pct = totalFlowsCount > 0 ? Math.round((presence / totalFlowsCount) * 100) : 0;
        if (pct >= 50) {
            criticalDeps.push({
                title: n.title,
                percentage: pct
            });
        }
    });
    criticalDeps.sort((a, b) => b.percentage - a.percentage);

    // 5. Complexity Analysis
    const flowComplexity = [];
    batchLog.flowsSimulated.forEach(flowName => {
        const steps = batchLog.steps.filter(s => s.flow === flowName);
        if (steps.length === 0) return;

        const stepCount = steps.length;
        const uniqueFlowNodes = new Set();
        steps.forEach(s => {
            const nodeObj = NODES.find(n => n.title === s.node || n.id === s.node);
            if (nodeObj) uniqueFlowNodes.add(nodeObj.id);
            else uniqueFlowNodes.add(s.node);
        });
        const nodeCount = uniqueFlowNodes.size;

        const firstNodeObj = NODES.find(n => n.title === steps[0].node || n.id === steps[0].node);
        const initiatingId = firstNodeObj ? firstNodeObj.id : steps[0].node;
        const otherNodes = Array.from(uniqueFlowNodes).filter(n => n !== initiatingId);
        const dependencyCount = otherNodes.length;

        let hasRisk = false;
        let hasFuture = false;
        steps.forEach(s => {
            const actionText = (s.action + " " + s.details).toLowerCase();
            if (/risk|anomaly|threat|counterfeit/.test(actionText)) {
                hasRisk = true;
            }
            const nodeObj = NODES.find(n => n.title === s.node || n.id === s.node);
            if (nodeObj && (nodeObj.id === "future" || nodeObj.category === "Future")) {
                hasFuture = true;
            }
        });

        let complexity = "Simple";
        if (hasFuture || (stepCount >= 5 && hasRisk)) {
            complexity = "Complex";
        } else if (stepCount >= 5 || nodeCount >= 4) {
            complexity = "Moderate";
        }

        flowComplexity.push({
            flow: flowName,
            stepCount: stepCount,
            nodeCount: nodeCount,
            dependencyCount: dependencyCount,
            complexity: complexity
        });
    });

    // 6. Trust Boundary
    const secureNodes = ["backend", "database", "analytics"];
    let boundaryEntries = 0;
    let boundaryExits = 0;
    let flowsCrossingBoundary = 0;

    Object.values(stepsByFlow).forEach(steps => {
        let crossed = false;
        for (let i = 0; i < steps.length; i++) {
            const nodeObj = NODES.find(n => n.title === steps[i].node || n.id === steps[i].node);
            const nodeId = nodeObj ? nodeObj.id : steps[i].node;
            const isSecure = secureNodes.includes(nodeId);

            if (isSecure) crossed = true;

            if (i > 0) {
                const prevNodeObj = NODES.find(n => n.title === steps[i-1].node || n.id === steps[i-1].node);
                const prevNodeId = prevNodeObj ? prevNodeObj.id : steps[i-1].node;
                const prevSecure = secureNodes.includes(prevNodeId);

                if (!prevSecure && isSecure) boundaryEntries++;
                else if (prevSecure && !isSecure) boundaryExits++;
            }
        }
        if (crossed) flowsCrossingBoundary++;
    });

    const trustBoundary = {
        boundaryEntries,
        boundaryExits,
        flowsCrossingBoundary
    };

    // 7. Database Impact
    let dbReads = 0;
    let dbWrites = 0;
    let dbTouchCount = 0;
    const dbFlowMap = {};
    batchLog.flowsSimulated.forEach(f => {
        dbFlowMap[f] = 0;
    });

    batchLog.steps.forEach(s => {
        const nodeObj = NODES.find(n => n.title === s.node || n.id === s.node);
        const nodeId = nodeObj ? nodeObj.id : s.node;

        if (nodeId === "database") {
            dbTouchCount++;
            dbFlowMap[s.flow] = (dbFlowMap[s.flow] || 0) + 1;

            const actionText = (s.action + " " + s.details).toLowerCase();
            const isWrite = /write|save|update|create|persist|register|store|assign|record/.test(actionText);
            if (isWrite) dbWrites++;
            else dbReads++;
        }
    });

    const dbFlowActivity = Object.entries(dbFlowMap).map(([flow, count]) => ({
        flow: flow,
        count: count
    })).sort((a, b) => b.count - a.count);

    const databaseImpact = {
        dbTouchCount,
        dbReads,
        dbWrites,
        dbFlowActivity
    };

    // 8. Analytics Coverage
    let flowsFeedingAnalytics = 0;
    const bypassingFlows = [];

    batchLog.flowsSimulated.forEach(flowName => {
        const steps = batchLog.steps.filter(s => s.flow === flowName);
        const hasAnalytics = steps.some(s => {
            const nodeObj = NODES.find(n => n.title === s.node || n.id === s.node);
            return nodeObj && nodeObj.id === "analytics";
        });

        if (hasAnalytics) flowsFeedingAnalytics++;
        else bypassingFlows.push(flowName);
    });

    const analyticsCoverage = {
        flowsFeedingAnalytics,
        bypassingFlows
    };

    // 9. Metric-driven observations
    const observations = [];
    if (topActive && topActive.count > 0.20 * totalSteps) {
        observations.push(`${topActive.title} is the primary orchestration hub, managing ${topActive.count} system activations.`);
    }
    const dbPresence = nodeFlowPresence["database"];
    const dbPercentage = dbPresence ? Math.round((dbPresence.size / totalFlowsCount) * 100) : 0;
    if (dbPercentage >= 80) {
        observations.push("Database is a critical platform dependency and potential scaling bottleneck, appearing in " + dbPercentage + "% of workflows.");
    }
    const analyticsPercentage = totalFlowsCount > 0 ? Math.round((flowsFeedingAnalytics / totalFlowsCount) * 100) : 0;
    if (analyticsPercentage >= 50) {
        observations.push("Analytics Engine receives event telemetry from " + analyticsPercentage + "% of ecosystem flows, ensuring good behavioral logging.");
    } else {
        observations.push("Analytics Engine receives telemetry from only " + analyticsPercentage + "% of flows, leaving telemetry coverage gaps.");
    }
    if (batchLog.flowsSimulated.includes("Consumer Verification")) {
        observations.push("Consumer Verification is the primary user-facing scenario and critical business execution path.");
    }
    if (dbTouchCount > 0) {
        observations.push("Product Identity Registry functions logically as a centralized database data model rather than a runtime service.");
    }

    // 10. Warning Risk Badges
    const risks = [];
    NODES.forEach(n => {
        const presence = nodeFlowPresence[n.id] ? nodeFlowPresence[n.id].size : 0;
        if (presence === totalFlowsCount && totalFlowsCount > 1 && (n.id === "backend" || n.id === "database")) {
            risks.push({
                title: "Single Point of Failure",
                severity: "critical",
                desc: n.title + " is activated in 100% of flows. If this node fails, the entire verification infrastructure will go down."
            });
        }
    });

    NODES.forEach(n => {
        const count = nodeCounts[n.id] || 0;
        if (totalSteps > 0 && (count / totalSteps) > 0.30) {
            risks.push({
                title: "Overloaded Node",
                severity: "critical",
                desc: n.title + " processes " + count + " activations (" + Math.round(count / totalSteps * 100) + "% of total steps), indicating potential scalability bottlenecks."
            });
        }
    });

    NODES.forEach(n => {
        const count = nodeCounts[n.id] || 0;
        if (count === 0) {
            risks.push({
                title: "Unused Component",
                severity: "warning",
                desc: n.title + " was not activated during any flow execution in this batch simulation."
            });
        }
    });

    const traversedConns = new Set();
    Object.values(stepsByFlow).forEach(steps => {
        for (let i = 0; i < steps.length - 1; i++) {
            const fromObj = NODES.find(n => n.title === steps[i].node || n.id === steps[i].node);
            const toObj = NODES.find(n => n.title === steps[i+1].node || n.id === steps[i+1].node);
            if (fromObj && toObj) {
                traversedConns.add(fromObj.id + "->" + toObj.id);
            }
        }
    });

    CONNECTIONS.forEach(([from, to, label, type]) => {
        if (type !== "future") {
            const key = from + "->" + to;
            if (!traversedConns.has(key)) {
                const fromNode = NODES.find(n => n.id === from);
                const toNode = NODES.find(n => n.id === to);
                if (fromNode && toNode) {
                    risks.push({
                        title: "Unused Connection",
                        severity: "warning",
                        desc: "Connection \"" + label + "\" from " + fromNode.title + " to " + toNode.title + " was never traversed."
                    });
                }
            }
        }
    });

    NODES.forEach(n => {
        // Count unique interactors
        const interactors = new Set();
        Object.values(stepsByFlow).forEach(steps => {
            for (let i = 0; i < steps.length; i++) {
                const nodeObj = NODES.find(node => node.title === steps[i].node || node.id === steps[i].node);
                if (nodeObj && nodeObj.id === n.id) {
                    if (i > 0) {
                        const prevObj = NODES.find(node => node.title === steps[i-1].node || node.id === steps[i-1].node);
                        if (prevObj && prevObj.id !== n.id) interactors.add(prevObj.id);
                    }
                    if (i < steps.length - 1) {
                        const nextObj = NODES.find(node => node.title === steps[i+1].node || node.id === steps[i+1].node);
                        if (nextObj && nextObj.id !== n.id) interactors.add(nextObj.id);
                    }
                }
            }
        });
        if (interactors.size >= 4) {
            risks.push({
                title: "High Coupling",
                severity: "warning",
                desc: n.title + " is coupled directly to " + interactors.size + " other nodes, complicating standalone modification."
            });
        }
    });

    if (dbTouchCount > 0 && (dbTouchCount / totalSteps) >= 0.25) {
        risks.push({
            title: "Excessive Database Dependence",
            severity: "warning",
            desc: "Database is engaged in " + dbTouchCount + " steps (" + Math.round(dbTouchCount / totalSteps * 100) + "% of simulation). Excessive state reliance can lead to data locks."
        });
    }

    return {
        summary: {
            flowsExecuted: totalFlowsCount,
            totalSteps: totalSteps,
            uniqueNodesActivated: uniqueNodesActivated,
            connectionsTraversed: connectionsTraversed,
            timestamp: batchLog.timestamp,
            version: batchLog.version || "1.0"
        },
        mostActiveNode,
        ranking,
        leastActiveNodes,
        criticalDeps,
        flowComplexity,
        trustBoundary,
        databaseImpact,
        analyticsCoverage,
        observations,
        risks
    };
}
