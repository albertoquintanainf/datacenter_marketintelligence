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
    console.info('[cloud_layer] window.__CLOUD not found - Cloud regions tab disabled.');
    return;
  }

  var D = window.__DATA, K = window.__CLOUD;
  var C = {}; D.cols.forEach(function (c, i) { C[c] = i; });
  var R = K.regions, I = {}; R.cols.forEach(function (c, i) { I[c] = i; });
  var ON = (K.onramps && K.onramps.rows.length) ? K.onramps : null;
  var OI = {}; if (ON) K.onramps.cols.forEach(function (c, i) { OI[c] = i; });

  var CSP_COLOR = { Oracle: '#c0392b', Azure: '#2b5fa8', AWS: '#ee6f2c', Google: '#1e7a3c',
                    Alibaba: '#7c756e', Tencent: '#e39a5c', IBM: '#0e7c86', Huawei: '#8e5fa8' };
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
  /* ---------- normalizacion de mercado ---------------------------------------
     cloud.js nombra dos paises distinto que BNEF y que __MAPX.match. Sin alias,
     esas regiones ni se situaban en el mapa (no se resolvia el ISO3) ni cruzaban
     contra BNEF (salian en rojo como "no match", 13 filas). Es correccion de
     nomenclatura, no un dato nuevo: el pais ya venia en el fichero. */
  var MKT_ALIAS = { 'UAE': 'United Arab Emirates', 'China': 'Mainland China' };

  /* Mercado asignado a mano para regiones que la fuente dejo sin pais.
     ATENCION, esto SI es una inferencia, no un dato publicado por el operador:
     eu-dcc-rating-1/-2 traen market=null y city="Rating"; los codigos de region
     de Oracle para esas dos son 'dus' y 'dtm' (Dusseldorf y Dortmund), de donde
     se deduce Ratingen, Alemania. Anadido a peticion expresa. Si aparece el dato
     real en una captura posterior, esta tabla debe desaparecer. */
  var MKT_OVERRIDE = { 'eu-dcc-rating-1': 'Germany', 'eu-dcc-rating-2': 'Germany' };

  function mkt(r) {
    var m = MKT_OVERRIDE[r[I.region_id]] || r[I.market];
    return m ? (MKT_ALIAS[m] || m) : null;
  }

  /* __MAPX.match no trae estos tres: son ciudad-estado o micro-estado y el
     GeoJSON de 179 paises tampoco los incluye. Sin la equivalencia nombre->ISO3
     no se llega siquiera al centroide de reserva de mas abajo. */
  var ISO_EXTRA = { 'Bahrain': 'BHR', 'Hong Kong': 'HKG', 'Singapore': 'SGP' };
  var ISO = Object.assign({}, ISO_EXTRA, (window.__MAPX && window.__MAPX.match) || {});
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
    /* El GeoJSON de data.js trae 179 paises y se deja fuera varios micro-estados
       y territorios, entre ellos los tres que aqui hacen falta. Sin esto, una
       region en Bahrein no se puede situar aunque el pais se conozca. Centroides
       aproximados del territorio, NO ubicaciones de instalacion. */
    var FALLBACK = { BHR: [26.03, 50.55], HKG: [22.35, 114.13], SGP: [1.35, 103.82] };
    Object.keys(FALLBACK).forEach(function (k) { if (!out[k]) out[k] = FALLBACK[k]; });
    return out;
  })();

  /* ---------- clase de region ------------------------------------------------
     Cuatro valores: commercial / government / sovereign / dedicated.

     Oracle: se deriva del realm que viene en `extra` (realm=ocNN). Mapeo
     verificado contra la documentacion de Oracle (docs.oracle.com, "Resource
     Identifiers": oc1 comercial, oc2 Government Cloud, oc3 Federal Government
     Cloud) y contra Region.java del oci-java-sdk, que asigna region a realm una
     por una y da el dominio de cada realm:
       oc1  oraclecloud.com      -> comercial
       oc2  oraclegovcloud.com   -> gobierno (US)
       oc3  oraclegovcloud.com   -> gobierno (US federal)
       oc4  oraclegovcloud.uk    -> gobierno (UK)
       oc19 oraclecloud.eu       -> soberana (EU Sovereign Cloud)
     El resto de realms (oc8, oc9, oc10, oc14, oc15, oc20, oc21, oc23, oc24,
     oc26, oc29, oc35, oc42, oc51, oc52) tienen dominio propio y aislado, y
     Oracle NO publica en el SDK para que sirve cada uno. Se etiquetan como
     'dedicated' por su estructura de realm aislado, sin afirmar quien los opera.

     Azure: las cinco regiones de China traen en `extra` el texto de
     data_residency del propio Microsoft, que las describe como oferta soberana
     con red independiente y dedicada. El resto no trae ningun campo de clase.

     AWS y Google: la captura solo contiene regiones de la particion estandar,
     luego todas son comerciales. OJO: no hay ni una sola region gov o soberana
     de AWS, Azure o Google en el dataset (faltan GovCloud, AWS China, Azure
     Government). Los recuentos de gobierno/soberana son un suelo, no un total.
     Ese aviso se pinta bajo el mapa; no lo quites sin sustituirlo. */
  var OCI_REALM = { oc1: 'commercial', oc2: 'government', oc3: 'government',
                    oc4: 'government', oc19: 'sovereign' };

  function regionClass(r) {
    var ex = String(r[I.extra] || '');
    if (r[I.csp] === 'Oracle') {
      var m = /realm=(\w+)/.exec(ex);
      var k = m && OCI_REALM[m[1]];
      return k || 'dedicated';
    }
    if (/sovereign/i.test(ex)) return 'sovereign';
    return 'commercial';
  }

  var CLASS_LABEL = { commercial: 'Commercial', government: 'Government',
                      sovereign: 'Sovereign', dedicated: 'Dedicated' };
  var CLASS_KEYS = ['commercial', 'government', 'sovereign', 'dedicated'];

  /* Devuelve donde y con que precision se pinta una region. */
  function placement(r) {
    if (r[I.lat] != null) return { lat: r[I.lat], lon: r[I.lon], kind: r[I.coord_src] };
    var iso = ISO[mkt(r)];
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

  /* Encuadres del mapa. La proyeccion es equirectangular simple, asi que cada
     vista se ajusta despues a la relacion 2:1 del canvas (fitView) para que los
     continentes no salgan estirados. */
  var MAP_VIEWS = {
    World:            { lon0: -170, lon1: 190, lat0: -58, lat1: 82 },
    Europe:           { lon0: -12,  lon1: 42,  lat0: 34,  lat1: 71 },
    'North America':  { lon0: -168, lon1: -52, lat0: 14,  lat1: 72 },
    'Latin America':  { lon0: -118, lon1: -34, lat0: -56, lat1: 33 },
    'Asia-Pacific':   { lon0: 60,   lon1: 180, lat0: -48, lat1: 55 },
    'Middle East':    { lon0: 24,   lon1: 65,  lat0: 12,  lat1: 43 },
    Africa:           { lon0: -20,  lon1: 54,  lat0: -36, lat1: 38 }
  };
  var mapView = 'World';

  /* Expande el lado corto hasta cuadrar con el aspecto del canvas. */
  function fitView(v, W, H) {
    var lon0 = v.lon0, lon1 = v.lon1, lat0 = v.lat0, lat1 = v.lat1;
    var want = W / H, have = (lon1 - lon0) / (lat1 - lat0);
    if (have < want) {
      var addLon = ((lat1 - lat0) * want - (lon1 - lon0)) / 2;
      lon0 -= addLon; lon1 += addLon;
    } else if (have > want) {
      var addLat = ((lon1 - lon0) / want - (lat1 - lat0)) / 2;
      lat0 -= addLat; lat1 += addLat;
    }
    return { lon0: lon0, lon1: lon1, lat0: lat0, lat1: lat1 };
  }

  var CSPS = Object.keys(K.meta.counts || {}).sort();
  var MKTS = Array.from(new Set(R.rows.map(mkt).filter(Boolean))).sort();
  var nogeo = R.rows.filter(function (r) { return r[I.lat] == null; }).length;

  sec.innerHTML =
    '<div class="kpis" id="clKpis"></div>' +
    '<div class="filters">' +
      '<div><label>Operator</label><select id="clCsp"><option value="">All</option>' +
        CSPS.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Market</label><select id="clMkt"><option value="">All</option>' +
        MKTS.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Class</label><select id="clClass"><option value="">All</option>' +
        CLASS_KEYS.map(function (k) {
          return '<option value="' + k + '">' + CLASS_LABEL[k] + '</option>';
        }).join('') + '</select></div>' +
      '<div><label>Search</label><input type="text" id="clQ" placeholder="madrid, eu-south, spain…"></div>' +
    '</div>' +
    '<div class="panel" style="margin-bottom:14px">' +
      '<h3 style="display:flex;justify-content:space-between;align-items:center;gap:12px">' +
        '<span id="clMapTitle">Cloud regions by operator</span>' +
        '<select id="clMapView" style="font-family:inherit;font-size:12px;padding:3px 6px;' +
          'border:1px solid var(--line);border-radius:3px">' +
          Object.keys(MAP_VIEWS).map(function (k) {
            return '<option value="' + k + '">' + k + '</option>';
          }).join('') + '</select></h3>' +
      '<canvas id="clCanvas" width="1000" height="500" style="display:block;width:100%;background:#f0ece7;' +
        'border:1px solid var(--line);border-radius:4px"></canvas>' +
      '<div id="clTip" style="display:none;position:fixed;z-index:60;background:#fff;border:1px solid var(--line);' +
        'border-radius:3px;padding:6px 9px;font-size:11.5px;font-family:var(--mono);' +
        'box-shadow:0 2px 8px rgba(20,40,60,.18);pointer-events:none;max-width:280px"></div>' +
      '<div id="clLegend" style="margin-top:12px;padding:10px 12px;border:1px solid var(--line);' +
        'border-radius:4px;background:#faf8f5;font-size:12.5px;line-height:1.9"></div>' +
      '<p style="font-size:11.5px;color:var(--dim);margin:10px 0 0">Region class is derived from each ' +
        'operator&rsquo;s own metadata: Oracle from its realm (oc1 commercial; oc2, oc3 and oc4 government; ' +
        'oc19 EU Sovereign Cloud; every other realm is an isolated realm, shown as dedicated), Azure from ' +
        'its published data-residency statement. <b>The capture contains no government or sovereign region ' +
        'for AWS, Azure or Google</b> — AWS GovCloud, AWS China and Azure Government are absent from the ' +
        'source. Treat the government and sovereign counts as a floor, not a total.</p>' +
    '</div>' +
    '<div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:14px">' +
      '<div class="panel"><h3>Region class by operator</h3><div style="height:230px"><canvas id="clC1"></canvas></div></div>' +
      '<div class="panel"><h3>Top 12 markets by number of cloud regions</h3><div style="height:230px"><canvas id="clC2"></canvas></div></div>' +
    '</div>' +
    '<div class="panel" style="margin-bottom:14px">' +
      '<h3 style="display:flex;justify-content:space-between;align-items:center">' +
        '<span id="clTitle"></span><button class="btn" id="clCsv">Export CSV</button></h3>' +
      '<div style="overflow-x:auto"><table id="clTable"><thead><tr>' +
        '<th data-k="csp">Operator</th><th data-k="region_id">Region id</th><th data-k="display">Name</th>' +
        '<th data-k="city">City</th><th data-k="market">Market (BNEF)</th><th data-k="geo_area">Area</th>' +
        '<th data-k="status">Status</th><th data-k="year_open">Year</th>' +
        '<th data-k="_class">Class</th>' +
        '<th class="num" data-k="cfe">CFE %</th><th class="num" data-k="grid_co2">gCO2/kWh</th>' +
        '<th data-k="extra">Extra</th>' +
      '</tr></thead><tbody></tbody></table></div>' +
    '</div>' +
    '<div class="panel" id="clCross"></div>';

  var el = function (id) { return document.getElementById(id); };
  var sortK = null, sortDir = 1, charts = {}, pts = [];

  function rowsOf() {
    var c = el('clCsp').value, m = el('clMkt').value, cl = el('clClass').value;
    var q = el('clQ').value.trim().toLowerCase();
    return R.rows.filter(function (r) {
      if (c && r[I.csp] !== c) return false;
      if (m && mkt(r) !== m) return false;
      if (cl && regionClass(r) !== cl) return false;
      if (q && [r[I.csp], r[I.region_id], r[I.display], r[I.city], mkt(r)]
        .join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  /* ---------- mapa ---------- */
  function drawMap() {
    var cv = el('clCanvas'); if (!cv) return;
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var W = cv.width, H = cv.height;
    var v = fitView(MAP_VIEWS[mapView] || MAP_VIEWS.World, W, H);
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
    var rows = rowsOf(), hidden = 0, nCountry = 0, offview = 0;
    /* jitter determinista: varias regiones comparten el mismo centroide (de ciudad
       o de pais) y se taparian entre si. Es puramente visual; el dato no cambia. */
    var seen = {};
    rows.forEach(function (r) {
      var pl = placement(r);
      if (pl.lat == null) { hidden++; return; }
      var key = pl.lat.toFixed(2) + ',' + pl.lon.toFixed(2);
      var n = seen[key] = (seen[key] || 0) + 1;
      var ang = (n - 1) * 2.4, rad = (n - 1) ? 8 : 0;
      var p = pj(pl.lon, pl.lat);
      p[0] += Math.cos(ang) * rad; p[1] += Math.sin(ang) * rad;
      if (p[0] < -12 || p[0] > W + 12 || p[1] < -12 || p[1] > H + 12) { offview++; return; }
      var col = CSP_COLOR[r[I.csp]] || DIM;

      var cls = regionClass(r), approx = pl.kind === 'country', d = 5.5;
      ctx.beginPath();
      if (cls === 'government') {            /* cuadrado */
        ctx.rect(p[0] - d, p[1] - d, d * 2, d * 2);
      } else if (cls === 'sovereign') {      /* triangulo */
        ctx.moveTo(p[0], p[1] - d - 1);
        ctx.lineTo(p[0] + d + 1, p[1] + d);
        ctx.lineTo(p[0] - d - 1, p[1] + d);
        ctx.closePath();
      } else if (cls === 'dedicated') {      /* rombo */
        ctx.moveTo(p[0], p[1] - d - 1); ctx.lineTo(p[0] + d + 1, p[1]);
        ctx.lineTo(p[0], p[1] + d + 1); ctx.lineTo(p[0] - d - 1, p[1]);
        ctx.closePath();
      } else {                               /* circulo */
        ctx.arc(p[0], p[1], d, 0, 6.2832);
      }
      /* Todos los marcadores se pintan igual: la forma codifica la clase y el
         color el operador. La distincion visual por precision de coordenada se
         retiro a peticion del usuario; el aviso sigue en el tooltip. */
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3; ctx.stroke();
      if (approx) nCountry++;
      pts.push({ x: p[0], y: p[1], r: 9,
        t: r[I.csp] + ' · ' + r[I.region_id] + '\n' + (r[I.display] || '') +
           '\n' + (r[I.city] || 'city not published') + ' · ' + (mkt(r) || '—') +
           '\n' + CLASS_LABEL[cls] + (approx ? '\napproximate position' : '') });
    });
    var lgRow = function (label, items) {
      return '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">' +
        '<span style="min-width:74px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;' +
          'color:var(--dim)">' + label + '</span>' + items + '</div>';
    };
    var byCsp = {};
    rows.forEach(function (r) { byCsp[r[I.csp]] = (byCsp[r[I.csp]] || 0) + 1; });
    el('clLegend').innerHTML =
      lgRow('Operator', CSPS.map(function (c) {
        return '<span><b style="color:' + (CSP_COLOR[c] || DIM) + ';font-size:17px;' +
          'vertical-align:-2px">●</b> <b>' + esc(c) + '</b> ' +
          '<span style="color:var(--dim)">' + (byCsp[c] || 0) + '</span></span>';
      }).join('')) +
      lgRow('Class', '<span><b style="font-size:16px">●</b> Commercial</span>' +
        '<span><b style="font-size:15px">■</b> Government</span>' +
        '<span><b style="font-size:15px">▲</b> Sovereign</span>' +
        '<span><b style="font-size:15px">◆</b> Dedicated</span>') +
      ((offview || hidden || nCountry) ? lgRow('Notes',
        (nCountry ? '<span style="color:var(--dim)">' + nCountry +
          ' placed at country centre, city not published — hover for detail</span>' : '') +
        (offview ? '<span style="color:var(--dim)">' + offview + ' outside this view</span>' : '') +
        (hidden ? '<span style="color:var(--red)"><b>' + hidden +
          ' with no identifiable country, not plotted</b></span>' : '')) : '');
    el('clMapTitle').textContent = 'Cloud regions by operator · ' +
      (rows.length - hidden - offview) + ' of ' + rows.length + ' on the map' +
      (offview ? ' · ' + offview + ' outside this view' : '') +
      (hidden ? ' · ' + hidden + ' not locatable' : '');
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
      var o = byC[r[I.csp]] || (byC[r[I.csp]] = { commercial: 0, government: 0, sovereign: 0, dedicated: 0 });
      o[regionClass(r)]++;
    });
    var tot = function (k) {
      return byC[k].commercial + byC[k].government + byC[k].sovereign + byC[k].dedicated;
    };
    var ks = Object.keys(byC).sort(function (a, b) { return tot(b) - tot(a); });
    var CLASS_FILL = { commercial: '#cfc7bd', government: '#6b4c9a',
                       sovereign: '#c85a12', dedicated: '#0e7c86' };
    mkChart('clC1', {
      type: 'bar',
      data: { labels: ks, datasets: CLASS_KEYS.map(function (ck) {
        return { label: CLASS_LABEL[ck],
                 data: ks.map(function (k) { return byC[k][ck]; }),
                 backgroundColor: CLASS_FILL[ck] };
      }) },
      options: { plugins: { legend: { display: true, position: 'bottom' } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
    });

    var byM = {};
    rows.forEach(function (r) {
      var m = mkt(r); if (!m) return;
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
          return Object.keys(byM[c.label].csps).length + ' operator(s)';
        } } } }, scales: { x: { beginAtZero: true } } }
    });
  }

  /* ---------- tabla ---------- */
  function renderTable() {
    var base = rowsOf();
    el('clTitle').textContent = 'Cloud regions · ' + base.length + ' of ' + R.rows.length;
    var rows = base.slice();
    if (sortK) {
      rows.sort(function (a, b) {
        var x = sortK === '_class' ? CLASS_LABEL[regionClass(a)] : a[I[sortK]];
        var y = sortK === '_class' ? CLASS_LABEL[regionClass(b)] : b[I[sortK]];
        if (x == null) x = ''; if (y == null) y = '';
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sortDir;
        return String(x).localeCompare(String(y)) * sortDir;
      });
    }
    sec.querySelector('#clTable tbody').innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td><span class="tag" style="color:' + (CSP_COLOR[r[I.csp]] || DIM) +
          ';border-color:var(--line)">' + esc(r[I.csp]) + '</span></td>' +
        '<td style="font-family:var(--mono);font-size:11px">' + esc(r[I.region_id]) + '</td>' +
        '<td>' + esc(r[I.display] || '—') + '</td>' +
        '<td>' + (r[I.city] ? esc(r[I.city])
          : '<span style="color:var(--dim)">not published</span>') + '</td>' +
        '<td>' + (mkt(r) ? (MKT[mkt(r)] ? esc(mkt(r))
          : '<span style="color:var(--red)">' + esc(mkt(r)) + '</span>') : '—') + '</td>' +
        '<td>' + esc(r[I.geo_area] || '—') + '</td>' +
        '<td>' + (r[I.status] === 'announced'
          ? '<span class="tag" style="color:#c85a12;border-color:#ecd9ae">announced</span>'
          : '<span class="tag amer">live</span>') + '</td>' +
        '<td>' + esc(r[I.year_open] || '—') + '</td>' +
        '<td style="font-size:11px">' + (function () {
          var k = regionClass(r);
          var col = k === 'government' ? '#6b4c9a' : k === 'sovereign' ? '#c85a12'
                  : k === 'dedicated' ? '#0e7c86' : 'var(--dim)';
          return '<span style="color:' + col + '">' + CLASS_LABEL[k] + '</span>';
        })() + '</td>' +
        '<td class="num">' + (r[I.cfe] == null ? '<span style="color:var(--dim)">—</span>'
          : '<b style="color:' + (r[I.cfe] >= 0.8 ? '#1e7a3c' : r[I.cfe] >= 0.5 ? '#c85a12' : '#c0392b') +
            '">' + Math.round(r[I.cfe] * 100) + '%</b>') + '</td>' +
        '<td class="num">' + (r[I.grid_co2] == null ? '<span style="color:var(--dim)">—</span>'
          : fmt(r[I.grid_co2], 0)) + '</td>' +
        '<td style="font-size:11px;color:var(--dim)">' + esc(r[I.extra] || '—') + '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="12" style="color:var(--dim)">No results.</td></tr>';

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
      var m = mkt(r); if (!m) return;
      var o = by[m] || (by[m] = { m: m, csps: {}, n: 0 });
      o.n++; o.csps[r[I.csp]] = (o.csps[r[I.csp]] || 0) + 1;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) {
      return ((MKT[b.m] ? MKT[b.m].fut : 0) - (MKT[a.m] ? MKT[a.m].fut : 0)) ||
             (b.n - a.n);
    });
    el('clCross').innerHTML =
      '<h3>Country statistics — cloud operators present vs market size</h3>' +
      '<p style="font-size:11.5px;color:var(--dim);margin-bottom:10px">Operator columns: ' +
      'number of regions <b>each operator declares</b> in that country. BNEF columns: ' +
      '<b>the whole country, all operators</b>, including colocation and enterprise. ' +
      'A cloud region is not equivalent to a building or to a given number of MW: they are not comparable.</p>' +
      '<div style="overflow-x:auto"><table><thead><tr><th>Market</th>' +
      CSPS.map(function (c) { return '<th class="num">' + esc(c) + '</th>'; }).join('') +
      '<th class="num">Total regions</th><th class="num">Operators</th>' +
      '<th class="num">BNEF DCs</th><th class="num">Live MW</th><th class="num">Future MW</th>' +
      '</tr></thead><tbody>' + list.map(function (o) {
        var b = MKT[o.m];
        return '<tr><td>' + (b ? esc(o.m) : '<span style="color:var(--red)">' + esc(o.m) +
            ' (no match)</span>') + '</td>' +
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
      [rows.length, 'Cloud regions'],
      [new Set(rows.map(function (r) { return r[I.csp]; })).size, 'Operators'],
      [new Set(rows.map(mkt).filter(Boolean)).size, 'Markets'],
      [rows.filter(function (r) { return regionClass(r) === 'government'; }).length, 'Government'],
      [rows.filter(function (r) { return regionClass(r) === 'sovereign'; }).length, 'Sovereign'],
      [rows.filter(function (r) { return regionClass(r) === 'dedicated'; }).length, 'Dedicated']
    ].map(function (k) {
      return '<div class="kpi"><div class="v">' + k[0] + '</div><div class="l">' + k[1] + '</div></div>';
    }).join('');
    renderTable(); drawMap(); drawCharts(); renderCross();
  }

  ['clCsp', 'clMkt', 'clClass'].forEach(function (id) { el(id).addEventListener('change', render); });
  el('clQ').addEventListener('input', render);
  el('clMapView').addEventListener('change', function () { mapView = this.value; drawMap(); });

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

  console.info('[cloud_layer] OK · ' + R.rows.length + ' regions · ' + CSPS.length +
    ' operators (' + CSPS.join(', ') + ') · ' + Object.keys(CENTROID).length +
    ' country centroids computed · built ' + K.meta.built);
})();
