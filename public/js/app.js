import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const form = document.querySelector("#faq-form");
const formError = document.querySelector("#form-error");
const listEl = document.querySelector("#list");
const userName = document.querySelector("#user-name");
const toggle = document.querySelector("#auth-toggle");
let mode = "login";
let user = null;
let query = "";
let timer;
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
function paintAuth() {
  const admin = user?.role === "admin";
  userName.textContent = user ? `${user.username}${admin ? " \u00b7 admin" : ""}` : "";
  toggle.textContent = user ? "Salir" : "Admin";
  form.classList.toggle("hidden", !admin);
}
async function refresh() {
  const data = await api(`/api/faqs?q=${encodeURIComponent(query)}`);
  listEl.innerHTML = "";
  if (!data.faqs.length) {
    const empty = document.createElement("li");
    empty.textContent = "No hay preguntas.";
    listEl.append(empty);
    return;
  }
  data.faqs.forEach((faq) => {
    const li = document.createElement("li");
    li.className = `item${faq.published ? "" : " draft"}`;
    const q = document.createElement("strong");
    q.textContent = faq.question;
    const a = document.createElement("p");
    a.textContent = faq.answer;
    li.append(q, a);
    if (user?.role === "admin") {
      const hide = document.createElement("button");
      hide.type = "button";
      hide.className = "ghost";
      hide.textContent = faq.published ? "Ocultar" : "Publicar";
      hide.addEventListener("click", async () => { await api(`/api/faqs/${faq.id}`, { method: "PATCH", body: JSON.stringify({ published: !faq.published }) }); await refresh(); });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ghost";
      del.textContent = "Borrar";
      del.addEventListener("click", async () => { await api(`/api/faqs/${faq.id}`, { method: "DELETE" }); await refresh(); });
      li.append(hide, del);
    }
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) { paintAuth(); await refresh(); return; }
  try {
    user = (await api("/api/auth/me")).user;
    authView.classList.add("hidden");
    paintAuth();
    await refresh();
  } catch { clearSession(); user = null; paintAuth(); await refresh(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
toggle.addEventListener("click", () => {
  if (user) { clearSession(); user = null; authView.classList.add("hidden"); paintAuth(); refresh(); return; }
  authView.classList.toggle("hidden");
});
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#search").addEventListener("input", (event) => { clearTimeout(timer); timer = setTimeout(async () => { query = event.target.value.trim(); await refresh(); }, 200); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/faqs", { method: "POST", body: JSON.stringify({ question: document.querySelector("#question").value.trim(), answer: document.querySelector("#answer").value.trim(), published: true }) });
    form.reset();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
