--!strict
-- Pistes — les trois hippodromes de l'Archipel des Vents.
--
-- Chaque hippodrome est un stade (deux lignes droites, deux virages) avec sa
-- propre géométrie, posé à son endroit du monde. Ce module reste pur : pas de
-- Vector3 ici, le passage au monde Roblox est fait par Monde.
--
-- La géométrie n'est pas choisie au hasard : elle place les stalles de chaque
-- course de son calendrier sur une ligne droite, à plus de 70 m du virage
-- suivant (un test le vérifie pour toutes les courses).

local Piste = require(script.Parent:WaitForChild("Piste"))

export type Definition = {
	id: string,
	nom: string,
	ile: string, -- nom de l'île, pour l'interface
	resume: string,
	ligneDroite: number, -- mètres
	rayon: number, -- mètres
	largeur: number, -- mètres
	positionArrivee: number, -- fraction de la ligne droite des tribunes
	origine: { x: number, z: number }, -- centre de l'hippodrome dans le monde, en studs
	theme: string, -- "prairie" | "plage" | "falaises" : décor et couleurs (voir Hippodrome)
}

local Pistes = {}

Pistes.LARGEUR = 14

Pistes.liste = {
	{
		id = "archipel",
		nom = "Hippodrome de l'Archipel",
		ile = "Île des Cerisiers",
		resume = "Le stade historique : gazon, cerisiers et étang. Une piste équilibrée.",
		ligneDroite = 300,
		rayon = 95,
		largeur = Pistes.LARGEUR,
		positionArrivee = 0.8,
		origine = { x = 0, z = -1150 },
		theme = "prairie",
	},
	{
		id = "baie",
		nom = "Hippodrome de la Baie",
		ile = "Île des Coquillages",
		resume = "Au bord de la mer : de longues lignes droites où l'on peut remonter.",
		ligneDroite = 380,
		rayon = 85,
		largeur = Pistes.LARGEUR,
		positionArrivee = 0.6,
		origine = { x = 1500, z = 450 },
		theme = "plage",
	},
	{
		id = "falaises",
		nom = "Hippodrome des Falaises",
		ile = "Île du Vent",
		resume = "Perché sur les falaises : piste courte, virages serrés, placement décisif.",
		ligneDroite = 270,
		rayon = 75,
		largeur = Pistes.LARGEUR,
		positionArrivee = 0.7,
		origine = { x = -1500, z = 450 },
		theme = "falaises",
	},
} :: { Definition }

local geometries: { [string]: Piste.Piste } = {}

function Pistes.parId(id: string): Definition?
	for _, d in Pistes.liste do
		if d.id == id then
			return d
		end
	end
	return nil
end

function Pistes.existe(id: unknown): boolean
	return type(id) == "string" and Pistes.parId(id) ~= nil
end

-- La géométrie (Piste) d'un hippodrome, construite une fois.
function Pistes.geometrie(id: string): Piste.Piste
	local existante = geometries[id]
	if existante then
		return existante
	end
	local d = Pistes.parId(id) or Pistes.liste[1]
	local piste = Piste.stade(d.ligneDroite, d.rayon, d.largeur, d.positionArrivee)
	geometries[id] = piste
	return piste
end

return Pistes
