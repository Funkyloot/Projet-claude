--!strict
-- Requetes — demander quelque chose au serveur et attendre sa réponse.
--
--     local reponse = Requetes.envoyer("boutique.acheter", { id = "nuit" })
--     if not reponse.ok then Notifications.afficher(reponse.erreur) end
--
-- Ne plante jamais : une erreur réseau devient { ok = false, erreur = … }.
-- Ça attend la réponse : à appeler depuis un clic (chaque clic a son propre
-- fil d'exécution), pas dans une boucle d'affichage.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Reseau = require(Partage:WaitForChild("Reseau"))

local Requetes = {}

function Requetes.envoyer(nom: string, args: any?): Reseau.Reponse
	local ok, reponse = pcall(function()
		return Reseau.requete():InvokeServer(nom, args)
	end)
	if not ok then
		return { ok = false, erreur = "Le serveur ne répond pas." }
	end
	if type(reponse) ~= "table" then
		return { ok = false, erreur = "Réponse inattendue du serveur." }
	end
	return reponse :: Reseau.Reponse
end

return Requetes
