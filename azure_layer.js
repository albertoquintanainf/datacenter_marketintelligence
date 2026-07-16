/* =============================================================================
   azure_layer.js  ·  HECE DC Intelligence — capa "Azure globe" (add-on v2)
   -----------------------------------------------------------------------------
   Add-on AUTOCONTENIDO. No modifica el codigo existente del dashboard.
   Lee window.__DATA (BNEF/DCByte) y window.__AZURE (captura del globo de MS).

   Instalacion (2 lineas antes de </body>, tras el <script> principal):
       <script src="azure.js"></script>
       <script src="azure_layer.js"></script>

   Tres vistas:
     · Regions  — 60 regiones Azure (51 abiertas + 9 anunciadas)
     · PPAs     — 85 proyectos renovables contratados por Microsoft
     · PoPs     — 193 puntos de presencia de red

   >>> AVISO CRITICO SOBRE LOS MW <<<
   ppa.mw = capacidad de GENERACION renovable contratada via PPA.
   NO es IT load de datacenter. NO sumar, NO comparar y NO mezclar con los MW
   de BNEF/DCByte de las pestanas 02-06. Son magnitudes fisicas distintas.
   ========================================================================== */
(function () {
  'use strict';

  if (typeof window.__DATA === 'undefined') return;
  if (typeof window.__AZURE === 'undefined') {
    console.info('[azure_layer] window.__AZURE no encontrado — capa Azure desactivada.');
    return;
  }

  var D = window.__DATA, A = window.__AZURE;
  var C = {}; D.cols.forEach(function (c, i) { C[c] = i; });

  function idx(tbl) { var o = {}; tbl.cols.forEach(function (c, i) { o[c] = i; }); return o; }
  var REG = A.regions, RI = idx(REG);
  var PPA = A.ppa, PI = idx(PPA);
  var POP = A.pops, OI = idx(POP);

  var EU_MKT = ['Spain', 'UK', 'Ireland', 'Germany', 'France', 'Netherlands', 'Sweden', 'Norway',
                'Denmark', 'Finland', 'Italy', 'Poland', 'Switzerland', 'Belgium', 'Austria',
                'Greece', 'Portugal', 'Czech Republic', 'Hungary', 'Romania'];

  /* ---------- agregado BNEF por market (para el cruce) ---------- */
  var MKT = {};
  D.rows.forEach(function (r) {
    var m = r[C.market]; if (!m) return;
    var o = MKT[m] || (MKT[m] = { n: 0, live: 0, fut: 0 });
    o.n++; o.live += (r[C.live] || 0); o.fut += (r[C.uc] || 0) + (r[C.pipeline] || 0);
  });
  /* markets del globo que NO existen en BNEF -> se avisa, no se oculta */
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
  btn.textContent = '07 · Azure globe';
  nav.appendChild(btn);

  var sec = document.createElement('section');
  sec.id = 'tab-azure'; sec.style.display = 'none';
  (document.querySelector('main') || document.body).appendChild(sec);

  var CONTS = Array.from(new Set(REG.rows.map(function (r) { return r[RI.continent]; }).filter(Boolean))).sort();
  var TECHS = Array.from(new Set(PPA.rows.map(function (r) { return r[PI.tech]; }).filter(Boolean))).sort();
  var FYS = Array.from(new Set(PPA.rows.map(function (r) { return r[PI.fy]; }).filter(Boolean))).sort();

  sec.innerHTML =
    '<div class="panel" style="border-left:4px solid var(--accent);margin-bottom:14px">' +
      '<h3>Fuente y alcance</h3>' +
      '<p style="font-size:12.5px;color:var(--dim);line-height:1.6">' +
      '<b>Fuente primaria del operador:</b> endpoints REST del globo de Microsoft ' +
      '(<code>datacenters.microsoft.com/wp-json/globe/*</code>). No es prensa. ' +
      '<b>Capturado:</b> ' + esc(A.meta.captured || '—') + '. <b>Dato confirmado</b>, no estimacion.<br>' +
      (A.meta.caveats || []).map(function (c) { return '· ' + esc(c); }).join('<br>') +
      (NOMATCH.length ? '<br><b style="color:var(--red)">Markets del globo sin equivalente en BNEF (' +
        NOMATCH.length + '):</b> ' + esc(NOMATCH.join(', ')) : '') +
      '</p></div>' +
    '<div class="toolbar"><div class="tb-group"><span class="tb-label">Vista</span>' +
      '<button class="btn primary" data-v="reg">Regions</button>' +
      '<button class="btn" data-v="ppa">Renewable PPAs</button>' +
      '<button class="btn" data-v="pop">Network PoPs</button></div>' +
      '<div class="tb-group" style="margin-left:auto"><button class="btn" id="azCsv">Export CSV</button></div>' +
    '</div>' +
    '<div class="kpis" id="azKpis"></div>' +
    '<div class="filters" id="azFilters"></div>' +
    '<div class="panel" style="margin-bottom:14px">' +
      '<h3 id="azTitle"></h3>' +
      '<div id="azWarn"></div>' +
      '<div style="overflow-x:auto"><table id="azTable"><thead></thead><tbody></tbody></table></div>' +
    '</div>' +
    '<div class="panel" id="azCross"></div>';

  var el = function (id) { return document.getElementById(id); };
  var view = 'reg', sortK = null, sortDir = 1;

  /* ---------- definicion de cada vista ---------- */
  var VIEWS = {
    reg: {
      title: 'Azure regions',
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
             ['n_compliance', 'Compliance', 1], ['data_residency', 'Data residency'],
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
        return [[rows.length, 'Regiones'],
                [rows.filter(function (r) { return r[RI.is_open]; }).length, 'Abiertas'],
                [rows.filter(function (r) { return !r[RI.is_open]; }).length, 'Anunciadas, no abiertas'],
                [rows.filter(function (r) { return r[RI.continent] === 'europe'; }).length, 'En Europa'],
                [new Set(rows.map(function (r) { return r[RI.market]; })).size, 'Paises']];
      }
    },
    ppa: {
      title: 'Proyectos renovables contratados por Microsoft (PPA)',
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
        'Estos MW son capacidad renovable contratada por Microsoft via PPA. No son capacidad de datacenter ' +
        'y <u>no se pueden sumar ni comparar</u> con los MW de BNEF de las pestanas 02-06. ' +
        'El fiscal year de Microsoft cierra el 30 de junio: FY26+ son contratos futuros.</p>',
      head: [['name', 'Proyecto'], ['tech', 'Tecnologia'], ['mw', 'MW gen.', 1], ['country', 'Pais'],
             ['fy', 'FY'], ['lat', 'Lat', 1], ['lon', 'Lon', 1], ['description', 'Descripcion'],
             ['link', 'Fuente']],
      match: function (r) {
        var f1 = el('f1').value, f2 = el('f2').value, f3 = el('f3').value;
        var q = el('fq').value.trim().toLowerCase();
        if (f1 && r[PI.tech] !== f1) return false;
        if (f2 && r[PI.fy] !== f2) return false;
        if (f3 === 'eu' && EU_MKT.indexOf(r[PI.market]) < 0) return false;
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
                [fmt(mw(function (r) { return EU_MKT.indexOf(r[PI.market]) >= 0; }), 0) + ' MW', 'Europa']];
      }
    },
    pop: {
      title: 'Puntos de presencia de red (PoPs)',
      tbl: POP, I: OI,
      filters: '<div><label>Buscar</label><input type="text" id="fq" placeholder="madrid, spain…"></div>',
      warn: '<p style="font-size:11.5px;color:var(--dim);margin-bottom:10px">PoP = punto de presencia de red ' +
        '(peering / edge), <b>no</b> un datacenter. Sin capacidad asociada.</p>',
      head: [['id', 'PoP'], ['city', 'Ciudad'], ['market', 'Market (BNEF)'], ['lat', 'Lat', 1], ['lon', 'Lon', 1]],
      match: function (r) {
        var q = el('fq').value.trim().toLowerCase();
        if (!q) return true;
        return [r[OI.id], r[OI.city], r[OI.market]].join(' ').toLowerCase().indexOf(q) >= 0;
      },
      kpis: function (rows) {
        return [[rows.length, 'PoPs'],
                [new Set(rows.map(function (r) { return r[OI.market]; })).size, 'Paises'],
                [new Set(rows.map(function (r) { return r[OI.city]; })).size, 'Ciudades'],
                [rows.filter(function (r) { return r[OI.market] === 'Spain'; }).length, 'En Espana']];
      }
    }
  };

  function rowsOf() { return VIEWS[view].tbl.rows.filter(VIEWS[view].match); }

  function render() {
    var V = VIEWS[view], I = V.I;
    var base = rowsOf();
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

    el('azKpis').innerHTML = V.kpis(base).map(function (k) {
      return '<div class="kpi"><div class="v">' + k[0] + '</div><div class="l">' + k[1] + '</div></div>';
    }).join('');

    sec.querySelector('#azTable thead').innerHTML = '<tr>' + V.head.map(function (h) {
      return '<th class="' + (h[2] ? 'num' : '') + '" data-k="' + h[0] + '">' + h[1] + '</th>';
    }).join('') + '</tr>';

    sec.querySelector('#azTable tbody').innerHTML = rows.map(function (r) {
      return '<tr>' + V.head.map(function (h) {
        var k = h[0], v = r[I[k]];
        if (k === 'announcement_link' || k === 'link') return '<td>' + link(v, 'ver') + '</td>';
        if (k === 'is_open') return '<td>' + (v ? '<span class="tag amer">abierta</span>'
          : '<span class="tag" style="color:#c85a12;border-color:#ecd9ae">anunciada</span>') + '</td>';
        if (k === 'market') return '<td>' + (MKT[v] ? esc(v)
          : '<span style="color:var(--red)">' + esc(v || '—') + '</span>') + '</td>';
        if (k === 'description') return '<td style="font-size:11px;color:var(--dim);max-width:340px">' +
          esc(v || '—') + '</td>';
        if (k === 'id') return '<td style="font-family:var(--mono);font-size:11px">' + esc(v || '—') + '</td>';
        if (h[2]) return '<td class="num">' + (typeof v === 'number' ? fmt(v, k === 'mw' ? 1 : 4) : '—') + '</td>';
        return '<td>' + esc(v == null || v === '' ? '—' : v) + '</td>';
      }).join('') + '</tr>';
    }).join('') || '<tr><td colspan="' + V.head.length + '" style="color:var(--dim)">Sin resultados.</td></tr>';

    sec.querySelectorAll('#azTable th').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.k;
        if (k === sortK) sortDir = -sortDir; else { sortK = k; sortDir = 1; }
        render();
      });
    });
    renderCross();
  }

  /* ---------- cruce por pais: presencia Azure vs tamano del mercado ---------- */
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
    el('azCross').innerHTML = '<h3>Presencia Azure vs tamano del mercado (por pais)</h3>' +
      '<p style="font-size:11.5px;color:var(--dim);margin-bottom:10px">Los MW de las 2 ultimas columnas son ' +
      '<b>de todo el pais y de todos los operadores</b> (BNEF/DCByte), no de Microsoft. Los MW de PPA son ' +
      '<b>generacion</b>. Tres magnitudes distintas en la misma tabla: no sumar entre columnas.</p>' +
      '<div style="overflow-x:auto"><table><thead><tr><th>Market</th>' +
      '<th class="num">Azure regions</th><th class="num">Anunciadas</th><th class="num">PoPs</th>' +
      '<th class="num">PPAs</th><th class="num">MW gen. (PPA)</th>' +
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
    a.download = st + '_DC_AzureGlobe_' + view + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  /* ---------- pestanas: el handler nativo se registro antes que nuestro boton,
     asi que replicamos su comportamiento para data-tab="azure" ---------- */
  var CORE = ['companies', 'search', 'stats', 'ramp', 'map', 'ann'];
  document.querySelectorAll('nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.tab !== 'azure') { sec.style.display = 'none'; return; }
      document.querySelectorAll('nav button').forEach(function (o) { o.classList.remove('on'); });
      b.classList.add('on');
      CORE.forEach(function (t) { var e = document.getElementById('tab-' + t); if (e) e.style.display = 'none'; });
      sec.style.display = '';
      setView(view);
    });
  });

  /* ---------- impresion: printCurrentTab() no conoce nuestra pestana ---------- */
  var _orig = window.printCurrentTab;
  window.printCurrentTab = function () {
    if (sec.style.display === 'none' && typeof _orig === 'function') return _orig.apply(this, arguments);
    document.querySelectorAll('section.print-active').forEach(function (e) { e.classList.remove('print-active'); });
    sec.classList.add('print-active');
    if (typeof window.populatePrintHeader === 'function') window.populatePrintHeader('07 · Azure globe');
    try {
      if (typeof window.dcSetPrintTitle === 'function' && typeof window.dcStamp === 'function') {
        window.dcSetPrintTitle(window.dcStamp() + '_DC_AzureGlobe_' + view);
      }
    } catch (_) {}
    document.body.classList.add('print-tab');
    setTimeout(function () { window.print(); }, 250);
    setTimeout(function () {
      document.body.classList.remove('print-tab');
      sec.classList.remove('print-active');
      if (typeof window.dcRestoreTitle === 'function') window.dcRestoreTitle();
    }, 900);
  };

  console.info('[azure_layer] OK · ' + REG.rows.length + ' regiones · ' + PPA.rows.length +
               ' PPAs · ' + POP.rows.length + ' PoPs · capturado ' + (A.meta.captured || '?'));
})();
