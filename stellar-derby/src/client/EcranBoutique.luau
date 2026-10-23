--!strict
-- EcranBoutique — la boutique et la garde-robe.
--
-- Un onglet par catégorie du catalogue (robes, tenues, bâtons lumineux,
-- effets de compétence), plus les packs d'étoiles s'il y en a en vente.
-- Chaque objet montre sa couleur, son nom, sa description, son prix (ou
-- « Possédé » / « Porté »), le niveau requis, et un bouton pour l'acheter ou
-- le porter. Un achat de plus de 500 étoiles demande une confirmation.
--
-- Ce ne sont que des cosmétiques : rien ici ne fait courir plus vite.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Boutique = require(Partage:WaitForChild("Jeu"):WaitForChild("Boutique"))
local Catalogue = require(Partage:WaitForChild("Jeu"):WaitForChild("Catalogue"))

local Interactions = require(script.Parent:WaitForChild("Interactions"))
local Menu = require(script.Parent:WaitForChild("Menu"))
local Notifications = require(script.Parent:WaitForChild("Notifications"))
local Profil = require(script.Parent:WaitForChild("Profil"))
local Requetes = require(script.Parent:WaitForChild("Requetes"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local EcranBoutique = {}

type Fiche = {
	objet: Catalogue.Objet,
	etat: TextLabel,
	bouton: TextButton,
}

local panneau: Frame
local solde: TextLabel
local onglets: { [string]: TextButton } = {}
local pages: { [string]: Frame } = {}
local fiches: { Fiche } = {}
local ongletActif = "robes"
local confirmation: { categorie: string, id: string, jusqua: number }? = nil

local function rgb(c: { number }): Color3
	return Color3.fromRGB(c[1], c[2], c[3])
end

local function montrerOnglet(id: string)
	ongletActif = id
	for nom, b in onglets do
		local actif = nom == id
		b.BackgroundColor3 = if actif then Couleurs.ROSE else Couleurs.ROSE_PALE
		b.TextColor3 = if actif then Couleurs.BLANC else Couleurs.TEXTE
	end
	for nom, page in pages do
		page.Visible = nom == id
	end
end

local function rafraichir()
	local d = Profil.donnees
	if not d or not panneau then
		return
	end
	solde.Text = `★ {d.etoiles}`
	local niveau = Profil.niveau()
	for _, f in fiches do
		local o = f.objet
		local possede = Profil.possede(o.categorie, o.id)
		local porte = (d.equipement :: any)[Boutique.EQUIPEMENT[o.categorie]] == o.id
		if porte then
			f.etat.Text = "Porté"
			f.bouton.Text = "Porté ✓"
			f.bouton.BackgroundColor3 = Couleurs.ARGENT
		elseif possede then
			f.etat.Text = "Possédé"
			f.bouton.Text = "Porter"
			f.bouton.BackgroundColor3 = Couleurs.CIEL
		else
			local bloque = niveau < o.niveau
			f.etat.Text = if bloque then `★ {o.prix} · niveau {o.niveau} requis` else `★ {o.prix}`
			f.bouton.Text = if bloque then `Niv. {o.niveau}` else "Acheter"
			f.bouton.BackgroundColor3 = if bloque or d.etoiles < o.prix then Couleurs.ARGENT else Couleurs.ROSE
		end
	end
end

local function agir(f: Fiche)
	local o = f.objet
	local d = Profil.donnees
	if not d then
		return
	end
	if Profil.possede(o.categorie, o.id) then
		local reponse = Requetes.envoyer("boutique.equiper", { categorie = o.categorie, id = o.id })
		if not reponse.ok then
			Notifications.afficher(reponse.erreur or "Impossible de le porter.", "alerte")
		end
		return
	end
	-- Une confirmation pour les gros achats : un second appui dans les 4 s
	if o.prix > Boutique.SEUIL_CONFIRMATION then
		local c = confirmation
		if not c or c.categorie ~= o.categorie or c.id ~= o.id or os.clock() > c.jusqua then
			confirmation = { categorie = o.categorie, id = o.id, jusqua = os.clock() + 4 }
			f.bouton.Text = "Confirmer ?"
			f.bouton.BackgroundColor3 = Couleurs.OR
			task.delay(4, rafraichir)
			return
		end
	end
	confirmation = nil
	local reponse = Requetes.envoyer("boutique.acheter", { categorie = o.categorie, id = o.id })
	if not reponse.ok then
		Notifications.afficher(reponse.erreur or "Achat impossible.", "alerte")
	end
end

local function pastille(parent: Instance, o: Catalogue.Objet)
	local p = Ui.cadre(parent, "Pastille", UDim2.fromOffset(56, 56), UDim2.new(0, 0, 0.5, -28), rgb(o.couleur))
	Ui.coins(p, 28)
	Ui.contour(p, Couleurs.ROSE_PALE, 2)
	local deuxieme = o.couleur2
	if deuxieme then
		local moitie = Ui.cadre(p, "Seconde", UDim2.fromOffset(28, 28), UDim2.fromOffset(28, 28), rgb(deuxieme))
		Ui.coins(moitie, 14)
	end
end

local function creerPage(parent: Instance, categorie: string)
	local page = Instance.new("ScrollingFrame")
	page.Name = categorie
	page.BackgroundTransparency = 1
	page.BorderSizePixel = 0
	page.Size = UDim2.new(1, 0, 1, -64)
	page.Position = UDim2.fromOffset(0, 64)
	page.CanvasSize = UDim2.new()
	page.AutomaticCanvasSize = Enum.AutomaticSize.Y
	page.ScrollingDirection = Enum.ScrollingDirection.Y
	page.ScrollBarThickness = 6
	page.Visible = false
	page.Parent = parent
	local liste = Instance.new("UIListLayout")
	liste.Padding = UDim.new(0, 8)
	liste.SortOrder = Enum.SortOrder.LayoutOrder
	liste.Parent = page
	pages[categorie] = page :: any
	for i, o in Catalogue.deCategorie(categorie) do
		local carte = Ui.cadre(page, o.id, UDim2.new(1, -10, 0, 84), UDim2.new(), Couleurs.BLANC)
		carte.LayoutOrder = i
		Ui.coins(carte, 14)
		Ui.contour(carte, Couleurs.ROSE_PALE, 2)
		Ui.marges(carte, 10)
		pastille(carte, o)
		local nom = Ui.texte(carte, "Nom", o.nom, 19, Couleurs.TEXTE)
		nom.Position = UDim2.fromOffset(68, 0)
		nom.Size = UDim2.new(1, -240, 0, 24)
		nom.TextXAlignment = Enum.TextXAlignment.Left
		local description = Ui.texte(carte, "Description", o.description, 14, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
		description.Position = UDim2.fromOffset(68, 24)
		description.Size = UDim2.new(1, -240, 0, 20)
		description.TextXAlignment = Enum.TextXAlignment.Left
		local etat = Ui.texte(carte, "Etat", "", 15, Couleurs.OR, Ui.POLICE_TEXTE)
		etat.Position = UDim2.fromOffset(68, 44)
		etat.Size = UDim2.new(1, -240, 0, 20)
		etat.TextXAlignment = Enum.TextXAlignment.Left
		local bouton = Ui.bouton(carte, "Action", "", UDim2.fromOffset(150, 50), Couleurs.ROSE)
		bouton.AnchorPoint = Vector2.new(1, 0.5)
		bouton.Position = UDim2.new(1, 0, 0.5, 0)
		local f: Fiche = { objet = o, etat = etat, bouton = bouton }
		bouton.Activated:Connect(function()
			agir(f)
		end)
		table.insert(fiches, f)
	end
end

local function creerPacks(parent: Instance)
	local page = Ui.cadre(parent, "packs", UDim2.new(1, 0, 1, -64), UDim2.fromOffset(0, 64), Couleurs.FOND, 1)
	page.Visible = false
	Ui.liste(page, Enum.FillDirection.Vertical, 8, Enum.HorizontalAlignment.Center)
	pages.packs = page
	local note = Ui.texte(
		page,
		"Note",
		"Les étoiles ne servent qu'aux cosmétiques : elles ne font jamais courir plus vite.",
		15,
		Couleurs.TEXTE_DOUX,
		Ui.POLICE_TEXTE
	)
	note.Size = UDim2.new(1, 0, 0, 30)
	for i, p in Boutique.PACKS do
		if p.produit ~= 0 then
			local b = Ui.bouton(page, p.id, `{p.nom} · ★ {p.etoiles}`, UDim2.new(1, -20, 0, 60), Couleurs.OR)
			b.LayoutOrder = i
			b.Activated:Connect(function()
				local reponse = Requetes.envoyer("boutique.pack", { id = p.id })
				if not reponse.ok then
					Notifications.afficher(reponse.erreur or "Indisponible.", "alerte")
				end
			end)
		end
	end
end

function EcranBoutique.ouvrir()
	rafraichir()
	montrerOnglet(ongletActif)
	Menu.ouvrir(panneau)
end

function EcranBoutique.creer(gui: ScreenGui)
	local contenu: ScrollingFrame
	panneau, contenu = Ui.panneau(gui, "Boutique", "🛍️ Boutique", UDim2.fromOffset(760, 600))
	-- Le contenu par défaut défile : ici, chaque page défile seule
	contenu.ScrollingEnabled = false
	local entete = Ui.cadre(contenu, "Entete", UDim2.new(1, 0, 0, 56), UDim2.new(), Couleurs.FOND, 1)
	Ui.liste(entete, Enum.FillDirection.Horizontal, 6, Enum.HorizontalAlignment.Left)
	local categories = table.clone(Catalogue.CATEGORIES)
	if Boutique.packsEnVente() then
		table.insert(categories, "packs")
	end
	for i, categorie in categories do
		local nom = if categorie == "packs" then "Étoiles" else Catalogue.NOMS_CATEGORIES[categorie]
		local b = Ui.bouton(entete, categorie, nom, UDim2.fromOffset(130, 48), Couleurs.ROSE_PALE, Couleurs.TEXTE)
		b.LayoutOrder = i
		b.Activated:Connect(function()
			montrerOnglet(categorie)
		end)
		onglets[categorie] = b
	end
	solde = Ui.texte(entete, "Solde", "★ 0", 24, Couleurs.OR)
	solde.LayoutOrder = 99
	solde.Size = UDim2.fromOffset(150, 48)
	solde.TextXAlignment = Enum.TextXAlignment.Right

	-- Les pages occupent toute la place sous les onglets
	local zone = Ui.cadre(contenu, "Pages", UDim2.new(1, 0, 0, 452), UDim2.new(), Couleurs.FOND, 1)
	zone.LayoutOrder = 2
	for _, categorie in Catalogue.CATEGORIES do
		creerPage(zone, categorie)
	end
	if Boutique.packsEnVente() then
		creerPacks(zone)
	end
	for _, page in pages do
		page.Position = UDim2.new()
		page.Size = UDim2.fromScale(1, 1)
	end

	Profil.ecouter(rafraichir)
	Menu.ajouter({ id = "boutique", icone = "🛍️", texte = "Boutique", ordre = 40, ouvrir = EcranBoutique.ouvrir })
	Interactions.surAction("boutique", function()
		EcranBoutique.ouvrir()
	end)
	montrerOnglet("robes")
end

function EcranBoutique.mettreAJour() end

return EcranBoutique
