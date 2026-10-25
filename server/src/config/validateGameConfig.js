const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateSkill(skill, path, errors, requireRecord, requireString, requireNumber) {
    if (!requireRecord(skill, path)) return;
    requireString(skill.name, `${path}.name`);
    requireNumber(skill.mpCost, `${path}.mpCost`, { min: 0 });
    requireNumber(skill.cooldownMs, `${path}.cooldownMs`, { min: 0 });
    requireString(skill.type, `${path}.type`);
    if (skill.type === 'heal') {
        requireNumber(skill.healAmount, `${path}.healAmount`, { min: 1 });
        return;
    }

    requireNumber(skill.range, `${path}.range`, { min: 0 });
    requireNumber(skill.damageMultiplierMin, `${path}.damageMultiplierMin`, { min: 0 });
    requireNumber(skill.damageMultiplierMax, `${path}.damageMultiplierMax`, { min: 0 });
    if (typeof skill.damageMultiplierMin === 'number' && typeof skill.damageMultiplierMax === 'number' && skill.damageMultiplierMin > skill.damageMultiplierMax) {
        errors.push(`${path}.damageMultiplierMin không được lớn hơn damageMultiplierMax.`);
    }
    if (skill.type === 'aoe') requireNumber(skill.maxTargets, `${path}.maxTargets`, { min: 1, integer: true });
    if (skill.hits !== undefined) requireNumber(skill.hits, `${path}.hits`, { min: 1, integer: true });
}

function validateGameConfig(config) {
    const errors = [];
    const requireRecord = (value, path) => {
        if (!isRecord(value)) errors.push(`${path} phải là object.`);
        return isRecord(value);
    };
    const requireString = (value, path) => {
        if (typeof value !== 'string' || value.trim() === '') errors.push(`${path} phải là chuỗi không rỗng.`);
    };
    const requireNumber = (value, path, { min = 0, integer = false } = {}) => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
            errors.push(`${path} phải là số ${integer ? 'nguyên ' : ''}hữu hạn >= ${min}.`);
        }
    };

    if (!requireRecord(config, 'gameConfig')) return ['gameConfig phải là object.'];
    requireString(config.version, 'version');

    if (requireRecord(config.server, 'server')) {
        requireNumber(config.server.tickRateHz, 'server.tickRateHz', { min: 1, integer: true });
        requireNumber(config.server.tickIntervalMs, 'server.tickIntervalMs', { min: 1, integer: true });
        requireNumber(config.server.port, 'server.port', { min: 1, integer: true });
        if (typeof config.server.port === 'number' && config.server.port > 65535) errors.push('server.port không được lớn hơn 65535.');
    }

    if (requireRecord(config.map, 'map')) {
        requireString(config.map.id, 'map.id');
        requireString(config.map.name, 'map.name');
        requireNumber(config.map.width, 'map.width', { min: 1 });
        requireNumber(config.map.height, 'map.height', { min: 1 });
    }

    if (requireRecord(config.playerDefaults, 'playerDefaults')) {
        for (const key of ['hp', 'maxHp', 'mp', 'maxMp', 'atk', 'armor', 'speed', 'autoFarmRadius', 'autoFarmLeashRadius']) {
            requireNumber(config.playerDefaults[key], `playerDefaults.${key}`, { min: 0 });
        }
        if (config.playerDefaults.hp > config.playerDefaults.maxHp) errors.push('playerDefaults.hp không được lớn hơn maxHp.');
        if (config.playerDefaults.mp > config.playerDefaults.maxMp) errors.push('playerDefaults.mp không được lớn hơn maxMp.');
    }

    validateSkill(config.basicAttack, 'basicAttack', errors, requireRecord, requireString, requireNumber);

    if (requireRecord(config.classes, 'classes')) {
        if (Object.keys(config.classes).length === 0) errors.push('classes phải có ít nhất một class.');
        for (const [classId, classConfig] of Object.entries(config.classes)) {
            const path = `classes.${classId}`;
            if (!requireRecord(classConfig, path)) continue;
            requireString(classConfig.name, `${path}.name`);
            if (classConfig.skills === undefined) continue; // Các class scaffold chưa có bộ skill riêng.
            if (!requireRecord(classConfig.skills, `${path}.skills`)) continue;
            for (const [skillId, skill] of Object.entries(classConfig.skills)) {
                const skillPath = `${path}.skills.${skillId}`;
                validateSkill(skill, skillPath, errors, requireRecord, requireString, requireNumber);
            }
        }
    }

    if (requireRecord(config.monsters, 'monsters')) {
        const ids = new Set();
        for (const [key, monster] of Object.entries(config.monsters)) {
            const path = `monsters.${key}`;
            if (!requireRecord(monster, path)) continue;
            requireString(monster.id, `${path}.id`);
            if (ids.has(monster.id)) errors.push(`${path}.id bị trùng: ${monster.id}.`);
            ids.add(monster.id);
            for (const field of ['x', 'y', 'maxHp', 'atk', 'speed', 'range', 'vision', 'respawnMs']) {
                requireNumber(monster[field], `${path}.${field}`, { min: field === 'maxHp' ? 1 : 0 });
            }
        }
    }

    if (requireRecord(config.quests, 'quests')) {
        for (const [questId, quest] of Object.entries(config.quests)) {
            const path = `quests.${questId}`;
            if (!requireRecord(quest, path)) continue;
            requireString(quest.id, `${path}.id`);
            requireNumber(quest.targetKill, `${path}.targetKill`, { min: 1, integer: true });
            for (const field of ['rewardGold', 'rewardDtn', 'rewardExp']) requireNumber(quest[field], `${path}.${field}`, { min: 0 });
        }
    }

    return errors;
}

function assertValidGameConfig(config) {
    const errors = validateGameConfig(config);
    if (errors.length) {
        throw new Error(`Cấu hình game không hợp lệ:\n- ${errors.join('\n- ')}`);
    }
    return config;
}

module.exports = { validateGameConfig, assertValidGameConfig };
