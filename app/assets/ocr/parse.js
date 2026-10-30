// Estrae i valori per 100 g dal testo letto da una tabella nutrizionale.
// Due metodi: per righe di testo (parseLabel) e per posizione delle parole nella foto (parseGeo).
(function (root) {
  var FIELDS = ["kcal", "fat", "sat", "sugar", "fibre", "prot", "salt"];

  function norm(line) {
    return line.toLowerCase()
      .replace(/[|_]/g, " ")
      .replace(/\bo(?=\s*[.,]\s*\d)/g, "0")          // O,5 -> 0,5
      .replace(/\bo\s*g\b/g, "0 g")                  // Og -> 0 g
      .replace(/(\d)\s*[,.]\s*(\d)/g, "$1.$2");      // 1, 16 -> 1.16
  }
  // corregge la "g" letta come "9" o "0" quando manca l'unità
  function fixNum(t, unit) {
    if (unit) return t;
    var dec = t.split(".")[1];
    if (dec && dec.length >= 2 && /9$/.test(t)) return t.slice(0, -1);      // 1.309 -> 1.30 · 4.09 -> 4.0
    if (!dec && /9$/.test(t) && parseFloat(t) > 100) return t.slice(0, -1); // 219 -> 21
    if (/^0\d$/.test(t)) return "0";                                         // 09 -> 0
    return t;
  }
  function nums(line) {
    var out = [], re = /(<\s*)?(\d+(?:\.\d+)?)\s*(kcal|kj|mg|g|%)?/g, m;
    while ((m = re.exec(line))) {
      var u = m[3] || "";
      if (u === "%" || u === "kj" || u === "kcal") continue;
      if (/^\s*k/.test(line.slice(re.lastIndex))) continue;   // 583 KJ / 138 keal letti male
      var v = parseFloat(fixNum(m[2], u));
      if (u === "mg") v = v / 1000;
      out.push(v);
    }
    return out;
  }
  var KEYS = [
    ["sat", /satur/],
    ["sugar", /zucch|sugar/],
    ["fat", /grass|\bfat|lipid/],
    ["carb", /carbo/],
    ["fibre", /fibr/],
    ["prot", /prote|otein/],
    ["sodium", /sodio\b|sodium/],
    ["salt", /sale\b|salt\b/],
    ["energy", /energ|valore energetico/]
  ];
  function keyOf(line) {
    for (var i = 0; i < KEYS.length; i++) { var m = KEYS[i][1].exec(line); if (m) return { k: KEYS[i][0], at: m.index + m[0].length, start: m.index }; }
    return null;
  }
  function energy(all) {
    var k = all.match(/(\d+(?:\.\d+)?)\s*k\s*[ce][ae]?[l1i]/);
    if (k) return parseFloat(k[1]);
    var j = all.match(/(\d+(?:\.\d+)?)\s*kj/);
    if (j) return Math.round(parseFloat(j[1]) / 4.184);
    return null;
  }
  function clean(r) {
    ["fat", "sat", "sugar", "carb", "fibre", "prot"].forEach(function (f) { if (r[f] != null && r[f] > 100) { if (r[f] <= 1000) r[f] = r[f] / 10; else delete r[f]; } });
    if (r.salt != null && r.salt > 20) { var s = r.salt / 100; if (s <= 20) r.salt = s; else delete r.salt; }   // 250 -> 2,50
    if (r.salt == null && r.sodium != null && r.sodium < 10) r.salt = Math.round(r.sodium * 2.5 * 100) / 100;
    if (r.kcal != null && (r.kcal > 950 || r.kcal < 0)) delete r.kcal;
    return r;
  }
  function pick(r) { var o = {}; FIELDS.forEach(function (f) { o[f] = r[f] == null ? null : r[f]; }); o.carb = r.carb == null ? null : r.carb; return o; }

  function splitLines(text) {
    return String(text || "").split(/\n+|;/).map(norm).join("\n")
      .replace(/(\d\s*(?:g|kcal|kj|mg)?\s*[,:]?\s+)(?=(di cui|grass|carbo|fibr|prote|sale\b|salt\b|sodio\b|zucch|energ))/g, "$1\n")
      .replace(/(\d\s*(?:g|q|kcal|kj|mg)?[;,.:]?\s*)(?=(dicui|di cui|grass|carbo|fibr|prote|sale|salt|sodio|zucch|energ))/g, "$1\n")
      .split("\n").filter(function (l) { return l.trim(); });
  }

  // 1) per righe di testo
  function parseLabel(text) {
    var lines = splitLines(text), r = {};
    r.kcal = energy(lines.join("\n"));
    for (var i = 0; i < lines.length; i++) {
      var kk = keyOf(lines[i]); if (!kk) continue;
      var key = kk.k;
      if (key === "energy" || r[key] != null) continue;
      var n = nums(lines[i].slice(kk.at));
      if (!n.length && key !== "sodium" && i + 1 < lines.length && !keyOf(lines[i + 1]) && /^\s*[<o]?\s*\d/.test(lines[i + 1])) n = nums(lines[i + 1]);
      if (n.length) r[key] = n[0];
    }
    return pick(clean(r));
  }

  // 2) per posizione: etichette a sinistra, colonna dei numeri per 100 g a destra.
  // Funziona anche quando le righe sono sfalsate: abbina in ordine dall'alto in basso.
  function numToken(t) {
    t = t.toLowerCase().replace(/[|_'"‘’“”]/g, "").replace(/^o(?=[.,]?\d|g$)/, "0").replace(/^[<≤]/, "");
    var m = t.match(/^(\d+(?:[.,]\d+)?)(g|mg|kcal|kj|%)?[.,;:)]*$/);
    if (!m) return null;
    var u = m[2] || "";
    if (u === "%" || u === "kj" || u === "kcal") return null;
    var v = parseFloat(fixNum(m[1].replace(",", "."), u));
    if (u === "mg") v /= 1000;
    return v;
  }
  function parseGeo(lines, imgW) {
    if (!lines || !lines.length) return pick({});
    var labels = [], numsAll = [], seen = {}, lineH = [];
    lines.forEach(function (ln) {
      var words = ln.words || [];
      if (ln.bbox) lineH.push(ln.bbox.y1 - ln.bbox.y0);
      var lt = norm(ln.text || "");
      var kk = keyOf(lt);
      // riga in forma di paragrafo ("Grassi: 17 g; Carboidrati: 0 g; ...") -> la gestisce l'altro metodo
      var ks = KEYS.filter(function (k) { return k[1].test(lt); }).map(function (k) { return k[0]; });
      if (ks.indexOf("sat") >= 0) ks = ks.filter(function (k) { return k !== "fat"; });
      if (ks.length >= 2) return;
      if (kk && kk.k !== "energy" && !seen[kk.k]) {
        // posizione dell'etichetta: la parola che contiene la parola chiave
        var re = KEYS.filter(function (k) { return k[0] === kk.k; })[0][1], wb = null;
        for (var i = 0; i < words.length; i++) if (re.test(norm(words[i].text))) { wb = words[i].bbox; break; }
        if (!wb && words.length) wb = words[0].bbox;
        if (wb) { labels.push({ k: kk.k, x1: wb.x1, cy: (wb.y0 + wb.y1) / 2 }); seen[kk.k] = 1; }
      }
      words.forEach(function (w, i) {
        var v = numToken(w.text);
        if (v == null) return;
        var next = words[i + 1] ? words[i + 1].text.toLowerCase() : "";
        if (/^k/.test(next)) return;             // numero dell'energia
        numsAll.push({ v: v, x0: w.bbox.x0, x1: w.bbox.x1, cy: (w.bbox.y0 + w.bbox.y1) / 2 });
      });
    });
    var r = {};
    var all = lines.map(function (l) { return norm(l.text || ""); }).join("\n");
    r.kcal = energy(all);
    if (!labels.length || !numsAll.length) return pick(clean(r));
    lineH.sort(function (a, b) { return a - b; });
    var H = lineH[Math.floor(lineH.length / 2)] || 20;
    labels.sort(function (a, b) { return a.cy - b.cy; });
    var minX = Math.min.apply(null, labels.map(function (l) { return l.x1; }));
    var top = labels[0].cy - H * 1.2, bottom = labels[labels.length - 1].cy + H * 2.2;
    var cand = numsAll.filter(function (n) { return n.x0 > minX - H && n.cy > top && n.cy < bottom; });
    if (!cand.length) return pick(clean(r));
    // colonne per bordo destro (i numeri sono allineati a destra)
    var tol = Math.max(H * 1.5, (imgW || 1000) * 0.05), cols = [];
    cand.sort(function (a, b) { return a.x1 - b.x1; }).forEach(function (n) {
      var c = cols.filter(function (c) { return Math.abs(c.x - n.x1) < tol; })[0];
      if (c) { c.items.push(n); c.x = (c.x * (c.items.length - 1) + n.x1) / c.items.length; }
      else cols.push({ x: n.x1, items: [n] });
    });
    var good = cols.filter(function (c) { return c.items.length >= 2; });
    var col = (good.length ? good : cols).sort(function (a, b) { return a.x - b.x; })[0];
    var items = col.items.slice().sort(function (a, b) { return a.cy - b.cy; });
    if (items.length === labels.length) {
      labels.forEach(function (l, i) { r[l.k] = items[i].v; });
    } else {
      var pairs = [];
      labels.forEach(function (l) { items.forEach(function (n, j) { pairs.push({ l: l, j: j, d: Math.abs(n.cy - l.cy) }); }); });
      pairs.sort(function (a, b) { return a.d - b.d; });
      var usedL = {}, usedN = {};
      pairs.forEach(function (p) {
        if (usedL[p.l.k] || usedN[p.j] || p.d > H * 0.6) return;
        r[p.l.k] = items[p.j].v; usedL[p.l.k] = 1; usedN[p.j] = 1;
      });
    }
    return pick(clean(r));
  }

  // unisce una lettura: prima il metodo per righe, poi quello per posizione riempie i vuoti
  function combine(t, g) { var o = {}; FIELDS.concat(["carb"]).forEach(function (f) { o[f] = t[f] != null ? t[f] : g[f]; }); return o; }
  // unisce più letture (una per passaggio): vince il valore più frequente; a parità, il primo
  function merge(results) {
    var v = {}, votes = {}, notes = [];
    FIELDS.concat(["carb"]).forEach(function (f) {
      var counts = [], best = null;
      results.forEach(function (r) {
        var x = r[f]; if (x == null) return;
        var c = counts.filter(function (c) { return Math.abs(c.v - x) < 1e-6; })[0];
        if (c) c.n++; else counts.push({ v: x, n: 1 });
      });
      counts.forEach(function (c) { if (!best || c.n > best.n) best = c; });
      v[f] = best ? best.v : null; votes[f] = best ? best.n : 0;
    });
    // coerenza: se due valori si contraddicono, tolgo quello meno confermato (lo inserirai tu)
    function clash(a, b, msg) {
      if (v[a] == null || v[b] == null || v[a] <= v[b] + 1e-6) return;
      if (votes[a] < votes[b]) v[a] = null; else if (votes[b] < votes[a]) v[b] = null; else { v[a] = null; v[b] = null; }
      notes.push(msg);
    }
    // le calorie devono tornare con grassi×9 + carboidrati×4 + proteine×4: se una virgola è andata persa (4,0 -> 40) la rimetto
    if (v.kcal && v.fat != null && v.prot != null) {
      var est = function (o) { return 9 * o.fat + 4 * (o.carb || 0) + 4 * o.prot + 2 * (o.fibre || 0); };
      var off = function (o) { return Math.abs(est(o) - v.kcal) / v.kcal; };
      if (off(v) > 0.3) {
        var bestF = null, bestOff = off(v);
        ["fat", "prot", "carb"].forEach(function (f) {
          if (v[f] == null || v[f] < 10) return;
          var t = {}; for (var k in v) t[k] = v[k]; t[f] = v[f] / 10;
          if (off(t) < 0.15 && off(t) < bestOff) { bestOff = off(t); bestF = f; }
        });
        if (bestF) { v[bestF] = v[bestF] / 10; notes.push("ho corretto una virgola mancante: ricontrolla " + ({ fat: "i grassi", prot: "le proteine", carb: "i carboidrati" })[bestF]); }
        else notes.push("le calorie non tornano con grassi, carboidrati e proteine: c'è un numero sbagliato");
      }
    }
    if (v.salt != null && v.salt >= 10 && Math.round(v.salt) === v.salt) v.salt = null;   // "1,5" letto "15"
    clash("sat", "fat", "grassi e grassi saturi non tornavano: controllali");
    clash("sugar", "carb", "zuccheri e carboidrati non tornavano: controlla gli zuccheri");
    if (v.salt != null && v.salt > 6) notes.push("il sale sembra molto alto: controllalo");
    var sum = ["fat", "carb", "prot"].reduce(function (s, f) { return s + (v[f] || 0); }, 0);
    if (sum > 101) notes.push("grassi, carboidrati e proteine superano 100 g: c'è un numero sbagliato");
    delete v.carb;
    return { values: v, notes: notes };
  }

  root.parseLabel = parseLabel;
  root.parseGeo = parseGeo;
  root.mergeReadings = merge;
  root.combineReading = combine;
  if (typeof module !== "undefined") module.exports = { parseLabel: parseLabel, parseGeo: parseGeo, merge: merge, combine: combine };
})(typeof window !== "undefined" ? window : globalThis);
