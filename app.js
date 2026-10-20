'use strict';
/* SparkAuto VRTS – screens. All business rules are enforced on the server (Code.gs); this file only shows and asks. */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'R ' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUSES = ['Awaiting Parts', 'In Progress', 'Ready for Collection'], DONE = 'Ready for Collection';
const ROLE = { manager: 'Workshop manager', admin: 'Front desk', mechanic: 'Mechanic' };
const NAV = {
  manager: [['jobs', 'Service jobs'], ['parts', 'Spare parts'], ['invoices', 'Invoices'], ['reports', 'Reports'], ['staff', 'Staff']],
  admin: [['jobs', 'Service jobs'], ['parts', 'Spare parts'], ['invoices', 'Invoices']],
  mechanic: [['jobs', 'My jobs']]
};
const S = { pub: 'home', user: null, view: 'jobs', jobId: null, jobs: [], mechs: [], q: '', status: 'All', rep: null };
const app = () => $('#app');
const slug = st => String(st).replace(/\s/g, '').toLowerCase();
const pill = st => `<span class="pill ${String(st).replace(/\s/g, '').toLowerCase()}">${esc(st)}</span>`;

function toast(msg, kind = 'ok') {
  const t = $('#toast'); t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(toast.id); toast.id = setTimeout(() => { t.className = ''; }, 5000);
}
function openModal(html) {
  $('#modal').innerHTML = `<div class="scrim"><div class="dlg" role="dialog" aria-modal="true">${html}</div></div>`;
  const f = $('#modal input, #modal select, #modal button'); if (f) f.focus();
}
const closeModal = () => { $('#modal').innerHTML = ''; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

async function guard(fn) {
  try { return await fn(); } catch (e) {
    if (e.code === 'AUTH') { S.user = null; Api.clear(); loginView(); }
    toast(e.message || 'Something went wrong. Try again.', 'err');
  }
}

function shell(inner) {
  const u = S.user;
  return `<header class="top"><button class="brand" data-act="noop" aria-label="SparkAuto"><img class="logo" src="assets/logo.png" alt="SparkAuto"></button>
  <nav>${NAV[u.role].map(([k, l]) => `<button class="navb ${S.view === k || (S.view === 'detail' && k === 'jobs') || (S.view === 'invoice' && k === 'invoices') ? 'on' : ''}" data-nav="${k}">${l}</button>`).join('')}</nav>
  <div class="who"><span>${esc(u.fullName)} <small>${ROLE[u.role]}</small></span><button class="link" data-act="logout">Log out</button></div></header>
  <main>${inner}</main>`;
}

/* ---------- Public scene: background slideshow (fades every 5 s) ---------- */
const BG = {
  urls: ['assets/gt3rs.jpg', 'assets/gtr.jpg'], every: 5000, i: 0, z: 1, timer: null, ready: false,
  build() {
    const el = $('#bg');
    el.innerHTML = this.urls.map(u => `<div class="slide" style="background-image:url('${u}')"></div>`).join('') + '<div class="shade"></div><div class="dots">' + this.urls.map(() => '<i></i>').join('') + '</div>';
    this.slides = [...el.querySelectorAll('.slide')]; this.dots = [...el.querySelectorAll('.dots i')];
    this.urls.forEach(u => { const im = new Image(); im.src = u; });
    this.ready = true;
  },
  show(n) {
    this.i = n; const s = this.slides[n]; s.style.zIndex = ++this.z; s.classList.add('on');
    this.dots.forEach((d, k) => d.classList.toggle('on', k === n));
    // once the new picture is fully in, switch the others off (they are hidden underneath, so there is never a dark flash)
    setTimeout(() => this.slides.forEach((o, k) => { if (k !== this.i) o.classList.remove('on'); }), 1800);
  },
  start() {
    if (!this.ready) this.build();
    if (this.timer) return;
    this.show(this.i);
    this.timer = setInterval(() => this.show((this.i + 1) % this.urls.length), this.every);
  },
  stop() { clearInterval(this.timer); this.timer = null; }
};
function setScene(on) {
  document.body.classList.toggle('scene-on', on);
  on ? BG.start() : BG.stop();
}
function pubNav(active) {
  return `<header class="top pub"><button class="brand" data-act="toHome" aria-label="SparkAuto home"><img class="logo" src="assets/logo.png" alt="SparkAuto"></button>
  <nav><button class="navb ${active === 'home' ? 'on' : ''}" data-act="toHome">Home</button><button class="navb ${active === 'login' ? 'on' : 'cta'}" data-act="toLogin">Staff login</button></nav></header>`;
}

/* ---------- Home ---------- */
function homeView() {
  S.pub = 'home'; setScene(true);
  app().innerHTML = `<div class="scene">${pubNav('home')}<main class="hero"><div class="hero-text">
  <h1>Built on trust,<br><em>driven by quality.</em></h1>
  <p>From job card to handover. Proudly family run in Gqeberha.</p>
  <button class="btn cta" data-act="toLogin">Staff login</button></div></main></div>`;
}

/* ---------- Login (FR-001) ---------- */
function loginView() {
  S.pub = 'login'; setScene(true);
  app().innerHTML = `<div class="scene">${pubNav('login')}<main class="loginwrap"><section class="login"><h1>Vehicle Repair Tracking</h1><p>Log in to see today's jobs.</p>
  <div id="lerr" class="msg err" hidden></div>
  <form data-form="login"><label>Username<input name="username" autocomplete="username" required></label>
  <label>Password<input name="password" id="pw" type="password" autocomplete="current-password" required></label>
  <label class="chk"><input type="checkbox" data-act="showpw"> Show password</label>
  <button class="btn primary" id="lb">Log in</button></form>
  <details class="help"><summary>Forgot your password?</summary><p>Ask the workshop manager to reset it. They will give you a temporary password.</p></details></section></main></div>`;
}

/* ---------- Jobs (FR-002, FR-005) ---------- */
async function jobsView() {
  S.jobs = await Api.call('listJobs');
  if (S.user.role === 'mechanic') return mechList();
  S.mechs = S.user.role === 'manager' ? await Api.call('listMechanics') : [];
  app().innerHTML = shell(`<h1>Service jobs</h1>
  <div class="bar"><input type="search" id="q" placeholder="Find a job by name, registration or number" value="${esc(S.q)}" aria-label="Search jobs">
  <select id="sf" aria-label="Filter by status">${['All', ...STATUSES].map(s => `<option ${S.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
  <button class="btn primary" data-act="newJob">+ New job</button></div>
  <div class="tablewrap"><table><thead><tr><th>Job no.</th><th>Customer</th><th>Registration</th><th>Repair</th><th>Mechanic</th><th>Status</th><th>Actions</th></tr></thead><tbody id="jb">${jobRows()}</tbody></table></div>`);
}
function jobRows() {
  const q = S.q.toLowerCase();
  const rows = S.jobs.filter(j => (S.status === 'All' || j.status === S.status) && (!q || [j.jobId, j.customerName, j.reg, j.description].join(' ').toLowerCase().includes(q)));
  if (!rows.length) return `<tr><td colspan="7">No jobs match. Clear the search, or add a new job.</td></tr>`;
  return rows.map(j => `<tr class="st-${slug(j.status)}"><td>${esc(j.jobId)}</td><td>${esc(j.customerName)}</td><td>${esc(j.reg)}</td><td>${esc(j.description)}</td>
  <td>${S.user.role === 'manager' && !j.invoiceNo ? `<select data-assign="${j.jobId}" aria-label="Mechanic for ${esc(j.jobId)}"><option value="">Choose mechanic</option>${S.mechs.map(m => `<option value="${m.userId}" ${m.userId === j.mechanicId ? 'selected' : ''}>${esc(m.fullName)} (${m.active} active)</option>`).join('')}</select>` : esc(j.mechanicName || 'Not assigned')}</td>
  <td>${pill(j.status)}</td>
  <td><button class="btn" data-act="open" data-id="${j.jobId}">Open</button> ${j.invoiceNo ? '' : `<button class="btn" data-act="editJob" data-id="${j.jobId}">Edit</button> <button class="btn" data-act="delJob" data-id="${j.jobId}">Delete</button>`}</td></tr>`).join('');
}
function mechList() {
  const first = S.user.fullName.split(' ')[0];
  app().innerHTML = shell(`<h1>Hi ${esc(first)}</h1><p>${S.jobs.length ? `You have ${S.jobs.length} job${S.jobs.length > 1 ? 's' : ''} today.` : 'No jobs are assigned to you yet.'}</p>
  <div class="cards">${S.jobs.map(j => `<button class="jobcard st-${slug(j.status)}" data-act="open" data-id="${j.jobId}"><strong>${esc(j.jobId)} · ${esc(j.reg)}</strong><br>${esc(j.customerName)} · ${esc(j.description)}<br>${pill(j.status)} <small>Safety checks: ${j.checksDone} of ${j.checksTotal}</small></button>`).join('')}</div>`);
}
function jobForm(j = {}) {
  return `<h2>${j.jobId ? 'Edit job ' + esc(j.jobId) : 'New job'}</h2><form data-form="job"><input type="hidden" name="jobId" value="${esc(j.jobId || '')}">
  <label>Customer name<input name="customerName" value="${esc(j.customerName || '')}" required></label>
  <label>Phone (optional)<input name="phone" inputmode="tel" value="${esc(j.phone || '')}"></label>
  <label>Registration<input name="reg" value="${esc(j.reg || '')}" required></label>
  <label>Repair description<input name="description" value="${esc(j.description || '')}" required></label>
  <div class="actions"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary">Save job</button></div></form>`;
}

/* ---------- Job detail: progress, safety checks, labour, parts (FR-004, FR-006, FR-009) ---------- */
async function detailView() {
  const [d, parts] = await Promise.all([Api.call('getJob', { jobId: S.jobId }), Api.call('listParts')]);
  const j = d.job, locked = !!j.invoiceNo, open = d.ready.open.length, done = d.checks.length - open;
  const desk = S.user.role !== 'mechanic';
  app().innerHTML = shell(`<button class="link" data-act="back">‹ Back to jobs</button>
  <h1>${esc(j.jobId)} · ${esc(j.reg)}</h1><p>${esc(j.customerName)} · ${esc(j.description)} ${pill(j.status)}</p>
  ${locked ? `<div class="msg" style="background:#d9efe6">Invoice ${esc(j.invoiceNo)} has been issued, so this job is locked.</div>` : ''}
  <section class="panel"><h2>Repair status</h2><div class="seg">${STATUSES.map(s => `<button class="segb ${j.status === s ? 'on' : ''}" data-act="status" data-s="${s}" ${locked || (s === DONE && !d.ready.ok) ? 'disabled' : ''}>${s}</button>`).join('')}</div>
  ${!d.ready.ok && !locked ? `<p class="hint">Finish the ${open} open safety check${open === 1 ? '' : 's'} below, then you can mark this car Ready for Collection.</p>` : ''}</section>
  <section class="panel"><h2>Safety checks: ${done} of ${d.checks.length} done</h2>${d.checks.map(c => `<label class="check"><input type="checkbox" data-check="${c.checkId}" ${c.passed ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${esc(c.label)}</label>`).join('')}</section>
  <section class="panel"><h2>Labour</h2><form class="row" data-form="labour"><label>Hours worked<input name="hours" type="number" min="0" max="99" step="0.25" value="${j.labourHours}" ${locked ? 'disabled' : ''}></label><button class="btn primary" ${locked ? 'disabled' : ''}>Save hours</button></form></section>
  <section class="panel"><h2>Parts on this job</h2>
  <div class="tablewrap"><table><thead><tr><th>Part</th><th class="num">Qty</th><th class="num">Cost</th><th></th></tr></thead><tbody>${d.lines.length ? d.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="num">${l.qty}</td><td class="num">${money(l.qty * l.priceCharged)}</td><td>${locked ? '' : `<button class="btn" data-act="rmPart" data-id="${l.jobPartId}">Remove</button>`}</td></tr>`).join('') : '<tr><td colspan="4">No parts added yet.</td></tr>'}</tbody></table></div>
  ${locked ? '' : `<form class="row" data-form="addPart" style="margin-top:.8rem"><label>Part<select name="partId">${parts.filter(p => p.stock > 0).map(p => `<option value="${p.partId}">${esc(p.name)} · ${money(p.price)} · ${p.stock} in stock</option>`).join('')}</select></label><label>Quantity<input name="qty" type="number" min="1" value="1" style="width:6rem"></label><button class="btn primary">Add to job</button></form>`}</section>
  ${desk && j.status === DONE ? `<button class="btn primary" data-act="openInvoice" data-id="${j.jobId}">${locked ? 'View' : 'Create'} invoice</button>` : ''}`);
}

/* ---------- Parts (FR-003) ---------- */
async function partsView() {
  const parts = await Api.call('listParts'), mgr = S.user.role === 'manager';
  app().innerHTML = shell(`<h1>Spare parts</h1>${mgr ? '<div class="bar"><button class="btn primary" data-act="newPart">+ Add part</button></div>' : ''}
  <div class="tablewrap"><table><thead><tr><th>Part</th><th class="num">Price</th><th class="num">In stock</th><th>Level</th><th class="num">Re-order at</th>${mgr ? '<th>Actions</th>' : ''}</tr></thead><tbody>${parts.map(p => `<tr><td>${esc(p.name)}</td><td class="num">${money(p.price)}</td><td class="num">${p.stock}</td><td>${pill(p.level)}</td><td class="num">${p.reorderLevel}</td>${mgr ? `<td><button class="btn" data-act="editPart" data-id="${p.partId}">Edit</button> <button class="btn" data-act="delPart" data-id="${p.partId}">Delete</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`);
  S.parts = parts;
}
function partForm(p = {}) {
  return `<h2>${p.partId ? 'Edit part' : 'Add part'}</h2><form data-form="part"><input type="hidden" name="partId" value="${esc(p.partId || '')}">
  <label>Part name<input name="name" value="${esc(p.name || '')}" required></label>
  <label>Price (R)<input name="price" type="number" min="0" step="0.01" value="${p.price ?? ''}" required></label>
  <label>In stock<input name="stock" type="number" min="0" step="1" value="${p.stock ?? ''}" required></label>
  <label>Re-order when stock reaches<input name="reorderLevel" type="number" min="0" step="1" value="${p.reorderLevel ?? 3}" required></label>
  <div class="actions"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary">Save part</button></div></form>`;
}

/* ---------- Invoices (FR-007, FR-008) ---------- */
async function invoicesView() {
  S.jobs = await Api.call('listJobs');
  const rows = S.jobs.filter(j => j.status === DONE);
  app().innerHTML = shell(`<h1>Invoices</h1><p>Jobs that are Ready for Collection.</p><div class="tablewrap"><table><thead><tr><th>Job no.</th><th>Customer</th><th>Registration</th><th>Invoice</th><th></th></tr></thead><tbody>${rows.length ? rows.map(j => `<tr><td>${esc(j.jobId)}</td><td>${esc(j.customerName)}</td><td>${esc(j.reg)}</td><td>${esc(j.invoiceNo || 'Not created yet')}</td><td><button class="btn" data-act="openInvoice" data-id="${j.jobId}">${j.invoiceNo ? 'View' : 'Create'} invoice</button></td></tr>`).join('') : '<tr><td colspan="5">No jobs are ready for collection yet.</td></tr>'}</tbody></table></div>`);
}
async function invoiceView() {
  const d = await Api.call('getInvoice', { jobId: S.jobId }), i = d.invoice;
  app().innerHTML = shell(`<div class="bar noprint"><button class="link" data-act="back">‹ Back</button><button class="btn primary" data-act="print">Print or save as PDF</button></div>
  <article class="invoice"><header><div><h1>Invoice ${esc(i.invoiceNo)}</h1><strong>SparkAuto Workshop</strong><br>Gqeberha, Eastern Cape</div><div>Date: ${new Date(Number(i.issuedAt)).toLocaleDateString('en-ZA')}<br>Job: ${esc(d.jobId)}<br>Vehicle: ${esc(d.reg)}<br>Bill to: <strong>${esc(d.customerName)}</strong></div></header>
  <div class="tablewrap"><table><thead><tr><th>Description</th><th class="num">Qty / hrs</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
  <tr><td>Labour</td><td class="num">${i.labourHours}</td><td class="num">${money(i.labourRate)}</td><td class="num">${money(i.labour)}</td></tr>
  ${d.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="num">${l.qty}</td><td class="num">${money(l.priceCharged)}</td><td class="num">${money(l.qty * l.priceCharged)}</td></tr>`).join('')}</tbody></table></div>
  <div class="totals"><div><span>Labour</span><span>${money(i.labour)}</span></div><div><span>Parts</span><span>${money(i.parts)}</span></div><div class="due"><span>Total due</span><span>${money(i.total)}</span></div></div>
  <p>Thank you for trusting SparkAuto. Drive safe!</p></article>`);
}

/* ---------- Reports (FR-010) ---------- */
async function reportsView() {
  const iso = d => d.toLocaleDateString('en-CA'), to = new Date(), from = new Date(Date.now() - 6 * 864e5);
  app().innerHTML = shell(`<h1>How did the week go?</h1><form class="row" data-form="report"><label>From<input type="date" name="from" value="${iso(from)}" required></label><label>To<input type="date" name="to" value="${iso(to)}" required></label><button class="btn primary">Generate report</button></form><div id="rep" style="margin-top:1rem"></div>`);
  await FORMS.report({ from: iso(from), to: iso(to) });
}
function drawReport(r) {
  const max = Math.max(1, ...r.days.map(d => d.count));
  $('#rep').innerHTML = `<div class="grid"><div class="tile"><b>${r.completed}</b>Repairs completed</div><div class="tile"><b>${r.awaitingParts}</b>Awaiting parts now</div><div class="tile"><b>${money(r.invoiced)}</b>Invoiced</div><div class="tile"><b>${r.lowCount}</b>Parts low or out</div></div>
  <section class="panel"><h2>Completed repairs per day</h2><div class="chart" role="img" aria-label="Completed repairs per day">${r.days.map(d => `<div><span>${d.count}</span><i style="height:${d.count / max * 100}%"></i><span>${esc(d.label)}</span></div>`).join('')}</div></section>
  <section class="panel"><h2>Low-stock spare parts</h2><div class="tablewrap"><table><thead><tr><th>Part</th><th class="num">Stock</th><th class="num">Re-order at</th></tr></thead><tbody>${r.low.length ? r.low.map(p => `<tr><td>${esc(p.name)}</td><td class="num">${p.stock}</td><td class="num">${p.reorderLevel}</td></tr>`).join('') : '<tr><td colspan="3">Nothing is running low.</td></tr>'}</tbody></table></div></section>
  <button class="btn" data-act="csv">Export CSV</button> <button class="btn" data-act="print">Print or save as PDF</button>
  <p class="hint">Report period ${esc(r.from)} to ${esc(r.to)} · generated ${new Date(r.generatedAt).toLocaleString('en-ZA')}</p>`;
}

/* ---------- Staff and settings ---------- */
async function staffView() {
  const d = await Api.call('listUsers');
  app().innerHTML = shell(`<h1>Staff</h1><div class="tablewrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th></th></tr></thead><tbody>${d.users.map(u => `<tr><td>${esc(u.fullName)}</td><td>${esc(u.username)}</td><td>${ROLE[u.role]}</td><td><button class="btn" data-act="resetPw" data-id="${u.userId}">Reset password</button></td></tr>`).join('')}</tbody></table></div>
  <section class="panel" style="margin-top:1rem"><h2>Labour rate</h2><form class="row" data-form="rate"><label>Rate per hour (R)<input name="rate" type="number" min="1" step="0.01" value="${d.labourRate}" required></label><button class="btn primary">Save rate</button></form><p class="hint">Applies to invoices created from now on.</p></section>`);
}

/* ---------- Wiring ---------- */
async function show() {
  if (!S.user) return S.pub === 'login' ? loginView() : homeView();
  setScene(false);
  app().innerHTML = '<p class="load">Loading…</p>';
  const v = { jobs: jobsView, detail: detailView, parts: partsView, invoices: invoicesView, invoice: invoiceView, reports: reportsView, staff: staffView }[S.view];
  return v();
}
const refresh = () => guard(show);

const ACT = {
  logout: async () => { await Api.call('logout').catch(() => {}); Api.clear(); S.user = null; homeView(); },
  showpw: (d, b) => { $('#pw').type = b.checked ? 'text' : 'password'; },
  noop: () => {},
  toHome: homeView,
  toLogin: loginView,
  close: closeModal,
  open: d => { S.jobId = d.id; S.view = 'detail'; refresh(); },
  back: () => { S.view = S.view === 'invoice' ? 'detail' : 'jobs'; if (S.view === 'detail' && S.user.role === 'mechanic') S.view = 'jobs'; refresh(); },
  newJob: () => openModal(jobForm()),
  editJob: d => openModal(jobForm(S.jobs.find(j => j.jobId === d.id))),
  delJob: d => openModal(`<h2>Delete job ${esc(d.id)}?</h2><p>This removes the job and its safety checks for good. Parts on the job go back into stock. You can't undo it.</p><div class="actions"><button class="btn" data-act="close">Keep job</button><button class="btn danger" data-act="confirmDel" data-id="${esc(d.id)}">Delete job</button></div>`),
  confirmDel: async d => { await Api.call('deleteJob', { jobId: d.id }); closeModal(); toast('Job deleted.'); refresh(); },
  status: async d => { await Api.call('updateStatus', { jobId: S.jobId, status: d.s }); toast('Status saved: ' + d.s); refresh(); },
  rmPart: async d => { await Api.call('removeJobPart', { jobPartId: d.id }); toast('Part removed and stock returned.'); refresh(); },
  newPart: () => openModal(partForm()),
  editPart: d => openModal(partForm(S.parts.find(p => p.partId === d.id))),
  delPart: async d => { await Api.call('deletePart', { partId: d.id }); toast('Part deleted.'); refresh(); },
  openInvoice: d => { S.jobId = d.id; S.view = 'invoice'; refresh(); },
  print: () => window.print(),
  resetPw: async d => { const r = await Api.call('resetPassword', { userId: d.id }); openModal(`<h2>Password reset</h2><p>Temporary password for ${esc(r.fullName)}:</p><p><strong style="font-size:1.4rem">${esc(r.tempPassword)}</strong></p><p class="hint">Give it to them in person. They should change it after logging in.</p><div class="actions"><button class="btn primary" data-act="close">Done</button></div>`); },
  csv: () => {
    const r = S.rep, q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Report', r.from + ' to ' + r.to], ['Repairs completed', r.completed], ['Awaiting parts', r.awaitingParts], ['Invoiced (R)', r.invoiced], [], ['Part', 'Stock', 'Re-order level'], ...r.low.map(p => [p.name, p.stock, p.reorderLevel])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map(x => x.map(q).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `vrts-report-${r.from}-to-${r.to}.csv`; a.click(); toast('Report exported.');
  }
};
const FORMS = {
  login: async (f, form) => {
    const b = $('#lb'), err = $('#lerr'); b.disabled = true; b.textContent = 'Signing in…'; err.hidden = true;
    try { const r = await Api.call('login', f); S.user = r.user; S.view = 'jobs'; show(); }
    catch (e) { err.textContent = e.message; err.hidden = false; b.disabled = false; b.textContent = 'Log in'; }
  },
  job: async f => { await Api.call('saveJob', f); closeModal(); toast('Job saved.'); S.view = 'jobs'; refresh(); },
  part: async f => { await Api.call('savePart', f); closeModal(); toast('Part saved.'); refresh(); },
  addPart: async f => { const r = await Api.call('addJobPart', { jobId: S.jobId, ...f }); toast(r.stockLeft === 0 ? 'Added. That was the last one in stock, so order more.' : 'Part added.'); refresh(); },
  labour: async f => { await Api.call('setLabourHours', { jobId: S.jobId, hours: f.hours }); toast('Hours saved.'); refresh(); },
  rate: async f => { await Api.call('setLabourRate', { rate: f.rate }); toast('Labour rate saved.'); },
  report: async f => { S.rep = await Api.call('weeklyReport', f); drawReport(S.rep); }
};
document.addEventListener('click', e => {
  const n = e.target.closest('[data-nav]');
  if (n) { S.view = n.dataset.nav; S.jobId = null; return refresh(); }
  const b = e.target.closest('[data-act]');
  if (b && ACT[b.dataset.act] && b.type !== 'checkbox') guard(() => ACT[b.dataset.act](b.dataset, b));
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.type === 'checkbox' && t.dataset.act) return ACT[t.dataset.act](t.dataset, t);
  if (t.dataset.assign !== undefined) guard(async () => { const r = await Api.call('assignMechanic', { jobId: t.dataset.assign, mechanicId: t.value }); toast(r.mechanicName ? `Done. ${r.mechanicName} is now looking after job ${t.dataset.assign}.` : `Job ${t.dataset.assign} is now unassigned.`); refresh(); });
  if (t.dataset.check) guard(async () => { await Api.call('setCheck', { checkId: t.dataset.check, passed: t.checked }); refresh(); });
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { S.q = e.target.value; $('#jb').innerHTML = jobRows(); }
  if (e.target.id === 'sf') { S.status = e.target.value; $('#jb').innerHTML = jobRows(); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault();
  guard(() => FORMS[f.dataset.form](Object.fromEntries(new FormData(f)), f));
});

(async () => {
  if (Api.hasToken()) { try { S.user = await Api.call('me'); } catch (e) { S.user = null; Api.clear(); } }
  show();
})();
