--!strict
-- Coureuses — fabrique les modèles 3D des partantes.
--
-- Une joueuse court avec son propre avatar Roblox ; un bot reçoit un corps
-- généré (peau, cheveux) d'après sa graine d'apparence. Toutes portent le
-- kit oreilles + queue et un dossard aux couleurs de leur cadre.
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
local Aleatoire = require(Partage:WaitForChild("Course"):WaitForChild("Aleatoire"))

local Coureuses = {}

export type Fiche = {
	id: number,
	nom: string,
	numero: number,
	cadre: number,
	userId: number?,
	apparence: number?,
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

local function descriptionBot(rng: Aleatoire.Aleatoire): HumanoidDescription
	local d = Instance.new("HumanoidDescription")
	local peau = rng:choisir(Couleurs.PEAUX)
	d.HeadColor = peau
	d.LeftArmColor = peau
	d.RightArmColor = peau
	d.LeftLegColor = peau
	d.RightLegColor = peau
	-- Tenue de course : haut blanc
	d.TorsoColor = Color3.fromRGB(245, 245, 250)
	return d
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

	-- Une traînée entre deux points de la queue : en mouvement, elle dessine
	-- une mèche qui flotte derrière la coureuse.
	local a0 = Instance.new("Attachment")
	a0.Position = Vector3.new(0, 0.25, 0.6)
	a0.Parent = queue
	local a1 = Instance.new("Attachment")
	a1.Position = Vector3.new(0, -0.25, 0.7)
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
	local description: HumanoidDescription? = nil
	local estJoueuse = fiche.userId ~= nil
	if fiche.userId then
		description = descriptionJoueur(fiche.userId)
	end
	local d = description or descriptionBot(rng)

	local ok, modele = pcall(function()
		return Players:CreateHumanoidModelFromDescriptionAsync(d, Enum.HumanoidRigType.R15)
	end)
	if not ok or not modele then
		warn(`[Coureuses] modèle de {fiche.nom} impossible à créer : {modele}`)
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

	local couleurCheveux = rng:choisir(Couleurs.CHEVEUX)
	if not estJoueuse then
		ajouterCheveux(tete, couleurCheveux)
	end
	ajouterOreilles(tete, couleurCheveux)
	ajouterQueue(bassin, couleurCheveux)
	ajouterDossard(torse, fiche.numero, fiche.cadre)

	modele.Parent = parent
	return modele
end

return Coureuses
