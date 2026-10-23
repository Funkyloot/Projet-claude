--!strict
-- Camera — les plans de la course.
--
--   lobby         caméra Roblox normale : on se promène
--   presentation  travelling le long des stalles, numéro par numéro
--   stalles       derrière sa coureuse (ou vue TV pour les spectatrices)
--   course        poursuite derrière sa coureuse, ou vue TV (touche C)
--   photo-finish  plan latéral sur la ligne, au ralenti
--   resultats     le podium
--   concert       la scène du concert de la victoire
--   aucune        à l'Académie : caméra Roblox normale
--
-- Une fonctionnalité peut prendre la main un moment (cinématique de
-- compétence, mini-jeu…) avec Camera.prendre(fonction) : la fonction est
-- appelée à chaque image à la place des plans ci-dessus, tant qu'elle
-- renvoie vrai.
--
-- Tous les plans sont lissés : la caméra rejoint sa cible avec une
-- raideur donnée au lieu d'y sauter, ce qui efface les à-coups.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Config = require(Partage:WaitForChild("Config"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))

local LARGEUR = Config.LARGEUR_PISTE
local HAUT = Vector3.new(0, 1, 0)

local Camera = {
	vueTv = false,
}

local surcharges: { (dt: number, camera: Camera) -> boolean } = {}

-- Laisse une fonctionnalité filmer à la place des plans de course, tant que
-- `fonction` renvoie vrai.
function Camera.prendre(fonction: (dt: number, camera: Camera) -> boolean)
	table.insert(surcharges, fonction)
end

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
	local repere = Etat.repere()
	local s = -course.distance
	local couloir = -2 + progression * (LARGEUR + 4)
	viser(repere:point(s + 10, couloir, 5), repere:point(s, couloir, 3.5), dt, 4, 60)
end

local function planPoursuite(dt: number): boolean
	local e = Rendu.affiche[Etat.monId]
	if not e then
		return false
	end
	local tangente = Etat.repere():tangente(e.s)
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
	viser(Etat.repere():point(sTete - 12, LARGEUR + 38, 16), centre + HAUT * 2, dt, 3, 55)
end

local function planArrivee(dt: number)
	local repere = Etat.repere()
	viser(repere:point(0, LARGEUR + 22, 4), repere:point(0, LARGEUR / 2, 2.5), dt, 5, 38)
end

local function planScene(dt: number)
	local hippodrome = Rendu.hippodrome()
	local scene = hippodrome and hippodrome:FindFirstChild("Scene")
	local vue = scene and scene:FindFirstChild("VueCamera") :: BasePart?
	if not vue then
		return
	end
	viser(vue.Position, vue.Position + vue.CFrame.LookVector * 30, dt, 3, 55)
end

local function planPodium(dt: number)
	local hippodrome = Rendu.hippodrome()
	local podium = hippodrome and hippodrome:FindFirstChild("Podium")
	local marche = podium and podium:FindFirstChild("Marche1") :: BasePart?
	if not marche then
		return
	end
	local devant = marche.CFrame * CFrame.new(0, 4, -20)
	viser(devant.Position, marche.Position + HAUT * 4, dt, 3, 50)
end

local function cameraLibre(cam: Camera)
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
end

function Camera.mettreAJour(dt: number)
	local phase = Etat.phase
	local cam = camera()
	for i = #surcharges, 1, -1 do
		local ok, garde = pcall(surcharges[i], dt, cam)
		if ok and garde then
			cam.CameraType = Enum.CameraType.Scriptable
			cadreLisse = cam.CFrame
			return
		end
		table.remove(surcharges, i)
	end
	if phase == "aucune" or phase == "fin" then
		cameraLibre(cam)
		return
	end
	if phase == "lobby" then
		cameraLibre(cam)
		return
	end
	cam.CameraType = Enum.CameraType.Scriptable

	if phase == "presentation" then
		planPresentation(dt)
	elseif phase == "resultats" then
		planPodium(dt)
	elseif phase == "concert" then
		planScene(dt)
	elseif Rendu.ralenti then
		planArrivee(dt)
	elseif Camera.vueTv or Etat.monId == 0 or not planPoursuite(dt) then
		planTv(dt)
	end
end

return Camera
