/* Greenlight Market — static front end on Supabase (auth, Postgres with row level security, storage, realtime). */
(() => {
"use strict";
const CFG = window.GL_CONFIG || {};
const sb = window.supabase.createClient(CFG.url, CFG.anonKey);
const BUCKET = "listing-photos";

/* ---------- constants ---------- */
const GENRES = ["Survival","Simulator","Tycoon","Obby","RPG","Shooter","Horror","Tower Defense","Roleplay","Puzzle","Racing","Other"];
const PLATFORMS = ["Roblox","PC","Mobile","Console","Web"];
const TYPES = {game:"Finished game",concept:"Prototype",idea:"Game idea"};
const INCLUDES = ["Place / project file","Full IP rights","Source code & scripts","Art & assets","Game design doc","Revenue history","Roblox group transfer","Dev support (30 days)"];
const STEPS = ["pending","accepted","escrow","transferred","complete"];
const STEP_NAME = {pending:"Offer",accepted:"Accepted",escrow:"Escrow",transferred:"Delivered",complete:"Done"};
const STATUS_LABEL = {pending:"Offer pending",countered:"Counter-offer",accepted:"Accepted",escrow:"Paid into escrow",transferred:"Files delivered",complete:"Complete",declined:"Declined"};
const QUICK = ["Is this still available?","Can you share analytics or revenue?","Would you take an offer?","What's included in the sale?"];
const FEE = 0.05;
const ICON = {
  all:'<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  game:'<path d="M6 9h4M8 7v4M15 10h.01M18 8h.01"/><path d="M7 4h10a5 5 0 0 1 5 5v2a7 7 0 0 1-7 7H9a7 7 0 0 1-7-7V9a5 5 0 0 1 5-5z"/>',
  concept:'<path d="m14.7 6.3 3 3L8 19H5v-3z"/><path d="m13 8 3 3"/>',
  idea:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  heart:'<path d="M12 21s-7.5-4.6-9.5-9.3C1.2 8.5 3.3 5 6.8 5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.5 0 5.6 3.5 4.3 6.7C19.5 16.4 12 21 12 21z"/>',
  chat:'<path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.7A8 8 0 1 1 21 12z"/>',
  check:'<path d="m5 12 5 5L20 7"/>', x:'<path d="M6 6l12 12M18 6 6 18"/>',
  left:'<path d="m15 18-6-6 6-6"/>', right:'<path d="m9 18 6-6-6-6"/>',
  send:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  photo:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5-9 7"/>',
  tag:'<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'
};
const svg = (k, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICON[k]}</svg>`;

/* ---------- state ---------- */
const S = {
  user:null, me:null, listings:[], loaded:false, loadError:false,
  threads:{}, msgs:[], thread:null, saved:new Set(),
  route:{view:"browse"}, cat:"all", genre:"All", sort:"new", q:"", tab:"all",
  draft:null, editing:null, uploading:0, gIdx:0, menu:false, auth:null, authMsg:"", sellerProfile:null
};
const app = document.getElementById("app");
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => "$" + Number(n || 0).toLocaleString("en-US", {maximumFractionDigits:0});
const ts = d => new Date(d).getTime();
const ago = d => { const t = ts(d), s = (Date.now() - t) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s/60) + "m"; if (s < 86400) return Math.floor(s/3600) + "h"; if (s < 604800) return Math.floor(s/86400) + "d"; return new Date(t).toLocaleDateString(undefined, {month:"short", day:"numeric"}); };
const agoLong = d => { const a = ago(d); return /^\d+[mhd]$/.test(a) ? a.replace(/m$/, " minutes").replace(/h$/, " hours").replace(/d$/, " days") + " ago" : (a === "just now" ? a : "on " + a); };
const priceText = l => l.price_mode === "offers" && !l.price ? "Open to offers" : money(l.price);
const photoUrl = p => p ? sb.storage.from(BUCKET).getPublicUrl(p).data.publicUrl : "";
const uid = () => S.user?.id || null;

function hash(s){ let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function artStyle(l){ const h = hash((l.title||"") + (l.genre||"")); const a = h % 360, b = (a + 40 + (h >> 8) % 80) % 360;
  const pat = ["repeating-linear-gradient(135deg,rgba(255,255,255,.07) 0 2px,transparent 2px 14px)","radial-gradient(circle at 80% 20%,rgba(255,255,255,.2),transparent 45%)","repeating-radial-gradient(circle at 10% 110%,rgba(255,255,255,.08) 0 2px,transparent 2px 18px)"][h % 3];
  return `background:${pat},linear-gradient(135deg,hsl(${a} 62% 36%),hsl(${b} 70% 22%))`; }
const initials = t => String(t || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const art = l => `<div class="art" style="${artStyle(l)}"><span class="mono" aria-hidden="true">${esc(initials(l.title))}</span><span class="t">${esc(l.title)}</span></div>`;
const thumbInner = l => { const src = photoUrl((l.photos || [])[0]); return src ? `<img src="${esc(src)}" alt="" loading="lazy">` : art(l); };
const avatar = (id, name, cls = "") => `<span class="avatar ${cls}" style="background:hsl(${hash(id || "x") % 360} 55% 42%)" aria-hidden="true">${esc(initials(name || "?"))}</span>`;
const nameOf = p => p?.display_name || "Greenlight member";

function toast(m){ document.querySelectorAll(".toast").forEach(t => t.remove()); const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
function errText(e){
  const m = (e && (e.message || e.error_description)) || "";
  if (/Invalid login credentials/i.test(m)) return "That email and password don't match. Try again or reset your password.";
  if (/already registered|already been registered/i.test(m)) return "An account with that email already exists. Sign in instead.";
  if (/Password should be/i.test(m)) return "Use a password with at least 8 characters.";
  if (/rate limit|too many/i.test(m)) return "Too many tries. Wait a minute and try again.";
  if (/Email not confirmed/i.test(m)) return "Confirm your email first. Check your inbox for the link.";
  if (/JWT|not authenticated|permission denied|row-level security/i.test(m)) return "Your session expired. Sign in again.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Can't reach the server. Check your connection.";
  return m || "Something went wrong. Try again.";
}
async function run(fn, ok){ try { const r = await fn(); if (r && r.error) throw r.error; if (ok) toast(ok); return r ?? true; } catch (e) { console.error(e); toast(errText(e)); return null; } }
const needAuth = (why) => { if (uid()) return false; S.auth = "signup"; S.authMsg = why || ""; renderAuth(); return true; };

/* ---------- data ---------- */
async function loadListings(){
  const { data, error } = await sb.from("listings").select("*, seller:profiles!listings_seller_id_fkey(id,display_name)").order("created_at", {ascending:false}).limit(400);
  if (error) { console.error(error); S.loadError = true; } else { S.listings = data; S.loadError = false; }
  S.loaded = true;
  if (S.route.edit && S.editing !== S.route.edit) { route(); return; }
  render();
}
async function loadMine(){
  if (!uid()) { S.threads = {}; S.saved = new Set(); S.me = null; render(); return; }
  const [p, t, s] = await Promise.all([
    sb.from("profiles").select("*").eq("id", uid()).maybeSingle(),
    sb.from("threads").select("*, listing:listings(id,title,photos,price,status,genre), buyer:profiles!threads_buyer_id_fkey(id,display_name), seller:profiles!threads_seller_id_fkey(id,display_name)").order("last_at", {ascending:false}).limit(300),
    sb.from("saved").select("listing_id")
  ]);
  S.me = p.data || null;
  S.threads = {}; (t.data || []).forEach(x => S.threads[x.id] = x);
  S.saved = new Set((s.data || []).map(x => x.listing_id));
  render();
}
let threadsT;
const reloadThreads = () => { clearTimeout(threadsT); threadsT = setTimeout(async () => {
  if (!uid()) return;
  const { data } = await sb.from("threads").select("*, listing:listings(id,title,photos,price,status,genre), buyer:profiles!threads_buyer_id_fkey(id,display_name), seller:profiles!threads_seller_id_fkey(id,display_name)").order("last_at", {ascending:false}).limit(300);
  if (data) { S.threads = {}; data.forEach(x => S.threads[x.id] = x); render(); }
}, 250); };
let channel = null;
function subscribe(){
  if (channel) { sb.removeChannel(channel); channel = null; }
  if (!uid()) return;
  channel = sb.channel("mine-" + uid())
    .on("postgres_changes", {event:"*", schema:"public", table:"threads"}, () => reloadThreads())
    .on("postgres_changes", {event:"INSERT", schema:"public", table:"messages"}, ({ new: m }) => {
      if (m.thread_id === S.thread && !S.msgs.some(x => x.id === m.id)) { S.msgs.push(m); renderConvo(true); }
      reloadThreads();
    })
    .subscribe();
}
async function openThreadData(tid){
  S.msgs = [];
  const { data } = await sb.from("messages").select("*").eq("thread_id", tid).order("created_at").limit(500);
  if (S.thread !== tid) return;
  S.msgs = data || []; renderConvo(false);
  sb.rpc("mark_read", {p_thread: tid}).then(() => reloadThreads());
}
function isUnread(t){
  if (!uid() || !t.last_from || t.last_from === uid()) return false;
  const read = t.buyer_id === uid() ? t.buyer_read_at : t.seller_read_at;
  return ts(t.last_at) > ts(read);
}

/* ---------- routing ---------- */
function parse(){
  const parts = (location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean);
  const [a, b] = parts;
  if (!a) return {view:"browse"};
  if (a === "listing" && b) return {view:"browse", listing:b};
  if (a === "seller" && b) return {view:"seller", id:b};
  if (a === "inbox") return {view:"inbox", thread:b || null};
  if (a === "edit" && b) return {view:"sell", edit:b};
  if (["saved","selling","sell","terms","privacy","how","account"].includes(a)) return {view:a};
  return {view:"browse"};
}
function route(){
  const prev = S.route; S.route = parse();
  S.menu = false;
  if (S.route.view === "sell") {
    if (S.route.edit) { const l = S.listings.find(x => x.id === S.route.edit); if (l && S.editing !== l.id) { startDraft(l); S.editing = l.id; app.innerHTML = ""; } else if (!l && S.loaded) { location.hash = "#/selling"; return; } }
    else if (S.editing || !S.draft) { S.editing = null; startDraft(); app.innerHTML = ""; }
  }
  if (S.route.view === "seller") loadSeller(S.route.id);
  if (S.route.view === "inbox") {
    S.thread = S.route.thread;
    if (S.thread && S.thread !== prev.thread) openThreadData(S.thread);
  } else S.thread = null;
  if (S.route.listing !== prev.listing) S.gIdx = 0;
  document.querySelectorAll(".navbtn").forEach(a => a.setAttribute("aria-current", a.dataset.view === (S.route.view === "seller" ? "browse" : S.route.view) ? "page" : "false"));
  if (!(prev.view === S.route.view && (S.route.listing || prev.listing))) window.scrollTo(0, 0);
  const title = S.route.listing ? (S.listings.find(l => l.id === S.route.listing)?.title || "Listing") : {browse:"Buy and sell games, prototypes and game ideas",inbox:"Inbox",selling:"Your listings",saved:"Saved",sell:"Create listing",terms:"Terms",privacy:"Privacy",how:"How it works",account:"Account",seller:"Seller"}[S.route.view];
  document.title = "Greenlight Market · " + title;
  render();
}
window.addEventListener("hashchange", route);
async function loadSeller(id){
  if (S.sellerProfile?.id === id) return;
  const { data } = await sb.from("profiles").select("id,display_name,bio,created_at").eq("id", id).maybeSingle();
  S.sellerProfile = data || {id, display_name:"Unknown seller"}; render();
}

/* ---------- render ---------- */
function render(){
  const unread = Object.values(S.threads).filter(isUnread).length;
  const u = $("#unread"); u.hidden = !unread; u.textContent = unread;
  renderAccount();
  const v = S.route.view;
  if (v === "browse" || v === "saved" || v === "seller") renderBrowse();
  else if (v === "sell") renderSell();
  else if (v === "inbox") renderInbox();
  else if (v === "selling") renderSelling();
  else if (v === "account") renderAccountPage();
  else renderDoc(v);
  renderModal();
}
function renderAccount(){
  const el = $("#account");
  if (!uid()) { el.innerHTML = `<button class="btn" data-auth="signin">Log in</button>`; return; }
  const nm = nameOf(S.me);
  el.innerHTML = `<button class="userchip" data-menu aria-haspopup="true" aria-expanded="${S.menu}" aria-label="Account menu">${avatar(uid(), nm)}</button>
    ${S.menu ? `<div class="menu" role="menu"><div class="who"><b>${esc(nm)}</b><br>${esc(S.user.email || "")}</div>
      <a href="#/seller/${esc(uid())}" role="menuitem">Your public profile</a><a href="#/selling" role="menuitem">Your listings</a><a href="#/account" role="menuitem">Account settings</a><button data-signout role="menuitem">Log out</button></div>` : ""}`;
}

function filtered(){
  let list = S.listings;
  if (S.route.view === "saved") list = list.filter(l => S.saved.has(l.id));
  if (S.route.view === "seller") list = list.filter(l => l.seller_id === S.route.id);
  if (S.cat !== "all") list = list.filter(l => l.type === S.cat);
  if (S.genre !== "All") list = list.filter(l => l.genre === S.genre);
  if (S.q) { const q = S.q.toLowerCase(); list = list.filter(l => [l.title, l.tagline, l.genre, l.platform, l.description].join(" ").toLowerCase().includes(q)); }
  const by = {new:(a,b) => ts(b.created_at) - ts(a.created_at), low:(a,b) => (a.price||0) - (b.price||0), high:(a,b) => (b.price||0) - (a.price||0)}[S.sort];
  return [...list].sort((a, b) => (a.status === "sold") - (b.status === "sold") || by(a, b));
}
function card(l, opts = {}){
  const saved = S.saved.has(l.id);
  return `<div class="card" ${opts.preview ? "" : `role="link" tabindex="0" data-href="#/listing/${esc(l.id)}"`}>
    <div class="thumb">${thumbInner(l)}
      <span class="tagpill">${esc(TYPES[l.type] || "Listing")}</span>
      ${l.status === "sold" ? '<span class="tagpill sold">Sold</span>' : ""}
      ${opts.preview || l.seller_id === uid() ? "" : `<button class="heart" data-save="${esc(l.id)}" aria-pressed="${saved}" aria-label="${saved ? "Remove from saved" : "Save"}">${svg("heart", saved ? 'fill="currentColor"' : "")}</button>`}
    </div>
    <div class="cinfo">
      <span class="cprice">${priceText(l)}${l.price_mode === "offers" && l.price ? '<span class="or">or best offer</span>' : ""}</span>
      <span class="ctitle">${esc(l.title)}</span>
      <span class="cmeta">${esc(l.genre)} · ${esc(l.platform)}${opts.preview ? "" : " · " + ago(l.created_at)}</span>
    </div></div>`;
}
function renderBrowse(){
  const v = S.route.view, list = filtered();
  const genres = ["All", ...GENRES.filter(g => S.listings.some(l => l.genre === g))];
  let head;
  if (v === "saved") head = `<div><h1>Saved</h1><div class="sub">Listings you've hearted. Only you can see this list.</div></div>`;
  else if (v === "seller") { const p = S.sellerProfile; head = `<div class="sellerhead">${avatar(S.route.id, nameOf(p), "lg")}<div><h1>${esc(p ? nameOf(p) : "Seller")}</h1><div class="sub">${p?.created_at ? "Member since " + new Date(p.created_at).toLocaleDateString(undefined, {month:"long", year:"numeric"}) + " · " : ""}${list.length} listing${list.length === 1 ? "" : "s"}${p?.bio ? "<br>" + esc(p.bio) : ""}</div></div></div>`; }
  else head = `<div><h1>${S.q ? `Results for “${esc(S.q)}”` : "Today's picks"}</h1><div class="sub">Finished games, playable prototypes and game ideas from independent developers.</div></div>`;
  const showHero = v === "browse" && !S.q && S.cat === "all" && S.genre === "All";
  if (v === "saved" && !uid()) { app.innerHTML = `<div class="wrap"><div class="heading"><h1>Saved</h1></div><div class="notice">Log in to save listings. <button class="btn primary" data-auth="signin">Log in</button></div></div>`; return; }
  app.innerHTML = `<div class="wrap">
    ${showHero ? `<section class="hero"><div><h1>Buy and sell games, prototypes and game ideas.</h1><p>List what you've built for free. Buyers message you and make offers in chat, so nobody waits weeks for an email back. Escrow checkout runs in demo mode during early access.</p>
      <div class="ctas"><a class="btn primary" href="#/sell">${svg("tag")}Sell something</a><a class="btn" href="#/how">How it works</a></div></div>
      <div class="how"><div><span class="n">1</span><div><b>List it</b>Photos, price, and what transfers with the sale.</div></div><div><span class="n">2</span><div><b>Talk and offer</b>Buyers message you and make offers in chat.</div></div><div><span class="n">3</span><div><b>Close the deal</b>Escrow releases the money once the buyer has the files (demo during early access).</div></div></div></section>` : ""}
    ${v === "saved" ? "" : `<div class="cats" role="group" aria-label="Category">${[["all","All"],["game","Finished games"],["concept","Prototypes"],["idea","Game ideas"]].map(([k, t]) => `<button class="cat" data-cat="${k}" aria-pressed="${S.cat === k}">${svg(k)}${t}</button>`).join("")}</div>`}
    <div class="heading">${head}
      <div class="tools">${v === "saved" ? "" : `<select class="btn" id="genre" aria-label="Genre">${genres.map(g => `<option ${S.genre === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select>`}
        <select class="btn" id="sort" aria-label="Sort"><option value="new">Newest first</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></div>
    </div>
    <div class="grid">
      ${!S.loaded ? Array.from({length:10}, () => `<div class="card skel" aria-hidden="true"><div class="thumb"></div><div class="line" style="width:40%"></div><div class="line" style="width:85%"></div></div>`).join("") :
        S.loadError ? `<div class="empty"><h3>Couldn't load listings</h3>Check your connection and refresh the page.</div>` :
        (list.map(l => card(l)).join("") || (v === "saved" ? `<div class="empty"><h3>Nothing saved yet</h3>Tap the heart on any listing to keep it here.<br><a class="btn" href="#/">Browse listings</a></div>`
          : !S.listings.length ? `<div class="empty"><h3>Be the first to list</h3>Greenlight just opened. Post a finished game, a prototype or a game idea. Listing is free.<br><a class="btn primary" href="#/sell">Create the first listing</a></div>`
          : `<div class="empty"><h3>No matches</h3>Try another category or genre, or clear your search.</div>`))}
    </div></div>`;
  $("#sort").value = S.sort;
}

/* ---------- listing modal ---------- */
function renderModal(){
  let el = $("#modal");
  const id = S.route.listing;
  if (!id) { if (el) { el.remove(); document.body.style.overflow = ""; } return; }
  const l = S.listings.find(x => x.id === id);
  if (!l) { if (!S.loaded) return; if (el) el.remove(); document.body.style.overflow = ""; if (S.loaded) { toast("That listing isn't available anymore."); location.hash = "#/"; } return; }
  const mine = l.seller_id === uid(), sold = l.status === "sold";
  const photos = (l.photos || []).map(photoUrl).filter(Boolean);
  const i = Math.min(S.gIdx, Math.max(0, photos.length - 1));
  const existing = uid() && Object.values(S.threads).find(t => t.listing_id === l.id && t.buyer_id === uid());
  const st = l.stats || {};
  const keep = {m: $("#askMsg")?.value, o: $("#offerAmt")?.value};
  let cta;
  if (mine) cta = `<div class="actions"><a class="btn primary" href="#/edit/${esc(l.id)}">Edit listing</a>${sold ? `<button class="btn" data-relist="${esc(l.id)}">Mark available</button>` : `<button class="btn" data-sold="${esc(l.id)}">Mark as sold</button>`}<button class="btn danger" data-del="${esc(l.id)}" data-confirm="0">Delete</button></div>`;
  else if (sold) cta = `<p class="fineprint">This listing has sold.</p>`;
  else cta = `<div class="actions">
      ${l.price ? `<button class="btn primary" data-buy="${esc(l.id)}">Buy now · ${money(l.price)}</button>` : ""}
      <button class="btn soft" data-save="${esc(l.id)}" aria-pressed="${S.saved.has(l.id)}">${svg("heart", S.saved.has(l.id) ? 'fill="currentColor"' : "")}${S.saved.has(l.id) ? "Saved" : "Save"}</button>
      <button class="btn soft" data-copy="${esc(location.origin + location.pathname + "#/listing/" + l.id)}">${svg("link")}Copy link</button>
    </div>
    ${existing ? `<div class="ask"><h3>${svg("chat")}You're talking with the seller</h3><a class="btn primary" href="#/inbox/${esc(existing.id)}">Open conversation</a></div>` :
    `<div class="ask"><h3>${svg("chat")}Send the seller a message</h3>
      <div class="quick">${QUICK.map(q => `<button data-quick="${esc(q)}">${esc(q)}</button>`).join("")}</div>
      <form class="compose" id="askForm"><input id="askMsg" maxlength="2000" placeholder="Hi, is this still available?" aria-label="Message to seller"><button class="btn primary" type="submit">Send</button></form>
      <form class="offerrow" id="offerForm"><label class="sr" for="offerAmt">Offer amount</label><input id="offerAmt" type="number" min="1" step="1" inputmode="numeric" placeholder="${l.price ? "$" + Math.round(l.price * .85) : "Your offer, $"}"><button class="btn" type="submit">${svg("tag")}Make offer</button></form>
    </div>`}`;
  const html = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <button class="close" data-close aria-label="Close">${svg("x")}</button>
    <div class="gallery">
      <div class="gmain">${photos.length ? `<img src="${esc(photos[i])}" alt="Photo ${i + 1} of ${photos.length} of ${esc(l.title)}">` : art(l)}
        ${photos.length > 1 ? `<button class="gnav prev" data-g="-1" aria-label="Previous photo">${svg("left")}</button><button class="gnav next" data-g="1" aria-label="Next photo">${svg("right")}</button>` : ""}</div>
      ${photos.length > 1 ? `<div class="gthumbs">${photos.map((p, k) => `<button data-gi="${k}" aria-pressed="${k === i}" aria-label="Photo ${k + 1}"><img src="${esc(p)}" alt=""></button>`).join("")}</div>` : ""}
    </div>
    <div class="info"><div class="scroll">
      <div><h2 id="mTitle">${esc(l.title)}</h2>
        <div class="bigprice">${priceText(l)}${l.price_mode === "offers" && l.price ? ' <span class="posted">or best offer</span>' : ""}</div>
        <div class="posted">Listed ${agoLong(l.created_at)} · ${esc(TYPES[l.type])}</div></div>
      ${cta}
      <div class="sec"><h3>Details</h3><dl class="facts"><dt>Type</dt><dd>${esc(TYPES[l.type])}</dd><dt>Genre</dt><dd>${esc(l.genre)}</dd><dt>Platform</dt><dd>${esc(l.platform)}</dd>
        ${st.visits ? `<dt>Total visits</dt><dd>${esc(st.visits)}</dd>` : ""}${st.ccu ? `<dt>Peak players</dt><dd>${esc(st.ccu)}</dd>` : ""}${st.revenue ? `<dt>Monthly revenue</dt><dd>${esc(st.revenue)}</dd>` : ""}</dl></div>
      ${(l.includes || []).length ? `<div class="sec"><h3>Included in the sale</h3><div class="chips">${l.includes.map(x => `<span>${svg("check")}${esc(x)}</span>`).join("")}</div></div>` : ""}
      <div class="sec"><h3>Description</h3><p class="desc">${esc(l.tagline)}\n\n${esc(l.description)}</p></div>
      ${l.link ? `<div class="sec"><h3>Link</h3><a href="${esc(l.link)}" target="_blank" rel="noopener noreferrer nofollow" style="overflow-wrap:anywhere">${esc(l.link)}</a></div>` : ""}
      <div class="sellercard">${avatar(l.seller_id, nameOf(l.seller))}<div><div class="n">${esc(mine ? "You" : nameOf(l.seller))}</div><a class="linkbtn" href="#/seller/${esc(l.seller_id)}">See all listings from this seller</a></div></div>
      <p class="fineprint">Payments go into escrow and reach the seller only after the buyer confirms delivery. Sellers pay a ${Math.round(FEE * 100)}% fee on completed sales. Checkout is in demo mode during early access.</p>
    </div></div></div>`;
  const fresh = !el;
  if (fresh) { el = document.createElement("div"); el.id = "modal"; el.className = "scrim"; document.body.appendChild(el); document.body.style.overflow = "hidden"; }
  el.innerHTML = html;
  if (keep.m && $("#askMsg")) $("#askMsg").value = keep.m;
  if (keep.o && $("#offerAmt")) $("#offerAmt").value = keep.o;
  if (fresh) $(".close", el).focus();
}
const closeModal = () => { if (history.length > 1 && S._cameFromApp) history.back(); else location.hash = S.route.view === "seller" ? "#/seller/" + S.route.id : "#/"; };

/* ---------- inbox ---------- */
async function ensureThread(l){
  const found = Object.values(S.threads).find(t => t.listing_id === l.id && t.buyer_id === uid());
  if (found) return found.id;
  let { data, error } = await sb.from("threads").insert({listing_id:l.id}).select("id").single();
  if (error && error.code === "23505") ({ data, error } = await sb.from("threads").select("id").eq("listing_id", l.id).eq("buyer_id", uid()).single());
  if (error) throw error;
  await reloadThreadsNow();
  return data.id;
}
async function reloadThreadsNow(){ clearTimeout(threadsT); const { data } = await sb.from("threads").select("*, listing:listings(id,title,photos,price,status,genre), buyer:profiles!threads_buyer_id_fkey(id,display_name), seller:profiles!threads_seller_id_fkey(id,display_name)").order("last_at", {ascending:false}).limit(300); if (data) { S.threads = {}; data.forEach(x => S.threads[x.id] = x); } }
function renderInbox(){
  if (!uid()) { app.innerHTML = `<div class="wrap"><div class="heading"><h1>Inbox</h1></div><div class="notice">Log in to message buyers and sellers. <button class="btn primary" data-auth="signin">Log in</button></div></div>`; return; }
  const all = Object.values(S.threads).sort((a, b) => ts(b.last_at) - ts(a.last_at));
  const list = all.filter(t => S.tab === "all" || (S.tab === "buying" ? t.buyer_id === uid() : t.seller_id === uid())).filter(t => t.last_text || t.offer);
  app.innerHTML = `<div class="wrap"><div class="inbox ${S.thread ? "has-open" : ""}">
    <section class="tlist" aria-label="Conversations">
      <header><h2>Inbox</h2></header>
      <div class="tabs" role="group" aria-label="Filter">${[["all","All"],["buying","Buying"],["selling","Selling"]].map(([k, t]) => `<button data-tab="${k}" aria-pressed="${S.tab === k}">${t}</button>`).join("")}</div>
      <div class="threads">${list.map(t => { const other = t.buyer_id === uid() ? t.seller : t.buyer; const l = t.listing || {title:"Removed listing"};
        return `<a class="trow ${isUnread(t) ? "unread" : ""}" href="#/inbox/${esc(t.id)}" aria-current="${S.thread === t.id}" style="text-decoration:none">
          <div class="tthumb">${thumbInner(l)}</div>
          <div style="min-width:0"><div class="top">${esc(nameOf(other))} · ${esc(l.title)}</div><div class="last">${t.last_from === uid() ? "You: " : ""}${esc(t.last_text || "New offer")}</div></div>
          <div class="when">${ago(t.last_at)}${isUnread(t) ? '<span class="udot" aria-label="Unread"></span>' : ""}</div></a>`; }).join("") ||
        `<div class="empty" style="margin:16px;border:0">No conversations yet.<br>Message a seller from any listing.<br><a class="btn" href="#/">Browse listings</a></div>`}</div>
    </section>
    <section class="convo" id="convo" aria-label="Conversation"></section>
  </div></div>`;
  renderConvo(false);
}
function dealActions(t, role){
  const o = t.offer; if (!o) return "";
  const s = o.status, b = (a, label, cls = "") => `<button class="btn ${cls}" data-deal="${esc(t.id)}" data-action="${a}">${label}</button>`;
  if (role === "seller") {
    if (s === "pending") return b("accept", "Accept " + money(o.amount), "good") + `<form class="offerrow" id="counterForm" style="display:inline-flex"><input id="counterAmt" type="number" min="1" step="1" placeholder="Counter, $" aria-label="Counter-offer amount"><button class="btn" type="submit">Counter</button></form>` + b("decline", "Decline", "danger");
    if (s === "escrow") return b("deliver", "I've delivered the files", "primary");
  } else {
    if (s === "countered") return b("accept", "Accept " + money(o.amount), "good") + b("decline", "Decline", "danger");
    if (s === "accepted") return b("pay", "Pay " + money(o.amount) + " into escrow", "primary");
    if (s === "transferred") return b("confirm", "I received everything", "good");
    if (s === "pending") return b("withdraw", "Withdraw offer");
  }
  return "";
}
function renderConvo(fromLive){
  const el = $("#convo"); if (!el) return;
  const t = S.threads[S.thread];
  if (!t) { el.innerHTML = `<div class="empty"><h3>${S.thread ? "Loading conversation…" : "Select a conversation"}</h3>${S.thread ? "" : "Messages with buyers and sellers show up here."}</div>`; return; }
  const role = t.seller_id === uid() ? "seller" : "buyer", other = role === "seller" ? t.buyer : t.seller;
  const l = t.listing || {title:"Removed listing", photos:[]};
  const o = t.offer, idx = o ? STEPS.indexOf(o.status === "countered" ? "pending" : o.status) : -1;
  const draft = $("#chatMsg")?.value || "";
  const box = $(".msgs", el), atBottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  let lastDay = "";
  const msgs = S.msgs.map(m => { const d = new Date(m.created_at).toLocaleDateString(undefined, {weekday:"short", month:"short", day:"numeric"}); const day = d !== lastDay ? `<div class="day">${d}</div>` : ""; lastDay = d;
    if (m.kind === "sys") return day + `<div class="msg sys">${esc(m.body)}</div>`;
    return day + `<div class="msg ${m.sender_id === uid() ? "me" : "them"}" title="${esc(new Date(m.created_at).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}))}">${esc(m.body)}</div>`; }).join("");
  el.innerHTML = `
    <div class="chead"><a class="btn icon soft back" href="#/inbox" aria-label="Back to conversations">${svg("left")}</a>
      <div class="tthumb">${thumbInner(l)}</div>
      <div style="min-width:0;flex:1"><div class="t">${esc(l.title)}</div><div class="s">${esc(nameOf(other))} · ${role === "seller" ? "Buyer" : "Seller"}</div></div>
      ${t.listing ? `<a class="btn soft" href="#/listing/${esc(t.listing_id)}">View listing</a>` : ""}</div>
    ${o ? `<div class="deal"><div class="dealtop"><div><span class="status st-${esc(o.status)}">${STATUS_LABEL[o.status] || esc(o.status)}</span> <b style="margin-left:6px;font-variant-numeric:tabular-nums">${money(o.amount)}</b> ${o.kind === "buy" ? '<span class="fineprint">· Buy now</span>' : ""}</div>
      <div class="actions" style="flex:0 1 auto">${dealActions(t, role)}</div></div>
      ${o.status === "declined" ? "" : `<div class="track">${STEPS.map((s, k) => `<div class="${k <= idx ? "on" : ""}"><span>${STEP_NAME[s]}</span></div>`).join("")}</div>`}
      ${o.status === "complete" && role === "seller" ? `<div class="fineprint">You'd receive ${money(o.amount * (1 - FEE))} after the ${Math.round(FEE * 100)}% fee once payments go live.</div>` : ""}</div>` : ""}
    <div class="msgs" aria-live="polite">${msgs || '<div class="msg sys">Say hi to start the conversation.</div>'}</div>
    <div class="cfoot">
      ${role === "buyer" && (!o || o.status === "declined") && l.status !== "sold" ? `<form class="offerrow" id="threadOffer"><input id="threadOfferAmt" type="number" min="1" step="1" placeholder="${l.price ? "$" + Math.round(l.price * .85) : "Offer, $"}" aria-label="Offer amount"><button class="btn" type="submit">${svg("tag")}Make offer</button></form>` : ""}
      <form class="compose" id="chatForm"><input id="chatMsg" maxlength="2000" placeholder="Message" aria-label="Message" autocomplete="off"><button class="btn primary icon" type="submit" aria-label="Send">${svg("send")}</button></form>
    </div>`;
  if (draft) $("#chatMsg").value = draft;
  const m = $(".msgs", el); if (atBottom || !fromLive) m.scrollTop = m.scrollHeight;
  if (isUnread(t) && fromLive) sb.rpc("mark_read", {p_thread: t.id}).then(() => reloadThreads());
}

/* ---------- selling dashboard ---------- */
function renderSelling(){
  if (!uid()) { app.innerHTML = `<div class="wrap"><div class="heading"><h1>Selling</h1></div><div class="notice">Log in to manage your listings. <button class="btn primary" data-auth="signin">Log in</button></div></div>`; return; }
  const mine = S.listings.filter(l => l.seller_id === uid());
  const active = mine.filter(l => l.status !== "sold").length, sold = mine.length - active;
  const waiting = Object.values(S.threads).filter(t => t.seller_id === uid() && t.offer && t.offer.status === "pending").length;
  app.innerHTML = `<div class="wrap">
    <div class="heading"><div><h1>Your listings</h1><div class="sub">${active} active · ${sold} sold · ${waiting} offer${waiting === 1 ? "" : "s"} waiting${waiting ? ` · <a href="#/inbox" data-tabset="selling">Review offers</a>` : ""}</div></div><a class="btn primary" href="#/sell">${svg("tag")}Create listing</a></div>
    <div class="grid">${mine.map(l => card(l)).join("") || `<div class="empty"><h3>You haven't listed anything</h3>List a finished game, a prototype or a game idea. It takes about two minutes.<br><a class="btn primary" href="#/sell">Create listing</a></div>`}</div></div>`;
}

/* ---------- sell / edit ---------- */
function startDraft(src){
  const p = src || {};
  S.draft = {type:p.type || "game", title:p.title || "", tagline:p.tagline || "", description:p.description || "", genre:p.genre || "Survival", platform:p.platform || "Roblox",
    price_mode:p.price_mode || "fixed", price:p.price || "", includes:[...(p.includes || [])], stats:{...(p.stats || {})}, link:p.link || "", photos:[...(p.photos || [])], removed:[]};
}
function readForm(){
  const d = S.draft; if (!$("#sellForm")) return;
  d.type = $('input[name="type"]:checked')?.value || d.type; d.price_mode = $('input[name="mode"]:checked')?.value || d.price_mode;
  d.title = $("#f-title").value; d.tagline = $("#f-tag").value; d.description = $("#f-desc").value; d.genre = $("#f-genre").value; d.platform = $("#f-plat").value;
  d.price = $("#f-price").value; d.link = $("#f-link").value; d.includes = [...document.querySelectorAll('input[name="inc"]:checked')].map(i => i.value);
  d.stats = {visits:$("#f-visits")?.value || "", ccu:$("#f-ccu")?.value || "", revenue:$("#f-rev")?.value || ""};
}
function renderSell(){
  if (!uid()) { app.innerHTML = `<div class="wrap"><div class="heading"><h1>Create listing</h1></div><div class="notice">Create a free account to list a game, prototype or idea. <button class="btn primary" data-auth="signup">Sign up</button> <button class="btn" data-auth="signin">Log in</button></div></div>`; return; }
  if (!S.draft) startDraft();
  if ($("#sellForm")) { updatePhotos(); updatePreview(); return; }
  const d = S.draft, editing = S.editing;
  app.innerHTML = `<div class="wrap formwrap">
  <form class="form" id="sellForm" novalidate>
    <div class="heading" style="padding:0"><div><h1>${editing ? "Edit listing" : "Create listing"}</h1><div class="sub">Listings with photos and real numbers get far more messages.</div></div></div>
    <div class="box"><h2>Photos <span class="hint">· up to 8, the first is the cover</span></h2><div class="photos" id="photos"></div></div>
    <div class="box"><h2>About it</h2>
      <div class="field"><span class="flabel">What are you selling?</span><div class="seg">${Object.entries(TYPES).map(([k, v]) => `<label><input type="radio" name="type" value="${k}" ${d.type === k ? "checked" : ""}>${v}</label>`).join("")}</div></div>
      <div class="field"><label for="f-title">Title</label><input id="f-title" maxlength="80" value="${esc(d.title)}" placeholder="Name of the game or idea"></div>
      <div class="field"><label for="f-tag">One-line pitch</label><input id="f-tag" maxlength="180" value="${esc(d.tagline)}" placeholder="What it is and why it's fun, in one sentence"></div>
      <div class="two"><div class="field"><label for="f-genre">Genre</label><select id="f-genre">${GENRES.map(g => `<option ${d.genre === g ? "selected" : ""}>${g}</option>`).join("")}</select></div>
        <div class="field"><label for="f-plat">Platform</label><select id="f-plat">${PLATFORMS.map(g => `<option ${d.platform === g ? "selected" : ""}>${g}</option>`).join("")}</select></div></div>
      <div class="field"><label for="f-desc">Description</label><textarea id="f-desc" maxlength="5000" placeholder="Features, current state, what a buyer could do next">${esc(d.description)}</textarea></div>
    </div>
    <div class="box"><h2>Price</h2>
      <div class="seg"><label><input type="radio" name="mode" value="fixed" ${d.price_mode !== "offers" ? "checked" : ""}>Fixed price</label><label><input type="radio" name="mode" value="offers" ${d.price_mode === "offers" ? "checked" : ""}>Open to offers</label></div>
      <div class="field"><label for="f-price">Price in USD <span class="hint" id="priceHint"></span></label><input id="f-price" type="number" min="0" max="10000000" step="1" inputmode="numeric" value="${esc(d.price)}" placeholder="e.g. 500"><span class="hint" id="feeHint"></span></div>
    </div>
    <div class="box"><h2>What the buyer gets</h2><div class="checks">${INCLUDES.map(x => `<label><input type="checkbox" name="inc" value="${esc(x)}" ${d.includes.includes(x) ? "checked" : ""}>${esc(x)}</label>`).join("")}</div>
      <p class="hint" style="margin:0">Roblox accounts can't be sold here (it's against Roblox's rules). Transfer games through a Roblox group instead.</p></div>
    <div class="box" id="statsBox"><h2>Numbers <span class="hint">· optional, but buyers look for them</span></h2>
      <div class="three"><div class="field"><label for="f-visits">Total visits</label><input id="f-visits" maxlength="20" value="${esc(d.stats.visits)}" placeholder="12,400"></div>
      <div class="field"><label for="f-ccu">Peak players</label><input id="f-ccu" maxlength="20" value="${esc(d.stats.ccu)}" placeholder="35"></div>
      <div class="field"><label for="f-rev">Monthly revenue</label><input id="f-rev" maxlength="20" value="${esc(d.stats.revenue)}" placeholder="$120"></div></div></div>
    <div class="box"><div class="field"><label for="f-link">Link <span class="hint">· game page, trailer or doc</span></label><input id="f-link" type="url" maxlength="300" value="${esc(d.link)}" placeholder="https://"></div></div>
    <p class="err" id="sellErr" role="alert"></p>
    <div class="actions"><button class="btn primary" type="submit" id="publishBtn">${editing ? "Save changes" : "Publish listing"}</button><button class="btn" type="button" data-cancelsell>Cancel</button></div>
  </form>
  <aside class="preview" aria-label="Preview"><span class="label">Preview</span><div id="previewCard"></div></aside></div>`;
  updatePhotos(); updatePreview();
}
function updatePhotos(){
  const el = $("#photos"); if (!el) return; const d = S.draft;
  el.innerHTML = d.photos.map((p, k) => `<div class="ph"><img src="${esc(photoUrl(p))}" alt="Photo ${k + 1}">${k === 0 ? '<span class="first">Cover</span>' : ""}<button type="button" class="x" data-rmphoto="${k}" aria-label="Remove photo ${k + 1}">×</button></div>`).join("") +
    Array.from({length:S.uploading}, () => `<div class="ph busy">Uploading…</div>`).join("") +
    (d.photos.length + S.uploading < 8 ? `<button type="button" class="ph add" data-addphoto>${svg("photo")}Add photos</button>` : "");
}
function updatePreview(){
  readForm(); const d = S.draft, el = $("#previewCard"); const pr = Math.round(+d.price || 0);
  if ($("#statsBox")) $("#statsBox").hidden = d.type !== "game";
  if ($("#feeHint")) $("#feeHint").textContent = pr ? `You'd receive ${money(pr * (1 - FEE))} after the ${Math.round(FEE * 100)}% fee.` : "";
  if ($("#priceHint")) $("#priceHint").textContent = d.price_mode === "offers" ? "· optional asking price" : "";
  if (el) el.innerHTML = card({id:"preview", type:d.type, title:d.title || "Your title", genre:d.genre, platform:d.platform, price:pr, price_mode:d.price_mode, photos:d.photos, created_at:new Date().toISOString()}, {preview:true});
}
async function compress(file){
  if (file.type === "image/gif" && file.size < 5e6) return file;
  try { const bmp = await createImageBitmap(file); const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), "image/jpeg", .86)); } catch (e) { return file; }
}
$("#filePick").addEventListener("change", async e => {
  const files = [...e.target.files].slice(0, 8 - S.draft.photos.length - S.uploading); e.target.value = "";
  if (!files.length || !uid()) return; readForm();
  S.uploading += files.length; updatePhotos();
  for (const f of files) {
    const b = await compress(f);
    const ext = b.type === "image/gif" ? "gif" : b.type === "image/png" ? "png" : b.type === "image/webp" ? "webp" : "jpg";
    const path = `${uid()}/${crypto.randomUUID()}.${ext}`;
    const r = await run(() => sb.storage.from(BUCKET).upload(path, b, {contentType: b.type || "image/jpeg", cacheControl: "31536000", upsert: false}));
    S.uploading--; if (r) S.draft.photos.push(path); updatePhotos(); updatePreview();
  }
});

