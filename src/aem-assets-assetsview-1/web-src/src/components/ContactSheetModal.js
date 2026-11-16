import React, { useEffect, useState } from 'react';
import { attach } from '@adobe/uix-guest';
import { ASSETS_VIEW_EXTENSION_ID } from '../../../../shared-ui/constants.js';
import ContactSheetDialog from '../../../../shared-ui/components/ContactSheetDialog.js';

export default function ContactSheetModal() {
  const [guestConnection, setGuestConnection] = useState(null);
  const [source, setSource] = useState(null);

  useEffect(() => {
    (async () => {
      const conn = await attach({ id: ASSETS_VIEW_EXTENSION_ID });
      setGuestConnection(conn);
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const rawSource = params.get('source');
      if (rawSource) {
        setSource(JSON.parse(rawSource));
      } else {
        const payload = await conn.host?.modal?.getPayload?.().catch(() => null);
        setSource(payload?.source || { kind: 'folder', id: '', path: '/content/dam' });
      }
    })();
  }, []);

  if (!guestConnection || !source) {
    return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Connecting to AEM Assets View…</div>;
  }

  return (
    <ContactSheetDialog
      guestConnection={guestConnection}
      source={source}
      tier="author"
      actionBaseUrl="/api/v1/web/contactsheet"
    />
  );
}
