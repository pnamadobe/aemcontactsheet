// Shared Contact Sheet Modal UI used by both Assets View (`aem/assets/assetsview/1`)
// and Content Hub (`aem/assets/contenthub/1`) UI extensions.
// Built with Adobe Spectrum 2 / AEM Assets View design tokens and responsive viewport scaling.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCloudCanvas } from '../cloud-canvas-slot.js';
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
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetIsDefault, setNewPresetIsDefault] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [watermarkPresets, setWatermarkPresets] = useState([]);
  const [selectedWatermarkPresetId, setSelectedWatermarkPresetId] = useState('');
  const [showSaveWmPresetInput, setShowSaveWmPresetInput] = useState(false);
  const [newWmPresetName, setNewWmPresetName] = useState('');
  const [damFonts, setDamFonts] = useState([]);
  const [watermarkFontDataUrl, setWatermarkFontDataUrl] = useState(null);
  const [pickerMode, setPickerMode] = useState(null); // null | 'folder' | 'logo'
  const [pickerPath, setPickerPath] = useState('/content/dam');
  const [pickerListing, setPickerListing] = useState({ folders: [], images: [] });
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [logoSearchQuery, setLogoSearchQuery] = useState('');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');

  const [config, setConfig] = useState(() => createDefaultConfig());
  const [addFieldKey, setAddFieldKey] = useState('');
  const [zoomMode, setZoomMode] = useState('fit'); // 'fit' | '0.75' | '1'
  const [includeSubfolders, setIncludeSubfolders] = useState(() => Boolean(source?.includeSubfolders));
  const [resolvingSubfolders, setResolvingSubfolders] = useState(false);
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
    const deliveryBase = (model.deliveryHost || authCtx?.deliveryHost || '').replace(/\/+$/, '');

    (async () => {
      const batch = missing.slice(0, 80);
      const needAuthorFallback = [];
      let idx = 0;

      async function worker() {
        while (idx < batch.length && !cancelled) {
          const asset = batch[idx++];
          const seo = (asset.name || 'image').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-') || 'image';
          let resolvedOnDelivery = false;
          if (deliveryBase && (tier === 'delivery' || asset.approved || asset.published)) {
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

      // Fetch Author static rendition thumbnails in compact batches of 5 (using `cq5dam.thumbnail.140.100.png` ~25 KB each)
      // so every batch response stays well under OpenWhisk's 1 MB payload limit!
      for (let i = 0; i < needAuthorFallback.length && !cancelled; i += 5) {
        const chunkIds = needAuthorFallback.slice(i, i + 5);
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

  const cloudCanvas = useCloudCanvas({ authCtx, callAction, guestConnection });

  // Resolve a verified PDF download URL immediately (via inlinePdfBase64, State chunks, or AEM pre-signed URL)
  useEffect(() => {
    if (phase !== 'done') {
      setReadyDownloadUrl(null);
      setCheckingDownload(false);
      return;
    }
    const r = generateJob?.result || {};
    if (cloudCanvas.isCloudCanvasDirectResult(r)) {
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
      // If AEM upload was skipped (read-only user with `!r.aemAssetId`) and 42 KB State chunks exist, reassemble them in batches of 8
      const pdfJobId = r.jobId || generateJob?.jobId || generateJob?.id;
      if (!r.aemAssetId && r.pdfChunkCount > 0 && pdfJobId) {
        try {
          const allParts = [];
          for (let cStart = 0; cStart < r.pdfChunkCount && !cancelled; cStart += 8) {
            const batchLen = Math.min(8, r.pdfChunkCount - cStart);
            const batchRes = await Promise.all(
              Array.from({ length: batchLen }, (_, offset) =>
                callAction('status', {
                  method: 'GET',
                  query: { pdfJobId, chunk: cStart + offset },
                })
              )
            );
            for (const item of batchRes) {
              if (item?.chunkBase64) allParts.push(b64ToUint8Array(item.chunkBase64));
            }
          }
          if (!cancelled && allParts.length === r.pdfChunkCount) {
            const blob = new Blob(allParts, { type: 'application/pdf' });
            createdBlobUrl = URL.createObjectURL(blob);
            setReadyDownloadUrl(createdBlobUrl);
            setCheckingDownload(false);
            return;
          }
        } catch {
          // fall through
        }
      }

      const aemBase = (authCtx?.aemHost || model?.aemHost || '').replace(/\/+$/, '');
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
      base = m
        ? `https://${m[1]}.adobeioruntime.net/api/v1/web/contactsheet`
        : `${window.location.origin}/api/v1/web/contactsheet`;
    }
    const url = new URL(`${base}/${name}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    if (method === 'GET') {
      if (ctx?.userId && !url.searchParams.has('userId')) {
        url.searchParams.set('userId', ctx.userId);
      }
      if (ctx?.aemHost && !url.searchParams.has('aemHost')) {
        url.searchParams.set('aemHost', ctx.aemHost);
      }
      if (ctx?.deliveryHost && !url.searchParams.has('deliveryHost')) {
        url.searchParams.set('deliveryHost', ctx.deliveryHost);
      }
    }
    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${ctx?.accessToken || ''}`,
        'x-gw-ims-org-id': ctx?.imsOrg || '',
        'x-api-key': ctx?.apiKey || 'aem-assets-frontend-1',
        'content-type': 'application/json',
      },
      body: body
        ? JSON.stringify({
            aemHost: ctx?.aemHost,
            deliveryHost: ctx?.deliveryHost,
            ...body,
            userId: ctx?.userId,
            userEmail: ctx?.email,
          })
        : undefined,
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
        const hashParams = new URLSearchParams((window.location.hash || '').split('?')[1] || '');
        const searchParams = new URLSearchParams(window.location.search || '');
        const rawRepo =
          discoveredHost ||
          hashParams.get('repo') ||
          searchParams.get('repo') ||
          searchParams.get('repoId') ||
          '';
        const normalizedRepo = rawRepo
          ? (/^https?:\/\//i.test(rawRepo) ? rawRepo : `https://${rawRepo}`).replace(/\/+$/, '')
          : '';
        const isDeliveryRepo = /^https:\/\/delivery-p\d+-e\d+\.adobeaemcloud\.com$/i.test(normalizedRepo);
        const aemHost = isDeliveryRepo
          ? normalizedRepo.replace(/^https:\/\/delivery-/i, 'https://author-')
          : normalizedRepo;
        const deliveryHost = isDeliveryRepo
          ? normalizedRepo
          : aemHost
          ? aemHost.replace(/^https:\/\/author-/i, 'https://delivery-')
          : '';

        const ctx = {
          accessToken: ims?.accessToken,
          imsOrg: ims?.imsOrg || claims.org || '',
          apiKey: apiKey || 'aem-assets-frontend-1',
          userId: profile?.userId || claims.user_id || claims.sub || profile?.email || 'user',
          email: profile?.email || claims.email || profile?.name || '',
          name: profile?.name || claims.name || profile?.email || '',
          aemHost,
          deliveryHost,
        };
        if (cancelled) return;
        setAuthCtx(ctx);

        const [prefsRes, presetsRes, fontsRes, resolveRes] = await Promise.all([
          callAction('prefs', { method: 'GET' }, ctx).catch(() => null),
          callAction('presets', { method: 'GET' }, ctx).catch(() => ({ presets: [], watermarkPresets: [] })),
          callAction('browse', { method: 'GET', query: { mode: 'fonts', aemHost, deliveryHost } }, ctx).catch(() => ({ fonts: [] })),
          callAction('resolve', { method: 'POST', body: { source, tier, aemHost, deliveryHost } }, ctx),
        ]);

        const loadedPresets = presetsRes?.presets || [];
        setPresets(loadedPresets);
        setWatermarkPresets(presetsRes?.watermarkPresets || []);
        setDamFonts(fontsRes?.fonts || []);
        cloudCanvas.syncFromPrefs(prefsRes, ctx);
        const defaultPreset = loadedPresets.find((p) => p.isDefault);

        const firstSelItem = source?.items?.[0];
        const firstSelPath = firstSelItem?.path || '';
        const isSingleSelectedFolder =
          source?.kind === 'selection' &&
          source?.items?.length === 1 &&
          (firstSelItem?.type === 'folder' || (firstSelPath && !firstSelPath.split('/').pop().includes('.')));
        const selectionFolderPath = isSingleSelectedFolder
          ? firstSelPath
          : firstSelPath.startsWith('/content/dam/') && firstSelPath.lastIndexOf('/') > '/content/dam'.length
            ? firstSelPath.slice(0, firstSelPath.lastIndexOf('/'))
            : '';
        const resolvedAssetFolder = resolveRes?.model?.assets?.[0]?.folderPath || '';
        const currentFolderTarget =
          source?.kind === 'folder' && source?.path
            ? { id: source.id || '', path: source.path }
            : selectionFolderPath
              ? { id: '', path: selectionFolderPath }
              : resolvedAssetFolder.startsWith('/content/dam/')
                ? { id: '', path: resolvedAssetFolder }
                : null;
        const presetTargetFolder = defaultPreset?.config?.output?.targetFolder;
        const presetUseCustomFolder =
          Boolean(defaultPreset?.config?.output?.useCustomFolder) &&
          Boolean(presetTargetFolder?.path);

        setConfig((prev) => {
          const base = defaultPreset ? { ...prev, ...defaultPreset.config } : prev;
          return {
            ...base,
            header: {
              ...base.header,
              title:
                source?.name ||
                source?.path?.split('/').pop() ||
                resolveRes?.model?.sourceLabel ||
                'Contact Sheet',
              preparedBy: ctx.name || base.header.preparedBy,
              logo: prefsRes?.lastLogo ?? base.header.logo ?? null,
            },
            output: {
              ...base.output,
              useCustomFolder: presetUseCustomFolder,
              targetFolder: presetUseCustomFolder
                ? presetTargetFolder
                : currentFolderTarget || base.output.targetFolder,
            },
          };
        });

        if (
          (resolveRes.status === 'succeeded' || resolveRes.status === 'succeeded_with_warnings') &&
          resolveRes.model
        ) {
          if (resolveRes.model.aemHost || resolveRes.model.deliveryHost) {
            setAuthCtx((prev) => ({
              ...prev,
              aemHost: prev?.aemHost || resolveRes.model.aemHost || '',
              deliveryHost: prev?.deliveryHost || resolveRes.model.deliveryHost || '',
            }));
          }
          if (resolveRes.model.source?.includeSubfolders) {
            setIncludeSubfolders(true);
          }
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
            if (resolvedModel?.aemHost || resolvedModel?.deliveryHost) {
              setAuthCtx((prev) => ({
                ...prev,
                aemHost: prev?.aemHost || resolvedModel.aemHost || '',
                deliveryHost: prev?.deliveryHost || resolvedModel.deliveryHost || '',
              }));
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

  // Load custom AEM DAM font data URL (`@font-face`) whenever `config.watermark.fontAssetId` changes
  useEffect(() => {
    const wm = config?.watermark;
    if (!wm?.enabled || !wm?.fontAssetId || !authCtx?.accessToken) {
      setWatermarkFontDataUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await callAction('browse', {
          method: 'GET',
          query: {
            mode: 'fontData',
            assetId: wm.fontAssetId,
            name: wm.fontName || 'font.ttf',
          },
        });
        if (!cancelled && res?.fontDataUrl) {
          setWatermarkFontDataUrl(res.fontDataUrl);
        }
      } catch {
        if (!cancelled) setWatermarkFontDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config?.watermark?.enabled, config?.watermark?.fontAssetId, authCtx]);

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
      watermarkFontUrl: watermarkFontDataUrl,
      imageResolver: (asset) => asset.thumbnailUrl || thumbDataUrls[asset.id] || null,
    });
  }, [paginated, model, thumbDataUrls, config.header?.logo, logoPreviewUrl, watermarkFontDataUrl]);

  const sortableFields = useMemo(() => {
    if (!model) return [];
    return getSortableFields(model.fields, config.fields);
  }, [model, config.fields]);

  const availableToAdd = useMemo(() => {
    if (!model) return [];
    const active = new Set(config.fields.map((f) => f.key));
    return model.fields.filter((f) => !active.has(f.key) && !f.technical);
  }, [model, config.fields]);

  const defaultCurrentFolder = useMemo(() => {
    if (source?.kind === 'folder' && source?.path) {
      return { id: source.id || '', path: source.path };
    }
    const firstSelItem = source?.items?.[0];
    const firstSelPath = firstSelItem?.path || '';
    const isSingleSelectedFolder =
      source?.kind === 'selection' &&
      source?.items?.length === 1 &&
      (firstSelItem?.type === 'folder' || (firstSelPath && !firstSelPath.split('/').pop().includes('.')));
    if (isSingleSelectedFolder && firstSelPath) {
      return { id: firstSelItem.id || '', path: firstSelPath };
    }
    if (firstSelPath.startsWith('/content/dam/') && firstSelPath.lastIndexOf('/') > '/content/dam'.length) {
      return { id: '', path: firstSelPath.slice(0, firstSelPath.lastIndexOf('/')) };
    }
    const resolvedFolder = model?.assets?.[0]?.folderPath || '';
    if (resolvedFolder.startsWith('/content/dam/')) {
      return { id: '', path: resolvedFolder };
    }
    return { id: '', path: '/content/dam/contact-sheets' };
  }, [source, model]);

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
      const effectiveTargetFolder = config.output.useCustomFolder
        ? config.output.targetFolder
        : defaultCurrentFolder;
      const slimConfig = {
        ...config,
        header: {
          ...config.header,
          logo: slimLogo,
        },
        output: {
          ...config.output,
          targetFolder: effectiveTargetFolder,
        },
      };

      callAction('prefs', {
        method: 'PUT',
        body: {
          lastOutputFolder: effectiveTargetFolder,
          lastLogo: slimLogo,
        },
      }).catch(() => {});

      const { outputFormat: effectiveFormat, extraBody } =
        await cloudCanvas.prepareGeneratePayload(outputFormat);

      const genInit = await callAction('generate', {
        method: 'POST',
        body: {
          modelFileKey,
          model,
          config: slimConfig,
          outputFormat: effectiveFormat,
          ...extraBody,
          tier,
          aemHost: authCtx?.aemHost,
          deliveryHost: authCtx?.deliveryHost,
        },
      });

      if (genInit.status === 'succeeded' || genInit.status === 'succeeded_with_warnings') {
        setGenerateJob(genInit);
        setPhase('done');
        guestConnection?.host?.toast?.display?.({
          variant: 'positive',
          message: cloudCanvas.getToastMessage(outputFormat, config.header.title),
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
            message: cloudCanvas.getToastMessage(outputFormat, config.header.title),
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

  const hasFolderInSource =
    source?.kind === 'folder' ||
    (source?.kind === 'selection' &&
      Array.isArray(source?.items) &&
      source.items.some(
        (it) => it?.type === 'folder' || (it?.path && !it.path.split('/').pop().includes('.'))
      ));

  async function handleToggleSubfolders(checked) {
    if (!hasFolderInSource) return;
    setIncludeSubfolders(checked);
    setResolvingSubfolders(true);
    try {
      const updatedSource = { ...source, includeSubfolders: checked };
      const resolveRes = await callAction('resolve', {
        method: 'POST',
        body: {
          source: updatedSource,
          tier,
          aemHost: authCtx?.aemHost,
          deliveryHost: authCtx?.deliveryHost,
        },
      });
      if (
        (resolveRes.status === 'succeeded' || resolveRes.status === 'succeeded_with_warnings') &&
        resolveRes.model
      ) {
        setModel(resolveRes.model);
        setModelFileKey(resolveRes.result?.modelFileKey || null);
      } else if (resolveRes.jobId) {
        const st = await callAction('status', {
          method: 'GET',
          query: { jobId: resolveRes.jobId, includeModel: true },
        });
        if (st?.model) {
          setModel(st.model);
          setModelFileKey(st.result?.modelFileKey || null);
        }
      }
    } catch {
      // keep existing model if re-resolve fails
    } finally {
      setResolvingSubfolders(false);
    }
  }

  async function handleSavePreset() {
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    setSavingPreset(true);
    try {
      const slimLogo = config.header.logo
        ? {
            assetId: config.header.logo.assetId,
            path: config.header.logo.path,
            tier: config.header.logo.tier,
          }
        : null;
      const presetConfig = {
        ...config,
        header: {
          ...config.header,
          logo: slimLogo,
        },
      };
      const res = await callAction('presets', {
        method: 'PUT',
        body: { preset: { name: trimmed, isDefault: newPresetIsDefault, config: presetConfig } },
      });
      setPresets(res.presets || []);
      setSelectedPresetId(res.preset?.id || '');
      setShowSavePresetInput(false);
      setNewPresetName('');
      guestConnection?.host?.toast?.display?.({
        variant: 'positive',
        message: `Saved preset "${trimmed}"${newPresetIsDefault ? ' (Default)' : ''}.`,
      });
    } catch (err) {
      guestConnection?.host?.toast?.display?.({
        variant: 'negative',
        message: err.message || 'Could not save preset.',
      });
    } finally {
      setSavingPreset(false);
    }
  }

  async function handleDeleteSelectedPreset() {
    if (!selectedPresetId) return;
    const found = presets.find((p) => p.id === selectedPresetId);
    try {
      const res = await callAction('presets', {
        method: 'DELETE',
        body: { id: selectedPresetId },
      });
      setPresets(res.presets || []);
      setSelectedPresetId('');
      guestConnection?.host?.toast?.display?.({
        variant: 'positive',
        message: `Removed preset "${found?.name || ''}".`,
      });
    } catch {
      // ignore
    }
  }

  async function handleSaveWatermarkPreset() {
    const trimmed = newWmPresetName.trim();
    if (!trimmed) return;
    try {
      const res = await callAction('presets', {
        method: 'PUT',
        body: {
          watermarkPreset: {
            name: trimmed,
            watermark: {
              ...config.watermark,
              enabled: true,
            },
          },
        },
      });
      setWatermarkPresets(res.watermarkPresets || []);
      setSelectedWatermarkPresetId(res.watermarkPreset?.id || '');
      setShowSaveWmPresetInput(false);
      setNewWmPresetName('');
      guestConnection?.host?.toast?.display?.({
        variant: 'positive',
        message: `Saved watermark preset "${trimmed}".`,
      });
    } catch (err) {
      guestConnection?.host?.toast?.display?.({
        variant: 'negative',
        message: err.message || 'Could not save watermark preset.',
      });
    }
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

  async function openBrowser(mode, startPath = '/content/dam', searchQ = '', { isInitialOpen = false } = {}) {
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
      // Only fall back to /content/dam when initially opening the picker on a stale/deleted default path;
      // never kick the user back to /content/dam when navigating folders inside the picker.
      if (isInitialOpen && startPath !== '/content/dam') {
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
    const totalCount = p.total || paginated?.totalAssets || 0;
    const pct = p.total ? Math.max(15, Math.round((p.done / p.total) * 100)) : 45;
    const progOverride = cloudCanvas.getProgressOverride(activeOutputFormat, p.done, totalCount);
    return (
      <div className="s2-shell">
        <style>{SPECTRUM_CSS}</style>
        <div className="s2-state-screen">
          <div className="s2-state-card">
            <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>
              {progOverride?.heading || 'Generating contact sheet PDF…'}
            </h3>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--s2-text-secondary)' }}>
              {progOverride?.detail || `Rendering high-resolution pages and uploading to AEM Assets (${p.done} / ${totalCount})…`}
            </p>
            <div className="s2-progress-track">
              <div
                className="s2-progress-fill"
                style={{
                  width: `${pct}%`,
                  background: progOverride?.barColor || 'var(--s2-accent)',
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
    const customCard = cloudCanvas.renderCompletionCard({
      r,
      config,
      warnings: generateJob?.warnings || [],
      readyDownloadUrl,
      tier,
      onBack: () => setPhase('configure'),
      onClose: () => guestConnection?.host?.modal?.closeDialog?.(),
      formatBytes,
    });
    if (customCard) {
      return (
        <div className="s2-shell">
          <style>{SPECTRUM_CSS}</style>
          <div className="s2-state-screen">{customCard}</div>
        </div>
      );
    }
    return (
      <div className="s2-shell">
        <style>{SPECTRUM_CSS}</style>
        <div className="s2-state-screen">
          <div className="s2-state-card">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 999, background: 'var(--s2-positive-subtle)', color: 'var(--s2-positive)', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
              ✓ {r.aemPath ? 'Saved to AEM Assets' : 'Contact Sheet Ready for Download'}
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: 19 }}>
              {config.header.title || r.fileName}
            </h3>
            <p style={{ margin: '0 0 10px', fontSize: 13.5, color: 'var(--s2-text-secondary)' }}>
              {r.pages} {r.pages === 1 ? 'page' : 'pages'} · {r.assets} assets · {formatBytes(r.bytes)}
            </p>
            {r.aemPath && (
              <div className="s2-asset-selector-row" style={{ marginBottom: 14 }}>
                <span className="s2-asset-selector-path" title={r.aemPath}>{r.aemPath}</span>
              </div>
            )}

            {(generateJob?.warnings || []).map((w, i) => (
              <div key={i} className="s2-banner-warn" style={{ margin: '0 0 12px' }}>{w}</div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="s2-btn s2-btn-quiet" onClick={() => setPhase('configure')}>
                Back to editor
              </button>
              {r.aemPath && tier === 'author' && (
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
              {readyDownloadUrl ? (
                <a
                  className="s2-btn s2-btn-accent"
                  href={readyDownloadUrl}
                  download={r.fileName || 'contact-sheet.pdf'}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download PDF
                </a>
              ) : (
                <button className="s2-btn" disabled>
                  Preparing download link…
                </button>
              )}
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
              {resolvingSubfolders
                ? 'Updating…'
                : `${model?.totalFound} ${model?.totalFound === 1 ? 'asset' : 'assets'}`}
            </span>
            {hasFolderInSource && (
              <label
                className="s2-checkbox-label"
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  marginLeft: 4,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--s2-bg-layer-2)',
                }}
              >
                <input
                  type="checkbox"
                  checked={includeSubfolders}
                  disabled={resolvingSubfolders}
                  onChange={(e) => handleToggleSubfolders(e.target.checked)}
                />
                Include subfolders
              </label>
            )}
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
              if (found) {
                const presetFolder = found.config?.output?.targetFolder;
                const keepPresetFolder =
                  Boolean(found.config?.output?.useCustomFolder) && Boolean(presetFolder?.path);
                setConfig((c) => ({
                  ...c,
                  ...found.config,
                  output: {
                    ...c.output,
                    ...(found.config?.output || {}),
                    useCustomFolder: keepPresetFolder,
                    targetFolder: keepPresetFolder ? presetFolder : defaultCurrentFolder,
                  },
                }));
              } else {
                setConfig((c) => ({
                  ...c,
                  output: {
                    ...c.output,
                    useCustomFolder: false,
                    targetFolder: defaultCurrentFolder,
                  },
                }));
              }
            }}
          >
            <option value="">Preset: Default</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {selectedPresetId && !showSavePresetInput && (
            <button
              type="button"
              className="s2-btn s2-btn-quiet s2-btn-sm"
              title="Delete selected preset"
              onClick={handleDeleteSelectedPreset}
            >
              ✕
            </button>
          )}
          {showSavePresetInput ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px',
                borderRadius: 999,
                background: 'var(--s2-bg-base)',
                border: '1px solid var(--s2-border)',
              }}
            >
              <input
                className="s2-input"
                style={{ width: 140, height: 26, fontSize: 12, border: 'none', background: 'transparent', padding: '0 4px' }}
                type="text"
                placeholder="Preset name…"
                autoFocus
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPresetName.trim()) {
                    handleSavePreset();
                  } else if (e.key === 'Escape') {
                    setShowSavePresetInput(false);
                  }
                }}
              />
              <label className="s2-checkbox-label" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={newPresetIsDefault}
                  onChange={(e) => setNewPresetIsDefault(e.target.checked)}
                />
                Default
              </label>
              <button
                type="button"
                className="s2-btn s2-btn-accent s2-btn-sm"
                style={{ height: 24, padding: '0 10px' }}
                disabled={!newPresetName.trim() || savingPreset}
                onClick={handleSavePreset}
              >
                {savingPreset ? '…' : 'Save'}
              </button>
              <button
                type="button"
                className="s2-btn s2-btn-quiet s2-btn-sm"
                style={{ height: 24, padding: '0 6px' }}
                onClick={() => setShowSavePresetInput(false)}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="s2-btn s2-btn-quiet"
              onClick={() => {
                const existing = presets.find((p) => p.id === selectedPresetId);
                setNewPresetName(existing?.name || '');
                setNewPresetIsDefault(Boolean(existing?.isDefault));
                setShowSavePresetInput(true);
              }}
            >
              Save preset
            </button>
          )}

          <div className="s2-divider-v" />

          {cloudCanvas.renderTopBarButtons(handleGenerate)}
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
                        openBrowser('logo', getDefaultLogoStartPath(), '', { isInitialOpen: true });
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
                                const previewUrl =
                                  (img.thumbnailUrl?.startsWith('data:') ? img.thumbnailUrl : null) ||
                                  img.downloadUrl ||
                                  img.thumbnailUrl ||
                                  null;
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

          {/* Section 3b: Watermark Overlay & Standalone Watermark Presets */}
          <section className="s2-section">
            <div className="s2-section-header">
              <h4 className="s2-section-title">Watermark</h4>
              <label className="s2-checkbox-label" style={{ fontSize: 12, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={Boolean(config.watermark?.enabled)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      watermark: { ...config.watermark, enabled: e.target.checked },
                    })
                  }
                />
                Enable watermark
              </label>
            </div>

            {/* Watermark Preset Picker + Save Watermark Preset */}
            <div className="s2-field" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6 }}>
              <select
                className="s2-select"
                value={selectedWatermarkPresetId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedWatermarkPresetId(id);
                  const found = watermarkPresets.find((wp) => wp.id === id);
                  if (found?.watermark) {
                    setConfig((c) => ({
                      ...c,
                      watermark: { ...c.watermark, ...found.watermark, enabled: true },
                    }));
                  }
                }}
              >
                <option value="">Watermark preset…</option>
                {watermarkPresets.map((wp) => (
                  <option key={wp.id} value={wp.id}>
                    {wp.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="s2-btn s2-btn-sm"
                style={{ height: 32 }}
                onClick={() => {
                  setNewWmPresetName(config.watermark?.text || 'Custom Watermark');
                  setShowSaveWmPresetInput((prev) => !prev);
                }}
              >
                Save preset
              </button>
            </div>

            {showSaveWmPresetInput && (
              <div className="s2-field" style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  className="s2-input"
                  style={{ height: 28, fontSize: 12 }}
                  type="text"
                  placeholder="Watermark preset name…"
                  autoFocus
                  value={newWmPresetName}
                  onChange={(e) => setNewWmPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newWmPresetName.trim()) {
                      handleSaveWatermarkPreset();
                    } else if (e.key === 'Escape') {
                      setShowSaveWmPresetInput(false);
                    }
                  }}
                />
                <button
                  type="button"
                  className="s2-btn s2-btn-accent s2-btn-sm"
                  style={{ height: 28 }}
                  disabled={!newWmPresetName.trim()}
                  onClick={handleSaveWatermarkPreset}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="s2-btn s2-btn-quiet s2-btn-sm"
                  style={{ height: 28 }}
                  onClick={() => setShowSaveWmPresetInput(false)}
                >
                  ✕
                </button>
              </div>
            )}

            {config.watermark?.enabled && (
              <>
                <div className="s2-field">
                  <label className="s2-label">Watermark text</label>
                  <input
                    className="s2-input"
                    type="text"
                    placeholder="e.g. CONFIDENTIAL, DRAFT, FPO"
                    value={config.watermark?.text ?? 'CONFIDENTIAL'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        watermark: { ...config.watermark, text: e.target.value },
                      })
                    }
                  />
                </div>

                <div className="s2-field">
                  <label className="s2-label">Font family (System &amp; AEM DAM Fonts)</label>
                  <select
                    className="s2-select"
                    value={
                      config.watermark?.fontAssetId
                        ? `dam:${config.watermark.fontAssetId}`
                        : config.watermark?.font || 'blocky'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith('dam:')) {
                        const assetId = val.slice(4);
                        const fObj = damFonts.find((f) => f.assetId === assetId);
                        setConfig({
                          ...config,
                          watermark: {
                            ...config.watermark,
                            font: val,
                            fontAssetId: assetId,
                            fontName: fObj?.name || 'font.ttf',
                            fontPath: fObj?.path || '',
                          },
                        });
                      } else {
                        setConfig({
                          ...config,
                          watermark: {
                            ...config.watermark,
                            font: val,
                            fontAssetId: null,
                            fontName: null,
                            fontPath: null,
                          },
                        });
                      }
                    }}
                  >
                    <optgroup label="System Fonts">
                      <option value="blocky">Blocky Impact (Default)</option>
                      <option value="sans-bold">Bold Sans (Helvetica / Arial Bold)</option>
                      <option value="condensed">Condensed Display (Arial Narrow)</option>
                      <option value="serif-bold">Classic Serif Bold (Georgia / Times)</option>
                      <option value="mono-stamp">Monospace Stamp (Courier Bold)</option>
                    </optgroup>
                    {damFonts.length > 0 && (
                      <optgroup label="AEM DAM Fonts (/content/dam/fonts & DAM)">
                        {damFonts.map((f) => (
                          <option key={f.assetId} value={`dam:${f.assetId}`}>
                            {f.label} ({f.name.split('.').pop()?.toUpperCase()})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div className="s2-grid-2 s2-field">
                  <div>
                    <label className="s2-label">Position</label>
                    <select
                      className="s2-select"
                      value={config.watermark?.position || 'center'}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          watermark: { ...config.watermark, position: e.target.value },
                        })
                      }
                    >
                      <option value="center">Center</option>
                      <option value="top-left">Top Left</option>
                      <option value="top-right">Top Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="bottom-right">Bottom Right</option>
                    </select>
                  </div>
                  <div>
                    <label className="s2-label">Angle ({config.watermark?.angle ?? 45}°)</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <select
                        className="s2-select"
                        value={String(config.watermark?.angle ?? 45)}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            watermark: { ...config.watermark, angle: Number(e.target.value) },
                          })
                        }
                      >
                        <option value="45">45° Diagonal ↗</option>
                        <option value="-45">-45° Diagonal ↘</option>
                        <option value="0">0° Horizontal</option>
                        <option value="30">30°</option>
                        <option value="-30">-30°</option>
                        <option value="60">60°</option>
                        <option value="-60">-60°</option>
                        <option value="90">90° Vertical</option>
                      </select>
                      <input
                        className="s2-input"
                        style={{ width: 62, padding: '0 6px' }}
                        type="number"
                        min={-90}
                        max={90}
                        value={config.watermark?.angle ?? 45}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            watermark: { ...config.watermark, angle: Number(e.target.value) || 0 },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="s2-grid-2 s2-field">
                  <div>
                    <label className="s2-label">
                      Opacity: <strong>{config.watermark?.opacity ?? 35}%</strong>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      step={5}
                      style={{ width: '100%', accentColor: 'var(--s2-accent)' }}
                      value={config.watermark?.opacity ?? 35}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          watermark: { ...config.watermark, opacity: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="s2-label">
                      Asset coverage: <strong>{config.watermark?.coverage ?? 60}%</strong>
                    </label>
                    <input
                      type="range"
                      min={20}
                      max={90}
                      step={5}
                      style={{ width: '100%', accentColor: 'var(--s2-accent)' }}
                      value={config.watermark?.coverage ?? 60}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          watermark: { ...config.watermark, coverage: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                </div>
              </>
            )}
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

            <div className="s2-field">
              <label className="s2-label">Page theme</label>
              <select
                className="s2-select"
                value={config.layout.theme || 'light'}
                onChange={(e) => setConfig({ ...config, layout: { ...config.layout, theme: e.target.value } })}
              >
                <option value="light">Clean White (Default)</option>
                <option value="dark">Photographer Dark (#18181b)</option>
                <option value="grey">Neutral Proofing Grey (#52525b)</option>
              </select>
            </div>

            <div className="s2-checkbox-row" style={{ flexWrap: 'wrap', rowGap: 6 }}>
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
              <label className="s2-checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(config.layout.statusBadges)}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, statusBadges: e.target.checked } })}
                />
                Status badges
              </label>
              <label className="s2-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.layout.clickableLinks !== false}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, clickableLinks: e.target.checked } })}
                />
                Clickable AEM links
              </label>
            </div>

            {tier === 'author' && (
              <div className="s2-field" style={{ marginTop: 12 }}>
                <label className="s2-label">Save PDF to AEM folder</label>
                <div className="s2-asset-selector-row">
                  <span
                    className="s2-asset-selector-path"
                    title={
                      (config.output.useCustomFolder
                        ? config.output.targetFolder?.path
                        : defaultCurrentFolder.path) || '/content/dam/contact-sheets'
                    }
                  >
                    {(config.output.useCustomFolder
                      ? config.output.targetFolder?.path
                      : defaultCurrentFolder.path) || '/content/dam/contact-sheets'}
                  </span>
                  {config.output.useCustomFolder && (
                    <button
                      type="button"
                      className="s2-btn s2-btn-sm"
                      onClick={() => {
                        if (pickerMode === 'folder') {
                          setPickerMode(null);
                        } else {
                          openBrowser(
                            'folder',
                            config.output.targetFolder?.path || defaultCurrentFolder.path || '/content/dam',
                            '',
                            { isInitialOpen: true }
                          );
                        }
                      }}
                    >
                      {pickerMode === 'folder' ? 'Close' : 'Browse'}
                    </button>
                  )}
                </div>
                <label className="s2-checkbox-label" style={{ marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(config.output.useCustomFolder)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setConfig({
                        ...config,
                        output: {
                          ...config.output,
                          useCustomFolder: checked,
                          targetFolder: checked
                            ? config.output.targetFolder?.path &&
                              config.output.targetFolder.path !== '/content/dam/contact-sheets'
                              ? config.output.targetFolder
                              : defaultCurrentFolder
                            : defaultCurrentFolder,
                        },
                      });
                      if (!checked && pickerMode === 'folder') {
                        setPickerMode(null);
                      } else if (checked) {
                        openBrowser(
                          'folder',
                          defaultCurrentFolder.path || '/content/dam',
                          '',
                          { isInitialOpen: true }
                        );
                      }
                    }}
                  />
                  Choose a different AEM folder
                </label>

                {/* Inline Folder Picker Drawer */}
                {config.output.useCustomFolder && pickerMode === 'folder' && (
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
                            output: {
                              ...config.output,
                              useCustomFolder: true,
                              targetFolder: { id: '', path: pickerPath },
                            },
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

            {cloudCanvas.renderInspectorSection()}
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