/* ---------- auth ---------- */
function renderAuth(){
  let el = $("#authModal");
  if (!S.auth) { if (el) el.remove(); return; }
  const up = S.auth === "signup", reset = S.auth === "reset";
  const html = `<div class="authbox" role="dialog" aria-modal="true" aria-labelledby="aTitle">
    <button class="close" data-authclose aria-label="Close">${svg("x")}</button>
    <h2 id="aTitle">${reset ? "Reset your password" : up ? "Create your free account" : "Log in to Greenlight"}</h2>
    ${S.authMsg ? `<p class="fineprint" style="margin:0">${esc(S.authMsg)}</p>` : ""}
    <form id="authForm" style="display:grid;gap:12px">
      ${up ? `<div class="field"><label for="a-name">Display name</label><input id="a-name" maxlength="40" required autocomplete="nickname" placeholder="What buyers and sellers will see"></div>` : ""}
      <div class="field"><label for="a-email">Email</label><input id="a-email" type="email" required autocomplete="email"></div>
      ${reset ? "" : `<div class="field"><label for="a-pass">Password</label><input id="a-pass" type="password" required minlength="8" autocomplete="${up ? "new-password" : "current-password"}">${up ? '<span class="hint">At least 8 characters.</span>' : ""}</div>`}
      <p class="err" id="authErr" role="alert"></p>
      <button class="btn primary block" type="submit" id="authBtn">${reset ? "Send reset link" : up ? "Create account" : "Log in"}</button>
    </form>
    <div class="switch">${up ? `Already have an account? <button class="linkbtn" data-auth="signin">Log in</button>` : reset ? `<button class="linkbtn" data-auth="signin">Back to log in</button>` : `New here? <button class="linkbtn" data-auth="signup">Create an account</button> · <button class="linkbtn" data-auth="reset">Forgot password?</button>`}</div>
    ${up ? `<p class="fineprint" style="margin:0">By creating an account you agree to the <a href="#/terms" data-authclose>Terms</a> and <a href="#/privacy" data-authclose>Privacy Policy</a>.</p>` : ""}
  </div>`;
  if (!el) { el = document.createElement("div"); el.id = "authModal"; el.className = "scrim"; el.style.zIndex = 30; document.body.appendChild(el); }
  el.innerHTML = html; $("input", el)?.focus();
}
async function submitAuth(){
  const err = $("#authErr"), btn = $("#authBtn"); err.textContent = ""; btn.disabled = true;
  const email = $("#a-email").value.trim(), pass = $("#a-pass")?.value || "";
  try {
    if (S.auth === "signup") {
      const name = $("#a-name").value.trim();
      if (!name) throw {message:"Add a display name."};
      const { data, error } = await sb.auth.signUp({email, password:pass, options:{data:{display_name:name}, emailRedirectTo: location.origin + location.pathname}});
      if (error) throw error;
      if (!data.session) { S.authMsg = "Check your email for a link to confirm your account, then log in."; S.auth = "signin"; renderAuth(); return; }
      toast("Welcome to Greenlight, " + name + "!");
    } else if (S.auth === "reset") {
      const { error } = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname + "#/account"});
      if (error) throw error;
      S.authMsg = "If that email has an account, a reset link is on its way."; S.auth = "signin"; renderAuth(); return;
    } else {
      const { error } = await sb.auth.signInWithPassword({email, password:pass});
      if (error) throw error;
      toast("Logged in.");
    }
    S.auth = null; S.authMsg = ""; renderAuth();
  } catch (e) { err.textContent = errText(e); btn.disabled = false; }
}

