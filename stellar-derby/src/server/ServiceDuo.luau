--!strict
-- ServiceDuo — le duo entraîneuse–coureuse : une joueuse qui regarde une
-- course sans y courir entraîne une joueuse qui y court, avec trois ordres.
--
-- Requêtes :
--   duo.entrainer { coureuseId }   devenir l'entraîneuse d'une partante
--   duo.regarder { userId }        aller regarder la course d'une amie
-- Commande de course :
--   duo.ordre <ordre>              « souffle », « sillage » ou « maintenant »
--
-- Les règles sont dans Jeu/Duo. Un ordre juste n'agit sur la course qu'en
-- carrière (contre l'IA) ; en course libre, il ne fait qu'apparaître chez la
-- coureuse et rapporter des points de duo.
-- L'état est publié sur le dossier de la session (attribut « Duo », JSON :
-- { { entraineuse = nom, coureuse = id } … }).

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Reseau = require(Partage:WaitForChild("Reseau"))
local Formules = require(Partage:WaitForChild("Course"):WaitForChild("Formules"))
local Duo = require(Partage:WaitForChild("Jeu"):WaitForChild("Duo"))

local Lieux = require(script.Parent:WaitForChild("Lieux"))
local Profils = require(script.Parent:WaitForChild("Profils"))
local Sessions = require(script.Parent:WaitForChild("Sessions"))

local ServiceDuo = {}

type Lien = {
	coureuse: Player,
	coureuseId: number,
	derniere: number?, -- os.clock() du dernier ordre
	points: number,
	ordres: number,
}

type EtatDuo = {
	liens: { [Player]: Lien }, -- entraîneuse → lien
	entraineuses: { [Player]: Player }, -- coureuse → entraîneuse
}

local function etatDe(session: Sessions.Session): EtatDuo
	local e = session.donnees.duo
	if not e then
		e = { liens = {}, entraineuses = {} }
		session.donnees.duo = e
	end
	return e
end

local function publier(session: Sessions.Session)
	local e = etatDe(session)
	local liste = {}
	for entraineuse, lien in e.liens do
		table.insert(liste, { entraineuse = entraineuse.DisplayName, coureuse = lien.coureuseId })
	end
	session.dossier:SetAttribute("Duo", HttpService:JSONEncode(liste))
end

local function delier(session: Sessions.Session, entraineuse: Player)
	local e = etatDe(session)
	local lien = e.liens[entraineuse]
	if lien then
		e.liens[entraineuse] = nil
		e.entraineuses[lien.coureuse] = nil
		publier(session)
	end
end

-- ─────────────────────────────── Requêtes ───────────────────────────────

local function entrainer(joueur: Player, args: any): Reseau.Reponse
	local session = Sessions.deJoueur(joueur)
	if not session or session.finie then
		return { ok = false, erreur = "Regarde d'abord une course." }
	end
	if session.coureuseDe[joueur] or Sessions.participe(session, joueur) then
		return { ok = false, erreur = "Tu cours dans cette course : impossible d'entraîner en même temps !" }
	end
	local id = if type(args) == "table" then args.coureuseId else nil
	local coureuse = if type(id) == "number" then session.joueurDe[id] else nil
	if not coureuse or not coureuse.Parent then
		return { ok = false, erreur = "Choisis une joueuse qui court." }
	end
	if coureuse == joueur then
		return { ok = false, erreur = "Tu ne peux pas t'entraîner toi-même." }
	end
	local e = etatDe(session)
	if e.liens[joueur] then
		return { ok = false, erreur = "Tu entraînes déjà une coureuse." }
	end
	if e.entraineuses[coureuse] then
		return { ok = false, erreur = "Elle a déjà une entraîneuse." }
	end
	e.liens[joueur] = { coureuse = coureuse, coureuseId = id :: number, derniere = nil, points = 0, ordres = 0 }
	e.entraineuses[coureuse] = joueur
	publier(session)
	Profils.signal(coureuse, "duo.debut", { entraineuse = joueur.DisplayName })
	return { ok = true, coureuse = coureuse.DisplayName }
end

