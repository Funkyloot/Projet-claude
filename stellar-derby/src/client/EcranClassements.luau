--!strict
-- EcranClassements — les trois classements (victoires, saison, Légendes).
--
-- Le top 10 de chaque classement vient de l'attribut « Classements » de
-- Reseau.monde(), publié par le serveur toutes les minutes ; ta propre
-- valeur vient de ta sauvegarde. On y voit aussi le nom de la saison, le
-- temps qu'il lui reste, et le bandeau du week-end de Grand Prix.

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Classement = require(Partage:WaitForChild("Jeu"):WaitForChild("Classement"))
local Saisons = require(Partage:WaitForChild("Jeu"):WaitForChild("Saisons"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Interactions = require(script.Parent:WaitForChild("Interactions"))
local Menu = require(script.Parent:WaitForChild("Menu"))
local Profil = require(script.Parent:WaitForChild("Profil"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local EcranClassements = {}

local panneau: Frame
local saison: TextLabel
local bandeau: TextLabel
local onglets: { [string]: TextButton } = {}
local lignes: { TextLabel } = {}
local moi: TextLabel
local actif = "victoires"

local function lireTops(): { [string]: { { nom: string, valeur: number } } }
	local brut = Reseau.monde():GetAttribute("Classements")
	if type(brut) ~= "string" or brut == "" then
		return {}
	end
	local ok, donnees = pcall(function()
		return HttpService:JSONDecode(brut)
	end)
	return if ok and type(donnees) == "table" then donnees else {}
end

local function rafraichir()
	if not panneau then
		return
	end
	local monde = Reseau.monde()
	local idSaison = (monde:GetAttribute("Saison") :: string?) or Saisons.id(os.time())
	local nomSaison = (monde:GetAttribute("NomSaison") :: string?) or Saisons.nom(idSaison)
	local reste = Classement.tempsRestant(math.floor(Etat.maintenant()))
	saison.Text = `{nomSaison} · fin dans {Classement.duree(reste)}`
	bandeau.Visible = monde:GetAttribute("Weekend") == true

	for nom, b in onglets do
		local choisi = nom == actif
		b.BackgroundColor3 = if choisi then Couleurs.ROSE else Couleurs.ROSE_PALE
		b.TextColor3 = if choisi then Couleurs.BLANC else Couleurs.TEXTE
	end
	local top = lireTops()[actif] or {}
	for i, etiquette in lignes do
		local l = top[i]
		if l and type(l.nom) == "string" and type(l.valeur) == "number" then
			etiquette.Text = `{Classement.rang(i)}   {l.nom}   ·   {Classement.abreger(l.valeur)}`
			etiquette.TextColor3 = if i == 1 then Couleurs.OR elseif i <= 3 then Couleurs.ROSE else Couleurs.TEXTE
		else
			etiquette.Text = if i == 1 and #top == 0 then "Pas encore de classement : à toi de l'ouvrir !" else ""
			etiquette.TextColor3 = Couleurs.TEXTE_DOUX
		end
	end
	local d = Profil.donnees
	if d then
		local valeur = Classement.valeur(actif, d, idSaison)
		if actif == "saison" then
			moi.Text = `Toi : {valeur} points cette saison`
		elseif actif == "legendes" then
			moi.Text = if valeur > 0 then `Ta meilleure Légende : {valeur}` else "Toi : pas encore de Légende"
		else
			moi.Text = `Toi : {valeur} victoire(s)`
		end
	end
end

function EcranClassements.ouvrir()
	rafraichir()
	Menu.ouvrir(panneau)
end

function EcranClassements.creer(gui: ScreenGui)
	local contenu: ScrollingFrame
	panneau, contenu = Ui.panneau(gui, "Classements", "🏆 Classements", UDim2.fromOffset(640, 600))
	saison = Ui.texte(contenu, "Saison", "", 17, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
	saison.LayoutOrder = 1
	saison.Size = UDim2.new(1, 0, 0, 24)
	bandeau = Ui.texte(
		contenu,
		"Weekend",
		"🏆 Week-end de Grand Prix : une course libre sur trois rapporte double !",
		16,
		Couleurs.BLANC,
		Ui.POLICE_TEXTE
	)
	bandeau.LayoutOrder = 2
	bandeau.Size = UDim2.new(1, -8, 0, 36)
	bandeau.BackgroundTransparency = 0
	bandeau.BackgroundColor3 = Couleurs.ROSE
	Ui.coins(bandeau, 10)
	bandeau.Visible = false

	local rangee = Ui.cadre(contenu, "Onglets", UDim2.new(1, 0, 0, 52), UDim2.new(), Couleurs.FOND, 1)
	rangee.LayoutOrder = 3
	Ui.liste(rangee, Enum.FillDirection.Horizontal, 8, Enum.HorizontalAlignment.Center)
	for i, c in Classement.LISTE do
		local b = Ui.bouton(
			rangee,
			c,
			`{Classement.ICONES[c]} {Classement.NOMS[c]}`,
			UDim2.fromOffset(180, 48),
			Couleurs.ROSE_PALE
		)
		b.LayoutOrder = i
		b.Activated:Connect(function()
			actif = c
			rafraichir()
		end)
		onglets[c] = b
	end
	for i = 1, Classement.TAILLE do
		local t = Ui.texte(contenu, `Ligne{i}`, "", if i <= 3 then 21 else 18, Couleurs.TEXTE)
		t.LayoutOrder = 3 + i
		t.Size = UDim2.new(1, -8, 0, 30)
		t.TextXAlignment = Enum.TextXAlignment.Left
		lignes[i] = t
	end
	moi = Ui.texte(contenu, "Moi", "", 18, Couleurs.ROSE)
	moi.LayoutOrder = 20
	moi.Size = UDim2.new(1, -8, 0, 32)

	Menu.ajouter({
		id = "classements",
		icone = "🏆",
		texte = "Classements",
		ordre = 50,
		ouvrir = EcranClassements.ouvrir,
	})
	Interactions.surAction("classements", function()
		EcranClassements.ouvrir()
	end)
	Reseau.monde():GetAttributeChangedSignal("Classements"):Connect(function()
		if panneau.Visible then
			rafraichir()
		end
	end)
end

function EcranClassements.mettreAJour() end

return EcranClassements
