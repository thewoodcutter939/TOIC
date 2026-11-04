/* Bourse — moteur d'analyse technique.
 * Partagé entre l'appli (navigateur) et le robot de mise à jour (Node, GitHub Actions).
 * Toutes les fonctions travaillent sur des tableaux alignés sur les bougies ;
 * une valeur indisponible (pas assez d'historique) vaut null.
 */
(function (root) {
  "use strict";

  // ---------- Indicateurs ----------

  function sma(v, n) {
    const out = new Array(v.length).fill(null);
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
      sum += v[i];
      if (i >= n) sum -= v[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  function ema(v, n) {
    const out = new Array(v.length).fill(null);
    const k = 2 / (n + 1);
    let prev = null, start = -1;
    for (let i = 0; i < v.length; i++) {
      if (v[i] == null) continue;
      if (start < 0) start = i;
      if (i - start < n - 1) continue;
      if (prev == null) {
        let s = 0;
        for (let j = i - n + 1; j <= i; j++) s += v[j];
        prev = s / n;
      } else {
        prev = v[i] * k + prev * (1 - k);
      }
      out[i] = prev;
    }
    return out;
  }

  // RSI de Wilder
  function rsi(c, n = 14) {
    const out = new Array(c.length).fill(null);
    if (c.length <= n) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) {
      const d = c[i] - c[i - 1];
      if (d > 0) g += d; else l -= d;
    }
    g /= n; l /= n;
    out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = n + 1; i < c.length; i++) {
      const d = c[i] - c[i - 1];
      g = (g * (n - 1) + Math.max(d, 0)) / n;
      l = (l * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  }

  function macd(c, fast = 12, slow = 26, sig = 9) {
    const ef = ema(c, fast), es = ema(c, slow);
    const line = c.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
    const signal = ema(line, sig);
    const hist = line.map((x, i) => (x != null && signal[i] != null ? x - signal[i] : null));
    return { line, signal, hist };
  }

  function bollinger(c, n = 20, k = 2) {
    const mid = sma(c, n);
    const up = new Array(c.length).fill(null), lo = new Array(c.length).fill(null);
    for (let i = n - 1; i < c.length; i++) {
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2;
      const sd = Math.sqrt(s / n);
      up[i] = mid[i] + k * sd;
      lo[i] = mid[i] - k * sd;
    }
    return { mid, up, lo };
  }

  // ATR de Wilder (volatilité moyenne)
  function atr(h, l, c, n = 14) {
    const out = new Array(c.length).fill(null);
    const tr = c.map((_, i) => i === 0 ? h[0] - l[0]
      : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    if (c.length < n) return out;
    let a = 0;
    for (let i = 0; i < n; i++) a += tr[i];
    a /= n;
    out[n - 1] = a;
    for (let i = n; i < c.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
    return out;
  }

  // Plus haut / plus bas des n séances PRÉCÉDENTES (la séance i est exclue)
  function priorHigh(h, n) {
    return h.map((_, i) => (i < n ? null : Math.max(...h.slice(i - n, i))));
  }
  function priorLow(l, n) {
    return l.map((_, i) => (i < n ? null : Math.min(...l.slice(i - n, i))));
  }

  // Stop suiveur « chandelier » : plus haut clôture des 22 séances - 3 ATR
  function chandelier(c, a, n = 22, k = 3) {
    return c.map((_, i) => (i < n - 1 || a[i] == null ? null
      : Math.max(...c.slice(i - n + 1, i + 1)) - k * a[i]));
  }

  // ---------- Calcul complet ----------

  /** candles : [[tempsUnixSec, open, high, low, close, volume], ...] triées */
  function compute(candles) {
    const t = candles.map(x => x[0]);
    const o = candles.map(x => x[1]);
    const h = candles.map(x => x[2]);
    const l = candles.map(x => x[3]);
    const c = candles.map(x => x[4]);
    const v = candles.map(x => x[5] || 0);
    const A = atr(h, l, c, 14);
    return {
      t, o, h, l, c, v,
      sma20: sma(c, 20), sma50: sma(c, 50), sma200: sma(c, 200),
      rsi: rsi(c, 14),
      macd: macd(c),
      boll: bollinger(c),
      atr: A,
      hi55: priorHigh(h, 55), lo55: priorLow(l, 55),
      volAvg: sma(v, 20),
      stop: chandelier(c, A),
    };
  }

  // ---------- Signaux ----------

  /* Chaque signal : côté (achat / vente), poids (importance), et explication
   * en français pour comprendre ce que le graphique montre. */
  const RULES = [
    {
      id: "golden_cross", side: "buy", w: 2, label: "Croisement doré",
      test: (I, i) => cross(I.sma50, I.sma200, i) === 1,
      why: "La moyenne 50 jours passe au-dessus de la moyenne 200 jours : la tendance de fond devient haussière.",
    },
    {
      id: "death_cross", side: "sell", w: 2, label: "Croisement de la mort",
      test: (I, i) => cross(I.sma50, I.sma200, i) === -1,
      why: "La moyenne 50 jours passe sous la moyenne 200 jours : la tendance de fond devient baissière.",
    },
    {
      id: "sma200_up", side: "buy", w: 1.5, label: "Retour au-dessus de la MM200",
      test: (I, i) => cross(I.c, I.sma200, i) === 1,
      why: "Le cours repasse au-dessus de sa moyenne 200 jours, la ligne qui sépare tendance haussière et baissière.",
    },
    {
      id: "sma200_down", side: "sell", w: 1.5, label: "Cassure de la MM200",
      test: (I, i) => cross(I.c, I.sma200, i) === -1,
      why: "Le cours passe sous sa moyenne 200 jours : la tendance de long terme se dégrade.",
    },
    {
      id: "rsi_rebound", side: "buy", w: 1.5, label: "Sortie de survente (RSI)",
      test: (I, i) => I.rsi[i - 1] != null && I.rsi[i - 1] < 30 && I.rsi[i] >= 30,
      why: "Le RSI remonte au-dessus de 30 : le titre a beaucoup baissé et les acheteurs reviennent.",
    },
    {
      id: "rsi_drop", side: "sell", w: 1.5, label: "Sortie de surachat (RSI)",
      test: (I, i) => I.rsi[i - 1] != null && I.rsi[i - 1] > 70 && I.rsi[i] <= 70,
      why: "Le RSI redescend sous 70 : après une forte hausse, l'élan s'essouffle.",
    },
    {
      id: "macd_bull", side: "buy", w: 1, label: "MACD haussier",
      test: (I, i) => cross(I.macd.line, I.macd.signal, i) === 1,
      why: "La ligne MACD croise sa ligne de signal vers le haut : l'élan à court terme redevient positif.",
    },
    {
      id: "macd_bear", side: "sell", w: 1, label: "MACD baissier",
      test: (I, i) => cross(I.macd.line, I.macd.signal, i) === -1,
      why: "La ligne MACD croise sa ligne de signal vers le bas : l'élan à court terme devient négatif.",
    },
    {
      id: "boll_rebound", side: "buy", w: 1, label: "Rebond sur la bande basse",
      test: (I, i) => I.boll.lo[i - 1] != null && I.c[i - 1] < I.boll.lo[i - 1] && I.c[i] > I.boll.lo[i],
      why: "Le cours était sorti sous la bande de Bollinger basse et y revient : excès de baisse qui se corrige.",
    },
    {
      id: "boll_reject", side: "sell", w: 1, label: "Rejet de la bande haute",
      test: (I, i) => I.boll.up[i - 1] != null && I.c[i - 1] > I.boll.up[i - 1] && I.c[i] < I.boll.up[i],
      why: "Le cours était sorti au-dessus de la bande de Bollinger haute et y revient : excès de hausse qui se corrige.",
    },
    {
      id: "breakout", side: "buy", w: 2, label: "Cassure de résistance",
      test: (I, i) => I.hi55[i] != null && I.c[i] > I.hi55[i] && I.c[i - 1] <= I.hi55[i - 1]
        && (!I.volAvg[i] || I.v[i] > 1.3 * I.volAvg[i]),
      why: "Le cours dépasse son plus haut des 55 dernières séances avec du volume : une résistance vient de céder.",
    },
    {
      id: "breakdown", side: "sell", w: 2, label: "Cassure de support",
      test: (I, i) => I.lo55[i] != null && I.c[i] < I.lo55[i] && I.c[i - 1] >= I.lo55[i - 1],
      why: "Le cours passe sous son plus bas des 55 dernières séances : un support vient de céder.",
    },
    {
      id: "stop_hit", side: "sell", w: 1.5, label: "Stop suiveur touché",
      test: (I, i) => I.stop[i - 1] != null && I.c[i - 1] >= I.stop[i - 1] && I.c[i] < I.stop[i],
      why: "Le cours passe sous le stop suiveur (plus haut récent moins 3 fois la volatilité) : la hausse est probablement terminée.",
    },
  ];

  function cross(a, b, i) {
    if (i < 1 || a[i] == null || b[i] == null || a[i - 1] == null || b[i - 1] == null) return 0;
    if (a[i - 1] <= b[i - 1] && a[i] > b[i]) return 1;
    if (a[i - 1] >= b[i - 1] && a[i] < b[i]) return -1;
    return 0;
  }

  function eventsAt(I, i) {
    if (i < 1) return [];
    return RULES.filter(r => r.test(I, i)).map(r => ({
      id: r.id, side: r.side, w: r.w, label: r.label, why: r.why, i, t: I.t[i], price: I.c[i],
    }));
  }

  function allEvents(I) {
    const out = [];
    for (let i = 1; i < I.c.length; i++) out.push(...eventsAt(I, i));
    return out;
  }

  /* Contexte du graphique à la dernière séance : ce n'est pas un événement,
   * c'est « dans quel état est le titre ». */
  function context(I, i) {
    const r = [];
    const c = I.c[i];
    if (I.sma200[i] != null) {
      r.push(c > I.sma200[i]
        ? { s: 1, txt: "Au-dessus de la moyenne 200 jours : tendance de fond haussière." }
        : { s: -1, txt: "Sous la moyenne 200 jours : tendance de fond baissière." });
    }
    if (I.sma50[i] != null && I.sma200[i] != null) {
      r.push(I.sma50[i] > I.sma200[i]
        ? { s: 0.5, txt: "Moyenne 50 jours au-dessus de la 200 : structure haussière." }
        : { s: -0.5, txt: "Moyenne 50 jours sous la 200 : structure baissière." });
    }
    const R = I.rsi[i];
    if (R != null) {
      if (R < 30) r.push({ s: 1, txt: `RSI à ${R.toFixed(0)} : zone de survente, un rebond est possible.` });
      else if (R > 70) r.push({ s: -1, txt: `RSI à ${R.toFixed(0)} : zone de surachat, risque de repli.` });
      else r.push({ s: 0, txt: `RSI à ${R.toFixed(0)} : zone neutre.` });
    }
    const m = I.macd.line[i], s = I.macd.signal[i];
    if (m != null && s != null) {
      r.push(m > s
        ? { s: 0.5, txt: "MACD au-dessus de son signal : élan positif." }
        : { s: -0.5, txt: "MACD sous son signal : élan négatif." });
    }
    return r;
  }

  const VERDICTS = [
    { min: 3, key: "strong_buy", label: "Achat fort" },
    { min: 1.5, key: "buy", label: "Achat" },
    { min: -1.5, key: "neutral", label: "Neutre — conserver" },
    { min: -3, key: "sell", label: "Vente" },
    { min: -Infinity, key: "strong_sell", label: "Vente forte" },
  ];

  /* Synthèse à la dernière séance : contexte + signaux des 5 dernières séances,
   * les plus récents comptant davantage. */
  function analyze(candles) {
    const I = compute(candles);
    const n = I.c.length, i = n - 1;
    const ctx = context(I, i);
    const recent = [];
    const decay = [1, 0.8, 0.6, 0.4, 0.2];
    for (let k = 0; k < decay.length && i - k >= 1; k++) {
      for (const e of eventsAt(I, i - k)) recent.push({ ...e, ago: k, f: decay[k] });
    }
    let score = ctx.reduce((a, x) => a + x.s, 0);
    for (const e of recent) score += (e.side === "buy" ? 1 : -1) * e.w * e.f;
    const verdict = VERDICTS.find(v => score >= v.min);
    return {
      I, score: Math.round(score * 10) / 10, verdict: verdict.key, verdictLabel: verdict.label,
      context: ctx, recent,
      levels: {
        support: I.lo55[i], resistance: I.hi55[i], stop: I.stop[i],
        sma50: I.sma50[i], sma200: I.sma200[i], atr: I.atr[i],
      },
    };
  }

  /* Ce que chaque signal a donné dans le passé sur ce titre : variation du cours
   * 20 séances après. « Réussi » = hausse après un signal d'achat, baisse après
   * un signal de vente. Ce n'est pas une garantie pour l'avenir. */
  function history(I, horizon = 20) {
    const stats = {};
    for (let i = 1; i < I.c.length - horizon; i++) {
      for (const e of eventsAt(I, i)) {
        const ret = I.c[i + horizon] / I.c[i] - 1;
        const s = stats[e.id] || (stats[e.id] = { id: e.id, label: e.label, side: e.side, n: 0, ok: 0, sum: 0 });
        s.n++; s.sum += ret;
        if ((e.side === "buy" && ret > 0) || (e.side === "sell" && ret < 0)) s.ok++;
      }
    }
    return Object.values(stats).map(s => ({ ...s, avg: s.sum / s.n }));
  }

  const API = { sma, ema, rsi, macd, bollinger, atr, compute, eventsAt, allEvents, context, analyze, history, RULES, VERDICTS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.BourseTA = API;
})(typeof self !== "undefined" ? self : this);
