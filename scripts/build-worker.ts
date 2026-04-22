import { build, stop } from "esbuild";

type StaticAsset = {
  contentType: string;
  body: string;
};

const distDir = new URL("../dist/", import.meta.url);
const tempEntryFile = new URL(
  "../dist/worker-entry.generated.ts",
  import.meta.url,
);
const workerFile = new URL("../dist/worker.js", import.meta.url);
const assets: Record<string, StaticAsset> = {};

function contentTypeFor(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".woff2")) return "font/woff2";
  if (path.endsWith(".woff")) return "font/woff";
  return "application/octet-stream";
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

async function collectAssets(dir: URL, prefix = ""): Promise<void> {
  for await (const entry of Deno.readDir(dir)) {
    const relativePath = `${prefix}${entry.name}`;
    const url = new URL(entry.name, dir);
    if (entry.isDirectory) {
      await collectAssets(new URL(`${entry.name}/`, dir), `${relativePath}/`);
      continue;
    }
    if (
      !entry.isFile ||
      relativePath === "worker.js" ||
      relativePath === "worker-entry.generated.ts"
    ) {
      continue;
    }
    const bytes = await Deno.readFile(url);
    assets[relativePath] = {
      contentType: contentTypeFor(relativePath),
      body: bytesToBase64(bytes),
    };
  }
}

function createEntrySource(): string {
  return `import { createExcelAppFromEnv } from "../src/server.ts";
import type { ExcelRuntimeEnv } from "../src/server.ts";

type RuntimeEnv = ExcelRuntimeEnv;

const ASSETS = ${JSON.stringify(assets, null, 2)};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isNavigationRequest(request: Request): boolean {
  return request.method === "GET" &&
    (request.headers.get("accept") ?? "").includes("text/html");
}

function hasFileExtension(pathname: string): boolean {
  const segment = pathname.split("/").pop() ?? "";
  return segment.includes(".");
}

function resolveAssetPath(request: Request): string {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "" || pathname === "/") return "index.html";
  if (pathname.endsWith("/")) pathname += "index.html";
  return pathname.startsWith("/") ? pathname.slice(1) : pathname;
}

function createAssetResponse(assetPath: string, request: Request): Response {
  const asset = ASSETS[assetPath];
  if (!asset) return new Response("Not found", { status: 404 });

  const body = request.method === "HEAD" ? null : decodeBase64(asset.body);
  return new Response(body, {
    headers: {
      "content-type": asset.contentType,
      "cache-control": assetPath === "index.html"
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    },
  });
}

let app: ReturnType<typeof createExcelAppFromEnv> | null = null;

function getApp(env: RuntimeEnv): ReturnType<typeof createExcelAppFromEnv> {
  app ??= createExcelAppFromEnv(env);
  return app;
}

function withManagedWorkerDefaults(env: RuntimeEnv): RuntimeEnv {
  return {
    ...env,
    TAKOS_NATIVE_RENDERING: env.TAKOS_NATIVE_RENDERING ?? "0",
  };
}

export default {
  fetch(request: Request, env: RuntimeEnv, ctx: unknown) {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname === "/mcp" ||
      url.pathname === "/health" ||
      url.pathname === "/healthz"
    ) {
      const runtimeEnv = withManagedWorkerDefaults(env);
      return getApp(runtimeEnv).fetch(request, runtimeEnv, ctx);
    }

    const assetPath = resolveAssetPath(request);
    const resolvedAsset = ASSETS[assetPath]
      ? assetPath
      : (!hasFileExtension(assetPath) && isNavigationRequest(request))
      ? "index.html"
      : undefined;

    if (!resolvedAsset) return new Response("Not found", { status: 404 });
    return createAssetResponse(resolvedAsset, request);
  },
};
`;
}

await collectAssets(distDir);
await Deno.writeTextFile(tempEntryFile, createEntrySource());

try {
  await build({
    entryPoints: [tempEntryFile.pathname],
    outfile: workerFile.pathname,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    conditions: ["workerd", "worker", "browser"],
    external: ["canvas", "node:*"],
    logLevel: "warning",
  });
} finally {
  stop();
  await Deno.remove(tempEntryFile).catch(() => undefined);
}
