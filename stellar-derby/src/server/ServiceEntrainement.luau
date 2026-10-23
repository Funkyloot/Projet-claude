--!strict
-- ServiceEntrainement — Les cinq ateliers d'entraînement (un par stat) : jetons de mini-jeu, validation des scores, récompenses ; en carrière, gain de stats.
--
-- (À compléter : voir docs/ARCHITECTURE.md.)
--
-- Contrat avec ServiceCarriere : la carrière branche une fonction appelée
-- quand un mini-jeu joué en mode "carriere" est validé. Elle reçoit la stat
-- travaillée et la qualité (0 à 1) ; ce qu'elle renvoie est ajouté à la
-- réponse de la requête « entrainement.terminer » (gains de stats…). Si elle
-- renvoie nil, l'entraînement en carrière est refusé (pas de carrière, pas
-- un tour d'entraînement…).

local ServiceEntrainement = {}

type SurCarriere = (joueur: Player, stat: string, qualite: number) -> { [string]: any }?

local surCarriere: SurCarriere? = nil

function ServiceEntrainement.definirCarriere(fonction: SurCarriere)
	surCarriere = fonction
end

-- La fonction branchée par la carrière (nil s'il n'y en a pas).
function ServiceEntrainement.carriere(): SurCarriere?
	return surCarriere
end

function ServiceEntrainement.demarrer() end

return ServiceEntrainement
