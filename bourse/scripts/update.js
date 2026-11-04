#!/usr/bin/env node
/* Robot de mise à jour — lancé par GitHub Actions (voir .github/workflows/bourse.yml).
 *  1. lit bourse/watchlist.json
 *  2. télécharge l'historique quotidien de chaque titre (Yahoo Finance)
 *  3. calcule les signaux techniques avec bourse/indicators.js
 *  4. envoie une notification ntfy pour chaque nouveau signal ou seuil de prix franchi
 *  5. écrit bourse/data/*.json, que l'appli lit
 *
 * Variables d'environnement :
 *   NTFY_TOPIC   nom du canal ntfy (secret du dépôt) — sans lui, aucune notification
 *   NTFY_SERVER  serveur ntfy (par défaut https://ntfy.sh)
 *   APP_URL      adresse de l'appli, ouverte quand on touche la notification
 *   DRY_RUN=1    n'envoie rien, affiche seulement
 */
"use strict";
const fs = require("fs");
const path = require("path");
const TA = require("../indicators.js");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const SERIES = path.join(DATA, "s");
const NTFY_TOPIC = process.env.NTFY_TOPIC || "";
const NTFY_SERVER = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
const DRY = process.env.DRY_RUN === "1";
const APP_URL = process.env.APP_URL || (process.env.GITHUB_REPOSITORY
  ? `https://${process.env.GITHUB_REPOSITORY.split("/")[0].toLowerCase()}.github.io/${process.env.GITHUB_REPOSITORY.split("/")[1]}/bourse/`
  : "");

const fileName = sym => sym.replace(/[^A-Za-z0-9.-]/g, "_") + ".json";
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJSON = (f, o) => fs.writeFileSync(f, JSON.stringify(o) + "\n");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = x => (x == null ? null : Number(x.toPrecision(6)));

