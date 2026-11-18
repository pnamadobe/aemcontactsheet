// Internal demo UI slot for Firefly Boards and Adobe Express exports, including
// cross-IMS-Org target profile auto-detection and token persistence.
import React, { useEffect, useState } from 'react';

function decodeTokenClaims(rawToken) {
  try {
    const clean = String(rawToken || '').trim().replace(/^Bearer\s+/i, '');
    const parts = clean.split('.');
    if (parts.length < 2) return {};
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
}

export function useCloudCanvas({ authCtx, callAction, guestConnection }) {
  const [, setClusterProfiles] = useState([]);
  const [savedBoardsProfiles, setSavedBoardsProfiles] = useState(() => {
    try {
      const raw = window.localStorage?.getItem('cs_saved_boards_profiles');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [boardsAccountMode, setBoardsAccountMode] = useState('current');
  const [customBoardsToken, setCustomBoardsToken] = useState('');
  const [customBoardsOrgName, setCustomBoardsOrgName] = useState('');
  const [detectingBoardsOrg, setDetectingBoardsOrg] = useState(false);
  const [boardsShareEmail, setBoardsShareEmail] = useState('');
  const [invalidatedProfileIds, setInvalidatedProfileIds] = useState({});
  const [copiedExpressLink, setCopiedExpressLink] = useState(false);

  function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setCopiedExpressLink(true);
      setTimeout(() => setCopiedExpressLink(false), 5000);
    } catch {
      // ignore
    }
  }

  function syncFromPrefs(prefsRes, ctx) {
    if (Array.isArray(prefsRes?.savedBoardsProfiles) && prefsRes.savedBoardsProfiles.length > 0) {
      setSavedBoardsProfiles(prefsRes.savedBoardsProfiles);
      try {
        window.localStorage?.setItem('cs_saved_boards_profiles', JSON.stringify(prefsRes.savedBoardsProfiles));
      } catch {
        // ignore
      }
      const defId = prefsRes.defaultBoardsProfileId || prefsRes.savedBoardsProfiles[0]?.id;
      if (defId && prefsRes.savedBoardsProfiles.some((p) => p.id === defId)) {
        setBoardsAccountMode(`saved:${defId}`);
      }
    } else if (savedBoardsProfiles.length > 0) {
      const defId = prefsRes?.defaultBoardsProfileId || savedBoardsProfiles[0]?.id;
      if (defId && savedBoardsProfiles.some((p) => p.id === defId)) {
        setBoardsAccountMode(`saved:${defId}`);
      }
      callAction(
        'prefs',
        {
          method: 'PUT',
          body: {
            savedBoardsProfiles,
            defaultBoardsProfileId: defId,
          },
        },
        ctx
      ).catch(() => {});
    }
  }

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

  useEffect(() => {
    if (!Array.isArray(savedBoardsProfiles) || savedBoardsProfiles.length === 0) return;
    const nextInvalid = {};
    for (const p of savedBoardsProfiles) {
      if (p?.tokenExpired) {
        nextInvalid[p.id] = true;
      }
    }
    if (Object.keys(nextInvalid).length > 0) {
      setInvalidatedProfileIds((prev) => ({ ...prev, ...nextInvalid }));
    }
  }, [savedBoardsProfiles]);

  function isTokenExpired(rawToken, profileId = null) {
    if (profileId && invalidatedProfileIds[profileId]) return true;
    const found = profileId ? savedBoardsProfiles.find((p) => p.id === profileId) : null;
    if (found?.tokenExpired) return true;
    const claims = decodeTokenClaims(rawToken);
    const created = Number(claims.created_at);
    const expiresIn = Number(claims.expires_in);
    if (created > 0 && expiresIn > 0) {
      return Date.now() > created + expiresIn - 60_000;
    }
    if (Number(claims.exp) > 0) {
      return Date.now() > Number(claims.exp) * 1000 - 60_000;
    }
    return false;
  }

  async function handleCustomBoardsTokenChange(val) {
    setCustomBoardsToken(val);
    const clean = String(val || '').trim().replace(/^Bearer\s+/i, '');
    if (clean.split('.').length < 2) return;

    const claims = decodeTokenClaims(clean);
    const fallbackName = claims.org
      ? `${claims.org.replace('@AdobeOrg', '')}${claims.email ? ` (${claims.email})` : ''}`
      : claims.email || claims.name || 'Firefly Boards Org';
    if (!customBoardsOrgName) {
      setCustomBoardsOrgName(fallbackName);
    }

    setDetectingBoardsOrg(true);
    try {
      const [orgsRes, profRes] = await Promise.all([
        fetch('https://ims-na1.adobelogin.com/ims/organizations/v6', {
          headers: { Authorization: `Bearer ${clean}` },
        })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
        fetch('https://ims-na1.adobelogin.com/ims/profile/v1', {
          headers: { Authorization: `Bearer ${clean}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      const orgList = Array.isArray(orgsRes) ? orgsRes : orgsRes?.organizations || [];
      const targetOrgId = String(claims.org || '').toLowerCase();
      let resolvedOrgName = '';
      for (const o of orgList) {
        const ident = o?.orgRef?.ident ? `${o.orgRef.ident}@${o.orgRef.authSrc || 'AdobeOrg'}` : o?.orgId || '';
        if (targetOrgId && ident.toLowerCase() === targetOrgId && o?.orgName) {
          resolvedOrgName = o.orgName;
          break;
        }
      }
      if (!resolvedOrgName && orgList.length === 1 && orgList[0]?.orgName) {
        resolvedOrgName = orgList[0].orgName;
      }
      const emailStr = profRes?.email || claims.email || '';
      if (resolvedOrgName) {
        setCustomBoardsOrgName(`${resolvedOrgName}${emailStr ? ` (${emailStr})` : ''}`);
      } else if (profRes?.displayName && !claims.org) {
        setCustomBoardsOrgName(`${profRes.displayName} (Personal)`);
      }
    } catch {
      // keep fallbackName
    } finally {
      setDetectingBoardsOrg(false);
    }
  }

  async function handleSaveBoardsProfile() {
    const cleanToken = customBoardsToken.trim().replace(/^Bearer\s+/i, '');
    if (!cleanToken) return null;
    const claims = decodeTokenClaims(cleanToken);
    const existingSaved = boardsAccountMode.startsWith('saved:')
      ? savedBoardsProfiles.find((p) => p.id === boardsAccountMode.slice('saved:'.length))
      : null;
    const name =
      customBoardsOrgName.trim() ||
      existingSaved?.name ||
      (claims.org ? claims.org.replace('@AdobeOrg', '') : '') ||
      claims.email ||
      'Firefly Boards Org';
    const id = existingSaved?.id || `bprof_${(claims.org || name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)}`;
    const entry = {
      id,
      name,
      orgId: claims.org || '',
      email: claims.email || '',
      token: cleanToken,
      tokenExpired: false,
      updatedAt: new Date().toISOString(),
    };
    setInvalidatedProfileIds((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const nextList = [...savedBoardsProfiles.filter((p) => p.id !== id && p.name !== name), entry];
    setSavedBoardsProfiles(nextList);
    setBoardsAccountMode(`saved:${id}`);
    setCustomBoardsToken('');
    setCustomBoardsOrgName('');
    try {
      window.localStorage?.setItem('cs_saved_boards_profiles', JSON.stringify(nextList));
    } catch {
      // ignore
    }
    callAction('prefs', {
      method: 'PUT',
      body: {
        savedBoardsProfiles: nextList,
        defaultBoardsProfileId: id,
      },
    }).catch(() => {});
    guestConnection?.host?.toast?.display?.({
      variant: 'positive',
      message: `Saved Firefly Boards org "${name}".`,
    });
    return entry;
  }

  async function handleRemoveSavedBoardsProfile(id) {
    const nextList = savedBoardsProfiles.filter((p) => p.id !== id);
    setSavedBoardsProfiles(nextList);
    setBoardsAccountMode(nextList[0] ? `saved:${nextList[0].id}` : 'current');
    try {
      window.localStorage?.setItem('cs_saved_boards_profiles', JSON.stringify(nextList));
    } catch {
      // ignore
    }
    callAction('prefs', {
      method: 'PUT',
      body: {
        savedBoardsProfiles: nextList,
        defaultBoardsProfileId: nextList[0]?.id || null,
      },
    }).catch(() => {});
  }

  async function resolveBoardsBearerToken() {
    if (boardsAccountMode.startsWith('saved:')) {
      const id = boardsAccountMode.slice('saved:'.length);
      const saved = savedBoardsProfiles.find((p) => p.id === id);
      if (customBoardsToken.trim()) {
        const refreshed = await handleSaveBoardsProfile();
        if (refreshed?.token) return refreshed.token;
      }
      if (saved?.token) {
        if (isTokenExpired(saved.token, saved.id)) {
          throw new Error(
            `Your saved token for "${saved.name}" has expired or was logged out — please paste a fresh token from Firefly Boards or Adobe Express in the Target IMS Org section.`
          );
        }
        callAction('prefs', {
          method: 'PUT',
          body: { defaultBoardsProfileId: id },
        }).catch(() => {});
        return saved.token;
      }
    }
    if (boardsAccountMode === 'custom' && customBoardsToken.trim()) {
      const savedEntry = await handleSaveBoardsProfile();
      return savedEntry?.token || customBoardsToken.trim().replace(/^Bearer\s+/i, '');
    }
    return null;
  }

  return {
    enabled: true,
    syncFromPrefs,
    async prepareGeneratePayload(outputFormat = 'pdf') {
      const isCloudCanvas = outputFormat === 'boards' || outputFormat === 'express';
      const boardsBearerToken = isCloudCanvas ? await resolveBoardsBearerToken() : null;
      return {
        outputFormat,
        extraBody: isCloudCanvas
          ? {
              boardsBearerToken,
              boardsShareEmail: boardsShareEmail.trim() || null,
            }
          : {},
      };
    },
    isCloudCanvasDirectResult(r = {}) {
      return (
        r.outputFormat === 'boards' ||
        Boolean(r.boardUrl) ||
        (r.outputFormat === 'express' && r.expressMode === 'direct')
      );
    },
    getToastMessage(outputFormat, title) {
      if (outputFormat === 'boards') return `Firefly Board "${title}" is ready.`;
      if (outputFormat === 'express') return `Adobe Express document "${title}" is ready.`;
      return `Contact sheet "${title}" is ready.`;
    },
    getProgressOverride(activeOutputFormat, done, total) {
      if (activeOutputFormat === 'boards') {
        return {
          heading: 'Building Firefly Board…',
          detail: `Placing asset cards and metadata lines on canvas (${done} / ${total})…`,
          barColor: 'var(--s2-purple)',
        };
      }
      if (activeOutputFormat === 'express') {
        return {
          heading: 'Building Adobe Express document…',
          detail: `Creating multi-page editable Adobe Express project (${done} / ${total})…`,
          barColor: 'var(--s2-purple)',
        };
      }
      return null;
    },
    renderTopBarButtons(onGenerate) {
      return (
        <>
          <button
            className="s2-btn"
            style={{ borderColor: '#6e56cf', color: '#5b3fd1', fontWeight: 600 }}
            onClick={() => onGenerate('express')}
          >
            Open in Adobe Express
          </button>
          <button className="s2-btn s2-btn-boards" onClick={() => onGenerate('boards')}>
            Send to Firefly Boards
          </button>
        </>
      );
    },
    renderInspectorSection() {
      const selectedSaved = boardsAccountMode.startsWith('saved:')
        ? savedBoardsProfiles.find((p) => p.id === boardsAccountMode.slice('saved:'.length))
        : null;
      const selectedExpired = Boolean(selectedSaved && isTokenExpired(selectedSaved.token, selectedSaved.id));
      const showTokenEditor = boardsAccountMode === 'custom' || selectedExpired;

      return (
        <div className="s2-field" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--s2-border-subtle)' }}>
          <label className="s2-label">Firefly Boards / Adobe Express Target IMS Org</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              className="s2-select"
              value={boardsAccountMode}
              onChange={(e) => {
                const nextVal = e.target.value;
                setBoardsAccountMode(nextVal);
                if (nextVal.startsWith('saved:')) {
                  const sel = savedBoardsProfiles.find((p) => p.id === nextVal.slice('saved:'.length));
                  if (sel && isTokenExpired(sel.token, sel.id)) {
                    setCustomBoardsOrgName(sel.name);
                  }
                }
              }}
            >
              <option value="current">
                Current AEM Org ({authCtx?.imsOrg?.replace('@AdobeOrg', '') || 'Default'}) + Auto-share link
              </option>
              {savedBoardsProfiles.length > 0 && (
                <optgroup label="Saved Target Orgs (Firefly Boards & Express)">
                  {savedBoardsProfiles.map((p) => {
                    const expired = isTokenExpired(p.token, p.id);
                    return (
                      <option key={p.id} value={`saved:${p.id}`}>
                        ★ {p.name}{expired ? ' (Token expired — refresh below)' : ''}
                      </option>
                    );
                  })}
                </optgroup>
              )}
              <option value="custom">+ Add / Save Another IMS Org Token…</option>
            </select>
            {boardsAccountMode.startsWith('saved:') && (
              <button
                type="button"
                className="s2-btn s2-btn-sm"
                style={{ height: 32 }}
                title="Remove saved org token"
                onClick={() => handleRemoveSavedBoardsProfile(boardsAccountMode.slice('saved:'.length))}
              >
                ✕
              </button>
            )}
          </div>

          {showTokenEditor && (
            <div style={{ marginTop: 8, padding: 10, borderRadius: 6, background: 'var(--s2-bg-base)', border: '1px solid var(--s2-border-subtle)' }}>
              {selectedExpired && (
                <div className="s2-banner-warn" style={{ marginBottom: 8, padding: '6px 8px', fontSize: 11.5 }}>
                  Saved token for <strong>{selectedSaved.name}</strong> has expired. Paste a fresh token below to update it.
                </div>
              )}
              <label className="s2-label">
                1. Paste Bearer Token from Target Firefly Boards or Adobe Express Tab
              </label>
              <input
                className="s2-input"
                type="password"
                placeholder="Paste Bearer token (auto-detects IMS Org name)…"
                value={customBoardsToken}
                onChange={(e) => handleCustomBoardsTokenChange(e.target.value)}
              />
              <div style={{ fontSize: 11, color: 'var(--s2-text-muted)', marginTop: 4 }}>
                Tip: In your Firefly Boards or Adobe Express tab DevTools console, run{' '}
                <code style={{ background: '#fff', padding: '1px 4px', borderRadius: 3 }}>
                  copy(window.adobeIMS.getAccessToken().token)
                </code>
              </div>

              <label className="s2-label" style={{ marginTop: 8 }}>
                2. Org / Profile Name {detectingBoardsOrg ? '(Detecting org name…)' : '(Auto-detected or custom)'}
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="s2-input"
                  type="text"
                  placeholder="e.g. Adobe Corp / Creative Studio Org"
                  value={customBoardsOrgName || (selectedSaved?.name ?? '')}
                  onChange={(e) => setCustomBoardsOrgName(e.target.value)}
                />
                <button
                  type="button"
                  className="s2-btn s2-btn-accent s2-btn-sm"
                  style={{ height: 32 }}
                  disabled={!customBoardsToken.trim()}
                  onClick={handleSaveBoardsProfile}
                >
                  {selectedExpired ? 'Update Token' : 'Save Org'}
                </button>
              </div>
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
      );
    },
    renderCompletionCard({ r, config, warnings, readyDownloadUrl, tier, onBack, onClose, formatBytes }) {
      const isBoards = r.outputFormat === 'boards' || Boolean(r.boardUrl);
      const isExpress = r.outputFormat === 'express' || Boolean(r.expressUrl);
      const isExpressDirect = isExpress && r.expressMode === 'direct';
      if (!isBoards && !isExpress) return null;

      return (
        <div className="s2-state-card">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 999, background: 'var(--s2-positive-subtle)', color: 'var(--s2-positive)', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
            ✓{' '}
            {isBoards
              ? 'Firefly Board Created'
              : isExpressDirect
              ? 'Adobe Express Document Created'
              : 'Ready for Adobe Express'}
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: 19 }}>
            {config.header.title || r.fileName}
          </h3>
          {isBoards ? (
            <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--s2-text-secondary)' }}>
              {r.placedCards ?? r.assets} asset cards with separate editable metadata lines placed on your Firefly Board.
            </p>
          ) : isExpressDirect ? (
            <>
              <p style={{ margin: '0 0 10px', fontSize: 13.5, color: 'var(--s2-text-secondary)' }}>
                {r.pages} {r.pages === 1 ? 'page' : 'pages'} · {r.assets} assets converted into a multi-page editable Adobe Express document.
              </p>
              {r.expressUrl && (
                <div className="s2-asset-selector-row" style={{ marginBottom: 14, gap: 8 }}>
                  <span className="s2-asset-selector-path" style={{ userSelect: 'all' }} title={r.expressUrl}>
                    {r.expressUrl}
                  </span>
                  <button
                    type="button"
                    className="s2-btn s2-btn-sm"
                    onClick={() => copyTextToClipboard(r.expressUrl)}
                  >
                    {copiedExpressLink ? '✓ Copied' : 'Copy Link'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 10px', fontSize: 13.5, color: 'var(--s2-text-secondary)' }}>
                {r.pages} {r.pages === 1 ? 'page' : 'pages'} · {r.assets} assets · {formatBytes(r.bytes)}
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--s2-text-secondary)', lineHeight: 1.45 }}>
                Click <strong>Download PDF &amp; Copy Express Link</strong> below, paste (<code>Cmd+V</code>) into a new browser tab, and drop the PDF into{' '}
                <strong>Start from your content</strong> in Adobe Express.
              </p>
              {r.aemPath && (
                <div className="s2-asset-selector-row" style={{ marginBottom: 14 }}>
                  <span className="s2-asset-selector-path" title={r.aemPath}>{r.aemPath}</span>
                </div>
              )}
            </>
          )}

          {(warnings || []).map((w, i) => (
            <div key={i} className="s2-banner-warn" style={{ margin: '0 0 12px' }}>{w}</div>
          ))}

          {copiedExpressLink && (
            <div
              style={{
                margin: '0 0 12px',
                padding: '8px 12px',
                borderRadius: 6,
                background: 'var(--s2-positive-subtle)',
                color: 'var(--s2-positive)',
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              ✓ Adobe Express link copied to clipboard! Open a new browser tab (Cmd+T) and paste (Cmd+V).
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="s2-btn s2-btn-quiet" onClick={onBack}>
              Back to editor
            </button>
            {!isBoards && !isExpressDirect && r.aemPath && tier === 'author' && (
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
            ) : isExpressDirect && r.expressUrl ? (
              <button
                type="button"
                className="s2-btn s2-btn-boards"
                onClick={() => copyTextToClipboard(r.expressUrl)}
              >
                {copiedExpressLink ? '✓ Express Link Copied (Paste in New Tab)' : 'Copy Adobe Express Link'}
              </button>
            ) : readyDownloadUrl ? (
              <a
                className="s2-btn s2-btn-boards"
                href={readyDownloadUrl}
                download={r.fileName || 'contact-sheet.pdf'}
                onClick={() => {
                  copyTextToClipboard(r.expressUrl || 'https://new.express.adobe.com/');
                }}
              >
                {copiedExpressLink ? '✓ Downloaded & Express Link Copied!' : 'Download PDF & Copy Express Link'}
              </a>
            ) : null}
            <button className="s2-btn" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      );
    },
  };
}
