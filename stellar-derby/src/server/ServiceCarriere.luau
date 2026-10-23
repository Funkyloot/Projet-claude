--!strict
-- ServiceCarriere — la carrière : créer sa coureuse, jouer les tours,
-- courir les courses-objectifs, et voir la coureuse devenir une Légende.
--
-- Les règles sont dans Jeu/Carriere ; ce service les applique à la
-- sauvegarde (toujours par Profils.modifier) et lance les courses.
--
-- Requêtes :
--   carriere.etat                       la carrière en cours (ou nil)
--   carriere.creer { nom, robe, strategie, profil, inspirations }
--   carriere.action { action = "repos" | "sortie" }
--   carriere.choix { choix }            répondre à l'événement en attente
--   carriere.courir                     lancer la course-objectif du tour
--   carriere.abandonner
-- L'entraînement passe par ServiceEntrainement (le mini-jeu), qui appelle
-- la fonction branchée ici quand la partie est validée.
--
-- Signaux au client : « carriere.retour » (la course est finie, on est
-- revenu à l'Académie) et « carriere.fin » (la carrière est finie : la
-- Légende, sa note, la récompense).
--
-- Si le joueur quitte le jeu pendant une course-objectif, l'IA finit la
-- course pour lui, aussitôt, et le résultat compte.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Reseau = require(Partage:WaitForChild("Reseau"))
local Courses = require(Partage:WaitForChild("Course"):WaitForChild("Courses"))
local Simulation = require(Partage:WaitForChild("Course"):WaitForChild("Simulation"))
local Carriere = require(Partage:WaitForChild("Jeu"):WaitForChild("Carriere"))
local Schema = require(Partage:WaitForChild("Jeu"):WaitForChild("Schema"))

local Lieux = require(script.Parent:WaitForChild("Lieux"))
local Profils = require(script.Parent:WaitForChild("Profils"))
local ServiceEntrainement = require(script.Parent:WaitForChild("ServiceEntrainement"))
local Sessions = require(script.Parent:WaitForChild("Sessions"))

local ServiceCarriere = {}

local PAS = 1 / 30

type CourseEnCours = {
	session: Sessions.Session,
	tour: number,
	rivale: string,
}

local enCourse: { [Player]: CourseEnCours } = {}
local aleatoire = Random.new()

-- La carrière du joueur, relue et nettoyée (nil s'il n'en a pas).
local function carriereDe(joueur: Player): Carriere.Carriere?
	local d = Profils.obtenir(joueur)
	return d and Carriere.nettoyer(d.carriere)
end

-- La carrière est finie : elle devient une Légende. Appelée dans Profils.modifier.
local function finaliser(d: Schema.Donnees, c: Carriere.Carriere): { [string]: any }
	local legende = Carriere.legende(c, os.time())
	local placee = Carriere.ajouterLegende(d.legendes, legende, Schema.MAX_LEGENDES)
	d.stats.carrieres += 1
	d.carriere = nil
	return { legende = legende, placee = placee, fin = c.fin }
end

-- Après la finalisation : la récompense et l'écran de fin.
local function annoncerFin(joueur: Player, fin: { [string]: any })
	local recompense = Carriere.recompense(fin.legende.note)
	Profils.crediter(joueur, recompense.etoiles, recompense.xp, "Fin de carrière")
	fin.etoiles = recompense.etoiles
	fin.xp = recompense.xp
	Profils.signal(joueur, "carriere.fin", fin)
end

