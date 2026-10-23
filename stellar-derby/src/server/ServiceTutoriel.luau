--!strict
-- ServiceTutoriel — le tutoriel : une première course guidée contre des
-- bots, puis la visite de l'Académie.
--
-- À l'arrivée d'un joueur qui ne l'a pas fini, on lui propose (signal
-- « tutoriel.proposer »). Requêtes :
--   tutoriel.commencer   la course guidée (Coupe des Alizés, à l'Archipel)
--   tutoriel.etape       enregistre la progression
--   tutoriel.passer      passe le tutoriel
--   tutoriel.finir       le termine ; 200 étoiles la première fois seulement
-- On peut le rejouer plus tard (la guide de l'Académie), sans récompense.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Reseau = require(Partage:WaitForChild("Reseau"))
local Courses = require(Partage:WaitForChild("Course"):WaitForChild("Courses"))
local Peloton = require(Partage:WaitForChild("Course"):WaitForChild("Peloton"))
local Tutoriel = require(Partage:WaitForChild("Jeu"):WaitForChild("Tutoriel"))

local Lieux = require(script.Parent:WaitForChild("Lieux"))
local Profils = require(script.Parent:WaitForChild("Profils"))
local Sessions = require(script.Parent:WaitForChild("Sessions"))

local ServiceTutoriel = {}

local PISTE = "archipel"
local COURSE = "alizes"
local TOTAL_BOTS = 2600 -- une débutante qui suit les conseils peut bien finir

local enCours: { [Player]: boolean } = {}

local function commencer(joueur: Player): Reseau.Reponse
	local actuelle = Sessions.deJoueur(joueur)
	if enCours[joueur] or (actuelle and not actuelle.finie and actuelle.coureuseDe[joueur]) then
		return { ok = false, erreur = "Termine d'abord ta course en cours." }
	end
	local d = Profils.obtenir(joueur)
	local course = Courses.parId(COURSE)
	if not d or not course then
		return { ok = false, erreur = "Le tutoriel n'est pas prêt, réessaie dans un instant." }
	end
	local participante: Sessions.Participant = {
		joueur = joueur,
		definition = {
			nom = joueur.DisplayName,
			strategie = "ombre",
			stats = table.clone(Peloton.profil("equilibree").stats),
			-- Une compétence qui se prépare en milieu de course, pour l'apprendre
			competences = { "coupDeReins", "virageParfait" },
			controle = "joueur",
			userId = joueur.UserId,
		},
		robe = d.equipement.robe,
		tenue = d.equipement.tenue,
	}
	local session = Sessions.creer({
		genre = "tutoriel",
		titre = "Tutoriel · ta première course",
		piste = PISTE,
		course = course,
		participants = { participante },
		totalBots = TOTAL_BOTS,
		concert = false,
		libererALaFin = true,
	})
	enCours[joueur] = true
	Sessions.regarder(joueur, session)
	Lieux.versTribune(joueur, PISTE)
	task.spawn(function()
		Sessions.attendre(session)
		enCours[joueur] = nil
		if joueur.Parent then
			Lieux.versAcademie(joueur)
			Profils.signal(joueur, "tutoriel.academie", {})
		end
	end)
	return { ok = true }
end

function ServiceTutoriel.demarrer()
	Profils.surChargement(function(joueur, d)
		if not d.tutoriel.fini then
			task.delay(4, function()
				if joueur.Parent then
					Profils.signal(joueur, "tutoriel.proposer", { etape = d.tutoriel.etape })
				end
			end)
		end
	end)
	Profils.surRequete("tutoriel.commencer", commencer)
	Profils.surRequete("tutoriel.etape", function(joueur, args)
		local etape = if type(args) == "table" then args.etape else nil
		Profils.modifier(joueur, function(d)
			Tutoriel.enregistrer(d, etape)
		end)
		return { ok = true }
	end)
	Profils.surRequete("tutoriel.passer", function(joueur)
		Profils.modifier(joueur, function(d)
			d.tutoriel.fini = true
		end)
		return { ok = true }
	end)
	Profils.surRequete("tutoriel.finir", function(joueur)
		local gain: { etoiles: number, xp: number }? = nil
		Profils.modifier(joueur, function(d)
			gain = Tutoriel.finir(d)
		end)
		local g = gain :: { etoiles: number, xp: number }?
		if g then
			Profils.crediter(joueur, g.etoiles, g.xp, "Tutoriel terminé")
		end
		return { ok = true, recompense = g ~= nil }
	end)
	Players.PlayerRemoving:Connect(function(joueur)
		enCours[joueur] = nil
	end)
end

return ServiceTutoriel
