--!strict
-- Robes — la couleur de pelage d'une coureuse : oreilles, queue et, pour les
-- bots, coiffure assorties.
--
-- Tous les accessoires viennent du catalogue Roblox. Dans un jeu, on peut en
-- habiller n'importe quel personnage sans les acheter : c'est gratuit pour
-- le jeu comme pour les joueurs. Les oreilles et les queues sont du même
-- créateur (dvdko), pour un style cohérent ; les coiffures viennent de
-- Maki Salon et Tropika Fashion, déclinées dans chaque couleur.
--
-- Un objet du catalogue peut disparaître un jour (retiré par son créateur
-- ou par la modération) : Coureuses retombe alors sur des oreilles et une
-- queue fabriquées par le code, dans la couleur `couleur`.
--
-- Pour changer un accessoire : chercher sur roblox.com/catalog, ouvrir la
-- page de l'objet, et copier le nombre de son adresse
-- (roblox.com/catalog/123456789/...).

export type Robe = {
	id: string,
	nom: string,
	couleur: Color3,
	oreilles: number, -- chapeau (HatAccessory)
	queue: number, -- accessoire de taille (WaistAccessory)
	cheveux: { number }, -- coiffures des bots (publiées comme FaceAccessory)
}

local Robes = {}

Robes.liste = {
	{
		id = "noir",
		nom = "Noir",
		couleur = Color3.fromRGB(35, 30, 34),
		oreilles = 102871282497587,
		queue = 121350304694867,
		cheveux = { 14356869075, 14569349472, 16035742691 },
	},
	{
		id = "bai",
		nom = "Bai brun",
		couleur = Color3.fromRGB(95, 58, 38),
		oreilles = 139195035207985,
		queue = 131077655971542,
		cheveux = { 14356870235, 14569352444, 16035727009 },
	},
	{
		id = "alezan",
		nom = "Alezan",
		couleur = Color3.fromRGB(140, 45, 38),
		oreilles = 135953558127627,
		queue = 83891724290197,
		cheveux = { 14356872470, 14569355842 },
	},
	{
		id = "cuivre",
		nom = "Alezan cuivré",
		couleur = Color3.fromRGB(195, 95, 50),
		oreilles = 124545786780185,
		queue = 133698075321084,
		cheveux = { 14356871210, 14569353898 },
	},
	{
		id = "isabelle",
		nom = "Isabelle",
		couleur = Color3.fromRGB(225, 185, 130),
		oreilles = 98759053200111,
		queue = 84985181877405,
		cheveux = { 14356867262, 14569348347, 16035712482 },
	},
	{
		id = "gris",
		nom = "Gris perle",
		couleur = Color3.fromRGB(225, 225, 232),
		oreilles = 122087437715412,
		queue = 95335805158857,
		cheveux = { 14356864435, 14569345508, 16035736147 },
	},
	{
		id = "rose",
		nom = "Rose poudré",
		couleur = Color3.fromRGB(205, 140, 150),
		oreilles = 139441207267632,
		queue = 98064396309972,
		cheveux = { 14356874054, 14569357133 },
	},
	{
		id = "framboise",
		nom = "Framboise",
		couleur = Color3.fromRGB(200, 60, 105),
		oreilles = 115844051284944,
		queue = 83996562919801,
		cheveux = { 14356875699, 14569358289 },
	},
	{
		id = "prune",
		nom = "Prune",
		couleur = Color3.fromRGB(85, 55, 95),
		oreilles = 112949195435318,
		queue = 131513607272809,
		cheveux = { 14356879626, 14569363069 },
	},
	{
		id = "nuit",
		nom = "Bleu nuit",
		couleur = Color3.fromRGB(40, 58, 75),
		oreilles = 103279528885139,
		queue = 112472909998808,
		cheveux = { 14356878023, 14569361496 },
	},
} :: { Robe }

Robes.PAR_DEFAUT = "bai"

function Robes.obtenir(id: unknown): Robe
	for _, r in Robes.liste do
		if r.id == id then
			return r
		end
	end
	return Robes.obtenir(Robes.PAR_DEFAUT)
end

function Robes.existe(id: unknown): boolean
	for _, r in Robes.liste do
		if r.id == id then
			return true
		end
	end
	return false
end

return Robes
