// Minimal TAR (USTAR) writer that emits a ReadableStream<Uint8Array> for
// streaming downloads. We build one 512-byte header per file followed by
// the file body padded to a 512-byte boundary, then two zero-filled blocks
// at the end.
//
// The pipeline's WebDataset packaging convention is one tar shard with all
// 7 files per clip sharing a basename (clip_XXXXX.{mp4,json,...}). We
// reproduce that grouping per project: every clip becomes 7 entries with
// the same prefix `<projectSlug>/<workerCode>/<sessionDate>/clip_XXXXX.<ext>`.

const BLOCK = 512;
const ZERO_BLOCK = new Uint8Array(BLOCK);

export type TarEntry = {
  name: string;
  size: number;
  body: () => AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
  mtime?: number;
};

function pad(value: number, len: number): string {
  return value.toString(8).padStart(len, "0");
}

function writeString(buf: Uint8Array, offset: number, str: string, len: number) {
  const enc = new TextEncoder().encode(str);
  for (let i = 0; i < Math.min(enc.length, len); i++) {
    buf[offset + i] = enc[i];
  }
}

function checksum(header: Uint8Array): number {
  // The checksum field (offset 148, length 8) is treated as 8 spaces during
  // the sum.
  for (let i = 148; i < 156; i++) header[i] = 0x20;
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += header[i];
  return sum;
}

function buildHeader(name: string, size: number, mtime: number): Uint8Array {
  if (name.length > 100) {
    throw new Error(`TAR entry name too long: ${name}`);
  }
  const header = new Uint8Array(BLOCK);
  writeString(header, 0, name, 100); // name
  writeString(header, 100, pad(0o644, 7) + "\0", 8); // mode
  writeString(header, 108, pad(0, 7) + "\0", 8); // uid
  writeString(header, 116, pad(0, 7) + "\0", 8); // gid
  writeString(header, 124, pad(size, 11) + "\0", 12); // size
  writeString(header, 136, pad(mtime, 11) + "\0", 12); // mtime
  // checksum placeholder (8 spaces) handled in checksum()
  header[156] = 0x30; // typeflag '0' = regular file
  // linkname empty (offset 157, 100 bytes)
  writeString(header, 257, "ustar", 6);
  writeString(header, 263, "00", 2);
  // uname/gname/devmajor/devminor empty
  // prefix empty

  const sum = checksum(header);
  writeString(header, 148, pad(sum, 6) + "\0 ", 8);
  return header;
}

export function tarStream(
  entries: AsyncIterable<TarEntry> | Iterable<TarEntry>,
): ReadableStream<Uint8Array> {
  const iter = (entries as AsyncIterable<TarEntry>)[Symbol.asyncIterator]
    ? (entries as AsyncIterable<TarEntry>)[Symbol.asyncIterator]()
    : (function* () {
        for (const e of entries as Iterable<TarEntry>) yield e;
      })();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iter.next();
      if (next.done) {
        controller.enqueue(ZERO_BLOCK);
        controller.enqueue(ZERO_BLOCK);
        controller.close();
        return;
      }
      const entry = next.value;
      const mtime = entry.mtime ?? Math.floor(Date.now() / 1000);
      controller.enqueue(buildHeader(entry.name, entry.size, mtime));

      let written = 0;
      for await (const chunk of entry.body()) {
        controller.enqueue(chunk);
        written += chunk.length;
      }
      if (written !== entry.size) {
        throw new Error(
          `TAR entry ${entry.name}: declared size ${entry.size} but wrote ${written}`,
        );
      }
      const padding = (BLOCK - (entry.size % BLOCK)) % BLOCK;
      if (padding > 0) {
        controller.enqueue(new Uint8Array(padding));
      }
    },
  });
}
