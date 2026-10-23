--!strict
-- Point d'entrée du client : interface, rendu, caméra, contrôles, et les
-- écrans de chaque fonctionnalité.
--
-- L'ordre compte : chaque module s'abonne aux signaux de l'état AVANT que
-- l'état ne soit lu pour la première fois, sinon un joueur arrivé en pleine
-- course raterait la phase en cours.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Ambiance = require(ReplicatedStorage:WaitForChild("Partage"):WaitForChild("Ambiance"))

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
local Profil = require(script.Parent:WaitForChild("Profil"))
local Menu = require(script.Parent:WaitForChild("Menu"))
local Notifications = require(script.Parent:WaitForChild("Notifications"))
local Interactions = require(script.Parent:WaitForChild("Interactions"))
local EcranCourses = require(script.Parent:WaitForChild("EcranCourses"))
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

-- La lumière suit la course regardée ; à l'Académie, le plein soleil
local function appliquerAmbiance()
	local course = Etat.course()
	Ambiance.appliquer(if Etat.regarde() and course then course.meteo else "soleil")
end
Etat.ecouter("course", appliquerAmbiance)
Etat.ecouter("session", appliquerAmbiance)

Profil.demarrer()
Rendu.demarrer()
Controles.demarrer()
Interactions.demarrer()
Notifications.creer(gui)
Hud.creer(gui)
Lobby.creer(gui)
Resultats.creer(gui)
Menu.creer(gui)
EcranCourses.creer()
Ecran.demarrer()
Sons.demarrer()

-- Les écrans des fonctionnalités : chacun se crée à part, et une erreur dans
-- l'un n'empêche pas les autres de marcher.
type Fonctionnalite = { creer: (ScreenGui) -> (), mettreAJour: () -> () }
local fonctionnalites: { Fonctionnalite } = {}
for _, nom in
	{
		"EcranBoutique",
		"EcranEntrainement",
		"EcranCarriere",
		"EcranConcert",
		"EcranClassements",
		"EcranProfil",
		"Cinematique",
		"EcranDuo",
		"Tutoriel",
		"PanneauLive",
	}
do
	local ok, erreur = pcall(function()
		local module = require(script.Parent:WaitForChild(nom)) :: any
		module.creer(gui)
		table.insert(fonctionnalites, module)
	end)
	if not ok then
		warn(`[Stellar Derby] {nom} n'a pas pu démarrer : {erreur}`)
	end
end

Etat.demarrer()
appliquerAmbiance()

RunService:BindToRenderStep("StellarRendu", Enum.RenderPriority.Camera.Value - 1, Rendu.mettreAJour)
RunService:BindToRenderStep("StellarCamera", Enum.RenderPriority.Camera.Value + 1, Camera.mettreAJour)

local depuisLent = 0
RunService.Heartbeat:Connect(function(dt: number)
	Hud.mettreAJour()
	Effets.mettreAJour()
	for _, f in fonctionnalites do
		local ok, erreur = pcall(function(): string?
			f.mettreAJour()
			return nil
		end)
		if not ok then
			warn(`[Stellar Derby] mise à jour : {erreur}`)
		end
	end
	-- Ce qui n'a pas besoin de 60 images par seconde
	depuisLent += dt
	if depuisLent >= 0.2 then
		depuisLent = 0
		Lobby.mettreAJour()
		Resultats.mettreAJour()
		Ecran.mettreAJour()
		Menu.mettreAJour()
		EcranCourses.mettreAJour()
	end
end)
