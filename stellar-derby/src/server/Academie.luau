--!strict
-- Academie — l'île du centre, où l'on apparaît : le hub du jeu.
--
-- Tout autour d'une place à fontaine :
--   les trois portails des hippodromes (courses libres), chacun tourné vers
--   son île ; le centre d'entraînement et ses cinq ateliers ; le bureau des
--   carrières ; la boutique ; les tableaux des classements ; la guide, qui
--   relance le tutoriel.
--
-- Chaque lieu porte une invite d'interaction dont l'attribut « Action » dit
-- au client quoi ouvrir (voir client/Interactions) :
--   course:<piste>   entrainement:<stat>   carriere   boutique
--   classements      tutoriel              academie
-- Tout est aussi accessible depuis le menu, sans marcher : sur téléphone,
-- l'île est un décor à vivre, pas un passage obligé.
--
-- La mer qui entoure les îles est remplie ici, une fois pour tout le monde.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Config = require(Partage:WaitForChild("Config"))
local Construction = require(Partage:WaitForChild("Construction"))
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Monde = require(Partage:WaitForChild("Monde"))
local Aleatoire = require(Partage:WaitForChild("Course"):WaitForChild("Aleatoire"))
local Pistes = require(Partage:WaitForChild("Course"):WaitForChild("Pistes"))

local piece = Construction.piece
local etiquette = Construction.etiquette

local Academie = {}

export type Reperes = {
	racine: Instance,
	apparition: SpawnLocation,
}

local CENTRE = Monde.ACADEMIE
local RAYON = Monde.RAYON_ACADEMIE
local BLANC = Color3.fromRGB(250, 248, 252)
local PIERRE = Color3.fromRGB(226, 220, 232)

-- Les cinq ateliers d'entraînement, un par stat
Academie.STATS = {
	{ id = "vitesse", nom = "Piste de sprint", icone = "⚡" },
	{ id = "souffle", nom = "Bassin de souffle", icone = "🌬️" },
	{ id = "puissance", nom = "Côte des départs", icone = "💥" },
	{ id = "coeur", nom = "Colline du courage", icone = "❤️" },
	{ id = "instinct", nom = "Salle de lecture", icone = "👁️" },
}

local function sol(position: Vector3): Vector3
	return Vector3.new(position.X, 0, position.Z)
end

-- ─────────────────────────────── Terrain ───────────────────────────────

-- La mer, sous toutes les îles : un rectangle qui les englobe avec de la marge.
local function remplirMer()
	if not Config.MER then
		return
	end
	local terrain = Workspace.Terrain
	local minX, maxX, minZ, maxZ = CENTRE.X - RAYON, CENTRE.X + RAYON, CENTRE.Z - RAYON, CENTRE.Z + RAYON
	for _, repere in Monde.tous() do
		local o = repere.origine
		minX = math.min(minX, o.X - repere.demiLargeur - 420)
		maxX = math.max(maxX, o.X + repere.demiLargeur + 420)
		minZ = math.min(minZ, o.Z - repere.demiProfondeur - 420)
		maxZ = math.max(maxZ, o.Z + repere.demiProfondeur + 420)
	end
	local centre = Vector3.new((minX + maxX) / 2, -7, (minZ + maxZ) / 2)
	-- Le fond de sable, puis l'eau par-dessus, jusqu'à 2 studs sous le niveau des îles
	terrain:FillBlock(
		CFrame.new(centre + Vector3.new(0, -5, 0)),
		Vector3.new(maxX - minX, 4, maxZ - minZ),
		Enum.Material.Sand
	)
	terrain:FillBlock(CFrame.new(centre), Vector3.new(maxX - minX, 10, maxZ - minZ), Enum.Material.Water)
end

