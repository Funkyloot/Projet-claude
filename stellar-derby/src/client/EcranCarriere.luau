--!strict
-- EcranCarriere — la carrière vue par le joueur.
--
-- On y arrive par le bouton « Carrière » du menu ou par le Bureau des
-- carrières de l'Académie (invite « carriere »).
--   - Sans carrière : l'écran de création (CarriereCreation).
--   - Avec une carrière : le tableau de bord — stats, énergie, humeur,
--     prochain objectif, journal — et les actions du tour. S'entraîner joue
--     le mini-jeu de la stat (EcranEntrainement.jouer(stat, "carriere")).
--   - Une carte d'événement s'affiche par-dessus quand il faut choisir.
--   - Quand la carrière se termine : l'écran de fin (la Légende).
--   - La liste des Légendes se consulte à tout moment.
--
-- Tout l'affichage se lit dans la sauvegarde (Profil.donnees.carriere) avec
-- les règles de Jeu/Carriere : l'écran montre toujours l'état réel.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Courses = require(Partage:WaitForChild("Course"):WaitForChild("Courses"))
local Competences = require(Partage:WaitForChild("Course"):WaitForChild("Competences"))
local Pistes = require(Partage:WaitForChild("Course"):WaitForChild("Pistes"))
local Strategies = require(Partage:WaitForChild("Course"):WaitForChild("Strategies"))
local Carriere = require(Partage:WaitForChild("Jeu"):WaitForChild("Carriere"))
local Entrainement = require(Partage:WaitForChild("Jeu"):WaitForChild("Entrainement"))
local Evenements = require(Partage:WaitForChild("Jeu"):WaitForChild("Evenements"))

