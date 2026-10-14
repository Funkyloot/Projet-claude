--!strict
-- Hippodrome — construit tout le décor par le code, au lancement du serveur.
--
-- Rien n'est à importer dans Studio : terrain, piste, lices, arche
-- d'arrivée, poteaux de distance, tribune, écran géant, podium, étang et
-- arbres sortent de ce module. On peut ensuite remplacer n'importe quel
-- élément par un vrai modèle sans toucher au reste du jeu.
--
-- Rappel d'orientation : `couloir` = mètres depuis la corde vers l'extérieur
-- (négatif = côté intérieur), `s` = mètres depuis la ligne d'arrivée.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Config = require(Partage:WaitForChild("Config"))
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Monde = require(Partage:WaitForChild("Monde"))
local Aleatoire = require(Partage:WaitForChild("Course"):WaitForChild("Aleatoire"))
local Formules = require(Partage:WaitForChild("Course"):WaitForChild("Formules"))

local ECHELLE = Monde.ECHELLE
local LARGEUR = Config.LARGEUR_PISTE
local piste = Monde.piste

local Hippodrome = {}

-- Emplacements publiés pour le client
export type Reperes = {
	podium: { BasePart },
	ecran: BasePart,
	apparition: SpawnLocation,
}

local VERT_TONTE_A = Color3.fromRGB(96, 168, 74)
local VERT_TONTE_B = Color3.fromRGB(110, 184, 84)
local BLANC_LICE = Color3.fromRGB(250, 250, 250)

local function piece(
	parent: Instance,
	nom: string,
	taille: Vector3,
	cadre: CFrame,
	couleur: Color3,
	materiau: Enum.Material?
): Part
	local p = Instance.new("Part")
	p.Name = nom
	p.Anchored = true
	p.Size = taille
	p.CFrame = cadre
	p.Color = couleur
	p.Material = materiau or Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	return p
end

local function etiquette(
	support: BasePart,
	face: Enum.NormalId,
	texte: string,
	couleurTexte: Color3,
	fond: Color3?,
	pixelsParStud: number?
): TextLabel
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pixelsParStud or 40
	gui.LightInfluence = 0.2
	gui.Parent = support
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = if fond then 0 else 1
	label.BackgroundColor3 = fond or Color3.new(1, 1, 1)
	label.Text = texte
	label.TextColor3 = couleurTexte
	label.TextScaled = true
	label.FontFace = Font.fromEnum(Enum.Font.FredokaOne)
	label.Parent = gui
	return label
end

-- Pièce orientée le long de la piste, entre s0 et s1, au couloir donné.
-- La longueur tient compte de la courbure : à l'extérieur d'un virage, un
-- tronçon est plus long qu'à la corde.
local function troncon(
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
	local courbure = piste:courbure(milieu)
	local bordExterieur = couloir + largeur / 2
	local longueur = (s1 - s0) * (1 + math.max(0, courbure * bordExterieur)) + 0.15
	local cadre = Monde.cadre(milieu, couloir, y)
	return piece(parent, nom, Vector3.new(largeur * ECHELLE, hauteur, longueur * ECHELLE), cadre, couleur, materiau)
end

local function construireTerrain()
	local terrain = Workspace.Terrain
	local marge = 260
	local taille = Vector3.new(Monde.demiLargeur * 2 + marge * 2, 8, Monde.demiProfondeur * 2 + marge * 2)
	terrain:FillBlock(CFrame.new(0, -4, 0), taille, Enum.Material.Grass)

	-- Un étang au milieu de l'herbe intérieure, comme sur les grands hippodromes
	local centre = Monde.versMonde(Config.LIGNE_DROITE / 2, Config.RAYON_VIRAGE, 0)
	for i, decalage in { -60, 0, 60 } do
		local position = centre + Vector3.new(decalage, 0, (i - 2) * 8)
		local rayon = if decalage == 0 then 70 else 48
		local cylindre = CFrame.new(position + Vector3.new(0, -3, 0))
		terrain:FillCylinder(cylindre, 8, rayon, Enum.Material.Air)
		terrain:FillCylinder(cylindre * CFrame.new(0, -1.5, 0), 5, rayon, Enum.Material.Water)
		terrain:FillCylinder(cylindre * CFrame.new(0, -4.5, 0), 2, rayon + 2, Enum.Material.Sand)
	end
end

local function construirePiste(parent: Instance)
	local dossier = Instance.new("Folder")
	dossier.Name = "Piste"
	dossier.Parent = parent

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
			dossier,
			"Gazon",
			s0,
			s1,
			LARGEUR / 2,
			LARGEUR,
			1,
			Monde.SOL - 0.5 - (i % 2) * 0.02,
			if bande then VERT_TONTE_A else VERT_TONTE_B,
			Enum.Material.Grass
		)
	end

	-- Lices : un tube blanc à la corde et un à l'extérieur, sur poteaux
	local lices = Instance.new("Folder")
	lices.Name = "Lices"
	lices.Parent = parent
	local pasLice = 4
	local nLice = math.ceil(piste.longueur / pasLice)
	for _, couloir in { -0.35, LARGEUR + 0.35 } do
		for i = 0, nLice - 1 do
			local s0 = i * piste.longueur / nLice
			local s1 = (i + 1) * piste.longueur / nLice
			local milieu = (s0 + s1) / 2
			local longueur = (s1 - s0) * (1 + math.max(0, piste:courbure(milieu) * couloir)) + 0.1
			local tube = piece(
				lices,
				"Lice",
				Vector3.new(longueur * ECHELLE, 0.35, 0.35),
				Monde.cadre(milieu, couloir, 2.4) * CFrame.Angles(0, math.pi / 2, 0),
				BLANC_LICE
			)
			tube.Shape = Enum.PartType.Cylinder
			if i % 2 == 0 then
				piece(lices, "Poteau", Vector3.new(0.3, 2.4, 0.3), Monde.cadre(s0, couloir, 1.2), BLANC_LICE)
			end
		end
	end
