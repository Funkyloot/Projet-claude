--!strict
-- Coureuses — fabrique les modèles 3D des partantes.
--
-- Une joueuse court avec son propre avatar Roblox ; un bot reçoit un corps
-- généré d'après sa graine d'apparence (peau, coiffure, maillot aux
-- couleurs de son cadre). Toutes portent les oreilles et la queue de leur
-- robe (voir Robes), tirées du catalogue Roblox, et un dossard.
--
-- Si le catalogue ne répond pas, ou qu'un accessoire a disparu, on retombe
-- sur des oreilles et une queue fabriquées par le code : une course ne doit
-- jamais attendre un accessoire.
--
-- Les modèles sont créés par le serveur (donc répliqués à tout le monde) puis
-- laissés immobiles : ce sont les clients qui les déplacent localement à
-- chaque image, d'après les instantanés de la simulation. Le serveur ne
-- touche plus à leur position une fois la course lancée.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Monde = require(Partage:WaitForChild("Monde"))
local Robes = require(Partage:WaitForChild("Robes"))
local Aleatoire = require(Partage:WaitForChild("Course"):WaitForChild("Aleatoire"))

local Coureuses = {}

export type Fiche = {
	id: number,
	nom: string,
	numero: number,
	cadre: number,
	userId: number?,
	apparence: number?,
	robe: string?, -- choisie par la joueuse ; tirée au hasard pour un bot
}

local descriptionsJoueurs: { [number]: HumanoidDescription } = {}

local function descriptionJoueur(userId: number): HumanoidDescription?
	local enCache = descriptionsJoueurs[userId]
	if enCache then
		return enCache
	end
	local ok, resultat = pcall(function()
		return Players:GetHumanoidDescriptionFromUserIdAsync(userId)
	end)
	if ok and resultat then
		descriptionsJoueurs[userId] = resultat
		return resultat
	end
	warn(`[Coureuses] avatar de {userId} indisponible : {resultat}`)
	return nil
end

local COLLANTS = Color3.fromRGB(32, 40, 78)

local function descriptionBot(rng: Aleatoire.Aleatoire, cadre: number): HumanoidDescription
	local d = Instance.new("HumanoidDescription")
	local peau = rng:choisir(Couleurs.PEAUX)
	d.HeadColor = peau
	d.LeftArmColor = peau
	d.RightArmColor = peau
	-- Tenue de course : maillot aux couleurs du cadre, collants bleu marine
	d.TorsoColor = Couleurs.CADRES[cadre]
	d.LeftLegColor = COLLANTS
	d.RightLegColor = COLLANTS
	return d
end

local function ajouterA(liste: string, id: number): string
	return if liste == "" then tostring(id) else `{liste},{id}`
end

-- Une copie de la description, avec les accessoires de la robe en plus.
local function habiller(base: HumanoidDescription, robe: Robes.Robe, cheveux: number?): HumanoidDescription
	local d = base:Clone() :: HumanoidDescription
	d.HatAccessory = ajouterA(d.HatAccessory, robe.oreilles)
	d.WaistAccessory = ajouterA(d.WaistAccessory, robe.queue)
	if cheveux then
		d.FaceAccessory = ajouterA(d.FaceAccessory, cheveux)
	end
	return d
end

local function fabriquer(d: HumanoidDescription): Model?
	local ok, modele = pcall(function()
		return Players:CreateHumanoidModelFromDescriptionAsync(d, Enum.HumanoidRigType.R15)
	end)
	if ok and modele then
		return modele
	end
	warn(`[Coureuses] modèle impossible à créer : {modele}`)
	return nil
end

-- `genre` : nom d'un Enum.AccessoryType (« Hat », « Waist », « Face »…)
local function accessoire(modele: Model, genre: string): Accessory?
	for _, enfant in modele:GetChildren() do
		if enfant:IsA("Accessory") and (enfant :: Accessory).AccessoryType.Name == genre then
			return enfant :: Accessory
		end
	end
	return nil
end

local function souder(piece: BasePart, a: BasePart)
	piece.Anchored = false
	piece.CanCollide = false
	piece.CanQuery = false
	piece.CanTouch = false
	piece.Massless = true
	local soudure = Instance.new("WeldConstraint")
	soudure.Part0 = a
	soudure.Part1 = piece
	soudure.Parent = piece
