--!strict
-- Catalogue — tout ce qui se possède : robes, tenues, bâtons lumineux, effets.
--
-- Pur : les couleurs sont des triplets { r, g, b } (0–255), que l'interface
-- convertit en Color3. Rien ici ne fait courir plus vite : ce sont des
-- cosmétiques, et seulement des cosmétiques.
--
--   robes    la couleur des oreilles et de la queue (accessoires dans Robes)
--   tenues   ce que la coureuse porte par-dessus son avatar en course
--   batons   la couleur du bâton lumineux au concert de la victoire
--   effets   le décor des cinématiques de compétence
--
-- `prix` en étoiles ; 0 = offert à tous. `niveau` = niveau d'entraîneuse
-- requis pour l'acheter (0 = aucun).

export type Couleur = { number }

export type Objet = {
	id: string,
	categorie: string, -- "robes" | "tenues" | "batons" | "effets"
	nom: string,
	description: string,
	prix: number,
	niveau: number,
	couleur: Couleur, -- couleur principale (pastille dans la boutique)
	couleur2: Couleur?, -- couleur secondaire (tenues, effets)
}

local Catalogue = {}

Catalogue.CATEGORIES = { "robes", "tenues", "batons", "effets" }

Catalogue.NOMS_CATEGORIES = {
	robes = "Robes",
	tenues = "Tenues",
	batons = "Bâtons lumineux",
	effets = "Effets de compétence",
}

local function objet(
	categorie: string,
	id: string,
	nom: string,
	prix: number,
	niveau: number,
	couleur: Couleur,
	couleur2: Couleur?,
	description: string
): Objet
	return {
		id = id,
		categorie = categorie,
		nom = nom,
		description = description,
		prix = prix,
		niveau = niveau,
		couleur = couleur,
		couleur2 = couleur2,
	}
end

