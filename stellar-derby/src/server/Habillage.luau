--!strict
-- Habillage — remplace le décor dessiné par le code par de vrais modèles,
-- si on en a déposé dans ServerStorage > Ressources.
--
--   ServerStorage
--     Ressources (Folder)
--       Arbres   (Folder)  des modèles d'arbres : ils remplacent les arbres en boules
--       Buissons (Folder)  des buissons : semés autour de la piste
--       Rochers  (Folder)  des rochers : semés dans les collines
--
-- Un dossier absent ou vide ne change rien : le jeu garde son décor.
--
-- Les modèles gratuits de la boutique Roblox contiennent parfois des scripts
-- malveillants (« backdoors »). Ici, tout script est retiré des copies avant
-- qu'elles n'entrent dans le jeu : un modèle déposé ne peut que décorer.
--
-- Le serveur l'applique au lancement. Pour le voir dans Studio sans lancer
-- le jeu, coller dans la barre de commande (View > Command Bar) :
--     require(game.ServerScriptService.Serveur.Habillage).appliquer()

local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Config = require(Partage:WaitForChild("Config"))
local Monde = require(Partage:WaitForChild("Monde"))
local Aleatoire = require(Partage:WaitForChild("Course"):WaitForChild("Aleatoire"))

local Habillage = {}

local function modelesDans(ressources: Instance, nom: string): { Instance }
	local dossier = ressources:FindFirstChild(nom)
	if not dossier then
		return {}
	end
	local liste = {}
	for _, enfant in dossier:GetChildren() do
		if enfant:IsA("Model") or enfant:IsA("BasePart") then
			table.insert(liste, enfant)
		end
	end
	return liste
end

-- Copie sans aucun script, ancrée, et sans collision avec les joueurs
-- au-delà de ce qu'avait le modèle.
local function copiePropre(source: Instance): Model
	local copie = source:Clone()
	local modele: Model
	if copie:IsA("Model") then
		modele = copie :: Model
	else
		modele = Instance.new("Model")
		modele.Name = copie.Name
		copie.Parent = modele
	end
	for _, d in modele:GetDescendants() do
		if d:IsA("LuaSourceContainer") then
			d:Destroy()
		elseif d:IsA("BasePart") then
			(d :: BasePart).Anchored = true
		end
	end
	return modele
end

-- Pose un modèle debout sur le sol, à la hauteur voulue, tourné au hasard.
local function poser(modele: Model, sol: Vector3, hauteur: number, rng: Aleatoire.Aleatoire, parent: Instance)
	local _, taille = modele:GetBoundingBox()
	if taille.Y > 0 then
		modele:ScaleTo(modele:GetScale() * hauteur / taille.Y)
	end
	modele:PivotTo(CFrame.new(sol) * CFrame.Angles(0, rng:entre(0, 2 * math.pi), 0))
	local cadre, nouvelleTaille = modele:GetBoundingBox()
	local bas = cadre.Position.Y - nouvelleTaille.Y / 2
	modele:PivotTo(modele:GetPivot() + Vector3.new(0, sol.Y - bas, 0))
	modele.Parent = parent
end

-- Renvoie le nombre d'éléments posés.
function Habillage.appliquer(): number
	local ressources = ServerStorage:FindFirstChild("Ressources")
	local hippodrome = Workspace:FindFirstChild("Hippodrome")
	if not ressources or not hippodrome then
		return 0
	end
	local decor = hippodrome:FindFirstChild("Decor")
	if not decor then
		return 0
	end
	local rng = Aleatoire.nouveau(4242)
	local poses = 0

	-- Les arbres en boules cèdent leur place aux vrais arbres
	local arbres = modelesDans(ressources, "Arbres")
	if #arbres > 0 then
		for _, ancien in decor:GetChildren() do
			if ancien:IsA("Model") and ancien.Name == "Arbre" then
				local cadre, taille = (ancien :: Model):GetBoundingBox()
				local sol = cadre.Position - Vector3.new(0, taille.Y / 2, 0)
				local nouveau = copiePropre(rng:choisir(arbres))
				nouveau.Name = "ArbreHabille"
				poser(nouveau, sol, rng:entre(18, 32), rng, decor)
				ancien:Destroy()
				poses += 1
			end
		end
	end

	-- Buissons le long de l'extérieur de la piste, rochers plus loin
	local largeur = Config.LARGEUR_PISTE
	local semis = {
		{ dossier = "Buissons", nombre = 60, couloirMin = largeur + 6, couloirMax = largeur + 30, hauteur = { 3, 6 } },
		{ dossier = "Rochers", nombre = 25, couloirMin = largeur + 40, couloirMax = largeur + 90, hauteur = { 4, 12 } },
	}
	for _, s in semis do
		local modeles = modelesDans(ressources, s.dossier)
		if #modeles > 0 then
			for _ = 1, s.nombre do
				local abscisse = rng:entre(0, Monde.piste.longueur)
				-- Pas devant la tribune ni le podium (du poteau des 200 m à l'arrivée + 70 m)
				local relatif = (abscisse + Monde.piste.longueur / 2) % Monde.piste.longueur - Monde.piste.longueur / 2
				if relatif < -200 or relatif > 70 then
					local sol = Monde.point(abscisse, rng:entre(s.couloirMin, s.couloirMax), 0)
					poser(copiePropre(rng:choisir(modeles)), sol, rng:entre(s.hauteur[1], s.hauteur[2]), rng, decor)
					poses += 1
				end
			end
		end
	end
	return poses
end

return Habillage
