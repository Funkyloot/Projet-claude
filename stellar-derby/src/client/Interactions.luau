--!strict
-- Interactions — ce qui se passe quand on actionne une invite du monde
-- (touche E près d'un lieu, ou appui sur téléphone).
--
-- Chaque invite porte un attribut « Action » : "course:baie",
-- "entrainement:vitesse", "boutique"… La partie avant les deux-points
-- désigne la fonctionnalité, la suite est son argument :
--
--     Interactions.surAction("boutique", function(argument) ouvrirBoutique() end)

local ProximityPromptService = game:GetService("ProximityPromptService")

local Interactions = {}

local actions: { [string]: (string) -> () } = {}

function Interactions.surAction(nom: string, fonction: (string) -> ())
	actions[nom] = fonction
end

-- Déclenche une action comme si l'invite avait été actionnée (le menu s'en
-- sert pour les joueurs qui ne marchent pas jusqu'au lieu).
function Interactions.declencher(action: string)
	local nom, argument = string.match(action, "^([^:]+):?(.*)$")
	local fonction = nom and actions[nom]
	if fonction then
		task.spawn(fonction, argument or "")
	end
end

function Interactions.demarrer()
	ProximityPromptService.PromptTriggered:Connect(function(invite: ProximityPrompt)
		local action = invite:GetAttribute("Action")
		if type(action) == "string" then
			Interactions.declencher(action)
		end
	end)
end

return Interactions