/* ---------- account + docs ---------- */
function renderAccountPage(){
  if (!uid()) { app.innerHTML = `<div class="wrap doc"><h1>Account</h1><div class="notice">Log in to manage your account. <button class="btn primary" data-auth="signin">Log in</button></div></div>`; return; }
  if ($("#acctForm")) return;
  const recovering = S._recovery;
  app.innerHTML = `<div class="wrap doc"><h1>Account settings</h1>
    <form class="form" id="acctForm" style="padding:0">
      <div class="box"><h2>Public profile</h2>
        <div class="field"><label for="p-name">Display name</label><input id="p-name" maxlength="40" value="${esc(S.me?.display_name || "")}"></div>
        <div class="field"><label for="p-bio">About you <span class="hint">· shown on your seller page</span></label><textarea id="p-bio" maxlength="300" style="min-height:90px">${esc(S.me?.bio || "")}</textarea></div>
        <div class="actions"><button class="btn primary" type="submit">Save profile</button><a class="btn" href="#/seller/${esc(uid())}">View public profile</a></div></div>
    </form>
    <form class="form" id="passForm" style="padding:16px 0 0">
      <div class="box"><h2>${recovering ? "Choose a new password" : "Change password"}</h2>
        <div class="field"><label for="p-pass">New password</label><input id="p-pass" type="password" minlength="8" autocomplete="new-password"></div>
        <div class="actions"><button class="btn" type="submit">Update password</button></div></div>
    </form>
    <p class="fineprint" style="margin-top:16px">Signed in as ${esc(S.user.email || "")}. To delete your account and listings, email the address on the Terms page.</p></div>`;
}
const DOCS = {
  how: `<h1>How Greenlight works</h1>
    <p>Greenlight is a marketplace for game projects: finished games, playable prototypes and game ideas. Sellers list for free. Buyers browse, message sellers and make offers, all in one place.</p>
    <h2>For sellers</h2><ol><li>Create a free account and click <b>Create listing</b>.</li><li>Add photos, a price (or open it to offers), and tick exactly what transfers with the sale.</li><li>Answer messages and accept, counter or decline offers in your inbox.</li><li>Once the buyer pays into escrow, deliver the files (for Roblox games, usually by transferring the game to a group the buyer owns), then mark them delivered.</li></ol>
    <h2>For buyers</h2><ol><li>Message the seller with questions. Ask for analytics or a test build before you commit.</li><li>Use <b>Buy now</b> or make an offer.</li><li>Pay into escrow. The money is held until you confirm you received everything.</li><li>Check the files, then confirm delivery to release payment.</li></ol>
    <h2>Fees</h2><p>Listing is free. When a sale completes, the seller pays a ${Math.round(FEE * 100)}% fee. Buyers pay no fee.</p>
    <h2>Early access</h2><p>Checkout is in demo mode while payments are being set up. Every step works, but no money moves yet, so don't send files for a deal until real payments are live or you've agreed on another safe way to pay.</p>`,
  terms: `<h1>Terms of Service</h1><p class="fineprint">Last updated ${new Date(2026, 9, 22).toLocaleDateString(undefined, {year:"numeric", month:"long", day:"numeric"})}</p>
    <p>These terms are an early-access draft. By using Greenlight Market ("Greenlight", "we") you agree to them.</p>
    <h2>1. Who can use Greenlight</h2><p>You must be at least 13 to browse and at least 18, or have a parent or guardian's permission, to buy or sell. You're responsible for everything done with your account.</p>
    <h2>2. Listings</h2><p>Only list things you own or have the right to sell. Describe them honestly, including what transfers with the sale. Don't list stolen work, other people's intellectual property, game accounts (selling Roblox accounts breaks Roblox's Terms of Use), malware, or anything illegal. We may remove listings or accounts that break these rules.</p>
    <h2>3. Deals between users</h2><p>Sales are agreements between the buyer and seller. Greenlight provides the marketplace, messaging and, once live, escrow-style payments through a payment provider. We aren't a party to the sale and don't guarantee any listing, game, revenue figure or user.</p>
    <h2>4. Fees</h2><p>Listing is free. Sellers pay a ${Math.round(FEE * 100)}% fee on completed sales once payments are live. We'll announce fee changes before they apply.</p>
    <h2>5. Demo checkout</h2><p>During early access, checkout steps are simulated and no money moves. Don't rely on the demo escrow to protect a real transfer.</p>
    <h2>6. Content you post</h2><p>You keep ownership of what you post. You let us display it on Greenlight so the marketplace works. Don't post anything you don't have the right to share.</p>
    <h2>7. Disclaimers</h2><p>Greenlight is provided "as is". To the extent the law allows, we aren't liable for losses from deals between users or from the site being unavailable.</p>
    <h2>8. Contact</h2><p>Questions or reports: <b>sungyooni0921@gmail.com</b></p>`,
  privacy: `<h1>Privacy Policy</h1>
    <p>This policy explains what Greenlight Market collects and why.</p>
    <h2>What we collect</h2><ul><li><b>Account details:</b> your email address and display name.</li><li><b>What you post:</b> listings, photos and your profile bio, which are public.</li><li><b>Messages and offers:</b> visible only to you and the other person in the conversation.</li><li><b>Basic technical data</b> our hosting providers log to keep the service running and secure.</li></ul>
    <h2>How we use it</h2><p>To run the marketplace: show listings, deliver messages, handle offers and keep accounts secure. We don't sell your personal information.</p>
    <h2>Who processes it</h2><p>Data is stored with Supabase (database, login and file storage) and the site is served by GitHub Pages. When payments launch, a payment provider will handle card and payout details; we won't store card numbers.</p>
    <h2>Your choices</h2><p>You can edit or delete your listings at any time. To delete your account entirely, email <b>sungyooni0921@gmail.com</b>.</p>`
};
function renderDoc(v){ app.innerHTML = `<article class="wrap doc">${DOCS[v] || ""}</article>`; }

