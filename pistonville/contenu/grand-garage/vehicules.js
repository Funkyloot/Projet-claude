/* vehicules.js — pack « Grand Garage » : 32 voitures de plus (45 en tout).
 *
 * Chaque classe gagne plusieurs modèles au caractère marqué (rapide mais
 * fragile, agile, tout-terrain, endurante…). Les plus belles se méritent :
 *   - `licence` : licence minimale ;
 *   - `rang`    : rang d'équipe minimal ;
 *   - `victoires` : nombre de victoires en Grand Prix.
 * Le prix de construction au garage vaut environ 70 % du prix en concession.
 */

const v = (id, nom, classe, prix, jours, stats, couleur, profil, extra = {}) => ({
  id, nom, classe, prix, construction: { prix: Math.round(prix * 0.7 / 100) * 100, jours }, stats, couleur, profil, ...extra,
});
const s = (vitesse, acceleration, maniabilite, solidite) => ({ vitesse, acceleration, maniabilite, solidite });

export default [
  // --- Classe D : premières voitures -----------------------------------------------------
  v('micro-puce', 'Micro Puce', 'D', 7000, 1, s(26, 52, 58, 30), '#e86ca6', 'rounded_yellow'),
  v('break-familial', 'Break Familial', 'D', 10000, 1, s(34, 36, 40, 66), '#8a94a6', 'sedan_blue'),
  v('pickup-chantier', 'Pick-up Chantier', 'D', 12000, 1, s(36, 40, 38, 70), '#f39c33', 'suv', { surfaces: { terre: 0.06 } }),
  v('kart-furie', 'Kart Furie', 'D', 13000, 1, s(32, 60, 64, 22), '#e4432d', 'kart', { rang: 3 }),
  v('coccinelle-49', 'Coccinelle 49', 'D', 18000, 1, s(36, 38, 46, 62), '#3fa34d', 'sedan_vintage', { fans: 0.3, rang: 4 }),

  // --- Classe C ---------------------------------------------------------------------------
  v('hot-hatch', 'Hot Hatch GTi', 'C', 21000, 2, s(52, 56, 52, 40), '#e4432d', 'rounded_yellow'),
  v('coupe-sirocco', 'Coupé Sirocco', 'C', 24000, 2, s(58, 48, 48, 44), '#f2c14e', 'sports_green'),
  v('berline-turbo', 'Berline Turbo', 'C', 25000, 2, s(56, 50, 42, 56), '#2a2838', 'sedan_blue'),
  v('buggy-scorpion', 'Buggy Scorpion', 'C', 27000, 2, s(46, 60, 60, 46), '#9fe870', 'buggy', { surfaces: { sable: 0.14, terre: 0.08 }, rang: 5 }),
  v('4x4-banquise', '4×4 Banquise', 'C', 30000, 2, s(48, 44, 46, 74), '#a9c6d8', 'suv', { surfaces: { glace: 0.12, mouille: 0.06 }, rang: 6 }),
  v('cabriolet-azur', 'Cabriolet Azur', 'C', 32000, 2, s(54, 52, 58, 42), '#7dd3fc', 'convertible', { fans: 0.1, rang: 6 }),
  v('rallye-retro', 'Rallye Rétro 72', 'C', 36000, 2, s(52, 54, 56, 54), '#f4f1e8', 'sedan_vintage', { surfaces: { terre: 0.06, paves: 0.06 }, fans: 0.2, victoires: 2 }),

  // --- Classe B ---------------------------------------------------------------------------
  v('gt-mistral', 'GT Mistral', 'B', 62000, 3, s(74, 64, 62, 52), '#4f7ddb', 'sports_red', { licence: 'C' }),
  v('roadster-vif', 'Roadster Vif-Argent', 'B', 64000, 3, s(68, 70, 72, 40), '#c9ccd4', 'sports_convertible', { licence: 'C' }),
  v('berline-sport-b', 'Berline Sport RS', 'B', 66000, 3, s(70, 66, 60, 62), '#3a3550', 'sedan_blue', { licence: 'C', rang: 8 }),
  v('raid-sahara', 'Raid Sahara', 'B', 70000, 3, s(64, 68, 66, 64), '#d6b46a', 'buggy', { surfaces: { sable: 0.16, terre: 0.12 }, licence: 'C', rang: 9 }),
  v('coupe-sakura', 'Coupé Sakura', 'B', 74000, 3, s(70, 72, 76, 46), '#ffb3c7', 'sports_green', { licence: 'C', rang: 10 }),
  v('tout-terrain-yeti', 'Tout-terrain Yéti', 'B', 76000, 3, s(66, 62, 64, 80), '#f4f1e8', 'suv', { surfaces: { glace: 0.14, mouille: 0.08, terre: 0.06 }, licence: 'C', rang: 10 }),
  v('kart-pro', 'Kart Compétition', 'B', 80000, 3, s(64, 78, 82, 30), '#f2c14e', 'kart', { licence: 'C', victoires: 6 }),

  // --- Classe A ---------------------------------------------------------------------------
  v('gt-tempete', 'GT Tempête', 'A', 145000, 4, s(86, 80, 76, 56), '#2a2838', 'sports_race', { licence: 'B' }),
  v('speedster-aurore', 'Speedster Aurore', 'A', 150000, 4, s(82, 82, 82, 50), '#f39c33', 'sports_convertible', { licence: 'B', rang: 13 }),
  v('rallye-a', 'Rallye Mondial WRX', 'A', 158000, 4, s(80, 86, 80, 66), '#2f6fdb', 'sports_green', { surfaces: { terre: 0.1, paves: 0.08, glace: 0.06 }, licence: 'B', rang: 14 }),
  v('grand-tourisme', 'Grand Tourisme Lys', 'A', 165000, 4, s(84, 78, 76, 72), '#8a6ad6', 'sedan_blue', { licence: 'B', rang: 14 }),
  v('cabriolet-riviera-s', 'Riviera Spéciale', 'A', 172000, 4, s(82, 82, 86, 52), '#e86ca6', 'convertible', { fans: 0.2, licence: 'B', rang: 15 }),
  v('dune-monstre', 'Dune Monstre', 'A', 176000, 4, s(78, 84, 78, 82), '#9fe870', 'buggy', { surfaces: { sable: 0.2, terre: 0.14 }, licence: 'B', victoires: 15 }),
  v('legende-1955', 'Légende 1955', 'A', 190000, 4, s(80, 78, 80, 70), '#c2504d', 'sedan_vintage', { fans: 0.5, licence: 'B', victoires: 18 }),

  // --- Classe S : le sommet ---------------------------------------------------------------
  v('hyper-foudre', 'Hyper Foudre', 'S', 340000, 5, s(96, 90, 84, 56), '#f2c14e', 'sports_race', { licence: 'A', rang: 18 }),
  v('proto-nuit', 'Proto Nuit Blanche', 'S', 360000, 5, s(92, 92, 90, 58), '#f4f1e8', 'sports_red', { licence: 'A', rang: 19 }),
  v('formule-zenith', 'Formule Zénith', 'S', 400000, 5, s(98, 94, 94, 44), '#2f6fdb', 'formula', { licence: 'A', victoires: 25 }),
  v('rallye-s', 'Rallye Suprême', 'S', 380000, 5, s(90, 96, 90, 70), '#e4432d', 'sports_green', { surfaces: { terre: 0.12, sable: 0.1, glace: 0.08, paves: 0.08 }, licence: 'A', rang: 20 }),
  v('endurance-s', 'Prototype Endurance 24', 'S', 420000, 6, s(94, 90, 88, 84), '#3fa34d', 'sports_race', { licence: 'S', rang: 22 }),
  v('formule-legende', 'Formule Légende', 'S', 520000, 6, s(99, 99, 97, 50), '#ffe066', 'formula', { licence: 'S', victoires: 40, fans: 0.3 }),
];
