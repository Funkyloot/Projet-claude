--!strict
-- Rendu — fait courir les modèles d'après les instantanés du serveur.
--
-- Le client affiche la course avec un léger retard (Config.RETARD_INTERPOLATION)
-- pour toujours avoir deux instantanés à interpoler : le mouvement reste
-- fluide à 60 images/s alors que le serveur n'envoie que 15 positions/s.
--
-- Rendu.affiche contient, pour chaque coureuse, l'état tel qu'il est montré
-- à l'écran à cette image : la caméra, le HUD et la mini-carte s'en servent
-- pour rester cohérents avec ce que le joueur voit.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Config = require(Partage:WaitForChild("Config"))
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Monde = require(Partage:WaitForChild("Monde"))
local Paquet = require(Partage:WaitForChild("Course"):WaitForChild("Paquet"))

local Etat = require(script.Parent:WaitForChild("Etat"))

export type Affiche = {
	id: number,
	d: number,
	couloir: number,
	v: number,
	s: number, -- abscisse sur la piste
	endurance: number,
	rang: number,
	sprint: boolean,
	epuisee: boolean,
	aspiration: boolean,
	bloquee: boolean,
	duel: boolean,
	arrivee: boolean,
	aura: number,
	cadre: CFrame,
}

type Marionnette = {
	id: number,
	modele: Model,
	racine: BasePart,
	hauteur: number,
	course: AnimationTrack?,
	attente: AnimationTrack?,
	fete: AnimationTrack?,
	salut: AnimationTrack?,
	etiquette: TextLabel,
	pastille: TextLabel,
	surbrillance: Highlight,
	etincelles: ParticleEmitter,
}

local EXTRAPOLATION_MAX = 0.25

local Rendu = {
	affiche = {} :: { [number]: Affiche },
	ralenti = false,
}

local marionnettes: { [number]: Marionnette } = {}
local generation = 0 -- change à chaque nouveau peloton : les chargements en retard s'annulent

local function chargerAnimation(animateur: Animator, id: string, priorite: Enum.AnimationPriority): AnimationTrack?
	local animation = Instance.new("Animation")
	animation.AnimationId = id
	local ok, piste = pcall(function()
		return animateur:LoadAnimation(animation)
	end)
	if not ok then
		return nil
	end
	local p = piste :: AnimationTrack
	p.Priority = priorite
	return p
end

local function creerEtiquette(modele: Model, nom: string, cadre: number, estMoi: boolean): (TextLabel, TextLabel)
	local tete = modele:FindFirstChild("Head") :: BasePart?
	local gui = Instance.new("BillboardGui")
	gui.Name = "Etiquette"
	gui.Size = UDim2.fromOffset(160, 26)
	gui.StudsOffsetWorldSpace = Vector3.new(0, 3.2, 0)
	gui.MaxDistance = if estMoi then 400 else 140
	gui.AlwaysOnTop = estMoi
	gui.LightInfluence = 0
	if tete then
		gui.Adornee = tete
	end
	gui.Parent = modele

	local fond = Instance.new("Frame")
	fond.Size = UDim2.fromScale(1, 1)
	fond.BackgroundTransparency = 1
	fond.Parent = gui
	local liste = Instance.new("UIListLayout")
	liste.FillDirection = Enum.FillDirection.Horizontal
	liste.HorizontalAlignment = Enum.HorizontalAlignment.Center
	liste.VerticalAlignment = Enum.VerticalAlignment.Center
	liste.Padding = UDim.new(0, 4)
	liste.Parent = fond

	local pastille = Instance.new("TextLabel")
	pastille.Name = "Rang"
	pastille.Size = UDim2.fromOffset(30, 22)
	pastille.BackgroundColor3 = Couleurs.CADRES[cadre]
	pastille.TextColor3 = Couleurs.TEXTE_CADRES[cadre]
	pastille.Font = Enum.Font.FredokaOne
	pastille.TextSize = 15
	pastille.Text = ""
	pastille.Parent = fond
	local coin = Instance.new("UICorner")
	coin.CornerRadius = UDim.new(0, 6)
	coin.Parent = pastille

	local texte = Instance.new("TextLabel")
	texte.Name = "Nom"
	texte.AutomaticSize = Enum.AutomaticSize.X
	texte.Size = UDim2.fromOffset(0, 22)
	texte.BackgroundTransparency = 1
	texte.Font = Enum.Font.FredokaOne
	texte.TextSize = 15
	texte.TextColor3 = if estMoi then Couleurs.ROSE else Couleurs.BLANC
	texte.TextStrokeTransparency = 0.4
	texte.Text = nom
	texte.Parent = fond
	return texte, pastille
