--!strict
-- EntrainementJeux — le déroulé des cinq mini-jeux, à l'image près.
--
-- Chaque jeu reçoit un contexte (la zone de jeu, les appuis du joueur, un
-- drapeau d'abandon) et la graine donnée par le serveur ; il dessine dans la
-- zone, joue, et renvoie la note de 0 à 100 (nil si le joueur abandonne).
-- Les règles et les notes viennent de Jeu/Entrainement : ici, on ne fait
-- qu'afficher et chronométrer.
--
-- Les appuis arrivent horodatés (os.clock) dans ctx.appuis, posés par
-- EcranEntrainement ; ctx.appuye dit si le doigt est posé en ce moment.
-- Seul l'instinct a ses propres boutons (un par couloir).

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local E = require(Partage:WaitForChild("Jeu"):WaitForChild("Entrainement"))

local Ui = require(script.Parent:WaitForChild("Ui"))

export type Contexte = {
	zone: Frame, -- la zone de jeu (900 × 440), vidée après chaque jeu
	info: TextLabel, -- une ligne d'état (« Essai 3/8 »…)
	grand: TextLabel, -- le gros texte du milieu (« Parfait ! »)
	appuye: boolean,
	appuis: { number },
	abandon: boolean,
}

local Jeux = {}

local VERT = Color3.fromRGB(90, 210, 130)
local ROUGE = Color3.fromRGB(240, 90, 90)

-- ─────────────────────────────── Outils ───────────────────────────────

local function image(): number
	return (RunService.RenderStepped:Wait())
end

-- Les appuis arrivés depuis le dernier appel (et on vide la file).
function Jeux.prendre(ctx: Contexte): { number }
	local appuis = ctx.appuis
	if #appuis == 0 then
		return appuis
	end
	ctx.appuis = {}
	return appuis
end

-- Attend `duree` secondes ; faux si le joueur abandonne entre-temps.
function Jeux.attendre(ctx: Contexte, duree: number): boolean
	local fin = os.clock() + duree
	while os.clock() < fin do
		image()
		if ctx.abandon then
			return false
		end
	end
	return not ctx.abandon
end

local function rond(parent: Instance, nom: string, taille: number, couleur: Color3): Frame
	local f = Ui.cadre(parent, nom, UDim2.fromOffset(taille, taille), UDim2.new(), couleur)
	f.AnchorPoint = Vector2.new(0.5, 0.5)
	Ui.coins(f, math.floor(taille / 2))
	return f
end

local function annoncer(ctx: Contexte, texte: string, couleur: Color3?)
	ctx.grand.Text = texte
	ctx.grand.TextColor3 = couleur or Couleurs.BLANC
end

-- ───────────────────────── 1. Vitesse : Piste de sprint ─────────────────────────

function Jeux.vitesse(ctx: Contexte, graine: number): number?
	local essais = E.sequenceVitesse(graine)
	local barre = Ui.cadre(ctx.zone, "Barre", UDim2.fromOffset(820, 56), UDim2.fromScale(0.5, 0.5), Couleurs.ROSE_PALE)
	barre.AnchorPoint = Vector2.new(0.5, 0.5)
	Ui.coins(barre, 14)
	local zoneOr = Ui.cadre(barre, "ZoneOr", UDim2.fromScale(0, 1), UDim2.new(), Couleurs.OR)
	Ui.coins(zoneOr, 10)
	local centre = Ui.cadre(zoneOr, "Centre", UDim2.new(0, 4, 1, 0), UDim2.fromScale(0.5, 0), Couleurs.BLANC, 0.3)
	centre.AnchorPoint = Vector2.new(0.5, 0)
	local curseur = Ui.cadre(barre, "Curseur", UDim2.fromOffset(12, 84), UDim2.fromScale(0, 0.5), Couleurs.TEXTE)
	curseur.AnchorPoint = Vector2.new(0.5, 0.5)
	Ui.coins(curseur, 6)

	local ecarts: { number? } = {}
	for i, essai in essais do
		ctx.info.Text = `Essai {i} / {#essais}`
		annoncer(ctx, "")
		zoneOr.Size = UDim2.fromScale(essai.largeur, 1)
		zoneOr.Position = UDim2.fromScale(essai.centre - essai.largeur / 2, 0)
		local debut = os.clock()
		Jeux.prendre(ctx)
		local ecart: number? = nil
		while true do
			image()
			if ctx.abandon then
				return nil
			end
			local t = os.clock() - debut
			curseur.Position = UDim2.fromScale(E.curseurVitesse(essai, t), 0.5)
			local appuis = Jeux.prendre(ctx)
			if #appuis > 0 then
				-- La position au moment exact de l'appui, pas à l'image suivante
				local position = E.curseurVitesse(essai, appuis[1] - debut)
				curseur.Position = UDim2.fromScale(position, 0.5)
				ecart = E.ecartVitesse(essai, position)
				break
			end
			if t > E.VITESSE.DELAI_MAX then
				break
			end
		end
		ecarts[i] = ecart
		if ecart == nil then
			annoncer(ctx, "Trop tard !", ROUGE)
		elseif ecart <= 0.3 then
			annoncer(ctx, "Parfait !", Couleurs.OR)
		elseif ecart <= 1 then
			annoncer(ctx, "Bien !", VERT)
		else
			annoncer(ctx, "Raté", ROUGE)
		end
		if not Jeux.attendre(ctx, E.VITESSE.PAUSE) then
			return nil
		end
	end
	annoncer(ctx, "")
	return E.noteVitesse(ecarts)
end

-- ───────────────────────── 2. Souffle : Bassin de souffle ─────────────────────────

function Jeux.souffle(ctx: Contexte, graine: number): number?
	local points = E.sequenceSouffle(graine)
	local s = E.SOUFFLE
	local jauge =
		Ui.cadre(ctx.zone, "Jauge", UDim2.fromOffset(110, 400), UDim2.new(0.5, -140, 0.5, 0), Couleurs.ROSE_PALE)
	jauge.AnchorPoint = Vector2.new(0.5, 0.5)
	Ui.coins(jauge, 18)
	jauge.ClipsDescendants = true
	local bande = Ui.cadre(jauge, "Bande", UDim2.fromScale(1, 0.2), UDim2.fromScale(0, 0.5), Couleurs.CIEL, 0.25)
	bande.AnchorPoint = Vector2.new(0, 0.5)
	local remplissage =
		Ui.cadre(jauge, "Remplissage", UDim2.fromScale(1, 0.5), UDim2.fromScale(0, 1), Couleurs.ROSE, 0.55)
	remplissage.AnchorPoint = Vector2.new(0, 1)
	local niveauTrait = Ui.cadre(jauge, "Niveau", UDim2.new(1, 0, 0, 8), UDim2.fromScale(0, 0.5), Couleurs.TEXTE)
	niveauTrait.AnchorPoint = Vector2.new(0, 0.5)

	local cote = Ui.cadre(ctx.zone, "Cote", UDim2.fromOffset(360, 200), UDim2.new(0.5, 60, 0.5, -100), Couleurs.FOND, 1)
	local libelle = Ui.texte(cote, "Libelle", "Dans la bande : 0 %", 26, Couleurs.BLANC)
	libelle.Size = UDim2.new(1, 0, 0, 40)
	libelle.TextXAlignment = Enum.TextXAlignment.Left
	local aide =
		Ui.texte(cote, "Aide", "Appuie : ça monte\nRelâche : ça descend", 18, Couleurs.ROSE_PALE, Ui.POLICE_TEXTE)
	aide.Position = UDim2.fromOffset(0, 50)
	aide.Size = UDim2.new(1, 0, 0, 56)
	aide.TextXAlignment = Enum.TextXAlignment.Left
	local fondTemps = Ui.cadre(cote, "Temps", UDim2.new(1, 0, 0, 14), UDim2.fromOffset(0, 130), Couleurs.ROSE_PALE)
	Ui.coins(fondTemps, 7)
	local temps = Ui.cadre(fondTemps, "Jauge", UDim2.fromScale(0, 1), UDim2.new(), Couleurs.OR)
	Ui.coins(temps, 7)

	local niveau, dans = 0.5, 0
	local debut = os.clock()
	local precedent = debut
	annoncer(ctx, "")
	while true do
		image()
		if ctx.abandon then
			return nil
		end
		local maintenant = os.clock()
		local t = maintenant - debut
		if t >= s.DUREE then
			break
		end
		local dt = maintenant - precedent
		precedent = maintenant
		Jeux.prendre(ctx)
		niveau = E.jaugeSouffle(niveau, ctx.appuye, dt)
		local centreBande, largeur = E.bandeSouffle(points, t)
		local dedans = math.abs(niveau - centreBande) <= largeur / 2
		if dedans then
			dans += dt
		end
		bande.Size = UDim2.fromScale(1, largeur)
		bande.Position = UDim2.fromScale(0, 1 - centreBande)
		bande.BackgroundColor3 = if dedans then VERT else Couleurs.CIEL
		remplissage.Size = UDim2.fromScale(1, niveau)
		niveauTrait.Position = UDim2.fromScale(0, 1 - niveau)
		temps.Size = UDim2.fromScale(t / s.DUREE, 1)
		libelle.Text = `Dans la bande : {math.floor(100 * dans / math.max(t, 0.001) + 0.5)} %`
		ctx.info.Text = `{math.ceil(s.DUREE - t)} s`
	end
	return E.noteSouffle(dans, s.DUREE)
end

-- ───────────────────────── 3. Puissance : Côte des départs ─────────────────────────

function Jeux.puissance(ctx: Contexte, graine: number): number?
	local p = E.PUISSANCE
	local attentes = E.sequencePuissance(graine)
	local feu = rond(ctx.zone, "Feu", 150, ROUGE)
	feu.Position = UDim2.new(0.5, -220, 0.5, 0)
	Ui.contour(feu, Couleurs.BLANC, 4)
	local compteur = Ui.texte(ctx.zone, "Compteur", "0", 80, Couleurs.BLANC)
	compteur.AnchorPoint = Vector2.new(0.5, 0.5)
	compteur.Position = UDim2.new(0.5, 140, 0.5, -40)
	compteur.Size = UDim2.fromOffset(300, 90)
	local fondCote =
		Ui.cadre(ctx.zone, "Cote", UDim2.fromOffset(300, 22), UDim2.new(0.5, 140, 0.5, 40), Couleurs.ROSE_PALE)
	fondCote.AnchorPoint = Vector2.new(0.5, 0.5)
	Ui.coins(fondCote, 11)
	local cote = Ui.cadre(fondCote, "Jauge", UDim2.fromScale(0, 1), UDim2.new(), Couleurs.OR)
	Ui.coins(cote, 11)
	local coureuse = Ui.texte(fondCote, "Coureuse", "🏇", 34)
	coureuse.AnchorPoint = Vector2.new(0.5, 1)
	coureuse.Size = UDim2.fromOffset(44, 40)

	local departs: { E.Depart } = {}
	for i, attente in attentes do
		ctx.info.Text = `Départ {i} / {#attentes}`
		feu.BackgroundColor3 = ROUGE
		compteur.Text = "0"
		cote.Size = UDim2.fromScale(0, 1)
		coureuse.Position = UDim2.fromScale(0, 0)
		annoncer(ctx, "À vos marques…")
		Jeux.prendre(ctx)
		local faux = false
		local debut = os.clock()
		while os.clock() - debut < attente do
			image()
			if ctx.abandon then
				return nil
			end
			if #Jeux.prendre(ctx) > 0 and not faux then
				faux = true
				annoncer(ctx, "Faux départ !", ROUGE)
			end
		end
		feu.BackgroundColor3 = VERT
		annoncer(ctx, if faux then "Faux départ ! Tape quand même !" else "Partez !", if faux then ROUGE else VERT)
		local signal = os.clock()
		local reaction: number? = nil
		local appuis = 0
		while os.clock() - signal < p.DUREE_ELAN do
			image()
			if ctx.abandon then
				return nil
			end
			for _, t in Jeux.prendre(ctx) do
				if t >= signal then
					appuis += 1
					if reaction == nil then
						reaction = t - signal
					end
				end
			end
			local part = math.clamp(appuis / (p.CADENCE_PLEINE * p.DUREE_ELAN), 0, 1)
			compteur.Text = tostring(appuis)
			cote.Size = UDim2.fromScale(part, 1)
			coureuse.Position = UDim2.fromScale(part, 0)
		end
		departs[i] = { reaction = if faux then nil else reaction, appuis = appuis }
		feu.BackgroundColor3 = ROUGE
		if reaction and not faux then
			annoncer(ctx, `Réaction : {string.format("%.2f", reaction)} s · {appuis} appuis`, Couleurs.OR)
		else
			annoncer(ctx, `{appuis} appuis`, Couleurs.OR)
		end
		if i < #attentes and not Jeux.attendre(ctx, p.PAUSE) then
			return nil
		end
	end
	if not Jeux.attendre(ctx, 0.6) then
		return nil
	end
	annoncer(ctx, "")
	return E.notePuissance(departs)
end

-- ───────────────────────── 4. Cœur : Colline du courage ─────────────────────────

function Jeux.coeur(ctx: Contexte, graine: number): number?
	local c = E.COEUR
	local battements = E.sequenceCoeur(graine)
	local coeur = Ui.texte(ctx.zone, "Coeur", "❤️", 96)
	coeur.AnchorPoint = Vector2.new(0.5, 0.5)
	coeur.Position = UDim2.fromScale(0.5, 0.55)
	coeur.Size = UDim2.fromOffset(140, 140)
	local anneaux: { Frame } = {}
	for i = 1, 4 do
		local a = rond(ctx.zone, `Anneau{i}`, 130, Couleurs.ROSE)
		a.BackgroundTransparency = 1
		a.Position = coeur.Position
		Ui.contour(a, Couleurs.ROSE, 6)
		a.Visible = false
		anneaux[i] = a
	end
	local fondCourage =
		Ui.cadre(ctx.zone, "Courage", UDim2.fromOffset(420, 20), UDim2.new(0.5, 0, 0, 10), Couleurs.ROSE_PALE)
	fondCourage.AnchorPoint = Vector2.new(0.5, 0)
	Ui.coins(fondCourage, 10)
	local courageJauge = Ui.cadre(fondCourage, "Jauge", UDim2.fromScale(1, 1), UDim2.new(), Couleurs.ROSE)
	Ui.coins(courageJauge, 10)
	local libelle = Ui.texte(ctx.zone, "Libelle", "Courage", 16, Couleurs.ROSE_PALE, Ui.POLICE_TEXTE)
	libelle.AnchorPoint = Vector2.new(0.5, 0)
	libelle.Position = UDim2.new(0.5, 0, 0, 34)
	libelle.Size = UDim2.fromOffset(200, 22)

	local valeurs: { number } = {}
	local juge: { boolean } = {}
	local erreurs = 0
	local courage = 1
	local premier = 1 -- premier battement pas encore jugé
	local debut = os.clock()
	annoncer(ctx, "")

	local function noter(i: number, valeur: number, mot: string)
		valeurs[i] = valeur
		juge[i] = true
		courage = E.courage(courage, valeur)
		annoncer(ctx, mot, if valeur >= 1 then Couleurs.OR elseif valeur > 0 then VERT else ROUGE)
	end

	local fin = (battements[#battements] or c.DUREE) + c.FENETRE + 0.2
	while true do
		image()
		if ctx.abandon then
			return nil
		end
		local t = os.clock() - debut
		if t > fin then
			break
		end
		-- Les appuis : chacun vise le battement non jugé le plus proche
		for _, instant in Jeux.prendre(ctx) do
			local ta = instant - debut
			local meilleur, meilleurEcart = nil :: number?, math.huge
			for i = premier, math.min(#battements, premier + 4) do
				if not juge[i] then
					local ecart = math.abs(ta - battements[i])
					if ecart < meilleurEcart then
						meilleur, meilleurEcart = i, ecart
					end
				end
			end
			if meilleur and meilleurEcart <= c.FENETRE then
				local valeur, mot = E.jugerBattement(meilleurEcart)
				noter(meilleur, valeur, mot)
			else
				erreurs += 1
				courage = E.courage(courage, 0)
				annoncer(ctx, "Hors rythme", ROUGE)
			end
		end
		-- Les battements passés sans appui sont ratés
		while premier <= #battements and (juge[premier] or battements[premier] + c.FENETRE < t) do
			if not juge[premier] then
				noter(premier, 0, "Raté")
			end
			premier += 1
		end
		-- Les anneaux qui se resserrent sur les prochains battements
		local montre = 0
		for i = premier, #battements do
			local reste = battements[i] - t
			if reste > c.APPROCHE then
				break
			end
			if not juge[i] and montre < #anneaux then
				montre += 1
				local a = anneaux[montre]
				local echelle = 1 + 2 * math.clamp(reste / c.APPROCHE, 0, 1)
				a.Size = UDim2.fromOffset(130 * echelle, 130 * echelle)
				a.Visible = true
			end
		end
		for i = montre + 1, #anneaux do
			anneaux[i].Visible = false
		end
		local battu = math.abs(t - (battements[premier] or -10)) < 0.08
		coeur.TextSize = if battu then 110 else 96
		courageJauge.Size = UDim2.fromScale(courage, 1)
		ctx.info.Text = `{math.max(0, math.ceil(c.DUREE - t))} s`
	end
	for i = 1, #battements do
		valeurs[i] = valeurs[i] or 0
	end
	return E.noteCoeur(valeurs, #battements, erreurs, courage)
end

-- ───────────────────────── 5. Instinct : Salle de lecture ─────────────────────────

function Jeux.instinct(ctx: Contexte, graine: number): number?
	local ins = E.INSTINCT
	local situations = E.sequenceInstinct(graine)
	local LARGEUR, HAUTEUR = 170, 330
	local piste = Ui.cadre(
		ctx.zone,
		"Piste",
		UDim2.fromOffset(LARGEUR * 3 + 20, HAUTEUR),
		UDim2.fromScale(0.5, 0.46),
		Couleurs.FOND,
		1
	)
	piste.AnchorPoint = Vector2.new(0.5, 0.5)
	local choix: number? = nil
	local choixInstant = 0
	local couloirs: { TextButton } = {}
	for i = 1, ins.COULOIRS do
		local b = Ui.bouton(piste, `Couloir{i}`, "", UDim2.fromOffset(LARGEUR, HAUTEUR), Color3.fromRGB(110, 170, 100))
		b.Position = UDim2.fromOffset((i - 1) * (LARGEUR + 10), 0)
		b.AutoButtonColor = false
		b.InputBegan:Connect(function(entree: InputObject)
			local genre = entree.UserInputType.Name
			if (genre == "MouseButton1" or genre == "Touch") and choix == nil then
				choix = i
				choixInstant = os.clock()
			end
		end)
		couloirs[i] = b
	end
	local toi = rond(ctx.zone, "Toi", 56, Couleurs.ROSE)
	toi.Position = UDim2.new(0.5, 0, 0.46, HAUTEUR / 2 + 36)
	Ui.contour(toi, Couleurs.BLANC, 3)
	local nomToi = Ui.texte(toi, "Nom", "toi", 18, Couleurs.BLANC)
	nomToi.Size = UDim2.fromScale(1, 1)
	local fondTemps =
		Ui.cadre(ctx.zone, "Temps", UDim2.fromOffset(LARGEUR * 3 + 20, 12), UDim2.new(0.5, 0, 0, 0), Couleurs.ROSE_PALE)
	fondTemps.AnchorPoint = Vector2.new(0.5, 0)
	Ui.coins(fondTemps, 6)
	local temps = Ui.cadre(fondTemps, "Jauge", UDim2.fromScale(1, 1), UDim2.new(), Couleurs.OR)
	Ui.coins(temps, 6)
	-- Une réserve de jetons de coureuse, replacés à chaque situation
	local jetons: { Frame } = {}
	local function jeton(n: number): Frame
		local existant = jetons[n]
		if existant then
			return existant
		end
		local j = rond(piste, `Coureuse{n}`, 64, Couleurs.CIEL)
		j.ZIndex = 5
		Ui.contour(j, Couleurs.BLANC, 3)
		local icone = Ui.texte(j, "Icone", "🏇", 34)
		icone.Size = UDim2.fromScale(1, 1)
		icone.ZIndex = 6
		jetons[n] = j
		return j
	end

	local reponses: { E.Reponse } = {}
	for q, s in situations do
		ctx.info.Text = `Situation {q} / {#situations}`
		annoncer(ctx, "")
		for _, b in couloirs do
			b.BackgroundColor3 = Color3.fromRGB(110, 170, 100)
		end
		for n, c in s.coureuses do
			local j = jeton(n)
			-- Rang 1 : juste devant toi (en bas) ; rang 4 : le plus loin (en haut)
			local y = HAUTEUR - (c.rang - 0.5) * (HAUTEUR / ins.RANGS)
			j.Position = UDim2.fromOffset((c.couloir - 1) * (LARGEUR + 10) + LARGEUR / 2, y)
			j.BackgroundColor3 = if c.rang <= ins.PROCHES then Couleurs.CIEL else Couleurs.ARGENT
			j.Visible = true
		end
		for n = #s.coureuses + 1, #jetons do
			jetons[n].Visible = false
		end
		choix = nil
		Jeux.prendre(ctx)
		local debut = os.clock()
		while choix == nil do
			image()
			if ctx.abandon then
				return nil
			end
			local t = os.clock() - debut
			temps.Size = UDim2.fromScale(math.clamp(1 - t / s.limite, 0, 1), 1)
			if t >= s.limite then
				break
			end
		end
		local choisi = choix
		local juste = choisi == s.libre
		reponses[q] = { juste = juste, temps = if choisi then choixInstant - debut else s.limite + 1 }
		couloirs[s.libre].BackgroundColor3 = VERT
		if choisi and not juste then
			couloirs[choisi].BackgroundColor3 = ROUGE
		end
		annoncer(
			ctx,
			if juste then "Bien vu !" elseif choisi then "Bouché !" else "Trop tard !",
			if juste then VERT else ROUGE
		)
		if not Jeux.attendre(ctx, ins.PAUSE) then
			return nil
		end
	end
	annoncer(ctx, "")
	return E.noteInstinct(reponses, situations)
end

return Jeux
