--!nocheck
-- Décor — exécute les constructeurs du monde (l'Académie et les trois
-- hippodromes) hors de Studio et les enregistre dans la place, pour qu'ils
-- soient visibles dès l'ouverture dans Studio.
--
--     rojo build -o build/StellarDerby.rbxl
--     lune run tools/decor build/StellarDerby.rbxl
--
-- Le code exécuté est exactement celui du jeu (src/server/Academie.luau et
-- Hippodrome.luau), lu depuis la place construite par Rojo : si ce script
-- passe, les constructeurs ne plantent pas. Seul le terrain (voxels) n'est pas
-- enregistrable ici ; le serveur le remplit au lancement de toute façon.

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local roblox = require("@lune/roblox")

local chemin = process.args[1] or "build/StellarDerby.rbxl"
local place = roblox.deserializePlace(fs.readFile(chemin))

-- Le terrain se remplit au lancement du serveur : ici on se contente de
-- compter les appels pour vérifier qu'ils ont bien lieu.
local remplissages = 0
for _, methode in { "FillBlock", "FillCylinder", "FillBall", "SetMaterialColor" } do
	roblox.implementMethod("Terrain", methode, function()
		remplissages += 1
	end)
end

-- Lune ne fournit pas WaitForChild (il n'y a rien à attendre hors ligne)
roblox.implementMethod("Instance", "WaitForChild", function(instance, nom)
	local enfant = instance:FindFirstChild(nom)
	assert(enfant, `{instance:GetFullName()} n'a pas d'enfant « {nom} »`)
	return enfant
end)

local environnementCommun = {
	game = place,
	workspace = place:GetService("Workspace"),
	Instance = roblox.Instance,
	Vector3 = roblox.Vector3,
	Vector2 = roblox.Vector2,
	CFrame = roblox.CFrame,
	Color3 = roblox.Color3,
	UDim = roblox.UDim,
	UDim2 = roblox.UDim2,
	Enum = roblox.Enum,
	Font = roblox.Font,
	NumberSequence = roblox.NumberSequence,
	ColorSequence = roblox.ColorSequence,
	NumberRange = roblox.NumberRange,
}

local cache = {}
local function exiger(module)
	if cache[module] ~= nil then
		return cache[module]
	end
	assert(module:IsA("ModuleScript"), `{module:GetFullName()} n'est pas un ModuleScript`)
	local environnement = table.clone(environnementCommun)
	environnement.script = module
	environnement.require = exiger
	local fonction = luau.load(module.Source, { debugName = module:GetFullName(), environment = environnement })
	cache[module] = fonction()
	return cache[module]
end

local workspace = place:GetService("Workspace")
for _, nom in { "Hippodrome", "Hippodromes", "Academie" } do
	local ancien = workspace:FindFirstChild(nom)
	if ancien then
		ancien:Destroy()
	end
end

local serveur = place:GetService("ServerScriptService").Serveur
local partage = place:GetService("ReplicatedStorage").Partage
local Academie = exiger(serveur.Academie)
local Hippodrome = exiger(serveur.Hippodrome)
local Stalles = exiger(partage.Stalles)
local Monde = exiger(partage.Monde)
local Pistes = exiger(partage.Course.Pistes)

local academie = Academie.construire()
assert(academie.apparition, "l'Académie n'a pas de point d'apparition")

local function compter(racine)
	local pieces, guis, invites = 0, 0, 0
	for _, i in racine:GetDescendants() do
		if i:IsA("BasePart") then
			pieces += 1
		elseif i:IsA("SurfaceGui") then
			guis += 1
		elseif i:IsA("ProximityPrompt") then
			invites += 1
		end
	end
	return pieces, guis, invites
end

local total = 0
local p, g, inv = compter(workspace.Academie)
total += p
print(`Académie : {p} pièces, {g} panneaux, {inv} invites`)

for _, def in Pistes.liste do
	local reperes = Hippodrome.construire(def.id)
	assert(
		reperes.ecran and reperes.tribune and reperes.scene and #reperes.podium == 3,
		`{def.id} : repères incomplets`
	)
	for _, nom in { "Place1", "Place2", "Place3", "Fosse", "VueCamera" } do
		assert(reperes.scene:FindFirstChild(nom), `{def.id} : la scène n'a pas de {nom}`)
	end
	-- Les stalles d'une course : construites puis retirées, pour vérifier
	-- qu'elles se montent sans erreur pour chaque taille de peloton.
	for _, partantes in { 8, 12, 16, 30 } do
		Stalles.construire(Monde.pour(def.id), 2000, partantes, workspace):Destroy()
	end
	local pieces, guis, invites = compter(reperes.racine)
	total += pieces
	print(`{def.nom} : {pieces} pièces, {guis} panneaux, {invites} invites`)
end
print(`Monde : {total} pièces en tout, {remplissages} remplissages de terrain`)

fs.writeFile(chemin, roblox.serializePlace(place))
print(`→ {chemin}`)
