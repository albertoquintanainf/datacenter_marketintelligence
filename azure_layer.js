/* =============================================================================
   azure_layer.js · HECE DC Intelligence — pestana "08 · Azure detail" (add-on v3)
   -----------------------------------------------------------------------------
   Add-on AUTOCONTENIDO. No modifica el codigo existente del dashboard.
   Dependencias, todas ya presentes en index.html:
     window.__DATA  (BNEF/DCByte, data.js)
     window.__AZURE (captura del globo de Microsoft, azure.js)
     window.__WORLD (GeoJSON de paises, data.js)   -> mapa
     window.Chart   (Chart.js embebido)            -> graficas

   Instalacion (2 lineas antes de </body>, tras el <script> principal):
       <script src="azure.js"></script>
       <script src="azure_layer.js"></script>

   Vistas: Regions · Renewable PPAs · Network PoPs
   Cada vista: KPIs + mapa + 2 graficas + tabla. Mas tabla de cruce por pais.

   >>> AVISO CRITICO SOBRE LOS MW <<<
   ppa.mw = capacidad de GENERACION renovable contratada por Microsoft via PPA.
   NO es IT load de datacenter. NO sumar ni comparar con los MW de BNEF/DCByte
   de las pestanas 02-06. Son magnitudes fisicas distintas.
   ========================================================================== */
