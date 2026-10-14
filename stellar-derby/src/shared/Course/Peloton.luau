--!strict
-- Peloton — compose la liste des partantes : les joueuses, puis des bots
-- jusqu'à remplir les stalles.
--
-- Les bots ont des noms originaux (aucun nom de vrai cheval de course), des
-- stats tirées autour du même total que les profils joueurs, et une
-- stratégie au hasard. Tout dépend de la graine : même graine, même peloton.

local Aleatoire = require(script.Parent:WaitForChild("Aleatoire"))
local Competences = require(script.Parent:WaitForChild("Competences"))
local Formules = require(script.Parent:WaitForChild("Formules"))
local Strategies = require(script.Parent:WaitForChild("Strategies"))

type Stats = Formules.Stats

export type Definition = {
	nom: string,
	strategie: string,
	stats: Stats,
	competences: { string },
	controle: "joueur" | "ia",
	userId: number?,
	apparence: number?, -- graine d'apparence des bots (couleurs, cheveux)
}

export type Profil = {
	id: string,
	nom: string,
	resume: string,
	stats: Stats,
}

local Peloton = {}

Peloton.TOTAL_STATS = 3000

-- Les quatre profils proposés au joueur ont tous le même total : on choisit
-- un style, pas un niveau.
Peloton.profils = {
	{
		id = "equilibree",
		nom = "Équilibrée",
		resume = "Aucun point faible.",
		stats = { vitesse = 600, souffle = 600, puissance = 600, coeur = 600, instinct = 600 },
	},
	{
		id = "sprinteuse",
		nom = "Sprinteuse",
		resume = "Une pointe redoutable, mais une réserve un peu courte.",
		stats = { vitesse = 720, souffle = 500, puissance = 680, coeur = 520, instinct = 580 },
	},
	{
		id = "endurante",
		nom = "Endurante",
		resume = "Tient la distance et ne lâche rien en duel.",
		stats = { vitesse = 540, souffle = 800, puissance = 520, coeur = 640, instinct = 500 },
	},
	{
		id = "tacticienne",
		nom = "Tacticienne",
		resume = "Lit la course : compétences plus faciles à placer.",
		stats = { vitesse = 590, souffle = 620, puissance = 560, coeur = 560, instinct = 670 },
	},
} :: { Profil }

function Peloton.profil(id: unknown): Profil
	for _, p in Peloton.profils do
		if p.id == id then
			return p
		end
	end
	return Peloton.profils[1]
end

Peloton.NOMS = {
	"Brise Lunaire",
	"Comète Écarlate",
	"Pluie d'Étoiles",
	"Cœur de Lave",
	"Vent du Sud",
	"Nuage Agile",
	"Plume d'Or",
	"Aurore Vive",
	"Sirène des Sables",
	"Éclair de Jade",
	"Rêve d'Azur",
	"Flamme Céleste",
	"Perle Marine",
	"Ombre Fugace",
	"Rose des Vents",
	"Lueur d'Ambre",
	"Galop Infini",
	"Neige Dansante",
	"Soleil Rebelle",
	"Corail Rieur",
	"Lune de Miel",
	"Étincelle Bleue",
	"Cascade Argent",
	"Mistral Joyeux",
	"Prisme Sauvage",
	"Orage Doux",
	"Fleur de Sel",
	"Chant du Large",
	"Volte Écume",
	"Ciel de Traîne",
}

local STATS = { "vitesse", "souffle", "puissance", "coeur", "instinct" }

-- Stats d'un bot : exactement le même total que les joueuses (personne
-- n'est avantagée), réparti au hasard mais sans extrêmes absurdes.
function Peloton.statsBot(rng: Aleatoire.Aleatoire): Stats
	local poids = {}
	local somme = 0
	for i = 1, #STATS do
		poids[i] = rng:entre(0.75, 1.25)
		somme += poids[i]
	end
	local stats = {} :: any
	local reparti = 0
	for i, nom in STATS do
		stats[nom] = math.floor(Peloton.TOTAL_STATS * poids[i] / somme + 0.5)
		reparti += stats[nom]
	end
	-- Les arrondis peuvent faire déborder d'un ou deux points : on corrige
	stats[STATS[#STATS]] += Peloton.TOTAL_STATS - reparti
	return stats :: Stats
end

function Peloton.competencesPour(strategie: string, rng: Aleatoire.Aleatoire): { string }
	return { Strategies.obtenir(strategie).signature, rng:choisir(Competences.generales) }
end

-- Complète `joueuses` avec des bots jusqu'à `taille` partantes.
function Peloton.completer(joueuses: { Definition }, taille: number, rng: Aleatoire.Aleatoire): { Definition }
	local definitions = table.clone(joueuses)
	local pris: { [string]: boolean } = {}
	for _, j in joueuses do
		pris[j.nom] = true
	end
	local noms = rng:melanger(table.clone(Peloton.NOMS))
	local indiceNom = 1
	while #definitions < taille do
		local nom = noms[indiceNom]
		indiceNom += 1
		if nom == nil then
			nom = `Coureuse {#definitions + 1}`
		end
		if not pris[nom] then
			pris[nom] = true
			local strategie = rng:choisir(Strategies.ordre)
			table.insert(definitions, {
				nom = nom,
				strategie = strategie,
				stats = Peloton.statsBot(rng),
				competences = Peloton.competencesPour(strategie, rng),
				controle = "ia",
				apparence = rng:entier(1, 1e6),
			})
		end
	end
	return definitions
end

return Peloton
