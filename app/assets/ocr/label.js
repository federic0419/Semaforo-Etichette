// Interpreta i riquadri di testo letti da una tabella nutrizionale e restituisce i valori per 100 g.
// Ingresso: [{text, bbox:{x0,y0,x1,y1}}] (un riquadro per scritta, come li dà PaddleOCR).
(function (root) {
  var FIELDS = ["kcal", "fat", "sat", "carb", "sugar", "fibre", "prot", "salt"];
  var CANON = { fat: ["grassi", "fats", "lipidi"], sat: ["saturi", "saturated"], carb: ["carboidrati", "carbohydrates"],
    sugar: ["zuccheri", "sugars"], fibre: ["fibre", "fiber", "fibra"], prot: ["proteine", "proteins"], salt: ["sale", "salt"],
    energy: ["energia", "energy", "valore energetico"], sodium: ["sodio", "sodium"] };

  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function letters(t) { return t.toLowerCase().replace(/[^a-zàèéìòù]/g, ""); }

  // che voce è questo testo? (tollera errori di lettura: "Caiboiarani" = carboidrati)
  function labelOf(text) {
    var t = letters(text);
    if (t.length < 3) return null;
    if (/satur/.test(t)) return "sat";
    if (/zucc|zuch|sugar/.test(t)) return "sugar";
    if (/acid/.test(t) || (/^di?c[uv][il1]/.test(t) && /gras/.test(t))) return "sat";
    if (/carbo|idrat|carbs/.test(t)) return "carb";
    if (/protei|protein|otein/.test(t)) return "prot";
    if (/grass|^fats?$|lipid/.test(t)) return "fat";
    if (/fibr|fiber/.test(t)) return "fibre";
    if (/sodio|sodium/.test(t)) return "sodium";
    if (/^(sale|salt)/.test(t) || /sale$|salt$/.test(t) && t.length <= 9) return "salt";
    if (/energ|kcal|valoreenerg/.test(t)) return "energy";
    // confronto approssimato con la prima parola
    var first = letters(text.split(/[\/:\s]/)[0] || "");
    if (first.length < 4) return null;
    var best = null, bestR = 0;
    Object.keys(CANON).forEach(function (k) {
      CANON[k].forEach(function (w) {
        var r = 1 - lev(first, w) / Math.max(first.length, w.length);
        if (r > bestR) { bestR = r; best = k; }
      });
    });
    return bestR >= 0.55 ? best : null;
  }

  // numero con unità, tollerando O/o al posto di 0 e la "g" letta come "9" o "q"
  function numberOf(text) {
    var t = text.toLowerCase().replace(/\s+/g, "").replace(/[|'"‘’“”]/g, "");
    t = t.replace(/^[^0-9o<]*(?=[0-9o<])/, "");                  // "i1,9g" -> "1,9g"
    t = t.replace(/^<|^≤/, "");
    if (/^o?g$/.test(t) || /^og$/.test(t)) return { v: 0, unit: "g" };
    t = t.replace(/^o(?=[,.]?\d|g)/, "0");
    var m = t.match(/^(\d+(?:[.,]\d+)?)(mg|g|q|9|kcal|kj|%)?[.,;:)*]*$/);
    if (!m) return null;
    var u = m[2] || "", s = m[1].replace(",", ".");
    if (u === "%" ) return null;
    if (u === "9" || u === "q") u = "g";
    if (!u && /^\d+\.\d{2,}9$/.test(s)) s = s.slice(0, -1);       // 1,309 -> 1,30
    if (!u && /^0\d$/.test(s)) s = "0";                            // 09 -> 0 g
    if (!u && /^\d{2,3}9$/.test(s) && parseFloat(s) > 100) s = s.slice(0, -1);
    var v = parseFloat(s);
    if (u === "mg") { v = v / 1000; u = "g"; }
    return { v: v, unit: u, hasDec: /\./.test(s) };
  }

  // energia: "740 kJ/176 kcal", "418 kc3l", "1739J", "583k3/138kcal"
  function energyFrom(boxes) {
    var kcal = null, kj = null;
    boxes.slice().sort(function (a, b) { return a.cy - b.cy; }).forEach(function (b) {
      var t = b.text.toLowerCase().replace(/\s+/g, "");
      var parts = t.split("/");
      parts.forEach(function (p, i) {
        var re = /(\d{2,4})(?:[.,]\d)?(k?)([a-z0-9)]{0,4})/g, m, last = null;
        while ((m = re.exec(p))) { if (m[2] || /^j|cal/.test(m[3]) || re.lastIndex === p.length) last = m; if (m[2]) break; }
        m = last;
        if (!m) return;
        var v = parseFloat(m[1]), k = m[2], rest = m[3];
        var isCal = (k && /^[cea]/.test(rest)) || /cal|kal/.test(rest);
        var isJ = (k && /^[j3)7i]/.test(rest)) || (!k && /^j/.test(rest));
        if (!isCal && !isJ && parts.length === 2 && k) { isJ = i === 0; isCal = i === 1; }
        if (!isCal && !isJ && parts.length === 2 && !k && !rest && i === 1 && /k/.test(parts[0])) isCal = true;
        if (isCal && kcal == null && v < 1000) kcal = v;
        else if (isJ && kj == null && v < 4000) kj = v;
      });
    });
    // valori dal primo riquadro energia (in alto = colonna per 100 g): se tornano tra loro, sono quelli
    if (kj != null && kcal != null && Math.abs(kj / 4.184 - kcal) / kcal <= 0.08) return { kcal: kcal, kj: kj };
    // coppia kJ/kcal coerente (kJ ≈ 4,184 × kcal) tra tutti i numeri della zona energia: è la prova migliore
    var allN = [];
    boxes.forEach(function (b) {
      var t = b.text.toLowerCase().replace(/\s+/g, "");
      if (!/\d{2,4}k|k[j3)]|kcal|kal|\d{2,4}j|^\d{3,4}$/.test(t)) return;   // solo riquadri che sembrano energia
      (t.match(/\d{2,4}/g) || []).forEach(function (x) { if (x !== "100") allN.push(parseFloat(x)); });
    });
    for (var i = 0; i < allN.length; i++) for (var j = 0; j < allN.length; j++) {
      if (i !== j && allN[j] >= 20 && allN[j] < 950 && Math.abs(allN[i] / 4.184 - allN[j]) / allN[j] < 0.03 && !(allN[i] === 8400 && allN[j] === 2000)) return { kcal: allN[j], kj: allN[i] };
    }
    if (kj != null && kj >= 80 && (kcal == null || Math.abs(kj / 4.184 - kcal) / kcal > 0.08)) return { kcal: Math.round(kj / 4.184), kj: kj };
    if (kj != null && (kcal == null || Math.abs(kj / 4.184 - kcal) / kcal > 0.08)) {
      var fromJ = Math.round(kj / 4.184);
      if (kcal == null || fromJ < 950) kcal = fromJ;
    }
    return { kcal: kcal, kj: kj };
  }

  // allinea in ordine dall'alto in basso etichette e numeri (programmazione dinamica),
  // provando uno spostamento verticale costante: così regge le tabelle con righe sfalsate
  function align(labels, nums, H) {
    var best = null;
    for (var off = -1.2; off <= 1.2001; off += 0.1) {
      var n = labels.length, m = nums.length, SK = 0.9, dp = [], bk = [];
      for (var i = 0; i <= n; i++) { dp[i] = []; bk[i] = []; for (var j = 0; j <= m; j++) { dp[i][j] = Infinity; } }
      dp[0][0] = 0;
      for (i = 0; i <= n; i++) for (j = 0; j <= m; j++) {
        var c = dp[i][j]; if (c === Infinity) continue;
        if (i < n && j < m) {
          var d = Math.abs(nums[j].cy - (labels[i].cy + off * H)) / H;
          if (d < 1.6) { var mc = c + d * d; if (mc < dp[i + 1][j + 1]) { dp[i + 1][j + 1] = mc; bk[i + 1][j + 1] = [i, j, 1]; } }
        }
        if (i < n && c + SK < dp[i + 1][j]) { dp[i + 1][j] = c + SK; bk[i + 1][j] = [i, j, 0]; }
        if (j < m && c + SK * 0.6 < dp[i][j + 1]) { dp[i][j + 1] = c + SK * 0.6; bk[i][j + 1] = [i, j, 0]; }
      }
      var cost = dp[n][m] + Math.abs(off) * 0.05;
      if (!best || cost < best.cost) {
        var pairs = [], a = n, b = m;
        while (a > 0 || b > 0) { var s = bk[a][b]; if (!s) break; if (s[2]) pairs.push([s[0], s[1]]); a = s[0]; b = s[1]; }
        best = { cost: cost, pairs: pairs };
      }
    }
    return best ? best.pairs : [];
  }

  function analyze(boxes) {
    boxes = (boxes || []).filter(function (b) { return b.text && b.bbox; }).map(function (b) {
      return { text: String(b.text).trim(), x0: b.bbox.x0, y0: b.bbox.y0, x1: b.bbox.x1, y1: b.bbox.y1, cy: (b.bbox.y0 + b.bbox.y1) / 2, h: b.bbox.y1 - b.bbox.y0 };
    });
    var r = {}, src = {}, notes = [];
    var e = energyFrom(boxes);
    if (e.kcal != null) r.kcal = e.kcal;

    var labels = [], nums = [], seen = {};
    // riquadri-paragrafo ("Grassi 17,0g; di cui saturi 12,0g; ...") li legge l'altro metodo
    var KW = /grass|satur|carbo|zucch|fibr|protei|sale|salt|energ/g;
    boxes = boxes.filter(function (b) { var k = letters(b.text).match(KW); return !k || k.filter(function (x, i, a) { return a.indexOf(x) === i; }).length < 3; });
    // una "g" letta come "9" in un riquadro a parte, subito a destra di un numero
    boxes = boxes.filter(function (b) {
      if (!/^[9gq]$/i.test(b.text.trim())) return true;
      return !boxes.some(function (o) { return o !== b && /\d|^o/i.test(o.text) && Math.abs(o.cy - b.cy) < b.h * 0.6 && b.x0 - o.x1 < b.h * 1.2 && b.x0 > o.x0; });
    });
    boxes.forEach(function (b) {
      var lab = labelOf(b.text);
      // voce e numero nello stesso riquadro ("di cui acidi grassi saturi 1,9g")
      if (lab && lab !== "energy") {
        var tail = b.text.match(/(?:^|[^0-9])((?:o|\d+)(?:[.,]\d+)?\s*(?:mg|g|q|9)?)\s*$/i);
        var inl = tail && /\d|^o/i.test(tail[1]) && letters(b.text).length >= 3 ? numberOf(tail[1]) : null;
        if (inl && !seen[lab] && /[a-z]{3,}.*\d|[a-z]{3,}.*\bo\s*g/i.test(b.text)) {
          r[lab] = inl.v; src[lab] = inl; seen[lab] = 1; return;
        }
        if (!seen[lab]) { labels.push({ k: lab, cy: b.cy, x1: b.x1, x0: b.x0 }); seen[lab] = 1; }
        return;
      }
      var n = numberOf(b.text);
      if (n && n.unit !== "kj" && n.unit !== "kcal") nums.push({ v: n.v, n: n, cx: (b.x0 + b.x1) / 2, x0: b.x0, x1: b.x1, cy: b.cy, h: b.h });
    });

    labels = labels.filter(function (l) { return l.k !== "energy"; }).sort(function (a, b) { return a.cy - b.cy; });
    if (labels.length && nums.length) {
      var hs = boxes.map(function (b) { return b.h; }).sort(function (a, b) { return a - b; });
      var H = hs[Math.floor(hs.length / 2)] || 20;
      var minX = Math.min.apply(null, labels.map(function (l) { return l.x0; }));
      var top = labels[0].cy - 1.5 * H, bot = labels[labels.length - 1].cy + 2.5 * H;
      var cand = nums.filter(function (n) { return n.x0 > minX + H && n.cy > top && n.cy < bot; });
      // colonne: raggruppo per bordo destro; la colonna per 100 g è la prima da sinistra con almeno 2 numeri
      var cols = [];
      cand.slice().sort(function (a, b) { return a.x1 - b.x1; }).forEach(function (n) {
        var c = cols.filter(function (c) { return Math.abs(c.x - n.x1) < Math.max(2.5 * H, 0); })[0];
        if (c) { c.items.push(n); c.x = c.items.reduce(function (s, i) { return s + i.x1; }, 0) / c.items.length; }
        else cols.push({ x: n.x1, items: [n] });
      });
      var good = cols.filter(function (c) { return c.items.length >= 2; });
      var col = (good.length ? good : cols).sort(function (a, b) { return a.x - b.x; })[0];
      if (col) {
        var items = col.items.sort(function (a, b) { return a.cy - b.cy; });
        align(labels, items, H).forEach(function (p) {
          var l = labels[p[0]], n = items[p[1]];
          if (r[l.k] == null) { r[l.k] = n.v; src[l.k] = n.n; }
        });
      }
    }
    FIELDS.concat(["sodium"]).forEach(function (f) { if (r[f] === undefined) r[f] = null; });
    if (r.salt == null && r.sodium != null) { r.salt = Math.round(r.sodium * 2.5 * 100) / 100; notes.push("sale calcolato dal sodio"); }
    delete r.sodium;
    repair(r, src, notes);
    var out = {}; FIELDS.forEach(function (f) { out[f] = r[f] == null ? null : Math.round(r[f] * 100) / 100; });
    return { values: out, notes: notes };
  }

  // Ripara le virgole perse ("6,0g" letto "60g") usando i conti: calorie, saturi ≤ grassi, zuccheri ≤ carboidrati.
  function repair(r, src, notes) {
    function opts(f) {
      var v = r[f]; if (v == null) return [null];
      var s = src[f], o = [v];
      if (!s || !s.hasDec) { if (v >= 10) o.push(v / 10); if (v >= 100) o.push(v / 100); }
      return o;
    }
    // sale: oltre 10 g quasi sempre è una virgola persa
    if (r.salt != null && r.salt >= 10 && !(src.salt && src.salt.hasDec)) r.salt = r.salt / 10;
    if (r.salt != null && r.salt > 10) r.salt = null;   // oltre 10 g per 100 g è quasi sempre una lettura sbagliata
    var best = null;
    var F = opts("fat"), C = opts("carb"), P = opts("prot"), B = opts("fibre");
    F.forEach(function (f) { C.forEach(function (c) { P.forEach(function (p) { B.forEach(function (b) {
      var changed = (f !== r.fat) + (c !== r.carb) + (p !== r.prot) + (b !== r.fibre);
      var sum = (f || 0) + (c || 0) + (p || 0) + (b || 0);
      var cost = changed * 0.04 + (sum > 100 ? 5 : 0);
      if (r.kcal) {
        var known = (f != null) + (c != null) + (p != null);
        if (known >= 2) {
          var est = 9 * (f || 0) + 4 * (c || 0) + 4 * (p || 0) + 2 * (b || 0);
          var err = Math.abs(est - r.kcal) / r.kcal;
          cost += known === 3 ? err : Math.max(0, est / r.kcal - 1.05);   // con un valore mancante: solo non superare
        }
      }
      if (!best || cost < best.cost) best = { cost: cost, f: f, c: c, p: p, b: b };
    }); }); }); });
    if (best) {
      [["fat", "f", "i grassi"], ["carb", "c", "i carboidrati"], ["prot", "p", "le proteine"], ["fibre", "b", "le fibre"]].forEach(function (x) {
        if (best[x[1]] !== r[x[0]]) { r[x[0]] = best[x[1]]; notes.push("ho rimesso la virgola mancante: ricontrolla " + x[2]); }
      });
    }
    // saturi ≤ grassi, zuccheri ≤ carboidrati
    [["sat", "fat"], ["sugar", "carb"]].forEach(function (pr) {
      var a = pr[0], b = pr[1];
      if (r[a] == null) return;
      if (r[b] != null && r[a] > r[b] + 1e-6) {
        var fixed = !(src[a] && src[a].hasDec) && r[a] >= 10 && r[a] / 10 <= r[b] + 1e-6 ? r[a] / 10 : null;
        if (fixed != null) { r[a] = fixed; notes.push("ho rimesso la virgola mancante: ricontrolla " + (a === "sat" ? "i saturi" : "gli zuccheri")); }
        else { r[a] = null; notes.push((a === "sat" ? "i saturi" : "gli zuccheri") + " non tornavano: inseriscili tu"); }
      }
    });
    if (r.kcal != null && (r.kcal < 0 || r.kcal > 950)) r.kcal = null;
    // calorie lette che non tornano con i nutrienti (es. presa la colonna "per porzione"): le ricalcolo
    if (r.fat != null && r.carb != null && r.prot != null) {
      var est = Math.round(9 * r.fat + 4 * r.carb + 4 * r.prot + 2 * (r.fibre || 0));
      if (est > 0 && (r.kcal == null || Math.abs(est - r.kcal) / est > 0.15)) {
        if (r.kcal != null) notes.push("le calorie lette non tornavano: le ho ricalcolate dai nutrienti");
        r.kcal = est;
      }
    }
    ["fat", "sat", "carb", "sugar", "fibre", "prot"].forEach(function (f) { if (r[f] != null && r[f] > 100) r[f] = null; });
  }

  root.analyzeLabel = analyze;
  if (typeof module !== "undefined") module.exports = { analyze: analyze, labelOf: labelOf, numberOf: numberOf };
})(typeof window !== "undefined" ? window : globalThis);
