const OWNER_KEY = "niviontech.crm.owner.v1";
const SESSION_KEY = "niviontech.crm.session.v1";

const app = document.querySelector("#app");

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function derivePassword(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    material,
    256
  );

  return bytesToBase64(new Uint8Array(bits));
}

function getOwner() {
  try {
    return JSON.parse(localStorage.getItem(OWNER_KEY));
  } catch {
    return null;
  }
}

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function setMessage(text) {
  const message = document.querySelector("#form-message");
  message.textContent = text;
  message.classList.add("is-visible");
}

function authBrand() {
  return `
    <section class="auth-brand">
      <div class="brand-lockup"><span class="brand-symbol">H</span><span>NivionTech CRM</span></div>
      <div class="brand-copy">
        <p>Seu comercial em movimento</p>
        <h1>Clientes organizados. Próximas ações claras.</h1>
        <p>Do primeiro contato ao dinheiro recebido, o NivionTech ajuda sua empresa a não perder oportunidades.</p>
      </div>
      <div class="brand-foot"><span class="orbit-dot"></span><span>Orbit será seu assistente comercial</span></div>
    </section>`;
}

function setupTemplate() {
  return `
    <div class="auth-shell">
      ${authBrand()}
      <section class="auth-area">
        <form class="auth-form" id="setup-form">
          <p class="eyebrow">Primeiro acesso</p>
          <h2>Crie o acesso do proprietário</h2>
          <p class="form-intro">Este será o primeiro administrador do NivionTech CRM nesta instalação local.</p>
          <p class="form-message" id="form-message" role="alert"></p>
          <div class="form-grid">
            <label class="field"><span>Seu nome</span><input name="name" autocomplete="name" required placeholder="Rodrigo Melo" /></label>
            <label class="field"><span>Empresa</span><input name="company" autocomplete="organization" required placeholder="Nome da empresa" /></label>
          </div>
          <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required placeholder="voce@empresa.com.br" /></label>
          <div class="form-grid">
            <label class="field password-row"><span>Senha</span><input name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="Mínimo de 8 caracteres" /><button class="show-password" type="button">Mostrar</button></label>
            <label class="field"><span>Confirmar senha</span><input name="confirmation" type="password" autocomplete="new-password" minlength="8" required placeholder="Repita a senha" /></label>
          </div>
          <button class="submit-button" type="submit">Criar acesso e continuar</button>
          <p class="local-note">Os dados deste primeiro acesso ficam somente neste navegador. Ainda não utilize dados reais de clientes.</p>
        </form>
      </section>
    </div>`;
}

function loginTemplate(owner) {
  return `
    <div class="auth-shell">
      ${authBrand()}
      <section class="auth-area">
        <form class="auth-form" id="login-form">
          <p class="eyebrow">Acesso local</p>
          <h2>Bem-vindo ao NivionTech</h2>
          <p class="form-intro">Entre para continuar a operação comercial de ${escapeHtml(owner.company)}.</p>
          <p class="form-message" id="form-message" role="alert"></p>
          <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required value="${escapeHtml(owner.email)}" /></label>
          <label class="field password-row"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required placeholder="Digite sua senha" /><button class="show-password" type="button">Mostrar</button></label>
          <button class="submit-button" type="submit">Entrar no CRM</button>
          <p class="local-note">Primeira versão local do Proprietário/Admin.</p>
        </form>
      </section>
    </div>`;
}

