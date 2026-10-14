--!strict
-- Controles — ce que la joueuse peut demander à sa coureuse.
--
-- Mêmes actions au clavier, à la manette et au doigt : les boutons du HUD
-- appellent ces fonctions. Pendant la course, les touches de déplacement du
-- personnage sont capturées pour qu'il ne se promène pas dans la tribune.
--
--   ← / →  ou A / D       changer de couloir
--   ↑ / ↓  ou W / S       rythme : pousser / économiser
--   Espace                départ (pile au signal), puis sprint en finale
--   E                     déclencher la compétence prête
--   C                     caméra poursuite ↔ vue TV

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Monde = require(Partage:WaitForChild("Monde"))
local Reseau = require(Partage:WaitForChild("Reseau"))
local Formules = require(Partage:WaitForChild("Course"):WaitForChild("Formules"))

local Camera = require(script.Parent:WaitForChild("Camera"))
local Etat = require(script.Parent:WaitForChild("Etat"))
local Rendu = require(script.Parent:WaitForChild("Rendu"))

local PRIORITE = Enum.ContextActionPriority.High.Value + 50

local Controles = {
	rythme = Formules.RYTHME_NORMAL,
	actifs = false,
}

local canal = Reseau.commande()

local function envoyer(genre: string, valeur: any?)
	canal:FireServer(genre, valeur)
end

function Controles.definirRythme(rythme: number)
	Controles.rythme = math.clamp(rythme, 1, #Formules.RYTHMES)
	envoyer("rythme", Controles.rythme)
end

function Controles.changerRythme(delta: number)
	Controles.definirRythme(Controles.rythme + delta)
end

-- `sensEcran` : +1 vers la droite de l'écran, -1 vers la gauche. Le serveur
-- parle en couloirs (vers l'extérieur ou vers la corde) : on traduit selon
-- l'orientation réelle de la coureuse, qui dépend du sens de la piste.
function Controles.couloir(sensEcran: number)
	local e = Rendu.affiche[Etat.monId]
	if not e then
		return
	end
	local droiteVersExterieur = e.cadre.RightVector:Dot(Monde.exterieur(e.s)) > 0
	envoyer("couloir", if droiteVersExterieur then sensEcran else -sensEcran)
end

-- Le gros bouton : départ au signal, sprint en finale.
function Controles.action()
	local t = Etat.maintenant() - Etat.heureDepart
	if t > -1 and t < 1.2 then
		envoyer("depart", t)
		if t < 0.6 then
			return
		end
	end
	envoyer("sprint")
end

function Controles.competence()
	envoyer("competence")
end

local LIAISONS: { { nom: string, fonction: () -> (), touches: { Enum.KeyCode } } } = {
	{
		nom = "StellarCouloirGauche",
		fonction = function()
			Controles.couloir(-1)
		end,
		touches = { Enum.KeyCode.Left, Enum.KeyCode.A, Enum.KeyCode.Q, Enum.KeyCode.DPadLeft },
	},
	{
		nom = "StellarCouloirDroite",
		fonction = function()
			Controles.couloir(1)
		end,
		touches = { Enum.KeyCode.Right, Enum.KeyCode.D, Enum.KeyCode.DPadRight },
	},
	{
		nom = "StellarPousser",
		fonction = function()
			Controles.changerRythme(1)
		end,
		touches = { Enum.KeyCode.Up, Enum.KeyCode.W, Enum.KeyCode.Z, Enum.KeyCode.DPadUp },
	},
	{
		nom = "StellarEconomiser",
		fonction = function()
			Controles.changerRythme(-1)
		end,
		touches = { Enum.KeyCode.Down, Enum.KeyCode.S, Enum.KeyCode.DPadDown },
	},
	{
		nom = "StellarAction",
		fonction = Controles.action,
		touches = { Enum.KeyCode.Space, Enum.KeyCode.ButtonA },
	},
	{
		nom = "StellarCompetence",
		fonction = Controles.competence,
		touches = { Enum.KeyCode.E, Enum.KeyCode.ButtonX },
	},
	{
		nom = "StellarCamera",
		fonction = Camera.basculer,
		touches = { Enum.KeyCode.C, Enum.KeyCode.ButtonY },
	},
}

local function personnageLibre(libre: boolean)
	local scripts = Players.LocalPlayer:FindFirstChild("PlayerScripts")
	local module = scripts and scripts:FindFirstChild("PlayerModule")
	if not module then
		return
	end
	local ok, joueur = pcall(require, module :: ModuleScript)
	if ok and joueur and joueur.GetControls then
		local controles = joueur:GetControls()
		if libre then
			controles:Enable()
		else
			controles:Disable()
		end
	end
end

function Controles.activer(actifs: boolean)
	if actifs == Controles.actifs then
		return
	end
	Controles.actifs = actifs
	for _, liaison in LIAISONS do
		if actifs then
			ContextActionService:BindActionAtPriority(liaison.nom, function(_nom, etat, _entree)
				if etat == Enum.UserInputState.Begin then
					liaison.fonction()
				end
				return Enum.ContextActionResult.Sink
			end, false, PRIORITE, table.unpack(liaison.touches))
		else
			ContextActionService:UnbindAction(liaison.nom)
		end
	end
end

local function reevaluer()
	local phase = Etat.phase
	Controles.activer((phase == "stalles" or phase == "course") and Etat.monId ~= 0)
	-- Pendant la présentation et les résultats, le personnage ne bouge pas non plus
	personnageLibre(phase == "lobby")
end

function Controles.demarrer()
	Etat.ecouter("phase", function(phase: string)
		if phase == "presentation" then
			Controles.rythme = Formules.RYTHME_NORMAL
		end
		reevaluer()
	end)
	-- L'identifiant de coureuse et la phase arrivent par deux chemins de
	-- réplication différents, sans ordre garanti.
	Etat.ecouter("monId", reevaluer)
end

return Controles