/* ---------- actions ---------- */
async function toggleSave(id){
  if (needAuth("Create a free account to save listings.")) return;
  const has = S.saved.has(id); has ? S.saved.delete(id) : S.saved.add(id); render();
  const ok = await run(() => has ? sb.from("saved").delete().eq("user_id", uid()).eq("listing_id", id) : sb.from("saved").insert({listing_id:id}), has ? "Removed from saved." : "Saved.");
  if (!ok) { has ? S.saved.add(id) : S.saved.delete(id); render(); }
}
async function sendFirst(l, text){
  if (needAuth("Create a free account to message sellers.")) return;
  const tid = await run(() => ensureThread(l)); if (!tid) return;
  const ok = await run(() => sb.from("messages").insert({thread_id:tid, body:text}), "Message sent.");
  if (ok) location.hash = "#/inbox/" + tid;
}
async function offerFromListing(l, action, amount){
  if (needAuth("Create a free account to make offers.")) return;
  const tid = await run(() => ensureThread(l)); if (!tid) return;
  const ok = await run(() => sb.rpc("deal_action", {p_thread:tid, p_action:action, p_amount:amount ?? null}), action === "buy" ? "Reserved. Pay into escrow to lock it in." : "Offer sent.");
  if (ok) { await reloadThreadsNow(); location.hash = "#/inbox/" + tid; }
}
async function deal(tid, action, amount){
  const ok = await run(() => sb.rpc("deal_action", {p_thread:tid, p_action:action, p_amount:amount ?? null}),
    {accept:"Offer accepted.", decline:"Offer declined.", counter:"Counter-offer sent.", withdraw:"Offer withdrawn.", pay:"Paid into escrow (demo).", deliver:"Marked as delivered.", confirm:"Deal complete.", offer:"Offer sent."}[action]);
  if (ok) { await reloadThreadsNow(); if (action === "confirm") loadListings(); render(); }
}
async function deleteListing(l){
  const ok = await run(() => sb.from("listings").delete().eq("id", l.id), "Listing deleted.");
  if (ok) { if ((l.photos || []).length) sb.storage.from(BUCKET).remove(l.photos); S.listings = S.listings.filter(x => x.id !== l.id); location.hash = "#/selling"; }
}

