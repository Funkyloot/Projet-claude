--!strict
-- Saisons — le calendrier du jeu : saisons mensuelles et Grand Prix du week-end.
--
-- Pur : on lui donne l'heure (os.time(), en secondes UTC), il répond. Les
-- tests peuvent donc lui faire vivre n'importe quelle date.
--
--   saison         un mois calendaire ; les points de saison repartent de
--                  zéro au début de chaque mois
--   Grand Prix     le samedi et le dimanche (UTC), une course libre sur trois
--                  de chaque hippodrome devient le « Grand Prix du week-end »,
--                  qui rapporte double

local Saisons = {}

Saisons.FREQUENCE_GRAND_PRIX = 3 -- une course libre sur trois, le week-end

local MOIS = {
	"Janvier",
	"Février",
	"Mars",
	"Avril",
	"Mai",
	"Juin",
	"Juillet",
	"Août",
	"Septembre",
	"Octobre",
	"Novembre",
	"Décembre",
}

-- Identifiant de la saison en cours, par exemple « 2026-10 ».
function Saisons.id(heure: number): string
	local date = os.date("!*t", heure) :: any
	return string.format("%04d-%02d", date.year, date.month)
end

-- Nom lisible d'une saison : « Saison d'Octobre 2026 ».
function Saisons.nom(id: string): string
	local annee, mois = string.match(id, "^(%d+)%-(%d+)$")
	local m = tonumber(mois)
	if not annee or not m or not MOIS[m] then
		return "Saison"
	end
	local nom = MOIS[m]
	local article = if string.match(nom, "^[AEIOUÉaeiou]") or nom == "Août" then "d'" else "de "
	return `Saison {article}{nom} {annee}`
end

-- Vrai le samedi et le dimanche (UTC).
function Saisons.estWeekend(heure: number): boolean
	local date = os.date("!*t", heure) :: any
	-- wday : 1 = dimanche, 7 = samedi
	return date.wday == 1 or date.wday == 7
end

-- La `numero`-ième course libre d'un hippodrome est-elle un Grand Prix ?
function Saisons.estGrandPrix(heure: number, numero: number): boolean
	return Saisons.estWeekend(heure) and numero % Saisons.FREQUENCE_GRAND_PRIX == 0
end

-- Points de saison d'une course : de quoi départager l'assiduité et le talent.
function Saisons.pointsCourse(rang: number, partantes: number, grandPrix: boolean): number
	local n = math.max(2, partantes)
	local points = 2 + math.floor(10 * (n - math.clamp(rang, 1, n)) / (n - 1) + 0.5)
	if rang == 1 then
		points += 5
	end
	return if grandPrix then points * 2 else points
end

return Saisons
