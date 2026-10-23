--!strict
-- Tenues — dessine la tenue d'une joueuse sur sa coureuse : une écharpe en
-- bandoulière (devant et dans le dos) et un ruban noué sur la tête.
--
-- Des pièces simples, soudées au torse et à la tête, sans collisions ni
-- masse, aux deux couleurs de la tenue (Jeu/Catalogue). Les bots n'en ont
-- pas : la tenue, c'est ce qui distingue une joueuse dans le peloton.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Catalogue = require(ReplicatedStorage:WaitForChild("Partage"):WaitForChild("Jeu"):WaitForChild("Catalogue"))

local Tenues = {}

local function rgb(c: { number }): Color3
	return Color3.fromRGB(c[1], c[2], c[3])
end

local function souder(piece: BasePart, a: BasePart)
	piece.Anchored = false
	piece.CanCollide = false
	piece.CanQuery = false
	piece.CanTouch = false
	piece.Massless = true
	piece.CastShadow = false
	local soudure = Instance.new("WeldConstraint")
	soudure.Part0 = a
	soudure.Part1 = piece
	soudure.Parent = piece
end

local function bande(parent: BasePart, nom: string, taille: Vector3, cadre: CFrame, couleur: Color3): Part
	local p = Instance.new("Part")
	p.Name = nom
	p.Size = taille
	p.CFrame = cadre
	p.Color = couleur
	p.Material = Enum.Material.Fabric
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	souder(p, parent)
	p.Parent = parent
	return p
end

-- Habille `modele` de la tenue `id` (rien si elle n'existe pas).
function Tenues.habiller(modele: Model, id: string)
	local tenue = Catalogue.obtenir("tenues", id)
	local torse = modele:FindFirstChild("UpperTorso") :: BasePart?
	local tete = modele:FindFirstChild("Head") :: BasePart?
	if not tenue or not torse or not tete then
		return
	end
	local principale = rgb(tenue.couleur)
	local secondaire = if tenue.couleur2 then rgb(tenue.couleur2) else principale
	local t = torse.Size
	local longueur = math.sqrt(t.X * t.X + t.Y * t.Y) * 1.02
	local angle = math.atan2(t.X, t.Y) -- de l'épaule gauche à la hanche droite
	local largeur = 0.17 * t.X

	-- L'écharpe : une bande devant (un peu décollée du dossard), une dans le dos
	for _, face in { -1, 1 } do
		local profondeur = face * (0.5 * t.Z + 0.07)
		local cadre = torse.CFrame * CFrame.new(0, 0, profondeur) * CFrame.Angles(0, 0, face * angle)
		local echarpe = bande(torse, "Echarpe", Vector3.new(largeur, longueur, 0.06), cadre, principale)
		-- Un liseré de la seconde couleur au milieu de la bande
		local lisere =
			bande(echarpe, "Lisere", Vector3.new(largeur * 0.25, longueur * 0.98, 0.07), echarpe.CFrame, secondaire)
		lisere.Material = Enum.Material.SmoothPlastic
	end

	-- Le ruban : deux boucles et un nœud, sur le côté de la tête
	local h = tete.Size
	local noeudCadre = tete.CFrame * CFrame.new(0.32 * h.X, 0.42 * h.Y, 0.1 * h.Z)
	bande(tete, "Noeud", Vector3.new(0.16, 0.16, 0.16) * h.X, noeudCadre, secondaire)
	for _, cote in { -1, 1 } do
		local boucle = noeudCadre * CFrame.new(cote * 0.17 * h.X, 0, 0) * CFrame.Angles(0, 0, cote * 0.35)
		bande(tete, "Boucle", Vector3.new(0.24 * h.X, 0.2 * h.X, 0.08 * h.X), boucle, secondaire)
	end
end

return Tenues