local function construireTerrain()
	local terrain = Workspace.Terrain
	local rng = Aleatoire.nouveau(77)
	-- Une plage, puis l'herbe de l'île
	terrain:FillCylinder(CFrame.new(CENTRE + Vector3.new(0, -5, 0)), 8, RAYON + 50, Enum.Material.Sand)
	terrain:FillCylinder(CFrame.new(CENTRE + Vector3.new(0, -4, 0)), 8, RAYON, Enum.Material.Grass)
	-- La place pavée et les allées vers chaque lieu
	terrain:FillCylinder(CFrame.new(CENTRE + Vector3.new(0, -1.9, 0)), 4, 46, Enum.Material.Pavement)
	for _, cible in Academie.lieux() do
		local vers = sol(cible) - CENTRE
		local longueur = vers.Magnitude
		if longueur > 1 then
			local milieu = CENTRE + vers / 2
			terrain:FillBlock(
				CFrame.lookAt(milieu + Vector3.new(0, -1.9, 0), sol(cible) + Vector3.new(0, -1.9, 0)),
				Vector3.new(12, 4, longueur),
				Enum.Material.Pavement
			)
		end
	end
	-- Quelques bosses d'herbe sur les bords
	for _ = 1, 24 do
		local angle = rng:entre(0, 2 * math.pi)
		local recul = rng:entre(RAYON - 70, RAYON - 20)
		local rayon = rng:entre(14, 28)
		terrain:FillBall(
			CENTRE + Vector3.new(math.cos(angle) * recul, -rayon * 0.6, math.sin(angle) * recul),
			rayon,
			Enum.Material.Grass
		)
	end
end

-- ─────────────────────────────── Lieux ───────────────────────────────

-- Position des portails : sur le bord de la place, dans la direction de l'île.
local function positionPortail(id: string): Vector3
	local repere = Monde.pour(id)
	local vers = sol(repere.origine) - CENTRE
	return CENTRE + vers.Unit * 120
end

local POSITIONS = {
	entrainement = Vector3.new(-120, 0, -60),
	carriere = Vector3.new(120, 0, -60),
	boutique = Vector3.new(70, 0, 145),
	classements = Vector3.new(-70, 0, 145),
	guide = Vector3.new(0, 0, 40),
}

-- Tous les lieux de l'île (les allées y mènent).
function Academie.lieux(): { Vector3 }
	local liste = {}
	for _, def in Pistes.liste do
		table.insert(liste, positionPortail(def.id))
	end
	for _, nom in { "entrainement", "carriere", "boutique", "classements" } do
		table.insert(liste, CENTRE + POSITIONS[nom])
	end
	return liste
end

-- Un petit bâtiment : murs, toit en pente, enseigne au-dessus de la porte.
local function batiment(
	parent: Instance,
	nom: string,
	centre: Vector3,
	taille: Vector3,
	couleurToit: Color3,
	enseigne: string
): (Model, CFrame)
	local modele = Instance.new("Model")
	modele.Name = nom
	modele.Parent = parent
	-- La façade regarde la place
	local orientation = CFrame.lookAt(centre, Vector3.new(CENTRE.X, centre.Y, CENTRE.Z))
	local base = orientation * CFrame.new(0, taille.Y / 2, 0)
	-- Trois murs et deux montants de façade : on peut entrer
	piece(modele, "MurFond", Vector3.new(taille.X, taille.Y, 1), base * CFrame.new(0, 0, taille.Z / 2), BLANC)
	piece(modele, "MurGauche", Vector3.new(1, taille.Y, taille.Z), base * CFrame.new(-taille.X / 2, 0, 0), BLANC)
	piece(modele, "MurDroit", Vector3.new(1, taille.Y, taille.Z), base * CFrame.new(taille.X / 2, 0, 0), BLANC)
	for _, cote in { -1, 1 } do
		piece(
			modele,
			"Facade",
			Vector3.new(taille.X * 0.3, taille.Y, 1),
			base * CFrame.new(cote * taille.X * 0.35, 0, -taille.Z / 2),
			BLANC
		)
	end
	piece(
		modele,
		"Linteau",
		Vector3.new(taille.X * 0.4, taille.Y * 0.3, 1),
		base * CFrame.new(0, taille.Y * 0.35, -taille.Z / 2),
		BLANC
	)
	piece(modele, "Plancher", Vector3.new(taille.X, 0.6, taille.Z), orientation * CFrame.new(0, 0.3, 0), PIERRE)
	for _, cote in { -1, 1 } do
		piece(
			modele,
			"Toit",
			Vector3.new(taille.X + 3, 1, taille.Z * 0.62),
			base * CFrame.new(0, taille.Y / 2 + 2.2, cote * taille.Z * 0.26) * CFrame.Angles(cote * math.rad(22), 0, 0),
			couleurToit
		)
	end
	local panneau = piece(
		modele,
		"Enseigne",
		Vector3.new(taille.X * 0.7, 3, 0.6),
		base * CFrame.new(0, taille.Y / 2 + 1.4, -taille.Z / 2 - 0.6),
		Couleurs.FOND
	)
	etiquette(panneau, Enum.NormalId.Front, enseigne, Couleurs.ROSE, nil, 20)
	return modele, orientation
