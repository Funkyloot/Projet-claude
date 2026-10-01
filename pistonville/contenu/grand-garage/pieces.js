/* pieces.js — pack « Grand Garage » : 74 pièces de plus, sur les niveaux 1 à 9 du labo.
 *
 * Les points de bonus et les prix sont calculés à partir du niveau et de la
 * rareté, pour que tout le pack reste équilibré :
 *   - budget de points = 8 + 3,5 × niveau, + 6 (rare), + 12 (super), + 18 (légendaire),
 *     multiplié par un facteur par emplacement (moteur 1 … nitro 0,25) ;
 *   - `poids` répartit ce budget entre les qualités (une valeur négative = un défaut) ;
 *   - prix = 2 000 × 1,45^niveau × 1 / 1,8 / 3,2 / 6 selon la rareté.
 * Comme les qualités d'une voiture sont plafonnées par sa classe, les pièces
 * des hauts niveaux apportent surtout de la spécialisation : adhérence sur une
 * surface, charges et durée de nitro, solidité.
 * `icone` décrit l'image de la pièce (voir src/icones.js).
 */

const BUDGET_RARETE = { commune: 0, rare: 6, super: 12, legendaire: 18 };
const PRIX_RARETE = { commune: 1, rare: 1.8, super: 3.2, legendaire: 6 };
// Les pneus et la nitro apportent surtout leur effet propre (adhérence, charges) : moins de points bruts.
const FACTEUR = { moteur: 1, boite: 0.75, aileron: 0.75, chassis: 0.8, pneus: 0.55, nitro: 0.25 };

function p(id, nom, emplacement, rarete, niveau, poids, extra = {}) {
  const budget = (8 + 3.5 * niveau + BUDGET_RARETE[rarete]) * FACTEUR[emplacement];
  const total = Object.values(poids).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const bonus = {};
  for (const [k, w] of Object.entries(poids)) bonus[k] = Math.round((budget * w) / total);
  const prix = Math.round((2000 * 1.45 ** niveau * PRIX_RARETE[rarete]) / 100) * 100;
  return { id, nom, emplacement, rarete, prix, recherche: niveau, bonus, ...extra };
}

