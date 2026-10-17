import { spawn } from "node:child_process";
import type { Flags } from "../args/args.types";
import { captureArgs, isDryRun } from "../git/git";

// Turns an origin URL into a web address: git@host:owner/repo.git, ssh://git@host/owner/repo
// and https://host/owner/repo all become https://host/owner/repo.
export function webUrl(remote: string): string {
  let url = remote.trim();
  const scp = /^[^@/]+@([^:]+):(.+)$/.exec(url);
  if (scp) url = `https://${scp[1]}/${scp[2]}`;
  else url = url.replace(/^ssh:\/\/([^@]+@)?/, "https://");
  url = url.replace(/\.git$/, "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(url))
    throw new Error(`origin is not a web address: ${remote}`);
  return url;
}

// gith open: opens this repository's origin in the browser.
export function open(flags: Flags): void {
  if (flags.size > 0) throw new Error("usage: gith open");
  const url = webUrl(captureArgs(["remote", "get-url", "origin"]));
  const [command, args] = openerFor(process.platform, url);
  console.log(`> ${command} ${args.join(" ")}`);
  if (isDryRun()) return;
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

// The command that opens a URL in the default browser on this platform.
function openerFor(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === "win32") return ["explorer.exe", [url]];
  if (platform === "darwin") return ["open", [url]];
  return ["xdg-open", [url]];
}