-- Applique un résultat de course-objectif (une seule fois par course).
local function appliquerResultat(joueur: Player, course: CourseEnCours, resultats: { Simulation.Resultat })
	local session = course.session
	if session.donnees.carriereAppliquee then
		return
	end
	session.donnees.carriereAppliquee = true
	-- La joueuse est la première partante imposée : identifiant 1
	local rang, rangRivale = #resultats, nil :: number?
	for _, r in resultats do
		if r.id == 1 then
			rang = r.rang
		elseif r.nom == course.rivale then
			rangRivale = r.rang
		end
	end
	local fin: { [string]: any }? = nil
	local messages: { string } = {}
	Profils.modifier(joueur, function(d)
		local c = Carriere.nettoyer(d.carriere)
		if not c or c.tour ~= course.tour then
			return
		end
		local bilan = Carriere.appliquerCourse(c, rang, rangRivale)
		if not bilan then
			return
		end
		messages = bilan.messages
		d.carriere = c
		if c.finie then
			fin = finaliser(d, c)
		end
	end)
	for _, message in messages do
		Profils.notifier(joueur, message, "info")
	end
	if fin then
		annoncerFin(joueur, fin)
	end
end

-- ─────────────────────────────── Requêtes ───────────────────────────────

local function etat(joueur: Player): Reseau.Reponse
	return { ok = true, carriere = carriereDe(joueur), enCourse = enCourse[joueur] ~= nil }
end

local function creer(joueur: Player, args: any): Reseau.Reponse
	local d = Profils.obtenir(joueur)
	if not d then
		return { ok = false, erreur = "Ta sauvegarde n'est pas encore chargée." }
	end
	if Carriere.nettoyer(d.carriere) then
		return { ok = false, erreur = "Tu as déjà une carrière en cours." }
	end
	local c, erreur = Carriere.nouvelle(args, d, aleatoire:NextInteger(1, 2147483646), os.time())
	if not c then
		return { ok = false, erreur = erreur or "Impossible de créer cette carrière." }
	end
	Profils.modifier(joueur, function(donnees)
		donnees.carriere = c :: any
	end)
	return { ok = true, carriere = c }
end

-- Une action qui modifie la carrière sur place et rend un bilan.
local function agir(joueur: Player, action: (Carriere.Carriere) -> (Carriere.Bilan?, string?)): Reseau.Reponse
	if enCourse[joueur] then
		return { ok = false, erreur = "Ta course est en route !" }
	end
	local reponse: Reseau.Reponse = { ok = false, erreur = "Tu n'as pas de carrière en cours." }
	Profils.modifier(joueur, function(d)
		local c = Carriere.nettoyer(d.carriere)
		if not c then
			return
		end
		local bilan, erreur = action(c)
		if not bilan then
			reponse = { ok = false, erreur = erreur or "Impossible pour l'instant." }
			return
		end
		d.carriere = c :: any
		reponse = { ok = true, bilan = bilan, carriere = c }
	end)
	return reponse
end

local function actionSimple(joueur: Player, args: any): Reseau.Reponse
	local action = if type(args) == "table" then args.action else nil
	if action == "repos" then
		return agir(joueur, Carriere.reposer)
	elseif action == "sortie" then
		return agir(joueur, Carriere.sortir)
	end
	return { ok = false, erreur = "Action inconnue." }
end

local function choix(joueur: Player, args: any): Reseau.Reponse
	local index = if type(args) == "table" then args.choix else nil
	return agir(joueur, function(c)
		return Carriere.choisir(c, index)
	end)
end

