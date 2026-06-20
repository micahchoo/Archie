// "Where Languages Go Silent" — the segment-diverse Playground template (③+⑬, seed Archie-eaae).
// Eight regional map pages from the UNESCO Atlas of the World's Languages in Danger (3rd ed., 2010,
// ed. Christopher Moseley), served by the Internet Archive's IIIF endpoint. CC BY-SA 4.0; creator
// UNESCO; identifier atlas-of-the-worlds-languages-in-danger. Template-content rule (CONTEXT.md):
// third-party rights-clean material, never the author's personal work.
//
// Two Readings carry Archie's differentiator (rival interpretations of the SAME marks): the
// Linguist's reading speaks in classifications and speaker counts; the Community reading says what
// the silence means where it falls. Page numbers: canvas N of the IA item; pages are 2550x3301.
//
// Note regions were placed by VISUAL AUDIT against each rendered map page (red-box overlay pass,
// 2026-06-09) — the map plate occupies only the top half of each 2550x3301 page.
import { asObjectId, type Reading } from "@render/core";

const IA = "https://iiif.archive.org/image/iiif/3/atlas-of-the-worlds-languages-in-danger%2FAtlas%20of%20the%20world%27s%20languages%20in%20danger_jp2.zip%2FAtlas%20of%20the%20world%27s%20languages%20in%20danger_jp2%2FAtlas%20of%20the%20world%27s%20languages%20in%20danger_";
const page = (n: number) => `${IA}0${n}.jp2`;

export const atlasTitle = "Where Languages Go Silent";
export const atlasSummary =
  "Eight map pages from UNESCO's Atlas of the World's Languages in Danger (2010) — every dot a language losing its speakers. The same dots read two ways: a linguist's census, and what the quiet means in the places it falls.";

export const atlasRights = {
  rights: "https://creativecommons.org/licenses/by-sa/4.0/",
  requiredStatement: { label: "Source", value: "UNESCO, Atlas of the World's Languages in Danger, 3rd edition (2010), ed. Christopher Moseley — digitized at the Internet Archive. CC BY-SA 4.0." },
};

export const atlasReadings: Reading[] = [
  { id: "linguist", name: "Linguist's reading", description: "The census view: family, classification, speaker counts, vitality category — the data behind each dot.", colour: "#4c5d8a" },
  { id: "community", name: "Community reading", description: "What the silence means where it falls: who stopped speaking to whom, and what is being done about it.", colour: "#a3553a" },
];

export const atlasObjects = [
  { id: asObjectId("o1"), source: page(166), label: "North America", width: 2550, height: 3301 },
  { id: asObjectId("o2"), source: page(176), label: "Western South America", width: 2550, height: 3301 },
  { id: asObjectId("o3"), source: page(184), label: "The Caucasus", width: 2550, height: 3301 },
  { id: asObjectId("o4"), source: page(190), label: "Western Africa", width: 2550, height: 3301 },
  { id: asObjectId("o5"), source: page(196), label: "Siberia", width: 2550, height: 3301 },
  { id: asObjectId("o6"), source: page(202), label: "The Himalaya", width: 2550, height: 3301 },
  { id: asObjectId("o7"), source: page(208), label: "South-East Asia", width: 2550, height: 3301 },
  { id: asObjectId("o8"), source: page(214), label: "Australia", width: 2550, height: 3301 },
];

export interface AtlasNote {
  objectId: string;
  /** APPROXIMATE pixel rect on the 2550x3301 page — review pass adjusts. */
  region: [number, number, number, number];
  comment: string;
  reading?: "linguist" | "community";
}

