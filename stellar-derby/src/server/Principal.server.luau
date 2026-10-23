--!strict
-- Point d'entrée du serveur : on bâtit le monde (l'Académie, les trois
-- hippodromes), on l'habille avec les modèles déposés dans
-- ServerStorage > Ressources s'il y en a, puis on lance les services.

local Academie = require(script.Parent:WaitForChild("Academie"))
local Hippodrome = require(script.Parent:WaitForChild("Hippodrome"))
local Habillage = require(script.Parent:WaitForChild("Habillage"))
local Lieux = require(script.Parent:WaitForChild("Lieux"))
local Profils = require(script.Parent:WaitForChild("Profils"))
local Sessions = require(script.Parent:WaitForChild("Sessions"))
local Recompenses = require(script.Parent:WaitForChild("Recompenses"))
local CoursesPubliques = require(script.Parent:WaitForChild("CoursesPubliques"))

Academie.construire()
Hippodrome.construireTout()
local poses = Habillage.appliquer()
if poses > 0 then
	print(`[Stellar Derby] décor habillé : {poses} modèles posés depuis ServerStorage.Ressources`)
end

Lieux.demarrer()
Profils.demarrer()
Sessions.definirProfil(function(joueur)
	local d = Profils.obtenir(joueur)
	if not d then
		return nil
	end
	return { robe = d.equipement.robe, tenue = d.equipement.tenue, robes = d.possessions.robes }
end)
Sessions.demarrer()
Recompenses.demarrer()
CoursesPubliques.demarrer()

-- Les fonctionnalités : chacune démarre à part, et une erreur dans l'une
-- n'empêche pas les autres de tourner.
for _, nom in
	{
		"ServiceBoutique",
		"ServiceEntrainement",
		"ServiceCarriere",
		"ServiceConcert",
		"ServiceRivales",
		"Classements",
		"ServiceDuo",
		"ServiceTutoriel",
		"ModeLive",
	}
do
	local ok, erreur = pcall(function()
		local module = require(script.Parent:WaitForChild(nom)) :: any
		module.demarrer()
	end)
	if not ok then
		warn(`[Stellar Derby] {nom} n'a pas pu démarrer : {erreur}`)
	end
end
