--!strict
-- Live — le mode Live des streamers, en logique pure.
--
-- Pendant un live, les spectateurs écrivent dans le chat :
--   !join <pseudo Roblox>   leur avatar rejoint la file des invitées et court
--   !prono <numéro>         ils parient sur une gagnante… sans rien miser
--   !vote <1|2|3>           ils choisissent la prochaine course
--
-- Ce module lit les messages (sans jamais leur faire confiance), tient la
-- file des invitées, dépouille les votes et compte les points de pronostic.
-- RIEN NE RESSEMBLE À UN PARI : aucune mise, et les pronostics ne
-- rapportent ni Robux ni étoiles, seulement une place au classement de la
-- soirée.

local Live = {}

Live.CAPACITE = 30 -- comme Config.TAILLE_PELOTON_LIVE : joueurs présents compris
Live.MAX_MESSAGE = 200
Live.MAX_AUTEUR = 40
Live.POINTS_GAGNANTE = 10
Live.POINTS_PODIUM = 3

export type Commande =
	{ genre: "join", pseudo: string }
	| { genre: "prono", numero: number }
	| {
		genre: "vote",
		choix: number,
	}

export type Etat = {
	invites: { string }, -- pseudos, dans l'ordre d'arrivée
	connus: { [string]: boolean }, -- pseudos en minuscules (dédoublonnage)
	options: { string }, -- les courses proposées au vote (identifiants)
	votes: { [string]: number }, -- auteur → choix
	pronos: { [string]: number }, -- auteur → numéro
	scores: { [string]: number }, -- auteur → points de la soirée
}

function Live.nouvelEtat(): Etat
	return { invites = {}, connus = {}, options = {}, votes = {}, pronos = {}, scores = {} }
end

-- ─────────────────────────────── Lecture du chat ───────────────────────────────

-- Un pseudo Roblox : 3 à 20 lettres ou chiffres, au plus un tiret bas, ni au
-- début ni à la fin.
function Live.pseudoValide(pseudo: unknown): boolean
	if type(pseudo) ~= "string" or #pseudo < 3 or #pseudo > 20 then
		return false
	end
	if not string.match(pseudo, "^[%w_]+$") then
		return false
	end
	local _, soulignes = string.gsub(pseudo, "_", "")
	if soulignes > 1 then
		return false
	end
	return string.sub(pseudo, 1, 1) ~= "_" and string.sub(pseudo, -1) ~= "_"
end

-- Un auteur de message, nettoyé : sans caractères de contrôle, raccourci.
function Live.auteur(brut: unknown): string?
	if type(brut) ~= "string" then
		return nil
	end
	local nettoye = string.gsub(brut, "%c", "")
	nettoye = string.match(nettoye, "^%s*(.-)%s*$") or ""
	if nettoye == "" then
		return nil
	end
	return string.sub(nettoye, 1, Live.MAX_AUTEUR)
end

-- Lit un message du chat ; nil si ce n'est pas une commande valable.
function Live.analyser(texte: unknown): Commande?
	if type(texte) ~= "string" or #texte > Live.MAX_MESSAGE then
		return nil
	end
	local commande, argument = string.match(texte, "^%s*!(%a+)%s+(%S+)%s*$")
	if not commande or not argument then
		return nil
	end
	commande = string.lower(commande)
	if commande == "join" then
		if Live.pseudoValide(argument) then
			return { genre = "join", pseudo = argument }
		end
	elseif commande == "prono" then
		local n = if string.match(argument, "^%d+$") then tonumber(argument) else nil
		if n and n >= 1 and n <= Live.CAPACITE then
			return { genre = "prono", numero = n }
		end
	elseif commande == "vote" then
		local n = if string.match(argument, "^%d$") then tonumber(argument) else nil
		if n and n >= 1 and n <= 3 then
			return { genre = "vote", choix = n }
		end
	end
	return nil
end

-- ─────────────────────────────── Invitées ───────────────────────────────

-- Ajoute un pseudo à la file. Renvoie ok et, sinon, pourquoi.
function Live.ajouterInvite(e: Etat, pseudo: string, capacite: number?): (boolean, string?)
	if not Live.pseudoValide(pseudo) then
		return false, "Pseudo invalide."
	end
	local cle = string.lower(pseudo)
	if e.connus[cle] then
		return false, `{pseudo} est déjà dans la file.`
	end
	if #e.invites >= (capacite or Live.CAPACITE) then
		return false, "La file est pleine."
	end
	e.connus[cle] = true
	table.insert(e.invites, pseudo)
	return true, nil