end

local function construirePortails(parent: Instance)
	local dossier = Instance.new("Folder")
	dossier.Name = "Portails"
	dossier.Parent = parent
	for _, def in Pistes.liste do
		local position = positionPortail(def.id)
		local vers = (sol(Monde.pour(def.id).origine) - CENTRE).Unit
		local orientation = CFrame.lookAt(position, position + vers)
		local modele = Instance.new("Model")
		modele.Name = `Portail_{def.id}`
		modele.Parent = dossier
		local couleur = if def.theme == "plage"
			then Couleurs.CIEL
			elseif def.theme == "falaises" then Color3.fromRGB(150, 110, 220)
			else Couleurs.ROSE
		for _, cote in { -1, 1 } do
			piece(modele, "Pilier", Vector3.new(2.5, 16, 2.5), orientation * CFrame.new(cote * 8, 8, 0), couleur)
		end
		local fronton =
			piece(modele, "Fronton", Vector3.new(19, 3.5, 2), orientation * CFrame.new(0, 17, 0), Couleurs.FOND)
		etiquette(fronton, Enum.NormalId.Back, def.nom, couleur, nil, 14)
		local rideau = piece(
			modele,
			"Rideau",
			Vector3.new(13.5, 14, 0.4),
			orientation * CFrame.new(0, 7.5, 0),
			couleur,
			Enum.Material.Neon
		)
		rideau.Transparency = 0.55
		rideau.CanCollide = false
		local dalle = piece(modele, "Dalle", Vector3.new(16, 0.6, 10), orientation * CFrame.new(0, 0.3, 2), PIERRE)
		Construction.invite(dalle, `course:{def.id}`, "Courir ici", def.nom)
	end
end

local function construireEntrainement(parent: Instance)
	local centre = CENTRE + POSITIONS.entrainement
	local modele, orientation = batiment(
		parent,
		"CentreEntrainement",
		centre,
		Vector3.new(40, 14, 26),
		Color3.fromRGB(120, 200, 150),
		"CENTRE D'ENTRAÎNEMENT"
	)
	-- Les cinq ateliers, en arc devant le bâtiment
	for i, stat in Academie.STATS do
		local angle = (i - 3) * 0.42
		local position = (orientation * CFrame.new(math.sin(angle) * 26, 0, -14 - math.cos(angle) * 8)).Position
		local face = CFrame.lookAt(position, Vector3.new(CENTRE.X, 0, CENTRE.Z))
		local socle = piece(modele, `Atelier_{stat.id}`, Vector3.new(7, 0.8, 7), face * CFrame.new(0, 0.4, 0), PIERRE)
		local borne =
			piece(modele, `Borne_{stat.id}`, Vector3.new(4, 5, 0.8), face * CFrame.new(0, 3.3, 2.5), Couleurs.FOND)
		etiquette(borne, Enum.NormalId.Front, `{stat.icone} {stat.nom}`, Couleurs.TEXTE, nil, 30)
		Construction.invite(socle, `entrainement:{stat.id}`, "S'entraîner", stat.nom)
	end
end

local function construireCarrieres(parent: Instance)
	local centre = CENTRE + POSITIONS.carriere
	local modele, orientation = batiment(
		parent,
		"BureauCarrieres",
		centre,
		Vector3.new(30, 14, 22),
		Color3.fromRGB(250, 190, 110),
		"BUREAU DES CARRIÈRES"
	)
	local bureau = piece(
		modele,
		"Bureau",
		Vector3.new(10, 3.4, 3),
		orientation * CFrame.new(0, 1.7, 2),
		Color3.fromRGB(160, 110, 80),
		Enum.Material.Wood
	)
	Construction.invite(bureau, "carriere", "Ma carrière", "Bureau des carrières")
end

local function construireBoutique(parent: Instance)
	local centre = CENTRE + POSITIONS.boutique
	local modele, orientation =
		batiment(parent, "Boutique", centre, Vector3.new(30, 14, 22), Couleurs.ROSE_PALE, "BOUTIQUE & GARDE-ROBE")
	local comptoir = piece(
		modele,
		"Comptoir",
		Vector3.new(12, 3.4, 3),
		orientation * CFrame.new(0, 1.7, 3),
		Couleurs.ROSE,
		Enum.Material.SmoothPlastic
	)
	Construction.invite(comptoir, "boutique", "Ouvrir la boutique", "Boutique")
	-- Un grand miroir pour la garde-robe
	local miroir = piece(
		modele,
		"Miroir",
		Vector3.new(8, 10, 0.4),
		orientation * CFrame.new(-9, 5.5, 10.4),
		Color3.fromRGB(200, 225, 240),
		Enum.Material.Glass
	)
	miroir.Reflectance = 0.4
