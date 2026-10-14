--!strict
-- Reseau — les canaux entre serveur et clients, et l'état de partie partagé.
--
-- Le serveur crée tout au démarrage ; les clients attendent que ça existe.
--
--   Instantane  (serveur → clients, non fiable) positions des coureuses, binaire
--   Evenements  (serveur → clients)             événements de course
--   Commande    (client → serveur)              ordres du joueur et choix du lobby
--
-- L'état de partie vit dans les attributs du dossier EtatPartie : ils sont
-- répliqués automatiquement, y compris aux joueurs qui arrivent en cours de
-- route. Attributs :
--   Phase         "lobby" | "presentation" | "stalles" | "course" | "resultats"
--   FinPhase      heure serveur de fin de la phase (compte à rebours affiché)
--   Course        identifiant de la course en préparation ou en cours
--   NumeroCourse  incrémenté à chaque nouvelle course
--   HeureDepart   heure serveur du « Partez ! »
--   Peloton       partantes, en JSON
--   Resultats     classement final, en JSON

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Formules = require(script.Parent:WaitForChild("Course"):WaitForChild("Formules"))

local NOM_DOSSIER = "Reseau"

export type Partante = {
	id: number,
	nom: string,
	numero: number,
	cadre: number,
	strategie: string,
	controle: "joueur" | "ia",
	userId: number?,
	competences: { string },
	stats: Formules.Stats, -- le HUD en a besoin pour estimer le sprint tenable
}

local Reseau = {}

local function dossier(): Folder
	if RunService:IsServer() then
		local existant = ReplicatedStorage:FindFirstChild(NOM_DOSSIER)
		if existant and existant:IsA("Folder") then
			return existant :: Folder
		end
		local nouveau = Instance.new("Folder")
		nouveau.Name = NOM_DOSSIER
		nouveau.Parent = ReplicatedStorage
		return nouveau
	end
	return ReplicatedStorage:WaitForChild(NOM_DOSSIER) :: Folder
end

local function obtenir(nom: string, classe: "RemoteEvent" | "UnreliableRemoteEvent" | "Folder"): Instance
	local parent = dossier()
	if RunService:IsServer() then
		local existant = parent:FindFirstChild(nom)
		if existant then
			return existant
		end
		local nouveau = Instance.new(classe)
		nouveau.Name = nom
		nouveau.Parent = parent
		return nouveau
	end
	return parent:WaitForChild(nom)
end

function Reseau.instantane(): UnreliableRemoteEvent
	return obtenir("Instantane", "UnreliableRemoteEvent") :: UnreliableRemoteEvent
end

function Reseau.evenements(): RemoteEvent
	return obtenir("Evenements", "RemoteEvent") :: RemoteEvent
end

function Reseau.commande(): RemoteEvent
	return obtenir("Commande", "RemoteEvent") :: RemoteEvent
end

function Reseau.etat(): Folder
	return obtenir("EtatPartie", "Folder") :: Folder
end

return Reseau