async function fetchYahoo(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1d&includePrePost=false`;
  let lastErr;
  for (let k = 0; k < 3; k++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (bourse-bot)" } });
      const j = await res.json().catch(() => null);
      const r = j && j.chart && j.chart.result && j.chart.result[0];
      if (!r) throw new Error((j && j.chart && j.chart.error && j.chart.error.description) || `HTTP ${res.status}`);
      const q = r.indicators.quote[0];
      const candles = [];
      (r.timestamp || []).forEach((t, i) => {
        if (q.close[i] == null || q.open[i] == null) return;
        candles.push([t, round(q.open[i]), round(q.high[i]), round(q.low[i]), round(q.close[i]), q.volume[i] || 0]);
      });
      if (!candles.length) throw new Error("aucune cotation");
      // Le dernier cours en direct remplace la clôture de la séance en cours
      const m = r.meta;
      const last = candles[candles.length - 1];
      if (m.regularMarketPrice && m.regularMarketTime >= last[0]) {
        last[4] = round(m.regularMarketPrice);
        last[2] = Math.max(last[2], last[4]);
        last[3] = Math.min(last[3], last[4]);
      }
      const p = m.currentTradingPeriod && m.currentTradingPeriod.regular;
      const now = Date.now() / 1000;
      return {
        candles,
        devise: m.currency || "",
        nom: m.longName || m.shortName || sym,
        type: m.instrumentType || "",
        place: m.fullExchangeName || m.exchangeName || "",
        ouvert: !!(p && now >= p.start && now < p.end),
      };
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (k + 1));
    }
  }
  throw lastErr;
}

async function notify(title, message, side) {
  if (DRY || !NTFY_TOPIC) { console.log(`  [notif${DRY ? " (essai)" : " désactivée"}] ${title} — ${message}`); return; }
  const body = {
    topic: NTFY_TOPIC, title, message,
    tags: [side === "buy" ? "chart_with_upwards_trend" : side === "sell" ? "chart_with_downwards_trend" : "bell"],
    priority: 4,
  };
  if (APP_URL) body.click = APP_URL;
  try {
    const r = await fetch(NTFY_SERVER, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    if (!r.ok) console.log(`  ntfy a répondu ${r.status}`);
  } catch (e) { console.log(`  ntfy injoignable : ${e.message}`); }
}

const fmt = (x, cur) => (x == null ? "—" : x.toLocaleString("fr-FR", { maximumFractionDigits: x < 10 ? 3 : 2 }) + (cur ? " " + cur : ""));
const dayOf = t => new Date(t * 1000).toISOString().slice(0, 10);

async function main() {
  const wl = readJSON(path.join(ROOT, "watchlist.json"), { titres: [] });
  fs.mkdirSync(SERIES, { recursive: true });
  const log = readJSON(path.join(DATA, "alertes.json"), { envoyees: [], seuils: {} });
  log.envoyees = log.envoyees || []; log.seuils = log.seuils || {};
  const sentKeys = new Set(log.envoyees.map(a => a.cle));
  const out = { maj: new Date().toISOString(), change: {}, titres: [] };
  const devises = new Set();

  for (const w of wl.titres || []) {
    const sym = String(w.symbole || "").trim();
    if (!sym) continue;
    process.stdout.write(`${sym} … `);
    let d;
    try { d = await fetchYahoo(sym); } catch (e) {
      console.log(`échec (${e.message})`);
      const old = readJSON(path.join(DATA, "index.json"), { titres: [] }).titres.find(x => x.symbole === sym);
      out.titres.push({ ...(old || { symbole: sym, nom: w.nom || sym }), erreur: e.message });
      continue;
    }
    const nom = w.nom || d.nom;
    writeJSON(path.join(SERIES, fileName(sym)), { symbole: sym, nom, devise: d.devise, place: d.place, maj: out.maj, bougies: d.candles });
    const A = TA.analyze(d.candles);
    const n = d.candles.length;
    const prix = d.candles[n - 1][4], veille = n > 1 ? d.candles[n - 2][4] : prix;
    if (d.devise && d.devise !== "EUR") devises.add(d.devise);
    out.titres.push({
      symbole: sym, nom, devise: d.devise, place: d.place, type: d.type,
      prix, veille, variation: veille ? prix / veille - 1 : 0, date: d.candles[n - 1][0],
      provisoire: d.ouvert,
      verdict: A.verdict, verdictLabel: A.verdictLabel, score: A.score,
      recent: A.recent.map(e => ({ id: e.id, label: e.label, side: e.side, t: e.t, ago: e.ago, prix: e.price })),
      niveaux: Object.fromEntries(Object.entries(A.levels).map(([k, v]) => [k, round(v)])),
      spark: d.candles.slice(-60).map(x => x[4]),
    });
    console.log(`${fmt(prix, d.devise)} · ${A.verdictLabel} (${A.score})`);

    // Nouveaux signaux techniques sur la dernière séance
    for (const e of A.recent.filter(e => e.ago === 0)) {
      const cle = `${sym}|${e.id}|${dayOf(e.t)}`;
      if (sentKeys.has(cle)) continue;
      const verbe = e.side === "buy" ? "Signal d'ACHAT" : "Signal de VENTE";
      const msg = `${e.label} à ${fmt(prix, d.devise)}. ${e.why}` + (d.ouvert ? " (Séance en cours : à confirmer à la clôture.)" : "")
        + ` Avis global : ${A.verdictLabel}.`;
      await notify(`${verbe} · ${nom}`, msg, e.side);
      log.envoyees.push({ cle, date: out.maj, symbole: sym, nom, type: e.id, label: e.label, side: e.side, prix, texte: msg });
      sentKeys.add(cle);
    }

    // Seuils de prix choisis par l'utilisateur
    for (const [k, sens] of [["alerte_haut", 1], ["alerte_bas", -1]]) {
      const niveau = Number(w[k]);
      if (!niveau) continue;
      const cle = `${sym}|${k}|${niveau}`;
      const franchi = sens > 0 ? prix >= niveau : prix <= niveau;
      if (franchi && !log.seuils[cle]) {
        const msg = `${nom} est ${sens > 0 ? "monté au-dessus" : "descendu sous"} de ${fmt(niveau, d.devise)} : cours actuel ${fmt(prix, d.devise)}.`;
        await notify(`Seuil de prix · ${nom}`, msg, sens > 0 ? "buy" : "sell");
        log.envoyees.push({ cle: cle + "|" + out.maj, date: out.maj, symbole: sym, nom, type: k, label: sens > 0 ? "Seuil haut franchi" : "Seuil bas franchi", side: "price", prix, texte: msg });
        log.seuils[cle] = out.maj;
      } else if (!franchi && log.seuils[cle]) {
        delete log.seuils[cle]; // le cours est revenu : l'alerte se réarme
      }
    }
    await sleep(400);
  }

  // Taux de change vers l'euro, pour totaliser le portefeuille
  for (const cur of devises) {
    const base = cur === "GBp" ? "GBP" : cur;
    try {
      const d = await fetchYahoo(`${base}EUR=X`);
      out.change[cur] = d.candles[d.candles.length - 1][4] / (cur === "GBp" ? 100 : 1);
    } catch (e) { console.log(`taux ${cur}EUR introuvable (${e.message})`); }
  }

  log.envoyees = log.envoyees.slice(-300);
  writeJSON(path.join(DATA, "index.json"), out);
  if (!DRY) writeJSON(path.join(DATA, "alertes.json"), log); // un essai ne marque rien comme envoyé

  // Supprime les séries des titres retirés de la liste
  const keep = new Set(out.titres.map(x => fileName(x.symbole)));
  for (const f of fs.readdirSync(SERIES)) if (!keep.has(f)) fs.unlinkSync(path.join(SERIES, f));
  console.log(`Terminé : ${out.titres.length} titres.`);
}

main().catch(e => { console.error(e); process.exit(1); });
