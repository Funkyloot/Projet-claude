--!strict
-- Lieux — déplacer un joueur dans le monde : vers l'Académie, vers la
-- tribune d'un hippodrome.
--
-- Le personnage du joueur ne court jamais lui-même (ce sont des marionnettes
-- qui courent, voir Coureuses) : il va simplement se poster en tribune
-- pendant la course, puis rentre à l'Académie.

local Players = game:GetService("Players")

local Academie = require(script.Parent:WaitForChild("Academie"))
local Hippodrome = require(script.Parent:WaitForChild("Hippodrome"))

local Lieux = {}

local function poser(joueur: Player, cadre: CFrame)
	local personnage = joueur.Character
	local racine = personnage and personnage:FindFirstChild("HumanoidRootPart") :: BasePart?
	if personnage and racine then
		-- Un petit écart au hasard : plusieurs joueurs ne s'empilent pas
		local decalage = Vector3.new(math.random(-4, 4), 0, math.random(-4, 4))
		personnage:PivotTo(cadre + decalage)
	end
	joueur:SetAttribute("Lieu", "")
end

function Lieux.vers(joueur: Player, cadre: CFrame)
	poser(joueur, cadre)
end

function Lieux.versAcademie(joueur: Player)
	local r = Academie.reperes()
	if r then
		poser(joueur, r.apparition.CFrame + Vector3.new(0, 4, 0))
	end
	joueur:SetAttribute("Lieu", "academie")
end

function Lieux.versTribune(joueur: Player, piste: string)
	local r = Hippodrome.reperes(piste)
	if r then
		poser(joueur, r.tribune.CFrame)
	end
	joueur:SetAttribute("Lieu", piste)
end

-- Le lieu où se trouve un joueur : "academie", un identifiant d'hippodrome, ou "".
function Lieux.de(joueur: Player): string
	return (joueur:GetAttribute("Lieu") :: string?) or ""
end

function Lieux.demarrer()
	Players.PlayerAdded:Connect(function(joueur)
		joueur:SetAttribute("Lieu", "academie")
	end)
end

return Lieux
