/* Kalyx — rend data/<jour>.json (écrit par `node src/jobs/build-site.ts`).
   Aucune cote de book ici : la cote juste se calcule depuis la probabilité (1 / p). */
(() => {
  "use strict";

  const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
  const num1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const num2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const longDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const shortDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
  const fullDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const stamp = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  const COUNTRY = { England: "Angleterre", Spain: "Espagne", Italy: "Italie", France: "France", Germany: "Allemagne" };
  const REASONS = {
    stale_data: "données anciennes",
    thin_history: "historique mince",
    cal_low: "ligue mal calibrée",
    cal_missing: "calibration non mesurée",
    extreme_p: "probabilité extrême",
    league_unreliable: "ligue peu fiable sur les buts",
    model_disagreement: "tirs et buts en désaccord",
  };

  let INDEX = null;
  let DATA = null;
  let filter = "all";

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const isoDay = (s) => new Date(s + "T00:00:00Z");
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  /** Cote juste : ce qu'il faudrait obtenir pour ne rien perdre, si la probabilité est juste. */
  const fair = (p) => (p > 0 ? num2.format(1 / p) : "—");
  const country = (c) => COUNTRY[c] || c;

  // ---------------------------------------------------------------- blocs de la carte

  function verdict(hit) {
    return el("span", "verdict " + (hit ? "hit" : "miss"), hit ? "juste" : "manqué");
  }

  /** Le 1N2 : trois colonnes, une barre tricolore, la cote juste sous chaque pourcentage. */
  function oneXTwo(m) {
    const g = m.goals;
    const box = el("section", "x12");
    const cols = el("div", "cols");
    const outcome = m.result ? Math.sign(m.result.ft_home - m.result.ft_away) : null;
    const fav = [g.p1, g.pn, g.p2].indexOf(Math.max(g.p1, g.pn, g.p2));
    [["1", m.home, g.p1, "h", 1], ["N", "nul", g.pn, "d", 0], ["2", m.away, g.p2, "a", -1]].forEach(([k, name, p, cls, sign], i) => {
      const c = el("div", "col " + cls + (outcome === sign ? " won" : ""));
      c.append(el("div", "k", k), el("div", "pct", pct.format(p)), el("div", "fair", "cote juste " + fair(p)));
      c.title = name;
      cols.append(c);
      if (i === fav && m.result) c.append(verdict(outcome === sign));
    });
    const split = el("div", "split3");
    split.setAttribute("role", "img");
    split.setAttribute("aria-label", `${m.home} ${pct.format(g.p1)}, nul ${pct.format(g.pn)}, ${m.away} ${pct.format(g.p2)}`);
    for (const [cls, p] of [["h", g.p1], ["d", g.pn], ["a", g.p2]]) {
      const s = el("i", cls);
      s.style.width = (p * 100).toFixed(1) + "%";
      split.append(s);
    }
    const h = el("h3", null, "Résultat");
    // Le modèle de buts est affiché avant la fin de sa validation (décision du 9 octobre 2026) :
    // chaque carte le dit, pas seulement le pied de page.
    if (DATA.goals_status === "validation") {
      const tag = el("span", "tag", "modèle en validation");
      tag.title = "Ce modèle est encore noté match après match avant d'être confirmé.";
      h.append(tag);
    }
    box.append(h, cols, split);
    return box;
  }

  /** Les marchés binaires du match, en puces : pourcentage et cote juste. */
  function chips(m) {
    const g = m.goals;
    const r = m.result;
    const goals = r ? r.ft_home + r.ft_away : null;
    const items = [
      ["Remboursé si nul · " + m.home, g.dnb_home, null],
      ["Remboursé si nul · " + m.away, g.dnb_away, null],
      ["Les deux marquent", g.btts, r ? r.ft_home > 0 && r.ft_away > 0 : null],
      ["Plus de 1,5 but", g.over15, r ? goals > 1.5 : null],
      ["Plus de 2,5 buts", g.over25, r ? goals > 2.5 : null],
    ];
    const box = el("div", "chips");
    for (const [label, p, happened] of items) {
      if (p === null || p === undefined) continue;
      const c = el("div", "chip");
      c.append(el("span", "lab", label), el("span", "v", pct.format(p)), el("span", "fair", fair(p)));
      if (happened !== null) c.append(verdict((p >= 0.5) === happened));
      box.append(c);
    }
    return box;
  }

  /** Une échelle de lignes « plus de N,5 », en barres ; la plus proche de 50 % en gras. */
  function ladder(l, actual) {
    const box = el("div", "ladder");
    if (!l || !l.lines.length) {
      box.append(el("p", "none", "—"));
      return box;
    }
    let mid = 0;
    l.lines.forEach((o, i) => { if (Math.abs(o.p - 0.5) < Math.abs(l.lines[mid].p - 0.5)) mid = i; });
    l.lines.forEach((o, i) => {
      const r = el("div", "row" + (i === mid ? " mid" : "") + (actual != null ? (actual > o.line ? " over" : " under") : ""));
      r.append(el("span", "lab", "+" + num1.format(o.line)));
      const bar = el("span", "bar");
      const fill = el("i");
      fill.style.width = (o.p * 100).toFixed(1) + "%";
      bar.append(fill);
      r.append(bar, el("span", "v", pct.format(o.p)));
      r.title = `Plus de ${num1.format(o.line)} : ${pct.format(o.p)} · cote juste ${fair(o.p)}`;
      box.append(r);
    });
    return box;
  }

  /** Tirs ou tirs cadrés : les deux équipes côte à côte (empilées sur petit écran). */
  function shots(m, key, title) {
    const s = m[key];
    if (!s) return null;
    const r = m.result;
    const act = r ? (key === "shots" ? [r.shots_home, r.shots_away] : [r.sot_home, r.sot_away]) : [null, null];
    const exp = (l) => (l ? num1.format(l.expected) : "—");
    const box = el("section", "tot");
    const h = el("h3");
    let sub = "attendu : " + exp(s.home) + " – " + exp(s.away);
    if (r && act[0] != null && act[1] != null) sub += " · réel : " + act[0] + " – " + act[1];
    h.append(title, el("span", null, sub));
    const two = el("div", "two");
    [[m.home, s.home, act[0]], [m.away, s.away, act[1]]].forEach(([name, l, a]) => {
      const col = el("div", "side");
      col.append(el("div", "who", name), ladder(l, a));
      two.append(col);
    });
    box.append(h, two);
    return box;
  }

  function card(m) {
    const done = m.state !== "upcoming";
    const c = el("article", "card" + (done ? " done" : ""));
    const meta = el("div", "meta");
    if (m.state === "played") meta.append(el("span", "status done", "Terminé"));
    else if (m.state === "void") meta.append(el("span", "status done", "Non joué"));
    else meta.append(el("span", "status " + (m.ok ? "ok" : "warn"),
      m.ok ? "Prédiction fiable" : "Prudence : " + m.why.map((w) => REASONS[w] || w).join(", ")));
    if (m.kickoff.time) meta.append(el("span", "when", m.kickoff.time + " (heure publiée)"));
    c.append(meta);

    const teams = el("div", "teams");
    const score = m.result ? m.result.ft_home + " – " + m.result.ft_away : "contre";
    teams.append(el("div", "name h", m.home), el("div", "score" + (m.result ? " final" : ""), score), el("div", "name a", m.away));
    c.append(teams);

    if (m.goals) c.append(oneXTwo(m), chips(m));
    const s1 = shots(m, "shots", "Tirs");
    const s2 = shots(m, "sot", "Tirs cadrés");
    if (s1) c.append(s1);
    if (s2) c.append(s2);
    return c;
  }

  // ---------------------------------------------------------------- page

  function matchesFor(f) {
    return DATA.matches.filter((m) => f === "all"
      || (f === "ok" ? m.ok && m.state === "upcoming"
        : f === "done" ? m.state !== "upcoming"
          : m.league.country === f));
  }

  function filters() {
    const box = document.getElementById("filters");
    box.textContent = "";
    const countries = [...new Set(DATA.matches.map((m) => m.league.country))];
    const opts = [["all", "Tous"], ...countries.map((c) => [c, country(c)]), ["ok", "Fiables seulement"]];
    if (DATA.matches.some((m) => m.state !== "upcoming")) opts.push(["done", "Terminés"]);
    if (!opts.some(([k]) => k === filter)) filter = "all";
    for (const [k, label] of opts) {
      const b = el("button", null, label);
      b.type = "button";
      b.dataset.f = k;
      b.setAttribute("aria-pressed", String(k === filter));
      b.addEventListener("click", () => { filter = k; filters(); render(); });
      box.append(b);
    }
  }

  function render() {
    const list = document.getElementById("list");
    list.textContent = "";
    const ms = matchesFor(filter);
    const groups = new Map();
    for (const m of ms) {
      const key = country(m.league.country) + " · " + m.league.name;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    for (const [key, arr] of groups) {
      const g = el("section", "group");
      const h = el("h2", null, key);
      h.append(el("small", null, arr.length + " match" + (arr.length > 1 ? "s" : "")));
      g.append(h);
      arr.forEach((m) => g.append(card(m)));
      list.append(g);
    }
    if (!ms.length) {
      list.append(el("p", "empty", DATA.matches.length ? "Aucun match pour ce filtre."
        : DATA.note ? `Aucun match suivi ce jour-là (${DATA.note}).` : "Aucun match suivi ce jour-là."));
    }
  }

  function header() {
    document.getElementById("title").textContent = "Pronostics du " + shortDay.format(isoDay(DATA.date));
    const upcoming = DATA.matches.filter((m) => m.state === "upcoming");
    const okN = upcoming.filter((m) => m.ok).length;
    const doneN = DATA.matches.length - upcoming.length;
    const parts = [`${DATA.matches.length} match${DATA.matches.length > 1 ? "s" : ""}`];
    if (upcoming.length) parts.push(`${okN} prédiction${okN > 1 ? "s" : ""} fiable${okN > 1 ? "s" : ""} à venir`);
    if (doneN) parts.push(`${doneN} terminé${doneN > 1 ? "s" : ""}`);
    document.getElementById("sub").textContent = DATA.matches.length ? parts.join(" · ") : "Aucun match au programme";

    const notice = document.getElementById("notice");
    notice.hidden = true;
    const today = todayIso();
    if (DATA.date < today && INDEX && INDEX.open === DATA.date && !INDEX.days.some((d) => d >= today)) {
      notice.hidden = false;
      notice.textContent = "Aucun match annoncé pour les prochains jours : voici les derniers résultats.";
    } else if (DATA.date < today && upcoming.length) {
      notice.hidden = false;
      notice.textContent = `Ces pronostics datent du ${fullDay.format(isoDay(DATA.date))} : ceux du jour ne sont pas encore publiés.`;
    }

    const dates = Object.values(DATA.data_through || {}).filter(Boolean).sort();
    const through = dates[dates.length - 1];
    const foot = document.getElementById("foot");
    foot.textContent = "";
    foot.append(
      el("p", null,
        "Probabilités calculées par le modèle kalyx" +
        (through ? ` à partir des résultats connus jusqu'au ${fullDay.format(isoDay(through))}` : "") +
        ". Elles ne tiennent pas compte des compositions, blessures ou suspensions annoncées depuis. " +
        "La cote juste est celle qu'il faudrait obtenir pour ne rien perdre si la probabilité est exacte ; " +
        "un bookmaker paie moins. « Prudence » signale une prédiction moins sûre : données anciennes, " +
        "historique mince ou ligue où le modèle est mal calibré."),
      ...(DATA.goals_status === "validation" && DATA.matches.some((m) => m.goals) ? [el("p", null,
        "Le résultat (1N2) et le « remboursé si nul » viennent d'un modèle de buts en cours de validation. " +
        "Rejoué sur près de 12 000 matchs, il fait mieux que les fréquences de chaque championnat, mais les " +
        "cotes des bookmakers prédisent mieux le vainqueur que lui. Il est noté match après match depuis le " +
        "9 octobre 2026 avant d'être confirmé.")] : []),
      el("p", null, "Les heures sont celles publiées par la source, sans conversion de fuseau."),
      el("p", null, "Mis à jour le " + stamp.format(new Date(DATA.generated_at)) + ".")
    );
  }

  function dayNav() {
    const prev = document.getElementById("prev");
    const next = document.getElementById("next");
    const label = document.getElementById("day-label");
    const days = INDEX ? INDEX.days : [DATA.date];
    const i = days.indexOf(DATA.date);
    prev.disabled = i <= 0;
    next.disabled = i < 0 || i >= days.length - 1;
    label.textContent = DATA.date === todayIso() ? "Aujourd'hui" : longDay.format(isoDay(DATA.date));
    prev.onclick = () => i > 0 && load(days[i - 1]);
    next.onclick = () => i < days.length - 1 && load(days[i + 1]);
  }

  function show(d) {
    DATA = d;
    header();
    dayNav();
    filters();
    render();
  }

  function load(day) {
    return fetch(`data/${day}.json`, { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(show);
  }

  fetch("data/index.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((idx) => {
      INDEX = idx;
      if (!idx.open) throw new Error("vide");
      return load(idx.open);
    })
    .catch(() => fetch("data/today.json", { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(show))
    .catch(() => {
      document.getElementById("sub").textContent = "Impossible de charger les pronostics. Réessayez plus tard.";
    });

  // Installation. Chrome n'émet beforeinstallprompt qu'après un peu d'usage : sur Android le
  // bouton s'affiche d'emblée et, sans invite à appeler, explique le menu ⋮. iOS n'a pas
  // d'invite : une bulle explique le menu Partager.
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
  };
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  const installBtn = document.getElementById("install");
  const hint = document.getElementById("install-hint");
  const hintText = document.getElementById("install-hint-text");
  let deferredPrompt = null;

  const showHint = (parts) => {
    hintText.textContent = "";
    for (const [text, strong] of parts) hintText.append(strong ? el("strong", null, text) : text);
    hint.hidden = false;
  };
  const ANDROID_HINT = [["Pour installer l'app : menu ", false], ["⋮", true], [" en haut à droite, puis ", false], ["Installer l'application", true], [" (ou « Ajouter à l'écran d'accueil »).", false]];
  const IOS_HINT = [["Pour installer l'app : bouton ", false], ["Partager", true], [" puis ", false], ["Sur l'écran d'accueil", true], [".", false]];

  if (!standalone && store.get("kalyx-installed") !== "1") {
    if (android) installBtn.hidden = false;
    if (ios && store.get("kalyx-ios-hint") !== "hidden") showHint(IOS_HINT);
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!standalone) installBtn.hidden = false;
  });
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) {
      showHint(ANDROID_HINT);
      return;
    }
    deferredPrompt.prompt();
    let outcome = "dismissed";
    try { outcome = (await deferredPrompt.userChoice).outcome; } catch { /* ignoré */ }
    deferredPrompt = null;
    if (outcome === "accepted") installBtn.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    installBtn.hidden = true;
    hint.hidden = true;
    store.set("kalyx-installed", "1");
  });
  document.getElementById("install-hint-close").addEventListener("click", () => {
    hint.hidden = true;
    if (ios) store.set("kalyx-ios-hint", "hidden");
  });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
