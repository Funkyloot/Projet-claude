--!strict
-- Tutoriel — les étapes du tutoriel : une première course guidée, puis la
-- visite de l'Académie.
--
-- Pur. Chaque étape a un texte court (le geste au doigt ET au clavier), un
-- moment où elle s'affiche, et ce qui la valide. Le client les déroule ; le
-- serveur enregistre la progression et donne la récompense, une seule fois.

local Tutoriel = {}

-- Quand une étape s'affiche :
--   { genre = "phase", valeur = <phase> }          une phase de la course
--   { genre = "fraction", valeur = <0..1> }        une part de la course parcourue
--   { genre = "evenement", valeur = <genre> }      un événement de ma coureuse
--   { genre = "academie", bouton = <id> }          la visite du menu de l'Académie
-- Ce qui la valide : "temps" (elle s'efface seule), "suivant" (un appui
-- sur « Suivant »), ou la suivante qui arrive.
export type Moment = { genre: string, valeur: (string | number)?, bouton: string? }
export type Etape = {
	id: string,
	texte: string,
	moment: Moment,
	validation: string,
}

Tutoriel.ETAPES = {
	-- La course guidée
	{
		id = "presentation",
		texte = "Voici les partantes. Toi, c'est le nom en rose !",
		moment = { genre = "phase", valeur = "presentation" },
		validation = "temps",
	},
	{
		id = "depart",
		texte = "Appuie sur le gros bouton (ou Espace) pile au « PARTEZ ! » pour un départ parfait.",
		moment = { genre = "phase", valeur = "stalles" },
		validation = "temps",
	},
	{
		id = "couloirs",
		texte = "Les flèches ◀ ▶ (ou A et D) changent de couloir : glisse-toi derrière une concurrente pour économiser ton souffle.",
		moment = { genre = "fraction", valeur = 0.04 },
		validation = "temps",
	},
	{
		id = "rythme",
		texte = "Économie, Normal ou Pousser (↑ et ↓) : garde du souffle pour la fin de course.",
		moment = { genre = "fraction", valeur = 0.25 },
		validation = "temps",
	},
	{
		id = "competence",
		texte = "Ta compétence est prête : touche le bouton doré (ou E) avant qu'elle ne s'éteigne !",
		moment = { genre = "evenement", valeur = "competencePrete" },
		validation = "temps",
	},
	{
		id = "sprint",
		texte = "La finale ! Quand le bouton affiche « SPRINT ! », appuie (ou Espace) : ton souffle tiendra jusqu'à la ligne.",
		moment = { genre = "fraction", valeur = 2 / 3 },
		validation = "temps",
	},
	{
		id = "arrivee",
		texte = "", -- selon la place (Tutoriel.bravo)
		moment = { genre = "phase", valeur = "resultats" },
		validation = "temps",
	},
	-- La visite de l'Académie
	{
		id = "courir",
		texte = "Courir : les courses libres, contre tout le monde, égales pour toutes.",
		moment = { genre = "academie", bouton = "courir" },
		validation = "suivant",
	},
	{
		id = "carriere",
		texte = "Carrière : forme ta coureuse pendant trois années et fais-en une Légende.",
		moment = { genre = "academie", bouton = "carriere" },
		validation = "suivant",
	},
	{
		id = "entrainement",
		texte = "Entraînement : cinq mini-jeux, un par stat, pour gagner des étoiles.",
		moment = { genre = "academie", bouton = "entrainement" },
		validation = "suivant",
	},
	{
		id = "boutique",
		texte = "Boutique : robes, tenues, bâtons lumineux… seulement des cosmétiques, jamais de stats !",
		moment = { genre = "academie", bouton = "boutique" },
		validation = "suivant",
	},
	{
		id = "classements",
		texte = "Classements : les victoires, la saison du mois et les plus belles Légendes.",
		moment = { genre = "academie", bouton = "classements" },
		validation = "suivant",
	},
	{
		id = "fin",
		texte = "C'est tout ! Tu peux aussi marcher jusqu'aux portails et aux ateliers. Bonne course à l'Académie des Vents !",
		moment = { genre = "academie" },
		validation = "suivant",
	},
} :: { Etape }

Tutoriel.RECOMPENSE = { etoiles = 200, xp = 100 }
Tutoriel.DUREE_BULLE = 6 -- s pour une étape « temps »

local indices: { [string]: number } = {}
for i, e in Tutoriel.ETAPES do
	indices[e.id] = i
end

function Tutoriel.indice(id: string): number?
	return indices[id]
end

-- La première étape de la visite de l'Académie.
function Tutoriel.debutAcademie(): number
	for i, e in Tutoriel.ETAPES do
		if e.moment.genre == "academie" then
			return i
		end
	end
	return #Tutoriel.ETAPES
end

-- L'étape après `i`, ou nil quand c'est fini.
function Tutoriel.suivante(i: number): number?
	return if i < #Tutoriel.ETAPES then i + 1 else nil
end

export type Contexte = {
	phase: string,
	fraction: number, -- part de la course parcourue par ma coureuse
	evenements: { [string]: boolean }, -- genres d'événements de ma coureuse vus depuis l'étape précédente
}

-- L'étape `etape` doit-elle s'afficher, dans ce contexte de course ?
function Tutoriel.declenchee(etape: Etape, c: Contexte): boolean
	local m = etape.moment
	if m.genre == "phase" then
		return c.phase == m.valeur
	elseif m.genre == "fraction" then
		return c.phase == "course" and type(m.valeur) == "number" and c.fraction >= m.valeur
	elseif m.genre == "evenement" then
		return c.phase == "course" and type(m.valeur) == "string" and c.evenements[m.valeur] == true
	end
	return false
end

-- Le mot de l'arrivée, selon la place.
function Tutoriel.bravo(rang: number, partantes: number): string
	if rang == 1 then
		return "VICTOIRE ! Une vraie championne, dès ta première course !"
	elseif rang <= 3 then
		return `Sur le podium ({rang}e) ! Tu as tout compris.`
	elseif rang <= math.ceil(partantes / 2) then
		return `{rang}e : bien joué ! Le sprint au bon moment fera la différence.`
	end
	return `{rang}e : pas facile, la première fois ! Garde du souffle et vise le « SPRINT ! ».`
end

-- Enregistre la progression (on n'avance jamais à reculons).
function Tutoriel.enregistrer(d: any, etape: unknown)
	if type(etape) ~= "number" or etape ~= etape then
		return
	end
	local e = math.clamp(math.floor(etape), 0, #Tutoriel.ETAPES)
	d.tutoriel.etape = math.max(d.tutoriel.etape, e)
end

-- Termine le tutoriel. Renvoie la récompense la première fois, nil ensuite.
function Tutoriel.finir(d: any): { etoiles: number, xp: number }?
	if d.tutoriel.fini then
		return nil
	end
	d.tutoriel.fini = true
	d.tutoriel.etape = #Tutoriel.ETAPES
	return { etoiles = Tutoriel.RECOMPENSE.etoiles, xp = Tutoriel.RECOMPENSE.xp }
end

return Tutoriel
