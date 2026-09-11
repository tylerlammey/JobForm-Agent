export type ProgressStage = "idle" | "scanning" | "planning" | "injecting" | "complete" | "error";

export const appState = {
  extractedFields: [] as any[],
  generatedActionsPlan: [] as any[],
  currentJsonPayload: "",
  debugRequestPayload: "No request sent yet. Run \"Autofill Application\".",
  debugResponsePayload: "No response received yet."
};
