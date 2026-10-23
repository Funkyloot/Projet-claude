--!strict
-- EcranConcert — le concert de la victoire, vu du public ou de la scène.
--
-- Pendant la phase « concert » de la course regardée (la caméra filme déjà
-- la scène, voir Camera) :
--   - les trois artistes sont posées sur la scène et dansent ;
--   - la chanson joue, les projecteurs suivent l'ambiance de la salle ;
--   - sur scène (si je suis parmi les trois premières) : un jeu de rythme à
--     quatre colonnes, au doigt ou avec D F J K ; la note part au serveur à
--     la fin de la chanson ;
--   - dans la fosse : un gros bouton « Ovation ! » qui agite le bâton
--     lumineux (de la couleur du bâton équipé) et fait monter l'ambiance.
-- À la fin, un petit récapitulatif : la note ou les ovations, l'ambiance,
-- le gain.
--
-- Les règles (partition, jugement) viennent de Jeu/Concert ; l'état commun
-- (chanson, début, artistes, ambiance) des attributs Concert et
-- ConcertAmbiance de la session.

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Catalogue = require(Partage:WaitForChild("Jeu"):WaitForChild("Catalogue"))
local Concert = require(Partage:WaitForChild("Jeu"):WaitForChild("Concert"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Profil = require(script.Parent:WaitForChild("Profil"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local EcranConcert = {}

-- Danses d'émote par défaut de Roblox, utilisables dans tous les jeux
local DANSES = { "rbxassetid://507771019", "rbxassetid://507776043", "rbxassetid://507777268" }
local TOUCHES = { "D", "F", "J", "K" }
local COULEURS_COLONNES = {
	Color3.fromRGB(255, 95, 160),
	Color3.fromRGB(90, 190, 255),
	Color3.fromRGB(90, 230, 140),
	Color3.fromRGB(255, 200, 60),
}
local HAUTEUR_PISTE = 330
local LARGEUR_COLONNE = 104
local OVATIONS_PAR_SECONDE = 6

type EnCours = {
	cle: string,
	chanson: Concert.Chanson,
	debut: number,
	duree: number,
	artistes: { number },
	noms: { string },
	notes: { Concert.Note },
	valeurs: { number }, -- une par note (0 = ratée), remplie au fil du jeu
	jugees: { boolean },
	premiere: number, -- première note pas encore passée
	combo: number,
	surScene: boolean,
	noteEnvoyee: boolean,
	pistes: { AnimationTrack },
	son: Sound?,
	sonLance: boolean,
}

local gui: ScreenGui
local racine: Frame
local titre: TextLabel
local artistesTexte: TextLabel
local jaugeAmbiance: Frame
local texteAmbiance: TextLabel
local cadreRythme: Frame
local notesUi: { Frame } = {}
local jugement: TextLabel
local comboTexte: TextLabel
local cadreFosse: Frame
local boutonOvation: TextButton
local baton: Frame
local recap: Frame
local recapTexte: TextLabel

local concert: EnCours? = nil
local derniereCle = ""
local ovations: { number } = {}
local particules = 0
local projecteurs: { SpotLight } = {}

local function rgb(c: { number }): Color3
	return Color3.fromRGB(c[1], c[2], c[3])
end

local function couleurBaton(): Color3
	local d = Profil.donnees
	local objet = d and Catalogue.obtenir("batons", d.equipement.baton)
	return if objet then rgb(objet.couleur) else Couleurs.ROSE
end

-- ─────────────────────────────── Scène ───────────────────────────────

local function scene(): Instance?
	local hippodrome = Rendu.hippodrome()
	return hippodrome and hippodrome:FindFirstChild("Scene")
end

local function danser(id: number, numero: number): AnimationTrack?
	local modele = Rendu.modeleDe(id)
	local humanoide = modele and modele:FindFirstChildOfClass("Humanoid")
	local trouve = humanoide and humanoide:FindFirstChildOfClass("Animator")
	if not trouve then
		return nil
	end
	local animateur = trouve :: Animator
	for _, piste in animateur:GetPlayingAnimationTracks() do
		piste:Stop(0.2)
	end
	local animation = Instance.new("Animation")
	animation.AnimationId = DANSES[(numero - 1) % #DANSES + 1]
	local ok, piste = pcall(function()
		return animateur:LoadAnimation(animation)
	end)
	if not ok then
		return nil
	end
	local p = piste :: AnimationTrack
	p.Priority = Enum.AnimationPriority.Action
	p.Looped = true
	p:Play(0.3)
	return p
end

local function monterSurScene(c: EnCours)
	local s = scene()
	if not s then
		return
	end
	for i, id in c.artistes do
		local place = s:FindFirstChild(`Place{i}`) :: BasePart?
		if place then
			Rendu.poser(id, place.CFrame, true)
			local piste = danser(id, i)
			if piste then
				table.insert(c.pistes, piste)
			end
		end
	end
	table.clear(projecteurs)
	for _, partie in s:GetChildren() do
		if partie.Name == "Projecteur" then
			local lumiere = partie:FindFirstChildOfClass("SpotLight")
			if lumiere then
				table.insert(projecteurs, lumiere :: SpotLight)
			end
		end
	end
end

-- ─────────────────────────────── Jeu de rythme ───────────────────────────────

local function afficherJugement(mot: string, couleur: Color3)
	jugement.Text = mot
	jugement.TextColor3 = couleur
	jugement.TextTransparency = 0
	TweenService:Create(jugement, TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, 0.25), {
		TextTransparency = 1,
	}):Play()
end

local function appuyer(colonne: number)
	local c = concert
	if not c or not c.surScene then
		return
	end
	local t = Etat.maintenant() - c.debut
	-- La note non jugée de cette colonne la plus proche de l'appui
	local meilleure, meilleurEcart = nil :: number?, math.huge
	for i = c.premiere, #c.notes do
		local n = c.notes[i]
		if n.t - t > Concert.FENETRE then
			break
		end
		if n.colonne == colonne and not c.jugees[i] then
			local ecart = math.abs(n.t - t)
			if ecart < meilleurEcart then
				meilleure, meilleurEcart = i, ecart
			end
		end
	end
	if not meilleure or meilleurEcart > Concert.FENETRE then
		return
	end
	local valeur, mot = Concert.juger(meilleurEcart)
	c.valeurs[meilleure] = valeur
	c.jugees[meilleure] = true
	if valeur > 0 then
		c.combo += 1
		afficherJugement(mot, if valeur >= 1 then Couleurs.OR else Couleurs.CIEL)
	else
		c.combo = 0
		afficherJugement(mot, Couleurs.ENDURANCE_BASSE)
	end
end

local function dessinerNotes(c: EnCours, t: number)
	local utilisees = 0
	for i = c.premiere, #c.notes do
		local n = c.notes[i]
		local avance = n.t - t
		if avance > Concert.CHUTE then
			break
		end
		if not c.jugees[i] and utilisees < #notesUi then
			utilisees += 1
			local f = notesUi[utilisees]
			f.Visible = true
			f.BackgroundColor3 = COULEURS_COLONNES[n.colonne]
			-- En haut quand elle apparaît, sur la ligne quand il faut toucher
			local y = HAUTEUR_PISTE * (1 - avance / Concert.CHUTE)
			f.Position = UDim2.fromOffset((n.colonne - 0.5) * LARGEUR_COLONNE, y)
		end
	end
	for i = utilisees + 1, #notesUi do
		notesUi[i].Visible = false
	end
end

local function avancerRythme(c: EnCours, t: number)
	-- Les notes passées sans appui sont ratées
	while c.premiere <= #c.notes do
		local i = c.premiere
		if c.jugees[i] then
			c.premiere += 1
		elseif c.notes[i].t + Concert.FENETRE < t then
			c.valeurs[i] = 0
			c.jugees[i] = true
			c.combo = 0
			c.premiere += 1
		else
			break
		end
	end
	dessinerNotes(c, t)
	comboTexte.Text = if c.combo >= 3 then `{c.combo} combo !` else ""
	if not c.noteEnvoyee and t > c.duree + 0.3 then
		c.noteEnvoyee = true
		Reseau.commande():FireServer("concert.note", Concert.note(c.valeurs, #c.notes))
	end
end

-- ─────────────────────────────── Fosse ───────────────────────────────

local function etincelle()
	if particules > 40 then
		return
	end
	particules += 1
	local p = Ui.texte(cadreFosse, "Etincelle", "✦", 26, couleurBaton())
	p.AnchorPoint = Vector2.new(0.5, 0.5)
	p.Size = UDim2.fromOffset(30, 30)
	p.Position = UDim2.new(0.5, math.random(-60, 60), 0.5, math.random(-30, 30))
	local tween = TweenService:Create(p, TweenInfo.new(0.7, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Position = p.Position + UDim2.fromOffset(math.random(-50, 50), -math.random(90, 160)),
		TextTransparency = 1,
		Rotation = math.random(-90, 90),
	})
	tween.Completed:Once(function()
		p:Destroy()
		particules -= 1
	end)
	tween:Play()
end

local function ovation()
	local c = concert
	if not c or c.surScene then
		return
	end
	local t = os.clock()
	for i = #ovations, 1, -1 do
		if t - ovations[i] >= 1 then
			table.remove(ovations, i)
		end
	end
	if #ovations >= OVATIONS_PAR_SECONDE then
		return
	end
	table.insert(ovations, t)
	Reseau.commande():FireServer("concert.ovation", true)
	-- Le bâton s'agite, des étincelles s'envolent
	baton.Rotation = if baton.Rotation > 0 then -25 else 25
	TweenService:Create(baton, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Rotation = 0 }):Play()
	for _ = 1, 3 do
		etincelle()
	end
end

-- ─────────────────────────────── Début et fin ───────────────────────────────

local function arreter()
	local c = concert
	concert = nil
	if c then
		for _, piste in c.pistes do
			piste:Stop(0.3)
		end
		local son = c.son
		if son then
			TweenService:Create(son, TweenInfo.new(1.2), { Volume = 0 }):Play()
			task.delay(1.3, function()
				son:Destroy()
			end)
		end
	end
	racine.Visible = false
end

local function commencer(cle: string, donnees: any)
	arreter()
	local chanson = Concert.chanson(donnees.chanson)
	local artistes: { number } = {}
	for _, id in donnees.artistes or {} do
		if type(id) == "number" then
			table.insert(artistes, id)
		end
	end
	local noms: { string } = {}
	for _, nom in donnees.noms or {} do
		if type(nom) == "string" then
			table.insert(noms, nom)
		end
	end
	local duree = tonumber(donnees.duree) or Concert.DUREE
	local c: EnCours = {
		cle = cle,
		chanson = chanson,
		debut = tonumber(donnees.debut) or Etat.maintenant(),
		duree = duree,
		artistes = artistes,
		noms = noms,
		notes = Concert.partition(tonumber(donnees.graine) or 1, chanson.tempo, duree),
		valeurs = {},
		jugees = {},
		premiere = 1,
		combo = 0,
		surScene = Etat.monId ~= 0 and table.find(artistes, Etat.monId) ~= nil,
		noteEnvoyee = false,
		pistes = {},
		son = nil,
		sonLance = false,
	}
	concert = c
	if chanson.son ~= "" then
		local son = Instance.new("Sound")
		son.Name = "ChansonConcert"
		son.SoundId = chanson.son
		son.Volume = math.min(1, 0.5 * (if Profil.donnees then Profil.donnees.reglages.musique / 0.35 else 1))
		son.Parent = SoundService
		c.son = son
	end
	monterSurScene(c)

	titre.Text = `🎤 Concert de la victoire · « {chanson.nom} »`
	local lignes: { string } = {}
	for i, nom in noms do
		table.insert(lignes, `{if i == 1 then "👑" else tostring(i)} {nom}`)
	end
	artistesTexte.Text = table.concat(lignes, "    ")
	cadreRythme.Visible = c.surScene
	cadreFosse.Visible = not c.surScene
	baton.BackgroundColor3 = couleurBaton()
	boutonOvation.BackgroundColor3 = couleurBaton()
	recap.Visible = false
	jugement.Text = ""
	comboTexte.Text = ""
	racine.Visible = true
end

local function montrerBilan(donnees: any)
	if type(donnees) ~= "table" then
		return
	end
	local ambiance = math.floor((tonumber(donnees.ambiance) or 0) * 100 + 0.5)
	local premiere = if donnees.scene
		then `Ta prestation : {tonumber(donnees.note) or 0} / 100`
		else `Tes ovations : {tonumber(donnees.gestes) or 0}`
	recapTexte.Text =
		`{premiere}\nAmbiance de la salle : {ambiance} %\n+{tonumber(donnees.etoiles) or 0} ★   +{tonumber(donnees.xp) or 0} XP`
	recap.Visible = true
	task.delay(5, function()
		recap.Visible = false
	end)
end

-- ─────────────────────────────── Construction ───────────────────────────────

local function creerInterface(parent: ScreenGui)
	racine = Ui.cadre(parent, "Concert", UDim2.fromScale(1, 1), UDim2.new(), Couleurs.FOND, 1)
	racine.Visible = false
	racine.ZIndex = 8

	local bandeau =
		Ui.cadre(racine, "Bandeau", UDim2.fromOffset(720, 96), UDim2.new(0.5, 0, 0, 10), Couleurs.FOND_SOMBRE, 0.2)
	bandeau.AnchorPoint = Vector2.new(0.5, 0)
	Ui.coins(bandeau, 18)
	titre = Ui.texte(bandeau, "Titre", "", 24, Couleurs.ROSE_PALE)
	titre.Position = UDim2.fromOffset(0, 6)
	titre.Size = UDim2.new(1, 0, 0, 30)
	artistesTexte = Ui.texte(bandeau, "Artistes", "", 18, Couleurs.BLANC, Ui.POLICE_TEXTE)
	artistesTexte.Position = UDim2.fromOffset(0, 38)
	artistesTexte.Size = UDim2.new(1, 0, 0, 24)
	local fondAmbiance =
		Ui.cadre(bandeau, "Ambiance", UDim2.new(1, -200, 0, 14), UDim2.new(0, 20, 0, 70), Couleurs.ROSE_PALE)
	Ui.coins(fondAmbiance, 7)
	jaugeAmbiance = Ui.cadre(fondAmbiance, "Jauge", UDim2.fromScale(0, 1), UDim2.new(), Couleurs.ROSE)
	Ui.coins(jaugeAmbiance, 7)
	texteAmbiance = Ui.texte(bandeau, "TexteAmbiance", "Ambiance 0 %", 16, Couleurs.OR)
	texteAmbiance.AnchorPoint = Vector2.new(1, 0)
	texteAmbiance.Position = UDim2.new(1, -16, 0, 64)
	texteAmbiance.Size = UDim2.fromOffset(160, 24)

	-- Le jeu de rythme, en bas au centre
	cadreRythme = Ui.cadre(
		racine,
		"Rythme",
		UDim2.fromOffset(LARGEUR_COLONNE * 4, HAUTEUR_PISTE + 90),
		UDim2.new(0.5, 0, 1, -12),
		Couleurs.FOND_SOMBRE,
		0.35
	)
	cadreRythme.AnchorPoint = Vector2.new(0.5, 1)
	cadreRythme.ClipsDescendants = true
	Ui.coins(cadreRythme, 16)
	local ligne =
		Ui.cadre(cadreRythme, "Ligne", UDim2.new(1, 0, 0, 4), UDim2.fromOffset(0, HAUTEUR_PISTE), Couleurs.BLANC)
	ligne.AnchorPoint = Vector2.new(0, 0.5)
	for i = 1, 24 do
		local f =
			Ui.cadre(cadreRythme, `Note{i}`, UDim2.fromOffset(LARGEUR_COLONNE - 18, 22), UDim2.new(), Couleurs.ROSE)
		f.AnchorPoint = Vector2.new(0.5, 0.5)
		f.Visible = false
		Ui.coins(f, 11)
		notesUi[i] = f
	end
	for colonne = 1, 4 do
		local b = Ui.bouton(
			cadreRythme,
			`Touche{colonne}`,
			TOUCHES[colonne],
			UDim2.fromOffset(LARGEUR_COLONNE - 8, 76),
			COULEURS_COLONNES[colonne]
		)
		b.Position = UDim2.fromOffset((colonne - 1) * LARGEUR_COLONNE + 4, HAUTEUR_PISTE + 8)
		b.AutoButtonColor = true
		b.InputBegan:Connect(function(entree: InputObject)
			local genre = entree.UserInputType.Name
			if genre == "MouseButton1" or genre == "Touch" then
				appuyer(colonne)
			end
		end)
	end
	jugement = Ui.texte(racine, "Jugement", "", 36, Couleurs.OR)
	jugement.AnchorPoint = Vector2.new(0.5, 0.5)
	jugement.Position = UDim2.new(0.5, 0, 1, -(HAUTEUR_PISTE + 130))
	jugement.Size = UDim2.fromOffset(400, 44)
	comboTexte = Ui.texte(racine, "Combo", "", 22, Couleurs.BLANC)
	comboTexte.AnchorPoint = Vector2.new(0.5, 0.5)
	comboTexte.Position = UDim2.new(0.5, 0, 1, -(HAUTEUR_PISTE + 96))
	comboTexte.Size = UDim2.fromOffset(300, 28)

	-- La fosse : le bâton lumineux et le bouton d'ovation, sous le pouce droit
	cadreFosse = Ui.cadre(racine, "Fosse", UDim2.fromOffset(300, 300), UDim2.new(1, -16, 1, -16), Couleurs.FOND, 1)
	cadreFosse.AnchorPoint = Vector2.new(1, 1)
	baton = Ui.cadre(cadreFosse, "Baton", UDim2.fromOffset(18, 110), UDim2.new(0.5, 0, 0, 70), Couleurs.ROSE)
	baton.AnchorPoint = Vector2.new(0.5, 1)
	Ui.coins(baton, 9)
	boutonOvation = Ui.bouton(cadreFosse, "Ovation", "Ovation !", UDim2.fromOffset(190, 190), Couleurs.ROSE)
	boutonOvation.AnchorPoint = Vector2.new(0.5, 1)
	boutonOvation.Position = UDim2.new(0.5, 0, 1, 0)
	Ui.coins(boutonOvation, 95)
	Ui.contour(boutonOvation, Couleurs.BLANC, 4)
	boutonOvation.Activated:Connect(ovation)

	-- Le récapitulatif de fin
	recap = Ui.cadre(racine, "Recap", UDim2.fromOffset(420, 150), UDim2.fromScale(0.5, 0.45), Couleurs.FOND)
	recap.AnchorPoint = Vector2.new(0.5, 0.5)
	recap.Visible = false
	Ui.coins(recap, 20)
	Ui.contour(recap, Couleurs.OR, 3)
	recapTexte = Ui.texte(recap, "Texte", "", 20, Couleurs.TEXTE)
	recapTexte.Size = UDim2.fromScale(1, 1)
end

function EcranConcert.creer(parent: ScreenGui)
	gui = parent
	creerInterface(gui)
	UserInputService.InputBegan:Connect(function(entree: InputObject, traite: boolean)
		if traite or not concert then
			return
		end
		if entree.UserInputType.Name ~= "Keyboard" then
			return
		end
		local touche = entree.KeyCode.Name
		local colonne = table.find(TOUCHES, touche)
		if colonne then
			appuyer(colonne)
		elseif touche == "Space" then
			ovation()
		end
	end)
	Reseau.signal().OnClientEvent:Connect(function(nom: unknown, donnees: unknown)
		if nom == "concert.bilan" then
			montrerBilan(donnees)
		end
	end)
end

function EcranConcert.mettreAJour()
	local dossier = Etat.dossier
	local enPhase = Etat.phase == "concert" and dossier ~= nil
	if not enPhase or not dossier then
		if concert then
			arreter()
		end
		return
	end
	-- Un nouveau concert commence ?
	local brut = dossier:GetAttribute("Concert")
	if type(brut) == "string" and brut ~= "" and brut ~= derniereCle then
		local ok, donnees = pcall(function()
			return HttpService:JSONDecode(brut)
		end)
		derniereCle = brut
		if ok and type(donnees) == "table" then
			commencer(brut, donnees)
		end
	end
	local c = concert
	if not c then
		return
	end
	local t = Etat.maintenant() - c.debut
	-- La musique démarre avec la chanson (même si l'on arrive en retard)
	local son = c.son
	if son and not c.sonLance and t >= 0 then
		c.sonLance = true
		son.TimePosition = c.chanson.depart + t
		son:Play()
	end
	local ambiance = (dossier:GetAttribute("ConcertAmbiance") :: number?) or 0
	jaugeAmbiance.Size = UDim2.fromScale(math.clamp(ambiance, 0, 1), 1)
	texteAmbiance.Text = `Ambiance {math.floor(ambiance * 100 + 0.5)} %`
	-- Les projecteurs tournent sur l'arc-en-ciel, plus vite et plus fort quand la salle s'enflamme
	for i, lumiere in projecteurs do
		local teinte = (os.clock() * (0.05 + 0.25 * ambiance) + i / #projecteurs) % 1
		lumiere.Color = Color3.fromHSV(teinte, 0.35 + 0.6 * ambiance, 1)
		lumiere.Brightness = 1.5 + 3 * ambiance
	end
	if c.surScene then
		avancerRythme(c, t)
	end
end

return EcranConcert