export default [
  // --- Moteurs -------------------------------------------------------------------------
  p('moteur-3cyl', 'Trois-cylindres Éco', 'moteur', 'commune', 1, { acceleration: 2, vitesse: 1 }, { icone: { famille: 'moteur', cylindres: 3, cache: 'v' } }),
  p('moteur-boxer', 'Boxer 4', 'moteur', 'rare', 1, { vitesse: 1, acceleration: 1, maniabilite: 1 }, { icone: { famille: 'moteur', cylindres: 4, cache: 'p' } }),
  p('moteur-v8', 'V8 atmosphérique', 'moteur', 'rare', 2, { vitesse: 3, acceleration: 1 }, { look: 'prise', icone: { famille: 'moteur', cylindres: 8, cache: 'r', prise: true } }),
  p('moteur-l6-turbo', '6 en ligne turbo', 'moteur', 'commune', 3, { vitesse: 2, acceleration: 2 }, { look: 'prise', icone: { famille: 'moteur', cylindres: 6, cache: 'G', turbo: true } }),
  p('moteur-v6-biturbo', 'V6 biturbo', 'moteur', 'rare', 4, { vitesse: 3, acceleration: 2 }, { look: 'prise', icone: { famille: 'moteur', cylindres: 6, cache: 'b', turbo: true, prise: true } }),
  p('moteur-electrique', 'Moteur électrique', 'moteur', 'super', 4, { acceleration: 4, vitesse: 1 }, { icone: { famille: 'moteur', cylindres: 0, cache: 'B', batterie: true } }),
  p('moteur-v8-compresseur', 'V8 à compresseur', 'moteur', 'commune', 5, { vitesse: 2, acceleration: 3 }, { look: 'prise', icone: { famille: 'moteur', cylindres: 8, cache: 'O', prise: true } }),
  p('moteur-v10', 'V10', 'moteur', 'rare', 5, { vitesse: 4, acceleration: 2 }, { look: 'prise', icone: { famille: 'moteur', cylindres: 10, cache: 'k', prise: true } }),
  p('moteur-rallye', 'Bloc rallye anti-lag', 'moteur', 'rare', 6, { acceleration: 3, vitesse: 1, solidite: 1 }, { surfaces: { terre: 0.05, sable: 0.05 }, look: 'prise', icone: { famille: 'moteur', cylindres: 4, cache: 'n', turbo: true } }),
  p('moteur-w12', 'W12', 'moteur', 'super', 6, { vitesse: 4, acceleration: 2 }, { look: 'prise', icone: { famille: 'moteur', cylindres: 12, cache: 'K', prise: true } }),
  p('moteur-kers', 'Hybride KERS', 'moteur', 'rare', 7, { acceleration: 3, vitesse: 2 }, { look: 'prise', icone: { famille: 'moteur', cylindres: 6, cache: 'v', batterie: true, turbo: true } }),
  p('moteur-v12', 'V12', 'moteur', 'super', 7, { vitesse: 3, acceleration: 2 }, { look: 'turbine', icone: { famille: 'moteur', cylindres: 12, cache: 'R', prise: true } }),
  p('moteur-proto', 'V10 Proto', 'moteur', 'super', 8, { vitesse: 3, acceleration: 3 }, { look: 'turbine', icone: { famille: 'moteur', cylindres: 10, cache: 'y', prise: true, turbo: true } }),
  p('moteur-legende', 'Cœur de Légende V12', 'moteur', 'legendaire', 9, { vitesse: 3, acceleration: 3 }, { look: 'turbine', icone: { famille: 'moteur', cylindres: 12, cache: 'Y', prise: true, turbo: true } }),

  // --- Pneus ---------------------------------------------------------------------------
  p('pneus-sport', 'Pneus sport', 'pneus', 'commune', 1, { maniabilite: 1 }, { surfaces: { asphalte: 0.06 }, icone: { famille: 'pneu', motif: 'rainures', crans: 18, liseret: 'R' } }),
  p('pneus-mixtes', 'Pneus mixtes', 'pneus', 'commune', 2, { maniabilite: 1 }, { surfaces: { asphalte: 0.03, terre: 0.08 }, icone: { famille: 'pneu', motif: 'blocs', crans: 14 } }),
  p('pneus-sable', 'Pneus sable', 'pneus', 'rare', 2, { maniabilite: 1 }, { surfaces: { sable: 0.2 }, look: 'larges', icone: { famille: 'pneu', motif: 'blocs', crans: 8, large: true, liseret: 'y' } }),
  p('pneus-paves', 'Pneus pavés', 'pneus', 'commune', 3, { maniabilite: 1 }, { surfaces: { paves: 0.16 }, icone: { famille: 'pneu', motif: 'chevron', crans: 16, liseret: 'G' } }),
  p('pneus-cloutes', 'Pneus cloutés', 'pneus', 'rare', 3, { maniabilite: 1 }, { surfaces: { glace: 0.3 }, icone: { famille: 'pneu', motif: 'clous', crans: 16, liseret: 'B' } }),
  p('pneus-semi-slicks', 'Semi-slicks', 'pneus', 'commune', 4, { maniabilite: 2, vitesse: 1 }, { surfaces: { asphalte: 0.12 }, look: 'larges', icone: { famille: 'pneu', motif: 'lisse', crans: 1, liseret: 'G' } }),
  p('pneus-pluie-pro', 'Pneus pluie pro', 'pneus', 'rare', 4, { maniabilite: 1 }, { surfaces: { mouille: 0.24, paves: 0.1 }, icone: { famille: 'pneu', motif: 'chevron', crans: 14, liseret: 'b' } }),
  p('pneus-rallye', 'Pneus rallye terre', 'pneus', 'rare', 5, { maniabilite: 1, solidite: 1 }, { surfaces: { terre: 0.22, sable: 0.1 }, look: 'larges', icone: { famille: 'pneu', motif: 'blocs', crans: 12, large: true, liseret: 'O' } }),
  p('pneus-hiver-pro', 'Pneus hiver pro', 'pneus', 'super', 6, { maniabilite: 1 }, { surfaces: { glace: 0.35, mouille: 0.1 }, icone: { famille: 'pneu', motif: 'clous', crans: 20, liseret: 'W' } }),
  p('pneus-tendres', 'Gomme tendre', 'pneus', 'rare', 6, { maniabilite: 2, vitesse: 1 }, { surfaces: { asphalte: 0.16 }, look: 'larges', icone: { famille: 'pneu', motif: 'lisse', crans: 1, large: true, liseret: 'R' } }),
  p('pneus-toutes-saisons', 'Toutes saisons', 'pneus', 'super', 7, { maniabilite: 1 }, { surfaces: { asphalte: 0.08, paves: 0.08, terre: 0.08, mouille: 0.08, sable: 0.08, glace: 0.08 }, icone: { famille: 'pneu', motif: 'chevron', crans: 12, liseret: 'v' } }),
  p('pneus-dune', 'Pneus de dune', 'pneus', 'super', 7, { maniabilite: 1, acceleration: 1 }, { surfaces: { sable: 0.3, terre: 0.2 }, look: 'larges', icone: { famille: 'pneu', motif: 'blocs', crans: 6, large: true, liseret: 'Y' } }),
  p('pneus-qualif', 'Pneus de qualification', 'pneus', 'super', 8, { maniabilite: 2, vitesse: 1 }, { surfaces: { asphalte: 0.2 }, look: 'larges', icone: { famille: 'pneu', motif: 'lisse', crans: 1, large: true, liseret: 'p' } }),
  p('pneus-legende', 'Gomme de Légende', 'pneus', 'legendaire', 9, { maniabilite: 2, vitesse: 1 }, { surfaces: { asphalte: 0.14, paves: 0.14, terre: 0.14, mouille: 0.14, sable: 0.14, glace: 0.14 }, look: 'larges', icone: { famille: 'pneu', motif: 'lisse', crans: 1, large: true, liseret: 'Y' } }),

  // --- Boîtes --------------------------------------------------------------------------
  p('boite-6', 'Boîte 6 vitesses', 'boite', 'commune', 1, { acceleration: 1, vitesse: 1 }, { icone: { famille: 'boite', couleur: 'G', pommeau: 'R', vitesses: 6 } }),
  p('boite-auto', 'Boîte automatique', 'boite', 'commune', 2, { acceleration: 2, maniabilite: 1 }, { icone: { famille: 'boite', couleur: 's', pommeau: 'k', vitesses: 4 } }),
  p('boite-cvt', 'Variateur continu', 'boite', 'commune', 3, { acceleration: 3 }, { icone: { famille: 'boite', couleur: 'v', pommeau: 'k', vitesses: 2 } }),
  p('boite-rallye', 'Boîte rallye', 'boite', 'rare', 3, { acceleration: 3, solidite: 1 }, { icone: { famille: 'boite', couleur: 'n', pommeau: 'y', vitesses: 5 } }),
  p('boite-dsg', 'Double embrayage 7', 'boite', 'rare', 4, { acceleration: 2, vitesse: 2 }, { icone: { famille: 'boite', couleur: 'b', pommeau: 'W', vitesses: 7 } }),
  p('boite-8', 'Boîte 8 vitesses', 'boite', 'commune', 5, { vitesse: 3, acceleration: 1 }, { icone: { famille: 'boite', couleur: 'K', pommeau: 'G', vitesses: 8 } }),
  p('boite-crabots', 'Boîte à crabots', 'boite', 'rare', 5, { acceleration: 3, vitesse: 1 }, { icone: { famille: 'boite', couleur: 'O', pommeau: 'k', vitesses: 6, seq: true } }),
  p('boite-seq-pro', 'Séquentielle pro', 'boite', 'super', 6, { vitesse: 2, acceleration: 2 }, { icone: { famille: 'boite', couleur: 'k', pommeau: 'R', vitesses: 6, seq: true } }),
  p('boite-palettes', 'Palettes au volant', 'boite', 'rare', 7, { acceleration: 2, maniabilite: 1, vitesse: 1 }, { icone: { famille: 'boite', couleur: 'p', pommeau: 'W', vitesses: 7, seq: true } }),
  p('boite-endurance', "Boîte d'endurance", 'boite', 'commune', 7, { vitesse: 1, acceleration: 1, solidite: 2 }, { icone: { famille: 'boite', couleur: 'g', pommeau: 'v', vitesses: 6 } }),
  p('boite-f1', 'Boîte de formule', 'boite', 'super', 8, { acceleration: 3, vitesse: 2 }, { icone: { famille: 'boite', couleur: 'R', pommeau: 'y', vitesses: 8, seq: true } }),
  p('boite-legende', 'Boîte de Légende', 'boite', 'legendaire', 9, { acceleration: 1, vitesse: 1 }, { icone: { famille: 'boite', couleur: 'y', pommeau: 'W', vitesses: 8, seq: true } }),

  // --- Ailerons et aérodynamique -------------------------------------------------------
  p('lame-avant', 'Lame avant', 'aileron', 'commune', 1, { maniabilite: 2, vitesse: 1 }, { look: 'becquet', icone: { famille: 'aileron', haut: 12, epais: 1, couleur: 'k' } }),
  p('diffuseur', 'Diffuseur', 'aileron', 'rare', 2, { maniabilite: 2, vitesse: 1 }, { look: 'becquet', icone: { famille: 'aileron', haut: 11, epais: 3, couleur: 'K' } }),
  p('aileron-reglable', 'Aileron réglable', 'aileron', 'commune', 3, { maniabilite: 3 }, { look: 'aileron', icone: { famille: 'aileron', haut: 6, epais: 2, couleur: 's', pieds: true } }),
  p('aileron-double', 'Double aileron', 'aileron', 'rare', 4, { maniabilite: 3, vitesse: 1 }, { look: 'aileron', icone: { famille: 'aileron', haut: 4, epais: 4, couleur: 'r', pieds: true } }),
  p('fond-plat', 'Fond plat', 'aileron', 'commune', 5, { maniabilite: 2, vitesse: 2 }, { look: 'becquet', icone: { famille: 'aileron', haut: 13, epais: 2, couleur: 'g' } }),
  p('aileron-col-cygne', 'Aileron col de cygne', 'aileron', 'rare', 5, { maniabilite: 3, vitesse: 1 }, { look: 'aileronGT', icone: { famille: 'aileron', haut: 4, epais: 2, couleur: 'v', pieds: true, derive: true } }),
  p('aileron-rallye', 'Aileron de rallye', 'aileron', 'commune', 6, { maniabilite: 2, solidite: 1 }, { surfaces: { terre: 0.06, sable: 0.06 }, look: 'aileron', icone: { famille: 'aileron', haut: 5, epais: 3, couleur: 'n', pieds: true } }),
  p('kit-large', 'Kit carrosserie large', 'aileron', 'rare', 6, { maniabilite: 2, solidite: 2 }, { look: 'aileronGT', icone: { famille: 'aileron', haut: 7, epais: 4, couleur: 'p', pieds: true } }),
  p('aileron-actif', 'Aileron actif', 'aileron', 'super', 7, { maniabilite: 2, vitesse: 2 }, { look: 'aileronGT', icone: { famille: 'aileron', haut: 3, epais: 2, couleur: 'B', pieds: true, derive: true } }),
  p('aileron-endurance', "Aileron d'endurance", 'aileron', 'rare', 7, { maniabilite: 2, vitesse: 1, solidite: 1 }, { look: 'aileronGT', icone: { famille: 'aileron', haut: 3, epais: 3, couleur: 'O', pieds: true, derive: true } }),
  p('effet-sol', 'Effet de sol', 'aileron', 'super', 8, { maniabilite: 4, vitesse: 1 }, { look: 'aileronGT', icone: { famille: 'aileron', haut: 12, epais: 4, couleur: 'k', derive: true } }),
  p('aileron-legende', 'Aileron de Légende', 'aileron', 'legendaire', 9, { maniabilite: 3, vitesse: 2 }, { look: 'aileronGT', icone: { famille: 'aileron', haut: 3, epais: 3, couleur: 'Y', pieds: true, derive: true } }),

  // --- Nitro ---------------------------------------------------------------------------
  p('nitro-mini', 'Mini-bouteille', 'nitro', 'commune', 1, { acceleration: 1 }, { charges: 2, duree: 2.2, look: 'nitro1', icone: { famille: 'nitro', couleur: 'G' } }),
  p('nitro-eco', 'Nitro économe', 'nitro', 'commune', 2, { acceleration: 1 }, { charges: 3, duree: 1.6, look: 'nitro1', icone: { famille: 'nitro', couleur: 'v' } }),
  p('nitro-triple', 'Triple bouteille', 'nitro', 'rare', 3, { acceleration: 1 }, { charges: 4, look: 'nitro2', icone: { famille: 'nitro', couleur: 'b', double: true } }),
  p('nitro-longue', 'Nitro longue durée', 'nitro', 'rare', 4, { acceleration: 1 }, { charges: 3, duree: 3, look: 'nitro2', icone: { famille: 'nitro', couleur: 'p', double: true } }),
  p('nitro-refroidie', 'Nitro refroidie', 'nitro', 'commune', 5, { acceleration: 2, vitesse: 1 }, { charges: 3, duree: 2.2, look: 'nitro2', icone: { famille: 'nitro', couleur: 'B', double: true } }),
  p('nitro-rallye', 'Nitro de rallye', 'nitro', 'rare', 5, { acceleration: 2 }, { charges: 4, duree: 2.4, look: 'nitro2', icone: { famille: 'nitro', couleur: 'n', flamme: true } }),
  p('nitro-quad', 'Quadruple bouteille', 'nitro', 'super', 6, { acceleration: 1 }, { charges: 5, look: 'nitro2', icone: { famille: 'nitro', couleur: 'K', double: true, flamme: true } }),
  p('nitro-sequentielle', 'Nitro séquentielle', 'nitro', 'rare', 7, { acceleration: 2, vitesse: 1 }, { charges: 4, duree: 2.8, look: 'nitro2', icone: { famille: 'nitro', couleur: 'O', double: true, flamme: true } }),
  p('nitro-course-pro', 'Kit nitro pro', 'nitro', 'super', 8, { acceleration: 2, vitesse: 1 }, { charges: 5, duree: 3, look: 'nitro2', icone: { famille: 'nitro', couleur: 'R', double: true, flamme: true } }),
  p('nitro-legende', 'Nitro de Légende', 'nitro', 'legendaire', 9, { acceleration: 2, vitesse: 2 }, { charges: 6, duree: 3.2, look: 'nitro2', icone: { famille: 'nitro', couleur: 'Y', double: true, flamme: true } }),

  // --- Châssis et suspensions ----------------------------------------------------------
  p('chassis-allege', 'Châssis allégé', 'chassis', 'commune', 1, { vitesse: 1, acceleration: 1, solidite: -1 }, { icone: { famille: 'chassis' } }),
  p('barres-antiroulis', 'Barres antiroulis', 'chassis', 'commune', 2, { maniabilite: 2, solidite: 1 }, { icone: { famille: 'chassis', arceau: true } }),
  p('suspension-sport', 'Suspension sport', 'chassis', 'commune', 3, { maniabilite: 3 }, { icone: { famille: 'chassis' } }),
  p('chassis-tubulaire', 'Châssis tubulaire', 'chassis', 'rare', 3, { solidite: 2, maniabilite: 1, vitesse: 1 }, { look: 'arceau', icone: { famille: 'chassis', arceau: true } }),
  p('blindage', 'Blindage', 'chassis', 'commune', 4, { solidite: 4, vitesse: -1 }, { icone: { famille: 'chassis' } }),
  p('suspension-rallye', 'Suspension rallye', 'chassis', 'rare', 5, { maniabilite: 2, solidite: 2 }, { surfaces: { terre: 0.08, sable: 0.08, paves: 0.06 }, look: 'arceau', icone: { famille: 'chassis', arceau: true } }),
  p('chassis-alu', 'Châssis aluminium', 'chassis', 'rare', 5, { vitesse: 1, acceleration: 1, solidite: 2 }, { icone: { famille: 'chassis', carbone: true } }),
  p('coque-kevlar', 'Coque kevlar', 'chassis', 'super', 6, { solidite: 3, vitesse: 1, acceleration: 1 }, { look: 'carbone', icone: { famille: 'chassis', carbone: true } }),
  p('cage-endurance', "Cage d'endurance", 'chassis', 'rare', 7, { solidite: 4, maniabilite: 1 }, { look: 'arceau', icone: { famille: 'chassis', arceau: true } }),
  p('chassis-titane', 'Châssis titane', 'chassis', 'super', 7, { solidite: 2, vitesse: 1, acceleration: 1, maniabilite: 1 }, { look: 'carbone', icone: { famille: 'chassis', carbone: true, arceau: true } }),
  p('monocoque-proto', 'Monocoque proto', 'chassis', 'super', 8, { solidite: 2, vitesse: 2, acceleration: 2 }, { look: 'carbone', icone: { famille: 'chassis', carbone: true } }),
  p('chassis-legende', 'Châssis de Légende', 'chassis', 'legendaire', 9, { solidite: 3, vitesse: 2, acceleration: 2, maniabilite: 1 }, { look: 'carbone', icone: { famille: 'chassis', carbone: true, arceau: true } }),
];