local function courir(joueur: Player): Reseau.Reponse
	if enCourse[joueur] then
		return { ok = false, erreur = "Ta course est déjà en route !" }
	end
	local regardee = Sessions.deJoueur(joueur)
	if regardee and not regardee.finie then
		return { ok = false, erreur = "Quitte d'abord la course que tu regardes." }
	end
	local d = Profils.obtenir(joueur)
	local c = d and Carriere.nettoyer(d.carriere)
	if not d or not c then
		return { ok = false, erreur = "Tu n'as pas de carrière en cours." }
	end
	if Carriere.attente(c) ~= "course" then
		return { ok = false, erreur = "Ce n'est pas encore le jour de la course." }
	end
	local objectif = Carriere.objectifDuTour(c.tour)
	local course = objectif and Courses.parId(objectif.course)
	if not objectif or not course then
		return { ok = false, erreur = "Course introuvable." }
	end
	local rivale = Carriere.definitionRivale(c, objectif)
	local enCours: CourseEnCours
	local session = Sessions.creer({
		genre = "carriere",
		titre = `Carrière de {c.nom} · Objectif : {string.lower(Carriere.libellePlace(objectif.place))}`,
		piste = course.piste,
		course = course,
		participants = {
			{
				joueur = joueur,
				definition = Carriere.definition(c, joueur.UserId),
				robe = c.robe,
				tenue = d.equipement.tenue,
			},
		},
		bots = { rivale },
		marques = { [rivale.nom] = "RIVALE" },
		totalBots = objectif.totalBots,
		concert = true,
		libererALaFin = true,
		surFin = function(_session, resultats)
			appliquerResultat(joueur, enCours, resultats)
		end,
	})
	enCours = { session = session, tour = c.tour, rivale = rivale.nom }
	enCourse[joueur] = enCours
	Sessions.regarder(joueur, session)
	Lieux.versTribune(joueur, course.piste)
	task.spawn(function()
		Sessions.attendre(session)
		if enCourse[joueur] == enCours then
			enCourse[joueur] = nil
		end
		if joueur.Parent then
			Lieux.versAcademie(joueur)
			Profils.signal(joueur, "carriere.retour", {})
		end
	end)
	return { ok = true, session = session.id }
end

local function abandonner(joueur: Player): Reseau.Reponse
	if enCourse[joueur] then
		return { ok = false, erreur = "Termine d'abord ta course." }
	end
	if not carriereDe(joueur) then
		return { ok = false, erreur = "Tu n'as pas de carrière en cours." }
	end
	Profils.modifier(joueur, function(d)
		d.carriere = nil
	end)
	return { ok = true }
end

-- ─────────────────────────────── Entraînement ───────────────────────────────

-- Branché sur ServiceEntrainement : un mini-jeu de carrière vient d'être validé.
local function entrainement(joueur: Player, stat: string, qualite: number): { [string]: any }?
	if enCourse[joueur] then
		return nil
	end
	local resultat: { [string]: any }? = nil
	Profils.modifier(joueur, function(d)
		local c = Carriere.nettoyer(d.carriere)
		if not c then
			return
		end
		local bilan = Carriere.entrainer(c, stat, qualite)
		if not bilan then
			return
		end
		d.carriere = c :: any
		resultat = {
			stat = stat,
			gain = bilan.gain,
			lie = bilan.lie,
			gainLie = bilan.gainLie,
			blessure = bilan.blessure == true,
			messages = bilan.messages,
			evenement = bilan.evenement,
			carriere = c,
		}
	end)
	return resultat
end

-- ─────────────────────────────── Départ en pleine course ───────────────────────────────

-- Le joueur s'en va pendant sa course : l'IA la finit tout de suite, pour
-- que le résultat soit écrit avant la dernière sauvegarde.
local function avantDepart(joueur: Player)
	local course = enCourse[joueur]
	if not course then
		return
	end
	enCourse[joueur] = nil
	local session = course.session
	local sim = session.simulation
	if not sim or session.donnees.carriereAppliquee then
		-- Pas encore partie : la course n'a pas lieu, elle attendra son retour
		if not sim then
			Sessions.terminer(session)
		end
		return
	end
	if not sim.termine then
		local id = session.coureuseDe[joueur]
		if id then
			sim:commande(id, "ia", nil)
		end
		local garde = 0
		while not sim.termine and garde < 30 * 900 do
			sim:pas(PAS)
			garde += 1
		end
	end
	appliquerResultat(joueur, course, sim:resultats())
end

function ServiceCarriere.demarrer()
	ServiceEntrainement.definirCarriere(entrainement)
	Profils.surRequete("carriere.etat", etat)
	Profils.surRequete("carriere.creer", creer)
	Profils.surRequete("carriere.action", actionSimple)
	Profils.surRequete("carriere.choix", choix)
	Profils.surRequete("carriere.courir", courir)
	Profils.surRequete("carriere.abandonner", abandonner)
	Profils.avantDepart(avantDepart)
end

return ServiceCarriere