end

local function construireClassements(parent: Instance)
	local centre = CENTRE + POSITIONS.classements
	local modele = Instance.new("Model")
	modele.Name = "Classements"
	modele.Parent = parent
	local orientation = CFrame.lookAt(centre, Vector3.new(CENTRE.X, 0, CENTRE.Z))
	local titres = {
		{ nom = "Tableau_victoires", titre = "🏆 Victoires" },
		{ nom = "Tableau_saison", titre = "⭐ Saison" },
		{ nom = "Tableau_legendes", titre = "👑 Légendes" },
	}
	for i, t in titres do
		local x = (i - 2) * 15
		local tableau = piece(
			modele,
			t.nom,
			Vector3.new(13, 16, 0.8),
			orientation * CFrame.new(x, 10, 0) * CFrame.Angles(0, (i - 2) * -0.25, 0),
			Couleurs.FOND_SOMBRE
		)
		local fronton =
			piece(modele, "Titre", Vector3.new(13, 2.4, 0.8), tableau.CFrame * CFrame.new(0, 9.4, 0), Couleurs.ROSE)
		etiquette(fronton, Enum.NormalId.Front, t.titre, Couleurs.BLANC, nil, 24)
		piece(modele, "Pied", Vector3.new(1, 2, 1), tableau.CFrame * CFrame.new(0, -9, 0), Color3.fromRGB(80, 80, 90))
	end
	local socle = piece(modele, "Socle", Vector3.new(44, 0.6, 10), orientation * CFrame.new(0, 0.3, -5), PIERRE)
	Construction.invite(socle, "classements", "Voir les classements", "Classements")
end

local function construirePlace(parent: Instance): SpawnLocation
	local modele = Instance.new("Model")
	modele.Name = "Place"
	modele.Parent = parent
	-- La fontaine et son étoile
	local bassin = piece(
		modele,
		"Bassin",
		Vector3.new(3, 22, 22),
		CFrame.new(CENTRE + Vector3.new(0, 1.5, 0)) * CFrame.Angles(0, 0, math.pi / 2),
		PIERRE,
		Enum.Material.Marble
	)
	bassin.Shape = Enum.PartType.Cylinder
	local eau = piece(
		modele,
		"Eau",
		Vector3.new(0.4, 19, 19),
		CFrame.new(CENTRE + Vector3.new(0, 3.1, 0)) * CFrame.Angles(0, 0, math.pi / 2),
		Color3.fromRGB(110, 190, 240),
		Enum.Material.Glass
	)
	eau.Shape = Enum.PartType.Cylinder
	eau.Transparency = 0.3
	piece(
		modele,
		"Colonne",
		Vector3.new(2, 10, 2),
		CFrame.new(CENTRE + Vector3.new(0, 7, 0)),
		PIERRE,
		Enum.Material.Marble
	)
	local etoile = piece(
		modele,
		"Etoile",
		Vector3.new(5, 5, 1),
		CFrame.new(CENTRE + Vector3.new(0, 14.5, 0)) * CFrame.Angles(0, 0, math.rad(45)),
		Couleurs.OR,
		Enum.Material.Neon
	)
	local lumiere = Instance.new("PointLight")
	lumiere.Range = 24
	lumiere.Brightness = 1.2
	lumiere.Color = Couleurs.OR
	lumiere.Parent = etoile

	-- Le point d'apparition, face à la fontaine
	local apparition = Instance.new("SpawnLocation")
	apparition.Name = "Apparition"
	apparition.Anchored = true
	apparition.Size = Vector3.new(14, 1, 14)
	local position = CENTRE + Vector3.new(0, 0.5, 30)
	apparition.CFrame = CFrame.lookAt(position, CENTRE + Vector3.new(0, 0.5, 0))
	apparition.Color = Couleurs.ROSE_PALE
	apparition.Material = Enum.Material.SmoothPlastic
	apparition.Duration = 0
	apparition.Neutral = true
	apparition.Parent = modele

	-- La guide, qui relance le tutoriel
	local guide = piece(
		modele,
		"Guide",
		Vector3.new(3, 6, 3),
		CFrame.new(CENTRE + POSITIONS.guide + Vector3.new(14, 3, 0)),
		Couleurs.CIEL
	)
	Construction.invite(guide, "tutoriel", "Revoir le tutoriel", "La guide")
	return apparition
