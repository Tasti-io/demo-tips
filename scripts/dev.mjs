#!/usr/bin/env node
// Local preview: serves public/ with clean URLs (/margins is margins.html, as
// vercel.json's cleanUrls does) and routes /api/* through the same handlers.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import week from "../api/week.js";
import statement from "../api/statement.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const API = { "/api/week": week, "/api/statement": statement };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const api = API[url.pathname];
  if (api) {
    const shim = {
      setHeader: (k, v) => res.setHeader(k, v),
      status: (c) => ({ end: (b) => { res.statusCode = c; res.end(b); } }),
    };
    return api(req, shim);
  }
  let file = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  if (!path.extname(file)) file += ".html";
  try {
    const content = await readFile(path.join(ROOT, "public", path.normalize(file).replace(/^(\.\.[/\\])+/, "")));
    res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
}).listen(3060, () => console.log("tips on http://localhost:3060"));