local CarriereCreation = require(script.Parent:WaitForChild("CarriereCreation"))
local EcranEntrainement = require(script.Parent:WaitForChild("EcranEntrainement"))
local Etat = require(script.Parent:WaitForChild("Etat"))
local Interactions = require(script.Parent:WaitForChild("Interactions"))
local Menu = require(script.Parent:WaitForChild("Menu"))
local Notifications = require(script.Parent:WaitForChild("Notifications"))
local Profil = require(script.Parent:WaitForChild("Profil"))
local Requetes = require(script.Parent:WaitForChild("Requetes"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local EcranCarriere = {}

local MAX_AFFICHE = 1200 -- les barres de stats vont jusque-là

local panneau: Frame
local entete: TextLabel
local sousTitre: TextLabel
local barres: { [string]: { jauge: Frame, valeur: TextLabel } } = {}
local jaugeEnergie: Frame
local texteEnergie: TextLabel
local texteHumeur: TextLabel
local texteObjectif: TextLabel
local texteJournal: TextLabel
local rangeeActions: Frame
local rangeeStats: Frame
local boutonsStats: { [string]: TextButton } = {}
local boutonCourir: TextButton
local boutonAbandon: TextButton

local carte: Frame
local carteTitre: TextLabel
local carteTexte: TextLabel
local boutonsChoix: { TextButton } = {}

local panneauFin: Frame
local finTitre: TextLabel
local finTexte: TextLabel

local panneauLegendes: Frame
local listeLegendes: ScrollingFrame

local occupe = false -- une requête ou un mini-jeu est en cours
local confirmationAbandon = 0

local NOMS_COMPETENCES: { [string]: string } = {}
for id, c in Competences.parId do
	NOMS_COMPETENCES[id] = c.nom
end

local function carriereActuelle(): Carriere.Carriere?
	local d = Profil.donnees
	return d and Carriere.nettoyer(d.carriere)
end

-- ─────────────────────────────── Tableau de bord ───────────────────────────────

local function texteObjectifDe(c: Carriere.Carriere): string
	local o = Carriere.prochainObjectif(c)
	if not o then
		return ""
	end
	local course = Courses.parId(o.course)
	if not course then
		return ""
	end
	local piste = Pistes.parId(course.piste)
	local quand = if o.tour == c.tour
		then "C'est aujourd'hui !"
		else `dans {o.tour - c.tour} tour{if o.tour - c.tour > 1 then "s" else ""}`
	return `🎯 {course.nom} ({course.categorie} {course.distance} m, {piste and piste.nom or course.piste}) · {Carriere.libellePlace(
		o.place
	)} · {quand}`
end

local function montrerCarte(c: Carriere.Carriere)
	local e = Evenements.parId(c.evenement)
	if not e then
		carte.Visible = false
		return
	end
	carteTitre.Text = e.titre
	carteTexte.Text = Evenements.texte(e, c.nom, c.rivale.nom)
	for i, b in boutonsChoix do
		local choix = e.choix[i]
		b.Visible = choix ~= nil
		if choix then
			b.Text = `{choix.texte}\n{Evenements.resume(choix.effets, NOMS_COMPETENCES)}`
		end
	end
	carte.Visible = true
end

local function rafraichir()
	local c = carriereActuelle()
	if not panneau or not c then
		return
	end
	local strategie = Strategies.obtenir(c.strategie)
	entete.Text = `{c.nom} · {Carriere.libelleTour(c.tour)}`
	local competences: { string } = { NOMS_COMPETENCES[strategie.signature] or strategie.signature }
	for _, id in c.competences do
		table.insert(competences, NOMS_COMPETENCES[id] or id)
	end
	sousTitre.Text = `{strategie.icone} {strategie.nom} · Rivale : {c.rivale.nom} · Compétences : {table.concat(
		competences,
		", "
	)}{if c.joker then " · 🍀 Repêchage disponible" else ""}`
	for stat, b in barres do
		local v = (c.stats :: any)[stat] :: number
		b.jauge.Size = UDim2.fromScale(math.clamp(v / MAX_AFFICHE, 0, 1), 1)
		b.valeur.Text = tostring(v)
	end
	jaugeEnergie.Size = UDim2.fromScale(c.energie / 100, 1)
	jaugeEnergie.BackgroundColor3 = if c.energie < Carriere.SEUIL_BLESSURE
		then Couleurs.ENDURANCE_BASSE
		else Couleurs.ENDURANCE_PLEINE
	texteEnergie.Text =
		`Énergie {c.energie} / 100{if c.energie < Carriere.SEUIL_BLESSURE then " — risque de blessure !" else ""}`
	texteHumeur.Text = `Humeur : {Carriere.ICONES_HUMEUR[c.humeur]} {Carriere.nomHumeur(c.humeur)}`
	texteObjectif.Text = texteObjectifDe(c)
	texteJournal.Text = table.concat(c.journal, "\n")
	local attente = Carriere.attente(c)
	rangeeActions.Visible = attente == "action"
	boutonCourir.Visible = attente == "course"
	if attente ~= "action" then
		rangeeStats.Visible = false
	end
	-- Ce que rapporterait un bon entraînement, pour aider à choisir
	for stat, b in boutonsStats do
		local gain = Entrainement.gain(stat, 0.75, c.humeur, c.energie)
		b.Text = `{Evenements.NOMS_STATS[stat]}\n≈ +{gain}`
	end
	montrerCarte(c)
end

-- ─────────────────────────────── Actions ───────────────────────────────

local function afficherBilan(reponse: { [string]: any })
	local bilan = reponse.bilan or reponse
	if type(bilan) == "table" and type(bilan.messages) == "table" then
		for _, m in bilan.messages do
			if type(m) == "string" then
				Notifications.afficher(m, "info")
			end
		end
	end
end

local function envoyer(nom: string, args: any?)
	if occupe then
		return
	end
	occupe = true
	local reponse = Requetes.envoyer(nom, args)
	occupe = false
	if reponse.ok then
		afficherBilan(reponse)
	else
		Notifications.afficher(reponse.erreur or "Impossible pour l'instant.", "alerte")
	end
end

local function entrainer(stat: string)
	if occupe then
		return
	end
	occupe = true
	rangeeStats.Visible = false
	EcranEntrainement.jouer(stat, "carriere")
	occupe = false
	EcranCarriere.ouvrir()
end

local function courir()
	if occupe then
		return
	end
	occupe = true
	local reponse = Requetes.envoyer("carriere.courir")
	occupe = false
	if reponse.ok then
		Menu.fermer()
	else
		Notifications.afficher(reponse.erreur or "Impossible de lancer la course.", "alerte")
	end
end

local function abandonner()
	local maintenant = os.clock()
	if maintenant - confirmationAbandon > 4 then
		confirmationAbandon = maintenant
		boutonAbandon.Text = "Sûre ? Touche encore"
		task.delay(4, function()
			boutonAbandon.Text = "Abandonner"
		end)
		return
	end
	confirmationAbandon = 0
	boutonAbandon.Text = "Abandonner"
	envoyer("carriere.abandonner")
	panneau.Visible = false
end

-- ─────────────────────────────── Construction ───────────────────────────────

local function ligneTexte(parent: Instance, nom: string, taille: number, couleur: Color3, ordre: number): TextLabel
	local t = Ui.texte(parent, nom, "", taille, couleur, Ui.POLICE_TEXTE)
	t.LayoutOrder = ordre
	t.TextXAlignment = Enum.TextXAlignment.Left
	return t
end

local function creerTableau(gui: ScreenGui)
	local contenu: ScrollingFrame
	panneau, contenu = Ui.panneau(gui, "Carriere", "🎓 Carrière", UDim2.fromOffset(780, 640))
	entete = Ui.texte(contenu, "Entete", "", 24, Couleurs.TEXTE)
	entete.LayoutOrder = 1
	entete.Size = UDim2.new(1, 0, 0, 30)
	entete.TextXAlignment = Enum.TextXAlignment.Left
	sousTitre = ligneTexte(contenu, "SousTitre", 14, Couleurs.TEXTE_DOUX, 2)
	sousTitre.Size = UDim2.new(1, 0, 0, 36)

	-- Les cinq stats
	local cadreStats = Ui.cadre(contenu, "Stats", UDim2.new(1, -8, 0, 5 * 30), UDim2.new(), Couleurs.FOND, 1)
	cadreStats.LayoutOrder = 3
	for i, stat in Carriere.STATS do
		local ligne =
			Ui.cadre(cadreStats, stat, UDim2.new(1, 0, 0, 26), UDim2.fromOffset(0, (i - 1) * 30), Couleurs.FOND, 1)
		local nom = Ui.texte(ligne, "Nom", Evenements.NOMS_STATS[stat], 17, Couleurs.TEXTE)
		nom.Size = UDim2.new(0, 110, 1, 0)
		nom.TextXAlignment = Enum.TextXAlignment.Left
		local fond = Ui.cadre(ligne, "Fond", UDim2.new(1, -190, 0, 16), UDim2.new(0, 116, 0.5, -8), Couleurs.ROSE_PALE)
		Ui.coins(fond, 8)
		local jauge = Ui.cadre(fond, "Jauge", UDim2.fromScale(0, 1), UDim2.new(), Couleurs.STRATEGIES.vague)
		Ui.coins(jauge, 8)
		local valeur = Ui.texte(ligne, "Valeur", "", 17, Couleurs.TEXTE)
		valeur.AnchorPoint = Vector2.new(1, 0)
		valeur.Position = UDim2.fromScale(1, 0)
		valeur.Size = UDim2.new(0, 64, 1, 0)
		valeur.TextXAlignment = Enum.TextXAlignment.Right
		barres[stat] = { jauge = jauge, valeur = valeur }
	end

	-- Énergie et humeur
	local cadreForme = Ui.cadre(contenu, "Forme", UDim2.new(1, -8, 0, 52), UDim2.new(), Couleurs.FOND, 1)
	cadreForme.LayoutOrder = 4
	local fondEnergie =
		Ui.cadre(cadreForme, "Energie", UDim2.new(0.55, 0, 0, 16), UDim2.fromOffset(0, 30), Couleurs.ROSE_PALE)
	Ui.coins(fondEnergie, 8)
	jaugeEnergie = Ui.cadre(fondEnergie, "Jauge", UDim2.fromScale(1, 1), UDim2.new(), Couleurs.ENDURANCE_PLEINE)
	Ui.coins(jaugeEnergie, 8)
	texteEnergie = Ui.texte(cadreForme, "TexteEnergie", "", 16, Couleurs.TEXTE, Ui.POLICE_TEXTE)
	texteEnergie.Size = UDim2.new(0.55, 0, 0, 26)
	texteEnergie.TextXAlignment = Enum.TextXAlignment.Left
	texteHumeur = Ui.texte(cadreForme, "Humeur", "", 18, Couleurs.TEXTE)
	texteHumeur.Position = UDim2.fromScale(0.6, 0)
	texteHumeur.Size = UDim2.new(0.4, 0, 1, 0)
	texteHumeur.TextXAlignment = Enum.TextXAlignment.Left

	texteObjectif = ligneTexte(contenu, "Objectif", 16, Couleurs.ROSE, 5)
	texteObjectif.Size = UDim2.new(1, 0, 0, 40)

	-- Les actions du tour
	rangeeActions = Ui.cadre(contenu, "Actions", UDim2.new(1, -8, 0, 60), UDim2.new(), Couleurs.FOND, 1)
	rangeeActions.LayoutOrder = 6
	Ui.liste(rangeeActions, Enum.FillDirection.Horizontal, 10, Enum.HorizontalAlignment.Center)
	local entrainement =
		Ui.bouton(rangeeActions, "Entrainer", "🏋️ S'entraîner", UDim2.fromOffset(230, 56), Couleurs.ROSE)
	entrainement.Activated:Connect(function()
		rangeeStats.Visible = not rangeeStats.Visible
	end)
	local repos = Ui.bouton(rangeeActions, "Repos", "😴 Se reposer", UDim2.fromOffset(230, 56), Couleurs.CIEL)
	repos.Activated:Connect(function()
		envoyer("carriere.action", { action = "repos" })
	end)
	local sortie =
		Ui.bouton(rangeeActions, "Sortie", "🎈 Sortir", UDim2.fromOffset(230, 56), Couleurs.STRATEGIES.tempete)
	sortie.Activated:Connect(function()
		envoyer("carriere.action", { action = "sortie" })
	end)

	rangeeStats = Ui.cadre(contenu, "ChoixStat", UDim2.new(1, -8, 0, 64), UDim2.new(), Couleurs.FOND, 1)
	rangeeStats.LayoutOrder = 7
	rangeeStats.Visible = false
	Ui.liste(rangeeStats, Enum.FillDirection.Horizontal, 8, Enum.HorizontalAlignment.Center)
	for _, stat in Carriere.STATS do
		local b = Ui.bouton(rangeeStats, stat, "", UDim2.fromOffset(136, 60), Couleurs.BLANC, Couleurs.TEXTE)
		Ui.contour(b, Couleurs.ROSE, 2)
		b.Activated:Connect(function()
			entrainer(stat)
		end)
		boutonsStats[stat] = b
	end

	boutonCourir = Ui.bouton(contenu, "Courir", "🏁 Courir la course-objectif", UDim2.new(1, -8, 0, 60), Couleurs.OR)
	boutonCourir.LayoutOrder = 8
	boutonCourir.Activated:Connect(courir)

	local titreJournal = ligneTexte(contenu, "TitreJournal", 17, Couleurs.ROSE, 9)
	titreJournal.Text = "Journal"
	texteJournal = ligneTexte(contenu, "Journal", 14, Couleurs.TEXTE_DOUX, 10)
	texteJournal.Size = UDim2.new(1, 0, 0, 0)
	texteJournal.AutomaticSize = Enum.AutomaticSize.Y
	texteJournal.TextYAlignment = Enum.TextYAlignment.Top

	local bas = Ui.cadre(contenu, "Bas", UDim2.new(1, -8, 0, 52), UDim2.new(), Couleurs.FOND, 1)
	bas.LayoutOrder = 11
	Ui.liste(bas, Enum.FillDirection.Horizontal, 10, Enum.HorizontalAlignment.Right)
	local legendes =
		Ui.bouton(bas, "Legendes", "⭐ Légendes", UDim2.fromOffset(170, 46), Couleurs.ROSE_PALE, Couleurs.TEXTE)
	legendes.Activated:Connect(function()
		EcranCarriere.ouvrirLegendes()
	end)
	boutonAbandon = Ui.bouton(bas, "Abandon", "Abandonner", UDim2.fromOffset(190, 46), Couleurs.ARGENT, Couleurs.TEXTE)
	boutonAbandon.Activated:Connect(abandonner)

	-- La carte d'événement, par-dessus le tableau
	carte = Ui.cadre(panneau, "Evenement", UDim2.new(1, -40, 1, -90), UDim2.fromOffset(20, 70), Couleurs.FOND)
	carte.ZIndex = 10
	carte.Visible = false
	Ui.coins(carte, 18)
	Ui.contour(carte, Couleurs.OR, 3)
	Ui.marges(carte, 20)
	carteTitre = Ui.texte(carte, "Titre", "", 26, Couleurs.ROSE)
	carteTitre.Size = UDim2.new(1, 0, 0, 34)
	carteTitre.ZIndex = 11
	carteTexte = Ui.texte(carte, "Texte", "", 18, Couleurs.TEXTE, Ui.POLICE_TEXTE)
	carteTexte.Position = UDim2.fromOffset(0, 44)
	carteTexte.Size = UDim2.new(1, 0, 0, 110)
	carteTexte.ZIndex = 11
	for i = 1, 3 do
		local b = Ui.bouton(carte, `Choix{i}`, "", UDim2.new(1, 0, 0, 72), Couleurs.BLANC, Couleurs.TEXTE)
		b.Position = UDim2.fromOffset(0, 160 + (i - 1) * 82)
		b.ZIndex = 11
		Ui.contour(b, Couleurs.ROSE, 2)
		b.Activated:Connect(function()
			envoyer("carriere.choix", { choix = i })
		end)
		boutonsChoix[i] = b
	end
end

local function creerFin(gui: ScreenGui)
	local contenu: ScrollingFrame
	panneauFin, contenu = Ui.panneau(gui, "FinCarriere", "⭐ Une nouvelle Légende", UDim2.fromOffset(620, 420))
	finTitre = Ui.texte(contenu, "Titre", "", 30, Couleurs.ROSE)
	finTitre.LayoutOrder = 1
	finTitre.Size = UDim2.new(1, 0, 0, 80)
	finTexte = Ui.texte(contenu, "Texte", "", 18, Couleurs.TEXTE, Ui.POLICE_TEXTE)
	finTexte.LayoutOrder = 2
	finTexte.Size = UDim2.new(1, 0, 0, 0)
	finTexte.AutomaticSize = Enum.AutomaticSize.Y
	local nouvelle =
		Ui.bouton(contenu, "Nouvelle", "Commencer une nouvelle carrière", UDim2.new(1, -8, 0, 56), Couleurs.ROSE)
	nouvelle.LayoutOrder = 3
	nouvelle.Activated:Connect(function()
		CarriereCreation.ouvrir()
	end)
end

local function creerLegendes(gui: ScreenGui)
	panneauLegendes, listeLegendes = Ui.panneau(gui, "Legendes", "⭐ Tes Légendes", UDim2.fromOffset(640, 560))
end

function EcranCarriere.ouvrirLegendes()
	for _, enfant in listeLegendes:GetChildren() do
		if enfant:IsA("GuiObject") then
			enfant:Destroy()
		end
	end
	local d = Profil.donnees
	local legendes: { any } = if d then table.clone(d.legendes) else {}
	table.sort(legendes, function(a, b)
		return a.note > b.note
	end)
	if #legendes == 0 then
		local vide = Ui.texte(
			listeLegendes,
			"Vide",
			"Aucune Légende pour l'instant. Termine une carrière : ta coureuse rejoindra cette galerie.",
			17,
			Couleurs.TEXTE_DOUX,
			Ui.POLICE_TEXTE
		)
		vide.Size = UDim2.new(1, 0, 0, 60)
	end
	for i, l in legendes do
		local fiche = Ui.cadre(listeLegendes, `L{i}`, UDim2.new(1, -8, 0, 74), UDim2.new(), Couleurs.BLANC)
		fiche.LayoutOrder = i
		Ui.coins(fiche, 14)
		Ui.contour(fiche, Couleurs.ROSE_PALE, 2)
		Ui.marges(fiche, 10)
		local s = Strategies.parId[l.strategie]
		local nom = Ui.texte(fiche, "Nom", `{l.nom} — « {l.titre} »`, 18, Couleurs.ROSE)
		nom.Size = UDim2.new(1, -110, 0, 24)
		nom.TextXAlignment = Enum.TextXAlignment.Left
		local st = l.stats
		local detail = Ui.texte(
			fiche,
			"Detail",
			`{s and s.icone or ""} {s and s.nom or l.strategie} · {l.victoires} victoire(s) · Vit {st.vitesse} · Sou {st.souffle} · Pui {st.puissance} · Cœu {st.coeur} · Ins {st.instinct}`,
			14,
			Couleurs.TEXTE_DOUX,
			Ui.POLICE_TEXTE
		)
		detail.Position = UDim2.fromOffset(0, 28)
		detail.Size = UDim2.new(1, -110, 0, 26)
		detail.TextXAlignment = Enum.TextXAlignment.Left
		local note = Ui.texte(fiche, "Note", tostring(l.note), 24, Couleurs.OR)
		note.AnchorPoint = Vector2.new(1, 0.5)
		note.Position = UDim2.fromScale(1, 0.5)
		note.Size = UDim2.fromOffset(100, 30)
	end
	Menu.ouvrir(panneauLegendes)
end

local function montrerFin(donnees: any)
	if type(donnees) ~= "table" or type(donnees.legende) ~= "table" then
		return
	end
	local l = donnees.legende
	finTitre.Text = `{l.nom}\n« {l.titre} »`
	local lignes = {
		if donnees.fin == "objectif"
			then "La carrière s'arrête sur un objectif manqué, mais ta coureuse entre quand même dans la galerie."
			else "Trois années de travail, et la voilà parmi les Légendes de l'Académie !",
		`Note finale : {l.note}  ·  {l.victoires} victoire(s)`,
		`Récompense : +{donnees.etoiles or 0} ★  +{donnees.xp or 0} XP`,
	}
	if donnees.placee == false then
		table.insert(
			lignes,
			"Ta galerie est pleine et cette Légende n'a pas battu la moins bonne : elle n'y entre pas."
		)
	end
	finTexte.Text = table.concat(lignes, "\n\n")
	Menu.ouvrir(panneauFin)
end

-- Ouvre la carrière : création, tableau de bord… selon la sauvegarde.
function EcranCarriere.ouvrir()
	if Etat.regarde() then
		return
	end
	if carriereActuelle() then
		rafraichir()
		Menu.ouvrir(panneau)
	else
		CarriereCreation.ouvrir()
	end
end

function EcranCarriere.creer(gui: ScreenGui)
	creerTableau(gui)
	creerFin(gui)
	creerLegendes(gui)
	CarriereCreation.creer(gui, EcranCarriere.ouvrir)
	Menu.ajouter({ id = "carriere", icone = "🎓", texte = "Carrière", ordre = 20, ouvrir = EcranCarriere.ouvrir })
	Interactions.surAction("carriere", function()
		EcranCarriere.ouvrir()
	end)
	Profil.ecouter(function()
		if panneau.Visible then
			if carriereActuelle() then
				rafraichir()
			else
				panneau.Visible = false
			end
		end
	end)
	Reseau.signal().OnClientEvent:Connect(function(nom: unknown, donnees: unknown)
		if nom == "carriere.fin" then
			-- Après la course : on attend d'être revenu à l'Académie
			task.spawn(function()
				local fin = os.clock() + 30
				while Etat.regarde() and os.clock() < fin do
					task.wait(0.5)
				end
				panneau.Visible = false
				montrerFin(donnees)
			end)
		elseif nom == "carriere.retour" then
			task.spawn(function()
				local fin = os.clock() + 10
				while Etat.regarde() and os.clock() < fin do
					task.wait(0.25)
				end
				if carriereActuelle() and not panneauFin.Visible then
					EcranCarriere.ouvrir()
				end
			end)
		end
	end)
end

function EcranCarriere.mettreAJour() end

return EcranCarriere
