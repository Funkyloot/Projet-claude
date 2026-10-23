--!strict
-- EcranCourses — choisir un hippodrome pour courir ou regarder une course libre.
--
-- On y arrive par le bouton « Courir » du menu, ou par un portail de
-- l'Académie. Pour chaque hippodrome : la course en préparation ou en cours,
-- son état, et deux boutons.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Courses = require(Partage:WaitForChild("Course"):WaitForChild("Courses"))
local Pistes = require(Partage:WaitForChild("Course"):WaitForChild("Pistes"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Interactions = require(script.Parent:WaitForChild("Interactions"))
local Menu = require(script.Parent:WaitForChild("Menu"))
local Notifications = require(script.Parent:WaitForChild("Notifications"))
local Requetes = require(script.Parent:WaitForChild("Requetes"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local EcranCourses = {}

local panneau: Frame
local etats: { [string]: TextLabel } = {}

local PHASES: { [string]: string } = {
	lobby = "Inscriptions ouvertes",
	presentation = "Les partantes entrent dans les stalles",
	stalles = "Départ imminent",
	course = "Course en cours",
	resultats = "Arrivée",
	concert = "Concert de la victoire",
	fin = "Préparation de la course suivante",
}

-- La course libre en cours d'un hippodrome (son dossier de session).
local function sessionPublique(piste: string): Folder?
	for _, dossier in Reseau.sessions():GetChildren() do
		if dossier:GetAttribute("Genre") == "publique" and dossier:GetAttribute("Piste") == piste then
			return dossier :: Folder
		end
	end
	return nil
end

function EcranCourses.rejoindre(piste: string, regarder: boolean)
	local reponse = Requetes.envoyer("course.rejoindre", { piste = piste, regarder = regarder })
	if reponse.ok then
		Menu.fermer()
	else
		Notifications.afficher(reponse.erreur or "Impossible de rejoindre cette course.", "alerte")
	end
end

function EcranCourses.ouvrir()
	Menu.ouvrir(panneau)
end

function EcranCourses.creer()
	local contenu: ScrollingFrame
	panneau, contenu = Ui.panneau(Menu.ecran(), "Courses", "🏇 Courses libres", UDim2.fromOffset(640, 560))
	local explication = Ui.texte(
		contenu,
		"Explication",
		"Une course libre est égale pour toutes : même total de stats, quel que soit ton niveau. Choisis un hippodrome.",
		15,
		Couleurs.TEXTE_DOUX,
		Ui.POLICE_TEXTE
	)
	explication.Size = UDim2.new(1, 0, 0, 40)
	for ordre, def in Pistes.liste do
		local carte = Ui.cadre(contenu, def.id, UDim2.new(1, -8, 0, 140), UDim2.new(), Couleurs.BLANC)
		carte.LayoutOrder = ordre + 1
		Ui.coins(carte, 16)
		Ui.contour(carte, Couleurs.ROSE_PALE, 2)
		Ui.marges(carte, 12)
		local nom = Ui.texte(carte, "Nom", `{def.nom} · {def.ile}`, 20, Couleurs.ROSE)
		nom.TextXAlignment = Enum.TextXAlignment.Left
		local resume = Ui.texte(carte, "Resume", def.resume, 14, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
		resume.Position = UDim2.fromOffset(0, 28)
		resume.Size = UDim2.new(1, 0, 0, 34)
		resume.TextXAlignment = Enum.TextXAlignment.Left
		local etat = Ui.texte(carte, "Etat", "", 15, Couleurs.TEXTE, Ui.POLICE_TEXTE)
		etat.Position = UDim2.fromOffset(0, 64)
		etat.Size = UDim2.new(0.6, 0, 0, 48)
		etat.TextXAlignment = Enum.TextXAlignment.Left
		etats[def.id] = etat
		local courir = Ui.bouton(carte, "Courir", "Courir", UDim2.fromOffset(110, 46), Couleurs.ROSE)
		courir.AnchorPoint = Vector2.new(1, 1)
		courir.Position = UDim2.new(1, -120, 1, 0)
		courir.Activated:Connect(function()
			EcranCourses.rejoindre(def.id, false)
		end)
		local regarder = Ui.bouton(carte, "Regarder", "Regarder", UDim2.fromOffset(110, 46), Couleurs.CIEL)
		regarder.AnchorPoint = Vector2.new(1, 1)
		regarder.Position = UDim2.new(1, 0, 1, 0)
		regarder.Activated:Connect(function()
			EcranCourses.rejoindre(def.id, true)
		end)
	end

	Menu.ajouter({ id = "courir", icone = "🏇", texte = "Courir", ordre = 10, ouvrir = EcranCourses.ouvrir })
	Interactions.surAction("course", function(piste: string)
		if Pistes.existe(piste) then
			EcranCourses.rejoindre(piste, false)
		end
	end)
	Interactions.surAction("academie", function()
		local reponse = Requetes.envoyer("lieu.academie")
		if not reponse.ok then
			Notifications.afficher(reponse.erreur or "Impossible pour l'instant.", "alerte")
		end
	end)
end

function EcranCourses.mettreAJour()
	if not panneau or not panneau.Visible then
		return
	end
	for _, def in Pistes.liste do
		local etiquette = etats[def.id]
		local dossier = sessionPublique(def.id)
		if etiquette then
			if not dossier then
				etiquette.Text = "En préparation…"
			else
				local course = Courses.parId((dossier:GetAttribute("Course") :: string?) or "")
				local phase = (dossier:GetAttribute("Phase") :: string?) or "lobby"
				local inscrits = (dossier:GetAttribute("Inscrits") :: number?) or 0
				local grandPrix = dossier:GetAttribute("GrandPrix") == true
				local ligne1 = if course
					then `{if grandPrix then "🏆 " else ""}{course.nom} · {course.distance} m · {course.categorie}`
					else ""
				local ligne2 = PHASES[phase] or ""
				if phase == "lobby" then
					local fin = (dossier:GetAttribute("FinPhase") :: number?) or 0
					ligne2 = if fin > 0
						then `Départ dans {math.max(0, math.ceil(fin - Etat.maintenant()))} s · {inscrits} inscrite(s)`
						else "Inscriptions ouvertes · personne pour l'instant"
				end
				etiquette.Text = `{ligne1}\n{ligne2}`
			end
		end
	end
end

return EcranCourses
