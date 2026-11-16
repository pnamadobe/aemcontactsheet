import React, { useEffect, useState } from 'react';
import { attach } from '@adobe/uix-guest';
import { CONTENT_HUB_EXTENSION_ID } from '../../../../shared-ui/constants.js';
import ContactSheetDialog from '../../../../shared-ui/components/ContactSheetDialog.js';

export default function ContactSheetModal() {
  const [guestConnection, setGuestConnection] = useState(null);
  const [source, setSource] = useState(null);

  useEffect(() => {
    (async () => {
      const conn = await attach({ id: CONTENT_HUB_EXTENSION_ID });
      setGuestConnection(conn);
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const rawSource = params.get('source');
      if (rawSource) {
        setSource(JSON.parse(rawSource));
      }
    })();
  }, []);

  if (!guestConnection || !source) {
    return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Connecting to Content Hub…</div>;
  }

  return (
    <ContactSheetDialog
      guestConnection={guestConnection}
      source={source}
      tier="delivery"
      actionBaseUrl="/api/v1/web/contactsheet"
    />
  );
}
