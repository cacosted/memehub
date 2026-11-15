// Buscador por situación, sin IA: normaliza, quita palabras vacías,
// expande sinónimos y puntúa título, etiquetas y descripción.
(function () {
  const norm = (s) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();

  const STOP = new Set(("a al algo alguien ante asi aun con contra cual cuando de del desde donde el ella ellos en entre era es esa ese eso esta estaba estan estar este esto estoy fue fui ha hace hacer hay he la las le les lo los me mi mis mas muy nada ni no_stop nos o otra otro para pero poco por porque pues que quien se ser si_stop sin sobre son su sus te ti tu tus un una uno unos unas y ya yo meme memes momento cuando situacion cosa algo gif imagen nada salio sale toca tengo tiene tienes alguno").split(" "));

  // Cada grupo: palabras que significan lo mismo para buscar un meme.
  const GROUPS = [
    "ganar, gane, gano, ganamos, victoria, triunfo, campeon, campeona, logro, exito, lo logre, si se pudo, win, celebrar, celebracion, trofeo",
    "perder, perdi, perdio, perdimos, derrota, derrotado, fracaso, fail, game over, morir, muerto, muri, debilitado, fracase",
    "triste, tristeza, llorar, llorando, lloro, sad, deprimido, depresion, pena, lagrimas, dolor",
    "feliz, alegre, alegria, contento, emocionado, emocion, hype, felicidad, ilusion",
    "sorpresa, sorprendido, sorprende, shock, impactado, omg, wow, asombro, asombrado, no puede ser, increible",
    "enojado, enojo, furioso, rabia, molesto, ira, enfadado, coraje, berrinche, harto",
    "confundido, confusion, no entiendo, huh, duda, perdido, no se",
    "sospechoso, sospecha, sus, desconfiar, desconfio, raro, ceja, reojo",
    "dinero, plata, money, rico, millonario, gastar, gaste, gasto, gastos, comprar, compra, oferta, vender, pepita, billete, lana, pagar, deuda, tienda",
    "pobre, quebrado, sin dinero, acabo, no money, limosna, not stonks",
    "robar, roban, robo, robaron, ladron, asalto, estafa, estafado, timo, scam",
    "esperar, espera, esperando, tarda, tardar, tardo, lento, mucho tiempo, paciencia, cuanto falta",
    "rapido, velocidad, veloz, speedrun, correr, corre, prisa, apurado",
    "suerte, azar, random, randomizer, dados, probabilidad, rng",
    "mala suerte, injusto, rayos, lo que faltaba, estafado, chale, ni modo, falla, fallo, fallar, miss, critico",
    "malvado, maldad, plan malvado, malicia, tramando, travieso, evil, jejeje",
    "risa, reir, riendo, jaja, jajaja, burla, gracioso, carcajada, xd, chistoso",
    "miedo, susto, terror, asustado, nervioso, panico, ansiedad, tension",
    "no, nope, rechazo, nunca, prohibido, me niego, no quiero",
    "si, aprobado, ok, bien, perfecto, check, acepto, me sirve",
    "fuerte, musculoso, poder, poderoso, op, overpowered, roto, chad, flex",
    "inteligente, genio, estrategia, big brain, logica, jugada maestra, cerebro",
    "dormir, sueno, mimir, noche, cama",
    "cansado, agotado, exhausto, cansancio, harto, grind",
    "rendirse, rindo, rendir, me rindo, renuncio, abandono, rage quit, ya no puedo",
    "shiny, brillante, variocolor, amuleto iris, shiny charm",
    "atrapar, capturar, captura, atrape, pokeball, ball",
    "entrenar, entrenamiento, farmear, farmeo, farmeando, grind, subir nivel, level up, experiencia, exp",
    "pelea, pelear, batalla, combate, reto, desafio, rival, duelo, jefe, lider, gimnasio, enfrentamiento, torneo",
    "amenaza, amenazar, pistola, arma, venganza, castigo",
    "adios, despedida, chao, me voy, se fue, irse",
    "ayuda, socorro, auxilio, salvar, rescate",
    "amor, enamorado, me encanta, corazon, hermoso",
    "cool, estilo, presumir, aura, confiado, lentes, chulo, elegante",
    "verguenza, facepalm, error, cringe, ridiculo",
    "hacker, hackear, trampa, cheat, computadora",
    "comida, comer, hambre",
    "pensar, pensando, reflexionar, analizar, mmm",
    "fe, esperanza, confianza, creer, tuve fe",
    "equipo, team, companero, pana, amigo",
    "flecha, senalar, apuntar, mira aqui",
    "nuzlocke, hardcore, dificil, dificultad",
    "silencio, callado, incomodo, awkward",
    "asco, huele mal, apesta, cringe",
  ].map((g) => g.split(",").map((w) => w.trim()));

  // índice: palabra -> conjunto de palabras del mismo grupo
  const SYN = new Map();
  for (const g of GROUPS) for (const w of g) {
    if (!SYN.has(w)) SYN.set(w, new Set());
    g.forEach((x) => SYN.get(w).add(x));
  }

  // raíz ligera: quita plurales y terminaciones verbales comunes
  const stem = (w) => w.length <= 4 ? w
    : w.replace(/(amente|aciones|acion|ando|iendo|aron|ieron|ados|idos|adas|idas|ado|ido|ada|ida|ar|er|ir|es|os|as|s)$/, "");

  function expand(term) {
    const out = new Map([[term, 1]]);
    const add = (w, weight) => { if (!out.has(w) || out.get(w) < weight) out.set(w, weight); };
    const tryKey = (k) => { if (SYN.has(k)) SYN.get(k).forEach((w) => add(w, 0.7)); };
    tryKey(term);
    // también por raíz: "perdiendo" -> "perd" encuentra "perdi", "perder"
    let st = stem(term);
    if (st === term && term.length >= 5) st = term.slice(0, term.length - 1);
    if (st.length >= 4) for (const k of SYN.keys()) if (k.startsWith(st)) tryKey(k);
    return out;
  }

  function prepare(memes) {
    for (const m of memes) {
      m._title = norm(m.title);
      m._tags = (m.tags || []).map(norm);
      m._tagWords = new Set(m._tags.flatMap((t) => t.split(" ")));
      m._desc = norm(m.desc);
      m._file = norm(m.file.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
      m._all = [m._title, m._tags.join(" "), m._desc, m._file].join(" ");
    }
  }

  // puntaje de una palabra contra un meme
  function wordScore(m, w, loose) {
    let s = 0;
    let st = stem(w);
    if (loose && st === w && w.length >= 5) st = w.slice(0, w.length - 1); // roban -> roba
    const pref = st.length >= 4 ? st : null;
    if (m._tags.includes(w)) s = Math.max(s, 6);
    if (m._tagWords.has(w)) s = Math.max(s, 5);
    if (new RegExp(`\\b${w}\\b`).test(m._title)) s = Math.max(s, 5);
    if (pref) {
      for (const t of m._tagWords) if (t.startsWith(pref)) { s = Math.max(s, 3.5); break; }
      if (new RegExp(`\\b${pref}`).test(m._title)) s = Math.max(s, 3.5);
    }
    if (s === 0 && new RegExp(`\\b${pref || w}`).test(m._desc)) s = 2;
    if (s === 0 && m._file.includes(w)) s = 1.5;
    if (s === 0 && w.length >= 3 && m._all.includes(w)) s = 1;
    return s;
  }

  function search(memes, query) {
    const q = norm(query);
    if (!q) return memes.map((m) => ({ m, score: 0 }));
    let terms = q.split(" ").filter((w) => w && !STOP.has(w));
    if (!terms.length) terms = q.split(" ");
        // frases de dos o tres palabras que son sinónimos ("mala suerte", "no puede ser")
    const phrases = [], used = new Set();
    for (const n of [3, 2]) for (let i = 0; i + n <= terms.length; i++) {
      const idx = [...Array(n).keys()].map((k) => i + k);
      if (idx.some((k) => used.has(k))) continue;
      const p = idx.map((k) => terms[k]).join(" ");
      if (SYN.has(p)) { phrases.push(p); idx.forEach((k) => used.add(k)); }
    }
    const singles = terms.filter((_, k) => !used.has(k));
    const concepts = [...singles.map(expand), ...phrases.map(expand)];
    const results = [];
    for (const m of memes) {
      let total = 0, hit = 0;
      for (const c of concepts) {
        let best = 0;
        for (const [w, weight] of c) {
          if (w.includes(" ")) {
            if (m._all.includes(w)) best = Math.max(best, 5 * weight);
          } else best = Math.max(best, wordScore(m, w, weight === 1) * weight);
          if (best >= 6) break;
        }
        if (best > 0) hit++;
        total += best;
      }
      if (!hit) continue;
      if (q.length > 3 && (m._title.includes(q) || m._tags.some((t) => t.includes(q)))) total += 8;
      const coverage = hit / concepts.length;
      results.push({ m, score: total * (0.4 + 0.6 * coverage) });
    }
    results.sort((a, b) => b.score - a.score);
    // descarta coincidencias muy débiles frente a la mejor
    const top = results.length ? results[0].score : 0;
    return results.filter((r) => r.score >= top * 0.22);
  }

  window.MemeSearch = { prepare, search, norm };
})();
