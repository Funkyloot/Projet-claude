--!strict
-- Courses — le calendrier des trois hippodromes.
--
-- Les distances ne sont pas choisies au hasard : sur chaque piste, les
-- stalles de chaque course tombent sur une ligne droite, à plus de 70 m du
-- virage suivant (voir Pistes, et le test du calendrier).
--
-- Chaque hippodrome a ses quatre courses, une par catégorie : Sprint, Mile,
-- Moyenne et Longue. Les courses libres d'un hippodrome tournent dans
-- l'ordre de sa liste.

export type Meteo = "soleil" | "matin" | "couchant" | "pluie" | "nuit"

export type Course = {
	id: string,
	nom: string,
	piste: string, -- identifiant de l'hippodrome (voir Pistes)
	distance: number,
	categorie: string,
	etat: "bon" | "lourd",
	meteo: Meteo,
}

local Courses = {}

Courses.CATEGORIES = { "Sprint", "Mile", "Moyenne", "Longue" }

Courses.liste = {
	-- Hippodrome de l'Archipel
	{
		id = "alizes",
		nom = "Coupe des Alizés",
		piste = "archipel",
		distance = 1400,
		categorie = "Sprint",
		etat = "bon",
		meteo = "soleil",
	},
	{
		id = "aube",
		nom = "Prix de l'Aube",
		piste = "archipel",
		distance = 1900,
		categorie = "Mile",
		etat = "bon",
		meteo = "matin",
	},
	{
		id = "archipel",
		nom = "Grand Prix de l'Archipel",
		piste = "archipel",
		distance = 2000,
		categorie = "Moyenne",
		etat = "bon",
		meteo = "couchant",
	},
	{
		id = "marees",
		nom = "Trophée des Marées",
		piste = "archipel",
		distance = 2600,
		categorie = "Longue",
		etat = "lourd",
		meteo = "pluie",
	},
	-- Hippodrome de la Baie
	{
		id = "embruns",
		nom = "Coupe des Embruns",
		piste = "baie",
		distance = 1400,
		categorie = "Sprint",
		etat = "bon",
		meteo = "soleil",
	},
	{
		id = "coquillages",
		nom = "Prix des Coquillages",
		piste = "baie",
		distance = 1500,
		categorie = "Mile",
		etat = "bon",
		meteo = "matin",
	},
	{
		id = "baie",
		nom = "Grand Prix de la Baie",
		piste = "baie",
		distance = 2100,
		categorie = "Moyenne",
		etat = "bon",
		meteo = "couchant",
	},
	{
		id = "phare",
		nom = "Trophée du Phare",
		piste = "baie",
		distance = 2800,
		categorie = "Longue",
		etat = "bon",
		meteo = "nuit",
	},
	-- Hippodrome des Falaises
	{
		id = "goelands",
		nom = "Sprint des Goélands",
		piste = "falaises",
		distance = 1200,
		categorie = "Sprint",
		etat = "bon",
		meteo = "soleil",
	},
	{
		id = "vent",
		nom = "Prix du Vent",
		piste = "falaises",
		distance = 1700,
		categorie = "Mile",
		etat = "bon",
		meteo = "matin",
	},
	{
		id = "cimes",
		nom = "Coupe des Cimes",
		piste = "falaises",
		distance = 2200,
		categorie = "Moyenne",
		etat = "bon",
		meteo = "couchant",
	},
	{
		id = "falaises",
		nom = "Marathon des Falaises",
		piste = "falaises",
		distance = 3200,
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

function Courses.existe(id: unknown): boolean
	return type(id) == "string" and Courses.parId(id) ~= nil
end

-- Les courses d'un hippodrome, dans l'ordre de leur rotation.
function Courses.dePiste(piste: string): { Course }
	local liste = {}
	for _, course in Courses.liste do
		if course.piste == piste then
			table.insert(liste, course)
		end
	end
	return liste
end

-- Les courses d'une catégorie, tous hippodromes confondus.
function Courses.deCategorie(categorie: string): { Course }
	local liste = {}
	for _, course in Courses.liste do
		if course.categorie == categorie then
			table.insert(liste, course)
		end
	end
	return liste
end

return Courses
