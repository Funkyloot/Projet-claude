--!strict
-- Aleatoire — générateur pseudo-aléatoire déterministe (Park–Miller, 31 bits).
--
-- On n'utilise pas Random.new de Roblox : ce module doit aussi tourner hors
-- de Roblox, dans les tests. Et surtout, une même graine avec les mêmes
-- commandes rejoue exactement la même course — c'est ce qui rend les tests,
-- l'équilibrage et plus tard les rediffusions possibles.
--
-- Le produit etat × 48271 reste sous 2^53 : le calcul est exact en flottants.

local MODULE = 2147483647
local MULTIPLICATEUR = 48271

local Aleatoire = {}
Aleatoire.__index = Aleatoire

export type Aleatoire = typeof(setmetatable({} :: { etat: number }, Aleatoire))

function Aleatoire.nouveau(graine: number): Aleatoire
	local etat = math.floor(math.abs(graine)) % MODULE
	if etat == 0 then
		etat = 1
	end
	local self = setmetatable({ etat = etat }, Aleatoire)
	-- Les premières sorties d'un LCG suivent de près la graine : on les jette.
	for _ = 1, 3 do
		self:reel()
	end
	return self
end

-- Réel dans [0, 1[
function Aleatoire.reel(self: Aleatoire): number
	self.etat = (self.etat * MULTIPLICATEUR) % MODULE
	return (self.etat - 1) / (MODULE - 1)
end

-- Réel dans [min, max[
function Aleatoire.entre(self: Aleatoire, min: number, max: number): number
	return min + (max - min) * self:reel()
end

-- Entier dans [min, max], bornes comprises
function Aleatoire.entier(self: Aleatoire, min: number, max: number): number
	return min + math.floor(self:reel() * (max - min + 1))
end

function Aleatoire.melanger<T>(self: Aleatoire, liste: { T }): { T }
	for i = #liste, 2, -1 do
		local j = self:entier(1, i)
		liste[i], liste[j] = liste[j], liste[i]
	end
	return liste
end

function Aleatoire.choisir<T>(self: Aleatoire, liste: { T }): T
	return liste[self:entier(1, #liste)]
end

return Aleatoire
