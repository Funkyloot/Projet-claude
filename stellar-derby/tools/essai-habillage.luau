--!nocheck
-- Essai de l'habillage du décor hors de Studio.
--
--     lune run tools/essai-habillage build/StellarDerby.rbxl
--
-- On dépose de faux modèles (un arbre de 10 studs avec un script piégé, un
-- buisson, un rocher) dans ServerStorage.Ressources, on lance
-- Habillage.appliquer(), et on vérifie : arbres remplacés, posés au sol,
-- à la bonne hauteur, et plus aucun script dans le décor. Puis on le relance
-- (aperçu enregistré avec la place, puis lancement du jeu) : rien ne doit
-- doubler ; et après avoir vidé un dossier, son semis doit disparaître.
-- Lune n'a pas les méthodes de Model : on les imite ici (boîte englobante
-- alignée sur les axes, pivot au centre, mise à l'échelle autour du pivot).

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local Vector3, CFrame = roblox.Vector3, roblox.CFrame

local place = roblox.deserializePlace(fs.readFile(process.args[1] or "build/StellarDerby.rbxl"))

roblox.implementMethod("Instance", "WaitForChild", function(i, nom)
	return assert(i:FindFirstChild(nom), nom)
end)

local function pieces(modele)
	local liste = {}
	for _, d in modele:GetDescendants() do
		if d:IsA("BasePart") then
			table.insert(liste, d)
		end
	end
	return liste
end
local function boite(modele)
	local mini, maxi = Vector3.new(math.huge, math.huge, math.huge), Vector3.new(-math.huge, -math.huge, -math.huge)
	for _, p in pieces(modele) do
		local demi = p.Size / 2
		for _, sx in { -1, 1 } do
			for _, sy in { -1, 1 } do
				for _, sz in { -1, 1 } do
					local coin = p.CFrame * Vector3.new(sx * demi.X, sy * demi.Y, sz * demi.Z)
					mini = Vector3.new(math.min(mini.X, coin.X), math.min(mini.Y, coin.Y), math.min(mini.Z, coin.Z))
					maxi = Vector3.new(math.max(maxi.X, coin.X), math.max(maxi.Y, coin.Y), math.max(maxi.Z, coin.Z))
				end
			end
		end
	end
	return CFrame.new((mini + maxi) / 2), maxi - mini
end
roblox.implementMethod("Model", "GetBoundingBox", boite)
roblox.implementMethod("Model", "GetPivot", function(m)
	local c = boite(m)
	return c
end)
roblox.implementMethod("Model", "PivotTo", function(m, cible)
	local delta = cible * m:GetPivot():Inverse()
	for _, p in pieces(m) do
		p.CFrame = delta * p.CFrame
	end
end)
roblox.implementMethod("Model", "GetScale", function(m)
	return m:GetAttribute("_echelle") or 1
end)
roblox.implementMethod("Model", "ScaleTo", function(m, echelle)
	local facteur = echelle / (m:GetAttribute("_echelle") or 1)
	local pivot = m:GetPivot()
	for _, p in pieces(m) do
		local relatif = pivot:Inverse() * p.CFrame
		p.Size = p.Size * facteur
		p.CFrame = pivot * (relatif - relatif.Position + relatif.Position * facteur)
	end
	m:SetAttribute("_echelle", echelle)
end)

-- Faux modèles de la boutique
local ressources = place:GetService("ServerStorage").Ressources
local arbre = roblox.Instance.new("Model")
arbre.Name = "FauxArbre"
local tronc = roblox.Instance.new("Part")
tronc.Size = Vector3.new(2, 6, 2)
tronc.CFrame = CFrame.new(500, 3, 500)
tronc.Parent = arbre
local feuilles = roblox.Instance.new("Part")
feuilles.Size = Vector3.new(8, 4, 8)
feuilles.CFrame = CFrame.new(500, 8, 500)
feuilles.Parent = arbre
local piege = roblox.Instance.new("Script")
piege.Source = "require(123456)"
piege.Parent = arbre
arbre.Parent = ressources.Arbres
for _, nom in { "Buissons", "Rochers" } do
	local m = roblox.Instance.new("Model")
	local p = roblox.Instance.new("Part")
	p.Size = Vector3.new(3, 2, 3)
	p.Parent = m
	m.Parent = ressources[nom]
