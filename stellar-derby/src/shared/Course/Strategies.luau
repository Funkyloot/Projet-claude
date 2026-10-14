--!strict
-- Strategies — les quatre façons de courir.
--
-- Chaque stratégie module la vitesse de croisière et l'accélération selon la
-- phase de course (début, milieu, finale), et la réserve d'endurance.
-- Les coefficients de finale (troisième valeur de `vitesse`) sortent de
-- l'outil d'auto-réglage (tests/reglage.luau) ; le rapport complet est dans
-- docs/EQUILIBRAGE.md. Les modifier sans relancer ces outils revient à jouer
-- aux dés : un écart de 0,002 suffit à faire passer une Fusée de favorite à
-- outsider.
--
-- `zone` est la place visée dans le peloton, en fraction (0 = tête,
-- 1 = queue). Elle guide l'IA ; un joueur en fait ce qu'il veut.

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
}

local Strategies = {}

Strategies.parId = {
	fusee = {
		id = "fusee",
		nom = "Fusée",
		icone = "🚀",
		resume = "Part en tête et tente de tenir jusqu'au bout.",
		vitesse = { 1.000, 0.983, 0.968 },
		acceleration = { 1.000, 1.000, 0.996 },
		endurance = 0.95,
		zone = { 0, 0.15 },
		signature = "echappee",
	},
	ombre = {
		id = "ombre",
		nom = "Ombre",
		icone = "🌑",
		resume = "Colle aux meneuses, profite de leur sillage, frappe au dernier virage.",
		vitesse = { 0.978, 0.991, 0.978 },
		acceleration = { 0.985, 1.000, 0.996 },
		endurance = 0.89,
		zone = { 0.1, 0.4 },
		signature = "coupDeReins",
	},
	vague = {
		id = "vague",
		nom = "Vague",
		icone = "🌊",
		resume = "Reste au milieu du peloton et remonte en finale.",
		vitesse = { 0.938, 0.998, 0.990 },
		acceleration = { 0.975, 1.000, 1.000 },
		endurance = 1.00,
		zone = { 0.35, 0.7 },
		signature = "remontee",
	},
	tempete = {
		id = "tempete",
		nom = "Tempête",
		icone = "🌪️",
		resume = "Attend au fond, puis explose dans la dernière ligne droite.",
		vitesse = { 0.931, 1.000, 1.000 },
		acceleration = { 0.945, 1.000, 0.997 },
		endurance = 0.995,
		zone = { 0.65, 1 },
		signature = "ouragan",
	},
} :: { [string]: Strategie }

Strategies.ordre = { "fusee", "ombre", "vague", "tempete" }

function Strategies.obtenir(id: string): Strategie
	return Strategies.parId[id] or Strategies.parId.ombre
end

function Strategies.existe(id: unknown): boolean
	return type(id) == "string" and Strategies.parId[id] ~= nil
end

return Strategies
