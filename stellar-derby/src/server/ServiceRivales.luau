--!strict
-- ServiceRivales — les rivales du destin et les titres.
--
-- Après chaque course, pour chaque joueuse qui a couru : celle qui l'a
-- battue d'une encolure ou moins devient sa rivale ; une rivale battue plus
-- tard fait « briser le destin » (titre « Briseuse de destin »). Les règles
-- sont dans Jeu/Rivales.
--
-- Les titres à condition (Jeu/Titres) sont vérifiés à l'arrivée du joueur,
-- après chaque course et toutes les 30 s : chaque titre mérité est accordé
-- avec une notification.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Rivales = require(Partage:WaitForChild("Jeu"):WaitForChild("Rivales"))
local Titres = require(Partage:WaitForChild("Jeu"):WaitForChild("Titres"))

local Profils = require(script.Parent:WaitForChild("Profils"))
local Sessions = require(script.Parent:WaitForChild("Sessions"))

local ServiceRivales = {}

local PERIODE_TITRES = 30

-- Accorde les titres à condition désormais mérités.
local function verifierTitres(joueur: Player)
	local d = Profils.obtenir(joueur)
	-- Lecture d'abord : on ne réécrit la sauvegarde que s'il y a du nouveau
	if not d or #Titres.nouveaux(d) == 0 then
		return
	end
	local gagnes: { string } = {}
	Profils.modifier(joueur, function(donnees)
		for _, t in Titres.nouveaux(donnees) do
			if Titres.donner(donnees, t.id, os.time()) then
				table.insert(gagnes, t.nom)
			end
		end
	end)
	for _, nom in gagnes do
		Profils.notifier(joueur, `Nouveau titre : {nom}`, "titre")
	end
end

local function apresCourse(session: Sessions.Session, resultats: { any })
	for id, joueur in session.joueurDe do
		if joueur.Parent and Profils.pret(joueur) then
			local bilan: Rivales.Bilan? = nil
			local destinNouveau = false
			Profils.modifier(joueur, function(d)
				local b = Rivales.apresCourse(d, resultats, id, os.time())
				bilan = b
				if #b.destins > 0 then
					destinNouveau = Titres.donner(d, "destin", os.time())
				end
			end)
			local b = bilan :: Rivales.Bilan?
			if b then
				for _, nom in b.destins do
					Profils.notifier(joueur, `Tu as brisé le destin : {nom} !`, "titre")
				end
				if destinNouveau then
					Profils.notifier(joueur, "Nouveau titre : Briseuse de destin", "titre")
				end
				if b.nouvelle then
					Profils.notifier(
						joueur,
						`{b.nouvelle} t'a battue d'un rien… C'est ta rivale, maintenant !`,
						"alerte"
					)
				end
			end
			-- Les statistiques de la course arrivent en même temps (Recompenses) :
			-- on vérifie les titres juste après
			task.delay(1, verifierTitres, joueur)
		end
	end
end

function ServiceRivales.demarrer()
	Sessions.surFin(apresCourse)
	Profils.surChargement(function(joueur)
		verifierTitres(joueur)
	end)
	task.spawn(function()
		while true do
			task.wait(PERIODE_TITRES)
			for _, joueur in Players:GetPlayers() do
				if Profils.pret(joueur) then
					verifierTitres(joueur)
				end
			end
		end
	end)
end

return ServiceRivales
