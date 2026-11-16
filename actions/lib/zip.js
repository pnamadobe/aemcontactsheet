// Zero-dependency ZIP archive builder (STORE method, level 0) for packaging index.html + JPEG/PNG thumbnails
// for Adobe PDF Services HTML-to-PDF. Since JPEGs and PNGs are already compressed, STORE is fastest and smallest CPU.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Build a standard ZIP Buffer from an array of `{ name: string, data: Buffer | string }`.
 * `index.html` must be at the top level of the archive per Adobe PDF Services requirements.
 */
export function buildZipBuffer(entries = []) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/^\/+/, ''), 'utf8');
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    // Local file header (30 bytes + name)
    const localHdr = Buffer.alloc(30);
    localHdr.writeUInt32LE(0x04034b50, 0); // signature
    localHdr.writeUInt16LE(20, 4); // version needed
    localHdr.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHdr.writeUInt16LE(0, 8); // compression: 0 = STORE
    localHdr.writeUInt16LE(0, 10); // mod time
    localHdr.writeUInt16LE(0x21, 12); // mod date
    localHdr.writeUInt32LE(crc, 14);
    localHdr.writeUInt32LE(size, 18); // compressed size
    localHdr.writeUInt32LE(size, 22); // uncompressed size
    localHdr.writeUInt16LE(nameBuf.length, 26);
    localHdr.writeUInt16LE(0, 28); // extra len

    localParts.push(localHdr, nameBuf, dataBuf);

    // Central directory header (46 bytes + name)
    const centralHdr = Buffer.alloc(46);
    centralHdr.writeUInt32LE(0x02014b50, 0); // signature
    centralHdr.writeUInt16LE(20, 4); // version made by
    centralHdr.writeUInt16LE(20, 6); // version needed
    centralHdr.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHdr.writeUInt16LE(0, 10); // compression: STORE
    centralHdr.writeUInt16LE(0, 12);
    centralHdr.writeUInt16LE(0x21, 14);
    centralHdr.writeUInt32LE(crc, 16);
    centralHdr.writeUInt32LE(size, 20);
    centralHdr.writeUInt32LE(size, 24);
    centralHdr.writeUInt16LE(nameBuf.length, 28);
    centralHdr.writeUInt16LE(0, 30); // extra
    centralHdr.writeUInt16LE(0, 32); // comment
    centralHdr.writeUInt16LE(0, 34); // disk
    centralHdr.writeUInt16LE(0, 36); // internal attrs
    centralHdr.writeUInt32LE(0, 38); // external attrs
    centralHdr.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralHdr, nameBuf);
    offset += localHdr.length + nameBuf.length + size;
  }

  const centralDirSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}
