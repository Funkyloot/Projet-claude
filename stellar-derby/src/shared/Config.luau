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
	TAILLE_PELOTON_LIVE = 30, -- mode Live : les invités du chat remplissent les stalles

	-- Géométrie de l'hippodrome de l'Archipel (mètres), la piste de
	-- référence des tests. Les trois hippodromes sont décrits dans
	-- Course/Pistes.
	LIGNE_DROITE = 300,
	RAYON_VIRAGE = 95,
	LARGEUR_PISTE = 14,
	POSITION_ARRIVEE = 0.8, -- fraction de la ligne droite des tribunes

	-- La mer autour des îles (terrain d'eau). La couper allège les vieux
	-- téléphones.
	MER = true,

	-- Déroulé d'une partie (secondes)
	DUREE_LOBBY = 20,
	DUREE_LOBBY_SEUL = 10, -- quand un joueur est seul, inutile de le faire attendre
	DUREE_PRESENTATION = 6,
	DUREE_STALLES = 3,
	DUREE_RESULTATS = 14,

	DUREE_ATTENTE_SEUL = 3, -- carrière, tutoriel : pas de lobby, un court temps de mise en place

	-- Photo-finish : la course entière passe au ralenti pour tout le monde
	RALENTI_PHOTO_FINISH = 0.3,

	-- Sauvegarde
	SAUVEGARDE_AUTO = 60, -- s entre deux sauvegardes automatiques
	VERROU_PERIME = 30 * 60, -- s : au-delà, le verrou d'un serveur disparu est repris
	REQUETES_PAR_SECONDE = 8, -- requêtes (boutique, carrière…) acceptées par joueur et par seconde

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

	-- Sons : bibliothèque sous licence de Roblox (APM, ProSoundEffects),
	-- utilisable gratuitement par tous les jeux. Pour en changer, chercher
	-- dans la Toolbox de Studio, onglet Audio, et copier l'identifiant.
	-- Une chaîne vide coupe le son correspondant.
	SONS = {
		-- Musiques (une seule à la fois, en fondu)
		musiqueCourse = "rbxassetid://1845636153", -- « Here Comes The Winner 2 » (APM)
		musiqueAcademie = "rbxassetid://1839580585", -- « Peaceful Day Ukulele » (APM)
		fanfare = "rbxassetid://1836490503", -- « Victory Fanfare » (APM)
		-- Ambiances des hippodromes, très bas pendant les courses
		ambianceArchipel = "rbxassetid://9113444532", -- « Birds Peaceful 2 » (ProSoundEffects)
		ambianceBaie = "rbxassetid://9126201834", -- « Waves Long Rolling In Constantly Heavy Surf » (ProSoundEffects)
		ambianceFalaises = "rbxassetid://9114057128", -- « Desert Wind Whistley Light Gusts 2 » (ProSoundEffects)
		-- Sons de course
		foule = "rbxassetid://9112766176", -- « Crowd Cheer And Applause 1 » (ProSoundEffects)
		partez = "rbxassetid://9118114334", -- « Referee Whistle Interior Gymnasium 1 » (ProSoundEffects)
		sprint = "rbxassetid://9125805579", -- « Rising Whoosh Hissing Build Up Ascending » (ProSoundEffects)
		-- Interface
		clic = "rbxassetid://15675032796", -- « Roblox_UI_Small_Click » (Roblox)
		gain = "rbxassetid://127645268874265", -- « CoinTransfer_01 » (Roblox)
		niveau = "rbxassetid://1846266827", -- « Short Fanfare » (APM)
		titre = "rbxassetid://9126073001", -- « Synth Sparkle Tone High Pitch Bell Tone Ding » (ProSoundEffects)
	},
	VOLUME_MUSIQUE = 0.35,
}

return Config
