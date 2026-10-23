--!strict
-- Profil — la sauvegarde du joueur, telle que le serveur l'envoie.
--
-- Lecture seule : pour changer quoi que ce soit (acheter, équiper…), on
-- passe par une requête (voir Requetes), et le serveur renvoie le profil à
-- jour. Ainsi l'interface affiche toujours l'état réel.
--
--   Profil.donnees            la dernière version reçue (nil avant la première)
--   Profil.ecouter(fonction)  appelée à chaque nouvelle version

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Reseau = require(Partage:WaitForChild("Reseau"))
local Economie = require(Partage:WaitForChild("Jeu"):WaitForChild("Economie"))
local Schema = require(Partage:WaitForChild("Jeu"):WaitForChild("Schema"))

local Profil = {
	donnees = nil :: Schema.Donnees?,
}

local ecouteurs: { (Schema.Donnees) -> () } = {}

function Profil.ecouter(fonction: (Schema.Donnees) -> ())
	table.insert(ecouteurs, fonction)
	local d = Profil.donnees
	if d then
		task.spawn(fonction, d)
	end
end

-- Niveau, XP dans le niveau, XP pour le suivant.
function Profil.niveau(): (number, number, number)
	local d = Profil.donnees
	return Economie.niveau(if d then d.xp else 0)
end

function Profil.possede(categorie: string, id: string): boolean
	local d = Profil.donnees
	if not d then
		return false
	end
	local ensemble = (d.possessions :: any)[categorie]
	return ensemble ~= nil and ensemble[id] == true
end

function Profil.demarrer()
	Reseau.profil().OnClientEvent:Connect(function(donnees: unknown)
		if type(donnees) ~= "table" then
			return
		end
		local d = donnees :: Schema.Donnees
		Profil.donnees = d
		for _, fonction in ecouteurs do
			task.spawn(fonction, d)
		end
	end)
end

return Profil
