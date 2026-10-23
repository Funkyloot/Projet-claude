--!strict
-- EcranEntrainement — Les ateliers d'entraînement et leurs cinq mini-jeux.
--
-- (À compléter : voir docs/ARCHITECTURE.md.)
--
-- Contrat avec EcranCarriere : EcranEntrainement.jouer(stat, mode) lance le
-- mini-jeu de la stat (mode "libre" ou "carriere"), attend qu'il se termine
-- et renvoie la réponse du serveur à « entrainement.terminer » (avec la
-- qualité et, en carrière, les gains), ou nil si le joueur abandonne.

local EcranEntrainement = {}

function EcranEntrainement.jouer(_stat: string, _mode: string): { [string]: any }?
	return nil
end

function EcranEntrainement.creer(_gui: ScreenGui) end

function EcranEntrainement.mettreAJour() end

return EcranEntrainement
