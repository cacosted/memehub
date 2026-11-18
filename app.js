(function () {
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const BOARD = "guerra9788/memes";
  const PIN_CDN = "https://i.pinimg.com";
  const CATS = ["Todos", "★ Favoritos", "Reacciones", "Frases", "Emojis y stickers", "Ash y anime", "Iconos",
    "Items Pokémon", "Sprites y UI", "Pantalla verde", "GIF y video"];
  const MOODS = [
    ["Gané", "gane victoria"], ["Perdí", "perdi derrota"], ["Mala suerte", "mala suerte"],
    ["Sorpresa", "sorpresa"], ["Esperando", "esperando"], ["Plan malvado", "plan malvado"],
    ["Confundido", "confundido"], ["Sospechoso", "sospechoso"], ["Triste", "triste"],
    ["Risa", "risa burla"], ["Dinero", "dinero"], ["Rápido", "rapido"], ["Rival digno", "digno oponente"],
    ["No", "no rechazo"], ["Sí", "si aprobado"], ["Aura", "aura cool"], ["Shiny", "shiny"], ["Amenaza", "amenaza"],
  ];

  let items = [];
  let view = [];
  let cat = "Todos";
  let favs = new Set(store.get("favs", []));
  let uses = store.get("uses", {});
  let current = -1;

  const local = (dir, f) => `${dir}/${encodeURIComponent(f)}`;
  const isFav = (m) => favs.has(m.key);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Un mismo formato para memes propios y pines.
  function fromLocal(m) {
    return { ...m, key: m.file, src: "local", thumbUrl: local("thumbs", m.thumb), fullUrl: local("memes", m.file),
      animated: m.type !== "imagen" };
  }
  function fromPin(p, isNew = false) {
    return { key: "pin:" + p.id, id: p.id, src: "pin", isNew, file: p.title, title: p.title, desc: p.desc || "",
      cat: p.cat, tags: p.tags, type: p.video ? "video" : "imagen", animated: !!p.video,
      thumbUrl: `${PIN_CDN}/236x/${p.img}`, fullUrl: `${PIN_CDN}/736x/${p.img}`,
      pinUrl: `https://co.pinterest.com/pin/${p.id}/` };
  }

  // ---------- UI estática ----------
  $("#cats").innerHTML = CATS.map((c) => `<button class="chip" data-cat="${c}">${c}</button>`).join("");
  $("#moods").innerHTML = '<span class="moods-label">Situaciones:</span>' +
    MOODS.map(([l, q]) => `<button class="mood" data-q="${q}">${l}</button>`).join("");

  // ---------- render ----------
  function render() {
    const q = $("#q").value.trim();
    const source = $("#source").value;
    let res = MemeSearch.search(items, q);
    if (source !== "all") res = res.filter((r) => r.m.src === source);
    if (cat === "★ Favoritos") res = res.filter((r) => isFav(r.m));
    else if (cat === "GIF y video") res = res.filter((r) => r.m.animated);
    else if (cat !== "Todos") res = res.filter((r) => r.m.cat === cat);

    const sort = $("#sort").value;
    if (sort === "uses") res.sort((a, b) => (uses[b.m.key] || 0) - (uses[a.m.key] || 0) || b.score - a.score);
    else if (sort === "az") res.sort((a, b) => a.m.title.localeCompare(b.m.title, "es"));
    else if (!q) {
      // sin búsqueda: pines nuevos, favoritos y más usados primero; luego tus memes antes que los assets
      const rank = (m) => { const i = CATS.indexOf(m.cat); return (m.src === "pin" ? 50 : 0) + (i < 0 ? 40 : i); };
      res.sort((a, b) => (b.m.isNew - a.m.isNew) || (isFav(b.m) - isFav(a.m)) ||
        (uses[b.m.key] || 0) - (uses[a.m.key] || 0) || rank(a.m) - rank(b.m));
    }

    view = res.map((r) => r.m);
    $("#grid").innerHTML = view.map((m, i) => `
      <figure class="card${isFav(m) ? " fav" : ""}" data-i="${i}">
        <button class="open" data-i="${i}" aria-label="Ver ${esc(m.title)}">
          <img src="${m.thumbUrl}" alt="${esc(m.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          ${m.animated ? `<span class="badge">${m.type === "gif" ? "GIF" : "VIDEO"}</span>` : ""}
          ${m.src === "pin" ? `<span class="badge pin${m.isNew ? " new" : ""}">${m.isNew ? "NUEVO" : "P"}</span>` : ""}
        </button>
        <figcaption>${esc(m.title)}</figcaption>
        <span class="acts">
          <button class="star" data-act="fav" data-i="${i}" aria-label="Favorito" title="Favorito">${isFav(m) ? "★" : "☆"}</button>
          ${m.src === "pin"
            ? `<a href="${m.pinUrl}" target="_blank" rel="noopener" data-act="dl" data-i="${i}" title="Abrir en Pinterest" aria-label="Abrir en Pinterest">↗</a>`
            : `${m.type === "video" ? "" : `<button data-act="copy" data-i="${i}" title="Copiar imagen" aria-label="Copiar">⧉</button>`}
               <a href="${m.fullUrl}" download data-act="dl" data-i="${i}" title="Descargar" aria-label="Descargar">↓</a>`}
        </span>
      </figure>`).join("");

    const n = view.length;
    $("#status").textContent = q
      ? (n ? `${n} resultado${n === 1 ? "" : "s"} para “${q}”` : `Nada en tu colección ni en tu tablero para “${q}”.`)
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
    if (source !== "all") params.set("src", source);
    if (!$("#coleccion").hidden) history.replaceState(null, "", params.toString() ? `?${params}` : location.pathname);
  }

  // ---------- acciones ----------
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2400);
  }

  function used(m) {
    uses[m.key] = (uses[m.key] || 0) + 1;
    store.set("uses", uses);
  }

  function toggleFav(m) {
    favs.has(m.key) ? favs.delete(m.key) : favs.add(m.key);
    store.set("favs", [...favs]);
  }

  async function copy(m) {
    // El blob va como promesa para que el permiso del clic no se pierda (Safari/Chrome).
    const pngPromise = (async () => {
      const blob = await fetch(m.fullUrl).then((r) => r.blob());
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
    const pin = m.src === "pin";
    $("#v-media").innerHTML = m.type === "video" && !pin
      ? `<video src="${m.fullUrl}" controls autoplay loop playsinline></video>`
      : `<img src="${m.fullUrl}" alt="${esc(m.title)}" referrerpolicy="no-referrer">`;
    $("#v-cat").textContent = pin ? `Pinterest · ${m.cat}` : m.cat;
    $("#v-title").textContent = m.title;
    $("#v-desc").textContent = pin && m.type === "video" ? "Es un video: ábrelo en Pinterest para verlo." : m.desc;
    $("#v-tags").innerHTML = (m.tags || []).map((t) => `<button class="tag" data-q="${esc(t)}">${esc(t)}</button>`).join("");
    $("#v-copy").hidden = pin || m.type === "video";
    $("#v-dl").hidden = pin;
    $("#v-pin").hidden = !pin;
    $("#v-img").hidden = !pin;
    if (pin) {
      $("#v-pin").href = m.pinUrl;
      $("#v-img").href = m.fullUrl;
    } else {
      $("#v-dl").href = m.fullUrl;
      $("#v-dl").setAttribute("download", m.file);
    }
    $("#v-fav").textContent = isFav(m) ? "★ Favorito" : "☆ Favorito";
    $("#v-fav").classList.toggle("on", isFav(m));
    const u = uses[m.key];
    $("#v-file").textContent = (pin ? `pin ${m.id}` : m.file) + (u ? ` · usado ${u} ${u === 1 ? "vez" : "veces"}` : "");
    if (!dlg.open) dlg.showModal();
  }
  const step = (d) => view.length && openViewer((current + d + view.length) % view.length);

  $("#v-close").onclick = () => dlg.close();
  $("#v-prev").onclick = () => step(-1);
  $("#v-next").onclick = () => step(1);
  $("#v-copy").onclick = () => copy(view[current]);
  $("#v-dl").onclick = () => used(view[current]);
  $("#v-pin").onclick = () => used(view[current]);
  $("#v-img").onclick = () => used(view[current]);
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
  $("#source").addEventListener("change", render);
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
    const box = $("#sonidos").hidden ? $("#q") : $("#sq");
    if (e.key === "/" && document.activeElement !== box) { e.preventDefault(); box.focus(); box.select(); }
  });

  // ---------- pestañas + tablero embebido ----------
  let countText = "";
  function showTab(name, params) {
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== name));
    if (name !== "sonidos" && window.Sonidos) Sonidos.hide();
    if (name === "pinterest") { loadBoardWidget(); history.replaceState(null, "", "?tab=pinterest"); }
    if (name === "coleccion") render();
    $("#count").textContent = countText;
    if (name === "sonidos") Sonidos.show(params).then((n) => { $("#count").textContent = `${n} sonidos`; });
  }
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  document.querySelector("[data-goto=pinterest]").onclick = (e) => { e.preventDefault(); showTab("pinterest"); window.scrollTo(0, 0); };

  let widgetLoaded = false;
  function loadBoardWidget() {
    if (widgetLoaded) return;
    widgetLoaded = true;
    const box = $("#pin-board");
    const w = Math.min(box.clientWidth || 900, 1200);
    const cols = w < 500 ? 2 : w < 800 ? 3 : 5;
    box.innerHTML = `<a data-pin-do="embedBoard" data-pin-board-width="${w}" data-pin-scale-height="${Math.round(window.innerHeight * 0.75)}" data-pin-scale-width="${Math.floor(w / cols) - 10}" href="https://www.pinterest.com/${BOARD}/">Cargando tablero…</a>`;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://assets.pinterest.com/js/pinit.js";
    document.body.appendChild(s);
  }

  // Los 50 pines más recientes del tablero, en vivo (endpoint público del widget oficial).
  // Los que no están en data/pinterest.json aparecen como "NUEVO" hasta que se etiqueten.
  async function liveNewPins(knownIds) {
    try {
      const r = await fetch(`https://widgets.pinterest.com/v3/pidgets/boards/${BOARD}/pins/`);
      const j = await r.json();
      return (j.data?.pins || []).filter((p) => !knownIds.has(p.id)).map((p) => {
        const img = (p.images?.["564x"]?.url || p.images?.["237x"]?.url || "").replace(/^https:\/\/i\.pinimg\.com\/[^/]+\//, "");
        const words = MemeSearch.norm(p.description || "").split(" ").filter((w) => w.length > 2);
        return fromPin({ id: p.id, img, video: p.is_video, cat: "Nuevos sin etiquetar",
          title: (p.description || "").trim() || "Pin nuevo sin etiquetar", tags: ["nuevo", ...words] }, true);
      }).filter((m) => m.thumbUrl.endsWith(".jpg") || m.thumbUrl.endsWith(".png") || m.thumbUrl.endsWith(".gif"));
    } catch {
      return [];
    }
  }

  // ---------- inicio ----------
  Promise.all([
    fetch("data/memes.json").then((r) => r.json()),
    fetch("data/pinterest.json").then((r) => r.json()).catch(() => ({ pins: [], skip: [] })),
  ]).then(async ([mine, board]) => {
    items = [...mine.map(fromLocal), ...board.pins.map((p) => fromPin(p))];
    MemeSearch.prepare(items);
    countText = `${mine.length} tuyos · ${board.pins.length} de Pinterest`;
    $("#count").textContent = countText;
    const p = new URLSearchParams(location.search);
    const tab = p.get("tab");
    if (tab === "sonidos" || tab === "pinterest") showTab(tab, p);
    else {
      if (p.get("q")) $("#q").value = p.get("q");
      if (CATS.includes(p.get("cat"))) cat = p.get("cat");
      if (["local", "pin"].includes(p.get("src"))) $("#source").value = p.get("src");
      render();
    }

    const known = new Set([...board.pins.map((x) => x.id), ...(board.skip || [])]);
    const fresh = await liveNewPins(known);
    if (fresh.length) {
      MemeSearch.prepare(fresh);
      items = [...fresh, ...items];
      countText += ` · ${fresh.length} nuevo${fresh.length === 1 ? "" : "s"}`;
      if (!$("#coleccion").hidden) $("#count").textContent = countText;
      render();
    }
  });
})();
