--!strict
-- Menu — l'interface de l'Académie : la barre du haut (étoiles, niveau,
-- titre) et la rangée de gros boutons vers chaque activité.
--
-- Chaque fonctionnalité y ajoute son bouton et son panneau :
--
--     Menu.ajouter({ id = "boutique", icone = "🛍️", texte = "Boutique",
--                    ordre = 40, ouvrir = function() Menu.ouvrir(monPanneau) end })
--
-- Un seul panneau est ouvert à la fois : Menu.ouvrir(panneau) ferme les
-- autres. Le menu n'est visible qu'à l'Académie (le joueur ne regarde
-- aucune course) ; pendant une course, place au HUD.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Profil = require(script.Parent:WaitForChild("Profil"))
local Requetes = require(script.Parent:WaitForChild("Requetes"))
local Ui = require(script.Parent:WaitForChild("Ui"))

export type Bouton = {
	id: string,
	icone: string,
	texte: string,
	ordre: number,
	ouvrir: () -> (),
}

local Menu = {}

local gui: ScreenGui
local barre: Frame
local rangee: Frame
local etoiles: TextLabel
local niveau: TextLabel
local jaugeXp: Frame
local titre: TextLabel
local panneaux: { Frame } = {}
local panneauReglages: Frame
local masques = 0 -- nombre de raisons de cacher le menu (mini-jeu en cours…)

-- L'écran où les fonctionnalités posent leurs panneaux.
function Menu.ecran(): ScreenGui
	return gui
end

-- Ferme tous les panneaux du menu.
function Menu.fermer()
	for _, p in panneaux do
		p.Visible = false
	end
end

-- Ouvre un panneau (et ferme les autres).
function Menu.ouvrir(panneau: Frame)
	local connu = table.find(panneaux, panneau) ~= nil
	if not connu then
		table.insert(panneaux, panneau)
	end
	for _, p in panneaux do
		p.Visible = p == panneau
	end
end

-- Cache le menu le temps d'une activité plein écran (un mini-jeu…) ;
-- appeler la fonction renvoyée pour le rendre.
function Menu.masquer(): () -> ()
	masques += 1
	local rendu = false
	return function()
		if not rendu then
			rendu = true
			masques -= 1
		end
	end
end

function Menu.ajouter(b: Bouton)
	local bouton = Ui.bouton(rangee, b.id, "", UDim2.fromOffset(96, 96), Couleurs.FOND, Couleurs.TEXTE)
	bouton.LayoutOrder = b.ordre
	Ui.contour(bouton, Couleurs.ROSE_PALE, 2)
	local icone = Ui.texte(bouton, "Icone", b.icone, 34, Couleurs.TEXTE)
	icone.Position = UDim2.fromOffset(0, 8)
	icone.Size = UDim2.new(1, 0, 0, 42)
	local libelle = Ui.texte(bouton, "Libelle", b.texte, 15, Couleurs.TEXTE)
	libelle.Position = UDim2.new(0, 4, 1, -36)
	libelle.Size = UDim2.new(1, -8, 0, 30)
	bouton.Activated:Connect(b.ouvrir)
end

local function rafraichirProfil()
	local d = Profil.donnees
	if not d then
		return
	end
	etoiles.Text = `★ {d.etoiles}`
	local n, dans, besoin = Profil.niveau()
	niveau.Text = `Niv. {n}`
	jaugeXp.Size = UDim2.fromScale(if besoin > 0 then math.clamp(dans / besoin, 0, 1) else 1, 1)
	titre.Text = if d.equipement.titre ~= "" then `« {d.equipement.titre} »` else ""
end

