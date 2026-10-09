import { URL } from "node:url";
import { connect, isReady, users, faqs, toId, mapFaq } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireAdmin(req, res) { const user = getUserFromRequest(req); if (!user || user.role !== "admin") { sendJson(res, 401, { error: "Solo el admin" }); return null; } return user; }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const role = (await users().countDocuments()) === 0 ? "admin" : "user";
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), role, createdAt: new Date() });
    const user = { id: String(result.insertedId), username, role };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username, role: row.role };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { error: "No autenticado" });
    const row = await users().findOne({ _id: toId(user.id) });
    if (!row) return sendJson(res, 401, { error: "Usuario no encontrado" });
    return sendJson(res, 200, { user: { id: String(row._id), username: row.username, role: row.role } });
  }

  if (method === "GET" && pathname === "/api/faqs") {
    const q = String(searchParams.get("q") || "").trim();
    const admin = getUserFromRequest(req)?.role === "admin";
    const query = admin ? {} : { published: true };
    if (q) query.question = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const rows = await faqs().find(query).sort({ order: 1, question: 1 }).limit(100).toArray();
    return sendJson(res, 200, { faqs: rows.map(mapFaq) });
  }
  if (method === "POST" && pathname === "/api/faqs") {
    if (!requireAdmin(req, res)) return;
    const body = await readJson(req);
    const question = String(body.question || "").trim();
    const answer = String(body.answer || "").trim();
    if (!question || !answer) return sendJson(res, 400, { error: "Pregunta y respuesta son obligatorias" });
    const result = await faqs().insertOne({ question: question.slice(0, 160), answer: answer.slice(0, 2000), published: body.published !== false, order: Number(body.order) || 0, createdAt: new Date() });
    return sendJson(res, 201, { faq: mapFaq(await faqs().findOne({ _id: result.insertedId })) });
  }
  const match = pathname.match(/^\/api\/faqs\/([a-fA-F0-9]{24})$/);
  if (match) {
    if (!requireAdmin(req, res)) return;
    const id = toId(match[1]);
    const existing = await faqs().findOne({ _id: id });
    if (!existing) return sendJson(res, 404, { error: "Pregunta no encontrada" });
    if (method === "PATCH") {
      const body = await readJson(req);
      await faqs().updateOne({ _id: id }, { $set: { question: body.question !== undefined ? String(body.question).trim().slice(0, 160) || existing.question : existing.question, answer: body.answer !== undefined ? String(body.answer).trim().slice(0, 2000) || existing.answer : existing.answer, published: body.published !== undefined ? Boolean(body.published) : existing.published } });
      return sendJson(res, 200, { faq: mapFaq(await faqs().findOne({ _id: id })) });
    }
    if (method === "DELETE") {
      await faqs().deleteOne({ _id: id });
      return sendEmpty(res, 204);
    }
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`FAQ en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