end

-- Exécution du vrai module
local cache = {}
local function exiger(module)
	if cache[module] ~= nil then
		return cache[module]
	end
	local env = {
		game = place,
		workspace = place:GetService("Workspace"),
		script = module,
		require = exiger,
		Instance = roblox.Instance,
		Vector3 = Vector3,
		CFrame = CFrame,
		Color3 = roblox.Color3,
		Enum = roblox.Enum,
		Font = roblox.Font,
	}
	cache[module] = luau.load(module.Source, { debugName = module:GetFullName(), environment = env })()
	return cache[module]
end

local decor = place:GetService("Workspace").Hippodrome.Decor
local arbresAvant = 0
for _, m in decor:GetChildren() do
	if m.Name == "Arbre" then
		arbresAvant += 1
	end
end
local Habillage = exiger(place:GetService("ServerScriptService").Serveur.Habillage)
local poses = Habillage.appliquer()

local restants, habilles, scripts, hauteurMin, hauteurMax, solMax = 0, 0, 0, math.huge, 0, 0
for _, m in decor:GetChildren() do
	if m.Name == "Arbre" then
		restants += 1
	elseif m.Name == "ArbreHabille" then
		habilles += 1
		local cadre, taille = m:GetBoundingBox()
		hauteurMin, hauteurMax = math.min(hauteurMin, taille.Y), math.max(hauteurMax, taille.Y)
		solMax = math.max(solMax, math.abs(cadre.Position.Y - taille.Y / 2))
	end
end
for _, d in decor:GetDescendants() do
	if d:IsA("LuaSourceContainer") then
		scripts += 1
	end
end
print(`{poses} éléments posés ; arbres : {arbresAvant} avant, {habilles} remplacés, {restants} restants`)
print(
	string.format(
		"hauteur des arbres %.1f à %.1f studs ; écart au sol max %.3f ; scripts dans le décor : %d",
		hauteurMin,
		hauteurMax,
		solMax,
		scripts
	)
)
assert(restants == 0 and habilles == arbresAvant, "des arbres n'ont pas été remplacés")
assert(hauteurMin >= 17.9 and hauteurMax <= 32.1, "hauteur hors bornes")
assert(solMax < 0.01, "arbres pas posés au sol")
assert(scripts == 0, "un script est entré dans le décor")
assert(#ressources.Arbres.FauxArbre:GetChildren() == 3, "le modèle source a été modifié")

-- Deuxième passage, comme au lancement d'une place enregistrée après un
-- aperçu : le décor doit rester identique, sans rien doubler
local function compter()
	local n = { total = 0, ArbreHabille = 0, Arbre = 0, Buissons = 0, Rochers = 0 }
	for _, m in decor:GetChildren() do
		n.total += 1
		if n[m.Name] then
			n[m.Name] += 1
		end
		local semis = m:GetAttribute("SemisHabillage")
		if semis then
			n[semis] += 1
		end
	end
	return n
end
local avant = compter()
local poses2 = Habillage.appliquer()
local apres = compter()
print(
	`2e passage : {poses2} posés ; décor {avant.total} → {apres.total} éléments `
		.. `(arbres {apres.ArbreHabille}, buissons {apres.Buissons}, rochers {apres.Rochers})`
)
assert(poses2 == poses, "le deuxième passage n'a pas posé autant d'éléments que le premier")
for _, cle in { "total", "ArbreHabille", "Arbre", "Buissons", "Rochers" } do
	assert(apres[cle] == avant[cle], `le deuxième passage a changé le nombre de « {cle} »`)
end

-- Dossier Buissons vidé : son semis disparaît, le reste ne bouge pas
ressources.Buissons:ClearAllChildren()
Habillage.appliquer()
local vide = compter()
print(`Buissons retirés : {vide.Buissons} buissons, {vide.Rochers} rochers, {vide.ArbreHabille} arbres`)
assert(vide.Buissons == 0, "des buissons sont restés après qu'on a vidé leur dossier")
assert(vide.Rochers == avant.Rochers and vide.ArbreHabille == avant.ArbreHabille, "le reste du décor a changé")
print("Habillage : OK")