document.addEventListener("click", async e => {
  const t = e.target.closest("[data-save],[data-href],[data-close],[data-cat],[data-buy],[data-quick],[data-g],[data-gi],[data-sold],[data-relist],[data-del],[data-tab],[data-tabset],[data-deal],[data-addphoto],[data-rmphoto],[data-cancelsell],[data-auth],[data-authclose],[data-menu],[data-signout],[data-copy]");
  if (S.menu && !e.target.closest(".menu,[data-menu]")) { S.menu = false; renderAccount(); }
  if (!t) { if (e.target.id === "modal") closeModal(); if (e.target.id === "authModal") { S.auth = null; renderAuth(); } return; }
  const ds = t.dataset;
  if (ds.save) { e.stopPropagation(); toggleSave(ds.save); return; }
  if (ds.href) { S._cameFromApp = true; location.hash = ds.href; return; }
  if ("close" in ds) { closeModal(); return; }
  if (ds.cat) { S.cat = ds.cat; render(); return; }
  if (ds.buy) { const l = S.listings.find(x => x.id === ds.buy); if (l) offerFromListing(l, "buy"); return; }
  if (ds.quick) { const i = $("#askMsg"); if (i) { i.value = ds.quick; i.focus(); } return; }
  if (ds.g) { const l = S.listings.find(x => x.id === S.route.listing); const n = (l?.photos || []).length; if (n) { S.gIdx = (S.gIdx + +ds.g + n) % n; renderModal(); } return; }
  if (ds.gi) { S.gIdx = +ds.gi; renderModal(); return; }
  if (ds.sold) { const ok = await run(() => sb.from("listings").update({status:"sold"}).eq("id", ds.sold), "Marked as sold."); if (ok) loadListings(); return; }
  if (ds.relist) { const ok = await run(() => sb.from("listings").update({status:"active"}).eq("id", ds.relist), "Listing is available again."); if (ok) loadListings(); return; }
  if (ds.del) { if (ds.confirm === "0") { t.dataset.confirm = "1"; t.textContent = "Tap again to delete"; setTimeout(() => { if (t.isConnected) { t.dataset.confirm = "0"; t.textContent = "Delete"; } }, 4000); return; }
    const l = S.listings.find(x => x.id === ds.del); if (l) deleteListing(l); return; }
  if (ds.tab) { S.tab = ds.tab; render(); return; }
  if (ds.tabset) { S.tab = ds.tabset; return; }
  if (ds.deal) { t.disabled = true; await deal(ds.deal, ds.action); return; }
  if ("addphoto" in ds) { $("#filePick").click(); return; }
  if (ds.rmphoto) { readForm(); const p = S.draft.photos.splice(+ds.rmphoto, 1)[0]; if (p) S.draft.removed.push(p); updatePhotos(); updatePreview(); return; }
  if ("cancelsell" in ds) { cleanupDraftUploads(); S.draft = null; const back = S.editing ? "#/listing/" + S.editing : "#/"; S.editing = null; location.hash = back; return; }
  if (ds.auth) { e.preventDefault(); S.auth = ds.auth; if (!$("#authModal")) S.authMsg = ""; renderAuth(); return; }
  if ("authclose" in ds) { S.auth = null; renderAuth(); return; }
  if ("menu" in ds) { S.menu = !S.menu; renderAccount(); return; }
  if ("signout" in ds) { await sb.auth.signOut(); toast("Logged out."); location.hash = "#/"; return; }
  if (ds.copy) { try { await navigator.clipboard.writeText(ds.copy); toast("Link copied."); } catch (_) { toast(ds.copy); } return; }
});
function cleanupDraftUploads(){
  if (!S.draft) return;
  const orig = S.editing ? (S.listings.find(l => l.id === S.editing)?.photos || []) : [];
  const fresh = [...S.draft.photos, ...S.draft.removed].filter(p => !orig.includes(p));
  if (fresh.length) sb.storage.from(BUCKET).remove(fresh);
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { if (S.auth) { S.auth = null; renderAuth(); } else if (S.route.listing) closeModal(); else if (S.menu) { S.menu = false; renderAccount(); } }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".card[data-href]")) { e.preventDefault(); S._cameFromApp = true; location.hash = e.target.dataset.href; }
  if (S.route.listing && (e.key === "ArrowRight" || e.key === "ArrowLeft") && !e.target.matches("input,textarea")) { const l = S.listings.find(x => x.id === S.route.listing); const n = (l?.photos || []).length; if (n > 1) { S.gIdx = (S.gIdx + (e.key === "ArrowRight" ? 1 : -1) + n) % n; renderModal(); } }
});
document.addEventListener("change", e => { if (e.target.id === "sort") { S.sort = e.target.value; render(); } if (e.target.id === "genre") { S.genre = e.target.value; render(); } });
document.addEventListener("input", e => { if (e.target.closest("#sellForm")) updatePreview(); });
let qT; $("#q").addEventListener("input", e => { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value.trim(); if (!["browse","seller"].includes(S.route.view) || S.route.listing) location.hash = "#/"; else render(); }, 150); });