end

local function construireArrivee(parent: Instance)
	local modele = Instance.new("Model")
	modele.Name = "Arrivee"
	modele.Parent = parent

	-- Ligne blanche et damier au sol
	piece(
		modele,
		"Ligne",
		Vector3.new(LARGEUR * ECHELLE, 0.1, 0.5),
		Monde.cadre(0, LARGEUR / 2, Monde.SOL + 0.02),
		BLANC_LICE
	)
	local case = 1.5
	local colonnes = math.floor(LARGEUR * ECHELLE / case)
	for rang = 1, 2 do
		for col = 0, colonnes - 1 do
			local couloir = (col + 0.5) * case / ECHELLE
			local noir = (col + rang) % 2 == 0
			piece(
				modele,
				"Damier",
				Vector3.new(case, 0.1, case),
				Monde.cadre(rang * case / ECHELLE, couloir, Monde.SOL + 0.03),
				if noir then Color3.fromRGB(30, 30, 30) else BLANC_LICE
			)
		end
	end

	-- Poteau d'arrivée côté corde
	piece(modele, "PoteauArrivee", Vector3.new(0.5, 9, 0.5), Monde.cadre(0, -1.2, 4.5), BLANC_LICE)
	local disque = piece(modele, "Miroir", Vector3.new(0.3, 3, 3), Monde.cadre(0, -1.2, 9.5), Couleurs.ROSE)
	disque.Shape = Enum.PartType.Cylinder

	-- L'arche « ARRIVÉE » au-dessus de la piste
	local hauteur = 20
	for _, couloir in { -2.2, LARGEUR + 2.2 } do
		piece(modele, "Pilier", Vector3.new(2.2, hauteur, 2.2), Monde.cadre(0, couloir, hauteur / 2), Couleurs.ROSE)
	end
	local portee = (LARGEUR + 4.4) * ECHELLE + 2.2
	local poutre = piece(
		modele,
		"Bandeau",
		Vector3.new(portee, 4.5, 1.2),
		Monde.cadre(0, LARGEUR / 2, hauteur - 1.5),
		Couleurs.FOND
	)
	etiquette(poutre, Enum.NormalId.Back, "ARRIVÉE", Couleurs.ROSE, nil, 30)
	etiquette(poutre, Enum.NormalId.Front, "★ STELLAR DERBY ★", Couleurs.ROSE, nil, 30)
end

