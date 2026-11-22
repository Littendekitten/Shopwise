/* Shopwise – applicatielogica (alleen Nederlands, demo) */
(function () {
  'use strict';

  var PRODUCTS = window.SHOPWISE_PRODUCTS || [];
  var CATEGORIES = window.SHOPWISE_CATEGORIES || [];

  var GRATIS_VANAF = 5000;   // eurocenten
  var BEZORGKOSTEN = 395;    // eurocenten
  var MAX_AANTAL = 20;

  var GAST_MAND = 'shopwise_mand_gast';
  var GEBRUIKERS = 'shopwise_gebruikers';
  var SESSIE = 'shopwise_sessie';
  var BESTELLING = 'shopwise_bestelling';

  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var zoekveld = document.getElementById('zoekveld');
  var zoekformulier = document.getElementById('zoekformulier');

  var state = { query: '', categorie: 'alle', sortering: 'aanbevolen' };

  var productMap = {};
  PRODUCTS.forEach(function (p) { productMap[p.id] = p; });

  var categorieMap = {};
  CATEGORIES.forEach(function (c) { categorieMap[c.id] = c; });

  /* ---------- Hulpfuncties ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var euroFormatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
  function eur(cents) { return euroFormatter.format(cents / 100); }

  function normaliseer(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function hoofdletter(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var geheugen = {};
  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        if (raw === null) return (key in geheugen) ? geheugen[key] : fallback;
        return JSON.parse(raw);
      } catch (e) {
        return (key in geheugen) ? geheugen[key] : fallback;
      }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); delete geheugen[key]; }
      catch (e) { geheugen[key] = value; }
    },
    remove: function (key) {
      try { localStorage.removeItem(key); } catch (e) { /* negeren */ }
      delete geheugen[key];
    }
  };

  var toastTimer = null;
  function toast(tekst) {
    toastEl.textContent = tekst;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  function gaNaar(pad) {
    if (location.hash === '#' + pad) route(); else location.hash = '#' + pad;
  }

  /* ---------- Gebruikers ---------- */

  function getGebruikers() {
    var lijst = store.get(GEBRUIKERS, []);
    return Array.isArray(lijst) ? lijst : [];
  }

  function huidigeGebruiker() {
    var email = store.get(SESSIE, null);
    if (!email) return null;
    var gevonden = getGebruikers().filter(function (u) { return u.email === email; })[0];
    return gevonden || null;
  }

  function maakSalt() {
    try {
      var arr = new Uint8Array(12);
      crypto.getRandomValues(arr);
      return Array.prototype.map.call(arr, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    } catch (e) {
      return String(Math.random()).slice(2) + String(Date.now());
    }
  }

  function hashWachtwoord(wachtwoord, salt) {
    var tekst = salt + ':' + wachtwoord;
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      });
    }
    var h = 5381;
    for (var i = 0; i < tekst.length; i++) { h = ((h << 5) + h + tekst.charCodeAt(i)) | 0; }
    return Promise.resolve('x' + (h >>> 0).toString(16));
  }

  function adresSleutel(email) { return 'shopwise_adres_' + email; }

  /* ---------- Winkelmand ---------- */

  function mandSleutel() {
    var u = huidigeGebruiker();
    return u ? 'shopwise_mand_' + u.email : GAST_MAND;
  }

  function schoonMand(raw) {
    var schoon = {};
    if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(function (id) {
        var q = parseInt(raw[id], 10);
        if (productMap[id] && q > 0) schoon[id] = Math.min(q, MAX_AANTAL);
      });
    }
    return schoon;
  }

  function getMand() { return schoonMand(store.get(mandSleutel(), {})); }
  function setMand(mand) { store.set(mandSleutel(), mand); }

  function wijzigAantal(id, delta) {
    if (!productMap[id]) return;
    var mand = getMand();
    var nieuw = (mand[id] || 0) + delta;
    if (nieuw > MAX_AANTAL) {
      toast('Maximaal ' + MAX_AANTAL + ' stuks per product');
      nieuw = MAX_AANTAL;
    }
    if (nieuw <= 0) delete mand[id]; else mand[id] = nieuw;
    setMand(mand);
  }

  function verwijderUitMand(id) {
    var mand = getMand();
    delete mand[id];
    setMand(mand);
  }

  function voegGastMandSamen() {
    var gast = schoonMand(store.get(GAST_MAND, {}));
    if (!Object.keys(gast).length) return;
    var gebruiker = schoonMand(store.get(mandSleutel(), {}));
    Object.keys(gast).forEach(function (id) {
      gebruiker[id] = Math.min((gebruiker[id] || 0) + gast[id], MAX_AANTAL);
    });
    store.set(mandSleutel(), gebruiker);
    store.remove(GAST_MAND);
  }

  function berekenTotalen() {
    var mand = getMand();
    var regels = Object.keys(mand).map(function (id) {
      var p = productMap[id];
      return { product: p, aantal: mand[id], totaal: p.prijs * mand[id] };
    });
    var subtotaal = regels.reduce(function (s, r) { return s + r.totaal; }, 0);
    var bezorg = subtotaal === 0 ? 0 : (subtotaal >= GRATIS_VANAF ? 0 : BEZORGKOSTEN);
    var aantal = regels.reduce(function (s, r) { return s + r.aantal; }, 0);
    return { regels: regels, subtotaal: subtotaal, bezorg: bezorg, totaal: subtotaal + bezorg, aantal: aantal };
  }

  /* ---------- Header ---------- */

  function huidigPad() { return parseHash().pad; }

  function updateHeader() {
    var t = berekenTotalen();
    var teller = document.getElementById('mandteller');
    teller.textContent = t.aantal;
    teller.classList.toggle('is-empty', t.aantal === 0);
    var mandLink = document.querySelector('.basket-link');
    mandLink.setAttribute('aria-label', 'Winkelmand, ' + t.aantal + (t.aantal === 1 ? ' product' : ' producten'));

    var u = huidigeGebruiker();
    var acc = document.getElementById('nav-account');
    acc.textContent = u ? 'Mijn account' : 'Inloggen';
    acc.setAttribute('href', u ? '#/account' : '#/inloggen');

    var pad = huidigPad();
    document.querySelectorAll('.header-nav a').forEach(function (a) {
      var nav = a.getAttribute('data-nav');
      var actief = false;
      if (nav === '/') actief = pad === '/';
      else if (nav === '/winkelmand') actief = pad === '/winkelmand' || pad === '/afrekenen';
      else if (nav === 'account') actief = pad === '/inloggen' || pad === '/registreren' || pad === '/account';
      if (actief) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* ---------- Routing ---------- */

  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/';
    var delen = h.split('?');
    var pad = delen[0] || '/';
    var params = {};
    if (delen[1]) {
      delen[1].split('&').forEach(function (kv) {
        var p = kv.split('=');
        try { params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } catch (e) { /* negeren */ }
      });
    }
    return { pad: pad, params: params };
  }

  var laatstePad = null;

  function route() {
    var r = parseHash();
    var pad = r.pad;
    var gebruiker = huidigeGebruiker();

    if (pad === '/account' && !gebruiker) { gaNaar('/inloggen'); return; }
    if ((pad === '/inloggen' || pad === '/registreren') && gebruiker) { gaNaar('/account'); return; }

    switch (pad) {
      case '/':             renderCatalogus(); document.title = 'Shopwise – Boodschappen doen, slim en simpel'; break;
      case '/winkelmand':   renderMandPagina(); document.title = 'Winkelmand – Shopwise'; break;
      case '/afrekenen':    renderAfrekenen(); document.title = 'Bezorgadres – Shopwise'; break;
      case '/bevestiging':  renderBevestiging(); document.title = 'Bestelling ontvangen – Shopwise'; break;
      case '/inloggen':     renderInloggen(r.params); document.title = 'Inloggen – Shopwise'; break;
      case '/registreren':  renderRegistreren(r.params); document.title = 'Account aanmaken – Shopwise'; break;
      case '/account':      renderAccount(); document.title = 'Mijn account – Shopwise'; break;
      default:              renderNietGevonden(); document.title = 'Pagina niet gevonden – Shopwise';
    }

    if (pad === '/' && zoekveld.value !== state.query) zoekveld.value = state.query;
    updateHeader();
    if (laatstePad !== pad) window.scrollTo(0, 0);
    laatstePad = pad;
  }

  function veiligeVolgende(volgende) {
    var toegestaan = ['/winkelmand', '/afrekenen', '/account', '/'];
    return toegestaan.indexOf(volgende) !== -1 ? volgende : '/';
  }

  /* ---------- Catalogus ---------- */

  function stepperHtml(p, aantal, klasse) {
    return '<div class="stepper ' + (klasse || '') + '" role="group" aria-label="Aantal ' + esc(p.naam) + '">' +
      '<button type="button" data-action="dec" data-id="' + p.id + '" aria-label="Minder ' + esc(p.naam) + '">−</button>' +
      '<span aria-live="polite">' + aantal + '</span>' +
      '<button type="button" data-action="inc" data-id="' + p.id + '" aria-label="Meer ' + esc(p.naam) + '">+</button>' +
      '</div>';
  }

  function productKaart(p, mand) {
    var aantal = mand[p.id] || 0;
    var actie = aantal > 0
      ? stepperHtml(p, aantal)
      : '<button type="button" class="btn btn-primary btn-block" data-action="add" data-id="' + p.id + '" aria-label="' + esc(p.naam) + ' toevoegen aan winkelmand">Toevoegen</button>';
    return '<article class="card">' +
      '<div class="card-img cat-' + p.categorie + '" aria-hidden="true"><span>' + p.emoji + '</span></div>' +
      '<div class="card-body">' +
        '<p class="cat">' + esc(categorieMap[p.categorie].naam) + '</p>' +
        '<h3>' + esc(p.naam) + '</h3>' +
        '<p class="unit">' + esc(p.eenheid) + '</p>' +
        '<p class="price">' + eur(p.prijs) + '</p>' +
        '<div class="card-actions">' + actie + '</div>' +
      '</div></article>';
  }

  function gefilterdeProducten() {
    var q = normaliseer(state.query);
    var lijst = PRODUCTS.filter(function (p) {
      if (state.categorie !== 'alle' && p.categorie !== state.categorie) return false;
      if (!q) return true;
      var haystack = normaliseer(p.naam + ' ' + categorieMap[p.categorie].naam + ' ' + p.omschrijving);
      return q.split(/\s+/).every(function (woord) { return haystack.indexOf(woord) !== -1; });
    });
    if (state.sortering === 'prijs-oplopend') lijst.sort(function (a, b) { return a.prijs - b.prijs; });
    else if (state.sortering === 'prijs-aflopend') lijst.sort(function (a, b) { return b.prijs - a.prijs; });
    else if (state.sortering === 'naam') lijst.sort(function (a, b) { return a.naam.localeCompare(b.naam, 'nl'); });
    return lijst;
  }

  function renderCatalogus() {
    var chips = '<button type="button" class="chip' + (state.categorie === 'alle' ? ' active' : '') + '" data-action="cat" data-cat="alle">Alles</button>' +
      CATEGORIES.map(function (c) {
        return '<button type="button" class="chip' + (state.categorie === c.id ? ' active' : '') + '" data-action="cat" data-cat="' + c.id + '">' + esc(c.naam) + '</button>';
      }).join('');

    var opties = [
      ['aanbevolen', 'Aanbevolen'],
      ['prijs-oplopend', 'Prijs: laag naar hoog'],
      ['prijs-aflopend', 'Prijs: hoog naar laag'],
      ['naam', 'Naam: A tot Z']
    ].map(function (o) {
      return '<option value="' + o[0] + '"' + (state.sortering === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');

    app.innerHTML =
      '<section class="hero">' +
        '<h1>Boodschappen doen, slim en simpel</h1>' +
        '<p>Bekijk ons demo-assortiment, vul je winkelmand en probeer de bezorgflow uit. Gratis bezorging vanaf ' + eur(GRATIS_VANAF) + '.</p>' +
      '</section>' +
      '<div class="toolbar">' +
        '<div class="chips" role="group" aria-label="Categorieën">' + chips + '</div>' +
        '<div class="sort"><label for="sortering">Sorteren</label><select id="sortering" data-sort>' + opties + '</select></div>' +
      '</div>' +
      '<p id="resultaattekst" class="muted" aria-live="polite"></p>' +
      '<div id="productgrid" class="grid"></div>';

    renderGrid();
  }

  function renderGrid() {
    var grid = document.getElementById('productgrid');
    var tekst = document.getElementById('resultaattekst');
    if (!grid) return;
    var lijst = gefilterdeProducten();
    var mand = getMand();

    if (lijst.length === 0) {
      tekst.textContent = 'Geen producten gevonden.';
      grid.className = '';
      grid.innerHTML = '<div class="empty"><span class="big" aria-hidden="true">🔎</span>' +
        '<h2>Niets gevonden</h2><p class="muted">Probeer een andere zoekterm of kies een andere categorie.</p>' +
        '<button type="button" class="btn btn-secondary" data-action="reset-filters">Filters wissen</button></div>';
      return;
    }
    tekst.textContent = lijst.length + (lijst.length === 1 ? ' product' : ' producten') + ' gevonden';
    grid.className = 'grid';
    grid.innerHTML = lijst.map(function (p) { return productKaart(p, mand); }).join('');
  }

  /* ---------- Winkelmand-pagina ---------- */

  function samenvattingHtml(t, metKnoppen) {
    var resterend = Math.max(0, GRATIS_VANAF - t.subtotaal);
    var voortgang = Math.min(100, Math.round((t.subtotaal / GRATIS_VANAF) * 100));
    var gratisTekst = t.subtotaal >= GRATIS_VANAF
      ? 'Je krijgt gratis bezorging. 🎉'
      : 'Nog ' + eur(resterend) + ' tot gratis bezorging.';
    return '<h2>Overzicht</h2>' +
      '<div class="progress" aria-hidden="true"><div style="width:' + voortgang + '%"></div></div>' +
      '<p class="muted">' + gratisTekst + '</p>' +
      '<div class="summary-row"><span>Subtotaal</span><span>' + eur(t.subtotaal) + '</span></div>' +
      '<div class="summary-row"><span>Bezorgkosten</span><span>' + (t.bezorg === 0 ? 'Gratis' : eur(t.bezorg)) + '</span></div>' +
      '<div class="summary-row total"><span>Totaal</span><span>' + eur(t.totaal) + '</span></div>' +
      (metKnoppen || '');
  }

  function renderMandPagina() {
    var t = berekenTotalen();
    var gebruiker = huidigeGebruiker();

    if (t.regels.length === 0) {
      app.innerHTML = '<h1 class="page-title">Winkelmand</h1>' +
        '<div class="empty"><span class="big" aria-hidden="true">🧺</span>' +
        '<h2>Je winkelmand is leeg</h2>' +
        '<p class="muted">Voeg producten toe om te beginnen met je boodschappen.</p>' +
        '<a class="btn btn-primary" href="#/">Bekijk producten</a></div>';
      return;
    }

    var regels = t.regels.map(function (r) {
      var p = r.product;
      return '<div class="line">' +
        '<div class="line-img cat-' + p.categorie + '" aria-hidden="true">' + p.emoji + '</div>' +
        '<div class="line-info">' +
          '<h3>' + esc(p.naam) + '</h3>' +
          '<p class="unit">' + esc(p.eenheid) + ' · ' + eur(p.prijs) + ' per stuk</p>' +
          '<div class="line-controls">' +
            stepperHtml(p, r.aantal) +
            '<span class="line-total">' + eur(r.totaal) + '</span>' +
            '<button type="button" class="btn-link" data-action="remove" data-id="' + p.id + '" aria-label="' + esc(p.naam) + ' verwijderen">Verwijderen</button>' +
          '</div>' +
        '</div></div>';
    }).join('');

    var opslagTekst = gebruiker
      ? 'Je winkelmand is gekoppeld aan je account (' + esc(gebruiker.email) + ').'
      : 'Je winkelmand wordt op dit apparaat bewaard. <a href="#/inloggen?next=/winkelmand">Log in</a> om hem aan je account te koppelen.';

    var knoppen = '<div class="actions-row">' +
      '<a class="btn btn-primary btn-block" href="#/afrekenen">Naar bezorgadres</a>' +
      '<a class="btn btn-secondary btn-block" href="#/">Verder winkelen</a>' +
      '</div>' +
      '<p style="margin-top:1rem"><button type="button" class="btn-link" data-action="clear">Winkelmand leegmaken</button></p>';

    app.innerHTML = '<h1 class="page-title">Winkelmand</h1>' +
      '<div class="notice">' + opslagTekst + '</div>' +
      '<div class="two-col">' +
        '<section class="panel" aria-label="Producten in je winkelmand">' + regels + '</section>' +
        '<aside class="panel sticky" aria-label="Overzicht">' + samenvattingHtml(t, knoppen) + '</aside>' +
      '</div>';
  }

  /* ---------- Formulieren ---------- */

  function veld(o) {
    var attrs = '';
    if (o.autocomplete) attrs += ' autocomplete="' + o.autocomplete + '"';
    if (o.inputmode) attrs += ' inputmode="' + o.inputmode + '"';
    if (o.maxlength) attrs += ' maxlength="' + o.maxlength + '"';
    if (o.placeholder) attrs += ' placeholder="' + esc(o.placeholder) + '"';
    if (o.required) attrs += ' required';
    var hint = o.hint ? '<p class="hint" id="' + o.id + '-hint">' + esc(o.hint) + '</p>' : '';
    var describedby = o.id + '-fout' + (o.hint ? ' ' + o.id + '-hint' : '');
    return '<div class="field' + (o.span2 ? ' span-2' : '') + '">' +
      '<label for="' + o.id + '">' + esc(o.label) + (o.required ? '' : ' <span class="optional">(optioneel)</span>') + '</label>' +
      '<input id="' + o.id + '" name="' + o.id + '" type="' + (o.type || 'text') + '" value="' + esc(o.value || '') + '"' + attrs + ' aria-describedby="' + describedby + '">' +
      hint +
      '<p class="field-error" id="' + o.id + '-fout" data-error-for="' + o.id + '"></p>' +
      '</div>';
  }

  function toonFouten(form, fouten) {
    var eerste = null;
    form.querySelectorAll('[data-error-for]').forEach(function (el) {
      var naam = el.getAttribute('data-error-for');
      var invoer = form.querySelector('[name="' + naam + '"]');
      if (fouten[naam]) {
        el.textContent = fouten[naam];
        if (invoer) invoer.setAttribute('aria-invalid', 'true');
        if (!eerste && invoer) eerste = invoer;
      } else {
        el.textContent = '';
        if (invoer) invoer.removeAttribute('aria-invalid');
      }
    });
    if (eerste) eerste.focus();
    return !eerste;
  }

  function formWaarden(form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else out[el.name] = el.value;
    });
    return out;
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- Inloggen & registreren ---------- */

  function renderInloggen(params) {
    var volgende = veiligeVolgende(params.next || '/');
    app.innerHTML = '<div class="auth-wrap"><div class="panel">' +
      '<h1>Inloggen</h1>' +
      '<p class="muted">Log in om je winkelmand en bezorgadres aan je account te koppelen.</p>' +
      '<div class="form-error" id="formfout" role="alert"></div>' +
      '<form id="form-inloggen" novalidate data-next="' + esc(volgende) + '">' +
        '<div class="form-grid">' +
          veld({ id: 'email', label: 'E-mailadres', type: 'email', required: true, autocomplete: 'email', inputmode: 'email' }) +
          veld({ id: 'wachtwoord', label: 'Wachtwoord', type: 'password', required: true, autocomplete: 'current-password' }) +
        '</div>' +
        '<p style="margin-top:1rem"><button class="btn btn-primary btn-block" type="submit">Inloggen</button></p>' +
      '</form>' +
      '<p class="alt">Nog geen account? <a href="#/registreren?next=' + encodeURIComponent(volgende) + '">Account aanmaken</a></p>' +
      '<p class="hint">Dit is een demo: accounts worden alleen in je eigen browser opgeslagen.</p>' +
    '</div></div>';
  }

  function renderRegistreren(params) {
    var volgende = veiligeVolgende(params.next || '/');
    app.innerHTML = '<div class="auth-wrap"><div class="panel">' +
      '<h1>Account aanmaken</h1>' +
      '<p class="muted">Maak gratis een demo-account aan.</p>' +
      '<div class="form-error" id="formfout" role="alert"></div>' +
      '<form id="form-registreren" novalidate data-next="' + esc(volgende) + '">' +
        '<div class="form-grid">' +
          veld({ id: 'naam', label: 'Volledige naam', required: true, autocomplete: 'name' }) +
          veld({ id: 'email', label: 'E-mailadres', type: 'email', required: true, autocomplete: 'email', inputmode: 'email' }) +
          veld({ id: 'wachtwoord', label: 'Wachtwoord', type: 'password', required: true, autocomplete: 'new-password', hint: 'Minimaal 8 tekens.' }) +
          veld({ id: 'herhaal', label: 'Herhaal wachtwoord', type: 'password', required: true, autocomplete: 'new-password' }) +
        '</div>' +
        '<p style="margin-top:1rem"><button class="btn btn-primary btn-block" type="submit">Account aanmaken</button></p>' +
      '</form>' +
      '<p class="alt">Heb je al een account? <a href="#/inloggen?next=' + encodeURIComponent(volgende) + '">Inloggen</a></p>' +
      '<p class="hint">Gebruik geen echt wachtwoord: dit is alleen een demo.</p>' +
    '</div></div>';
  }

  function toonFormFout(tekst) {
    var el = document.getElementById('formfout');
    if (el) el.textContent = tekst || '';
  }

  function verwerkInloggen(form) {
    var w = formWaarden(form);
    var email = w.email.trim().toLowerCase();
    var fouten = {};
    toonFormFout('');
    if (!EMAIL_RE.test(email)) fouten.email = 'Vul een geldig e-mailadres in.';
    if (!w.wachtwoord) fouten.wachtwoord = 'Vul je wachtwoord in.';
    if (!toonFouten(form, fouten)) return;

    var gebruiker = getGebruikers().filter(function (u) { return u.email === email; })[0];
    if (!gebruiker) { toonFormFout('Onbekend e-mailadres of onjuist wachtwoord.'); return; }

    hashWachtwoord(w.wachtwoord, gebruiker.salt).then(function (hash) {
      if (hash !== gebruiker.hash) { toonFormFout('Onbekend e-mailadres of onjuist wachtwoord.'); return; }
      store.set(SESSIE, gebruiker.email);
      voegGastMandSamen();
      toast('Welkom terug, ' + gebruiker.naam.split(' ')[0] + '!');
      gaNaar(veiligeVolgende(form.getAttribute('data-next')));
    });
  }

  function verwerkRegistreren(form) {
    var w = formWaarden(form);
    var naam = w.naam.trim();
    var email = w.email.trim().toLowerCase();
    var fouten = {};
    toonFormFout('');
    if (naam.length < 2) fouten.naam = 'Vul je naam in.';
    if (!EMAIL_RE.test(email)) fouten.email = 'Vul een geldig e-mailadres in.';
    if (w.wachtwoord.length < 8) fouten.wachtwoord = 'Je wachtwoord moet minimaal 8 tekens bevatten.';
    if (w.herhaal !== w.wachtwoord) fouten.herhaal = 'De wachtwoorden komen niet overeen.';
    if (!toonFouten(form, fouten)) return;

    var gebruikers = getGebruikers();
    if (gebruikers.some(function (u) { return u.email === email; })) {
      toonFouten(form, { email: 'Er bestaat al een account met dit e-mailadres.' });
      return;
    }

    var salt = maakSalt();
    hashWachtwoord(w.wachtwoord, salt).then(function (hash) {
      gebruikers.push({ naam: naam, email: email, salt: salt, hash: hash, aangemaakt: new Date().toISOString() });
      store.set(GEBRUIKERS, gebruikers);
      store.set(SESSIE, email);
      voegGastMandSamen();
      toast('Je account is aangemaakt. Welkom, ' + naam.split(' ')[0] + '!');
      gaNaar(veiligeVolgende(form.getAttribute('data-next')));
    });
  }

  /* ---------- Account ---------- */

  function adresHtml(a) {
    var straat = esc(a.straat) + ' ' + esc(a.huisnummer) + (a.toevoeging ? ' ' + esc(a.toevoeging) : '');
    return esc(a.voornaam) + ' ' + esc(a.achternaam) + '<br>' + straat + '<br>' + esc(a.postcode) + ' ' + esc(a.woonplaats);
  }

  function renderAccount() {
    var u = huidigeGebruiker();
    var adres = store.get(adresSleutel(u.email), null);
    app.innerHTML = '<h1 class="page-title">Mijn account</h1>' +
      '<div class="two-col">' +
        '<section class="panel"><h2>Gegevens</h2>' +
          '<p><strong>' + esc(u.naam) + '</strong><br><span class="muted">' + esc(u.email) + '</span></p>' +
          '<h2 style="margin-top:1.25rem">Opgeslagen bezorgadres</h2>' +
          (adres
            ? '<div class="address-box">' + adresHtml(adres) + '</div>' +
              '<p style="margin-top:0.75rem"><button type="button" class="btn-link" data-action="delete-address">Adres verwijderen</button></p>'
            : '<p class="muted">Je hebt nog geen bezorgadres opgeslagen. Dat kun je doen tijdens het afrekenen.</p>') +
        '</section>' +
        '<aside class="panel"><h2>Acties</h2>' +
          '<div class="actions-row" style="margin-top:0">' +
            '<a class="btn btn-primary btn-block" href="#/winkelmand">Naar winkelmand</a>' +
            '<button type="button" class="btn btn-secondary btn-block" data-action="logout">Uitloggen</button>' +
          '</div>' +
        '</aside>' +
      '</div>';
  }

  /* ---------- Afrekenen (bezorgadres) ---------- */

  function bezorgdagen() {
    var uit = [];
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    var teller = 0;
    var fmt = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    while (uit.length < 6 && teller < 20) {
      d.setDate(d.getDate() + 1);
      teller++;
      if (d.getDay() === 0) continue; // geen bezorging op zondag
      var iso = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      uit.push({ waarde: iso, label: hoofdletter(fmt.format(d)) });
    }
    return uit;
  }

  var TIJDVAKKEN = ['08:00 – 12:00', '12:00 – 16:00', '16:00 – 20:00'];

  function renderAfrekenen() {
    var t = berekenTotalen();
    if (t.regels.length === 0) {
      app.innerHTML = '<h1 class="page-title">Bezorgadres</h1>' +
        '<div class="empty"><span class="big" aria-hidden="true">🧺</span>' +
        '<h2>Je winkelmand is leeg</h2><p class="muted">Voeg eerst producten toe voordat je gaat afrekenen.</p>' +
        '<a class="btn btn-primary" href="#/">Bekijk producten</a></div>';
      return;
    }

    var u = huidigeGebruiker();
    var a = u ? (store.get(adresSleutel(u.email), null) || {}) : {};
    var delen = u ? u.naam.split(' ') : [];
    var voornaam = a.voornaam || (delen.length ? delen[0] : '');
    var achternaam = a.achternaam || (delen.length > 1 ? delen.slice(1).join(' ') : '');
    var email = a.email || (u ? u.email : '');

    var dagen = bezorgdagen().map(function (d) {
      return '<option value="' + d.waarde + '">' + esc(d.label) + '</option>';
    }).join('');
    var vakken = TIJDVAKKEN.map(function (v) { return '<option value="' + v + '">' + v + '</option>'; }).join('');

    var gastMelding = u ? '' :
      '<div class="notice">Je bestelt als gast. Heb je een account? <a href="#/inloggen?next=/afrekenen">Log in</a> of <a href="#/registreren?next=/afrekenen">maak een account aan</a>.</div>';

    var regelsHtml = t.regels.map(function (r) {
      return '<div class="summary-row"><span>' + r.aantal + '× ' + esc(r.product.naam) + '</span><span>' + eur(r.totaal) + '</span></div>';
    }).join('');

    app.innerHTML = '<h1 class="page-title">Bezorgadres</h1>' + gastMelding +
      '<div class="notice warn"><strong>Demo:</strong> er wordt niets besteld en er wordt niet betaald.</div>' +
      '<div class="two-col">' +
        '<form class="panel" id="form-afrekenen" novalidate>' +
          '<div class="form-error" id="formfout" role="alert"></div>' +
          '<fieldset><legend>Jouw gegevens</legend><div class="form-grid cols-2">' +
            veld({ id: 'voornaam', label: 'Voornaam', required: true, autocomplete: 'given-name', value: voornaam }) +
            veld({ id: 'achternaam', label: 'Achternaam', required: true, autocomplete: 'family-name', value: achternaam }) +
            veld({ id: 'email', label: 'E-mailadres', type: 'email', required: true, autocomplete: 'email', inputmode: 'email', value: email }) +
            veld({ id: 'telefoon', label: 'Telefoonnummer', type: 'tel', autocomplete: 'tel', inputmode: 'tel', value: a.telefoon || '', placeholder: '06 12345678' }) +
          '</div></fieldset>' +
          '<fieldset><legend>Bezorgadres in Nederland</legend><div class="form-grid cols-2">' +
            veld({ id: 'postcode', label: 'Postcode', required: true, autocomplete: 'postal-code', maxlength: '7', value: a.postcode || '', placeholder: '1234 AB' }) +
            veld({ id: 'huisnummer', label: 'Huisnummer', required: true, inputmode: 'numeric', maxlength: '5', value: a.huisnummer || '' }) +
            veld({ id: 'toevoeging', label: 'Toevoeging', maxlength: '6', value: a.toevoeging || '', placeholder: 'bijv. A of 2' }) +
            veld({ id: 'straat', label: 'Straatnaam', required: true, autocomplete: 'address-line1', value: a.straat || '' }) +
            veld({ id: 'woonplaats', label: 'Woonplaats', required: true, autocomplete: 'address-level2', value: a.woonplaats || '', span2: true }) +
          '</div></fieldset>' +
          '<fieldset><legend>Bezorgmoment</legend><div class="form-grid cols-2">' +
            '<div class="field"><label for="bezorgdag">Bezorgdag</label><select id="bezorgdag" name="bezorgdag">' + dagen + '</select></div>' +
            '<div class="field"><label for="tijdvak">Tijdvak</label><select id="tijdvak" name="tijdvak">' + vakken + '</select></div>' +
            '<div class="field span-2"><label for="opmerking">Opmerking voor de bezorger <span class="optional">(optioneel)</span></label>' +
              '<textarea id="opmerking" name="opmerking" maxlength="200" placeholder="Bijvoorbeeld: bel aan bij de buren"></textarea></div>' +
          '</div></fieldset>' +
          (u ? '<label class="check" style="margin-bottom:1rem"><input type="checkbox" name="opslaan" checked> Bewaar dit adres in mijn account</label>' : '') +
          '<button class="btn btn-primary btn-block" type="submit">Demo-bestelling plaatsen</button>' +
        '</form>' +
        '<aside class="panel sticky" aria-label="Samenvatting van je bestelling"><h2>Je bestelling</h2>' + regelsHtml +
          '<div class="summary-row"><span>Bezorgkosten</span><span>' + (t.bezorg === 0 ? 'Gratis' : eur(t.bezorg)) + '</span></div>' +
          '<div class="summary-row total"><span>Totaal</span><span>' + eur(t.totaal) + '</span></div>' +
          '<p style="margin-top:0.75rem"><a href="#/winkelmand">Winkelmand aanpassen</a></p>' +
        '</aside>' +
      '</div>';
  }

  function valideerAdres(w) {
    var f = {};
    if (!w.voornaam.trim()) f.voornaam = 'Vul je voornaam in.';
    if (!w.achternaam.trim()) f.achternaam = 'Vul je achternaam in.';
    if (!EMAIL_RE.test(w.email.trim())) f.email = 'Vul een geldig e-mailadres in.';
    var tel = w.telefoon.replace(/[\s\-()]/g, '');
    if (tel && !/^(\+31|0031|0)[1-9][0-9]{8}$/.test(tel)) f.telefoon = 'Vul een geldig Nederlands telefoonnummer in, bijvoorbeeld 06 12345678.';
    if (!/^[1-9][0-9]{3}\s?[A-Za-z]{2}$/.test(w.postcode.trim())) f.postcode = 'Vul een geldige postcode in, bijvoorbeeld 1234 AB.';
    if (!/^[1-9][0-9]{0,4}$/.test(w.huisnummer.trim())) f.huisnummer = 'Vul een geldig huisnummer in (alleen cijfers).';
    if (w.toevoeging.trim().length > 6) f.toevoeging = 'De toevoeging mag maximaal 6 tekens bevatten.';
    if (w.straat.trim().length < 2) f.straat = 'Vul je straatnaam in.';
    if (w.woonplaats.trim().length < 2) f.woonplaats = 'Vul je woonplaats in.';
    return f;
  }

  function verwerkAfrekenen(form) {
    var w = formWaarden(form);
    toonFormFout('');
    if (!toonFouten(form, valideerAdres(w))) {
      toonFormFout('Controleer de gemarkeerde velden.');
      return;
    }
    var t = berekenTotalen();
    if (t.regels.length === 0) { gaNaar('/winkelmand'); return; }

    var pc = w.postcode.replace(/\s/g, '').toUpperCase();
    var adres = {
      voornaam: w.voornaam.trim(),
      achternaam: w.achternaam.trim(),
      email: w.email.trim().toLowerCase(),
      telefoon: w.telefoon.trim(),
      postcode: pc.slice(0, 4) + ' ' + pc.slice(4),
      huisnummer: w.huisnummer.trim(),
      toevoeging: w.toevoeging.trim(),
      straat: w.straat.trim(),
      woonplaats: w.woonplaats.trim()
    };

    var u = huidigeGebruiker();
    if (u && w.opslaan) store.set(adresSleutel(u.email), adres);

    var dagSelect = form.querySelector('#bezorgdag');
    var dagLabel = dagSelect.options[dagSelect.selectedIndex].text;

    var bestelling = {
      nummer: 'SW-' + Date.now().toString(36).toUpperCase().slice(-6),
      adres: adres,
      dag: dagLabel,
      tijdvak: w.tijdvak,
      opmerking: w.opmerking.trim(),
      regels: t.regels.map(function (r) {
        return { naam: r.product.naam, aantal: r.aantal, totaal: r.totaal };
      }),
      bezorg: t.bezorg,
      totaal: t.totaal
    };

    try { sessionStorage.setItem(BESTELLING, JSON.stringify(bestelling)); }
    catch (e) { geheugen[BESTELLING] = bestelling; }

    setMand({});
    gaNaar('/bevestiging');
  }

  function renderBevestiging() {
    var b = null;
    try { b = JSON.parse(sessionStorage.getItem(BESTELLING)); } catch (e) { b = null; }
    if (!b && geheugen[BESTELLING]) b = geheugen[BESTELLING];
    if (!b) { gaNaar('/'); return; }

    var regels = b.regels.map(function (r) {
      return '<div class="summary-row"><span>' + r.aantal + '× ' + esc(r.naam) + '</span><span>' + eur(r.totaal) + '</span></div>';
    }).join('');

    app.innerHTML = '<div class="auth-wrap" style="max-width:640px"><div class="panel">' +
      '<div class="confirm-icon" aria-hidden="true">✅</div>' +
      '<h1 style="text-align:center">Bedankt voor je demo-bestelling!</h1>' +
      '<p class="muted" style="text-align:center">Dit was een demo. Er is niets besteld en er is niets betaald. Referentie: <strong>' + esc(b.nummer) + '</strong></p>' +
      '<h2>Bezorgadres</h2><div class="address-box">' + adresHtml(b.adres) + '</div>' +
      '<h2 style="margin-top:1rem">Bezorgmoment</h2>' +
      '<p>' + esc(b.dag) + ', ' + esc(b.tijdvak) + '</p>' +
      (b.opmerking ? '<p class="muted">Opmerking: ' + esc(b.opmerking) + '</p>' : '') +
      '<h2 style="margin-top:1rem">Overzicht</h2>' + regels +
      '<div class="summary-row"><span>Bezorgkosten</span><span>' + (b.bezorg === 0 ? 'Gratis' : eur(b.bezorg)) + '</span></div>' +
      '<div class="summary-row total"><span>Totaal</span><span>' + eur(b.totaal) + '</span></div>' +
      '<p style="margin-top:1rem"><a class="btn btn-primary btn-block" href="#/">Terug naar de winkel</a></p>' +
    '</div></div>';
  }

  function renderNietGevonden() {
    app.innerHTML = '<div class="empty"><span class="big" aria-hidden="true">🤷</span>' +
      '<h1>Pagina niet gevonden</h1><p class="muted">Deze pagina bestaat niet.</p>' +
      '<a class="btn btn-primary" href="#/">Naar de startpagina</a></div>';
  }

  /* ---------- Events ---------- */

  function naMandWijziging() {
    updateHeader();
    var pad = huidigPad();
    if (pad === '/') renderGrid();
    else if (pad === '/winkelmand') renderMandPagina();
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var actie = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');

    switch (actie) {
      case 'add':
        wijzigAantal(id, 1);
        toast(productMap[id].naam + ' toegevoegd');
        naMandWijziging();
        break;
      case 'inc':
        wijzigAantal(id, 1);
        naMandWijziging();
        break;
      case 'dec':
        wijzigAantal(id, -1);
        naMandWijziging();
        break;
      case 'remove':
        verwijderUitMand(id);
        toast(productMap[id].naam + ' verwijderd');
        naMandWijziging();
        break;
      case 'clear':
        if (window.confirm('Weet je zeker dat je je winkelmand wilt leegmaken?')) {
          setMand({});
          naMandWijziging();
        }
        break;
      case 'cat':
        state.categorie = el.getAttribute('data-cat');
        document.querySelectorAll('.chip').forEach(function (c) {
          c.classList.toggle('active', c.getAttribute('data-cat') === state.categorie);
        });
        renderGrid();
        break;
      case 'reset-filters':
        state.query = '';
        state.categorie = 'alle';
        zoekveld.value = '';
        renderCatalogus();
        break;
      case 'logout':
        store.remove(SESSIE);
        toast('Je bent uitgelogd');
        gaNaar('/');
        updateHeader();
        break;
      case 'delete-address':
        var u = huidigeGebruiker();
        if (u) store.remove(adresSleutel(u.email));
        toast('Adres verwijderd');
        renderAccount();
        break;
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target && e.target.hasAttribute('data-sort')) {
      state.sortering = e.target.value;
      renderGrid();
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.id === 'form-inloggen') { e.preventDefault(); verwerkInloggen(form); }
    else if (form.id === 'form-registreren') { e.preventDefault(); verwerkRegistreren(form); }
    else if (form.id === 'form-afrekenen') { e.preventDefault(); verwerkAfrekenen(form); }
  });

  zoekveld.addEventListener('input', function () {
    state.query = zoekveld.value;
    if (huidigPad() === '/') renderGrid();
    else gaNaar('/');
  });

  zoekformulier.addEventListener('submit', function (e) {
    e.preventDefault();
    state.query = zoekveld.value;
    if (huidigPad() === '/') renderGrid(); else gaNaar('/');
    zoekveld.blur();
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('storage', function () { updateHeader(); });

  route();
})();
