/* =============================================================================
   cloud_layer.js · HECE DC Intelligence — pestana "08 · Cloud regions"
   -----------------------------------------------------------------------------
   Huella multi-operador construida SOLO con fuentes primarias de cada operador.
   Add-on autocontenido: no modifica el codigo existente.

   Instalacion (tras azure.js / azure_layer.js, antes de </body>):
       <script src="cloud.js"></script>
       <script src="cloud_layer.js"></script>

   Dependencias ya presentes: window.__DATA, window.__WORLD, window.Chart.
   Si falta window.__CLOUD, el add-on no hace nada.

   >>> LEER ANTES DE USAR <<<
   · Cada operador publica cosas distintas. Esto NO es un dataset normalizado por
     un tercero (eso es lo que vende TeleGeography). Los huecos son reales.
   · Coordenadas, TRES niveles de precision, siempre visibles y distinguibles:
       operator  · lat/lon publicada por el operador (solo Azure) — punto relleno
       gazetteer · centroide de la CIUDAD que el operador declara — punto discontinuo
       country   · el operador NO publica la ciudad: marcador en el centro del PAIS,
                   rombo hueco. NO es una ubicacion: dice "esta en este pais y no
                   sabemos donde". Se pinta para no dar a entender que no existe.
     El centroide de pais se calcula EN EL NAVEGADOR a partir de window.__WORLD y
     NUNCA se escribe en cloud.js: el fichero de datos no contiene ni una sola
     coordenada fabricada, y el CSV exportado tampoco.
     AWS eu-south-2 es el caso claro: AWS la llama "Europe (Spain)" y no dice ciudad.
   · status: solo Azure distingue live/announced. AWS y Oracle salen todas 'live'
     porque su fuente no lo distingue — NO significa que no tengan anunciadas.
   · Sin MW, sin m2, sin PUE. Ningun operador publica capacidad por region.
   · cfe / grid_co2: SOLO Google los publica (repo oficial region-carbon-info) y con
     retraso — a jul-2026 el ultimo ano disponible es 2024. Son datos de la RED
     ELECTRICA de la zona, no del datacenter. Las columnas salen vacias para el resto
     de operadores: es un hueco real, no un fallo de carga.
   ========================================================================== */
