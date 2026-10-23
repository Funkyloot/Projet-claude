--!strict
-- CarriereCreation — l'écran de création d'une carrière.
--
-- On choisit, dans l'ordre : un nom parmi six proposés (pas de texte libre),
-- une robe qu'on possède, une stratégie, un profil de départ, et jusqu'à
-- deux Légendes comme inspirations. Le serveur revérifie tout.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Peloton = require(Partage:WaitForChild("Course"):WaitForChild("Peloton"))
local Strategies = require(Partage:WaitForChild("Course"):WaitForChild("Strategies"))
local Carriere = require(Partage:WaitForChild("Jeu"):WaitForChild("Carriere"))
local Catalogue = require(Partage:WaitForChild("Jeu"):WaitForChild("Catalogue"))

local Menu = require(script.Parent:WaitForChild("Menu"))
local Notifications = require(script.Parent:WaitForChild("Notifications"))
local Profil = require(script.Parent:WaitForChild("Profil"))
local Requetes = require(script.Parent:WaitForChild("Requetes"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local CarriereCreation = {}

local panneau: Frame
local contenu: ScrollingFrame
local grilleNoms: Frame
local grilleRobes: Frame
local grilleInspirations: Frame
local resumeHeritage: TextLabel
local boutonCommencer: TextButton
local surCreee: () -> () = function() end

local choix = {
	nom = "",
	robe = "",
	strategie = "",
	profil = "",
	inspirations = {} :: { string },
}

-- Les boutons de chaque groupe, pour montrer lequel est choisi
local groupes: { [string]: { [string]: TextButton } } = {}

local function rgb(c: { number }): Color3
	return Color3.fromRGB(c[1], c[2], c[3])
end

local function marquer(groupe: string, choisi: string)
	local boutons = groupes[groupe]
	if not boutons then
		return
	end
	for id, b in boutons do
		local actif = id == choisi
		b.BackgroundColor3 = if actif then Couleurs.ROSE else Couleurs.BLANC
		b.TextColor3 = if actif then Couleurs.BLANC else Couleurs.TEXTE
	end
end

local function rafraichirBouton()
	local pret = choix.nom ~= "" and choix.robe ~= "" and choix.strategie ~= "" and choix.profil ~= ""
	boutonCommencer.BackgroundColor3 = if pret then Couleurs.ROSE else Couleurs.ARGENT
	boutonCommencer.Text = if pret then "Commencer la carrière" else "Choisis tout pour commencer"
end

local function section(titre: string, ordre: number): TextLabel
	local t = Ui.texte(contenu, `Titre{ordre}`, titre, 20, Couleurs.ROSE)
	t.LayoutOrder = ordre
	t.Size = UDim2.new(1, 0, 0, 28)
	t.TextXAlignment = Enum.TextXAlignment.Left
	return t
end

-- Une grille de boutons qui passe à la ligne toute seule.
local function grille(nom: string, ordre: number, largeur: number, hauteur: number): Frame
	local g = Ui.cadre(contenu, nom, UDim2.new(1, -8, 0, 0), UDim2.new(), Couleurs.FOND, 1)
	g.LayoutOrder = ordre
	g.AutomaticSize = Enum.AutomaticSize.Y
	local disposition = Instance.new("UIGridLayout")
	disposition.CellSize = UDim2.fromOffset(largeur, hauteur)
	disposition.CellPadding = UDim2.fromOffset(8, 8)
	disposition.SortOrder = Enum.SortOrder.LayoutOrder
	disposition.Parent = g
	return g
end

local function puce(parent: Instance, groupe: string, id: string, texte: string, ordre: number): TextButton
	local b = Ui.bouton(parent, id, texte, UDim2.fromOffset(100, 44), Couleurs.BLANC, Couleurs.TEXTE)
	b.LayoutOrder = ordre
	b.TextScaled = true
	Ui.contour(b, Couleurs.ROSE_PALE, 2)
	groupes[groupe] = groupes[groupe] or {}
	groupes[groupe][id] = b
	return b
end

local function viderGrille(g: Frame, groupe: string)
	for _, enfant in g:GetChildren() do
		if enfant:IsA("GuiObject") then
			enfant:Destroy()
		end
	end
	groupes[groupe] = {}
end

-- Six noms tirés au hasard parmi ceux de la carrière.
local function proposerNoms()
	viderGrille(grilleNoms, "nom")
	local noms = table.clone(Carriere.NOMS)
	for i = #noms, 2, -1 do
		local j = math.random(1, i)
		noms[i], noms[j] = noms[j], noms[i]
	end
	choix.nom = ""
	for i = 1, 6 do
		local nom = noms[i]
		local b = puce(grilleNoms, "nom", nom, nom, i)
		b.Activated:Connect(function()
			choix.nom = nom
			marquer("nom", nom)
			rafraichirBouton()
		end)
	end
end

local function proposerRobes()
	viderGrille(grilleRobes, "robe")
	local ordre = 0
	for _, robe in Catalogue.deCategorie("robes") do
		if Profil.possede("robes", robe.id) then
			ordre += 1
			local b = puce(grilleRobes, "robe", robe.id, robe.nom, ordre)
			local pastille =
				Ui.cadre(b, "Pastille", UDim2.fromOffset(16, 16), UDim2.new(0, 6, 0.5, -8), rgb(robe.couleur))
			Ui.coins(pastille, 8)
			b.Activated:Connect(function()
				choix.robe = robe.id
				marquer("robe", robe.id)
				rafraichirBouton()
			end)
		end
	end
	local d = Profil.donnees
	if choix.robe == "" and d then
		choix.robe = d.equipement.robe
	end
	marquer("robe", choix.robe)
end

local function rafraichirHeritage()
	local d = Profil.donnees
	if not d or #d.legendes == 0 then
		resumeHeritage.Text = "Pas encore de Légende : termine une carrière pour qu'elle inspire les suivantes."
		return
	end
	local bonus = Carriere.heritage(d.legendes, choix.inspirations)
	local somme = Carriere.total(bonus)
	resumeHeritage.Text = if somme > 0
		then `Bonus d'héritage : +{somme} points au départ (5 % des stats de tes inspirations, {Carriere.HERITAGE_MAX} au plus).`
		else `Choisis jusqu'à {Carriere.MAX_INSPIRATIONS} Légendes : chacune te transmet 5 % de ses stats au départ.`
end

local function proposerInspirations()
	viderGrille(grilleInspirations, "inspiration")
	choix.inspirations = {}
	local d = Profil.donnees
	if d then
		local legendes = table.clone(d.legendes)
		table.sort(legendes, function(a, b)
			return a.note > b.note
		end)
		for i, l in legendes do
			local b = puce(grilleInspirations, "inspiration", l.id, `{l.nom}\n{l.titre} · {l.note}`, i)
			b.Activated:Connect(function()
				local position = table.find(choix.inspirations, l.id)
				if position then
					table.remove(choix.inspirations, position)
				elseif #choix.inspirations < Carriere.MAX_INSPIRATIONS then
					table.insert(choix.inspirations, l.id)
				else
					Notifications.afficher(`{Carriere.MAX_INSPIRATIONS} inspirations au plus.`, "alerte")
				end
				for id, bouton in groupes.inspiration do
					local actif = table.find(choix.inspirations, id) ~= nil
					bouton.BackgroundColor3 = if actif then Couleurs.ROSE else Couleurs.BLANC
					bouton.TextColor3 = if actif then Couleurs.BLANC else Couleurs.TEXTE
				end
				rafraichirHeritage()
			end)
		end
	end
	rafraichirHeritage()
end

local function commencer()
	if choix.nom == "" or choix.robe == "" or choix.strategie == "" or choix.profil == "" then
		Notifications.afficher("Choisis un nom, une robe, une stratégie et un profil.", "alerte")
		return
	end
	boutonCommencer.Active = false
	local reponse = Requetes.envoyer("carriere.creer", {
		nom = choix.nom,
		robe = choix.robe,
		strategie = choix.strategie,
		profil = choix.profil,
		inspirations = choix.inspirations,
	})
	boutonCommencer.Active = true
	if reponse.ok then
		Notifications.afficher(`{choix.nom} entre à l'Académie ! Bonne carrière.`, "gain")
		panneau.Visible = false
		surCreee()
	else
		Notifications.afficher(reponse.erreur or "Impossible de créer la carrière.", "alerte")
	end
end

function CarriereCreation.ouvrir()
	proposerNoms()
	proposerRobes()
	proposerInspirations()
	rafraichirBouton()
	contenu.CanvasPosition = Vector2.zero
	Menu.ouvrir(panneau)
end

function CarriereCreation.creer(gui: ScreenGui, apresCreation: () -> ())
	surCreee = apresCreation
	panneau, contenu = Ui.panneau(gui, "CreationCarriere", "🎓 Nouvelle carrière", UDim2.fromOffset(760, 620))
	local intro = Ui.texte(
		contenu,
		"Intro",
		"Trois années pour former ta coureuse, puis la finale. Chaque course-objectif ratée peut tout arrêter : entraîne-toi bien !",
		15,
		Couleurs.TEXTE_DOUX,
		Ui.POLICE_TEXTE
	)
	intro.LayoutOrder = 0
	intro.Size = UDim2.new(1, 0, 0, 40)

	section("1. Son nom", 1)
	grilleNoms = grille("Noms", 2, 170, 48)
	section("2. Sa robe", 3)
	grilleRobes = grille("Robes", 4, 170, 48)

	section("3. Sa stratégie", 5)
	local grilleStrategies = grille("Strategies", 6, 350, 64)
	for i, id in Strategies.ordre do
		local s = Strategies.obtenir(id)
		local b = puce(grilleStrategies, "strategie", id, `{s.icone} {s.nom} — {s.resume}`, i)
		b.Activated:Connect(function()
			choix.strategie = id
			marquer("strategie", id)
			rafraichirBouton()
		end)
	end

	section("4. Son profil de départ", 7)
	local grilleProfils = grille("Profils", 8, 350, 64)
	for i, p in Peloton.profils do
		local b = puce(grilleProfils, "profil", p.id, `{p.nom} — {p.resume}`, i)
		b.Activated:Connect(function()
			choix.profil = p.id
			marquer("profil", p.id)
			rafraichirBouton()
		end)
	end

	section("5. Ses inspirations (facultatif)", 9)
	resumeHeritage = Ui.texte(contenu, "Heritage", "", 15, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
	resumeHeritage.LayoutOrder = 10
	resumeHeritage.Size = UDim2.new(1, 0, 0, 40)
	resumeHeritage.TextXAlignment = Enum.TextXAlignment.Left
	grilleInspirations = grille("Inspirations", 11, 230, 56)

	boutonCommencer = Ui.bouton(contenu, "Commencer", "", UDim2.new(1, -8, 0, 58), Couleurs.ARGENT)
	boutonCommencer.LayoutOrder = 12
	boutonCommencer.Activated:Connect(commencer)
	local marge = Ui.cadre(contenu, "Marge", UDim2.new(1, 0, 0, 8), UDim2.new(), Couleurs.FOND, 1)
	marge.LayoutOrder = 13
	rafraichirBouton()
end

return CarriereCreation
