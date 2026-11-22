/* Shopwise – applicatielogica (alleen Nederlands, demo), met Firebase */
(function () {
  'use strict';

  var cloud = window.ShopwiseCloud || null;
  var PRODUCTS = window.SHOPWISE_PRODUCTS || [];
  var CATEGORIES = window.SHOPWISE_CATEGORIES || [];

  var GRATIS_VANAF = 5000;   // eurocenten
  var BEZORGKOSTEN = 395;    // eurocenten
  var MAX_AANTAL = 20;

  var GAST_MAND = 'shopwise_mand_gast';
  var BESTELLING = 'shopwise_bestelling';

  var CLOUD_UIT = 'Inloggen is op dit moment niet beschikbaar. Controleer je internetverbinding en laad de pagina opnieuw.';

  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var zoekveld = document.getElementById('zoekveld');
  var zoekformulier = document.getElementById('zoekformulier');

  var state = { query: '', categorie: 'alle', sortering: 'aanbevolen' };

  /* Accountstatus (komt uit Firebase) */
  var gebruiker = null;            // { uid, naam, email, provider } of null
  var accountMand = {};            // winkelmand van de ingelogde gebruiker
  var opgeslagenAdres = null;      // bezorgadres uit Firestore
  var mandGeladen = true;          // false zolang de cloud-gegevens laden
  var cloudOk = true;              // false als laden uit Firestore mislukte
  var authKlaar = false;           // true zodra we weten of iemand is ingelogd
  var syncTeller = 0;
  var opslagTimer = null;
  var opslagOpen = false;

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
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
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
  function toast(tekst, duur) {
    toastEl.textContent = tekst;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, duur || 2200);
  }

  function gaNaar(pad) {
    if (location.hash === '#' + pad) route(); else location.hash = '#' + pad;
  }

  function toonLaden() {
    app.innerHTML = '<div class="empty"><span class="big" aria-hidden="true">🛒</span>' +
      '<p class="muted" role="status">Even laden…</p></div>';
  }

  /* ---------- Winkelmand ---------- */

  function cacheSleutel(uid) { return 'shopwise_mand_' + uid; }

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

  function getMand() {
    if (gebruiker) return schoonMand(accountMand);
    return schoonMand(store.get(GAST_MAND, {}));
  }

  function setMand(mand) {
    if (gebruiker) {
      accountMand = mand;
      store.set(cacheSleutel(gebruiker.uid), mand);   // lokale reserve-kopie
      plannenOpslag();
    } else {
      store.set(GAST_MAND, mand);
    }
  }

  function plannenOpslag() {
    if (!cloud || !gebruiker || !cloudOk) return;
    opslagOpen = true;
    clearTimeout(opslagTimer);
    opslagTimer = setTimeout(spoelOpslag, 500);
  }

  function spoelOpslag() {
    clearTimeout(opslagTimer);
    if (!opslagOpen || !cloud || !gebruiker || !cloudOk) {
      opslagOpen = false;
      return Promise.resolve();
    }
    opslagOpen = false;
    return cloud.bewaarMand(gebruiker.uid, schoonMand(accountMand)).catch(function () {
      toast('Je winkelmand kon niet worden opgeslagen in je account.', 4000);
    });
  }

  function wijzigAantal(id, delta) {
    if (!productMap[id]) return false;
    if (gebruiker && !mandGeladen) {
      toast('Je winkelmand wordt nog geladen…');
      return false;
    }
    var mand = getMand();
    var nieuw = (mand[id] || 0) + delta;
    if (nieuw > MAX_AANTAL) {
      toast('Maximaal ' + MAX_AANTAL + ' stuks per product');
      nieuw = MAX_AANTAL;
    }
    if (nieuw <= 0) delete mand[id]; else mand[id] = nieuw;
    setMand(mand);
    return true;
  }

  function verwijderUitMand(id) {
    var mand = getMand();
    delete mand[id];
    setMand(mand);
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

  /* ---------- Synchronisatie met Firebase ---------- */

  function opAuth(user) {
    var mijn = ++syncTeller;
    clearTimeout(opslagTimer);
    opslagOpen = false;

    if (!user) {
      gebruiker = null;
      accountMand = {};
      opgeslagenAdres = null;
      mandGeladen = true;
      cloudOk = true;
      authKlaar = true;
      route();
      return;
    }

    gebruiker = user;
    accountMand = {};
    opgeslagenAdres = null;
    mandGeladen = false;
    cloudOk = true;

    Promise.all([cloud.laadMand(user.uid), cloud.laadAdres(user.uid)]).then(
      function (res) { klaarMetSync(mijn, true, res[0], res[1]); },
      function (err) {
        if (window.console) console.error('Laden uit Firestore mislukt', err);
        klaarMetSync(mijn, false, null, null);
      }
    );
  }

  function klaarMetSync(mijn, gelukt, cloudMand, cloudAdres) {
    if (mijn !== syncTeller || !gebruiker) return;

    var samen = gelukt
      ? schoonMand(cloudMand)
      : schoonMand(store.get(cacheSleutel(gebruiker.uid), {}));

    /* Winkelmand van de gast samenvoegen met de winkelmand van het account. */
    var gast = schoonMand(store.get(GAST_MAND, {}));
    var heeftGast = Object.keys(gast).length > 0;
    Object.keys(gast).forEach(function (id) {
      samen[id] = Math.min((samen[id] || 0) + gast[id], MAX_AANTAL);
    });
    if (heeftGast && gelukt) store.remove(GAST_MAND);

    accountMand = samen;
    store.set(cacheSleutel(gebruiker.uid), samen);
    opgeslagenAdres = gelukt ? cloudAdres : null;
    cloudOk = gelukt;
    mandGeladen = true;
    authKlaar = true;

    if (gelukt) {
      if (heeftGast) { opslagOpen = true; spoelOpslag(); }
      cloud.bewaarProfiel(gebruiker.uid, { naam: gebruiker.naam, email: gebruiker.email })
        .catch(function () { /* profiel is niet essentieel */ });
    } else {
      toast('Je accountgegevens konden niet worden geladen. Je winkelmand wordt nu alleen op dit apparaat bewaard.', 5000);
    }

    route();
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

    var acc = document.getElementById('nav-account');
    acc.textContent = gebruiker ? 'Mijn account' : 'Inloggen';
    acc.setAttribute('href', gebruiker ? '#/account' : '#/inloggen');

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
    if (!authKlaar) { toonLaden(); return; }

    var r = parseHash();
    var pad = r.pad;

    if (pad === '/account' && !gebruiker) { gaNaar('/inloggen'); return; }
    if ((pad === '/inloggen' || pad === '/registreren') && gebruiker) {
      gaNaar(r.params.next ? veiligeVolgende(r.params.next) : '/account');
      return;
    }

    /* Wacht tot de gegevens van het account zijn geladen. */
    if (gebruiker && !mandGeladen && (pad === '/winkelmand' || pad === '/afrekenen' || pad === '/account')) {
      toonLaden();
      updateHeader();
      return;
    }

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

    var opslagTekst;
    var noticeKlasse = 'notice';
    if (gebruiker && cloudOk) {
      opslagTekst = 'Je winkelmand wordt bewaard in je account (' + esc(gebruiker.email) + ').';
    } else if (gebruiker) {
      opslagTekst = 'Let op: je account is niet bereikbaar. Je winkelmand wordt tijdelijk alleen op dit apparaat bewaard.';
      noticeKlasse = 'notice warn';
    } else {
      opslagTekst = 'Je winkelmand wordt op dit apparaat bewaard. <a href="#/inloggen?next=/winkelmand">Log in</a> om hem aan je account te koppelen.';
    }

    var knoppen = '<div class="actions-row">' +
      '<a class="btn btn-primary btn-block" href="#/afrekenen">Naar bezorgadres</a>' +
      '<a class="btn btn-secondary btn-block" href="#/">Verder winkelen</a>' +
      '</div>' +
      '<p style="margin-top:1rem"><button type="button" class="btn-link" data-action="clear">Winkelmand leegmaken</button></p>';

    app.innerHTML = '<h1 class="page-title">Winkelmand</h1>' +
      '<div class="' + noticeKlasse + '">' + opslagTekst + '</div>' +
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

  function toonFormFout(tekst) {
    var el = document.getElementById('formfout');
    if (el) el.textContent = tekst || '';
  }

  function zetBezig(knop, bezig) {
    if (!knop) return;
    knop.disabled = bezig;
    if (bezig) {
      knop.setAttribute('data-label', knop.textContent);
      knop.textContent = 'Bezig…';
    } else if (knop.hasAttribute('data-label')) {
      knop.textContent = knop.getAttribute('data-label');
    }
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- Foutmeldingen van Firebase in het Nederlands ---------- */

  function foutTekst(err) {
    var code = err && err.code ? err.code : '';
    switch (code) {
      case 'auth/email-already-in-use':
        return 'Er bestaat al een account met dit e-mailadres.';
      case 'auth/invalid-email':
        return 'Vul een geldig e-mailadres in.';
      case 'auth/weak-password':
        return 'Je wachtwoord is te zwak. Kies minimaal 8 tekens.';
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Onbekend e-mailadres of onjuist wachtwoord.';
      case 'auth/user-disabled':
        return 'Dit account is uitgeschakeld.';
      case 'auth/too-many-requests':
        return 'Te veel pogingen. Wacht even en probeer het later opnieuw.';
      case 'auth/network-request-failed':
        return 'Geen verbinding. Controleer je internet en probeer het opnieuw.';
      case 'auth/popup-closed-by-user':
        return 'Het inlogvenster is gesloten voordat je was ingelogd.';
      case 'auth/cancelled-popup-request':
        return '';
      case 'auth/popup-blocked':
        return 'Je browser blokkeerde het inlogvenster. Sta pop-ups toe voor deze website en probeer het opnieuw.';
      case 'auth/unauthorized-domain':
        return 'Dit domein is nog niet toegestaan in Firebase. Voeg het toe bij Authentication, Instellingen, Geautoriseerde domeinen.';
      case 'auth/operation-not-allowed':
        return 'Deze inlogmethode is nog niet ingeschakeld in Firebase.';
      default:
        return 'Er ging iets mis. Probeer het later opnieuw.';
    }
  }

  function toonAuthFout(form, err) {
    var code = err && err.code ? err.code : '';
    var tekst = foutTekst(err);
    if (!tekst) return;
    if (code === 'auth/email-already-in-use' || code === 'auth/invalid-email') toonFouten(form, { email: tekst });
    else if (code === 'auth/weak-password') toonFouten(form, { wachtwoord: tekst });
    else toonFormFout(tekst);
  }

  /* ---------- Inloggen & registreren ---------- */

  function googleKnopHtml(volgende) {
    return '<button type="button" class="btn btn-google btn-block" data-action="google" data-next="' + esc(volgende) + '">' +
      '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
      '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
      '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
      '</svg><span>Doorgaan met Google</span></button>';
  }

  function renderInloggen(params) {
    var volgende = veiligeVolgende(params.next || '/');
    app.innerHTML = '<div class="auth-wrap"><div class="panel">' +
      '<h1>Inloggen</h1>' +
      '<p class="muted">Log in om je winkelmand en bezorgadres in je account te bewaren.</p>' +
      '<div class="form-error" id="formfout" role="alert">' + (cloud ? '' : esc(CLOUD_UIT)) + '</div>' +
      googleKnopHtml(volgende) +
      '<div class="divider"><span>of</span></div>' +
      '<form id="form-inloggen" novalidate data-next="' + esc(volgende) + '">' +
        '<div class="form-grid">' +
          veld({ id: 'email', label: 'E-mailadres', type: 'email', required: true, autocomplete: 'email', inputmode: 'email', maxlength: '120' }) +
          veld({ id: 'wachtwoord', label: 'Wachtwoord', type: 'password', required: true, autocomplete: 'current-password' }) +
        '</div>' +
        '<p class="forgot"><button type="button" class="btn-link neutral" data-action="reset">Wachtwoord vergeten?</button></p>' +
        '<p style="margin-top:1rem"><button class="btn btn-primary btn-block" type="submit">Inloggen</button></p>' +
      '</form>' +
      '<p class="alt">Nog geen account? <a href="#/registreren?next=' + encodeURIComponent(volgende) + '">Account aanmaken</a></p>' +
      '<p class="hint">Dit is een demo-winkel. Er worden geen echte bestellingen geplaatst.</p>' +
    '</div></div>';
  }

  function renderRegistreren(params) {
    var volgende = veiligeVolgende(params.next || '/');
    app.innerHTML = '<div class="auth-wrap"><div class="panel">' +
      '<h1>Account aanmaken</h1>' +
      '<p class="muted">Maak gratis een demo-account aan.</p>' +
      '<div class="form-error" id="formfout" role="alert">' + (cloud ? '' : esc(CLOUD_UIT)) + '</div>' +
      googleKnopHtml(volgende) +
      '<div class="divider"><span>of met e-mail</span></div>' +
      '<form id="form-registreren" novalidate data-next="' + esc(volgende) + '">' +
        '<div class="form-grid">' +
          veld({ id: 'naam', label: 'Volledige naam', required: true, autocomplete: 'name', maxlength: '100' }) +
          veld({ id: 'email', label: 'E-mailadres', type: 'email', required: true, autocomplete: 'email', inputmode: 'email', maxlength: '120' }) +
          veld({ id: 'wachtwoord', label: 'Wachtwoord', type: 'password', required: true, autocomplete: 'new-password', hint: 'Minimaal 8 tekens.' }) +
          veld({ id: 'herhaal', label: 'Herhaal wachtwoord', type: 'password', required: true, autocomplete: 'new-password' }) +
        '</div>' +
        '<p style="margin-top:1rem"><button class="btn btn-primary btn-block" type="submit">Account aanmaken</button></p>' +
      '</form>' +
      '<p class="alt">Heb je al een account? <a href="#/inloggen?next=' + encodeURIComponent(volgende) + '">Inloggen</a></p>' +
      '<p class="hint">Met een account bewaren we je naam, e-mailadres, winkelmand en bezorgadres in Firebase (Google Cloud).</p>' +
    '</div></div>';
  }

  function verwerkInloggen(form) {
    var w = formWaarden(form);
    var email = w.email.trim().toLowerCase();
    var fouten = {};
    toonFormFout('');
    if (!EMAIL_RE.test(email)) fouten.email = 'Vul een geldig e-mailadres in.';
    if (!w.wachtwoord) fouten.wachtwoord = 'Vul je wachtwoord in.';
    if (!toonFouten(form, fouten)) return;
    if (!cloud) { toonFormFout(CLOUD_UIT); return; }

    var knop = form.querySelector('button[type="submit"]');
    zetBezig(knop, true);
    var volgende = veiligeVolgende(form.getAttribute('data-next'));

    cloud.inloggen(email, w.wachtwoord).then(
      function () {
        toast('Je bent ingelogd.');
        gaNaar(volgende);
      },
      function (err) {
        zetBezig(knop, false);
        toonAuthFout(form, err);
      }
    );
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
    if (!cloud) { toonFormFout(CLOUD_UIT); return; }

    var knop = form.querySelector('button[type="submit"]');
    zetBezig(knop, true);
    var volgende = veiligeVolgende(form.getAttribute('data-next'));

    cloud.registreer(naam, email, w.wachtwoord).then(
      function () {
        toast('Je account is aangemaakt. Welkom, ' + naam.split(' ')[0] + '!');
        gaNaar(volgende);
      },
      function (err) {
        zetBezig(knop, false);
        toonAuthFout(form, err);
      }
    );
  }

  function startGoogle(knop) {
    toonFormFout('');
    if (!cloud) { toonFormFout(CLOUD_UIT); return; }
    var volgende = veiligeVolgende(knop.getAttribute('data-next'));
    knop.disabled = true;
    cloud.inloggenGoogle().then(
      function () {
        toast('Je bent ingelogd.');
        gaNaar(volgende);
      },
      function (err) {
        knop.disabled = false;
        var tekst = foutTekst(err);
        if (tekst) toonFormFout(tekst);
      }
    );
  }

  function startWachtwoordReset() {
    var form = document.getElementById('form-inloggen');
    var invoer = document.getElementById('email');
    var email = invoer ? invoer.value.trim().toLowerCase() : '';
    toonFormFout('');
    if (!form) return;
    if (!EMAIL_RE.test(email)) {
      toonFouten(form, { email: 'Vul eerst je e-mailadres in.' });
      return;
    }
    if (!cloud) { toonFormFout(CLOUD_UIT); return; }
    cloud.resetWachtwoord(email).then(
      function () {
        toonFouten(form, {});
        toast('Als dit e-mailadres bij een account hoort, is er een e-mail verstuurd.', 5000);
      },
      function (err) { toonFormFout(foutTekst(err)); }
    );
  }

  function logUit() {
    if (!cloud || !gebruiker) return;
    var uid = gebruiker.uid;
    spoelOpslag().then(function () {
      return cloud.uitloggen();
    }).then(function () {
      store.remove(cacheSleutel(uid));
      try { sessionStorage.removeItem(BESTELLING); } catch (e) { /* negeren */ }
      delete geheugen[BESTELLING];
      toast('Je bent uitgelogd');
      gaNaar('/');
    }, function () {
      toast('Uitloggen is niet gelukt. Probeer het opnieuw.');
    });
  }

  /* ---------- Account ---------- */

  function adresHtml(a) {
    var straat = esc(a.straat) + ' ' + esc(a.huisnummer) + (a.toevoeging ? ' ' + esc(a.toevoeging) : '');
    return esc(a.voornaam) + ' ' + esc(a.achternaam) + '<br>' + straat + '<br>' + esc(a.postcode) + ' ' + esc(a.woonplaats);
  }

  function renderAccount() {
    var u = gebruiker;
    var via = u.provider === 'google.com' ? 'Ingelogd met Google' : 'Ingelogd met e-mail en wachtwoord';
    app.innerHTML = '<h1 class="page-title">Mijn account</h1>' +
      '<div class="two-col">' +
        '<section class="panel"><h2>Gegevens</h2>' +
          '<p><strong>' + esc(u.naam) + '</strong><br><span class="muted">' + esc(u.email) + '</span><br><span class="muted">' + via + '</span></p>' +
          '<h2 style="margin-top:1.25rem">Opgeslagen bezorgadres</h2>' +
          (opgeslagenAdres
            ? '<div class="address-box">' + adresHtml(opgeslagenAdres) + '</div>' +
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

  function verwijderOpgeslagenAdres() {
    if (!gebruiker || !cloud) return;
    cloud.verwijderAdres(gebruiker.uid).then(
      function () {
        opgeslagenAdres = null;
        toast('Adres verwijderd');
        if (gebruiker && huidigPad() === '/account') renderAccount();
      },
      function () { toast('Het adres kon niet worden verwijderd.', 4000); }
    );
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

    var u = gebruiker;
    var a = u ? (opgeslagenAdres || {}) : {};
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

    var opslaanHtml = '';
    if (u && cloudOk) {
      opslaanHtml = '<label class="check" style="margin-bottom:1rem"><input type="checkbox" name="opslaan" checked> Bewaar dit adres in mijn account</label>';
    }

    app.innerHTML = '<h1 class="page-title">Bezorgadres</h1>' + gastMelding +
      '<div class="notice warn"><strong>Demo:</strong> er wordt niets besteld en er wordt niet betaald.</div>' +
      '<div class="two-col">' +
        '<form class="panel" id="form-afrekenen" novalidate>' +
          '<div class="form-error" id="formfout" role="alert"></div>' +
          '<fieldset><legend>Jouw gegevens</legend><div class="form-grid cols-2">' +
            veld({ id: 'voornaam', label: 'Voornaam', required: true, autocomplete: 'given-name', maxlength: '60', value: voornaam }) +
            veld({ id: 'achternaam', label: 'Achternaam', required: true, autocomplete: 'family-name', maxlength: '80', value: achternaam }) +
            veld({ id: 'email', label: 'E-mailadres', type: 'email', required: true, autocomplete: 'email', inputmode: 'email', maxlength: '120', value: email }) +
            veld({ id: 'telefoon', label: 'Telefoonnummer', type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: '30', value: a.telefoon || '', placeholder: '06 12345678' }) +
          '</div></fieldset>' +
          '<fieldset><legend>Bezorgadres in Nederland</legend><div class="form-grid cols-2">' +
            veld({ id: 'postcode', label: 'Postcode', required: true, autocomplete: 'postal-code', maxlength: '7', value: a.postcode || '', placeholder: '1234 AB' }) +
            veld({ id: 'huisnummer', label: 'Huisnummer', required: true, inputmode: 'numeric', maxlength: '5', value: a.huisnummer || '' }) +
            veld({ id: 'toevoeging', label: 'Toevoeging', maxlength: '6', value: a.toevoeging || '', placeholder: 'bijv. A of 2' }) +
            veld({ id: 'straat', label: 'Straatnaam', required: true, autocomplete: 'address-line1', maxlength: '80', value: a.straat || '' }) +
            veld({ id: 'woonplaats', label: 'Woonplaats', required: true, autocomplete: 'address-level2', maxlength: '60', value: a.woonplaats || '', span2: true }) +
          '</div></fieldset>' +
          '<fieldset><legend>Bezorgmoment</legend><div class="form-grid cols-2">' +
            '<div class="field"><label for="bezorgdag">Bezorgdag</label><select id="bezorgdag" name="bezorgdag">' + dagen + '</select></div>' +
            '<div class="field"><label for="tijdvak">Tijdvak</label><select id="tijdvak" name="tijdvak">' + vakken + '</select></div>' +
            '<div class="field span-2"><label for="opmerking">Opmerking voor de bezorger <span class="optional">(optioneel)</span></label>' +
              '<textarea id="opmerking" name="opmerking" maxlength="200" placeholder="Bijvoorbeeld: bel aan bij de buren"></textarea></div>' +
          '</div></fieldset>' +
          opslaanHtml +
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
    var voornaam = w.voornaam.trim();
    var achternaam = w.achternaam.trim();
    var straat = w.straat.trim();
    var plaats = w.woonplaats.trim();
    var mail = w.email.trim();

    if (!voornaam) f.voornaam = 'Vul je voornaam in.';
    else if (voornaam.length > 60) f.voornaam = 'Je voornaam mag maximaal 60 tekens bevatten.';

    if (!achternaam) f.achternaam = 'Vul je achternaam in.';
    else if (achternaam.length > 80) f.achternaam = 'Je achternaam mag maximaal 80 tekens bevatten.';

    if (!EMAIL_RE.test(mail) || mail.length > 120) f.email = 'Vul een geldig e-mailadres in.';

    var tel = w.telefoon.replace(/[\s\-()]/g, '');
    if (tel && (!/^(\+31|0031|0)[1-9][0-9]{8}$/.test(tel) || w.telefoon.trim().length > 30)) {
      f.telefoon = 'Vul een geldig Nederlands telefoonnummer in, bijvoorbeeld 06 12345678.';
    }
    if (!/^[1-9][0-9]{3}\s?[A-Za-z]{2}$/.test(w.postcode.trim())) f.postcode = 'Vul een geldige postcode in, bijvoorbeeld 1234 AB.';
    if (!/^[1-9][0-9]{0,4}$/.test(w.huisnummer.trim())) f.huisnummer = 'Vul een geldig huisnummer in (alleen cijfers).';
    if (w.toevoeging.trim().length > 6) f.toevoeging = 'De toevoeging mag maximaal 6 tekens bevatten.';

    if (straat.length < 2) f.straat = 'Vul je straatnaam in.';
    else if (straat.length > 80) f.straat = 'De straatnaam mag maximaal 80 tekens bevatten.';

    if (plaats.length < 2) f.woonplaats = 'Vul je woonplaats in.';
    else if (plaats.length > 60) f.woonplaats = 'De woonplaats mag maximaal 60 tekens bevatten.';
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
    var adresGegevens = {
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

    if (gebruiker && cloud && cloudOk && w.opslaan) {
      var uid = gebruiker.uid;
      opgeslagenAdres = adresGegevens;
      cloud.bewaarAdres(uid, adresGegevens).catch(function () {
        toast('Je adres kon niet worden opgeslagen in je account.', 4000);
      });
    }

    var dagSelect = form.querySelector('#bezorgdag');
    var dagLabel = dagSelect.options[dagSelect.selectedIndex].text;

    var bestelling = {
      nummer: 'SW-' + Date.now().toString(36).toUpperCase().slice(-6),
      adres: adresGegevens,
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
        if (wijzigAantal(id, 1)) toast(productMap[id].naam + ' toegevoegd');
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
      case 'google':
        startGoogle(el);
        break;
      case 'reset':
        startWachtwoordReset();
        break;
      case 'logout':
        logUit();
        break;
      case 'delete-address':
        verwijderOpgeslagenAdres();
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

  /* Wijzigingen in de winkelmand direct opslaan als de pagina op de achtergrond gaat. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') spoelOpslag();
  });
  window.addEventListener('pagehide', function () { spoelOpslag(); });

  /* ---------- Start ---------- */

  /* Oude lokale demo-accounts uit de eerste versie opruimen. */
  store.remove('shopwise_gebruikers');
  store.remove('shopwise_sessie');

  if (cloud) {
    toonLaden();
    cloud.onAuth(opAuth);
    /* Vangnet: als Firebase niet reageert, toch de winkel tonen. */
    setTimeout(function () {
      if (!authKlaar) { authKlaar = true; route(); }
    }, 8000);
  } else {
    authKlaar = true;
    route();
  }
})();
