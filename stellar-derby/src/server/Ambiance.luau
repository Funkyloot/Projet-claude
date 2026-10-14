--!strict
-- Ambiance — lumière et atmosphère selon la météo de la course.
-- La pluie elle-même est un effet client (voir client/Effets).

local Lighting = game:GetService("Lighting")

local Ambiance = {}

type Reglage = {
	heure: number,
	luminosite: number,
	ambiance: Color3,
	exterieur: Color3,
	densite: number,
	brume: number,
	teinte: Color3,
}

local REGLAGES: { [string]: Reglage } = {
	soleil = {
		heure = 13.5,
		luminosite = 3,
		ambiance = Color3.fromRGB(120, 120, 130),
		exterieur = Color3.fromRGB(150, 150, 160),
		densite = 0.25,
		brume = 0,
		teinte = Color3.fromRGB(200, 225, 255),
	},
	matin = {
		heure = 7.2,
		luminosite = 2.4,
		ambiance = Color3.fromRGB(130, 120, 140),
		exterieur = Color3.fromRGB(170, 150, 160),
		densite = 0.35,
		brume = 1,
		teinte = Color3.fromRGB(255, 220, 230),
	},
	couchant = {
		heure = 17.6,
		luminosite = 2.2,
		ambiance = Color3.fromRGB(140, 110, 110),
		exterieur = Color3.fromRGB(180, 130, 120),
		densite = 0.3,
		brume = 1.5,
		teinte = Color3.fromRGB(255, 190, 150),
	},
	pluie = {
		heure = 14,
		luminosite = 1.2,
		ambiance = Color3.fromRGB(100, 105, 115),
		exterieur = Color3.fromRGB(110, 115, 125),
		densite = 0.5,
		brume = 2.5,
		teinte = Color3.fromRGB(170, 180, 195),
	},
}

local function atmosphere(): Atmosphere
	local existante = Lighting:FindFirstChildOfClass("Atmosphere") :: Atmosphere?
	if existante then
		return existante
	end
	local nouvelle = Instance.new("Atmosphere")
	nouvelle.Parent = Lighting
	return nouvelle
end

function Ambiance.appliquer(meteo: string)
	local r = REGLAGES[meteo] or REGLAGES.soleil
	Lighting.ClockTime = r.heure
	Lighting.Brightness = r.luminosite
	Lighting.Ambient = r.ambiance
	Lighting.OutdoorAmbient = r.exterieur
	Lighting.GlobalShadows = true
	local a = atmosphere()
	a.Density = r.densite
	a.Haze = r.brume
	a.Color = r.teinte
	a.Decay = r.teinte
	Lighting:SetAttribute("Meteo", meteo)
end

return Ambiance
