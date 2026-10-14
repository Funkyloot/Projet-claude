--!strict
-- Resultats — le classement d'arrivée, avec les écarts à la japonaise.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Couleurs = require(Partage:WaitForChild("Couleurs"))
local Strategies = require(Partage:WaitForChild("Course"):WaitForChild("Strategies"))

local Etat = require(script.Parent:WaitForChild("Etat"))
local Ui = require(script.Parent:WaitForChild("Ui"))

local Resultats = {}

local panneau: Frame
local titre: TextLabel
local liste: Frame
local pied: TextLabel

local function ligne(r: Etat.Resultat, estMoi: boolean)
	local rangee = Ui.cadre(
		liste,
		`Ligne{r.rang}`,
		UDim2.new(1, 0, 0, 30),
		UDim2.new(),
		if estMoi then Couleurs.ROSE_PALE else Couleurs.BLANC,
		if estMoi then 0 else 0.3
	)
	rangee.LayoutOrder = r.rang
	Ui.coins(rangee, 8)

	local function colonne(
		nom: string,
		texte: string,
		x: number,
		largeur: number,
		alignement: Enum.TextXAlignment,
		couleur: Color3?
	)
		local t = Ui.texte(rangee, nom, texte, 16, couleur or Couleurs.TEXTE, Ui.POLICE_TEXTE)
		t.Position = UDim2.fromOffset(x, 0)
		t.Size = UDim2.new(0, largeur, 1, 0)
		t.TextXAlignment = alignement
		t.TextWrapped = false
		t.TextTruncate = Enum.TextTruncate.AtEnd
		return t
	end

	local medaille = if r.rang == 1
		then "🥇"
		elseif r.rang == 2 then "🥈"
		elseif r.rang == 3 then "🥉"
		else tostring(r.rang)
	local premier = colonne("Rang", medaille, 6, 34, Enum.TextXAlignment.Center)
	premier.Font = Ui.POLICE
	local numero = Ui.texte(rangee, "Numero", tostring(r.numero), 14, Couleurs.TEXTE_CADRES[r.cadre])
	numero.BackgroundTransparency = 0
	numero.BackgroundColor3 = Couleurs.CADRES[r.cadre]
	numero.Position = UDim2.fromOffset(46, 4)
	numero.Size = UDim2.fromOffset(26, 22)
	Ui.coins(numero, 6)
	local s = Strategies.parId[r.strategie]
	colonne("Nom", `{r.nom}{if estMoi then "  ← toi" else ""}`, 80, 250, Enum.TextXAlignment.Left).Font = Ui.POLICE
	colonne("Strategie", s and s.icone or "", 330, 30, Enum.TextXAlignment.Center)
	colonne("Temps", Ui.chrono(r.temps), 362, 80, Enum.TextXAlignment.Right)
	colonne("Ecart", r.ecart, 450, 110, Enum.TextXAlignment.Right, Couleurs.TEXTE_DOUX)
end

local function remplir()
	for _, enfant in liste:GetChildren() do
		if enfant:IsA("Frame") then
			enfant:Destroy()
		end
	end
	local course = Etat.course()
	titre.Text = if course then `{course.nom} — Résultats` else "Résultats"
	local moi = Etat.monId
	for _, r in Etat.resultats do
		ligne(r, r.id == moi and moi ~= 0)
	end
end

function Resultats.creer(parent: ScreenGui)
	panneau = Ui.cadre(parent, "Resultats", UDim2.fromOffset(600, 520), UDim2.new(1, -24, 0.5, 0), Couleurs.FOND, 0.04)
	panneau.AnchorPoint = Vector2.new(1, 0.5)
	panneau.Visible = false
	Ui.coins(panneau, 22)
	Ui.contour(panneau, Couleurs.ROSE_PALE, 3)
	Ui.marges(panneau, 16)

	titre = Ui.texte(panneau, "Titre", "Résultats", 26, Couleurs.ROSE)
	titre.Size = UDim2.new(1, 0, 0, 34)
	liste = Ui.cadre(panneau, "Liste", UDim2.new(1, 0, 1, -74), UDim2.fromOffset(0, 40), Couleurs.FOND, 1)
	Ui.liste(liste, Enum.FillDirection.Vertical, 4)
	pied = Ui.texte(panneau, "Pied", "", 15, Couleurs.TEXTE_DOUX, Ui.POLICE_TEXTE)
	pied.AnchorPoint = Vector2.new(0, 1)
	pied.Position = UDim2.fromScale(0, 1)

	Etat.ecouter("resultats", function()
		if Etat.phase == "resultats" then
			remplir()
		end
	end)
	Etat.ecouter("phase", function(phase: string)
		panneau.Visible = phase == "resultats"
		if phase == "resultats" then
			remplir()
		end
	end)
end

function Resultats.mettreAJour()
	if panneau and panneau.Visible then
		local reste = math.max(0, math.ceil(Etat.finPhase - Etat.maintenant()))
		pied.Text = `Prochaine course dans {reste} s`
	end
end

return Resultats
