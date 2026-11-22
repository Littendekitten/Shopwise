/* Shopwise – voorbeeldassortiment. Prijzen zijn DEMO-prijzen in eurocenten,
   niet afkomstig uit live winkelbestanden. Werkelijke prijzen verschillen per filiaal en datum. */
window.SHOPWISE_STORES = [
  { id: 'lidl', naam: 'Lidl', url: 'https://www.lidl.nl/', logo: 'https://www.lidl.nl/favicon.ico', type: 'supermarkt' },
  { id: 'ah', naam: 'Albert Heijn', url: 'https://www.ah.nl/', logo: 'https://www.ah.nl/favicon.ico', type: 'supermarkt' },
  { id: 'jumbo', naam: 'Jumbo', url: 'https://www.jumbo.com/', logo: 'https://www.jumbo.com/favicon.ico', type: 'supermarkt' },
  { id: 'vomar', naam: 'Vomar', url: 'https://www.vomar.nl/', logo: 'https://www.vomar.nl/favicon.ico', type: 'supermarkt' },
  { id: 'deka', naam: 'DekaMarkt', url: 'https://www.dekamarkt.nl/', logo: 'https://www.dekamarkt.nl/favicon.ico', type: 'supermarkt' },
  { id: 'action', naam: 'Action', url: 'https://www.action.com/nl-nl/', logo: 'https://www.action.com/favicon.ico', type: 'overig' },
  { id: 'kruidvat', naam: 'Kruidvat', url: 'https://www.kruidvat.nl/', logo: 'https://www.kruidvat.nl/favicon.ico', type: 'overig' }
];

window.SHOPWISE_CATEGORIES = [
  { id: 'groente', naam: 'Groente & fruit' },
  { id: 'zuivel', naam: 'Zuivel & eieren' },
  { id: 'brood', naam: 'Brood & bakkerij' },
  { id: 'vlees', naam: 'Vlees, vis & vega' },
  { id: 'dranken', naam: 'Dranken' },
  { id: 'snacks', naam: 'Snacks & snoep' },
  { id: 'voorraad', naam: 'Houdbaar' },
  { id: 'huishouden', naam: 'Huishouden' },
  { id: 'drogisterij', naam: 'Drogisterij & verzorging' }
];

