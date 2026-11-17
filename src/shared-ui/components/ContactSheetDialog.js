// Shared Contact Sheet Modal UI used by both Assets View (`aem/assets/assetsview/1`)
// and Content Hub (`aem/assets/contenthub/1`) UI extensions.
// Built with Adobe Spectrum 2 / AEM Assets View design tokens and responsive viewport scaling.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDefaultConfig,
  formatBytes,
  getSortableFields,
  paginate,
  renderHtml,
} from '../../../packages/core/index.js';

const SPECTRUM_CSS = `
:root {
  --s2-bg-base: #f8f8f8;
  --s2-bg-layer-1: #ffffff;
  --s2-bg-layer-2: #f3f3f3;
  --s2-bg-canvas: #eef0f3;
  --s2-border-subtle: #e6e6e6;
  --s2-border: #d5d5d5;
  --s2-border-strong: #b1b1b1;
  --s2-text-primary: #222222;
  --s2-text-secondary: #505050;
  --s2-text-muted: #717171;
  --s2-accent: #0265dc;
  --s2-accent-hover: #0054b6;
  --s2-accent-subtle: #e5f0fe;
  --s2-purple: #6e3ff3;
  --s2-purple-hover: #5a2de0;
  --s2-positive: #05834e;
  --s2-positive-subtle: #e3fcef;
  --s2-warning: #cb6f10;
  --s2-warning-subtle: #fff5eb;
  --s2-danger: #d73220;
  --s2-danger-subtle: #ffebe7;
  --s2-radius-sm: 6px;
  --s2-radius-md: 8px;
  --s2-radius-lg: 10px;
  --s2-radius-pill: 9999px;
  --s2-font: "Adobe Clean", "Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font-family: var(--s2-font);
  color: var(--s2-text-primary);
  background: var(--s2-bg-base);
  -webkit-font-smoothing: antialiased;
}
.s2-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--s2-bg-base);
}
.s2-topbar {
  height: 56px;
  background: var(--s2-bg-layer-1);
  border-bottom: 1px solid var(--s2-border-subtle);
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  z-index: 10;
}
.s2-topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.s2-brand-badge {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--s2-accent-subtle);
  color: var(--s2-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.s2-title-group {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.s2-app-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--s2-text-primary);
  white-space: nowrap;
}
.s2-source-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--s2-text-secondary);
  background: var(--s2-bg-layer-2);
  padding: 3px 10px;
  border-radius: var(--s2-radius-pill);
  max-width: 380px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s2-count-badge {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--s2-accent);
  background: var(--s2-accent-subtle);
  padding: 2px 8px;
  border-radius: var(--s2-radius-pill);
  white-space: nowrap;
}
.s2-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.s2-divider-v {
  width: 1px;
  height: 22px;
  background: var(--s2-border-subtle);
  margin: 0 4px;
}
.s2-btn {
  height: 32px;
  padding: 0 14px;
  border-radius: var(--s2-radius-pill);
  font-family: var(--s2-font);
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
  border: 1.5px solid var(--s2-border);
  background: var(--s2-bg-layer-1);
  color: var(--s2-text-primary);
  white-space: nowrap;
  text-decoration: none;
}
.s2-btn:hover:not(:disabled) {
  background: var(--s2-bg-layer-2);
  border-color: var(--s2-border-strong);
}
.s2-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.s2-btn-quiet {
  border-color: transparent;
  background: transparent;
  color: var(--s2-text-secondary);
}
.s2-btn-quiet:hover:not(:disabled) {
  background: var(--s2-bg-layer-2);
  border-color: transparent;
  color: var(--s2-text-primary);
}
.s2-btn-accent {
  background: var(--s2-accent);
  border-color: var(--s2-accent);
  color: #ffffff;
}
.s2-btn-accent:hover:not(:disabled) {
  background: var(--s2-accent-hover);
  border-color: var(--s2-accent-hover);
}
.s2-btn-boards {
  background: var(--s2-purple);
  border-color: var(--s2-purple);
  color: #ffffff;
}
.s2-btn-boards:hover:not(:disabled) {
  background: var(--s2-purple-hover);
  border-color: var(--s2-purple-hover);
}
.s2-btn-sm {
  height: 28px;
  padding: 0 11px;
  font-size: 12px;
}
.s2-workspace {
  flex: 1;
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  min-height: 0;
  width: 100%;
  overflow: hidden;
}
.s2-sidebar {
  width: 360px;
  background: var(--s2-bg-layer-1);
  border-right: 1px solid var(--s2-border-subtle);
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}
.s2-section {
  padding: 16px 18px;
  border-bottom: 1px solid var(--s2-border-subtle);
}
.s2-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.s2-section-title {
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--s2-text-secondary);
  margin: 0;
}
.s2-field {
  margin-bottom: 10px;
}
.s2-field:last-child {
  margin-bottom: 0;
}
.s2-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--s2-text-secondary);
  margin-bottom: 4px;
}
.s2-input, .s2-select {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: var(--s2-radius-sm);
  border: 1px solid var(--s2-border);
  background: var(--s2-bg-layer-1);
  font-family: var(--s2-font);
  font-size: 13px;
  color: var(--s2-text-primary);
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.s2-input:focus, .s2-select:focus {
  border-color: var(--s2-accent);
  box-shadow: 0 0 0 2px rgba(2, 101, 220, 0.18);
}
.s2-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.s2-grid-sort {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px;
  gap: 8px;
  align-items: end;
}
.s2-chip-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.s2-chip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 74px 58px 24px;
  gap: 6px;
  align-items: center;
  background: var(--s2-bg-base);
  border: 1px solid var(--s2-border-subtle);
  border-radius: var(--s2-radius-sm);
  padding: 5px 8px;
  font-size: 12.5px;
}
.s2-chip-title {
  font-weight: 600;
  color: var(--s2-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s2-chip-select {
  height: 24px;
  padding: 0 4px;
  font-size: 11.5px;
  border-radius: 4px;
  border: 1px solid var(--s2-border);
  background: #ffffff;
}
.s2-chip-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--s2-text-secondary);
  cursor: pointer;
  user-select: none;
}
.s2-chip-remove {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--s2-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}
.s2-chip-remove:hover {
  background: var(--s2-danger-subtle);
  color: var(--s2-danger);
}
.s2-asset-selector-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--s2-bg-base);
  border: 1px solid var(--s2-border-subtle);
  border-radius: var(--s2-radius-sm);
  padding: 6px 10px;
  font-size: 12.5px;
}
.s2-asset-selector-path {
  color: var(--s2-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
}
.s2-checkbox-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
}
.s2-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--s2-text-primary);
  cursor: pointer;
  user-select: none;
}
.s2-preview-stage {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--s2-bg-canvas);
  position: relative;
}
.s2-preview-bar {
  height: 44px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--s2-border-subtle);
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12.5px;
  color: var(--s2-text-secondary);
  flex-shrink: 0;
}
.s2-preview-stats {
  display: flex;
  align-items: center;
  gap: 10px;
}
.s2-stat-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--s2-border-strong);
}
.s2-zoom-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.s2-zoom-pill {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--s2-radius-pill);
  border: 1px solid var(--s2-border);
  background: var(--s2-bg-layer-1);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--s2-text-secondary);
  cursor: pointer;
}
.s2-zoom-pill.active {
  background: var(--s2-accent-subtle);
  border-color: var(--s2-accent);
  color: var(--s2-accent);
}
.s2-preview-viewport {
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
}
.s2-preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: transparent;
}
.s2-state-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: var(--s2-bg-canvas);
}
.s2-state-card {
  width: 100%;
  max-width: 520px;
  background: var(--s2-bg-layer-1);
  border: 1px solid var(--s2-border-subtle);
  border-radius: var(--s2-radius-lg);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
  padding: 28px 32px;
}
.s2-progress-track {
  width: 100%;
  height: 6px;
  background: var(--s2-bg-layer-2);
  border-radius: 999px;
  overflow: hidden;
  margin: 14px 0;
}
.s2-progress-fill {
  height: 100%;
  background: var(--s2-accent);
  border-radius: 999px;
  transition: width 250ms ease;
}
.s2-banner-warn {
  margin: 12px 18px 0;
  padding: 10px 12px;
  background: var(--s2-warning-subtle);
  border: 1px solid #f5c490;
  border-radius: var(--s2-radius-sm);
  font-size: 12px;
  color: #8a4600;
}
.s2-picker-drawer {
  margin: 12px 18px;
  padding: 12px;
  background: var(--s2-bg-layer-1);
  border: 1.5px solid var(--s2-accent);
  border-radius: var(--s2-radius-md);
  box-shadow: 0 6px 20px rgba(2, 101, 220, 0.10);
}
.s2-picker-list {
  list-style: none;
  margin: 8px 0;
  padding: 4px;
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid var(--s2-border-subtle);
  border-radius: var(--s2-radius-sm);
  background: var(--s2-bg-base);
}
.s2-picker-item {
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-family: var(--s2-font);
  font-size: 12.5px;
  color: var(--s2-text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}
.s2-picker-item:hover {
  background: var(--s2-accent-subtle);
  color: var(--s2-accent);
}
`;

