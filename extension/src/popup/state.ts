export type ProgressStage = "idle" | "scanning" | "planning" | "injecting" | "complete" | "error";

// Mutable state shared across popup features: autofill writes it, persistence
// reads/writes all of it, the debug console reads from it.
export const appState = {
  extractedFields: [] as any[],
  generatedActionsPlan: [] as any[],
  currentJsonPayload: "",
  debugRequestPayload: "No request sent yet. Run \"Autofill Application\".",
  debugResponsePayload: "No response received yet."
};
