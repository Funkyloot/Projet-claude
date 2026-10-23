--!strict
-- EcranEntrainement — les ateliers d'entraînement et leurs cinq mini-jeux.
--
-- On s'entraîne :
--   - à l'Académie, par les ateliers du Centre d'entraînement (invites
--     « entrainement:<stat> ») ou par le bouton « Entraînement » du menu ;
--   - en carrière, depuis le tableau de bord de la carrière.
--
-- Une partie : le serveur donne un jeton et une graine, le jeu se joue en
-- plein écran (consigne, 3-2-1, jeu), puis la note part au serveur, qui
-- répond avec ce qu'elle rapporte. L'écran de fin montre la note, son mot
-- et le gain.
--
-- Contrat avec EcranCarriere : EcranEntrainement.jouer(stat, mode) lance le
-- mini-jeu de la stat (mode "libre" ou "carriere"), attend qu'il se termine
-- et renvoie la réponse du serveur à « entrainement.terminer » (avec la
-- qualité et, en carrière, les gains), ou nil si le joueur abandonne.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local E = require(Partage:WaitForChild("Jeu"):WaitForChild("Entrainement"))

local EntrainementJeux = require(script.Parent:WaitForChild("EntrainementJeux"))
local Interactions = require(script.Parent:WaitForChild("Interactions"))
local Menu = require(script.Parent:WaitForChild("Menu"))
local Notifications = require(script.Parent:WaitForChild("Notifications"))
local Profil = require(script.Parent:WaitForChild("Profil"))
local Requetes = require(script.Parent:WaitForChild("Requetes"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local EcranEntrainement = {}

local panneau: Frame
local resteDuJour: TextLabel
local records: { [string]: TextLabel } = {}

-- L'écran plein du mini-jeu
local fond: Frame
local titre: TextLabel
local consigne: TextLabel
local info: TextLabel
local grand: TextLabel
local zone: Frame
local abandonner: TextButton
local fin: Frame
local finNote: TextLabel
local finMot: TextLabel
local finGain: TextLabel
local finContinuer: TextButton

local enCours = false
local ctx: EntrainementJeux.Contexte? = nil
local pressions = 0

type Jeu = (EntrainementJeux.Contexte, number) -> number?
local JEUX: { [string]: Jeu } = {
	vitesse = EntrainementJeux.vitesse,
	souffle = EntrainementJeux.souffle,
	puissance = EntrainementJeux.puissance,
	coeur = EntrainementJeux.coeur,
	instinct = EntrainementJeux.instinct,
}

-- ─────────────────────────── Les appuis ───────────────────────────
-- Une seule source pour tous les appuis : UserInputService. Un toucher, un
-- clic ou la barre d'espace comptent pareil ; chaque appui est horodaté.

local function estAppui(entree: InputObject): boolean
	local genre = entree.UserInputType.Name
	if genre == "MouseButton1" or genre == "Touch" then
		return true
	end
	return genre == "Keyboard" and entree.KeyCode.Name == "Space"
end

local function brancherAppuis()
	UserInputService.InputBegan:Connect(function(entree: InputObject)
		local c = ctx
		if c and estAppui(entree) then
			pressions += 1
			c.appuye = true
			table.insert(c.appuis, os.clock())
		end
	end)
	UserInputService.InputEnded:Connect(function(entree: InputObject)
		local c = ctx
		if c and estAppui(entree) then
			pressions = math.max(0, pressions - 1)
			c.appuye = pressions > 0
		end
	end)
end

-- ─────────────────────────── L'écran de jeu ───────────────────────────

local function creerEcranJeu(gui: ScreenGui)
	fond = Ui.cadre(gui, "Entrainement", UDim2.fromScale(1, 1), UDim2.new(), Couleurs.FOND_SOMBRE, 0.08)
	fond.Visible = false
	fond.ZIndex = 30
	-- Un grand bouton invisible sous tout le reste : les appuis ne font pas
	-- tourner la caméra ni marcher le personnage
	local capture = Instance.new("TextButton")
	capture.Name = "Capture"
	capture.Size = UDim2.fromScale(1, 1)
	capture.BackgroundTransparency = 1
	capture.Text = ""
	capture.AutoButtonColor = false
	capture.ZIndex = 1
	capture.Parent = fond

	titre = Ui.texte(fond, "Titre", "", 34, Couleurs.ROSE_PALE)
	titre.Position = UDim2.fromOffset(24, 18)
	titre.Size = UDim2.new(1, -260, 0, 42)
	titre.TextXAlignment = Enum.TextXAlignment.Left
	titre.ZIndex = 2
	consigne = Ui.texte(fond, "Consigne", "", 20, Couleurs.BLANC, Ui.POLICE_TEXTE)
	consigne.Position = UDim2.fromOffset(24, 62)
	consigne.Size = UDim2.new(1, -260, 0, 30)
	consigne.TextXAlignment = Enum.TextXAlignment.Left
	consigne.ZIndex = 2
	info = Ui.texte(fond, "Info", "", 22, Couleurs.OR)
	info.AnchorPoint = Vector2.new(0.5, 0)
	info.Position = UDim2.new(0.5, 0, 0, 100)
	info.Size = UDim2.fromOffset(400, 30)
	info.ZIndex = 2

	zone = Ui.cadre(fond, "Zone", UDim2.fromOffset(900, 440), UDim2.fromScale(0.5, 0.58), Couleurs.FOND, 1)
	zone.AnchorPoint = Vector2.new(0.5, 0.5)
	zone.ZIndex = 2

	grand = Ui.texte(fond, "Grand", "", 44, Couleurs.BLANC)
	grand.AnchorPoint = Vector2.new(0.5, 0)
	grand.Position = UDim2.new(0.5, 0, 0, 132)
	grand.Size = UDim2.fromOffset(900, 56)
	grand.ZIndex = 3

	abandonner =
		Ui.bouton(fond, "Abandonner", "Abandonner", UDim2.fromOffset(190, 50), Couleurs.ROSE_PALE, Couleurs.TEXTE)
	abandonner.AnchorPoint = Vector2.new(1, 0)
	abandonner.Position = UDim2.new(1, -20, 0, 20)
	abandonner.ZIndex = 4
	abandonner.Activated:Connect(function()
		local c = ctx
		if c then
			c.abandon = true
		end
	end)

	-- L'écran de fin
	fin = Ui.cadre(fond, "Fin", UDim2.fromOffset(520, 340), UDim2.fromScale(0.5, 0.55), Couleurs.FOND)
	fin.AnchorPoint = Vector2.new(0.5, 0.5)
	fin.ZIndex = 5
	fin.Visible = false
	Ui.coins(fin, 24)
	Ui.contour(fin, Couleurs.ROSE_PALE, 3)
	finNote = Ui.texte(fin, "Note", "", 72, Couleurs.ROSE)
	finNote.Position = UDim2.fromOffset(0, 24)
	finNote.Size = UDim2.new(1, 0, 0, 80)
	finMot = Ui.texte(fin, "Mot", "", 30, Couleurs.TEXTE)
	finMot.Position = UDim2.fromOffset(0, 108)
	finMot.Size = UDim2.new(1, 0, 0, 38)
	finGain = Ui.texte(fin, "Gain", "", 19, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
	finGain.Position = UDim2.fromOffset(20, 152)
	finGain.Size = UDim2.new(1, -40, 0, 84)
	finContinuer = Ui.bouton(fin, "Continuer", "Continuer", UDim2.fromOffset(220, 56), Couleurs.ROSE)
	finContinuer.AnchorPoint = Vector2.new(0.5, 1)
	finContinuer.Position = UDim2.new(0.5, 0, 1, -22)
end

local function viderZone()
	for _, enfant in zone:GetChildren() do
		enfant:Destroy()
	end
end

-- Ce que l'écran de fin dit du gain, selon la réponse du serveur.
local function texteGain(reponse: { [string]: any }): string
	local lignes: { string } = {}
	if reponse.record then
		table.insert(lignes, "🏅 Nouveau record !")
	end
	if type(reponse.etoiles) == "number" then
		table.insert(lignes, `+{reponse.etoiles} ★   +{reponse.xp or 0} XP`)
		if reponse.pleinTarif == false then
			table.insert(lignes, "Tu as beaucoup travaillé aujourd'hui : les étoiles sont réduites jusqu'à demain.")
		end
	end
	if reponse.blessure == true then
		table.insert(lignes, "Aïe, une petite blessure : pas de progrès ce tour-ci. Pense à te reposer.")
	elseif type(reponse.gain) == "number" and type(reponse.stat) == "string" then
		local jeu = E.JEUX[reponse.stat]
		local ligne = `{jeu and jeu.stat or reponse.stat} +{reponse.gain}`
		local lie = if type(reponse.lie) == "string" then E.JEUX[reponse.lie] else nil
		if lie and type(reponse.gainLie) == "number" and reponse.gainLie > 0 then
			ligne ..= `   {lie.stat} +{reponse.gainLie}`
		end
		table.insert(lignes, ligne)
	end
	return table.concat(lignes, "\n")
end

local function attendreContinuer()
	local clique = false
	local connexion = finContinuer.Activated:Connect(function()
		clique = true
	end)
	while not clique and fond.Visible do
		task.wait(0.05)
	end
	connexion:Disconnect()
end

-- Joue le mini-jeu `stat` ; renvoie la réponse du serveur, ou nil.
function EcranEntrainement.jouer(stat: string, mode: string): { [string]: any }?
	local jeu = E.JEUX[stat]
	local deroule = JEUX[stat]
	if not jeu or not deroule or enCours then
		return nil
	end
	enCours = true
	local depart = Requetes.envoyer("entrainement.commencer", { jeu = stat, mode = mode })
	if not depart.ok or type(depart.jeton) ~= "string" or type(depart.graine) ~= "number" then
		Notifications.afficher(depart.erreur or "Impossible de commencer l'entraînement.", "alerte")
		enCours = false
		return nil
	end

	local rendreMenu = Menu.masquer()
	Menu.fermer()
	viderZone()
	fin.Visible = false
	abandonner.Visible = true
	titre.Text = `{jeu.icone} {jeu.nom}`
	consigne.Text = jeu.consigne
	info.Text = if mode == "carriere" then "Entraînement de carrière" else `Stat travaillée : {jeu.stat}`
	fond.Visible = true
	pressions = 0
	local c: EntrainementJeux.Contexte = {
		zone = zone,
		info = info,
		grand = grand,
		appuye = false,
		appuis = {},
		abandon = false,
	}
	ctx = c

	local function terminer(reponse: { [string]: any }?): { [string]: any }?
		ctx = nil
		viderZone()
		fond.Visible = false
		rendreMenu()
		enCours = false
		return reponse
	end

	-- La consigne, puis 3-2-1
	grand.TextColor3 = Couleurs.BLANC
	grand.Text = "Prête ?"
	if not EntrainementJeux.attendre(c, 2) then
		Requetes.envoyer("entrainement.abandonner")
		return terminer(nil)
	end
	for _, compte in { "3", "2", "1" } do
		grand.Text = compte
		if not EntrainementJeux.attendre(c, 0.7) then
			Requetes.envoyer("entrainement.abandonner")
			return terminer(nil)
		end
	end
	grand.Text = "C'est parti !"
	c.appuis = {}

	local note = deroule(c, depart.graine)
	if note == nil or c.abandon then
		Requetes.envoyer("entrainement.abandonner")
		return terminer(nil)
	end

	-- La note au serveur, puis l'écran de fin
	abandonner.Visible = false
	ctx = nil
	grand.Text = ""
	local reponse = Requetes.envoyer("entrainement.terminer", { jeton = depart.jeton, note = note })
	fin.Visible = true
	if reponse.ok then
		local n = if type(reponse.note) == "number" then reponse.note else note
		finNote.Text = `{n} / 100`
		finMot.Text = if type(reponse.mot) == "string" then reponse.mot else E.mot(n)
		finGain.Text = texteGain(reponse)
	else
		finNote.Text = `{note} / 100`
		finMot.Text = E.mot(note)
		finGain.Text = reponse.erreur or "Le serveur n'a pas compté cette partie."
	end
	attendreContinuer()
	return terminer(if reponse.ok then reponse else nil)
end

-- ─────────────────────────── Le panneau de l'Académie ───────────────────────────

local function rafraichirRecords()
	local d = Profil.donnees
	for id, etiquette in records do
		local meilleur = d and d.stats.meilleursScores[id]
		etiquette.Text = if meilleur then `Record : {meilleur} / 100` else "Pas encore essayé"
	end
end

local function rafraichirJour()
	task.spawn(function()
		local reponse = Requetes.envoyer("entrainement.etat")
		if reponse.ok and type(reponse.restants) == "number" then
			resteDuJour.Text = if reponse.restants > 0
				then `Encore {reponse.restants} entraînement(s) au plein tarif aujourd'hui.`
				else "Plein tarif épuisé pour aujourd'hui : les étoiles sont réduites jusqu'à demain."
		end
	end)
end

function EcranEntrainement.ouvrir()
	rafraichirRecords()
	rafraichirJour()
	Menu.ouvrir(panneau)
end

-- Un mini-jeu lancé de l'Académie (panneau ou atelier) : on revient au panneau après.
local function jouerLibre(stat: string, rouvrir: boolean)
	EcranEntrainement.jouer(stat, "libre")
	if rouvrir then
		EcranEntrainement.ouvrir()
	end
end

local function creerPanneau(gui: ScreenGui)
	local contenu: ScrollingFrame
	panneau, contenu = Ui.panneau(gui, "PanneauEntrainement", "🏋️ Entraînement", UDim2.fromOffset(660, 580))
	resteDuJour = Ui.texte(contenu, "Jour", "", 15, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
	resteDuJour.Size = UDim2.new(1, 0, 0, 40)
	resteDuJour.LayoutOrder = 0
	for ordre, id in E.ORDRE do
		local jeu = E.JEUX[id]
		local carte = Ui.cadre(contenu, id, UDim2.new(1, -8, 0, 96), UDim2.new(), Couleurs.BLANC)
		carte.LayoutOrder = ordre
		Ui.coins(carte, 16)
		Ui.contour(carte, Couleurs.ROSE_PALE, 2)
		Ui.marges(carte, 10)
		local icone = Ui.texte(carte, "Icone", jeu.icone, 40)
		icone.Size = UDim2.fromOffset(56, 76)
		local nom = Ui.texte(carte, "Nom", `{jeu.nom} · {jeu.stat}`, 19, Couleurs.ROSE)
		nom.Position = UDim2.fromOffset(64, 0)
		nom.Size = UDim2.new(1, -230, 0, 26)
		nom.TextXAlignment = Enum.TextXAlignment.Left
		local texte = Ui.texte(carte, "Consigne", jeu.consigne, 14, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
		texte.Position = UDim2.fromOffset(64, 26)
		texte.Size = UDim2.new(1, -230, 0, 32)
		texte.TextXAlignment = Enum.TextXAlignment.Left
		local record = Ui.texte(carte, "Record", "", 15, Couleurs.TEXTE, Ui.POLICE_TEXTE)
		record.Position = UDim2.fromOffset(64, 58)
		record.Size = UDim2.new(1, -230, 0, 20)
		record.TextXAlignment = Enum.TextXAlignment.Left
		records[id] = record
		local jouer = Ui.bouton(carte, "Jouer", "S'entraîner", UDim2.fromOffset(150, 52), Couleurs.ROSE)
		jouer.AnchorPoint = Vector2.new(1, 0.5)
		jouer.Position = UDim2.new(1, 0, 0.5, 0)
		jouer.Activated:Connect(function()
			jouerLibre(id, true)
		end)
	end
	Profil.ecouter(rafraichirRecords)
end

function EcranEntrainement.creer(gui: ScreenGui)
	creerPanneau(gui)
	creerEcranJeu(gui)
	brancherAppuis()
	Menu.ajouter({
		id = "entrainement",
		icone = "🏋️",
		texte = "Entraînement",
		ordre = 30,
		ouvrir = EcranEntrainement.ouvrir,
	})
	Interactions.surAction("entrainement", function(stat: string)
		if E.existe(stat) then
			jouerLibre(stat, false)
		end
	end)
end

function EcranEntrainement.mettreAJour() end

return EcranEntrainement
