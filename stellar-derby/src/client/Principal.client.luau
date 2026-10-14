--!strict
-- Point d'entrée du client : interface, rendu, caméra, contrôles.
--
-- L'ordre compte : chaque module s'abonne aux signaux de l'état AVANT que
-- l'état ne soit lu pour la première fois, sinon un joueur arrivé en pleine
-- course raterait la phase en cours.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Camera = require(script.Parent:WaitForChild("Camera"))
local Controles = require(script.Parent:WaitForChild("Controles"))
local Effets = require(script.Parent:WaitForChild("Effets"))
local Etat = require(script.Parent:WaitForChild("Etat"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))
local Sons = require(script.Parent:WaitForChild("Sons"))
local Ecran = require(script.Parent:WaitForChild("Ecran"))
local Hud = require(script.Parent:WaitForChild("Hud"))
local Lobby = require(script.Parent:WaitForChild("Lobby"))
local Resultats = require(script.Parent:WaitForChild("Resultats"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local gui = Ui.ecran(Players.LocalPlayer:WaitForChild("PlayerGui"), "StellarDerby", 10)

-- L'interface est dessinée pour 1280 × 720 puis mise à l'échelle de l'écran
local echelle = Instance.new("UIScale")
echelle.Parent = gui
local function ajusterEchelle()
	local taille = Workspace.CurrentCamera.ViewportSize
	echelle.Scale = math.clamp(math.min(taille.X / 1280, taille.Y / 720), 0.5, 1.25)
end
Workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(ajusterEchelle)
ajusterEchelle()

Rendu.demarrer()
Controles.demarrer()
Hud.creer(gui)
Lobby.creer(gui)
Resultats.creer(gui)
Ecran.demarrer()
Sons.demarrer()
Etat.demarrer()

RunService:BindToRenderStep("StellarRendu", Enum.RenderPriority.Camera.Value - 1, Rendu.mettreAJour)
RunService:BindToRenderStep("StellarCamera", Enum.RenderPriority.Camera.Value + 1, Camera.mettreAJour)

local depuisLent = 0
RunService.Heartbeat:Connect(function(dt: number)
	Hud.mettreAJour()
	Effets.mettreAJour()
	-- Ce qui n'a pas besoin de 60 images par seconde
	depuisLent += dt
	if depuisLent >= 0.2 then
		depuisLent = 0
		Lobby.mettreAJour()
		Resultats.mettreAJour()
		Ecran.mettreAJour()
	end
end)
