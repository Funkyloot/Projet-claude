/* grands-prix.js — les 18 Grands Prix et 48 circuits du lancement.
 *
 * Un circuit n'est jamais dessiné à la main : il est décrit par une graine et
 * ses réglages, et le générateur (src/circuit.js) le recrée à l'identique.
 * Longueurs en pixels du monde (16 px = 1 case).
 *
 * `conditions` : ce que la candidature exige. Les Grands Prix ouverts n'en
 * ont pas : il suffit de posséder une voiture.
 */

const c = (nom, graine, theme, surface, tours, longueur) =>
  ({ nom, graine, theme, surface, tours, longueur });

export default [
  // --- Palier ouvert -------------------------------------------------------
  {
    id: 'coupe-debutants', nom: 'Coupe des Débutants', palier: 'ouvert', niveau: 1,
    prix: 5000, adversaires: 5,
    manches: [
      c('Parking du Supermarché', 1101, 'banlieue', 'asphalte', 2, 2300),
      c('Zone commerciale', 1102, 'ville', 'asphalte', 2, 2400),
    ],
  },
  {
    id: 'trophee-port', nom: 'Trophée du Port', palier: 'ouvert', niveau: 1,
    prix: 6000, adversaires: 5,
    manches: [
      c('Quais du Port', 1201, 'port', 'mouille', 2, 2500),
      c('Docks des Conteneurs', 1202, 'port', 'asphalte', 2, 2600),
    ],
  },
  {
    id: 'gp-ouverture', nom: "Grand Prix d'Ouverture", palier: 'ouvert', niveau: 1,
    prix: 7000, adversaires: 5,
    manches: [
      c('Avenue des Tilleuls', 1301, 'parc', 'asphalte', 2, 2500),
      c('Ruelles du Marché', 1302, 'ville', 'paves', 2, 2700),
    ],
  },

  {
    id: 'derby-quartier', nom: 'Derby du Quartier', palier: 'ouvert', niveau: 1,
    prix: 8000, adversaires: 5,
    manches: [
      c('Rue des Écoles', 1401, 'ville', 'asphalte', 2, 2400),
      c('Square des Lilas', 1402, 'parc', 'asphalte', 2, 2600),
      c('Chantier de la Gare', 1403, 'chantier', 'terre', 2, 2700),
    ],
  },

  // --- Palier régional -----------------------------------------------------
  {
    id: 'coupe-faubourgs', nom: 'Coupe des Faubourgs', palier: 'regional', niveau: 2,
    prix: 12000, adversaires: 7,
    conditions: { points: 30, podiums: 2, classe: 'C' },
    manches: [
      c('Chantier Nord', 2101, 'chantier', 'terre', 2, 3000),
      c('Zone industrielle', 2102, 'chantier', 'asphalte', 2, 3100),
    ],
  },
  {
    id: 'trophee-corniche', nom: 'Trophée de la Corniche', palier: 'regional', niveau: 2,
    prix: 13000, adversaires: 7,
    conditions: { points: 30, podiums: 2, classe: 'C' },
    manches: [
      c('Corniche de la Plage', 2201, 'plage', 'sable', 2, 3100),
      c('Phare du Cap', 2202, 'port', 'asphalte', 2, 3200),
    ],
  },
  {
    id: 'gp-collines', nom: 'Grand Prix des Collines', palier: 'regional', niveau: 2,
    prix: 14000, adversaires: 7,
    conditions: { points: 30, podiums: 2, classe: 'C' },
    manches: [
      c('Vignobles', 2301, 'parc', 'terre', 2, 3200),
      c('Col des Pins', 2302, 'parc', 'asphalte', 2, 3400),
    ],
  },

  {
    id: 'rallye-vignes', nom: 'Rallye des Vignes', palier: 'regional', niveau: 2,
    prix: 16000, adversaires: 7,
    conditions: { points: 45, podiums: 4, classe: 'C' },
    manches: [
      c('Chemin des Caves', 2401, 'parc', 'terre', 2, 3100),
      c('Pressoir', 2402, 'chantier', 'terre', 2, 3300),
      c('Grand Cru', 2403, 'parc', 'paves', 2, 3400),
    ],
  },

  // --- Palier national -----------------------------------------------------
  {
    id: 'gp-pistonville', nom: 'Grand Prix de Pistonville', palier: 'national', niveau: 3,
    prix: 30000, adversaires: 9,
    conditions: { points: 80, podiums: 3, victoires: 1, classe: 'B' },
    manches: [
      c('Stade de Pistonville', 3101, 'parc', 'asphalte', 3, 3400),
      c('Boulevard du Maire', 3102, 'ville', 'asphalte', 3, 3500),
    ],
  },
  {
    id: 'coupe-neiges', nom: 'Coupe des Neiges', palier: 'national', niveau: 3,
    prix: 32000, adversaires: 9,
    conditions: { points: 80, podiums: 3, victoires: 1, classe: 'B' },
    manches: [
      c('Lac gelé', 3201, 'parc', 'glace', 3, 3300),
      c('Station de ski', 3202, 'parc', 'glace', 2, 3600),
    ],
  },
  {
    id: 'rallye-desert', nom: 'Rallye du Désert', palier: 'national', niveau: 3,
    prix: 34000, adversaires: 9,
    conditions: { points: 80, podiums: 3, victoires: 1, classe: 'B' },
    manches: [
      c('Dunes Rouges', 3301, 'plage', 'sable', 2, 3700),
      c('Canyon', 3302, 'chantier', 'terre', 2, 3800),
    ],
  },

  {
    id: 'coupe-port-franc', nom: 'Coupe du Port Franc', palier: 'national', niveau: 3,
    prix: 38000, adversaires: 9,
    conditions: { points: 110, podiums: 5, victoires: 2, classe: 'B' },
    manches: [
      c('Docks Nord', 3401, 'port', 'mouille', 3, 3500),
      c('Grues et Conteneurs', 3402, 'port', 'asphalte', 3, 3600),
      c('Phare de la Jetée', 3403, 'port', 'mouille', 3, 3700),
    ],
  },
  {
    id: 'endurance-cols', nom: 'Endurance des Cols', palier: 'national', niveau: 3,
    prix: 42000, adversaires: 9,
    conditions: { points: 130, podiums: 6, victoires: 3, classe: 'B' },
    manches: [
      c('Col du Loup', 3501, 'parc', 'asphalte', 4, 3600),
      c('Descente des Sapins', 3502, 'parc', 'glace', 4, 3800),
    ],
  },

  // --- Palier continental --------------------------------------------------
  {
    id: 'gp-capitales', nom: 'Grand Prix des Capitales', palier: 'continental', niveau: 4,
    prix: 60000, adversaires: 9,
    conditions: { points: 160, victoires: 2, classe: 'A' },
    manches: [
      c('Quais de la Capitale', 4101, 'ville', 'paves', 3, 3600),
      c('Parc Royal', 4102, 'parc', 'asphalte', 3, 3800),
      c('Pont Suspendu', 4103, 'port', 'asphalte', 3, 4000),
    ],
  },
  {
    id: 'coupe-cotes', nom: 'Coupe des Côtes', palier: 'continental', niveau: 4,
    prix: 65000, adversaires: 9,
    conditions: { points: 160, victoires: 2, classe: 'A' },
    manches: [
      c('Riviera', 4201, 'plage', 'asphalte', 3, 3900),
      c('Falaises', 4202, 'port', 'mouille', 3, 4100),
      c('Port de plaisance', 4203, 'port', 'asphalte', 3, 4200),
    ],
  },

  {
    id: 'tour-iles', nom: 'Tour des Îles', palier: 'continental', niveau: 4,
    prix: 75000, adversaires: 9,
    conditions: { points: 200, victoires: 4, classe: 'A' },
    manches: [
      c('Île aux Palmiers', 4301, 'plage', 'sable', 3, 4000),
      c('Lagon Bleu', 4302, 'plage', 'asphalte', 3, 4100),
      c('Volcan', 4303, 'chantier', 'terre', 3, 4300),
    ],
  },

  // --- Palier mondial ------------------------------------------------------
  {
    id: 'gp-mondial', nom: 'Grand Prix Mondial', palier: 'mondial', niveau: 5,
    prix: 150000, adversaires: 9,
    conditions: { points: 300, victoires: 1, palierVictoire: 'continental', classe: 'S' },
    manches: [
      c('Métropole Néon', 5101, 'ville', 'asphalte', 3, 4000),
      c('Forêt tropicale', 5102, 'parc', 'terre', 3, 4200),
      c('Glaciers', 5103, 'parc', 'glace', 3, 4200),
      c('Grand Désert', 5104, 'plage', 'sable', 4, 4400),
      c('Autodrome International', 5105, 'parc', 'asphalte', 5, 4600),
      c('Finale de Pistonville', 5106, 'ville', 'asphalte', 5, 4800),
    ],
  },
  {
    id: 'super-coupe', nom: 'Super Coupe des Champions', palier: 'mondial', niveau: 5,
    prix: 250000, adversaires: 9,
    conditions: { points: 400, victoires: 12, classe: 'S' },
    manches: [
      c('Arène des Légendes', 5201, 'ville', 'asphalte', 4, 4400),
      c('Toundra', 5202, 'parc', 'glace', 4, 4500),
      c('Mirage', 5203, 'plage', 'sable', 4, 4600),
      c('Couronne de Pistonville', 5204, 'ville', 'paves', 5, 4800),
    ],
  },
];
