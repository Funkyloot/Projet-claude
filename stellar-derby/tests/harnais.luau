--!nocheck
-- Harnais — fait tourner les modules du jeu hors de Roblox, avec Lune.
--
-- Les modules du jeu se requièrent à la manière de Roblox :
--     require(script.Parent:WaitForChild("Piste"))
-- Ce harnais reconstruit un arbre d'instances factices à partir des fichiers
-- (selon les conventions de Rojo : un dossier devient un Folder, X.luau un
-- ModuleScript nommé X) et fournit à chaque module son propre `script` et un
-- `require` qui sait suivre ces instances. Les modules restent inchangés.

local fs = require("@lune/fs")
local luau = require("@lune/luau")

local Harnais = {}

local Noeud = {}

local function enfant(noeud, nom)
	return rawget(noeud, "_enfants")[nom]
end

Noeud.__index = function(noeud, cle)
	if cle == "WaitForChild" then
		return function(self, nom)
			local trouve = enfant(self, nom)
			assert(trouve, `{rawget(self, "Name")} n'a pas d'enfant « {nom} »`)
			return trouve
		end
	elseif cle == "FindFirstChild" then
		return function(self, nom)
			return enfant(self, nom)
		end
	end
	local trouve = enfant(noeud, cle)
	if trouve == nil then
		error(`{cle} n'est pas un membre de {rawget(noeud, "Name")}`, 2)
	end
	return trouve
end

local function nouveauNoeud(nom: string, parent, chemin: string?)
	return setmetatable({ Name = nom, Parent = parent, _enfants = {}, _chemin = chemin }, Noeud)
end

local function construire(chemin: string, nom: string, parent)
	local noeud = nouveauNoeud(nom, parent, nil)
	for _, entree in fs.readDir(chemin) do
		local sous = chemin .. "/" .. entree
		if fs.isDir(sous) then
			noeud._enfants[entree] = construire(sous, entree, noeud)
		elseif string.match(entree, "%.luau$") then
			local base = string.gsub(entree, "%.luau$", "")
			if base == "init" then
				noeud._chemin = sous
			else
				base = string.gsub(string.gsub(base, "%.server$", ""), "%.client$", "")
				noeud._enfants[base] = nouveauNoeud(base, noeud, sous)
			end
		end
	end
	return noeud
end

local cache = {}

local function exiger(noeud)
	if cache[noeud] ~= nil then
		return cache[noeud]
	end
	local chemin = rawget(noeud, "_chemin")
	assert(chemin, `{rawget(noeud, "Name")} n'est pas un module`)
	local fonction = luau.load(fs.readFile(chemin), {
		debugName = chemin,
		environment = { script = noeud, require = exiger },
	})
	local resultat = fonction()
	cache[noeud] = resultat
	return resultat
end

-- Arbre des modules partagés, enraciné comme dans le jeu (ReplicatedStorage.Partage).
function Harnais.partage(racine: string?)
	return construire((racine or "src") .. "/shared", "Partage", nil)
end

Harnais.require = exiger

-- Mini-cadre de tests
local reussis, echoues = 0, 0

function Harnais.test(nom: string, corps: () -> ())
	local ok, erreur = pcall(corps)
	if ok then
		reussis += 1
		print(`  ✓ {nom}`)
	else
		echoues += 1
		print(`  ✗ {nom}\n      {erreur}`)
	end
end

function Harnais.proche(a: number, b: number, tolerance: number, message: string?)
	if math.abs(a - b) > tolerance then
		error(`{message or "valeurs"} : {a} au lieu de {b} (± {tolerance})`, 2)
	end
end

function Harnais.bilan(): boolean
	print(`\n{reussis} réussis, {echoues} échoués`)
	return echoues == 0
end

return Harnais
