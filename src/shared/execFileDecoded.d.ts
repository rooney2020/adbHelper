import type { ExecFileOptions } from "child_process";
export declare function decodeBuffer(buf: Buffer | null | undefined): string;
export declare function execFileDecoded(file: string, args?: string[], options?: ExecFileOptions): Promise<{
    stdout: string | Buffer;
    stderr: string | Buffer;
}>;
export default execFileDecoded;
