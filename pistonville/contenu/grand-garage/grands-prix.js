/* grands-prix.js — pack « Grand Garage » : 37 Grands Prix et 93 circuits de plus.
 *
 * Avec le pack de base : 55 Grands Prix, 141 circuits. Chaque palier gagne des
 * courses aux surfaces variées (on change de pneus selon la saison), et le
 * palier mondial gagne une série « Légendes » (niveau 6) qui demande des
 * dizaines de victoires : de quoi courir les dernières saisons et la carrière+.
 * Graines 6001 et suivantes : jamais réutilisées.
 */

const c = (nom, graine, theme, surface, tours, longueur) => ({ nom, graine, theme, surface, tours, longueur });

export default [
  // --- Ouvert (niveau 1) : six de plus, pour varier les premières semaines --------------------
  { id: 'coupe-boulangers', nom: 'Coupe des Boulangers', palier: 'ouvert', niveau: 1, prix: 5500, adversaires: 5,
    manches: [c('Rue du Four', 6001, 'ville', 'paves', 2, 2300), c('Place du Pain', 6002, 'ville', 'asphalte', 2, 2400)] },
  { id: 'trophee-plage', nom: 'Trophée de la Plage', palier: 'ouvert', niveau: 1, prix: 6500, adversaires: 5,
    manches: [c('Promenade', 6011, 'plage', 'asphalte', 2, 2400), c('Dunes Basses', 6012, 'plage', 'sable', 2, 2300)] },
  { id: 'kermesse-parc', nom: 'Kermesse du Parc', palier: 'ouvert', niveau: 1, prix: 6000, adversaires: 5,
    manches: [c('Allée des Marronniers', 6021, 'parc', 'asphalte', 2, 2500), c('Bord du Lac', 6022, 'parc', 'mouille', 2, 2400)] },
  { id: 'nocturne-zone', nom: 'Nocturne de la Zone', palier: 'ouvert', niveau: 1, prix: 7500, adversaires: 5,
    manches: [c('Entrepôts', 6031, 'chantier', 'asphalte', 2, 2600), c('Grue Jaune', 6032, 'chantier', 'terre', 2, 2500)] },
  { id: 'coupe-pecheurs', nom: 'Coupe des Pêcheurs', palier: 'ouvert', niveau: 1, prix: 7000, adversaires: 5,
    manches: [c('Criée', 6041, 'port', 'mouille', 2, 2500), c('Phare Rouge', 6042, 'port', 'paves', 2, 2600)] },
  { id: 'derby-banlieue', nom: 'Derby de Banlieue', palier: 'ouvert', niveau: 1, prix: 8500, adversaires: 5,
    manches: [c('Lotissement', 6051, 'banlieue', 'asphalte', 2, 2500), c('Rond-point Fleuri', 6052, 'banlieue', 'asphalte', 2, 2600), c('Terrain Vague', 6053, 'chantier', 'terre', 2, 2600)] },

  // --- Régional (niveau 2) -----------------------------------------------------------------
  { id: 'rallye-garrigue', nom: 'Rallye de la Garrigue', palier: 'regional', niveau: 2, prix: 14000, adversaires: 7, conditions: { points: 30, podiums: 2, classe: 'C' },
    manches: [c('Chemin des Cigales', 6101, 'chantier', 'terre', 2, 3000), c('Carrière Blanche', 6102, 'chantier', 'terre', 2, 3100)] },
  { id: 'coupe-lacs', nom: 'Coupe des Lacs', palier: 'regional', niveau: 2, prix: 15000, adversaires: 7, conditions: { points: 35, podiums: 2, classe: 'C' },
    manches: [c('Rive Nord', 6111, 'parc', 'mouille', 2, 3000), c('Pont de Bois', 6112, 'parc', 'asphalte', 2, 3100)] },
  { id: 'gp-marches', nom: 'Grand Prix des Marchés', palier: 'regional', niveau: 2, prix: 15000, adversaires: 7, conditions: { points: 35, podiums: 3, classe: 'C' },
    manches: [c('Halles', 6121, 'ville', 'paves', 2, 2900), c('Rue Marchande', 6122, 'ville', 'paves', 2, 3000)] },
  { id: 'trophee-dunes', nom: 'Trophée des Dunes', palier: 'regional', niveau: 2, prix: 17000, adversaires: 7, conditions: { points: 45, podiums: 3, classe: 'C' },
    manches: [c('Grande Dune', 6131, 'plage', 'sable', 2, 3000), c('Plage des Surfeurs', 6132, 'plage', 'sable', 2, 3100)] },
  { id: 'coupe-docks', nom: 'Coupe des Docks', palier: 'regional', niveau: 2, prix: 17000, adversaires: 7, conditions: { points: 50, podiums: 4, classe: 'C' },
    manches: [c('Bassin à Flot', 6141, 'port', 'asphalte', 2, 3100), c('Écluse', 6142, 'port', 'mouille', 2, 3000), c('Môle', 6143, 'port', 'paves', 2, 3000)] },
  { id: 'gp-givre', nom: 'Grand Prix du Givre', palier: 'regional', niveau: 2, prix: 18000, adversaires: 7, conditions: { points: 55, podiums: 4, classe: 'C' },
    manches: [c('Patinoire', 6151, 'parc', 'glace', 2, 2900), c('Col du Petit Froid', 6152, 'banlieue', 'glace', 2, 3000)] },
  { id: 'endurance-faubourgs', nom: 'Endurance des Faubourgs', palier: 'regional', niveau: 2, prix: 19000, adversaires: 7, conditions: { points: 60, podiums: 5, victoires: 1, classe: 'C' },
    manches: [c('Boucle Longue', 6161, 'banlieue', 'asphalte', 3, 3200), c('Zone Artisanale', 6162, 'chantier', 'asphalte', 3, 3200)] },
  { id: 'coupe-vendanges', nom: 'Coupe des Vendanges', palier: 'regional', niveau: 2, prix: 20000, adversaires: 7, conditions: { points: 70, podiums: 5, victoires: 2, classe: 'C' },
    manches: [c('Coteaux', 6171, 'parc', 'terre', 2, 3100), c('Cave Coopérative', 6172, 'ville', 'paves', 2, 3000), c('Pressoir', 6173, 'parc', 'asphalte', 2, 3100)] },
  { id: 'masters-regional', nom: 'Masters Régional', palier: 'regional', niveau: 2, prix: 24000, adversaires: 7, conditions: { points: 90, podiums: 7, victoires: 3, classe: 'C' },
    manches: [c('Anneau des Maîtres', 6181, 'banlieue', 'asphalte', 3, 3300), c('Final Régional', 6182, 'ville', 'asphalte', 3, 3300)] },

  // --- National (niveau 3) -----------------------------------------------------------------
  { id: 'gp-cathedrales', nom: 'Grand Prix des Cathédrales', palier: 'national', niveau: 3, prix: 34000, adversaires: 9, conditions: { points: 85, podiums: 3, victoires: 1, classe: 'B' },
    manches: [c('Parvis', 6201, 'ville', 'paves', 2, 3400), c('Vieille Ville', 6202, 'ville', 'paves', 2, 3500)] },
  { id: 'rallye-volcans', nom: 'Rallye des Volcans', palier: 'national', niveau: 3, prix: 36000, adversaires: 9, conditions: { points: 90, podiums: 4, victoires: 1, classe: 'B' },
    manches: [c('Coulée Noire', 6211, 'chantier', 'terre', 2, 3500), c('Cratère', 6212, 'chantier', 'terre', 2, 3600), c('Lac de Cendres', 6213, 'chantier', 'sable', 2, 3400)] },
  { id: 'coupe-ponts', nom: 'Coupe des Ponts', palier: 'national', niveau: 3, prix: 36000, adversaires: 9, conditions: { points: 95, podiums: 4, victoires: 2, classe: 'B' },
    manches: [c('Pont Suspendu', 6221, 'port', 'asphalte', 2, 3500), c('Quai des Brumes', 6222, 'port', 'mouille', 2, 3500)] },
  { id: 'trophee-alpes', nom: 'Trophée des Sommets', palier: 'national', niveau: 3, prix: 40000, adversaires: 9, conditions: { points: 110, podiums: 5, victoires: 2, classe: 'B' },
    manches: [c('Station Haute', 6231, 'banlieue', 'glace', 2, 3500), c('Lacets du Col', 6232, 'parc', 'glace', 2, 3600), c('Descente du Glacier', 6233, 'parc', 'mouille', 2, 3500)] },
  { id: 'gp-riviera', nom: 'Grand Prix de la Riviera', palier: 'national', niveau: 3, prix: 42000, adversaires: 9, conditions: { points: 120, podiums: 6, victoires: 3, classe: 'B' },
    manches: [c('Croisette', 6241, 'plage', 'asphalte', 2, 3600), c('Casino', 6242, 'ville', 'asphalte', 2, 3600)] },
  { id: 'baja-nationale', nom: 'Baja Nationale', palier: 'national', niveau: 3, prix: 44000, adversaires: 9, conditions: { points: 130, podiums: 6, victoires: 3, classe: 'B' },
    manches: [c('Désert Rouge', 6251, 'plage', 'sable', 2, 3700), c('Oasis', 6252, 'plage', 'sable', 2, 3600), c('Piste des Caravanes', 6253, 'chantier', 'terre', 2, 3700)] },
  { id: 'nuit-capitale', nom: 'Nuit de la Capitale', palier: 'national', niveau: 3, prix: 46000, adversaires: 9, conditions: { points: 140, podiums: 7, victoires: 4, classe: 'B' },
    manches: [c('Grands Boulevards', 6261, 'ville', 'asphalte', 3, 3600), c('Tunnel des Halles', 6262, 'ville', 'asphalte', 3, 3600)] },
  { id: 'endurance-nationale', nom: '6 Heures Nationales', palier: 'national', niveau: 3, prix: 50000, adversaires: 9, conditions: { points: 160, podiums: 8, victoires: 5, classe: 'B' },
    manches: [c('Ligne Droite des Hunaudières', 6271, 'banlieue', 'asphalte', 4, 3800), c('Virage du Musée', 6272, 'parc', 'asphalte', 4, 3800)] },
  { id: 'masters-national', nom: 'Masters National', palier: 'national', niveau: 3, prix: 56000, adversaires: 9, conditions: { points: 180, podiums: 9, victoires: 6, classe: 'B' },
    manches: [c('Circuit du Roi', 6281, 'parc', 'asphalte', 3, 3800), c('Port Royal', 6282, 'port', 'paves', 3, 3700), c('Final National', 6283, 'ville', 'asphalte', 3, 3800)] },

  // --- Continental (niveau 4) --------------------------------------------------------------
  { id: 'gp-fjords', nom: 'Grand Prix des Fjords', palier: 'continental', niveau: 4, prix: 68000, adversaires: 9, conditions: { points: 170, victoires: 6, classe: 'A' },
    manches: [c('Fjord Gelé', 6301, 'port', 'glace', 3, 4000), c('Village de Pêcheurs', 6302, 'port', 'mouille', 3, 3900)] },
  { id: 'rallye-continent', nom: 'Rallye du Continent', palier: 'continental', niveau: 4, prix: 72000, adversaires: 9, conditions: { points: 190, victoires: 8, classe: 'A' },
    manches: [c('Forêt Profonde', 6311, 'parc', 'terre', 3, 4000), c('Gravier Blanc', 6312, 'chantier', 'terre', 3, 4100), c('Spéciale de Nuit', 6313, 'chantier', 'terre', 3, 4000)] },
  { id: 'coupe-metropoles', nom: 'Coupe des Métropoles', palier: 'continental', niveau: 4, prix: 78000, adversaires: 9, conditions: { points: 210, victoires: 9, classe: 'A' },
    manches: [c('Gratte-ciel', 6321, 'ville', 'asphalte', 3, 4100), c('Vieux Quartier', 6322, 'ville', 'paves', 3, 4000), c('Périphérique', 6323, 'banlieue', 'asphalte', 3, 4200)] },
  { id: 'traversee-desert', nom: 'Traversée du Désert', palier: 'continental', niveau: 4, prix: 82000, adversaires: 9, conditions: { points: 230, victoires: 10, classe: 'A' },
    manches: [c('Erg', 6331, 'plage', 'sable', 3, 4200), c('Canyon', 6332, 'chantier', 'terre', 3, 4100), c('Lac Salé', 6333, 'plage', 'sable', 3, 4300)] },
  { id: 'gp-mediterranee', nom: 'Grand Prix de Méditerranée', palier: 'continental', niveau: 4, prix: 88000, adversaires: 9, conditions: { points: 260, victoires: 12, classe: 'A' },
    manches: [c('Corniche Dorée', 6341, 'plage', 'asphalte', 3, 4200), c('Port de Plaisance', 6342, 'port', 'asphalte', 3, 4200)] },
  { id: 'endurance-continent', nom: '12 Heures du Continent', palier: 'continental', niveau: 4, prix: 96000, adversaires: 9, conditions: { points: 290, victoires: 14, classe: 'A' },
    manches: [c('Anneau de Vitesse', 6351, 'banlieue', 'asphalte', 4, 4400), c('Chicane des Pins', 6352, 'parc', 'asphalte', 4, 4300), c('Pluie de Nuit', 6353, 'parc', 'mouille', 4, 4300)] },
  { id: 'masters-continental', nom: 'Masters Continental', palier: 'continental', niveau: 4, prix: 110000, adversaires: 9, conditions: { points: 330, victoires: 16, classe: 'A' },
    manches: [c('Arène Continentale', 6361, 'ville', 'asphalte', 3, 4400), c('Grand Port', 6362, 'port', 'paves', 3, 4300), c('Final Continental', 6363, 'parc', 'asphalte', 3, 4400)] },

  // --- Mondial (niveau 5) ------------------------------------------------------------------
  { id: 'tour-monde', nom: 'Tour du Monde', palier: 'mondial', niveau: 5, prix: 180000, adversaires: 9, conditions: { points: 320, victoires: 18, classe: 'S' },
    manches: [c('Escale Tropicale', 6401, 'plage', 'asphalte', 3, 4500), c('Mégapole', 6402, 'ville', 'asphalte', 3, 4600), c('Toundra', 6403, 'parc', 'glace', 3, 4500), c('Retour au Port', 6404, 'port', 'mouille', 3, 4500)] },
  { id: 'rallye-mondial', nom: 'Rallye Mondial', palier: 'mondial', niveau: 5, prix: 200000, adversaires: 9, conditions: { points: 350, victoires: 22, classe: 'S' },
    manches: [c('Montagnes Russes', 6411, 'chantier', 'terre', 3, 4600), c('Grand Erg', 6412, 'plage', 'sable', 3, 4600), c('Banquise', 6413, 'port', 'glace', 3, 4500)] },
  { id: 'nuit-mondiale', nom: 'Grande Nuit Mondiale', palier: 'mondial', niveau: 5, prix: 230000, adversaires: 9, conditions: { points: 400, victoires: 26, classe: 'S' },
    manches: [c('Néons', 6421, 'ville', 'asphalte', 3, 4700), c('Marina', 6422, 'port', 'asphalte', 3, 4600), c('Skyline', 6423, 'ville', 'asphalte', 3, 4700)] },

  // --- Légendes (niveau 6) : la fin de carrière et la carrière+ ------------------------------
  { id: 'legendes-bronze', nom: 'Défi des Légendes : Bronze', palier: 'mondial', niveau: 6, prix: 300000, adversaires: 9, conditions: { points: 450, victoires: 30, classe: 'S' },
    manches: [c('Allée des Champions', 6501, 'parc', 'asphalte', 3, 4700), c('Mur des Records', 6502, 'ville', 'paves', 3, 4700), c('Virage des Héros', 6503, 'banlieue', 'asphalte', 3, 4800)] },
  { id: 'legendes-argent', nom: "Défi des Légendes : Argent", palier: 'mondial', niveau: 6, prix: 400000, adversaires: 9, conditions: { points: 520, victoires: 40, classe: 'S' },
    manches: [c('Désert des Légendes', 6511, 'plage', 'sable', 3, 4800), c('Glacier Éternel', 6512, 'parc', 'glace', 3, 4800), c('Forêt Mythique', 6513, 'chantier', 'terre', 3, 4800)] },
  { id: 'legendes-or', nom: "Défi des Légendes : Or", palier: 'mondial', niveau: 6, prix: 550000, adversaires: 9, conditions: { points: 600, victoires: 55, classe: 'S' },
    manches: [c('Panthéon', 6521, 'ville', 'asphalte', 4, 5000), c('Port des Immortels', 6522, 'port', 'mouille', 4, 4900), c('Dernier Virage', 6523, 'parc', 'asphalte', 4, 5000)] },
];
