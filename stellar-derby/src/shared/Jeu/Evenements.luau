--!strict
-- Evenements — les cartes qui surgissent pendant une carrière.
--
-- Pur. Une carte pose une petite scène de la vie à l'Académie (sport,
-- amitié, rivalité) et propose deux choix aux effets clairs : des stats, de
-- l'énergie, de l'humeur, ou une compétence générale apprise. Les textes
-- peuvent citer la coureuse ({nom}) et sa rivale ({rivale}).
--
-- `quand` dit après quelle action la carte peut tomber : "sortie",
-- "entrainement" ou "tous".

export type Effets = {
	stats: { [string]: number }?, -- { vitesse = 15 }
	tous: number?, -- ajouté à chacune des cinq stats
	energie: number?,
	humeur: number?, -- en niveaux (+1 = un cran mieux)
	competence: string?, -- compétence générale apprise
}

export type Choix = { texte: string, effets: Effets }

export type Carte = {
	id: string,
	titre: string,
	texte: string,
	quand: string,
	choix: { Choix },
}

local Evenements = {}

Evenements.NOMS_STATS = {
	vitesse = "Vitesse",
	souffle = "Souffle",
	puissance = "Puissance",
	coeur = "Cœur",
	instinct = "Instinct",
}

Evenements.liste = {
	{
		id = "piquenique",
		titre = "Pique-nique au bord de l'étang",
		texte = "Tes camarades t'invitent à pique-niquer près de l'étang de l'Archipel. Le soleil est doux, les cerisiers sont en fleur.",
		quand = "sortie",
		choix = {
			{ texte = "Profiter du soleil", effets = { humeur = 1, energie = 15 } },
			{ texte = "Parler stratégie entre deux sandwichs", effets = { stats = { instinct = 15 }, energie = 5 } },
		},
	},
	{
		id = "averse",
		titre = "Averse soudaine",
		texte = "La pluie s'abat sur la piste en plein entraînement. Les autres courent se mettre à l'abri…",
		quand = "entrainement",
		choix = {
			{ texte = "Continuer sous la pluie", effets = { stats = { coeur = 20 }, energie = -10 } },
			{ texte = "S'abriter et étudier les courses", effets = { stats = { instinct = 12 } } },
		},
	},
	{
		id = "ancienne",
		titre = "Les conseils d'une ancienne",
		texte = "Une ancienne championne de l'Académie s'arrête au bord de la piste pour te regarder courir.",
		quand = "tous",
		choix = {
			{ texte = "Lui demander son secret dans les virages", effets = { competence = "virageParfait" } },
			{
				texte = "La défier sur deux cents mètres",
				effets = { stats = { vitesse = 15, puissance = 10 }, energie = -10 },
			},
		},
	},
	{
		id = "sable",
		titre = "Le sable de la Baie",
		texte = "« Le sable, ça forge les jambes ! » répète l'entraîneuse en te montrant la plage de la Baie.",
		quand = "tous",
		choix = {
			{ texte = "Sprints dans le sable", effets = { stats = { puissance = 20 }, energie = -15 } },
			{ texte = "Balade les pieds dans l'eau", effets = { energie = 20, humeur = 1 } },
		},
	},
	{
		id = "phare",
		titre = "Le gardien du phare",
		texte = "Le gardien du phare raconte les grandes courses de nuit d'autrefois, quand la piste n'était éclairée que par sa lanterne.",
		quand = "sortie",
		choix = {
			{ texte = "Écouter jusqu'au bout", effets = { stats = { instinct = 10, coeur = 10 } } },
			{
				texte = "Monter les trois cents marches en courant",
				effets = { stats = { souffle = 20 }, energie = -15 },
			},
		},
	},
	{
		id = "defi",
		titre = "Un regard de défi",
		texte = "{rivale} te croise dans le couloir et s'arrête : « On verra bien qui sera la plus rapide à la finale. »",
		quand = "tous",
		choix = {
			{ texte = "Relever le défi", effets = { stats = { vitesse = 10, coeur = 10 }, humeur = 1 } },
			{ texte = "Rester concentrée sur toi", effets = { stats = { souffle = 15 } } },
		},
	},
	{
		id = "cuisine",
		titre = "Atelier de cuisine sportive",
		texte = "La cantine de l'Académie propose un atelier : un repas de championne, ça se prépare !",
		quand = "sortie",
		choix = {
			{ texte = "Préparer un plat énergétique", effets = { energie = 25 } },
			{ texte = "Goûter à tout", effets = { humeur = 1, energie = 10 } },
		},
	},
	{
		id = "dessin",
		titre = "Tes premières fans",
		texte = "Des enfants t'attendent à la sortie de la piste avec un dessin de toi en train de franchir la ligne.",
		quand = "tous",
		choix = {
			{ texte = "Signer des autographes", effets = { humeur = 2 } },
			{ texte = "Leur montrer un départ canon", effets = { competence = "departCanon", energie = -10 } },
		},
	},
	{
		id = "etoiles",
		titre = "Nuit d'étoiles filantes",
		texte = "Impossible de dormir : le ciel au-dessus de l'Académie est rempli d'étoiles filantes.",
		quand = "sortie",
		choix = {
			{ texte = "Faire un vœu pour la finale", effets = { humeur = 1, stats = { coeur = 10 } } },
			{ texte = "Dormir quand même", effets = { energie = 20 } },
		},
	},
	{
		id = "ventfalaises",
		titre = "Le vent des Falaises",
		texte = "Un vent violent souffle sur les Falaises. Parfait pour travailler le souffle… ou pour apprendre à s'abriter.",
		quand = "entrainement",
		choix = {
			{ texte = "Courir face au vent", effets = { stats = { souffle = 20, puissance = 5 }, energie = -15 } },
			{ texte = "Courir abritée derrière une camarade", effets = { competence = "sillage" } },
		},
	},
	{
		id = "examen",
		titre = "Examen surprise",
		texte = "Le professeur annonce un examen surprise sur la lecture de course : placement, sillage, dernier virage.",
		quand = "entrainement",
		choix = {
			{ texte = "Réviser toute la nuit", effets = { stats = { instinct = 20 }, energie = -15 } },
			{ texte = "Faire confiance à ton instinct", effets = { stats = { instinct = 8 }, humeur = 1 } },
		},
	},
	{
		id = "kine",
		titre = "Une place chez le kiné",
		texte = "Le kiné de l'Académie a une place libre cet après-midi. Une camarade qui boite la voudrait aussi.",
		quand = "tous",
		choix = {
			{ texte = "Prendre la séance", effets = { energie = 30 } },
			{ texte = "La laisser à ta camarade", effets = { humeur = 1, stats = { coeur = 12 } } },
		},
	},
	{
		id = "duel",
		titre = "Duel amical",
		texte = "Une camarade te propose un duel sur la ligne droite, juste pour le plaisir.",
		quand = "entrainement",
		choix = {
			{ texte = "Tout donner", effets = { stats = { vitesse = 15, puissance = 10 }, energie = -15 } },
			{
				texte = "Ne rien lâcher, épaule contre épaule",
				effets = { competence = "regardAcier", energie = -5 },
			},
		},
	},
	{
		id = "journal",
		titre = "La une du journal",
		texte = "Le journal de l'Académie veut ta photo pour sa une : « {nom}, l'espoir de la saison ».",
		quand = "sortie",
		choix = {
			{ texte = "Un sourire de championne", effets = { humeur = 2 } },
			{ texte = "Demander une photo d'équipe", effets = { humeur = 1, energie = 10, stats = { coeur = 5 } } },
		},
	},
	{
		id = "orage",
		titre = "Soir d'orage",
		texte = "L'orage gronde sur l'archipel : l'entraînement du soir est annulé.",
		quand = "tous",
		choix = {
			{ texte = "Regarder des vidéos de courses", effets = { stats = { instinct = 15 } } },
			{ texte = "Se coucher tôt", effets = { energie = 25 } },
		},
	},
	{
		id = "maree",
		titre = "Footing à marée basse",
		texte = "Tout le groupe part courir le long de la côte, sur le sable laissé par la marée.",
		quand = "entrainement",
		choix = {
			{ texte = "Rester en tête du groupe", effets = { stats = { souffle = 15, coeur = 5 }, energie = -10 } },
			{ texte = "Encourager les dernières", effets = { stats = { coeur = 15 }, humeur = 1 } },
		},
	},
	{
		id = "lanternes",
		titre = "La fête des lanternes",
		texte = "La Baie fête les lanternes ce soir : des centaines de lumières flottent sur l'eau.",
		quand = "sortie",
		choix = {
			{ texte = "Danser jusqu'au bout de la nuit", effets = { humeur = 2, energie = -10 } },
			{ texte = "Admirer le spectacle et rentrer tôt", effets = { humeur = 1, energie = 10 } },
		},
	},
	{
		id = "carnet",
		titre = "Le vieux carnet",
		texte = "À la bibliothèque, tu trouves le carnet d'entraînement d'une Légende de l'Académie, couvert de notes.",
		quand = "tous",
		choix = {
			{ texte = "Suivre son programme", effets = { tous = 6, energie = -10 } },
			{ texte = "Recopier ses notes de course", effets = { competence = "teteFroide" } },
		},
	},
	{
		id = "fauxpas",
		titre = "Un faux pas",
		texte = "Ton pied glisse à la sortie d'un virage. Plus de peur que de mal, mais ton cœur bat vite.",
		quand = "entrainement",
		choix = {
			{ texte = "Repartir aussitôt", effets = { stats = { coeur = 15 }, energie = -15 } },
			{ texte = "Souffler un peu, par prudence", effets = { energie = 15, humeur = -1 } },
		},
	},
	{
		id = "rythme",
		titre = "Un nouveau rythme",
		texte = "Au bout d'un long footing, tes jambes trouvent soudain un rythme nouveau, léger et régulier.",
		quand = "entrainement",
		choix = {
			{ texte = "Garder ce rythme en tête", effets = { competence = "secondSouffle" } },
			{ texte = "Pousser encore un peu", effets = { stats = { souffle = 15 }, energie = -10 } },
		},
	},
	{
		id = "lettre",
		titre = "Une lettre de la maison",
		texte = "Ta famille t'a écrit : tout le village suivra ta prochaine course à la radio.",
		quand = "tous",
		choix = {
			{ texte = "La relire avant de dormir", effets = { humeur = 1, stats = { coeur = 8 } } },
			{ texte = "Répondre par un dessin de la piste", effets = { humeur = 1, energie = 10 } },
		},
	},
} :: { Carte }