end

local function preparer(id: number, modele: Model): Marionnette?
	local racine = modele:WaitForChild("HumanoidRootPart", 5) :: BasePart?
	local humanoide = modele:FindFirstChildOfClass("Humanoid") :: Humanoid?
	local partante = Etat.parId[id]
	if not racine or not humanoide or not partante then
		return nil
	end
	local animateur = humanoide:FindFirstChildOfClass("Animator") :: Animator?
	if not animateur then
		local nouveau = Instance.new("Animator")
		nouveau.Parent = humanoide
		animateur = nouveau
	end
	local a = animateur :: Animator
	local estMoi = id == Etat.monId

	local etiquette, pastille = creerEtiquette(modele, partante.nom, partante.cadre, estMoi)

	local surbrillance = Instance.new("Highlight")
	surbrillance.Adornee = modele
	surbrillance.Enabled = false
	surbrillance.FillTransparency = 0.75
	surbrillance.OutlineTransparency = 0.2
	surbrillance.DepthMode = Enum.HighlightDepthMode.Occluded
	surbrillance.Parent = modele

	local etincelles = Instance.new("ParticleEmitter")
	etincelles.Rate = 0
	etincelles.Lifetime = NumberRange.new(0.25, 0.5)
	etincelles.Speed = NumberRange.new(4, 9)
	etincelles.SpreadAngle = Vector2.new(180, 180)
	etincelles.Size = NumberSequence.new(0.35, 0)
	etincelles.LightEmission = 1
	etincelles.Parent = racine

	local m: Marionnette = {
		id = id,
		modele = modele,
		racine = racine,
		hauteur = Monde.hauteurRacine(modele) - Monde.SOL,
		course = chargerAnimation(a, Config.ANIMATIONS.course, Enum.AnimationPriority.Movement),
		attente = chargerAnimation(a, Config.ANIMATIONS.attente, Enum.AnimationPriority.Idle),
		fete = chargerAnimation(a, Config.ANIMATIONS.victoire, Enum.AnimationPriority.Action),
		salut = chargerAnimation(a, Config.ANIMATIONS.salut, Enum.AnimationPriority.Action),
		etiquette = etiquette,
		pastille = pastille,
		surbrillance = surbrillance,
		etincelles = etincelles,
	}
	local attente = m.attente
	if attente then
		attente:Play()
	end
	return m
end

local function vider()
	generation += 1
	table.clear(marionnettes)
	table.clear(Rendu.affiche)
end

local function chargerPeloton()
	vider()
	local maGeneration = generation
	local dossier = Workspace:WaitForChild("Coureuses")
	for _, partante in Etat.peloton do
		task.spawn(function()
			local modele = dossier:WaitForChild(`Coureuse_{partante.id}`, 15) :: Model?
			if modele and maGeneration == generation then
				local m = preparer(partante.id, modele)
				if m and maGeneration == generation then
					marionnettes[partante.id] = m
				end
			end
		end)
	end
end

local function interpoler(a: Paquet.EtatCoureuse, b: Paquet.EtatCoureuse, alpha: number): (number, number, number)
	return a.d + (b.d - a.d) * alpha, a.couloir + (b.couloir - a.couloir) * alpha, a.v + (b.v - a.v) * alpha
end

local function animer(m: Marionnette, v: number, ralenti: boolean)
	local course, attente = m.course, m.attente
	if not course then
		return
	end
	if v > 0.5 then
		if not course.IsPlaying then
			course:Play(0.2)
			if attente then
				attente:Stop(0.2)
			end
		end
		local vitesseStuds = v * Monde.ECHELLE
		local cadence = math.clamp(vitesseStuds / Config.VITESSE_REFERENCE_ANIMATION, 0.4, 2.2)
		course:AdjustSpeed(cadence * (if ralenti then Config.RALENTI_PHOTO_FINISH else 1))
	elseif course.IsPlaying then
		course:Stop(0.3)
		if attente then
			attente:Play(0.3)
		end
	end
end

