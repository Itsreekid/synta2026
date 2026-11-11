import { performance } from "node:perf_hooks";
import { analyzeStudentLearning } from "../services/learning-intelligence.js";

const approved = process.argv.includes("--execute");
if (!approved || process.env.LEARNING_GEMINI_SMOKE !== "staging" || process.env.NODE_ENV === "production") {
    console.error("[learning-intelligence-smoke] Refused. Run in a staging-only shell with LEARNING_GEMINI_SMOKE=staging and --execute.");
    process.exitCode = 1;
} else {
    // Exercise the real service with two distinct observations. This adapter
    // never connects to PostgreSQL and never reads a student's data.
    const db = {
        async query() {
            return { rows: ["2", "1"].map(message_id => ({
                message_id,
                concept: "loops",
                kind: "logic",
                fingerprint: "synthetic-" + message_id,
                created_at: new Date().toISOString()
            })) };
        }
    };
    const started = performance.now();
    const result = await analyzeStudentLearning(db, "synthetic-smoke-account");
    console.log(JSON.stringify({
        event: "learning_intelligence_staging_smoke",
        status: result.status,
        itemCount: result.items?.length ?? 0,
        elapsedMs: Math.round(performance.now() - started)
    }));
    if (result.status !== "ready") process.exitCode = 1;
}