export const atlasNotes: AtlasNote[] = [
  // o1 — North America: Haida (Pacific NW coast, upper left of the map)
  { objectId: "o1", region: [170, 310, 280, 220], reading: "linguist",
    comment: "**Haida** (X̱aad Kíl) — a language isolate of Haida Gwaii, British Columbia. The 2010 atlas marks it *critically endangered*: fewer than 50 fluent speakers, nearly all elders. Two dialects, Massett and Skidegate, each with its own orthography." },
  { objectId: "o1", region: [170, 310, 280, 220], reading: "community",
    comment: "On Haida Gwaii the count of fluent elders is told person by person, name by name. Master–apprentice pairs now sit teenagers beside grandmothers for hours of Haida-only conversation — the dot on this map is also a kitchen table." },
  // o2 — W South America: Chamicuro (Peruvian Amazon, center-right)
  { objectId: "o2", region: [740, 470, 280, 280],
    comment: "The Andes–Amazon corridor is the densest stretch of dots in the whole atlas — dozens of small languages between the mountains and the river basin." },
  { objectId: "o2", region: [740, 470, 280, 280], reading: "linguist",
    comment: "**Chamicuro** — Arawakan, spoken at Pampa Hermosa on the Huallaga river, Peru. The atlas lists it *critically endangered*: by 2010, perhaps two elderly speakers remained, the rest of the community having shifted to Spanish." },
  { objectId: "o2", region: [740, 470, 280, 280], reading: "community",
    comment: "A dictionary of Chamicuro exists because its last speakers wanted one — 'so the grandchildren can see what we sounded like.' The dot here is an act of deliberate remembering, not just a casualty count." },
  // o3 — Caucasus: Ubykh (NW Caucasus / Black Sea coast, left of the cluster)
  { objectId: "o3", region: [440, 720, 320, 290],
    comment: "The Caucasus packs more language families into one mountain range than most continents hold — and more red dots." },
  { objectId: "o3", region: [440, 720, 320, 290], reading: "linguist",
    comment: "**Ubykh** — Northwest Caucasian, famed among linguists for its consonant inventory of around eighty against just two distinctive vowels. The atlas marks it *extinct*: the last fully competent speaker, Tevfik Esenç, died in 1992 in Turkey." },
  { objectId: "o3", region: [440, 720, 320, 290], reading: "community",
    comment: "Ubykh did not fade in place — it was carried out of the Caucasus in the deportations of 1864 and went silent in exile, a century and a half later and a thousand kilometres from Sochi. Some silences on this map begin with an army." },
  // o4 — W Africa: Mani (Sierra Leone / Guinea coast, lower left)
  { objectId: "o4", region: [300, 540, 280, 250],
    comment: "On the West African coast, languages rarely die into silence — they dissolve into bigger neighbours, market tongue by market tongue." },
  { objectId: "o4", region: [300, 540, 280, 250], reading: "linguist",
    comment: "**Mani** (Bullom So) — a Mel language of the Sierra Leone–Guinea coast, marked *critically endangered*. Documentation in the 2000s found most remaining speakers elderly, with daily life conducted in Soso and Temne." },
  { objectId: "o4", region: [300, 540, 280, 250], reading: "community",
    comment: "Mani didn't lose its speakers — it lost its occasions. Markets, weddings, and prayers moved into bigger neighbouring languages one domain at a time, until Mani was what grandparents used when they didn't want to be overheard." },
  // o5 — Siberia: Tundra Yukaghir (NE Siberia, upper right)
  { objectId: "o5", region: [1560, 650, 380, 320],
    comment: "Across Siberia the dots trace the rivers — each one a small language of herders or fishers ringed by Russian." },
  { objectId: "o5", region: [1560, 650, 380, 320], reading: "linguist",
    comment: "**Tundra Yukaghir** — one of two survivors of the once-widespread Yukaghir family, lower Kolyma, Sakha Republic. The atlas counts speakers in the tens, marked *severely endangered*; nearly all are of the oldest generation." },
  { objectId: "o5", region: [1560, 650, 380, 320], reading: "community",
    comment: "Transmission broke in the boarding-school decades, when children spent ten months a year away from the tundra and came home preferring Russian. The elders who herd reindeer in Yukaghir now teach it as a school subject — an hour a week." },
  // o6 — Himalaya: Dura (central Nepal, center of the map)
  { objectId: "o6", region: [410, 570, 280, 230],
    comment: "Every Himalayan valley is its own speech island; the atlas marks the passes where the islands are sinking." },
  { objectId: "o6", region: [410, 570, 280, 230], reading: "linguist",
    comment: "**Dura** — Tibeto-Burman, Lamjung district, Nepal. The atlas marks it *extinct*: Soma Devi Dura, regarded as its last fluent speaker, died in 2008. What survives was recorded from her and from partial rememberers in the final years." },
  { objectId: "o6", region: [410, 570, 280, 230], reading: "community",
    comment: "The Dura community still exists — it is the language that went. Identity outlived speech: people who never learned Dura still gather its word-lists, because the name on the map is their own." },
  // o7 — SE Asia: Arem (Vietnam/Laos border, center-right)
  { objectId: "o7", region: [810, 580, 300, 280],
    comment: "Mainland South-East Asia layers its languages by altitude — the endangered ones live uphill, away from the lowland national tongues." },
  { objectId: "o7", region: [810, 580, 300, 280], reading: "linguist",
    comment: "**Arem** — Vietic (Austroasiatic), spoken on the Vietnam–Laos border by a few dozen people at most in 2010. Of interest to linguists for preserving sesquisyllabic word shapes that Vietnamese itself has lost." },
  { objectId: "o7", region: [810, 580, 300, 280], reading: "community",
    comment: "The Arem were resettled out of the limestone forests into mixed villages; the language of the caves and foraging routes had no work to do in the new economy. Two generations later, it survives mainly in what elders remember of the forest." },
  // o8 — Australia: Yawuru (NW coast — Broome, upper left)
  { objectId: "o8", region: [550, 420, 280, 240],
    comment: "Australia holds some of the world\u2019s steepest language loss — and, in places like Broome, some of its most determined turnarounds." },
  { objectId: "o8", region: [550, 420, 280, 240], reading: "linguist",
    comment: "**Yawuru** — Nyulnyulan family, the language of the Broome region, Western Australia. The 2010 atlas marks it *critically endangered*, with only a handful of elderly fluent speakers remaining." },
  { objectId: "o8", region: [550, 420, 280, 240], reading: "community",
    comment: "Broome answered the count another way: Yawuru became a compulsory subject in the town's schools, taught by the community itself. The dot marks both a near-silence and the town that decided not to let it finish." },
  // Base note (no reading) — orientation, on the first page
  { objectId: "o1", region: [230, 1300, 540, 180], // pinned to the vitality LEGEND
    comment: "Every dot on these pages is a language; its colour is how close the talking is to stopping. Switch between the **Linguist's** and **Community** readings to hear the same dots two ways — or stay on *Base* to see only this note." },
];
