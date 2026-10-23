--!strict
-- Recompenses — après chaque course : étoiles, XP, statistiques, points de
-- saison des joueuses qui ont couru.
--
-- Les montants viennent de Jeu/Economie ; rien ne s'y décide ici.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Economie = require(Partage:WaitForChild("Jeu"):WaitForChild("Economie"))
local Saisons = require(Partage:WaitForChild("Jeu"):WaitForChild("Saisons"))
local Titres = require(Partage:WaitForChild("Jeu"):WaitForChild("Titres"))

local Profils = require(script.Parent:WaitForChild("Profils"))
local Sessions = require(script.Parent:WaitForChild("Sessions"))

local Recompenses = {}

local function apresCourse(session: Sessions.Session, resultats: { any })
	local sim = session.simulation
	local partantes = #resultats
	local photoFinish = sim ~= nil and sim.photoFinish
	local courseId = session.options.course.id
	for _, r in resultats do
		local joueur = session.joueurDe[r.id]
		if joueur and joueur.Parent and Profils.pret(joueur) then
			local gain = Economie.recompenseCourse({
				rang = r.rang,
				partantes = partantes,
				genre = session.options.genre,
				grandPrix = session.options.grandPrix,
				photoFinish = photoFinish,
			})
			local saison = Saisons.id(os.time())
			local points = Saisons.pointsCourse(r.rang, partantes, session.options.grandPrix == true)
			Profils.modifier(joueur, function(d)
				local s = d.stats
				s.courses += 1
				if r.rang == 1 then
					s.victoires += 1
					if photoFinish then
						s.photoFinish += 1
					end
				end
				if r.rang <= 3 then
					s.podiums += 1
				end
				local parStrategie = s.parStrategie[r.strategie] or { courses = 0, victoires = 0 }
				parStrategie.courses += 1
				if r.rang == 1 then
					parStrategie.victoires += 1
				end
				s.parStrategie[r.strategie] = parStrategie
				-- Les meilleurs temps ne comptent qu'en course libre, à armes égales
				if session.options.genre == "publique" then
					local meilleur = s.meilleursTemps[courseId]
					if not meilleur or r.temps < meilleur then
						s.meilleursTemps[courseId] = math.floor(r.temps * 100 + 0.5) / 100
					end
					if d.saison.id ~= saison then
						d.saison.id = saison
						d.saison.points = 0
					end
					d.saison.points += points
				end
			end)
			-- Gagner un Grand Prix du week-end vaut un titre
			if r.rang == 1 and session.options.grandPrix then
				local nouveau = false
				Profils.modifier(joueur, function(d)
					nouveau = Titres.donner(d, "grandprix", os.time())
				end)
				if nouveau then
					Profils.notifier(joueur, "Nouveau titre : Reine du week-end", "titre")
				end
			end
			local libelle = if r.rang == 1 then "Victoire" elseif r.rang <= 3 then `{r.rang}ᵉ place` else "Course"
			Profils.crediter(joueur, gain.etoiles, gain.xp, libelle)
		end
	end
end

function Recompenses.demarrer()
	Sessions.surFin(apresCourse)
end

return Recompenses
