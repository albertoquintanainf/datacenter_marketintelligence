/* =============================================================================
   azure_layer.js · HECE DC Intelligence — pestana "Microsoft Azure" (add-on v3)
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
    console.info('[azure_layer] window.__AZURE no encontrado — pestana Microsoft Azure desactivada.');
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

  /* ---------- agregado BNEF por market ---------- */
  var MKT = {};
  D.rows.forEach(function (r) {
    var m = r[C.market]; if (!m) return;
    var o = MKT[m] || (MKT[m] = { n: 0, live: 0, fut: 0 });
    o.n++; o.live += (r[C.live] || 0); o.fut += (r[C.uc] || 0) + (r[C.pipeline] || 0);
  });
  var NOMATCH = Array.from(new Set(REG.rows.map(function (r) { return r[RI.market]; })
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
  btn.textContent = '07 · Microsoft Azure';
  nav.appendChild(btn);

  var sec = document.createElement('section');
  sec.id = 'tab-azure'; sec.style.display = 'none';
  (document.querySelector('main') || document.body).appendChild(sec);

  var CONTS = Array.from(new Set(REG.rows.map(function (r) { return r[RI.continent]; }).filter(Boolean))).sort();
  var TECHS = Array.from(new Set(PPA.rows.map(function (r) { return r[PI.tech]; }).filter(Boolean))).sort();
  var FYS = Array.from(new Set(PPA.rows.map(function (r) { return r[PI.fy]; }).filter(Boolean))).sort();

  sec.innerHTML =
    '<div class="panel" style="border-left:4px solid var(--accent);margin-bottom:14px">' +
      '<h3>Microsoft Azure — huella global declarada por el operador</h3>' +
      '<p style="font-size:12.5px;color:var(--dim);line-height:1.6">' +
      'Toda esta pestana es <b>Microsoft Azure</b> y solo Microsoft Azure. No contiene otros operadores. ' +
      '<b>Fuente primaria:</b> endpoints REST del globo de Microsoft ' +
      '(<code>datacenters.microsoft.com/wp-json/globe/*</code>). No es prensa. ' +
      '<b>Capturado:</b> ' + esc(A.meta.captured || '—') + '. <b>Dato confirmado</b>, no estimacion.<br>' +
      (A.meta.caveats || []).map(function (c) { return '· ' + esc(c); }).join('<br>') +
      (NOMATCH.length ? '<br><b style="color:var(--red)">Markets sin equivalente en BNEF (' +
        NOMATCH.length + '):</b> ' + esc(NOMATCH.join(', ')) : '') +
      '</p></div>' +
    '<div class="toolbar"><div class="tb-group"><span class="tb-label">Vista Azure</span>' +
      '<button class="btn primary" data-v="reg">Regions</button>' +
      '<button class="btn" data-v="ppa">Renewable PPAs</button>' +
      '<button class="btn" data-v="pop">Network PoPs</button></div>' +
      '<div class="tb-group"><span class="tb-label">Mapa</span>' +
      '<button class="btn primary" data-m="world">World</button>' +
      '<button class="btn" data-m="Europe">Europe</button></div>' +
      '<div class="tb-group" style="margin-left:auto"><button class="btn" id="azCsv">Export CSV</button></div>' +
    '</div>' +
    '<div class="kpis" id="azKpis"></div>' +
    '<div class="panel" style="margin-bottom:14px">' +
      '<h3 id="azMapTitle">Microsoft Azure — mapa</h3>' +
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
  var view = 'reg', mapView = 'world', sortK = null, sortDir = 1;
  var charts = {}, mapPts = [];

  /* =========================================================================
     MAPA (canvas propio, autocontenido: solo usa window.__WORLD)
     ====================================================================== */
  var VIEWS_GEO = {
    world: { lon0: -170, lon1: 190, lat0: -58, lat1: 82 },
    Europe: { lon0: -12, lon1: 42, lat0: 34, lat1: 72 }
  };

  function drawMap() {
    var cv = el('azCanvas'); if (!cv) return;
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var W = cv.width, H = cv.height, v = VIEWS_GEO[mapView];
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
      ctx.fillText('window.__WORLD no disponible — mapa base no dibujado', 20, 30);
    }

    mapPts = [];
    var rows = rowsOf(), I = VIEWS[view].I;

    if (view === 'ppa') {
      /* burbujas proporcionales a raiz(MW) para que el area sea proporcional al MW */
      var mx = Math.max.apply(null, rows.map(function (r) { return r[PI.mw] || 0; }).concat([1]));
      rows.slice().sort(function (a, b) { return (b[PI.mw] || 0) - (a[PI.mw] || 0); }).forEach(function (r) {
        if (r[PI.lat] == null) return;
        var p = pj(r[PI.lon], r[PI.lat]);
        if (p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) return;
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
        if (p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) return;
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 6.2832);
        ctx.fillStyle = TEAL; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;
        mapPts.push({ x: p[0], y: p[1], r: 6, t: r[OI.id] + '\n' + (r[OI.city] || '') + ' · ' + (r[OI.market] || '') });
      });
    } else {
      rows.forEach(function (r) {
        if (r[RI.lat] == null) return;
        var p = pj(r[RI.lon], r[RI.lat]);
        if (p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) return;
        var open = r[RI.is_open];
        ctx.beginPath(); ctx.arc(p[0], p[1], open ? 6 : 6.5, 0, 6.2832);
        if (open) { ctx.fillStyle = ACCENT; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke(); }
        else {
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.strokeStyle = AMBER; ctx.lineWidth = 2; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
        }
        mapPts.push({ x: p[0], y: p[1], r: 9,
          t: r[RI.display] + '\n' + (r[RI.location] || '') + ' · ' + (open ? 'abierta ' + (r[RI.year_open] || '') : 'anunciada, no abierta') +
             '\nAZ: ' + (r[RI.az_status] || '—') });
      });
    }

    /* leyenda */
    var lg = {
      reg: '<span><b style="color:' + ACCENT + '">●</b> Region Azure abierta</span>' +
           '<span><b style="color:' + AMBER + '">○</b> Anunciada, no abierta</span>' +
           '<span>Coordenada = centro de ciudad, no un edificio</span>',
      ppa: '<span><b style="color:' + TECH_COLOR.solar + '">●</b> Solar</span>' +
           '<span><b style="color:' + TECH_COLOR.wind + '">●</b> Eolica</span>' +
           '<span><b style="color:' + TECH_COLOR.mixed + '">●</b> Mixta</span>' +
           '<span>Area de la burbuja ∝ MW de <b>generacion</b> contratada (no IT load)</span>',
      pop: '<span><b style="color:' + TEAL + '">●</b> Punto de presencia de red</span>' +
           '<span>No son datacenters ni tienen capacidad asociada</span>'
    }[view];
    el('azLegend').innerHTML = lg;
    el('azMapTitle').textContent = 'Microsoft Azure — ' +
      { reg: 'regiones', ppa: 'proyectos renovables contratados (PPA)', pop: 'puntos de presencia de red' }[view] +
      ' · vista ' + mapView;
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
      el('azC1Title').textContent = 'Regiones Azure por continente';
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
          { label: 'Abiertas', data: ks.map(function (k) { return byC[k].open; }), backgroundColor: ACCENT },
          { label: 'Anunciadas', data: ks.map(function (k) { return byC[k].ann; }), backgroundColor: AMBER }
        ] },
        options: { plugins: { legend: { display: true, position: 'bottom' } },
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
      });

      el('azC2Title').textContent = 'Aperturas de region Azure por ano (acumulado)';
      var yrs = {};
      rows.forEach(function (r) {
        var y = parseInt(r[RI.year_open], 10);
        if (y) yrs[y] = (yrs[y] || 0) + 1;
      });
      var ys = Object.keys(yrs).map(Number).sort(function (a, b) { return a - b; });
      var cum = 0, cums = ys.map(function (y) { cum += yrs[y]; return cum; });
      mkChart('azC2', {
        type: 'line',
        data: { labels: ys, datasets: [{ label: 'Acumulado', data: cums, borderColor: ACCENT,
          backgroundColor: 'rgba(238,111,44,.12)', fill: true, tension: .25, pointRadius: 2 }] },
        options: { plugins: NOLEG, scales: { y: { beginAtZero: true } } }
      });

    } else if (view === 'ppa') {
      el('azC1Title').textContent = 'MW de generacion contratada por tecnologia';
      var byT = {};
      rows.forEach(function (r) { byT[r[PI.tech]] = (byT[r[PI.tech]] || 0) + (r[PI.mw] || 0); });
      var tk = Object.keys(byT);
      mkChart('azC1', {
        type: 'doughnut',
        data: { labels: tk, datasets: [{ data: tk.map(function (k) { return Math.round(byT[k]); }),
          backgroundColor: tk.map(function (k) { return TECH_COLOR[k] || DIM; }), borderWidth: 1 }] },
        options: { plugins: { legend: { display: true, position: 'right' } } }
      });

      el('azC2Title').textContent = 'Top 12 paises por MW de generacion contratada';
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
      el('azC1Title').textContent = 'Top 12 paises por numero de PoPs';
      var byM = {};
      rows.forEach(function (r) { var k = r[OI.market] || '—'; byM[k] = (byM[k] || 0) + 1; });
      var mk = Object.keys(byM).sort(function (a, b) { return byM[b] - byM[a]; }).slice(0, 12);
      mkChart('azC1', {
        type: 'bar',
        data: { labels: mk, datasets: [{ data: mk.map(function (k) { return byM[k]; }),
          backgroundColor: mk.map(function (k) { return isEU(k) ? ACCENT : TEAL; }) }] },
        options: { indexAxis: 'y', plugins: NOLEG, scales: { x: { beginAtZero: true } } }
      });

      el('azC2Title').textContent = 'PoPs por continente (via market BNEF)';
      var reg2 = {};
      rows.forEach(function (r) {
        var m = r[OI.market], k = isEU(m) ? 'Europa' : (m === 'US' || m === 'Canada' || m === 'Mexico' ||
          m === 'Brazil' || m === 'Chile' || m === 'Colombia') ? 'America' : m ? 'Resto' : '—';
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
      title: 'Microsoft Azure · regiones',
      tbl: REG, I: RI,
      filters: '<div><label>Continente</label><select id="f1"><option value="">All</option>' +
        CONTS.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
        '<div><label>Estado</label><select id="f2"><option value="">All</option>' +
        '<option value="open">Abiertas</option><option value="ann">Anunciadas (no abiertas)</option></select></div>' +
        '<div><label>Availability zones</label><select id="f3"><option value="">All</option>' +
        '<option value="available">available</option><option value="nearest">nearest</option>' +
        '<option value="soon">soon</option></select></div>' +
        '<div><label>Buscar</label><input type="text" id="fq" placeholder="madrid, spain, uksouth…"></div>',
      warn: '',
      head: [['display', 'Region'], ['id', 'Azure id'], ['location', 'Location'], ['market', 'Market (BNEF)'],
             ['continent', 'Continent'], ['is_open', 'Open'], ['year_open', 'Year'], ['az_status', 'AZ'],
             ['n_compliance', 'Compl.', 1], ['data_residency', 'Data residency'],
             ['lat', 'Lat', 1], ['lon', 'Lon', 1], ['announcement_link', 'Anuncio']],
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
        return [[rows.length, 'Regiones Azure'],
                [rows.filter(function (r) { return r[RI.is_open]; }).length, 'Abiertas'],
                [rows.filter(function (r) { return !r[RI.is_open]; }).length, 'Anunciadas, no abiertas'],
                [rows.filter(function (r) { return r[RI.continent] === 'europe'; }).length, 'En Europa'],
                [new Set(rows.map(function (r) { return r[RI.market]; })).size, 'Paises']];
      }
    },
    ppa: {
      title: 'Microsoft Azure · proyectos renovables contratados (PPA)',
      tbl: PPA, I: PI,
      filters: '<div><label>Tecnologia</label><select id="f1"><option value="">All</option>' +
        TECHS.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
        '<div><label>Fiscal year</label><select id="f2"><option value="">All</option>' +
        FYS.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
        '<div><label>Ambito</label><select id="f3"><option value="">All</option>' +
        '<option value="eu">Solo Europa</option></select></div>' +
        '<div><label>Buscar</label><input type="text" id="fq" placeholder="spain, wind, solar…"></div>',
      warn: '<p style="background:#fdecec;border:1px solid #f5b7b1;color:#c0392b;padding:9px 12px;' +
        'border-radius:3px;font-size:12px;margin-bottom:12px"><b>MW de GENERACION, no de IT load.</b> ' +
        'Capacidad renovable contratada por Microsoft via PPA. No es capacidad de datacenter y ' +
        '<u>no se puede sumar ni comparar</u> con los MW de BNEF de las pestanas 02-06. ' +
        'El fiscal year de Microsoft cierra el 30 de junio: FY26+ son contratos futuros.</p>',
      head: [['name', 'Proyecto'], ['tech', 'Tecnologia'], ['mw', 'MW gen.', 1], ['country', 'Pais'],
             ['fy', 'FY'], ['lat', 'Lat', 1], ['lon', 'Lon', 1], ['description', 'Descripcion'],
             ['link', 'Fuente']],
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
        return [[rows.length, 'Proyectos'],
                [fmt(mw(function () { return true; }), 0) + ' MW', 'Generacion contratada'],
                [fmt(mw(function (r) { return r[PI.tech] === 'solar'; }), 0) + ' MW', 'Solar'],
                [fmt(mw(function (r) { return r[PI.tech] === 'wind'; }), 0) + ' MW', 'Eolica'],
                [fmt(mw(function (r) { return isEU(r[PI.market]); }), 0) + ' MW', 'Europa']];
      }
    },
    pop: {
      title: 'Microsoft Azure · puntos de presencia de red (PoPs)',
      tbl: POP, I: OI,
      filters: '<div><label>Ambito</label><select id="f3"><option value="">All</option>' +
        '<option value="eu">Solo Europa</option></select></div>' +
        '<div><label>Buscar</label><input type="text" id="fq" placeholder="madrid, spain…"></div>',
      warn: '<p style="font-size:11.5px;color:var(--dim);margin-bottom:10px">PoP = punto de presencia de red ' +
        '(peering / edge) de Microsoft, <b>no</b> un datacenter. Sin capacidad asociada.</p>',
      head: [['id', 'PoP'], ['city', 'Ciudad'], ['market', 'Market (BNEF)'], ['lat', 'Lat', 1], ['lon', 'Lon', 1]],
      match: function (r) {
        var f3 = el('f3') ? el('f3').value : '';
        var q = el('fq').value.trim().toLowerCase();
        if (f3 === 'eu' && !isEU(r[OI.market])) return false;
        if (!q) return true;
        return [r[OI.id], r[OI.city], r[OI.market]].join(' ').toLowerCase().indexOf(q) >= 0;
      },
      kpis: function (rows) {
        return [[rows.length, 'PoPs Azure'],
                [new Set(rows.map(function (r) { return r[OI.market]; })).size, 'Paises'],
                [new Set(rows.map(function (r) { return r[OI.city]; })).size, 'Ciudades'],
                [rows.filter(function (r) { return isEU(r[OI.market]); }).length, 'En Europa'],
                [rows.filter(function (r) { return r[OI.market] === 'Spain'; }).length, 'En Espana']];
      }
    }
  };

  function rowsOf() { return VIEWS[view].tbl.rows.filter(VIEWS[view].match); }

  /* =========================================================================
     TABLA + CRUCE
     ====================================================================== */
  function renderTable() {
    var V = VIEWS[view], I = V.I, base = rowsOf();
    el('azTitle').textContent = V.title + ' · ' + base.length + ' de ' + V.tbl.rows.length;
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
        if (k === 'announcement_link' || k === 'link') return '<td>' + link(val, 'ver') + '</td>';
        if (k === 'is_open') return '<td>' + (val ? '<span class="tag amer">abierta</span>'
          : '<span class="tag" style="color:#c85a12;border-color:#ecd9ae">anunciada</span>') + '</td>';
        if (k === 'tech') return '<td><span class="tag" style="color:' + (TECH_COLOR[val] || DIM) +
          ';border-color:var(--line)">' + esc(val) + '</span></td>';
        if (k === 'market') return '<td>' + (MKT[val] ? esc(val)
          : '<span style="color:var(--red)">' + esc(val || '—') + '</span>') + '</td>';
        if (k === 'description') return '<td style="font-size:11px;color:var(--dim);max-width:340px">' +
          esc(val || '—') + '</td>';
        if (k === 'id') return '<td style="font-family:var(--mono);font-size:11px">' + esc(val || '—') + '</td>';
        if (h[2]) return '<td class="num">' + (typeof val === 'number' ? fmt(val, k === 'mw' ? 1 : 4) : '—') + '</td>';
        return '<td>' + esc(val == null || val === '' ? '—' : val) + '</td>';
      }).join('') + '</tr>';
    }).join('') || '<tr><td colspan="' + V.head.length + '" style="color:var(--dim)">Sin resultados.</td></tr>';

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
      var m = r[RI.market]; if (!m) return;
      var o = by[m] || (by[m] = { m: m, reg: 0, ann: 0, ppa: 0, ppamw: 0, pops: 0 });
      o.reg++; if (!r[RI.is_open]) o.ann++;
    });
    PPA.rows.forEach(function (r) {
      var o = by[r[PI.market]]; if (!o) return;
      o.ppa++; o.ppamw += (r[PI.mw] || 0);
    });
    POP.rows.forEach(function (r) { var o = by[r[OI.market]]; if (o) o.pops++; });

    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) {
      return ((MKT[b.m] ? MKT[b.m].fut : 0) - (MKT[a.m] ? MKT[a.m].fut : 0));
    });
    el('azCross').innerHTML =
      '<h3>Estadisticas por pais — presencia de Microsoft Azure vs tamano del mercado</h3>' +
      '<p style="font-size:11.5px;color:var(--dim);margin-bottom:10px">' +
      'Columnas 2-6: <b>solo Microsoft Azure</b>. Columnas 7-9: <b>todo el pais y todos los operadores</b> ' +
      '(BNEF/DCByte), no Microsoft. Los MW de PPA son <b>generacion</b>; los de BNEF son <b>IT load</b>. ' +
      'Tres magnitudes distintas: no sumar entre columnas.</p>' +
      '<div style="overflow-x:auto"><table><thead><tr><th>Market</th>' +
      '<th class="num">Azure regions</th><th class="num">Anunciadas</th><th class="num">Azure PoPs</th>' +
      '<th class="num">Azure PPAs</th><th class="num">MW gen. (PPA)</th>' +
      '<th class="num">BNEF DCs</th><th class="num">Live MW (pais)</th><th class="num">Future MW (pais)</th>' +
      '</tr></thead><tbody>' + list.map(function (o) {
        var b = MKT[o.m];
        return '<tr><td>' + (b ? esc(o.m) : '<span style="color:var(--red)">' + esc(o.m) +
            ' (sin match)</span>') + '</td>' +
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
  sec.querySelectorAll('.toolbar button[data-m]').forEach(function (b) {
    b.addEventListener('click', function () {
      mapView = b.dataset.m;
      sec.querySelectorAll('.toolbar button[data-m]').forEach(function (o) {
        o.classList.toggle('primary', o.dataset.m === mapView);
      });
      drawMap();
    });
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
    if (typeof window.populatePrintHeader === 'function') window.populatePrintHeader('07 · Microsoft Azure');
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

  console.info('[azure_layer] Microsoft Azure OK · ' + REG.rows.length + ' regiones · ' +
    PPA.rows.length + ' PPAs · ' + POP.rows.length + ' PoPs · capturado ' + (A.meta.captured || '?'));
})();
