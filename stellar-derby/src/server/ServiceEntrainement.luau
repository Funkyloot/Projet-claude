--!strict
-- ServiceEntrainement — les cinq ateliers d'entraînement (un par stat) :
-- jetons de mini-jeu, validation des notes, récompenses ; en carrière, gain
-- de stats.
--
-- Le mini-jeu se joue sur le client (il doit réagir à l'image près), mais
-- c'est le serveur qui décide de ce qu'il vaut :
--   1. « entrainement.commencer » donne un jeton à usage unique et la graine
--      de la partie ;
--   2. « entrainement.terminer » rend le jeton avec la note. Le serveur
--      vérifie que le temps écoulé est plausible pour cette graine, borne la
--      note, puis récompense.
-- Hors carrière, les étoiles baissent après les dix premiers mini-jeux du
-- jour : on s'entraîne pour progresser, pas pour farmer.
--
-- Contrat avec ServiceCarriere : la carrière branche une fonction appelée
-- quand un mini-jeu joué en mode "carriere" est validé. Elle reçoit la stat
-- travaillée et la qualité (0 à 1) ; ce qu'elle renvoie est ajouté à la
-- réponse de la requête « entrainement.terminer » (gains de stats…). Si elle
-- renvoie nil, l'entraînement en carrière est refusé (pas de carrière, pas
-- un tour d'entraînement…).

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Partage = ReplicatedStorage:WaitForChild("Partage")
local Reseau = require(Partage:WaitForChild("Reseau"))
local Economie = require(Partage:WaitForChild("Jeu"):WaitForChild("Economie"))
local Entrainement = require(Partage:WaitForChild("Jeu"):WaitForChild("Entrainement"))

local Profils = require(script.Parent:WaitForChild("Profils"))
local Sessions = require(script.Parent:WaitForChild("Sessions"))

local ServiceEntrainement = {}

type SurCarriere = (joueur: Player, stat: string, qualite: number) -> { [string]: any }?

type Jeton = {
	id: string,
	jeu: string,
	mode: string,
	graine: number,
	debut: number, -- os.clock() à la remise du jeton
	dureeMin: number,
	dureeMax: number,
}

local surCarriere: SurCarriere? = nil
local jetons: { [Player]: Jeton } = {}
-- Entraînements hors carrière du jour, par joueur (en mémoire : un serveur
-- qui redémarre remet le compteur à zéro, ce n'est pas grave)
local duJour: { [number]: { jour: number, compte: number } } = {}
local aleatoire = Random.new()

function ServiceEntrainement.definirCarriere(fonction: SurCarriere)
	surCarriere = fonction
end

-- La fonction branchée par la carrière (nil s'il n'y en a pas).
function ServiceEntrainement.carriere(): SurCarriere?
	return surCarriere
end

local function compteDuJour(joueur: Player): { jour: number, compte: number }
	local jour = Entrainement.jour(os.time())
	local c = duJour[joueur.UserId]
	if c and c.jour == jour then
		return c
	end
	local neuf = { jour = jour, compte = 0 }
	duJour[joueur.UserId] = neuf
	return neuf
end

local function restantsPleinTarif(joueur: Player): number
	return math.max(0, Entrainement.PLEIN_TARIF_PAR_JOUR - compteDuJour(joueur).compte)
end

local function commencer(joueur: Player, args: any): Reseau.Reponse
	if type(args) ~= "table" or not Entrainement.existe(args.jeu) then
		return { ok = false, erreur = "Cet atelier n'existe pas." }
	end
	local mode = if args.mode == "carriere" then "carriere" else "libre"
	if Sessions.deJoueur(joueur) then
		return { ok = false, erreur = "Termine d'abord ta course !" }
	end
	if not Profils.pret(joueur) then
		return { ok = false, erreur = "Ta sauvegarde n'est pas encore chargée." }
	end
	if mode == "carriere" and not surCarriere then
		return { ok = false, erreur = "La carrière n'est pas disponible pour l'instant." }
	end
	local jeu = args.jeu :: string
	local graine = aleatoire:NextInteger(1, 2147483646)
	-- Un seul mini-jeu à la fois : un nouveau jeton remplace l'ancien
	local jeton: Jeton = {
		id = HttpService:GenerateGUID(false),
		jeu = jeu,
		mode = mode,
		graine = graine,
		debut = os.clock(),
		dureeMin = Entrainement.dureeMinimale(jeu, graine) * 0.95,
		dureeMax = Entrainement.dureeMaximale(jeu, graine) + Entrainement.MARGE,
	}
	jetons[joueur] = jeton
	return { ok = true, jeton = jeton.id, graine = graine, jeu = jeu, mode = mode }
end

local function terminer(joueur: Player, args: any): Reseau.Reponse
	if type(args) ~= "table" or type(args.jeton) ~= "string" then
		return { ok = false, erreur = "Partie inconnue." }
	end
	local jeton = jetons[joueur]
	if not jeton or jeton.id ~= args.jeton then
		return { ok = false, erreur = "Cette partie n'est plus valable." }
	end
	-- Usage unique, même si la suite refuse
	jetons[joueur] = nil
	local ecoule = os.clock() - jeton.debut
	if ecoule < jeton.dureeMin then
		return { ok = false, erreur = "Partie trop courte pour être comptée." }
	end
	if ecoule > jeton.dureeMax then
		return { ok = false, erreur = "Partie trop longue : elle a expiré." }
	end
	local brute = args.note
	if type(brute) ~= "number" or brute ~= brute then
		return { ok = false, erreur = "Note invalide." }
	end
	local note = math.clamp(math.floor(brute + 0.5), 0, 100)
	local qualite = note / 100

	local reponse: { [string]: any } = {
		ok = true,
		jeu = jeton.jeu,
		mode = jeton.mode,
		note = note,
		qualite = qualite,
		mot = Entrainement.mot(note),
	}

	-- En carrière, la carrière décide d'abord : si elle refuse, rien ne compte
	if jeton.mode == "carriere" then
		local fonction = surCarriere
		local resultat = fonction and fonction(joueur, jeton.jeu, qualite)
		if not resultat then
			return { ok = false, erreur = "Ce n'est pas le moment de s'entraîner dans ta carrière." }
		end
		for cle, valeur in resultat do
			if reponse[cle] == nil then
				reponse[cle] = valeur
			end
		end
	end

	local record = false
	Profils.modifier(joueur, function(d)
		d.stats.entrainements += 1
		local meilleur = d.stats.meilleursScores[jeton.jeu]
		if not meilleur or note > meilleur then
			d.stats.meilleursScores[jeton.jeu] = note
			record = meilleur ~= nil
		end
	end)
	reponse.record = record

	if jeton.mode == "libre" then
		local compte = compteDuJour(joueur)
		local tarif = Entrainement.tarif(compte.compte)
		compte.compte += 1
		local gain = Economie.recompenseEntrainement(qualite)
		local etoiles = math.floor(gain.etoiles * tarif + 0.5)
		local xp = math.floor(gain.xp * tarif + 0.5)
		Profils.crediter(joueur, etoiles, xp, Entrainement.JEUX[jeton.jeu].nom)
		reponse.etoiles = etoiles
		reponse.xp = xp
		reponse.pleinTarif = tarif >= 1
		reponse.restants = restantsPleinTarif(joueur)
	end
	return reponse
end

function ServiceEntrainement.demarrer()
	Profils.surRequete("entrainement.commencer", commencer)
	Profils.surRequete("entrainement.terminer", terminer)
	Profils.surRequete("entrainement.abandonner", function(joueur)
		jetons[joueur] = nil
		return { ok = true }
	end)
	Profils.surRequete("entrainement.etat", function(joueur)
		return {
			ok = true,
			restants = restantsPleinTarif(joueur),
			pleinTarifParJour = Entrainement.PLEIN_TARIF_PAR_JOUR,
		}
	end)
	Players.PlayerRemoving:Connect(function(joueur)
		jetons[joueur] = nil
	end)
end

return ServiceEntrainement
