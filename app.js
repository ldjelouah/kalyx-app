/* Kalyx — rend data/<jour>.json (écrit par `node src/jobs/build-site.ts`).
   La cote juste se calcule depuis la probabilité (1 / p). Une seule cote de book : la ligne
   bet365 sous chaque jambe du top (décision de l'auteur, 7 novembre 2026), lue dans le JSON. */
(() => {
  "use strict";

  const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
  const pct1 = new Intl.NumberFormat("fr-FR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
  const hourMin = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
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

  // ---------------------------------------------------------------- les coupes d'Europe

  /**
   * Les matchs de coupe d'Europe (demandés le 26 novembre 2026). Rien n'y est vérifié, et la
   * section le dit avant de lister quoi que ce soit. Un match à venir peut porter deux voix,
   * côte à côte (demandé le même jour) : ce qu'annonce la cote de consensus des bookmakers, et
   * le modèle kalyx quand les deux équipes jouent dans nos dix championnats.
   */
  const CUPS = { C1: "Ligue des champions", C3: "Ligue Europa", C4: "Ligue Conférence" };
  const cupList = () => DATA.cups || [];

  function cupStage(c) {
    if (c.stage === "league-phase") return "Phase de ligue" + (c.round ? " · journée " + c.round : "");
    if (c.stage === "playoff-round") return "Barrages";
    if (/^qualification-round-/.test(c.stage || "")) return "Qualifications";
    return null;
  }

  function cupRow(c, showStage) {
    const r = el("div", "cup-row" + (c.state === "played" ? " done" : ""));
    const score = c.score ? c.score[0] + " – " + c.score[1] : "contre";
    r.append(el("span", "when", hourMin.format(new Date(c.kickoff))), el("span", "name h", c.home),
      el("span", "score" + (c.score ? " final" : ""), score), el("span", "name a", c.away));
    const more = [];
    if (showStage && cupStage(c)) more.push(cupStage(c));
    if (c.extra) more.push("prolongation ou tirs au but : ce score n'est peut-être pas celui des 90 minutes");
    else if (!c.score && Date.now() >= Date.parse(c.kickoff)) more.push("commencé · score non relevé");
    if (more.length) r.append(el("span", "more", more.join(" · ")));
    const v = cupVoices(c);
    if (v) r.append(v);
    return r;
  }

  /**
   * Les deux voix d'un match à venir. Le chiffre comparable est la probabilité : pour les
   * cotes, 1 / cote, marge comprise (les trois dépassent 100 %) ; pour kalyx, la probabilité du
   * modèle, avec sa cote juste. Le favori de chaque voix est en gras. La ligne kalyx n'existe
   * que si le modèle a pu calculer : son absence est dite une fois, en tête de section.
   */
  function cupVoices(c) {
    if (c.state !== "upcoming") return null;
    const box = el("div", "voices");
    if (!c.consensus && !c.model) {
      box.append(el("span", "v-none", "aucune cote relevée"));
      return box;
    }
    const line = (cls, label, title, cells) => {
      const row = el("div", "v-row " + cls);
      const lab = el("span", "lab", label);
      lab.title = title;
      row.append(lab);
      const best = Math.max(...cells.map((x) => x.p));
      cells.forEach((x, i) => {
        const cell = el("span", "c " + ["h", "n", "a"][i] + (x.p === best ? " fav" : ""));
        cell.append(el("b", null, pct.format(x.p)), el("small", null, x.small));
        row.append(cell);
      });
      return row;
    };
    const head = el("div", "v-row v-head");
    head.append(el("span", "lab", ""), el("span", "c h", "1"), el("span", "c n", "N"), el("span", "c a", "2"));
    box.append(head);
    if (c.consensus) {
      const k = c.consensus;
      box.append(line("market", "Cotes", "Ce qu'annonce la cote de consensus des bookmakers : 1 / cote, marge comprise.",
        [k.home, k.draw, k.away].map((price) => ({ p: 1 / price, small: num2.format(price) }))));
    } else box.append(el("span", "v-none", "aucune cote relevée"));
    if (c.model) {
      const m = c.model;
      box.append(line("kalyx", "kalyx", "Le modèle de buts kalyx, non validé en coupe. En petit : sa cote juste.",
        [m.p1, m.pn, m.p2].map((p) => ({ p, small: fair(p) }))));
    }
    return box;
  }

  function cupSection() {
    const all = cupList();
    if (!all.length) return null;
    const g = el("section", "group cups");
    const h = el("h2", null, "Coupes d'Europe");
    h.append(el("small", null, all.length + " match" + (all.length > 1 ? "s" : "") + " · non vérifié en coupe"));
    const withOdds = all.filter((c) => c.consensus).length, withModel = all.filter((c) => c.model).length;
    if (withOdds || withModel) {
      const note = el("p", "cup-note");
      note.append(el("b", null, "Rien ici n'est vérifié en coupe."),
        " « Cotes » : ce qu'annonce la cote de consensus des bookmakers (1 / cote), relevée à " +
        hourMin.format(new Date(DATA.generated_at)) + ". Les trois pourcentages dépassent 100 % : c'est la marge. " +
        "« kalyx » : notre modèle de buts appliqué tel quel, seulement quand les deux équipes jouent dans nos dix " +
        `championnats (${withModel} match${withModel > 1 ? "s" : ""} sur ${all.length} ce jour-là). Il ignore l'écart ` +
        "de niveau entre championnats, et sur 180 matchs de coupe passés il n'a pas fait mieux que la simple fréquence " +
        "des résultats. Aucune règle de l'app (Pari sûr, Top 10) n'a été vérifiée sur ces matchs.");
      g.append(h, note);
    } else {
      g.append(h, el("p", "cup-note",
        "Rien ici n'est vérifié en coupe : kalyx n'a pas de modèle validé sur ces matchs. Les cotes et le modèle " +
        "ne sont donnés que pour un match à venir, et ne sont pas gardés ensuite."));
    }
    for (const code of Object.keys(CUPS)) {
      const arr = all.filter((c) => c.cup === code);
      if (!arr.length) continue;
      const card = el("article", "card");
      // Le tour s'écrit une fois en tête quand tous les matchs le partagent, sinon sur chaque ligne.
      const stages = [...new Set(arr.map(cupStage))];
      const common = stages.length === 1 ? stages[0] : null;
      const meta = el("div", "meta");
      meta.append(el("span", "status warn", "Non vérifié en coupe"),
        el("span", "when", arr.length + " match" + (arr.length > 1 ? "s" : "")));
      const title = el("h3", null, CUPS[code]);
      if (common) title.append(el("span", null, common));
      const rows = el("div", "cup-rows");
      arr.forEach((c) => rows.append(cupRow(c, !common)));
      card.append(meta, title, rows);
      g.append(card);
    }
    return g;
  }

  // ---------------------------------------------------------------- le top du jour

  const MARKET = { shots: "tirs", sot: "tirs cadrés" };
  const KIND = {
    single: "Simple", "same-match": "Combiné · même match", "two-matches": "Combiné · deux matchs",
    "three-legs": "Combiné · trois paris",
  };
  const FAMILY = { tirs: "Tirs", resultat: "Résultat", handicap: "Handicap", buts: "Buts" };

  /** « 2 buts » ou « 3 buts » : l'écart qu'un handicap à 1,5 ou 2,5 demande. */
  const margin = (line) => `${Math.round(Math.abs(line) + 0.5)} buts`;
  const sgn1 = (x) => (x > 0 ? "+" : "−") + num1.format(Math.abs(x));

  /**
   * Ce qu'on parie, en mots, et le nom du marché tel qu'un bookmaker l'affiche. Les marchés de
   * buts portent sur le match : `diff` est l'écart domicile − extérieur, `total` les buts du
   * match, `nodraw` l'écart en valeur absolue (« pas de nul »).
   */
  function legWhat(l) {
    const b = (s) => el("b", null, s);
    const H = l.home, A = l.away, over = l.dir === "over";
    if (l.market === "shots" || l.market === "sot") {
      return { parts: [b(l.team), ` ${over ? "plus de" : "moins de"} `, b(num1.format(l.line)), ` ${MARKET[l.market]}`], tag: null };
    }
    if (l.market === "total") {
      return { parts: [over ? "Plus de " : "Moins de ", b(num1.format(l.line)), " buts dans le match"], tag: "Total de buts" };
    }
    if (l.market === "nodraw") {
      return over ? { parts: [b(H), " ou ", b(A), " gagne"], tag: "Double chance 12 (pas de nul)" }
        : { parts: [b("Match nul")], tag: "1N2 : nul" };
    }
    // diff : ±0,5 = 1N2 et double chance ; au-delà, handicap.
    if (Math.abs(l.line) < 1) {
      if (l.line > 0) return over ? { parts: [b(H), " gagne"], tag: "1N2 : 1" } : { parts: ["Nul ou ", b(A)], tag: "Double chance X2" };
      return over ? { parts: [b(H), " ou nul"], tag: "Double chance 1X" } : { parts: [b(A), " gagne"], tag: "1N2 : 2" };
    }
    // Domicile −L : gagne par L + 0,5 buts ou plus ; extérieur +L : ne perd pas par autant.
    if (l.line > 0) {
      return over ? { parts: [b(H), ` gagne par ${margin(l.line)} ou plus`], tag: `Handicap ${H} ${sgn1(-l.line)}` }
        : { parts: [b(A), ` ne perd pas par ${margin(l.line)} ou plus`], tag: `Handicap ${A} ${sgn1(l.line)}` };
    }
    return over ? { parts: [b(H), ` ne perd pas par ${margin(l.line)} ou plus`], tag: `Handicap ${H} ${sgn1(-l.line)}` }
      : { parts: [b(A), ` gagne par ${margin(l.line)} ou plus`], tag: `Handicap ${A} ${sgn1(l.line)}` };
  }

  /** Une jambe : ce qu'on parie, le match, la probabilité (et celle du modèle brut si elle diffère). */
  function topLeg(l, showMatch) {
    const played = l.actual != null;
    const won = played && (l.dir === "over" ? l.actual > l.line : l.actual < l.line);
    const r = el("div", "leg" + (played ? (won ? " hit" : " miss") : ""));
    const what = el("div", "what");
    const w = legWhat(l);
    what.append(...w.parts);
    const goals = l.team == null;
    if (played) what.append(el("span", "real", goals && l.score ? ` · score ${l.score[0]}–${l.score[1]}` : ` · réel ${l.actual}`));
    let info = (showMatch ? `${l.home} – ${l.away} · ` : "") + l.league + (l.time ? " · " + l.time : "") +
      (w.tag ? " · " + w.tag : "") + " · " + pct.format(l.p);
    if (Math.abs(l.p - l.p_model) >= 0.005) info += ` (modèle ${pct.format(l.p_model)})`;
    r.append(what, el("div", "info", info), goals ? bet365Goals(l) : bet365Line(l));
    return r;
  }

  /**
   * La cote bet365 d'un pari de buts : bet365 cote la ligne exacte du pari, on montre donc sa
   * cote, celle de l'inverse, et la cote juste du modèle en face.
   */
  function bet365Goals(l) {
    const b = l.bet365;
    if (!b) return el("div", "b365 none", "bet365 : cote non relevée (match commencé ou marché absent)");
    const mine = l.dir === "over" ? b.over : b.under, other = l.dir === "over" ? b.under : b.over;
    const box = el("div", "b365");
    const top = el("div", "b365-line");
    top.append(el("b", null, "bet365"), " · ce pari : ", el("span", "hit", num2.format(mine)),
      ` · l'inverse : ${num2.format(other)}`);
    const when = b.closing ? "cote de clôture" : "relevée à " + hourMin.format(new Date(DATA.generated_at));
    box.append(top, el("div", "m", `cote juste du modèle : ${fair(l.p)} · ${when}`));
    return box;
  }

  /**
   * La ligne bet365 de cette équipe sur ce marché. bet365 n'en cote qu'une, en général pas
   * celle du pari : on montre ses deux cotes, et ce que le modèle pense de CETTE ligne-là.
   * Quand c'est la ligne du pari, la cote du côté parié passe en gras.
   */
  function bet365Line(l) {
    const b = l.bet365;
    if (!b) return el("div", "b365 none", "bet365 : aucune ligne relevée");
    const same = Math.abs(b.line - l.line) < 1e-9;
    const box = el("div", "b365");
    const side = (label, price, dir) => {
      const s = el("span", same && l.dir === dir ? "hit" : null, `${label} ${num2.format(price)}`);
      return s;
    };
    const top = el("div", "b365-line");
    top.append(el("b", null, "bet365"), ` · ligne ${num1.format(b.line)} : `,
      side("plus", b.over, "over"), " · ", side("moins", b.under, "under"),
      same ? el("span", "same", " · la ligne du pari") : "");
    const when = b.closing ? "cote de clôture" : "relevée à " + hourMin.format(new Date(DATA.generated_at));
    const m = el("div", "m",
      `modèle à ${num1.format(b.line)} : plus ${pct.format(b.p_over)} ` +
      `(cotes justes ${fair(b.p_over)} · ${fair(1 - b.p_over)}) · ${when}`);
    box.append(top, m);
    return box;
  }

  /** L'heure du premier coup d'envoi d'un pari ; « 99:99 » sans heure publiée, pour finir en bas. */
  const firstTime = (pick) => pick.legs.map((l) => l.time || "99:99").sort()[0];

  /**
   * Le tri du Top 10 (demandé le 7 novembre 2026) : par confiance — la probabilité du pari,
   * la plus haute d'abord — ou par heure du match. Le numéro affiché reste le rang en
   * confiance, pour qu'un tri par heure dise encore où se place chaque pari. Retenu sur cet
   * appareil seulement.
   */
  let topSort = (() => {
    try { return localStorage.getItem("kalyx-top-sort") === "time" ? "time" : "conf"; } catch { return "conf"; }
  })();

  function sorted(list) {
    const byConf = list.map((p) => ({ p })).sort((a, b) => b.p.p - a.p.p);
    byConf.forEach((x, i) => { x.rank = i + 1; });
    if (topSort !== "time") return byConf;
    return [...byConf].sort((a, b) => firstTime(a.p).localeCompare(firstTime(b.p)) || a.rank - b.rank);
  }

  function sortBar() {
    const box = el("div", "sortbar");
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Trier le top");
    box.append(el("span", "lab", "Trier par"));
    for (const [k, label] of [["conf", "Confiance"], ["time", "Heure du match"]]) {
      const b = el("button", null, label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(topSort === k));
      b.addEventListener("click", () => {
        topSort = k;
        try { localStorage.setItem("kalyx-top-sort", k); } catch { /* stockage indisponible */ }
        render();
      });
      box.append(b);
    }
    return box;
  }

  function topCard(pick, rank) {
    const sameMatch = pick.legs.every((l) => l.match_id === pick.legs[0].match_id);
    const c = el("article", "card pick");
    const head = el("div", "pick-head");
    const who = el("div", "pick-who");
    const t0 = firstTime(pick);
    const fam = pick.kind === "single" && FAMILY[pick.legs[0].family] ? " · " + FAMILY[pick.legs[0].family] : "";
    who.append(el("span", "pick-kind", (KIND[pick.kind] || pick.kind) + fam + (t0 !== "99:99" ? " · " + t0 : "")));
    if (sameMatch) who.append(el("span", "pick-match", `${pick.legs[0].home} – ${pick.legs[0].away}`));
    const odds = el("div", "pick-fair");
    // Une décimale : les paris du top se tiennent à quelques dixièmes, et le tri par confiance
    // doit se lire.
    odds.append(el("b", null, fair(pick.p)), el("small", null, "cote min · " + pct1.format(pick.p)));
    head.append(el("span", "pick-rank", String(rank)), who, odds);
    const legs = el("div", "legs");
    pick.legs.forEach((l) => legs.append(topLeg(l, !sameMatch)));
    c.append(head, legs);
    if (pick.hit !== null && pick.hit !== undefined) c.append(verdict(pick.hit === 1));
    return c;
  }

  /** « Rejoué sur la saison : … » — ce que la liste aurait donné, jour par jour. */
  function record(r, what) {
    if (!r) return null;
    return el("p", "record",
      `Rejoué chaque jour de la saison avec ce qu'on savait la veille : ${r.n} ${what}, ` +
      `${pct.format(r.announced)} annoncés, ${pct.format(r.hit)} réussis (± ${Math.round(r.ci * 100)} points).`);
  }

  /**
   * Le pari sûr (demandé le 25 novembre 2026) : le favori d'un match quand bet365 affiche sa
   * victoire dans la bande, 1,30 à 1,40. C'est la seule règle : le modèle ne choisit rien ici, sa
   * probabilité est donnée pour information. La cote est celle que football-data relève avant le
   * match, la même que celle de la mesure, pour que le bilan se recalcule.
   */
  function safeCard(p, rank) {
    const c = el("article", "card pick");
    const head = el("div", "pick-head");
    const who = el("div", "pick-who");
    who.append(el("span", "pick-kind", "1N2 · " + p.league + (p.time ? " · " + p.time : "")),
      el("span", "pick-match", `${p.home} – ${p.away}`));
    const odds = el("div", "pick-fair");
    odds.append(el("b", null, num2.format(p.bet365)), el("small", null, "cote bet365"));
    head.append(el("span", "pick-rank", String(rank)), who, odds);
    const leg = el("div", "leg" + (p.hit === 1 ? " hit" : p.hit === 0 ? " miss" : ""));
    const what = el("div", "what");
    what.append(el("b", null, p.team), " gagne");
    if (p.score) what.append(el("span", "real", ` · score ${p.score[0]}–${p.score[1]}`));
    const model = p.p != null ? `modèle ${pct.format(p.p)}`
      : p.p_model != null ? `modèle ${pct.format(p.p_model)}, non recalibré` : "pas de modèle de buts sur ce match";
    leg.append(what, el("div", "info", `La cote annonce ${pct.format(1 / p.bet365)} · ${model}`),
      el("div", "b365 none", "Cote relevée avant le match par football-data ; elle a pu bouger depuis."));
    const legs = el("div", "legs");
    legs.append(leg);
    c.append(head, legs);
    if (p.hit !== null && p.hit !== undefined) c.append(verdict(p.hit === 1));
    return c;
  }

  function safeSection(s, box) {
    if (!s) return;
    const lo = num2.format(s.shown_lo), hi = num2.format(s.shown_hi);
    const h = el("h2", null, "Pari sûr");
    h.append(el("small", null, "piste en cours de vérification"));
    box.append(h, el("p", "intro",
      `Le favori d'un match quand bet365 affiche sa victoire entre ${lo} et ${hi}. Sur six saisons, ce pari ` +
      "a gagné trois fois sur quatre (75 % sur 708 paris, mesuré le 25 novembre 2026). C'est le plus sûr que " +
      `nous sachions trouver au-dessus de ${lo}, et un sur quatre perd. Le modèle ne choisit pas ces paris : ` +
      "sa probabilité est donnée à côté, et il sous-estime souvent les favoris."));
    if (s.record) {
      box.append(el("p", "record",
        `Cette saison : ${s.record.n} paris, ${pct.format(s.record.hit)} gagnés (± ${Math.round(s.record.ci * 100)} points) ; ` +
        `leur cote annonçait ${pct.format(s.record.announced)}.` +
        (s.record.n < s.review_at ? ` Rien ne se conclut avant ${s.review_at} paris.` : "")));
    }
    if (!s.stands) {
      box.append(el("p", "empty", "Cette vue est retirée : son bilan ne tient pas ce que la cote annonce."));
      return;
    }
    if (!s.picks.length) {
      box.append(el("p", "empty",
        "Aucun pari sûr ce jour-là. Les cotes arrivent avec le calendrier, le mardi et le vendredi."));
      return;
    }
    const g = el("div", "picks");
    s.picks.forEach((p, i) => g.append(safeCard(p, i + 1)));
    box.append(g);
  }

  function topSection() {
    const t = DATA.top;
    const box = el("section", "top-list");
    if (!t) {
      box.append(el("p", "empty", "Pas de top pour ce jour."));
      return box;
    }
    safeSection(t.safe, box);
    if (t.safe) box.append(el("h2", null, "Le Top 10"));
    if (!t.picks.length && !t.combos.length) {
      box.append(el("p", "empty", "Pas de top pour ce jour."));
      return box;
    }
    box.append(el("p", "intro",
      "Dix paris simples, au plus près d'une cote juste de 1,50, pris à tour de rôle dans les tirs, le " +
      "résultat (1N2, double chance), le handicap et les buts. Un match ne sert qu'une fois. La cote min " +
      "est la cote juste : en dessous, le pari perd de l'argent même si la probabilité est exacte, et un " +
      "bookmaker paie souvent moins."));
    box.append(el("p", "intro", t.recalibrated
      ? `Probabilités recalibrées sur les ${t.fit_matches} matchs déjà joués cette saison : elles diffèrent ` +
        "de celles des fiches match, qui sont celles du modèle brut."
      : "Pas encore assez de matchs joués cette saison pour recalibrer : probabilités du modèle brut."));
    const r1 = record(t.record, "paris");
    if (r1) box.append(r1);
    box.append(sortBar());
    if (t.picks.length) {
      const g = el("div", "picks");
      sorted(t.picks).forEach(({ p, rank }) => g.append(topCard(p, rank)));
      box.append(g);
    } else box.append(el("p", "empty", "Aucun pari dans la bande ce jour-là."));

    if (t.combos.length) {
      const h = el("h2", null, "Les meilleurs combinés");
      h.append(el("small", null, t.combos.length + " combiné" + (t.combos.length > 1 ? "s" : "")));
      box.append(h, el("p", "intro",
        "Deux ou trois paris combinés à 1,50, en mélangeant les familles, avec les jambes les plus sûres " +
        "possible. Le bookmaker prend sa marge sur chaque jambe : à cote proposée égale, préférez le simple. " +
        "Deux paris d'un même match tiennent compte de leur dépendance, mesurée sur trois saisons ; ne " +
        "multipliez jamais vous-même deux probabilités des fiches match."));
      const r2 = record(t.combos_record, "combinés");
      if (r2) box.append(r2);
      const g = el("div", "picks");
      sorted(t.combos).forEach(({ p, rank }) => g.append(topCard(p, rank)));
      box.append(g);
    }
    return box;
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
    const hasTop = DATA.top && (DATA.top.picks.length || DATA.top.combos.length || (DATA.top.safe && DATA.top.safe.picks.length));
    const opts = [["all", "Tous"], ...(hasTop ? [["top", "Top 10"]] : []),
      ...countries.map((c) => [c, country(c)]),
      ...(cupList().length ? [["cups", "Coupes d'Europe"]] : []),
      ...(DATA.matches.length ? [["ok", "Fiables seulement"]] : [])];
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
    if (filter === "top") {
      list.append(topSection());
      return;
    }
    if (filter === "cups") {
      const only = cupSection();
      if (only) list.append(only);
      return;
    }
    const ms = matchesFor(filter);
    const cups = filter === "all" ? cupSection() : null;
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
        : cups ? "Aucun match de championnat suivi ce jour-là."
          : DATA.note ? `Aucun match suivi ce jour-là (${DATA.note}).` : "Aucun match suivi ce jour-là."));
    }
    if (cups) list.append(cups);
  }

  function header() {
    document.getElementById("title").textContent = "Pronostics du " + shortDay.format(isoDay(DATA.date));
    const upcoming = DATA.matches.filter((m) => m.state === "upcoming");
    const okN = upcoming.filter((m) => m.ok).length;
    const doneN = DATA.matches.length - upcoming.length;
    const parts = [`${DATA.matches.length} match${DATA.matches.length > 1 ? "s" : ""}`];
    if (upcoming.length) parts.push(`${okN} prédiction${okN > 1 ? "s" : ""} fiable${okN > 1 ? "s" : ""} à venir`);
    if (doneN) parts.push(`${doneN} terminé${doneN > 1 ? "s" : ""}`);
    const cupN = cupList().length;
    const cupPart = `${cupN} match${cupN > 1 ? "s" : ""} de coupe, non vérifié${cupN > 1 ? "s" : ""}`;
    document.getElementById("sub").textContent = DATA.matches.length
      ? parts.concat(cupN ? [cupPart] : []).join(" · ")
      : cupN ? "Aucun match de championnat · " + cupPart : "Aucun match au programme";

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
      ...(DATA.top && DATA.top.picks.length ? [el("p", null,
        "Le Top 10 vise une cote juste de 1,50 ; il n'indique pas où un bookmaker se trompe. " +
        "Un pari n'a de valeur que si la cote proposée dépasse la cote min. Les paris de résultat, de " +
        "handicap et de buts viennent du modèle de buts en cours de validation."), el("p", null,
        "Sous chaque pari de tirs, la ligne que bet365 cote pour cette équipe. bet365 n'en propose qu'une, en " +
        "général pas celle du pari, avec environ 8 % de marge : à 1,85 des deux côtés, il faut avoir raison " +
        "54 % du temps pour ne pas perdre. Sous un pari de buts, la cote bet365 de ce pari exact, pour un " +
        "match à venir. Les cotes viennent de MoviOdds, un relevé indépendant, non " +
        "affilié à bet365 : la clôture pour un match de tirs commencé, sinon le prix au moment de la mise à " +
        "jour de l'app, qui bouge jusqu'au coup d'envoi. Ce que vaut un écart entre le modèle et bet365 est en " +
        "cours de mesure : un écart n'est pas encore un bon pari.")] : []),
      ...(cupN ? [el("p", null,
        "Les matchs de coupe d'Europe sont donnés pour information : le modèle n'a été vérifié que sur dix " +
        "championnats, et un essai sur les coupes n'a rien montré de fiable. Leur calendrier, leurs scores et " +
        "la cote de consensus viennent de BSD, une source distincte de celle des championnats. Cette cote est " +
        "une moyenne de bookmakers, pas un prix que l'on peut prendre ; elle n'est relevée qu'avant le coup " +
        "d'envoi et n'est pas gardée ensuite, donc rien de ce qui est affiché là ne pourra être noté après coup.")] : []),
      el("p", null, "Les heures sont celles publiées par la source, sans conversion de fuseau." +
        (cupN ? " Celles des matchs de coupe sont à l'heure de cet appareil." : "")),
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