document.addEventListener("submit", async e => {
  e.preventDefault(); const id = e.target.id;
  const listing = () => S.listings.find(x => x.id === S.route.listing);
  if (id === "authForm") return submitAuth();
  if (id === "askForm") { const l = listing(); const text = ($("#askMsg").value.trim() || "Hi, is this still available?").slice(0, 2000); if (l) sendFirst(l, text); }
  if (id === "offerForm") { const l = listing(); const a = Math.round(+$("#offerAmt").value); if (!(a > 0)) { toast("Enter an offer above $0."); return; } if (l) offerFromListing(l, "offer", a); }
  if (id === "threadOffer") { const a = Math.round(+$("#threadOfferAmt").value); if (!(a > 0)) { toast("Enter an offer above $0."); return; } deal(S.thread, "offer", a); }
  if (id === "counterForm") { const a = Math.round(+$("#counterAmt").value); if (!(a > 0)) { toast("Enter a counter-offer above $0."); return; } deal(S.thread, "counter", a); }
  if (id === "chatForm") { const i = $("#chatMsg"); const text = i.value.trim(); if (!text) return; i.value = "";
    const r = await run(() => sb.from("messages").insert({thread_id:S.thread, body:text.slice(0, 2000)}).select().single());
    if (!r) i.value = text; else { const m = r.data; if (m && !S.msgs.some(x => x.id === m.id)) { S.msgs.push(m); renderConvo(false); } $("#chatMsg")?.focus(); } }
  if (id === "acctForm") { const display_name = $("#p-name").value.trim(), bio = $("#p-bio").value.trim(); if (!display_name) { toast("Add a display name."); return; }
    const ok = await run(() => sb.from("profiles").update({display_name, bio}).eq("id", uid()), "Profile saved."); if (ok) { S.me = {...S.me, display_name, bio}; S.sellerProfile = null; loadListings(); renderAccount(); } }
  if (id === "passForm") { const p = $("#p-pass").value; if (p.length < 8) { toast("Use a password with at least 8 characters."); return; }
    const ok = await run(() => sb.auth.updateUser({password:p}), "Password updated."); if (ok) { $("#p-pass").value = ""; S._recovery = false; } }
  if (id === "sellForm") {
    readForm(); const d = S.draft, err = $("#sellErr");
    const title = d.title.trim(), tagline = d.tagline.trim(), description = d.description.trim(), price = Math.max(0, Math.min(10000000, Math.round(+d.price || 0)));
    let link = d.link.trim(); if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
    if (!title || !tagline || !description) { err.textContent = "Add a title, a one-line pitch and a description."; return; }
    if (d.price_mode === "fixed" && !price) { err.textContent = "Set a price, or switch to Open to offers."; return; }
    if (S.uploading) { err.textContent = "Wait for your photos to finish uploading."; return; }
    err.textContent = ""; $("#publishBtn").disabled = true;
    const row = {type:d.type, title, tagline, description, genre:d.genre, platform:d.platform, price, price_mode:d.price_mode, includes:d.includes,
      stats: d.type === "game" ? {visits:d.stats.visits.trim(), ccu:d.stats.ccu.trim(), revenue:d.stats.revenue.trim()} : {}, link, photos:d.photos};
    if (S.editing) {
      const eid = S.editing;
      const r = await run(() => sb.from("listings").update(row).eq("id", eid).select().single(), "Changes saved.");
      if (r) { if (d.removed.length) sb.storage.from(BUCKET).remove(d.removed); S.draft = null; S.editing = null; await loadListings(); location.hash = "#/listing/" + eid; } else $("#publishBtn").disabled = false;
    } else {
      const r = await run(() => sb.from("listings").insert(row).select().single(), "Listing published.");
      if (r) { if (d.removed.length) sb.storage.from(BUCKET).remove(d.removed); S.draft = null; await loadListings(); location.hash = "#/listing/" + r.data.id; } else $("#publishBtn").disabled = false;
    }
  }
});

/* ---------- boot ---------- */
$("#yr").textContent = new Date().getFullYear();
sb.auth.onAuthStateChange((event, session) => {
  const was = uid(); S.user = session?.user || null;
  if (event === "PASSWORD_RECOVERY") { S._recovery = true; location.hash = "#/account"; toast("Choose a new password below."); }
  if (was !== uid()) { loadMine(); subscribe(); if ($("#acctForm")) app.innerHTML = ""; render(); }
});
route();
loadListings();
setInterval(() => { if (document.visibilityState === "visible") loadListings(); }, 60000);
})();
