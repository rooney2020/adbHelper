import { execFile } from "child_process";
import * as iconv from "iconv-lite";
function decodeBuffer(buf) {
    if (!buf || buf.length === 0)
        return "";
    // Fast path for pure ASCII
    let isAscii = true;
    for (let i = 0; i < buf.length; i++) {
        if (buf[i] > 0x7f) {
            isAscii = false;
            break;
        }
    }
    if (isAscii)
        return buf.toString("utf8");
    // Try utf8 first and detect replacement characters
    const utf8 = buf.toString("utf8");
    const replacements = (utf8.match(/\uFFFD/g) || []).length;
    if (replacements === 0)
        return utf8;
    // Fallback to GBK/CP936 if available
    try {
        if (iconv.encodingExists("gbk")) {
            const gbkStr = iconv.decode(buf, "gbk");
            return gbkStr;
        }
    }
    catch (e) {
        // ignore and fallthrough
    }
    return utf8;
}
export function execFileDecoded(file, args = [], options = {}) {
    return new Promise((resolve, reject) => {
        const maxBuf = (options && options.maxBuffer) || 50 * 1024 * 1024;
        // Force binary buffers from child process; we'll convert to string when appropriate
        const opts = { ...(options || {}), encoding: null, maxBuffer: maxBuf };
        execFile(file, args, opts, (err, stdoutBuf, stderrBuf) => {
            const wantsBuffer = options?.encoding === "buffer";
            if (wantsBuffer) {
                if (err) {
                    err.stdout = stdoutBuf;
                    err.stderr = stderrBuf;
                    reject(err);
                }
                else {
                    resolve({ stdout: stdoutBuf, stderr: stderrBuf });
                }
                return;
            }
            const stdout = decodeBuffer(stdoutBuf);
            const stderr = decodeBuffer(stderrBuf);
            if (err) {
                err.stdout = stdout;
                err.stderr = stderr;
                reject(err);
            }
            else {
                resolve({ stdout, stderr });
            }
        });
    });
}
export default execFileDecoded;
