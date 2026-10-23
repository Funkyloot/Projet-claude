--!strict
-- ServiceConcert — le concert de la victoire, après chaque course qui le
-- demande : les trois premières montent sur la scène de l'hippodrome, le
-- public joue avec elles.
--
--   - Sur scène, les joueuses parmi les trois premières jouent un jeu de
--     rythme ; elles envoient leur note à la fin (commande « concert.note »).
--   - Dans la fosse, tous les autres spectateurs agitent leur bâton lumineux
--     (commande « concert.ovation ») et font monter l'ambiance commune.
--
-- L'état est publié sur le dossier de la session :
--   Concert          JSON : chanson, graine, début (heure serveur), durée,
--                    artistes (identifiants de coureuse, dans l'ordre), noms
--   ConcertAmbiance  l'ambiance, de 0 à 1 (au plus 4 fois par seconde)
--
-- À la fin, chaque joueur présent est récompensé (Jeu/Economie). Le concert
-- dure toujours le même temps et ne peut pas bloquer la boucle des courses.

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Concert = require(Partage:WaitForChild("Jeu"):WaitForChild("Concert"))
local Economie = require(Partage:WaitForChild("Jeu"):WaitForChild("Economie"))

local Profils = require(script.Parent:WaitForChild("Profils"))
local Sessions = require(script.Parent:WaitForChild("Sessions"))

local ServiceConcert = {}

local PERIODE_AMBIANCE = 0.25
local DELAI_NOTES = 2 -- s laissées après la chanson pour recevoir les notes

type EtatConcert = {
	artistes: { number },
	scene: { [Player]: boolean },
	notes: { [Player]: number },
	recentes: { [Player]: { number } }, -- ovations de la dernière seconde
	ovations: number, -- comptées depuis la dernière mise à jour
	gestes: { [Player]: number }, -- total des gestes de chacun
	ambiance: number,
	debut: number,
	fin: number,
	nombreDeNotes: number,
}

local function maintenant(): number
	return Workspace:GetServerTimeNow()
end

local function etatDe(session: Sessions.Session): EtatConcert?
	return session.donnees.concert
end

-- Les spectateurs dans la fosse : ceux qui regardent et ne sont pas sur scène.
local function public(session: Sessions.Session, e: EtatConcert): number
	local n = 0
	for joueur in session.spectateurs do
		if joueur.Parent and not e.scene[joueur] then
			n += 1
		end
	end
	return n
end

local function jouer(session: Sessions.Session)
	local resultats = session.resultats
	if not resultats or #resultats == 0 then
		return
	end
	local dossier = session.dossier
	local tries = table.clone(resultats)
	table.sort(tries, function(a, b)
		return a.rang < b.rang
	end)
	local artistes: { number } = {}
	local noms: { string } = {}
	for i = 1, math.min(3, #tries) do
		table.insert(artistes, tries[i].id)
		table.insert(noms, tries[i].nom)
	end
	local scene: { [Player]: boolean } = {}
	for joueur, id in session.coureuseDe do
		if table.find(artistes, id) then
			scene[joueur] = true
		end
	end

	local aleatoire = Random.new()
	local chanson = Concert.CHANSONS[aleatoire:NextInteger(1, #Concert.CHANSONS)]
	local graine = aleatoire:NextInteger(1, 2147483646)
	local debut = maintenant() + Concert.INTRO
	local e: EtatConcert = {
		artistes = artistes,
		scene = scene,
		notes = {},
		recentes = {},
		ovations = 0,
		gestes = {},
		ambiance = 0,
		debut = debut,
		fin = debut + Concert.DUREE,
		nombreDeNotes = #Concert.partition(graine, chanson.tempo, Concert.DUREE),
	}
	session.donnees.concert = e
	dossier:SetAttribute("ConcertAmbiance", 0)
	dossier:SetAttribute(
		"Concert",
		HttpService:JSONEncode({
			chanson = chanson.id,
			graine = graine,
			debut = debut,
			duree = Concert.DUREE,
			artistes = artistes,
			noms = noms,
		})
	)
	Sessions.changerPhase(session, "concert", Concert.INTRO + Concert.DUREE + Concert.FINALE)

	-- La chanson : l'ambiance se met à jour au fil des ovations
	local precedent = os.clock()
	while maintenant() < e.fin + DELAI_NOTES and not session.finie do
		task.wait(PERIODE_AMBIANCE)
		local t = os.clock()
		local dt = t - precedent
		precedent = t
		if maintenant() < e.fin then
			e.ambiance = Concert.ambiance(e.ambiance, e.ovations, public(session, e), dt)
			e.ovations = 0
			dossier:SetAttribute("ConcertAmbiance", math.floor(e.ambiance * 100 + 0.5) / 100)
		end
	end

	-- Sans personne dans la fosse, le public de l'hippodrome suit le spectacle
	local qualites: { number } = {}
	for joueur in scene do
		table.insert(qualites, (e.notes[joueur] or 0) / 100)
	end
	local fosse = 0
	for joueur in session.spectateurs do
		if not scene[joueur] then
			fosse += 1
		end
	end
	local ambiance = if fosse == 0 then Concert.ambianceSansPublic(qualites) else e.ambiance
	dossier:SetAttribute("ConcertAmbiance", math.floor(ambiance * 100 + 0.5) / 100)

	-- Les récompenses de tous ceux qui sont restés
	for joueur in session.spectateurs do
		if joueur.Parent and Profils.pret(joueur) then
			local surScene = scene[joueur] == true
			local qualite = if surScene
				then (e.notes[joueur] or 0) / 100
				else math.clamp((e.gestes[joueur] or 0) / (Concert.OVATIONS_COMPTEES * Concert.DUREE * 0.5), 0, 1)
			local gain = Economie.recompenseConcert(qualite, surScene, ambiance)
			Profils.modifier(joueur, function(d)
				d.stats.concerts += 1
				if surScene then
					d.stats.concertsMeneuse += 1
				end
			end)
			Profils.crediter(joueur, gain.etoiles, gain.xp, "Concert de la victoire")
			Profils.signal(joueur, "concert.bilan", {
				scene = surScene,
				note = e.notes[joueur],
				gestes = e.gestes[joueur] or 0,
				ambiance = ambiance,
				etoiles = gain.etoiles,
				xp = gain.xp,
			})
		end
	end

	task.wait(math.max(0, Concert.FINALE - DELAI_NOTES))
	session.donnees.concert = nil
end

-- Sur scène : la note finale du jeu de rythme, une seule fois.
local function recevoirNote(session: Sessions.Session, joueur: Player, valeur: unknown)
	local e = etatDe(session)
	if not e or not e.scene[joueur] or e.notes[joueur] ~= nil then
		return
	end
	if type(valeur) ~= "number" or valeur ~= valeur then
		return
	end
	-- Pas avant que la chanson ait vraiment commencé
	if maintenant() < e.debut + 5 then
		return
	end
	e.notes[joueur] = math.clamp(math.floor(valeur + 0.5), 0, 100)
end

-- Dans la fosse : un geste du bâton lumineux.
local function recevoirOvation(session: Sessions.Session, joueur: Player, _valeur: unknown)
	local e = etatDe(session)
	if not e or e.scene[joueur] then
		return
	end
	local t = maintenant()
	if t < e.debut - Concert.INTRO or t > e.fin then
		return
	end
	local recentes = e.recentes[joueur] or {}
	e.recentes[joueur] = recentes
	if Concert.compte(recentes, t) then
		e.ovations += 1
		e.gestes[joueur] = (e.gestes[joueur] or 0) + 1
	end
end

function ServiceConcert.demarrer()
	Sessions.definirConcert(function(session)
		local ok, erreur = pcall(function(): string?
			jouer(session)
			return nil
		end)
		session.donnees.concert = nil
		if not ok then
			warn(`[Concert] {erreur}`)
		end
	end)
	Sessions.surCommande("concert.note", recevoirNote)
	Sessions.surCommande("concert.ovation", recevoirOvation)
end

return ServiceConcert