local index: { [string]: Carte } = {}
for _, carte in Evenements.liste do
	index[carte.id] = carte
end

function Evenements.parId(id: unknown): Carte?
	return if type(id) == "string" then index[id] else nil
end

-- Les cartes qui peuvent tomber après `action` ("sortie", "entrainement", "repos").
function Evenements.possibles(action: string): { Carte }
	local liste: { Carte } = {}
	for _, carte in Evenements.liste do
		if carte.quand == "tous" or carte.quand == action then
			table.insert(liste, carte)
		end
	end
	return liste
end

-- Le texte d'une carte, avec les noms à leur place.
function Evenements.texte(carte: Carte, nom: string, rivale: string): string
	local texte = string.gsub(carte.texte, "{nom}", nom)
	texte = string.gsub(texte, "{rivale}", rivale)
	return texte
end

local function signe(n: number): string
	return if n >= 0 then `+{n}` else `−{-n}`
end

-- « Vitesse +15 · Énergie −10 » : ce que fait un choix, en clair.
function Evenements.resume(effets: Effets, nomsCompetences: { [string]: string }?): string
	local morceaux: { string } = {}
	if effets.tous then
		table.insert(morceaux, `Toutes les stats {signe(effets.tous)}`)
	end
	local stats = effets.stats
	if stats then
		for _, id in { "vitesse", "souffle", "puissance", "coeur", "instinct" } do
			local v = stats[id]
			if v then
				table.insert(morceaux, `{Evenements.NOMS_STATS[id]} {signe(v)}`)
			end
		end
	end
	if effets.energie then
		table.insert(morceaux, `Énergie {signe(effets.energie)}`)
	end
	if effets.humeur then
		table.insert(morceaux, `Humeur {signe(effets.humeur)}`)
	end
	if effets.competence then
		local nom = nomsCompetences and nomsCompetences[effets.competence] or effets.competence
		table.insert(morceaux, `Compétence : {nom}`)
	end
	return table.concat(morceaux, " · ")
end

return Evenements