/* Basisproducten. De prijzen per winkel worden hieronder als herkenbare demo-data opgebouwd. */
var shopwiseBasisProducten = [
  { id: 'p01', naam: 'Bananen', categorie: 'groente', prijs: 199, eenheid: 'per kg', emoji: '🍌', omschrijving: 'Rijpe, zoete bananen' },
  { id: 'p02', naam: 'Elstar appels', categorie: 'groente', prijs: 249, eenheid: 'per kg', emoji: '🍎', omschrijving: 'Knapperige appels' },
  { id: 'p03', naam: 'Tomaten', categorie: 'groente', prijs: 229, eenheid: '500 g', emoji: '🍅', omschrijving: 'Trostomaten' },
  { id: 'p04', naam: 'Komkommer', categorie: 'groente', prijs: 89, eenheid: 'per stuk', emoji: '🥒', omschrijving: 'Verse komkommer' },
  { id: 'p05', naam: 'Winterpeen', categorie: 'groente', prijs: 119, eenheid: 'per kg', emoji: '🥕', omschrijving: 'Wortelen' },
  { id: 'p06', naam: 'Broccoli', categorie: 'groente', prijs: 149, eenheid: 'per stuk', emoji: '🥦', omschrijving: 'Verse broccoli' },
  { id: 'p07', naam: 'Halfvolle melk', categorie: 'zuivel', prijs: 115, eenheid: '1 liter', emoji: '🥛', omschrijving: 'Halfvolle melk' },
  { id: 'p08', naam: 'Jonge kaas', categorie: 'zuivel', prijs: 499, eenheid: '500 g', emoji: '🧀', omschrijving: 'Jonge Goudse kaas' },
  { id: 'p09', naam: 'Scharreleieren', categorie: 'zuivel', prijs: 289, eenheid: '10 stuks', emoji: '🥚', omschrijving: 'Scharreleieren' },
  { id: 'p10', naam: 'Roomboter', categorie: 'zuivel', prijs: 279, eenheid: '250 g', emoji: '🧈', omschrijving: 'Ongezouten roomboter' },
  { id: 'p11', naam: 'Griekse yoghurt', categorie: 'zuivel', prijs: 199, eenheid: '500 g', emoji: '🥣', omschrijving: 'Romige yoghurt' },
  { id: 'p12', naam: 'Volkorenbrood', categorie: 'brood', prijs: 219, eenheid: 'heel brood', emoji: '🍞', omschrijving: 'Vers volkorenbrood' },
  { id: 'p13', naam: 'Croissants', categorie: 'brood', prijs: 249, eenheid: '4 stuks', emoji: '🥐', omschrijving: 'Boterachtige croissants' },
  { id: 'p14', naam: 'Stroopwafels', categorie: 'brood', prijs: 229, eenheid: '10 stuks', emoji: '🧇', omschrijving: 'Hollandse klassieker' },
  { id: 'p15', naam: 'Kipfilet', categorie: 'vlees', prijs: 599, eenheid: '400 g', emoji: '🍗', omschrijving: 'Kipfilet' },
  { id: 'p16', naam: 'Rundergehakt', categorie: 'vlees', prijs: 479, eenheid: '500 g', emoji: '🥩', omschrijving: 'Rundergehakt' },
  { id: 'p17', naam: 'Zalmfilet', categorie: 'vlees', prijs: 649, eenheid: '250 g', emoji: '🐟', omschrijving: 'Verse zalmfilet' },
  { id: 'p18', naam: 'Vegaburgers', categorie: 'vlees', prijs: 329, eenheid: '2 stuks', emoji: '🌱', omschrijving: 'Plantaardige burgers' },
  { id: 'p19', naam: 'Appelsap', categorie: 'dranken', prijs: 179, eenheid: '1 liter', emoji: '🧃', omschrijving: 'Appelsap' },
  { id: 'p20', naam: 'Bruisend water', categorie: 'dranken', prijs: 69, eenheid: '1,5 liter', emoji: '💧', omschrijving: 'Bronwater met prik' },
  { id: 'p21', naam: 'Koffiebonen', categorie: 'dranken', prijs: 549, eenheid: '500 g', emoji: '☕', omschrijving: 'Medium roast koffiebonen' },
  { id: 'p22', naam: 'Groene thee', categorie: 'dranken', prijs: 219, eenheid: '20 builtjes', emoji: '🍵', omschrijving: 'Groene thee' },
  { id: 'p23', naam: 'Paprikachips', categorie: 'snacks', prijs: 189, eenheid: '200 g', emoji: '🥔', omschrijving: 'Knapperige chips' },
  { id: 'p24', naam: 'Pure chocolade', categorie: 'snacks', prijs: 169, eenheid: '100 g', emoji: '🍫', omschrijving: 'Pure chocolade' },
  { id: 'p25', naam: 'Zoute drop', categorie: 'snacks', prijs: 159, eenheid: '200 g', emoji: '🍬', omschrijving: 'Hollandse dropmix' },
  { id: 'p26', naam: 'Spaghetti', categorie: 'voorraad', prijs: 129, eenheid: '500 g', emoji: '🍝', omschrijving: 'Durumtarwe pasta' },
  { id: 'p27', naam: 'Basmatirijst', categorie: 'voorraad', prijs: 249, eenheid: '1 kg', emoji: '🍚', omschrijving: 'Basmatirijst' },
  { id: 'p28', naam: 'Pindakaas', categorie: 'voorraad', prijs: 269, eenheid: '350 g', emoji: '🥜', omschrijving: 'Pindakaas' },
  { id: 'p29', naam: 'Hagelslag melk', categorie: 'voorraad', prijs: 299, eenheid: '400 g', emoji: '🍫', omschrijving: 'Melkchocolade hagelslag' },
  { id: 'p30', naam: 'Toiletpapier', categorie: 'huishouden', prijs: 499, eenheid: '8 rollen', emoji: '🧻', omschrijving: '3-laags toiletpapier' },
  { id: 'p31', naam: 'Afwasmiddel', categorie: 'huishouden', prijs: 169, eenheid: '500 ml', emoji: '🧼', omschrijving: 'Afwasmiddel' },
  { id: 'p32', naam: 'Vuilniszakken', categorie: 'huishouden', prijs: 249, eenheid: '20 stuks', emoji: '🗑️', omschrijving: 'Vuilniszakken, 30 liter' },
  { id: 'p33', naam: 'Waswasmiddel', categorie: 'huishouden', prijs: 699, eenheid: '20 wasbeurten', emoji: '🫧', omschrijving: 'Wasmiddel voor de was' },
  { id: 'p34', naam: 'Shampoo', categorie: 'drogisterij', prijs: 349, eenheid: '300 ml', emoji: '🧴', omschrijving: 'Dagelijkse shampoo' },
  { id: 'p35', naam: 'Tandpasta', categorie: 'drogisterij', prijs: 229, eenheid: '75 ml', emoji: '🪥', omschrijving: 'Tandpasta voor dagelijks gebruik' },
  { id: 'p36', naam: 'Deodorant', categorie: 'drogisterij', prijs: 399, eenheid: '150 ml', emoji: '🧴', omschrijving: 'Deodorant spray' }
];

var winkelFactoren = { lidl: 0.94, ah: 1.08, jumbo: 1.04, vomar: 0.99, deka: 1.02, action: 0.88, kruidvat: 1.01 };
var alleenBijOverigeWinkels = {
  action: ['p30', 'p31', 'p32', 'p33'],
  kruidvat: ['p30', 'p33', 'p34', 'p35', 'p36']
};

window.SHOPWISE_PRODUCTS = [];
shopwiseBasisProducten.forEach(function (basis, index) {
  window.SHOPWISE_STORES.forEach(function (winkel, winkelIndex) {
    if (winkel.id === 'action' || winkel.id === 'kruidvat') {
      if ((alleenBijOverigeWinkels[winkel.id] || []).indexOf(basis.id) === -1) return;
    }
    /* Kleine variatie voor een klikbare vergelijking; dit zijn nadrukkelijk geen winkelprijzen. */
    var variatie = ((index * 17 + winkelIndex * 13) % 35) - 17;
    var prijs = Math.max(49, Math.round(basis.prijs * winkelFactoren[winkel.id] + variatie));
    window.SHOPWISE_PRODUCTS.push({
      id: basis.id + '-' + winkel.id,
      basisId: basis.id,
      winkelId: winkel.id,
      naam: basis.naam,
      categorie: basis.categorie,
      prijs: prijs,
      eenheid: basis.eenheid,
      emoji: basis.emoji,
      omschrijving: basis.omschrijving
    });
  });
});
