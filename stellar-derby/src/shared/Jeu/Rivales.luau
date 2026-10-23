--!strict
-- Rivales — les rivales du destin.
--
-- Pur. Une coureuse qui te bat d'une encolure ou moins (classée juste devant
-- toi, à « Nez », « Tête » ou « Encolure ») devient ta rivale. Quand tu
-- finis devant elle plus tard, tu l'as battue : la première fois, tu brises
-- le destin. Les rivales sont propres à chaque joueuse ; une joueuse est
-- reconnue par son userId, une coureuse de l'IA par son nom.

local Rivales = {}

Rivales.MAX = 12 -- comme Schema.MAX_RIVALES

-- Les écarts qui font une rivale (l'écart d'un résultat est celui avec la précédente).
Rivales.ECARTS_SERRES = { ["Ex æquo"] = true, Nez = true, ["Tête"] = true, Encolure = true }

export type Resultat = {
	id: number,
	nom: string,
	rang: number,
	ecart: string,
	userId: number?,
}

export type Bilan = {
	nouvelle: string?, -- la coureuse qui vient de devenir (ou redevenir) ta rivale
	battues: { string }, -- les rivales que tu as battues dans cette course
	destins: { string }, -- celles que tu bats pour la première fois
}

-- La clé d'une coureuse : "u<userId>" pour une joueuse, "b:<nom>" pour l'IA.
function Rivales.cle(r: { nom: string, userId: number? }): string
	return if r.userId then `u{r.userId}` else `b:{r.nom}`
end

local function chercher(rivales: { any }, cle: string): any?
	for _, r in rivales do
		if r.cle == cle then
			return r
		end
	end
	return nil
end

-- Met à jour les rivales de `d` après une course où ta coureuse portait
-- l'identifiant `monId`. `heure` : os.time().
function Rivales.apresCourse(d: any, resultats: { Resultat }, monId: number, heure: number): Bilan
	local bilan: Bilan = { nouvelle = nil, battues = {}, destins = {} }
	local moi: Resultat? = nil
	local parRang: { [number]: Resultat } = {}
	for _, r in resultats do
		parRang[r.rang] = r
		if r.id == monId then
			moi = r
		end
	end
	if not moi then
		return bilan
	end
	local maCle = Rivales.cle(moi)

	-- D'abord, les rivales que j'ai battues aujourd'hui
	for _, r in resultats do
		if r.rang > moi.rang then
			local rivale = chercher(d.rivales, Rivales.cle(r))
			if rivale then
				rivale.battue += 1
				rivale.derniere = heure
				table.insert(bilan.battues, rivale.nom)
				if rivale.battue == 1 then
					table.insert(bilan.destins, rivale.nom)
				end
			end
		end
	end

	-- Puis celle qui vient de me battre d'un rien
	local devant = parRang[moi.rang - 1]
	if devant and Rivales.ECARTS_SERRES[moi.ecart] then
		local cle = Rivales.cle(devant)
		if cle ~= maCle then
			local rivale = chercher(d.rivales, cle)
			if rivale then
				rivale.fois += 1
				rivale.derniere = heure
				rivale.nom = devant.nom
			else
				table.insert(d.rivales, { cle = cle, nom = devant.nom, fois = 1, battue = 0, derniere = heure })
				-- Trop de rivales : on oublie la plus ancienne
				while #d.rivales > Rivales.MAX do
					local plusAncienne, heureMin = 1, math.huge
					for i, r in d.rivales do
						if r.derniere < heureMin then
							plusAncienne, heureMin = i, r.derniere
						end
					end
					table.remove(d.rivales, plusAncienne)
				end
			end
			bilan.nouvelle = devant.nom
		end
	end
	return bilan
end

-- Est-ce une de mes rivales ? (pour la marque « RIVALE » au départ)
function Rivales.estRivale(rivales: { any }, nom: string, userId: number?): boolean
	return chercher(rivales, Rivales.cle({ nom = nom, userId = userId })) ~= nil
end

return Rivales
