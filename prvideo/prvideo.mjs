// prvideo-20261026 (pv1): pre-room hello video. GET /api/prvideo?pr=PR-XXXXXXXXXX -> {room:"HF-....."} for members of a pre-room in setup.
// Membership is checked by asking hubface itself (GET /api/prerooms/<PR> with the caller cookie). The HF id is HMAC(secret, PR id),
// so only members ever learn it; the row is a plain ownerless rooms.db row so the existing room-live WebSocket (signaling/TURN) is reused.
import http from "node:http"; import crypto from "node:crypto"; import fs from "node:fs"; import Database from "better-sqlite3";
const SECRET = fs.readFileSync(new URL("./secret", import.meta.url), "utf8").trim();
const db = new Database("/var/lib/hubface/rooms.db"); db.pragma("busy_timeout = 3000");
const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function hfFor(pr) { const h = crypto.createHmac("sha256", SECRET).update("prvideo1|" + pr).digest(); const o = []; for (const b of h) { if (b < 248) o.push(ALPHA[b % 31]); if (o.length === 10) break; } return "HF-" + o.slice(0, 5).join("") + "-" + o.slice(5).join(""); }
const ins = db.prepare("INSERT OR IGNORE INTO rooms (id,name,owner_user_id,owner_name,owner_key_hash,meta,created_at,updated_at) VALUES (?,?,NULL,NULL,?,?,?,?)");
const send = (r, c, o) => { r.writeHead(c, { "Content-Type": "application/json", "Cache-Control": "no-store" }); r.end(JSON.stringify(o)); };
http.createServer(async (q, r) => {
  try { const u = new URL(q.url, "http://x"); const pr = String(u.searchParams.get("pr") || "").toUpperCase();
    if (q.method !== "GET" || u.pathname !== "/api/prvideo" || !/^PR-[0-9A-F]{10}$/.test(pr)) return send(r, 404, { error: "not found" });
    const rr = await fetch("http://127.0.0.1:3470/api/prerooms/" + pr, { headers: { cookie: q.headers.cookie || "", host: "hubface.org", "x-forwarded-for": String(q.headers["x-forwarded-for"] || "") }, signal: AbortSignal.timeout(8000) });
    if (rr.status !== 200) return send(r, 404, { error: "not found" });
    const j = await rr.json(); if (!j || j.status !== "setup") return send(r, 409, { error: "pre-room not in setup" });
    const id = hfFor(pr), now = new Date().toISOString();
    ins.run(id, "Pre-room hello " + pr, crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex"), JSON.stringify({ prvideo: pr }), now, now);
    return send(r, 200, { ok: true, room: id });
  } catch (e) { console.log("[prvideo] err", String(e && e.message || e)); return send(r, 500, { error: "error" }); }
}).listen(3498, "127.0.0.1", () => console.log("[prvideo] pv1 on 127.0.0.1:3498"));
