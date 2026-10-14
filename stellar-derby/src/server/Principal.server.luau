--!strict
-- Point d'entrée du serveur : on bâtit l'hippodrome, on l'habille avec les
-- modèles déposés dans ServerStorage > Ressources s'il y en a, puis on lance
-- les courses.

local Hippodrome = require(script.Parent:WaitForChild("Hippodrome"))
local Habillage = require(script.Parent:WaitForChild("Habillage"))
local BoucleCourse = require(script.Parent:WaitForChild("BoucleCourse"))

Hippodrome.construire()
local poses = Habillage.appliquer()
if poses > 0 then
	print(`[Stellar Derby] décor habillé : {poses} modèles posés depuis ServerStorage.Ressources`)
end
BoucleCourse.demarrer()
