--!strict
-- Commentaire — transforme les événements de course en phrases de
-- commentateur. Le client choisit quoi afficher selon la priorité.

local Competences = require(script.Parent:WaitForChild("Competences"))

export type Ligne = { texte: string, priorite: number }

export type Contexte = {
	nom: (id: number?) -> string,
	course: string,
	tete: string?, -- nom de la coureuse en tête, si connu
}

local PHRASES: { [string]: { string } } = {
	depart = {
		"Et c'est parti pour le {course} !",
		"Les stalles s'ouvrent : {course}, c'est parti !",
	},
	parfait = { "{nom} jaillit des stalles !", "Départ parfait pour {nom} !" },
	faux = { "{nom} rate son départ !", "Petit cafouillage au départ pour {nom}." },
	tete = {
		"{nom} prend la tête !",
		"Changement en tête : {nom} passe devant !",
		"{nom} s'empare du commandement !",
	},
	milieu = { "Milieu de course : {tete} mène le train.", "On passe la mi-course, {tete} toujours devant." },
	finale = { "On entre dans la finale ! Qui va lancer son sprint ?", "La finale commence, ça va s'animer !" },
	dernierVirage = { "Dernier virage ! Le peloton se resserre.", "Elles abordent le dernier virage !" },
	ligneDroite = { "Dernière ligne droite !", "Les voilà dans la ligne droite !" },
	sprint = { "{nom} lance son sprint !", "{nom} accélère !" },
	sprintAuto = { "{nom} se décide enfin à sprinter !" },
	epuisee = { "{nom} est à bout de souffle !", "{nom} commence à piocher…" },
	duel = { "Duel entre {nom} et {autre} !", "{nom} et {autre} au coude-à-coude !" },
	competence = { "{nom} : « {competence} » !" },
	photoFinish = { "Photo-finish !!", "Impossible de les départager à l'œil nu !" },
	victoire = { "{nom} remporte le {course} !", "Victoire de {nom} !" },
}

local Commentaire = {}

local function remplir(modele: string, valeurs: { [string]: string }): string
	return (string.gsub(modele, "{(%w+)}", function(cle: string): string
		return valeurs[cle] or ""
	end))
end

-- `choix` sert à varier les formulations (le client passe un nombre au
-- hasard ; les tests un nombre fixe).
function Commentaire.ligne(evenement: { [string]: any }, contexte: Contexte, choix: number): Ligne?
	local genre = evenement.genre
	local cle: string? = nil
	local priorite = 1

	if genre == "depart" then
		cle, priorite = "depart", 2
	elseif genre == "reaction" then
		cle = if evenement.resultat == "parfait" then "parfait" else "faux"
	elseif genre == "tete" then
		cle, priorite = "tete", 2
	elseif genre == "phase" then
		if evenement.phase == 2 then
			cle = "milieu"
		elseif evenement.phase == 3 then
			cle, priorite = "finale", 2
		end
	elseif genre == "dernierVirage" then
		cle, priorite = "dernierVirage", 2
	elseif genre == "ligneDroite" then
		cle, priorite = "ligneDroite", 3
	elseif genre == "sprint" then
		cle = if evenement.auto then "sprintAuto" else "sprint"
	elseif genre == "epuisee" then
		cle, priorite = "epuisee", 2
	elseif genre == "duel" then
		cle, priorite = "duel", 2
	elseif genre == "competence" then
		cle = "competence"
	elseif genre == "photoFinish" then
		cle, priorite = "photoFinish", 4
	elseif genre == "arrivee" and evenement.rang == 1 then
		cle, priorite = "victoire", 4
	end
	if not cle then
		return nil
	end

	local phrases = PHRASES[cle]
	local modele = phrases[(math.floor(choix) % #phrases) + 1]
	local competence = evenement.competence and Competences.parId[evenement.competence]
	return {
		texte = remplir(modele, {
			nom = contexte.nom(evenement.id),
			autre = contexte.nom(evenement.autre),
			course = contexte.course,
			tete = contexte.tete or "la tête de course",
			competence = if competence then competence.nom else "",
		}),
		priorite = priorite,
	}
end

return Commentaire
