import { execFile } from "child_process";
import type { ExecFileOptions } from "child_process";
import * as iconv from "iconv-lite";

function decodeBuffer(buf: Buffer | null | undefined): string {
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
  if (replacements === 0) return utf8;

  // Fallback to GBK/CP936 if available
  try {
    if (iconv.encodingExists("gbk")) {
      const gbkStr = iconv.decode(buf, "gbk");
      return gbkStr;
    }
  } catch (e) {
    // ignore and fallthrough
  }

  return utf8;
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
