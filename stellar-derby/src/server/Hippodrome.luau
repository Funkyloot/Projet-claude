--!strict
-- Hippodrome — construit les trois hippodromes par le code.
--
-- Chacun a sa géométrie (Course/Pistes) et son thème :
--   prairie   l'Archipel : gazon, cerisiers, étang, tribune rose et blanche
--   plage     la Baie : sable, palmiers, lanternes pour les courses de nuit
--   falaises  les Falaises : rochers, sapins, murs de roche
--
-- Pour chacun : terrain, piste, lices, arche d'arrivée, poteaux de distance,
-- tribune, écran géant, podium, scène du concert de la victoire et décor.
-- Rien n'est à importer dans Studio ; on peut ensuite remplacer n'importe
-- quel élément par un vrai modèle sans toucher au reste du jeu.
--
-- Rappel d'orientation : `couloir` = mètres depuis la corde vers l'extérieur
-- (négatif = côté intérieur), `s` = mètres depuis la ligne d'arrivée.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Construction = require(Partage:WaitForChild("Construction"))
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Monde = require(Partage:WaitForChild("Monde"))
local Aleatoire = require(Partage:WaitForChild("Course"):WaitForChild("Aleatoire"))
local Pistes = require(Partage:WaitForChild("Course"):WaitForChild("Pistes"))

local ECHELLE = Monde.ECHELLE
local piece = Construction.piece
local etiquette = Construction.etiquette

local Hippodrome = {}

-- Emplacements utiles au jeu
export type Reperes = {
	id: string,
	racine: Instance,
	podium: { BasePart },
	ecran: BasePart,
	tribune: BasePart, -- là où l'on pose les joueurs qui viennent courir ou regarder
	scene: Model,
}

type Theme = {
	herbe: Color3,
	herbeDense: Color3,
	sable: Color3,
	gazonA: Color3,
	gazonB: Color3,
	gradinA: Color3,
	gradinB: Color3,
	mur: Color3,
	toit: Color3,
	accent: Color3,
	nomEnseigne: string,
	arbres: "prairie" | "plage" | "falaises",
	etang: boolean,
	plage: boolean,
	falaises: boolean,
	lanternes: boolean,
}

local BLANC_LICE = Color3.fromRGB(250, 250, 250)

local THEMES: { [string]: Theme } = {
	prairie = {
		herbe = Color3.fromRGB(104, 158, 70),
		herbeDense = Color3.fromRGB(86, 140, 58),
		sable = Color3.fromRGB(226, 208, 160),
		gazonA = Color3.fromRGB(96, 168, 74),
		gazonB = Color3.fromRGB(110, 184, 84),
		gradinA = Color3.fromRGB(235, 235, 245),
		gradinB = Color3.fromRGB(215, 220, 235),
		mur = Color3.fromRGB(240, 235, 245),
		toit = Couleurs.ROSE_PALE,
		accent = Couleurs.ROSE,
		nomEnseigne = "HIPPODROME DE L'ARCHIPEL",
		arbres = "prairie",
		etang = true,
		plage = false,
		falaises = false,
		lanternes = false,
	},
	plage = {
		herbe = Color3.fromRGB(128, 178, 86),
		herbeDense = Color3.fromRGB(104, 160, 70),
		sable = Color3.fromRGB(238, 222, 172),
		gazonA = Color3.fromRGB(104, 176, 82),
		gazonB = Color3.fromRGB(118, 190, 92),
		gradinA = Color3.fromRGB(240, 248, 255),
		gradinB = Color3.fromRGB(210, 230, 248),
		mur = Color3.fromRGB(235, 245, 255),
		toit = Color3.fromRGB(150, 210, 250),
		accent = Couleurs.CIEL,
		nomEnseigne = "HIPPODROME DE LA BAIE",
		arbres = "plage",
		etang = false,
		plage = true,
		falaises = false,
		lanternes = true,
	},
	falaises = {
		herbe = Color3.fromRGB(92, 140, 78),
		herbeDense = Color3.fromRGB(76, 122, 66),
		sable = Color3.fromRGB(196, 186, 160),
		gazonA = Color3.fromRGB(88, 156, 76),
		gazonB = Color3.fromRGB(100, 170, 86),
		gradinA = Color3.fromRGB(236, 232, 245),
		gradinB = Color3.fromRGB(214, 208, 232),
		mur = Color3.fromRGB(232, 226, 242),
		toit = Color3.fromRGB(170, 150, 215),
		accent = Color3.fromRGB(150, 110, 220),
		nomEnseigne = "HIPPODROME DES FALAISES",
		arbres = "falaises",
		etang = false,
		plage = false,
		falaises = true,
		lanternes = false,
	},
}