end

function Live.retirerInvite(e: Etat, pseudo: string): boolean
	local cle = string.lower(pseudo)
	for i, p in e.invites do
		if string.lower(p) == cle then
			table.remove(e.invites, i)
			e.connus[cle] = nil
			return true
		end
	end
	return false
end

-- Les `n` premières de la file, qui prennent le départ (elles en sortent).
function Live.prendreInvites(e: Etat, n: number): { string }
	local partantes: { string } = {}
	while #partantes < n and #e.invites > 0 do
		local pseudo = table.remove(e.invites, 1) :: string
		e.connus[string.lower(pseudo)] = nil
		table.insert(partantes, pseudo)
	end
	return partantes
end

-- ─────────────────────────────── Votes ───────────────────────────────

function Live.ouvrirVote(e: Etat, options: { string })
	e.options = table.clone(options)
	table.clear(e.votes)
end

-- Un vote par auteur : le premier compte.
function Live.voter(e: Etat, auteur: string, choix: number): boolean
	if #e.options == 0 or choix < 1 or choix > #e.options or e.votes[auteur] then
		return false
	end
	e.votes[auteur] = choix
	return true
end

-- Le compte de chaque option et l'option gagnante (à égalité, la première).
function Live.depouiller(e: Etat): ({ number }, number?)
	local compte: { number } = {}
	for i = 1, #e.options do
		compte[i] = 0
	end
	for _, choix in e.votes do
		if compte[choix] then
			compte[choix] += 1
		end
	end
	local gagnante: number? = nil
	for i, n in compte do
		if n > 0 and (not gagnante or n > compte[gagnante]) then
			gagnante = i
		end
	end
	return compte, gagnante
end

-- ─────────────────────────────── Pronostics ───────────────────────────────

-- Un pronostic par auteur et par course : le premier compte.
function Live.pronostiquer(e: Etat, auteur: string, numero: number): boolean
	if e.pronos[auteur] or numero < 1 or numero > Live.CAPACITE then
		return false
	end
	e.pronos[auteur] = numero
	return true
end

-- Compte les points après la course. `podium` : les numéros des trois
-- premières, dans l'ordre. Les pronostics sont ensuite remis à zéro.
function Live.attribuerPoints(e: Etat, podium: { number }): { [string]: number }
	local gagnes: { [string]: number } = {}
	for auteur, numero in e.pronos do
		local points = 0
		if numero == podium[1] then
			points = Live.POINTS_GAGNANTE
		elseif table.find(podium, numero) then
			points = Live.POINTS_PODIUM
		end
		if points > 0 then
			e.scores[auteur] = (e.scores[auteur] or 0) + points
			gagnes[auteur] = points
		end
	end
	table.clear(e.pronos)
	return gagnes
end

-- Le classement des pronostiqueurs de la soirée (les `n` premiers).
function Live.classement(e: Etat, n: number): { { auteur: string, points: number } }
	local liste: { { auteur: string, points: number } } = {}
	for auteur, points in e.scores do
		table.insert(liste, { auteur = auteur, points = points })
	end
	table.sort(liste, function(a, b)
		if a.points ~= b.points then
			return a.points > b.points
		end
		return a.auteur < b.auteur
	end)
	while #liste > n do
		table.remove(liste)
	end
	return liste
end

-- Le nombre de pronostics en cours.
function Live.nombrePronos(e: Etat): number
	local n = 0
	for _ in e.pronos do
		n += 1
	end
	return n
end

-- Découpe une liste de pseudos collée par la streameuse (espaces, virgules,
-- retours à la ligne) ; garde seulement les pseudos valables.
function Live.decouper(texte: unknown): { string }
	local pseudos: { string } = {}
	if type(texte) ~= "string" then
		return pseudos
	end
	for morceau in string.gmatch(string.sub(texte, 1, 2000), "[^%s,;]+") do
		local pseudo = string.gsub(morceau, "^@", "")
		if Live.pseudoValide(pseudo) and #pseudos < Live.CAPACITE then
			table.insert(pseudos, pseudo)
		end
	end
	return pseudos
end

return Live
