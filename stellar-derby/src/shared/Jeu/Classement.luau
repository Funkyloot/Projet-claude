--!strict
-- Classement — les trois classements du jeu, en logique pure.
--
--   victoires   les victoires de tous les temps
--   saison      les points de la saison en cours (un mois calendaire)
--   legendes    la meilleure note de Légende du joueur
--
-- Ce module dit où ranger chaque classement (noms des magasins), quelle
-- valeur publier pour un joueur, quand la réécrire, et comment l'afficher.
-- Le serveur (Classements) s'occupe des DataStores.

local Classement = {}

Classement.LISTE = { "victoires", "saison", "legendes" }
Classement.NOMS = { victoires = "Victoires", saison = "Saison", legendes = "Légendes" }
Classement.ICONES = { victoires = "🏆", saison = "⭐", legendes = "👑" }
Classement.TAILLE = 10 -- le top affiché
Classement.DELAI_ECRITURE = 120 -- s entre deux écritures d'un même joueur dans un classement

local PREFIXE = "StellarDerby_classement_"

function Classement.existe(classement: unknown): boolean
	return type(classement) == "string" and Classement.NOMS[classement] ~= nil
end

-- Le nom du magasin (OrderedDataStore) d'un classement ; la saison a un
-- magasin par mois.
function Classement.magasin(classement: string, idSaison: string): string
	if classement == "saison" then
		return `{PREFIXE}saison_{idSaison}`
	end
	return PREFIXE .. classement
end

-- La saison d'avant : « 2026-10 » → « 2026-09 », « 2027-01 » → « 2026-12 ».
function Classement.saisonPrecedente(idSaison: string): string
	local annee, mois = string.match(idSaison, "^(%d+)%-(%d+)$")
	local a, m = tonumber(annee), tonumber(mois)
	if not a or not m then
		return ""
	end
	m -= 1
	if m < 1 then
		m = 12
		a -= 1
	end
	return string.format("%04d-%02d", a, m)
end

-- La valeur d'un joueur dans un classement (un entier positif).
function Classement.valeur(classement: string, d: any, idSaison: string): number
	if classement == "victoires" then
		return math.max(0, math.floor(d.stats.victoires))
	elseif classement == "saison" then
		-- Des points d'une saison passée ne comptent plus
		return if d.saison.id == idSaison then math.max(0, math.floor(d.saison.points)) else 0
	elseif classement == "legendes" then
		local meilleure = 0
		for _, l in d.legendes do
			meilleure = math.max(meilleure, l.note)
		end
		return math.floor(meilleure)
	end
	return 0
end

-- Faut-il réécrire cette valeur ? Seulement si elle a changé et que le délai
-- depuis la dernière écriture est passé (`forcer` : au départ du joueur).
function Classement.fautReecrire(
	derniere: { valeur: number, heure: number }?,
	valeur: number,
	maintenant: number,
	forcer: boolean?
): boolean
	if not derniere then
		return valeur > 0
	end
	if derniere.valeur == valeur then
		return false
	end
	return forcer == true or maintenant - derniere.heure >= Classement.DELAI_ECRITURE
end

-- « 1er », « 2e », « 3e »…
function Classement.rang(n: number): string
	return if n == 1 then "1er" else `{n}e`
end

-- Une valeur courte : 950, « 1,2 k », « 15 k », « 2,5 M ».
function Classement.abreger(v: number): string
	local function decimal(x: number): string
		local texte = if x < 10 then string.format("%.1f", math.floor(x * 10) / 10) else tostring(math.floor(x))
		texte = string.gsub(texte, "%.0$", "")
		return (string.gsub(texte, "%.", ","))
	end
	if v >= 1e6 then
		return `{decimal(v / 1e6)} M`
	elseif v >= 1000 then
		return `{decimal(v / 1000)} k`
	end
	return tostring(math.floor(v))
end

local function bissextile(annee: number): boolean
	return (annee % 4 == 0 and annee % 100 ~= 0) or annee % 400 == 0
end

local JOURS = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 }

-- Secondes avant la fin de la saison (minuit UTC, le premier du mois suivant).
function Classement.tempsRestant(heure: number): number
	local date = os.date("!*t", heure) :: any
	local jours = JOURS[date.month]
	if date.month == 2 and bissextile(date.year) then
		jours = 29
	end
	local secondesDuJour = date.hour * 3600 + date.min * 60 + date.sec
	return (jours - date.day) * 86400 + (86400 - secondesDuJour)
end

-- « 12 j 4 h », « 5 h 20 min », « 3 min ».
function Classement.duree(secondes: number): string
	local s = math.max(0, math.floor(secondes))
	local j = s // 86400
	local h = (s % 86400) // 3600
	local m = (s % 3600) // 60
	if j > 0 then
		return `{j} j {h} h`
	elseif h > 0 then
		return `{h} h {m} min`
	end
	return `{math.max(1, m)} min`
end

return Classement
