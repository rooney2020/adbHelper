import { execFile } from "child_process";
import type { ExecFileOptions } from "child_process";
import * as iconv from "iconv-lite";

export function decodeBuffer(buf: Buffer | null | undefined): string {
  if (!buf || buf.length === 0) return "";
  // Fast path for pure ASCII
  let isAscii = true;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] > 0x7f) { isAscii = false; break; }
  }
  if (isAscii) return buf.toString("utf8");

  // Try utf8 first and detect replacement characters
  const utf8 = buf.toString("utf8");
  const replacements = (utf8.match(/\uFFFD/g) || []).length;

  // No replacement chars – utf8 parse succeeded.
  // But on Windows, a GBK byte sequence can be valid (wrong) UTF-8.
  // Sanity check: compare CJK character counts against a GBK decode.
  if (replacements === 0) {
    if (process.platform !== "win32") return utf8;
    try {
      if (iconv.encodingExists("gbk")) {
        const gbkStr = iconv.decode(buf, "gbk");
        const utf8CJK = countCJK(utf8);
        const gbkCJK = countCJK(gbkStr);
        // If GBK decode has significantly more CJK characters, the
        // original was GBK that happened to parse as valid UTF-8.
        if (gbkCJK > utf8CJK && gbkCJK > 0) return gbkStr;
      }
    } catch {
      // fallthrough
    }
    return utf8;
  }

  // UTF-8 had replacement characters; fallback to GBK
  try {
    if (iconv.encodingExists("gbk")) {
      return iconv.decode(buf, "gbk");
    }
  } catch {
    // ignore and fallthrough
  }

  return utf8;
}

function countCJK(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // CJK Unified Ideographs (U+4E00–U+9FFF)
    // CJK Extension A (U+3400–U+4DBF)
    // CJK Compatibility Ideographs (U+F900–U+FAFF)
    // Fullwidth forms & CJK punctuation
    if ((code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0x3000 && code <= 0x303F) ||
        (code >= 0xFF00 && code <= 0xFFEF)) {
      count++;
    }
  }
  return count;
}

export function execFileDecoded(file: string, args: string[] = [], options: ExecFileOptions = {}): Promise<{ stdout: string | Buffer; stderr: string | Buffer }>{
  return new Promise((resolve, reject) => {
    const maxBuf = (options && (options as any).maxBuffer) || 50 * 1024 * 1024;
    // Force binary buffers from child process; we'll convert to string when appropriate
    const opts: ExecFileOptions = { ...(options || {}), encoding: null as any, maxBuffer: maxBuf };
    execFile(file, args, opts, (err, stdoutBuf, stderrBuf) => {
      const wantsBuffer = (options as any)?.encoding === "buffer";
      if (wantsBuffer) {
        if (err) {
          (err as any).stdout = stdoutBuf;
          (err as any).stderr = stderrBuf;
          reject(err);
        } else {
          resolve({ stdout: stdoutBuf as Buffer, stderr: stderrBuf as Buffer });
        }
        return;
      }

      const stdout = decodeBuffer(stdoutBuf as Buffer);
      const stderr = decodeBuffer(stderrBuf as Buffer);
      if (err) {
        (err as any).stdout = stdout;
        (err as any).stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export default execFileDecoded;