export default function ContactSheetDialog({
  guestConnection,
  source,
  tier = 'author',
  actionBaseUrl = '',
}) {
  const [authCtx, setAuthCtx] = useState(null);
  const [phase, setPhase] = useState('resolving'); // 'resolving' | 'configure' | 'generating' | 'done' | 'error'
  const [activeOutputFormat, setActiveOutputFormat] = useState('pdf');
  const [resolveProgress, setResolveProgress] = useState({ done: 0, total: 0 });
  const [generateJob, setGenerateJob] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [model, setModel] = useState(null);
  const [modelFileKey, setModelFileKey] = useState(null);
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [pickerMode, setPickerMode] = useState(null); // null | 'folder' | 'logo'
  const [pickerPath, setPickerPath] = useState('/content/dam');
  const [pickerListing, setPickerListing] = useState({ folders: [], images: [] });
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [logoSearchQuery, setLogoSearchQuery] = useState('');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [clusterProfiles, setClusterProfiles] = useState([]);
  const [boardsAccountMode, setBoardsAccountMode] = useState('current'); // 'current' | 'cluster:<userId>' | 'custom'
  const [customBoardsToken, setCustomBoardsToken] = useState('');
  const [boardsShareEmail, setBoardsShareEmail] = useState('');

  const [config, setConfig] = useState(() => createDefaultConfig());
  const [addFieldKey, setAddFieldKey] = useState('');
  const [zoomMode, setZoomMode] = useState('fit'); // 'fit' | '0.75' | '1'
  const [readyDownloadUrl, setReadyDownloadUrl] = useState(null);
  const [checkingDownload, setCheckingDownload] = useState(false);
  const [thumbDataUrls, setThumbDataUrls] = useState({});
  const iframeRef = useRef(null);

  // For assets that do not have a pre-signed `thumbnailUrl` (including unapproved/rejected Author assets and Delivery assets),
  // resolve thumbnails via Delivery Dynamic Media (for approved/published assets) and Author `/browse?mode=thumbnails` (for unapproved/rejected assets).
  useEffect(() => {
    if (!model?.assets?.length || !authCtx?.accessToken) return;
    const missing = model.assets.filter((a) => !a.thumbnailUrl && !thumbDataUrls[a.id]);
    if (missing.length === 0) return;

    let cancelled = false;
    const deliveryBase = (model.deliveryHost || 'https://delivery-p59602-e520244.adobeaemcloud.com').replace(/\/+$/, '');

    (async () => {
      const batch = missing.slice(0, 80);
      const needAuthorFallback = [];
      let idx = 0;

      async function worker() {
        while (idx < batch.length && !cancelled) {
          const asset = batch[idx++];
          const seo = (asset.name || 'image').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-') || 'image';
          let resolvedOnDelivery = false;
          if (tier === 'delivery' || asset.approved || asset.published) {
            try {
              const res = await fetch(
                `${deliveryBase}/adobe/assets/${encodeURIComponent(asset.id)}/as/${seo}.jpg?width=350&quality=75`,
                {
                  headers: {
                    Authorization: `Bearer ${authCtx.accessToken}`,
                    'x-api-key': authCtx.apiKey || 'aem-assets-frontend-1',
                    'x-gw-ims-org-id': authCtx.imsOrg || '',
                  },
                }
              );
              if (res.ok && !cancelled) {
                const blob = await res.blob();
                const objUrl = URL.createObjectURL(blob);
                setThumbDataUrls((prev) => ({ ...prev, [asset.id]: objUrl }));
                resolvedOnDelivery = true;
              }
            } catch {
              // fall through to Author fallback
            }
          }
          if (!resolvedOnDelivery) {
            needAuthorFallback.push(asset.id);
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(6, batch.length) }, () => worker()));

      // Fetch Author static rendition thumbnails in batches of 8 for any unapproved/rejected assets
      for (let i = 0; i < needAuthorFallback.length && !cancelled; i += 8) {
        const chunkIds = needAuthorFallback.slice(i, i + 8);
        try {
          const data = await callAction('browse', {
            method: 'GET',
            query: { mode: 'thumbnails', assetIds: chunkIds.join(',') },
          });
          if (!cancelled && data?.thumbnails && Object.keys(data.thumbnails).length > 0) {
            setThumbDataUrls((prev) => ({ ...prev, ...data.thumbnails }));
          }
        } catch {
          // ignore chunk failure
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [model, authCtx]);

  // Sync zoom mode into the preview iframe whenever zoomMode or previewHtml changes
  function applyIframeZoom(z = zoomMode) {
    try {
      const win = iframeRef.current?.contentWindow;
      if (win && typeof win.__setCsZoom === 'function') {
        win.__setCsZoom(z);
      }
    } catch {
      // ignore cross-origin if any
    }
  }

  function b64ToUint8Array(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      arr[i] = bin.charCodeAt(i);
    }
    return arr;
  }

  // Resolve a verified PDF download URL immediately (via inlinePdfBase64, State chunks, or AEM pre-signed URL)
  useEffect(() => {
    if (phase !== 'done') {
      setReadyDownloadUrl(null);
      setCheckingDownload(false);
      return;
    }
    const r = generateJob?.result || {};
    if (r.outputFormat === 'boards' || r.boardUrl) {
      setCheckingDownload(false);
      return;
    }

    let cancelled = false;
    let createdBlobUrl = null;

    // 1. Instant 0.0-second download when `inlinePdfBase64` is returned directly from `/generate`
    if (generateJob?.inlinePdfBase64) {
      try {
        const bytes = b64ToUint8Array(generateJob.inlinePdfBase64);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        createdBlobUrl = URL.createObjectURL(blob);
        setReadyDownloadUrl(createdBlobUrl);
        setCheckingDownload(false);
        return () => {
          if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
        };
      } catch {
        // fall through
      }
    }

    if (r.downloadUrl && (r.downloadUrl.startsWith('https://') || r.downloadUrl.startsWith('data:application/pdf'))) {
      setReadyDownloadUrl(r.downloadUrl);
      setCheckingDownload(false);
      return;
    }
    if (!r.aemAssetId && !r.pdfChunkCount) {
      setCheckingDownload(false);
      return;
    }

    setCheckingDownload(true);
    (async () => {
      const aemBase = (authCtx?.aemHost || 'https://author-p59602-e520244.adobeaemcloud.com').replace(/\/+$/, '');
      const fileName = r.fileName || 'contact-sheet.pdf';

      for (let attempt = 0; attempt < 60 && !cancelled; attempt++) {
        // 2. Server-side range/slice download from `/adobe/assets/{id}/original/as/{fileName}` via `/status`
        // Works immediately after `completeUpload` with `x-api-key: aem-assets-frontend-1`, zero CORS, and under 1 MB per slice!
        if (r.aemAssetId) {
          try {
            const sliceSize = 480_000;
            const totalBytes = Number(r.bytes) || 0;
            const numSlices = totalBytes > 0 ? Math.ceil(totalBytes / sliceSize) : 1;
            const sliceResponses = await Promise.all(
              Array.from({ length: numSlices }, (_, idx) =>
                callAction('status', {
                  method: 'GET',
                  query: {
                    downloadAssetId: r.aemAssetId,
                    fileName,
                    aemHost: aemBase,
                    sliceIndex: idx,
                    sliceSize,
                  },
                })
              )
            );
            if (!cancelled && sliceResponses.every((s) => s?.sliceBase64 !== undefined)) {
              const parts = sliceResponses.map((s) => b64ToUint8Array(s.sliceBase64));
              const blob = new Blob(parts, { type: 'application/pdf' });
              if (blob.size > 500) {
                createdBlobUrl = URL.createObjectURL(blob);
                setReadyDownloadUrl(createdBlobUrl);
                setCheckingDownload(false);
                return;
              }
            }
          } catch {
            // Fall through and retry on next tick
          }
        }

        // 3. Check `/status?downloadAssetId=...` for a pre-signed https:// blob URL
        try {
          const check = await callAction('status', {
            method: 'GET',
            query: {
              downloadAssetId: r.aemAssetId,
              fileName,
              aemHost: aemBase,
            },
          });
          if (check?.ready && check?.downloadUrl?.startsWith('https://')) {
            if (!cancelled) {
              setReadyDownloadUrl(check.downloadUrl);
              setCheckingDownload(false);
            }
            return;
          }
        } catch {
          // keep polling
        }

        // 2. Also try fetching `/adobe/assets/{id}/original/as/{fileName}` directly with the user's Bearer token
        if (authCtx?.accessToken) {
          for (const endpoint of [
            `${aemBase}/adobe/assets/${encodeURIComponent(r.aemAssetId)}/original/as/${encodeURIComponent(fileName)}`,
            `${aemBase}/adobe/assets/${encodeURIComponent(r.aemAssetId)}/renditions/original/as/${encodeURIComponent(fileName)}`,
          ]) {
            try {
              const origRes = await fetch(endpoint, {
                headers: {
                  Authorization: `Bearer ${authCtx.accessToken}`,
                  'x-api-key': authCtx.apiKey || 'aem-assets-frontend-1',
                  'x-gw-ims-org-id': authCtx.imsOrg || '',
                },
              });
              if (origRes.ok && !cancelled) {
                const blob = await origRes.blob();
                if (blob.size > 500 && !cancelled) {
                  createdBlobUrl = URL.createObjectURL(blob);
                  setReadyDownloadUrl(createdBlobUrl);
                  setCheckingDownload(false);
                  return;
                }
              }
            } catch {
              // try next
            }
          }
        }

        await new Promise((res) => setTimeout(res, 1500));
      }
    })();

    return () => {
      cancelled = true;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [phase, generateJob]);

  async function callAction(name, { method = 'POST', query = null, body = null } = {}, ctx = authCtx) {
    let base = (actionBaseUrl || '').replace(/\/+$/, '');
    if (!base || base.startsWith('/')) {
      const m = window.location.hostname.match(/^([a-z0-9-]+)\.adobeio-static\.net$/i);
      const ns = m ? m[1] : '767251-547dimsquid';
      base = `https://${ns}.adobeioruntime.net/api/v1/web/contactsheet`;
    }
    const url = new URL(`${base}/${name}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    if (method === 'GET' && ctx?.userId && !url.searchParams.has('userId')) {
      url.searchParams.set('userId', ctx.userId);
    }
    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${ctx?.accessToken || ''}`,
        'x-gw-ims-org-id': ctx?.imsOrg || '',
        'x-api-key': ctx?.apiKey || 'aem-assets-frontend-1',
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify({ ...body, userId: ctx?.userId, userEmail: ctx?.email }) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `Action ${name} failed (${res.status})`);
    }
    return data;
  }

  // 1. Initialize host auth, load prefs & presets, and kick off resolve job
  useEffect(() => {
    let cancelled = false;
    function callHostWithTimeout(promiseFn, ms = 1200, fallback = null) {
      try {
        const p = Promise.resolve(promiseFn());
        return Promise.race([
          p.catch(() => fallback),
          new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
        ]);
      } catch {
        return Promise.resolve(fallback);
      }
    }
    function parseJwtClaims(token) {
      try {
        const parts = String(token || '').split('.');
        if (parts.length < 2) return {};
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(b64));
      } catch {
        return {};
      }
    }

    (async () => {
      try {
        // Content Hub implements auth.getIMSInfo(), whereas getCurrentUserProfile() and discovery.getAemHost()
        // are Assets View-only and time out after 10s on Content Hub if awaited unconditionally.
        const [ims, apiKey, profile, discoveredHost] = await Promise.all([
          callHostWithTimeout(() => guestConnection?.host?.auth?.getIMSInfo?.(), 3000, {}),
          callHostWithTimeout(() => guestConnection?.host?.auth?.getApiKey?.(), 1200, null),
          tier === 'author'
            ? callHostWithTimeout(() => guestConnection?.host?.auth?.getCurrentUserProfile?.(), 1200, {})
            : Promise.resolve({}),
          tier === 'author'
            ? callHostWithTimeout(() => guestConnection?.host?.discovery?.getAemHost?.(), 1200, null)
            : Promise.resolve(null),
        ]);

        const claims = parseJwtClaims(ims?.accessToken);
        const aemHost = discoveredHost || 'https://author-p59602-e520244.adobeaemcloud.com';

        const ctx = {
          accessToken: ims?.accessToken,
          imsOrg: ims?.imsOrg || claims.org || '4A603BC061E191130A495FEF@AdobeOrg',
          apiKey: apiKey || claims.client_id || 'aem-assets-frontend-1',
          userId: profile?.userId || claims.user_id || claims.sub || profile?.email || 'user',
          email: profile?.email || claims.email || profile?.name || '',
          name: profile?.name || claims.name || profile?.email || '',
          aemHost,
        };
        if (cancelled) return;
        setAuthCtx(ctx);

        const [prefsRes, presetsRes, resolveRes] = await Promise.all([
          callAction('prefs', { method: 'GET' }, ctx).catch(() => null),
          callAction('presets', { method: 'GET' }, ctx).catch(() => ({ presets: [] })),
          callAction('resolve', { method: 'POST', body: { source, tier, aemHost } }, ctx),
        ]);

        const loadedPresets = presetsRes?.presets || [];
        setPresets(loadedPresets);
        const defaultPreset = loadedPresets.find((p) => p.isDefault);

        setConfig((prev) => {
          const base = defaultPreset ? { ...prev, ...defaultPreset.config } : prev;
          return {
            ...base,
            header: {
              ...base.header,
              title: source?.name || source?.path?.split('/').pop() || 'Contact Sheet',
              preparedBy: ctx.name || base.header.preparedBy,
              logo: prefsRes?.lastLogo ?? base.header.logo ?? null,
            },
            output: {
              ...base.output,
              targetFolder:
                prefsRes?.lastOutputFolder?.id && prefsRes?.lastOutputFolder?.path
                  ? prefsRes.lastOutputFolder
                  : source?.kind === 'folder' && source?.path
                    ? { id: source.id || '', path: source.path }
                    : prefsRes?.lastOutputFolder || base.output.targetFolder,
            },
          };
        });

        if (
          (resolveRes.status === 'succeeded' || resolveRes.status === 'succeeded_with_warnings') &&
          resolveRes.model
        ) {
          setModel(resolveRes.model);
          setModelFileKey(resolveRes.result?.modelFileKey || null);
          setPhase('configure');
          return;
        }
        if (resolveRes.status === 'failed') {
          throw new Error(resolveRes.error?.message || 'Failed resolving source assets');
        }

        const jobId = resolveRes.jobId;
        while (!cancelled) {
          await new Promise((r) => setTimeout(r, 900));
          const st = await callAction('status', { method: 'GET', query: { jobId, includeModel: true } }, ctx);
          setResolveProgress(st.progress || { done: 0, total: 0 });
          if (st.status === 'succeeded' || st.status === 'succeeded_with_warnings') {
            let resolvedModel = st.model;
            if (!resolvedModel && st.modelUrl) {
              const mRes = await fetch(st.modelUrl);
              resolvedModel = await mRes.json();
            }
            setModel(resolvedModel);
            setModelFileKey(st.result?.modelFileKey);
            setPhase('configure');
            break;
          }
          if (st.status === 'failed') {
            throw new Error(st.error?.message || 'Failed resolving source assets');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.message || 'Initialization failed');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve a live preview URL whenever `config.header.logo` is set (including when restored from saved user prefs)
  useEffect(() => {
    const logo = config?.header?.logo;
    if (!logo?.assetId) {
      setLogoPreviewUrl(null);
      return;
    }
    if (logo.previewUrl) {
      setLogoPreviewUrl(logo.previewUrl);
      return;
    }
    if (!authCtx?.accessToken) return;

    let cancelled = false;
    (async () => {
      try {
        const parentPath = logo.path?.includes('/')
          ? logo.path.slice(0, logo.path.lastIndexOf('/')) || '/content/dam'
          : '/content/dam';
        const data = await callAction('browse', {
          method: 'GET',
          query: { mode: 'images', path: parentPath },
        });
        const match = (data?.images || []).find((img) => img.assetId === logo.assetId);
        const signed = match?.downloadUrl || match?.thumbnailUrl || null;
        if (signed && !cancelled) {
          setLogoPreviewUrl(signed);
        }
      } catch {
        // non-fatal
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config?.header?.logo, authCtx]);

  const paginated = useMemo(() => {
    if (!model) return null;
    return paginate(model, config);
  }, [model, config]);

  const previewHtml = useMemo(() => {
    if (!paginated || !model) return '';
    return renderHtml(paginated, {
      mode: 'preview',
      model,
      logoUrl: config.header?.logo ? config.header.logo.previewUrl || logoPreviewUrl || null : null,
      imageResolver: (asset) => asset.thumbnailUrl || thumbDataUrls[asset.id] || null,
    });
  }, [paginated, model, thumbDataUrls, config.header?.logo, logoPreviewUrl]);

  const sortableFields = useMemo(() => {
    if (!model) return [];
    return getSortableFields(model.fields, config.fields);
  }, [model, config.fields]);

  const availableToAdd = useMemo(() => {
    if (!model) return [];
    const active = new Set(config.fields.map((f) => f.key));
    return model.fields.filter((f) => !active.has(f.key) && !f.technical);
  }, [model, config.fields]);

  // Discover linked Adobe IMS Orgs / Account Cluster profiles so users whose Creativity & Productivity
  // (Firefly Boards) entitlement is in a different IMS Org than AEM can target that Org directly.
  useEffect(() => {
    if (!authCtx?.accessToken) return;
    setBoardsShareEmail((prev) => prev || authCtx.email || '');
    let cancelled = false;
    (async () => {
      try {
        const [orgsRes, clusterRes] = await Promise.all([
          fetch('https://ims-na1.adobelogin.com/ims/organizations/v6', {
            headers: { Authorization: `Bearer ${authCtx.accessToken}` },
          })
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []),
          fetch('https://ims-na1.adobelogin.com/ims/account_cluster/v2', {
            headers: { Authorization: `Bearer ${authCtx.accessToken}` },
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);
        if (cancelled) return;
        const orgNameById = new Map();
        const orgList = Array.isArray(orgsRes) ? orgsRes : orgsRes?.organizations || [];
        for (const o of orgList) {
          const ident = o?.orgRef?.ident ? `${o.orgRef.ident}@${o.orgRef.authSrc || 'AdobeOrg'}` : o?.orgId;
          if (ident && o?.orgName) orgNameById.set(ident.toLowerCase(), o.orgName);
        }
        const accounts = clusterRes?.data || clusterRes?.accounts || [];
        const mapped = accounts
          .filter((acc) => acc?.userId && acc.userId !== authCtx.userId)
          .map((acc) => {
            const orgId = acc.owningOrgId || '';
            const orgName =
              orgNameById.get(orgId.toLowerCase()) ||
              acc.orgName ||
              acc.displayName ||
              orgId ||
              acc.userId;
            return {
              userId: acc.userId,
              orgId,
              label: `${orgName}${acc.email ? ` (${acc.email})` : ''}`,
            };
          });
        setClusterProfiles(mapped);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authCtx]);

  async function resolveBoardsBearerToken() {
    if (boardsAccountMode === 'custom' && customBoardsToken.trim()) {
      return customBoardsToken.trim().replace(/^Bearer\s+/i, '');
    }
    if (boardsAccountMode.startsWith('cluster:')) {
      const targetUserId = boardsAccountMode.slice('cluster:'.length);
      try {
        const clientId = authCtx?.apiKey || 'aem-assets-frontend-1';
        const form = new URLSearchParams({
          user_id: targetUserId,
          explicit_profile_switch: 'true',
        });
        const res = await fetch(
          `https://ims-na1.adobelogin.com/ims/check/v6/token?client_id=${encodeURIComponent(clientId)}`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.access_token) return data.access_token;
        }
      } catch {
        // fall through to current token
      }
    }
    return null;
  }

  async function handleGenerate(outputFormat = 'pdf') {
    try {
      setActiveOutputFormat(outputFormat);
      setPhase('generating');
      const slimLogo = config.header.logo
        ? {
            assetId: config.header.logo.assetId,
            path: config.header.logo.path,
            tier: config.header.logo.tier,
          }
        : null;
      const slimConfig = {
        ...config,
        header: {
          ...config.header,
          logo: slimLogo,
        },
      };

      callAction('prefs', {
        method: 'PUT',
        body: {
          lastOutputFolder: config.output.targetFolder,
          lastLogo: slimLogo,
        },
      }).catch(() => {});

      const boardsBearerToken = outputFormat === 'boards' ? await resolveBoardsBearerToken() : null;

      const genInit = await callAction('generate', {
        method: 'POST',
        body: {
          modelFileKey,
          model,
          config: slimConfig,
          outputFormat,
          boardsBearerToken,
          boardsShareEmail: outputFormat === 'boards' ? boardsShareEmail.trim() || null : null,
          tier,
          aemHost: authCtx?.aemHost,
        },
      });

      if (genInit.status === 'succeeded' || genInit.status === 'succeeded_with_warnings') {
        setGenerateJob(genInit);
        setPhase('done');
        guestConnection?.host?.toast?.display?.({
          variant: 'positive',
          message:
            outputFormat === 'boards'
              ? `Firefly Board "${config.header.title}" is ready.`
              : `Contact sheet "${config.header.title}" is ready.`,
        });
        return;
      }
      if (genInit.status === 'failed') {
        throw new Error(genInit.error?.message || 'Generation failed');
      }

      const jobId = genInit.jobId || genInit.id;
      if (!jobId) {
        setGenerateJob(genInit);
        setPhase('done');
        return;
      }
      while (true) {
        await new Promise((r) => setTimeout(r, 1200));
        const st = await callAction('status', { method: 'GET', query: { jobId } });
        setGenerateJob(st);
        if (st.status === 'succeeded' || st.status === 'succeeded_with_warnings') {
          setPhase('done');
          guestConnection?.host?.toast?.display?.({
            variant: 'positive',
            message:
              outputFormat === 'boards'
                ? `Firefly Board "${config.header.title}" is ready.`
                : `Contact sheet "${config.header.title}" is ready.`,
          });
          break;
        }
        if (st.status === 'failed') {
          throw new Error(st.error?.message || 'Generation failed');
        }
      }
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  async function handleSavePreset() {
    const name = window.prompt('Preset name:');
    if (!name) return;
    const isDefault = window.confirm('Set as your default preset?');
    const res = await callAction('presets', {
      method: 'PUT',
      body: { preset: { name, isDefault, config } },
    });
    setPresets(res.presets || []);
    setSelectedPresetId(res.preset?.id || '');
  }

  function getDefaultLogoStartPath() {
    if (config.header.logo?.path?.includes('/')) {
      return config.header.logo.path.slice(0, config.header.logo.path.lastIndexOf('/')) || '/content/dam';
    }
    const assetFolder = model?.assets?.[0]?.folderPath || source?.path || '';
    if (assetFolder.startsWith('/content/dam/') && assetFolder.lastIndexOf('/') > '/content/dam'.length) {
      return assetFolder.slice(0, assetFolder.lastIndexOf('/')) || '/content/dam';
    }
    if (assetFolder.startsWith('/content/dam')) {
      return assetFolder;
    }
    return '/content/dam';
  }

  async function openBrowser(mode, startPath = '/content/dam', searchQ = '') {
    setPickerMode(mode);
    setPickerPath(startPath);
    setPickerLoading(true);
    setPickerError('');
    try {
      const data = await callAction('browse', {
        method: 'GET',
        query: {
          mode: mode === 'logo' ? 'images' : 'folders',
          path: startPath,
          q: searchQ ? searchQ.trim() : undefined,
        },
      });
      setPickerListing({ folders: data.folders || [], images: data.images || [] });
    } catch (err) {
      // If startPath wasn't found, fall back to /content/dam
      if (startPath !== '/content/dam') {
        try {
          setPickerPath('/content/dam');
          const fallbackData = await callAction('browse', {
            method: 'GET',
            query: { mode: mode === 'logo' ? 'images' : 'folders', path: '/content/dam' },
          });
          setPickerListing({ folders: fallbackData.folders || [], images: fallbackData.images || [] });
          setPickerLoading(false);
          return;
        } catch {
          // fall through
        }
      }
      setPickerError(err.message || 'Could not browse folder');
    } finally {
      setPickerLoading(false);
    }
  }

  async function handleCreateSubfolder() {
    if (!newFolderName.trim()) return;
    const newPath = `${pickerPath.replace(/\/+$/, '')}/${newFolderName.trim()}`;
    await callAction('browse', {
      method: 'POST',
      body: { mode: 'createFolder', newFolderPath: newPath },
    });
    setNewFolderName('');
    await openBrowser(pickerMode, newPath);
  }

  if (phase === 'resolving') {
    const pct = resolveProgress.total ? Math.round((resolveProgress.done / resolveProgress.total) * 100) : 35;
    return (
      <div className="s2-shell">
        <style>{SPECTRUM_CSS}</style>
        <div className="s2-state-screen">
          <div className="s2-state-card">
            <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Preparing contact sheet</h3>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--s2-text-secondary)' }}>
              {resolveProgress.total
                ? `Reading metadata for ${resolveProgress.done} of ${resolveProgress.total} assets…`
                : 'Inspecting folder contents and discovering metadata schema…'}
            </p>
            <div className="s2-progress-track">
              <div className="s2-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="s2-shell">
        <style>{SPECTRUM_CSS}</style>
        <div className="s2-state-screen">
          <div className="s2-state-card">
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--s2-danger)' }}>
              Could not complete contact sheet
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--s2-text-secondary)', lineHeight: 1.5 }}>
              {errorMsg}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {model && (
                <button className="s2-btn" onClick={() => setPhase('configure')}>
                  Back to settings
                </button>
              )}
              <button className="s2-btn s2-btn-accent" onClick={() => guestConnection?.host?.modal?.closeDialog?.()}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'generating') {
    const p = generateJob?.progress || { done: 0, total: paginated?.totalAssets || 0 };
    const pct = p.total ? Math.max(15, Math.round((p.done / p.total) * 100)) : 45;
    return (
      <div className="s2-shell">
        <style>{SPECTRUM_CSS}</style>
        <div className="s2-state-screen">
          <div className="s2-state-card">
            <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>
              {activeOutputFormat === 'boards'
                ? 'Building Firefly Board…'
                : 'Generating contact sheet PDF…'}
            </h3>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--s2-text-secondary)' }}>
              {activeOutputFormat === 'boards'
                ? `Placing asset cards and metadata lines on canvas (${p.done} / ${p.total || paginated?.totalAssets || 0})…`
                : `Rendering high-resolution pages and uploading to AEM Assets (${p.done} / ${p.total || paginated?.totalAssets || 0})…`}
            </p>
            <div className="s2-progress-track">
              <div
                className="s2-progress-fill"
                style={{
                  width: `${pct}%`,
                  background: activeOutputFormat === 'boards' ? 'var(--s2-purple)' : 'var(--s2-accent)',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <span style={{ fontSize: 12, color: 'var(--s2-text-muted)' }}>
                This job continues in the background if you close the dialog.
              </span>
              <button className="s2-btn s2-btn-sm" onClick={() => guestConnection?.host?.modal?.closeDialog?.()}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const r = generateJob?.result || {};
    const isBoards = r.outputFormat === 'boards' || Boolean(r.boardUrl);
    return (
      <div className="s2-shell">
        <style>{SPECTRUM_CSS}</style>
        <div className="s2-state-screen">
          <div className="s2-state-card">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 999, background: 'var(--s2-positive-subtle)', color: 'var(--s2-positive)', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
              ✓ {isBoards ? 'Firefly Board Created' : 'Saved to AEM Assets'}
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: 19 }}>
              {config.header.title || r.fileName}
            </h3>
            {isBoards ? (
              <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--s2-text-secondary)' }}>
                {r.placedCards ?? r.assets} asset cards with separate editable metadata lines placed on your Firefly Board.
              </p>
            ) : (
              <>
                <p style={{ margin: '0 0 10px', fontSize: 13.5, color: 'var(--s2-text-secondary)' }}>
                  {r.pages} {r.pages === 1 ? 'page' : 'pages'} · {r.assets} assets · {formatBytes(r.bytes)}
                </p>
                {r.aemPath && (
                  <div className="s2-asset-selector-row" style={{ marginBottom: 14 }}>
                    <span className="s2-asset-selector-path" title={r.aemPath}>{r.aemPath}</span>
                  </div>
                )}
              </>
            )}

            {(generateJob?.warnings || []).map((w, i) => (
              <div key={i} className="s2-banner-warn" style={{ margin: '0 0 12px' }}>{w}</div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="s2-btn s2-btn-quiet" onClick={() => setPhase('configure')}>
                Back to editor
              </button>
              {!isBoards && r.aemPath && tier === 'author' && (
                <button
                  className="s2-btn"
                  onClick={async () => {
                    await guestConnection?.host?.modal?.closeDialog?.().catch(() => {});
                    await guestConnection?.host?.router?.navigateToAssetDetails?.({ assetPath: r.aemPath });
                  }}
                >
                  Open in AEM
                </button>
              )}
              {isBoards && r.boardUrl ? (
                <a className="s2-btn s2-btn-boards" href={r.boardUrl} target="_blank" rel="noreferrer">
                  Open in Firefly Boards ↗
                </a>
              ) : readyDownloadUrl ? (
                <a
                  className="s2-btn s2-btn-accent"
                  href={readyDownloadUrl}
                  download={r.fileName || 'contact-sheet.pdf'}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download PDF
                </a>
              ) : !isBoards ? (
                <button className="s2-btn" disabled>
                  Preparing download link…
                </button>
              ) : null}
              <button className="s2-btn" onClick={() => guestConnection?.host?.modal?.closeDialog?.()}>
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const g = paginated?.geometry;

  return (
    <div className="s2-shell">
      <style>{SPECTRUM_CSS}</style>

      {/* Top AEM Action Header */}
      <header className="s2-topbar">
        <div className="s2-topbar-left">
          <div className="s2-brand-badge" title="AEM Assets Contact Sheet">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </div>
          <div className="s2-title-group">
            <span className="s2-app-title">Contact Sheet</span>
            <span className="s2-source-pill" title={model?.sourceLabel}>
              {model?.sourceLabel}
            </span>
            <span className="s2-count-badge">
              {model?.totalFound} {model?.totalFound === 1 ? 'asset' : 'assets'}
            </span>
          </div>
        </div>

        <div className="s2-topbar-actions">
          <select
            className="s2-select"
            style={{ width: 156, height: 32, borderRadius: 999, paddingLeft: 12 }}
            value={selectedPresetId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedPresetId(id);
              const found = presets.find((p) => p.id === id);
              if (found) setConfig((c) => ({ ...c, ...found.config }));
            }}
          >
            <option value="">Preset: Default</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="s2-btn s2-btn-quiet" onClick={handleSavePreset}>
            Save preset
          </button>

          <div className="s2-divider-v" />

          <button
            className="s2-btn"
            onClick={() => {
              const win = iframeRef.current?.contentWindow;
              win?.focus();
              win?.print();
            }}
          >
            Print
          </button>
          <button className="s2-btn s2-btn-boards" onClick={() => handleGenerate('boards')}>
            Send to Firefly Boards
          </button>
          <button className="s2-btn s2-btn-accent" onClick={() => handleGenerate('pdf')}>
            Save PDF to AEM
          </button>
          <button className="s2-btn s2-btn-quiet" onClick={() => guestConnection?.host?.modal?.closeDialog?.()}>
            Cancel
          </button>
        </div>
      </header>

      {/* Main Split Workspace: 360px Left Inspector Rail + Responsive Right Canvas */}
      <div className="s2-workspace">
        <aside className="s2-sidebar">
          {model?.truncated && (
            <div className="s2-banner-warn">
              <strong>{model.totalFound} assets found.</strong> Showing the first {model.maxAssets} after sorting.
            </div>
          )}

          {/* Section 1: Sheet Header */}
          <section className="s2-section">
            <div className="s2-section-header">
              <h4 className="s2-section-title">Sheet Header</h4>
            </div>
            <div className="s2-field">
              <label className="s2-label">Title</label>
              <input
                className="s2-input"
                type="text"
                value={config.header.title}
                onChange={(e) => setConfig({ ...config, header: { ...config.header, title: e.target.value } })}
              />
            </div>
            <div className="s2-grid-2 s2-field">
              <div>
                <label className="s2-label">Date</label>
                <input
                  className="s2-input"
                  type="date"
                  value={config.header.date}
                  onChange={(e) => setConfig({ ...config, header: { ...config.header, date: e.target.value } })}
                />
              </div>
              <div>
                <label className="s2-label">Department</label>
                <input
                  className="s2-input"
                  type="text"
                  placeholder="e.g. Creative"
                  value={config.header.department || ''}
                  onChange={(e) => setConfig({ ...config, header: { ...config.header, department: e.target.value } })}
                />
              </div>
            </div>
            <div className="s2-grid-2 s2-field">
              <div>
                <label className="s2-label">Prepared by</label>
                <input
                  className="s2-input"
                  type="text"
                  value={config.header.preparedBy || ''}
                  onChange={(e) => setConfig({ ...config, header: { ...config.header, preparedBy: e.target.value } })}
                />
              </div>
              <div>
                <label className="s2-label">Project / Shoot</label>
                <input
                  className="s2-input"
                  type="text"
                  placeholder="Optional"
                  value={config.header.project || ''}
                  onChange={(e) => setConfig({ ...config, header: { ...config.header, project: e.target.value } })}
                />
              </div>
            </div>
            <div className="s2-field">
              <label className="s2-label">Brand Logo</label>
              <div className="s2-asset-selector-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {(config.header.logo?.previewUrl || logoPreviewUrl) && (
                    <img
                      src={config.header.logo?.previewUrl || logoPreviewUrl}
                      alt="Logo"
                      style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 3, background: '#fff', border: '1px solid var(--s2-border-subtle)' }}
                    />
                  )}
                  <span className="s2-asset-selector-path" title={config.header.logo?.path || ''}>
                    {config.header.logo?.path?.split('/').pop() || 'No logo selected'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="s2-btn s2-btn-sm"
                    onClick={() => {
                      if (pickerMode === 'logo') {
                        setPickerMode(null);
                      } else {
                        setLogoSearchQuery('');
                        openBrowser('logo', getDefaultLogoStartPath());
                      }
                    }}
                  >
                    {pickerMode === 'logo' ? 'Close' : 'Browse'}
                  </button>
                  {config.header.logo && (
                    <button
                      type="button"
                      className="s2-btn s2-btn-quiet s2-btn-sm"
                      onClick={() => setConfig({ ...config, header: { ...config.header, logo: null } })}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Logo Picker Drawer right underneath Brand Logo */}
              {pickerMode === 'logo' && (
                <div className="s2-picker-drawer" style={{ margin: '8px 0 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ fontSize: 12 }}>Select header logo from AEM</strong>
                    <button type="button" className="s2-btn s2-btn-quiet s2-btn-sm" onClick={() => setPickerMode(null)}>
                      ✕
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      className="s2-input"
                      style={{ height: 28, fontSize: 12 }}
                      type="text"
                      placeholder="Search logo across DAM (e.g. hertz, logo)…"
                      value={logoSearchQuery}
                      onChange={(e) => setLogoSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          openBrowser('logo', pickerPath, logoSearchQuery);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="s2-btn s2-btn-sm"
                      onClick={() => openBrowser('logo', pickerPath, logoSearchQuery)}
                    >
                      Search
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span className="s2-asset-selector-path" title={pickerPath}>{pickerPath}</span>
                    {pickerPath !== '/content/dam' && (
                      <button
                        type="button"
                        className="s2-btn s2-btn-sm"
                        onClick={() => {
                          setLogoSearchQuery('');
                          openBrowser('logo', pickerPath.slice(0, pickerPath.lastIndexOf('/')) || '/content/dam');
                        }}
                      >
                        ↑ Up
                      </button>
                    )}
                  </div>
                  {pickerError && (
                    <div style={{ color: 'var(--s2-danger)', fontSize: 11.5, marginTop: 6 }}>{pickerError}</div>
                  )}
                  <ul className="s2-picker-list">
                    {pickerLoading ? (
                      <li style={{ padding: '10px 8px', fontSize: 12, color: 'var(--s2-text-muted)' }}>
                        Loading folder contents…
                      </li>
                    ) : (
                      <>
                        {pickerListing.folders.map((f) => (
                          <li key={f.path}>
                            <button
                              type="button"
                              className="s2-picker-item"
                              onClick={() => openBrowser('logo', f.path)}
                            >
                              <span>📁</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {f.title}
                              </span>
                            </button>
                          </li>
                        ))}
                        {pickerListing.images.map((img) => (
                          <li key={img.assetId}>
                            <button
                              type="button"
                              className="s2-picker-item"
                              onClick={() => {
                                const previewUrl = img.downloadUrl || img.thumbnailUrl || null;
                                if (previewUrl) setLogoPreviewUrl(previewUrl);
                                setConfig({
                                  ...config,
                                  header: {
                                    ...config.header,
                                    logo: {
                                      assetId: img.assetId,
                                      path: img.path,
                                      tier,
                                      previewUrl,
                                    },
                                  },
                                });
                                setPickerMode(null);
                              }}
                            >
                              {img.thumbnailUrl ? (
                                <img
                                  src={img.thumbnailUrl}
                                  alt=""
                                  style={{
                                    width: 36,
                                    height: 24,
                                    objectFit: 'contain',
                                    borderRadius: 4,
                                    padding: 2,
                                    background: '#ffffff',
                                    border: '1px solid var(--s2-border-subtle)',
                                    flexShrink: 0,
                                  }}
                                />
                              ) : (
                                <span>🖼️</span>
                              )}
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                {img.name}
                              </span>
                            </button>
                          </li>
                        ))}
                        {pickerListing.folders.length === 0 && pickerListing.images.length === 0 && (
                          <li style={{ padding: '10px 8px', fontSize: 12, color: 'var(--s2-text-muted)' }}>
                            No image files in this folder. Click a subfolder or search above.
                          </li>
                        )}
                      </>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* Section 2: Metadata Fields Below Each Thumbnail */}
          <section className="s2-section">
            <div className="s2-section-header">
              <h4 className="s2-section-title">Metadata Captions</h4>
              <span style={{ fontSize: 11, color: 'var(--s2-text-muted)' }}>
                {config.fields.length} selected
              </span>
            </div>
            <div className="s2-chip-list">
              {config.fields.map((f, idx) => (
                <div key={f.key} className="s2-chip">
                  <span className="s2-chip-title" title={f.label}>{f.label}</span>
                  <select
                    className="s2-chip-select"
                    value={f.maxLines}
                    onChange={(e) => {
                      const next = [...config.fields];
                      next[idx] = { ...f, maxLines: Number(e.target.value) };
                      setConfig({ ...config, fields: next });
                    }}
                  >
                    <option value={1}>1 line</option>
                    <option value={2}>2 lines</option>
                    <option value={3}>3 lines</option>
                  </select>
                  <label className="s2-chip-check">
                    <input
                      type="checkbox"
                      checked={Boolean(f.showLabel)}
                      onChange={(e) => {
                        const next = [...config.fields];
                        next[idx] = { ...f, showLabel: e.target.checked };
                        setConfig({ ...config, fields: next });
                      }}
                    />
                    Label
                  </label>
                  <button
                    type="button"
                    className="s2-chip-remove"
                    title="Remove field"
                    onClick={() => setConfig({ ...config, fields: config.fields.filter((_, i) => i !== idx) })}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 68px', gap: 6 }}>
              <select
                className="s2-select"
                value={addFieldKey}
                onChange={(e) => setAddFieldKey(e.target.value)}
              >
                <option value="">Add metadata field…</option>
                {availableToAdd.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label} ({Math.round((f.coverage ?? 1) * 100)}%)
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="s2-btn"
                onClick={() => {
                  const key = addFieldKey || availableToAdd[0]?.key;
                  if (!key) return;
                  const def = model.fields.find((x) => x.key === key);
                  setConfig({
                    ...config,
                    fields: [...config.fields, { key, label: def?.label || key, maxLines: 1, showLabel: true }],
                  });
                  setAddFieldKey('');
                }}
              >
                + Add
              </button>
            </div>
          </section>

          {/* Section 3: Sort & Group */}
          <section className="s2-section">
            <div className="s2-section-header">
              <h4 className="s2-section-title">Sort &amp; Group</h4>
            </div>
            <div className="s2-field">
              <label className="s2-label">Group into sections by</label>
              <select
                className="s2-select"
                value={config.sort.groupBy?.field || ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    sort: {
                      ...config.sort,
                      groupBy: e.target.value ? { field: e.target.value, dir: 'asc', newPagePerGroup: false } : null,
                    },
                  })
                }
              >
                <option value="">None (continuous grid)</option>
                {sortableFields.filter((f) => f.groupable).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}{f.section === 'printed' ? ' •' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="s2-grid-sort s2-field">
              <div>
                <label className="s2-label">Primary sort</label>
                <select
                  className="s2-select"
                  value={config.sort.keys?.[0]?.field || 'repo:name'}
                  onChange={(e) => {
                    const keys = [...(config.sort.keys || [])];
                    keys[0] = { field: e.target.value, dir: keys[0]?.dir || 'asc' };
                    setConfig({ ...config, sort: { ...config.sort, keys } });
                  }}
                >
                  {sortableFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}{f.section === 'printed' ? ' •' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="s2-label">Order</label>
                <select
                  className="s2-select"
                  value={config.sort.keys?.[0]?.dir || 'asc'}
                  onChange={(e) => {
                    const keys = [...(config.sort.keys || [])];
                    keys[0] = { field: keys[0]?.field || 'repo:name', dir: e.target.value };
                    setConfig({ ...config, sort: { ...config.sort, keys } });
                  }}
                >
                  <option value="asc">A → Z</option>
                  <option value="desc">Z → A</option>
                </select>
              </div>
            </div>
            <div className="s2-grid-sort s2-field">
              <div>
                <label className="s2-label">Secondary sort</label>
                <select
                  className="s2-select"
                  value={config.sort.keys?.[1]?.field || ''}
                  onChange={(e) => {
                    const first = config.sort.keys?.[0] || { field: 'repo:name', dir: 'asc' };
                    const keys = e.target.value
                      ? [first, { field: e.target.value, dir: config.sort.keys?.[1]?.dir || 'asc' }]
                      : [first];
                    setConfig({ ...config, sort: { ...config.sort, keys } });
                  }}
                >
                  <option value="">None</option>
                  {sortableFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}{f.section === 'printed' ? ' •' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="s2-label">Order</label>
                <select
                  className="s2-select"
                  disabled={!config.sort.keys?.[1]?.field}
                  value={config.sort.keys?.[1]?.dir || 'asc'}
                  onChange={(e) => {
                    const first = config.sort.keys?.[0] || { field: 'repo:name', dir: 'asc' };
                    const second = config.sort.keys?.[1];
                    if (!second) return;
                    setConfig({
                      ...config,
                      sort: { ...config.sort, keys: [first, { ...second, dir: e.target.value }] },
                    });
                  }}
                >
                  <option value="asc">A → Z</option>
                  <option value="desc">Z → A</option>
                </select>
              </div>
            </div>
          </section>

          {/* Section 4: Page Layout & Output Destination */}
          <section className="s2-section" style={{ borderBottom: 'none' }}>
            <div className="s2-section-header">
              <h4 className="s2-section-title">Page Layout &amp; Output</h4>
            </div>
            <div className="s2-grid-2 s2-field">
              <div>
                <label className="s2-label">Paper size</label>
                <select
                  className="s2-select"
                  value={config.layout.pageSize}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, pageSize: e.target.value } })}
                >
                  <option value="letter">Letter (8.5 × 11 in)</option>
                  <option value="a4">A4 (210 × 297 mm)</option>
                  <option value="legal">Legal (8.5 × 14 in)</option>
                  <option value="tabloid">Tabloid (11 × 17 in)</option>
                  <option value="a3">A3 (297 × 420 mm)</option>
                </select>
              </div>
              <div>
                <label className="s2-label">Orientation</label>
                <select
                  className="s2-select"
                  value={config.layout.orientation}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, orientation: e.target.value } })}
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </div>
            </div>
            <div className="s2-grid-2 s2-field">
              <div>
                <label className="s2-label">Grid columns</label>
                <select
                  className="s2-select"
                  value={config.layout.columns}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, columns: Number(e.target.value) } })}
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n} columns</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="s2-label">Thumbnail aspect</label>
                <select
                  className="s2-select"
                  value={config.layout.imageAspect}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, imageAspect: e.target.value } })}
                >
                  <option value="4:3">4:3 Standard</option>
                  <option value="1:1">1:1 Square</option>
                  <option value="3:2">3:2 Photo</option>
                  <option value="16:9">16:9 Wide</option>
                  <option value="3:4">3:4 Portrait</option>
                </select>
              </div>
            </div>
            <div className="s2-grid-2 s2-field">
              <div>
                <label className="s2-label">Thumbnail fit</label>
                <select
                  className="s2-select"
                  value={config.layout.imageFit}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, imageFit: e.target.value } })}
                >
                  <option value="fit">Contain (full image)</option>
                  <option value="fill">Cover (fill frame)</option>
                </select>
              </div>
              <div>
                <label className="s2-label">Resolution</label>
                <select
                  className="s2-select"
                  value={config.output.quality}
                  onChange={(e) => setConfig({ ...config, output: { ...config.output, quality: e.target.value } })}
                >
                  <option value="screen">Screen (150 ppi)</option>
                  <option value="print">Print (300 ppi)</option>
                </select>
              </div>
            </div>

            <div className="s2-checkbox-row">
              <label className="s2-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.layout.pageNumbers !== false}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, pageNumbers: e.target.checked } })}
                />
                Page numbers
              </label>
              <label className="s2-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.layout.sequenceNumbers !== false}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, sequenceNumbers: e.target.checked } })}
                />
                Asset sequence #
              </label>
            </div>

            {tier === 'author' && (
              <div className="s2-field" style={{ marginTop: 12 }}>
                <label className="s2-label">Save PDF to AEM folder</label>
                <div className="s2-asset-selector-row">
                  <span
                    className="s2-asset-selector-path"
                    title={config.output.targetFolder?.path || '/content/dam/contact-sheets'}
                  >
                    {config.output.targetFolder?.path || '/content/dam/contact-sheets'}
                  </span>
                  <button
                    type="button"
                    className="s2-btn s2-btn-sm"
                    onClick={() => {
                      if (pickerMode === 'folder') {
                        setPickerMode(null);
                      } else {
                        openBrowser('folder', config.output.targetFolder?.path || '/content/dam');
                      }
                    }}
                  >
                    {pickerMode === 'folder' ? 'Close' : 'Browse'}
                  </button>
                </div>

                {/* Inline Folder Picker Drawer */}
                {pickerMode === 'folder' && (
                  <div className="s2-picker-drawer" style={{ margin: '8px 0 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ fontSize: 12 }}>Select destination folder</strong>
                      <button type="button" className="s2-btn s2-btn-quiet s2-btn-sm" onClick={() => setPickerMode(null)}>
                        ✕
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span className="s2-asset-selector-path" title={pickerPath}>{pickerPath}</span>
                      {pickerPath !== '/content/dam' && (
                        <button
                          type="button"
                          className="s2-btn s2-btn-sm"
                          onClick={() => openBrowser('folder', pickerPath.slice(0, pickerPath.lastIndexOf('/')) || '/content/dam')}
                        >
                          ↑ Up
                        </button>
                      )}
                    </div>
                    <ul className="s2-picker-list">
                      {pickerLoading ? (
                        <li style={{ padding: '10px 8px', fontSize: 12, color: 'var(--s2-text-muted)' }}>
                          Loading subfolders…
                        </li>
                      ) : (
                        pickerListing.folders.map((f) => (
                          <li key={f.path}>
                            <button type="button" className="s2-picker-item" onClick={() => openBrowser('folder', f.path)}>
                              <span>📁</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <input
                        className="s2-input"
                        style={{ height: 28, fontSize: 12 }}
                        type="text"
                        placeholder="New subfolder…"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                      />
                      <button type="button" className="s2-btn s2-btn-sm" onClick={handleCreateSubfolder}>+ New</button>
                      <button
                        type="button"
                        className="s2-btn s2-btn-accent s2-btn-sm"
                        onClick={() => {
                          setConfig({
                            ...config,
                            output: { ...config.output, targetFolder: { id: '', path: pickerPath } },
                          });
                          setPickerMode(null);
                        }}
                      >
                        Select
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Firefly Boards Target Account / IMS Org (for customers with AEM in Org A and Firefly Boards in Org B) */}
            <div className="s2-field" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--s2-border-subtle)' }}>
              <label className="s2-label">Firefly Boards Target IMS Org / Profile</label>
              <select
                className="s2-select"
                value={boardsAccountMode}
                onChange={(e) => setBoardsAccountMode(e.target.value)}
              >
                <option value="current">
                  Current AEM Org ({authCtx?.imsOrg?.replace('@AdobeOrg', '') || 'Default'}) + Auto-share link
                </option>
                {clusterProfiles.map((p) => (
                  <option key={p.userId} value={`cluster:${p.userId}`}>
                    Switch to {p.label}
                  </option>
                ))}
                <option value="custom">Other IMS Org / Custom Firefly Token…</option>
              </select>
              {boardsAccountMode === 'custom' && (
                <div style={{ marginTop: 8 }}>
                  <label className="s2-label">Target Org Firefly Boards Bearer Token (optional)</label>
                  <input
                    className="s2-input"
                    type="password"
                    placeholder="Paste Bearer token from target Firefly Boards org…"
                    value={customBoardsToken}
                    onChange={(e) => setCustomBoardsToken(e.target.value)}
                  />
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <label className="s2-label">Auto-grant Editor access to email / profile</label>
                <input
                  className="s2-input"
                  type="email"
                  placeholder="e.g. user@company.com (can open in any IMS Org)"
                  value={boardsShareEmail}
                  onChange={(e) => setBoardsShareEmail(e.target.value)}
                />
              </div>
            </div>
          </section>
        </aside>

        {/* Right Responsive Preview Canvas */}
        <section className="s2-preview-stage">
          <div className="s2-preview-bar">
            <div className="s2-preview-stats">
              <strong style={{ color: 'var(--s2-text-primary)' }}>
                {paginated?.totalPages} {paginated?.totalPages === 1 ? 'page' : 'pages'}
              </strong>
              <span className="s2-stat-dot" />
              <span>
                {g?.cols} × {g?.rowsPerPage} grid ({g?.perPageCapacity} per page)
              </span>
              <span className="s2-stat-dot" />
              <span>Est. PDF {formatBytes(paginated?.estimatedBytes || 0)}</span>
              {(paginated?.warnings || []).length > 0 && (
                <>
                  <span className="s2-stat-dot" />
                  <span style={{ color: 'var(--s2-warning)', fontWeight: 500 }}>
                    {(paginated?.warnings || []).join(' · ')}
                  </span>
                </>
              )}
            </div>

            <div className="s2-zoom-controls">
              <span style={{ fontSize: 11.5, marginRight: 4 }}>Zoom:</span>
              {[
                { key: 'fit', label: 'Fit to width' },
                { key: '0.75', label: '75%' },
                { key: '1', label: '100%' },
              ].map((z) => (
                <button
                  key={z.key}
                  type="button"
                  className={`s2-zoom-pill${zoomMode === z.key ? ' active' : ''}`}
                  onClick={() => {
                    setZoomMode(z.key);
                    applyIframeZoom(z.key);
                  }}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>

          <div className="s2-preview-viewport">
            <iframe
              ref={iframeRef}
              id="cs-live-preview-iframe"
              className="s2-preview-iframe"
              title="Live contact sheet preview"
              srcDoc={previewHtml}
              onLoad={() => applyIframeZoom(zoomMode)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
