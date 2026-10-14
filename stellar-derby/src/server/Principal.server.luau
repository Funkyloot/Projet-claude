--!strict
-- Point d'entrée du serveur : on bâtit l'hippodrome, puis on lance les courses.

local Hippodrome = require(script.Parent:WaitForChild("Hippodrome"))
local BoucleCourse = require(script.Parent:WaitForChild("BoucleCourse"))

Hippodrome.construire()
BoucleCourse.demarrer()
