--!strict
-- Donnees — lecture et écriture des sauvegardes dans le DataStore.
--
-- Une sauvegarde par joueur, sous la clé « j_<userId> » :
--   { donnees = <Schema.Donnees>, verrou = { serveur, heure } }
--
-- Le verrou empêche deux serveurs d'écrire la même sauvegarde (un joueur qui
-- change de serveur très vite) : un serveur ne charge une sauvegarde que si
-- personne d'autre ne la tient, ou si le verrou est périmé (serveur disparu
-- sans la rendre). Chaque écriture rafraîchit le verrou ; le départ du joueur
-- le libère.
--
-- Dans Studio, le DataStore ne marche que si « Enable Studio Access to API
-- Services » est coché (Game Settings → Security). Sinon, on bascule en mode
-- mémoire : tout marche, mais rien n'est gardé d'une partie à l'autre.

local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Config = require(Partage:WaitForChild("Config"))
local Schema = require(Partage:WaitForChild("Jeu"):WaitForChild("Schema"))

local NOM_MAGASIN = "StellarDerby_joueurs_v1"
local ESSAIS = 3
local ESSAIS_VERROU = 6
local ATTENTE_VERROU = 5

local Donnees = {
	-- Vrai quand le DataStore n'est pas joignable : rien n'est sauvegardé
	memoire = false,
	-- Identifiant de ce serveur, inscrit dans les verrous
	serveur = if game.JobId ~= "" then game.JobId else `studio-{HttpService:GenerateGUID(false)}`,
}

local magasin: DataStore? = nil
local memoire: { [number]: any } = {}

local function cle(userId: number): string
	return `j_{userId}`
end

-- Appel au DataStore avec quelques nouvelles tentatives, espacées.
local function essayer<T>(fonction: () -> T): (boolean, T | string)
	local derniere = ""
	for essai = 1, ESSAIS do
		local ok, resultat = pcall(fonction)
		if ok then
			return true, resultat
		end
		derniere = tostring(resultat)
		if essai < ESSAIS then
			task.wait(essai * 1.5)
		end
	end
	return false, derniere
end

function Donnees.demarrer()
	local ok, resultat = pcall(function()
		local m = DataStoreService:GetDataStore(NOM_MAGASIN)
		-- Une lecture d'essai : dans Studio sans accès aux API, c'est ici que ça échoue
		m:GetAsync("essai")
		return m
	end)
	if ok then
		magasin = resultat :: DataStore
	else
		Donnees.memoire = true
		warn(
			"[Donnees] DataStore indisponible ("
				.. tostring(resultat)
				.. ") : mode mémoire, rien ne sera sauvegardé. Dans Studio : Game Settings → Security → "
				.. "Enable Studio Access to API Services."
		)
	end
end

-- Charge la sauvegarde d'un joueur et prend son verrou. Renvoie les données
-- (neuves si le joueur n'en a pas) et `lectureSeule` = vrai si un autre
-- serveur la tient toujours : on joue alors sans rien écrire.
function Donnees.charger(userId: number): (Schema.Donnees, boolean)
	local m = magasin
	if not m then
		local d = memoire[userId]
		return if d then Schema.migrer(d) else Schema.nouveau(), false
	end
	for tentative = 1, ESSAIS_VERROU do
		local occupe = false
		local lues: any = nil
		local ok, erreur = essayer(function()
			return m:UpdateAsync(cle(userId), function(ancien: any)
				local verrou = if type(ancien) == "table" then ancien.verrou else nil
				if
					type(verrou) == "table"
					and verrou.serveur ~= Donnees.serveur
					and os.time() - (tonumber(verrou.heure) or 0) < Config.VERROU_PERIME
				then
					occupe = true
					return nil -- on n'écrit rien
				end
				local enregistrement = if type(ancien) == "table" then ancien else {}
				lues = enregistrement.donnees
				enregistrement.verrou = { serveur = Donnees.serveur, heure = os.time() }
				return enregistrement
			end)
		end)
		if not ok then
			warn(`[Donnees] lecture impossible pour {userId} : {erreur}`)
			return Schema.nouveau(), true
		end
		if not occupe then
			return if lues then Schema.migrer(lues) else Schema.nouveau(), false
		end
		if tentative < ESSAIS_VERROU then
			task.wait(ATTENTE_VERROU)
		end
	end
	-- Toujours tenue par un autre serveur : on lit sans prendre le verrou
	local ok, enregistrement = essayer(function()
		return m:GetAsync(cle(userId))
	end)
	local brut = if ok and type(enregistrement) == "table" then (enregistrement :: any).donnees else nil
	return if brut then Schema.migrer(brut) else Schema.nouveau(), true
end

-- Écrit la sauvegarde (si ce serveur tient bien le verrou). `liberer` rend
-- le verrou : à faire quand le joueur s'en va.
function Donnees.sauver(userId: number, donnees: Schema.Donnees, liberer: boolean): boolean
	local m = magasin
	if not m then
		memoire[userId] = Schema.copier(donnees)
		return true
	end
	local perdu = false
	local ok, erreur = essayer(function()
		return m:UpdateAsync(cle(userId), function(ancien: any)
			local verrou = if type(ancien) == "table" then ancien.verrou else nil
			if type(verrou) == "table" and verrou.serveur ~= Donnees.serveur then
				-- Un autre serveur a repris la sauvegarde : on ne l'écrase pas
				perdu = true
				return nil
			end
			return {
				donnees = donnees,
				verrou = if liberer then nil else { serveur = Donnees.serveur, heure = os.time() },
			}
		end)
	end)
	if not ok then
		warn(`[Donnees] sauvegarde impossible pour {userId} : {erreur}`)
		return false
	end
	if perdu then
		warn(`[Donnees] la sauvegarde de {userId} est tenue par un autre serveur : non écrite`)
		return false
	end
	return true
end

return Donnees
