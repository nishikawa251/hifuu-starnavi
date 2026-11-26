/* =========================================================
 * English names for the sky data in js/skydata.js
 *  (英語版用。js/skydata.js のあとに読み込み、名前と星座のひとことを英語に置き換えます)
 * ========================================================= */
(() => {
  const STAR_NAMES = {
    sirius: 'Sirius', canopus: 'Canopus', rigel: 'Rigel', procyon: 'Procyon', betelgeuse: 'Betelgeuse', capella: 'Capella',
    aldebaran: 'Aldebaran', pollux: 'Pollux', castor: 'Castor', arcturus: 'Arcturus', spica: 'Spica', regulus: 'Regulus',
    polaris: 'Polaris', vega: 'Vega', altair: 'Altair', deneb: 'Deneb', antares: 'Antares', fomalhaut: 'Fomalhaut',
    acrux: 'Acrux', rigil: 'Alpha Centauri', hadar: 'Hadar',
  };
  for (const [k, name] of Object.entries(STAR_NAMES)) if (window.STARS[k]) window.STARS[k][3] = name;

  const CONSTELLATIONS = {
    ori: ['Orion', 'Look for the three stars of the belt. Red Betelgeuse and blue-white Rigel. Compare the colors.'],
    tau: ['Taurus', 'A V-shaped face with orange Aldebaran for an eye. The Pleiades sit on its shoulder.'],
    cma: ['Canis Major', 'Home of Sirius, the brightest star in the night sky. You\'ll spot it even when it\'s low.'],
    cmi: ['Canis Minor', 'Just two stars, Procyon and Gomeisa. A tiny one.'],
    gem: ['Gemini', 'Castor and Pollux, side by side. Reminds you of someone, doesn\'t it?'],
    aur: ['Auriga', 'A pentagon with yellow Capella at one corner.'],
    leo: ['Leo', 'A backwards question mark makes the lion\'s head.'],
    uma: ['Ursa Major (Big Dipper)', 'Extend the edge of the dipper about five times and you reach Polaris. Can you see the little star next to Mizar?'],
    umi: ['Ursa Minor', 'Polaris is the tip of its tail. It barely moves all night.'],
    lyr: ['Lyra', 'Vega\'s constellation. In Japan she\'s Orihime, the weaver of the Tanabata story. The little parallelogram is the lyre.'],
    cyg: ['Cygnus', 'A swan flying along the Milky Way. Albireo, at its beak, is a two-colored double star in a telescope.'],
    aql: ['Aquila', 'Altair, the cowherd Hikoboshi, with a star on either side.'],
    sco: ['Scorpius', 'Red Antares is its heart, and the tail curls into an S.'],
    sgr: ['Sagittarius', 'Shaped like a teapot. The Milky Way rises from the spout like steam.'],
    peg: ['Pegasus', 'The Great Square is the landmark. A good place to start star-hopping.'],
    and: ['Andromeda', 'The Andromeda Galaxy is right nearby. Light from 2.5 million light-years away. Can you make out the smudge?'],
    cas: ['Cassiopeia', 'Five stars in a W. Another way to find Polaris.'],
    per: ['Perseus', 'Algol, the "Demon Star," changes brightness about every three days.'],
    boo: ['Boötes', 'Orange Arcturus. Follow the curve of the Big Dipper\'s handle to find it.'],
    vir: ['Virgo', 'Bright white Spica. Keep following the curve on from Arcturus.'],
    psa: ['Piscis Austrinus', 'Fomalhaut is the only bright star in that whole empty stretch of sky. "The lonely one."'],
    cru: ['Crux (Southern Cross)', 'The smallest constellation, but the landmark of the southern sky. Its long bar points roughly south.'],
    cen: ['Centaurus', 'Alpha Centauri is the closest star system to the Sun. That light left only 4.3 years ago.'],
  };
  for (const c of window.CONSTELLATIONS) {
    const e = CONSTELLATIONS[c.id];
    if (e) [c.name, c.tip] = e;
  }

  const ASTERISMS = { winter: 'Winter Triangle', summer: 'Summer Triangle' };
  for (const a of window.ASTERISMS) a.name = ASTERISMS[a.id] || a.name;

  const DEEP = { m45: 'Pleiades', m31: 'Andromeda Galaxy', lmc: 'Large Magellanic Cloud', smc: 'Small Magellanic Cloud' };
  for (const d of window.DEEP_SKY) d.name = DEEP[d.id] || d.name;

  const SHOWERS = {
    qua: ['Quadrantids', 'Boötes'], lyr: ['Lyrids', 'Lyra'], eta: ['Eta Aquariids', 'Aquarius'], sda: ['Southern Delta Aquariids', 'Aquarius'],
    per: ['Perseids', 'Perseus'], ori: ['Orionids', 'Orion'], nta: ['Northern Taurids', 'Taurus'], leo: ['Leonids', 'Leo'],
    gem: ['Geminids', 'Gemini'], urs: ['Ursids', 'Ursa Minor'],
  };
  for (const s of window.METEOR_SHOWERS) {
    const e = SHOWERS[s.id];
    if (e) [s.name, s.radiant] = e;
  }
})();