end

local function ajouterOreilles(tete: BasePart, couleur: Color3)
	local t = tete.Size
	for _, cote in { -1, 1 } do
		local oreille = Instance.new("WedgePart")
		oreille.Name = "Oreille"
		-- Un coin tourné d'un quart de tour montre son profil triangulaire de face
		oreille.Size = Vector3.new(0.14 * t.X, 0.55 * t.Y, 0.34 * t.Z)
		oreille.CFrame = tete.CFrame
			* CFrame.new(cote * 0.3 * t.X, 0.62 * t.Y, 0.05 * t.Z)
			* CFrame.Angles(0, cote * math.pi / 2, -cote * 0.12)
		oreille.Color = couleur
		oreille.Material = Enum.Material.SmoothPlastic
		souder(oreille, tete)
		oreille.Parent = tete
	end
end

-- Une traînée entre deux points de la queue : en mouvement, elle dessine
-- une mèche qui flotte derrière la coureuse.
local function ajouterTrainee(queue: BasePart, haut: Vector3, bas: Vector3, couleur: Color3)
	local a0 = Instance.new("Attachment")
	a0.Position = haut
	a0.Parent = queue
	local a1 = Instance.new("Attachment")
	a1.Position = bas
	a1.Parent = queue
	local trainee = Instance.new("Trail")
	trainee.Attachment0 = a0
	trainee.Attachment1 = a1
	trainee.Color = ColorSequence.new(couleur)
	trainee.Transparency = NumberSequence.new(0.1, 1)
	trainee.Lifetime = 0.16
	trainee.MinLength = 0.05
	trainee.LightEmission = 0
	trainee.Parent = queue
end

local function ajouterQueue(bassin: BasePart, couleur: Color3)
	local b = bassin.Size
	local queue = Instance.new("Part")
	queue.Name = "Queue"
	queue.Size = Vector3.new(0.3, 0.3, 1.5)
	-- Partant du bas du dos, vers l'arrière et vers le bas
	queue.CFrame = bassin.CFrame * CFrame.new(0, -0.05 * b.Y, 0.5 * b.Z + 0.6) * CFrame.Angles(math.rad(35), 0, 0)
	queue.Color = couleur
	queue.Material = Enum.Material.SmoothPlastic
	souder(queue, bassin)
	queue.Parent = bassin
	ajouterTrainee(queue, Vector3.new(0, 0.25, 0.6), Vector3.new(0, -0.25, 0.7), couleur)
end

local function ajouterCheveux(tete: BasePart, couleur: Color3)
	local t = tete.Size
	local calotte = Instance.new("Part")
	calotte.Name = "Cheveux"
	calotte.Shape = Enum.PartType.Ball
	calotte.Size = Vector3.new(t.X * 1.12, t.Y * 1.05, t.Z * 1.12)
	calotte.CFrame = tete.CFrame * CFrame.new(0, 0.14 * t.Y, 0.08 * t.Z)
	calotte.Color = couleur
	calotte.Material = Enum.Material.SmoothPlastic
	souder(calotte, tete)
	calotte.Parent = tete

	local queueDeCheval = Instance.new("Part")
	queueDeCheval.Name = "QueueDeCheval"
	queueDeCheval.Size = Vector3.new(0.45 * t.X, 1.3 * t.Y, 0.35 * t.Z)
	queueDeCheval.CFrame = tete.CFrame * CFrame.new(0, -0.2 * t.Y, 0.62 * t.Z) * CFrame.Angles(math.rad(-15), 0, 0)
	queueDeCheval.Color = couleur
	queueDeCheval.Material = Enum.Material.SmoothPlastic
	souder(queueDeCheval, tete)
	queueDeCheval.Parent = tete
end

