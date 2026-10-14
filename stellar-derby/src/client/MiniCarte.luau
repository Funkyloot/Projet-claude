--!strict
-- MiniCarte — la piste vue d'en haut, avec un point par coureuse.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Monde = require(Partage:WaitForChild("Monde"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local LARGEUR, HAUTEUR = 240, 120
local MARGE = 8

local MiniCarte = {}

local cadre: Frame
local points: { [number]: Frame } = {}
local minX, maxX, minZ, maxZ = Monde.piste:boite()
local echelle = math.min((LARGEUR - 2 * MARGE) / (maxX - minX), (HAUTEUR - 2 * MARGE) / (maxZ - minZ))
local decalageX = (LARGEUR - (maxX - minX) * echelle) / 2
local decalageY = (HAUTEUR - (maxZ - minZ) * echelle) / 2

-- Le plan x/z de la piste vu du ciel : x vers la droite, z vers le bas,
-- comme la vue de dessus dans Studio.
local function versCarte(x: number, z: number): UDim2
	return UDim2.fromOffset(decalageX + (x - minX) * echelle, decalageY + (z - minZ) * echelle)
end

local function pointPiste(s: number, couloir: number): UDim2
	local x, z = Monde.piste:position(s, couloir)
	return versCarte(x, z)
end

function MiniCarte.creer(parent: Instance): Frame
	cadre = Ui.cadre(
		parent,
		"MiniCarte",
		UDim2.fromOffset(LARGEUR, HAUTEUR),
		UDim2.fromOffset(16, 16),
		Couleurs.FOND_SOMBRE,
		0.25
	)
	Ui.coins(cadre, 14)
	-- Le tracé : deux rangées de petits points, corde et extérieur
	for _, pose in Monde.piste:echantillons(12) do
		for _, couloir in { 0, Monde.piste.largeur } do
			local p = Ui.cadre(
				cadre,
				"Trace",
				UDim2.fromOffset(3, 3),
				versCarte(pose.x + pose.nx * couloir, pose.z + pose.nz * couloir),
				Couleurs.BLANC,
				0.35
			)
			p.AnchorPoint = Vector2.new(0.5, 0.5)
		end
	end
	-- La ligne d'arrivée
	local arrivee =
		Ui.cadre(cadre, "Arrivee", UDim2.fromOffset(3, 9), pointPiste(0, Monde.piste.largeur / 2), Couleurs.ROSE)
	arrivee.AnchorPoint = Vector2.new(0.5, 0.5)
	return cadre
end

local function point(id: number): Frame
	local existant = points[id]
	if existant then
		return existant
	end
	local p = Ui.cadre(cadre, `Coureuse{id}`, UDim2.fromOffset(8, 8), UDim2.new(), Couleurs.BLANC)
	p.AnchorPoint = Vector2.new(0.5, 0.5)
	p.ZIndex = 2
	Ui.coins(p, 4)
	points[id] = p
	return p
end

function MiniCarte.mettreAJour()
	if not cadre then
		return
	end
	local vus: { [number]: boolean } = {}
	for id, e in Rendu.affiche do
		local partante = Etat.parId[id]
		if partante then
			local p = point(id)
			local estMoi = id == Etat.monId
			p.Position = pointPiste(e.s, e.couloir)
			p.BackgroundColor3 = Couleurs.CADRES[partante.cadre]
			p.Size = if estMoi then UDim2.fromOffset(13, 13) else UDim2.fromOffset(8, 8)
			p.ZIndex = if estMoi then 3 else 2
			p.Visible = true
			vus[id] = true
			if estMoi and not p:FindFirstChild("UIStroke") then
				Ui.contour(p, Couleurs.ROSE, 2)
			end
		end
	end
	for id, p in points do
		if not vus[id] then
			p.Visible = false
		end
	end
end

return MiniCarte