local function creerReglages()
	local panneau, contenu = Ui.panneau(gui, "Reglages", "Réglages", UDim2.fromOffset(460, 360))
	panneauReglages = panneau
	local function curseur(nom: string, libelle: string, cle: string, ordre: number)
		local ligne = Ui.cadre(contenu, nom, UDim2.new(1, 0, 0, 52), UDim2.new(), Couleurs.FOND, 1)
		ligne.LayoutOrder = ordre
		local t = Ui.texte(ligne, "Libelle", libelle, 18, Couleurs.TEXTE)
		t.Size = UDim2.new(0.45, 0, 1, 0)
		t.TextXAlignment = Enum.TextXAlignment.Left
		local valeurs = { 0, 0.25, 0.5, 0.75, 1 }
		for i, v in valeurs do
			local b = Ui.bouton(
				ligne,
				`V{i}`,
				if v == 0 then "🔇" else tostring(math.floor(v * 100)),
				UDim2.fromOffset(44, 40),
				Couleurs.ROSE_PALE,
				Couleurs.TEXTE
			)
			b.Position = UDim2.new(0.45, (i - 1) * 48, 0, 6)
			b.Activated:Connect(function()
				Requetes.envoyer("profil.reglages", { [cle] = v })
			end)
		end
	end
	curseur("Musique", "Musique", "musique", 1)
	curseur("Sons", "Sons", "sons", 2)
	local cine =
		Ui.bouton(contenu, "Cinematiques", "Cinématiques de compétence : oui", UDim2.new(1, 0, 0, 48), Couleurs.CIEL)
	cine.LayoutOrder = 3
	cine.Activated:Connect(function()
		local d = Profil.donnees
		Requetes.envoyer("profil.reglages", { cinematiques = not (d and d.reglages.cinematiques) })
	end)
	Profil.ecouter(function(d)
		cine.Text = `Cinématiques de compétence : {if d.reglages.cinematiques then "oui" else "non"}`
	end)
end

function Menu.creer(parent: ScreenGui)
	gui = parent

	-- La barre du haut
	barre = Ui.cadre(parent, "BarreAcademie", UDim2.fromOffset(470, 58), UDim2.new(0.5, 0, 0, 10), Couleurs.FOND, 0.08)
	barre.AnchorPoint = Vector2.new(0.5, 0)
	Ui.coins(barre, 18)
	Ui.contour(barre, Couleurs.ROSE_PALE, 2)
	etoiles = Ui.texte(barre, "Etoiles", "★ 0", 24, Couleurs.OR)
	etoiles.Position = UDim2.fromOffset(16, 0)
	etoiles.Size = UDim2.new(0, 130, 1, 0)
	etoiles.TextXAlignment = Enum.TextXAlignment.Left
	niveau = Ui.texte(barre, "Niveau", "Niv. 1", 22, Couleurs.TEXTE)
	niveau.Position = UDim2.fromOffset(150, 4)
	niveau.Size = UDim2.new(0, 90, 0, 28)
	local fondJauge = Ui.cadre(barre, "Xp", UDim2.fromOffset(90, 8), UDim2.fromOffset(150, 38), Couleurs.ROSE_PALE)
	Ui.coins(fondJauge, 4)
	jaugeXp = Ui.cadre(fondJauge, "Jauge", UDim2.fromScale(0, 1), UDim2.new(), Couleurs.ROSE)
	Ui.coins(jaugeXp, 4)
	titre = Ui.texte(barre, "Titre", "", 15, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
	titre.Position = UDim2.fromOffset(250, 0)
	titre.Size = UDim2.new(1, -310, 1, 0)
	local reglages =
		Ui.bouton(barre, "Reglages", "⚙️", UDim2.fromOffset(44, 44), Couleurs.ROSE_PALE, Couleurs.TEXTE)
	reglages.AnchorPoint = Vector2.new(1, 0.5)
	reglages.Position = UDim2.new(1, -8, 0.5, 0)
	reglages.Activated:Connect(function()
		Menu.ouvrir(panneauReglages)
	end)

	-- La rangée de boutons, en bas, sous les pouces
	rangee = Ui.cadre(parent, "BoutonsAcademie", UDim2.fromOffset(0, 100), UDim2.new(0.5, 0, 1, -14), Couleurs.FOND, 1)
	rangee.AnchorPoint = Vector2.new(0.5, 1)
	rangee.AutomaticSize = Enum.AutomaticSize.X
	Ui.liste(rangee, Enum.FillDirection.Horizontal, 10, Enum.HorizontalAlignment.Center)

	creerReglages()
	table.insert(panneaux, panneauReglages)
	Profil.ecouter(rafraichirProfil)
	Etat.ecouter("phase", function()
		if Etat.regarde() then
			Menu.fermer()
		end
	end)
end

function Menu.mettreAJour()
	if not barre then
		return
	end
	local visible = not Etat.regarde() and masques == 0
	barre.Visible = visible or (Etat.regarde() and Etat.phase == "lobby")
	rangee.Visible = visible
end

return Menu
