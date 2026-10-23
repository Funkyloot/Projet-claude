--!strict
-- Strategies — les quatre façons de courir.
--
-- Chaque stratégie module la vitesse de croisière et l'accélération selon la
-- phase de course (début, milieu, finale), et la réserve d'endurance.
-- Les coefficients de finale (troisième valeur de `vitesse`) sortent de
-- l'outil d'auto-réglage (tests/reglage.luau) ; le rapport complet est dans
-- docs/EQUILIBRAGE.md. Les modifier sans relancer ces outils revient à jouer
-- aux dés : un écart de 0,002 suffit à faire passer une Fusée de favorite à
-- outsider. L'outil égalise le rang moyen des stratégies et réduit l'écart
-- de victoires ; il en reste un, voulu : la Fusée est régulière (plus forte
-- en sprint), la Tempête joue le tout ou rien (plus forte sur le long).
--
-- `zone` est la place visée dans le peloton, en fraction (0 = tête,
-- 1 = queue). Elle guide l'IA ; un joueur en fait ce qu'il veut.
--
-- `finale` affine le coefficient de finale par catégorie de course (Sprint,
-- Mile, Moyenne, Longue) : sans lui, une Fusée qui brille sur 1 200 m
-- s'effondre sur 3 200 m. Strategies.pour(id, categorie) rend la stratégie
-- avec le bon coefficient ; le moteur et le HUD passent par là.

export type Strategie = {
	id: string,
	nom: string,
	icone: string,
	resume: string,
	vitesse: { number }, -- coefficient de vitesse par phase
	acceleration: { number }, -- coefficient d'accélération par phase
	endurance: number, -- coefficient de réserve d'endurance
	zone: { number }, -- { min, max }
	signature: string, -- compétence propre à la stratégie
	finale: { [string]: number }?, -- coefficient de finale par catégorie de course
}

local Strategies = {}

Strategies.parId = {
	fusee = {
		id = "fusee",
		nom = "Fusée",
		icone = "🚀",
		resume = "Part en tête et tente de tenir jusqu'au bout.",
		vitesse = { 1.000, 0.983, 0.9787 },
		acceleration = { 1.000, 1.000, 0.996 },
		endurance = 0.95,
		zone = { 0, 0.15 },
		signature = "echappee",
		finale = { Sprint = 0.9782, Mile = 0.9779, Moyenne = 0.9806, Longue = 1.0103 },
	},
	ombre = {
		id = "ombre",
		nom = "Ombre",
		icone = "🌑",
		resume = "Colle aux meneuses, profite de leur sillage, frappe au dernier virage.",
		vitesse = { 0.978, 0.991, 0.9775 },
		acceleration = { 0.985, 1.000, 0.996 },
		endurance = 0.89,
		zone = { 0.1, 0.4 },
		signature = "coupDeReins",
		finale = { Sprint = 0.9782, Mile = 0.9774, Moyenne = 0.9755, Longue = 0.9754 },
	},
	vague = {
		id = "vague",
		nom = "Vague",
		icone = "🌊",
		resume = "Reste au milieu du peloton et remonte en finale.",
		vitesse = { 0.938, 0.998, 0.9859 },
		acceleration = { 0.975, 1.000, 1.000 },
		endurance = 1.00,
		zone = { 0.35, 0.7 },
		signature = "remontee",
		finale = { Sprint = 0.9872, Mile = 0.9885, Moyenne = 0.9877, Longue = 0.9865 },
	},
	tempete = {
		id = "tempete",
		nom = "Tempête",
		icone = "🌪️",
		resume = "Attend au fond, puis explose dans la dernière ligne droite.",
		vitesse = { 0.931, 1.000, 0.9941 },
		acceleration = { 0.945, 1.000, 0.997 },
		endurance = 0.995,
		zone = { 0.65, 1 },
		signature = "ouragan",
		finale = { Sprint = 0.9924, Mile = 0.9925, Moyenne = 0.9924, Longue = 0.9649 },
	},
} :: { [string]: Strategie }

Strategies.ordre = { "fusee", "ombre", "vague", "tempete" }

function Strategies.obtenir(id: string): Strategie
	return Strategies.parId[id] or Strategies.parId.ombre
end

local parCategorie: { [string]: Strategie } = {}

-- La stratégie `id` telle qu'elle court dans une course de cette catégorie :
-- son coefficient de finale est celui de la catégorie, s'il y en a un.
function Strategies.pour(id: string, categorie: string?): Strategie
	local base = Strategies.obtenir(id)
	local finale = base.finale
	local coefficient = finale and categorie and finale[categorie]
	if not coefficient then
		return base
	end
	local cle = `{base.id}/{categorie}`
	local existante = parCategorie[cle]
	if existante and existante.vitesse[3] == coefficient then
		return existante
	end
	local copie = table.clone(base)
	copie.vitesse = { base.vitesse[1], base.vitesse[2], coefficient }
	parCategorie[cle] = copie
	return copie
end

function Strategies.existe(id: unknown): boolean
	return type(id) == "string" and Strategies.parId[id] ~= nil
end

return Strategies
