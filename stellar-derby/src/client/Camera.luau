--!strict
-- Camera — les plans de la course.
--
--   lobby         caméra Roblox normale : on se promène
--   presentation  travelling le long des stalles, numéro par numéro
--   stalles       derrière sa coureuse (ou vue TV pour les spectatrices)
--   course        poursuite derrière sa coureuse, ou vue TV (touche C)
--   photo-finish  plan latéral sur la ligne, au ralenti
--   resultats     le podium
--
-- Tous les plans sont lissés : la caméra rejoint sa cible avec une
-- raideur donnée au lieu d'y sauter, ce qui efface les à-coups.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Config = require(Partage:WaitForChild("Config"))
local Monde = require(Partage:WaitForChild("Monde"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))

local LARGEUR = Config.LARGEUR_PISTE
local HAUT = Vector3.new(0, 1, 0)

local Camera = {
	vueTv = false,
}

local cadreLisse: CFrame? = nil
local fovLisse = 70

local function camera(): Camera
	return Workspace.CurrentCamera
end

function Camera.basculer()
	Camera.vueTv = not Camera.vueTv
end

local function viser(position: Vector3, cible: Vector3, dt: number, raideur: number, fov: number)
	local voulu = CFrame.lookAt(position, cible)
	local alpha = 1 - math.exp(-raideur * dt)
	local actuel = cadreLisse
	if not actuel or (actuel.Position - position).Magnitude > 400 then
		-- Trop loin (changement de plan) : on coupe au lieu de traverser le décor
		actuel = voulu
	end
	local suivant = (actuel :: CFrame):Lerp(voulu, alpha)
	cadreLisse = suivant
	fovLisse += (fov - fovLisse) * alpha
	local cam = camera()
	cam.CFrame = suivant
	cam.FieldOfView = fovLisse
end

local function planPresentation(dt: number)
	local course = Etat.course()
	if not course then
		return
	end
	local progression = 1 - math.clamp((Etat.finPhase - Etat.maintenant()) / Config.DUREE_PRESENTATION, 0, 1)
	local s = -course.distance
	local couloir = -2 + progression * (LARGEUR + 4)
	viser(Monde.point(s + 10, couloir, 5), Monde.point(s, couloir, 3.5), dt, 4, 60)
end

local function planPoursuite(dt: number): boolean
	local e = Rendu.affiche[Etat.monId]
	if not e then
		return false
	end
	local tangente = Monde.tangente(e.s)
	local base = e.cadre.Position
	local fov = if e.sprint then 82 elseif e.epuisee then 64 else 70
	viser(base - tangente * 15 + HAUT * 7, base + tangente * 10 + HAUT * 2.5, dt, 6, fov)
	return true
end

local function planTv(dt: number)
	-- On cadre les quatre premières, depuis l'extérieur de la piste
	local somme = Vector3.zero
	local n = 0
	local sTete: number? = nil
	for _, e in Rendu.affiche do
		if e.rang <= 4 then
			somme += e.cadre.Position
			n += 1
		end
		if e.rang == 1 then
			sTete = e.s
		end
	end
	if n == 0 or not sTete then
		return
	end
	local centre = somme / n
	viser(Monde.point(sTete - 12, LARGEUR + 38, 16), centre + HAUT * 2, dt, 3, 55)
end

local function planArrivee(dt: number)
	viser(Monde.point(0, LARGEUR + 22, 4), Monde.point(0, LARGEUR / 2, 2.5), dt, 5, 38)
end

local function planPodium(dt: number)
	local hippodrome = Workspace:FindFirstChild("Hippodrome")
	local podium = hippodrome and hippodrome:FindFirstChild("Podium")
	local marche = podium and podium:FindFirstChild("Marche1") :: BasePart?
	if not marche then
		return
	end
	local devant = marche.CFrame * CFrame.new(0, 4, -20)
	viser(devant.Position, marche.Position + HAUT * 4, dt, 3, 50)
end

function Camera.mettreAJour(dt: number)
	local phase = Etat.phase
	local cam = camera()
	if phase == "lobby" then
		if cam.CameraType ~= Enum.CameraType.Custom then
			cam.CameraType = Enum.CameraType.Custom
			cam.FieldOfView = 70
			local personnage = Players.LocalPlayer.Character
			local humanoide = personnage and personnage:FindFirstChildOfClass("Humanoid") :: Humanoid?
			if humanoide then
				cam.CameraSubject = humanoide
			end
			cadreLisse = nil
		end
		return
	end
	cam.CameraType = Enum.CameraType.Scriptable

	if phase == "presentation" then
		planPresentation(dt)
	elseif phase == "resultats" then
		planPodium(dt)
	elseif Rendu.ralenti then
		planArrivee(dt)
	elseif Camera.vueTv or Etat.monId == 0 or not planPoursuite(dt) then
		planTv(dt)
	end
end

return Camera
