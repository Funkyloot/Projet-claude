--!strict
-- Duo — le duo entraîneuse–coureuse : une joueuse qui regarde une course
-- sans y courir peut en entraîner une qui y court, en lui donnant trois
-- ordres au bon moment.
--
-- Pur. Le serveur calcule un petit contexte à partir de la simulation ; ce
-- module dit si l'ordre est juste, pourquoi, et quel effet il produit.
--
-- ÉQUITÉ : un ordre n'a d'effet sur la course qu'en carrière (contre l'IA).
-- En course libre, il ne fait qu'afficher le conseil chez la coureuse et
-- rapporter des points de duo.

local Duo = {}

export type Contexte = {
	phase: number, -- 1 début, 2 milieu, 3 finale
	enduranceRelative: number, -- 0 à 1
	rythme: number, -- 1 économie, 2 normal, 3 pousser
	aspiration: boolean, -- déjà dans un sillage
	devant: number?, -- mètres jusqu'à la concurrente devant, couloir voisin ou le sien (nil : personne)
	sprintTenable: boolean, -- l'endurance permet de sprinter jusqu'au bout
	sprint: boolean, -- elle a déjà lancé son sprint
}

export type Effet = { genre: "vitesse" | "acceleration" | "endurance", valeur: number, duree: number }

export type Ordre = {
	id: string,
	texte: string,
	couleur: { number },
}

Duo.ORDRES = {
	{ id = "souffle", texte = "Garde ton souffle !", couleur = { 80, 210, 140 } },
	{ id = "sillage", texte = "Dans son sillage !", couleur = { 90, 190, 255 } },
	{ id = "maintenant", texte = "MAINTENANT !", couleur = { 255, 95, 160 } },
} :: { Ordre }

Duo.RECHARGE = 6 -- s entre deux ordres
Duo.SILLAGE_MAX = 8 -- m : au-delà, la concurrente est trop loin pour s'y abriter

local parId: { [string]: Ordre } = {}
for _, o in Duo.ORDRES do
	parId[o.id] = o
end

function Duo.ordre(id: unknown): Ordre?
	return if type(id) == "string" then parId[id] else nil
end

-- L'ordre est-il juste dans ce contexte ? Et pourquoi (pour l'entraîneuse).
function Duo.evaluer(ordre: string, c: Contexte): (boolean, string)
	if ordre == "souffle" then
		if c.phase >= 3 then
			return false, "Trop tard pour économiser : c'est la finale !"
		end
		if c.enduranceRelative < 0.45 then
			return true, "Bien vu : elle commençait à s'épuiser."
		end
		if c.rythme >= 3 and c.enduranceRelative < 0.75 then
			return true, "Bien vu : elle poussait trop tôt."
		end
		return false, "Pas besoin : elle a encore de la réserve."
	elseif ordre == "sillage" then
		if c.aspiration then
			return false, "Elle est déjà à l'abri."
		end
		local devant = c.devant
		if devant and devant > 0 and devant <= Duo.SILLAGE_MAX then
			return true, "Bien vu : une concurrente juste devant pour s'abriter."
		end
		return false, "Personne d'assez proche devant elle."
	elseif ordre == "maintenant" then
		if c.sprint then
			return false, "Elle sprinte déjà !"
		end
		if c.phase < 3 then
			return false, "Trop tôt : la finale n'a pas commencé."
		end
		if not c.sprintTenable then
			return false, "Trop tôt : elle ne tiendrait pas jusqu'au bout."
		end
		return true, "Parfait : le sprint tient jusqu'à la ligne !"
	end
	return false, "Ordre inconnu."
end

-- Peut-on donner un nouvel ordre ? (`derniere` : heure du précédent, en s)
function Duo.peutDonner(derniere: number?, maintenant: number): boolean
	return derniere == nil or maintenant - derniere >= Duo.RECHARGE
end

-- L'effet d'un ordre juste sur la course. Rien hors carrière : une course
-- libre reste égale pour toutes.
function Duo.effet(ordre: string, genre: string): Effet?
	if genre ~= "carriere" then
		return nil
	end
	if ordre == "souffle" then
		return { genre = "endurance", valeur = 0.03, duree = 0 }
	elseif ordre == "sillage" then
		return { genre = "vitesse", valeur = 0.15, duree = 2 }
	elseif ordre == "maintenant" then
		return { genre = "acceleration", valeur = 0.3, duree = 2 }
	end
	return nil
end

-- Le petit gain de fin de course, pour l'entraîneuse comme pour la coureuse.
function Duo.recompense(points: number): { etoiles: number, xp: number }
	local p = math.clamp(math.floor(points), 0, 8)
	return { etoiles = 5 + 4 * p, xp = 8 + 5 * p }
end

return Duo
