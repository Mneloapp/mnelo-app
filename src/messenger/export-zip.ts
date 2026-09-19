// ZIP STORE with streaming data descriptors. Only the bounded central-directory
// metadata stays in memory; entry bodies are written directly to the caller's sink.
const encoder = new TextEncoder();
const MAX32 = 0xffffffff;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const record = (length: number) => {
  const bytes = new Uint8Array(length);
  return { bytes, view: new DataView(bytes.buffer) };
};
type Entry = { name: Uint8Array; offset: number; size: number; crc: number; directory: boolean };

export class ExportZip {
  private offset = 0;
  private entries: Entry[] = [];
  private paths = new Set<string>();
  private busy = false;
  private finished = false;
  constructor(
    private readonly write: (bytes: Uint8Array) => Promise<void> | void,
    private readonly check: () => void = () => undefined,
  ) {}
  get bytes() {
    return this.offset;
  }
  has(path: string) {
    return this.paths.has(path);
  }
  private async emit(bytes: Uint8Array) {
    this.check();
    if (this.offset + bytes.byteLength >= MAX32) throw new Error('EXPORT_TOO_LARGE');
    await this.write(bytes);
    this.offset += bytes.byteLength;
  }
  async add(path: string, source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>) {
    const components = path.replace(/\/$/, '').split('/');
    if (
      !path ||
      path.startsWith('/') ||
      /[\\:\u0000-\u001f\u007f]/u.test(path) ||
      components.some((part) => !part || part === '.' || part === '..') ||
      this.paths.has(path)
    )
      throw new Error('EXPORT_PATH_INVALID');
    if (this.finished || this.busy) throw new Error('EXPORT_STATE_INVALID');
    const name = encoder.encode(path);
    if (this.entries.length >= 65534 || name.length > 65535) throw new Error('EXPORT_TOO_LARGE');
    this.busy = true;
    try {
      const entry: Entry = {
        name,
        offset: this.offset,
        size: 0,
        crc: 0xffffffff,
        directory: path.endsWith('/'),
      };
      const header = record(30);
      header.view.setUint32(0, 0x04034b50, true);
      header.view.setUint16(4, 20, true);
      header.view.setUint16(6, 0x0808, true); // UTF-8 and trailing descriptor.
      header.view.setUint16(12, 0x0021, true); // Stable valid DOS date: 1980-01-01.
      header.view.setUint16(26, name.length, true);
      await this.emit(header.bytes);
      await this.emit(name);
      for await (const input of source) {
        for (let offset = 0; offset < input.length; offset += 65536) {
          const chunk = input.subarray(offset, offset + 65536);
          if (entry.size + chunk.length >= MAX32) throw new Error('EXPORT_TOO_LARGE');
          for (const byte of chunk)
            entry.crc = (entry.crc >>> 8) ^ crcTable[(entry.crc ^ byte) & 255]!;
          entry.size += chunk.length;
          await this.emit(chunk);
        }
      }
      entry.crc = (entry.crc ^ 0xffffffff) >>> 0;
      const descriptor = record(16);
      descriptor.view.setUint32(0, 0x08074b50, true);
      descriptor.view.setUint32(4, entry.crc, true);
      descriptor.view.setUint32(8, entry.size, true);
      descriptor.view.setUint32(12, entry.size, true);
      await this.emit(descriptor.bytes);
      this.entries.push(entry);
      this.paths.add(path);
    } catch (error) {
      // A partially written entry cannot be repaired on a forward-only sink.
      this.finished = true;
      throw error;
    } finally {
      this.busy = false;
    }
  }
  async finish() {
    if (this.finished || this.busy) throw new Error('EXPORT_STATE_INVALID');
    this.finished = true;
    const start = this.offset;
    for (const entry of this.entries) {
      const header = record(46);
      header.view.setUint32(0, 0x02014b50, true);
      header.view.setUint16(4, 20, true);
      header.view.setUint16(6, 20, true);
      header.view.setUint16(8, 0x0808, true);
      header.view.setUint16(14, 0x0021, true);
      header.view.setUint32(16, entry.crc, true);
      header.view.setUint32(20, entry.size, true);
      header.view.setUint32(24, entry.size, true);
      header.view.setUint16(28, entry.name.length, true);
      header.view.setUint32(38, entry.directory ? 0x10 : 0, true);
      header.view.setUint32(42, entry.offset, true);
      await this.emit(header.bytes);
      await this.emit(entry.name);
    }
    const end = record(22);
    end.view.setUint32(0, 0x06054b50, true);
    end.view.setUint16(8, this.entries.length, true);
    end.view.setUint16(10, this.entries.length, true);
    end.view.setUint32(12, this.offset - start, true);
    end.view.setUint32(16, start, true);
    await this.emit(end.bytes);
  }
}