local function construirePoteauxDistance(parent: Instance)
	local dossier = Instance.new("Folder")
	dossier.Name = "PoteauxDistance"
	dossier.Parent = parent
	local restant = 200
	while restant < piste.longueur - 60 do
		local s = -restant
		local tangente = Monde.tangente(s)
		local base = Monde.point(s, -1.4, 0)
		piece(dossier, "Poteau", Vector3.new(0.4, 7, 0.4), CFrame.new(base + Vector3.new(0, 3.5, 0)), BLANC_LICE)
		local position = base + Vector3.new(0, 7.5, 0)
		-- Le panneau regarde les coureuses qui arrivent
		local panneau = piece(
			dossier,
			"Panneau",
			Vector3.new(3.2, 2, 0.3),
			CFrame.lookAt(position, position - tangente),
			if restant == 200 then Couleurs.ROSE else BLANC_LICE
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

local function construireTribune(parent: Instance)
	local modele = Instance.new("Model")
	modele.Name = "Tribune"
	modele.Parent = parent

	-- Le long de la ligne droite des tribunes, côté extérieur
	local debut, fin = -175, 25
	local milieu = (debut + fin) / 2
	local longueur = (fin - debut) * ECHELLE
	local gradins = 7
	for k = 0, gradins - 1 do
		local couloir = LARGEUR + 6 + k * 2.2
		local hauteurMarche = 1 + k * 2
		piece(
			modele,
			"Gradin",
			Vector3.new(longueur, hauteurMarche, 2.2 * ECHELLE),
			Monde.cadre(milieu, couloir, hauteurMarche / 2),
			if k % 2 == 0 then Color3.fromRGB(235, 235, 245) else Color3.fromRGB(215, 220, 235),
			Enum.Material.Concrete
		)
	end
	local fond = LARGEUR + 6 + gradins * 2.2
	piece(modele, "Mur", Vector3.new(longueur, 22, 2), Monde.cadre(milieu, fond, 11), Color3.fromRGB(240, 235, 245))
	local toit = piece(
		modele,
		"Toit",
		Vector3.new(longueur + 6, 1.2, (gradins * 2.2 + 4) * ECHELLE),
		Monde.cadre(milieu, LARGEUR + 4 + gradins * 1.1, 22),
		Couleurs.ROSE_PALE
	)
	toit.Material = Enum.Material.SmoothPlastic
	for i = 0, 5 do
		local s = debut + (fin - debut) * i / 5
		piece(modele, "Colonne", Vector3.new(1.2, 21, 1.2), Monde.cadre(s, LARGEUR + 5, 10.5), BLANC_LICE)
	end
	-- L'enseigne du toit, tournée vers la piste
	local versPiste = -Monde.exterieur(milieu)
	local positionEnseigne = Monde.point(milieu, LARGEUR + 4, 26)
	local enseigne = piece(
		modele,
		"Enseigne",
		Vector3.new(60, 6, 1),
		CFrame.lookAt(positionEnseigne, positionEnseigne + versPiste),
		Couleurs.FOND
	)
	etiquette(enseigne, Enum.NormalId.Front, "STELLAR DERBY", Couleurs.ROSE, nil, 20)

	-- Point d'apparition devant la tribune, face à la piste
	local apparition = Instance.new("SpawnLocation")
	apparition.Name = "Apparition"
	apparition.Anchored = true
	apparition.Size = Vector3.new(12, 1, 12)
	local positionApparition = Monde.point(-90, LARGEUR + 3, 0.5)
	apparition.CFrame = CFrame.lookAt(positionApparition, positionApparition + versPiste)
	apparition.Color = Couleurs.ROSE_PALE
	apparition.Material = Enum.Material.SmoothPlastic
	apparition.Duration = 0
	apparition.Neutral = true
	apparition.Parent = modele
end

local function construirePodium(parent: Instance)
	local modele = Instance.new("Model")
	modele.Name = "Podium"
	modele.Parent = parent
	local s = 42
	local couloir = LARGEUR + 5
	local versPiste = -Monde.exterieur(s)
	local tangente = Monde.tangente(s)
	local hauteurs = { 3.2, 2.2, 1.4 }
	local decalages = { 0, -4.5, 4.5 }
	local couleurs = { Couleurs.OR, Couleurs.ARGENT, Couleurs.BRONZE }
	for rang = 1, 3 do
		local base = Monde.point(s, couloir, 0) + tangente * decalages[rang]
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

local function construireEcran(parent: Instance)
	-- Un écran géant dans l'herbe intérieure, tourné vers la tribune
	local s = -80
	local position = Monde.point(s, -22, 14)
	local versTribune = Monde.exterieur(s)
	piece(
		parent,
		"EcranGeant",
		Vector3.new(36, 20, 1),
		CFrame.lookAt(position, position + versTribune),
		Color3.fromRGB(20, 18, 30)
	)
	piece(parent, "PiedEcran", Vector3.new(2, 4, 2), CFrame.new(Monde.point(s, -22, 2)), Color3.fromRGB(60, 60, 70))
end

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

local function construireDecor(parent: Instance)
	local dossier = Instance.new("Folder")
	dossier.Name = "Decor"
	dossier.Parent = parent
	local rng = Aleatoire.nouveau(2024)
	-- Une ceinture d'arbres à l'extérieur, sauf devant la tribune
	for _ = 1, 70 do
		local s = rng:entre(0, piste.longueur)
		local sRelatif = (s + piste.longueur / 2) % piste.longueur - piste.longueur / 2
		if sRelatif < -200 or sRelatif > 70 then
			arbre(dossier, Monde.point(s, LARGEUR + rng:entre(14, 45), 0), rng)
		end
	end
	-- Quelques bosquets dans l'herbe intérieure, loin de l'étang
	for _ = 1, 16 do
		local s = rng:entre(0, piste.longueur)
		arbre(dossier, Monde.point(s, -rng:entre(8, 16), 0), rng)
	end
end

local function reperesDe(racine: Instance): Reperes
	local podium = racine:WaitForChild("Podium")
	local tribune = racine:WaitForChild("Tribune")
	return {
		podium = {
			podium:WaitForChild("Marche1") :: BasePart,
			podium:WaitForChild("Marche2") :: BasePart,
			podium:WaitForChild("Marche3") :: BasePart,
		},
		ecran = racine:WaitForChild("EcranGeant") :: BasePart,
		apparition = tribune:WaitForChild("Apparition") :: SpawnLocation,
	}
end

-- Construit l'hippodrome et renvoie les repères utiles au jeu.
--
-- Si la place contient déjà le décor (enregistré par tools/decor pour qu'on
-- le voie dans Studio sans lancer le jeu), on le garde tel quel : on peut
-- donc le retoucher à la main dans Studio. Le terrain, lui, est toujours
-- rempli au lancement.
function Hippodrome.construire(): Reperes
	construireTerrain()
	local existant = Workspace:FindFirstChild("Hippodrome")
	if existant then
		return reperesDe(existant)
	end

	local racine = Instance.new("Folder")
	racine.Name = "Hippodrome"
	construirePiste(racine)
	construireArrivee(racine)
	construirePoteauxDistance(racine)
	construireTribune(racine)
	construirePodium(racine)
	construireEcran(racine)
	construireDecor(racine)
	racine.Parent = Workspace
	return reperesDe(racine)
end

-- Les stalles de départ, posées en travers de la piste au départ d'une course.
function Hippodrome.construireStalles(distance: number, partantes: number): Model
	local modele = Instance.new("Model")
	modele.Name = "Stalles"
	local s = -distance
	local ecart = math.min(1.1, (LARGEUR - 2 * Formules.COULOIR_MIN) / math.max(1, partantes - 1))
	local hauteur = 5.5
	local profondeur = 3.2
	-- Cloisons entre les stalles, et de part et d'autre
	for i = 0, partantes do
		local couloir = Formules.COULOIR_MIN + (i - 0.5) * ecart
		piece(
			modele,
			"Cloison",
			Vector3.new(0.25, hauteur, profondeur),
			Monde.cadre(s, couloir, hauteur / 2),
			Color3.fromRGB(70, 140, 90)
		)
	end
	local gauche = Formules.COULOIR_MIN - ecart / 2
	local droite = Formules.COULOIR_MIN + (partantes - 0.5) * ecart
	local largeur = (droite - gauche) * ECHELLE + 0.5
	local milieu = (gauche + droite) / 2
	piece(
		modele,
		"Toit",
		Vector3.new(largeur, 1, profondeur + 0.5),
		Monde.cadre(s, milieu, hauteur + 0.5),
		Color3.fromRGB(60, 120, 80)
	)
	-- Les portes, devant chaque stalle, avec le numéro
	for numero = 1, partantes do
		local couloir = Formules.COULOIR_MIN + (numero - 1) * ecart
		local porte = piece(
			modele,
			"Porte",
			Vector3.new(ecart * ECHELLE - 0.3, hauteur - 1, 0.2),
			Monde.cadre(s, couloir, (hauteur - 1) / 2 + 0.3) * CFrame.new(0, 0, -profondeur / 2),
			Color3.fromRGB(240, 240, 240)
		)
		porte:SetAttribute("Numero", numero)
		local cadre = Formules.cadre(numero, partantes)
		etiquette(
			porte,
			Enum.NormalId.Front,
			tostring(numero),
			Couleurs.TEXTE_CADRES[cadre],
			Couleurs.CADRES[cadre],
			20
		)
	end
	for _, p in modele:GetDescendants() do
		if p:IsA("BasePart") then
			(p :: BasePart).CanCollide = false
		end
	end
	modele.Parent = Workspace:FindFirstChild("Hippodrome") or Workspace
	return modele
end

return Hippodrome
