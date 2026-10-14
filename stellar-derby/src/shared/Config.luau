--!strict
-- Config — les réglages du jeu qui ne relèvent pas de l'équilibrage.
--
-- Les chiffres qui décident qui gagne une course (vitesses, endurance,
-- stratégies) vivent dans Course/Formules et Course/Strategies : ils sont
-- réglés par les tests d'équilibrage, pas à la main ici.

local Config = {
	-- La simulation compte en mètres, Roblox en studs. 1,5 donne des
	-- coureuses qui filent à ~30 studs/s : assez vite pour sentir la course,
	-- pas au point que l'animation de course patine.
	METRES_EN_STUDS = 1.5,

	-- Cadences
	FREQUENCE_SIMULATION = 30, -- pas fixes par seconde, côté serveur
	FREQUENCE_INSTANTANES = 15, -- envois de positions aux clients par seconde
	RETARD_INTERPOLATION = 0.15, -- s : le client affiche un passé proche pour lisser

	-- Peloton
	TAILLE_PELOTON = 12,
	TAILLE_PELOTON_MAX = 16,

	-- Hippodrome (mètres). Ces dimensions placent les stalles de départ des
	-- distances du catalogue sur des lignes droites (voir Course/Courses).
	LIGNE_DROITE = 300,
	RAYON_VIRAGE = 95,
	LARGEUR_PISTE = 14,
	POSITION_ARRIVEE = 0.8, -- fraction de la ligne droite des tribunes

	-- Déroulé d'une partie (secondes)
	DUREE_LOBBY = 20,
	DUREE_LOBBY_SEUL = 10, -- quand un joueur est seul, inutile de le faire attendre
	DUREE_PRESENTATION = 6,
	DUREE_STALLES = 3,
	DUREE_RESULTATS = 14,

	-- Photo-finish : la course entière passe au ralenti pour tout le monde
	RALENTI_PHOTO_FINISH = 0.3,

	-- Anti-abus : nombre de commandes acceptées par joueur et par seconde
	COMMANDES_PAR_SECONDE = 20,

	-- Animations R15 par défaut de Roblox (utilisables dans n'importe quel jeu)
	ANIMATIONS = {
		course = "rbxassetid://913376220",
		attente = "rbxassetid://507766666",
		victoire = "rbxassetid://507770677",
		salut = "rbxassetid://507770239",
	},
	-- Vitesse (studs/s) à laquelle l'animation de course a l'air naturelle
	VITESSE_REFERENCE_ANIMATION = 18,
}

return Config