local function habiller(m: Marionnette, e: Affiche)
	-- Rang, et un petit signe de ce qui se passe
	local signe = if e.duel then " 🔥" elseif e.epuisee then " 💦" elseif e.sprint then " ⚡" else ""
	m.pastille.Text = tostring(e.rang)
	local partante = Etat.parId[m.id]
	if partante then
		m.etiquette.Text = partante.nom .. signe
	end
	-- L'identifiant du joueur peut arriver après le peloton : on le relit ici
	local estMoi = m.id == Etat.monId
	m.etiquette.TextColor3 = if estMoi then Couleurs.ROSE else Couleurs.BLANC

	if e.aura > 0 then
		local couleur = Couleurs.AURAS[e.aura]
		m.surbrillance.Enabled = true
		m.surbrillance.FillColor = couleur
		m.surbrillance.OutlineColor = couleur
		m.etincelles.Color = ColorSequence.new(couleur)
		m.etincelles.Rate = 60
	elseif e.duel then
		m.surbrillance.Enabled = true
		m.surbrillance.FillColor = Color3.fromRGB(255, 120, 60)
		m.surbrillance.OutlineColor = Color3.fromRGB(255, 80, 40)
		m.etincelles.Color = ColorSequence.new(Color3.fromRGB(255, 140, 60))
		m.etincelles.Rate = 30
	else
		m.surbrillance.Enabled = false
		m.etincelles.Rate = 0
	end
end

-- Appelée à chaque image, avant la caméra.
function Rendu.mettreAJour(_dt: number)
	local course = Etat.course()
	if not course or not Etat.enCourse() then
		return
	end
	local heure = Etat.maintenant() - Config.RETARD_INTERPOLATION
	local a, b, alpha = Etat.encadrer(heure)
	if not a or not b then
		return
	end
	Rendu.ralenti = b.ralenti
	-- Au-delà du dernier instantané, on prolonge un peu le mouvement
	local avance = if a == b then math.clamp(heure - b.heure, 0, EXTRAPOLATION_MAX) else 0
	if Rendu.ralenti then
		avance *= Config.RALENTI_PHOTO_FINISH
	end

	for i, eb in b.coureuses do
		local ea = a.coureuses[i] or eb
		local d, couloir, v = interpoler(ea, eb, alpha)
		d += v * avance
		local s = -course.distance + d

		-- Orientation : la tangente, plus un soupçon de dérive latérale
		local duree = b.heure - a.heure
		local vLaterale = if duree > 0 then (eb.couloir - ea.couloir) / duree else 0
		local position = Monde.point(s, couloir, Monde.SOL)
		local direction = Monde.tangente(s) * math.max(v, 1) + Monde.exterieur(s) * vLaterale
		local cadre = CFrame.lookAt(position, position + direction)

		local e: Affiche = {
			id = i,
			d = d,
			couloir = couloir,
			v = v,
			s = s,
			endurance = eb.endurance,
			rang = eb.rang,
			sprint = eb.sprint,
			epuisee = eb.epuisee,
			aspiration = eb.aspiration,
			bloquee = eb.bloquee,
			duel = eb.duel,
			arrivee = eb.arrivee,
			aura = eb.aura,
			cadre = cadre,
		}
		Rendu.affiche[i] = e

		local m = marionnettes[i]
		if m and m.modele.Parent then
			m.racine.CFrame = cadre + Vector3.new(0, m.hauteur, 0)
			animer(m, v, Rendu.ralenti)
			habiller(m, e)
		end
	end
end

-- Les trois premières montent sur le podium.
local function podium()
	local hippodrome = Workspace:FindFirstChild("Hippodrome")
	local modelePodium = hippodrome and hippodrome:FindFirstChild("Podium")
	if not modelePodium then
		return
	end
	for _, r in Etat.resultats do
		local m = marionnettes[r.id]
		local marche = modelePodium:FindFirstChild(`Marche{r.rang}`) :: BasePart?
		if m and marche and r.rang <= 3 then
			local dessus = marche.CFrame * CFrame.new(0, marche.Size.Y / 2, 0)
			m.racine.CFrame = dessus + Vector3.new(0, m.hauteur, 0)
			local course = m.course
			if course then
				course:Stop(0.2)
			end
			local fete = if r.rang == 1 then m.fete else m.salut
			if fete then
				fete.Looped = true
				fete:Play(0.3)
			end
			m.etiquette.Text = `{r.rang == 1 and "👑 " or ""}{r.nom}`
			m.pastille.Text = tostring(r.rang)
		end
	end
end

function Rendu.cadreDe(id: number): CFrame?
	local e = Rendu.affiche[id]
	return e and e.cadre
end

function Rendu.demarrer()
	Etat.ecouter("peloton", chargerPeloton)
	Etat.ecouter("resultats", function()
		if Etat.phase == "resultats" then
			podium()
		end
	end)
	Etat.ecouter("phase", function(phase: string)
		if phase == "resultats" then
			podium()
		elseif phase == "lobby" then
			vider()
		end
	end)
	if #Etat.peloton > 0 then
		chargerPeloton()
	end
end

return Rendu
