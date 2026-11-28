import { createHash } from "node:crypto";

/**
 * A one-page, blank PDF, written here so the repository holds no binary
 * fixture and the test needs no PDF library. The cross-reference table's
 * offsets are computed, so the file is valid as it stands.
 */
export function blankPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
}

/** The padding the PDF standard gives a password shorter than 32 bytes. */
const PADDING = Buffer.from(
  "28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a",
  "hex",
);

/** RC4, which the standard's oldest encryption uses, and Node no longer offers. */
function rc4(key: Buffer, data: Buffer): Buffer {
  const state = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + (state[i] as number) + (key[i % key.length] as number)) & 0xff;
    [state[i], state[j]] = [state[j] as number, state[i] as number];
  }
  const output = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let index = 0; index < data.length; index += 1) {
    i = (i + 1) & 0xff;
    j = (j + (state[i] as number)) & 0xff;
    [state[i], state[j]] = [state[j] as number, state[i] as number];
    const k = state[((state[i] as number) + (state[j] as number)) & 0xff] as number;
    output[index] = (data[index] as number) ^ k;
  }
  return output;
}

const md5 = (...parts: Buffer[]) => createHash("md5").update(Buffer.concat(parts)).digest();
const padded = (password: string) =>
  Buffer.concat([Buffer.from(password, "latin1"), PADDING]).subarray(0, 32);

/**
 * The same blank page, needing a password to open: the standard's first
 * security handler (40-bit RC4, revision 2), which every reader still
 * opens. The page has no strings or streams, so nothing in it is
 * encrypted: only the two password checks in the encryption dictionary
 * are computed, as the PDF standard's algorithms 2, 3 and 4 say. The
 * owner's password is the user's.
 */
export function lockedPdf(password: string): Buffer {
  const id = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  // Every permission granted.
  const permissions = Buffer.from([0xfc, 0xff, 0xff, 0xff]);
  const owner = rc4(md5(padded(password)).subarray(0, 5), padded(password));
  const key = md5(padded(password), owner, permissions, id).subarray(0, 5);
  const user = rc4(key, PADDING);
  const hex = (bytes: Buffer) => `<${bytes.toString("hex")}>`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] >>",
    `<< /Filter /Standard /V 1 /R 2 /O ${hex(owner)} /U ${hex(user)} /P -4 >>`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 4 0 R /ID [${hex(id)} ${hex(id)}] >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
}
