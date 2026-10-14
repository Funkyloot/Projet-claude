--!nocheck
-- Décor — exécute le constructeur d'hippodrome hors de Studio et l'enregistre
-- dans la place, pour qu'il soit visible dès l'ouverture dans Studio.
--
--     rojo build -o build/StellarDerby.rbxl
--     lune run tools/decor build/StellarDerby.rbxl
--
-- Le code exécuté est exactement celui du jeu (src/server/Hippodrome.luau),
-- lu depuis la place construite par Rojo : si ce script passe, le
-- constructeur ne plante pas. Seul le terrain (voxels) n'est pas
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
for _, methode in { "FillBlock", "FillCylinder", "FillBall" } do
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
local ancien = workspace:FindFirstChild("Hippodrome")
if ancien then
	ancien:Destroy()
end

local Hippodrome = exiger(place:GetService("ServerScriptService").Serveur.Hippodrome)
local reperes = Hippodrome.construire()
assert(reperes.ecran and reperes.apparition and #reperes.podium == 3, "repères incomplets")

-- Les stalles d'une course : construites puis retirées, pour vérifier
-- qu'elles se montent sans erreur pour chaque taille de peloton.
for _, partantes in { 8, 12, 16 } do
	Hippodrome.construireStalles(2000, partantes):Destroy()
end

local pieces, guis = 0, 0
for _, i in workspace.Hippodrome:GetDescendants() do
	if i:IsA("BasePart") then
		pieces += 1
	elseif i:IsA("SurfaceGui") then
		guis += 1
	end
end
print(`Hippodrome : {pieces} pièces, {guis} panneaux, {remplissages} remplissages de terrain`)

fs.writeFile(chemin, roblox.serializePlace(place))
print(`→ {chemin}`)
