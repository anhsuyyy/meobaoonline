const WALK_FRAME_COUNT = 8;
const AIR_FRAME_INDEX = 8;

/**
 * NRO character parts share frame numbers across body and legs. Always resolve
 * both layers from one common index so a standing torso cannot pair with an
 * unrelated walk/air pose from the leg sheet.
 */
export function getNroAnimationFrameIndices({ body, legs, head }, state, elapsedMs = 0) {
    const bodyCount = Math.max(1, body?.frames?.length || 1);
    const legCount = Math.max(1, legs?.frames?.length || 1);
    const headCount = Math.max(1, head?.frames?.length || 1);

    let bodyLegIndex = 0;
    if (state === 'running') {
        const sharedWalkCount = Math.min(WALK_FRAME_COUNT, bodyCount, legCount);
        if (sharedWalkCount > 1) {
            bodyLegIndex = 1 + (Math.floor(Math.max(0, elapsedMs) / 120) % (sharedWalkCount - 1));
        }
    } else if (['jumping', 'falling', 'flying'].includes(state)) {
        bodyLegIndex = Math.min(AIR_FRAME_INDEX, bodyCount - 1, legCount - 1);
    }

    return {
        head: state === 'running' && headCount > 1
            ? Math.floor(Math.max(0, elapsedMs) / 180) % headCount
            : 0,
        body: bodyLegIndex,
        legs: bodyLegIndex
    };
}