(function () {
  'use strict';

  if (typeof window.__DATA === 'undefined') return;
  if (typeof window.__AZURE === 'undefined') {
    console.info('[azure_layer] window.__AZURE not found - Microsoft Azure tab disabled.');
    return;
  }

  var D = window.__DATA, A = window.__AZURE;
  var C = {}; D.cols.forEach(function (c, i) { C[c] = i; });
  function idx(t) { var o = {}; t.cols.forEach(function (c, i) { o[c] = i; }); return o; }
  var REG = A.regions, RI = idx(REG);
  var PPA = A.ppa, PI = idx(PPA);
  var POP = A.pops, OI = idx(POP);

  /* ---------- paleta (la del dashboard) ---------- */
  var ACCENT = '#ee6f2c', AMBER = '#c85a12', TEAL = '#0e7c86', DIM = '#7c756e',
      LAND = '#eae4dd', LANDLINE = '#d6cec4', NAVY = '#3a3a3c';
  var TECH_COLOR = { solar: '#ef9f27', wind: TEAL, mixed: DIM };

  var EU_MKT = ['Spain', 'UK', 'Ireland', 'Germany', 'France', 'Netherlands', 'Sweden', 'Norway',
                'Denmark', 'Finland', 'Italy', 'Poland', 'Switzerland', 'Belgium', 'Austria',
                'Greece', 'Portugal', 'Czech Republic', 'Hungary', 'Romania'];
  var isEU = function (m) { return EU_MKT.indexOf(m) >= 0; };

  /* azure.js nombra dos paises distinto que BNEF; sin alias salian en rojo como
     "no match" en la tabla de cruce, con guiones en DCs y MW aunque BNEF si
     tiene esos mercados. Correccion de nomenclatura, no dato nuevo. */
  var MKT_ALIAS = { 'UAE': 'United Arab Emirates', 'China': 'Mainland China' };
  var mkt = function (m) { return m ? (MKT_ALIAS[m] || m) : m; };

  /* ---------- agregado BNEF por market ---------- */
  var MKT = {};
  D.rows.forEach(function (r) {
    var m = r[C.market]; if (!m) return;
    var o = MKT[m] || (MKT[m] = { n: 0, live: 0, fut: 0 });
    o.n++; o.live += (r[C.live] || 0); o.fut += (r[C.uc] || 0) + (r[C.pipeline] || 0);
  });
  var NOMATCH = Array.from(new Set(REG.rows.map(function (r) { return mkt(r[RI.market]); })
    .filter(function (m) { return m && !MKT[m]; })));

  var fmt = function (v, d) {
    return v == null ? '—' : v.toLocaleString('en-US',
      { maximumFractionDigits: d == null ? 1 : d, minimumFractionDigits: 0 });
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var link = function (u, t) {
    return u && /^https?:\/\//.test(u)
      ? '<a href="' + esc(u) + '" target="_blank" rel="noopener" style="color:var(--accent)">' + t + '</a>'
      : '<span style="color:var(--dim)">—</span>';
  };

  /* ---------- nav + seccion ---------- */
  var nav = document.querySelector('nav'); if (!nav) return;
  var btn = document.createElement('button');
  btn.setAttribute('data-tab', 'azure');
  btn.textContent = '08 · Azure detail';
  nav.appendChild(btn);

  var sec = document.createElement('section');
  sec.id = 'tab-azure'; sec.style.display = 'none';
  (document.querySelector('main') || document.body).appendChild(sec);

  var CONTS = Array.from(new Set(REG.rows.map(function (r) { return r[RI.continent]; }).filter(Boolean))).sort();
  var TECHS = Array.from(new Set(PPA.rows.map(function (r) { return r[PI.tech]; }).filter(Boolean))).sort();
  var FYS = Array.from(new Set(PPA.rows.map(function (r) { return r[PI.fy]; }).filter(Boolean))).sort();

  var MAP_VIEWS = {
    World:            { lon0: -170, lon1: 190, lat0: -58, lat1: 82 },
    Europe:           { lon0: -12,  lon1: 42,  lat0: 34,  lat1: 71 },
    'North America':  { lon0: -168, lon1: -52, lat0: 14,  lat1: 72 },
    'Latin America':  { lon0: -118, lon1: -34, lat0: -56, lat1: 33 },
    'Asia-Pacific':   { lon0: 60,   lon1: 180, lat0: -48, lat1: 55 },
    'Middle East':    { lon0: 24,   lon1: 65,  lat0: 12,  lat1: 43 },
    Africa:           { lon0: -20,  lon1: 54,  lat0: -36, lat1: 38 }
  };

  /* La proyeccion es equirectangular simple: si el encuadre no tiene la misma
     relacion que el canvas, el continente sale estirado. Se ensancha el lado
     corto hasta cuadrar. Efecto lateral: las vistas altas y estrechas muestran
     contexto de mas alrededor. */
  function fitView(v, W, H) {
    var lon0 = v.lon0, lon1 = v.lon1, lat0 = v.lat0, lat1 = v.lat1;
    var want = W / H, have = (lon1 - lon0) / (lat1 - lat0);
    if (have < want) {
      var dLon = ((lat1 - lat0) * want - (lon1 - lon0)) / 2;
      lon0 -= dLon; lon1 += dLon;
    } else if (have > want) {
      var dLat = ((lon1 - lon0) / want - (lat1 - lat0)) / 2;
      lat0 -= dLat; lat1 += dLat;
    }
    return { lon0: lon0, lon1: lon1, lat0: lat0, lat1: lat1 };
  }

  sec.innerHTML =
    '<div class="toolbar"><div class="tb-group"><span class="tb-label">Azure view</span>' +
      '<button class="btn primary" data-v="reg">Regions</button>' +
      '<button class="btn" data-v="ppa">Renewable PPAs</button>' +
      '<button class="btn" data-v="pop">Network PoPs</button></div>' +
      '<div class="tb-group"><span class="tb-label">Map</span>' +
      '<select id="azMapView" style="font-family:inherit;font-size:12px;padding:4px 6px;' +
        'border:1px solid var(--line);border-radius:3px">' +
        Object.keys(MAP_VIEWS).map(function (k) {
          return '<option value="' + k + '">' + k + '</option>';
        }).join('') + '</select></div>' +
      '<div class="tb-group" style="margin-left:auto"><button class="btn" id="azCsv">Export CSV</button></div>' +
    '</div>' +
    '<div class="kpis" id="azKpis"></div>' +
    '<div class="panel" style="margin-bottom:14px">' +
      '<h3 id="azMapTitle">Microsoft Azure — map</h3>' +
      '<canvas id="azCanvas" width="1000" height="500" style="display:block;width:100%;background:#f0ece7;' +
        'border:1px solid var(--line);border-radius:4px"></canvas>' +
      '<div id="azTip" style="display:none;position:fixed;z-index:60;background:#fff;border:1px solid var(--line);' +
        'border-radius:3px;padding:6px 9px;font-size:11.5px;font-family:var(--mono);box-shadow:0 2px 8px rgba(20,40,60,.18);' +
        'pointer-events:none;max-width:280px"></div>' +
      '<div id="azLegend" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:10px;' +
        'font-family:var(--mono);font-size:11px;color:var(--dim)"></div>' +
    '</div>' +
    '<div class="grid" id="azCharts" style="grid-template-columns:1fr 1fr;margin-bottom:14px">' +
      '<div class="panel"><h3 id="azC1Title"></h3><div style="height:230px"><canvas id="azC1"></canvas></div></div>' +
      '<div class="panel"><h3 id="azC2Title"></h3><div style="height:230px"><canvas id="azC2"></canvas></div></div>' +
    '</div>' +
    '<div class="filters" id="azFilters"></div>' +
    '<div class="panel" style="margin-bottom:14px">' +
      '<h3 id="azTitle"></h3><div id="azWarn"></div>' +
      '<div style="overflow-x:auto"><table id="azTable"><thead></thead><tbody></tbody></table></div>' +
    '</div>' +
    '<div class="panel" id="azCross"></div>';

  var el = function (id) { return document.getElementById(id); };
  var view = 'reg', mapView = 'World', sortK = null, sortDir = 1;
  var charts = {}, mapPts = [];

  /* =========================================================================
     MAPA (canvas propio, autocontenido: solo usa window.__WORLD)
     ====================================================================== */

  function drawMap() {
    var cv = el('azCanvas'); if (!cv) return;
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var W = cv.width, H = cv.height;
    var v = fitView(MAP_VIEWS[mapView] || MAP_VIEWS.World, W, H);
    var offview = 0;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f0ece7'; ctx.fillRect(0, 0, W, H);

    var pj = function (lon, lat) {
      return [(lon - v.lon0) / (v.lon1 - v.lon0) * W, (v.lat1 - lat) / (v.lat1 - v.lat0) * H];
    };

    /* paises */
    var WORLD = window.__WORLD;
    if (WORLD && WORLD.features) {
      ctx.fillStyle = LAND; ctx.strokeStyle = LANDLINE; ctx.lineWidth = 0.6;
      WORLD.features.forEach(function (f) {
        if (!f.geometry) return;
        var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
          : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
        polys.forEach(function (poly) {
          ctx.beginPath();
          poly.forEach(function (ring) {
            ring.forEach(function (pt, i) {
              var p = pj(pt[0], pt[1]);
              if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
            });
            ctx.closePath();
          });
          ctx.fill(); ctx.stroke();
        });
      });
    } else {
      ctx.fillStyle = DIM; ctx.font = '13px monospace';
      ctx.fillText('window.__WORLD not available — base map not drawn', 20, 30);
    }

    mapPts = [];
    var rows = rowsOf(), I = VIEWS[view].I;

    if (view === 'ppa') {
      /* burbujas proporcionales a raiz(MW) para que el area sea proporcional al MW */
      var mx = Math.max.apply(null, rows.map(function (r) { return r[PI.mw] || 0; }).concat([1]));
      rows.slice().sort(function (a, b) { return (b[PI.mw] || 0) - (a[PI.mw] || 0); }).forEach(function (r) {
        if (r[PI.lat] == null) return;
        var p = pj(r[PI.lon], r[PI.lat]);
        if (p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) { offview++; return; }
        var rad = 3 + 17 * Math.sqrt((r[PI.mw] || 0) / mx);
        var col = TECH_COLOR[r[PI.tech]] || DIM;
        ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 6.2832);
        ctx.fillStyle = col + '66'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
        mapPts.push({ x: p[0], y: p[1], r: Math.max(rad, 6),
          t: r[PI.name] + '\n' + r[PI.tech] + ' · ' + fmt(r[PI.mw], 1) + ' MW gen. · ' + r[PI.fy] +
             '\n' + (r[PI.country] || '') });
      });
    } else if (view === 'pop') {
      rows.forEach(function (r) {
        if (r[OI.lat] == null) return;
        var p = pj(r[OI.lon], r[OI.lat]);
        if (p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) { offview++; return; }
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 6.2832);
        ctx.fillStyle = TEAL; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;
        mapPts.push({ x: p[0], y: p[1], r: 6, t: r[OI.id] + '\n' + (r[OI.city] || '') + ' · ' + (r[OI.market] || '') });
      });
    } else {
      rows.forEach(function (r) {
        if (r[RI.lat] == null) return;
        var p = pj(r[RI.lon], r[RI.lat]);
        if (p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) { offview++; return; }
        var open = r[RI.is_open];
        ctx.beginPath(); ctx.arc(p[0], p[1], open ? 6 : 6.5, 0, 6.2832);
        if (open) { ctx.fillStyle = ACCENT; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke(); }
        else {
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.strokeStyle = AMBER; ctx.lineWidth = 2; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
        }
        mapPts.push({ x: p[0], y: p[1], r: 9,
          t: r[RI.display] + '\n' + (r[RI.location] || '') + ' · ' + (open ? 'open ' + (r[RI.year_open] || '') : 'announced, not open') +
             '\nAZ: ' + (r[RI.az_status] || '—') });
      });
    }

    /* leyenda */
    var lg = {
      reg: '<span><b style="color:' + ACCENT + '">●</b> Azure region, open</span>' +
           '<span><b style="color:' + AMBER + '">○</b> Announced, not open</span>' +
           '<span>Coordinates = city centre, not a building</span>',
      ppa: '<span><b style="color:' + TECH_COLOR.solar + '">●</b> Solar</span>' +
           '<span><b style="color:' + TECH_COLOR.wind + '">●</b> Wind</span>' +
           '<span><b style="color:' + TECH_COLOR.mixed + '">●</b> Mixed</span>' +
           '<span>Bubble area ∝ MW of contracted <b>generation</b> (not IT load)</span>',
      pop: '<span><b style="color:' + TEAL + '">●</b> Network point of presence</span>' +
           '<span>These are not datacenters and have no associated capacity</span>'
    }[view];
    el('azLegend').innerHTML = lg;
    el('azMapTitle').textContent = 'Microsoft Azure — ' +
      { reg: 'regions', ppa: 'contracted renewable projects (PPA)', pop: 'network points of presence' }[view] +
      ' · ' + mapView + (offview ? ' · ' + offview + ' outside this view' : '');
  }

  /* tooltip del mapa */
  (function () {
    var cv = el('azCanvas'), tip = el('azTip');
    cv.addEventListener('mousemove', function (e) {
      var b = cv.getBoundingClientRect();
      var sx = cv.width / b.width, sy = cv.height / b.height;
      var mx = (e.clientX - b.left) * sx, my = (e.clientY - b.top) * sy;
      var hit = null, best = 1e9;
      for (var i = 0; i < mapPts.length; i++) {
        var p = mapPts[i], d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my);
        if (d < p.r * p.r && d < best) { best = d; hit = p; }
      }
      if (hit) {
        tip.style.display = 'block';
        tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top = (e.clientY + 12) + 'px';
        tip.innerHTML = esc(hit.t).replace(/\n/g, '<br>');
        cv.style.cursor = 'pointer';
      } else { tip.style.display = 'none'; cv.style.cursor = 'default'; }
    });
    cv.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
  })();

  /* =========================================================================
     GRAFICAS (Chart.js ya embebido en index.html)
     ====================================================================== */
  function mkChart(id, cfg) {
    if (!window.Chart) return;
    if (charts[id]) { try { charts[id].destroy(); } catch (_) {} }
    var cv = el(id); if (!cv) return;
    cfg.options = cfg.options || {};
    cfg.options.responsive = true;
    cfg.options.maintainAspectRatio = false;
    charts[id] = new window.Chart(cv.getContext('2d'), cfg);
  }
  var NOLEG = { legend: { display: false } };

  function drawCharts() {
    var rows = rowsOf();
    if (view === 'reg') {
      el('azC1Title').textContent = 'Azure regions by continent';
      var byC = {};
      rows.forEach(function (r) {
        var k = r[RI.continent] || '—';
        var o = byC[k] || (byC[k] = { open: 0, ann: 0 });
        if (r[RI.is_open]) o.open++; else o.ann++;
      });
      var ks = Object.keys(byC).sort(function (a, b) {
        return (byC[b].open + byC[b].ann) - (byC[a].open + byC[a].ann);
      });
      mkChart('azC1', {
        type: 'bar',
        data: { labels: ks, datasets: [
          { label: 'Open', data: ks.map(function (k) { return byC[k].open; }), backgroundColor: ACCENT },
          { label: 'Announced', data: ks.map(function (k) { return byC[k].ann; }), backgroundColor: AMBER }
        ] },
        options: { plugins: { legend: { display: true, position: 'bottom' } },
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
      });

      el('azC2Title').textContent = 'Azure region openings by year (cumulative)';
      var yrs = {};
      rows.forEach(function (r) {
        var y = parseInt(r[RI.year_open], 10);
        if (y) yrs[y] = (yrs[y] || 0) + 1;
      });
      var ys = Object.keys(yrs).map(Number).sort(function (a, b) { return a - b; });
      var cum = 0, cums = ys.map(function (y) { cum += yrs[y]; return cum; });
      mkChart('azC2', {
        type: 'line',
        data: { labels: ys, datasets: [{ label: 'Cumulative', data: cums, borderColor: ACCENT,
          backgroundColor: 'rgba(238,111,44,.12)', fill: true, tension: .25, pointRadius: 2 }] },
        options: { plugins: NOLEG, scales: { y: { beginAtZero: true } } }
      });

    } else if (view === 'ppa') {
      el('azC1Title').textContent = 'MW of contracted generation by technology';
      var byT = {};
      rows.forEach(function (r) { byT[r[PI.tech]] = (byT[r[PI.tech]] || 0) + (r[PI.mw] || 0); });
      var tk = Object.keys(byT);
      mkChart('azC1', {
        type: 'doughnut',
        data: { labels: tk, datasets: [{ data: tk.map(function (k) { return Math.round(byT[k]); }),
          backgroundColor: tk.map(function (k) { return TECH_COLOR[k] || DIM; }), borderWidth: 1 }] },
        options: { plugins: { legend: { display: true, position: 'right' } } }
      });

      el('azC2Title').textContent = 'Top 12 countries by MW of contracted generation';
      var byK = {};
      rows.forEach(function (r) {
        var k = r[PI.country] || '—';
        var o = byK[k] || (byK[k] = { mw: 0, eu: isEU(r[PI.market]) });
        o.mw += (r[PI.mw] || 0);
      });
      var kk = Object.keys(byK).sort(function (a, b) { return byK[b].mw - byK[a].mw; }).slice(0, 12);
      mkChart('azC2', {
        type: 'bar',
        data: { labels: kk, datasets: [{ data: kk.map(function (k) { return Math.round(byK[k].mw); }),
          backgroundColor: kk.map(function (k) { return byK[k].eu ? ACCENT : DIM; }) }] },
        options: { indexAxis: 'y', plugins: NOLEG, scales: { x: { beginAtZero: true } } }
      });

    } else {
      el('azC1Title').textContent = 'Top 12 countries by number of PoPs';
      var byM = {};
      rows.forEach(function (r) { var k = r[OI.market] || '—'; byM[k] = (byM[k] || 0) + 1; });
      var mk = Object.keys(byM).sort(function (a, b) { return byM[b] - byM[a]; }).slice(0, 12);
      mkChart('azC1', {
        type: 'bar',
        data: { labels: mk, datasets: [{ data: mk.map(function (k) { return byM[k]; }),
          backgroundColor: mk.map(function (k) { return isEU(k) ? ACCENT : TEAL; }) }] },
        options: { indexAxis: 'y', plugins: NOLEG, scales: { x: { beginAtZero: true } } }
      });

      el('azC2Title').textContent = 'PoPs by continent (via BNEF market)';
      var reg2 = {};
      rows.forEach(function (r) {
        var m = r[OI.market], k = isEU(m) ? 'Europe' : (m === 'US' || m === 'Canada' || m === 'Mexico' ||
          m === 'Brazil' || m === 'Chile' || m === 'Colombia') ? 'Americas' : m ? 'Rest of world' : '—';
        reg2[k] = (reg2[k] || 0) + 1;
      });
      var rk = Object.keys(reg2);
      mkChart('azC2', {
        type: 'doughnut',
        data: { labels: rk, datasets: [{ data: rk.map(function (k) { return reg2[k]; }),
          backgroundColor: [ACCENT, TEAL, DIM, '#e39a5c'], borderWidth: 1 }] },
        options: { plugins: { legend: { display: true, position: 'right' } } }
      });
    }
  }

  /* =========================================================================
     VISTAS
     ====================================================================== */
  var VIEWS = {
    reg: {
      title: 'Microsoft Azure · regions',
      tbl: REG, I: RI,
      filters: '<div><label>Continent</label><select id="f1"><option value="">All</option>' +
        CONTS.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
        '<div><label>Status</label><select id="f2"><option value="">All</option>' +
        '<option value="open">Open</option><option value="ann">Announced (not open)</option></select></div>' +
        '<div><label>Availability zones</label><select id="f3"><option value="">All</option>' +
        '<option value="available">available</option><option value="nearest">nearest</option>' +
        '<option value="soon">soon</option></select></div>' +
        '<div><label>Search</label><input type="text" id="fq" placeholder="madrid, spain, uksouth…"></div>',
      warn: '',
      head: [['display', 'Region'], ['id', 'Azure id'], ['location', 'Location'], ['market', 'Market (BNEF)'],
             ['continent', 'Continent'], ['is_open', 'Open'], ['year_open', 'Year'], ['az_status', 'AZ'],
             ['n_compliance', 'Compl.', 1], ['data_residency', 'Data residency'],
             ['lat', 'Lat', 1], ['lon', 'Lon', 1], ['announcement_link', 'Announcement']],
      match: function (r) {
        var f1 = el('f1').value, f2 = el('f2').value, f3 = el('f3').value;
        var q = el('fq').value.trim().toLowerCase();
        if (f1 && r[RI.continent] !== f1) return false;
        if (f2 === 'open' && !r[RI.is_open]) return false;
        if (f2 === 'ann' && r[RI.is_open]) return false;
        if (f3 && r[RI.az_status] !== f3) return false;
        if (q && [r[RI.display], r[RI.id], r[RI.location], r[RI.market]]
          .join(' ').toLowerCase().indexOf(q) < 0) return false;
        return true;
      },
      kpis: function (rows) {
        return [[rows.length, 'Azure regions'],
                [rows.filter(function (r) { return r[RI.is_open]; }).length, 'Open'],
                [rows.filter(function (r) { return !r[RI.is_open]; }).length, 'Announced, not open'],
                [rows.filter(function (r) { return r[RI.continent] === 'europe'; }).length, 'In Europe'],
                [new Set(rows.map(function (r) { return r[RI.market]; })).size, 'Countries']];
      }
    },
    ppa: {
      title: 'Microsoft Azure · contracted renewable projects (PPA)',
      tbl: PPA, I: PI,
      filters: '<div><label>Technology</label><select id="f1"><option value="">All</option>' +
        TECHS.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
        '<div><label>Fiscal year</label><select id="f2"><option value="">All</option>' +
        FYS.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
        '<div><label>Scope</label><select id="f3"><option value="">All</option>' +
        '<option value="eu">Europe only</option></select></div>' +
        '<div><label>Search</label><input type="text" id="fq" placeholder="spain, wind, solar…"></div>',
      warn: '<p style="background:#fdecec;border:1px solid #f5b7b1;color:#c0392b;padding:9px 12px;' +
        'border-radius:3px;font-size:12px;margin-bottom:12px"><b>MW of GENERATION, not IT load.</b> ' +
        'Renewable capacity contracted by Microsoft through PPAs. This is not datacenter capacity and ' +
        '<u>cannot be added to or compared with</u> the BNEF MW shown in tabs 02-06. ' +
        'Microsoft\'s fiscal year ends on 30 June: FY26+ are future contracts.</p>',
      head: [['name', 'Project'], ['tech', 'Technology'], ['mw', 'MW gen.', 1], ['country', 'Country'],
             ['fy', 'FY'], ['lat', 'Lat', 1], ['lon', 'Lon', 1], ['description', 'Description'],
             ['link', 'Source']],
      match: function (r) {
        var f1 = el('f1').value, f2 = el('f2').value, f3 = el('f3').value;
        var q = el('fq').value.trim().toLowerCase();
        if (f1 && r[PI.tech] !== f1) return false;
        if (f2 && r[PI.fy] !== f2) return false;
        if (f3 === 'eu' && !isEU(r[PI.market])) return false;
        if (q && [r[PI.name], r[PI.country], r[PI.tech], r[PI.description]]
          .join(' ').toLowerCase().indexOf(q) < 0) return false;
        return true;
      },
      kpis: function (rows) {
        var mw = function (f) {
          return rows.filter(f).reduce(function (a, r) { return a + (r[PI.mw] || 0); }, 0);
        };
        return [[rows.length, 'Projects'],
                [fmt(mw(function () { return true; }), 0) + ' MW', 'Contracted generation'],
                [fmt(mw(function (r) { return r[PI.tech] === 'solar'; }), 0) + ' MW', 'Solar'],
                [fmt(mw(function (r) { return r[PI.tech] === 'wind'; }), 0) + ' MW', 'Wind'],
                [fmt(mw(function (r) { return isEU(r[PI.market]); }), 0) + ' MW', 'Europe']];
      }
    },
    pop: {
      title: 'Microsoft Azure · network points of presence (PoPs)',
      tbl: POP, I: OI,
      filters: '<div><label>Scope</label><select id="f3"><option value="">All</option>' +
        '<option value="eu">Europe only</option></select></div>' +
        '<div><label>Search</label><input type="text" id="fq" placeholder="madrid, spain…"></div>',
      warn: '<p style="font-size:11.5px;color:var(--dim);margin-bottom:10px">PoP = Microsoft network point of ' +
        'presence (peering / edge), <b>not</b> a datacenter. No associated capacity.</p>',
      head: [['id', 'PoP'], ['city', 'City'], ['market', 'Market (BNEF)'], ['lat', 'Lat', 1], ['lon', 'Lon', 1]],
      match: function (r) {
        var f3 = el('f3') ? el('f3').value : '';
        var q = el('fq').value.trim().toLowerCase();
        if (f3 === 'eu' && !isEU(r[OI.market])) return false;
        if (!q) return true;
        return [r[OI.id], r[OI.city], r[OI.market]].join(' ').toLowerCase().indexOf(q) >= 0;
      },
      kpis: function (rows) {
        return [[rows.length, 'Azure PoPs'],
                [new Set(rows.map(function (r) { return r[OI.market]; })).size, 'Countries'],
                [new Set(rows.map(function (r) { return r[OI.city]; })).size, 'Cities'],
                [rows.filter(function (r) { return isEU(r[OI.market]); }).length, 'In Europe'],
                [rows.filter(function (r) { return r[OI.market] === 'Spain'; }).length, 'In Spain']];
      }
    }
  };

  function rowsOf() { return VIEWS[view].tbl.rows.filter(VIEWS[view].match); }

  /* =========================================================================
     TABLA + CRUCE
     ====================================================================== */
  function renderTable() {
    var V = VIEWS[view], I = V.I, base = rowsOf();
    el('azTitle').textContent = V.title + ' · ' + base.length + ' of ' + V.tbl.rows.length;
    el('azWarn').innerHTML = V.warn;

    var rows = base.slice();
    if (sortK != null) {
      rows.sort(function (a, b) {
        var x = a[I[sortK]], y = b[I[sortK]];
        if (x == null) x = ''; if (y == null) y = '';
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sortDir;
        if (typeof x === 'boolean' || typeof y === 'boolean') return ((x ? 1 : 0) - (y ? 1 : 0)) * sortDir;
        return String(x).localeCompare(String(y)) * sortDir;
      });
    }

    sec.querySelector('#azTable thead').innerHTML = '<tr>' + V.head.map(function (h) {
      return '<th class="' + (h[2] ? 'num' : '') + '" data-k="' + h[0] + '">' + h[1] + '</th>';
    }).join('') + '</tr>';

    sec.querySelector('#azTable tbody').innerHTML = rows.map(function (r) {
      return '<tr>' + V.head.map(function (h) {
        var k = h[0], val = r[I[k]];
        if (k === 'announcement_link' || k === 'link') return '<td>' + link(val, 'view') + '</td>';
        if (k === 'is_open') return '<td>' + (val ? '<span class="tag amer">open</span>'
          : '<span class="tag" style="color:#c85a12;border-color:#ecd9ae">announced</span>') + '</td>';
        if (k === 'tech') return '<td><span class="tag" style="color:' + (TECH_COLOR[val] || DIM) +
          ';border-color:var(--line)">' + esc(val) + '</span></td>';
        if (k === 'market') { var mv = mkt(val); return '<td>' + (MKT[mv] ? esc(mv)
          : '<span style="color:var(--red)">' + esc(mv || '—') + '</span>') + '</td>'; }
        if (k === 'description') return '<td style="font-size:11px;color:var(--dim);max-width:340px">' +
          esc(val || '—') + '</td>';
        if (k === 'id') return '<td style="font-family:var(--mono);font-size:11px">' + esc(val || '—') + '</td>';
        if (h[2]) return '<td class="num">' + (typeof val === 'number' ? fmt(val, k === 'mw' ? 1 : 4) : '—') + '</td>';
        return '<td>' + esc(val == null || val === '' ? '—' : val) + '</td>';
      }).join('') + '</tr>';
    }).join('') || '<tr><td colspan="' + V.head.length + '" style="color:var(--dim)">No results.</td></tr>';

    sec.querySelectorAll('#azTable th').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.k;
        if (k === sortK) sortDir = -sortDir; else { sortK = k; sortDir = 1; }
        renderTable();
      });
    });
  }

  function renderCross() {
    var by = {};
    REG.rows.forEach(function (r) {
      var m = mkt(r[RI.market]); if (!m) return;
      var o = by[m] || (by[m] = { m: m, reg: 0, ann: 0, ppa: 0, ppamw: 0, pops: 0 });
      o.reg++; if (!r[RI.is_open]) o.ann++;
    });
    PPA.rows.forEach(function (r) {
      var o = by[mkt(r[PI.market])]; if (!o) return;
      o.ppa++; o.ppamw += (r[PI.mw] || 0);
    });
    POP.rows.forEach(function (r) { var o = by[mkt(r[OI.market])]; if (o) o.pops++; });

    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) {
      return ((MKT[b.m] ? MKT[b.m].fut : 0) - (MKT[a.m] ? MKT[a.m].fut : 0));
    });
    el('azCross').innerHTML =
      '<h3>Country statistics — Microsoft Azure presence vs market size</h3>' +
      '<p style="font-size:11.5px;color:var(--dim);margin-bottom:10px">' +
      'Columns 2-6: <b>Microsoft Azure only</b>. Columns 7-9: <b>the whole country and all operators</b> ' +
      '(BNEF/DCByte), not Microsoft. PPA MW are <b>generation</b>; BNEF MW are <b>IT load</b>. ' +
      'Three different quantities: do not add across columns.</p>' +
      '<div style="overflow-x:auto"><table><thead><tr><th>Market</th>' +
      '<th class="num">Azure regions</th><th class="num">Announced</th><th class="num">Azure PoPs</th>' +
      '<th class="num">Azure PPAs</th><th class="num">MW gen. (PPA)</th>' +
      '<th class="num">BNEF DCs</th><th class="num">Live MW (country)</th><th class="num">Future MW (country)</th>' +
      '</tr></thead><tbody>' + list.map(function (o) {
        var b = MKT[o.m];
        return '<tr><td>' + (b ? esc(o.m) : '<span style="color:var(--red)">' + esc(o.m) +
            ' (no match)</span>') + '</td>' +
          '<td class="num">' + o.reg + '</td><td class="num">' + (o.ann || '—') + '</td>' +
          '<td class="num">' + (o.pops || '—') + '</td><td class="num">' + (o.ppa || '—') + '</td>' +
          '<td class="num" style="color:#1e7a3c">' + (o.ppamw ? fmt(o.ppamw, 0) : '—') + '</td>' +
          '<td class="num">' + (b ? b.n : '—') + '</td><td class="num">' + (b ? fmt(b.live, 0) : '—') + '</td>' +
          '<td class="num" style="color:var(--accent)">' + (b ? fmt(b.fut, 0) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function render() {
    el('azKpis').innerHTML = VIEWS[view].kpis(rowsOf()).map(function (k) {
      return '<div class="kpi"><div class="v">' + k[0] + '</div><div class="l">' + k[1] + '</div></div>';
    }).join('');
    renderTable();
    drawMap();
    drawCharts();
    renderCross();
  }

  function setView(v) {
    view = v; sortK = null; sortDir = 1;
    sec.querySelectorAll('.toolbar button[data-v]').forEach(function (b) {
      b.classList.toggle('primary', b.dataset.v === v);
    });
    el('azFilters').innerHTML = VIEWS[v].filters;
    ['f1', 'f2', 'f3'].forEach(function (id) { if (el(id)) el(id).addEventListener('change', render); });
    if (el('fq')) el('fq').addEventListener('input', render);
    render();
  }

  sec.querySelectorAll('.toolbar button[data-v]').forEach(function (b) {
    b.addEventListener('click', function () { setView(b.dataset.v); });
  });
  el('azMapView').addEventListener('change', function () {
    mapView = this.value;
    drawMap();
  });

  /* ---------- export CSV de la vista activa ---------- */
  el('azCsv').addEventListener('click', function () {
    var V = VIEWS[view], cols = V.tbl.cols;
    var lines = [cols.join(';')];
    rowsOf().forEach(function (r) {
      lines.push(cols.map(function (_, i) {
        var v = r[i]; if (v == null) return '';
        var s = String(v);
        return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';'));
    });
    var st = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = st + '_DC_MicrosoftAzure_' + view + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  /* ---------- pestanas: el handler nativo se registro antes que nuestro boton ---------- */
  var CORE = ['companies', 'search', 'stats', 'ramp', 'map', 'ann'];
  document.querySelectorAll('nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.tab !== 'azure') { sec.style.display = 'none'; return; }
      document.querySelectorAll('nav button').forEach(function (o) { o.classList.remove('on'); });
      b.classList.add('on');
      CORE.forEach(function (t) { var e = document.getElementById('tab-' + t); if (e) e.style.display = 'none'; });
      sec.style.display = '';
      /* doble rAF: el canvas oculto mide 0 y Chart.js necesita layout ya aplicado */
      requestAnimationFrame(function () { requestAnimationFrame(function () { setView(view); }); });
    });
  });

  /* ---------- impresion: printCurrentTab() no conoce nuestra pestana ---------- */
  var _orig = window.printCurrentTab;
  window.printCurrentTab = function () {
    if (sec.style.display === 'none' && typeof _orig === 'function') return _orig.apply(this, arguments);
    var tip = el('azTip'); if (tip) tip.style.display = 'none';
    document.querySelectorAll('section.print-active').forEach(function (e) { e.classList.remove('print-active'); });
    sec.classList.add('print-active');
    if (typeof window.populatePrintHeader === 'function') window.populatePrintHeader('08 · Azure detail');
    try {
      if (typeof window.dcSetPrintTitle === 'function' && typeof window.dcStamp === 'function') {
        window.dcSetPrintTitle(window.dcStamp() + '_DC_MicrosoftAzure_' + view);
      }
    } catch (_) {}
    document.body.classList.add('print-tab');
    setTimeout(function () {
      try { Object.keys(charts).forEach(function (k) { charts[k].resize(); }); } catch (_) {}
      drawMap();
      window.print();
    }, 300);
    setTimeout(function () {
      document.body.classList.remove('print-tab');
      sec.classList.remove('print-active');
      if (typeof window.dcRestoreTitle === 'function') window.dcRestoreTitle();
    }, 1000);
  };

  console.info('[azure_layer] Microsoft Azure OK · ' + REG.rows.length + ' regions · ' +
    PPA.rows.length + ' PPAs · ' + POP.rows.length + ' PoPs · captured ' + (A.meta.captured || '?'));
})();
