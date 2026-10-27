const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateSkill(skill, path, errors, requireRecord, requireString, requireNumber) {
    if (!requireRecord(skill, path)) return;
    requireString(skill.name, `${path}.name`);
    requireNumber(skill.mpCost, `${path}.mpCost`, { min: 0 });
    requireString(skill.type, `${path}.type`);
    if (skill.levelScaling !== undefined) {
        if (!isRecord(skill.levelScaling)) {
            errors.push(`${path}.levelScaling phải là object.`);
        } else {
            for (const [stat, values] of Object.entries(skill.levelScaling)) {
                if (!Array.isArray(values) || values.length !== 2) {
                    errors.push(`${path}.levelScaling.${stat} phải có đúng 2 giá trị [Lv1, Lv7].`);
                    continue;
                }
                requireNumber(values[0], `${path}.levelScaling.${stat}[0]`, { min: 0 });
                requireNumber(values[1], `${path}.levelScaling.${stat}[1]`, { min: 0 });
            }
        }
    } else {
        requireNumber(skill.cooldownMs, `${path}.cooldownMs`, { min: 0 });
    }
    for (const field of ['rangeMeters', 'rangePx', 'radiusMeters', 'castTimeMs', 'tickIntervalMs', 'channelDurationMs', 'shots', 'knockbackChance', 'coneDegrees', 'damagePercent']) {
        if (skill[field] !== undefined) requireNumber(skill[field], `${path}.${field}`, { min: 0 });
    }
    if (skill.damageMultiplierMin !== undefined || skill.damageMultiplierMax !== undefined) {
        requireNumber(skill.damageMultiplierMin, `${path}.damageMultiplierMin`, { min: 0 });
        requireNumber(skill.damageMultiplierMax, `${path}.damageMultiplierMax`, { min: 0 });
        if (typeof skill.damageMultiplierMin === 'number' && typeof skill.damageMultiplierMax === 'number' && skill.damageMultiplierMin > skill.damageMultiplierMax) {
            errors.push(`${path}.damageMultiplierMin không được lớn hơn damageMultiplierMax.`);
        }
    }
    if (skill.levelScaling?.hits) {
        for (const [index, hits] of skill.levelScaling.hits.entries()) {
            requireNumber(hits, `${path}.levelScaling.hits[${index}]`, { min: 1, integer: true });
        }
    }
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
    if (requireRecord(config.nroWorld, 'nroWorld')) {
        requireNumber(config.nroWorld.mapId, 'nroWorld.mapId', { min: 0, integer: true });
        requireNumber(config.nroWorld.tileSize, 'nroWorld.tileSize', { min: 1, integer: true });
        requireNumber(config.nroWorld.runSpeedPxPerSecond, 'nroWorld.runSpeedPxPerSecond', { min: 0 });
        requireNumber(config.nroWorld.flightSpeedPxPerSecond, 'nroWorld.flightSpeedPxPerSecond', { min: 0 });
        requireNumber(config.nroWorld.flightKiPerSecond, 'nroWorld.flightKiPerSecond', { min: 0.01 });
        requireNumber(config.nroWorld.flightHoverDurationMs, 'nroWorld.flightHoverDurationMs', { min: 0, integer: true });
        requireNumber(config.nroWorld.gravityPxPerSecondSquared, 'nroWorld.gravityPxPerSecondSquared', { min: 0 });
        requireNumber(config.nroWorld.jumpVelocityPxPerSecond, 'nroWorld.jumpVelocityPxPerSecond', { min: 0 });
        requireNumber(config.nroWorld.maxFallSpeedPxPerSecond, 'nroWorld.maxFallSpeedPxPerSecond', { min: 0 });
        requireRecord(config.nroWorld.spawn, 'nroWorld.spawn');
        requireNumber(config.nroWorld.spawn?.x, 'nroWorld.spawn.x', { min: 0 });
        requireNumber(config.nroWorld.spawn?.y, 'nroWorld.spawn.y', { min: 0 });
        if (!Array.isArray(config.nroWorld.playableMapIds) || !config.nroWorld.playableMapIds.length) {
            errors.push('nroWorld.playableMapIds phải là mảng map đã xác nhận renderer và collision.');
        } else {
            const ids = new Set();
            config.nroWorld.playableMapIds.forEach((id, index) => {
                requireNumber(id, `nroWorld.playableMapIds[${index}]`, { min: 0, integer: true });
                if (ids.has(id)) errors.push(`nroWorld.playableMapIds[${index}] bị trùng: ${id}.`);
                ids.add(id);
            });
            if (!ids.has(config.nroWorld.mapId)) errors.push('nroWorld.mapId phải nằm trong playableMapIds.');
        }
    }
    if (requireRecord(config.skills, 'skills')) {
        requireNumber(config.skills.maxLevel, 'skills.maxLevel', { min: 1, integer: true });
        requireNumber(config.skills.defaultLevel, 'skills.defaultLevel', { min: 1, integer: true });
        requireNumber(config.skills.singleTargetRangeMeters, 'skills.singleTargetRangeMeters', { min: 0 });
        requireNumber(config.skills.projectileRangeMeters, 'skills.projectileRangeMeters', { min: 0 });
        if (config.skills.maxLevel !== 7) errors.push('skills.maxLevel phải bằng 7 theo bộ kỹ năng hiện tại.');
    }

    if (requireRecord(config.world, 'world')) {
        requireNumber(config.world.pixelsPerMeter, 'world.pixelsPerMeter', { min: 0.001 });
        requireNumber(config.world.pickupRangeMeters, 'world.pickupRangeMeters', { min: 0 });
    }
    if (requireRecord(config.movement, 'movement')) {
        requireNumber(config.movement.baseSpeedMetersPerSecond, 'movement.baseSpeedMetersPerSecond', { min: 0 });
        requireNumber(config.movement.agiBonusPixelsPerSecond, 'movement.agiBonusPixelsPerSecond', { min: 0 });
    }
    if (requireRecord(config.attackSpeed, 'attackSpeed')) {
        requireNumber(config.attackSpeed.agiReductionMsPerPoint, 'attackSpeed.agiReductionMsPerPoint', { min: 0 });
        requireNumber(config.attackSpeed.minimumBasicCooldownMs, 'attackSpeed.minimumBasicCooldownMs', { min: 1 });
    }
    if (requireRecord(config.autoFarm, 'autoFarm')) {
        requireNumber(config.autoFarm.targetRadiusMeters, 'autoFarm.targetRadiusMeters', { min: 0 });
        requireNumber(config.autoFarm.engageRangeMeters, 'autoFarm.engageRangeMeters', { min: 0 });
        requireNumber(config.autoFarm.leashRadiusMeters, 'autoFarm.leashRadiusMeters', { min: 0 });
    }

    if (requireRecord(config.map, 'map')) {
        requireString(config.map.id, 'map.id');
        requireString(config.map.name, 'map.name');
        requireNumber(config.map.width, 'map.width', { min: 1 });
        requireNumber(config.map.height, 'map.height', { min: 1 });
    }

    if (requireRecord(config.playerDefaults, 'playerDefaults')) {
        for (const key of ['hp', 'maxHp', 'mp', 'maxMp', 'atk', 'str', 'armor', 'agi']) {
            requireNumber(config.playerDefaults[key], `playerDefaults.${key}`, { min: 0 });
        }
        if (config.playerDefaults.hp > config.playerDefaults.maxHp) errors.push('playerDefaults.hp không được lớn hơn maxHp.');
        if (config.playerDefaults.mp > config.playerDefaults.maxMp) errors.push('playerDefaults.mp không được lớn hơn maxMp.');
    }

    validateSkill(config.basicAttack, 'basicAttack', errors, requireRecord, requireString, requireNumber);

    if (requireRecord(config.monsters, 'monsters')) {
        const ids = new Set();
        for (const [key, monster] of Object.entries(config.monsters)) {
            const path = `monsters.${key}`;
            if (!requireRecord(monster, path)) continue;
            requireString(monster.id, `${path}.id`);
            if (ids.has(monster.id)) errors.push(`${path}.id bị trùng: ${monster.id}.`);
            ids.add(monster.id);
            for (const field of ['x', 'y', 'maxHp', 'atk', 'speedPxPerSecond', 'attackRangeMeters', 'visionMeters', 'respawnMs', 'attackCooldownMs']) {
                requireNumber(monster[field], `${path}.${field}`, { min: field === 'maxHp' ? 1 : 0 });
            }
        }
    }

    if (requireRecord(config.quests, 'quests')) {
        for (const [questId, quest] of Object.entries(config.quests)) {
            // NRO task reward presets are data tables, not quest definitions.
            if (questId === 'nroTaskRewards') continue;
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
