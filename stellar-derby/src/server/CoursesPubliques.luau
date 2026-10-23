--!strict
-- CoursesPubliques — une course libre en boucle sur chaque hippodrome.
--
-- Chaque hippodrome fait tourner son calendrier (Sprint, Mile, Moyenne,
-- Longue, et on recommence). Une course libre est égale pour toutes : même
-- total de stats, quel que soit le niveau ou la carrière de la joueuse.
--
-- Depuis l'Académie (portail ou menu), un joueur rejoint le lobby d'un
-- hippodrome pour courir ou pour regarder. Après l'arrivée et le concert, il
-- reste pour la course suivante, jusqu'à ce qu'il quitte.
--
-- Requêtes :
--   course.rejoindre  { piste, regarder? }   rejoindre le lobby d'un hippodrome
--   course.quitter                          revenir à l'Académie
--   course.participer { participer }         s'inscrire ou se désinscrire au lobby
--   lieu.academie                           revenir à l'Académie (téléporteur)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Courses = require(Partage:WaitForChild("Course"):WaitForChild("Courses"))
local Pistes = require(Partage:WaitForChild("Course"):WaitForChild("Pistes"))
local Saisons = require(Partage:WaitForChild("Jeu"):WaitForChild("Saisons"))

local Lieux = require(script.Parent:WaitForChild("Lieux"))
local Profils = require(script.Parent:WaitForChild("Profils"))
local Sessions = require(script.Parent:WaitForChild("Sessions"))

local CoursesPubliques = {}

local actuelles: { [string]: Sessions.Session } = {}

-- La course libre en cours (ou en lobby) d'un hippodrome.
function CoursesPubliques.session(piste: string): Sessions.Session?
	return actuelles[piste]
end

local function boucle(piste: string)
	local calendrier = Courses.dePiste(piste)
	local def = Pistes.parId(piste)
	local numero = 0
	local precedente: Sessions.Session? = nil
	while true do
		numero += 1
		local course = calendrier[(numero - 1) % #calendrier + 1]
		local grandPrix = Saisons.estGrandPrix(os.time(), numero)
		local titre = if grandPrix
			then `Grand Prix du week-end · {course.nom}`
			else `Course libre · {if def then def.nom else piste}`
		local session = Sessions.creer({
			genre = "publique",
			titre = titre,
			piste = piste,
			course = course,
			lobby = true,
			concert = true,
			grandPrix = grandPrix,
		})
		actuelles[piste] = session
		-- Ceux qui regardaient la course précédente restent pour celle-ci,
		-- avec leurs choix (inscrits ou spectateurs)
		local ancienne = precedente
		if ancienne then
			for joueur in ancienne.spectateurs do
				if joueur.Parent and Sessions.deJoueur(joueur) == ancienne then
					local c = ancienne.choix[joueur]
					Sessions.regarder(joueur, session, if c then c.participer else nil)
				end
			end
		end
		precedente = session
		Sessions.attendre(session)
		task.wait(0.5)
	end
end

function CoursesPubliques.demarrer()
	for _, def in Pistes.liste do
		task.spawn(boucle, def.id)
	end

	Profils.surRequete("course.rejoindre", function(joueur, args)
		if type(args) ~= "table" or not Pistes.existe(args.piste) then
			return { ok = false, erreur = "Hippodrome inconnu." }
		end
		local actuelle = Sessions.deJoueur(joueur)
		if actuelle and actuelle.options.genre ~= "publique" and not actuelle.finie then
			return { ok = false, erreur = "Termine d'abord ta course en cours." }
		end
		local session = actuelles[args.piste]
		if not session then
			return { ok = false, erreur = "L'hippodrome se prépare, réessaie dans un instant." }
		end
		Sessions.regarder(joueur, session, args.regarder ~= true)
		Lieux.versTribune(joueur, args.piste)
		return { ok = true, session = session.id }
	end)

	Profils.surRequete("course.participer", function(joueur, args)
		local session = Sessions.deJoueur(joueur)
		if not session or session.options.genre ~= "publique" or type(args) ~= "table" then
			return { ok = false, erreur = "Tu n'es dans aucun lobby." }
		end
		if session.phase ~= "lobby" then
			return { ok = false, erreur = "La course est déjà partie : tu courras la suivante." }
		end
		Sessions.regarder(joueur, session, args.participer == true)
		return { ok = true }
	end)

	local function quitter(joueur: Player)
		local session = Sessions.deJoueur(joueur)
		if session and session.options.genre == "publique" then
			Sessions.regarder(joueur, nil)
		end
		Lieux.versAcademie(joueur)
		return { ok = true }
	end
	Profils.surRequete("course.quitter", quitter)
	Profils.surRequete("lieu.academie", function(joueur)
		local session = Sessions.deJoueur(joueur)
		if session and session.options.genre ~= "publique" and not session.finie then
			return { ok = false, erreur = "Termine d'abord ta course en cours." }
		end
		return quitter(joueur)
	end)

	Players.PlayerAdded:Connect(function(joueur)
		joueur:SetAttribute("Session", "")
		joueur:SetAttribute("CoureuseId", 0)
	end)
end

return CoursesPubliques
