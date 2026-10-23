--!strict
-- Habillage — remplace le décor dessiné par le code par de vrais modèles,
-- si on en a déposé dans ServerStorage > Ressources.
--
--   ServerStorage
--     Ressources (Folder)
--       Arbres   (Folder)  des modèles d'arbres : ils remplacent les arbres en boules
--       Buissons (Folder)  des buissons : semés autour des pistes et sur l'Académie
--       Rochers  (Folder)  des rochers : semés dans les collines
--
-- Les palmiers de la Baie et les sapins des Falaises font partie du thème de
-- leur hippodrome : ils ne sont pas remplacés.
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
--
-- On peut l'appliquer autant de fois qu'on veut : chaque passage reprend
-- l'habillage du précédent au lieu de s'y ajouter. Un aperçu enregistré avec
-- la place ne double donc rien au lancement, et un changement de modèles
-- dans Ressources est toujours pris en compte. Seule limite : une fois les
-- arbres en boules remplacés, vider Ressources > Arbres ne les fait pas
-- revenir (les vrais arbres restent en place).

local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Monde = require(Partage:WaitForChild("Monde"))
local Aleatoire = require(Partage:WaitForChild("Course"):WaitForChild("Aleatoire"))
local Pistes = require(Partage:WaitForChild("Course"):WaitForChild("Pistes"))

local Habillage = {}

-- Attribut posé sur chaque buisson ou rocher semé : il vaut le nom du
-- dossier d'origine, pour retrouver le semis au passage suivant.
local SEMIS = "SemisHabillage"

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

-- Une graine fixe par lieu et par sorte de modèle : vider un dossier ne
-- déplace pas ce qui a été semé ailleurs.
local function graine(texte: string): number
	local h = 4242
	for i = 1, #texte do
		h = (h * 31 + string.byte(texte, i)) % 2147483646
	end
	return h + 1
end

-- Remplace les arbres en boules d'un dossier de décor.
local function habillerArbres(decor: Instance, arbres: { Instance }, rng: Aleatoire.Aleatoire): number
	local poses = 0
	if #arbres == 0 then
		return 0
	end
	for _, ancien in decor:GetChildren() do
		if ancien:IsA("Model") and (ancien.Name == "Arbre" or ancien.Name == "ArbreHabille") then
			local cadre, taille = (ancien :: Model):GetBoundingBox()
			local sol = cadre.Position - Vector3.new(0, taille.Y / 2, 0)
			local nouveau = copiePropre(rng:choisir(arbres))
			nouveau.Name = "ArbreHabille"
			poser(nouveau, sol, rng:entre(18, 32), rng, decor)
			ancien:Destroy()
			poses += 1
		end
	end
	return poses
end

local function retirerSemis(decor: Instance, dossier: string)
	for _, ancien in decor:GetChildren() do
		if ancien:GetAttribute(SEMIS) == dossier then
			ancien:Destroy()
		end
	end
end

-- Buissons le long de l'extérieur de la piste, rochers plus loin.
local function semerAutourDePiste(decor: Instance, repere: Monde.Repere, ressources: Instance): number
	local poses = 0
	local largeur = repere.piste.largeur
	local longueur = repere.piste.longueur
	local semis = {
		{ dossier = "Buissons", nombre = 60, couloirMin = largeur + 6, couloirMax = largeur + 30, hauteur = { 3, 6 } },
		{ dossier = "Rochers", nombre = 25, couloirMin = largeur + 40, couloirMax = largeur + 90, hauteur = { 4, 12 } },
	}
	for _, s in semis do
		-- Le semis d'un habillage précédent est retiré avant d'en refaire un
		retirerSemis(decor, s.dossier)
		local modeles = modelesDans(ressources, s.dossier)
		local rng = Aleatoire.nouveau(graine(repere.id .. s.dossier))
		if #modeles > 0 then
			for _ = 1, s.nombre do
				local abscisse = rng:entre(0, longueur)
				-- Pas devant la tribune ni le podium (du poteau des 200 m à l'arrivée + 70 m)
				local relatif = (abscisse + longueur / 2) % longueur - longueur / 2
				if relatif < -200 or relatif > 70 then
					local sol = repere:point(abscisse, rng:entre(s.couloirMin, s.couloirMax), 0)
					local modele = copiePropre(rng:choisir(modeles))
					modele:SetAttribute(SEMIS, s.dossier)
					poser(modele, sol, rng:entre(s.hauteur[1], s.hauteur[2]), rng, decor)
					poses += 1
				end
			end
		end
	end
	return poses
end

-- À l'Académie : quelques buissons et rochers sur le pourtour de l'île.
local function semerAcademie(decor: Instance, ressources: Instance): number
	local poses = 0
	local semis = {
		{ dossier = "Buissons", nombre = 30, rayon = { 70, Monde.RAYON_ACADEMIE - 20 }, hauteur = { 3, 6 } },
		{
			dossier = "Rochers",
			nombre = 10,
			rayon = { Monde.RAYON_ACADEMIE - 60, Monde.RAYON_ACADEMIE - 15 },
			hauteur = { 4, 10 },
		},
	}
	for _, s in semis do
		retirerSemis(decor, s.dossier)
		local modeles = modelesDans(ressources, s.dossier)
		local rng = Aleatoire.nouveau(graine("academie" .. s.dossier))
		if #modeles > 0 then
			for _ = 1, s.nombre do
				local angle = rng:entre(0, 2 * math.pi)
				local recul = rng:entre(s.rayon[1], s.rayon[2])
				local sol = Monde.ACADEMIE + Vector3.new(math.cos(angle) * recul, 0, math.sin(angle) * recul)
				-- Pas sur les allées ni devant les bâtiments : seulement entre eux
				local angleRelatif = (angle % (math.pi / 4)) / (math.pi / 4)
				if angleRelatif > 0.3 and angleRelatif < 0.7 then
					local modele = copiePropre(rng:choisir(modeles))
					modele:SetAttribute(SEMIS, s.dossier)
					poser(modele, sol, rng:entre(s.hauteur[1], s.hauteur[2]), rng, decor)
					poses += 1
				end
			end
		end
	end
	return poses
end

-- Renvoie le nombre d'éléments posés, sur les trois hippodromes et l'Académie.
function Habillage.appliquer(): number
	local ressources = ServerStorage:FindFirstChild("Ressources")
	if not ressources then
		return 0
	end
	local poses = 0
	local arbres = modelesDans(ressources, "Arbres")

	local hippodromes = Workspace:FindFirstChild("Hippodromes")
	if hippodromes then
		for _, def in Pistes.liste do
			local racine = hippodromes:FindFirstChild(def.id)
			local decor = racine and racine:FindFirstChild("Decor")
			if decor then
				poses += habillerArbres(decor, arbres, Aleatoire.nouveau(graine(def.id .. "Arbres")))
				poses += semerAutourDePiste(decor, Monde.pour(def.id), ressources)
			end
		end
	end

	local academie = Workspace:FindFirstChild("Academie")
	local decorAcademie = academie and academie:FindFirstChild("Decor")
	if decorAcademie then
		poses += habillerArbres(decorAcademie, arbres, Aleatoire.nouveau(graine("academieArbres")))
		poses += semerAcademie(decorAcademie, ressources)
	end
	return poses
end

return Habillage