function dashboardTemplate(owner) {
  return `
    <div class="crm-shell">
      <aside class="crm-sidebar">
        <div class="crm-brand brand-lockup"><span class="brand-symbol">H</span><span>NivionTech CRM</span></div>
        <nav class="crm-nav" aria-label="Rotina"><p>Trabalho</p><button class="is-active"><span>Hoje</span></button><button><span>Agenda</span></button></nav>
        <nav class="crm-nav" aria-label="Comercial"><p>Comercial</p><button><span>Leads</span></button><button><span>Oportunidades</span></button><button><span>Clientes</span></button></nav>
        <nav class="crm-nav" aria-label="Operação"><p>Operação</p><button><span>Propostas</span></button><button><span>Recebimentos</span></button><button><span>Assistente Orbit</span></button></nav>
        <div class="crm-user"><strong>${escapeHtml(owner.name)}</strong><span>Proprietário/Admin</span></div>
      </aside>
      <section class="crm-workspace">
        <header class="crm-header"><h1>Hoje</h1><button class="logout-button" id="logout-button" type="button">Sair</button></header>
        <div class="crm-content">
          <div class="welcome-bar"><div><h2>Bem-vindo, ${escapeHtml(owner.name.split(" ")[0])}</h2><p>O acesso local está funcionando. Agora vamos configurar seu primeiro processo comercial.</p></div><button class="new-action" type="button">Nova ação</button></div>
          <div class="first-step">
            <article class="empty-panel">
              <h3>Implantação inicial</h3>
              <p>Esta será a próxima etapa da construção do NivionTech CRM.</p>
              <div class="setup-list">
                <div class="setup-item"><span class="setup-number">1</span><span>Confirmar os dados da empresa</span></div>
                <div class="setup-item"><span class="setup-number">2</span><span>Escolher um template comercial</span></div>
                <div class="setup-item"><span class="setup-number">3</span><span>Criar as etapas do primeiro funil</span></div>
                <div class="setup-item"><span class="setup-number">4</span><span>Cadastrar o primeiro cliente</span></div>
              </div>
            </article>
            <aside class="empty-panel orbit-panel"><h3>Assistente Orbit</h3><p>O acesso do Proprietário/Admin foi criado. Na próxima etapa, vou ajudar a preparar o CRM para a realidade da sua empresa.</p><strong>Próxima construção: implantação guiada.</strong></aside>
          </div>
        </div>
      </section>
    </div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wirePasswordToggle() {
  const button = document.querySelector(".show-password");
  if (!button) return;
  button.addEventListener("click", () => {
    const input = button.parentElement.querySelector("input");
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.textContent = visible ? "Mostrar" : "Ocultar";
  });
}

function renderSetup() {
  app.innerHTML = setupTemplate();
  wirePasswordToggle();

  document.querySelector("#setup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password"));
    const confirmation = String(data.get("confirmation"));

    if (password.length < 8) {
      setMessage("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmation) {
      setMessage("As senhas não são iguais.");
      return;
    }

    const submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    submit.textContent = "Criando acesso...";

    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const passwordHash = await derivePassword(password, salt);
      const owner = {
        name: String(data.get("name")).trim(),
        company: String(data.get("company")).trim(),
        email: String(data.get("email")).trim().toLowerCase(),
        role: "Proprietário/Admin",
        salt: bytesToBase64(salt),
        passwordHash,
        createdAt: new Date().toISOString()
      };

      localStorage.setItem(OWNER_KEY, JSON.stringify(owner));
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: owner.email, startedAt: new Date().toISOString() }));
      renderDashboard(owner);
    } catch {
      setMessage("Não foi possível criar o acesso neste navegador. Abra o projeto por um servidor local.");
      submit.disabled = false;
      submit.textContent = "Criar acesso e continuar";
    }
  });
}

function renderLogin(owner) {
  app.innerHTML = loginTemplate(owner);
  wirePasswordToggle();

  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email")).trim().toLowerCase();
    const password = String(data.get("password"));
    const submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    submit.textContent = "Entrando...";

    const candidateHash = await derivePassword(password, base64ToBytes(owner.salt));
    if (email !== owner.email || candidateHash !== owner.passwordHash) {
      setMessage("E-mail ou senha incorretos.");
      submit.disabled = false;
      submit.textContent = "Entrar no CRM";
      return;
    }

    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: owner.email, startedAt: new Date().toISOString() }));
    renderDashboard(owner);
  });
}

function renderDashboard(owner) {
  app.innerHTML = dashboardTemplate(owner);
  document.querySelector("#logout-button").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    renderLogin(owner);
  });
}

function start() {
  const owner = getOwner();
  const session = getSession();

  if (!owner) {
    renderSetup();
  } else if (session?.email === owner.email) {
    renderDashboard(owner);
  } else {
    renderLogin(owner);
  }
}

start();
