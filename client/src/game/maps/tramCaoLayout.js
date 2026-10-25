export const TRAM_CAO_LAYOUT = {
    tileSize: 32,
    regions: {
        river: { x: 1120, y: 0, width: 160, height: 720 },
        shore: { x: 1088, y: 0, width: 32, height: 720 },
        eastWestRoad: { x: 128, y: 288, width: 960, height: 128 },
        northSouthRoad: { x: 544, y: 64, width: 128, height: 656 }
    },
    decorations: [
        { kind: 'tree', x: 76, y: 105 }, { kind: 'tree', x: 190, y: 78 },
        { kind: 'tree', x: 315, y: 118 }, { kind: 'tree', x: 455, y: 80 },
        { kind: 'tree', x: 920, y: 95 }, { kind: 'tree', x: 1025, y: 170 },
        { kind: 'tree', x: 100, y: 530 }, { kind: 'tree', x: 250, y: 625 },
        { kind: 'tree', x: 405, y: 555 }, { kind: 'tree', x: 760, y: 600 },
        { kind: 'tree', x: 930, y: 525 }, { kind: 'tree', x: 1045, y: 400 },
        { kind: 'rock', x: 255, y: 205 }, { kind: 'rock', x: 435, y: 485 },
        { kind: 'rock', x: 835, y: 210 }, { kind: 'rock', x: 975, y: 445 },
        { kind: 'flower_yellow', x: 176, y: 220 }, { kind: 'flower_pink', x: 224, y: 256 },
        { kind: 'flower_pink', x: 352, y: 192 }, { kind: 'flower_yellow', x: 472, y: 248 },
        { kind: 'flower_pink', x: 760, y: 224 }, { kind: 'flower_pink', x: 875, y: 190 },
        { kind: 'flower_yellow', x: 197, y: 470 }, { kind: 'flower_pink', x: 310, y: 522 },
        { kind: 'flower_yellow', x: 736, y: 510 }, { kind: 'flower_pink', x: 865, y: 556 },
        { kind: 'flower_yellow', x: 1010, y: 300 }, { kind: 'flower_pink', x: 1050, y: 620 }
    ]
};

export function groundFrameAt(column, row) {
    const x = column * TRAM_CAO_LAYOUT.tileSize;
    const y = row * TRAM_CAO_LAYOUT.tileSize;
    const { regions } = TRAM_CAO_LAYOUT;
    const inRegion = (region) => x >= region.x && x < region.x + region.width &&
        y >= region.y && y < region.y + region.height;
    const inIntersection = (horizontal, vertical) => inRegion(horizontal) && inRegion(vertical);

    if (inRegion(regions.river)) return 'ground_water_00';
    if (inRegion(regions.shore) && !inIntersection(regions.eastWestRoad, regions.northSouthRoad)) {
        return 'ground_path_00';
    }
    if (inRegion(regions.eastWestRoad) || inRegion(regions.northSouthRoad)) return 'ground_path_00';
    return (column * 7 + row * 11) % 3 === 0 ? 'ground_grass_01' : 'ground_grass_00';
}
