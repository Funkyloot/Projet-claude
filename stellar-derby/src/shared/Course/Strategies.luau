--!strict
-- Strategies — les quatre façons de courir.
--
-- Chaque stratégie module la vitesse de croisière et l'accélération selon la
-- phase de course (début, milieu, finale), et la réserve d'endurance.
-- Les coefficients de finale (troisième valeur de `vitesse`) sortent de
-- l'outil d'auto-réglage (tests/reglage.luau) ; le rapport complet est dans
-- docs/EQUILIBRAGE.md. Les modifier sans relancer ces outils revient à jouer
-- aux dés : un écart de 0,002 suffit à faire passer une Fusée de favorite à
-- outsider. L'outil égalise le rang moyen des stratégies et réduit l'écart
-- de victoires ; il en reste un, voulu : la Fusée est régulière (plus forte
-- en sprint), la Tempête joue le tout ou rien (plus forte sur le long).
--
-- `zone` est la place visée dans le peloton, en fraction (0 = tête,
-- 1 = queue). Elle guide l'IA ; un joueur en fait ce qu'il veut.
--
-- Le coefficient de finale dépend aussi de la course : sans ça, une Fusée
-- qui brille sur 1 200 m s'effondre sur 3 200 m, et le terrain lourd ou le
-- tracé d'un hippodrome favorisent une stratégie plutôt qu'une autre.
-- `Strategies.FINALES` donne le coefficient de chaque stratégie, course par
-- course ; `finale` donne celui d'une catégorie (Sprint, Mile, Moyenne,
-- Longue), pour une course qui n'aurait pas encore le sien.
-- Strategies.pour(id, course) rend la stratégie avec le bon coefficient ; le
-- moteur et le HUD passent par là.

export type Strategie = {
	id: string,
	nom: string,
	icone: string,
	resume: string,
	vitesse: { number }, -- coefficient de vitesse par phase
	acceleration: { number }, -- coefficient d'accélération par phase
	endurance: number, -- coefficient de réserve d'endurance
	zone: { number }, -- { min, max }
	signature: string, -- compétence propre à la stratégie
	finale: { [string]: number }?, -- coefficient de finale par catégorie de course
}

local Strategies = {}

Strategies.parId = {
	fusee = {
		id = "fusee",
		nom = "Fusée",
		icone = "🚀",
		resume = "Part en tête et tente de tenir jusqu'au bout.",
		vitesse = { 1.000, 0.983, 0.9787 },
		acceleration = { 1.000, 1.000, 0.996 },
		endurance = 0.95,
		zone = { 0, 0.15 },
		signature = "echappee",
		finale = { Sprint = 0.9782, Mile = 0.9779, Moyenne = 0.9806, Longue = 1.0103 },
	},
	ombre = {
		id = "ombre",
		nom = "Ombre",
		icone = "🌑",
		resume = "Colle aux meneuses, profite de leur sillage, frappe au dernier virage.",
		vitesse = { 0.978, 0.991, 0.9775 },
		acceleration = { 0.985, 1.000, 0.996 },
		endurance = 0.89,
		zone = { 0.1, 0.4 },
		signature = "coupDeReins",
		finale = { Sprint = 0.9782, Mile = 0.9774, Moyenne = 0.9755, Longue = 0.9754 },
	},
	vague = {
		id = "vague",
		nom = "Vague",
		icone = "🌊",
		resume = "Reste au milieu du peloton et remonte en finale.",
		vitesse = { 0.938, 0.998, 0.9859 },
		acceleration = { 0.975, 1.000, 1.000 },
		endurance = 1.00,
		zone = { 0.35, 0.7 },
		signature = "remontee",
		finale = { Sprint = 0.9872, Mile = 0.9885, Moyenne = 0.9877, Longue = 0.9865 },
	},
	tempete = {
		id = "tempete",
		nom = "Tempête",
		icone = "🌪️",
		resume = "Attend au fond, puis explose dans la dernière ligne droite.",
		vitesse = { 0.931, 1.000, 0.9941 },
		acceleration = { 0.945, 1.000, 0.997 },
		endurance = 0.995,
		zone = { 0.65, 1 },
		signature = "ouragan",
		finale = { Sprint = 0.9924, Mile = 0.9925, Moyenne = 0.9924, Longue = 0.9649 },
	},
} :: { [string]: Strategie }

Strategies.ordre = { "fusee", "ombre", "vague", "tempete" }

function Strategies.obtenir(id: string): Strategie
	return Strategies.parId[id] or Strategies.parId.ombre
end

-- Coefficient de finale de chaque stratégie, course par course. Réglé par
-- `lune run tests/reglage` : ne pas retoucher à la main.
Strategies.FINALES = {
	alizes = { fusee = 0.9779, ombre = 0.9785, vague = 0.9864, tempete = 0.9932 },
	aube = { fusee = 0.9791, ombre = 0.9776, vague = 0.9879, tempete = 0.9917 },
	archipel = { fusee = 0.9800, ombre = 0.9763, vague = 0.9870, tempete = 0.9929 },
	marees = { fusee = 1.0209, ombre = 0.9946, vague = 0.9742, tempete = 0.9475 },
	embruns = { fusee = 0.9775, ombre = 0.9778, vague = 0.9881, tempete = 0.9926 },
	coquillages = { fusee = 0.9775, ombre = 0.9784, vague = 0.9870, tempete = 0.9933 },
	baie = { fusee = 0.9814, ombre = 0.9768, vague = 0.9863, tempete = 0.9917 },
	phare = { fusee = 1.0456, ombre = 0.9570, vague = 0.9692, tempete = 0.9654 },
	goelands = { fusee = 0.9777, ombre = 0.9774, vague = 0.9869, tempete = 0.9940 },
	vent = { fusee = 0.9777, ombre = 0.9773, vague = 0.9877, tempete = 0.9935 },
	cimes = { fusee = 0.9830, ombre = 0.9769, vague = 0.9847, tempete = 0.9915 },
	falaises = { fusee = 1.0027, ombre = 0.9720, vague = 0.9899, tempete = 0.9725 },
} :: { [string]: { [string]: number } }

local parCourse: { [string]: Strategie } = {}

-- La stratégie `id` telle qu'elle court dans cette course : son coefficient
-- de finale est celui de la course, sinon celui de sa catégorie.
function Strategies.pour(id: string, course: { id: string, categorie: string }?): Strategie
	local base = Strategies.obtenir(id)
	if not course then
		return base
	end
	local parStrategie = Strategies.FINALES[course.id]
	local coefficient = parStrategie and parStrategie[base.id]
	if not coefficient and base.finale then
		coefficient = base.finale[course.categorie]
	end
	if not coefficient then
		return base
	end
	local cle = `{base.id}/{course.id}`
	local existante = parCourse[cle]
	if existante and existante.vitesse[3] == coefficient then
		return existante
	end
	local copie = table.clone(base)
	copie.vitesse = { base.vitesse[1], base.vitesse[2], coefficient }
	parCourse[cle] = copie
	return copie
end

function Strategies.existe(id: unknown): boolean
	return type(id) == "string" and Strategies.parId[id] ~= nil
end

return Strategies