local function regarder(joueur: Player, args: any): Reseau.Reponse
	local userId = if type(args) == "table" then args.userId else nil
	local amie = if type(userId) == "number" then Players:GetPlayerByUserId(userId) else nil
	local session = amie and Sessions.deJoueur(amie)
	if not session or session.finie then
		return { ok = false, erreur = "Elle n'est dans aucune course pour l'instant." }
	end
	if session.options.genre == "tutoriel" then
		return { ok = false, erreur = "Laisse-la finir son tutoriel tranquille !" }
	end
	local actuelle = Sessions.deJoueur(joueur)
	if actuelle and actuelle.coureuseDe[joueur] and not actuelle.finie then
		return { ok = false, erreur = "Termine d'abord ta course." }
	end
	Sessions.regarder(joueur, session)
	Lieux.versTribune(joueur, session.options.piste)
	return { ok = true }
end

-- ─────────────────────────────── Ordres ───────────────────────────────

-- Ce que voit l'entraîneuse au moment de l'ordre, calculé par la simulation.
local function contexte(session: Sessions.Session, id: number): Duo.Contexte?
	local sim = session.simulation
	local c = sim and sim.coureuses[id]
	if not sim or not c or not c.partie or c.arrivee then
		return nil
	end
	local devant: number? = nil
	for _, o in sim.coureuses do
		if o ~= c and o.partie and not o.arrivee then
			local dd = o.d - c.d
			if dd > 0 and dd <= Duo.SILLAGE_MAX and math.abs(o.couloir - c.couloir) <= Formules.PAS_COULOIR * 1.5 then
				if not devant or dd < devant then
					devant = dd
				end
			end
		end
	end
	return {
		phase = sim:phaseDe(c),
		enduranceRelative = c.endurance / math.max(1, c.enduranceMax),
		rythme = c.rythme,
		aspiration = c.aspiration,
		devant = devant,
		sprintTenable = sim:sprintTenable(c) >= sim:restant(c),
		sprint = c.sprint,
	}
end

local function ordre(session: Sessions.Session, joueur: Player, valeur: unknown)
	local e = etatDe(session)
	local lien = e.liens[joueur]
	local o = Duo.ordre(valeur)
	if not lien or not o then
		return
	end
	local maintenant = os.clock()
	if not Duo.peutDonner(lien.derniere, maintenant) then
		return
	end
	local c = contexte(session, lien.coureuseId)
	if not c then
		return
	end
	lien.derniere = maintenant
	lien.ordres += 1
	local juste, explication = Duo.evaluer(o.id, c)
	if juste then
		lien.points += 1
		local effet = Duo.effet(o.id, session.options.genre)
		local sim = session.simulation
		if effet and sim then
			sim:appliquerEffet(lien.coureuseId, effet :: any, "entraineuse")
		end
	end
	if lien.coureuse.Parent then
		Profils.signal(lien.coureuse, "duo.ordre", { ordre = o.id, texte = o.texte, juste = juste })
	end
	Profils.signal(
		joueur,
		"duo.verdict",
		{ ordre = o.id, juste = juste, explication = explication, points = lien.points }
	)
end

local function apresCourse(session: Sessions.Session, _resultats: { any })
	local e = session.donnees.duo :: EtatDuo?
	if not e then
		return
	end
	for entraineuse, lien in e.liens do
		if lien.ordres > 0 then
			local gain = Duo.recompense(lien.points)
			for _, joueur in { entraineuse, lien.coureuse } do
				if joueur.Parent and Profils.pret(joueur) then
					Profils.modifier(joueur, function(d)
						d.stats.duos += 1
					end)
					Profils.crediter(joueur, gain.etoiles, gain.xp, `Duo ({lien.points} ordre(s) juste(s))`)
				end
			end
		end
	end
	-- Les liens se défont avec la course
	table.clear(e.liens)
	table.clear(e.entraineuses)
	publier(session)
end

function ServiceDuo.demarrer()
	Profils.surRequete("duo.entrainer", entrainer)
	Profils.surRequete("duo.regarder", regarder)
	Profils.surRequete("duo.arreter", function(joueur)
		local session = Sessions.deJoueur(joueur)
		if session then
			delier(session, joueur)
		end
		return { ok = true }
	end)
	Sessions.surCommande("duo.ordre", ordre)
	Sessions.surFin(apresCourse)
	Players.PlayerRemoving:Connect(function(joueur)
		for _, s in Sessions.liste() do
			local session = s :: any -- (le vérificateur de types confond deux copies du type Session)
			local e = session.donnees.duo :: EtatDuo?
			if e then
				delier(session, joueur)
				local entraineuse = e.entraineuses[joueur]
				if entraineuse then
					delier(session, entraineuse)
				end
			end
		end
	end)
end

return ServiceDuo
