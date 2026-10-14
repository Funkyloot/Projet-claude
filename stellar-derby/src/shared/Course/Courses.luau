--!strict
-- Courses — le calendrier de l'hippodrome.
--
-- Les distances ne sont pas choisies au hasard : avec la piste par défaut
-- (lignes droites de 300 m, virages de 95 m de rayon, arrivée à 80 % de la
-- ligne des tribunes), les stalles de 1 400, 1 800, 2 000 et 2 600 m tombent
-- toutes sur une ligne droite. Un test le vérifie.

export type Course = {
	id: string,
	nom: string,
	distance: number,
	categorie: string,
	etat: "bon" | "lourd",
	meteo: "soleil" | "matin" | "couchant" | "pluie",
}

local Courses = {}

Courses.liste = {
	{
		id = "alizes",
		nom = "Coupe des Alizés",
		distance = 1400,
		categorie = "Sprint",
		etat = "bon",
		meteo = "soleil",
	},
	{
		id = "aube",
		nom = "Prix de l'Aube",
		distance = 1800,
		categorie = "Mile",
		etat = "bon",
		meteo = "matin",
	},
	{
		id = "archipel",
		nom = "Grand Prix de l'Archipel",
		distance = 2000,
		categorie = "Moyenne",
		etat = "bon",
		meteo = "couchant",
	},
	{
		id = "marees",
		nom = "Trophée des Marées",
		distance = 2600,
		categorie = "Longue",
		etat = "lourd",
		meteo = "pluie",
	},
} :: { Course }

function Courses.parId(id: string): Course?
	for _, course in Courses.liste do
		if course.id == id then
			return course
		end
	end
	return nil
end

return Courses
