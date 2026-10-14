--!strict
-- Effets — la pluie, quand la course se court sous l'averse.
-- Un émetteur suit la caméra : on ne mouille que ce que le joueur voit.

local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")

local Effets = {}

local nuage: Part? = nil

local function creerNuage(): Part
	local p = Instance.new("Part")
	p.Name = "NuageDePluie"
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Transparency = 1
	p.Size = Vector3.new(90, 1, 90)
	local gouttes = Instance.new("ParticleEmitter")
	gouttes.Name = "Gouttes"
	gouttes.EmissionDirection = Enum.NormalId.Bottom
	gouttes.Rate = 600
	gouttes.Lifetime = NumberRange.new(0.6, 0.9)
	gouttes.Speed = NumberRange.new(70, 90)
	gouttes.Size = NumberSequence.new(0.08)
	gouttes.Squash = NumberSequence.new(2.5)
	gouttes.Orientation = Enum.ParticleOrientation.VelocityParallel
	gouttes.Transparency = NumberSequence.new(0.35)
	gouttes.Color = ColorSequence.new(Color3.fromRGB(210, 220, 235))
	gouttes.LightInfluence = 0.6
	gouttes.Parent = p
	p.Parent = Workspace
	return p
end

function Effets.mettreAJour()
	local pluie = Lighting:GetAttribute("Meteo") == "pluie"
	if pluie and not nuage then
		nuage = creerNuage()
	elseif not pluie and nuage then
		nuage:Destroy()
		nuage = nil
	end
	local n = nuage
	if n then
		local camera = Workspace.CurrentCamera
		n.CFrame = CFrame.new(camera.CFrame.Position + Vector3.new(0, 30, 0) + camera.CFrame.LookVector * 20)
	end
end

return Effets