local function ajouterDossard(torse: BasePart, numero: number, cadre: number)
	local t = torse.Size
	local dossard = Instance.new("Part")
	dossard.Name = "Dossard"
	dossard.Size = Vector3.new(0.7 * t.X, 0.55 * t.Y, 0.05)
	dossard.CFrame = torse.CFrame * CFrame.new(0, -0.05 * t.Y, -0.5 * t.Z - 0.03)
	dossard.Color = Couleurs.CADRES[cadre]
	dossard.Material = Enum.Material.SmoothPlastic
	souder(dossard, torse)
	dossard.Parent = torse
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 60
	gui.Parent = dossard
	local texte = Instance.new("TextLabel")
	texte.Size = UDim2.fromScale(1, 1)
	texte.BackgroundTransparency = 1
	texte.Text = tostring(numero)
	texte.TextScaled = true
	texte.FontFace = Font.fromEnum(Enum.Font.FredokaOne)
	texte.TextColor3 = Couleurs.TEXTE_CADRES[cadre]
	texte.Parent = gui
end

function Coureuses.creer(fiche: Fiche, cadreDepart: CFrame, parent: Instance): Model?
	local rng = Aleatoire.nouveau(fiche.apparence or fiche.userId or fiche.id)
	local estJoueuse = fiche.userId ~= nil
	local robe = if fiche.robe then Robes.obtenir(fiche.robe) else rng:choisir(Robes.liste)
	local description: HumanoidDescription? = nil
	if fiche.userId then
		description = descriptionJoueur(fiche.userId)
	end
	local base = description or descriptionBot(rng, fiche.cadre)
	local cheveux = if estJoueuse then nil else rng:choisir(robe.cheveux)

	-- D'abord avec les accessoires du catalogue ; sans eux si ça échoue
	local habillee = true
	local modele = fabriquer(habiller(base, robe, cheveux))
	if not modele then
		habillee = false
		modele = fabriquer(base)
	end
	if not modele then
		return nil
	end

	modele.Name = `Coureuse_{fiche.id}`
	modele:SetAttribute("Id", fiche.id)
	modele.ModelStreamingMode = Enum.ModelStreamingMode.Persistent

	-- Ni scripts d'avatar, ni physique : ce modèle n'est qu'une marionnette
	for _, enfant in modele:GetDescendants() do
		if enfant:IsA("BaseScript") then
			enfant:Destroy()
		elseif enfant:IsA("BasePart") then
			local p = enfant :: BasePart
			p.CanCollide = false
			p.CanQuery = false
			p.CanTouch = false
		end
	end

	local humanoide = modele:FindFirstChildOfClass("Humanoid") :: Humanoid?
	local racine = modele:FindFirstChild("HumanoidRootPart") :: BasePart?
	local tete = modele:FindFirstChild("Head") :: BasePart?
	local torse = modele:FindFirstChild("UpperTorso") :: BasePart?
	local bassin = modele:FindFirstChild("LowerTorso") :: BasePart?
	if not (humanoide and racine and tete and torse and bassin) then
		modele:Destroy()
		return nil
	end
	humanoide.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	humanoide.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
	humanoide.EvaluateStateMachine = false
	humanoide.BreakJointsOnDeath = false
	racine.Anchored = true
	modele.PrimaryPart = racine

	-- On pose le modèle dans les stalles avant d'y souder quoi que ce soit
	modele:PivotTo(cadreDepart + Vector3.new(0, Monde.hauteurRacine(modele), 0))

	-- Ce que le catalogue n'a pas fourni, le code le fabrique
	local queue = if habillee then accessoire(modele, "Waist") else nil
	local poignee = queue and queue:FindFirstChild("Handle") :: BasePart?
	if poignee then
		local h = poignee.Size.Y
		ajouterTrainee(poignee, Vector3.new(0, h * 0.3, 0), Vector3.new(0, -h * 0.3, 0), robe.couleur)
	else
		ajouterQueue(bassin, robe.couleur)
	end
	if not estJoueuse then
		if not (habillee and accessoire(modele, "Hat")) then
			ajouterOreilles(tete, robe.couleur)
		end
		if not (habillee and accessoire(modele, "Face")) then
			ajouterCheveux(tete, robe.couleur)
		end
	elseif not habillee then
		ajouterOreilles(tete, robe.couleur)
	end
	ajouterDossard(torse, fiche.numero, fiche.cadre)

	modele.Parent = parent
	return modele
end

return Coureuses
