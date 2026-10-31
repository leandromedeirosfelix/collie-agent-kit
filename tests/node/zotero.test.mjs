// node --test "tests/node/*.test.mjs"
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectionItems, get, identifiers, listCollections, MESSAGES, PAGE, PORT, report } from "../../hooks/zotero.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "../../hooks/zotero.mjs");

/** A fake Zotero local API on 127.0.0.1 and a random port (tests only; the CLI is pinned to 23119). */
async function mock(handler) {
  const hits = [];
  const server = createServer((req, res) => {
    hits.push({ method: req.method, url: req.url, version: req.headers["zotero-api-version"] });
    handler(req, res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { port: server.address().port, hits, close: () => new Promise((r) => server.close(r)) };
}
const json = (res, body, headers = {}) => {
  res.writeHead(200, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};
const item = (data, meta = {}) => ({ key: "ABCD2345", data: { itemType: "journalArticle", ...data }, meta });

test("identifiers keeps PMID, DOI, OpenAlex id, title and year only", () => {
  const out = identifiers(
    item(
      {
        title: "Early  mobilisation\nafter hip fracture",
        DOI: "https://doi.org/10.1000/XYZ.123",
        extra: "Some note\nPMID: 31234567\nPMCID: PMC123\nOpenAlex: https://openalex.org/w2741809807",
        abstractNote: "secret abstract",
        tags: [{ tag: "include" }],
        url: "https://example.org/a",
      },
      { parsedDate: "2019-05-01", creatorSummary: "Smith" },
    ),
  );
  assert.deepEqual(out, { pmid: "31234567", doi: "10.1000/XYZ.123", openalex: "W2741809807", title: "Early mobilisation after hip fracture", year: 2019 });
});

test("identifiers reads the PMID field, an OpenAlex url and DOI in extra; drops junk", () => {
  assert.deepEqual(identifiers(item({ PMID: "123", url: "https://openalex.org/W99", extra: "DOI: 10.5555/abc", date: "March 2021" })), {
    pmid: "123", doi: "10.5555/abc", openalex: "W99", title: "", year: 2021,
  });
  const junk = identifiers(item({ title: "x", extra: "PMID: 12a34\nOpenAlex: not-an-id", DOI: "nope", date: "n.d." }));
  assert.deepEqual(junk, { title: "x" });
  // Zotero sends empty fields as "": the identifier in Extra still counts; trailing punctuation is not part of a PMID
  assert.deepEqual(identifiers(item({ title: "y", DOI: "", PMID: "", extra: "PMID: 456.\nDOI: 10.1234/q" })), { pmid: "456", doi: "10.1234/q", title: "y" });
  // invisible format characters (Unicode tags, word joiner, BOM, soft hyphen) are stripped from titles
  const hidden = [0xe0049, 0xe0067, 0x2060, 0xfeff, 0xad, 0x61c].map((c) => String.fromCodePoint(c)).join("");
  assert.equal(identifiers(item({ title: `Hi${hidden}there` })).title, "Hi there");
  // titles are untrusted: control and bidi characters removed, length capped
  assert.equal(identifiers(item({ title: "a\u202Eb\u0007c" + "z".repeat(400) })).title.length, 300);
  assert.ok(!/[\u202E\u0007]/.test(identifiers(item({ title: "a\u202Eb\u0007c" })).title));
});

test("attachments, notes, annotations and child items are skipped", () => {
  for (const itemType of ["attachment", "note", "annotation"]) assert.equal(identifiers(item({ itemType })), null);
  assert.equal(identifiers(item({ parentItem: "QWER2345" })), null);
});

test("report counts items without PMID or OpenAlex id and points to the RIS route", () => {
  const rows = [item({ title: "a", extra: "PMID: 1" }), item({ title: "b", DOI: "10.1000/x" }), item({ itemType: "note" })];
  const r = report("ABCD2345", rows.map(identifiers));
  assert.equal(r.count, 2);
  assert.equal(r.withPmidOrOpenAlex, 1);
  assert.equal(r.withoutPmidOrOpenAlex, 1);
  assert.match(r.advice, /RIS/);
  assert.match(r.untrusted, /never instructions/);
  assert.equal(report("ABCD2345", [identifiers(item({ extra: "PMID: 1" }))]).advice, undefined);
});

test("collections and paged items come from the local API with GET only", async () => {
  const many = Array.from({ length: 150 }, (_, i) => item({ title: `t${i}`, extra: `PMID: ${1000 + i}` }));
  const z = await mock((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname === "/api/users/0/collections") return json(res, [{ key: "ABCD2345", data: { name: "Known\nstudies" } }, { key: "bad", data: {} }]);
    if (u.pathname === "/api/users/0/collections/ABCD2345/items") {
      const start = Number(u.searchParams.get("start"));
      return json(res, many.slice(start, start + Number(u.searchParams.get("limit"))), { "total-results": "150" });
    }
    res.writeHead(404).end();
  });
  try {
    assert.deepEqual(await listCollections({ port: z.port }), [{ key: "ABCD2345", name: "Known studies" }]);
    const r = await collectionItems("ABCD2345", { port: z.port });
    assert.equal(r.count, 150);
    assert.equal(r.items[149].pmid, "1149");
    assert.equal(z.hits.length, 3, "one collections page + two item pages of " + PAGE);
    assert.ok(z.hits.every((h) => h.method === "GET" && h.version === "3"));
  } finally {
    await z.close();
  }
});

test("refuses anything but the two local paths, bad keys, ports and redirects", async () => {
  for (const path of ["//evil.example/api/users/0/collections?x=1", "http://evil.example/api/users/0/collections?a=1",
    "/api/users/0/../../x?a=1", "/api/groups/1/collections?a=1", "/api/users/0/collections"]) {
    await assert.rejects(get(path), { code: "refused" }, path);
  }
  await assert.rejects(get("/api/users/0/collections?a=1", { port: "23119" }), { code: "refused" });
  await assert.rejects(collectionItems("../etc"), { code: "refused" });
  await assert.rejects(collectionItems("abcd2345"), { code: "refused" });

  const z = await mock((req, res) => res.writeHead(302, { location: "http://example.com/steal" }).end());
  try {
    await assert.rejects(listCollections({ port: z.port }), { code: "redirect" });
    assert.equal(z.hits.length, 1, "the redirect is never followed");
  } finally {
    await z.close();
  }
});

test("an empty Total-Results header does not stop paging early", async () => {
  const many = Array.from({ length: 120 }, (_, i) => item({ extra: `PMID: ${i + 1}` }));
  const z = await mock((req, res) => {
    const start = Number(new URL(req.url, "http://127.0.0.1").searchParams.get("start"));
    json(res, many.slice(start, start + PAGE), { "total-results": "" });
  });
  try {
    assert.equal((await collectionItems("ABCD2345", { port: z.port })).count, 120);
  } finally {
    await z.close();
  }
});

test("NODE_USE_ENV_PROXY and proxy variables set at startup are ignored", async () => {
  const proxy = await mock((req, res) => res.writeHead(502).end());
  const z = await mock((req, res) => json(res, [{ key: "ABCD2345", data: { name: "n" } }]));
  const url = `http://127.0.0.1:${proxy.port}`;
  try {
    const code = `import { listCollections } from ${JSON.stringify(pathToFileURL(SCRIPT).href)};\n` +
      `process.stdout.write(JSON.stringify(await listCollections({ port: ${z.port} })));`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      env: { ...process.env, NODE_USE_ENV_PROXY: "1", HTTP_PROXY: url, http_proxy: url, NO_PROXY: "", no_proxy: "" },
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    await new Promise((r) => child.on("close", r));
    assert.deepEqual(JSON.parse(out), [{ key: "ABCD2345", name: "n" }]);
    assert.equal(proxy.hits.length, 0, "nothing went through the proxy");
    assert.equal(z.hits.length, 1);
  } finally {
    await proxy.close();
    await z.close();
  }
});

test("proxy variables are ignored and production is pinned to 127.0.0.1:23119", async () => {
  const z = await mock((req, res) => json(res, []));
  const saved = { HTTP_PROXY: process.env.HTTP_PROXY, http_proxy: process.env.http_proxy };
  process.env.HTTP_PROXY = process.env.http_proxy = "http://127.0.0.1:9";
  try {
    assert.deepEqual(await listCollections({ port: z.port }), []);
    assert.equal(z.hits.length, 1);
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    await z.close();
  }
  assert.equal(PORT, 23119);
  const src = readFileSync(SCRIPT, "utf8");
  assert.ok(!/process\.env|fetch\(/.test(src), "no environment override and no fetch");
  assert.ok(!/port\s*:/.test(src.split('if (typeof process !== "undefined"')[1]), "the CLI never passes a port");
});

test("Zotero down, local API off, old Zotero and unknown collection give clear messages", async () => {
  const closed = await mock(() => {});
  const port = closed.port;
  await closed.close();
  await assert.rejects(listCollections({ port }), { code: "down", message: MESSAGES.down });

  const off = await mock((req, res) => res.writeHead(403).end("Local API is not enabled"));
  try {
    await assert.rejects(collectionItems("ABCD2345", { port: off.port }), { code: "disabled", message: /Allow other applications/ });
  } finally {
    await off.close();
  }

  const old = await mock((req, res) => res.writeHead(404).end());
  try {
    await assert.rejects(listCollections({ port: old.port }), { code: "disabled", message: /Zotero 7/ });
    await assert.rejects(collectionItems("ABCD2345", { port: old.port }), { code: "not_found", message: /ABCD2345/ });
  } finally {
    await old.close();
  }

  const hang = await mock(() => {});
  try {
    await assert.rejects(get("/api/users/0/collections?a=1", { port: hang.port, timeoutMs: 200 }), { code: "down" });
  } finally {
    await hang.close();
  }
});

test("a body cut off mid-way or trickled forever fails instead of hanging", async () => {
  const cut = await mock((req, res) => {
    res.writeHead(200, { "content-type": "application/json", "content-length": "1000" });
    res.write("[{");
    setTimeout(() => res.socket.destroy(), 20);
  });
  try {
    await assert.rejects(get("/api/users/0/collections?a=1", { port: cut.port, timeoutMs: 2000 }), { code: "http", message: /cut off/ });
  } finally {
    await cut.close();
  }

  let timer;
  const trickle = await mock((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    timer = setInterval(() => res.write(" "), 50);
    res.on("close", () => clearInterval(timer));
  });
  try {
    const t0 = Date.now();
    await assert.rejects(get("/api/users/0/collections?a=1", { port: trickle.port, timeoutMs: 200 }), { code: "down" });
    assert.ok(Date.now() - t0 < 2000, "the overall deadline fires although bytes keep arriving");
  } finally {
    clearInterval(timer);
    await trickle.close();
  }
});

test("CLI prints usage and refuses a bad key without any connection", () => {
  assert.match(execFileSync(process.execPath, [SCRIPT], { encoding: "utf8" }), /usage: zotero\.mjs collections/);
  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, "items", "--collection", "x"], { encoding: "utf8", stdio: "pipe" }),
    (e) => /collection key is 8 characters/.test(String(e.stderr)) && e.status === 1,
  );
});
