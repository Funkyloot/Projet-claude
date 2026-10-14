--!strict
-- Hud — l'interface pendant la course.
--
--   en haut à gauche   la mini-carte
--   en haut au centre  nom de la course, phase, distance restante, commentateur
--   en haut à droite   le rang, et le bouton caméra
--   au centre          compte à rebours, « PARTEZ ! », alertes
--   en bas             souffle, rythme, couloirs, compétence, SPRINT
--
-- Pensé d'abord pour le téléphone : les boutons d'action sont gros et sous
-- les pouces, la lecture se fait d'un coup d'œil.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Monde = require(Partage:WaitForChild("Monde"))
local Course = Partage:WaitForChild("Course")
local Competences = require(Course:WaitForChild("Competences"))
local Formules = require(Course:WaitForChild("Formules"))
local Strategies = require(Course:WaitForChild("Strategies"))

local Camera = require(script.Parent:WaitForChild("Camera"))
local Controles = require(script.Parent:WaitForChild("Controles"))
local Etat = require(script.Parent:WaitForChild("Etat"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))
local Commentateur = require(script.Parent:WaitForChild("Commentateur"))
local MiniCarte = require(script.Parent:WaitForChild("MiniCarte"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local F = Formules

local Hud = {}

local racine: Frame
local titre: TextLabel
local sousTitre: TextLabel
local rang: TextLabel
local surRang: TextLabel
local centre: TextLabel
local commandes: Frame
local barreSouffle: Frame
local texteSouffle: TextLabel
local boutonSprint: TextButton
local detailSprint: TextLabel
local boutonCompetence: TextButton
local boutonsRythme: { TextButton } = {}

local competencePrete: { nom: string, fin: number }? = nil
local alerte: { texte: string, couleur: Color3, fin: number }? = nil

local function pulser(objet: GuiObject)
	local echelle = objet:FindFirstChildOfClass("UIScale") :: UIScale?
	if not echelle then
		local nouvelle = Instance.new("UIScale")
		nouvelle.Parent = objet
		echelle = nouvelle
	end
	local e = echelle :: UIScale
	e.Scale = 1.25
	TweenService:Create(e, TweenInfo.new(0.35, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

local function alerter(texte: string, couleur: Color3, duree: number)
	alerte = { texte = texte, couleur = couleur, fin = os.clock() + duree }
	centre.Text = texte
	centre.TextColor3 = couleur
	pulser(centre)
end

local function creerBandeauHaut(parent: Instance)
	local bandeau =
		Ui.cadre(parent, "Bandeau", UDim2.fromOffset(420, 70), UDim2.new(0.5, 0, 0, 14), Couleurs.FOND, 0.08)
	bandeau.AnchorPoint = Vector2.new(0.5, 0)
	Ui.coins(bandeau, 18)
	Ui.contour(bandeau, Couleurs.ROSE_PALE, 2)
	Ui.liste(bandeau, Enum.FillDirection.Vertical, 0, Enum.HorizontalAlignment.Center)
	titre = Ui.texte(bandeau, "Course", "", 22, Couleurs.ROSE)
	sousTitre = Ui.texte(bandeau, "Phase", "", 17, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
end

local function creerRang(parent: Instance)
	local boite = Ui.cadre(parent, "Rang", UDim2.fromOffset(150, 96), UDim2.new(1, -16, 0, 14), Couleurs.FOND, 0.08)
	boite.AnchorPoint = Vector2.new(1, 0)
	Ui.coins(boite, 18)
	Ui.contour(boite, Couleurs.ROSE_PALE, 2)
	rang = Ui.texte(boite, "Valeur", "–", 52, Couleurs.ROSE)
	rang.Size = UDim2.new(1, 0, 0, 60)
	rang.Position = UDim2.fromOffset(0, 4)
	surRang = Ui.texte(boite, "Sur", "", 16, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
	surRang.Position = UDim2.fromOffset(0, 64)

	local camera = Ui.bouton(parent, "Camera", "🎥", UDim2.fromOffset(54, 54), Couleurs.FOND_SOMBRE)
	camera.AnchorPoint = Vector2.new(1, 0)
	camera.Position = UDim2.new(1, -16, 0, 120)
	camera.Activated:Connect(Camera.basculer)
end

local function creerCommandes(parent: Instance)
	commandes = Ui.cadre(parent, "Commandes", UDim2.new(1, 0, 0, 230), UDim2.new(0, 0, 1, 0), Couleurs.FOND, 1)
	commandes.AnchorPoint = Vector2.new(0, 1)

	-- Souffle, au centre en bas
	local souffle =
		Ui.cadre(commandes, "Souffle", UDim2.fromOffset(380, 62), UDim2.new(0.5, 0, 1, -16), Couleurs.FOND_SOMBRE, 0.2)
	souffle.AnchorPoint = Vector2.new(0.5, 1)
	Ui.coins(souffle, 14)
	local fondBarre =
		Ui.cadre(souffle, "Fond", UDim2.new(1, -20, 0, 16), UDim2.fromOffset(10, 36), Color3.fromRGB(70, 60, 90))
	Ui.coins(fondBarre, 8)
	barreSouffle = Ui.cadre(fondBarre, "Barre", UDim2.fromScale(1, 1), UDim2.new(), Couleurs.ENDURANCE_PLEINE)
	Ui.coins(barreSouffle, 8)
	texteSouffle = Ui.texte(souffle, "Texte", "Souffle", 15, Couleurs.BLANC, Ui.POLICE_TEXTE)
	texteSouffle.Size = UDim2.new(1, -20, 0, 24)
	texteSouffle.Position = UDim2.fromOffset(10, 6)
	texteSouffle.TextXAlignment = Enum.TextXAlignment.Left

	-- Rythme, au-dessus du souffle
	local rythmes =
		Ui.cadre(commandes, "Rythmes", UDim2.fromOffset(380, 48), UDim2.new(0.5, 0, 1, -86), Couleurs.FOND, 1)
	rythmes.AnchorPoint = Vector2.new(0.5, 1)
	Ui.liste(rythmes, Enum.FillDirection.Horizontal, 8, Enum.HorizontalAlignment.Center)
	local libelles = { "🐢 Économie", "● Normal", "🔥 Pousser" }
	for i, libelle in libelles do
		local b = Ui.bouton(rythmes, `Rythme{i}`, libelle, UDim2.fromOffset(120, 44), Couleurs.FOND_SOMBRE)
		b.LayoutOrder = i
		b.Activated:Connect(function()
			Controles.definirRythme(i)
		end)
		boutonsRythme[i] = b
	end

	-- Couloirs, en bas à gauche (pouce gauche)
	local couloirs =
		Ui.cadre(commandes, "Couloirs", UDim2.fromOffset(200, 96), UDim2.new(0, 16, 1, -16), Couleurs.FOND, 1)
	couloirs.AnchorPoint = Vector2.new(0, 1)
	Ui.liste(couloirs, Enum.FillDirection.Horizontal, 10)
	local gauche = Ui.bouton(couloirs, "Gauche", "◀", UDim2.fromOffset(92, 92), Couleurs.CIEL)
	gauche.Activated:Connect(function()
		Controles.couloir(-1)
	end)
	local droite = Ui.bouton(couloirs, "Droite", "▶", UDim2.fromOffset(92, 92), Couleurs.CIEL)
	droite.LayoutOrder = 2
	droite.Activated:Connect(function()
		Controles.couloir(1)
	end)

	-- Sprint et compétence, en bas à droite (pouce droit)
	boutonSprint = Ui.bouton(commandes, "Sprint", "SPRINT", UDim2.fromOffset(150, 150), Couleurs.ROSE)
	boutonSprint.AnchorPoint = Vector2.new(1, 1)
	boutonSprint.Position = UDim2.new(1, -16, 1, -16)
	Ui.coins(boutonSprint, 75)
	Ui.contour(boutonSprint, Couleurs.BLANC, 4)
	boutonSprint.Activated:Connect(Controles.action)
	detailSprint = Ui.texte(commandes, "DetailSprint", "", 15, Couleurs.BLANC, Ui.POLICE_TEXTE)
	detailSprint.AnchorPoint = Vector2.new(1, 1)
	detailSprint.Size = UDim2.fromOffset(220, 40)
	detailSprint.Position = UDim2.new(1, -176, 1, -16)
	detailSprint.TextXAlignment = Enum.TextXAlignment.Right
	detailSprint.TextStrokeTransparency = 0.5

	boutonCompetence = Ui.bouton(commandes, "Competence", "", UDim2.fromOffset(190, 54), Couleurs.OR, Couleurs.TEXTE)
	boutonCompetence.AnchorPoint = Vector2.new(1, 1)
	boutonCompetence.Position = UDim2.new(1, -16, 1, -178)
	boutonCompetence.Visible = false
	boutonCompetence.Activated:Connect(Controles.competence)
end

-- Phase lisible : « Dernier virage » parle plus que « Finale ».
local function libellePhase(d: number, distance: number): string
	local restant = distance - d
	local piste = Monde.piste
	if restant <= piste.ligneDroiteFinale then
		return "Dernière ligne droite"
	elseif restant <= piste.ligneDroiteFinale + piste.dernierVirage then
		return "Dernier virage"
	end
	return F.NOMS_PHASES[F.phase(d, distance)]
end

local function mettreAJourSprint(e: Rendu.Affiche, distance: number, etat: string)
	local moi = Etat.moi()
	if not moi then
		return
	end
	local strategie = Strategies.obtenir(moi.strategie)
	local stats = moi.stats
	local phase = F.phase(e.d, distance)
	local restant = math.max(0, distance - e.d)
	local t = Etat.maintenant() - Etat.heureDepart

	if t < 0.6 then
		boutonSprint.Text = "DÉPART"
		boutonSprint.BackgroundColor3 = Couleurs.CIEL
		detailSprint.Text = "Appuie pile au signal !"
		return
	end
	if e.arrivee then
		boutonSprint.Text = "🏁"
		boutonSprint.BackgroundColor3 = Couleurs.FOND_SOMBRE
		detailSprint.Text = ""
		return
	end
	if e.sprint then
		boutonSprint.Text = "⚡"
		boutonSprint.BackgroundColor3 = Couleurs.OR
		detailSprint.Text = if e.epuisee then "À bout de souffle…" else "Sprint lancé !"
		return
	end
	if phase < F.FINALE then
		boutonSprint.Text = "SPRINT"
		boutonSprint.BackgroundColor3 = Color3.fromRGB(150, 140, 165)
		detailSprint.Text = `Finale dans {math.ceil(distance * 2 / 3 - e.d)} m`
		return
	end
	-- En finale : combien de mètres de sprint le souffle permet-il ?
	local v0 = F.vitesseBase(distance, etat)
	local maximum = F.enduranceMax(strategie, stats.souffle, distance)
	local tenable = F.sprintTenable(
		e.endurance * maximum,
		restant,
		F.vitesseCroisiere(v0, strategie, F.FINALE, F.RYTHME_NORMAL, stats),
		F.vitesseSprint(v0, strategie, stats),
		v0,
		stats.coeur,
		etat
	)
	if tenable >= restant - 1 then
		boutonSprint.Text = "SPRINT !"
		boutonSprint.BackgroundColor3 = Couleurs.ROSE
		detailSprint.Text = "C'est le moment !"
	else
		boutonSprint.Text = "SPRINT"
		boutonSprint.BackgroundColor3 = Color3.fromRGB(240, 150, 90)
		detailSprint.Text = `Souffle pour {math.floor(tenable)} m · reste {math.ceil(restant)} m`
	end
end

function Hud.creer(parent: ScreenGui)
	racine = Ui.cadre(parent, "Hud", UDim2.fromScale(1, 1), UDim2.new(), Couleurs.FOND, 1)
	racine.Visible = false
	MiniCarte.creer(racine)
	creerBandeauHaut(racine)
	creerRang(racine)
	Commentateur.creer(racine)

	centre = Ui.texte(racine, "Centre", "", 64, Couleurs.ROSE)
	centre.AnchorPoint = Vector2.new(0.5, 0.5)
	centre.Position = UDim2.fromScale(0.5, 0.38)
	centre.Size = UDim2.new(1, 0, 0, 80)
	centre.TextStrokeTransparency = 0.2
	centre.TextStrokeColor3 = Couleurs.BLANC

	creerCommandes(racine)

	Etat.ecouter("evenements", function(lot: { { [string]: any } })
		for _, e in lot do
			if e.id == Etat.monId then
				if e.genre == "reaction" then
					if e.resultat == "parfait" then
						alerter("Départ parfait !", Couleurs.OR, 1.6)
					else
						alerter("Faux départ…", Couleurs.ENDURANCE_BASSE, 1.6)
					end
				elseif e.genre == "competencePrete" then
					local def = Competences.parId[e.competence]
					local moi = Etat.moi()
					if def and moi then
						competencePrete = { nom = def.nom, fin = os.clock() + Competences.fenetre(moi.stats.instinct) }
						pulser(boutonCompetence)
					end
				elseif e.genre == "competence" or e.genre == "competenceManquee" then
					competencePrete = nil
					if e.genre == "competence" then
						local def = Competences.parId[e.competence]
						alerter(def and `✨ {def.nom} !` or "✨", Couleurs.OR, 1.4)
					end
				elseif e.genre == "epuisee" then
					alerter("À bout de souffle !", Couleurs.ENDURANCE_BASSE, 1.6)
				elseif e.genre == "arrivee" then
					alerter(`{Ui.ordinal(e.rang)} !`, if e.rang <= 3 then Couleurs.OR else Couleurs.ROSE, 3)
				elseif e.genre == "duel" then
					alerter("DUEL !", Color3.fromRGB(255, 120, 60), 1.2)
				end
			elseif e.genre == "duel" and e.autre == Etat.monId then
				alerter("DUEL !", Color3.fromRGB(255, 120, 60), 1.2)
			elseif e.genre == "photoFinish" then
				alerter("PHOTO-FINISH", Couleurs.BLANC, 2.5)
			end
		end
	end)
	Etat.ecouter("phase", function(phase: string)
		racine.Visible = phase == "presentation" or phase == "stalles" or phase == "course"
		competencePrete = nil
		alerte = nil
		centre.Text = ""
	end)
end

function Hud.mettreAJour()
	if not racine or not racine.Visible then
		return
	end
	local course = Etat.course()
	if not course then
		return
	end
	MiniCarte.mettreAJour()
	Commentateur.mettreAJour()

	local participe = Etat.monId ~= 0 and Etat.moi() ~= nil
	commandes.Visible = participe and Etat.phase ~= "presentation"
	titre.Text = course.nom
	local e = Rendu.affiche[Etat.monId]
	local tete: Rendu.Affiche? = nil
	for _, a in Rendu.affiche do
		if a.rang == 1 then
			tete = a
		end
	end
	local reference = e or tete

	-- Compte à rebours et départ
	local t = Etat.maintenant() - Etat.heureDepart
	if alerte and os.clock() > alerte.fin then
		alerte = nil
		centre.Text = ""
	end
	if not alerte then
		if Etat.phase == "presentation" then
			centre.Text = ""
		elseif t < 0 and t > -3.5 then
			local reste = math.ceil(-t)
			centre.Text = if reste <= 3 then tostring(reste) else "Prêtes…"
			centre.TextColor3 = Couleurs.BLANC
		elseif t >= 0 and t < 1.2 then
			centre.Text = "PARTEZ !"
			centre.TextColor3 = Couleurs.ROSE
		else
			centre.Text = ""
		end
	end

	if Etat.phase == "presentation" then
		sousTitre.Text = `{course.distance} m · {course.categorie} · terrain {course.etat}`
	elseif reference then
		local restant = math.max(0, course.distance - reference.d)
		sousTitre.Text = `{libellePhase(reference.d, course.distance)} · reste {math.ceil(restant)} m`
	end

	if e then
		rang.Text = Ui.ordinal(e.rang)
		surRang.Text = `sur {#Etat.peloton}`
	else
		rang.Text = "👀"
		surRang.Text = "spectatrice"
	end

	if participe and e then
		-- Souffle
		barreSouffle.Size = UDim2.fromScale(math.clamp(e.endurance, 0, 1), 1)
		barreSouffle.BackgroundColor3 =
			Couleurs.ENDURANCE_BASSE:Lerp(Couleurs.ENDURANCE_PLEINE, math.clamp(e.endurance * 1.6, 0, 1))
		local etats = {}
		if e.aspiration then
			table.insert(etats, "dans le sillage")
		end
		if e.bloquee then
			table.insert(etats, "bloquée !")
		end
		texteSouffle.Text = `Souffle {math.floor(e.endurance * 100)} %`
			.. (if #etats > 0 then " · " .. table.concat(etats, " · ") else "")

		for i, b in boutonsRythme do
			local actif = i == Controles.rythme
			b.BackgroundColor3 = if actif then Couleurs.ROSE else Couleurs.FOND_SOMBRE
		end
		mettreAJourSprint(e, course.distance, course.etat)

		local prete = competencePrete
		if prete and os.clock() < prete.fin then
			boutonCompetence.Visible = true
			local touche = if UserInputService.KeyboardEnabled then " (E)" else ""
			boutonCompetence.Text = `✨ {prete.nom}{touche} · {math.ceil(prete.fin - os.clock())}`
		else
			boutonCompetence.Visible = false
		end
	end
end

return Hud
