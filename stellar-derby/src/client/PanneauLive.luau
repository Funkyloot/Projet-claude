--!strict
-- PanneauLive — le mode Live, vu du serveur.
--
--   - Pour tout le monde, quand le mode Live est actif : un bandeau « tape
--     !join <ton pseudo> dans le chat du live », un bouton pour courir la
--     course Live en préparation, et le classement des pronostiqueurs à la
--     fin de chaque course.
--   - Pour la streameuse seulement (attribut joueur « Streameuse ») : le
--     panneau du bouton « Live » du menu — coller des pseudos, voir la file
--     des invitées, lancer un vote, lancer la course, voir les pronostics.
--
-- L'état vient de l'attribut « Live » de Reseau.monde() (JSON publié par
-- ModeLive). Les noms venus du chat y sont déjà filtrés par Roblox.

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Courses = require(Partage:WaitForChild("Course"):WaitForChild("Courses"))
local Pistes = require(Partage:WaitForChild("Course"):WaitForChild("Pistes"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Menu = require(script.Parent:WaitForChild("Menu"))
local Notifications = require(script.Parent:WaitForChild("Notifications"))
local Requetes = require(script.Parent:WaitForChild("Requetes"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local PanneauLive = {}

local bandeau: Frame
local texteBandeau: TextLabel
local boutonRejoindre: TextButton
local classementFin: Frame
local texteClassementFin: TextLabel

local panneau: Frame
local saisie: TextBox
local texteFile: TextLabel
local texteVote: TextLabel
local textePronos: TextLabel
local boutonsPistes: { [string]: TextButton } = {}
local boutonsCourses: { TextButton } = {}
local pisteChoisie = "archipel"
local courseChoisie = ""
local boutonAjoute = false
local derniereGagnante = "" -- course gagnante du vote déjà présélectionnée

type EtatLive = {
	actif: boolean?,
	streameuse: string?,
	invites: { string }?,
	vote: { options: { string }?, compte: { number }?, gagnante: number? }?,
	pronos: number?,
	classement: { { nom: string, points: number } }?,
	session: string?,
}

local function lireEtat(): EtatLive?
	local brut = Reseau.monde():GetAttribute("Live")
	if type(brut) ~= "string" or brut == "" then
		return nil
	end
	local ok, donnees = pcall(function()
		return HttpService:JSONDecode(brut)
	end)
	return if ok and type(donnees) == "table" then donnees :: EtatLive else nil
end

local function estStreameuse(): boolean
	return Players.LocalPlayer:GetAttribute("Streameuse") == true
end

-- ─────────────────────────────── Panneau de la streameuse ───────────────────────────────

local function choisirPiste(piste: string)
	pisteChoisie = piste
	for id, b in boutonsPistes do
		b.BackgroundColor3 = if id == piste then Couleurs.ROSE else Couleurs.ROSE_PALE
		b.TextColor3 = if id == piste then Couleurs.BLANC else Couleurs.TEXTE
	end
	local courses = Courses.dePiste(piste)
	courseChoisie = if courses[1] then courses[1].id else ""
	for i, b in boutonsCourses do
		local c = courses[i]
		b.Visible = c ~= nil
		if c then
			b.Text = `{c.nom} · {c.distance} m`
			b.BackgroundColor3 = if c.id == courseChoisie then Couleurs.OR else Couleurs.BLANC
		end
	end
end

local function choisirCourse(i: number)
	local c = Courses.dePiste(pisteChoisie)[i]
	if not c then
		return
	end
	courseChoisie = c.id
	for j, b in boutonsCourses do
		b.BackgroundColor3 = if j == i then Couleurs.OR else Couleurs.BLANC
	end
end

local function rafraichirPanneau()
	local e = lireEtat()
	if not e or not panneau then
		return
	end
	local invites = e.invites or {}
	texteFile.Text = if #invites == 0
		then "File vide : les spectateurs tapent !join <pseudo> dans le chat, ou colle leurs pseudos ci-dessus."
		else `{#invites} invitée(s) : {table.concat(invites, ", ")}`
	local vote = e.vote
	local options: { string } = vote and vote.options or {}
	if #options == 0 then
		texteVote.Text = "Pas de vote en cours."
	else
		local lignes: { string } = {}
		local compte = vote and vote.compte or {}
		for i, id in options do
			local c = Courses.parId(id)
			table.insert(lignes, `!vote {i} : {c and c.nom or id} — {compte[i] or 0} voix`)
		end
		texteVote.Text = table.concat(lignes, "\n")
		local gagnante = vote and vote.gagnante
		local c = gagnante and Courses.parId(options[gagnante])
		if c and c.id ~= derniereGagnante then
			-- Le choix du chat se présélectionne (une fois : la streameuse garde la main)
			derniereGagnante = c.id
			if c.piste ~= pisteChoisie then
				choisirPiste(c.piste)
			end
			for i, cc in Courses.dePiste(c.piste) do
				if cc.id == c.id then
					choisirCourse(i)
				end
			end
		end
	end
	local lignes: { string } = { `{e.pronos or 0} pronostic(s) pour cette course.` }
	local classement: { { nom: string, points: number } } = e.classement or {}
	for i, l in classement do
		table.insert(lignes, `{i}. {l.nom} — {l.points} pts`)
	end
	textePronos.Text = table.concat(lignes, "\n")
end

local function creerPanneau(gui: ScreenGui)
	local contenu: ScrollingFrame
	panneau, contenu = Ui.panneau(gui, "Live", "🎥 Mode Live", UDim2.fromOffset(760, 620))
	local function titre(texte: string, ordre: number)
		local t = Ui.texte(contenu, "Titre", texte, 19, Couleurs.ROSE)
		t.LayoutOrder = ordre
		t.Size = UDim2.new(1, 0, 0, 26)
		t.TextXAlignment = Enum.TextXAlignment.Left
	end
	local function texte(ordre: number): TextLabel
		local t = Ui.texte(contenu, "Texte", "", 15, Couleurs.TEXTE, Ui.POLICE_TEXTE)
		t.LayoutOrder = ordre
		t.Size = UDim2.new(1, -8, 0, 0)
		t.AutomaticSize = Enum.AutomaticSize.Y
		t.TextXAlignment = Enum.TextXAlignment.Left
		return t
	end
	local function rangee(ordre: number, hauteur: number): Frame
		local r = Ui.cadre(contenu, "Rangee", UDim2.new(1, -8, 0, hauteur), UDim2.new(), Couleurs.FOND, 1)
		r.LayoutOrder = ordre
		Ui.liste(r, Enum.FillDirection.Horizontal, 8, Enum.HorizontalAlignment.Left)
		return r
	end

	titre("1. Les invitées", 1)
	saisie = Instance.new("TextBox")
	saisie.Name = "Pseudos"
	saisie.LayoutOrder = 2
	saisie.Size = UDim2.new(1, -8, 0, 70)
	saisie.BackgroundColor3 = Couleurs.BLANC
	saisie.TextColor3 = Couleurs.TEXTE
	saisie.PlaceholderText = "Colle des pseudos Roblox (séparés par des espaces ou des virgules)"
	saisie.Text = ""
	saisie.ClearTextOnFocus = false
	saisie.MultiLine = true
	saisie.TextWrapped = true
	saisie.TextSize = 16
	saisie.Font = Ui.POLICE_TEXTE
	saisie.Parent = contenu
	Ui.coins(saisie, 10)
	Ui.contour(saisie, Couleurs.ROSE_PALE, 2)
	local actionsFile = rangee(3, 50)
	local ajouter = Ui.bouton(actionsFile, "Ajouter", "Ajouter à la file", UDim2.fromOffset(200, 46), Couleurs.ROSE)
	ajouter.Activated:Connect(function()
		local reponse = Requetes.envoyer("live.ajouter", { pseudos = saisie.Text })
		if reponse.ok then
			saisie.Text = ""
			Notifications.afficher(`{reponse.ajoutes or 0} invitée(s) ajoutée(s).`, "gain")
			for _, raison in reponse.refus or {} do
				Notifications.afficher(raison, "alerte")
			end
		else
			Notifications.afficher(reponse.erreur or "Impossible.", "alerte")
		end
	end)
	local retirer = Ui.bouton(
		actionsFile,
		"Retirer",
		"Retirer la première",
		UDim2.fromOffset(200, 46),
		Couleurs.ROSE_PALE,
		Couleurs.TEXTE
	)
	retirer.Activated:Connect(function()
		local e = lireEtat()
		local premiere = e and e.invites and e.invites[1]
		if premiere then
			Requetes.envoyer("live.retirer", { pseudo = premiere })
		end
	end)
	texteFile = texte(4)

	titre("2. L'hippodrome et la course", 5)
	local rangeePistes = rangee(6, 50)
	for i, def in Pistes.liste do
		local b = Ui.bouton(rangeePistes, def.id, def.nom, UDim2.fromOffset(220, 46), Couleurs.ROSE_PALE)
		b.LayoutOrder = i
		b.Activated:Connect(function()
			choisirPiste(def.id)
		end)
		boutonsPistes[def.id] = b
	end
	local grille = Ui.cadre(contenu, "Courses", UDim2.new(1, -8, 0, 100), UDim2.new(), Couleurs.FOND, 1)
	grille.LayoutOrder = 7
	local disposition = Instance.new("UIGridLayout")
	disposition.CellSize = UDim2.fromOffset(350, 44)
	disposition.CellPadding = UDim2.fromOffset(8, 8)
	disposition.Parent = grille
	for i = 1, 4 do
		local b = Ui.bouton(grille, `Course{i}`, "", UDim2.fromOffset(350, 44), Couleurs.BLANC, Couleurs.TEXTE)
		b.LayoutOrder = i
		Ui.contour(b, Couleurs.ROSE_PALE, 2)
		b.Activated:Connect(function()
			choisirCourse(i)
		end)
		boutonsCourses[i] = b
	end

	titre("3. Le vote du chat", 8)
	local voter = Ui.bouton(
		contenu,
		"Voter",
		"Proposer 3 courses de cet hippodrome au vote",
		UDim2.new(1, -8, 0, 46),
		Couleurs.CIEL
	)
	voter.LayoutOrder = 9
	voter.Activated:Connect(function()
		local reponse = Requetes.envoyer("live.vote", { piste = pisteChoisie })
		if not reponse.ok then
			Notifications.afficher(reponse.erreur or "Impossible.", "alerte")
		end
	end)
	texteVote = texte(10)

	titre("4. C'est parti !", 11)
	local lancer = Ui.bouton(contenu, "Lancer", "🏁 Lancer la course Live", UDim2.new(1, -8, 0, 56), Couleurs.OR)
	lancer.LayoutOrder = 12
	lancer.Activated:Connect(function()
		local reponse = Requetes.envoyer("live.lancer", { piste = pisteChoisie, course = courseChoisie })
		if reponse.ok then
			Menu.fermer()
			Notifications.afficher(`Course lancée avec {reponse.invitees or 0} invitée(s) du chat !`, "gain")
		else
			Notifications.afficher(reponse.erreur or "Impossible de lancer.", "alerte")
		end
	end)

	titre("Pronostics de la soirée", 13)
	textePronos = texte(14)
	local note = texte(15)
	note.Text =
		"Les pronostics ne se misent pas et ne rapportent rien d'autre qu'une place au classement. Test sans relais : tape !join, !prono ou !vote ci-dessous."
	note.TextColor3 = Couleurs.TEXTE_DOUX
	local test = Instance.new("TextBox")
	test.Name = "Test"
	test.LayoutOrder = 16
	test.Size = UDim2.new(1, -8, 0, 44)
	test.BackgroundColor3 = Couleurs.BLANC
	test.TextColor3 = Couleurs.TEXTE
	test.PlaceholderText = "Message de test (ex. !join Builderman), puis Entrée"
	test.Text = ""
	test.TextSize = 16
	test.Font = Ui.POLICE_TEXTE
	test.Parent = contenu
	Ui.coins(test, 10)
	test.FocusLost:Connect(function(entree: boolean)
		if entree and test.Text ~= "" then
			Requetes.envoyer("live.message", { auteur = "Test", texte = test.Text })
			test.Text = ""
		end
	end)
	choisirPiste("archipel")
end

-- ─────────────────────────────── Pour tout le monde ───────────────────────────────

local function rafraichirBandeau()
	local e = lireEtat()
	local actif = e ~= nil and e.actif == true
	bandeau.Visible = actif and not Etat.enCourse()
	if not e or not actif then
		return
	end
	texteBandeau.Text = `🎥 Live de {e.streameuse or "la streameuse"} · tape !join <ton pseudo> dans le chat du live`
	local session = e.session or ""
	local phase = ""
	if session ~= "" then
		local dossier = Reseau.sessions():FindFirstChild(session)
		phase = if dossier then (dossier:GetAttribute("Phase") :: string?) or "" else ""
	end
	boutonRejoindre.Visible = phase == "lobby" and Etat.monId == 0
	if estStreameuse() and not boutonAjoute then
		boutonAjoute = true
		Menu.ajouter({
			id = "live",
			icone = "🎥",
			texte = "Live",
			ordre = 80,
			ouvrir = function()
				rafraichirPanneau()
				Menu.ouvrir(panneau)
			end,
		})
	end
	if panneau.Visible then
		rafraichirPanneau()
	end
end

local function montrerClassement(donnees: any)
	if type(donnees) ~= "table" or type(donnees.classement) ~= "table" then
		return
	end
	local lignes: { string } = {
		`🔮 Pronostics : {tonumber(donnees.bons) or 0} bon(s) pronostic(s) sur cette course`,
	}
	for i, l in donnees.classement do
		if type(l) == "table" then
			table.insert(lignes, `{i}. {l.nom} — {l.points} pts`)
		end
	end
	texteClassementFin.Text = table.concat(lignes, "\n")
	classementFin.Visible = true
	task.delay(9, function()
		classementFin.Visible = false
	end)
end

function PanneauLive.creer(gui: ScreenGui)
	bandeau =
		Ui.cadre(gui, "BandeauLive", UDim2.fromOffset(640, 40), UDim2.new(0.5, 0, 0, 74), Couleurs.FOND_SOMBRE, 0.15)
	bandeau.AnchorPoint = Vector2.new(0.5, 0)
	bandeau.Visible = false
	Ui.coins(bandeau, 14)
	texteBandeau = Ui.texte(bandeau, "Texte", "", 16, Couleurs.BLANC, Ui.POLICE_TEXTE)
	texteBandeau.Size = UDim2.new(1, -170, 1, 0)
	texteBandeau.Position = UDim2.fromOffset(12, 0)
	texteBandeau.TextXAlignment = Enum.TextXAlignment.Left
	boutonRejoindre = Ui.bouton(bandeau, "Rejoindre", "Courir !", UDim2.fromOffset(140, 34), Couleurs.ROSE)
	boutonRejoindre.AnchorPoint = Vector2.new(1, 0.5)
	boutonRejoindre.Position = UDim2.new(1, -4, 0.5, 0)
	boutonRejoindre.Visible = false
	boutonRejoindre.Activated:Connect(function()
		local reponse = Requetes.envoyer("live.rejoindre")
		if not reponse.ok then
			Notifications.afficher(reponse.erreur or "Impossible pour l'instant.", "alerte")
		end
	end)

	classementFin =
		Ui.cadre(gui, "ClassementLive", UDim2.fromOffset(420, 0), UDim2.new(1, -16, 0, 130), Couleurs.FOND, 0.05)
	classementFin.AnchorPoint = Vector2.new(1, 0)
	classementFin.AutomaticSize = Enum.AutomaticSize.Y
	classementFin.Visible = false
	Ui.coins(classementFin, 16)
	Ui.contour(classementFin, Couleurs.OR, 2)
	Ui.marges(classementFin, 12)
	texteClassementFin = Ui.texte(classementFin, "Texte", "", 16, Couleurs.TEXTE, Ui.POLICE_TEXTE)
	texteClassementFin.Size = UDim2.new(1, 0, 0, 0)
	texteClassementFin.AutomaticSize = Enum.AutomaticSize.Y
	texteClassementFin.TextXAlignment = Enum.TextXAlignment.Left

	creerPanneau(gui)
	Reseau.monde():GetAttributeChangedSignal("Live"):Connect(rafraichirBandeau)
	Players.LocalPlayer:GetAttributeChangedSignal("Streameuse"):Connect(rafraichirBandeau)
	Reseau.signal().OnClientEvent:Connect(function(nom: unknown, donnees: unknown)
		if nom == "live.classement" then
			montrerClassement(donnees)
		end
	end)
	rafraichirBandeau()
end

local depuis = 0
function PanneauLive.mettreAJour()
	local t = os.clock()
	if t - depuis < 0.5 then
		return
	end
	depuis = t
	if bandeau then
		rafraichirBandeau()
	end
end

return PanneauLive
