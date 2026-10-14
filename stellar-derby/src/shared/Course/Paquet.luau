--!strict
-- Paquet — l'instantané de course envoyé aux clients, en binaire compact.
--
-- 15 fois par seconde, le serveur envoie la position de toutes les coureuses
-- par un UnreliableRemoteEvent, limité à ~900 octets par envoi. En binaire,
-- une coureuse tient en 11 octets : 80 coureuses (mode Live) passent encore.
--
-- En-tête (18 octets)
--   u32 numéro d'instantané · f64 heure serveur · f32 temps de course
--   u8 nombre de coureuses · u8 drapeaux (bit 0 : ralenti)
-- Par coureuse, dans l'ordre des identifiants (11 octets)
--   f32 distance parcourue · u16 couloir (mm) · u16 vitesse (cm/s)
--   u8 endurance (0–200) · u8 état · u8 rang
-- Octet d'état
--   bits 0–5 : sprint, à bout, sillage, bloquée, duel, arrivée
--   bits 6–7 : aura (0 aucune, 1 vitesse, 2 accélération, 3 endurance)

export type EtatCoureuse = {
	d: number,
	couloir: number,
	v: number,
	endurance: number, -- fraction 0–1
	rang: number,
	sprint: boolean,
	epuisee: boolean,
	aspiration: boolean,
	bloquee: boolean,
	duel: boolean,
	arrivee: boolean,
	aura: number,
}

export type Instantane = {
	numero: number,
	heure: number,
	t: number,
	ralenti: boolean,
	coureuses: { EtatCoureuse },
}

local TAILLE_ENTETE = 18
local TAILLE_COUREUSE = 11

local Paquet = {}

local function bit(valeur: boolean, rang: number): number
	return if valeur then 2 ^ rang else 0
end

local function lireBit(octet: number, rang: number): boolean
	return math.floor(octet / 2 ^ rang) % 2 == 1
end

-- `coureuses` : n'importe quelle liste d'objets portant les champs de
-- EtatCoureuse (les coureuses de la simulation conviennent telles quelles).
function Paquet.ecrire(numero: number, heure: number, t: number, ralenti: boolean, coureuses: { any }): buffer
	local n = #coureuses
	local b = buffer.create(TAILLE_ENTETE + n * TAILLE_COUREUSE)
	buffer.writeu32(b, 0, numero % 2 ^ 32)
	buffer.writef64(b, 4, heure)
	buffer.writef32(b, 12, t)
	buffer.writeu8(b, 16, n)
	buffer.writeu8(b, 17, if ralenti then 1 else 0)
	for i, c in coureuses do
		local o = TAILLE_ENTETE + (i - 1) * TAILLE_COUREUSE
		local fraction = if c.enduranceMax then c.endurance / c.enduranceMax else c.endurance
		local etat = bit(c.sprint, 0)
			+ bit(c.epuisee, 1)
			+ bit(c.aspiration, 2)
			+ bit(c.bloquee, 3)
			+ bit(c.duel, 4)
			+ bit(c.arrivee, 5)
			+ math.clamp(c.aura, 0, 3) * 64
		buffer.writef32(b, o, c.d)
		buffer.writeu16(b, o + 4, math.clamp(math.floor(c.couloir * 1000 + 0.5), 0, 65535))
		buffer.writeu16(b, o + 6, math.clamp(math.floor(c.v * 100 + 0.5), 0, 65535))
		buffer.writeu8(b, o + 8, math.clamp(math.floor(fraction * 200 + 0.5), 0, 200))
		buffer.writeu8(b, o + 9, etat)
		buffer.writeu8(b, o + 10, math.clamp(c.rang, 0, 255))
	end
	return b
end

function Paquet.lire(b: buffer): Instantane?
	local taille = buffer.len(b)
	if taille < TAILLE_ENTETE then
		return nil
	end
	local n = buffer.readu8(b, 16)
	if taille < TAILLE_ENTETE + n * TAILLE_COUREUSE then
		return nil
	end
	local coureuses: { EtatCoureuse } = {}
	for i = 1, n do
		local o = TAILLE_ENTETE + (i - 1) * TAILLE_COUREUSE
		local etat = buffer.readu8(b, o + 9)
		coureuses[i] = {
			d = buffer.readf32(b, o),
			couloir = buffer.readu16(b, o + 4) / 1000,
			v = buffer.readu16(b, o + 6) / 100,
			endurance = buffer.readu8(b, o + 8) / 200,
			rang = buffer.readu8(b, o + 10),
			sprint = lireBit(etat, 0),
			epuisee = lireBit(etat, 1),
			aspiration = lireBit(etat, 2),
			bloquee = lireBit(etat, 3),
			duel = lireBit(etat, 4),
			arrivee = lireBit(etat, 5),
			aura = math.floor(etat / 64),
		}
	end
	return {
		numero = buffer.readu32(b, 0),
		heure = buffer.readf64(b, 4),
		t = buffer.readf32(b, 12),
		ralenti = buffer.readu8(b, 17) % 2 == 1,
		coureuses = coureuses,
	}
end

return Paquet
