export function calculateArchitectureQualityScore(report) {
    if (!report) return 100;
    let score = 100;

    const unusedComponents = report.leastActiveNodes.filter(n => n.count === 0);
    score -= unusedComponents.length * 5;

    const unusedConnections = report.risks.filter(r => r.title === "Unused Connection");
    score -= unusedConnections.length * 3;

    const spofs = report.risks.filter(r => r.title === "Single Point of Failure");
    score -= spofs.length * 15;

    const highCoupled = report.risks.filter(r => r.title === "High Coupling");
    score -= highCoupled.length * 8;

    const excessiveDb = report.risks.some(r => r.title === "Excessive Database Dependence");
    if (excessiveDb) {
        score -= 10;
    }

    const analyticsPct = report.summary.flowsExecuted > 0 ? (report.analyticsCoverage.flowsFeedingAnalytics / report.summary.flowsExecuted) : 0;
    score += Math.round(analyticsPct * 15);

    const topNodePct = report.summary.totalSteps > 0 ? (report.mostActiveNode.count / report.summary.totalSteps) : 0;
    if (topNodePct < 0.30) {
        score += 10;
    }

    const simpleOrModerateCount = report.flowComplexity.filter(f => f.complexity === "Simple" || f.complexity === "Moderate").length;
    const complexityRatio = report.summary.flowsExecuted > 0 ? (simpleOrModerateCount / report.summary.flowsExecuted) : 0;
    if (complexityRatio >= 0.50) {
        score += 10;
    }

    return Math.max(0, Math.min(100, score));
}

export function calculateDatabaseDependencyScore(report) {
    if (!report || !report.summary || report.summary.totalSteps === 0) return 0;
    return Math.round((report.databaseImpact.dbTouchCount / report.summary.totalSteps) * 100);
}
