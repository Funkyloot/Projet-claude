--!strict
-- EcranProfil — le profil : niveau, statistiques, titres, rivales, Légendes
-- et saison.
--
-- Tout se lit dans la sauvegarde (Profil.donnees) ; le seul geste possible
-- ici est de choisir le titre affiché sous son nom (requête profil.titre).
-- Le panneau se reconstruit à chaque ouverture et à chaque mise à jour du
-- profil pendant qu'il est ouvert.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Courses = require(Partage:WaitForChild("Course"):WaitForChild("Courses"))
local Pistes = require(Partage:WaitForChild("Course"):WaitForChild("Pistes"))
local Strategies = require(Partage:WaitForChild("Course"):WaitForChild("Strategies"))
local Saisons = require(Partage:WaitForChild("Jeu"):WaitForChild("Saisons"))
local Titres = require(Partage:WaitForChild("Jeu"):WaitForChild("Titres"))

local Menu = require(script.Parent:WaitForChild("Menu"))
local Notifications = require(script.Parent:WaitForChild("Notifications"))
local Profil = require(script.Parent:WaitForChild("Profil"))
local Requetes = require(script.Parent:WaitForChild("Requetes"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local EcranProfil = {}

local panneau: Frame
local contenu: ScrollingFrame
local ordre = 0

local function suivant(): number
	ordre += 1
	return ordre
end

local function section(titre: string)
	local t = Ui.texte(contenu, "Section", titre, 21, Couleurs.ROSE)
	t.LayoutOrder = suivant()
	t.Size = UDim2.new(1, 0, 0, 30)
	t.TextXAlignment = Enum.TextXAlignment.Left
end

local function ligne(texte: string, couleur: Color3?, taille: number?)
	local t = Ui.texte(contenu, "Ligne", texte, taille or 16, couleur or Couleurs.TEXTE, Ui.POLICE_TEXTE)
	t.LayoutOrder = suivant()
	t.Size = UDim2.new(1, -8, 0, 0)
	t.AutomaticSize = Enum.AutomaticSize.Y
	t.TextXAlignment = Enum.TextXAlignment.Left
end

local function vider()
	for _, enfant in contenu:GetChildren() do
		if enfant:IsA("GuiObject") then
			enfant:Destroy()
		end
	end
	ordre = 0
end

local function carteTitre(titre: Titres.Titre, gagne: boolean, affiche: boolean)
	local carte =
		Ui.cadre(contenu, titre.id, UDim2.new(1, -8, 0, 62), UDim2.new(), Couleurs.BLANC, if gagne then 0 else 0.5)
	carte.LayoutOrder = suivant()
	Ui.coins(carte, 12)
	Ui.contour(carte, if affiche then Couleurs.OR else Couleurs.ROSE_PALE, 2)
	Ui.marges(carte, 8)
	local nom = Ui.texte(carte, "Nom", titre.nom, 17, if gagne then Couleurs.TEXTE else Couleurs.TEXTE_DOUX)
	nom.Size = UDim2.new(1, -150, 0, 22)
	nom.TextXAlignment = Enum.TextXAlignment.Left
	local description = Ui.texte(carte, "Description", titre.description, 14, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
	description.Position = UDim2.fromOffset(0, 24)
	description.Size = UDim2.new(1, -150, 0, 20)
	description.TextXAlignment = Enum.TextXAlignment.Left
	if gagne then
		local b = Ui.bouton(
			carte,
			"Afficher",
			if affiche then "Affiché ✓" else "Afficher",
			UDim2.fromOffset(130, 44),
			if affiche then Couleurs.ARGENT else Couleurs.ROSE
		)
		b.AnchorPoint = Vector2.new(1, 0.5)
		b.Position = UDim2.new(1, 0, 0.5, 0)
		b.Activated:Connect(function()
			local reponse = Requetes.envoyer("profil.titre", { id = if affiche then "" else titre.id })
			if not reponse.ok then
				Notifications.afficher(reponse.erreur or "Impossible.", "alerte")
			end
		end)
	end
end

local function remplir()
	local d = Profil.donnees
	if not d then
		return
	end
	vider()
	local n, dans, besoin = Profil.niveau()
	local s = d.stats

	section("Entraîneuse")
	ligne(`Niveau {n} · {dans} / {besoin} XP vers le suivant · ★ {d.etoiles}`, Couleurs.TEXTE, 18)
	local saison = if d.saison.id ~= "" then Saisons.nom(d.saison.id) else "Pas encore de course cette saison"
	ligne(`{saison} · {d.saison.points} points`)

	section("Courses")
	ligne(
		`{s.courses} courses · {s.victoires} victoires · {s.podiums} podiums · {s.photoFinish} photo-finish gagné(s)`
	)
	for _, id in Strategies.ordre do
		local st = Strategies.obtenir(id)
		local p = s.parStrategie[id]
		if p and p.courses > 0 then
			ligne(`{st.icone} {st.nom} : {p.victoires} victoire(s) sur {p.courses} course(s)`, Couleurs.TEXTE_DOUX)
		end
	end
	local temps: { string } = {}
	for _, course in Courses.liste do
		local t = s.meilleursTemps[course.id]
		if t then
			local piste = Pistes.parId(course.piste)
			table.insert(temps, `{course.nom} ({piste and piste.nom or course.piste}) : {Ui.chrono(t)}`)
		end
	end
	if #temps > 0 then
		ligne("Meilleurs temps en course libre :", Couleurs.TEXTE, 16)
		ligne(table.concat(temps, "\n"), Couleurs.TEXTE_DOUX, 15)
	end
	ligne(
		`{s.entrainements} entraînements · {s.concerts} concerts (dont {s.concertsMeneuse} sur scène) · {s.carrieres} carrière(s) · {s.duos} duo(s)`,
		Couleurs.TEXTE_DOUX
	)

	section("Titres")
	local gagnes, aGagner = {}, {}
	for _, t in Titres.liste do
		if d.titres[t.id] then
			table.insert(gagnes, t)
		else
			table.insert(aGagner, t)
		end
	end
	if #gagnes == 0 then
		ligne("Aucun titre pour l'instant : cours, entraîne-toi, chante !", Couleurs.TEXTE_DOUX)
	end
	for _, t in gagnes do
		carteTitre(t, true, d.equipement.titre == t.id)
	end
	for _, t in aGagner do
		carteTitre(t, false, false)
	end

	section("Rivales")
	if #d.rivales == 0 then
		ligne("Pas encore de rivale. Une coureuse qui te bat d'une encolure le devient…", Couleurs.TEXTE_DOUX)
	end
	for _, r in d.rivales do
		ligne(`{r.nom} : t'a battue {r.fois} fois · tu l'as battue {r.battue} fois depuis`)
	end

	section("Légendes")
	if #d.legendes == 0 then
		ligne("Termine une carrière : ta coureuse deviendra une Légende.", Couleurs.TEXTE_DOUX)
	end
	local legendes = table.clone(d.legendes)
	table.sort(legendes, function(a, b)
		return a.note > b.note
	end)
	for _, l in legendes do
		ligne(`⭐ {l.nom} — « {l.titre} » · note {l.note}`)
	end
	local marge = Ui.cadre(contenu, "Marge", UDim2.new(1, 0, 0, 10), UDim2.new(), Couleurs.FOND, 1)
	marge.LayoutOrder = suivant()
end

function EcranProfil.ouvrir()
	remplir()
	contenu.CanvasPosition = Vector2.zero
	Menu.ouvrir(panneau)
end

function EcranProfil.creer(gui: ScreenGui)
	panneau, contenu = Ui.panneau(gui, "Profil", "👤 Profil", UDim2.fromOffset(720, 600))
	Menu.ajouter({ id = "profil", icone = "👤", texte = "Profil", ordre = 60, ouvrir = EcranProfil.ouvrir })
	Profil.ecouter(function()
		if panneau.Visible then
			remplir()
		end
	end)
end

function EcranProfil.mettreAJour() end

return EcranProfil