Catalogue.liste = {
	-- Robes : mêmes identifiants que shared/Robes (accessoires du catalogue Roblox)
	objet("robes", "bai", "Bai brun", 0, 0, { 120, 72, 40 }, nil, "Le grand classique des hippodromes."),
	objet("robes", "noir", "Noir", 0, 0, { 30, 28, 32 }, nil, "Élégant et mystérieux."),
	objet("robes", "alezan", "Alezan", 0, 0, { 186, 100, 50 }, nil, "Une robe chaude, couleur de feuille d'automne."),
	objet("robes", "cuivre", "Alezan cuivré", 350, 0, { 170, 80, 40 }, nil, "Des reflets de cuivre au soleil."),
	objet("robes", "isabelle", "Isabelle", 350, 0, { 222, 190, 130 }, nil, "Un pelage de sable doré."),
	objet("robes", "gris", "Gris perle", 450, 3, { 190, 190, 200 }, nil, "Discrète et lumineuse."),
	objet("robes", "rose", "Rose poudré", 600, 5, { 245, 180, 205 }, nil, "Pour les idoles de la piste."),
	objet("robes", "framboise", "Framboise", 600, 5, { 200, 50, 100 }, nil, "Vive et pétillante."),
	objet("robes", "prune", "Prune", 750, 8, { 110, 50, 120 }, nil, "Une robe de soirée."),
	objet("robes", "nuit", "Bleu nuit", 900, 12, { 40, 50, 120 }, nil, "La couleur du ciel avant les étoiles."),

	-- Tenues : une écharpe et un ruban, portés par-dessus l'avatar en course
	objet(
		"tenues",
		"academie",
		"Uniforme de l'Académie",
		0,
		0,
		{ 255, 255, 255 },
		{ 255, 95, 160 },
		"Blanc et rose, aux couleurs de l'Académie."
	),
	objet(
		"tenues",
		"cerisier",
		"Fleur de cerisier",
		400,
		2,
		{ 255, 200, 220 },
		{ 255, 255, 255 },
		"Un ruban de pétales roses."
	),
	objet(
		"tenues",
		"marine",
		"Marinière",
		400,
		2,
		{ 40, 70, 150 },
		{ 255, 255, 255 },
		"L'air du large, tout droit de la Baie."
	),
	objet(
		"tenues",
		"foret",
		"Sous-bois",
		500,
		4,
		{ 60, 120, 70 },
		{ 230, 210, 150 },
		"Vert sapin, comme aux Falaises."
	),
	objet(
		"tenues",
		"soleil",
		"Soleil levant",
		650,
		6,
		{ 255, 170, 50 },
		{ 255, 230, 120 },
		"Pour celles qui partent devant."
	),
	objet(
		"tenues",
		"orage",
		"Ciel d'orage",
		800,
		10,
		{ 70, 70, 110 },
		{ 120, 200, 255 },
		"Électrique, pour les fins de course."
	),
	objet(
		"tenues",
		"etoile",
		"Étoile filante",
		1200,
		15,
		{ 30, 25, 60 },
		{ 255, 210, 80 },
		"La tenue des futures Légendes."
	),
	objet(
		"tenues",
		"royale",
		"Tenue royale",
		2000,
		25,
		{ 120, 30, 60 },
		{ 255, 200, 60 },
		"Réservée aux plus grandes."
	),

	-- Bâtons lumineux du concert
	objet("batons", "rose", "Rose", 0, 0, { 255, 95, 160 }, nil, "La couleur de l'Académie."),
	objet("batons", "bleu", "Bleu ciel", 150, 0, { 90, 190, 255 }, nil, "Doux comme un matin à la Baie."),
	objet("batons", "vert", "Vert menthe", 150, 0, { 90, 230, 150 }, nil, "Frais et joyeux."),
	objet("batons", "or", "Or", 300, 3, { 255, 200, 60 }, nil, "Pour applaudir une gagnante."),
	objet("batons", "violet", "Violet", 300, 3, { 170, 110, 240 }, nil, "La couleur des Falaises au couchant."),
	objet(
		"batons",
		"arcenciel",
		"Arc-en-ciel",
		800,
		10,
		{ 255, 120, 120 },
		{ 120, 200, 255 },
		"Toutes les couleurs à la fois."
	),

	-- Effets des cinématiques de compétence
	objet(
		"effets",
		"etoiles",
		"Pluie d'étoiles",
		0,
		0,
		{ 255, 215, 60 },
		{ 255, 255, 255 },
		"Des étoiles filent derrière toi."
	),
	objet("effets", "petales", "Pétales", 500, 3, { 255, 180, 210 }, { 255, 255, 255 }, "Un tourbillon de cerisiers."),
	objet("effets", "eclairs", "Éclairs", 700, 6, { 120, 200, 255 }, { 255, 255, 255 }, "La foudre te suit."),
	objet("effets", "bulles", "Bulles", 500, 3, { 140, 220, 255 }, { 220, 250, 255 }, "Légère comme l'écume."),
	objet("effets", "flammes", "Flammes", 1000, 12, { 255, 110, 40 }, { 255, 220, 90 }, "Pour les finales brûlantes."),
} :: { Objet }

local index: { [string]: { [string]: Objet } } = {}
for _, o in Catalogue.liste do
	local categorie = index[o.categorie]
	if not categorie then
		categorie = {}
		index[o.categorie] = categorie
	end
	categorie[o.id] = o
end

function Catalogue.obtenir(categorie: string, id: string): Objet?
	local c = index[categorie]
	return c and c[id]
end

function Catalogue.existe(categorie: unknown, id: unknown): boolean
	return type(categorie) == "string" and type(id) == "string" and Catalogue.obtenir(categorie, id) ~= nil
end

function Catalogue.deCategorie(categorie: string): { Objet }
	local liste = {}
	for _, o in Catalogue.liste do
		if o.categorie == categorie then
			table.insert(liste, o)
		end
	end
	return liste
end

-- Ce qui est offert à tous (prix 0), par catégorie.
function Catalogue.offerts(categorie: string): { [string]: boolean }
	local ensemble = {}
	for _, o in Catalogue.liste do
		if o.categorie == categorie and o.prix == 0 then
			ensemble[o.id] = true
		end
	end
	return ensemble
end

return Catalogue
