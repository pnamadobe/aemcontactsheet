// Shared Contact Sheet Modal UI used by both Assets View (`aem/assets/assetsview/1`)
// and Content Hub (`aem/assets/contenthub/1`) UI extensions.
// Uses @contactsheet/core so the live preview and the backend PDF renderer produce identical output.

import React, { useEffect, useMemo, useState } from 'react';
import {
  createDefaultConfig,
  formatBytes,
  getSortableFields,
  paginate,
  renderHtml,
} from '../../../packages/core/index.js';

export default function ContactSheetDialog({
  guestConnection,
  source,
  tier = 'author',
  actionBaseUrl = '',
}) {
  const [authCtx, setAuthCtx] = useState(null);
  const [phase, setPhase] = useState('resolving'); // 'resolving' | 'configure' | 'generating' | 'done' | 'error'
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
  const [newFolderName, setNewFolderName] = useState('');

  const [config, setConfig] = useState(() => createDefaultConfig());
  const [addFieldKey, setAddFieldKey] = useState('');

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
    (async () => {
      try {
        const ims = (await guestConnection?.host?.auth?.getIMSInfo?.()) || {};
        const apiKey = (await guestConnection?.host?.auth?.getApiKey?.()) || 'aem-assets-frontend-1';
        const profile = (await guestConnection?.host?.auth?.getCurrentUserProfile?.()) || {};
        const aemHost = (await guestConnection?.host?.discovery?.getAemHost?.()) || 'https://author-p59602-e520244.adobeaemcloud.com';

        const ctx = {
          accessToken: ims.accessToken,
          imsOrg: ims.imsOrg,
          apiKey,
          userId: profile.userId || profile.email || 'user',
          email: profile.email || profile.name || '',
          name: profile.name || profile.email || '',
          aemHost,
        };
        if (cancelled) return;
        setAuthCtx(ctx);

        // Load saved preferences (lastOutputFolder, lastLogo) and personal presets in parallel
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

        // If /resolve already completed synchronously with inline model, use it immediately
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

        // Otherwise poll resolve job until succeeded
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

  // Live pagination & HTML preview calculated synchronously in the browser using @contactsheet/core
  const paginated = useMemo(() => {
    if (!model) return null;
    return paginate(model, config);
  }, [model, config]);

  const previewHtml = useMemo(() => {
    if (!paginated || !model) return '';
    return renderHtml(paginated, {
      mode: 'preview',
      model,
      imageResolver: (asset) => asset.thumbnailUrl || null,
    });
  }, [paginated, model]);

  const sortableFields = useMemo(() => {
    if (!model) return [];
    return getSortableFields(model.fields, config.fields);
  }, [model, config.fields]);

  const availableToAdd = useMemo(() => {
    if (!model) return [];
    const active = new Set(config.fields.map((f) => f.key));
    return model.fields.filter((f) => !active.has(f.key) && !f.technical);
  }, [model, config.fields]);

  async function handleGeneratePdf() {
    try {
      setPhase('generating');
      // Persist remembered output folder and logo to user preferences
      callAction('prefs', {
        method: 'PUT',
        body: {
          lastOutputFolder: config.output.targetFolder,
          lastLogo: config.header.logo,
        },
      }).catch(() => {});

      const genInit = await callAction('generate', {
        method: 'POST',
        body: {
          modelFileKey,
          model,
          config,
          tier,
          aemHost: authCtx?.aemHost,
        },
      });

      if (genInit.status === 'succeeded' || genInit.status === 'succeeded_with_warnings') {
        setGenerateJob(genInit);
        setPhase('done');
        guestConnection?.host?.toast?.display?.({
          variant: 'positive',
          message: `Contact sheet "${config.header.title}" is ready.`,
        });
        return;
      }
      if (genInit.status === 'failed') {
        throw new Error(genInit.error?.message || 'PDF generation failed');
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
            message: `Contact sheet "${config.header.title}" is ready.`,
          });
          break;
        }
        if (st.status === 'failed') {
          throw new Error(st.error?.message || 'PDF generation failed');
        }
      }
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  async function handleSavePreset() {
    const name = window.prompt('Save current layout & field settings as preset name:');
    if (!name) return;
    const isDefault = window.confirm('Make this your default preset?');
    const res = await callAction('presets', {
      method: 'PUT',
      body: { preset: { name, isDefault, config } },
    });
    setPresets(res.presets || []);
    setSelectedPresetId(res.preset?.id || '');
  }

  async function openBrowser(mode, startPath = '/content/dam') {
    setPickerMode(mode);
    setPickerPath(startPath);
    const data = await callAction('browse', {
      method: 'GET',
      query: { mode: mode === 'logo' ? 'images' : 'folders', path: startPath },
    });
    setPickerListing({ folders: data.folders || [], images: data.images || [] });
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
    return (
      <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
        <h3>Reading assets for contact sheet…</h3>
        <p style={{ color: '#4b5563' }}>
          {resolveProgress.total
            ? `Resolved ${resolveProgress.done} of ${resolveProgress.total} assets…`
            : 'Listing source contents and metadata…'}
        </p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
        <h3 style={{ color: '#b91c1c' }}>Could not complete contact sheet</h3>
        <p>{errorMsg}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {model && <button onClick={() => setPhase('configure')}>Back to settings</button>}
          <button onClick={() => guestConnection?.host?.modal?.closeDialog?.()}>Close</button>
        </div>
      </div>
    );
  }

  if (phase === 'generating') {
    const p = generateJob?.progress || { done: 0, total: paginated?.totalAssets || 0 };
    return (
      <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
        <h3>Generating contact sheet PDF…</h3>
        <p>
          Phase: <strong>{generateJob?.phase || 'images'}</strong> · {p.done} / {p.total} assets processed
        </p>
        <p style={{ fontSize: 13, color: '#6b7280' }}>
          You can close this dialog; generation will finish in the background.
        </p>
        <button onClick={() => guestConnection?.host?.modal?.closeDialog?.()}>Close</button>
      </div>
    );
  }

  if (phase === 'done') {
    const r = generateJob?.result || {};
    return (
      <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
        <h3 style={{ color: '#047857' }}>Contact sheet ready</h3>
        <p>
          <strong>{r.fileName}</strong> · {r.pages} pages · {r.assets} assets · {formatBytes(r.bytes)}
        </p>
        {r.aemPath && (
          <p style={{ fontSize: 13 }}>
            Saved to AEM: <code>{r.aemPath}</code>
          </p>
        )}
        {(generateJob?.warnings || []).map((w, i) => (
          <p key={i} style={{ color: '#b45309', fontSize: 13 }}>{w}</p>
        ))}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {r.downloadUrl && (
            <a href={r.downloadUrl} target="_blank" rel="noreferrer">
              <button>Download PDF</button>
            </a>
          )}
          {r.aemPath && tier === 'author' && (
            <button
              onClick={() => guestConnection?.host?.router?.navigateToAssetDetails?.({ assetPath: r.aemPath })}
            >
              Open in AEM
            </button>
          )}
          <button onClick={() => setPhase('configure')}>Back to preview</button>
          <button onClick={() => guestConnection?.host?.modal?.closeDialog?.()}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      <header style={{ padding: '10px 18px', background: '#111827', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>Create Contact Sheet</strong> · {model?.sourceLabel} ({model?.totalFound} assets)
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
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
          <button onClick={handleSavePreset}>Save preset</button>
          <button
            onClick={() => {
              const iframe = document.getElementById('cs-live-preview-iframe');
              iframe?.contentWindow?.focus();
              iframe?.contentWindow?.print();
            }}
          >
            Print / Save as PDF
          </button>
          <button onClick={() => guestConnection?.host?.modal?.closeDialog?.()}>Cancel</button>
          <button
            style={{ background: '#1473e6', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 4, fontWeight: 600 }}
            onClick={handleGeneratePdf}
          >
            Generate &amp; Save to AEM
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '370px 1fr', minHeight: 0 }}>
        <aside style={{ overflowY: 'auto', padding: 14, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {model?.truncated && (
            <div style={{ padding: 10, background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 4, fontSize: 12 }}>
              <strong>{model.totalFound} assets found.</strong> MVP cap is {model.maxAssets}. Showing the first {model.maxAssets} after sorting, or narrow your selection first.
            </div>
          )}

          {/* Header section */}
          <section>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 12 }}>1 · HEADER</h4>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
              Title *
              <input
                type="text"
                style={{ width: '100%' }}
                value={config.header.title}
                onChange={(e) => setConfig({ ...config, header: { ...config.header, title: e.target.value } })}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ fontSize: 12 }}>
                Date
                <input
                  type="date"
                  style={{ width: '100%' }}
                  value={config.header.date}
                  onChange={(e) => setConfig({ ...config, header: { ...config.header, date: e.target.value } })}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Department
                <input
                  type="text"
                  style={{ width: '100%' }}
                  value={config.header.department || ''}
                  onChange={(e) => setConfig({ ...config, header: { ...config.header, department: e.target.value } })}
                />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
              <label style={{ fontSize: 12 }}>
                Prepared by
                <input
                  type="text"
                  style={{ width: '100%' }}
                  value={config.header.preparedBy || ''}
                  onChange={(e) => setConfig({ ...config, header: { ...config.header, preparedBy: e.target.value } })}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Project
                <input
                  type="text"
                  style={{ width: '100%' }}
                  value={config.header.project || ''}
                  onChange={(e) => setConfig({ ...config, header: { ...config.header, project: e.target.value } })}
                />
              </label>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Logo: {config.header.logo?.path?.split('/').pop() || 'None'}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => openBrowser('logo', '/content/dam')}>Change…</button>
                {config.header.logo && (
                  <button type="button" onClick={() => setConfig({ ...config, header: { ...config.header, logo: null } })}>Clear</button>
                )}
              </div>
            </div>
          </section>

          {/* Printed metadata fields */}
          <section>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 12 }}>2 · METADATA BELOW EACH PREVIEW</h4>
            {config.fields.map((f, idx) => (
              <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 58px 22px', gap: 6, alignItems: 'center', marginBottom: 4, fontSize: 12 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
                <select
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
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(f.showLabel)}
                    onChange={(e) => {
                      const next = [...config.fields];
                      next[idx] = { ...f, showLabel: e.target.checked };
                      setConfig({ ...config, fields: next });
                    }}
                  />
                  lbl
                </label>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, fields: config.fields.filter((_, i) => i !== idx) })}
                >
                  ✕
                </button>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', gap: 6, marginTop: 6 }}>
              <select value={addFieldKey} onChange={(e) => setAddFieldKey(e.target.value)}>
                <option value="">Select field to add…</option>
                {availableToAdd.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label} ({Math.round((f.coverage ?? 1) * 100)}%)
                  </option>
                ))}
              </select>
              <button
                type="button"
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

          {/* Sort & Group */}
          <section>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 12 }}>3 · SORT &amp; GROUP</h4>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
              Group by
              <select
                style={{ width: '100%' }}
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
                <option value="">(None)</option>
                {sortableFields.filter((f) => f.groupable).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}{f.section === 'printed' ? ' ★' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px', gap: 6 }}>
              <label style={{ fontSize: 12 }}>
                Sort by
                <select
                  style={{ width: '100%' }}
                  value={config.sort.keys?.[0]?.field || 'repo:name'}
                  onChange={(e) => {
                    const keys = [...(config.sort.keys || [])];
                    keys[0] = { field: e.target.value, dir: keys[0]?.dir || 'asc' };
                    setConfig({ ...config, sort: { ...config.sort, keys } });
                  }}
                >
                  {sortableFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}{f.section === 'printed' ? ' ★' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>
                Dir
                <select
                  style={{ width: '100%' }}
                  value={config.sort.keys?.[0]?.dir || 'asc'}
                  onChange={(e) => {
                    const keys = [...(config.sort.keys || [])];
                    keys[0] = { field: keys[0]?.field || 'repo:name', dir: e.target.value };
                    setConfig({ ...config, sort: { ...config.sort, keys } });
                  }}
                >
                  <option value="asc">Asc</option>
                  <option value="desc">Desc</option>
                </select>
              </label>
            </div>
          </section>

          {/* Layout & Output */}
          <section>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 12 }}>4 · LAYOUT &amp; DESTINATION</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ fontSize: 12 }}>
                Page size
                <select
                  style={{ width: '100%' }}
                  value={config.layout.pageSize}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, pageSize: e.target.value } })}
                >
                  <option value="letter">Letter</option>
                  <option value="a4">A4</option>
                  <option value="legal">Legal</option>
                  <option value="tabloid">Tabloid</option>
                  <option value="a3">A3</option>
                </select>
              </label>
              <label style={{ fontSize: 12 }}>
                Orientation
                <select
                  style={{ width: '100%' }}
                  value={config.layout.orientation}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, orientation: e.target.value } })}
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
              <label style={{ fontSize: 12 }}>
                Columns
                <select
                  style={{ width: '100%' }}
                  value={config.layout.columns}
                  onChange={(e) => setConfig({ ...config, layout: { ...config.layout, columns: Number(e.target.value) } })}
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n} columns</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>
                Quality
                <select
                  style={{ width: '100%' }}
                  value={config.output.quality}
                  onChange={(e) => setConfig({ ...config, output: { ...config.output, quality: e.target.value } })}
                >
                  <option value="screen">Screen (150 ppi)</option>
                  <option value="print">Print (300 ppi)</option>
                </select>
              </label>
            </div>
            {tier === 'author' && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <div>Save to AEM folder:</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                  <code style={{ fontSize: 11 }}>{config.output.targetFolder?.path || '/content/dam/contact-sheets'}</code>
                  <button type="button" onClick={() => openBrowser('folder', config.output.targetFolder?.path || '/content/dam')}>
                    Browse…
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Inline folder / logo picker modal */}
          {pickerMode && (
            <section style={{ border: '1px solid #1473e6', borderRadius: 4, padding: 10, background: '#f0f7ff', fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{pickerMode === 'folder' ? 'Select destination folder' : 'Select header logo'}</strong>
                <button type="button" onClick={() => setPickerMode(null)}>Close</button>
              </div>
              <div style={{ margin: '6px 0' }}>
                <code>{pickerPath}</code>
                {pickerPath !== '/content/dam' && (
                  <button
                    type="button"
                    style={{ marginLeft: 8 }}
                    onClick={() => openBrowser(pickerMode, pickerPath.slice(0, pickerPath.lastIndexOf('/')) || '/content/dam')}
                  >
                    ↑ Up
                  </button>
                )}
              </div>
              <ul style={{ maxHeight: 140, overflowY: 'auto', paddingLeft: 16, margin: '6px 0' }}>
                {pickerListing.folders.map((f) => (
                  <li key={f.path}>
                    <button type="button" style={{ border: 'none', background: 'none', color: '#1473e6', cursor: 'pointer' }} onClick={() => openBrowser(pickerMode, f.path)}>
                      📁 {f.title}
                    </button>
                  </li>
                ))}
                {pickerMode === 'logo' &&
                  pickerListing.images.map((img) => (
                    <li key={img.assetId}>
                      <button
                        type="button"
                        style={{ border: 'none', background: 'none', color: '#047857', cursor: 'pointer' }}
                        onClick={() => {
                          setConfig({
                            ...config,
                            header: { ...config.header, logo: { assetId: img.assetId, path: img.path, tier } },
                          });
                          setPickerMode(null);
                        }}
                      >
                        🖼️ {img.name}
                      </button>
                    </li>
                  ))}
              </ul>
              {pickerMode === 'folder' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    type="text"
                    placeholder="New folder name…"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                  />
                  <button type="button" onClick={handleCreateSubfolder}>+ New</button>
                  <button
                    type="button"
                    style={{ background: '#1473e6', color: '#fff', border: 'none', borderRadius: 3 }}
                    onClick={() => {
                      setConfig({
                        ...config,
                        output: { ...config.output, targetFolder: { id: '', path: pickerPath } },
                      });
                      setPickerMode(null);
                    }}
                  >
                    Choose this folder
                  </button>
                </div>
              )}
            </section>
          )}
        </aside>

        {/* Live preview iframe */}
        <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '6px 16px', background: '#fff', borderBottom: '1px solid #e5e7eb', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span>
              {paginated?.totalAssets} assets · {paginated?.totalPages} pages · Est. PDF {formatBytes(paginated?.estimatedBytes || 0)}
            </span>
            <span style={{ color: '#b45309' }}>{(paginated?.warnings || []).join(' · ')}</span>
          </div>
          <iframe
            id="cs-live-preview-iframe"
            title="Live contact sheet preview"
            style={{ flex: 1, border: 'none', width: '100%', background: '#e9ebef' }}
            srcDoc={previewHtml}
          />
        </section>
      </div>
    </div>
  );
}
