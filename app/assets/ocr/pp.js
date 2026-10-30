// PaddleOCR sul telefono (ONNX Runtime Web): rilevamento righe (DB) + riconoscimento (CTC).
// Stessa logica della pipeline Python con cui è stato misurato.
(function (root) {
  var S = { det: null, rec: null, dict: null, loading: null };
  var LIMIT = 960, THR = 0.3, BOX_THR = 0.6, UNCLIP = 1.6, MIN_SCORE = 0.5;

  function init(onStatus) {
    if (S.loading) return S.loading;
    S.loading = (async function () {
      var base = location.origin + "/";
      ort.env.wasm.wasmPaths = base + "ort/";
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      onStatus && onStatus("Preparo la lettura (solo la prima volta)…");
      var opt = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
      S.det = await ort.InferenceSession.create(base + "models/det.onnx", opt);
      S.rec = await ort.InferenceSession.create(base + "models/rec.onnx", opt);
      var t = await (await fetch(base + "models/en_dict.txt")).text();
      S.dict = t.split("\n");
    })();
    S.loading.catch(function () { S.loading = null; });
    return S.loading;
  }

  function pixels(src, sx, sy, sw, sh, w, h) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    return x.getImageData(0, 0, w, h).data;
  }

  async function detect(src) {
    var w = src.width, h = src.height, mx = Math.max(w, h);
    var r = mx > LIMIT ? LIMIT / mx : 1;
    if (mx * r < 640) r = 640 / mx;
    var nh = Math.max(32, Math.round(h * r / 32) * 32), nw = Math.max(32, Math.round(w * r / 32) * 32);
    var d = pixels(src, 0, 0, w, h, nw, nh), N = nw * nh, f = new Float32Array(3 * N);
    // ordine BGR come OpenCV; media/deviazione ImageNet applicate in quell'ordine
    var mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    for (var i = 0; i < N; i++) {
      f[i] = (d[i * 4 + 2] / 255 - mean[0]) / std[0];
      f[N + i] = (d[i * 4 + 1] / 255 - mean[1]) / std[1];
      f[2 * N + i] = (d[i * 4] / 255 - mean[2]) / std[2];
    }
    var feeds = {}; feeds[S.det.inputNames[0]] = new ort.Tensor("float32", f, [1, 3, nh, nw]);
    var out = await S.det.run(feeds), p = out[S.det.outputNames[0]].data;
    // componenti connesse sulla mappa binaria
    var lab = new Int32Array(N), stack = new Int32Array(N), boxes = [], id = 0;
    for (var s = 0; s < N; s++) {
      if (lab[s] || p[s] <= THR) continue;
      id++; var top = 0; stack[top++] = s; lab[s] = id;
      var x0 = nw, y0 = nh, x1 = 0, y1 = 0, sum = 0, cnt = 0;
      while (top) {
        var q = stack[--top], qx = q % nw, qy = (q / nw) | 0;
        sum += p[q]; cnt++;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        if (qx > 0 && !lab[q - 1] && p[q - 1] > THR) { lab[q - 1] = id; stack[top++] = q - 1; }
        if (qx < nw - 1 && !lab[q + 1] && p[q + 1] > THR) { lab[q + 1] = id; stack[top++] = q + 1; }
        if (qy > 0 && !lab[q - nw] && p[q - nw] > THR) { lab[q - nw] = id; stack[top++] = q - nw; }
        if (qy < nh - 1 && !lab[q + nw] && p[q + nw] > THR) { lab[q + nw] = id; stack[top++] = q + nw; }
      }
      var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (bw < 3 || bh < 3 || sum / cnt < BOX_THR) continue;
      var dd = (bw * bh) * UNCLIP / (2 * (bw + bh)), kx = w / nw, ky = h / nh;
      boxes.push({ x0: Math.max(0, (x0 - dd) * kx), y0: Math.max(0, (y0 - dd) * ky), x1: Math.min(w, (x0 + bw + dd) * kx), y1: Math.min(h, (y0 + bh + dd) * ky) });
    }
    return boxes;
  }

  async function recognize(src, b) {
    var cw = Math.round(b.x1) - Math.round(b.x0), ch = Math.round(b.y1) - Math.round(b.y0);
    if (cw < 2 || ch < 2) return { text: "", score: 0 };
    var W = Math.min(2400, Math.max(16, Math.ceil(48 * cw / ch))), H = 48, N = W * H;
    var d = pixels(src, Math.round(b.x0), Math.round(b.y0), cw, ch, W, H), f = new Float32Array(3 * N);
    for (var i = 0; i < N; i++) {
      f[i] = (d[i * 4 + 2] / 255 - 0.5) / 0.5;
      f[N + i] = (d[i * 4 + 1] / 255 - 0.5) / 0.5;
      f[2 * N + i] = (d[i * 4] / 255 - 0.5) / 0.5;
    }
    var feeds = {}; feeds[S.rec.inputNames[0]] = new ort.Tensor("float32", f, [1, 3, H, W]);
    var o = (await S.rec.run(feeds))[S.rec.outputNames[0]], T = o.dims[1], C = o.dims[2], v = o.data;
    var out = "", last = 0, ps = 0, pn = 0;
    for (var t = 0; t < T; t++) {
      var bi = 0, bv = -Infinity;
      for (var c = 0; c < C; c++) { var x = v[t * C + c]; if (x > bv) { bv = x; bi = c; } }
      if (bi !== 0 && bi !== last) { out += bi - 1 < S.dict.length ? S.dict[bi - 1] : " "; ps += bv; pn++; }
      last = bi;
    }
    return { text: out, score: pn ? ps / pn : 0 };
  }

  // restituisce i riquadri di testo [{text, bbox}] in ordine dall'alto
  async function read(src, onProgress) {
    var boxes = await detect(src), lines = [];
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i], r = await recognize(src, b);
      onProgress && onProgress((i + 1) / boxes.length);
      if (!r.text.trim() || r.score < MIN_SCORE) continue;
      lines.push({ text: r.text, bbox: b });
    }
    lines.sort(function (a, c) { return (a.bbox.y0 + a.bbox.y1) - (c.bbox.y0 + c.bbox.y1); });
    return lines;
  }

  root.PaddleOCR = { init: init, read: read };
})(window);
