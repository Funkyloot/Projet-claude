-- Contrôle des modèles gratuits — à coller dans la barre de commande de Roblox
-- Studio (View > Command Bar), puis Entrée.
--
-- Un modèle gratuit de la boutique peut cacher un script malveillant
-- (« backdoor ») qui donne le contrôle de ton jeu à quelqu'un d'autre. Ce
-- contrôle liste tous les scripts qui ne font pas partie de Stellar Derby, et
-- signale ceux qui contiennent des formules typiques des backdoors.
--
-- Pour SUPPRIMER les scripts trouvés dans le Workspace et dans
-- ServerStorage.Ressources, passe la ligne suivante à true avant de coller :
local SUPPRIMER = false

local SUSPECTS = {
	"require%s*%(%s*%d", -- charger un module par son numéro : la signature des backdoors
	"getfenv",
	"setfenv",
	"loadstring",
	"InsertService",
	"HttpService",
	"TeleportService",
	"MarketplaceService",
	"\\%d%d%d\\%d%d%d", -- texte encodé pour être illisible
}

local zones = {
	game:GetService("Workspace"),
	game:GetService("ServerStorage"),
	game:GetService("ReplicatedFirst"),
	game:GetService("Lighting"),
}

local trouves, suspects, supprimes = 0, 0, 0
for _, zone in zones do
	for _, objet in zone:GetDescendants() do
		if objet:IsA("LuaSourceContainer") then
			trouves += 1
			local source = (objet :: any).Source or ""
			local alertes = {}
			for _, motif in SUSPECTS do
				if string.find(source, motif) then
					table.insert(alertes, motif)
				end
			end
			if #alertes > 0 then
				suspects += 1
				warn(`[SUSPECT] {objet:GetFullName()} : {table.concat(alertes, ", ")}`)
			else
				print(`[script] {objet:GetFullName()}`)
			end
			if SUPPRIMER then
				objet:Destroy()
				supprimes += 1
			end
		end
	end
end

print(`Contrôle terminé : {trouves} script(s) hors du jeu, dont {suspects} suspect(s), {supprimes} supprimé(s).`)
if trouves == 0 then
	print("Rien à signaler : aucun modèle n'a apporté de script.")
end
