--!strict
-- Competences — les coups d'éclat d'une coureuse.
--
-- Une compétence se « prépare » quand sa condition devient vraie, puis reste
-- prête pendant une courte fenêtre. Le joueur doit la déclencher dans cette
-- fenêtre ; passé le délai, elle est perdue pour la course. L'Instinct
-- allonge la fenêtre. Les bots la déclenchent tout seuls, plus ou moins vite
-- selon leur Instinct.
--
-- Chaque coureuse porte la compétence signature de sa stratégie, plus une
-- compétence générale.

export type Contexte = {
	phase: number,
	fraction: number, -- part de la distance parcourue
	restant: number, -- mètres jusqu'à l'arrivée
	rang: number,
	partantes: number,
	enVirage: boolean,
	ligneDroiteFinale: boolean,
	couloir: number,
	enduranceRelative: number,
	aspirationDepuis: number, -- secondes passées dans un sillage
	duel: boolean,
}

export type Effet = {
	genre: "vitesse" | "acceleration" | "endurance",
	valeur: number, -- m/s, m/s² ou fraction de l'endurance max
	duree: number,
}

export type Competence = {
	id: string,
	nom: string,
	description: string,
	effet: Effet,
	condition: (Contexte) -> boolean,
}

local function rangRelatif(c: Contexte): number
	if c.partantes <= 1 then
		return 0
	end
	return (c.rang - 1) / (c.partantes - 1)
end

local Competences = {}

Competences.parId = {
	-- Signatures de stratégie
	echappee = {
		id = "echappee",
		nom = "Échappée belle",
		description = "Début de course, en tête ou deuxième : accélère pour creuser l'écart.",
		effet = { genre = "vitesse", valeur = 0.3, duree = 3.5 },
		condition = function(c)
			return c.fraction >= 0.05 and c.fraction < 0.25 and c.rang <= 2
		end,
	},
	coupDeReins = {
		id = "coupDeReins",
		nom = "Coup de reins",
		description = "Dans le dernier virage, entre la 2e et la 5e place : jaillit vers l'avant.",
		effet = { genre = "vitesse", valeur = 0.35, duree = 3.5 },
		condition = function(c)
			return c.phase == 3 and c.enVirage and c.rang >= 2 and c.rang <= 5
		end,
	},
	remontee = {
		id = "remontee",
		nom = "Remontée",
		description = "En finale, au cœur du peloton : remonte les concurrentes une à une.",
		effet = { genre = "vitesse", valeur = 0.35, duree = 4 },
		condition = function(c)
			local r = rangRelatif(c)
			return c.phase == 3 and r >= 0.3 and r <= 0.8
		end,
	},
	ouragan = {
		id = "ouragan",
		nom = "Ouragan",
		description = "Dernière ligne droite, dans la seconde moitié du peloton : tout donner.",
		effet = { genre = "vitesse", valeur = 0.45, duree = 3.5 },
		condition = function(c)
			return c.ligneDroiteFinale and rangRelatif(c) >= 0.45
		end,
	},

	-- Compétences générales
	cordeSerree = {
		id = "cordeSerree",
		nom = "Corde serrée",
		description = "En virage, collée à la lice : prend le virage au plus court.",
		effet = { genre = "vitesse", valeur = 0.2, duree = 3 },
		condition = function(c)
			return c.phase >= 2 and c.enVirage and c.couloir < 1.5
		end,
	},
	secondSouffle = {
		id = "secondSouffle",
		nom = "Second souffle",
		description = "Au milieu de course, endurance sous 55 % : récupère un peu.",
		effet = { genre = "endurance", valeur = 0.055, duree = 0 },
		condition = function(c)
			return c.phase == 2 and c.enduranceRelative < 0.55
		end,
	},
	sillage = {
		id = "sillage",
		nom = "Dans le sillage",
		description = "Trois secondes à l'abri derrière une concurrente : récupère de l'endurance.",
		effet = { genre = "endurance", valeur = 0.04, duree = 0 },
		condition = function(c)
			return c.phase <= 2 and c.aspirationDepuis >= 3
		end,
	},
	teteFroide = {
		id = "teteFroide",
		nom = "Tête froide",
		description = "En tête au milieu de course : gère son effort sans paniquer.",
		effet = { genre = "endurance", valeur = 0.035, duree = 0 },
		condition = function(c)
			return c.phase == 2 and c.rang == 1
		end,
	},
	regardAcier = {
		id = "regardAcier",
		nom = "Regard d'acier",
		description = "En plein duel : refuse de céder un centimètre.",
		effet = { genre = "acceleration", valeur = 0.4, duree = 2.5 },
		condition = function(c)
			return c.duel
		end,
	},
	departCanon = {
		id = "departCanon",
		nom = "Départ canon",
		description = "Dans les premiers mètres : sort des stalles comme une flèche.",
		effet = { genre = "acceleration", valeur = 0.6, duree = 2 },
		condition = function(c)
			return c.fraction < 0.03
		end,
	},
} :: { [string]: Competence }

Competences.generales = { "cordeSerree", "secondSouffle", "sillage", "teteFroide", "regardAcier", "departCanon" }

-- Durée pendant laquelle une compétence prête attend d'être déclenchée
function Competences.fenetre(instinct: number): number
	return 1.5 + instinct / 600
end

-- Probabilité par seconde qu'un bot déclenche une compétence prête
function Competences.reflexeBot(instinct: number): number
	return 0.8 + instinct / 1000
end

function Competences.existe(id: unknown): boolean
	return type(id) == "string" and Competences.parId[id] ~= nil
end

return Competences
