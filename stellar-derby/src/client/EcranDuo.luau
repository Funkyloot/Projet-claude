--!strict
-- EcranDuo — le duo entraîneuse–coureuse, des deux côtés.
--
--   - Spectatrice d'une course où courent des joueuses : un bouton
--     « Entraîner une coureuse », la liste des joueuses du peloton, puis
--     trois gros boutons d'ordres avec leur recharge et le verdict.
--   - Coureuse : le bandeau « <nom> t'entraîne » et chaque ordre en grand,
--     de la couleur de son verdict.
--   - À l'Académie : le bouton « Duo » du menu liste les amies en course,
--     pour aller les regarder (et les entraîner).
--
-- Rappel d'équité : en course libre, les ordres ne sont que des conseils.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Duo = require(Partage:WaitForChild("Jeu"):WaitForChild("Duo"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Menu = require(script.Parent:WaitForChild("Menu"))
local Notifications = require(script.Parent:WaitForChild("Notifications"))
local Requetes = require(script.Parent:WaitForChild("Requetes"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local EcranDuo = {}

local PHASES_ACTIVES: { [string]: boolean } = { presentation = true, stalles = true, course = true }

local boutonEntrainer: TextButton
local choixCoureuse: Frame
local roue: Frame
local boutonsOrdres: { [string]: TextButton } = {}
local verdict: TextLabel
local bandeau: TextLabel
local grandOrdre: TextLabel
local panneauAmies: Frame
local listeAmies: ScrollingFrame

local lieA: string? = nil -- nom de la coureuse que j'entraîne
local derniereOrdre = -math.huge
local sessionLiee = ""
local rechargeAffichee = -1 -- secondes affichées sur les boutons (pour ne réécrire qu'au changement)

local function rgb(c: { number }): Color3
	return Color3.fromRGB(c[1], c[2], c[3])
end

local function spectatrice(): boolean
	return Etat.regarde() and Etat.monId == 0 and PHASES_ACTIVES[Etat.phase] == true
end

local function joueusesDuPeloton(): { { id: number, nom: string } }
	local liste = {}
	for _, p in Etat.peloton do
		if p.controle == "joueur" then
			table.insert(liste, { id = p.id, nom = p.nom })
		end
	end
	return liste
end

-- ─────────────────────────────── Entraîneuse ───────────────────────────────

local function ouvrirChoix()
	for _, enfant in choixCoureuse:GetChildren() do
		if enfant:IsA("TextButton") then
			enfant:Destroy()
		end
	end
	local joueuses = joueusesDuPeloton()
	if #joueuses == 0 then
		Notifications.afficher("Aucune joueuse ne court dans cette course.", "info")
		return
	end
	for i, j in joueuses do
		local b = Ui.bouton(choixCoureuse, `J{j.id}`, j.nom, UDim2.new(1, 0, 0, 48), Couleurs.CIEL)
		b.LayoutOrder = i
		b.Activated:Connect(function()
			choixCoureuse.Visible = false
			local reponse = Requetes.envoyer("duo.entrainer", { coureuseId = j.id })
			if reponse.ok then
				lieA = j.nom
				sessionLiee = Etat.sessionId
				Notifications.afficher(`Tu entraînes {j.nom} ! Donne tes ordres au bon moment.`, "gain")
			else
				Notifications.afficher(reponse.erreur or "Impossible d'entraîner cette coureuse.", "alerte")
			end
		end)
	end
	choixCoureuse.Visible = true
end

local function donnerOrdre(id: string)
	if os.clock() - derniereOrdre < Duo.RECHARGE then
		return
	end
	derniereOrdre = os.clock()
	Reseau.commande():FireServer("duo.ordre", id)
end

local function montrerVerdict(donnees: any)
	if type(donnees) ~= "table" then
		return
	end
	verdict.Text = `{if donnees.juste then "Juste !" else "Trop tôt…"} {donnees.explication or ""}`
	verdict.TextColor3 = if donnees.juste then Couleurs.ENDURANCE_PLEINE else Couleurs.ENDURANCE_BASSE
	verdict.TextTransparency = 0
	TweenService:Create(verdict, TweenInfo.new(0.6, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, 2.4), {
		TextTransparency = 1,
	}):Play()
end

-- ─────────────────────────────── Coureuse ───────────────────────────────

local function montrerOrdre(donnees: any)
	if type(donnees) ~= "table" or type(donnees.texte) ~= "string" then
		return
	end
	local o = Duo.ordre(donnees.ordre)
	grandOrdre.Text = `📣 {donnees.texte}`
	grandOrdre.TextColor3 = if donnees.juste then (if o then rgb(o.couleur) else Couleurs.ROSE) else Couleurs.ARGENT
	grandOrdre.TextTransparency = 0
	grandOrdre.Size = UDim2.fromOffset(700, 70)
	TweenService:Create(grandOrdre, TweenInfo.new(0.15, Enum.EasingStyle.Back), { Size = UDim2.fromOffset(760, 76) })
		:Play()
	TweenService
		:Create(grandOrdre, TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, 2.2), {
			TextTransparency = 1,
		})
		:Play()
end

-- ─────────────────────────────── Académie ───────────────────────────────

local function ouvrirAmies()
	for _, enfant in listeAmies:GetChildren() do
		if enfant:IsA("GuiObject") then
			enfant:Destroy()
		end
	end
	local trouvees = 0
	for _, joueur in Players:GetPlayers() do
		local session = joueur:GetAttribute("Session")
		if joueur ~= Players.LocalPlayer and type(session) == "string" and session ~= "" then
			local dossier = Reseau.sessions():FindFirstChild(session)
			local genre = dossier and dossier:GetAttribute("Genre")
			if dossier and genre ~= "tutoriel" then
				trouvees += 1
				local carte = Ui.cadre(listeAmies, joueur.Name, UDim2.new(1, -8, 0, 64), UDim2.new(), Couleurs.BLANC)
				carte.LayoutOrder = trouvees
				Ui.coins(carte, 12)
				Ui.marges(carte, 8)
				local titre = (dossier:GetAttribute("Titre") :: string?) or "Course"
				local texte =
					Ui.texte(carte, "Nom", `{joueur.DisplayName} · {titre}`, 16, Couleurs.TEXTE, Ui.POLICE_TEXTE)
				texte.Size = UDim2.new(1, -140, 1, 0)
				texte.TextXAlignment = Enum.TextXAlignment.Left
				local b = Ui.bouton(carte, "Regarder", "Regarder", UDim2.fromOffset(124, 46), Couleurs.CIEL)
				b.AnchorPoint = Vector2.new(1, 0.5)
				b.Position = UDim2.new(1, 0, 0.5, 0)
				local userId = joueur.UserId
				b.Activated:Connect(function()
					local reponse = Requetes.envoyer("duo.regarder", { userId = userId })
					if reponse.ok then
						Menu.fermer()
						Notifications.afficher("Touche « Entraîner une coureuse » quand la course commence.", "info")
					else
						Notifications.afficher(reponse.erreur or "Impossible pour l'instant.", "alerte")
					end
				end)
			end
		end
	end
	if trouvees == 0 then
		local vide = Ui.texte(
			listeAmies,
			"Vide",
			"Personne n'est en course pour l'instant. Reviens quand une amie lance une carrière ou une course libre !",
			16,
			Couleurs.TEXTE_DOUX,
			Ui.POLICE_TEXTE
		)
		vide.Size = UDim2.new(1, 0, 0, 60)
	end
	Menu.ouvrir(panneauAmies)
end

-- ─────────────────────────────── Construction ───────────────────────────────

function EcranDuo.creer(gui: ScreenGui)
	boutonEntrainer =
		Ui.bouton(gui, "EntrainerCoureuse", "🎽 Entraîner une coureuse", UDim2.fromOffset(250, 50), Couleurs.ROSE)
	boutonEntrainer.AnchorPoint = Vector2.new(0, 1)
	boutonEntrainer.Position = UDim2.new(0, 16, 1, -16)
	boutonEntrainer.Visible = false
	boutonEntrainer.Activated:Connect(ouvrirChoix)

	choixCoureuse =
		Ui.cadre(gui, "ChoixCoureuse", UDim2.fromOffset(250, 0), UDim2.new(0, 16, 1, -76), Couleurs.FOND, 0.1)
	choixCoureuse.AnchorPoint = Vector2.new(0, 1)
	choixCoureuse.AutomaticSize = Enum.AutomaticSize.Y
	choixCoureuse.Visible = false
	Ui.coins(choixCoureuse, 12)
	Ui.marges(choixCoureuse, 8)
	Ui.liste(choixCoureuse, Enum.FillDirection.Vertical, 6)

	-- Les trois ordres, sous le pouce gauche
	roue = Ui.cadre(gui, "Ordres", UDim2.fromOffset(250, 3 * 64), UDim2.new(0, 16, 1, -16), Couleurs.FOND, 1)
	roue.AnchorPoint = Vector2.new(0, 1)
	roue.Visible = false
	Ui.liste(roue, Enum.FillDirection.Vertical, 8)
	for i, o in Duo.ORDRES do
		local b = Ui.bouton(roue, o.id, o.texte, UDim2.new(1, 0, 0, 56), rgb(o.couleur))
		b.LayoutOrder = i
		b.Activated:Connect(function()
			donnerOrdre(o.id)
		end)
		boutonsOrdres[o.id] = b
	end
	verdict = Ui.texte(gui, "Verdict", "", 18, Couleurs.BLANC)
	verdict.AnchorPoint = Vector2.new(0, 1)
	verdict.Position = UDim2.new(0, 16, 1, -(3 * 64 + 24))
	verdict.Size = UDim2.fromOffset(420, 50)
	verdict.TextXAlignment = Enum.TextXAlignment.Left
	verdict.TextTransparency = 1
	local contourVerdict = Instance.new("UIStroke")
	contourVerdict.Thickness = 2
	contourVerdict.Color = Couleurs.FOND_SOMBRE
	contourVerdict.Parent = verdict

	-- Côté coureuse
	bandeau = Ui.texte(gui, "BandeauDuo", "", 17, Couleurs.BLANC)
	bandeau.AnchorPoint = Vector2.new(0.5, 0)
	bandeau.Position = UDim2.new(0.5, 0, 0, 74)
	bandeau.Size = UDim2.fromOffset(360, 30)
	bandeau.BackgroundColor3 = Couleurs.ROSE
	bandeau.BackgroundTransparency = 0.15
	bandeau.Visible = false
	Ui.coins(bandeau, 12)
	grandOrdre = Ui.texte(gui, "GrandOrdre", "", 44, Couleurs.ROSE)
	grandOrdre.AnchorPoint = Vector2.new(0.5, 0.5)
	grandOrdre.Position = UDim2.fromScale(0.5, 0.3)
	grandOrdre.Size = UDim2.fromOffset(760, 76)
	grandOrdre.TextTransparency = 1
	local contour = Instance.new("UIStroke")
	contour.Thickness = 3
	contour.Color = Couleurs.FOND_SOMBRE
	contour.Parent = grandOrdre

	-- À l'Académie
	panneauAmies, listeAmies = Ui.panneau(gui, "Duo", "🎽 Duo · amies en course", UDim2.fromOffset(600, 480))
	Menu.ajouter({ id = "duo", icone = "🎽", texte = "Duo", ordre = 70, ouvrir = ouvrirAmies })

	Reseau.signal().OnClientEvent:Connect(function(nom: unknown, donnees: unknown)
		if nom == "duo.debut" and type(donnees) == "table" then
			local d = donnees :: any
			bandeau.Text = `🎽 {d.entraineuse} t'entraîne !`
			bandeau.Visible = true
			Notifications.afficher(`{d.entraineuse} devient ton entraîneuse pour cette course !`, "gain")
		elseif nom == "duo.ordre" then
			montrerOrdre(donnees)
		elseif nom == "duo.verdict" then
			montrerVerdict(donnees)
		end
	end)
	Etat.ecouter("session", function()
		lieA = nil
		bandeau.Visible = false
		choixCoureuse.Visible = false
	end)
	Etat.ecouter("phase", function(phase: string)
		if phase == "fin" or phase == "aucune" or phase == "lobby" then
			lieA = nil
			bandeau.Visible = false
		end
	end)
end

function EcranDuo.mettreAJour()
	local spect = spectatrice()
	local lie = lieA ~= nil and sessionLiee == Etat.sessionId
	boutonEntrainer.Visible = spect and not lie and #Etat.peloton > 0
	if not spect then
		choixCoureuse.Visible = false
	end
	roue.Visible = spect and lie
	if roue.Visible then
		local reste = math.max(0, math.ceil(Duo.RECHARGE - (os.clock() - derniereOrdre)))
		if reste ~= rechargeAffichee then
			rechargeAffichee = reste
			for _, o in Duo.ORDRES do
				local b = boutonsOrdres[o.id]
				b.Text = if reste > 0 then `{o.texte} ({reste})` else o.texte
				b.BackgroundTransparency = if reste > 0 then 0.5 else 0
			end
		end
	end
end

return EcranDuo
