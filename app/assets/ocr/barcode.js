// Lettura del codice a barre (EAN/UPC) da un'immagine e ricerca su Open Food Facts.
(function (root) {
  var native = null;
  async function nativeDetector() {
    if (native !== null) return native;
    native = false;
    try {
      if ("BarcodeDetector" in window) {
        var f = await BarcodeDetector.getSupportedFormats();
        if (f.indexOf("ean_13") >= 0) native = new BarcodeDetector({ formats: f.filter(function (x) { return /ean|upc/.test(x); }) });
      }
    } catch (e) { native = false; }
    return native;
  }
  var reader = null;
  function zx() {
    if (reader || !window.ZXing) return reader;
    var Z = window.ZXing, hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    reader = new Z.MultiFormatReader(); reader.setHints(hints);
    return reader;
  }
  function validEAN(c) {
    if (!/^\d{8}$|^\d{12,14}$/.test(c)) return false;
    var d = c.split("").map(Number), chk = d.pop(), s = 0;
    d.reverse().forEach(function (x, i) { s += x * (i % 2 === 0 ? 3 : 1); });
    return (10 - s % 10) % 10 === chk;
  }
  function canvasOf(src, maxW, rot) {
    var w = src.videoWidth || src.width || src.naturalWidth, h = src.videoHeight || src.height || src.naturalHeight;
    var k = Math.min(1, maxW / Math.max(w, h)), c = document.createElement("canvas");
    c.width = Math.round((rot ? h : w) * k); c.height = Math.round((rot ? w : h) * k);
    var x = c.getContext("2d", { willReadFrequently: true });
    if (rot) { x.translate(c.width, 0); x.rotate(Math.PI / 2); }
    x.drawImage(src, 0, 0, w * k, h * k);
    return c;
  }
  function zxDecode(c) {
    var r = zx(); if (!r) return null;
    try {
      var Z = window.ZXing;
      var bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)));
      var t = r.decode(bmp).getText(); r.reset();
      return validEAN(t) ? t : null;
    } catch (e) { try { r.reset(); } catch (_) {} return null; }
  }
  // quick=true per i fotogrammi del video (veloce), false per una foto (prova più varianti)
  async function decode(src, quick) {
    var det = await nativeDetector();
    if (det) {
      try {
        var res = await det.detect(src);
        for (var i = 0; i < res.length; i++) if (validEAN(res[i].rawValue)) return res[i].rawValue;
      } catch (e) {}
      if (quick) return null;
    }
    var sizes = quick ? [1000] : [1400, 900, 2000], rots = quick ? [false] : [false, true];
    for (var a = 0; a < rots.length; a++) for (var b = 0; b < sizes.length; b++) {
      var t = zxDecode(canvasOf(src, sizes[b], rots[a]));
      if (t) return t;
    }
    // foto intera: il codice è piccolo, provo riquadri sovrapposti (come se avvicinassi il telefono)
    if (!quick) {
      var W = src.videoWidth || src.width || src.naturalWidth, H = src.videoHeight || src.height || src.naturalHeight;
      var fr = [0.5, 0.35];
      for (var fi = 0; fi < fr.length; fi++) {
        var tw = W * fr[fi], th = H * fr[fi], step = 0.5;
        for (var y = 0; y + th <= H + 1; y += th * step) for (var x = 0; x + tw <= W + 1; x += tw * step) {
          var c = document.createElement("canvas"), k = Math.min(1, 1000 / Math.max(tw, th));
          c.width = Math.round(tw * k); c.height = Math.round(th * k);
          c.getContext("2d", { willReadFrequently: true }).drawImage(src, x, y, tw, th, 0, 0, c.width, c.height);
          var r2 = zxDecode(c);
          if (r2) return r2;
        }
      }
    }
    return null;
  }

  // Open Food Facts: valori per 100 g. Restituisce null se il prodotto non c'è o non ha i valori.
  async function lookup(code, signal) {
    var url = "https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(code) +
      "?fields=code,product_name,product_name_it,generic_name_it,brands,quantity,nutriments,nutrition_data_per,categories_tags";
    var resp = await fetch(url, { signal: signal, headers: { "Accept": "application/json" } });
    if (resp.status === 404) return { found: false };
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    var j = await resp.json();
    if (!j || j.status !== 1 || !j.product) return { found: false };
    var p = j.product, n = p.nutriments || {};
    var g = function (k) { var v = n[k + "_100g"]; v = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v; return (typeof v === "number" && isFinite(v) && v >= 0) ? Math.round(v * 100) / 100 : null; };
    var kcal = g("energy-kcal");
    if (kcal == null && g("energy") != null) kcal = Math.round(g("energy") / 4.184);   // energy_100g è in kJ
    var salt = g("salt");
    if (salt == null && g("sodium") != null) salt = Math.round(g("sodium") * 2.5 * 100) / 100;
    var values = { kcal: kcal, fat: g("fat"), sat: g("saturated-fat"), carb: g("carbohydrates"), sugar: g("sugars"), fibre: g("fiber"), prot: g("proteins"), salt: salt };
    var name = [p.product_name_it || p.product_name || p.generic_name_it || "", (p.brands || "").split(",")[0].trim()].filter(Boolean).join(" · ");
    var cats = p.categories_tags || [];
    var drink = cats.some(function (c) { return /^en:(beverages|waters|sodas|juices|plant-based-milks|milks)/.test(c); }) && !cats.some(function (c) { return /^en:(yogurts|cheeses)/.test(c); });
    var any = Object.keys(values).some(function (k) { return values[k] != null; });
    return { found: true, hasValues: any, name: name, quantity: p.quantity || "", values: values, drink: drink, code: code };
  }

  root.Barcode = { decode: decode, lookup: lookup, validEAN: validEAN };
})(window);
