--!strict
-- Monde — passage de la piste (mètres, plan x/z) au monde Roblox (studs, 3D).
--
-- Serveur et clients partagent la même piste : celle-ci, construite une fois
-- à partir de Config. La piste est centrée sur l'origine du monde.

local Config = require(script.Parent:WaitForChild("Config"))
local Piste = require(script.Parent:WaitForChild("Course"):WaitForChild("Piste"))

local ECHELLE = Config.METRES_EN_STUDS

local piste = Piste.stade(Config.LIGNE_DROITE, Config.RAYON_VIRAGE, Config.LARGEUR_PISTE, Config.POSITION_ARRIVEE)
local minX, maxX, minZ, maxZ = piste:boite()

local Monde = {
	piste = piste,
	ECHELLE = ECHELLE,
	-- Hauteur (studs) du dessus de la piste, où se posent les pieds
	SOL = 0.06,
	centreX = (minX + maxX) / 2,
	centreZ = (minZ + maxZ) / 2,
	-- Demi-étendue de l'hippodrome en studs, pour dimensionner le décor
	demiLargeur = (maxX - minX) / 2 * ECHELLE,
	demiProfondeur = (maxZ - minZ) / 2 * ECHELLE,
}

-- Point du plan de la piste (mètres) vers une position du monde (studs).
function Monde.versMonde(x: number, z: number, hauteur: number?): Vector3
	return Vector3.new((x - Monde.centreX) * ECHELLE, hauteur or 0, (z - Monde.centreZ) * ECHELLE)
end

-- Position à `couloir` mètres de la corde, au point s de la piste.
function Monde.point(s: number, couloir: number, hauteur: number?): Vector3
	local p = piste:pose(s)
	return Monde.versMonde(p.x + p.nx * couloir, p.z + p.nz * couloir, hauteur)
end

-- Repère tourné dans le sens de la course : LookVector suit la piste,
-- RightVector pointe vers… la corde ou l'extérieur selon le sens de rotation.
-- Utiliser Monde.exterieur() plutôt que de supposer l'un ou l'autre.
function Monde.cadre(s: number, couloir: number, hauteur: number?): CFrame
	local p = piste:pose(s)
	local position = Monde.versMonde(p.x + p.nx * couloir, p.z + p.nz * couloir, hauteur)
	return CFrame.lookAt(position, position + Vector3.new(p.tx, 0, p.tz))
end

function Monde.tangente(s: number): Vector3
	local p = piste:pose(s)
	return Vector3.new(p.tx, 0, p.tz)
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

-- Direction horizontale de la corde vers l'extérieur de la piste.
function Monde.exterieur(s: number): Vector3
	local p = piste:pose(s)
	return Vector3.new(p.nx, 0, p.nz)
end

return Monde
