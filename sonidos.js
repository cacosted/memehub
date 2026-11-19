// Pestaña Sonidos: mismo buscador por situación que los memes, con reproductor y forma de onda.
(function () {
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const CATS = ["Todos", "★ Favoritos", "Memes", "Pokémon", "Golpes y acción", "Interfaz y avisos",
    "Suspenso y drama", "Música meme", "Ambiente", "Retro (Junkala)"];
  const MOODS = [
    ["Golpe", "golpe"], ["Explosión", "explosion"], ["Error", "error fallo"], ["Correcto", "correcto"],
    ["Risa", "risa burla"], ["Sorpresa", "sorpresa"], ["Suspenso", "suspenso"], ["Triste", "triste"],
    ["Victoria", "ganar victoria"], ["Dinero", "dinero"], ["Transición", "transicion whoosh"],
    ["Aparecer", "aparecer pop brillo"], ["Correr", "correr rapido"], ["Alarma", "alarma peligro"],
    ["Grito Pokémon", "grito pokemon"], ["Subir nivel", "subir nivel"], ["Shiny", "shiny"], ["Malvado", "malvado"],
  ];
  const PAGE = 120;

  let items = [], view = [], shown = 0, cat = "Todos", loaded = false;
  let favs = new Set(store.get("sfavs", []));
  let uses = store.get("suses", {});
  let playing = -1, raf = 0;
  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = store.get("svol", 0.8);

  const url = (s) => `sonidos/${encodeURIComponent(s.file)}`;
  const isFav = (s) => favs.has(s.file);
  const fmt = (d) => d < 10 ? `${d.toFixed(1)} s` : d < 60 ? `${Math.round(d)} s` : `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, "0")}`;

  // Forma de onda: un solo path por tarjeta (barras), copiado encima en color para el progreso.
  function wavePath(w) {
    let d = "";
    for (let i = 0; i < w.length; i++) {
      const h = Math.max(1, (parseInt(w[i], 36) / 35) * 22);
      d += `M${i * 2 + 1} ${12 - h / 2}v${h}`;
    }
    return d;
  }
  const waveSvg = (s, cls = "") =>
    `<svg class="${cls}" viewBox="0 0 96 24" preserveAspectRatio="none" aria-hidden="true"><path d="${wavePath(s.wave || "")}"/></svg>`;

  $("#scats").innerHTML = CATS.map((c) => `<button class="chip" data-cat="${c}">${c}</button>`).join("");
  $("#smoods").innerHTML = '<span class="moods-label">Situaciones:</span>' +
    MOODS.map(([l, q]) => `<button class="mood" data-q="${q}">${l}</button>`).join("");
  $("#svol").value = Math.round(audio.volume * 100);

  function card(s, i) {
    const free = s.cat === "Retro (Junkala)";
    return `
      <article class="snd${isFav(s) ? " fav" : ""}${i === playing ? " on" : ""}" data-i="${i}"${APP ? "" : ' draggable="true"'}>
        <button class="play" data-act="play" data-i="${i}" aria-label="Reproducir ${esc(s.title)}"></button>
        <div class="meta">
          <h3 title="${esc(s.desc)}">${esc(s.title)}</h3>
          <p>${esc(s.cat)} · ${fmt(s.dur || 0)}${free ? ' · <span class="free" title="Libre de derechos (CC0)">CC0</span>' : ""}</p>
        </div>
        <span class="sacts">
          <button class="star" data-act="fav" data-i="${i}" title="Favorito" aria-label="Favorito">${isFav(s) ? "★" : "☆"}</button>
          <a href="${url(s)}" download="${esc(s.file)}" data-act="dl" data-i="${i}" title="${window.memehubApp ? "Mostrar en Finder" : "Descargar"}" aria-label="${window.memehubApp ? "Mostrar en Finder" : "Descargar"}">${window.memehubApp ? "⌕" : "↓"}</a>
        </span>
        <div class="wave" data-act="seek" data-i="${i}">${waveSvg(s)}${waveSvg(s, "played")}</div>
      </article>`;
  }

  function render() {
    const q = $("#sq").value.trim();
    let res = MemeSearch.search(items, q);
    if (cat === "★ Favoritos") res = res.filter((r) => isFav(r.m));
    else if (cat !== "Todos") res = res.filter((r) => r.m.cat === cat);
    const sort = $("#ssort").value;
    if (sort === "uses") res.sort((a, b) => (uses[b.m.file] || 0) - (uses[a.m.file] || 0) || b.score - a.score);
    else if (sort === "short") res.sort((a, b) => a.m.dur - b.m.dur);
    else if (sort === "az") res.sort((a, b) => a.m.title.localeCompare(b.m.title, "es", { numeric: true }));
    else if (!q) {
      const rank = (s) => CATS.indexOf(s.cat);
      res.sort((a, b) => (isFav(b.m) - isFav(a.m)) || (uses[b.m.file] || 0) - (uses[a.m.file] || 0) ||
        rank(a.m) - rank(b.m) || a.m.title.localeCompare(b.m.title, "es", { numeric: true }));
    } else {
      // con búsqueda: tus sonidos pesan más que las variantes del pack retro
      const w = (r) => r.score * (r.m.cat === "Retro (Junkala)" ? 0.7 : 1);
      res.sort((a, b) => w(b) - w(a));
    }
    stop();
    view = res.map((r) => r.m);
    shown = 0;
    $("#sgrid").innerHTML = "";
    more();

    const n = view.length;
    $("#sstatus").textContent = q
      ? (n ? `${n} sonido${n === 1 ? "" : "s"} para “${q}”` : `Nada en tus sonidos para “${q}”.`)
      : (cat === "★ Favoritos" && !n ? "Aún no tienes favoritos: toca ☆ en un sonido." : `${n} sonidos`);
    $("#sfallback").classList.toggle("show", !!q);
    if (q) {
      const e = encodeURIComponent(q);
      $("#sfbq").textContent = `Busca “${q}” afuera:`;
      $("#sfb-myinstants").href = `https://www.myinstants.com/es/search/?name=${e}`;
      $("#sfb-pixabay").href = `https://pixabay.com/sound-effects/search/${encodeURIComponent(q.replace(/\s+/g, "-"))}/`;
      $("#sfb-freesound").href = `https://freesound.org/search/?q=${e}`;
    }
    document.querySelectorAll("#scats .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cat === cat));
    syncUrl();
  }

  function more() {
    const next = view.slice(shown, shown + PAGE);
    $("#sgrid").insertAdjacentHTML("beforeend", next.map((s, k) => card(s, shown + k)).join(""));
    shown += next.length;
    $("#smore").hidden = shown >= view.length;
  }
  new IntersectionObserver((e) => { if (e[0].isIntersecting && loaded && shown < view.length) more(); },
    { rootMargin: "600px" }).observe($("#smore"));

  function syncUrl() {
    if ($("#sonidos").hidden) return;
    const p = new URLSearchParams({ tab: "sonidos" });
    if ($("#sq").value.trim()) p.set("q", $("#sq").value.trim());
    if (cat !== "Todos") p.set("cat", cat);
    history.replaceState(null, "", `?${p}`);
  }

  // ---------- reproducción ----------
  const cardEl = (i) => $(`#sgrid .snd[data-i="${i}"]`);
  function paint() {
    const el = cardEl(playing);
    if (el && audio.duration) el.style.setProperty("--p", `${(audio.currentTime / audio.duration) * 100}%`);
    raf = requestAnimationFrame(paint);
  }
  function stop() {
    audio.pause();
    cancelAnimationFrame(raf);
    const el = cardEl(playing);
    if (el) { el.classList.remove("on"); el.style.removeProperty("--p"); }
    playing = -1;
  }
  function play(i, at = 0) {
    const s = view[i];
    if (!s) return;
    if (playing === i && !audio.paused && at === 0) { stop(); return; }
    stop();
    playing = i;
    if (!audio.src.endsWith(url(s))) audio.src = url(s);
    audio.currentTime = at * (s.dur || 0);
    audio.play().catch(() => {});
    const el = cardEl(i);
    if (el) { el.classList.add("on"); el.scrollIntoView({ block: "nearest" }); }
    raf = requestAnimationFrame(paint);
  }
  audio.addEventListener("ended", () => {
    const el = cardEl(playing);
    if (el) el.style.setProperty("--p", "100%");
    const i = playing;
    setTimeout(() => { if (playing === i) stop(); }, 250);
  });

  function used(s) { uses[s.file] = (uses[s.file] || 0) + 1; store.set("suses", uses); }

  // ---------- eventos ----------
  $("#sgrid").addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    const el = e.target.closest(".snd");
    if (!el) return;
    const i = +el.dataset.i, s = view[i];
    const act = a ? a.dataset.act : "play";
    if (act === "fav") {
      favs.has(s.file) ? favs.delete(s.file) : favs.add(s.file);
      store.set("sfavs", [...favs]);
      el.classList.toggle("fav", isFav(s));
      a.textContent = isFav(s) ? "★" : "☆";
    } else if (act === "dl") {
      used(s);
      if (APP) { e.preventDefault(); APP.reveal("sonidos/" + s.file); }
    }
    else if (act === "seek") {
      const r = a.getBoundingClientRect();
      play(i, Math.min(0.98, Math.max(0, (e.clientX - r.left) / r.width)));
    } else play(i);
  });

  // Arrastrar una tarjeta al Finder/escritorio (Chrome) baja el archivo.
  // En Memehub.app el arrastre es del archivo de verdad: sirve para soltarlo en Resolve.
  const APP = window.memehubApp || null;
  if (APP) $("#sonidos .hint.keys").innerHTML = $("#sonidos .hint.keys").innerHTML.replace("arrastra una tarjeta al Finder para bajarla", "arrastra una tarjeta a Resolve o al Finder");
  $("#sgrid").addEventListener("mousedown", (e) => {
    if (!APP || e.button !== 0 || e.target.closest(".sacts")) return;
    const el = e.target.closest(".snd");
    if (!el) return;
    const s = view[+el.dataset.i];
    APP.arm("sonidos/" + s.file, "", { started: () => used(s) });
  });
  $("#sgrid").addEventListener("dragstart", (e) => {
    const el = e.target.closest(".snd");
    if (!el) return;
    const s = view[+el.dataset.i];
    const abs = new URL(url(s), location.href).href;
    e.dataTransfer.setData("DownloadURL", `audio/mpeg:${s.file}:${abs}`);
    e.dataTransfer.setData("text/uri-list", abs);
    used(s);
  });

  let tmr;
  $("#sq").addEventListener("input", () => { clearTimeout(tmr); tmr = setTimeout(render, 120); });
  $("#ssort").addEventListener("change", render);
  $("#svol").addEventListener("input", (e) => { audio.volume = e.target.value / 100; store.set("svol", audio.volume); });
  $("#scats").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (b) { cat = b.dataset.cat; render(); }
  });
  $("#smoods").addEventListener("click", (e) => {
    const b = e.target.closest(".mood");
    if (b) { $("#sq").value = b.dataset.q; render(); $("#sq").focus(); }
  });

  // Teclado: ↓/↑ suena el siguiente/anterior, Espacio repite o para.
  document.addEventListener("keydown", (e) => {
    if ($("#sonidos").hidden || document.querySelector("dialog[open]")) return;
    const typing = document.activeElement === $("#sq");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      let i = playing < 0 ? (d > 0 ? 0 : view.length - 1) : playing + d;
      if (i >= shown && shown < view.length) more();
      if (i >= 0 && i < view.length) play(i);
    } else if (e.key === " " && !typing && !/BUTTON|A|SELECT|INPUT/.test(document.activeElement.tagName)) {
      e.preventDefault();
      if (playing >= 0 && !audio.paused) stop(); else play(Math.max(0, playing));
    } else if (e.key === "Escape") stop();
    else if (e.key === "Enter" && typing && view.length) { e.preventDefault(); play(0); }
  });

  // ---------- carga (solo al abrir la pestaña) ----------
  async function show(params) {
    if (params) {
      if (params.get("q")) $("#sq").value = params.get("q");
      if (CATS.includes(params.get("cat"))) cat = params.get("cat");
    }
    if (!loaded) {
      items = await fetch("data/sonidos.json").then((r) => r.json());
      items.forEach((s) => { s.tags = [...(s.tags || []), s.cat.replace(/[()]/g, "")]; });
      MemeSearch.prepare(items);
      loaded = true;
    }
    render();
    return items.length;
  }
  function hide() { stop(); }

  window.Sonidos = { show, hide, count: () => items.length };
})();
