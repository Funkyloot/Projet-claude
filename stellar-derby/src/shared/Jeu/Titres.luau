--!strict
-- Titres — les titres qu'on gagne et qu'on peut afficher sous son nom.
--
-- Pur. Deux sortes :
--   - les titres « à condition » : une fonction qui regarde la sauvegarde et
--     répond vrai quand le titre est mérité (10 victoires, 50
--     entraînements…). ServiceRivales les vérifie régulièrement ;
--   - les titres « donnés » (condition = nil) : un service les accorde au bon
--     moment (battre une rivale, finir une carrière en Légende…), avec
--     Titres.donner(donnees, id).
--
-- Un titre se gagne une fois pour toutes ; le joueur choisit lequel afficher.

local Economie = require(script.Parent:WaitForChild("Economie"))

export type Titre = {
	id: string,
	nom: string,
	description: string,
	condition: ((any) -> boolean)?, -- reçoit les données (Schema.Donnees)
}

local Titres = {}

local function victoiresStrategie(d: any, strategie: string): number
	local s = d.stats.parStrategie[strategie]
	return if s then s.victoires else 0
end

local function meilleureLegende(d: any): number
	local meilleure = 0
	for _, l in d.legendes do
		meilleure = math.max(meilleure, l.note)
	end
	return meilleure
end

local function niveau(d: any): number
	return (Economie.niveau(d.xp))
end

Titres.liste = {
	-- Courses
	{
		id = "debutante",
		nom = "Débutante",
		description = "Courir sa première course.",
		condition = function(d)
			return d.stats.courses >= 1
		end,
	},
	{
		id = "premiere",
		nom = "Première victoire",
		description = "Gagner une course.",
		condition = function(d)
			return d.stats.victoires >= 1
		end,
	},
	{
		id = "habituee",
		nom = "Habituée des tribunes",
		description = "Courir 100 courses.",
		condition = function(d)
			return d.stats.courses >= 100
		end,
	},
	{
		id = "championne",
		nom = "Championne",
		description = "Gagner 10 courses.",
		condition = function(d)
			return d.stats.victoires >= 10
		end,
	},
	{
		id = "imbattable",
		nom = "Imbattable",
		description = "Gagner 50 courses.",
		condition = function(d)
			return d.stats.victoires >= 50
		end,
	},
	{
		id = "podium",
		nom = "Habituée du podium",
		description = "Monter 25 fois sur le podium.",
		condition = function(d)
			return d.stats.podiums >= 25
		end,
	},
	{
		id = "photo",
		nom = "Au millimètre",
		description = "Gagner une course au photo-finish.",
		condition = function(d)
			return d.stats.photoFinish >= 1
		end,
	},
	-- Stratégies
	{
		id = "fusee",
		nom = "Reine des fusées",
		description = "Gagner 5 courses en Fusée.",
		condition = function(d)
			return victoiresStrategie(d, "fusee") >= 5
		end,
	},
	{
		id = "ombre",
		nom = "Ombre insaisissable",
		description = "Gagner 5 courses en Ombre.",
		condition = function(d)
			return victoiresStrategie(d, "ombre") >= 5
		end,
	},
	{
		id = "vague",
		nom = "Déferlante",
		description = "Gagner 5 courses en Vague.",
		condition = function(d)
			return victoiresStrategie(d, "vague") >= 5
		end,
	},
	{
		id = "tempete",
		nom = "Œil du cyclone",
		description = "Gagner 5 courses en Tempête.",
		condition = function(d)
			return victoiresStrategie(d, "tempete") >= 5
		end,
	},
	{
		id = "polyvalente",
		nom = "Polyvalente",
		description = "Gagner au moins une course avec chacune des quatre stratégies.",
		condition = function(d)
			for _, id in { "fusee", "ombre", "vague", "tempete" } do
				if victoiresStrategie(d, id) < 1 then
					return false
				end
			end
			return true
		end,
	},
	-- Entraînement, concert, duo
	{
		id = "travailleuse",
		nom = "Travailleuse",
		description = "Faire 50 entraînements.",
		condition = function(d)
			return d.stats.entrainements >= 50
		end,
	},
	{
		id = "idole",
		nom = "Idole",
		description = "Monter 5 fois sur la scène du concert.",
		condition = function(d)
			return d.stats.concertsMeneuse >= 5
		end,
	},
	{
		id = "fan",
		nom = "Fan numéro un",
		description = "Assister à 20 concerts.",
		condition = function(d)
			return d.stats.concerts >= 20
		end,
	},
	{
		id = "duo",
		nom = "Duo de choc",
		description = "Mener 10 courses en duo avec une entraîneuse.",
		condition = function(d)
			return d.stats.duos >= 10
		end,
	},
	-- Carrière
	{
		id = "carriere",
		nom = "Diplômée de l'Académie",
		description = "Finir une carrière.",
		condition = function(d)
			return d.stats.carrieres >= 1
		end,
	},
	{
		id = "veterane",
		nom = "Vétérane",
		description = "Finir 5 carrières.",
		condition = function(d)
			return d.stats.carrieres >= 5
		end,
	},
	{
		id = "legende",
		nom = "Légende vivante",
		description = "Former une Légende notée 5 000 ou plus.",
		condition = function(d)
			return meilleureLegende(d) >= 5000
		end,
	},
	-- Niveaux
	{
		id = "niveau10",
		nom = "Entraîneuse confirmée",
		description = "Atteindre le niveau 10.",
		condition = function(d)
			return niveau(d) >= 10
		end,
	},
	{
		id = "niveau25",
		nom = "Entraîneuse experte",
		description = "Atteindre le niveau 25.",
		condition = function(d)
			return niveau(d) >= 25
		end,
	},
	{
		id = "niveau50",
		nom = "Maîtresse de l'Académie",
		description = "Atteindre le niveau 50.",
		condition = function(d)
			return niveau(d) >= 50
		end,
	},
	-- Donnés par un service
	{
		id = "destin",
		nom = "Briseuse de destin",
		description = "Battre une rivale qui t'avait battue d'une encolure.",
		condition = nil,
	},
	{
		id = "saison",
		nom = "Étoile de la saison",
		description = "Finir une saison parmi les dix premières.",
		condition = nil,
	},
	{
		id = "grandprix",
		nom = "Reine du week-end",
		description = "Gagner un Grand Prix du week-end.",
		condition = nil,
	},
	{
		id = "streameuse",
		nom = "Star du Live",
		description = "Animer une course en mode Live.",
		condition = nil,
	},
} :: { Titre }

local index: { [string]: Titre } = {}
for _, t in Titres.liste do
	index[t.id] = t
end

function Titres.parId(id: string): Titre?
	return index[id]
end

-- Accorde un titre (s'il existe et n'est pas déjà gagné). Renvoie vrai si
-- c'est nouveau. `heure` : os.time() fourni par l'appelant (ce module reste pur).
function Titres.donner(d: any, id: string, heure: number): boolean
	if not index[id] or d.titres[id] then
		return false
	end
	d.titres[id] = heure
	return true
end

-- Les titres à condition désormais mérités et pas encore gagnés.
function Titres.nouveaux(d: any): { Titre }
	local liste = {}
	for _, t in Titres.liste do
		local condition = t.condition
		if condition and not d.titres[t.id] then
			local ok, merite = pcall(condition, d)
			if ok and merite then
				table.insert(liste, t)
			end
		end
	end
	return liste
end

return Titres
