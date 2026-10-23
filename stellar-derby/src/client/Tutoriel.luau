--!strict
-- Tutoriel — les bulles de la guide.
--
--   - Bienvenue : à la première visite, une bulle propose une course pour
--     apprendre (Commencer / Plus tard). La guide de l'Académie (invite
--     « tutoriel ») la repropose à tout moment.
--   - Pendant la course de tutoriel : une bulle au bon moment, courte, avec
--     le geste au doigt et au clavier (les étapes sont dans Jeu/Tutoriel).
--   - Puis la visite de l'Académie : chaque bouton du menu clignote, avec sa
--     bulle et « Suivant ».
--   - Partout, « Passer ».

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local T = require(Partage:WaitForChild("Jeu"):WaitForChild("Tutoriel"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Interactions = require(script.Parent:WaitForChild("Interactions"))
local Menu = require(script.Parent:WaitForChild("Menu"))
local Notifications = require(script.Parent:WaitForChild("Notifications"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))
local Requetes = require(script.Parent:WaitForChild("Requetes"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local Tutoriel = {}

local bulle: Frame
local texte: TextLabel
local boutonOui: TextButton
local boutonNon: TextButton
local boutonSuivant: TextButton
local boutonPasser: TextButton
local surligne: UIStroke? = nil
local clignotement: Tween? = nil

local mode = "aucun" -- "aucun" | "proposition" | "course" | "academie"
local etape = 1 -- prochaine étape de course à montrer, ou étape de visite en cours
local finBulle = 0
local vus: { [string]: number } = {} -- genre d'événement de ma coureuse → quand (os.clock)
local recents: { [string]: boolean } = {}
local RECENT = 2.5 -- s : un événement plus vieux ne déclenche plus de bulle

-- ─────────────────────────────── La bulle ───────────────────────────────

local function arreterSurlignage()
	local t = clignotement
	if t then
		t:Cancel()
		clignotement = nil
	end
	local s = surligne
	if s then
		s:Destroy()
		surligne = nil
	end
end

local function montrer(message: string, boutons: { oui: boolean?, suivant: boolean?, passer: boolean? })
	texte.Text = message
	boutonOui.Visible = boutons.oui == true
	boutonNon.Visible = boutons.oui == true
	boutonSuivant.Visible = boutons.suivant == true
	boutonPasser.Visible = boutons.passer ~= false
	bulle.Visible = true
end

local function cacher()
	bulle.Visible = false
	arreterSurlignage()
end

local function surligner(id: string)
	arreterSurlignage()
	local rangee = Menu.ecran():FindFirstChild("BoutonsAcademie")
	local bouton = rangee and rangee:FindFirstChild(id) :: GuiObject?
	if not bouton then
		return
	end
	local s = Instance.new("UIStroke")
	s.Name = "SurlignageTutoriel"
	s.Color = Couleurs.OR
	s.Thickness = 5
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = bouton
	surligne = s
	local t = TweenService:Create(
		s,
		TweenInfo.new(0.5, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
		{ Transparency = 0.8 }
	)
	t:Play()
	clignotement = t
end

local function terminer(passe: boolean)
	mode = "aucun"
	cacher()
	if passe then
		Requetes.envoyer("tutoriel.passer")
	else
		local reponse = Requetes.envoyer("tutoriel.finir")
		if reponse.ok and not reponse.recompense then
			Notifications.afficher("Tutoriel revu : bonne course !", "info")
		end
	end
end

-- ─────────────────────────────── Étapes ───────────────────────────────

local function proposer(relance: boolean)
	if mode == "course" or Etat.regarde() then
		return
	end
	mode = "proposition"
	montrer(
		if relance
			then "Envie de revoir le tutoriel ? Une course guidée, puis la visite de l'Académie."
			else "Bienvenue à l'Académie des Vents ! Une première course pour apprendre ?",
		{ oui = true, passer = false }
	)
end

local function commencerCourse()
	cacher()
	local reponse = Requetes.envoyer("tutoriel.commencer")
	if not reponse.ok then
		mode = "aucun"
		Notifications.afficher(reponse.erreur or "Impossible de lancer le tutoriel.", "alerte")
		return
	end
	mode = "course"
	etape = 1
	table.clear(vus)
	Menu.fermer()
end

local function montrerVisite()
	local e = T.ETAPES[etape]
	if not e then
		terminer(false)
		return
	end
	montrer(e.texte, { suivant = true })
	boutonSuivant.Text = if T.suivante(etape) then "Suivant" else "C'est parti !"
	local bouton = e.moment.bouton
	if bouton then
		surligner(bouton)
	else
		arreterSurlignage()
	end
	Requetes.envoyer("tutoriel.etape", { etape = etape })
end

local function commencerVisite()
	mode = "academie"
	etape = T.debutAcademie()
	montrerVisite()
end

-- Les bulles de la course guidée, au fil de la course.
local function suivreCourse()
	if Etat.genre ~= "tutoriel" then
		return
	end
	if os.clock() > finBulle and bulle.Visible then
		cacher()
	end
	local course = Etat.course()
	local affiche = Rendu.affiche[Etat.monId]
	local fraction = if course and affiche then affiche.d / course.distance else 0
	table.clear(recents)
	for genre, quand in vus do
		if os.clock() - quand <= RECENT then
			recents[genre] = true
		end
	end
	local contexte: T.Contexte = { phase = Etat.phase, fraction = fraction, evenements = recents }
	-- La première étape à venir dont le moment est arrivé ; celles qu'on a
	-- ratées (une compétence jamais prête…) ne bloquent pas la suite
	local trouvee: number? = nil
	for i = etape, T.debutAcademie() - 1 do
		if T.declenchee(T.ETAPES[i], contexte) then
			trouvee = i
			break
		end
	end
	local e = if trouvee then T.ETAPES[trouvee] else nil
	if trouvee and e then
		local message = e.texte
		if e.id == "arrivee" then
			local rang, partantes = #Etat.resultats, math.max(1, #Etat.resultats)
			for _, r in Etat.resultats do
				if r.id == Etat.monId then
					rang = r.rang
				end
			end
			message = T.bravo(rang, partantes)
		end
		montrer(message, {})
		finBulle = os.clock() + T.DUREE_BULLE
		etape = trouvee + 1
	end
end

-- ─────────────────────────────── Construction ───────────────────────────────

function Tutoriel.creer(gui: ScreenGui)
	bulle = Ui.cadre(gui, "BulleTutoriel", UDim2.fromOffset(560, 150), UDim2.new(0.5, 0, 0, 120), Couleurs.FOND, 0.02)
	bulle.AnchorPoint = Vector2.new(0.5, 0)
	bulle.Visible = false
	bulle.ZIndex = 20
	Ui.coins(bulle, 20)
	Ui.contour(bulle, Couleurs.ROSE, 3)
	local guide = Ui.texte(bulle, "Guide", "🌸", 40)
	guide.Position = UDim2.fromOffset(10, 10)
	guide.Size = UDim2.fromOffset(56, 56)
	guide.ZIndex = 21
	texte = Ui.texte(bulle, "Texte", "", 18, Couleurs.TEXTE, Ui.POLICE_TEXTE)
	texte.Position = UDim2.fromOffset(72, 12)
	texte.Size = UDim2.new(1, -86, 0, 76)
	texte.TextXAlignment = Enum.TextXAlignment.Left
	texte.TextYAlignment = Enum.TextYAlignment.Top
	texte.ZIndex = 21
	local rangee = Ui.cadre(bulle, "Boutons", UDim2.new(1, -24, 0, 48), UDim2.new(0, 12, 1, -58), Couleurs.FOND, 1)
	rangee.ZIndex = 21
	Ui.liste(rangee, Enum.FillDirection.Horizontal, 8, Enum.HorizontalAlignment.Right)
	local function bouton(nom: string, libelle: string, couleur: Color3, ordre: number): TextButton
		local b = Ui.bouton(rangee, nom, libelle, UDim2.fromOffset(150, 46), couleur)
		b.LayoutOrder = ordre
		b.ZIndex = 22
		return b
	end
	boutonPasser = bouton("Passer", "Passer", Couleurs.ARGENT, 1)
	boutonNon = bouton("PlusTard", "Plus tard", Couleurs.ROSE_PALE, 2)
	boutonNon.TextColor3 = Couleurs.TEXTE
	boutonOui = bouton("Commencer", "Commencer", Couleurs.ROSE, 3)
	boutonSuivant = bouton("Suivant", "Suivant", Couleurs.ROSE, 4)

	boutonOui.Activated:Connect(commencerCourse)
	boutonNon.Activated:Connect(function()
		mode = "aucun"
		cacher()
	end)
	boutonPasser.Activated:Connect(function()
		terminer(true)
	end)
	boutonSuivant.Activated:Connect(function()
		local suivante = T.suivante(etape)
		if suivante then
			etape = suivante
			montrerVisite()
		else
			terminer(false)
		end
	end)

	Reseau.signal().OnClientEvent:Connect(function(nom: unknown)
		if nom == "tutoriel.proposer" then
			proposer(false)
		elseif nom == "tutoriel.academie" and mode == "course" then
			-- Revenue à l'Académie : la visite commence quand l'écran est libre
			task.spawn(function()
				local fin = os.clock() + 10
				while Etat.regarde() and os.clock() < fin do
					task.wait(0.25)
				end
				commencerVisite()
			end)
		end
	end)
	Interactions.surAction("tutoriel", function()
		proposer(true)
	end)
	Etat.ecouter("evenements", function(lot: { { [string]: any } })
		if mode ~= "course" then
			return
		end
		for _, e in lot do
			if e.id == Etat.monId and type(e.genre) == "string" then
				vus[e.genre] = os.clock()
			end
		end
	end)
end

local depuis = 0
function Tutoriel.mettreAJour()
	if mode ~= "course" then
		return
	end
	local t = os.clock()
	if t - depuis < 0.2 then
		return
	end
	depuis = t
	suivreCourse()
end

return Tutoriel