(function () {
  'use strict';

  if (typeof window.__DATA === 'undefined') return;
  if (typeof window.__CLOUD === 'undefined') {
    console.info('[cloud_layer] window.__CLOUD no encontrado — pestana Cloud regions desactivada.');
    return;
  }

  var D = window.__DATA, K = window.__CLOUD;
  var C = {}; D.cols.forEach(function (c, i) { C[c] = i; });
  var R = K.regions, I = {}; R.cols.forEach(function (c, i) { I[c] = i; });
  var ON = (K.onramps && K.onramps.rows.length) ? K.onramps : null;
  var OI = {}; if (ON) K.onramps.cols.forEach(function (c, i) { OI[c] = i; });

  var CSP_COLOR = { Azure: '#ee6f2c', AWS: '#3a3a3c', Oracle: '#0e7c86', Google: '#c85a12',
                    Alibaba: '#7c756e', Tencent: '#e39a5c', IBM: '#1e7a3c', Huawei: '#8e5fa8' };
  var LAND = '#eae4dd', LANDLINE = '#d6cec4', DIM = '#7c756e';

  var MKT = {};
  D.rows.forEach(function (r) {
    var m = r[C.market]; if (!m) return;
    var o = MKT[m] || (MKT[m] = { n: 0, live: 0, fut: 0 });
    o.n++; o.live += (r[C.live] || 0); o.fut += (r[C.uc] || 0) + (r[C.pipeline] || 0);
  });

  /* ---------- centroides de pais (para regiones sin ciudad publicada) ----------
     Se calculan aqui, en runtime, desde el GeoJSON que ya carga el dashboard.
     No se persisten: cloud.js nunca contiene una coordenada fabricada. */
  var ISO = (window.__MAPX && window.__MAPX.match) || {};
  var CENTROID = (function () {
    var out = {}, W = window.__WORLD;
    if (!W || !W.features) return out;
    W.features.forEach(function (f) {
      if (!f.id || !f.geometry) return;
      var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
        : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      var best = null, bestA = 0;
      polys.forEach(function (poly) {
        var ring = poly[0]; if (!ring || ring.length < 4) return;
        /* centroide de poligono por la formula del area con signo */
        var a = 0, cx = 0, cy = 0;
        for (var i = 0; i < ring.length - 1; i++) {
          var x0 = ring[i][0], y0 = ring[i][1], x1 = ring[i + 1][0], y1 = ring[i + 1][1];
          var cr = x0 * y1 - x1 * y0;
          a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
        }
        a *= 0.5;
        if (!a) return;
        /* nos quedamos con el poligono MAS GRANDE: asi el centroide de EEUU cae en
           los 48 contiguos y no se lo llevan Alaska/Hawaii, y el de Francia no se
           lo llevan los territorios de ultramar */
        if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cy / (6 * a), cx / (6 * a)]; }
      });
      if (best) out[f.id] = best;
    });
    return out;
  })();

  /* Devuelve donde y con que precision se pinta una region. */
  function placement(r) {
    if (r[I.lat] != null) return { lat: r[I.lat], lon: r[I.lon], kind: r[I.coord_src] };
    var iso = ISO[r[I.market]];
    var c = iso && CENTROID[iso];
    if (c) return { lat: c[0], lon: c[1], kind: 'country' };
    return { lat: null, lon: null, kind: 'none' };
  }

  var fmt = function (v, d) {
    return v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d });
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  /* ---------- nav + seccion ---------- */
  var nav = document.querySelector('nav'); if (!nav) return;
  var btn = document.createElement('button');
  btn.setAttribute('data-tab', 'cloud');
  btn.textContent = '08 · Cloud regions';
  nav.appendChild(btn);
  var sec = document.createElement('section');
  sec.id = 'tab-cloud'; sec.style.display = 'none';
  (document.querySelector('main') || document.body).appendChild(sec);

  var CSPS = Object.keys(K.meta.counts || {}).sort();
  var MKTS = Array.from(new Set(R.rows.map(function (r) { return r[I.market]; }).filter(Boolean))).sort();
  var nogeo = R.rows.filter(function (r) { return r[I.lat] == null; }).length;

  sec.innerHTML =
    '<div class="panel" style="border-left:4px solid var(--accent);margin-bottom:14px">' +
      '<h3>Huella cloud multi-operador — solo fuentes primarias del operador</h3>' +
      '<p style="font-size:12.5px;color:var(--dim);line-height:1.6">' +
      '<b>Operadores:</b> ' + esc(CSPS.join(', ')) + '. <b>Construido:</b> ' + esc(K.meta.built) + '.<br>' +
      Object.keys(K.meta.sources || {}).map(function (k) {
        return '· <b>' + esc(k) + ':</b> ' + esc(K.meta.sources[k]);
      }).join('<br>') + '<br>' +
      (K.meta.caveats || []).map(function (c) { return '· ' + esc(c); }).join('<br>') +
      ((K.meta.missing || []).length ? '<br><b style="color:var(--red)">Sin datos (requiere credenciales o captura HTML):</b> ' +
        esc(K.meta.missing.join(' · ')) : '') +
      '</p></div>' +
    '<div class="kpis" id="clKpis"></div>' +
    '<div class="filters">' +
      '<div><label>Operador</label><select id="clCsp"><option value="">All</option>' +
        CSPS.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Market</label><select id="clMkt"><option value="">All</option>' +
        MKTS.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Coordenada</label><select id="clGeo"><option value="">All</option>' +
        '<option value="operator">Publicada por el operador</option>' +
        '<option value="gazetteer">Centroide de ciudad (derivada)</option>' +
        '<option value="country">Solo centro de pais (ciudad no publicada)</option>' +
        '<option value="none">No situable</option></select></div>' +
      '<div><label>Buscar</label><input type="text" id="clQ" placeholder="madrid, eu-south, spain…"></div>' +
    '</div>' +
    '<div class="panel" style="margin-bottom:14px">' +
      '<h3 id="clMapTitle">Regiones cloud por operador</h3>' +
      '<canvas id="clCanvas" width="1000" height="500" style="display:block;width:100%;background:#f0ece7;' +
        'border:1px solid var(--line);border-radius:4px"></canvas>' +
      '<div id="clTip" style="display:none;position:fixed;z-index:60;background:#fff;border:1px solid var(--line);' +
        'border-radius:3px;padding:6px 9px;font-size:11.5px;font-family:var(--mono);' +
        'box-shadow:0 2px 8px rgba(20,40,60,.18);pointer-events:none;max-width:280px"></div>' +
      '<div id="clLegend" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:10px;' +
        'font-family:var(--mono);font-size:11px;color:var(--dim)"></div>' +
    '</div>' +
    '<div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:14px">' +
      '<div class="panel"><h3>Regiones por operador</h3><div style="height:230px"><canvas id="clC1"></canvas></div></div>' +
      '<div class="panel"><h3>Top 12 mercados por nº de regiones cloud</h3><div style="height:230px"><canvas id="clC2"></canvas></div></div>' +
    '</div>' +
    '<div class="panel" style="margin-bottom:14px">' +
      '<h3 style="display:flex;justify-content:space-between;align-items:center">' +
        '<span id="clTitle"></span><button class="btn" id="clCsv">Export CSV</button></h3>' +
      '<div style="overflow-x:auto"><table id="clTable"><thead><tr>' +
        '<th data-k="csp">Operador</th><th data-k="region_id">Region id</th><th data-k="display">Nombre</th>' +
        '<th data-k="city">Ciudad</th><th data-k="market">Market (BNEF)</th><th data-k="geo_area">Area</th>' +
        '<th data-k="status">Estado</th><th data-k="year_open">Año</th>' +
        '<th data-k="coord_src">Coordenada</th>' +
        '<th class="num" data-k="cfe">CFE %</th><th class="num" data-k="grid_co2">gCO2/kWh</th>' +
        '<th data-k="extra">Extra</th>' +
      '</tr></thead><tbody></tbody></table></div>' +
    '</div>' +
    '<div class="panel" id="clCross"></div>';

  var el = function (id) { return document.getElementById(id); };
  var sortK = null, sortDir = 1, charts = {}, pts = [];

  function rowsOf() {
    var c = el('clCsp').value, m = el('clMkt').value, g = el('clGeo').value;
    var q = el('clQ').value.trim().toLowerCase();
    return R.rows.filter(function (r) {
      if (c && r[I.csp] !== c) return false;
      if (m && r[I.market] !== m) return false;
      if (g && placement(r).kind !== g) return false;
      if (q && [r[I.csp], r[I.region_id], r[I.display], r[I.city], r[I.market]]
        .join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  /* ---------- mapa ---------- */
  function drawMap() {
    var cv = el('clCanvas'); if (!cv) return;
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var W = cv.width, H = cv.height;
    var v = { lon0: -170, lon1: 190, lat0: -58, lat1: 82 };
    var pj = function (lon, lat) {
      return [(lon - v.lon0) / (v.lon1 - v.lon0) * W, (v.lat1 - lat) / (v.lat1 - v.lat0) * H];
    };
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#f0ece7'; ctx.fillRect(0, 0, W, H);
    var WD = window.__WORLD;
    if (WD && WD.features) {
      ctx.fillStyle = LAND; ctx.strokeStyle = LANDLINE; ctx.lineWidth = 0.6;
      WD.features.forEach(function (f) {
        if (!f.geometry) return;
        var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
          : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
        polys.forEach(function (poly) {
          ctx.beginPath();
          poly.forEach(function (ring) {
            ring.forEach(function (p, i) {
              var q = pj(p[0], p[1]);
              if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
            });
            ctx.closePath();
          });
          ctx.fill(); ctx.stroke();
        });
      });
    }
    pts = [];
    var rows = rowsOf(), hidden = 0, nCountry = 0;
    /* jitter determinista: varias regiones comparten el mismo centroide (de ciudad
       o de pais) y se taparian entre si. Es puramente visual; el dato no cambia. */
    var seen = {};
    rows.forEach(function (r) {
      var pl = placement(r);
      if (pl.lat == null) { hidden++; return; }
      if (pl.kind === 'country') nCountry++;
      var key = pl.lat.toFixed(2) + ',' + pl.lon.toFixed(2);
      var n = seen[key] = (seen[key] || 0) + 1;
      var ang = (n - 1) * 2.4, rad = (n - 1) ? 8 : 0;
      var p = pj(pl.lon, pl.lat);
      p[0] += Math.cos(ang) * rad; p[1] += Math.sin(ang) * rad;
      var col = CSP_COLOR[r[I.csp]] || DIM;

      if (pl.kind === 'country') {
        /* ROMBO HUECO: deliberadamente distinto de un punto. No dice "esta aqui",
           dice "esta en este pais y el operador no publica donde". */
        var d = 6;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1] - d); ctx.lineTo(p[0] + d, p[1]);
        ctx.lineTo(p[0], p[1] + d); ctx.lineTo(p[0] - d, p[1]);
        ctx.closePath();
        ctx.fillStyle = col + '26'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.setLineDash([3, 2]);
        ctx.stroke(); ctx.setLineDash([]);
      } else {
        var derived = pl.kind === 'gazetteer';
        ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, 6.2832);
        ctx.fillStyle = derived ? col + '80' : col; ctx.fill();
        ctx.strokeStyle = derived ? col : '#fff';
        ctx.lineWidth = derived ? 1 : 1.3;
        if (derived) ctx.setLineDash([2, 2]);
        ctx.stroke(); ctx.setLineDash([]);
      }
      var PREC = { operator: 'coord publicada por el operador',
                   gazetteer: 'centroide de la ciudad declarada (no es un edificio)',
                   country: 'CIUDAD NO PUBLICADA · marcador en el centro del pais' };
      pts.push({ x: p[0], y: p[1], r: 9,
        t: r[I.csp] + ' · ' + r[I.region_id] + '\n' + (r[I.display] || '') +
           '\n' + (r[I.city] || 'ciudad no publicada') + ' · ' + (r[I.market] || '—') +
           '\n' + PREC[pl.kind] });
    });
    el('clLegend').innerHTML = CSPS.map(function (c) {
      return '<span><b style="color:' + (CSP_COLOR[c] || DIM) + '">●</b> ' + esc(c) + '</span>';
    }).join('') +
      '<span style="margin-left:8px;border-left:1px solid var(--line);padding-left:12px">' +
      '<b>●</b> coord del operador · <b>◌</b> centroide de ciudad · <b>◇</b> centro del pais ' +
      '(<b>' + nCountry + '</b>: el operador no publica la ciudad)</span>' +
      (hidden ? '<span style="color:var(--red)"><b>' + hidden +
        ' sin pais identificable, NO representadas</b></span>' : '');
    el('clMapTitle').textContent = 'Regiones cloud por operador · ' + (rows.length - hidden) +
      ' en el mapa de ' + rows.length + (hidden ? ' · ' + hidden + ' no situables' : '');
  }

  (function () {
    var cv = el('clCanvas'), tip = el('clTip');
    cv.addEventListener('mousemove', function (e) {
      var b = cv.getBoundingClientRect(), sx = cv.width / b.width, sy = cv.height / b.height;
      var mx = (e.clientX - b.left) * sx, my = (e.clientY - b.top) * sy, hit = null, best = 1e9;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my);
        if (d < p.r * p.r && d < best) { best = d; hit = p; }
      }
      if (hit) {
        tip.style.display = 'block'; tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top = (e.clientY + 12) + 'px';
        tip.innerHTML = esc(hit.t).replace(/\n/g, '<br>');
        cv.style.cursor = 'pointer';
      } else { tip.style.display = 'none'; cv.style.cursor = 'default'; }
    });
    cv.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
  })();

  /* ---------- graficas ---------- */
  function mkChart(id, cfg) {
    if (!window.Chart) return;
    if (charts[id]) { try { charts[id].destroy(); } catch (_) {} }
    var cv = el(id); if (!cv) return;
    cfg.options = cfg.options || {};
    cfg.options.responsive = true; cfg.options.maintainAspectRatio = false;
    charts[id] = new window.Chart(cv.getContext('2d'), cfg);
  }

  function drawCharts() {
    var rows = rowsOf();
    var byC = {};
    rows.forEach(function (r) {
      var o = byC[r[I.csp]] || (byC[r[I.csp]] = { geo: 0, ct: 0, no: 0 });
      var k = placement(r).kind;
      if (k === 'none') o.no++; else if (k === 'country') o.ct++; else o.geo++;
    });
    var ks = Object.keys(byC).sort(function (a, b) {
      return (byC[b].geo + byC[b].ct + byC[b].no) - (byC[a].geo + byC[a].ct + byC[a].no);
    });
    mkChart('clC1', {
      type: 'bar',
      data: { labels: ks, datasets: [
        { label: 'Ubicacion (operador o ciudad)', data: ks.map(function (k) { return byC[k].geo; }),
          backgroundColor: ks.map(function (k) { return CSP_COLOR[k] || DIM; }) },
        { label: 'Solo pais', data: ks.map(function (k) { return byC[k].ct; }),
          backgroundColor: '#e0b48a' },
        { label: 'No situable', data: ks.map(function (k) { return byC[k].no; }),
          backgroundColor: '#cfc7bd' }
      ] },
      options: { plugins: { legend: { display: true, position: 'bottom' } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
    });

    var byM = {};
    rows.forEach(function (r) {
      var m = r[I.market]; if (!m) return;
      (byM[m] = byM[m] || { n: 0, csps: {} }).n++;
      byM[m].csps[r[I.csp]] = 1;
    });
    var mk = Object.keys(byM).sort(function (a, b) { return byM[b].n - byM[a].n; }).slice(0, 12);
    mkChart('clC2', {
      type: 'bar',
      data: { labels: mk, datasets: [{ data: mk.map(function (k) { return byM[k].n; }),
        backgroundColor: mk.map(function (k) { return MKT[k] ? '#ee6f2c' : DIM; }) }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false },
        tooltip: { callbacks: { afterLabel: function (c) {
          return Object.keys(byM[c.label].csps).length + ' operador(es)';
        } } } }, scales: { x: { beginAtZero: true } } }
    });
  }

  /* ---------- tabla ---------- */
  function renderTable() {
    var base = rowsOf();
    el('clTitle').textContent = 'Regiones cloud · ' + base.length + ' de ' + R.rows.length;
    var rows = base.slice();
    if (sortK) {
      rows.sort(function (a, b) {
        var x = a[I[sortK]], y = b[I[sortK]];
        if (x == null) x = ''; if (y == null) y = '';
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sortDir;
        return String(x).localeCompare(String(y)) * sortDir;
      });
    }
    sec.querySelector('#clTable tbody').innerHTML = rows.map(function (r) {
      var cs = r[I.coord_src], pk = placement(r).kind;
      return '<tr>' +
        '<td><span class="tag" style="color:' + (CSP_COLOR[r[I.csp]] || DIM) +
          ';border-color:var(--line)">' + esc(r[I.csp]) + '</span></td>' +
        '<td style="font-family:var(--mono);font-size:11px">' + esc(r[I.region_id]) + '</td>' +
        '<td>' + esc(r[I.display] || '—') + '</td>' +
        '<td>' + (r[I.city] ? esc(r[I.city])
          : '<span style="color:var(--dim)">no publicada</span>') + '</td>' +
        '<td>' + (r[I.market] ? (MKT[r[I.market]] ? esc(r[I.market])
          : '<span style="color:var(--red)">' + esc(r[I.market]) + '</span>') : '—') + '</td>' +
        '<td>' + esc(r[I.geo_area] || '—') + '</td>' +
        '<td>' + (r[I.status] === 'announced'
          ? '<span class="tag" style="color:#c85a12;border-color:#ecd9ae">anunciada</span>'
          : '<span class="tag amer">live</span>') + '</td>' +
        '<td>' + esc(r[I.year_open] || '—') + '</td>' +
        '<td style="font-size:11px">' + (cs === 'operator'
          ? '<b style="color:#1e7a3c">operador</b>'
          : cs === 'gazetteer' ? '<span style="color:var(--dim)">centroide ciudad</span>'
          : pk === 'country' ? '<span style="color:#c85a12">centro de pais</span>'
          : '<span style="color:var(--red)">no situable</span>') + '</td>' +
        '<td class="num">' + (r[I.cfe] == null ? '<span style="color:var(--dim)">—</span>'
          : '<b style="color:' + (r[I.cfe] >= 0.8 ? '#1e7a3c' : r[I.cfe] >= 0.5 ? '#c85a12' : '#c0392b') +
            '">' + Math.round(r[I.cfe] * 100) + '%</b>') + '</td>' +
        '<td class="num">' + (r[I.grid_co2] == null ? '<span style="color:var(--dim)">—</span>'
          : fmt(r[I.grid_co2], 0)) + '</td>' +
        '<td style="font-size:11px;color:var(--dim)">' + esc(r[I.extra] || '—') + '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="12" style="color:var(--dim)">Sin resultados.</td></tr>';

    sec.querySelectorAll('#clTable th').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.k;
        if (k === sortK) sortDir = -sortDir; else { sortK = k; sortDir = 1; }
        renderTable();
      });
    });
  }

  /* ---------- cruce por pais ---------- */
  function renderCross() {
    var by = {};
    R.rows.forEach(function (r) {
      var m = r[I.market]; if (!m) return;
      var o = by[m] || (by[m] = { m: m, csps: {}, n: 0 });
      o.n++; o.csps[r[I.csp]] = (o.csps[r[I.csp]] || 0) + 1;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) {
      return ((MKT[b.m] ? MKT[b.m].fut : 0) - (MKT[a.m] ? MKT[a.m].fut : 0)) ||
             (b.n - a.n);
    });
    el('clCross').innerHTML =
      '<h3>Estadisticas por pais — operadores cloud presentes vs tamano del mercado</h3>' +
      '<p style="font-size:11.5px;color:var(--dim);margin-bottom:10px">Columnas de operador: ' +
      'nº de regiones que <b>cada operador declara</b> en ese pais. Columnas BNEF: ' +
      '<b>todo el pais, todos los operadores</b>, incluidos colocation y enterprise. ' +
      'Una region cloud no equivale a un edificio ni a unos MW: no son comparables entre si.</p>' +
      '<div style="overflow-x:auto"><table><thead><tr><th>Market</th>' +
      CSPS.map(function (c) { return '<th class="num">' + esc(c) + '</th>'; }).join('') +
      '<th class="num">Total regiones</th><th class="num">Operadores</th>' +
      '<th class="num">BNEF DCs</th><th class="num">Live MW</th><th class="num">Future MW</th>' +
      '</tr></thead><tbody>' + list.map(function (o) {
        var b = MKT[o.m];
        return '<tr><td>' + (b ? esc(o.m) : '<span style="color:var(--red)">' + esc(o.m) +
            ' (sin match)</span>') + '</td>' +
          CSPS.map(function (c) {
            return '<td class="num">' + (o.csps[c] || '—') + '</td>';
          }).join('') +
          '<td class="num"><b>' + o.n + '</b></td>' +
          '<td class="num">' + Object.keys(o.csps).length + '</td>' +
          '<td class="num">' + (b ? b.n : '—') + '</td>' +
          '<td class="num">' + (b ? fmt(b.live) : '—') + '</td>' +
          '<td class="num" style="color:var(--accent)">' + (b ? fmt(b.fut) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function render() {
    var rows = rowsOf();
    el('clKpis').innerHTML = [
      [rows.length, 'Regiones cloud'],
      [new Set(rows.map(function (r) { return r[I.csp]; })).size, 'Operadores'],
      [new Set(rows.map(function (r) { return r[I.market]; }).filter(Boolean)).size, 'Mercados'],
      [rows.filter(function (r) { return placement(r).kind === 'operator'; }).length, 'Coord. del operador'],
      [rows.filter(function (r) { return placement(r).kind === 'country'; }).length, 'Solo centro de pais'],
      [rows.filter(function (r) { return r[I.status] === 'announced'; }).length, 'Anunciadas (solo Azure)']
    ].map(function (k) {
      return '<div class="kpi"><div class="v">' + k[0] + '</div><div class="l">' + k[1] + '</div></div>';
    }).join('');
    renderTable(); drawMap(); drawCharts(); renderCross();
  }

  ['clCsp', 'clMkt', 'clGeo'].forEach(function (id) { el(id).addEventListener('change', render); });
  el('clQ').addEventListener('input', render);

  el('clCsv').addEventListener('click', function () {
    var lines = [R.cols.join(';')];
    rowsOf().forEach(function (r) {
      lines.push(R.cols.map(function (_, i) {
        var v = r[i]; if (v == null) return '';
        var s = String(v);
        return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';'));
    });
    var st = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = st + '_DC_CloudRegions.csv'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  /* ---------- pestanas ---------- */
  var CORE = ['companies', 'search', 'stats', 'ramp', 'map', 'ann'];
  document.querySelectorAll('nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.tab !== 'cloud') { sec.style.display = 'none'; return; }
      document.querySelectorAll('nav button').forEach(function (o) { o.classList.remove('on'); });
      b.classList.add('on');
      CORE.forEach(function (t) { var e = document.getElementById('tab-' + t); if (e) e.style.display = 'none'; });
      var az = document.getElementById('tab-azure'); if (az) az.style.display = 'none';
      sec.style.display = '';
      requestAnimationFrame(function () { requestAnimationFrame(render); });
    });
  });

  /* ---------- impresion ---------- */
  var _orig = window.printCurrentTab;
  window.printCurrentTab = function () {
    if (sec.style.display === 'none' && typeof _orig === 'function') return _orig.apply(this, arguments);
    var tip = el('clTip'); if (tip) tip.style.display = 'none';
    document.querySelectorAll('section.print-active').forEach(function (e) { e.classList.remove('print-active'); });
    sec.classList.add('print-active');
    if (typeof window.populatePrintHeader === 'function') window.populatePrintHeader('08 · Cloud regions');
    try {
      if (typeof window.dcSetPrintTitle === 'function' && typeof window.dcStamp === 'function') {
        window.dcSetPrintTitle(window.dcStamp() + '_DC_CloudRegions');
      }
    } catch (_) {}
    document.body.classList.add('print-tab');
    setTimeout(function () {
      try { Object.keys(charts).forEach(function (k) { charts[k].resize(); }); } catch (_) {}
      drawMap(); window.print();
    }, 300);
    setTimeout(function () {
      document.body.classList.remove('print-tab');
      sec.classList.remove('print-active');
      if (typeof window.dcRestoreTitle === 'function') window.dcRestoreTitle();
    }, 1000);
  };

  console.info('[cloud_layer] OK · ' + R.rows.length + ' regiones · ' + CSPS.length +
    ' operadores (' + CSPS.join(', ') + ') · ' + Object.keys(CENTROID).length +
    ' centroides de pais calculados · construido ' + K.meta.built);
})();
