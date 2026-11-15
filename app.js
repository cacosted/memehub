(function () {
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const CATS = ["Todos", "★ Favoritos", "Reacciones", "Frases", "Ash y anime", "Iconos", "Items Pokémon", "Sprites y UI", "GIF y video"];
  const MOODS = [
    ["Gané", "gane victoria"], ["Perdí", "perdi derrota"], ["Mala suerte", "mala suerte"],
    ["Sorpresa", "sorpresa"], ["Esperando", "esperando"], ["Plan malvado", "plan malvado"],
    ["Confundido", "confundido"], ["Sospechoso", "sospechoso"], ["Triste", "triste"],
    ["Risa", "risa burla"], ["Dinero", "dinero"], ["Rápido", "rapido"], ["Rival digno", "digno oponente"],
    ["No", "no rechazo"], ["Sí", "si aprobado"], ["Aura", "aura cool"], ["Shiny", "shiny"], ["Amenaza", "amenaza"],
  ];

  let memes = [];
  let view = [];
  let cat = "Todos";
  let favs = new Set(store.get("favs", []));
  let uses = store.get("uses", {});
  let current = -1;

  const url = (dir, f) => `${dir}/${encodeURIComponent(f)}`;
  const isFav = (m) => favs.has(m.file);

  // ---------- UI estática ----------
  $("#cats").innerHTML = CATS.map((c) => `<button class="chip" data-cat="${c}">${c}</button>`).join("");
  $("#moods").innerHTML = '<span class="moods-label">Situaciones:</span>' +
    MOODS.map(([l, q]) => `<button class="mood" data-q="${q}">${l}</button>`).join("");

  // ---------- render ----------
  function render() {
    const q = $("#q").value.trim();
    let res = MemeSearch.search(memes, q);
    if (cat === "★ Favoritos") res = res.filter((r) => isFav(r.m));
    else if (cat === "GIF y video") res = res.filter((r) => r.m.type !== "imagen");
    else if (cat !== "Todos") res = res.filter((r) => r.m.cat === cat);

    const sort = $("#sort").value;
    if (sort === "uses") res.sort((a, b) => (uses[b.m.file] || 0) - (uses[a.m.file] || 0) || b.score - a.score);
    else if (sort === "az") res.sort((a, b) => a.m.title.localeCompare(b.m.title, "es"));
    else if (!q) {
      // sin búsqueda: favoritos y más usados primero, luego memes antes que assets
      const rank = (m) => { const i = CATS.indexOf(m.cat); return i < 0 ? 99 : i; };
      res.sort((a, b) => (isFav(b.m) - isFav(a.m)) || (uses[b.m.file] || 0) - (uses[a.m.file] || 0) || rank(a.m) - rank(b.m));
    }

    view = res.map((r) => r.m);
    $("#grid").innerHTML = view.map((m, i) => `
      <figure class="card${isFav(m) ? " fav" : ""}" data-i="${i}">
        <button class="open" data-i="${i}" aria-label="Ver ${esc(m.title)}">
          <img src="${url("thumbs", m.thumb)}" alt="${esc(m.title)}" loading="lazy" decoding="async">
          ${m.type !== "imagen" ? `<span class="badge">${m.type === "gif" ? "GIF" : "VIDEO"}</span>` : ""}
        </button>
        <figcaption>${esc(m.title)}</figcaption>
          <span class="acts">
            <button class="star" data-act="fav" data-i="${i}" aria-label="Favorito" title="Favorito">${isFav(m) ? "★" : "☆"}</button>
            ${m.type === "video" ? "" : `<button data-act="copy" data-i="${i}" title="Copiar imagen" aria-label="Copiar">⧉</button>`}
            <a href="${url("memes", m.file)}" download data-act="dl" data-i="${i}" title="Descargar" aria-label="Descargar">↓</a>
          </span>
      </figure>`).join("");

    const n = view.length;
    $("#status").textContent = q
      ? (n ? `${n} resultado${n === 1 ? "" : "s"} para “${q}”` : `Nada en tu colección para “${q}”.`)
      : (cat === "★ Favoritos" && !n ? "Aún no tienes favoritos: toca ☆ en un meme." : "");
    $("#fallback").classList.toggle("show", !!q);
    if (q) {
      const term = encodeURIComponent(q + " meme");
      $("#fbq").textContent = `Busca “${q}” afuera:`;
      $("#fb-pin").href = `https://co.pinterest.com/search/pins/?q=${term}`;
      $("#fb-google").href = `https://www.google.com/search?tbm=isch&q=${term}`;
      $("#fb-tenor").href = `https://tenor.com/search/${encodeURIComponent(q.replace(/\s+/g, "-"))}-gifs`;
    }
    document.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cat === cat));
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cat !== "Todos") params.set("cat", cat);
    history.replaceState(null, "", params.toString() ? `?${params}` : location.pathname);
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- acciones ----------
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function used(m) {
    uses[m.file] = (uses[m.file] || 0) + 1;
    store.set("uses", uses);
  }

  function toggleFav(m) {
    favs.has(m.file) ? favs.delete(m.file) : favs.add(m.file);
    store.set("favs", [...favs]);
  }

  async function copy(m) {
    // El blob va como promesa para que el permiso del clic no se pierda (Safari/Chrome).
    const pngPromise = (async () => {
      const blob = await fetch(url("memes", m.file)).then((r) => r.blob());
      if (blob.type === "image/png") return blob;
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0);
      return new Promise((r) => c.toBlob(r, "image/png"));
    })();
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })]);
      used(m);
      toast(m.type === "gif" ? "Copiado (cuadro fijo). Para el GIF animado usa Descargar." : "Copiado. Pégalo en Resolve o donde quieras.");
    } catch (e) {
      toast("Tu navegador no dejó copiar. Usa Descargar.");
    }
  }

  // ---------- visor ----------
  const dlg = $("#viewer");
  function openViewer(i) {
    current = i;
    const m = view[i];
    if (!m) return;
    const src = url("memes", m.file);
    $("#v-media").innerHTML = m.type === "video"
      ? `<video src="${src}" controls autoplay loop playsinline></video>`
      : `<img src="${src}" alt="${esc(m.title)}">`;
    $("#v-cat").textContent = m.cat;
    $("#v-title").textContent = m.title;
    $("#v-desc").textContent = m.desc;
    $("#v-tags").innerHTML = (m.tags || []).map((t) => `<button class="tag" data-q="${esc(t)}">${esc(t)}</button>`).join("");
    $("#v-dl").href = src;
    $("#v-dl").setAttribute("download", m.file);
    $("#v-copy").hidden = m.type === "video";
    $("#v-fav").textContent = isFav(m) ? "★ Favorito" : "☆ Favorito";
    $("#v-fav").classList.toggle("on", isFav(m));
    $("#v-file").textContent = m.file + (uses[m.file] ? ` · usado ${uses[m.file]} ${uses[m.file] === 1 ? "vez" : "veces"}` : "");
    if (!dlg.open) dlg.showModal();
  }
  const step = (d) => view.length && openViewer((current + d + view.length) % view.length);

  $("#v-close").onclick = () => dlg.close();
  $("#v-prev").onclick = () => step(-1);
  $("#v-next").onclick = () => step(1);
  $("#v-copy").onclick = () => copy(view[current]);
  $("#v-dl").onclick = () => used(view[current]);
  $("#v-fav").onclick = () => { toggleFav(view[current]); openViewer(current); render(); };
  $("#v-tags").onclick = (e) => {
    const b = e.target.closest(".tag");
    if (!b) return;
    dlg.close();
    setQuery(b.dataset.q);
  };
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => { $("#v-media").innerHTML = ""; });

  // ---------- eventos ----------
  $("#grid").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (act) {
      const m = view[+act.dataset.i];
      if (act.dataset.act === "fav") { toggleFav(m); render(); }
      if (act.dataset.act === "copy") copy(m);
      if (act.dataset.act === "dl") used(m);
      return;
    }
    const open = e.target.closest(".open");
    if (open) openViewer(+open.dataset.i);
  });

  function setQuery(q) {
    $("#q").value = q;
    render();
    $("#q").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  let tmr;
  $("#q").addEventListener("input", () => { clearTimeout(tmr); tmr = setTimeout(render, 120); });
  $("#sort").addEventListener("change", render);
  $("#cats").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (b) { cat = b.dataset.cat; render(); }
  });
  $("#moods").addEventListener("click", (e) => {
    const b = e.target.closest(".mood");
    if (b) setQuery(b.dataset.q);
  });

  document.addEventListener("keydown", (e) => {
    if (dlg.open) {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
      return;
    }
    if (e.key === "/" && document.activeElement !== $("#q")) { e.preventDefault(); $("#q").focus(); $("#q").select(); }
  });

  // ---------- pestañas + Pinterest ----------
  function showTab(name) {
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
    $("#coleccion").hidden = name !== "coleccion";
    $("#pinterest").hidden = name !== "pinterest";
    if (name === "pinterest") loadPinterest();
  }
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  document.querySelector("[data-goto=pinterest]").onclick = (e) => { e.preventDefault(); showTab("pinterest"); window.scrollTo(0, 0); };

  let pinLoaded = false;
  function loadPinterest() {
    if (pinLoaded) return;
    pinLoaded = true;
    const box = $("#pin-board");
    const w = Math.min(box.clientWidth || 900, 1200);
    const cols = w < 500 ? 2 : w < 800 ? 3 : 5;
    box.innerHTML = `<a data-pin-do="embedBoard" data-pin-board-width="${w}" data-pin-scale-height="${Math.round(window.innerHeight * 0.75)}" data-pin-scale-width="${Math.floor(w / cols) - 10}" href="https://www.pinterest.com/guerra9788/memes/">Cargando tablero…</a>`;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://assets.pinterest.com/js/pinit.js";
    document.body.appendChild(s);
  }

  // ---------- inicio ----------
  fetch("data/memes.json").then((r) => r.json()).then((data) => {
    memes = data;
    MemeSearch.prepare(memes);
    $("#count").textContent = `${memes.length} memes`;
    const p = new URLSearchParams(location.search);
    if (p.get("q")) $("#q").value = p.get("q");
    if (CATS.includes(p.get("cat"))) cat = p.get("cat");
    render();
  });
})();
