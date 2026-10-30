// Contributi a Open Food Facts con l'account dell'utente (resta solo su questo telefono).
(function (root) {
  var BASE = "https://world.openfoodfacts.org";
  var KEY = "semaforo-off-account";
  var MAP = { kcal: ["energy-kcal", "kcal"], fat: ["fat", "g"], sat: ["saturated-fat", "g"], carb: ["carbohydrates", "g"],
    sugar: ["sugars", "g"], fibre: ["fiber", "g"], prot: ["proteins", "g"], salt: ["salt", "g"] };
  var FIELDS = Object.keys(MAP);
  var waiting = {}, seq = 0;

  root.__offCb = function (id, status, body) { var w = waiting[id]; if (!w) return; delete waiting[id]; w({ status: status, body: body }); };

  function account() { try { var a = JSON.parse(localStorage.getItem(KEY) || "null"); return a && a.user && a.pass ? a : null; } catch (e) { return null; } }
  function setAccount(user, pass) { try { localStorage.setItem(KEY, JSON.stringify({ user: user, pass: pass })); return true; } catch (e) { return false; } }
  function clearAccount() { try { localStorage.removeItem(KEY); } catch (e) {} }

  function viaBridge(method, args) {
    return new Promise(function (resolve) {
      var id = "r" + (++seq); waiting[id] = resolve;
      try { root.OffBridge[method].apply(root.OffBridge, [id].concat(args)); }
      catch (e) { delete waiting[id]; resolve({ status: -1, body: String(e) }); }
      setTimeout(function () { if (waiting[id]) { delete waiting[id]; resolve({ status: -1, body: "timeout" }); } }, 90000);
    });
  }
  async function post(path, fields) {
    if (root.OffBridge) return viaBridge("post", [BASE + path, JSON.stringify(fields)]);
    try {   // fuori dall'app (anteprima nel browser)
      var r = await fetch(BASE + path, { method: "POST", body: new URLSearchParams(fields) });
      return { status: r.status, body: await r.text() };
    } catch (e) { return { status: -1, body: String(e) }; }
  }
  async function upload(path, fields, fileField, b64) {
    if (root.OffBridge) return viaBridge("upload", [BASE + path, JSON.stringify(fields), fileField, b64]);
    try {
      var fd = new FormData(); Object.keys(fields).forEach(function (k) { fd.append(k, fields[k]); });
      var bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      fd.append(fileField, new Blob([u], { type: "image/jpeg" }), "etichetta.jpg");
      var r = await fetch(BASE + path, { method: "POST", body: fd });
      return { status: r.status, body: await r.text() };
    } catch (e) { return { status: -1, body: String(e) }; }
  }
  function json(t) { try { return JSON.parse(t); } catch (e) { return null; } }

  // valori cambiati rispetto a quelli del database (o all'ultimo invio)
  function changes(values, ref) {
    return FIELDS.filter(function (k) {
      var v = values[k]; if (v == null) return false;
      var r = ref ? ref[k] : null;
      return r == null || Math.abs(Number(v) - Number(r)) > 1e-6;
    });
  }

  // invia valori (e nome, se il prodotto è nuovo). Restituisce {ok, offline, message}
  async function saveProduct(p) {
    var acc = account();
    if (!acc) return { ok: false, message: "collega il tuo account Open Food Facts" };
    var keys = p.isNew ? FIELDS.filter(function (k) { return p.values[k] != null; }) : changes(p.values, p.ref);
    if (!keys.length && !(p.isNew && p.name)) return { ok: true, message: "niente da inviare", sent: [] };
    var f = { code: p.code, user_id: acc.user, password: acc.pass, lc: "it", cc: "it", nutrition_data_per: "100g",
      comment: "Semaforo Etichette (app Android): " + (p.isNew ? "nuovo prodotto dalla tabella nutrizionale" : "correzione valori nutrizionali per 100 g") };
    if (p.drink) f.nutrition_data_per = "100g";
    keys.forEach(function (k) { f["nutriment_" + MAP[k][0]] = String(p.values[k]); f["nutriment_" + MAP[k][0] + "_unit"] = MAP[k][1]; });
    if (p.isNew && p.name) f.product_name = p.name;
    var r = await post("/cgi/product_jqm2.pl", f);
    if (r.status === -1) return { ok: false, offline: true, message: "nessuna connessione: riprovo alla prossima apertura dell'app" };
    var j = json(r.body);
    if (r.status >= 200 && r.status < 300 && j && Number(j.status) === 1) return { ok: true, sent: keys };
    var why = (j && (j.status_verbose || j.error)) || ("errore " + r.status);
    if (r.status === 401 || r.status === 403 || /auth|password|login|identif/i.test(why)) return { ok: false, auth: true, message: "nome utente o password di Open Food Facts non validi" };
    return { ok: false, message: "Open Food Facts ha risposto: " + why };
  }

  async function uploadNutritionPhoto(code, dataUrl) {
    var acc = account(); if (!acc || !dataUrl) return { ok: false };
    var b64 = String(dataUrl).split(",")[1] || "";
    var r = await upload("/cgi/product_image_upload.pl", { code: code, user_id: acc.user, password: acc.pass, imagefield: "nutrition_it" }, "imgupload_nutrition_it", b64);
    var j = json(r.body);
    return { ok: !!(j && /ok/.test(String(j.status)) && !/not ok/.test(String(j.status))), body: r.body };
  }

  // rilegge la scheda dal database e controlla che contenga davvero i valori inviati
  async function verify(code, values, keys, user) {
    var url = BASE + "/api/v2/product/" + encodeURIComponent(code) + "?fields=code,product_name,nutriments,last_editor,last_modified_t,editors_tags&_=" + Date.now();
    for (var attempt = 0; attempt < 3; attempt++) {
      await new Promise(function (r) { setTimeout(r, attempt === 0 ? 1500 : 3000); });
      try {
        var resp = await fetch(url, { cache: "no-store" });
        if (resp.status === 404) continue;
        var j = await resp.json(); if (!j || !j.product) continue;
        var n = j.product.nutriments || {}, bad = [];
        keys.forEach(function (k) {
          var v = n[MAP[k][0] + "_100g"]; v = typeof v === "string" ? parseFloat(v) : v;
          var want = Number(values[k]);
          if (!(typeof v === "number" && Math.abs(v - want) <= Math.max(0.011, want * 0.01))) bad.push(k);
        });
        var eds = j.product.editors_tags || [];
        var mine = !!user && (j.product.last_editor === user || eds.indexOf(user) >= 0 || eds.indexOf(String(user).toLowerCase()) >= 0);
        if (!bad.length) return { ok: true, mine: mine, lastEditor: j.product.last_editor || "" };
        if (attempt === 2) return { ok: false, found: true, bad: bad, mine: mine, lastEditor: j.product.last_editor || "" };
      } catch (e) { if (attempt === 2) return { ok: false, error: String(e) }; }
    }
    return { ok: false, found: false };
  }
  // prova le credenziali: true = valide, false = rifiutate, null = non si sa (es. senza rete)
  async function checkAccount(user, pass) {
    var r = await post("/cgi/auth.pl", { user_id: user, password: pass, body: "1" });
    if (r.status === 200) return true;
    if (r.status === 401 || r.status === 403) return false;
    return null;
  }
  function productUrl(code) { return "https://it.openfoodfacts.org/product/" + encodeURIComponent(code); }
  function editorUrl(user) { return "https://it.openfoodfacts.org/editor/" + encodeURIComponent(user); }

  root.OFF = { verify: verify, checkAccount: checkAccount, productUrl: productUrl, editorUrl: editorUrl, account: account, setAccount: setAccount, clearAccount: clearAccount, changes: changes, saveProduct: saveProduct, uploadNutritionPhoto: uploadNutritionPhoto, BASE: BASE };
})(window);
