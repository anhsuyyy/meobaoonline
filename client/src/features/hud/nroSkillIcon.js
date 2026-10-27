import { NRO_ART_PACK_SKILLS } from '../../generated/nroArtPackManifest';

const PLANET_CLASS_BY_RACE = Object.freeze({ earth: 0, namek: 1, saiyan: 2 });

export function getNroSkillIcon(skill, raceId) {
    if (!skill || skill.sourceId === undefined || skill.sourceId === null) return skill?.icon;
    const planetClassId = Number.isInteger(Number(skill.planetClassId))
        ? Number(skill.planetClassId)
        : PLANET_CLASS_BY_RACE[String(raceId || '').toLowerCase()];
    if (!Number.isInteger(planetClassId)) return skill.icon;
    return NRO_ART_PACK_SKILLS[`${planetClassId}-${skill.sourceId}`]
        || `/assets/nro/skill/icon/nro-${planetClassId}-${skill.sourceId}.svg`;
}