function Hippodrome.theme(id: string): Theme
	local def = Pistes.parId(id) or Pistes.liste[1]
	return THEMES[def.theme] or THEMES.prairie
end

-- Pièce orientée le long de la piste, entre s0 et s1, au couloir donné.
-- La longueur tient compte de la courbure : à l'extérieur d'un virage, un
-- tronçon est plus long qu'à la corde.
local function troncon(
	repere: Monde.Repere,
	parent: Instance,
	nom: string,
	s0: number,
	s1: number,
	couloir: number,
	largeur: number,
	hauteur: number,
	y: number,
	couleur: Color3,
	materiau: Enum.Material?
): Part
	local milieu = (s0 + s1) / 2
	local courbure = repere.piste:courbure(milieu)
	local bordExterieur = couloir + largeur / 2
	local longueur = (s1 - s0) * (1 + math.max(0, courbure * bordExterieur)) + 0.15
	local cadre = repere:cadre(milieu, couloir, y)
	return piece(parent, nom, Vector3.new(largeur * ECHELLE, hauteur, longueur * ECHELLE), cadre, couleur, materiau)
end

-- ─────────────────────────────── Terrain ───────────────────────────────

local MARGE = 300

local function construireTerrain(repere: Monde.Repere, theme: Theme)
	local terrain = Workspace.Terrain
	local rng = Aleatoire.nouveau(1789 + #repere.id * 31)
	local O = repere.origine
	local A, B = repere.demiLargeur, repere.demiProfondeur
	local largeurPiste = repere.piste.largeur

	-- La plage d'abord, un peu plus grande que l'île : elle borde la mer
	local bordure = if theme.plage then 120 else 30
	terrain:FillBlock(
		CFrame.new(O + Vector3.new(0, -5, 0)),
		Vector3.new(A * 2 + (MARGE + bordure) * 2, 8, B * 2 + (MARGE + bordure) * 2),
		Enum.Material.Sand
	)
	terrain:FillBlock(
		CFrame.new(O + Vector3.new(0, -4, 0)),
		Vector3.new(A * 2 + MARGE * 2, 8, B * 2 + MARGE * 2),
		Enum.Material.Grass
	)

	if theme.plage then
		-- Des dunes plutôt que des collines
		for _ = 1, 30 do
			local angle = rng:entre(0, 2 * math.pi)
			local recul = rng:entre(110, MARGE - 20)
			local rayon = rng:entre(20, 45)
			local position = O + Vector3.new(math.cos(angle) * (A + recul), -rayon * 0.7, math.sin(angle) * (B + recul))
			terrain:FillBall(position, rayon, Enum.Material.Sand)
		end
	else
		-- Des collines tout autour, qui ferment l'horizon : des boules à moitié
		-- enterrées, assez loin de la piste et de la tribune.
		for _ = 1, 46 do
			local angle = rng:entre(0, 2 * math.pi)
			local recul = rng:entre(110, MARGE - 30)
			local rayon = rng:entre(35, 85)
			local position = O + Vector3.new(math.cos(angle) * (A + recul), -rayon * 0.6, math.sin(angle) * (B + recul))
			terrain:FillBall(position, rayon, Enum.Material.Grass)
		end
	end

	-- Des rochers dans les collines ; aux Falaises, de vrais murs de roche
	local nombreRochers = if theme.falaises then 70 else 14
	for i = 1, nombreRochers do
		local angle = rng:entre(0, 2 * math.pi)
		local recul = if theme.falaises then rng:entre(150, MARGE - 10) else rng:entre(90, MARGE - 40)
		local rayon = if theme.falaises and i % 2 == 0 then rng:entre(18, 40) else rng:entre(4, 10)
		local enfoui = if theme.falaises then -rayon * 0.15 else -rayon * 0.35
		local position = O + Vector3.new(math.cos(angle) * (A + recul), enfoui, math.sin(angle) * (B + recul))
		terrain:FillBall(position, rayon, Enum.Material.Rock)
	end

	if theme.etang then
		-- Un étang au milieu de l'herbe intérieure, bordé d'une plage
		local def = Pistes.parId(repere.id) or Pistes.liste[1]
		local centre = repere:versMonde(def.ligneDroite / 2, def.rayon, 0)
		local bassins = {}
		for i, decalage in { -60, 0, 60 } do
			local position = centre + Vector3.new(decalage, 0, (i - 2) * 8)
			table.insert(bassins, { position = position, rayon = if decalage == 0 then 70 else 48 })
		end
		for _, bassin in bassins do
			terrain:FillCylinder(
				CFrame.new(bassin.position + Vector3.new(0, -1.5, 0)),
				3,
				bassin.rayon + 7,
				Enum.Material.Sand
			)
		end
		for _, bassin in bassins do
			local cylindre = CFrame.new(bassin.position + Vector3.new(0, -3, 0))
			terrain:FillCylinder(cylindre, 8, bassin.rayon, Enum.Material.Air)
			terrain:FillCylinder(cylindre * CFrame.new(0, -1.5, 0), 5, bassin.rayon, Enum.Material.Water)
			terrain:FillCylinder(cylindre * CFrame.new(0, -4.5, 0), 2, bassin.rayon + 2, Enum.Material.Sand)
		end
	end

	-- Des taches d'herbe plus dense dans l'herbe intérieure et autour
	for _ = 1, 30 do
		local s = rng:entre(0, repere.piste.longueur)
		local couloir = if rng:reel() < 0.5 then -rng:entre(10, 30) else largeurPiste + rng:entre(12, 40)
		local position = repere:point(s, couloir, -1.9)
		terrain:FillBlock(
			CFrame.new(position) * CFrame.Angles(0, rng:entre(0, math.pi), 0),
			Vector3.new(rng:entre(12, 30), 4, rng:entre(12, 30)),
			Enum.Material.LeafyGrass
		)
	end
end

-- ───────────────────────────── Piste et lices ─────────────────────────────

local function construirePiste(repere: Monde.Repere, theme: Theme, parent: Instance)
	local dossier = Instance.new("Folder")
	dossier.Name = "Piste"
	dossier.Parent = parent
	local piste = repere.piste
	local largeur = piste.largeur

	-- Gazon tondu en bandes : alterner deux verts donne l'impression de
	-- vitesse, et un très léger décalage de hauteur évite le scintillement
	-- là où deux tronçons se chevauchent en virage.
	local pas = 3
	local n = math.ceil(piste.longueur / pas)
	for i = 0, n - 1 do
		local s0 = i * piste.longueur / n
		local s1 = (i + 1) * piste.longueur / n
		local bande = math.floor(s0 / 9) % 2 == 0
		troncon(
			repere,
			dossier,
			"Gazon",
			s0,
			s1,
			largeur / 2,
			largeur,
			1,
			Monde.SOL - 0.5 - (i % 2) * 0.02,
			if bande then theme.gazonA else theme.gazonB,
			Enum.Material.Grass
		)
	end

	-- Lices : un tube blanc à la corde et un à l'extérieur, sur poteaux
	local lices = Instance.new("Folder")
	lices.Name = "Lices"
	lices.Parent = parent
	local pasLice = 4
	local nLice = math.ceil(piste.longueur / pasLice)
	for _, couloir in { -0.35, largeur + 0.35 } do
		for i = 0, nLice - 1 do
			local s0 = i * piste.longueur / nLice
			local s1 = (i + 1) * piste.longueur / nLice
			local milieu = (s0 + s1) / 2
			local longueur = (s1 - s0) * (1 + math.max(0, piste:courbure(milieu) * couloir)) + 0.1
			local tube = piece(
				lices,
				"Lice",
				Vector3.new(longueur * ECHELLE, 0.35, 0.35),
				repere:cadre(milieu, couloir, 2.4) * CFrame.Angles(0, math.pi / 2, 0),
				BLANC_LICE
			)
			tube.Shape = Enum.PartType.Cylinder
			if i % 2 == 0 then
				piece(lices, "Poteau", Vector3.new(0.3, 2.4, 0.3), repere:cadre(s0, couloir, 1.2), BLANC_LICE)
			end
		end
	end

	-- Des lanternes le long de la lice extérieure, pour les courses de nuit
	if theme.lanternes then
		local pasLanterne = 40
		local nLanternes = math.floor(piste.longueur / pasLanterne)
		for i = 0, nLanternes - 1 do
			local s = i * piste.longueur / nLanternes
			local base = repere:point(s, largeur + 2.2, 0)
			piece(
				lices,
				"Mat",
				Vector3.new(0.5, 9, 0.5),
				CFrame.new(base + Vector3.new(0, 4.5, 0)),
				Color3.fromRGB(60, 60, 70)
			)
			local lampe = piece(
				lices,
				"Lanterne",
				Vector3.new(1.6, 1.6, 1.6),
				CFrame.new(base + Vector3.new(0, 9.4, 0)),
				Color3.fromRGB(255, 210, 140),
				Enum.Material.Neon
			)
			local lumiere = Instance.new("PointLight")
			lumiere.Range = 34
			lumiere.Brightness = 1.6
			lumiere.Color = Color3.fromRGB(255, 214, 160)
			lumiere.Shadows = false
			lumiere.Parent = lampe
		end
	end
end

local function construireArrivee(repere: Monde.Repere, theme: Theme, parent: Instance)
	local modele = Instance.new("Model")
	modele.Name = "Arrivee"
	modele.Parent = parent
	local largeur = repere.piste.largeur

	-- Ligne blanche et damier au sol
	piece(
		modele,
		"Ligne",
		Vector3.new(largeur * ECHELLE, 0.1, 0.5),
		repere:cadre(0, largeur / 2, Monde.SOL + 0.02),
		BLANC_LICE
	)
	local case = 1.5
	local colonnes = math.floor(largeur * ECHELLE / case)
	for rang = 1, 2 do
		for col = 0, colonnes - 1 do
			local couloir = (col + 0.5) * case / ECHELLE
			local noir = (col + rang) % 2 == 0
			piece(
				modele,
				"Damier",
				Vector3.new(case, 0.1, case),
				repere:cadre(rang * case / ECHELLE, couloir, Monde.SOL + 0.03),
				if noir then Color3.fromRGB(30, 30, 30) else BLANC_LICE
			)
		end
	end

	-- Poteau d'arrivée côté corde
	piece(modele, "PoteauArrivee", Vector3.new(0.5, 9, 0.5), repere:cadre(0, -1.2, 4.5), BLANC_LICE)
	local disque = piece(modele, "Miroir", Vector3.new(0.3, 3, 3), repere:cadre(0, -1.2, 9.5), theme.accent)
	disque.Shape = Enum.PartType.Cylinder

	-- L'arche « ARRIVÉE » au-dessus de la piste
	local hauteur = 20
	for _, couloir in { -2.2, largeur + 2.2 } do
		piece(modele, "Pilier", Vector3.new(2.2, hauteur, 2.2), repere:cadre(0, couloir, hauteur / 2), theme.accent)
	end
	local portee = (largeur + 4.4) * ECHELLE + 2.2
	local poutre = piece(
		modele,
		"Bandeau",
		Vector3.new(portee, 4.5, 1.2),
		repere:cadre(0, largeur / 2, hauteur - 1.5),
		Couleurs.FOND
	)
	etiquette(poutre, Enum.NormalId.Back, "ARRIVÉE", theme.accent, nil, 30)
	etiquette(poutre, Enum.NormalId.Front, "★ STELLAR DERBY ★", theme.accent, nil, 30)
end

local function construirePoteauxDistance(repere: Monde.Repere, theme: Theme, parent: Instance)
	local dossier = Instance.new("Folder")
	dossier.Name = "PoteauxDistance"
	dossier.Parent = parent
	local piste = repere.piste
	local restant = 200
	while restant < piste.longueur - 60 do
		local s = -restant
		local tangente = repere:tangente(s)
		local base = repere:point(s, -1.4, 0)
		piece(dossier, "Poteau", Vector3.new(0.4, 7, 0.4), CFrame.new(base + Vector3.new(0, 3.5, 0)), BLANC_LICE)
		local position = base + Vector3.new(0, 7.5, 0)
		-- Le panneau regarde les coureuses qui arrivent
		local panneau = piece(
			dossier,
			"Panneau",
			Vector3.new(3.2, 2, 0.3),
			CFrame.lookAt(position, position - tangente),
			if restant == 200 then theme.accent else BLANC_LICE
		)
		etiquette(
			panneau,
			Enum.NormalId.Front,
			tostring(restant),
			if restant == 200 then BLANC_LICE else Couleurs.TEXTE,
			nil,
			40
		)
		restant += 200
	end
end

-- ───────────────────────── Tribune, podium, écran ─────────────────────────

local function construireTribune(repere: Monde.Repere, theme: Theme, parent: Instance)
	local modele = Instance.new("Model")
	modele.Name = "Tribune"
	modele.Parent = parent
	local largeur = repere.piste.largeur

	-- Le long de la ligne droite des tribunes, côté extérieur, avant l'arrivée
	local def = Pistes.parId(repere.id) or Pistes.liste[1]
	local avantArrivee = def.ligneDroite * def.positionArrivee
	local debut, fin = -math.min(175, avantArrivee - 15), 25
	local milieu = (debut + fin) / 2
	local longueur = (fin - debut) * ECHELLE
	local gradins = 7
	for k = 0, gradins - 1 do
		local couloir = largeur + 6 + k * 2.2
		local hauteurMarche = 1 + k * 2
		piece(
			modele,
			"Gradin",
			Vector3.new(longueur, hauteurMarche, 2.2 * ECHELLE),
			repere:cadre(milieu, couloir, hauteurMarche / 2),
			if k % 2 == 0 then theme.gradinA else theme.gradinB,
			Enum.Material.Concrete
		)
	end
	local fond = largeur + 6 + gradins * 2.2
	piece(modele, "Mur", Vector3.new(longueur, 22, 2), repere:cadre(milieu, fond, 11), theme.mur)
	local toit = piece(
		modele,
		"Toit",
		Vector3.new(longueur + 6, 1.2, (gradins * 2.2 + 4) * ECHELLE),
		repere:cadre(milieu, largeur + 4 + gradins * 1.1, 22),
		theme.toit
	)
	toit.Material = Enum.Material.SmoothPlastic
	for i = 0, 5 do
		local s = debut + (fin - debut) * i / 5
		piece(modele, "Colonne", Vector3.new(1.2, 21, 1.2), repere:cadre(s, largeur + 5, 10.5), BLANC_LICE)
	end
	-- L'enseigne du toit, tournée vers la piste
	local versPiste = -repere:exterieur(milieu)
	local positionEnseigne = repere:point(milieu, largeur + 4, 26)
	local enseigne = piece(
		modele,
		"Enseigne",
		Vector3.new(math.min(70, longueur - 4), 6, 1),
		CFrame.lookAt(positionEnseigne, positionEnseigne + versPiste),
		Couleurs.FOND
	)
	etiquette(enseigne, Enum.NormalId.Front, theme.nomEnseigne, theme.accent, nil, 20)

	-- Une dalle devant la tribune, face à la piste : c'est là qu'arrivent les
	-- joueurs qui viennent courir ou regarder (il n'y a de point
	-- d'apparition qu'à l'Académie).
	local positionDalle = repere:point(-90, largeur + 3, 0.5)
	local dalle = piece(
		modele,
		"Dalle",
		Vector3.new(12, 1, 12),
		CFrame.lookAt(positionDalle, positionDalle + versPiste),
		theme.toit
	)
	Construction.repere(modele, "PointTribune", dalle.CFrame + Vector3.new(0, 3.5, 0))

	-- Le panneau de retour vers l'Académie, au bout de la dalle
	local positionRetour = repere:point(-82, largeur + 3, 3)
	local retour = piece(
		modele,
		"BorneRetour",
		Vector3.new(2, 6, 2),
		CFrame.lookAt(positionRetour, positionRetour + versPiste),
		theme.accent
	)
	Construction.invite(retour, "academie", "Retour à l'Académie", "Téléporteur")
end

local function construirePodium(repere: Monde.Repere, parent: Instance)
	local modele = Instance.new("Model")
	modele.Name = "Podium"
	modele.Parent = parent
	local largeur = repere.piste.largeur
	local s = 42
	local couloir = largeur + 5
	local versPiste = -repere:exterieur(s)
	local tangente = repere:tangente(s)
	local hauteurs = { 3.2, 2.2, 1.4 }
	local decalages = { 0, -4.5, 4.5 }
	local couleurs = { Couleurs.OR, Couleurs.ARGENT, Couleurs.BRONZE }
	for rang = 1, 3 do
		local base = repere:point(s, couloir, 0) + tangente * decalages[rang]
		local centre = base + Vector3.new(0, hauteurs[rang] / 2, 0)
		local marche = piece(
			modele,
			`Marche{rang}`,
			Vector3.new(4.2, hauteurs[rang], 4.2),
			CFrame.lookAt(centre, centre + versPiste),
			couleurs[rang]
		)
		etiquette(marche, Enum.NormalId.Front, tostring(rang), Couleurs.BLANC, nil, 30)
	end
end

local function construireEcran(repere: Monde.Repere, parent: Instance)
	-- Un écran géant dans l'herbe intérieure, tourné vers la tribune
	local s = -80
	local position = repere:point(s, -22, 14)
	local versTribune = repere:exterieur(s)
	piece(
		parent,
		"EcranGeant",
		Vector3.new(36, 20, 1),
		CFrame.lookAt(position, position + versTribune),
		Color3.fromRGB(20, 18, 30)
	)
	piece(parent, "PiedEcran", Vector3.new(2, 4, 2), CFrame.new(repere:point(s, -22, 2)), Color3.fromRGB(60, 60, 70))
end

-- La scène du concert de la victoire, dans l'herbe intérieure, face à la
-- tribune. Les trois premières y montent après la course ; le public est
-- dans la fosse, entre la scène et la piste.
local function construireScene(repere: Monde.Repere, theme: Theme, parent: Instance)
	local modele = Instance.new("Model")
	modele.Name = "Scene"
	modele.Parent = parent
	local s = -20
	local couloirScene = -36
	local versTribune = repere:exterieur(s)
	local tangente = repere:tangente(s)
	local centre = repere:point(s, couloirScene, 0)
	local orientation = CFrame.lookAt(centre, centre + versTribune)

	local plateau = piece(
		modele,
		"Plateau",
		Vector3.new(34, 2.4, 18),
		orientation * CFrame.new(0, 1.2, 0),
		Color3.fromRGB(45, 38, 70),
		Enum.Material.SmoothPlastic
	)
	-- Le fond de scène, avec un écran
	local fond = piece(
		modele,
		"FondScene",
		Vector3.new(34, 18, 1.2),
		orientation * CFrame.new(0, 11.4, 8.6),
		Color3.fromRGB(28, 22, 46)
	)
	etiquette(fond, Enum.NormalId.Front, "★ CONCERT DE LA VICTOIRE ★", theme.accent, nil, 12)
	-- Une arche de projecteurs
	for _, cote in { -1, 1 } do
		piece(
			modele,
			"Pylone",
			Vector3.new(1.2, 20, 1.2),
			orientation * CFrame.new(cote * 17.5, 10, -8),
			Color3.fromRGB(70, 70, 80),
			Enum.Material.Metal
		)
	end
	piece(
		modele,
		"Portique",
		Vector3.new(36, 1.2, 1.2),
		orientation * CFrame.new(0, 20, -8),
		Color3.fromRGB(70, 70, 80),
		Enum.Material.Metal
	)
	for i = -2, 2 do
		local projecteur = piece(
			modele,
			"Projecteur",
			Vector3.new(1.4, 1.4, 1.4),
			orientation * CFrame.new(i * 6.5, 19, -8),
			Color3.fromRGB(255, 240, 210),
			Enum.Material.Neon
		)
		local lumiere = Instance.new("SpotLight")
		lumiere.Face = Enum.NormalId.Bottom
		lumiere.Angle = 50
		lumiere.Range = 30
		lumiere.Brightness = 2
		lumiere.Color = if i % 2 == 0 then theme.accent else Color3.fromRGB(255, 240, 210)
		lumiere.Parent = projecteur
	end

	-- Les trois places : la gagnante au centre, en avant
	local dessus = plateau.Size.Y
	Construction.repere(modele, "Place1", orientation * CFrame.new(0, dessus + 3, -3))
	Construction.repere(modele, "Place2", orientation * CFrame.new(-7, dessus + 3, 0))
	Construction.repere(modele, "Place3", orientation * CFrame.new(7, dessus + 3, 0))
	-- La fosse du public, et le point de vue de la caméra
	local fosse = repere:point(s, couloirScene + 16, 0.5)
	Construction.repere(modele, "Fosse", CFrame.lookAt(fosse, centre))
	local vue = repere:point(s, couloirScene + 30, 9) + tangente * 4
	Construction.repere(modele, "VueCamera", CFrame.lookAt(vue, centre + Vector3.new(0, 6, 0)))
end

-- ───────────────────────────────── Décor ─────────────────────────────────

local function arbre(parent: Instance, position: Vector3, rng: Aleatoire.Aleatoire)
	local modele = Instance.new("Model")
	modele.Name = "Arbre"
	modele.Parent = parent
	local hauteur = rng:entre(8, 14)
	piece(
		modele,
		"Tronc",
		Vector3.new(1.4, hauteur, 1.4),
		CFrame.new(position + Vector3.new(0, hauteur / 2, 0)),
		Color3.fromRGB(110, 75, 50),
		Enum.Material.Wood
	)
	local cerisier = rng:reel() < 0.25
	local feuillage = if cerisier
		then Color3.fromRGB(250, 185, 210)
		else Color3.fromRGB(
			math.floor(rng:entre(50, 80)),
			math.floor(rng:entre(120, 160)),
			math.floor(rng:entre(50, 80))
		)
	for k = 1, 2 do
		local diametre = rng:entre(8, 13) / k
		local boule = piece(
			modele,
			"Feuillage",
			Vector3.new(diametre, diametre, diametre),
			CFrame.new(
				position + Vector3.new(rng:entre(-1, 1), hauteur + diametre * 0.25 + (k - 1) * 4, rng:entre(-1, 1))
			),
			feuillage,
			Enum.Material.Grass
		)
		boule.Shape = Enum.PartType.Ball
	end
end

-- Un palmier : un tronc penché fait de segments, et des palmes en étoile.
local function palmier(parent: Instance, position: Vector3, rng: Aleatoire.Aleatoire)
	local modele = Instance.new("Model")
	modele.Name = "Palmier"
	modele.Parent = parent
	local segments = 6
	local inclinaison = rng:entre(0.05, 0.16)
	local direction = rng:entre(0, 2 * math.pi)
	local penche = Vector3.new(math.cos(direction), 0, math.sin(direction))
	local point = position
	for i = 1, segments do
		local suivant = point + Vector3.new(0, 2.6, 0) + penche * (inclinaison * i * 1.2)
		local milieu = (point + suivant) / 2
		piece(
			modele,
			"Tronc",
			Vector3.new(1.1 - i * 0.06, 1.1 - i * 0.06, (suivant - point).Magnitude + 0.2),
			CFrame.lookAt(milieu, suivant),
			Color3.fromRGB(150, 115, 75),
			Enum.Material.Wood
		)
		point = suivant
	end
	for k = 1, 7 do
		local angle = k / 7 * 2 * math.pi + rng:entre(-0.2, 0.2)
		local vers = Vector3.new(math.cos(angle), -0.35, math.sin(angle))
		local bout = point + vers * 6
		piece(
			modele,
			"Palme",
			Vector3.new(1.8, 0.2, 6.2),
			CFrame.lookAt((point + bout) / 2, bout),
			Color3.fromRGB(70, math.floor(rng:entre(140, 170)), 70),
			Enum.Material.Grass
		)
	end
end

-- Un sapin : des étages de plus en plus étroits.
local function sapin(parent: Instance, position: Vector3, rng: Aleatoire.Aleatoire)
	local modele = Instance.new("Model")
	modele.Name = "Sapin"
	modele.Parent = parent
	local hauteur = rng:entre(12, 20)
	piece(
		modele,
		"Tronc",
		Vector3.new(1.2, hauteur * 0.4, 1.2),
		CFrame.new(position + Vector3.new(0, hauteur * 0.2, 0)),
		Color3.fromRGB(95, 65, 45),
		Enum.Material.Wood
	)
	local vert = Color3.fromRGB(40, math.floor(rng:entre(95, 120)), 60)
	local etages = 4
	for k = 1, etages do
		local largeur = (etages - k + 1) * 2.4
		local y = hauteur * 0.25 + (k - 1) * hauteur * 0.18
		piece(
			modele,
			"Branches",
			Vector3.new(largeur, hauteur * 0.2, largeur),
			CFrame.new(position + Vector3.new(0, y, 0)) * CFrame.Angles(0, k * 0.4, 0),
			vert,
			Enum.Material.Grass
		)
	end
end

local function construireDecor(repere: Monde.Repere, theme: Theme, parent: Instance)
	local dossier = Instance.new("Folder")
	dossier.Name = "Decor"
	dossier.Parent = parent
	local piste = repere.piste
	local largeur = piste.largeur
	local rng = Aleatoire.nouveau(2024 + #repere.id)
	local planter: (Instance, Vector3, Aleatoire.Aleatoire) -> () = if theme.arbres == "plage"
		then palmier
		elseif theme.arbres == "falaises" then sapin
		else arbre
	-- Une ceinture d'arbres à l'extérieur, sauf devant la tribune
	for _ = 1, 70 do
		local s = rng:entre(0, piste.longueur)
		local sRelatif = (s + piste.longueur / 2) % piste.longueur - piste.longueur / 2
		if sRelatif < -200 or sRelatif > 70 then
			planter(dossier, repere:point(s, largeur + rng:entre(14, 45), 0), rng)
		end
	end
	-- Quelques bosquets dans l'herbe intérieure, loin de l'étang et de la scène
	for _ = 1, 16 do
		local s = rng:entre(0, piste.longueur)
		local sRelatif = (s + piste.longueur / 2) % piste.longueur - piste.longueur / 2
		if sRelatif < -60 or sRelatif > 10 then
			planter(dossier, repere:point(s, -rng:entre(8, 16), 0), rng)
		end
	end
end

-- ─────────────────────────────── Ensemble ───────────────────────────────

local function dossierHippodromes(): Folder
	local existant = Workspace:FindFirstChild("Hippodromes")
	if existant and existant:IsA("Folder") then
		return existant :: Folder
	end
	local nouveau = Instance.new("Folder")
	nouveau.Name = "Hippodromes"
	nouveau.Parent = Workspace
	return nouveau
end

local function reperesDe(id: string, racine: Instance): Reperes
	local podium = racine:WaitForChild("Podium")
	local tribune = racine:WaitForChild("Tribune")
	return {
		id = id,
		racine = racine,
		podium = {
			podium:WaitForChild("Marche1") :: BasePart,
			podium:WaitForChild("Marche2") :: BasePart,
			podium:WaitForChild("Marche3") :: BasePart,
		},
		ecran = racine:WaitForChild("EcranGeant") :: BasePart,
		tribune = tribune:WaitForChild("PointTribune") :: BasePart,
		scene = racine:WaitForChild("Scene") :: Model,
	}
end

local cache: { [string]: Reperes } = {}

-- Construit un hippodrome et renvoie ses repères.
--
-- Si la place contient déjà le décor (enregistré par tools/decor pour qu'on
-- le voie dans Studio sans lancer le jeu), on le garde tel quel : on peut
-- donc le retoucher à la main dans Studio. Le terrain, lui, est toujours
-- rempli au lancement.
function Hippodrome.construire(id: string): Reperes
	local repere = Monde.pour(id)
	local theme = Hippodrome.theme(repere.id)
	construireTerrain(repere, theme)
	local dossier = dossierHippodromes()
	local existant = dossier:FindFirstChild(repere.id)
	if existant then
		local r = reperesDe(repere.id, existant)
		cache[repere.id] = r
		return r
	end

	local racine = Instance.new("Folder")
	racine.Name = repere.id
	construirePiste(repere, theme, racine)
	construireArrivee(repere, theme, racine)
	construirePoteauxDistance(repere, theme, racine)
	construireTribune(repere, theme, racine)
	construirePodium(repere, racine)
	construireEcran(repere, racine)
	construireScene(repere, theme, racine)
	construireDecor(repere, theme, racine)
	racine.Parent = dossier
	local r = reperesDe(repere.id, racine)
	cache[repere.id] = r
	return r
end

function Hippodrome.construireTout(): { [string]: Reperes }
	local tous = {}
	for _, def in Pistes.liste do
		tous[def.id] = Hippodrome.construire(def.id)
	end
	return tous
end

-- Les repères d'un hippodrome déjà construit.
function Hippodrome.reperes(id: string): Reperes?
	return cache[id]
end

return Hippodrome
