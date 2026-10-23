--!strict
-- Monde — passage d'une piste (mètres, plan x/z) au monde Roblox (studs, 3D).
--
-- Il y a trois hippodromes, chacun posé à son endroit du monde (voir
-- Course/Pistes), et l'Académie au centre. Chaque hippodrome a son repère :
--
--     local repere = Monde.pour("baie")
--     repere:point(s, couloir, hauteur)   -- position à s mètres de l'arrivée
--
-- Serveur et clients construisent les mêmes repères à partir des mêmes
-- définitions : ils tombent d'accord sans rien s'envoyer.

local Config = require(script.Parent:WaitForChild("Config"))
local Pistes = require(script.Parent:WaitForChild("Course"):WaitForChild("Pistes"))
local Piste = require(script.Parent:WaitForChild("Course"):WaitForChild("Piste"))

local ECHELLE = Config.METRES_EN_STUDS

local Repere = {}
Repere.__index = Repere

export type Repere = typeof(setmetatable(
	{} :: {
		id: string,
		piste: Piste.Piste,
		origine: Vector3, -- centre de l'hippodrome dans le monde
		centreX: number, -- centre de la piste dans son plan, en mètres
		centreZ: number,
		demiLargeur: number, -- demi-étendue de la piste, en studs
		demiProfondeur: number,
	},
	Repere
))

local Monde = {
	ECHELLE = ECHELLE,
	-- Hauteur (studs) du dessus de la piste, où se posent les pieds
	SOL = 0.06,
	-- Centre de l'Académie, le hub où l'on apparaît
	ACADEMIE = Vector3.new(0, 0, 0),
	-- Rayon de l'île de l'Académie, en studs
	RAYON_ACADEMIE = 260,
}

local reperes: { [string]: Repere } = {}

-- Le repère d'un hippodrome (construit une fois).
function Monde.pour(id: string): Repere
	local existant = reperes[id]
	if existant then
		return existant
	end
	local def = Pistes.parId(id) or Pistes.liste[1]
	local piste = Pistes.geometrie(def.id)
	local minX, maxX, minZ, maxZ = piste:boite()
	local repere = setmetatable({
		id = def.id,
		piste = piste,
		origine = Vector3.new(def.origine.x, 0, def.origine.z),
		centreX = (minX + maxX) / 2,
		centreZ = (minZ + maxZ) / 2,
		demiLargeur = (maxX - minX) / 2 * ECHELLE,
		demiProfondeur = (maxZ - minZ) / 2 * ECHELLE,
	}, Repere)
	reperes[id] = repere
	reperes[def.id] = repere
	return repere
end

-- Tous les repères, dans l'ordre de Pistes.liste.
function Monde.tous(): { Repere }
	local liste = {}
	for _, def in Pistes.liste do
		table.insert(liste, Monde.pour(def.id))
	end
	return liste
end

-- Point du plan de la piste (mètres) vers une position du monde (studs).
function Repere.versMonde(self: Repere, x: number, z: number, hauteur: number?): Vector3
	return self.origine + Vector3.new((x - self.centreX) * ECHELLE, hauteur or 0, (z - self.centreZ) * ECHELLE)
end

-- Position à `couloir` mètres de la corde, au point s de la piste.
function Repere.point(self: Repere, s: number, couloir: number, hauteur: number?): Vector3
	local p = self.piste:pose(s)
	return self:versMonde(p.x + p.nx * couloir, p.z + p.nz * couloir, hauteur)
end

-- Repère tourné dans le sens de la course : LookVector suit la piste,
-- RightVector pointe vers… la corde ou l'extérieur selon le sens de rotation.
-- Utiliser exterieur() plutôt que de supposer l'un ou l'autre.
function Repere.cadre(self: Repere, s: number, couloir: number, hauteur: number?): CFrame
	local p = self.piste:pose(s)
	local position = self:versMonde(p.x + p.nx * couloir, p.z + p.nz * couloir, hauteur)
	return CFrame.lookAt(position, position + Vector3.new(p.tx, 0, p.tz))
end

function Repere.tangente(self: Repere, s: number): Vector3
	local p = self.piste:pose(s)
	return Vector3.new(p.tx, 0, p.tz)
end

-- Direction horizontale de la corde vers l'extérieur de la piste.
function Repere.exterieur(self: Repere, s: number): Vector3
	local p = self.piste:pose(s)
	return Vector3.new(p.nx, 0, p.nz)
end

-- Hauteur de la racine d'un modèle R15 pour que ses pieds touchent la piste.
function Monde.hauteurRacine(modele: Model): number
	local humanoide = modele:FindFirstChildOfClass("Humanoid") :: Humanoid?
	local racine = modele:FindFirstChild("HumanoidRootPart") :: BasePart?
	if humanoide and racine then
		return Monde.SOL + humanoide.HipHeight + racine.Size.Y / 2
	end
	return Monde.SOL + 3
end

return Monde
