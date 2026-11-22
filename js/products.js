/* Shopwise – demo-assortiment. Prijzen staan in eurocenten. */
window.SHOPWISE_CATEGORIES = [
  { id: 'groente',     naam: 'Groente & fruit' },
  { id: 'zuivel',      naam: 'Zuivel & eieren' },
  { id: 'brood',       naam: 'Brood & bakkerij' },
  { id: 'vlees',       naam: 'Vlees, vis & vega' },
  { id: 'dranken',     naam: 'Dranken' },
  { id: 'snacks',      naam: 'Snacks & snoep' },
  { id: 'voorraad',    naam: 'Houdbaar' },
  { id: 'huishouden',  naam: 'Huishouden' }
];

window.SHOPWISE_PRODUCTS = [
  { id: 'p01', naam: 'Bananen',               categorie: 'groente',    prijs: 199, eenheid: 'per kg',        emoji: '🍌', omschrijving: 'Rijpe, zoete bananen' },
  { id: 'p02', naam: 'Elstar appels',         categorie: 'groente',    prijs: 249, eenheid: 'per kg',        emoji: '🍎', omschrijving: 'Knapperige Nederlandse appels' },
  { id: 'p03', naam: 'Tomaten',               categorie: 'groente',    prijs: 229, eenheid: '500 g',         emoji: '🍅', omschrijving: 'Trostomaten' },
  { id: 'p04', naam: 'Komkommer',             categorie: 'groente',    prijs: 89,  eenheid: 'per stuk',      emoji: '🥒', omschrijving: 'Verse komkommer' },
  { id: 'p05', naam: 'Winterpeen',            categorie: 'groente',    prijs: 119, eenheid: 'per kg',        emoji: '🥕', omschrijving: 'Wortelen, ideaal voor stamppot' },
  { id: 'p06', naam: 'Broccoli',              categorie: 'groente',    prijs: 149, eenheid: 'per stuk',      emoji: '🥦', omschrijving: 'Verse broccoli' },

  { id: 'p07', naam: 'Halfvolle melk',        categorie: 'zuivel',     prijs: 115, eenheid: '1 liter',       emoji: '🥛', omschrijving: 'Verse halfvolle melk' },
  { id: 'p08', naam: 'Jonge kaas',            categorie: 'zuivel',     prijs: 499, eenheid: '500 g, plak',   emoji: '🧀', omschrijving: 'Jonge Goudse kaas' },
  { id: 'p09', naam: 'Scharreleieren',        categorie: 'zuivel',     prijs: 289, eenheid: '10 stuks',      emoji: '🥚', omschrijving: 'Eieren van scharrelkippen' },
  { id: 'p10', naam: 'Roomboter',             categorie: 'zuivel',     prijs: 279, eenheid: '250 g',         emoji: '🧈', omschrijving: 'Ongezouten roomboter' },
  { id: 'p11', naam: 'Griekse yoghurt',       categorie: 'zuivel',     prijs: 199, eenheid: '500 g',         emoji: '🥣', omschrijving: 'Romige yoghurt, 10% vet' },

  { id: 'p12', naam: 'Volkorenbrood',         categorie: 'brood',      prijs: 219, eenheid: 'heel brood',    emoji: '🍞', omschrijving: 'Vers volkoren brood' },
  { id: 'p13', naam: 'Croissants',            categorie: 'brood',      prijs: 249, eenheid: '4 stuks',       emoji: '🥐', omschrijving: 'Boterachtige croissants' },
  { id: 'p14', naam: 'Stroopwafels',          categorie: 'brood',      prijs: 229, eenheid: '10 stuks',      emoji: '🧇', omschrijving: 'Hollandse klassieker' },

  { id: 'p15', naam: 'Kipfilet',              categorie: 'vlees',      prijs: 599, eenheid: '400 g',         emoji: '🍗', omschrijving: 'Magere kipfilet' },
  { id: 'p16', naam: 'Rundergehakt',          categorie: 'vlees',      prijs: 479, eenheid: '500 g',         emoji: '🥩', omschrijving: 'Half om half of rund' },
  { id: 'p17', naam: 'Zalmfilet',             categorie: 'vlees',      prijs: 649, eenheid: '250 g',         emoji: '🐟', omschrijving: 'Verse zalmfilet' },
  { id: 'p18', naam: 'Vegaburgers',           categorie: 'vlees',      prijs: 329, eenheid: '2 stuks',       emoji: '🌱', omschrijving: 'Plantaardige burgers' },

  { id: 'p19', naam: 'Appelsap',              categorie: 'dranken',    prijs: 179, eenheid: '1 liter',       emoji: '🧃', omschrijving: '100% appelsap' },
  { id: 'p20', naam: 'Bruisend water',        categorie: 'dranken',    prijs: 69,  eenheid: '1,5 liter',     emoji: '💧', omschrijving: 'Bronwater met prik' },
  { id: 'p21', naam: 'Koffiebonen',           categorie: 'dranken',    prijs: 549, eenheid: '500 g',         emoji: '☕', omschrijving: 'Medium roast koffiebonen' },
  { id: 'p22', naam: 'Groene thee',           categorie: 'dranken',    prijs: 219, eenheid: '20 builtjes',   emoji: '🍵', omschrijving: 'Milde groene thee' },

  { id: 'p23', naam: 'Paprikachips',          categorie: 'snacks',     prijs: 189, eenheid: '200 g',         emoji: '🥔', omschrijving: 'Knapperige chips' },
  { id: 'p24', naam: 'Pure chocolade',        categorie: 'snacks',     prijs: 169, eenheid: '100 g',         emoji: '🍫', omschrijving: '70% cacao' },
  { id: 'p25', naam: 'Zoute drop',            categorie: 'snacks',     prijs: 159, eenheid: '200 g',         emoji: '🍬', omschrijving: 'Hollandse dropmix' },

  { id: 'p26', naam: 'Spaghetti',             categorie: 'voorraad',   prijs: 129, eenheid: '500 g',         emoji: '🍝', omschrijving: 'Durumtarwe pasta' },
  { id: 'p27', naam: 'Basmatirijst',          categorie: 'voorraad',   prijs: 249, eenheid: '1 kg',          emoji: '🍚', omschrijving: 'Losse, geurige rijst' },
  { id: 'p28', naam: 'Pindakaas',             categorie: 'voorraad',   prijs: 269, eenheid: '350 g',         emoji: '🥜', omschrijving: 'Pindakaas met stukjes' },
  { id: 'p29', naam: 'Hagelslag melk',        categorie: 'voorraad',   prijs: 299, eenheid: '400 g',         emoji: '🍫', omschrijving: 'Melkchocolade hagelslag' },

  { id: 'p30', naam: 'Toiletpapier',          categorie: 'huishouden', prijs: 499, eenheid: '8 rollen',      emoji: '🧻', omschrijving: '3-laags toiletpapier' },
  { id: 'p31', naam: 'Afwasmiddel',           categorie: 'huishouden', prijs: 169, eenheid: '500 ml',        emoji: '🧼', omschrijving: 'Krachtig tegen vet' },
  { id: 'p32', naam: 'Vuilniszakken',         categorie: 'huishouden', prijs: 249, eenheid: '20 stuks',      emoji: '🗑️', omschrijving: 'Sterke zakken, 30 liter' }
];
