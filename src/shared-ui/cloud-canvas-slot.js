// Public Adobe Exchange stub for cloud-canvas integrations.
// In internal demo builds (`npm run build:demo` / `npm run deploy:demo`), `scripts/with-demo-config.js`
// swaps this file with `internal/ui/cloud-canvas-slot.js` and restores it afterward.

export function useCloudCanvas() {
  return {
    enabled: false,
    syncFromPrefs() {},
    async prepareGeneratePayload() {
      return { outputFormat: 'pdf', extraBody: {} };
    },
    isCloudCanvasDirectResult() {
      return false;
    },
    getToastMessage(_outputFormat, title) {
      return `Contact sheet "${title}" is ready.`;
    },
    getProgressOverride() {
      return null;
    },
    renderTopBarButtons() {
      return null;
    },
    renderInspectorSection() {
      return null;
    },
    renderCompletionCard() {
      return null;
    },
  };
}
