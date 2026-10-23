--!strict
-- Cinematique — les cinématiques de compétence, et les étiquettes des
-- rivales (RivalesMarques, requis d'ici).
--
-- Quand MA coureuse déclenche une compétence, 1,5 s de mise en scène : la
-- caméra tourne autour d'elle en gros plan, un fond stylisé (les couleurs et
-- les particules de l'effet équipé : étoiles, pétales, éclairs, bulles,
-- flammes) passe derrière le HUD, et le nom de la compétence s'affiche avec
-- sa phrase signature.
--
-- La course ne s'arrête pas pendant ce temps (le serveur continue) : c'est
-- court, et le HUD des commandes reste visible et utilisable. Jamais pendant
-- le photo-finish ni dans les 150 derniers mètres. Si le joueur a coupé les
-- cinématiques dans ses réglages : une simple étiquette.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Competences = require(Partage:WaitForChild("Course"):WaitForChild("Competences"))
local Catalogue = require(Partage:WaitForChild("Jeu"):WaitForChild("Catalogue"))

local Camera = require(script.Parent:WaitForChild("Camera"))
local Etat = require(script.Parent:WaitForChild("Etat"))
local Profil = require(script.Parent:WaitForChild("Profil"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))
local RivalesMarques = require(script.Parent:WaitForChild("RivalesMarques"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local Cinematique = {}

local DUREE = 1.5
local DISTANCE_MIN = 150 -- m avant l'arrivée : en dessous, on laisse la course parler

-- Une phrase signature par compétence
local PHRASES: { [string]: string } = {
	echappee = "« Personne ne me rattrapera ! »",
	coupDeReins = "« C'est maintenant que tout se joue ! »",
	remontee = "« Une par une, je vous dépasse toutes ! »",
	ouragan = "« Place, j'arrive en tempête ! »",
	virageParfait = "« Ce virage, je le connais par cœur. »",
	secondSouffle = "« Mes jambes ont encore des choses à dire ! »",
	sillage = "« Merci pour l'abri… à tout à l'heure ! »",
	teteFroide = "« Respire. Garde le rythme. »",
	regardAcier = "« Je ne céderai pas un centimètre ! »",
	departCanon = "« Les stalles s'ouvrent… partie ! »",
}

-- Les particules de chaque effet
local MOTIFS: { [string]: { string } } = {
	etoiles = { "★", "✦", "✧" },
	petales = { "❀", "✿", "❁" },
	eclairs = { "⚡", "ϟ", "✦" },
	bulles = { "○", "◯", "°" },
	flammes = { "🔥", "✹", "✸" },
}

local fond: Frame
local degrade: UIGradient
local nomCompetence: TextLabel
local phrase: TextLabel
local etiquette: TextLabel
local finCinematique = 0

local function rgb(c: { number }): Color3
	return Color3.fromRGB(c[1], c[2], c[3])
end

local function effetEquipe(): (string, Color3, Color3)
	local d = Profil.donnees
	local id = if d then d.equipement.effet else "etoiles"
	local effet = Catalogue.obtenir("effets", id) or Catalogue.obtenir("effets", "etoiles")
	if not effet then
		return "etoiles", Couleurs.OR, Couleurs.BLANC
	end
	local c2 = effet.couleur2
	return effet.id, rgb(effet.couleur), if c2 then rgb(c2) else Couleurs.BLANC
end

local function particule(motif: string, couleur: Color3)
	local p = Ui.texte(fond, "Particule", motif, math.random(22, 44), couleur)
	p.AnchorPoint = Vector2.new(0.5, 0.5)
	p.Size = UDim2.fromOffset(50, 50)
	p.Position = UDim2.fromScale(math.random(), 1.05)
	p.TextTransparency = 0.1
	p.ZIndex = 1
	local tween = TweenService:Create(p, TweenInfo.new(DUREE, Enum.EasingStyle.Sine, Enum.EasingDirection.Out), {
		Position = UDim2.fromScale(math.random(), math.random() * 0.4 - 0.1),
		Rotation = math.random(-180, 180),
		TextTransparency = 1,
	})
	tween.Completed:Once(function()
		p:Destroy()
	end)
	tween:Play()
end

local function petiteEtiquette(nom: string)
	etiquette.Text = `✨ {nom}`
	etiquette.TextTransparency = 0
	etiquette.BackgroundTransparency = 0.25
	TweenService:Create(etiquette, TweenInfo.new(0.6, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, 1.2), {
		TextTransparency = 1,
		BackgroundTransparency = 1,
	}):Play()
end

-- Peut-on jouer une cinématique maintenant ?
local function moment(): boolean
	if Rendu.ralenti or os.clock() < finCinematique then
		return false
	end
	local course = Etat.course()
	local e = Rendu.affiche[Etat.monId]
	if not course or not e then
		return false
	end
	return course.distance - e.d > DISTANCE_MIN
end

local function jouer(idCompetence: string)
	local competence = Competences.parId[idCompetence]
	if not competence then
		return
	end
	local d = Profil.donnees
	if (d and not d.reglages.cinematiques) or not moment() then
		petiteEtiquette(competence.nom)
		return
	end
	finCinematique = os.clock() + DUREE

	-- Le fond, aux couleurs de l'effet équipé
	local effet, c1, c2 = effetEquipe()
	degrade.Color = ColorSequence.new(c1, c2)
	degrade.Rotation = math.random(0, 360)
	fond.BackgroundTransparency = 0.55
	fond.Visible = true
	nomCompetence.Text = competence.nom
	nomCompetence.TextColor3 = Couleurs.BLANC
	phrase.Text = PHRASES[idCompetence] or ""
	nomCompetence.TextTransparency, phrase.TextTransparency = 0, 0
	local motifs = MOTIFS[effet] or MOTIFS.etoiles
	for i = 1, 16 do
		particule(motifs[(i - 1) % #motifs + 1], if i % 2 == 0 then c1 else c2)
	end
	local disparition = TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, DUREE - 0.35)
	TweenService:Create(fond, disparition, { BackgroundTransparency = 1 }):Play()
	TweenService:Create(nomCompetence, disparition, { TextTransparency = 1 }):Play()
	TweenService:Create(phrase, disparition, { TextTransparency = 1 }):Play()
	task.delay(DUREE, function()
		if os.clock() >= finCinematique - 0.01 then
			fond.Visible = false
		end
	end)

	-- La caméra tourne autour de ma coureuse
	local debut = os.clock()
	local depart = math.random() * math.pi * 2
	Camera.prendre(function(_dt: number, camera: Camera): boolean
		local t = os.clock() - debut
		local e = Rendu.affiche[Etat.monId]
		if t > DUREE or not e or Rendu.ralenti then
			return false
		end
		local centre = e.cadre.Position + Vector3.new(0, 2.5, 0)
		local angle = depart + t * 2.2
		local rayon = 10 - 3 * (t / DUREE)
		local oeil = centre + Vector3.new(math.cos(angle) * rayon, 2 + t, math.sin(angle) * rayon)
		camera.CFrame = CFrame.lookAt(oeil, centre)
		camera.FieldOfView = 55
		return true
	end)
end

function Cinematique.creer(gui: ScreenGui)
	RivalesMarques.creer()

	-- Derrière le HUD (ZIndex bas) : les commandes restent visibles
	fond = Ui.cadre(gui, "Cinematique", UDim2.fromScale(1, 1), UDim2.new(), Couleurs.BLANC, 1)
	fond.ZIndex = 0
	fond.Visible = false
	degrade = Instance.new("UIGradient")
	degrade.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.1),
		NumberSequenceKeypoint.new(0.5, 0.6),
		NumberSequenceKeypoint.new(1, 0.1),
	})
	degrade.Parent = fond
	nomCompetence = Ui.texte(fond, "Nom", "", 52, Couleurs.BLANC)
	nomCompetence.AnchorPoint = Vector2.new(0.5, 0.5)
	nomCompetence.Position = UDim2.fromScale(0.5, 0.36)
	nomCompetence.Size = UDim2.fromOffset(900, 64)
	nomCompetence.ZIndex = 2
	local contour = Instance.new("UIStroke")
	contour.Thickness = 3
	contour.Color = Couleurs.FOND_SOMBRE
	contour.Parent = nomCompetence
	phrase = Ui.texte(fond, "Phrase", "", 26, Couleurs.BLANC)
	phrase.AnchorPoint = Vector2.new(0.5, 0.5)
	phrase.Position = UDim2.fromScale(0.5, 0.45)
	phrase.Size = UDim2.fromOffset(900, 34)
	phrase.ZIndex = 2

	etiquette = Ui.texte(gui, "EtiquetteCompetence", "", 20, Couleurs.BLANC)
	etiquette.AnchorPoint = Vector2.new(0.5, 0)
	etiquette.Position = UDim2.new(0.5, 0, 0, 120)
	etiquette.Size = UDim2.fromOffset(360, 34)
	etiquette.BackgroundColor3 = Couleurs.FOND_SOMBRE
	etiquette.BackgroundTransparency = 1
	etiquette.TextTransparency = 1
	Ui.coins(etiquette, 12)

	Etat.ecouter("evenements", function(lot: { { [string]: any } })
		for _, e in lot do
			if e.genre == "competence" and e.id == Etat.monId and Etat.monId ~= 0 then
				jouer(e.competence)
			end
		end
	end)
end

function Cinematique.mettreAJour()
	RivalesMarques.mettreAJour()
end

return Cinematique
