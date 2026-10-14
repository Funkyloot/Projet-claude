--!strict
-- Lobby — préparer la prochaine course : stratégie, profil, prête ?
--
-- L'interface n'affiche que ce que le serveur a validé (attributs du
-- joueur) : un clic envoie une demande, et c'est la réponse qui rafraîchit
-- l'écran.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Robes = require(Partage:WaitForChild("Robes"))
local Course = Partage:WaitForChild("Course")
local Peloton = require(Course:WaitForChild("Peloton"))
local Strategies = require(Course:WaitForChild("Strategies"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local METEOS = {
	soleil = "☀️ grand soleil",
	matin = "🌅 au petit matin",
	couchant = "🌇 au couchant",
	pluie = "🌧️ sous la pluie",
}

local Lobby = {}

local joueur = Players.LocalPlayer
local panneau: Frame
local nomCourse: TextLabel
local detailCourse: TextLabel
local compteur: TextLabel
local cartesStrategie: { [string]: TextButton } = {}
local pastillesProfil: { [string]: TextButton } = {}
local resumeProfil: TextLabel
local pastillesRobe: { [string]: TextButton } = {}
local nomRobe: TextLabel
local boutonParticiper: TextButton
local boutonPret: TextButton

local function demander(changement: { [string]: any })
	Reseau.commande():FireServer("choix", changement)
end

local function rafraichir()
	local strategie = joueur:GetAttribute("Strategie")
	local profil = joueur:GetAttribute("Profil")
	local participer = joueur:GetAttribute("Participer") ~= false
	local pret = joueur:GetAttribute("Pret") == true
	for id, carte in cartesStrategie do
		local choisie = id == strategie
		carte.BackgroundColor3 = if choisie then Couleurs.STRATEGIES[id] else Couleurs.BLANC
		local contour = carte:FindFirstChildOfClass("UIStroke") :: UIStroke?
		if contour then
			contour.Color = if choisie then Couleurs.BLANC else Couleurs.STRATEGIES[id]
		end
		for _, enfant in carte:GetChildren() do
			if enfant:IsA("TextLabel") then
				(enfant :: TextLabel).TextColor3 = if choisie then Couleurs.BLANC else Couleurs.TEXTE
			end
		end
	end
	for id, pastille in pastillesProfil do
		local choisi = id == profil
		pastille.BackgroundColor3 = if choisi then Couleurs.ROSE else Couleurs.ROSE_PALE
		pastille.TextColor3 = if choisi then Couleurs.BLANC else Couleurs.TEXTE
	end
	local robe = Robes.obtenir(joueur:GetAttribute("Robe"))
	for id, pastille in pastillesRobe do
		local choisie = id == robe.id
		local contour = pastille:FindFirstChildOfClass("UIStroke") :: UIStroke?
		if contour then
			contour.Thickness = if choisie then 4 else 1
			contour.Color = if choisie then Couleurs.ROSE else Couleurs.TEXTE_DOUX
		end
	end
	nomRobe.Text = `Ta robe : {robe.nom} — oreilles et queue assorties`
	local p = Peloton.profil(profil)
	local s = p.stats
	resumeProfil.Text =
		`{p.resume}  Vitesse {s.vitesse} · Souffle {s.souffle} · Puissance {s.puissance} · Cœur {s.coeur} · Instinct {s.instinct}`
	boutonParticiper.Text = if participer then "🏇 Je cours" else "👀 Je regarde"
	boutonParticiper.BackgroundColor3 = if participer then Couleurs.CIEL else Couleurs.FOND_SOMBRE
	boutonPret.Text = if pret then "✔ Prête !" else "Prête ?"
	boutonPret.BackgroundColor3 = if pret then Couleurs.ENDURANCE_PLEINE else Couleurs.ROSE
	boutonPret.Visible = participer
end

local function rafraichirCourse()
	local course = Etat.course()
	if course then
		nomCourse.Text = course.nom
		detailCourse.Text =
			`{course.distance} m · {course.categorie} · {METEOS[course.meteo] or ""} · terrain {course.etat}`
	end
end

function Lobby.creer(parent: ScreenGui)
	panneau = Ui.cadre(parent, "Lobby", UDim2.fromOffset(600, 680), UDim2.new(0, 24, 0.5, 0), Couleurs.FOND, 0.04)
	panneau.AnchorPoint = Vector2.new(0, 0.5)
	panneau.Visible = false
	Ui.coins(panneau, 22)
	Ui.contour(panneau, Couleurs.ROSE_PALE, 3)
	Ui.marges(panneau, 18)
	Ui.liste(panneau, Enum.FillDirection.Vertical, 8)

	local entete = Ui.texte(panneau, "Entete", "★ PROCHAINE COURSE ★", 15, Couleurs.TEXTE_DOUX)
	entete.LayoutOrder = 1
	nomCourse = Ui.texte(panneau, "Nom", "", 32, Couleurs.ROSE)
	nomCourse.LayoutOrder = 2
	detailCourse = Ui.texte(panneau, "Detail", "", 16, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
	detailCourse.LayoutOrder = 3
	compteur = Ui.texte(panneau, "Compteur", "", 18, Couleurs.TEXTE)
	compteur.LayoutOrder = 4

	local titreStrategie = Ui.texte(panneau, "TitreStrategie", "Ta stratégie", 18, Couleurs.TEXTE)
	titreStrategie.LayoutOrder = 5
	titreStrategie.TextXAlignment = Enum.TextXAlignment.Left
	local grille = Ui.cadre(panneau, "Strategies", UDim2.new(1, 0, 0, 176), UDim2.new(), Couleurs.FOND, 1)
	grille.LayoutOrder = 6
	local disposition = Instance.new("UIGridLayout")
	disposition.CellSize = UDim2.new(0.5, -5, 0, 84)
	disposition.CellPadding = UDim2.fromOffset(10, 8)
	disposition.SortOrder = Enum.SortOrder.LayoutOrder
	disposition.Parent = grille
	for ordre, id in Strategies.ordre do
		local s = Strategies.parId[id]
		local carte = Instance.new("TextButton")
		carte.Name = id
		carte.LayoutOrder = ordre
		carte.Text = ""
		carte.AutoButtonColor = true
		carte.BackgroundColor3 = Couleurs.BLANC
		carte.Parent = grille
		Ui.coins(carte, 14)
		Ui.contour(carte, Couleurs.STRATEGIES[id], 2)
		local nom = Ui.texte(carte, "Nom", `{s.icone} {s.nom}`, 20, Couleurs.TEXTE)
		nom.Position = UDim2.fromOffset(10, 6)
		nom.Size = UDim2.new(1, -20, 0, 24)
		nom.TextXAlignment = Enum.TextXAlignment.Left
		local resume = Ui.texte(carte, "Resume", s.resume, 13, Couleurs.TEXTE, Ui.POLICE_TEXTE)
		resume.Position = UDim2.fromOffset(10, 32)
		resume.Size = UDim2.new(1, -20, 0, 46)
		resume.TextXAlignment = Enum.TextXAlignment.Left
		resume.TextYAlignment = Enum.TextYAlignment.Top
		carte.Activated:Connect(function()
			demander({ strategie = id })
		end)
		cartesStrategie[id] = carte
	end

	local titreProfil = Ui.texte(panneau, "TitreProfil", "Ton profil", 18, Couleurs.TEXTE)
	titreProfil.LayoutOrder = 7
	titreProfil.TextXAlignment = Enum.TextXAlignment.Left
	local rangee = Ui.cadre(panneau, "Profils", UDim2.new(1, 0, 0, 44), UDim2.new(), Couleurs.FOND, 1)
	rangee.LayoutOrder = 8
	Ui.liste(rangee, Enum.FillDirection.Horizontal, 8)
	for ordre, p in Peloton.profils do
		local pastille = Ui.bouton(rangee, p.id, p.nom, UDim2.new(0.25, -6, 1, 0), Couleurs.ROSE_PALE, Couleurs.TEXTE)
		pastille.LayoutOrder = ordre
		pastille.Activated:Connect(function()
			demander({ profil = p.id })
		end)
		pastillesProfil[p.id] = pastille
	end
	resumeProfil = Ui.texte(panneau, "ResumeProfil", "", 13, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
	resumeProfil.LayoutOrder = 9
	resumeProfil.Size = UDim2.new(1, 0, 0, 34)
	resumeProfil.TextXAlignment = Enum.TextXAlignment.Left

	-- La robe : la couleur des oreilles et de la queue
	local rangeeRobes = Ui.cadre(panneau, "Robes", UDim2.new(1, 0, 0, 40), UDim2.new(), Couleurs.FOND, 1)
	rangeeRobes.LayoutOrder = 10
	Ui.liste(rangeeRobes, Enum.FillDirection.Horizontal, 8)
	for ordre, robe in Robes.liste do
		local pastille = Instance.new("TextButton")
		pastille.Name = robe.id
		pastille.LayoutOrder = ordre
		pastille.Size = UDim2.fromOffset(40, 40)
		pastille.Text = ""
		pastille.BackgroundColor3 = robe.couleur
		pastille.AutoButtonColor = true
		pastille.Parent = rangeeRobes
		Ui.coins(pastille, 20)
		Ui.contour(pastille, Couleurs.TEXTE_DOUX, 1)
		pastille.Activated:Connect(function()
			demander({ robe = robe.id })
		end)
		pastillesRobe[robe.id] = pastille
	end
	nomRobe = Ui.texte(panneau, "NomRobe", "", 13, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
	nomRobe.LayoutOrder = 11
	nomRobe.TextXAlignment = Enum.TextXAlignment.Left

	local actions = Ui.cadre(panneau, "Actions", UDim2.new(1, 0, 0, 56), UDim2.new(), Couleurs.FOND, 1)
	actions.LayoutOrder = 12
	Ui.liste(actions, Enum.FillDirection.Horizontal, 10)
	boutonParticiper = Ui.bouton(actions, "Participer", "", UDim2.new(0.5, -5, 1, 0), Couleurs.CIEL)
	boutonParticiper.Activated:Connect(function()
		demander({ participer = joueur:GetAttribute("Participer") == false })
	end)
	boutonPret = Ui.bouton(actions, "Pret", "", UDim2.new(0.5, -5, 1, 0), Couleurs.ROSE)
	boutonPret.LayoutOrder = 2
	boutonPret.Activated:Connect(function()
		demander({ pret = joueur:GetAttribute("Pret") ~= true })
	end)

	local aide = Ui.texte(
		panneau,
		"Aide",
		"Clavier : ←/→ couloir · ↑/↓ rythme · Espace départ puis sprint · E compétence · C caméra",
		13,
		Couleurs.TEXTE_DOUX,
		Ui.POLICE_TEXTE
	)
	aide.LayoutOrder = 13
	aide.Size = UDim2.new(1, 0, 0, 34)

	for _, attribut in { "Strategie", "Profil", "Robe", "Participer", "Pret" } do
		joueur:GetAttributeChangedSignal(attribut):Connect(rafraichir)
	end
	Etat.ecouter("course", rafraichirCourse)
	Etat.ecouter("phase", function(phase: string)
		panneau.Visible = phase == "lobby"
		if phase == "lobby" then
			rafraichirCourse()
			rafraichir()
		end
	end)
	rafraichir()
end

function Lobby.mettreAJour()
	if panneau and panneau.Visible then
		local reste = math.max(0, math.ceil(Etat.finPhase - Etat.maintenant()))
		compteur.Text = `Départ dans {reste} s`
	end
end

return Lobby