end

local function construireDecor(parent: Instance)
	local dossier = Instance.new("Folder")
	dossier.Name = "Decor"
	dossier.Parent = parent
	local rng = Aleatoire.nouveau(4096)
	local lieux = Academie.lieux()
	local function loinDesLieux(p: Vector3): boolean
		if (p - CENTRE).Magnitude < 60 then
			return false
		end
		for _, lieu in lieux do
			if (p - sol(lieu)).Magnitude < 34 then
				return false
			end
		end
		return true
	end
	-- Des arbres en boules (à remplacer par de vrais modèles : voir Habillage)
	local poses = 0
	local essais = 0
	while poses < 46 and essais < 400 do
		essais += 1
		local angle = rng:entre(0, 2 * math.pi)
		local recul = rng:entre(70, RAYON - 25)
		local position = CENTRE + Vector3.new(math.cos(angle) * recul, 0, math.sin(angle) * recul)
		if loinDesLieux(position) then
			poses += 1
			local modele = Instance.new("Model")
			modele.Name = "Arbre"
			modele.Parent = dossier
			local hauteur = rng:entre(8, 13)
			piece(
				modele,
				"Tronc",
				Vector3.new(1.4, hauteur, 1.4),
				CFrame.new(position + Vector3.new(0, hauteur / 2, 0)),
				Color3.fromRGB(110, 75, 50),
				Enum.Material.Wood
			)
			local feuillage = if rng:reel() < 0.4
				then Color3.fromRGB(250, 185, 210)
				else Color3.fromRGB(math.floor(rng:entre(60, 85)), math.floor(rng:entre(130, 165)), 70)
			local diametre = rng:entre(8, 12)
			local boule = piece(
				modele,
				"Feuillage",
				Vector3.new(diametre, diametre, diametre),
				CFrame.new(position + Vector3.new(0, hauteur + diametre * 0.25, 0)),
				feuillage,
				Enum.Material.Grass
			)
			boule.Shape = Enum.PartType.Ball
		end
	end
	-- Des lampadaires autour de la place
	for i = 1, 8 do
		local angle = i / 8 * 2 * math.pi
		local position = CENTRE + Vector3.new(math.cos(angle) * 50, 0, math.sin(angle) * 50)
		piece(
			dossier,
			"Lampadaire",
			Vector3.new(0.6, 10, 0.6),
			CFrame.new(position + Vector3.new(0, 5, 0)),
			Color3.fromRGB(60, 60, 70)
		)
		local lampe = piece(
			dossier,
			"Lampe",
			Vector3.new(1.6, 1.6, 1.6),
			CFrame.new(position + Vector3.new(0, 10.6, 0)),
			Color3.fromRGB(255, 230, 180),
			Enum.Material.Neon
		)
		local lumiere = Instance.new("PointLight")
		lumiere.Range = 22
		lumiere.Brightness = 0.9
		lumiere.Color = Color3.fromRGB(255, 225, 180)
		lumiere.Parent = lampe
	end
end

local function reperesDe(racine: Instance): Reperes
	local place = racine:WaitForChild("Place")
	return {
		racine = racine,
		apparition = place:WaitForChild("Apparition") :: SpawnLocation,
	}
end

local cache: Reperes? = nil

-- Construit l'île (et la mer). Comme les hippodromes, un décor déjà présent
-- dans la place est gardé tel quel ; le terrain est toujours rempli.
function Academie.construire(): Reperes
	remplirMer()
	construireTerrain()
	local existant = Workspace:FindFirstChild("Academie")
	if existant then
		cache = reperesDe(existant)
		return cache :: Reperes
	end
	local racine = Instance.new("Folder")
	racine.Name = "Academie"
	construirePlace(racine)
	construirePortails(racine)
	construireEntrainement(racine)
	construireCarrieres(racine)
	construireBoutique(racine)
	construireClassements(racine)
	construireDecor(racine)
	racine.Parent = Workspace
	cache = reperesDe(racine)
	return cache :: Reperes
end

function Academie.reperes(): Reperes?
	return cache
end

return Academie
